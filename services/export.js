const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const prisma = require('../src/config/database');
const { drawDocumentHeader } = require('../src/utils/schoolLogo');
const { computeAverage, getCoefficient } = require('../src/services/bulletinPdf');
const { calcNetPay, monthLabel } = require('../src/utils/hr');
const { getCache, setCache } = require('./cache');

const EXPORTS_DIR = path.join(__dirname, '../uploads/exports');
const BULLETINS_DIR = path.join(__dirname, '../uploads/bulletins');
const PAYSLIPS_DIR = path.join(__dirname, '../uploads/payslips');

const ABSENCE_LABELS = {
  ABSENCE: 'Absence',
  LATE: 'Retard',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseMonth(month) {
  if (month && typeof month === 'object') {
    const m = parseInt(month.month, 10);
    const y = parseInt(month.year, 10);
    if (m >= 1 && m <= 12 && y > 2000) return { month: m, year: y };
  }

  if (typeof month === 'string' && month.includes('-')) {
    const [yearPart, monthPart] = month.split('-');
    const y = parseInt(yearPart, 10);
    const m = parseInt(monthPart, 10);
    if (m >= 1 && m <= 12 && y > 2000) return { month: m, year: y };
  }

  const m = parseInt(month, 10);
  const now = new Date();
  if (m >= 1 && m <= 12) return { month: m, year: now.getFullYear() };

  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function monthBounds(month, year) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function writePdf(filepath, render) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    try {
      render(doc);
      doc.end();
    } catch (err) {
      reject(err);
      return;
    }
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function drawFooter(doc, school) {
  doc.moveDown(2);
  doc.fontSize(9).fillColor('#999').text(
    `Document généré le ${new Date().toLocaleDateString('fr-FR')} — ${school?.name || 'EduPay CI'}`,
    { align: 'center' },
  );
}

/**
 * Bulletin PDF : notes + absences de l'élève.
 */
async function generateBulletinPDF(studentId) {
  if (!studentId) return { ok: false, error: 'student' };

  const cacheKey = `bulletin:pdf:${studentId}`;
  const cached = await getCache(cacheKey);
  if (cached?.ok && cached.filepath && fs.existsSync(cached.filepath)) {
    return cached;
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: { include: { school: true } }, school: true },
  });
  if (!student) return { ok: false, error: 'student' };

  const [grades, absences] = await Promise.all([
    prisma.grade.findMany({
      where: { studentId },
      orderBy: [{ period: 'asc' }, { subject: 'asc' }],
    }),
    prisma.absence.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
    }),
  ]);

  const school = student.school || student.class?.school || { name: 'EduPay CI' };
  const average = computeAverage(grades);

  ensureDir(BULLETINS_DIR);
  const filename = `bulletin-${student.id}-${Date.now()}.pdf`;
  const filepath = path.join(BULLETINS_DIR, filename);

  await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, { title: 'Bulletin scolaire' });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${student.class?.schoolYear || school.currentSchoolYear || '—'}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Informations élève');
    doc.fontSize(11).fillColor('#333');
    doc.text(`Nom : ${student.lastName} ${student.firstName}`);
    doc.text(`Classe : ${student.class?.name || '—'}`);
    doc.text(`Matricule : ${student.matricule || '—'}`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Notes');
    doc.moveDown(0.4);

    if (!grades.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune note enregistrée.');
    } else {
      const tableTop = doc.y;
      doc.fontSize(10).fillColor('#666');
      doc.text('Matière', 50, tableTop);
      doc.text('Période', 180, tableTop);
      doc.text('Coef.', 280, tableTop);
      doc.text('Note', 330, tableTop);
      doc.text('Appréciation', 400, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

      let y = tableTop + 25;
      grades.forEach((g) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        const coef = getCoefficient(g.subject);
        doc.fontSize(10).fillColor('#333');
        doc.text(g.subject, 50, y, { width: 120 });
        doc.text(g.period || '—', 180, y, { width: 90 });
        doc.text(String(coef), 280, y);
        doc.text(`${g.value} / ${g.maxValue}`, 330, y);
        doc.text(g.comment || '—', 400, y, { width: 150 });
        y += 22;
      });
      doc.y = y + 8;
    }

    doc.moveDown();
    doc.fontSize(12).fillColor('#0052CC');
    doc.text(`Moyenne générale : ${average.toFixed(2)} / 20`);
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Absences');
    doc.moveDown(0.4);

    if (!absences.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune absence enregistrée.');
    } else {
      const tableTop = doc.y;
      doc.fontSize(10).fillColor('#666');
      doc.text('Date', 50, tableTop);
      doc.text('Type', 160, tableTop);
      doc.text('Motif', 250, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

      let y = tableTop + 25;
      absences.forEach((a) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(10).fillColor('#333');
        doc.text(new Date(a.date).toLocaleDateString('fr-FR'), 50, y);
        doc.text(ABSENCE_LABELS[a.type] || a.type, 160, y);
        doc.text(a.reason || '—', 250, y, { width: 300 });
        y += 20;
      });
      doc.y = y + 8;
      doc.fontSize(11).fillColor('#333').text(`Total : ${absences.length} absence(s) / retard(s).`);
    }

    drawFooter(doc, school);
  });

  const url = `/uploads/bulletins/${filename}`;
  const result = { ok: true, filepath, filename, url, pdfUrl: url, average };
  await setCache(cacheKey, result, 60 * 60);
  return { ...result, grades, absences };
}

