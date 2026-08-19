const prisma = require('../config/database');
const { drawDocumentHeader } = require('../utils/schoolLogo');
const { renderPdfToBuffer, savePdfBuffer } = require('../utils/pdfOutput');
const {
  BULLETIN_TERMS,
  formatTermLabel,
  normalizeTerm,
  filterGradesForBulletin,
} = require('./academicTerms');
const {
  computeWeightedAverage,
  computeAnnuelleAverage,
  loadSchoolCoefficients,
} = require('./gradesAverage');
const { attachClassement, ordinalFr } = require('./classement');
const { suggestFromAverage, getClassForSchool } = require('./deliberationService');
const { effectiveSeries, seriesLabel, classHasSeries } = require('./series');

const LIMIT_OPTIONS = [
  { value: 3, label: 'Top 3' },
  { value: 5, label: 'Top 5' },
  { value: 10, label: 'Top 10' },
  { value: 'all', label: 'Toute la classe' },
];

const DEFAULT_LIMIT = 10;

function parseLimit(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'all' || s === 'toute' || s === 'toutes' || s === 'classe') return 'all';
  const n = Number.parseInt(s, 10);
  if (n === 3 || n === 5 || n === 10) return n;
  return DEFAULT_LIMIT;
}

function parseByGender(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'oui';
}

function isAllClasses(classId) {
  const s = String(classId || '').trim().toLowerCase();
  return !s || s === 'all' || s === 'toutes';
}

function parsePalmaresTerm(raw) {
  const term = normalizeTerm(raw || 'T1');
  if (term === 'T1' || term === 'T2' || term === 'T3' || term === 'ANNUELLE') return term;
  return 'T1';
}

function formatMoyenne(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(2).replace('.', ',');
}

/**
 * Moyenne du palmarès = formule bulletin (gradesAverage).
 * T1/T2/T3 : pondérée matière (INTERRO/DEVOIR/COMPOSITION) puis coefficients.
 * Annuelle : moyenne des trimestres renseignés (computeAnnuelleAverage).
 */
function studentPeriodAverage(grades, term, coeffMap) {
  const list = Array.isArray(grades) ? grades : [];
  if (term === 'ANNUELLE') {
    const hasTerm = ['T1', 'T2', 'T3'].some((t) => filterGradesForBulletin(list, t).length);
    if (hasTerm) {
      return { average: computeAnnuelleAverage(list, coeffMap), hasGrades: true };
    }
    const other = filterGradesForBulletin(list, 'AUTRE');
    if (other.length) {
      return { average: computeWeightedAverage(other, coeffMap), hasGrades: true };
    }
    return { average: null, hasGrades: false };
  }
  const termGrades = filterGradesForBulletin(list, term);
  if (!termGrades.length) return { average: null, hasGrades: false };
  return { average: computeWeightedAverage(termGrades, coeffMap), hasGrades: true };
}

function buildRow({ student, klass, term, coeffMap, saved }) {
  const { average, hasGrades } = studentPeriodAverage(student.grades || [], term, coeffMap);
  const suggested = suggestFromAverage(average, { hasGrades });
  const useSaved = term !== 'ANNUELLE' && saved;
  return {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    matricule: student.matricule || '',
    gender: student.gender || null,
    series: effectiveSeries(student, klass || student.class),
    classId: klass?.id || student.classId,
    className: klass?.name || student.class?.name || '',
    average,
    hasGrades,
    suggestedMention: suggested.mention,
    mention: useSaved ? (saved.mention || null) : suggested.mention,
    saved: Boolean(useSaved),
  };
}

function rankAndSlice(rows, limit) {
  const eligible = (rows || []).filter((r) => r.hasGrades && r.average != null);
  const ranked = attachClassement(eligible).sort((a, b) => {
    const ra = a.rank || 9999;
    const rb = b.rank || 9999;
    if (ra !== rb) return ra - rb;
    return String(a.lastName || '').localeCompare(String(b.lastName || ''), 'fr');
  });
  if (limit === 'all') return ranked;
  const n = Number(limit) || DEFAULT_LIMIT;
  return ranked.slice(0, n);
}

function genderOf(row) {
  const g = String(row?.gender || '').trim().toUpperCase();
  return g === 'M' || g === 'F' ? g : null;
}

