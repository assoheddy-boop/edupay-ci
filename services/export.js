const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const prisma = require('../src/config/database');
const { drawDocumentHeader } = require('../src/utils/schoolLogo');
const { renderPdfToBuffer, savePdfBuffer } = require('../src/utils/pdfOutput');
const { computeAverage, getCoefficient, loadSchoolCoefficients } = require('../src/services/gradesAverage');
const { formatTermLabel } = require('../src/services/academicTerms');
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
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err && (err.code === 'EROFS' || err.code === 'EACCES' || err.code === 'EPERM')) return;
    throw err;
  }
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

async function writePdf(filepath, render) {
  const filename = path.basename(filepath);
  const folder = path.basename(path.dirname(filepath));
  const buffer = await renderPdfToBuffer(render);
  return savePdfBuffer({ folder, filename, buffer });
}

function drawFooter(doc, school) {
  doc.moveDown(2);
  doc.fontSize(9).fillColor('#999').text(
    `Document généré le ${new Date().toLocaleDateString('fr-FR')} — ${school?.name || 'EduConnect'}`,
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

  const school = student.school || student.class?.school || { name: 'EduConnect' };
  const coeffMap = await loadSchoolCoefficients(school.id);
  const average = computeAverage(grades, coeffMap);

  ensureDir(BULLETINS_DIR);
  const filename = `bulletin-${student.id}-${Date.now()}.pdf`;
  const filepath = path.join(BULLETINS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
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
        const coef = getCoefficient(g.subject, coeffMap);
        doc.fontSize(10).fillColor('#333');
        doc.text(g.subject, 50, y, { width: 120 });
        doc.text(formatTermLabel(g.period) || '—', 180, y, { width: 90 });
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
    doc.fontSize(9).fillColor('#666');
    doc.text('Moyenne pondérée : Σ (moyenne matière × coefficient) / Σ coefficients');
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

  const result = { ok: true, ...saved, average };
  await setCache(cacheKey, {
    ok: true,
    filepath: saved.filepath,
    filename: saved.filename,
    url: saved.url,
    pdfUrl: saved.pdfUrl,
    average,
  }, 60 * 60);
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

  const saved = await writePdf(filepath, (doc) => {
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

  const url = saved.pdfUrl || saved.url;

  if (payslip) {
    await prisma.payslip.update({ where: { id: payslip.id }, data: { pdfUrl: url } });
  }
  if (payroll) {
    await prisma.payroll.update({ where: { id: payroll.id }, data: { pdfPath: url } });
  }

  return {
    ok: true,
    ...saved,
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
      gender: s.gender === 'M' ? 'Garçon' : s.gender === 'F' ? 'Fille' : '',
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
      boys: members.filter((r) => r.gender === 'Garçon').length,
      girls: members.filter((r) => r.gender === 'Fille').length,
      average: avg,
      absences: members.reduce((sum, r) => sum + r.absences, 0),
      paidAmount: members.reduce((sum, r) => sum + r.paidAmount, 0),
    };
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduConnect';
  workbook.created = new Date();

  const wsStudents = workbook.addWorksheet('Élèves');
  wsStudents.columns = [
    { header: 'Nom', key: 'lastName', width: 16 },
    { header: 'Prénom', key: 'firstName', width: 16 },
    { header: 'Classe', key: 'className', width: 14 },
    { header: 'Matricule', key: 'matricule', width: 14 },
    { header: 'Genre', key: 'gender', width: 12 },
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
    { header: 'Garçons', key: 'boys', width: 12 },
    { header: 'Filles', key: 'girls', width: 12 },
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

function genderExportRows(rows, nameKey) {
  return rows.map((row) => ({
    name: row[nameKey],
    boys: row.boys,
    girls: row.girls,
    total: row.total,
    absBoys: row.absences?.boys || 0,
    absGirls: row.absences?.girls || 0,
    succBoys: Math.round((row.success?.boys?.successRate || 0) * 100),
    succGirls: Math.round((row.success?.girls?.successRate || 0) * 100),
  }));
}

const GENDER_COLUMNS = [
  { header: 'Nom', key: 'name', width: 28 },
  { header: 'Garçons', key: 'boys', width: 12 },
  { header: 'Filles', key: 'girls', width: 12 },
  { header: 'Total', key: 'total', width: 12 },
  { header: 'Absences G', key: 'absBoys', width: 14 },
  { header: 'Absences F', key: 'absGirls', width: 14 },
  { header: 'Réussite G %', key: 'succBoys', width: 16 },
  { header: 'Réussite F %', key: 'succGirls', width: 16 },
];

const SCHOOL_GENDER_CLASS_COLUMNS = [
  { header: 'Classe', key: 'classe', width: 24 },
  { header: 'Garçons', key: 'garcons', width: 12 },
  { header: 'Filles', key: 'filles', width: 12 },
  { header: 'Total', key: 'total', width: 12 },
];

async function fetchSchoolClassGenderRows(schoolId) {
  if (!schoolId) return { ok: false, error: 'school' };

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const { listClassGenderStats } = require('./ClassService');
  const stats = await listClassGenderStats({ schoolId });
  if (!stats.ok) return stats;

  const rows = (stats.classes || []).map((row) => ({
    classe: row.className,
    garcons: row.boys,
    filles: row.girls,
    total: row.total,
  }));

  return { ok: true, school, rows };
}

/**
 * Stats filles/garçons par classe pour une école (Excel).
 */
async function generateGenderStatsExcel(schoolId) {
  const data = await fetchSchoolClassGenderRows(schoolId);
  if (!data.ok) return data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduConnect';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Par classe');
  ws.columns = SCHOOL_GENDER_CLASS_COLUMNS;
  data.rows.forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `genre-${schoolId.slice(0, 8)}-${Date.now()}.xlsx`;
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

/**
 * Stats filles/garçons par classe pour une école (PDF).
 */
async function generateGenderStatsPDF(schoolId) {
  const data = await fetchSchoolClassGenderRows(schoolId);
  if (!data.ok) return data;

  ensureDir(EXPORTS_DIR);
  const filename = `genre-${schoolId.slice(0, 8)}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, data.school, { title: 'Répartition filles / garçons par classe' });

    doc.fontSize(10).fillColor('#666');
    const tableTop = doc.y;
    doc.text('Classe', 50, tableTop);
    doc.text('Garçons', 250, tableTop);
    doc.text('Filles', 330, tableTop);
    doc.text('Total', 410, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    if (!data.rows.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune classe.', 50, y);
      y += 20;
    } else {
      data.rows.forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(10).fillColor('#333');
        doc.text(row.classe || '—', 50, y, { width: 190 });
        doc.text(String(row.garcons || 0), 250, y);
        doc.text(String(row.filles || 0), 330, y);
        doc.text(String(row.total || 0), 410, y);
        y += 20;
      });
    }

    doc.y = y + 12;
    drawFooter(doc, data.school);
  });

  return { ok: true, ...saved };
}

/**
 * Stats filles/garçons en Excel (export détaillé classe / multi-écoles).
 */
async function generateClassGenderStatsExcel({ schoolId, classId } = {}) {
  const {
    getClassGenderStats,
    getGenderStatsBySchool,
    listClassGenderStats,
  } = require('./ClassService');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduConnect';
  workbook.created = new Date();

  if (classId) {
    const stats = await getClassGenderStats(classId);
    const ws = workbook.addWorksheet('Classe');
    ws.columns = GENDER_COLUMNS;
    ws.addRow({
      name: 'Classe',
      boys: stats.boys,
      girls: stats.girls,
      total: stats.total,
      absBoys: stats.absences?.boys || 0,
      absGirls: stats.absences?.girls || 0,
      succBoys: Math.round((stats.success?.boys?.successRate || 0) * 100),
      succGirls: Math.round((stats.success?.girls?.successRate || 0) * 100),
    });
    ws.getRow(1).font = { bold: true };
  } else {
    const [bySchool, byClass] = await Promise.all([
      getGenderStatsBySchool(schoolId),
      listClassGenderStats({ schoolId }),
    ]);

    const wsSchools = workbook.addWorksheet('Par école');
    wsSchools.columns = GENDER_COLUMNS;
    genderExportRows(bySchool.schools || [], 'schoolName').forEach((row) => wsSchools.addRow(row));
    wsSchools.getRow(1).font = { bold: true };

    const wsClasses = workbook.addWorksheet('Par classe');
    wsClasses.columns = GENDER_COLUMNS;
    genderExportRows(byClass.classes || [], 'className').forEach((row) => wsClasses.addRow(row));
    wsClasses.getRow(1).font = { bold: true };
  }

  ensureDir(EXPORTS_DIR);
  const filename = `genre-${Date.now()}.xlsx`;
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

/**
 * Stats filles/garçons en PDF (export détaillé classe / multi-écoles).
 */
async function generateClassGenderStatsPdf({ schoolId, classId } = {}) {
  const {
    getClassGenderStats,
    getGenderStatsBySchool,
  } = require('./ClassService');

  let title = 'Répartition filles / garçons';
  let rows = [];

  if (classId) {
    const stats = await getClassGenderStats(classId);
    title = 'Répartition filles / garçons — classe';
    rows = [{ name: 'Classe', ...stats }];
  } else {
    const bySchool = await getGenderStatsBySchool(schoolId);
    rows = (bySchool.schools || []).map((s) => ({ name: s.schoolName, ...s }));
  }

  ensureDir(EXPORTS_DIR);
  const filename = `genre-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    doc.fontSize(18).fillColor('#0052CC').text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666');
    const tableTop = doc.y;
    doc.text('Nom', 50, tableTop);
    doc.text('Garçons', 250, tableTop);
    doc.text('Filles', 330, tableTop);
    doc.text('Total', 410, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    rows.forEach((row) => {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(10).fillColor('#333');
      doc.text(row.name || '—', 50, y, { width: 190 });
      doc.text(String(row.boys || 0), 250, y);
      doc.text(String(row.girls || 0), 330, y);
      doc.text(String(row.total || 0), 410, y);
      y += 20;
    });
    doc.y = y + 12;
    drawFooter(doc, { name: 'EduConnect' });
  });

  return { ok: true, ...saved };
}

const REINSCRIPTION_COLUMNS = [
  { header: 'Élève', key: 'student', width: 28 },
  { header: 'Classe', key: 'className', width: 22 },
  { header: 'Statut', key: 'statusLabel', width: 16 },
];

function reinscriptionExportRows(records) {
  return records.map((r) => ({
    student: `${r.student?.lastName || ''} ${r.student?.firstName || ''}`.trim(),
    className: r.class ? `${r.class.level} — ${r.class.name}` : '—',
    statusLabel: r.repeatYear ? 'Redoublant' : 'Promu',
  }));
}

/**
 * Export réinscriptions PDF (promus / redoublants).
 */
async function generateReinscriptionPDF(schoolId, schoolYear) {
  if (!schoolId || !schoolYear) return { ok: false, error: 'school' };

  const { listRecordsForExport } = require('./ReinscriptionService');
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const records = await listRecordsForExport(schoolId, schoolYear);
  ensureDir(EXPORTS_DIR);
  const filename = `reinscription-${schoolId}-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, { title: 'Réinscriptions' });
    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${schoolYear}`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('Élève', 50, tableTop);
    doc.text('Classe', 220, tableTop);
    doc.text('Statut', 400, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    if (!records.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune réinscription enregistrée.', 50, y);
    } else {
      records.forEach((r) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        const row = reinscriptionExportRows([r])[0];
        doc.fontSize(10).fillColor('#333');
        doc.text(row.student, 50, y, { width: 160 });
        doc.text(row.className, 220, y, { width: 170 });
        doc.text(row.statusLabel, 400, y);
        y += 20;
      });
    }
    doc.y = y + 12;
    drawFooter(doc, school);
  });

  return { ok: true, ...saved };
}

/**
 * Export réinscriptions Excel.
 */
async function generateReinscriptionExcel(schoolId, schoolYear) {
  if (!schoolId || !schoolYear) return { ok: false, error: 'school' };

  const { listRecordsForExport } = require('./ReinscriptionService');
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const records = await listRecordsForExport(schoolId, schoolYear);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Réinscriptions');
  ws.columns = REINSCRIPTION_COLUMNS;
  reinscriptionExportRows(records).forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `reinscription-${schoolId}-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.xlsx`;
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

const CAUSES_COLUMNS = [
  { header: 'Élève', key: 'student', width: 28 },
  { header: 'Classe', key: 'className', width: 22 },
  { header: 'Redoublant', key: 'repeatLabel', width: 14 },
  { header: 'Absences', key: 'absences', width: 12 },
  { header: 'Moyenne', key: 'avgGrade', width: 12 },
  { header: 'Cause probable', key: 'cause', width: 22 },
];

function causesExportRows(causes) {
  return causes.map((c) => ({
    student: `${c.lastName || ''} ${c.firstName || ''}`.trim(),
    className: c.classLevel ? `${c.classLevel} — ${c.className}` : c.className || '—',
    repeatLabel: 'Oui',
    absences: c.absences,
    avgGrade: c.avgGrade,
    cause: c.cause,
  }));
}

/**
 * Export causes de redoublement PDF.
 */
async function generateRedoublementCausesPDF(schoolId, schoolYear) {
  if (!schoolId || !schoolYear) return { ok: false, error: 'school' };

  const { analyzeRedoublementCauses, ABSENCE_THRESHOLD, GRADE_THRESHOLD } = require('./ReinscriptionService');
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const causes = await analyzeRedoublementCauses(schoolYear, schoolId);
  ensureDir(EXPORTS_DIR);
  const filename = `causes-redoublement-${schoolId}-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, { title: 'Causes probables de redoublement' });
    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${schoolYear}`);
    doc.text(`Seuils : absences > ${ABSENCE_THRESHOLD} jours, moyenne < ${GRADE_THRESHOLD}/20`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('Élève', 50, tableTop);
    doc.text('Classe', 170, tableTop);
    doc.text('Abs.', 310, tableTop);
    doc.text('Moy.', 350, tableTop);
    doc.text('Cause', 400, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    if (!causes.length) {
      doc.fontSize(11).fillColor('#666').text('Aucun redoublant pour cette année.', 50, y);
    } else {
      causesExportRows(causes).forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(10).fillColor('#333');
        doc.text(row.student, 50, y, { width: 115 });
        doc.text(row.className, 170, y, { width: 135 });
        doc.text(String(row.absences), 310, y);
        doc.text(String(row.avgGrade), 350, y);
        doc.text(row.cause, 400, y, { width: 140 });
        y += 20;
      });
    }
    doc.y = y + 12;
    drawFooter(doc, school);
  });

  return { ok: true, ...saved };
}

/**
 * Export causes de redoublement Excel.
 */
async function generateRedoublementCausesExcel(schoolId, schoolYear) {
  if (!schoolId || !schoolYear) return { ok: false, error: 'school' };

  const { analyzeRedoublementCauses } = require('./ReinscriptionService');
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };

  const causes = await analyzeRedoublementCauses(schoolYear, schoolId);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Causes redoublement');
  ws.columns = CAUSES_COLUMNS;
  causesExportRows(causes).forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `causes-redoublement-${schoolId}-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.xlsx`;
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

const GROUP_CAUSES_COLUMNS = [
  { header: 'École', key: 'schoolName', width: 28 },
  { header: 'Total redoublants', key: 'totalRedoublants', width: 18 },
  { header: 'Absences moyennes', key: 'absencesAvg', width: 18 },
  { header: 'Notes moyennes', key: 'notesAvg', width: 16 },
  { header: 'Cause principale', key: 'primaryCause', width: 22 },
  { header: 'Taux redoublement', key: 'repeatRatePct', width: 18 },
  { header: 'À risque', key: 'atRiskLabel', width: 12 },
];

function groupCausesExportRows(stats) {
  return (stats.schools || []).map((s) => ({
    schoolName: s.schoolName,
    totalRedoublants: s.totalRedoublants,
    absencesAvg: s.absencesAvg,
    notesAvg: s.notesAvg,
    primaryCause: s.primaryCause,
    repeatRatePct: `${Math.round((s.repeatRate || 0) * 100)}%`,
    atRiskLabel: s.atRisk ? 'Oui' : 'Non',
  }));
}

/**
 * Export comparatif causes de redoublement par école (groupe) — PDF.
 */
async function generateGroupRedoublementCausesPDF(groupId, schoolYear) {
  if (!groupId || !schoolYear) return { ok: false, error: 'group' };

  const { getGroupRedoublementCauses, ABSENCE_THRESHOLD, GRADE_THRESHOLD, AT_RISK_REPEAT_RATE } = require('./ReinscriptionService');
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { ok: false, error: 'group' };

  const stats = await getGroupRedoublementCauses(groupId, schoolYear);
  if (!stats.ok) return { ok: false, error: stats.error || 'stats' };

  ensureDir(EXPORTS_DIR);
  const filename = `causes-redoublement-groupe-${groupId}-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    doc.fontSize(16).fillColor('#222').text('Comparatif redoublement par école', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Groupe : ${stats.groupName || group.name}`);
    doc.text(`Année scolaire : ${schoolYear}`);
    doc.text(`Seuils : absences > ${ABSENCE_THRESHOLD} jours, moyenne < ${GRADE_THRESHOLD}/20`);
    doc.text(`École à risque si taux de redoublement > ${Math.round(AT_RISK_REPEAT_RATE * 100)}%`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('École', 50, tableTop);
    doc.text('Redoubl.', 180, tableTop);
    doc.text('Abs. moy.', 240, tableTop);
    doc.text('Notes moy.', 310, tableTop);
    doc.text('Cause', 390, tableTop);
    doc.text('Risque', 500, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    const rows = groupCausesExportRows(stats);
    if (!rows.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune école dans ce groupe.', 50, y);
    } else {
      rows.forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(10).fillColor('#333');
        doc.text(row.schoolName, 50, y, { width: 125 });
        doc.text(String(row.totalRedoublants), 180, y);
        doc.text(`${row.absencesAvg} j`, 240, y);
        doc.text(String(row.notesAvg), 310, y);
        doc.text(row.primaryCause, 390, y, { width: 100 });
        doc.text(row.atRiskLabel, 500, y);
        y += 20;
      });
    }
    doc.y = y + 12;
    doc.fontSize(9).fillColor('#999').text('EduConnect — export groupe', 50, doc.page.height - 40, { align: 'left' });
  });

  return { ok: true, ...saved };
}

