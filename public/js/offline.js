(function () {
  const DB_NAME = 'educonnect-offline';
  const DB_VERSION = 1;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const SYNC_URL = '/api/v1/sync';
  const RESOLVE_URL = '/api/v1/sync/resolve';
  const RETRY_MS = 30000;

  const TYPE_LABELS = {
    attendance: 'Appel',
    grade: 'Notes',
    homework: 'Devoir / contrôle',
    class: 'Classe',
    student: 'Élève',
    teacher: 'Enseignant',
    payment: 'Paiement',
  };

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/x/g, () =>
      (Math.random() * 16 | 0).toString(16));
  }

  function clientId() {
    try {
      let id = localStorage.getItem('educonnect-client-id');
      if (!id) {
        id = uuid();
        localStorage.setItem('educonnect-client-id', id);
      }
      return id;
    } catch {
      return uuid();
    }
  }

  function formActionPath(form) {
    try {
      return new URL(form.getAttribute('action') || form.action, window.location.origin).pathname;
    } catch {
      return form.getAttribute('action') || '';
    }
  }

  function matchRule(form) {
    const typed = form.getAttribute('data-offline-queue');
    const path = formActionPath(form);
    if (typed) {
      return {
        type: typed,
        file: form.getAttribute('data-offline-file') || null,
        bulk: form.getAttribute('data-offline-bulk') === '1',
      };
    }
    if (path === '/teacher/attendance') return { type: 'attendance' };
    if (path === '/teacher/grades') return { type: 'grade' };
    if (path === '/teacher/bulk-grades') return { type: 'grade', bulk: true };
    if (path === '/teacher/homeworks') return { type: 'homework', file: 'attachment' };
    if (path === '/school/classes') return { type: 'class' };
    if (path === '/school/students') return { type: 'student', file: 'photo' };
    if (path === '/school/teachers/invite') return { type: 'teacher', file: 'photo' };
    if (path === '/parent/payments') return { type: 'payment', file: 'proof' };
    return null;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB indisponible'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id_local' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id_local' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllQueue() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readonly');
      const req = tx.objectStore('queue').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function putItem(item) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteItem(idLocal) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'files'], 'readwrite');
      tx.objectStore('queue').delete(idLocal);
      tx.objectStore('files').delete(idLocal);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function putFile(idLocal, blob, meta) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({
        id_local: idLocal,
        blob,
        name: meta.name,
        type: meta.type,
        size: meta.size,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getFile(idLocal) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(idLocal);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getIdMap() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get('idMap');
      req.onsuccess = () => resolve((req.result && req.result.value) || {});
      req.onerror = () => reject(req.error);
    });
  }

  async function setIdMap(idMap) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'idMap', value: idMap || {} });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function formToPayload(rule, form) {
    const fd = new FormData(form);
    const raw = {};
    fd.forEach((value, key) => {
      if (typeof File !== 'undefined' && value instanceof File) return;
      raw[key] = value;
    });

    if (rule.type === 'attendance') {
      const statuses = {};
      Object.keys(raw).forEach((key) => {
        if (key.startsWith('status_')) statuses[key.slice(7)] = raw[key];
      });
      return { classId: raw.classId, date: raw.date, statuses };
    }

    if (rule.type === 'grade' && (rule.bulk || formActionPath(form) === '/teacher/bulk-grades')) {
      const grades = {};
      Object.keys(raw).forEach((key) => {
        if (key.startsWith('grade_')) grades[key.slice(6)] = raw[key];
      });
      return {
        classId: raw.classId,
        subject: raw.subject,
        period: raw.period,
        maxValue: raw.maxValue,
        grades,
      };
    }

    if (rule.type === 'grade') {
      return {
        studentId: raw.studentId,
        subject: raw.subject,
        value: raw.value,
        maxValue: raw.maxValue,
        period: raw.period,
        comment: raw.comment,
      };
    }

    if (rule.type === 'homework') {
      return {
        classId: raw.classId,
        title: raw.title,
        description: raw.description,
        dueDate: raw.dueDate,
        kind: raw.kind,
        subject: raw.subject,
        remindAt: raw.remindAt,
        remindEvening: raw.remindEvening,
      };
    }

    if (rule.type === 'class') {
      const clientTempId = `tmp_${uuid()}`;
      return {
        name: raw.name,
        level: raw.level,
        schoolYear: raw.schoolYear,
        clientTempId,
      };
    }

    if (rule.type === 'student') {
      return {
        firstName: raw.firstName,
        lastName: raw.lastName,
        matricule: raw.matricule,
        classId: raw.classId,
        birthDate: raw.birthDate,
        gender: raw.gender,
      };
    }

    if (rule.type === 'teacher') {
      return {
        firstName: raw.firstName,
        lastName: raw.lastName,
        email: raw.email,
        phone: raw.phone,
        subject: raw.subject,
        password: raw.password,
      };
    }

    if (rule.type === 'payment') {
      return {
        studentId: raw.studentId,
        amount: raw.amount,
        feeTypeId: raw.feeTypeId,
        reference: raw.reference,
      };
    }

    return raw;
  }

  function pickFile(rule, form) {
    if (!rule.file) return null;
    const input = form.querySelector(`[name="${rule.file}"]`);
    const file = input && input.files && input.files[0];
    return file || null;
  }

  let bannerEl;
  let fabEl;
  let syncing = false;
  let showSyncedFlash = false;

  function ensureUi() {
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.id = 'offlineBanner';
      bannerEl.className = 'offline-banner offline-banner-pending';
      bannerEl.hidden = true;
      bannerEl.setAttribute('role', 'status');
      const host = document.querySelector('.app-content') || document.querySelector('main') || document.body;
      host.prepend(bannerEl);
    }
    if (!fabEl) {
      fabEl = document.createElement('button');
      fabEl.type = 'button';
      fabEl.className = 'offline-fab';
      fabEl.hidden = true;
      fabEl.setAttribute('aria-label', 'État de synchronisation');
      fabEl.addEventListener('click', () => drainQueue());
      document.body.appendChild(fabEl);
    }
  }

  function renderBanner(items) {
    ensureUi();
    const pending = items.filter((item) => item.status === 'pending');
    const errors = items.filter((item) => item.status === 'error');
    const conflicts = errors.filter((item) => item.error === 'conflict');

    if (!pending.length && !errors.length) {
      bannerEl.hidden = true;
      if (showSyncedFlash) {
        fabEl.hidden = false;
        fabEl.textContent = '✅';
        showSyncedFlash = false;
        setTimeout(() => {
          if (fabEl.textContent === '✅') fabEl.hidden = true;
        }, 2500);
      } else {
        fabEl.hidden = true;
      }
      return;
    }

    fabEl.hidden = false;
    bannerEl.hidden = false;
    bannerEl.className = `offline-banner ${errors.length ? 'offline-banner-error' : 'offline-banner-pending'}`;

    let icon = pending.length ? '⏳' : '⚠️';
    if (errors.length && !pending.length) icon = '⚠️';
    fabEl.textContent = icon;

    const parts = [];
    if (pending.length) {
      const labels = [...new Set(pending.map((item) => TYPE_LABELS[item.type] || item.type))];
      parts.push(`Données enregistrées localement, en attente de synchronisation (${pending.length}) — ${labels.join(', ')}`);
    }
    if (errors.length && !conflicts.length) {
      parts.push(`${errors.length} élément(s) en erreur. Touchez l’icône pour réessayer.`);
    }

    const conflictBlocks = conflicts.map((item) => {
      const who = item.existing
        ? `${escHtml(item.existing.firstName)} ${escHtml(item.existing.lastName)} (${escHtml(item.existing.email || item.existing.phone)})`.trim()
        : '';
      return `<div class="offline-conflict">
        <strong>⚠️ Professeur déjà existant, fusionner ou annuler</strong>
        ${who ? `<span>${who}</span>` : ''}
        <div class="offline-banner-actions">
          <button type="button" class="btn btn-primary" data-offline-merge="${item.id_local}">Fusionner</button>
          <button type="button" class="btn btn-outline" data-offline-cancel="${item.id_local}">Annuler</button>
        </div>
      </div>`;
    }).join('');

    bannerEl.innerHTML = `<span class="offline-banner-msg">${icon} ${parts.join(' — ')}</span>
      <div class="offline-banner-actions">
        <button type="button" class="btn btn-primary" data-offline-sync>Synchroniser</button>
      </div>
      ${conflictBlocks}`;

    bannerEl.querySelector('[data-offline-sync]')?.addEventListener('click', () => drainQueue());
    bannerEl.querySelectorAll('[data-offline-merge]').forEach((btn) => {
      btn.addEventListener('click', () => resolveConflict(btn.getAttribute('data-offline-merge'), 'merge'));
    });
    bannerEl.querySelectorAll('[data-offline-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => resolveConflict(btn.getAttribute('data-offline-cancel'), 'cancel'));
    });
  }

  async function refreshBanner() {
    try {
      const items = await getAllQueue();
      renderBanner(items.filter((item) => item.status !== 'synced'));
    } catch {
      /* ignore */
    }
  }

  function flashQueued() {
    ensureUi();
    bannerEl.hidden = false;
    bannerEl.className = 'offline-banner offline-banner-pending';
    bannerEl.innerHTML = '<span class="offline-banner-msg">⏳ Données enregistrées localement, en attente de synchronisation</span>';
    fabEl.hidden = false;
    fabEl.textContent = '⏳';
  }

  function rememberLocalClass(payload) {
    if (!payload?.clientTempId || !payload.name) return;
    document.querySelectorAll('select[name="classId"]').forEach((sel) => {
      if ([...sel.options].some((opt) => opt.value === payload.clientTempId)) return;
      const opt = document.createElement('option');
      opt.value = payload.clientTempId;
      opt.textContent = `${payload.name} (en attente)`;
      sel.appendChild(opt);
    });
  }

  async function enqueue(type, payload, file) {
    const idLocal = uuid();
    if (type === 'class' && payload.clientTempId) {
      rememberLocalClass(payload);
    }
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        throw Object.assign(new Error('size'), { code: 'size' });
      }
      await putFile(idLocal, file, { name: file.name, type: file.type, size: file.size });
    }
    await putItem({
      id_local: idLocal,
      type,
      payload,
      status: 'pending',
      errorMessage: null,
      createdAt: new Date().toISOString(),
      clientId: clientId(),
      hasFile: Boolean(file),
    });
    flashQueued();
    await refreshBanner();
    registerBackgroundSync();
  }

  async function buildSyncItem(item) {
    const row = {
      id_local: item.id_local,
      type: item.type,
      payload: item.payload || {},
      createdAt: item.createdAt,
      clientId: item.clientId,
    };
    if (item.hasFile) {
      const stored = await getFile(item.id_local);
      if (stored?.blob) {
        if (stored.size > MAX_FILE_SIZE || stored.blob.size > MAX_FILE_SIZE) {
          throw Object.assign(new Error('size'), { code: 'size' });
        }
        row.file = {
          name: stored.name,
          type: stored.type,
          size: stored.size || stored.blob.size,
          data: await blobToBase64(stored.blob),
        };
      }
    }
    return row;
  }

  async function drainQueue() {
    if (syncing || !navigator.onLine) {
      await refreshBanner();
      return;
    }
    const pending = (await getAllQueue()).filter((item) => item.status === 'pending' || (item.status === 'error' && item.error !== 'conflict'));
    if (!pending.length) {
      await refreshBanner();
      return;
    }

    syncing = true;
    try {
      const idMap = await getIdMap();
      const items = [];
      for (const item of pending) {
        try {
          items.push(await buildSyncItem(item));
        } catch (err) {
          item.status = 'error';
          item.errorMessage = err.code === 'size' ? 'Fichier trop volumineux (5 Mo max)' : (err.message || 'Fichier');
          await putItem(item);
        }
      }
      if (!items.length) {
        await refreshBanner();
        return;
      }

      const res = await fetch(SYNC_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ clientId: clientId(), idMap, items }),
      });
      if (res.status === 401) return;
      if (!res.ok) throw new Error('sync');
      const data = await res.json();
      if (data.idMap) await setIdMap({ ...idMap, ...data.idMap });

      for (const row of data.results || []) {
        const current = (await getAllQueue()).find((item) => item.id_local === row.id_local);
        if (!current) continue;
        if (row.status === 'synced') {
          showSyncedFlash = true;
          await deleteItem(row.id_local);
        } else if (row.status === 'conflict' || row.error === 'conflict') {
          current.status = 'error';
          current.error = 'conflict';
          current.errorMessage = 'conflict';
          current.entity = row.entity || 'teacher';
          current.existing = row.existing || null;
          await putItem(current);
        } else {
          current.status = 'error';
          current.error = row.error || 'sync';
          current.errorMessage = row.error === 'child'
            ? 'Élève non lié à votre compte'
            : (row.error === 'unknown_id' ? 'Identifiant local non encore synchronisé' : 'Échec de synchronisation');
          await putItem(current);
        }
      }
    } catch {
      /* stay pending, retry later */
    } finally {
      syncing = false;
      await refreshBanner();
    }
  }

  async function resolveConflict(idLocal, action) {
    const items = await getAllQueue();
    const item = items.find((row) => row.id_local === idLocal);
    if (!item) return;
    try {
      const res = await fetch(RESOLVE_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id_local: idLocal,
          action,
          type: item.entity || item.type || 'teacher',
          existing: item.existing || null,
        }),
      });
      if (!res.ok) throw new Error('resolve');
      const data = await res.json();
      if (action === 'cancel' || data.status === 'cancelled') {
        await deleteItem(idLocal);
      } else {
        if (data.serverId) {
          const map = await getIdMap();
          map[idLocal] = data.serverId;
          if (item.payload?.clientTempId) map[item.payload.clientTempId] = data.serverId;
          await setIdMap(map);
        }
        await deleteItem(idLocal);
      }
    } catch {
      item.status = 'error';
      item.errorMessage = 'Impossible de résoudre le conflit';
      await putItem(item);
    }
    await refreshBanner();
  }

  function registerBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('sync' in (window.ServiceWorkerRegistration?.prototype || {}))) return;
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.sync) return reg.sync.register('educonnect-sync');
    }).catch(() => {});
  }

  function showNeedInternet(message) {
    ensureUi();
    bannerEl.hidden = false;
    bannerEl.className = 'offline-banner offline-banner-error';
    bannerEl.innerHTML = `<span class="offline-banner-msg">⚠️ ${message}</span>`;
  }

  function isRegisterForm(form) {
    return formActionPath(form) === '/auth/register';
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute('data-offline-skip') === '1') return;

    if (isRegisterForm(form)) {
      if (!navigator.onLine) {
        event.preventDefault();
        const role = (form.querySelector('[name="role"]')?.value || '').toUpperCase();
        const msg = role === 'SCHOOL_ADMIN'
          ? 'La création d’école nécessite un premier accès internet'
          : 'L’inscription nécessite une connexion internet';
        showNeedInternet(msg);
      }
      return;
    }

    const rule = matchRule(form);
    if (!rule) return;

    const goOffline = async () => {
      try {
        const payload = formToPayload(rule, form);
        const file = pickFile(rule, form);
        if (rule.type === 'payment' && !file) {
          showNeedInternet('Ajoutez une capture du paiement avant d’enregistrer hors ligne.');
          return;
        }
        if (file && file.size > MAX_FILE_SIZE) {
          showNeedInternet('Fichier trop volumineux (5 Mo maximum).');
          return;
        }
        await enqueue(rule.type, payload, file);
        form.reset();
      } catch (err) {
        const msg = err.code === 'size'
          ? 'Fichier trop volumineux (5 Mo maximum).'
          : 'Impossible d’enregistrer hors ligne sur cet appareil.';
        showNeedInternet(msg);
      }
    };

    if (!navigator.onLine) {
      event.preventDefault();
      goOffline();
    }
  }, true);

  window.addEventListener('online', () => {
    drainQueue();
    registerBackgroundSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') drainQueue();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'educonnect-sync') drainQueue();
    });
  }

  setInterval(() => {
    if (navigator.onLine) drainQueue();
  }, RETRY_MS);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      refreshBanner();
      if (navigator.onLine) drainQueue();
    });
  } else {
    refreshBanner();
    if (navigator.onLine) drainQueue();
  }
}());
