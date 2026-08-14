const {
  getSchoolGenderStats,
  getAbsenceStatsByGender,
  getSuccessRateByGender,
} = require('../../services/StatsService');
const { listClassGenderStats } = require('../../services/ClassService');
const {
  getReinscriptionStats,
  getRedoublementCauseStats,
} = require('../../services/ReinscriptionService');

async function analysePage(req, res) {
  const school = req.user.school;
  if (!school) return res.redirect('/auth/login');

  const schoolId = school.id;
  const schoolYear = req.query.schoolYear || school.currentSchoolYear;

  const [
    gender,
    absenceByGender,
    successByGender,
    classStatsResult,
    reinscription,
    causeStats,
  ] = await Promise.all([
    getSchoolGenderStats(schoolId),
    getAbsenceStatsByGender({ schoolId }),
    getSuccessRateByGender({ schoolId }),
    listClassGenderStats({ schoolId }),
    getReinscriptionStats(schoolId, schoolYear),
    getRedoublementCauseStats(schoolId, schoolYear),
  ]);

  res.render('school/analyse', {
    user: req.user,
    school,
    schoolId,
    schoolYear,
    gender,
    absenceByGender,
    successByGender,
    classStats: classStatsResult.classes || [],
    reinscription,
    causeStats,
  });
}

module.exports = { analysePage };
