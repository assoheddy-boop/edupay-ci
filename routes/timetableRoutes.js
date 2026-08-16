const express = require('express');
const prisma = require('../src/config/database');
const { requireAuth } = require('../src/middleware/auth');
const { attachModules } = require('../src/middleware/modules');
const {
  VALID_DAYS,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getClassTimetable,
  getTeacherTimetable,
  getStudentTimetable,
  getTimetableEvents,
  notifyParentsTimetable,
  notifyClassParents,
  listSubjectsForSchool,
  ensureSubject,
} = require('../services/TimetableService');
const { generateTimetablePDF, generateTimetableExcel } = require('../services/export');

const router = express.Router();

const GRID_HOURS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
];

function isSuperAdmin(user) {
  return user?.role === 'SUPER_ADMIN';
}

function schoolIdForUser(user) {
  if (user?.school?.id) return user.school.id;
  if (user?.teacher?.schoolId) return user.teacher.schoolId;
  return null;
}

async function assertSchoolOwnership(user, schoolId) {
  if (isSuperAdmin(user)) return true;
  if (user?.role !== 'SCHOOL_ADMIN') return false;
  return user.school?.id === schoolId;
}

async function assertClassAccess(user, classId) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { schoolId: true } });
  if (!cls) return { ok: false, status: 404, error: 'Classe introuvable.' };
  if (await assertSchoolOwnership(user, cls.schoolId)) return { ok: true, class: cls };
  if (user?.role === 'TEACHER' && user.teacher?.id) {
    const link = await prisma.teacherClass.findFirst({
      where: { teacherId: user.teacher.id, classId },
    });
    if (link) return { ok: true, class: cls };
  }
  return { ok: false, status: 403, error: 'Accès refusé.' };
}

async function assertTeacherAccess(user, teacherId) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, schoolId: true, userId: true },
  });
  if (!teacher) return { ok: false, status: 404, error: 'Enseignant introuvable.' };
  if (user?.role === 'TEACHER' && user.teacher?.id === teacherId) return { ok: true, teacher };
  if (await assertSchoolOwnership(user, teacher.schoolId)) return { ok: true, teacher };
  return { ok: false, status: 403, error: 'Accès refusé.' };
}

async function assertStudentAccess(user, studentId) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: { select: { schoolId: true } } },
  });
  if (!student) return { ok: false, status: 404, error: 'Élève introuvable.' };

  if (await assertSchoolOwnership(user, student.class?.schoolId || student.schoolId)) {
    return { ok: true, student };
  }

  if (user?.role === 'PARENT' && user.parentProfile) {
    const link = await prisma.parentStudent.findFirst({
      where: { parentId: user.parentProfile.id, studentId },
    });
    if (link) return { ok: true, student };
  }

  return { ok: false, status: 403, error: 'Accès refusé.' };
}

async function assertTimetableEntryAccess(user, entryId) {
  const entry = await prisma.timetable.findUnique({
    where: { id: entryId },
    include: { class: true },
  });
  if (!entry) return { ok: false, status: 404, error: 'Créneau introuvable.' };
  if (!(await assertSchoolOwnership(user, entry.class?.schoolId || entry.schoolId))) {
    return { ok: false, status: 403, error: 'Accès refusé.' };
  }
  return { ok: true, entry };
}

function deny(req, res, status, message) {
  if (req.accepts('html')) {
    return res.status(status).render('error', { message, user: req.user });
  }
  return res.status(status).json({ ok: false, error: message });
}