/**
 * Export comparatif causes de redoublement par école (groupe) — Excel.
 */
async function generateGroupRedoublementCausesExcel(groupId, schoolYear) {
  if (!groupId || !schoolYear) return { ok: false, error: 'group' };

  const { getGroupRedoublementCauses } = require('./ReinscriptionService');
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { ok: false, error: 'group' };

  const stats = await getGroupRedoublementCauses(groupId, schoolYear);
  if (!stats.ok) return { ok: false, error: stats.error || 'stats' };

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Comparatif redoublement');
  ws.columns = GROUP_CAUSES_COLUMNS;
  groupCausesExportRows(stats).forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `causes-redoublement-groupe-${groupId}-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.xlsx`;
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

const PLAN_REDOUBLEMENT_COLUMNS = [
  { header: 'Plan', key: 'planName', width: 22 },
  { header: 'Écoles', key: 'schoolCount', width: 10 },
  { header: 'Taux moyen redoublement', key: 'avgRedoublementRatePct', width: 24 },
  { header: '% absences', key: 'absencesRatePct', width: 14 },
  { header: '% notes', key: 'notesRatePct', width: 12 },
  { header: '% mixte', key: 'mixteRatePct', width: 12 },
  { header: 'Efficace (<10%)', key: 'efficientLabel', width: 16 },
];

function planRedoublementExportRows(stats) {
  return (stats.plans || []).map((p) => ({
    planName: p.planName,
    schoolCount: p.schoolCount,
    avgRedoublementRatePct: `${Math.round((p.avgRedoublementRate || 0) * 100)}%`,
    absencesRatePct: `${Math.round((p.absencesRate || 0) * 100)}%`,
    notesRatePct: `${Math.round((p.notesRate || 0) * 100)}%`,
    mixteRatePct: `${Math.round((p.mixteRate || 0) * 100)}%`,
    efficientLabel: p.efficient ? 'Oui' : 'Non',
  }));
}

/**
 * Export comparatif redoublement par plan — PDF (super admin).
 */
async function generateRedoublementByPlanPDF(schoolYear) {
  if (!schoolYear) return { ok: false, error: 'year' };

  const { getRedoublementCausesByPlan } = require('./RedoublementService');
  const { ABSENCE_THRESHOLD, GRADE_THRESHOLD } = require('./ReinscriptionService');
  const stats = await getRedoublementCausesByPlan(schoolYear);
  if (!stats.ok) return { ok: false, error: stats.error || 'stats' };

  ensureDir(EXPORTS_DIR);
  const filename = `redoublement-par-plan-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    doc.fontSize(16).fillColor('#222').text('Redoublement par formule d\'abonnement', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Année scolaire : ${schoolYear}`);
    doc.text(`Seuils causes : absences > ${ABSENCE_THRESHOLD} jours, moyenne < ${GRADE_THRESHOLD}/20`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('Plan', 50, tableTop);
    doc.text('Taux moy.', 160, tableTop);
    doc.text('% abs.', 230, tableTop);
    doc.text('% notes', 290, tableTop);
    doc.text('% mixte', 360, tableTop);
    doc.text('Efficace', 430, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    const rows = planRedoublementExportRows(stats);
    if (!rows.length) {
      doc.fontSize(11).fillColor('#666').text('Aucune donnée pour cette année.', 50, y);
    } else {
      rows.forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(10).fillColor('#333');
        doc.text(row.planName, 50, y, { width: 100 });
        doc.text(row.avgRedoublementRatePct, 160, y);
        doc.text(row.absencesRatePct, 230, y);
        doc.text(row.notesRatePct, 290, y);
        doc.text(row.mixteRatePct, 360, y);
        doc.text(row.efficientLabel, 430, y);
        y += 20;
      });
    }
    doc.y = y + 12;
    doc.fontSize(9).fillColor('#999').text('EduConnect — analyse redoublement par plan', 50, doc.page.height - 40, { align: 'left' });
  });

  return { ok: true, ...saved };
}

