const prisma = require('../src/config/database');
const logger = require('./logger');
const { sendNotification } = require('./NotificationService');
const { generateTimetablePDF } = require('./export');

const VALID_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const TIMETABLE_INCLUDE = {
  class: true,
  teacher: { include: { user: true } },
  subject: true,
};

function parseTime(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function validateDayOfWeek(dayOfWeek) {
  if (!dayOfWeek || !VALID_DAYS.includes(dayOfWeek)) {
    return { ok: false, error: 'day', message: 'Jour invalide (Lundi à Samedi).' };
  }
  return { ok: true };
}

function validateTimes(startTime, endTime) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start == null || end == null) {
    return { ok: false, error: 'time', message: 'Horaires invalides (format HH:MM).' };
  }
  if (start >= end) {
    return { ok: false, error: 'time', message: 'L\'heure de début doit être avant l\'heure de fin.' };
  }
  return { ok: true, start, end };
}

function slotsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function findConflicts({ classId, teacherId, dayOfWeek, start, end, excludeId }) {
  const whereBase = { dayOfWeek };
  const existing = await prisma.timetable.findMany({
    where: {
      ...whereBase,
      OR: [{ classId }, { teacherId }],
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    include: TIMETABLE_INCLUDE,
  });

  for (const entry of existing) {
    const eStart = parseTime(entry.startTime);
    const eEnd = parseTime(entry.endTime);
    if (eStart == null || eEnd == null) continue;
    if (!slotsOverlap(start, end, eStart, eEnd)) continue;

    if (entry.classId === classId) {
      return {
        ok: false,
        error: 'conflict',
        message: `Conflit de classe le ${dayOfWeek} (${entry.startTime}–${entry.endTime}) : ${entry.subject?.name || 'cours'}.`,
        conflict: entry,
      };
    }
    if (entry.teacherId === teacherId) {
      const teacherName = entry.teacher?.user
        ? `${entry.teacher.user.lastName} ${entry.teacher.user.firstName}`
        : 'enseignant';
      return {
        ok: false,
        error: 'conflict',
        message: `Conflit pour ${teacherName} le ${dayOfWeek} (${entry.startTime}–${entry.endTime}).`,
        conflict: entry,
      };
    }
  }

  return { ok: true };
}

async function resolveSchoolId(classId) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { schoolId: true } });
  return cls?.schoolId || null;
}

async function createTimetableEntry({ classId, teacherId, subjectId, dayOfWeek, startTime, endTime }) {
  if (!classId || !teacherId || !subjectId) {
    return { ok: false, error: 'data', message: 'Classe, enseignant et matière requis.' };
  }

  const dayCheck = validateDayOfWeek(dayOfWeek);
  if (!dayCheck.ok) return dayCheck;

  const timeCheck = validateTimes(startTime, endTime);
  if (!timeCheck.ok) return timeCheck;

  const [cls, teacher, subject] = await Promise.all([
    prisma.class.findUnique({ where: { id: classId } }),
    prisma.teacher.findUnique({ where: { id: teacherId } }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
  ]);

  if (!cls) return { ok: false, error: 'class', message: 'Classe introuvable.' };
  if (!teacher) return { ok: false, error: 'teacher', message: 'Enseignant introuvable.' };
  if (!subject) return { ok: false, error: 'subject', message: 'Matière introuvable.' };
  if (subject.schoolId !== cls.schoolId || teacher.schoolId !== cls.schoolId) {
    return { ok: false, error: 'school', message: 'Classe, enseignant et matière doivent appartenir à la même école.' };
  }

  const conflict = await findConflicts({
    classId,
    teacherId,
    dayOfWeek,
    start: timeCheck.start,
    end: timeCheck.end,
  });
  if (!conflict.ok) return conflict;

  const entry = await prisma.timetable.create({
    data: {
      classId,
      teacherId,
      subjectId,
      dayOfWeek,
      startTime,
      endTime,
      schoolId: cls.schoolId,
    },
    include: TIMETABLE_INCLUDE,
  });

  logger.info('Timetable entry created', { id: entry.id, classId, teacherId });
  return { ok: true, entry };
}

async function updateTimetableEntry(id, { classId, teacherId, subjectId, dayOfWeek, startTime, endTime }) {
  if (!id) return { ok: false, error: 'id', message: 'Identifiant requis.' };

  const existing = await prisma.timetable.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'not_found', message: 'Créneau introuvable.' };

  const next = {
    classId: classId || existing.classId,
    teacherId: teacherId || existing.teacherId,
    subjectId: subjectId || existing.subjectId,
    dayOfWeek: dayOfWeek || existing.dayOfWeek,
    startTime: startTime || existing.startTime,
    endTime: endTime || existing.endTime,
  };

  const dayCheck = validateDayOfWeek(next.dayOfWeek);
  if (!dayCheck.ok) return dayCheck;

  const timeCheck = validateTimes(next.startTime, next.endTime);
  if (!timeCheck.ok) return timeCheck;

  const conflict = await findConflicts({
    classId: next.classId,
    teacherId: next.teacherId,
    dayOfWeek: next.dayOfWeek,
    start: timeCheck.start,
    end: timeCheck.end,
    excludeId: id,
  });
  if (!conflict.ok) return conflict;

  const schoolId = await resolveSchoolId(next.classId);
  const entry = await prisma.timetable.update({
    where: { id },
    data: { ...next, schoolId },
    include: TIMETABLE_INCLUDE,
  });

  return { ok: true, entry };
}

