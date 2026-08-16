const prisma = require('../config/database');
const { hashPassword } = require('../utils/password');
const { getCache, setCache } = require('../../services/cache');
const { buildWorkbook, sendExcel } = require('../services/exportExcel');
const {
  loadOrganization,
  schoolInOrg,
  snapshotCampus,
  snapshotAllCampuses,
  consolidate,
} = require('../utils/group');

const STATS_TTL = 120;

async function withOrg(req, res) {
  const organization = await loadOrganization(req);
  if (!organization) {
    res.redirect('/auth/login');
    return null;
  }
  return organization;
}

async function cachedSnapshots(organization) {
  const key = `group:stats:${organization.id}`;
  const cached = await getCache(key);
  if (cached?.length === organization.schools.length) return cached;
  const snapshots = await snapshotAllCampuses(organization.schools);
  await setCache(key, snapshots, STATS_TTL);
  return snapshots;
}

async function dashboard(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;

  const snapshots = await cachedSnapshots(organization);
  const totals = consolidate(snapshots);

  const alerts = [];
  snapshots.forEach((c) => {
    if (c.pendingCount >= 5 || c.pendingAmount > 100000) {
      alerts.push({
        level: 'warning',
        text: `${c.school.campusLabel || c.school.name} : ${c.pendingCount} paiement(s) en attente (${c.pendingAmount.toLocaleString('fr-FR')} FCFA).`,
      });
    }
    if (c.students && c.absences / c.students > 2) {
      alerts.push({
        level: 'warning',
        text: `${c.school.campusLabel || c.school.name} : absences élevées (${c.absences} pour ${c.students} élèves).`,
      });
    }
    if (c.pendingLeaves) {
      alerts.push({
        level: 'info',
        text: `${c.school.campusLabel || c.school.name} : ${c.pendingLeaves} congé(s) RH en attente.`,
      });
    }
  });

  const ranked = [...snapshots].sort((a, b) => b.revenue - a.revenue);
  const schoolIds = organization.schools.map((s) => s.id);
  const recentPayments = schoolIds.length
    ? await prisma.payment.findMany({
      where: { student: { schoolId: { in: schoolIds } } },
      include: { student: { include: { school: true } }, feeType: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    })
    : [];

  const maxRevenue = Math.max(1, ...snapshots.map((s) => s.revenue));

  res.render('group/groupDashboard', {
    user: req.user,
    organization,
    totals,
    campusStats: snapshots,
    alerts,
    ranked,
    recentPayments,
    maxRevenue,
    success: req.query.success || null,
  });
}

async function campuses(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const q = (req.query.q || '').trim().toLowerCase();
  let campusStats = await cachedSnapshots(organization);
  if (q) {
    campusStats = campusStats.filter((c) => {
      const blob = `${c.school.name} ${c.school.campusLabel || ''} ${c.school.city || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }
  res.render('group/campuses', {
    user: req.user,
    organization,
    campusStats,
    q: req.query.q || '',
  });
}

async function campusDetail(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const school = schoolInOrg(organization, req.params.id);
  if (!school) return res.redirect('/group/campuses');

  const snap = await snapshotCampus(school);
  const [recentPayments, teachers, pendingLeaves] = await Promise.all([
    prisma.payment.findMany({
      where: { student: { schoolId: school.id } },
      include: { student: true, feeType: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.teacher.findMany({
      where: { schoolId: school.id },
      include: { user: true, staffProfile: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.leaveRequest.findMany({
      where: { schoolId: school.id, status: 'PENDING' },
      include: { teacher: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.render('group/campus', {
    user: req.user,
    organization,
    snap,
    recentPayments,
    teachers,
    pendingLeaves,
  });
}

async function finance(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const campusStats = await cachedSnapshots(organization);
  const totals = consolidate(campusStats);
  const schoolIds = organization.schools.map((s) => s.id);

  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const payments = schoolIds.length
    ? await prisma.payment.findMany({
      where: {
        status: 'VALIDATED',
        student: { schoolId: { in: schoolIds } },
        OR: [
          { validatedAt: { gte: since } },
          { validatedAt: null, createdAt: { gte: since } },
        ],
      },
      select: { amount: true, validatedAt: true, createdAt: true, student: { select: { schoolId: true } } },
    })
    : [];

  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      amount: 0,
    });
  }
  payments.forEach((p) => {
    const d = p.validatedAt || p.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = months.find((m) => m.key === key);
    if (row) row.amount += p.amount;
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.amount));

  res.render('group/finance', {
    user: req.user,
    organization,
    campusStats,
    totals,
    months,
    maxMonth,
  });
}

async function hrPage(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const campusStats = await cachedSnapshots(organization);
  const totals = consolidate(campusStats);
  const schoolIds = organization.schools.map((s) => s.id);

  const [leaves, payrollRuns] = await Promise.all([
    schoolIds.length
      ? prisma.leaveRequest.findMany({
        where: { schoolId: { in: schoolIds }, status: 'PENDING' },
        include: { teacher: { include: { user: true } }, school: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
      : [],
    schoolIds.length
      ? prisma.payrollRun.findMany({
        where: { schoolId: { in: schoolIds } },
        include: { school: true, _count: { select: { payslips: true } } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
      })
      : [],
  ]);

  res.render('group/hr', {
    user: req.user,
    organization,
    campusStats,
    totals,
    leaves,
    payrollRuns,
  });
}

async function comparePage(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const campusStats = await cachedSnapshots(organization);
  const selectedIds = [].concat(req.query.ids || []).filter(Boolean);
  const selected = selectedIds.length
    ? campusStats.filter((c) => selectedIds.includes(c.school.id))
    : campusStats;
  const maxRevenue = Math.max(1, ...selected.map((s) => s.revenue));

  res.render('group/compare', {
    user: req.user,
    organization,
    campusStats,
    selected,
    selectedIds,
    maxRevenue,
  });
}

async function circularsPage(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const circulars = await prisma.organizationCircular.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.render('group/circulars', {
    user: req.user,
    organization,
    circulars,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function sendCircular(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  if (!title || !body) return res.redirect('/group/circulars?error=data');

  await prisma.organizationCircular.create({
    data: { organizationId: organization.id, title, body },
  });

  const admins = await prisma.user.findMany({
    where: { role: 'SCHOOL_ADMIN', school: { organizationId: organization.id } },
  });
  await Promise.all(
    admins.map((admin) => prisma.notification.create({
      data: {
        userId: admin.id,
        type: 'GENERAL',
        title: `Circulaire — ${title}`,
        body: `${organization.name} : ${body}`,
      },
    })),
  );

  res.redirect('/group/circulars?success=1');
}

async function settingsPage(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  res.render('group/settings', {
    user: req.user,
    organization,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

async function updateSettings(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const { name, city, address, phone } = req.body;
  if (!name?.trim()) return res.redirect('/group/settings?error=name');

  const data = {
    name: name.trim(),
    city: city?.trim() || null,
    address: address?.trim() || null,
    phone: phone?.trim() || null,
  };

  try {
    if (req.body.removeLogo === 'on' && !req.file) {
      const { removeOrgLogoFiles } = require('../utils/schoolLogo');
      removeOrgLogoFiles(organization.id);
      data.logoUrl = null;
      data.logoBase64 = null;
    }
    if (req.file) {
      const { saveOrgLogo } = require('../utils/schoolLogo');
      const logo = await saveOrgLogo(organization.id, req.file);
      data.logoUrl = logo.logoUrl;
      data.logoBase64 = logo.logoBase64;
    }

    await prisma.organization.update({
      where: { id: organization.id },
      data,
    });
    res.redirect('/group/settings?success=1');
  } catch (err) {
    console.error(err);
    res.redirect('/group/settings?error=logo');
  }
}

async function inviteAdmin(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const { email, firstName, lastName, phone, password } = req.body;
  if (!email || !firstName || !lastName) return res.redirect('/group/settings?error=data');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.redirect('/group/settings?error=email');

  const hashed = await hashPassword(password || 'demo1234');
  await prisma.user.create({
    data: {
      email,
      password: hashed,
      firstName,
      lastName,
      phone: phone || null,
      role: 'ORGANIZATION_ADMIN',
      organizationAdmin: { create: { organizationId: organization.id } },
    },
  });
  res.redirect('/group/settings?success=admin');
}

async function exportGroup(req, res) {
  const organization = await withOrg(req, res);
  if (!organization) return;
  const campusStats = await snapshotAllCampuses(organization.schools);
  const totals = consolidate(campusStats);
  const wb = await buildWorkbook(
    'Groupe',
    [
      { header: 'Campus', key: 'campus', width: 22 },
      { header: 'École', key: 'school', width: 24 },
      { header: 'Ville', key: 'city', width: 14 },
      { header: 'Élèves', key: 'students', width: 10 },
      { header: 'Enseignants', key: 'teachers', width: 12 },
      { header: 'Recettes FCFA', key: 'revenue', width: 16 },
      { header: 'En attente FCFA', key: 'pending', width: 16 },
      { header: 'Taux encaissement %', key: 'rate', width: 18 },
      { header: 'Absences', key: 'absences', width: 12 },
      { header: 'Moyenne /20', key: 'avg', width: 12 },
    ],
    [
      ...campusStats.map((c) => ({
        campus: c.school.campusLabel || c.school.name,
        school: c.school.name,
        city: c.school.city || '',
        students: c.students,
        teachers: c.teachers,
        revenue: c.revenue,
        pending: c.pendingAmount,
        rate: c.collectionRate,
        absences: c.absences,
        avg: c.avgGrade,
      })),
      {
        campus: 'TOTAL',
        school: organization.name,
        city: '',
        students: totals.students,
        teachers: totals.teachers,
        revenue: totals.revenue,
        pending: totals.pendingAmount,
        rate: totals.collectionRate,
        absences: totals.absences,
        avg: totals.avgGrade,
      },
    ],
  );
  await sendExcel(res, `groupe-${organization.slug || 'export'}.xlsx`, wb);
}

module.exports = {
  dashboard,
  campuses,
  campusDetail,
  finance,
  hrPage,
  comparePage,
  circularsPage,
  sendCircular,
  settingsPage,
  updateSettings,
  inviteAdmin,
  exportGroup,
};