/**
 * Export comparatif redoublement par plan — Excel (super admin).
 */
async function generateRedoublementByPlanExcel(schoolYear) {
  if (!schoolYear) return { ok: false, error: 'year' };

  const { getRedoublementCausesByPlan } = require('./RedoublementService');
  const stats = await getRedoublementCausesByPlan(schoolYear);
  if (!stats.ok) return { ok: false, error: stats.error || 'stats' };

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Redoublement par plan');
  ws.columns = PLAN_REDOUBLEMENT_COLUMNS;
  planRedoublementExportRows(stats).forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `redoublement-par-plan-${schoolYear.replace(/\s+/g, '-')}-${Date.now()}.xlsx`;
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

const TIMETABLE_COLUMNS = [
  { header: 'Jour', key: 'dayOfWeek', width: 14 },
  { header: 'Début', key: 'startTime', width: 10 },
  { header: 'Fin', key: 'endTime', width: 10 },
  { header: 'Matière', key: 'subject', width: 22 },
  { header: 'Enseignant', key: 'teacher', width: 24 },
  { header: 'Classe', key: 'className', width: 18 },
];

function timetableExportRows(entries) {
  return (entries || []).map((e) => ({
    dayOfWeek: e.dayOfWeek,
    startTime: e.startTime,
    endTime: e.endTime,
    subject: e.subject?.name || '—',
    teacher: e.teacher?.user
      ? `${e.teacher.user.lastName} ${e.teacher.user.firstName}`
      : '—',
    className: e.class?.name || '—',
  }));
}

/**
 * Emploi du temps PDF (élève ou classe).
 */
async function generateTimetablePDF(targetId, { mode = 'student' } = {}) {
  if (!targetId) return { ok: false, error: 'target' };

  let title = 'Emploi du temps';
  let school = null;
  let entries = [];
  let subtitle = '';

  if (mode === 'class') {
    const cls = await prisma.class.findUnique({
      where: { id: targetId },
      include: { school: true },
    });
    if (!cls) return { ok: false, error: 'class' };
    school = cls.school;
    subtitle = `Classe ${cls.name} (${cls.level})`;
    const { getClassTimetable } = require('./TimetableService');
    const result = await getClassTimetable(targetId);
    entries = result.entries || [];
  } else {
    const student = await prisma.student.findUnique({
      where: { id: targetId },
      include: { class: { include: { school: true } }, school: true },
    });
    if (!student) return { ok: false, error: 'student' };
    school = student.school || student.class?.school;
    subtitle = `${student.lastName} ${student.firstName} — ${student.class?.name || '—'}`;
    const { getStudentTimetable } = require('./TimetableService');
    const result = await getStudentTimetable(targetId);
    entries = result.entries || [];
  }

  ensureDir(EXPORTS_DIR);
  const filename = `emploi-du-temps-${targetId.slice(0, 8)}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, { title });
    doc.fontSize(11).fillColor('#333').text(subtitle);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('Jour', 50, tableTop);
    doc.text('Horaire', 130, tableTop);
    doc.text('Matière', 220, tableTop);
    doc.text('Enseignant', 340, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    if (!entries.length) {
      doc.fontSize(11).fillColor('#666').text('Aucun créneau enregistré.', 50, y);
    } else {
      timetableExportRows(entries).forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(10).fillColor('#333');
        doc.text(row.dayOfWeek, 50, y);
        doc.text(`${row.startTime} – ${row.endTime}`, 130, y);
        doc.text(row.subject, 220, y, { width: 110 });
        doc.text(row.teacher, 340, y, { width: 200 });
        y += 20;
      });
    }
    doc.y = y + 12;
    drawFooter(doc, school);
  });

  return {
    ok: true,
    ...saved,
    entries,
  };
}

/**
 * Emploi du temps Excel (classe).
 */
async function generateTimetableExcel(classId) {
  if (!classId) return { ok: false, error: 'class' };

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { school: true },
  });
  if (!cls) return { ok: false, error: 'class' };

  const { getClassTimetable } = require('./TimetableService');
  const result = await getClassTimetable(classId);
  const entries = result.entries || [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduConnect';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Emploi du temps');
  ws.columns = TIMETABLE_COLUMNS;
  timetableExportRows(entries).forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `emploi-du-temps-${classId.slice(0, 8)}-${Date.now()}.xlsx`;
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

const HOMEWORK_COLUMNS = [
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Type', key: 'kind', width: 12 },
  { header: 'Matière', key: 'subject', width: 20 },
  { header: 'Titre', key: 'title', width: 28 },
  { header: 'Classe', key: 'className', width: 16 },
  { header: 'Enseignant', key: 'teacher', width: 24 },
  { header: 'Consignes', key: 'description', width: 40 },
];

function homeworkExportRows(list) {
  const { homeworkExportRows: rowsFromList } = require('../src/services/homeworkService');
  return rowsFromList(list);
}

async function loadSchoolHomeworks(schoolId) {
  if (!schoolId) return { ok: false, error: 'school' };
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: 'school' };
  const list = await prisma.homework.findMany({
    where: { class: { schoolId } },
    include: {
      class: true,
      teacher: { include: { user: true } },
    },
    orderBy: { dueDate: 'asc' },
  });
  return { ok: true, school, list };
}

/**
 * Calendrier devoirs / contrôles — PDF affichage mural.
 */
async function generateHomeworkCalendarPDF(schoolId) {
  const loaded = await loadSchoolHomeworks(schoolId);
  if (!loaded.ok) return loaded;
  const { school, list } = loaded;
  const { summarizeHomeworkStats } = require('../src/services/homeworkService');
  const stats = summarizeHomeworkStats(list);

  ensureDir(EXPORTS_DIR);
  const filename = `devoirs-controles-${schoolId.slice(0, 8)}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, { title: 'Devoirs & contrôles' });
    doc.fontSize(11).fillColor('#333');
    doc.text(`${stats.total} publication(s) — ${stats.homework} devoir(s), ${stats.test} contrôle(s)`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#666');
    doc.text('Date', 50, tableTop);
    doc.text('Type', 120, tableTop);
    doc.text('Matière', 190, tableTop);
    doc.text('Classe', 310, tableTop);
    doc.text('Titre', 390, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ddd');

    let y = tableTop + 25;
    const rows = homeworkExportRows(list);
    if (!rows.length) {
      doc.fontSize(11).fillColor('#666').text('Aucun devoir ni contrôle.', 50, y);
    } else {
      rows.forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(11).fillColor('#333');
        doc.text(row.date, 50, y, { width: 65 });
        doc.text(row.kind, 120, y, { width: 65 });
        doc.text(row.subject, 190, y, { width: 115 });
        doc.text(row.className, 310, y, { width: 75 });
        doc.text(row.title, 390, y, { width: 160 });
        y += 22;
      });
    }
    doc.y = y + 12;
    drawFooter(doc, school);
  });

  return { ok: true, ...saved };
}

