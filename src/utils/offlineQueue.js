const STATUSES = ['pending', 'synced', 'error'];
const TYPES = ['attendance', 'grade', 'homework', 'class', 'student', 'teacher', 'payment'];
const TYPE_ORDER = ['class', 'teacher', 'student', 'attendance', 'grade', 'homework', 'payment'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTempId(id) {
  if (id == null) return false;
  const value = String(id).trim();
  if (!value) return false;
  if (value.startsWith('tmp_')) return true;
  if (UUID_RE.test(value)) return true;
  return false;
}

function resolveEntityId(id, idMap = {}) {
  if (id == null || id === '') return null;
  const value = String(id);
  if (idMap[value]) return idMap[value];
  if (isTempId(value)) return null;
  return value;
}

function mapPayloadIds(type, payload = {}, idMap = {}) {
  const next = { ...payload };
  if (next.classId) {
    const mapped = resolveEntityId(next.classId, idMap);
    next.classId = mapped || next.classId;
  }
  if (next.studentId) {
    const mapped = resolveEntityId(next.studentId, idMap);
    next.studentId = mapped || next.studentId;
  }
  if (next.statuses && typeof next.statuses === 'object') {
    next.statuses = Object.fromEntries(
      Object.entries(next.statuses).map(([key, value]) => [resolveEntityId(key, idMap) || key, value]),
    );
  }
  if (next.grades && typeof next.grades === 'object') {
    next.grades = Object.fromEntries(
      Object.entries(next.grades).map(([key, value]) => [resolveEntityId(key, idMap) || key, value]),
    );
  }
  return next;
}

function payloadHasUnresolvedTempId(type, payload = {}) {
  const ids = [];
  if (payload.classId) ids.push(payload.classId);
  if (payload.studentId) ids.push(payload.studentId);
  if (payload.statuses) ids.push(...Object.keys(payload.statuses));
  if (payload.grades) ids.push(...Object.keys(payload.grades));
  return ids.some((id) => isTempId(id));
}

function sortSyncItems(items = []) {
  return [...items].sort((a, b) => {
    const ao = TYPE_ORDER.indexOf(a.type);
    const bo = TYPE_ORDER.indexOf(b.type);
    const aOrder = ao === -1 ? 99 : ao;
    const bOrder = bo === -1 ? 99 : bo;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

function makeItem({ id_local, type, payload, clientId, createdAt, hasFile }) {
  return {
    id_local,
    type,
    payload: payload || {},
    status: 'pending',
    errorMessage: null,
    createdAt: createdAt || new Date().toISOString(),
    clientId,
    hasFile: Boolean(hasFile),
  };
}

function reduceQueue(items = [], action = {}) {
  const list = Array.isArray(items) ? items : [];
  switch (action.type) {
    case 'enqueue':
      return [...list, makeItem(action.item || action)];
    case 'sync_ok':
      return list.map((item) => (
        item.id_local === action.id_local
          ? {
            ...item,
            status: 'synced',
            errorMessage: null,
            serverId: action.serverId || item.serverId,
            entity: action.entity || item.entity,
          }
          : item
      ));
    case 'sync_error':
      return list.map((item) => (
        item.id_local === action.id_local
          ? {
            ...item,
            status: 'error',
            errorMessage: action.errorMessage || action.error || 'Erreur de synchronisation',
            entity: action.entity || item.entity,
            existing: action.existing || item.existing,
          }
          : item
      ));
    case 'conflict':
      return list.map((item) => (
        item.id_local === action.id_local
          ? {
            ...item,
            status: 'error',
            errorMessage: action.errorMessage || 'conflict',
            error: 'conflict',
            entity: action.entity || 'teacher',
            existing: action.existing || null,
          }
          : item
      ));
    case 'resolve_merge':
      return list.map((item) => (
        item.id_local === action.id_local
          ? {
            ...item,
            status: 'synced',
            errorMessage: null,
            error: null,
            serverId: action.serverId || item.existing?.id,
            merged: true,
          }
          : item
      ));
    case 'resolve_cancel':
      return list.filter((item) => item.id_local !== action.id_local);
    case 'remove_synced':
      return list.filter((item) => item.status !== 'synced');
    default:
      return list;
  }
}

function queueSummary(items = []) {
  const pending = items.filter((item) => item.status === 'pending').length;
  const errors = items.filter((item) => item.status === 'error').length;
  const conflicts = items.filter((item) => item.error === 'conflict' || item.errorMessage === 'conflict').length;
  const synced = items.filter((item) => item.status === 'synced').length;
  let icon = '✅';
  if (errors || conflicts) icon = '⚠️';
  else if (pending) icon = '⏳';
  return { pending, errors, conflicts, synced, icon };
}

module.exports = {
  STATUSES,
  TYPES,
  TYPE_ORDER,
  isTempId,
  resolveEntityId,
  mapPayloadIds,
  payloadHasUnresolvedTempId,
  sortSyncItems,
  makeItem,
  reduceQueue,
  queueSummary,
};
