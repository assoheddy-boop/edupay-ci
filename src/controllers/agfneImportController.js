const prisma = require('../config/database');
const { parseAgfneFile } = require('../services/agfneImport');
const { previewAgfneRows, applyAgfneImport } = require('../services/agfneMapper');

function schoolFromUser(user) {
  return user?.school || user?.staffAssignments?.[0]?.school || null;
}

async function loadRecentImports(schoolId) {
  return prisma.agfneImportLog.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

async function page(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.redirect('/auth/login');

  const logs = await loadRecentImports(school.id);
  const previewId = String(req.query.preview || '').trim() || null;
  let preview = null;

  if (previewId) {
    const log = await prisma.agfneImportLog.findFirst({
      where: { id: previewId, schoolId: school.id, status: 'PREVIEW' },
    });
    if (log?.previewData) {
      preview = {
        id: log.id,
        filename: log.filename,
        format: log.format,
        rowCount: log.rowCount,
        rows: log.previewData,
      };
    }
  }

  res.render('school/agfne-import', {
    title: 'Import AGFNE / SIGFNE',
    school,
    logs,
    preview,
    result: req.query.created != null ? {
      created: Number(req.query.created) || 0,
      updated: Number(req.query.updated) || 0,
      errors: Number(req.query.errors) || 0,
      filename: req.query.filename || '',
    } : null,
    error: req.query.error || null,
  });
}

async function preview(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const parsed = await parseAgfneFile(req.file);
  if (!parsed.ok) {
    return res.redirect(`/school/enrollment/agfne-import?error=${encodeURIComponent(parsed.message)}`);
  }
  if (!parsed.rows.length) {
    return res.redirect('/school/enrollment/agfne-import?error=Aucune+ligne+trouvée+dans+le+fichier');
  }

  const [classes, existingStudents] = await Promise.all([
    prisma.class.findMany({ where: { schoolId: school.id } }),
    prisma.student.findMany({
      where: { schoolId: school.id },
      select: { id: true, matricule: true, nationalMatricule: true },
    }),
  ]);

  const previewRows = previewAgfneRows(parsed.rows, classes, existingStudents);

  const log = await prisma.agfneImportLog.create({
    data: {
      schoolId: school.id,
      userId: req.user.id,
      filename: parsed.filename,
      rowCount: previewRows.length,
      format: parsed.kind,
      status: 'PREVIEW',
      previewData: previewRows,
    },
  });

  return res.redirect(`/school/enrollment/agfne-import?preview=${log.id}`);
}

async function confirm(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const importId = String(req.body.importId || '').trim();
  if (!importId) {
    return res.redirect('/school/enrollment/agfne-import?error=Import+introuvable');
  }

  const log = await prisma.agfneImportLog.findFirst({
    where: { id: importId, schoolId: school.id, status: 'PREVIEW' },
  });
  if (!log?.previewData?.length) {
    return res.redirect('/school/enrollment/agfne-import?error=Prévisualisation+expirée+ou+introuvable');
  }

  const validRows = log.previewData.filter((r) => r.valid);
  const schoolYear = school.currentSchoolYear || '2025-2026';

  try {
    const result = await applyAgfneImport({
      schoolId: school.id,
      schoolYear,
      rows: validRows,
      user: req.user,
      ip: req.ip,
      filename: log.filename,
    });

    await prisma.agfneImportLog.update({
      where: { id: log.id },
      data: {
        status: result.errors.length && !result.created && !result.updated ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
        stats: {
          created: result.created,
          updated: result.updated,
          errors: result.errors,
        },
      },
    });

    const params = new URLSearchParams({
      created: String(result.created),
      updated: String(result.updated),
      errors: String(result.errors.length),
      filename: log.filename,
    });
    return res.redirect(`/school/enrollment/agfne-import?${params.toString()}`);
  } catch (err) {
    console.error('[agfneImport] confirm error', err);
    await prisma.agfneImportLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', completedAt: new Date(), stats: { error: err.message } },
    });
    return res.redirect('/school/enrollment/agfne-import?error=Erreur+lors+de+l%27import');
  }
}

async function cancel(req, res) {
  const school = schoolFromUser(req.user);
  if (!school) return res.status(403).render('error', { message: 'Accès refusé', user: req.user });

  const importId = String(req.body.importId || '').trim();
  if (importId) {
    await prisma.agfneImportLog.updateMany({
      where: { id: importId, schoolId: school.id, status: 'PREVIEW' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }
  return res.redirect('/school/enrollment/agfne-import');
}

module.exports = {
  page,
  preview,
  confirm,
  cancel,
};
