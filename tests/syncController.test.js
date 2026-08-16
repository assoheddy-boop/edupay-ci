jest.mock('../src/services/offlineActions', () => ({
  applyItem: jest.fn(),
  resolveTeacherConflict: jest.fn(),
}));

const { applyItem, resolveTeacherConflict } = require('../src/services/offlineActions');
const { syncBatch, resolveConflict } = require('../src/controllers/syncController');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('syncController.syncBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a non-array payload', async () => {
    const res = mockRes();
    await syncBatch({ user: { id: 'u1' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'payload' });
  });

  test('applies items in dependency order and returns idMap', async () => {
    applyItem
      .mockResolvedValueOnce({ ok: true, id: 'clreal', entity: 'class' })
      .mockResolvedValueOnce({ ok: true, id: 'stureal', entity: 'student' });
    const res = mockRes();
    await syncBatch({
      user: { id: 'u1', role: 'SCHOOL_ADMIN' },
      body: {
        clientId: 'dev-1',
        items: [
          {
            id_local: 's1',
            type: 'student',
            payload: { firstName: 'Awa', lastName: 'Kone', classId: 'tmp_c', clientTempId: 'tmp_s' },
            createdAt: '2026-01-02',
          },
          {
            id_local: 'c1',
            type: 'class',
            payload: { name: 'CM2', level: 'CM2', clientTempId: 'tmp_c' },
            createdAt: '2026-01-01',
          },
        ],
      },
    }, res);

    expect(applyItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'class' }));
    expect(applyItem).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'student',
      idMap: expect.objectContaining({ c1: 'clreal', tmp_c: 'clreal' }),
    }));
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      results: [
        { id_local: 'c1', status: 'synced', serverId: 'clreal', entity: 'class' },
        { id_local: 's1', status: 'synced', serverId: 'stureal', entity: 'student' },
      ],
      idMap: { c1: 'clreal', tmp_c: 'clreal', s1: 'stureal', tmp_s: 'stureal' },
    });
  });

  test('returns conflict so the UI can merge or cancel a teacher', async () => {
    applyItem.mockResolvedValue({
      ok: false,
      error: 'conflict',
      entity: 'teacher',
      existing: { email: 'prof@ecole.ci', field: 'email' },
    });
    const res = mockRes();
    await syncBatch({
      user: { id: 'u1' },
      body: {
        items: [{ id_local: 't1', type: 'teacher', payload: { email: 'prof@ecole.ci', firstName: 'A', lastName: 'B' } }],
      },
    }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      id_local: 't1',
      status: 'conflict',
      error: 'conflict',
      entity: 'teacher',
    });
  });

  test('unknown types are reported as errors', async () => {
    const res = mockRes();
    await syncBatch({
      user: { id: 'u1' },
      body: { items: [{ id_local: 'x1', type: 'spaceship', payload: {} }] },
    }, res);
    expect(applyItem).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].results[0].error).toBe('type');
  });
});

describe('syncController.resolveConflict', () => {
  beforeEach(() => jest.clearAllMocks());

  test('merge posts through resolveTeacherConflict', async () => {
    resolveTeacherConflict.mockResolvedValue({ ok: true, status: 'synced', serverId: 'teach-1', merged: true });
    const res = mockRes();
    await resolveConflict({
      user: { id: 'u1' },
      body: { id_local: 't1', action: 'merge', type: 'teacher', existing: { id: 'u-old' } },
    }, res);
    expect(resolveTeacherConflict).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      id_local: 't1',
      status: 'synced',
      serverId: 'teach-1',
      merged: true,
    });
  });

  test('cancel returns cancelled', async () => {
    resolveTeacherConflict.mockResolvedValue({ ok: true, status: 'cancelled' });
    const res = mockRes();
    await resolveConflict({
      user: { id: 'u1' },
      body: { id_local: 't1', action: 'cancel', type: 'teacher' },
    }, res);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      id_local: 't1',
      status: 'cancelled',
      serverId: null,
      merged: false,
    });
  });
});