/**
 * Calendrier devoirs / contrôles — Excel (partage direction).
 */
async function generateHomeworkCalendarExcel(schoolId) {
  const loaded = await loadSchoolHomeworks(schoolId);
  if (!loaded.ok) return loaded;
  const { list } = loaded;
  const { summarizeHomeworkStats } = require('../src/services/homeworkService');
  const stats = summarizeHomeworkStats(list);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EduConnect';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Devoirs et contrôles');
  ws.columns = HOMEWORK_COLUMNS;
  homeworkExportRows(list).forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };

  const statsSheet = workbook.addWorksheet('Statistiques');
  statsSheet.columns = [
    { header: 'Matière', key: 'subject', width: 24 },
    { header: 'Devoirs', key: 'homework', width: 12 },
    { header: 'Contrôles', key: 'test', width: 12 },
    { header: 'Total', key: 'total', width: 10 },
  ];
  stats.bySubject.forEach((row) => statsSheet.addRow(row));
  statsSheet.addRow({ subject: 'TOTAL', homework: stats.homework, test: stats.test, total: stats.total });
  statsSheet.getRow(1).font = { bold: true };

  ensureDir(EXPORTS_DIR);
  const filename = `devoirs-controles-${schoolId.slice(0, 8)}-${Date.now()}.xlsx`;
  const filepath = path.join(EXPORTS_DIR, filename);
  await workbook.xlsx.writeFile(filepath);

  return {
    ok: true,
    filepath,
    filename,
    url: `/uploads/exports/${filename}`,
    workbook,
    stats,
  };
}

