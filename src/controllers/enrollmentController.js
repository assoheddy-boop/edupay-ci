const prisma = require('../config/database');
const { logAudit } = require('../utils/audit');
const {
  ENROLLMENT_DOCUMENTS,
  ENROLLMENT_STATUS_OPTIONS,
  LV2_OPTIONS,
} = require('../utils/enrollmentForm');
const { SERIES_OPTIONS, seriesLabel } = require('../services/series');
const {
  loadEnrollmentContext,
  saveNewEnrollment,
  saveExistingEnrollment,
  listEnrollmentsForYear,
  classGenderCounts,
} = require('../services/enrollmentService');
const { cycleFlags } = require('../utils/educationCycle');

function schoolFromUser(user) {
  return user?.school || user?.staffAssignments?.[0]?.school || null;
}

function errorMessage(code) {
  const map = {
    matricule: 'Ce matricule école est déjà utilisé.',
    nationalMatricule: 'Ce matricule national est déjà utilisé.',
    class: 'Classe invalide.',
    data: 'Veuillez remplir les champs obligatoires (nom, prénom, classe).',
    not_found: 'Élève introuvable.',
  };
  return map[code] || 'Impossible d’enregistrer la fiche.';
}

async function renderForm(req, res, { studentId = null, title }) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const schoolYear = school.currentSchoolYear || '2025-2026';
  const ctx = await loadEnrollmentContext(school.id, schoolYear, studentId);
  const cycle = cycleFlags(school.educationCycle);

  res.render('school/inscriptionForm', {
    title,
    school,
    schoolYear,
    classes: ctx.classes,
    student: ctx.student,
    enrollment: ctx.enrollment,
    yearRecord: ctx.yearRecord,
    documents: ctx.documents,
    effectif: ctx.effectif,
    enrollmentDocuments: ENROLLMENT_DOCUMENTS,
    enrollmentStatusOptions: ENROLLMENT_STATUS_OPTIONS,
    lv2Options: LV2_OPTIONS,
    seriesOptions: SERIES_OPTIONS,
    seriesLabel,
    cycle,
    error: req.query.error ? errorMessage(req.query.error) : null,
    success: req.query.success === '1',
    isNew: !studentId,
  });
}

async function listPage(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const schoolYear = school.currentSchoolYear || '2025-2026';
  const rows = await listEnrollmentsForYear(school.id, schoolYear);

  res.render('school/inscriptions', {
    title: 'Fiches d’inscription',
    school,
    schoolYear,
    rows,
    success: req.query.success === '1',
  });
}

async function newPage(req, res) {
  return renderForm(req, res, { title: 'Nouvelle inscription' });
}

async function editPage(req, res) {
  return renderForm(req, res, { studentId: req.params.studentId, title: 'Fiche d’inscription' });
}

async function create(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const schoolYear = school.currentSchoolYear || '2025-2026';
  try {
    const result = await saveNewEnrollment({
      schoolId: school.id,
      schoolYear,
      body: req.body,
      file: req.file || null,
    });
    if (!result.ok) {
      return res.redirect(`/school/inscriptions/nouvelle?error=${result.error || '1'}`);
    }
    await logAudit({
      action: 'enrollment_create',
      entity: 'StudentEnrollment',
      entityId: result.studentId,
      user: req.user,
      ip: req.ip,
    });
    res.redirect(`/school/inscriptions/${result.studentId}?success=1`);
  } catch (err) {
    console.error(err);
    res.redirect('/school/inscriptions/nouvelle?error=1');
  }
}

async function update(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const { studentId } = req.params;
  const schoolYear = school.currentSchoolYear || '2025-2026';
  try {
    const result = await saveExistingEnrollment({
      schoolId: school.id,
      schoolYear,
      studentId,
      body: req.body,
      file: req.file || null,
    });
    if (!result.ok) {
      return res.redirect(`/school/inscriptions/${studentId}?error=${result.error || '1'}`);
    }
    await logAudit({
      action: 'enrollment_update',
      entity: 'StudentEnrollment',
      entityId: studentId,
      user: req.user,
      ip: req.ip,
    });
    res.redirect(`/school/inscriptions/${studentId}?success=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/school/inscriptions/${studentId}?error=1`);
  }
}

/** API légère : effectif classe pour mise à jour live du formulaire. */
async function classEffectif(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).json({ error: 'Forbidden' });
  const { classId } = req.query;
  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId: school.id } });
  if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
  const effectif = await classGenderCounts(classId);
  res.json(effectif);
}

module.exports = {
  listPage,
  newPage,
  editPage,
  create,
  update,
  classEffectif,
};
