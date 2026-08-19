const prisma = require('../config/database');
const { drawDocumentHeader } = require('../utils/schoolLogo');
const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const { formatTermLabel, normalizeTerm } = require('./academicTerms');
const { parseSheetDate, todayIso, formatDateFr, buildRows } = require('./emargementService');

const EXAM_TYPES = [
  { value: 'BLANC', label: 'Examen blanc' },
  { value: 'NATIONAL', label: 'Examen national' },
];

const EXAM_TYPE_LABELS = {
  BLANC: 'Examen blanc',
  NATIONAL: 'Examen national',
};

function parseExamType(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (EXAM_TYPE_LABELS[upper]) return upper;
  const f = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (f.includes('national')) return 'NATIONAL';
  if (f.includes('blanc')) return 'BLANC';
  return '';
}

function examTypeLabel(type) {
  return EXAM_TYPE_LABELS[parseExamType(type)] || '';
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

function parseTime(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, value: '' };
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return { ok: false, error: 'time' };
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return { ok: false, error: 'time' };
  return { ok: true, value: `${String(h).padStart(2, '0')}:${m[2]}` };
}

function formatTimeFr(raw) {
  const parsed = parseTime(raw);
  if (!parsed.ok || !parsed.value) return '';
  const [h, min] = parsed.value.split(':');
  return `${h} h ${min}`;
}

function parseTerm(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'T1';
  const term = normalizeTerm(s);
  return term === 'AUTRE' ? '' : term;
}

function sessionTitle(examType) {
  return `Convocation — ${examTypeLabel(examType) || 'Examen'}`;
}

function convocationTexts({ school, session, student, klass } = {}) {
  const typeLabel = examTypeLabel(session?.examType);
  const dateLabel = session?.dateLabel || formatDateFr(session?.dateIso) || '';
  const timeLabel = formatTimeFr(session?.startTime);
  return {
    brand: 'EduConnect',
    title: sessionTitle(session?.examType),
    examType: parseExamType(session?.examType),
    examTypeLabel: typeLabel,
    schoolName: school?.name || '',
    studentName: `${student?.lastName || ''} ${student?.firstName || ''}`.trim(),
    className: klass?.name || session?.class?.name || student?.class?.name || '',
    matriculeEcole: student?.matricule || '—',
    matriculeNational: student?.nationalMatricule || '—',
    subject: session?.subject || '—',
    dateLabel: dateLabel || '—',
    timeLabel: timeLabel || '—',
    room: session?.room ? `Salle ${session.room}` : '—',
    termLabel: session?.term ? formatTermLabel(session.term) : '—',
    intro: typeLabel
      ? `Vous êtes convoqué(e) à l’${typeLabel.toLowerCase()} ci-dessous. Présentez-vous avec cette convocation.`
      : 'Vous êtes convoqué(e) à l’examen ci-dessous. Présentez-vous avec cette convocation.',
  };
}

function toSessionView(session) {
  if (!session) return null;
  const iso = session.date instanceof Date
    ? session.date.toISOString().slice(0, 10)
    : String(session.date || '').slice(0, 10);
  return {
    id: session.id,
    schoolId: session.schoolId,
    classId: session.classId,
    class: session.class || null,
    subject: session.subject,
    examType: session.examType,
    examTypeLabel: examTypeLabel(session.examType),
    dateIso: iso,
    dateLabel: formatDateFr(iso),
    startTime: session.startTime || '',
    timeLabel: formatTimeFr(session.startTime),
    room: session.room || '',
    term: session.term || '',
    termLabel: session.term ? formatTermLabel(session.term) : '',
    createdAt: session.createdAt,
    title: sessionTitle(session.examType),
  };
}

