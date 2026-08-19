const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const prisma = require('../config/database');
const { drawDocumentHeader } = require('../utils/schoolLogo');
const { formatTermLabel, normalizeTerm } = require('./academicTerms');
const { parseSeries, matchesSeriesFilter, classHasSeries, seriesLabel } = require('./series');

const SHEET_KINDS = [
  { value: 'COMPOSITION', label: 'Composition' },
  { value: 'DEVOIR', label: 'Devoir' },
  { value: 'INTERRO', label: 'Interrogation' },
  { value: 'APPEL', label: 'Appel du jour' },
];

const KIND_LABELS = {
  COMPOSITION: 'Composition',
  DEVOIR: 'Devoir',
  INTERRO: 'Interrogation',
  APPEL: 'Appel du jour',
};

const pdfDir = path.join(__dirname, '../../uploads/emargements');

function ensurePdfDir() {
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseKind(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (KIND_LABELS[upper]) return upper;
  const f = fold(raw);
  if (!f) return 'COMPOSITION';
  if (f === 'appel' || f.includes('appel') || f === 'presence' || f.includes('emargement quotidien')) {
    return 'APPEL';
  }
  if (f.includes('interro')) return 'INTERRO';
  if (f === 'devoir' || f === 'devoirs' || f.includes('controle')) return 'DEVOIR';
  if (f.includes('compo') || f === 'examen' || f.includes('examen')) return 'COMPOSITION';
  return 'COMPOSITION';
}

function kindLabel(kind) {
  return KIND_LABELS[parseKind(kind)] || KIND_LABELS.COMPOSITION;
}

function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Abidjan' }).format(now);
}

function formatDateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseSheetDate(raw, now = new Date()) {
  const s = String(raw || '').trim();
  if (!s) {
    const iso = todayIso(now);
    return { ok: true, iso, label: formatDateFr(iso) };
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (isoMatch) {
    const iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'date' };
    return { ok: true, iso, label: formatDateFr(iso) };
  }

  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (fr) {
    const iso = `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'date' };
    return { ok: true, iso, label: formatDateFr(iso) };
  }

  return { ok: false, error: 'date' };
}

function genderCell(gender) {
  const g = String(gender || '').trim().toUpperCase();
  if (g === 'M') return 'G';
  if (g === 'F') return 'F';
  return '—';
}

function genderCounts(students) {
  let boys = 0;
  let girls = 0;
  let unknown = 0;
  (students || []).forEach((s) => {
    const g = String(s.gender || '').trim().toUpperCase();
    if (g === 'M') boys += 1;
    else if (g === 'F') girls += 1;
    else unknown += 1;
  });
  return { boys, girls, unknown, total: (students || []).length };
}

function buildRows(students) {
  const sorted = [...(students || [])].sort((a, b) => {
    const last = String(a.lastName || '').localeCompare(String(b.lastName || ''), 'fr', { sensitivity: 'base' });
    if (last !== 0) return last;
    return String(a.firstName || '').localeCompare(String(b.firstName || ''), 'fr', { sensitivity: 'base' });
  });
  return sorted.map((s, i) => ({
    n: i + 1,
    studentId: s.id,
    lastName: s.lastName || '',
    firstName: s.firstName || '',
    matricule: s.matricule || '',
    gender: s.gender || null,
    genderCell: genderCell(s.gender),
  }));
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

function parseTerm(raw, kind) {
  if (parseKind(kind) === 'APPEL') return '';
  const s = String(raw || '').trim();
  if (!s) return 'T1';
  const term = normalizeTerm(s);
  return term === 'AUTRE' ? '' : term;
}

function sheetTitle(kind) {
  return `Liste d’émargement — ${kindLabel(kind)}`;
}

function sheetSubtitle({ klass, dateLabel, kind, subject, term, series, room, schoolYear }) {
  const parts = [
    klass?.name,
    klass?.series ? seriesLabel(klass.series) : null,
    series ? `filtre ${seriesLabel(series)}` : null,
    dateLabel,
    parseKind(kind) !== 'APPEL' && subject ? subject : null,
    term ? formatTermLabel(term) : null,
    room ? `Salle ${room}` : null,
    schoolYear || null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function queryString(params) {
  const q = new URLSearchParams();
  if (params.classId) q.set('classId', params.classId);
  if (params.date) q.set('date', params.date);
  if (params.kind) q.set('kind', params.kind);
  if (params.subject) q.set('subject', params.subject);
  if (params.term) q.set('term', params.term);
  if (params.series) q.set('series', params.series);
  if (params.room) q.set('room', params.room);
  return q.toString();
}

async function getSheet({
  schoolId,
  classId,
  date,
  kind,
  subject,
  term,
  series,
  room,
} = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };
  const cid = String(classId || '').trim();
  if (!cid) return { ok: false, error: 'class' };

  const parsedDate = parseSheetDate(date);
  if (!parsedDate.ok) return { ok: false, error: 'date' };

  const klass = await prisma.class.findFirst({
    where: { id: cid, schoolId },
  });
  if (!klass) return { ok: false, error: 'forbidden', status: 403 };

  const students = await prisma.student.findMany({
    where: { classId: klass.id, schoolId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      matricule: true,
      gender: true,
      series: true,
    },
  });

  const seriesFilter = parseSeries(series);
  const filtered = students.filter((s) => matchesSeriesFilter(s, klass, seriesFilter));
  const rows = buildRows(filtered);
  const parsedKind = parseKind(kind);
  const parsedTerm = parseTerm(term, parsedKind);
  const subjectName = clip(subject, 80);
  const roomName = clip(room, 40);

  return {
    ok: true,
    class: klass,
    rows,
    date: parsedDate,
    kind: parsedKind,
    subject: subjectName,
    term: parsedTerm,
    room: roomName,
    series: seriesFilter || '',
    hasSeries: classHasSeries(klass, students),
    counts: genderCounts(filtered),
    title: sheetTitle(parsedKind),
    subtitle: sheetSubtitle({
      klass,
      dateLabel: parsedDate.label,
      kind: parsedKind,
      subject: subjectName,
      term: parsedTerm,
      series: seriesFilter,
      room: roomName,
      schoolYear: klass.schoolYear,
    }),
  };
}

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'classe';
}

function generateEmargementPdf({ school, sheet }) {
  ensurePdfDir();
  const filename = `emargement-${safeFilePart(sheet.class?.name)}-${sheet.date.iso}.pdf`;
  const filepath = path.join(pdfDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    drawDocumentHeader(doc, school, {
      title: sheet.title,
      subtitle: sheet.subtitle,
    });

    doc.fontSize(9).fillColor('#666');
    doc.text('Cocher Présent / Absent le jour J. Signature de l’élève à l’entrée. Le surveillant et la direction signent en bas.');
    doc.moveDown(0.5);

    const cols = [
      { key: 'n', label: 'N°', x: 40, w: 28 },
      { key: 'lastName', label: 'Nom', x: 68, w: 92 },
      { key: 'firstName', label: 'Prénom', x: 160, w: 80 },
      { key: 'matricule', label: 'Matricule', x: 240, w: 72 },
      { key: 'genderCell', label: 'G/F', x: 312, w: 28 },
      { key: 'presence', label: 'Présence', x: 340, w: 70 },
      { key: 'signature', label: 'Signature', x: 410, w: 80 },
      { key: 'note', label: 'Obs.', x: 490, w: 65 },
    ];

    function drawHeader(y) {
      doc.fontSize(8).fillColor('#666');
      cols.forEach((c) => doc.text(c.label, c.x, y, { width: c.w }));
      doc.moveTo(40, y + 12).lineTo(555, y + 12).stroke('#ddd');
    }

    let y = doc.y;
    drawHeader(y);
    y += 16;

    (sheet.rows || []).forEach((row) => {
      if (y > 720) {
        doc.addPage();
        y = 50;
        drawHeader(y);
        y += 16;
      }
      doc.fillColor('#333').fontSize(8);
      doc.text(String(row.n), cols[0].x, y, { width: cols[0].w });
      doc.text(row.lastName, cols[1].x, y, { width: cols[1].w });
      doc.text(row.firstName, cols[2].x, y, { width: cols[2].w });
      doc.text(row.matricule || '—', cols[3].x, y, { width: cols[3].w });
      doc.text(row.genderCell, cols[4].x, y, { width: cols[4].w });
      doc.rect(cols[5].x + 4, y - 1, 10, 10).stroke('#999');
      doc.fontSize(7).fillColor('#888').text('P', cols[5].x + 16, y, { width: 12 });
      doc.rect(cols[5].x + 30, y - 1, 10, 10).stroke('#999');
      doc.text('A', cols[5].x + 42, y, { width: 12 });
      doc.moveTo(cols[6].x, y + 10).lineTo(cols[6].x + cols[6].w - 4, y + 10).stroke('#ccc');
      y += 20;
    });

    y = Math.max(doc.y, y + 16);
    if (y > 700) {
      doc.addPage();
      y = 50;
    }

    const counts = sheet.counts || { total: 0, boys: 0, girls: 0 };
    doc.fontSize(9).fillColor('#333');
    doc.text(
      `Effectif : ${counts.total}  ·  Garçons : ${counts.boys}  ·  Filles : ${counts.girls}  ·  Présents : ______  ·  Absents : ______`,
      40,
      y,
      { width: 515 },
    );
    y += 36;
    doc.fontSize(9).fillColor('#666');
    doc.text('Signature du surveillant', 40, y, { width: 200 });
    doc.text('Visa de la direction', 320, y, { width: 200 });
    doc.moveTo(40, y + 40).lineTo(220, y + 40).stroke('#ccc');
    doc.moveTo(320, y + 40).lineTo(500, y + 40).stroke('#ccc');

    doc.fontSize(8).fillColor('#999').text(
      `Document officiel — ${school.name} — EduConnect`,
      40,
      y + 56,
      { align: 'center', width: 515 },
    );

    doc.end();
    stream.on('finish', () => resolve({ pdfUrl: `/uploads/emargements/${filename}`, filepath, filename }));
    stream.on('error', reject);
  });
}

module.exports = {
  SHEET_KINDS,
  KIND_LABELS,
  parseKind,
  kindLabel,
  todayIso,
  formatDateFr,
  parseSheetDate,
  genderCell,
  genderCounts,
  buildRows,
  parseTerm,
  sheetTitle,
  sheetSubtitle,
  queryString,
  getSheet,
  generateEmargementPdf,
};
