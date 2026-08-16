jest.mock('../src/config/database', () => ({
  timetable: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  class: { findUnique: jest.fn() },
  teacher: { findUnique: jest.fn() },
  subject: { findUnique: jest.fn() },
  student: { findUnique: jest.fn(), findMany: jest.fn() },
}));

jest.mock('../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../services/export', () => ({
  generateTimetablePDF: jest.fn().mockResolvedValue({ ok: true, url: '/uploads/exports/test.pdf' }),
}));

const prisma = require('../src/config/database');
const {
  VALID_DAYS,
  parseTime,
  validateTimes,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getClassTimetable,
  getStudentTimetable,
} = require('../services/TimetableService');

describe('TimetableService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('VALID_DAYS covers CI school week Mon-Sat', () => {
    expect(VALID_DAYS).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']);
  });

  test('parseTime and validateTimes', () => {
    expect(parseTime('08:00')).toBe(480);
    expect(parseTime('invalid')).toBeNull();
    expect(validateTimes('08:00', '09:00')).toEqual({ ok: true, start: 480, end: 540 });
    expect(validateTimes('09:00', '08:00').ok).toBe(false);
  });

  describe('createTimetableEntry', () => {
    const baseArgs = {
      classId: 'class-1',
      teacherId: 'teacher-1',
      subjectId: 'subject-1',
      dayOfWeek: 'Lundi',
      startTime: '08:00',
      endTime: '09:00',
    };

    test('rejects missing data', async () => {
      const result = await createTimetableEntry({});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('data');
    });

    test('creates entry when no conflict', async () => {
      prisma.class.findUnique.mockResolvedValue({ id: 'class-1', schoolId: 'school-1' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' });
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', schoolId: 'school-1', name: 'Maths' });
      prisma.timetable.findMany.mockResolvedValue([]);
      prisma.timetable.create.mockResolvedValue({
        id: 'tt-1',
        ...baseArgs,
        classId: 'class-1',
        subject: { name: 'Maths' },
      });
      prisma.student.findMany.mockResolvedValue([]);

      const result = await createTimetableEntry({ ...baseArgs, notifyParents: false });
      expect(result.ok).toBe(true);
      expect(result.entry.id).toBe('tt-1');
      expect(prisma.timetable.create).toHaveBeenCalled();
    });

    test('returns conflict when class slot overlaps', async () => {
      prisma.class.findUnique.mockResolvedValue({ id: 'class-1', schoolId: 'school-1' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' });
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', schoolId: 'school-1', name: 'Maths' });
      prisma.timetable.findMany.mockResolvedValue([
        {
          id: 'existing',
          classId: 'class-1',
          teacherId: 'teacher-2',
          dayOfWeek: 'Lundi',
          startTime: '08:30',
          endTime: '09:30',
          subject: { name: 'Français' },
        },
      ]);

      const result = await createTimetableEntry(baseArgs);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('conflict');
      expect(result.message).toMatch(/Conflit de classe/);
      expect(prisma.timetable.create).not.toHaveBeenCalled();
    });

    test('returns conflict when room overlaps at same school', async () => {
      prisma.class.findUnique.mockResolvedValue({ id: 'class-1', schoolId: 'school-1' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1', schoolId: 'school-1' });
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', schoolId: 'school-1', name: 'Maths' });
      prisma.timetable.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'room-conflict',
            classId: 'class-2',
            teacherId: 'teacher-3',
            dayOfWeek: 'Lundi',
            startTime: '08:00',
            endTime: '09:00',
            room: 'A12',
            schoolId: 'school-1',
            subject: { name: 'Physique' },
          },
        ]);

      const result = await createTimetableEntry({ ...baseArgs, room: 'A12' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('conflict');
      expect(result.message).toMatch(/Conflit de salle/);
    });
  });

  describe('updateTimetableEntry', () => {
    const existing = {
      id: 'tt-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      subjectId: 'subject-1',
      dayOfWeek: 'Lundi',
      startTime: '08:00',
      endTime: '09:00',
      room: null,
      schoolId: 'school-1',
    };

    test('updates entry when no conflict', async () => {
      prisma.timetable.findUnique.mockResolvedValue(existing);
      prisma.timetable.findMany.mockResolvedValue([]);
      prisma.class.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.teacher.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.subject.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.timetable.update.mockResolvedValue({
        ...existing,
        startTime: '09:00',
        endTime: '10:00',
        subject: { name: 'Maths' },
        teacher: { user: { lastName: 'Kone', firstName: 'Awa' } },
        class: { name: '6ème A' },
      });
      prisma.student.findMany.mockResolvedValue([]);

      const result = await updateTimetableEntry('tt-1', {
        startTime: '09:00',
        endTime: '10:00',
        notifyParents: false,
      });
      expect(result.ok).toBe(true);
      expect(prisma.timetable.update).toHaveBeenCalled();
    });

    test('returns conflict when teacher slot overlaps', async () => {
      prisma.timetable.findUnique.mockResolvedValue(existing);
      prisma.class.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.teacher.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.subject.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.timetable.findMany.mockResolvedValue([
        {
          id: 'other',
          classId: 'class-2',
          teacherId: 'teacher-1',
          dayOfWeek: 'Mardi',
          startTime: '10:00',
          endTime: '11:00',
          subject: { name: 'Histoire' },
          teacher: { user: { lastName: 'Kone', firstName: 'Awa' } },
        },
      ]);

      const result = await updateTimetableEntry('tt-1', {
        dayOfWeek: 'Mardi',
        startTime: '10:30',
        endTime: '11:30',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('conflict');
      expect(result.message).toMatch(/Conflit pour/);
      expect(prisma.timetable.update).not.toHaveBeenCalled();
    });

    test('returns not_found when entry missing', async () => {
      prisma.timetable.findUnique.mockResolvedValue(null);
      const result = await updateTimetableEntry('missing', { startTime: '09:00', endTime: '10:00' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('not_found');
    });

    test('refuses to move a slot onto another school class', async () => {
      prisma.timetable.findUnique.mockResolvedValue(existing);
      prisma.class.findUnique.mockResolvedValue({ schoolId: 'school-other' });
      prisma.teacher.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      prisma.subject.findUnique.mockResolvedValue({ schoolId: 'school-1' });
      const result = await updateTimetableEntry('tt-1', { classId: 'class-foreign' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('school');
      expect(prisma.timetable.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteTimetableEntry', () => {
    test('deletes entry and returns classId', async () => {
      prisma.timetable.findUnique.mockResolvedValue({
        id: 'tt-1',
        classId: 'class-1',
      });
      prisma.timetable.delete.mockResolvedValue({});
      prisma.student.findMany.mockResolvedValue([]);

      const result = await deleteTimetableEntry('tt-1', { notifyParents: false });
      expect(result.ok).toBe(true);
      expect(result.classId).toBe('class-1');
      expect(prisma.timetable.delete).toHaveBeenCalledWith({ where: { id: 'tt-1' } });
    });

    test('returns not_found when entry missing', async () => {
      prisma.timetable.findUnique.mockResolvedValue(null);
      const result = await deleteTimetableEntry('missing');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('not_found');
      expect(prisma.timetable.delete).not.toHaveBeenCalled();
    });
  });

  describe('getClassTimetable', () => {
    test('returns entries for class', async () => {
      prisma.timetable.findMany.mockResolvedValue([
        { id: '1', dayOfWeek: 'Lundi', startTime: '08:00', endTime: '09:00' },
      ]);
      const result = await getClassTimetable('class-1');
      expect(result.ok).toBe(true);
      expect(result.entries).toHaveLength(1);
      expect(prisma.timetable.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { classId: 'class-1' },
      }));
    });
  });

  describe('getStudentTimetable', () => {
    test('loads timetable via student classId', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        classId: 'class-1',
        firstName: 'Aya',
        lastName: 'Kouassi',
      });
      prisma.timetable.findMany.mockResolvedValue([
        { id: '1', classId: 'class-1', dayOfWeek: 'Mardi', startTime: '10:00', endTime: '11:00' },
      ]);

      const result = await getStudentTimetable('student-1');
      expect(result.ok).toBe(true);
      expect(result.classId).toBe('class-1');
      expect(result.entries).toHaveLength(1);
      expect(prisma.timetable.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { classId: 'class-1' },
      }));
    });

    test('returns error when student missing', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      const result = await getStudentTimetable('missing');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('student');
    });
  });
});
