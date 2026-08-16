const {
  reduceQueue,
  queueSummary,
  isTempId,
  resolveEntityId,
  mapPayloadIds,
  payloadHasUnresolvedTempId,
  sortSyncItems,
} = require('../src/utils/offlineQueue');

describe('offlineQueue reducer', () => {
  test('enqueues a pending item', () => {
    const next = reduceQueue([], {
      type: 'enqueue',
      item: { id_local: 'a1', type: 'attendance', payload: { classId: 'c1' }, clientId: 'dev-1' },
    });
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe('pending');
    expect(next[0].type).toBe('attendance');
  });

  test('marks an item synced', () => {
    const start = reduceQueue([], { type: 'enqueue', item: { id_local: 'a1', type: 'class' } });
    const next = reduceQueue(start, { type: 'sync_ok', id_local: 'a1', serverId: 'clreal' });
    expect(next[0].status).toBe('synced');
    expect(next[0].serverId).toBe('clreal');
  });

  test('marks an item as error then conflict', () => {
    const start = reduceQueue([], { type: 'enqueue', item: { id_local: 't1', type: 'teacher' } });
    const err = reduceQueue(start, { type: 'sync_error', id_local: 't1', errorMessage: 'réseau' });
    expect(err[0].status).toBe('error');
    const conflict = reduceQueue(err, {
      type: 'conflict',
      id_local: 't1',
      entity: 'teacher',
      existing: { email: 'p@ecole.ci' },
    });
    expect(conflict[0].error).toBe('conflict');
    expect(conflict[0].existing.email).toBe('p@ecole.ci');
  });

  test('merge keeps the item synced; cancel removes it', () => {
    const start = reduceQueue([], { type: 'enqueue', item: { id_local: 't1', type: 'teacher' } });
    const conflict = reduceQueue(start, { type: 'conflict', id_local: 't1', existing: { id: 'u1' } });
    const merged = reduceQueue(conflict, { type: 'resolve_merge', id_local: 't1', serverId: 'u1' });
    expect(merged[0].status).toBe('synced');
    expect(merged[0].merged).toBe(true);
    const cancelled = reduceQueue(conflict, { type: 'resolve_cancel', id_local: 't1' });
    expect(cancelled).toHaveLength(0);
  });

  test('remove_synced drops finished items', () => {
    let items = reduceQueue([], { type: 'enqueue', item: { id_local: 'a', type: 'grade' } });
    items = reduceQueue(items, { type: 'enqueue', item: { id_local: 'b', type: 'grade' } });
    items = reduceQueue(items, { type: 'sync_ok', id_local: 'a' });
    expect(reduceQueue(items, { type: 'remove_synced' }).map((i) => i.id_local)).toEqual(['b']);
  });

  test('queueSummary picks ⏳ then ⚠️ then ✅', () => {
    const pending = reduceQueue([], { type: 'enqueue', item: { id_local: 'a', type: 'payment' } });
    expect(queueSummary(pending).icon).toBe('⏳');
    const err = reduceQueue(pending, { type: 'sync_error', id_local: 'a' });
    expect(queueSummary(err).icon).toBe('⚠️');
    const ok = reduceQueue(err, { type: 'sync_ok', id_local: 'a' });
    expect(queueSummary(ok).icon).toBe('✅');
  });
});

describe('temp ids', () => {
  test('detects tmp_ prefix and UUID, not Prisma cuids', () => {
    expect(isTempId('tmp_abc')).toBe(true);
    expect(isTempId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isTempId('clxyz0123456789abcd')).toBe(false);
  });

  test('resolveEntityId maps temps and refuses unmapped temps', () => {
    const idMap = { tmp_1: 'clrealclass' };
    expect(resolveEntityId('tmp_1', idMap)).toBe('clrealclass');
    expect(resolveEntityId('tmp_missing', idMap)).toBeNull();
    expect(resolveEntityId('clrealclass', idMap)).toBe('clrealclass');
  });

  test('mapPayloadIds rewrites classId, studentId, statuses and grades', () => {
    const mapped = mapPayloadIds('attendance', {
      classId: 'tmp_c',
      statuses: { tmp_s: 'absent', clstu: 'late' },
    }, { tmp_c: 'clclass', tmp_s: 'clstudent' });
    expect(mapped.classId).toBe('clclass');
    expect(mapped.statuses).toEqual({ clstudent: 'absent', clstu: 'late' });
  });

  test('payloadHasUnresolvedTempId is true until mapped', () => {
    expect(payloadHasUnresolvedTempId('student', { classId: 'tmp_c' })).toBe(true);
    const mapped = mapPayloadIds('student', { classId: 'tmp_c' }, { tmp_c: 'clclass' });
    expect(payloadHasUnresolvedTempId('student', mapped)).toBe(false);
  });

  test('sortSyncItems processes class before student before attendance', () => {
    const sorted = sortSyncItems([
      { type: 'attendance', createdAt: '2026-01-01' },
      { type: 'student', createdAt: '2026-01-01' },
      { type: 'class', createdAt: '2026-01-01' },
    ]);
    expect(sorted.map((i) => i.type)).toEqual(['class', 'student', 'attendance']);
  });
});
