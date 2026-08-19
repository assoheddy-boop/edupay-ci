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
const { safeJson } = require('./utils/safeJson');
const { i18nMiddleware, setLocale } = require('./middleware/i18n');
const { currencyMiddleware, setCurrency } = require('./middleware/currency');
const hrRoutes = require('../modules/hr/routes/hrRoutes');
const transferRoutes = require('../routes/transferRoutes');
const classRoutes = require('../routes/classRoutes');
const statsRoutes = require('../routes/statsRoutes');
const reinscriptionRoutes = require('../routes/reinscriptionRoutes');
const redoublementRoutes = require('../routes/redoublementRoutes');
const timetableRoutes = require('../routes/timetableRoutes');
const cronRoutes = require('./routes/cron');
const legalRoutes = require('./routes/legal');
const guideRoutes = require('./routes/guides');
const devisRoutes = require('./routes/devis');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.set('trust proxy', process.env.VERCEL ? 2 : 1);

// CSP stays off: FullCalendar + Chart.js load from cdn.jsdelivr.net, and PWA /
// several dashboards use inline scripts. A strict CSP would break calendars,
// charts, and offline.js until those assets are self-hosted with nonces.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/js', express.static(path.join(__dirname, '../node_modules/chart.js/dist')));
const { blockedUploadPath } = require('./utils/uploadSafety');
app.use('/uploads', (req, res, next) => {
  if (blockedUploadPath(req.path)) return res.status(404).end();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, '../uploads')));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(i18nMiddleware);
app.use(currencyMiddleware);
app.use(metricsMiddleware);

app.use((req, res, next) => {
  res.locals.appName = 'EduConnect';
  res.locals.logoSrcFor = require('./utils/schoolLogo').logoSrcFor;
  res.locals.showDemoAccounts = process.env.NODE_ENV !== 'production';
  res.locals.safeJson = safeJson;
  res.locals.unreadNotifications = 0;
  res.locals.termLabel = require('./services/academicTerms').formatTermLabel;
  res.locals.gradeKindLabel = require('./services/gradesAverage').gradeKindLabel;
  res.locals.seriesOptions = require('./services/series').SERIES_OPTIONS;
  res.locals.seriesLabel = require('./services/series').seriesLabel;
  const { cycleFlags, EDUCATION_CYCLE_OPTIONS } = require('./utils/educationCycle');
  res.locals.cycle = cycleFlags('COLLEGE');
  res.locals.educationCycleOptions = EDUCATION_CYCLE_OPTIONS;
  next();
});

app.get('/prefs/lang/:locale', setLocale);
app.get('/prefs/currency/:code', setCurrency);

app.get('/offline', (_req, res) => {
  res.render('offline', { user: null, title: 'Hors ligne' });
});

app.use(legalRoutes);
app.use(guideRoutes);
app.use(devisRoutes);

app.get('/', (_req, res) => {
  const { plans, moduleList } = getPlansForLanding();
  res.render('home', {
    user: null,
    plans,
    moduleList,
    homeCss: true,
    title: 'Gestion scolaire & paiements Wave/OM',
  });
});

app.get('/api/health', apiLimiter, (_req, res) => {
  res.json({ ok: true, app: 'EduConnect', version: '1.2.0' });
});

app.get('/metrics', metricsHandler);

app.use('/api/internal/cron', cronRoutes);

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
app.use('/timetable', timetableRoutes);

app.use((_req, res) => {
  res.status(404).render('error', { message: 'Page introuvable', user: null });
});

app.use((err, req, res, _next) => {
  console.error('[error]', err?.message || 'Erreur serveur');
  if (req.originalUrl?.startsWith('/api/')) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
  res.status(500).render('error', { message: 'Erreur serveur', user: null });
});

module.exports = app;
