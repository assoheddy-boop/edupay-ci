jest.mock('../src/config/database', () => ({
  timetable: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  class: { findUnique: jest.fn() },
  teacher: { findUnique: jest.fn() },
  subject: { findUnique: jest.fn() },
  student: { findUnique: jest.fn() },
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
        subject: { name: 'Maths' },
      });

      const result = await createTimetableEntry(baseArgs);
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
