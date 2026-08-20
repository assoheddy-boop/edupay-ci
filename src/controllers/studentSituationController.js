const {
  attachStaffContext,
  resolveStaffSchoolId,
  getPermissionsForRole,
  getEffectiveStaffRole,
  PERMISSIONS,
} = require('../utils/staffPermissions');
const { loadStudentSituation } = require('../services/studentSituationService');
const { motifLabel, discountLabel } = require('../services/socialCaseService');
const { formatTermLabel } = require('../services/academicTerms');
const { seriesLabel } = require('../services/series');
const { hasEffectiveRole } = require('../utils/adminAssist');

function resolvePermissions(user, schoolId) {
  if (hasEffectiveRole(user, 'SUPER_ADMIN')) {
    return Object.values(PERMISSIONS);
  }
  const role = getEffectiveStaffRole(user, schoolId);
  return getPermissionsForRole(role);
}

async function showPage(req, res) {
  const schoolId = resolveStaffSchoolId(req.user);
  const school = req.user?.school || req.user?.staffAssignments?.find((a) => a.schoolId === schoolId)?.school;
  if (!schoolId || !school) return res.redirect('/auth/login');

  const { id } = req.params;
  const schoolYear = req.query.schoolYear || school.currentSchoolYear || '2025-2026';
  const permissions = resolvePermissions(req.user, schoolId);
  const staffCtx = attachStaffContext(req.user, schoolId);

  try {
    const result = await loadStudentSituation({
      schoolId,
      schoolYear,
      studentId: id,
      permissions,
    });

    if (!result) {
      return res.status(404).render('error', { message: 'Élève introuvable.', user: req.user });
    }

    const from = String(req.query.from || '').trim();
    let backUrl = '/school/students';
    if (from === 'reinscription') {
      backUrl = `/reinscription/dashboard?schoolYear=${encodeURIComponent(schoolYear)}`;
    } else if (from === 'inscriptions') {
      backUrl = '/school/inscriptions';
    }

    return res.render('school/studentSituation', {
      title: `Situation — ${result.student.lastName} ${result.student.firstName}`,
      school,
      schoolYear,
      student: result.student,
      sections: result.sections,
      backUrl,
      motifLabel,
      discountLabel,
      formatTermLabel,
      seriesLabel,
      staffRoleLabel: staffCtx.staffRoleLabel,
    });
  } catch (err) {
    console.error('[studentSituation]', err);
    return res.status(500).render('error', {
      message: 'Impossible d’afficher la situation de cet élève.',
      user: req.user,
    });
  }
}

module.exports = {
  showPage,
};
