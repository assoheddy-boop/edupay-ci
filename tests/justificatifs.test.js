jest.mock('../src/config/database', () => ({
  absence: { findFirst: jest.fn(), update: jest.fn() },
  absenceJustification: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  parentStudent: { findMany: jest.fn() },
}));

jest.mock('../services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../services/StorageService', () => ({
  storeMulterFile: jest.fn().mockResolvedValue({ url: '/uploads/justificatifs/proof.jpg' }),
}));

jest.mock('../services/PaymentService', () => ({
  inspectProofFile: jest.fn().mockReturnValue({ ok: true, mime: 'image/jpeg' }),
}));

jest.mock('../src/utils/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../src/config/database');
const { sendNotification } = require('../services/NotificationService');
const { storeMulterFile } = require('../services/StorageService');
const { inspectProofFile } = require('../services/PaymentService');
const {
  typeLabel,
  statusLabel,
  parseAction,
  submitJustification,
  reviewJustification,
} = require('../src/services/justificationService');
const { submit, review } = require('../src/controllers/justificationController');

const PARENT = { id: 'parent-1', userId: 'user-parent-1' };
const SCHOOL = { id: 'school-1', name: 'IGEST Yopougon' };
const STUDENT = {
  id: 'stu-1',
  schoolId: 'school-1',
  firstName: 'Kofi',
  lastName: 'Yao',
  class: { schoolId: 'school-1', name: '6e A' },
};
const ABSENCE = {
  id: 'abs-1',
  studentId: STUDENT.id,
  type: 'ABSENCE',
  date: new Date('2026-08-18'),
  justified: false,
  justificationStatus: 'NONE',
  student: STUDENT,
};
const JUSTIFICATION = {
  id: 'just-1',
  absenceId: ABSENCE.id,
  parentId: PARENT.id,
  studentId: STUDENT.id,
  schoolId: SCHOOL.id,
  motif: 'Maladie',
  status: 'PENDING',
  absence: ABSENCE,
  parent: PARENT,
  student: STUDENT,
};

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
}

describe('justificatif labels', () => {
  test('maps LATE and statuses in French', () => {
    expect(typeLabel('LATE')).toBe('Retard');
    expect(typeLabel('ABSENCE')).toBe('Absence');
    expect(statusLabel('PENDING')).toBe('En attente');
    expect(statusLabel('ACCEPTED')).toBe('Accepté');
    expect(parseAction('accept')).toBe('ACCEPTED');
    expect(parseAction('refuser')).toBe('REFUSED');
  });
});

describe('submitJustification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.absence.findFirst.mockResolvedValue(ABSENCE);
    prisma.absenceJustification.create.mockResolvedValue(JUSTIFICATION);
    prisma.absence.update.mockResolvedValue({ ...ABSENCE, justificationStatus: 'PENDING' });
    inspectProofFile.mockReturnValue({ ok: true, mime: 'image/jpeg' });
  });

  test('submits a motif and optional photo for a linked child', async () => {
    const file = { originalname: 'certificat.jpg', mimetype: 'image/jpeg', size: 1200 };
    const result = await submitJustification({
      parent: PARENT,
      absenceId: ABSENCE.id,
      motif: 'Maladie',
      file,
    });

    expect(result.ok).toBe(true);
    expect(storeMulterFile).toHaveBeenCalledWith(file, 'justificatifs');
    expect(prisma.absenceJustification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        absenceId: ABSENCE.id,
        parentId: PARENT.id,
        studentId: STUDENT.id,
        schoolId: SCHOOL.id,
        motif: 'Maladie',
        status: 'PENDING',
      }),
    }));
    expect(prisma.absence.update).toHaveBeenCalledWith({
      where: { id: ABSENCE.id },
      data: { justified: false, justificationStatus: 'PENDING' },
    });
  });

  test('returns 403 when another parent tries to justify the absence', async () => {
    prisma.absence.findFirst.mockResolvedValue(null);
    const result = await submitJustification({
      parent: { id: 'parent-other' },
      absenceId: ABSENCE.id,
      motif: 'Voyage',
    });

    expect(result).toEqual({ ok: false, error: 'forbidden', status: 403 });
    expect(prisma.absenceJustification.create).not.toHaveBeenCalled();
  });
});

describe('reviewJustification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.absenceJustification.findFirst.mockResolvedValue(JUSTIFICATION);
    prisma.absenceJustification.update.mockResolvedValue({ ...JUSTIFICATION, status: 'ACCEPTED' });
    prisma.absence.update.mockResolvedValue({ ...ABSENCE, justified: true, justificationStatus: 'ACCEPTED' });
  });

  test('school accept marks the absence justified and notifies the parent', async () => {
    const result = await reviewJustification({
      school: SCHOOL,
      id: JUSTIFICATION.id,
      action: 'accept',
      user: { id: 'admin-1' },
    });

    expect(result).toEqual({ ok: true, status: 'ACCEPTED' });
    expect(prisma.absenceJustification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: JUSTIFICATION.id, schoolId: SCHOOL.id },
    }));
    expect(prisma.absence.update).toHaveBeenCalledWith({
      where: { id: ABSENCE.id },
      data: { justified: true, justificationStatus: 'ACCEPTED' },
    });
    expect(sendNotification).toHaveBeenCalledWith(
      PARENT.userId,
      'justification_accepted',
      expect.stringContaining('Kofi'),
      { schoolId: SCHOOL.id },
    );
  });

  test('returns 403 when the justificatif belongs to another school', async () => {
    prisma.absenceJustification.findFirst.mockResolvedValue(null);
    const result = await reviewJustification({
      school: SCHOOL,
      id: 'just-other',
      action: 'accept',
    });
    expect(result.status).toBe(403);
    expect(prisma.absence.update).not.toHaveBeenCalled();
  });
});

describe('justificatifs HTTP', () => {
  beforeEach(() => jest.clearAllMocks());

  test('POST submit returns 403 for another parent', async () => {
    prisma.absence.findFirst.mockResolvedValue(null);
    const req = {
      user: { parentProfile: { id: 'parent-other' } },
      body: { absenceId: ABSENCE.id, motif: 'Voyage' },
    };
    const res = mockRes();

    await submit(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.absenceJustification.create).not.toHaveBeenCalled();
  });

  test('POST review accept returns 403 for another school', async () => {
    prisma.absenceJustification.findFirst.mockResolvedValue(null);
    const req = {
      user: { school: SCHOOL, id: 'admin-1' },
      params: { id: 'just-other' },
      body: { action: 'accept' },
      ip: '127.0.0.1',
    };
    const res = mockRes();

    await review(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.absence.update).not.toHaveBeenCalled();
  });
});
