jest.mock('../src/config/database', () => ({
  homework: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  homeworkSubmission: { create: jest.fn() },
  teacherClass: { findFirst: jest.fn() },
  student: { findMany: jest.fn() },
}));

jest.mock('../services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../services/StorageService', () => ({
  storeMulterFile: jest.fn(),
}));

const prisma = require('../src/config/database');
const { sendNotification } = require('../services/NotificationService');
const {
  normalizeKind,
  KIND,
  defaultTitle,
  parentPublishMessage,
  parseRemindAt,
  eveningBeforeDue,
  isEligibleForReminder,
  reminderQuery,
  summarizeHomeworkStats,
  homeworkExportRows,
  buildHomeworkCreateData,
  hasHomeworkContent,
  toCalendarEvent,
} = require('../src/services/homeworkService');
const { applyHomework } = require('../src/services/offlineActions');
const { homeworkReminders } = require('../src/jobs/homeworkReminders');
const {
  generateHomeworkCalendarPDF,
  generateHomeworkCalendarExcel,
  homeworkExportRows: exportRowsFromService,
} = require('../services/export');

describe('homework kind defaults', () => {
  test('defaults to HOMEWORK and maps contrôle/test', () => {
    expect(normalizeKind()).toBe(KIND.HOMEWORK);
    expect(normalizeKind('devoir')).toBe(KIND.HOMEWORK);
    expect(normalizeKind('TEST')).toBe(KIND.TEST);
    expect(normalizeKind('contrôle')).toBe(KIND.TEST);
    expect(normalizeKind('CONTROLE')).toBe(KIND.TEST);
  });

  test('builds a title from subject + kind when title is empty', () => {
    expect(defaultTitle({ kind: 'TEST', subject: 'Maths' })).toBe('Contrôle de Maths');
    expect(defaultTitle({ kind: 'HOMEWORK', subject: 'Français' })).toBe('Devoir de Français');
    expect(defaultTitle({ title: 'Page 42' })).toBe('Page 42');
  });

  test('publish messages distinguish devoir and contrôle', () => {
    const due = new Date('2026-08-20T00:00:00Z');
    expect(parentPublishMessage({
      kind: 'TEST',
      subject: 'maths',
      dueDate: due,
      studentName: 'Awa',
    })).toMatch(/Contrôle de maths le /);
    expect(parentPublishMessage({
      kind: 'HOMEWORK',
      subject: 'maths',
      dueDate: due,
      studentName: 'Awa',
    })).toMatch(/Devoir de maths/);
  });
});

describe('homework reminder scheduling', () => {
  test('remindEvening sets 18h Abidjan the day before due date', () => {
    const due = new Date('2026-08-21T00:00:00Z');
    const remindAt = parseRemindAt({ remindEvening: '1' }, due);
    expect(remindAt.toISOString()).toBe(eveningBeforeDue(due).toISOString());
    expect(remindAt.getUTCHours()).toBe(18);
  });

  test('explicit remindAt wins over the evening checkbox', () => {
    const due = new Date('2026-08-21T00:00:00Z');
    const remindAt = parseRemindAt({ remindAt: '2026-08-19T10:00', remindEvening: '1' }, due);
    expect(remindAt).toEqual(new Date('2026-08-19T10:00'));
  });

  test('isEligibleForReminder is false after remindedAt', () => {
    const now = new Date('2026-08-16T18:30:00Z');
    expect(isEligibleForReminder({
      remindAt: new Date('2026-08-16T18:00:00Z'),
      remindedAt: now,
      dueDate: new Date('2026-08-17T00:00:00Z'),
    }, now)).toBe(false);
  });

  test('dueDate tomorrow with no remindAt is eligible', () => {
    const now = new Date('2026-08-16T08:00:00Z');
    expect(isEligibleForReminder({
      remindAt: null,
      remindedAt: null,
      dueDate: new Date('2026-08-17T00:00:00Z'),
    }, now)).toBe(true);
  });

  test('reminderQuery looks at remindAt window or tomorrow dueDate', () => {
    const now = new Date('2026-08-16T08:00:00Z');
    const q = reminderQuery(now);
    expect(q.remindedAt).toBeNull();
    expect(q.OR).toHaveLength(2);
    expect(q.OR[0].remindAt.lte).toEqual(now);
  });
});

