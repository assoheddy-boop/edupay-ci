const prisma = require('../config/database');
const { findOwnedClass } = require('./classController');
const { loadOrganization } = require('../utils/group');
const {
  getClassGenderStats,
  getSchoolGenderStats,
  getGroupGenderStats,
} = require('../../services/StatsService');

function isSuperAdmin(user) {
  return user?.role === 'SUPER_ADMIN';
}

async function classGenderStats(req, res) {
  const classId = req.params.id;
  if (isSuperAdmin(req.user)) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
    const stats = await getClassGenderStats(classId);
    return res.json(stats);
  }

  if (req.user.role !== 'SCHOOL_ADMIN') {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const cls = await findOwnedClass(req, classId);
  if (!cls) return res.status(404).json({ error: 'Classe introuvable' });
  const stats = await getClassGenderStats(cls.id);
  return res.json(stats);
}

async function schoolGenderStats(req, res) {
  const schoolId = req.params.id;
  if (isSuperAdmin(req.user)) {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return res.status(404).json({ error: 'École introuvable' });
    const stats = await getSchoolGenderStats(schoolId);
    return res.json(stats);
  }

  if (req.user.role !== 'SCHOOL_ADMIN' || req.user.school?.id !== schoolId) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const stats = await getSchoolGenderStats(schoolId);
  return res.json(stats);
}

async function groupGenderStats(req, res) {
  const groupId = req.params.id;
  if (isSuperAdmin(req.user)) {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    const stats = await getGroupGenderStats(groupId);
    return res.json(stats);
  }

  if (req.user.role !== 'ORGANIZATION_ADMIN') {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const organization = await loadOrganization(req);
  if (!organization?.groupId || organization.groupId !== groupId) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const stats = await getGroupGenderStats(groupId);
  return res.json(stats);
}

module.exports = {
  classGenderStats,
  schoolGenderStats,
  groupGenderStats,
};