async function getClassTimetable(classId) {
  if (!classId) return { ok: false, error: 'class', entries: [] };

  const entries = await prisma.timetable.findMany({
    where: { classId },
    include: TIMETABLE_INCLUDE,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return { ok: true, entries };
}

async function getTeacherTimetable(teacherId) {
  if (!teacherId) return { ok: false, error: 'teacher', entries: [] };

  const entries = await prisma.timetable.findMany({
    where: { teacherId },
    include: TIMETABLE_INCLUDE,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return { ok: true, entries };
}

async function getStudentTimetable(studentId) {
  if (!studentId) return { ok: false, error: 'student', entries: [] };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, classId: true, firstName: true, lastName: true },
  });
  if (!student) return { ok: false, error: 'student', entries: [] };

  const result = await getClassTimetable(student.classId);
  return { ...result, student, classId: student.classId };
}

async function notifyParentsTimetable(studentId) {
  if (!studentId) return { ok: false, error: 'student', message: 'Élève requis.' };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: true,
      parents: {
        include: {
          parent: {
            include: { user: true },
          },
        },
      },
    },
  });
  if (!student) return { ok: false, error: 'student', message: 'Élève introuvable.' };

  const timetable = await getStudentTimetable(studentId);
  if (!timetable.ok) return timetable;

  let pdfUrl = null;
  try {
    const pdf = await generateTimetablePDF(studentId);
    if (pdf.ok) pdfUrl = pdf.url || pdf.pdfUrl;
  } catch (err) {
    logger.warn('Timetable PDF generation failed', { studentId, err: err?.message });
  }

  const studentLabel = `${student.lastName} ${student.firstName}`;
  const classLabel = student.class?.name || '—';
  const slotCount = timetable.entries.length;
  const baseMessage = `Emploi du temps de ${studentLabel} (${classLabel}) : ${slotCount} créneau(x).${
    pdfUrl ? ` PDF : ${pdfUrl}` : ''
  }`;

  const notified = [];
  for (const link of student.parents) {
    const userId = link.parent?.user?.id;
    if (!userId) continue;
    try {
      const result = await sendNotification(userId, 'timetable_updated', baseMessage);
      if (result.ok) notified.push(userId);
    } catch (err) {
      logger.warn('Parent timetable notification failed', { userId, err: err?.message });
    }
  }

  return {
    ok: true,
    notified: notified.length,
    pdfUrl,
    entries: timetable.entries,
  };
}

async function notifyClassParents(classId) {
  if (!classId) return { ok: false, error: 'class', message: 'Classe requise.' };

  const students = await prisma.student.findMany({
    where: { classId },
    select: { id: true },
  });

  let totalNotified = 0;
  const results = [];
  for (const s of students) {
    const r = await notifyParentsTimetable(s.id);
    results.push({ studentId: s.id, ...r });
    if (r.ok) totalNotified += r.notified || 0;
  }

  return { ok: true, students: students.length, totalNotified, results };
}

async function listSubjectsForSchool(schoolId) {
  if (!schoolId) return [];
  return prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: 'asc' },
  });
}

async function ensureSubject(schoolId, name) {
  if (!schoolId || !name?.trim()) return null;
  const trimmed = name.trim();
  return prisma.subject.upsert({
    where: { schoolId_name: { schoolId, name: trimmed } },
    create: { schoolId, name: trimmed },
    update: {},
  });
}

module.exports = {
  VALID_DAYS,
  parseTime,
  validateDayOfWeek,
  validateTimes,
  createTimetableEntry,
  updateTimetableEntry,
  getClassTimetable,
  getTeacherTimetable,
  getStudentTimetable,
  notifyParentsTimetable,
  notifyClassParents,
  listSubjectsForSchool,
  ensureSubject,
};
