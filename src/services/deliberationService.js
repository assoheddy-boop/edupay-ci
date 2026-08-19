const prisma = require('../config/database');
const { drawDocumentHeader } = require('../utils/schoolLogo');
const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const { TERMS, formatTermLabel, normalizeTerm, filterGradesForBulletin } = require('./academicTerms');
const { computeWeightedAverage, loadSchoolCoefficients, round2 } = require('./gradesAverage');
const { attachClassement, formatRankCompact } = require('./classement');
const { SERIES_OPTIONS, parseSeries, effectiveSeries, matchesSeriesFilter, classHasSeries, seriesLabel } = require('./series');

const MENTIONS = ['Passable', 'Assez bien', 'Bien', 'Très bien', 'Excellent'];
const DECISIONS = ['Admis', 'Ajourné', 'Redouble', 'À surveiller'];

/**
 * Seuils CI (bulletin / conseil de classe), moyenne pondérée /20.
 * La direction peut tout écraser à l’enregistrement.
 *
 * Mention :
 *   < 10           → (aucune)
 *   10 ≤ m < 12    → Passable
 *   12 ≤ m < 14    → Assez bien
 *   14 ≤ m < 16    → Bien
 *   16 ≤ m < 18    → Très bien
 *   ≥ 18           → Excellent
 *
 * Décision suggérée :
 *   pas de notes   → À surveiller
 *   < 10           → Ajourné
 *   ≥ 10           → Admis
 * Redouble n’est jamais auto-suggéré (choix direction).
 */
const THRESHOLDS = [
  { min: 18, mention: 'Excellent', decision: 'Admis' },
  { min: 16, mention: 'Très bien', decision: 'Admis' },
  { min: 14, mention: 'Bien', decision: 'Admis' },
  { min: 12, mention: 'Assez bien', decision: 'Admis' },
  { min: 10, mention: 'Passable', decision: 'Admis' },
  { min: 0, mention: null, decision: 'Ajourné' },
];

function suggestFromAverage(average, { hasGrades = true } = {}) {
  if (!hasGrades || average == null || !Number.isFinite(Number(average))) {
    return { mention: null, decision: 'À surveiller' };
  }
  const m = Number(average);
  const row = THRESHOLDS.find((t) => m >= t.min) || THRESHOLDS[THRESHOLDS.length - 1];
  return { mention: row.mention, decision: row.decision };
}

function normalizeMention(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return MENTIONS.includes(raw) ? raw : null;
}

function normalizeDecision(value) {
  const raw = String(value || '').trim();
  if (DECISIONS.includes(raw)) return raw;
  return null;
}

function termDateRange(schoolYear, term) {
  const match = String(schoolYear || '').trim().match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  const startY = match ? parseInt(match[1], 10) : new Date().getFullYear();
  if (term === 'T1') {
    return { start: new Date(startY, 8, 1), end: new Date(startY, 11, 31, 23, 59, 59, 999) };
  }
  if (term === 'T2') {
    return { start: new Date(startY + 1, 0, 1), end: new Date(startY + 1, 2, 31, 23, 59, 59, 999) };
  }
  if (term === 'T3') {
    return { start: new Date(startY + 1, 3, 1), end: new Date(startY + 1, 6, 31, 23, 59, 59, 999) };
  }
  return null;
}

function countAbsences(absences, range) {
  const list = Array.isArray(absences) ? absences : [];
  return list.filter((a) => {
    if (a.type && a.type !== 'ABSENCE') return false;
    if (!range) return true;
    const d = new Date(a.date);
    return d >= range.start && d <= range.end;
  }).length;
}

function councilRow({ student, grades, absences, saved, coeffMap, term, range, klass }) {
  const termGrades = filterGradesForBulletin(grades, term);
  const hasGrades = termGrades.length > 0;
  const average = hasGrades ? computeWeightedAverage(termGrades, coeffMap) : null;
  const suggested = suggestFromAverage(average, { hasGrades });
  const absenceCount = countAbsences(absences, range);
  return {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    matricule: student.matricule || '',
    gender: student.gender || null,
    series: effectiveSeries(student, klass || student.class),
    average,
    hasGrades,
    absences: absenceCount,
    suggestedMention: suggested.mention,
    suggestedDecision: suggested.decision,
    mention: saved?.mention ?? suggested.mention,
    decision: saved?.decision ?? suggested.decision,
    comment: saved?.comment || '',
    saved: Boolean(saved),
  };
}

async function getClassForSchool(schoolId, classId) {
  if (!schoolId || !classId) return null;
  return prisma.class.findFirst({
    where: { id: String(classId), schoolId },
    include: { school: true },
  });
}

