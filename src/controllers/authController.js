const prisma = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { getCookieOptions } = require('../utils/cookies');
const { generateUniqueSchoolSlug, findSchoolByCode } = require('../utils/schoolCode');
const { logAudit } = require('../utils/audit');

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
      const { verifyToken } = require('../utils/jwt');
      const decoded = verifyToken(req.cookies.token);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (user) return res.redirect(dashboardRedirect(user.role));
    } catch {
      res.clearCookie('token');
    }
  }
  res.render('auth/login', { error: null, role: req.query.role || 'parent' });
}

async function showRegister(req, res) {
  res.render('auth/register', { error: null, role: req.query.role || 'parent' });
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await comparePassword(password, user.password))) {
      return res.render('auth/login', { error: 'Email ou mot de passe incorrect', role: req.body.role || 'parent' });
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.cookie('token', token, getCookieOptions());
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
  const { email, password, firstName, lastName, phone, role, schoolName, schoolAddress, city, waveNumber, omNumber, schoolCode } = req.body;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.render('auth/register', { error: 'Cet email est déjà utilisé', role });
    }

    const hashed = await hashPassword(password);

    if (role === 'SCHOOL_ADMIN') {
      const slug = await generateUniqueSchoolSlug(schoolName);
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
            },
          },
        },
        include: { school: true },
      });

      const { initSchoolModules } = require('../utils/modules');
      await initSchoolModules(user.school.id);

      const token = signToken({ userId: user.id, role: user.role });
      res.cookie('token', token, getCookieOptions());
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

      const token = signToken({ userId: user.id, role: user.role });
      res.cookie('token', token, getCookieOptions());
      return res.redirect('/parent/dashboard');
    }

    if (role === 'TEACHER') {
      const school = await findSchoolByCode(schoolCode);

      if (!school) {
        return res.render('auth/register', { error: 'Code école invalide. Contactez votre établissement.', role });
      }

      const user = await prisma.user.create({
        data: {
          email,
          password: hashed,
          firstName,
          lastName,
          phone,
          role: 'TEACHER',
          teacher: {
            create: { schoolId: school.id },
          },
        },
      });

      const token = signToken({ userId: user.id, role: user.role });
      res.cookie('token', token, getCookieOptions());
      return res.redirect('/teacher/dashboard');
    }

    res.render('auth/register', { error: 'Rôle invalide', role });
  } catch (err) {
    console.error(err);
    res.render('auth/register', { error: 'Erreur lors de l\'inscription', role });
  }
}

function logout(req, res) {
  res.clearCookie('token');
  res.redirect('/');
}

module.exports = { showLogin, showRegister, login, register, logout };