async function listSessions(schoolId) {
  if (!schoolId) return [];
  const rows = await prisma.examSession.findMany({
    where: { schoolId },
    include: { class: { select: { id: true, name: true, schoolYear: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 40,
  });
  return rows.map(toSessionView);
}

async function getSession({ schoolId, id } = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };
  const sid = String(id || '').trim();
  if (!sid) return { ok: false, error: 'session' };

  const session = await prisma.examSession.findFirst({
    where: { id: sid, schoolId },
    include: { class: true },
  });
  if (!session) return { ok: false, error: 'forbidden', status: 403 };

  const students = await prisma.student.findMany({
    where: { classId: session.classId, schoolId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      matricule: true,
      nationalMatricule: true,
      gender: true,
      series: true,
    },
  });

  const rows = buildRows(students);
  const view = toSessionView(session);
  return {
    ok: true,
    session: view,
    class: session.class,
    rows,
  };
}

async function createSession({
  schoolId,
  classId,
  subject,
  examType,
  date,
  startTime,
  room,
  term,
  createdBy,
} = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };
  const cid = String(classId || '').trim();
  if (!cid) return { ok: false, error: 'class' };

  const klass = await prisma.class.findFirst({ where: { id: cid, schoolId } });
  if (!klass) return { ok: false, error: 'forbidden', status: 403 };

  const parsedType = parseExamType(examType);
  if (!parsedType) return { ok: false, error: 'examType' };

  const parsedDate = parseSheetDate(date);
  if (!parsedDate.ok) return { ok: false, error: 'date' };

  const parsedTime = parseTime(startTime);
  if (!parsedTime.ok) return parsedTime;

  const subjectName = clip(subject, 80);
  if (!subjectName) return { ok: false, error: 'subject' };

  const created = await prisma.examSession.create({
    data: {
      schoolId,
      classId: klass.id,
      subject: subjectName,
      examType: parsedType,
      date: new Date(`${parsedDate.iso}T12:00:00`),
      startTime: parsedTime.value || null,
      room: clip(room, 40) || null,
      term: parseTerm(term) || null,
      createdBy: createdBy || null,
    },
    include: { class: true },
  });

  return { ok: true, session: toSessionView(created) };
}

async function getPrintBundle({ schoolId, id, studentId } = {}) {
  const sheet = await getSession({ schoolId, id });
  if (!sheet.ok) return sheet;

  let rows = sheet.rows;
  if (studentId) {
    rows = rows.filter((r) => r.studentId === String(studentId));
    if (!rows.length) return { ok: false, error: 'student' };
  }

  return {
    ok: true,
    session: sheet.session,
    class: sheet.class,
    rows,
  };
}

async function getParentConvocations(parentId) {
  if (!parentId) return [];
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
          nationalMatricule: true,
          classId: true,
          class: { select: { id: true, name: true, schoolId: true, school: { select: { id: true, name: true, logoUrl: true, logoBase64: true } } } },
        },
      },
    },
  });

  const classIds = [...new Set(links.map((l) => l.student.classId).filter(Boolean))];
  if (!classIds.length) return [];

  const sessions = await prisma.examSession.findMany({
    where: { classId: { in: classIds } },
    include: { class: { select: { id: true, name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 60,
  });

  return links.map((link) => ({
    student: link.student,
    sessions: sessions
      .filter((s) => s.classId === link.student.classId)
      .map(toSessionView),
  }));
}

async function getParentPrintBundle({ parentId, id, studentId } = {}) {
  if (!parentId) return { ok: false, error: 'forbidden', status: 403 };
  const sid = String(id || '').trim();
  if (!sid) return { ok: false, error: 'session' };

  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
          nationalMatricule: true,
          classId: true,
          schoolId: true,
          class: true,
        },
      },
    },
  });

  const allowed = links
    .map((l) => l.student)
    .filter((s) => !studentId || s.id === String(studentId));
  if (!allowed.length) return { ok: false, error: 'forbidden', status: 403 };

  const session = await prisma.examSession.findFirst({
    where: {
      id: sid,
      classId: { in: allowed.map((s) => s.classId) },
    },
    include: { class: true, school: true },
  });
  if (!session) return { ok: false, error: 'forbidden', status: 403 };

  const pupils = allowed.filter((s) => s.classId === session.classId);
  if (!pupils.length) return { ok: false, error: 'forbidden', status: 403 };

  return {
    ok: true,
    session: toSessionView(session),
    class: session.class,
    school: session.school,
    rows: buildRows(pupils),
  };
}

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'convocation';
}

function drawOneConvocation(doc, { school, session, student, klass }) {
  const texts = convocationTexts({ school, session, student, klass });
  drawDocumentHeader(doc, school, {
    title: texts.title,
    subtitle: texts.examTypeLabel,
  });

  doc.fontSize(10).fillColor('#333');
  doc.text(texts.intro, { width: 500 });
  doc.moveDown();

  doc.fontSize(12).fillColor('#0052CC').text('Élève');
  doc.fontSize(11).fillColor('#333');
  doc.text(`Nom : ${texts.studentName || '—'}`);
  doc.text(`Classe : ${texts.className || '—'}`);
  doc.text(`Matricule école : ${texts.matriculeEcole}`);
  doc.text(`Matricule national : ${texts.matriculeNational}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#0052CC').text(texts.examTypeLabel || 'Examen');
  doc.fontSize(11).fillColor('#333');
  doc.text(`Type : ${texts.examTypeLabel || '—'}`);
  doc.text(`Matière : ${texts.subject}`);
  doc.text(`Date : ${texts.dateLabel}`);
  doc.text(`Heure : ${texts.timeLabel}`);
  doc.text(`Salle : ${texts.room}`);
  doc.text(`Trimestre : ${texts.termLabel}`);
  doc.moveDown(2);

  doc.fontSize(9).fillColor('#666').text('Visa de la direction', { width: 220 });
  doc.moveTo(50, doc.y + 36).lineTo(250, doc.y + 36).stroke('#ccc');
  doc.moveDown(4);
  doc.fontSize(9).fillColor('#999').text(
    `Document officiel — ${texts.schoolName} — ${texts.brand}`,
    { align: 'center' },
  );
}

async function generateConvocationPdf({ school, session, klass, rows, outputDir }) {
  const who = rows.length === 1
    ? safeFilePart(`${rows[0].lastName}-${rows[0].firstName}`)
    : safeFilePart(klass?.name);
  const filename = `convocation-${examTypeLabel(session.examType).replace(/\s+/g, '-').toLowerCase()}-${who}-${session.dateIso}.pdf`;

  const buffer = await renderPdfToBuffer((doc) => {
    rows.forEach((row, index) => {
      if (index > 0) doc.addPage();
      drawOneConvocation(doc, { school, session, student: row, klass });
    });
  }, { size: 'A4', compress: false });

  return savePdfBuffer({ folder: 'convocations', filename, buffer, outputDir });
}

module.exports = {
  EXAM_TYPES,
  EXAM_TYPE_LABELS,
  parseExamType,
  examTypeLabel,
  parseTime,
  formatTimeFr,
  todayIso,
  sessionTitle,
  convocationTexts,
  toSessionView,
  listSessions,
  getSession,
  createSession,
  getPrintBundle,
  getParentConvocations,
  getParentPrintBundle,
  generateConvocationPdf,
};