async function loadDashboardData(user, query) {
  const schoolId = schoolIdForUser(user);
  const viewMode = query.view === 'teacher' ? 'teacher' : 'class';
  const filterClassId = query.classId || '';
  const filterTeacherId = query.teacherId || (user.role === 'TEACHER' ? user.teacher?.id : '');
  const filterSubjectId = query.subjectId || '';

  let classes = [];
  let teachers = [];
  let subjects = [];
  let entries = [];
  let students = [];

  if (schoolId) {
    const teacherScoped = user?.role === 'TEACHER' && user.teacher?.id;
    const classWhere = teacherScoped
      ? { schoolId, teachers: { some: { teacherId: user.teacher.id } } }
      : { schoolId };
    const studentWhere = teacherScoped
      ? { schoolId, class: { teachers: { some: { teacherId: user.teacher.id } } } }
      : { schoolId };
    [classes, teachers, subjects, students] = await Promise.all([
      prisma.class.findMany({ where: classWhere, orderBy: { name: 'asc' } }),
      prisma.teacher.findMany({
        where: teacherScoped ? { id: user.teacher.id } : { schoolId },
        include: { user: true },
        orderBy: { user: { lastName: 'asc' } },
      }),
      listSubjectsForSchool(schoolId),
      prisma.student.findMany({
        where: studentWhere,
        include: { class: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
  }

  if (viewMode === 'teacher' && filterTeacherId) {
    const access = await assertTeacherAccess(user, filterTeacherId);
    if (access.ok) {
      const result = await getTeacherTimetable(filterTeacherId);
      entries = result.entries || [];
    }
  } else if (filterClassId) {
    const access = await assertClassAccess(user, filterClassId);
    if (access.ok) {
      const result = await getClassTimetable(filterClassId);
      entries = result.entries || [];
    }
  }

  if (filterSubjectId) {
    entries = entries.filter((e) => e.subjectId === filterSubjectId);
  }

  return {
    viewMode,
    filterClassId,
    filterTeacherId,
    filterSubjectId,
    classes,
    teachers,
    subjects,
    students,
    entries,
    days: VALID_DAYS,
    gridHours: GRID_HOURS,
    schoolId,
  };
}

function buildGrid(entries, days, gridHours) {
  const grid = {};
  days.forEach((day) => {
    grid[day] = {};
    gridHours.forEach((hour) => {
      grid[day][hour] = [];
    });
  });

  entries.forEach((entry) => {
    const hourKey = entry.startTime?.slice(0, 5);
    if (grid[entry.dayOfWeek] && grid[entry.dayOfWeek][hourKey]) {
      grid[entry.dayOfWeek][hourKey].push(entry);
    } else if (grid[entry.dayOfWeek]) {
      const fallback = gridHours.find((h) => h <= hourKey) || gridHours[0];
      grid[entry.dayOfWeek][fallback].push(entry);
    }
  });

  return grid;
}

async function handleUpdate(req, res) {
  const { id } = req.params;
  const access = await assertTimetableEntryAccess(req.user, id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  try {
    const result = await updateTimetableEntry(id, req.body);
    if (req.accepts('html') && !req.xhr && !req.is('application/json')) {
      if (!result.ok) {
        return res.redirect(`/timetable?error=${encodeURIComponent(result.message || 'Erreur')}&conflict=1&classId=${access.entry.classId}`);
      }
      return res.redirect(`/timetable?success=1&classId=${access.entry.classId}`);
    }
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error(err);
    return deny(req, res, 500, 'Erreur lors de la mise à jour.');
  }
}

router.get('/', requireAuth, attachModules, async (req, res) => {
  const role = req.user?.role;
  if (!['SCHOOL_ADMIN', 'TEACHER', 'SUPER_ADMIN'].includes(role)) {
    return deny(req, res, 403, 'Accès refusé.');
  }

  try {
    const data = await loadDashboardData(req.user, req.query);
    const grid = buildGrid(data.entries, data.days, data.gridHours);

    res.render('school/timetableDashboard', {
      user: req.user,
      modules: res.locals.modules,
      title: 'Emploi du temps',
      ...data,
      grid,
      success: req.query.success || null,
      error: req.query.error || null,
      conflict: req.query.conflict || null,
    });
  } catch (err) {
    console.error(err);
    deny(req, res, 500, 'Erreur lors du chargement de l\'emploi du temps.');
  }
});

router.get('/events', requireAuth, async (req, res) => {
  const role = req.user?.role;
  if (!['SCHOOL_ADMIN', 'TEACHER', 'SUPER_ADMIN'].includes(role)) {
    return deny(req, res, 403, 'Accès refusé.');
  }

  const { classId, teacherId, subjectId } = req.query;

  if (classId) {
    const access = await assertClassAccess(req.user, classId);
    if (!access.ok) return deny(req, res, access.status, access.error);
  } else if (teacherId) {
    const access = await assertTeacherAccess(req.user, teacherId);
    if (!access.ok) return deny(req, res, access.status, access.error);
  } else {
    return res.json({ ok: false, error: 'classId ou teacherId requis.', events: [] });
  }

  try {
    const result = await getTimetableEvents({ classId, teacherId, subjectId });
    return res.json(result);
  } catch (err) {
    console.error(err);
    return deny(req, res, 500, 'Erreur lors du chargement des événements.');
  }
});

router.post('/create', requireAuth, async (req, res) => {
  if (!['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) {
    return deny(req, res, 403, 'Accès refusé.');
  }

  const { classId, teacherId, subjectId, subjectName, dayOfWeek, startTime, endTime, room } = req.body;

  try {
    let resolvedSubjectId = subjectId;
    const access = await assertClassAccess(req.user, classId);
    if (!access.ok) return deny(req, res, access.status, access.error);

    if (!resolvedSubjectId && subjectName && access.class?.schoolId) {
      const subject = await ensureSubject(access.class.schoolId, subjectName);
      resolvedSubjectId = subject?.id;
    }

    const result = await createTimetableEntry({
      classId,
      teacherId,
      subjectId: resolvedSubjectId,
      dayOfWeek,
      startTime,
      endTime,
      room,
    });

    if (req.accepts('html') && !req.xhr) {
      if (!result.ok) {
        const q = result.error === 'conflict' ? `&conflict=${encodeURIComponent(result.message)}` : '';
        return res.redirect(`/timetable?error=${encodeURIComponent(result.message || 'Erreur')}${q}&classId=${classId || ''}`);
      }
      return res.redirect(`/timetable?success=1&classId=${classId || ''}`);
    }

    return res.status(result.ok ? 201 : 400).json(result);
  } catch (err) {
    console.error(err);
    return deny(req, res, 500, 'Erreur lors de la création du créneau.');
  }
});

router.put('/update/:id', requireAuth, handleUpdate);
router.post('/update/:id', requireAuth, handleUpdate);

router.get('/class/:id', requireAuth, async (req, res) => {
  const access = await assertClassAccess(req.user, req.params.id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  const result = await getClassTimetable(req.params.id);
  return res.json(result);
});

router.get('/teacher/:id', requireAuth, async (req, res) => {
  const access = await assertTeacherAccess(req.user, req.params.id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  const result = await getTeacherTimetable(req.params.id);
  return res.json(result);
});

router.get('/student/:id', requireAuth, async (req, res) => {
  const access = await assertStudentAccess(req.user, req.params.id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  const result = await getStudentTimetable(req.params.id);
  return res.json(result);
});

router.get('/notify/:studentId', requireAuth, async (req, res) => {
  const access = await assertStudentAccess(req.user, req.params.studentId);
  if (!access.ok) return deny(req, res, access.status, access.error);
  if (!['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) {
    return deny(req, res, 403, 'Accès refusé.');
  }

  try {
    const result = await notifyParentsTimetable(req.params.studentId);
    if (req.accepts('html') && !req.xhr) {
      const clsId = access.student?.classId || '';
      if (!result.ok) {
        return res.redirect(`/timetable?error=${encodeURIComponent(result.message || 'Erreur')}&classId=${clsId}`);
      }
      return res.redirect(`/timetable?success=notified&classId=${clsId}`);
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return deny(req, res, 500, 'Erreur lors de l\'envoi aux parents.');
  }
});

router.post('/notify-class', requireAuth, async (req, res) => {
  if (!['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) {
    return deny(req, res, 403, 'Accès refusé.');
  }

  const { classId } = req.body;
  const access = await assertClassAccess(req.user, classId);
  if (!access.ok) return deny(req, res, access.status, access.error);

  try {
    const result = await notifyClassParents(classId);
    if (req.accepts('html') && !req.xhr) {
      if (!result.ok) {
        return res.redirect(`/timetable?error=${encodeURIComponent(result.message || 'Erreur')}&classId=${classId}`);
      }
      return res.redirect(`/timetable?success=class-notified&classId=${classId}`);
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return deny(req, res, 500, 'Erreur lors de l\'envoi aux parents.');
  }
});

router.get('/export/class/:id.pdf', requireAuth, async (req, res) => {
  const access = await assertClassAccess(req.user, req.params.id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  const pdf = await generateTimetablePDF(req.params.id, { mode: 'class' });
  if (!pdf.ok) return res.status(404).json(pdf);
  return res.redirect(pdf.url);
});

router.get('/export/class/:id.xlsx', requireAuth, async (req, res) => {
  const access = await assertClassAccess(req.user, req.params.id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  const xlsx = await generateTimetableExcel(req.params.id);
  if (!xlsx.ok) return res.status(404).json(xlsx);
  return res.redirect(xlsx.url);
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) {
    return deny(req, res, 403, 'Accès refusé.');
  }

  const { id } = req.params;
  const access = await assertTimetableEntryAccess(req.user, id);
  if (!access.ok) return deny(req, res, access.status, access.error);

  try {
    const result = await deleteTimetableEntry(id);
    if (req.accepts('html') && !req.xhr && !req.is('application/json')) {
      if (!result.ok) {
        return res.redirect(`/timetable?error=${encodeURIComponent(result.message || 'Erreur')}&classId=${access.entry.classId}`);
      }
      return res.redirect(`/timetable?success=1&classId=${access.entry.classId}`);
    }
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error(err);
    return deny(req, res, 500, 'Erreur lors de la suppression.');
  }
});

module.exports = router;
