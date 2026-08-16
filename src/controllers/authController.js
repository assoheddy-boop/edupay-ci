const prisma = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { verifyToken } = require('../utils/jwt');
const { issueAuthSession, destroyAuthSession, tryRefreshSession, clearAuthCookie } = require('../middleware/auth');
const { REFRESH_COOKIE } = require('../utils/cookies');
const { generateUniqueSchoolSlug, findSchoolByCode } = require('../utils/schoolCode');
const { logAudit } = require('../utils/audit');
const { createTeacherProfile } = require('../../services/HRService');
const { isPublicSchoolRegisterOpen, isPublicTeacherRegisterOpen } = require('../utils/registerFlags');
const { safeInternalPath } = require('../utils/cookies');

function dashboardRedirect(role) {
  const map = {
    SUPER_ADMIN: '/admin/dashboard',
    ORGANIZATION_ADMIN: '/group/dashboard',
    SCHOOL_ADMIN: '/school/dashboard',
    PARENT: '/parent/dashboard',
    TEACHER: '/teacher/dashboard',
  };
  return map[role] || '/';
}

async function showLogin(req, res) {
  if (req.cookies?.token) {
    try {
      const decoded = verifyToken(req.cookies.token);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (user) return res.redirect(dashboardRedirect(user.role));
    } catch {
      /* access token expired or invalid — try refresh below */
    }
  }
  if (req.cookies?.[REFRESH_COOKIE]) {
    const rotated = await tryRefreshSession(req, res);
    if (rotated?.user) return res.redirect(dashboardRedirect(rotated.user.role));
  }
  res.render('auth/login', { error: null, role: req.query.role || 'parent' });
}

async function showRegister(req, res) {
  res.render('auth/register', {
    error: null,
    role: req.query.role || 'parent',
    plan: req.query.plan || '',
  });
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await comparePassword(password, user.password))) {
      return res.render('auth/login', { error: 'Email ou mot de passe incorrect', role: req.body.role || 'parent' });
    }

    await issueAuthSession(res, user);
    await logAudit({
      action: 'login',
      entity: 'User',
      entityId: user.id,
      user,
      ip: req.ip,
      sensitive: true,
    });
    res.redirect(dashboardRedirect(user.role));
  } catch (err) {
    console.error(err);
    let error = 'Erreur de connexion';
    if (err.code === 'P1003' || err.message?.includes('does not exist')) {
      error = 'Base de données non configurée. Lancez : npm run db:push puis npm run db:seed';
    }
    res.render('auth/login', { error, role: req.body.role || 'parent' });
  }
}

async function register(req, res) {
  const { email, password, firstName, lastName, phone, role, schoolName, schoolAddress, city, waveNumber, omNumber, schoolCode, plan } = req.body;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.render('auth/register', { error: 'Cet email est déjà utilisé', role });
    }

    const hashed = await hashPassword(password);

    if (role === 'SCHOOL_ADMIN') {
      if (!isPublicSchoolRegisterOpen()) {
        return res.render('auth/register', {
          error: 'Les inscriptions écoles sont temporairement fermées. Contactez EduConnect.',
          role,
        });
      }
      const slug = await generateUniqueSchoolSlug(schoolName);
      const { findPlanBySlug, assignPlanToSchool } = require('../utils/plans');
      const selectedPlan = await findPlanBySlug(plan || 'essentiel');

      const user = await prisma.user.create({
        data: {
          email,
          password: hashed,
          firstName,
          lastName,
          phone,
          role: 'SCHOOL_ADMIN',
          school: {
            create: {
              name: schoolName,
              slug,
              address: schoolAddress,
              city: city || 'Abidjan',
              waveNumber,
              omNumber,
              subscription: plan || 'essentiel',
              planId: selectedPlan?.id || null,
            },
          },
        },
        include: { school: true },
      });

      const { initSchoolModules } = require('../utils/modules');
      await initSchoolModules(user.school.id);
      if (selectedPlan) await assignPlanToSchool(user.school.id, selectedPlan.id);

      await issueAuthSession(res, user);
      return res.redirect('/school/dashboard');
    }

    if (role === 'PARENT') {
      const user = await prisma.user.create({
        data: {
          email,
          password: hashed,
          firstName,
          lastName,
          phone,
          role: 'PARENT',
          parentProfile: { create: {} },
        },
      });

      await issueAuthSession(res, user);
      return res.redirect('/parent/dashboard');
    }

    if (role === 'TEACHER') {
      if (!isPublicTeacherRegisterOpen()) {
        return res.render('auth/register', {
          error: 'L\'inscription enseignants est fermée. Demandez une invitation à votre établissement.',
          role,
        });
      }
      const school = await findSchoolByCode(schoolCode);

      if (!school) {
        return res.render('auth/register', { error: 'Code école invalide. Contactez votre établissement.', role });
      }

      const result = await createTeacherProfile({
        email,
        firstName,
        lastName,
        phone,
        password,
        schoolId: school.id,
      });
      if (!result.ok) {
        const message = result.error === 'email' ? 'Cet email est déjà utilisé' : 'Erreur lors de l\'inscription';
        return res.render('auth/register', { error: message, role });
      }

      await issueAuthSession(res, result.user);
      return res.redirect('/teacher/dashboard');
    }

    res.render('auth/register', { error: 'Rôle invalide', role });
  } catch (err) {
    console.error(err);
    res.render('auth/register', { error: 'Erreur lors de l\'inscription', role });
  }
}

async function logout(req, res) {
  await destroyAuthSession(req, res);
  res.redirect('/');
}

async function refresh(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (!raw) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Refresh token manquant' });
    }
    clearAuthCookie(res);
    return res.redirect('/auth/login');
  }

  req.cookies = { ...req.cookies, [REFRESH_COOKIE]: raw };
  const rotated = await tryRefreshSession(req, res);
  if (!rotated) {
    clearAuthCookie(res);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Refresh token invalide' });
    }
    return res.redirect('/auth/login');
  }

  if (req.xhr || req.headers.accept?.includes('application/json') || req.originalUrl.startsWith('/api/')) {
    return res.json({ ok: true });
  }
  return res.redirect(dashboardRedirect(rotated.user.role));
}

async function uploadPhoto(req, res) {
  const fallback = dashboardRedirect(req.user.role);
  const back = safeInternalPath(req.body.redirectTo, fallback);
  try {
    if (req.body.removePhoto === 'on') {
      const { removePersonPhoto } = require('../utils/media');
      removePersonPhoto('user', req.user.id);
      await prisma.user.update({ where: { id: req.user.id }, data: { photoUrl: null } });
    } else if (req.file) {
      const { savePersonPhoto } = require('../utils/media');
      const { photoUrl } = await savePersonPhoto('user', req.user.id, req.file);
      await prisma.user.update({ where: { id: req.user.id }, data: { photoUrl } });
    }
    const url = new URL(back, 'http://localhost');
    url.searchParams.set('success', 'photo');
    res.redirect(url.pathname + url.search);
  } catch (err) {
    console.error(err);
    res.redirect(`${dashboardRedirect(req.user.role)}?error=photo`);
  }
}

module.exports = { showLogin, showRegister, login, register, logout, refresh, uploadPhoto };
