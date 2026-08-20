const path = require('path');
const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const {
  ensureStaffProfile,
  getTeacherWithProfile,
  getStaffProfileDetail,
  staffDisplayName,
  getLeaveBalance,
  notifyUser,
  calcNetPay,
  monthLabel,
  todayDateOnly,
  resolveStaffProfileId,
} = require('../utils/hr');
const { processExpiredLeaves } = require('../services/hrLeaveService');
const { generatePayroll, markPayrollPaid } = require('../services/hrPayrollService');
const { generatePayroll: generateTeacherPayroll } = require('../../services/HRService');
const { generatePayrollPDF } = require('../../services/export');
const { sendPdfDownload } = require('../utils/pdfOutput');
const { buildWorkbook, sendExcel } = require('../services/exportExcel');
const { putObject } = require('../../services/StorageService');

async function assertOwnedTeacher(teacherId, schoolId) {
  if (!teacherId || !schoolId) return null;
  return prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
}

async function dashboard(req, res) {
  const schoolId = req.user.school.id;
  await processExpiredLeaves();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [staffCount, pendingLeaves, payroll, absencesToday, totalSalary] = await Promise.all([
    prisma.staffProfile.count({ where: { schoolId, status: 'ACTIVE' } }),
    prisma.leaveRequest.count({ where: { schoolId, status: 'PENDING' } }),
    prisma.payrollRun.findUnique({ where: { schoolId_month_year: { schoolId, month, year } } }),
    prisma.staffAttendance.count({
      where: { schoolId, date: todayDateOnly(), status: { in: ['ABSENT', 'LATE'] } },
    }),
    prisma.staffProfile.aggregate({ where: { schoolId, status: 'ACTIVE' }, _sum: { baseSalary: true } }),
  ]);

  res.render('school/hr/dashboard', {
    user: req.user,
    school: req.user.school,
    stats: {
      staffCount,
      pendingLeaves,
      payrollTotal: payroll?.totalNet || 0,
      payrollStatus: payroll?.status || null,
      absencesToday,
      totalSalary: totalSalary._sum.baseSalary || 0,
    },
    success: req.query.success || null,
  });
}

