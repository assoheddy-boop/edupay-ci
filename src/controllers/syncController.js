const { applyItem, resolveTeacherConflict } = require('../services/offlineActions');
const { TYPES, sortSyncItems } = require('../utils/offlineQueue');

const MAX_ITEMS = 50;

function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({ ok: false, error, ...extra });
}

function resultFromApply(id_local, result) {
  if (result.ok) {
    return {
      id_local,
      status: 'synced',
      serverId: result.id || null,
      entity: result.entity || null,
    };
  }
  if (result.error === 'conflict') {
    return {
      id_local,
      status: 'conflict',
      error: 'conflict',
      entity: result.entity || 'teacher',
      existing: result.existing || null,
    };
  }
  return {
    id_local,
    status: 'error',
    error: result.error || 'sync',
    entity: result.entity || null,
  };
}

async function syncBatch(req, res) {
  const items = req.body?.items;
  const incomingMap = req.body?.idMap && typeof req.body.idMap === 'object' ? { ...req.body.idMap } : {};
  const clientId = req.body?.clientId || null;

  if (!Array.isArray(items)) {
    return jsonError(res, 400, 'payload');
  }
  if (items.length > MAX_ITEMS) {
    return jsonError(res, 400, 'too_many');
  }

  const idMap = { ...incomingMap };
  const results = [];
  const ordered = sortSyncItems(items.filter((item) => item && TYPES.includes(item.type)));

  for (const item of ordered) {
    const id_local = item.id_local;
    if (!id_local) {
      results.push({ id_local: null, status: 'error', error: 'id_local' });
      continue;
    }
    try {
      const result = await applyItem({
        user: req.user,
        type: item.type,
        payload: item.payload || {},
        file: item.file || item.payload?.file || null,
        idMap,
      });
      const row = resultFromApply(id_local, result);
      if (result.ok && result.id) {
        idMap[id_local] = result.id;
        const temp = item.payload?.clientTempId;
        if (temp) idMap[temp] = result.id;
      }
      results.push(row);
    } catch (err) {
      console.error('[sync]', clientId, item.type, err);
      results.push({
        id_local,
        status: 'error',
        error: 'server',
        entity: item.type,
      });
    }
  }

  const skipped = items.filter((item) => item && !TYPES.includes(item.type));
  for (const item of skipped) {
    results.push({
      id_local: item.id_local || null,
      status: 'error',
      error: 'type',
      entity: item.type,
    });
  }

  return res.json({ ok: true, results, idMap });
}

async function resolveConflict(req, res) {
  const { id_local, action, type, existing } = req.body || {};
  if (!id_local || !action) return jsonError(res, 400, 'payload');

  const entity = type || 'teacher';
  if (entity !== 'teacher') {
    if (action === 'cancel') return res.json({ ok: true, id_local, status: 'cancelled' });
    if (action === 'merge') return res.json({ ok: true, id_local, status: 'synced', merged: true });
    return jsonError(res, 400, 'action');
  }

  try {
    const result = await resolveTeacherConflict({ user: req.user, action, existing });
    if (!result.ok) return jsonError(res, 400, result.error, { entity: result.entity });
    return res.json({
      ok: true,
      id_local,
      status: result.status,
      serverId: result.serverId || null,
      merged: Boolean(result.merged),
    });
  } catch (err) {
    console.error('[sync:resolve]', err);
    return jsonError(res, 500, 'server');
  }
}

module.exports = {
  syncBatch,
  resolveConflict,
};
