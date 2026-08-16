jest.mock('../src/config/database', () => ({
  student: { findMany: jest.fn() },
  absence: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  parentStudent: { findMany: jest.fn() },
  teacherClass: { findMany: jest.fn(), findFirst: jest.fn() },
}));

jest.mock('../services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

const prisma = require('../src/config/database');
const { sendNotification } = require('../services/NotificationService');
const {
  attendanceTypeFromStatus,
  submitAttendance,
} = require('../src/controllers/teacherController');

function mockRes() {
  return { redirect: jest.fn() };
}

describe('attendanceTypeFromStatus', () => {
  test('maps present, late and absent', () => {
    expect(attendanceTypeFromStatus('present')).toBeNull();
    expect(attendanceTypeFromStatus('late')).toBe('LATE');
    expect(attendanceTypeFromStatus('absent')).toBe('ABSENCE');
  });
});

describe('submitAttendance', () => {
  const students = [
    { id: 'stu-present', firstName: 'Awa', lastName: 'Kone', schoolId: 'sch-1' },
    { id: 'stu-late', firstName: 'Koffi', lastName: 'Yao', schoolId: 'sch-1' },
    { id: 'stu-absent', firstName: 'Aminata', lastName: 'Traore', schoolId: 'sch-1' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.student.findMany.mockResolvedValue(students);
    prisma.absence.findFirst.mockResolvedValue(null);
    prisma.absence.create.mockResolvedValue({ id: 'abs-1' });
    prisma.parentStudent.findMany.mockResolvedValue([
      { parent: { userId: 'user-parent-1' } },
    ]);
    prisma.teacherClass.findFirst.mockResolvedValue({ teacherId: 'teach-1', classId: 'class-1' });
  });

  test('records late and absence, skips present, notifies parents', async () => {
    const req = {
      user: { teacher: { id: 'teach-1' } },
      body: {
        classId: 'class-1',
        date: '2026-08-14',
        'status_stu-present': 'present',
        'status_stu-late': 'late',
        'status_stu-absent': 'absent',
      },
    };
    const res = mockRes();

    await submitAttendance(req, res);

    expect(prisma.absence.create).toHaveBeenCalledTimes(2);
    expect(prisma.absence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ studentId: 'stu-late', type: 'LATE' }),
    }));
    expect(prisma.absence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ studentId: 'stu-absent', type: 'ABSENCE' }),
    }));
    expect(sendNotification).toHaveBeenCalledWith(
      'user-parent-1',
      'late_reported',
      expect.stringContaining('Koffi'),
      { schoolId: 'sch-1' },
    );
    expect(sendNotification).toHaveBeenCalledWith(
      'user-parent-1',
      'absence_reported',
      expect.stringContaining('Aminata'),
      { schoolId: 'sch-1' },
    );
    expect(res.redirect).toHaveBeenCalledWith('/teacher/attendance?success=1');
  });

  test('clears an existing mark when the student is present', async () => {
    prisma.student.findMany.mockResolvedValue([students[0]]);
    prisma.absence.findFirst.mockResolvedValue({ id: 'abs-old', type: 'ABSENCE' });
    const req = {
      user: { teacher: { id: 'teach-1' } },
      body: {
        classId: 'class-1',
        date: '2026-08-14',
        'status_stu-present': 'present',
      },
    };
    const res = mockRes();

    await submitAttendance(req, res);

    expect(prisma.absence.delete).toHaveBeenCalledWith({ where: { id: 'abs-old' } });
    expect(prisma.absence.create).not.toHaveBeenCalled();
  });
});
