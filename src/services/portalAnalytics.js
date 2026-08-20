const prisma = require('../config/database');

const EVENT_FIELD = {
  view: 'views',
  pay: 'payClicks',
  login: 'loginClicks',
  contact: 'contactSubmits',
};

function startOfDay(value = new Date()) {
  const day = value instanceof Date ? new Date(value) : new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

function analyticsSupported() {
  return typeof prisma.portalAnalyticsDay?.upsert === 'function';
}

async function recordPortalEvent(schoolId, event) {
  const field = EVENT_FIELD[event];
  if (!schoolId || !field || !analyticsSupported()) return;
  const day = startOfDay();
  try {
    await prisma.portalAnalyticsDay.upsert({
      where: { schoolId_day: { schoolId, day } },
      create: { schoolId, day, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  } catch {
    /* table absente avant migration */
  }
}

function dayKey(value) {
  const day = startOfDay(value);
  return day.toISOString().slice(0, 10);
}

function buildAnalyticsSeries(rows, days = 30) {
  const span = Math.max(1, Math.min(Number(days) || 30, 365));
  const byDay = new Map();
  for (const row of rows || []) {
    byDay.set(dayKey(row.day), row);
  }
  const end = startOfDay();
  const series = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const row = byDay.get(key) || {};
    series.push({
      date: key,
      label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      views: row.views || 0,
      payClicks: row.payClicks || 0,
      loginClicks: row.loginClicks || 0,
      contactSubmits: row.contactSubmits || 0,
    });
  }
  return series;
}

async function getPortalAnalyticsSummary(schoolId, days = 30) {
  const emptyTotals = { views: 0, payClicks: 0, loginClicks: 0, contactSubmits: 0 };
  if (!schoolId || !analyticsSupported()) {
    return { days: [], series: buildAnalyticsSeries([], days), totals: emptyTotals };
  }
  const span = Math.max(1, Math.min(Number(days) || 30, 365));
  const since = startOfDay();
  since.setDate(since.getDate() - span + 1);
  try {
    const rows = await prisma.portalAnalyticsDay.findMany({
      where: { schoolId, day: { gte: since } },
      orderBy: { day: 'asc' },
    });
    const totals = rows.reduce((acc, row) => ({
      views: acc.views + (row.views || 0),
      payClicks: acc.payClicks + (row.payClicks || 0),
      loginClicks: acc.loginClicks + (row.loginClicks || 0),
      contactSubmits: acc.contactSubmits + (row.contactSubmits || 0),
    }), { ...emptyTotals });
    return {
      days: rows,
      series: buildAnalyticsSeries(rows, span),
      totals,
    };
  } catch {
    return { days: [], series: buildAnalyticsSeries([], span), totals: emptyTotals };
  }
}

module.exports = {
  startOfDay,
  dayKey,
  buildAnalyticsSeries,
  recordPortalEvent,
  getPortalAnalyticsSummary,
  EVENT_FIELD,
};
