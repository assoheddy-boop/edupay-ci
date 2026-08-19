const prisma = require('../config/database');
const { sendExcel } = require('../services/exportExcel');
const { getClassGenderStats } = require('../../services/ClassService');
const { generateClassGenderStatsExcel, generateClassGenderStatsPdf } = require('../../services/export');
const { sendPdfDownload } = require('../utils/pdfOutput');

function schoolIdOf(req) {
  return req.user?.school?.id || null;
}

async function findOwnedClass(req, classId) {
  const schoolId = schoolIdOf(req);
  if (!schoolId || !classId) return null;
  return prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: { school: { select: { id: true, name: true } } },
  });
}

async function genderStatsJson(req, res) {
  const cls = await findOwnedClass(req, req.params.id);
  if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
  const stats = await getClassGenderStats(cls.id);
  return res.json({ ok: true, classId: cls.id, className: cls.name, ...stats });
}

async function dashboard(req, res) {
  const cls = await findOwnedClass(req, req.params.id);
  if (!cls) {
    return res.status(404).render('error', { message: 'Classe introuvable', user: req.user });
  }
  const stats = await getClassGenderStats(cls.id);
  res.render('school/classDashboard', {
    user: req.user,
    school: req.user.school,
    classItem: cls,
    stats,
  });
}

async function exportExcel(req, res) {
  const cls = await findOwnedClass(req, req.params.id);
  if (!cls) {
    return res.status(404).render('error', { message: 'Classe introuvable', user: req.user });
  }
  const result = await generateClassGenderStatsExcel({ schoolId: cls.schoolId, classId: cls.id });
  if (!result.ok) return res.redirect(`/school/classes/${cls.id}/dashboard`);
  await sendExcel(res, result.filename, result.workbook);
}

async function exportPdf(req, res) {
  const cls = await findOwnedClass(req, req.params.id);
  if (!cls) {
    return res.status(404).render('error', { message: 'Classe introuvable', user: req.user });
  }
  const result = await generateClassGenderStatsPdf({ schoolId: cls.schoolId, classId: cls.id });
  if (!result.ok) return res.redirect(`/school/classes/${cls.id}/dashboard`);
  return sendPdfDownload(res, result);
}

module.exports = {
  genderStatsJson,
  dashboard,
  exportExcel,
  exportPdf,
  findOwnedClass,
};
