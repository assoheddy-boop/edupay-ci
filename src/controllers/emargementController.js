const prisma = require('../config/database');
const { TERMS, formatTermLabel } = require('../services/academicTerms');
const { SERIES_OPTIONS, seriesLabel } = require('../services/series');
const {
  SHEET_KINDS,
  getSheet,
  generateEmargementPdf,
  queryString,
  todayIso,
} = require('../services/emargementService');

function schoolOr403(req, res) {
  const school = req.user?.school;
  if (!school?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return school;
}

async function listClasses(schoolId) {
  return prisma.class.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
  });
}

async function listSubjects(schoolId) {
  return prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

function readQuery(req) {
  return {
    classId: String(req.query.classId || '').trim(),
    date: String(req.query.date || todayIso()).trim(),
    kind: String(req.query.kind || 'COMPOSITION').trim(),
    subject: String(req.query.subject || '').trim(),
    term: String(req.query.term || 'T1').trim(),
    series: String(req.query.series || '').trim(),
    room: String(req.query.room || '').trim(),
  };
}

function qs(params) {
  return queryString(params);
}

async function emargementsPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const classes = await listClasses(school.id);
  const q = readQuery(req);
  if (!q.classId && classes[0]) q.classId = classes[0].id;

  let sheet = null;
  if (q.classId) {
    sheet = await getSheet({ schoolId: school.id, ...q });
    if (sheet.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
  }

  const subjects = await listSubjects(school.id);

  return res.render('school/emargements', {
    user: req.user,
    school,
    classes,
    subjects,
    classId: q.classId,
    date: sheet?.ok ? sheet.date.iso : q.date,
    kind: sheet?.ok ? sheet.kind : q.kind,
    subject: sheet?.ok ? sheet.subject : q.subject,
    term: sheet?.ok ? sheet.term : q.term,
    series: sheet?.ok ? sheet.series : q.series,
    room: sheet?.ok ? sheet.room : q.room,
    kinds: SHEET_KINDS,
    terms: TERMS,
    formatTermLabel,
    seriesOptions: SERIES_OPTIONS,
    seriesLabel,
    hasSeries: sheet?.ok ? sheet.hasSeries : false,
    rows: sheet?.ok ? sheet.rows : [],
    klass: sheet?.ok ? sheet.class : null,
    counts: sheet?.ok ? sheet.counts : { total: 0, boys: 0, girls: 0, unknown: 0 },
    titleSheet: sheet?.ok ? sheet.title : 'Liste d’émargement',
    subtitle: sheet?.ok ? sheet.subtitle : '',
    qs: qs(sheet?.ok ? {
      classId: sheet.class.id,
      date: sheet.date.iso,
      kind: sheet.kind,
      subject: sheet.subject,
      term: sheet.term,
      series: sheet.series,
      room: sheet.room,
    } : q),
    error: req.query.error || (sheet && !sheet.ok ? sheet.error : null),
  });
}

async function emargementsPrint(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const q = readQuery(req);
  const sheet = await getSheet({ schoolId: school.id, ...q });
  if (!sheet.ok) {
    if (sheet.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/school/emargements?${qs(q)}&error=${sheet.error || 'data'}`);
  }

  return res.status(200).render('school/emargements-print', {
    user: req.user,
    school,
    klass: sheet.class,
    rows: sheet.rows,
    counts: sheet.counts,
    date: sheet.date,
    kind: sheet.kind,
    subject: sheet.subject,
    term: sheet.term,
    series: sheet.series,
    room: sheet.room,
    titleSheet: sheet.title,
    subtitle: sheet.subtitle,
    formatTermLabel,
    seriesLabel,
    qs: qs({
      classId: sheet.class.id,
      date: sheet.date.iso,
      kind: sheet.kind,
      subject: sheet.subject,
      term: sheet.term,
      series: sheet.series,
      room: sheet.room,
    }),
  });
}

async function emargementsPdf(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const q = readQuery(req);
  const sheet = await getSheet({ schoolId: school.id, ...q });
  if (!sheet.ok) {
    if (sheet.status === 403) {
      return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    }
    return res.redirect(`/school/emargements?${qs(q)}&error=${sheet.error || 'data'}`);
  }

  try {
    const { filepath, filename } = await generateEmargementPdf({ school, sheet });
    return res.download(filepath, filename);
  } catch (err) {
    console.error(err);
    return res.redirect(`/school/emargements?${qs(q)}&error=pdf`);
  }
}

module.exports = {
  emargementsPage,
  emargementsPrint,
  emargementsPdf,
};