async function staffList(req, res) {
  const schoolId = req.user.school.id;
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: { staffProfile: true },
  });
  for (const teacher of teachers) {
    if (!teacher.staffProfile) await ensureStaffProfile(teacher.id, schoolId);
  }

  const staff = await prisma.staffProfile.findMany({
    where: { schoolId },
    include: { teacher: { include: { user: true } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  res.render('school/hr/staff', {
    user: req.user,
    school: req.user.school,
    staff,
    staffDisplayName,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function newStaffForm(req, res) {
  res.render('school/hr/staff-new', {
    user: req.user,
    school: req.user.school,
    error: req.query.error || null,
  });
}

async function createStaffMember(req, res) {
  const schoolId = req.user.school.id;
  const {
    firstName, lastName, jobTitle, email, phone, contractType, baseSalary,
    hireDate, nationalId, bankName, bankAccount,
  } = req.body;

  if (!firstName || !lastName || !jobTitle) {
    return res.redirect('/school/hr/staff/new?error=data');
  }

  await prisma.staffProfile.create({
    data: {
      schoolId,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      jobTitle: String(jobTitle).trim(),
      email: email || null,
      phone: phone || null,
      contractType: contractType || 'CDD',
      baseSalary: parseInt(baseSalary, 10) || 0,
      hireDate: hireDate ? new Date(hireDate) : null,
      nationalId: nationalId || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      status: 'ACTIVE',
    },
  });

  await logAudit({
    action: 'hr_staff_create',
    entity: 'StaffProfile',
    user: req.user,
    ip: req.ip,
    schoolId,
  });
  res.redirect('/school/hr/staff?success=created');
}

async function staffProfileDetail(req, res) {
  const schoolId = req.user.school.id;
  const profile = await getStaffProfileDetail(req.params.profileId, schoolId);
  if (!profile) return res.redirect('/school/hr/staff');
  const leaveBalance = await getLeaveBalance(profile.id);

  res.render('school/hr/staff-profile', {
    user: req.user,
    school: req.user.school,
    profile,
    leaveBalance,
    staffDisplayName,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function updateStaffProfileById(req, res) {
  const schoolId = req.user.school.id;
  const profileId = req.params.profileId;
  const profile = await prisma.staffProfile.findFirst({ where: { id: profileId, schoolId } });
  if (!profile) return res.redirect('/school/hr/staff');

  const {
    contractType, status, baseSalary, hourlyRate, hireDate, endDate,
    nationalId, bankName, bankAccount, emergencyName, emergencyPhone, address, notes,
    firstName, lastName, jobTitle, email, phone, annualLeaveDays,
  } = req.body;

  await prisma.staffProfile.update({
    where: { id: profileId },
    data: {
      contractType,
      status,
      baseSalary: parseInt(baseSalary, 10) || 0,
      hourlyRate: hourlyRate ? parseInt(hourlyRate, 10) : null,
      hireDate: hireDate ? new Date(hireDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      nationalId: nationalId || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      emergencyName: emergencyName || null,
      emergencyPhone: emergencyPhone || null,
      address: address || null,
      notes: notes || null,
      firstName: firstName ? String(firstName).trim() : profile.firstName,
      lastName: lastName ? String(lastName).trim() : profile.lastName,
      jobTitle: jobTitle ? String(jobTitle).trim() : profile.jobTitle,
      email: email || null,
      phone: phone || null,
      annualLeaveDays: parseInt(annualLeaveDays, 10) || 30,
    },
  });

  await logAudit({
    action: 'hr_profile_update',
    entity: 'StaffProfile',
    entityId: profileId,
    user: req.user,
    ip: req.ip,
    schoolId,
  });
  res.redirect(`/school/hr/staff/p/${profileId}?success=profile`);
}

async function staffDetail(req, res) {
  const schoolId = req.user.school.id;
  const teacher = await getTeacherWithProfile(req.params.id, schoolId);
  if (!teacher) return res.redirect('/school/hr/staff');

  if (!teacher.staffProfile) {
    await ensureStaffProfile(teacher.id, schoolId);
    return res.redirect(`/school/hr/staff/${teacher.id}`);
  }

  res.render('school/hr/staff-detail', {
    user: req.user,
    school: req.user.school,
    teacher,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function updateStaffProfile(req, res) {
  const schoolId = req.user.school.id;
  const teacherId = req.params.id;
  const {
    contractType, status, baseSalary, hourlyRate, hireDate, endDate,
    nationalId, bankName, bankAccount, emergencyName, emergencyPhone, address, notes, subject,
  } = req.body;

  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
  if (!teacher) return res.redirect('/school/hr/staff');

  if (req.file) {
    const { savePersonPhoto } = require('../utils/media');
    const { photoUrl } = await savePersonPhoto('user', teacher.userId, req.file);
    await prisma.user.update({ where: { id: teacher.userId }, data: { photoUrl } });
  } else if (req.body.removePhoto === 'on') {
    const { removePersonPhoto } = require('../utils/media');
    removePersonPhoto('user', teacher.userId);
    await prisma.user.update({ where: { id: teacher.userId }, data: { photoUrl: null } });
  }

  await ensureStaffProfile(teacherId, schoolId);
  await prisma.staffProfile.update({
    where: { teacherId },
    data: {
      contractType,
      status,
      baseSalary: parseInt(baseSalary, 10) || 0,
      hourlyRate: hourlyRate ? parseInt(hourlyRate, 10) : null,
      hireDate: hireDate ? new Date(hireDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      nationalId: nationalId || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      emergencyName: emergencyName || null,
      emergencyPhone: emergencyPhone || null,
      address: address || null,
      notes: notes || null,
    },
  });

  if (subject !== undefined) {
    await prisma.teacher.update({ where: { id: teacherId }, data: { subject: subject || null } });
  }

  await logAudit({ action: 'hr_profile_update', entity: 'StaffProfile', entityId: teacherId, user: req.user, ip: req.ip, schoolId });
  res.redirect(`/school/hr/staff/${teacherId}?success=profile`);
}

async function uploadStaffDocument(req, res) {
  const schoolId = req.user.school.id;
  const teacherId = req.params.id;
  const { label } = req.body;

  if (!req.file) return res.redirect(`/school/hr/staff/${teacherId}?error=file`);

  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
  if (!teacher) return res.redirect('/school/hr/staff');

  const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
  const filename = `${teacherId}-${Date.now()}${ext}`;
  const stored = await putObject({
    folder: 'hr',
    filename,
    buffer: req.file.buffer,
    contentType: req.file.mimetype,
  });

  const mime = req.file.mimetype;
  const fileData = mime.startsWith('image/') || mime === 'application/pdf'
    ? `data:${mime};base64,${req.file.buffer.toString('base64')}`
    : null;

  await prisma.staffDocument.create({
    data: {
      teacherId,
      schoolId,
      label: label || 'Document',
      fileUrl: stored.url,
      fileData,
      mimeType: mime,
    },
  });

  res.redirect(`/school/hr/staff/${teacherId}?success=doc`);
}

async function leavesPage(req, res) {
  const schoolId = req.user.school.id;
  const leaves = await prisma.leaveRequest.findMany({
    where: { schoolId },
    include: {
      teacher: { include: { user: true } },
      staffProfile: { include: { teacher: { include: { user: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.render('school/hr/leaves', {
    user: req.user,
    school: req.user.school,
    leaves,
    staffDisplayName,
    success: req.query.success || null,
  });
}

async function reviewLeave(req, res) {
  const schoolId = req.user.school.id;
  const { id } = req.params;
  const { action, adminNote } = req.body;
  const status = action === 'approve' ? 'APPROVED' : 'REJECTED';

  const leave = await prisma.leaveRequest.findFirst({
    where: { id, schoolId },
    include: { teacher: { include: { user: true } } },
  });
  if (!leave) return res.redirect('/school/hr/leaves');

  await prisma.leaveRequest.update({
    where: { id },
    data: { status, adminNote: adminNote || null, reviewedAt: new Date() },
  });

  if (status === 'APPROVED') {
    const profileId = await resolveStaffProfileId({
      teacherId: leave.teacherId,
      staffProfileId: leave.staffProfileId,
      schoolId,
    });
    if (profileId) {
      await prisma.staffProfile.update({
        where: { id: profileId },
        data: { status: 'ON_LEAVE' },
      });
    }
  }

  if (leave.teacher?.userId) {
    await notifyUser(
      leave.teacher.userId,
      status === 'APPROVED' ? 'Congé approuvé' : 'Congé refusé',
      `Votre demande du ${new Date(leave.startDate).toLocaleDateString('fr-FR')} a été ${status === 'APPROVED' ? 'approuvée' : 'refusée'}.`,
    );
  }

  res.redirect('/school/hr/leaves?success=reviewed');
}

async function attendancePage(req, res) {
  const schoolId = req.user.school.id;
  const dateStr = req.query.date || todayDateOnly().toISOString().slice(0, 10);
  const date = new Date(dateStr);

  const [teachers, records] = await Promise.all([
    prisma.teacher.findMany({
      where: { schoolId },
      include: { user: true, staffProfile: true },
      orderBy: { user: { lastName: 'asc' } },
    }),
    prisma.staffAttendance.findMany({
      where: { schoolId, date },
      include: { teacher: { include: { user: true } } },
    }),
  ]);

  res.render('school/hr/attendance', {
    user: req.user,
    school: req.user.school,
    teachers,
    records,
    date: dateStr,
    success: req.query.success || null,
  });
}

async function updateAttendance(req, res) {
  const schoolId = req.user.school.id;
  const { teacherId, date, status, note, checkIn, checkOut } = req.body;
  const teacher = await assertOwnedTeacher(teacherId, schoolId);
  if (!teacher) return res.redirect('/school/hr/attendance?error=1');
  const attendanceDate = new Date(date);

  await prisma.staffAttendance.upsert({
    where: { teacherId_date: { teacherId, date: attendanceDate } },
    create: {
      teacherId,
      schoolId,
      date: attendanceDate,
      status: status || 'PRESENT',
      note: note || null,
      checkIn: checkIn ? new Date(`${date}T${checkIn}`) : null,
      checkOut: checkOut ? new Date(`${date}T${checkOut}`) : null,
    },
    update: {
      status: status || 'PRESENT',
      note: note || null,
      checkIn: checkIn ? new Date(`${date}T${checkIn}`) : null,
      checkOut: checkOut ? new Date(`${date}T${checkOut}`) : null,
    },
  });

  res.redirect(`/school/hr/attendance?date=${date}&success=1`);
}

async function payrollPage(req, res) {
  const schoolId = req.user.school.id;
  const now = new Date();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
  const year = parseInt(req.query.year, 10) || now.getFullYear();

  const [payrollRun, accounts, staffProfiles] = await Promise.all([
    prisma.payrollRun.findUnique({
      where: { schoolId_month_year: { schoolId, month, year } },
      include: {
        payslips: {
          include: {
            teacher: { include: { user: true } },
            staffProfile: { include: { teacher: { include: { user: true } } } },
          },
        },
      },
    }),
    prisma.financeAccount.findMany({ where: { schoolId } }),
    prisma.staffProfile.findMany({
      where: { schoolId, status: 'ACTIVE' },
      include: { teacher: { include: { user: true } } },
    }),
  ]);

  const pendingAdvances = await prisma.salaryAdvance.findMany({
    where: { schoolId, status: 'PENDING' },
    include: { teacher: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.render('school/hr/payroll', {
    user: req.user,
    school: req.user.school,
    payrollRun,
    accounts,
    staffProfiles,
    staffDisplayName,
    teachers: staffProfiles.filter((p) => p.teacherId),
    pendingAdvances,
    month,
    year,
    monthLabel: monthLabel(month, year),
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function generatePayrollAction(req, res) {
  const schoolId = req.user.school.id;
  const { month, year, teacherId } = req.body;
  const period = `${year}-${String(month).padStart(2, '0')}`;

  if (teacherId) {
    const teacher = await assertOwnedTeacher(teacherId, schoolId);
    if (!teacher) return res.redirect(`/school/hr/payroll?month=${month}&year=${year}&error=teacher`);
    const result = await generateTeacherPayroll(teacherId, period);
    if (!result.ok) return res.redirect(`/school/hr/payroll?month=${month}&year=${year}&error=${result.error}`);
    await logAudit({
      action: 'payroll_generate',
      entity: 'Payslip',
      entityId: teacherId,
      user: req.user,
      schoolId,
      ip: req.ip,
      details: { month, year, teacherId },
    });
    return res.redirect(`/school/hr/payroll?month=${month}&year=${year}&success=generated`);
  }

  const result = await generatePayroll({
    schoolId,
    school: req.user.school,
    month,
    year,
  });
  if (result.error) return res.redirect(`/school/hr/payroll?month=${month}&year=${year}&error=${result.error}`);
  await logAudit({
    action: 'payroll_generate',
    entity: 'PayrollRun',
    user: req.user,
    schoolId,
    ip: req.ip,
    details: { month, year },
  });
  res.redirect(`/school/hr/payroll?month=${month}&year=${year}&success=generated`);
}

async function payPayrollAction(req, res) {
  const schoolId = req.user.school.id;
  const { payrollRunId, accountId, month, year } = req.body;
  const result = await markPayrollPaid({ schoolId, payrollRunId, accountId });
  if (result.error) return res.redirect(`/school/hr/payroll?month=${month}&year=${year}&error=${result.error}`);
  await logAudit({
    action: 'payroll_pay',
    entity: 'PayrollRun',
    entityId: payrollRunId,
    user: req.user,
    schoolId,
    ip: req.ip,
  });
  res.redirect(`/school/hr/payroll?month=${month}&year=${year}&success=paid`);
}

async function reviewAdvance(req, res) {
  const schoolId = req.user.school.id;
  const { id } = req.params;
  const { action, adminNote, month, year } = req.body;
  const status = action === 'approve' ? 'APPROVED' : 'REJECTED';

  const advance = await prisma.salaryAdvance.findFirst({
    where: { id, schoolId },
    include: { teacher: { include: { user: true } } },
  });
  if (!advance) return res.redirect('/school/hr/payroll');

  await prisma.salaryAdvance.update({
    where: { id },
    data: { status, adminNote: adminNote || null },
  });

  await notifyUser(
    advance.teacher.userId,
    status === 'APPROVED' ? 'Avance approuvée' : 'Avance refusée',
    `Votre demande d'avance de ${advance.amount.toLocaleString('fr-FR')} FCFA a été ${status === 'APPROVED' ? 'approuvée' : 'refusée'}.`,
  );

  const q = month && year ? `?month=${month}&year=${year}&success=advance` : '?success=advance';
  res.redirect(`/school/hr/payroll${q}`);
}

async function updatePayslip(req, res) {
  const schoolId = req.user.school.id;
  const { id } = req.params;
  const { bonuses, deductions, hoursWorked, month, year } = req.body;

  const payslip = await prisma.payslip.findFirst({
    where: { id, schoolId },
    include: { teacher: { include: { staffProfile: true, user: true } }, payrollRun: true },
  });
  if (!payslip || payslip.payrollRun.status === 'PAID') {
    return res.redirect(`/school/hr/payroll?month=${month}&year=${year}&error=locked`);
  }

  const bonusesN = parseInt(bonuses, 10) || 0;
  const deductionsN = parseInt(deductions, 10) || 0;
  const hours = hoursWorked ? parseFloat(hoursWorked) : null;
  const profile = payslip.teacher.staffProfile;
  const netPay = calcNetPay({
    baseSalary: payslip.baseSalary,
    bonuses: bonusesN,
    deductions: deductionsN,
    advances: payslip.advances,
    hourlyRate: profile?.hourlyRate,
    hoursWorked: hours,
  });

  await prisma.payslip.update({
    where: { id },
    data: { bonuses: bonusesN, deductions: deductionsN, hoursWorked: hours, netPay },
  });

  const total = await prisma.payslip.aggregate({
    where: { payrollRunId: payslip.payrollRunId },
    _sum: { netPay: true },
  });
  await prisma.payrollRun.update({
    where: { id: payslip.payrollRunId },
    data: { totalNet: total._sum.netPay || 0 },
  });

  res.redirect(`/school/hr/payroll?month=${month}&year=${year}&success=payslip`);
}

async function evaluationsPage(req, res) {
  const schoolId = req.user.school.id;
  const period = req.query.period || '2025-2026';
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: {
      user: true,
      evaluations: { where: { period } },
    },
    orderBy: { user: { lastName: 'asc' } },
  });
  res.render('school/hr/evaluations', {
    user: req.user,
    school: req.user.school,
    teachers,
    period,
    success: req.query.success || null,
  });
}

async function saveEvaluation(req, res) {
  const schoolId = req.user.school.id;
  const { teacherId, period, punctuality, pedagogy, discipline, teamwork, comment } = req.body;

  const teacherRow = await assertOwnedTeacher(teacherId, schoolId);
  if (!teacherRow) return res.redirect('/school/hr/evaluations?error=1');

  await prisma.staffEvaluation.upsert({
    where: { teacherId_period: { teacherId, period } },
    create: {
      teacherId,
      schoolId,
      period,
      punctuality: punctuality ? parseInt(punctuality, 10) : null,
      pedagogy: pedagogy ? parseInt(pedagogy, 10) : null,
      discipline: discipline ? parseInt(discipline, 10) : null,
      teamwork: teamwork ? parseInt(teamwork, 10) : null,
      comment: comment || null,
    },
    update: {
      punctuality: punctuality ? parseInt(punctuality, 10) : null,
      pedagogy: pedagogy ? parseInt(pedagogy, 10) : null,
      discipline: discipline ? parseInt(discipline, 10) : null,
      teamwork: teamwork ? parseInt(teamwork, 10) : null,
      comment: comment || null,
    },
  });

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: true },
  });
  if (teacher) {
    await notifyUser(teacher.userId, 'Évaluation disponible', `Votre évaluation pour ${period} a été enregistrée.`);
  }

  res.redirect(`/school/hr/evaluations?period=${encodeURIComponent(period)}&success=1`);
}

async function exportPayroll(req, res) {
  const schoolId = req.user.school.id;
  const month = parseInt(req.query.month, 10);
  const year = parseInt(req.query.year, 10);
  const payrollRun = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId, month, year } },
    include: { payslips: { include: { teacher: { include: { user: true } } } } },
  });
  if (!payrollRun) return res.redirect('/school/hr/payroll');

  const wb = await buildWorkbook(
    'Paie',
    [
      { header: 'Enseignant', key: 'name', width: 24 },
      { header: 'Base', key: 'base', width: 12 },
      { header: 'Primes', key: 'bonuses', width: 12 },
      { header: 'Retenues', key: 'deductions', width: 12 },
      { header: 'Avances', key: 'advances', width: 12 },
      { header: 'Net', key: 'net', width: 12 },
    ],
    payrollRun.payslips.map((p) => ({
      name: `${p.teacher.user.lastName} ${p.teacher.user.firstName}`,
      base: p.baseSalary,
      bonuses: p.bonuses,
      deductions: p.deductions,
      advances: p.advances,
      net: p.netPay,
    })),
  );
  await sendExcel(res, `paie-${month}-${year}.xlsx`, wb);
}

async function exportLeaves(req, res) {
  const schoolId = req.user.school.id;
  const leaves = await prisma.leaveRequest.findMany({
    where: { schoolId },
    include: { teacher: { include: { user: true } } },
    orderBy: { startDate: 'desc' },
  });
  const wb = await buildWorkbook(
    'Congés',
    [
      { header: 'Enseignant', key: 'name', width: 24 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Début', key: 'start', width: 12 },
      { header: 'Fin', key: 'end', width: 12 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Motif', key: 'reason', width: 30 },
    ],
    leaves.map((l) => ({
      name: `${l.teacher.user.lastName} ${l.teacher.user.firstName}`,
      type: l.type,
      start: l.startDate.toISOString().slice(0, 10),
      end: l.endDate.toISOString().slice(0, 10),
      status: l.status,
      reason: l.reason || '',
    })),
  );
  await sendExcel(res, 'conges-personnel.xlsx', wb);
}

async function exportAttendance(req, res) {
  const schoolId = req.user.school.id;
  const records = await prisma.staffAttendance.findMany({
    where: { schoolId },
    include: { teacher: { include: { user: true } } },
    orderBy: { date: 'desc' },
    take: 500,
  });
  const wb = await buildWorkbook(
    'Présence',
    [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Enseignant', key: 'name', width: 24 },
      { header: 'Entrée', key: 'in', width: 10 },
      { header: 'Sortie', key: 'out', width: 10 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Note', key: 'note', width: 24 },
    ],
    records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      name: `${r.teacher.user.lastName} ${r.teacher.user.firstName}`,
      in: r.checkIn ? r.checkIn.toISOString().slice(11, 16) : '',
      out: r.checkOut ? r.checkOut.toISOString().slice(11, 16) : '',
      status: r.status,
      note: r.note || '',
    })),
  );
  await sendExcel(res, 'presence-personnel.xlsx', wb);
}

async function exportPayslipPdf(req, res) {
  const teacher = await prisma.teacher.findFirst({
    where: { id: req.params.teacherId, schoolId: req.user.school.id },
  });
  if (!teacher) return res.redirect('/school/hr/payroll');

  const { month, year } = req.query;
  const period = year && month ? `${year}-${String(month).padStart(2, '0')}` : month;

  try {
    const result = await generatePayrollPDF(teacher.id, period);
    if (!result.ok) return res.redirect('/school/hr/payroll?error=pdf');
    return sendPdfDownload(res, result);
  } catch (err) {
    console.error(err);
    res.redirect('/school/hr/payroll?error=pdf');
  }
}

module.exports = {
  dashboard,
  staffList,
  newStaffForm,
  createStaffMember,
  staffProfileDetail,
  updateStaffProfileById,
  staffDetail,
  updateStaffProfile,
  uploadStaffDocument,
  leavesPage,
  reviewLeave,
  attendancePage,
  updateAttendance,
  payrollPage,
  generatePayrollAction,
  payPayrollAction,
  reviewAdvance,
  updatePayslip,
  evaluationsPage,
  saveEvaluation,
  exportPayroll,
  exportLeaves,
  exportAttendance,
  exportPayslipPdf,
};