describe('homework reminder job idempotency', () => {
  beforeEach(() => jest.clearAllMocks());

  const homework = {
    id: 'hw-1',
    kind: 'HOMEWORK',
    subject: 'Maths',
    title: 'Devoir de Maths',
    dueDate: new Date('2026-08-17T00:00:00Z'),
    remindAt: new Date('2026-08-16T18:00:00Z'),
    remindedAt: null,
    class: {
      students: [
        { firstName: 'Awa', parents: [{ parent: { userId: 'parent-1' } }] },
      ],
    },
  };

  test('notifies once then skips when remindedAt is already set', async () => {
    const now = new Date('2026-08-16T18:05:00Z');
    prisma.homework.findMany.mockResolvedValue([homework]);
    prisma.homework.updateMany.mockResolvedValue({ count: 1 });

    const first = await homeworkReminders({ now });
    expect(first.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      'parent-1',
      'homework_reminder',
      expect.stringContaining('Rappel'),
    );
    expect(prisma.homework.updateMany).toHaveBeenCalledWith({
      where: { id: 'hw-1', remindedAt: null },
      data: { remindedAt: now },
    });

    prisma.homework.updateMany.mockResolvedValue({ count: 0 });
    const second = await homeworkReminders({ now });
    expect(second.sent).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe('homework sync payload', () => {
  test('create data keeps kind TEST and remindAt', () => {
    const data = buildHomeworkCreateData({
      classId: 'cl1',
      teacherId: 't1',
      payload: {
        subject: 'Maths',
        kind: 'TEST',
        dueDate: '2026-08-20',
        remindAt: '2026-08-19T18:00',
        description: 'Chapitre 3',
      },
    });
    expect(data.kind).toBe('TEST');
    expect(data.subject).toBe('Maths');
    expect(data.title).toBe('Contrôle de Maths');
    expect(data.remindAt).toBeInstanceOf(Date);
    expect(data.classId).toBe('cl1');
  });

  test('hasHomeworkContent requires title or subject', () => {
    expect(hasHomeworkContent({})).toBe(false);
    expect(hasHomeworkContent({ subject: 'SVT' })).toBe(true);
    expect(hasHomeworkContent({ title: 'Exos' })).toBe(true);
  });

  test('applyHomework persists kind and remindAt from the offline queue payload', async () => {
    prisma.teacherClass.findFirst.mockResolvedValue({ teacherId: 't1', classId: 'cl1' });
    prisma.homework.create.mockResolvedValue({ id: 'hw-sync' });
    prisma.student.findMany.mockResolvedValue([]);

    const result = await applyHomework({
      user: { role: 'TEACHER', teacher: { id: 't1' } },
      payload: {
        classId: 'cl1',
        subject: 'Histoire',
        kind: 'TEST',
        dueDate: '2026-08-22',
        remindEvening: '1',
      },
    });

    expect(result).toEqual({ ok: true, id: 'hw-sync', entity: 'homework' });
    expect(prisma.homework.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: 'cl1',
        teacherId: 't1',
        kind: 'TEST',
        subject: 'Histoire',
        title: 'Contrôle de Histoire',
        remindAt: expect.any(Date),
      }),
    });
  });

  test('calendar events use all-day dates and kind colors', () => {
    const event = toCalendarEvent({
      id: 'hw-1',
      kind: 'TEST',
      subject: 'Maths',
      title: 'Contrôle de Maths',
      dueDate: new Date('2026-08-20T00:00:00Z'),
      class: { name: 'CM2 A' },
    });
    expect(event.start).toBe('2026-08-20');
    expect(event.allDay).toBe(true);
    expect(event.color).toBe('#e53935');
  });
});

describe('homework export', () => {
  test('rows and stats split tests vs homework by subject', () => {
    const list = [
      { kind: 'HOMEWORK', subject: 'Maths', title: 'Exos', dueDate: new Date('2026-08-18'), class: { name: 'CM2' } },
      { kind: 'TEST', subject: 'Maths', title: 'Contrôle', dueDate: new Date('2026-08-20'), class: { name: 'CM2' } },
      { kind: 'HOMEWORK', subject: 'Français', title: 'Rédac', dueDate: new Date('2026-08-19'), class: { name: 'CM1' } },
    ];
    const stats = summarizeHomeworkStats(list);
    expect(stats).toMatchObject({ total: 3, homework: 2, test: 1 });
    expect(stats.bySubject.find((s) => s.subject === 'Maths')).toMatchObject({ homework: 1, test: 1, total: 2 });
    const rows = homeworkExportRows(list);
    expect(rows[0].kind).toBe('Devoir');
    expect(rows[1].kind).toBe('Contrôle');
    expect(exportRowsFromService(list)).toEqual(rows);
  });

  test('PDF/Excel exporters reject a missing schoolId', async () => {
    await expect(generateHomeworkCalendarPDF()).resolves.toEqual({ ok: false, error: 'school' });
    await expect(generateHomeworkCalendarExcel()).resolves.toEqual({ ok: false, error: 'school' });
  });
});
