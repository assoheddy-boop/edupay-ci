const {
  STATUS,
  typeLabel,
  statusLabel,
  listForParent,
  listForSchool,
  submitJustification,
  reviewJustification,
} = require('../services/justificationService');
const { logAudit } = require('../utils/audit');

function schoolOr403(req, res) {
  const school = req.user?.school;
  if (!school?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return school;
}

function parentOr403(req, res) {
  const parent = req.user?.parentProfile;
  if (!parent?.id) {
    res.status(403).render('error', { message: 'Accès refusé', user: req.user });
    return null;
  }
  return parent;
}

function refuse(res, req, result) {
  if (result?.status === 403 || result?.error === 'forbidden') {
    return res.status(403).render('error', { message: 'Accès refusé', user: req.user });
  }
  return null;
}

async function parentPage(req, res) {
  const parent = parentOr403(req, res);
  if (!parent) return;

  const children = await listForParent(parent.id);
  res.render('parent/justificatifs', {
    user: req.user,
    children,
    typeLabel,
    statusLabel,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function submit(req, res) {
  const parent = parentOr403(req, res);
  if (!parent) return;

  const result = await submitJustification({
    parent,
    absenceId: req.body?.absenceId,
    motif: req.body?.motif,
    file: req.file || null,
  });
  if (refuse(res, req, result)) return;
  if (!result.ok) {
    return res.redirect(`/parent/justificatifs?error=${result.error || 'data'}`);
  }

  await logAudit({
    action: 'justification_submit',
    entity: 'AbsenceJustification',
    entityId: result.justification?.id,
    user: req.user,
    ip: req.ip,
    schoolId: result.justification?.schoolId,
  });

  return res.redirect('/parent/justificatifs?success=1');
}

async function schoolPage(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const status = String(req.query.status || STATUS.PENDING).trim().toUpperCase();
  const filter = [STATUS.PENDING, STATUS.ACCEPTED, STATUS.REFUSED].includes(status) ? status : STATUS.PENDING;
  const rows = await listForSchool({ schoolId: school.id, status: filter });

  res.render('school/justificatifs', {
    user: req.user,
    school,
    rows,
    status: filter,
    typeLabel,
    statusLabel,
    error: req.query.error || null,
    success: req.query.success || null,
  });
}

async function review(req, res) {
  const school = schoolOr403(req, res);
  if (!school) return;

  const result = await reviewJustification({
    school,
    id: req.params.id,
    action: req.body?.action,
    user: req.user,
  });
  if (refuse(res, req, result)) return;
  if (!result.ok) {
    return res.redirect(`/school/justificatifs?error=${result.error || 'data'}`);
  }

  await logAudit({
    action: result.status === STATUS.ACCEPTED ? 'justification_accept' : 'justification_refuse',
    entity: 'AbsenceJustification',
    entityId: req.params.id,
    user: req.user,
    ip: req.ip,
    schoolId: school.id,
  });

  const qs = result.status === STATUS.ACCEPTED ? 'accepted' : 'refused';
  return res.redirect(`/school/justificatifs?success=${qs}`);
}

module.exports = {
  parentPage,
  submit,
  schoolPage,
  review,
};