function fcfa(amount) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
}

async function generateAccountingReportPdf({
  school, periodLabel, totals, income, expense, byCategory,
} = {}) {
  if (!school) return { ok: false, error: 'school' };

  ensureDir(EXPORTS_DIR);
  const slug = String(periodLabel || 'periode').replace(/[^\wÀ-ÿ-]+/g, '-').slice(0, 40);
  const filename = `comptabilite-educonnect-${slug}-${Date.now()}.pdf`;
  const filepath = path.join(EXPORTS_DIR, filename);

  const saved = await writePdf(filepath, (doc) => {
    drawDocumentHeader(doc, school, {
      title: 'Rapport comptable',
      subtitle: periodLabel ? `${periodLabel} · EduConnect` : 'EduConnect',
    });

    doc.fontSize(11).fillColor('#333');
    doc.text(`Recettes : ${fcfa(totals?.totalIn)}`);
    doc.text(`Dépenses : ${fcfa(totals?.totalOut)}`);
    doc.text(`Résultat net : ${fcfa(totals?.net)}`);
    doc.moveDown();

    if (byCategory?.length) {
      doc.fontSize(12).fillColor('#0052CC').text('Par catégorie');
      doc.moveDown(0.4);
      byCategory.forEach((cat) => {
        const kind = cat.kind === 'INCOME' ? 'Recette' : 'Dépense';
        doc.fontSize(10).fillColor('#333').text(`${cat.name} (${kind}) — ${fcfa(cat.amount)}`);
      });
      doc.moveDown();
    }

    const writeLines = (title, rows) => {
      doc.fontSize(12).fillColor('#0052CC').text(title);
      doc.moveDown(0.3);
      if (!rows?.length) {
        doc.fontSize(10).fillColor('#666').text('Aucune ligne.');
        doc.moveDown();
        return;
      }
      rows.slice(0, 40).forEach((row) => {
        if (doc.y > 740) doc.addPage();
        const date = row.createdAt ? new Date(row.createdAt).toLocaleDateString('fr-FR') : '';
        const cat = row.category?.name || '';
        doc.fontSize(9).fillColor('#333').text(
          `${date}  ${row.description || ''}  ${cat}  ${fcfa(row.amount)}`,
        );
      });
      doc.moveDown();
    };

    writeLines('Recettes', income);
    writeLines('Dépenses', expense);

    doc.fontSize(8).fillColor('#999').text('Document EduConnect — à usage interne de l\'établissement.', { align: 'center' });
  });

  return { ok: true, ...saved };
}

module.exports = {
  generateBulletinPDF,
  generatePayrollPDF,
  generateStatsExcel,
  generateGenderStatsExcel,
  generateGenderStatsPDF,
  generateClassGenderStatsExcel,
  generateClassGenderStatsPdf,
  generateReinscriptionPDF,
  generateReinscriptionExcel,
  generateRedoublementCausesPDF,
  generateRedoublementCausesExcel,
  generateGroupRedoublementCausesPDF,
  generateGroupRedoublementCausesExcel,
  generateRedoublementByPlanPDF,
  generateRedoublementByPlanExcel,
  parseMonth,
  generateTimetablePDF,
  generateTimetableExcel,
  generateHomeworkCalendarPDF,
  generateHomeworkCalendarExcel,
  homeworkExportRows,
  generateAccountingReportPdf,
};
