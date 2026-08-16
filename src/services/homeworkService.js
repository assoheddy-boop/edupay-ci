const TZ = 'Africa/Abidjan';
const KIND = { HOMEWORK: 'HOMEWORK', TEST: 'TEST' };
const REMIND_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const EVENING_HOUR = 18;

function normalizeKind(value) {
  const raw = String(value || '').trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (raw === 'TEST' || raw === 'CONTROLE' || raw === 'EXAM' || raw === 'EXAMEN') {
    return KIND.TEST;
  }
  return KIND.HOMEWORK;
}

function kindLabel(kind) {
  return normalizeKind(kind) === KIND.TEST ? 'Contrôle' : 'Devoir';
}

function defaultTitle({ kind, subject, title } = {}) {
  const trimmed = String(title || '').trim();
  if (trimmed) return trimmed;
  const subj = String(subject || '').trim();
  if (subj) return `${kindLabel(kind)} de ${subj}`;
  return kindLabel(kind);
}

function abidjanYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addCalendarDays(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function abidjanDateTime(ymd, hour = 0, minute = 0) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
}

function eveningBeforeDue(dueDate) {
  const dueYmd = abidjanYmd(dueDate);
  if (!dueYmd) return null;
  return abidjanDateTime(addCalendarDays(dueYmd, -1), EVENING_HOUR, 0);
}

function parseRemindAt(payload = {}, dueDate) {
  if (payload.remindAt) {
    const d = new Date(payload.remindAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const flag = payload.remindEvening;
  if (flag === '1' || flag === 'on' || flag === true || flag === 'true') {
    return eveningBeforeDue(dueDate);
  }
  return null;
}

function parentPublishMessage({ kind, subject, title, dueDate, studentName } = {}) {
  const isTest = normalizeKind(kind) === KIND.TEST;
  const topic = String(subject || title || kindLabel(kind)).trim();
  const date = new Date(dueDate).toLocaleDateString('fr-FR');
  const who = studentName ? ` (${studentName})` : '';
  if (isTest) return `Contrôle de ${topic} le ${date}${who}.`;
  const subjectBit = subject ? ` de ${subject}` : (title ? ` : ${title}` : '');
  return `Devoir${subjectBit} — à rendre le ${date}${who}.`;
}

function parentReminderMessage(opts = {}) {
  return `Rappel — ${parentPublishMessage(opts)}`;
}

function toCalendarEvent(hw) {
  const isTest = normalizeKind(hw.kind) === KIND.TEST;
  const topic = hw.subject || hw.title;
  return {
    id: hw.id,
    title: `${kindLabel(hw.kind)} — ${topic}`,
    start: abidjanYmd(hw.dueDate) || (hw.dueDate instanceof Date ? hw.dueDate.toISOString().slice(0, 10) : String(hw.dueDate).slice(0, 10)),
    allDay: true,
    color: isTest ? '#e53935' : '#0052CC',
    extendedProps: {
      kind: normalizeKind(hw.kind),
      description: hw.description || '',
      className: hw.class?.name || '',
      attachmentUrl: hw.attachmentUrl || null,
      subject: hw.subject || '',
    },
  };
}

function calendarEventsJson(list = []) {
  return JSON.stringify(list.map(toCalendarEvent)).replace(/</g, '\\u003c');
}

function summarizeHomeworkStats(list = []) {
  const bySubjectMap = new Map();
  let homework = 0;
  let test = 0;
  for (const hw of list) {
    const kind = normalizeKind(hw.kind);
    if (kind === KIND.TEST) test += 1;
    else homework += 1;
    const subject = String(hw.subject || '').trim() || 'Non renseignée';
    if (!bySubjectMap.has(subject)) {
      bySubjectMap.set(subject, { subject, homework: 0, test: 0, total: 0 });
    }
    const row = bySubjectMap.get(subject);
    if (kind === KIND.TEST) row.test += 1;
    else row.homework += 1;
    row.total += 1;
  }
  return {
    total: list.length,
    homework,
    test,
    bySubject: [...bySubjectMap.values()].sort((a, b) => b.total - a.total || a.subject.localeCompare(b.subject, 'fr')),
  };
}

function homeworkExportRows(list = []) {
  return (list || []).map((hw) => ({
    date: new Date(hw.dueDate).toLocaleDateString('fr-FR'),
    kind: kindLabel(hw.kind),
    subject: hw.subject || '—',
    title: hw.title,
    className: hw.class?.name || '—',
    teacher: hw.teacher?.user
      ? `${hw.teacher.user.lastName} ${hw.teacher.user.firstName}`
      : '—',
    description: hw.description || '',
  }));
}

function isEligibleForReminder(hw, now = new Date()) {
  if (!hw || hw.remindedAt) return false;
  if (hw.remindAt) {
    const remindAt = new Date(hw.remindAt);
    if (Number.isNaN(remindAt.getTime())) return false;
    const delta = now.getTime() - remindAt.getTime();
    return delta >= 0 && delta <= REMIND_LOOKBACK_MS;
  }
  const dueYmd = abidjanYmd(hw.dueDate);
  const tomorrow = addCalendarDays(abidjanYmd(now), 1);
  return Boolean(dueYmd) && dueYmd === tomorrow;
}

function reminderQuery(now = new Date()) {
  const lookback = new Date(now.getTime() - REMIND_LOOKBACK_MS);
  const tomorrowYmd = addCalendarDays(abidjanYmd(now), 1);
  const tomorrowStart = abidjanDateTime(tomorrowYmd, 0, 0);
  const dayAfter = abidjanDateTime(addCalendarDays(tomorrowYmd, 1), 0, 0);
  return {
    remindedAt: null,
    OR: [
      { remindAt: { lte: now, gte: lookback } },
      { remindAt: null, dueDate: { gte: tomorrowStart, lt: dayAfter } },
    ],
  };
}

function buildHomeworkCreateData({ classId, teacherId, payload = {}, attachmentUrl = null }) {
  const kind = normalizeKind(payload.kind || payload.type);
  const subject = String(payload.subject || '').trim() || null;
  const title = defaultTitle({ kind, subject, title: payload.title });
  const dueDate = new Date(payload.dueDate);
  return {
    classId,
    teacherId,
    title,
    description: payload.description || null,
    dueDate,
    attachmentUrl,
    kind,
    subject,
    remindAt: parseRemindAt(payload, dueDate),
  };
}

function hasHomeworkContent(payload = {}) {
  return Boolean(String(payload.title || '').trim() || String(payload.subject || '').trim());
}

module.exports = {
  TZ,
  KIND,
  REMIND_LOOKBACK_MS,
  normalizeKind,
  kindLabel,
  defaultTitle,
  abidjanYmd,
  addCalendarDays,
  eveningBeforeDue,
  parseRemindAt,
  parentPublishMessage,
  parentReminderMessage,
  toCalendarEvent,
  calendarEventsJson,
  summarizeHomeworkStats,
  homeworkExportRows,
  isEligibleForReminder,
  reminderQuery,
  buildHomeworkCreateData,
  hasHomeworkContent,
};