function buildLists(rows, { limit, byGender }) {
  if (byGender) {
    return {
      rows: [],
      girls: rankAndSlice(rows.filter((r) => genderOf(r) === 'F'), limit),
      boys: rankAndSlice(rows.filter((r) => genderOf(r) === 'M'), limit),
    };
  }
  return {
    rows: rankAndSlice(rows, limit),
    girls: [],
    boys: [],
  };
}

function palmaresQuery({ classId, term, limit, byGender } = {}) {
  const params = new URLSearchParams();
  if (classId) params.set('classId', classId);
  if (term) params.set('term', term);
  if (limit) params.set('limit', String(limit));
  if (byGender) params.set('byGender', '1');
  return params.toString();
}

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'palmares';
}

async function listSchoolClasses(schoolId, allowedClassIds) {
  const where = { schoolId };
  if (Array.isArray(allowedClassIds)) {
    if (!allowedClassIds.length) return [];
    where.id = { in: allowedClassIds };
  }
  return prisma.class.findMany({
    where,
    include: { school: true },
    orderBy: { name: 'asc' },
  });
}

async function getPalmares({
  schoolId,
  classId,
  term,
  schoolYear,
  limit,
  byGender,
  allowedClassIds,
} = {}) {
  if (!schoolId) return { ok: false, error: 'forbidden', status: 403 };

  const resolvedTerm = parsePalmaresTerm(term);
  const resolvedLimit = parseLimit(limit);
  const splitGender = parseByGender(byGender);
  const allClasses = isAllClasses(classId);
  const specificId = allClasses ? '' : String(classId).trim();

  if (specificId && Array.isArray(allowedClassIds) && !allowedClassIds.includes(specificId)) {
    return { ok: false, error: 'forbidden', status: 403 };
  }

  let classes;
  if (specificId) {
    const klass = await getClassForSchool(schoolId, specificId);
    if (!klass) return { ok: false, error: 'forbidden', status: 403 };
    classes = [klass];
  } else {
    classes = await listSchoolClasses(schoolId, allowedClassIds);
  }

  const year = String(
    schoolYear
    || classes[0]?.schoolYear
    || classes[0]?.school?.currentSchoolYear
    || '',
  ).trim() || '2025-2026';

  const coeffMap = await loadSchoolCoefficients(schoolId);
  const classIds = classes.map((c) => c.id);

  const students = classIds.length
    ? await prisma.student.findMany({
      where: { schoolId, classId: { in: classIds } },
      include: { grades: true, class: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    : [];

  let saved = [];
  if (['T1', 'T2', 'T3'].includes(resolvedTerm) && classIds.length) {
    saved = await prisma.deliberation.findMany({
      where: {
        schoolId,
        term: resolvedTerm,
        schoolYear: year,
        classId: { in: classIds },
      },
    });
  }
  const savedByKey = new Map(saved.map((d) => [`${d.studentId}:${d.classId}`, d]));

  const byClass = new Map(classes.map((c) => [c.id, []]));
  students.forEach((student) => {
    const klass = classes.find((c) => c.id === student.classId) || student.class;
    if (!klass || !byClass.has(klass.id)) return;
    byClass.get(klass.id).push(buildRow({
      student,
      klass,
      term: resolvedTerm,
      coeffMap,
      saved: savedByKey.get(`${student.id}:${klass.id}`),
    }));
  });

  const hasGender = students.some((s) => genderOf(s));
  const useGender = splitGender && hasGender;
  const hasSeries = classes.some((klass) => classHasSeries(klass, students.filter((s) => s.classId === klass.id)));

  const groups = classes.map((klass) => {
    const classRows = byClass.get(klass.id) || [];
    const lists = buildLists(classRows, { limit: resolvedLimit, byGender: useGender });
    return {
      class: klass,
      hasSeries: classHasSeries(klass, students.filter((s) => s.classId === klass.id)),
      ...lists,
    };
  });

  return {
    ok: true,
    classId: specificId || 'all',
    allClasses,
    term: resolvedTerm,
    schoolYear: year,
    limit: resolvedLimit,
    byGender: useGender,
    hasGender,
    hasSeries,
    groups,
    coeffMap,
  };
}

async function generatePalmaresPdf({ school, board, outputDir } = {}) {
  const classPart = board?.allClasses
    ? 'toutes-classes'
    : safeFilePart(board?.groups?.[0]?.class?.name);
  const filename = `palmares-${classPart}-${board?.term || 'T1'}.pdf`;

  const buffer = await renderPdfToBuffer((doc) => {

    const classLabel = board?.allClasses
      ? 'Toutes les classes'
      : (board?.groups?.[0]?.class?.name || '');
    const year = board?.schoolYear || '';

    drawDocumentHeader(doc, school, {
      title: 'Tableau d’honneur',
      subtitle: [classLabel, formatTermLabel(board?.term), year].filter(Boolean).join(' · '),
    });

    doc.fontSize(9).fillColor('#666');
    doc.text('Moyenne pondérée Σ(note × coef) / Σ(coef) — même formule que le bulletin (interrogations, devoirs, composition).');
    doc.moveDown(0.6);

    const cols = [
      { key: 'rank', label: 'Rang', x: 50, w: 36 },
      { key: 'name', label: 'Nom', x: 90, w: 130 },
      { key: 'className', label: 'Classe', x: 224, w: 70 },
      { key: 'series', label: 'Série', x: 298, w: 50 },
      { key: 'average', label: 'Moyenne', x: 352, w: 70 },
      { key: 'mention', label: 'Mention', x: 426, w: 120 },
    ];

    function drawHeader(y) {
      doc.fontSize(9).fillColor('#666');
      cols.forEach((c) => doc.text(c.label, c.x, y, { width: c.w }));
      doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke('#ddd');
    }

    function drawRows(title, rows, startY) {
      let y = startY;
      if (title) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(11).fillColor('#0052CC').text(title, 50, y);
        y += 18;
      }
      drawHeader(y);
      y += 22;
      (rows || []).forEach((row) => {
        if (y > 720) {
          doc.addPage();
          y = 50;
          drawHeader(y);
          y += 22;
        }
        const name = `${row.lastName || ''} ${row.firstName || ''}`.trim();
        doc.fillColor('#333').fontSize(9);
        doc.text(ordinalFr(row.rank) || '—', cols[0].x, y, { width: cols[0].w });
        doc.text(name, cols[1].x, y, { width: cols[1].w });
        doc.text(row.className || '—', cols[2].x, y, { width: cols[2].w });
        doc.text(seriesLabel(row.series) || '—', cols[3].x, y, { width: cols[3].w });
        doc.text(`${formatMoyenne(row.average)} / 20`, cols[4].x, y, { width: cols[4].w });
        doc.text(row.mention || '—', cols[5].x, y, { width: cols[5].w });
        y += 18;
      });
      if (!(rows || []).length) {
        doc.fontSize(9).fillColor('#666').text('Aucun élève avec des notes.', 50, y);
        y += 18;
      }
      return y + 10;
    }

    let y = doc.y;
    (board?.groups || []).forEach((group) => {
      const klassName = group.class?.name || '';
      if (board?.byGender) {
        y = drawRows(
          board.allClasses ? `${klassName} — Filles` : 'Filles',
          group.girls,
          y,
        );
        y = drawRows(
          board.allClasses ? `${klassName} — Garçons` : 'Garçons',
          group.boys,
          y,
        );
      } else {
        y = drawRows(board.allClasses ? klassName : null, group.rows, y);
      }
    });

    doc.fontSize(9).fillColor('#999').text(
      `Document officiel — ${school?.name || ''} — EduConnect`,
      50,
      Math.max(doc.y, y + 16),
      { align: 'center', width: 495 },
    );
  }, { size: 'A4', compress: false });

  return savePdfBuffer({ folder: 'palmares', filename, buffer, outputDir });
}

module.exports = {
  LIMIT_OPTIONS,
  DEFAULT_LIMIT,
  BULLETIN_TERMS,
  parseLimit,
  parseByGender,
  parsePalmaresTerm,
  formatMoyenne,
  studentPeriodAverage,
  buildRow,
  rankAndSlice,
  palmaresQuery,
  getPalmares,
  generatePalmaresPdf,
};