async function getCouncilBoard({ schoolId, classId, term, schoolYear, series } = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };
  const resolvedTerm = normalizeTerm(term);
  if (!['T1', 'T2', 'T3'].includes(resolvedTerm)) {
    return { ok: false, error: 'term' };
  }

  const klass = await getClassForSchool(schoolId, classId);
  if (!klass) return { ok: false, error: 'forbidden', status: 403 };

  const year = String(schoolYear || klass.schoolYear || klass.school?.currentSchoolYear || '').trim()
    || '2025-2026';
  const range = termDateRange(year, resolvedTerm);
  const coeffMap = await loadSchoolCoefficients(schoolId);
  const seriesFilter = parseSeries(series);

  const students = await prisma.student.findMany({
    where: { classId: klass.id, schoolId },
    include: { grades: true, absences: true, class: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const visible = students.filter((student) => matchesSeriesFilter(student, klass, seriesFilter));

  const saved = await prisma.deliberation.findMany({
    where: { schoolId, classId: klass.id, term: resolvedTerm, schoolYear: year },
  });
  const savedByStudent = new Map(saved.map((d) => [d.studentId, d]));

  const rows = attachClassement(visible.map((student) => councilRow({
    student,
    grades: student.grades || [],
    absences: student.absences || [],
    saved: savedByStudent.get(student.id),
    coeffMap,
    term: resolvedTerm,
    range,
    klass,
  })));

  return {
    ok: true,
    class: klass,
    term: resolvedTerm,
    schoolYear: year,
    coeffMap,
    rows,
    thresholds: THRESHOLDS,
    series: seriesFilter,
    hasSeries: classHasSeries(klass, students),
  };
}

function parseSaveRows(body = {}) {
  const incoming = body.rows || body.students || {};
  if (Array.isArray(incoming)) {
    return incoming.map((row) => ({
      studentId: String(row.studentId || '').trim(),
      mention: row.mention,
      decision: row.decision,
      comment: row.comment,
    }));
  }
  return Object.entries(incoming).map(([studentId, row]) => ({
    studentId: String(row?.studentId || studentId).trim(),
    mention: row?.mention,
    decision: row?.decision,
    comment: row?.comment,
  }));
}

async function saveCouncil({ schoolId, classId, term, schoolYear, series, body } = {}) {
  const board = await getCouncilBoard({ schoolId, classId, term, schoolYear, series });
  if (!board.ok) return board;

  const allowedIds = new Set(board.rows.map((r) => r.studentId));
  const incoming = parseSaveRows(body);
  const toSave = incoming.filter((row) => row.studentId && allowedIds.has(row.studentId));
  if (!toSave.length) return { ok: false, error: 'data' };

  const results = [];
  for (const row of toSave) {
    const decision = normalizeDecision(row.decision);
    if (!decision) return { ok: false, error: 'decision' };
    const mention = normalizeMention(row.mention);
    const comment = String(row.comment || '').trim().slice(0, 500) || null;
    const record = await prisma.deliberation.upsert({
      where: {
        studentId_classId_term_schoolYear: {
          studentId: row.studentId,
          classId: board.class.id,
          term: board.term,
          schoolYear: board.schoolYear,
        },
      },
      create: {
        schoolId,
        classId: board.class.id,
        studentId: row.studentId,
        term: board.term,
        schoolYear: board.schoolYear,
        mention,
        decision,
        comment,
      },
      update: { mention, decision, comment },
    });
    results.push(record);
  }

  return { ok: true, count: results.length, records: results, class: board.class, term: board.term };
}

async function generateCouncilPdf({ school, klass, term, schoolYear, rows, outputDir }) {
  const filename = `pv-${klass.id}-${term}.pdf`;

  const buffer = await renderPdfToBuffer((doc) => {

    drawDocumentHeader(doc, school, {
      title: 'Procès-verbal — Conseil de classe',
      subtitle: `${klass.name}${klass.series ? ` · ${seriesLabel(klass.series)}` : ''} · ${formatTermLabel(term)} · ${schoolYear || ''}`,
    });

    doc.fontSize(9).fillColor('#666');
    doc.text('Moyenne pondérée Σ(note × coef) / Σ(coef). Mentions : <10 aucune · 10–12 Passable · 12–14 Assez bien · 14–16 Bien · 16–18 Très bien · ≥18 Excellent.');
    doc.moveDown(0.6);

    const startY = doc.y;
    doc.fontSize(9).fillColor('#666');
    doc.text('Élève', 50, startY);
    doc.text('Moy.', 200, startY);
    doc.text('Rang', 245, startY);
    doc.text('Mention', 330, startY);
    doc.text('Décision', 430, startY);
    doc.moveTo(50, startY + 14).lineTo(545, startY + 14).stroke('#ddd');

    let y = startY + 22;
    (rows || []).forEach((row) => {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      const name = `${row.lastName} ${row.firstName}`;
      doc.fillColor('#333').fontSize(9).text(name, 50, y, { width: 145 });
      doc.text(row.average == null ? '—' : Number(row.average).toFixed(2), 200, y);
      doc.text(formatRankCompact(row), 245, y, { width: 80 });
      doc.text(row.mention || '—', 330, y, { width: 90 });
      doc.text(row.decision || '—', 430, y, { width: 90 });
      y += 18;
      if (row.comment) {
        doc.fontSize(8).fillColor('#666').text(row.comment, 50, y, { width: 495 });
        y += 14;
      }
    });

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text(`Document officiel — ${school.name} — EduConnect`, 50, Math.max(doc.y, y + 24), {
      align: 'center',
    });
  });

  return savePdfBuffer({ folder: 'deliberations', filename, buffer, outputDir });
}

module.exports = {
  MENTIONS,
  DECISIONS,
  THRESHOLDS,
  TERMS,
  suggestFromAverage,
  normalizeMention,
  normalizeDecision,
  termDateRange,
  countAbsences,
  councilRow,
  getClassForSchool,
  getCouncilBoard,
  saveCouncil,
  generateCouncilPdf,
  parseSaveRows,
  SERIES_OPTIONS,
};