/**
 * Fiche de paie PDF : salaire + congés du mois.
 */
async function generatePayrollPDF(teacherId, month) {
  if (!teacherId) return { ok: false, error: 'teacher' };

  const { month: m, year: y } = parseMonth(month);
  const { start, end } = monthBounds(m, y);
  const periodKey = `${y}-${String(m).padStart(2, '0')}`;

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: true, staffProfile: true, school: true },
  });
  if (!teacher) return { ok: false, error: 'teacher' };

  const [leaveRequests, leaves, payslip, payroll] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { teacherId, startDate: { lte: end }, endDate: { gte: start } },
      orderBy: { startDate: 'asc' },
    }),
    prisma.leave.findMany({
      where: { teacherId, startDate: { lte: end }, endDate: { gte: start } },
      orderBy: { startDate: 'asc' },
    }),
    prisma.payslip.findFirst({
      where: { teacherId, payrollRun: { month: m, year: y } },
      include: { payrollRun: true },
    }),
    prisma.payroll.findFirst({
      where: {
        teacherId,
        month: { in: [periodKey, String(m), `${m}/${y}`] },
      },
    }),
  ]);

  const allLeaves = [
    ...leaveRequests.map((l) => ({
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status,
      reason: l.reason,
      type: l.type,
    })),
    ...leaves.map((l) => ({
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status,
      reason: null,
      type: 'CONGÉ',
    })),
  ];

  const baseSalary = payslip?.baseSalary ?? teacher.staffProfile?.baseSalary ?? 0;
  const bonuses = payslip?.bonuses ?? 0;
  const deductions = payslip?.deductions ?? 0;
  const advances = payslip?.advances ?? 0;
  const hoursWorked = payslip?.hoursWorked ?? null;
  const netPay = payslip?.netPay ?? calcNetPay({
    baseSalary,
    bonuses,
    deductions,
    advances,
    hourlyRate: teacher.staffProfile?.hourlyRate,
    hoursWorked,
  });

  ensureDir(PAYSLIPS_DIR);
  const filename = `fiche-paie-${teacher.id}-${periodKey}.pdf`;
  const filepath = path.join(PAYSLIPS_DIR, filename);
  const school = teacher.school;
  const period = monthLabel(m, y);

  await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, { title: `Fiche de paie — ${period}` });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Employé : ${teacher.user.lastName} ${teacher.user.firstName}`);
    doc.text(`Matière : ${teacher.subject || '—'}`);
    doc.text(`Email : ${teacher.user.email}`);
    if (teacher.staffProfile?.contractType) {
      doc.text(`Contrat : ${teacher.staffProfile.contractType}`);
    }
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Salaire');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#333');
    if (hoursWorked) doc.text(`Heures travaillées : ${hoursWorked} h`);
    doc.text(`Salaire de base : ${baseSalary.toLocaleString('fr-FR')} FCFA`);
    doc.text(`Primes : ${bonuses.toLocaleString('fr-FR')} FCFA`);
    doc.text(`Retenues : ${deductions.toLocaleString('fr-FR')} FCFA`);
    doc.text(`Avances déduites : ${advances.toLocaleString('fr-FR')} FCFA`);
    doc.moveDown();
    doc.fontSize(14).fillColor('#00C853').text(
      `Net à payer : ${netPay.toLocaleString('fr-FR')} FCFA`,
      { align: 'center' },
    );
    doc.moveDown();

    doc.fontSize(13).fillColor('#0052CC').text('Congés du mois');
    doc.moveDown(0.3);

    if (!allLeaves.length) {
      doc.fontSize(11).fillColor('#666').text('Aucun congé sur cette période.');
    } else {
      const tableTop = doc.y;
      doc.fontSize(10).fillColor('#666');
      doc.text('Type', 50, tableTop);
      doc.text('Début', 160, tableTop);
      doc.text('Fin', 250, tableTop);
      doc.text('Statut', 340, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

      let y = tableTop + 25;
      allLeaves.forEach((l) => {
        doc.fontSize(10).fillColor('#333');
        doc.text(l.type || '—', 50, y);
        doc.text(new Date(l.startDate).toLocaleDateString('fr-FR'), 160, y);
        doc.text(new Date(l.endDate).toLocaleDateString('fr-FR'), 250, y);
        doc.text(l.status || '—', 340, y);
        y += 20;
      });
      doc.y = y + 8;
    }

    drawFooter(doc, school);
  });

  const url = `/uploads/payslips/${filename}`;

  if (payslip) {
    await prisma.payslip.update({ where: { id: payslip.id }, data: { pdfUrl: url } });
  }
  if (payroll) {
    await prisma.payroll.update({ where: { id: payroll.id }, data: { pdfPath: url } });
  }

  return {
    ok: true,
    filepath,
    filename,
    url,
    pdfUrl: url,
    netPay,
    leaves: allLeaves,
  };
}

/**
 * Stats élèves en Excel (exceljs).
 */
async function generateStatsExcel(schoolId) {
  if (!schoolId) return { ok: false, error: 'school' };

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const [students, classes] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId },
      include: {
        class: true,
        grades: true,
        absences: true,
        payments: { where: { status: 'VALIDATED' } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.class.findMany({
      where: { schoolId },
      include: { _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const studentRows = students.map((s) => {
    const avg = computeAverage(s.grades);
    const paid = s.payments.reduce((sum, p) => sum + p.amount, 0);
    return {
      lastName: s.lastName,
      firstName: s.firstName,
      className: s.class?.name || '—',
      matricule: s.matricule || '',
      gradesCount: s.grades.length,
      average: avg,
      absences: s.absences.length,
      payments: s.payments.length,
      paidAmount: paid,
    };
  });

  const byClass = classes.map((c) => {
    const members = studentRows.filter((r) => r.className === c.name);
    const avg = members.length
      ? Math.round((members.reduce((sum, r) => sum + r.average, 0) / members.length) * 100) / 100
      : 0;
    return {
      name: c.name,
      level: c.level,
      students: c._count.students,
      average: avg,
      absences: members.reduce((sum, r) => sum + r.absences, 0),
      paidAmount: members.reduce((sum, r) => sum + r.paidAmount, 0),
    };
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduPay CI';
  workbook.created = new Date();

  const wsStudents = workbook.addWorksheet('Élèves');
  wsStudents.columns = [
    { header: 'Nom', key: 'lastName', width: 16 },
    { header: 'Prénom', key: 'firstName', width: 16 },
    { header: 'Classe', key: 'className', width: 14 },
    { header: 'Matricule', key: 'matricule', width: 14 },
    { header: 'Notes', key: 'gradesCount', width: 10 },
    { header: 'Moyenne /20', key: 'average', width: 14 },
    { header: 'Absences', key: 'absences', width: 12 },
    { header: 'Paiements validés', key: 'payments', width: 18 },
    { header: 'Montant FCFA', key: 'paidAmount', width: 16 },
  ];
  studentRows.forEach((row) => wsStudents.addRow(row));
  wsStudents.getRow(1).font = { bold: true };

  const wsClasses = workbook.addWorksheet('Classes');
  wsClasses.columns = [
    { header: 'Classe', key: 'name', width: 16 },
    { header: 'Niveau', key: 'level', width: 12 },
    { header: 'Élèves', key: 'students', width: 12 },
    { header: 'Moyenne /20', key: 'average', width: 14 },
    { header: 'Absences', key: 'absences', width: 12 },
    { header: 'Encaissé FCFA', key: 'paidAmount', width: 16 },
  ];
  byClass.forEach((row) => wsClasses.addRow(row));
  wsClasses.getRow(1).font = { bold: true };

  const wsSummary = workbook.addWorksheet('Synthèse');
  wsSummary.columns = [
    { header: 'Indicateur', key: 'label', width: 28 },
    { header: 'Valeur', key: 'value', width: 18 },
  ];
  const schoolAvg = studentRows.length
    ? Math.round((studentRows.reduce((sum, r) => sum + r.average, 0) / studentRows.length) * 100) / 100
    : 0;
  [
    { label: 'École', value: school.name },
    { label: 'Élèves', value: students.length },
    { label: 'Classes', value: classes.length },
    { label: 'Moyenne générale /20', value: schoolAvg },
    { label: 'Absences', value: studentRows.reduce((sum, r) => sum + r.absences, 0) },
    { label: 'Encaissé FCFA', value: studentRows.reduce((sum, r) => sum + r.paidAmount, 0) },
  ].forEach((row) => wsSummary.addRow(row));
  wsSummary.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `stats-${schoolId.slice(0, 8)}-${Date.now()}.xlsx`;
  const filepath = path.join(EXPORTS_DIR, filename);
  await workbook.xlsx.writeFile(filepath);

  return {
    ok: true,
    filepath,
    filename,
    url: `/uploads/exports/${filename}`,
    workbook,
  };
}

module.exports = {
  generateBulletinPDF,
  generatePayrollPDF,
  generateStatsExcel,
  parseMonth,
};
