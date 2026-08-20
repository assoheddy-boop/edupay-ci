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

async function getPortalAnalyticsSummary(schoolId, days = 30) {
  if (!schoolId || !analyticsSupported()) {
    return { days: [], totals: { views: 0, payClicks: 0, loginClicks: 0, contactSubmits: 0 } };
  }
  const since = startOfDay();
  since.setDate(since.getDate() - Math.max(1, Math.min(Number(days) || 30, 365)) + 1);
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
    }), { views: 0, payClicks: 0, loginClicks: 0, contactSubmits: 0 });
    return { days: rows, totals };
  } catch {
    return { days: [], totals: { views: 0, payClicks: 0, loginClicks: 0, contactSubmits: 0 } };
  }
}

module.exports = {
  startOfDay,
  recordPortalEvent,
  getPortalAnalyticsSummary,
  EVENT_FIELD,
};
