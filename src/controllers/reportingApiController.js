const prisma = require('../config/database');
const { getAbsenceStats, getSuccessRate, getHealthStats } = require('../../services/StatsService');

function schoolScope(user, querySchoolId) {
  if (user.role === 'SUPER_ADMIN') return querySchoolId || null;
  if (user.school?.id) return user.school.id;
  if (user.teacher?.schoolId) return user.teacher.schoolId;
  return undefined;
}

function wantsCsv(req) {
  const format = String(req.query.format || '').toLowerCase();
  if (format === 'csv') return true;
  const accept = String(req.headers.accept || '');
  return accept.includes('text/csv');
}

function toCsv(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value == null) return '';
    const text = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n');
}

function sendDataset(req, res, rows, filename) {
  if (wantsCsv(req)) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(toCsv(rows));
  }
  return res.json({ ok: true, count: rows.length, data: rows });
}

function filtersFromReq(req) {
  const schoolId = schoolScope(req.user, req.query.schoolId);
  if (schoolId === undefined) return null;
  return {
    schoolId: schoolId || undefined,
    classId: req.query.classId || undefined,
    subject: req.query.subject || undefined,
    period: req.query.period || undefined,
    from: req.query.from || undefined,
    to: req.query.to || undefined,
  };
}

async function absences(req, res) {
  const filters = filtersFromReq(req);
  if (!filters) return res.status(403).json({ error: 'Accès école requis' });
  const result = await getAbsenceStats(filters);
  if (!result.ok) return res.status(500).json({ error: 'Statistiques indisponibles' });
  return sendDataset(req, res, result.rows, 'edupay-absences');
}

async function successRate(req, res) {
  const filters = filtersFromReq(req);
  if (!filters) return res.status(403).json({ error: 'Accès école requis' });
  const result = await getSuccessRate(filters);
  if (!result.ok) return res.status(500).json({ error: 'Statistiques indisponibles' });
  return sendDataset(req, res, result.rows, 'edupay-success-rate');
}

async function health(req, res) {
  const filters = filtersFromReq(req);
  if (!filters) return res.status(403).json({ error: 'Accès école requis' });
  const result = await getHealthStats(filters);
  if (!result.ok) return res.status(500).json({ error: 'Statistiques indisponibles' });
  return sendDataset(req, res, result.rows, 'edupay-health');
}

async function payments(req, res) {
  const filters = filtersFromReq(req);
  if (!filters) return res.status(403).json({ error: 'Accès école requis' });

  const student = {};
  if (filters.schoolId) student.schoolId = filters.schoolId;
  if (filters.classId) student.classId = filters.classId;

  const createdAt = {};
  if (filters.from) {
    const start = new Date(filters.from);
    if (!Number.isNaN(start.getTime())) createdAt.gte = start;
  }
  if (filters.to) {
    const end = new Date(filters.to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
  }

  const rows = await prisma.payment.findMany({
    where: {
      ...(Object.keys(student).length ? { student } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    },
    include: {
      student: {
        include: {
          class: { select: { id: true, name: true } },
          school: { select: { id: true, name: true } },
        },
      },
      feeType: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const data = rows.map((p) => ({
    id: p.id,
    amount: p.amount,
    status: p.status,
    createdAt: p.createdAt,
    validatedAt: p.validatedAt,
    studentId: p.studentId,
    studentName: p.student ? `${p.student.lastName} ${p.student.firstName}`.trim() : '',
    classId: p.student?.classId || null,
    className: p.student?.class?.name || '',
    schoolId: p.student?.schoolId || null,
    schoolName: p.student?.school?.name || '',
    feeType: p.feeType?.name || '',
  }));

  return sendDataset(req, res, data, 'edupay-payments');
}

module.exports = { absences, successRate, health, payments };
