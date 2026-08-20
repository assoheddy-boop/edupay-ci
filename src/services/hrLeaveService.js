const prisma = require('../config/database');
const { resolveStaffProfileId } = require('../utils/hr');

async function processExpiredLeaves() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiredLeaves = await prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      endDate: { lt: today },
    },
    include: { staffProfile: true },
  });

  let restored = 0;
  for (const leave of expiredLeaves) {
    const profileId = leave.staffProfileId
      || (leave.teacherId
        ? (await prisma.staffProfile.findUnique({ where: { teacherId: leave.teacherId } }))?.id
        : null);
    if (!profileId) continue;

    const profile = await prisma.staffProfile.findUnique({ where: { id: profileId } });
    if (!profile || profile.status !== 'ON_LEAVE') continue;

    const activeLeave = await prisma.leaveRequest.findFirst({
      where: {
        OR: [{ staffProfileId: profileId }, { teacherId: profile.teacherId || undefined }],
        status: 'APPROVED',
        endDate: { gte: today },
      },
    });
    if (activeLeave) continue;

    await prisma.staffProfile.update({
      where: { id: profileId },
      data: { status: 'ACTIVE' },
    });
    restored += 1;
  }

  return { restored, checked: expiredLeaves.length };
}

async function attachStaffProfileToLeave(leave, schoolId) {
  const staffProfileId = await resolveStaffProfileId({
    teacherId: leave.teacherId,
    staffProfileId: leave.staffProfileId,
    schoolId,
  });
  if (!staffProfileId || leave.staffProfileId === staffProfileId) return leave;
  return prisma.leaveRequest.update({
    where: { id: leave.id },
    data: { staffProfileId },
  });
}

module.exports = {
  processExpiredLeaves,
  attachStaffProfileToLeave,
};
