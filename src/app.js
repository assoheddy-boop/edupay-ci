require('dotenv/config');
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const schoolRoutes = require('./routes/school');
const parentRoutes = require('./routes/parent');
const teacherRoutes = require('./routes/teacher');
const adminRoutes = require('./routes/admin');
const groupRoutes = require('./routes/group');
const apiV1Routes = require('./routes/api/v1');
const { apiLimiter } = require('./middleware/rateLimit');
const { metricsMiddleware, metricsHandler } = require('./middleware/metrics');
const { getPlansForLanding } = require('./config/plans');
const { i18nMiddleware, setLocale } = require('./middleware/i18n');
const { currencyMiddleware, setCurrency } = require('./middleware/currency');
const hrRoutes = require('../modules/hr/routes/hrRoutes');
const transferRoutes = require('../routes/transferRoutes');
const classRoutes = require('../routes/classRoutes');
const statsRoutes = require('../routes/statsRoutes');
const reinscriptionRoutes = require('../routes/reinscriptionRoutes');
const redoublementRoutes = require('../routes/redoublementRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.set('trust proxy', process.env.VERCEL ? 2 : 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/js', express.static(path.join(__dirname, '../node_modules/chart.js/dist')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(i18nMiddleware);
app.use(currencyMiddleware);
app.use(metricsMiddleware);

app.use((req, res, next) => {
  res.locals.appName = 'EduPay CI';
  res.locals.logoSrcFor = require('./utils/schoolLogo').logoSrcFor;
  next();
});

app.get('/prefs/lang/:locale', setLocale);
app.get('/prefs/currency/:code', setCurrency);

app.get('/', (_req, res) => {
  const { plans, moduleList } = getPlansForLanding();
  res.render('index', { user: null, plans, moduleList });
});

app.get('/api/health', apiLimiter, (_req, res) => {
  res.json({ ok: true, app: 'EduPay CI', version: '1.2.0' });
});

app.get('/metrics', metricsHandler);

app.use('/api/v1', apiV1Routes);

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/group', groupRoutes);
app.use('/school', schoolRoutes);
app.use('/parent', parentRoutes);
app.use('/teacher', teacherRoutes);
app.use('/hr', hrRoutes);
app.use('/transfer', transferRoutes);
app.use('/class', classRoutes);
app.use('/stats', statsRoutes);
app.use('/reinscription', reinscriptionRoutes);
app.use('/redoublement', redoublementRoutes);

app.use((_req, res) => {
  res.status(404).render('error', { message: 'Page introuvable', user: null });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Erreur serveur', user: null });
});

module.exports = app;
