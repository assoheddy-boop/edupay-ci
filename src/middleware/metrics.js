const client = require('prom-client');

if (!global.__educonnectMetricsInit) {
  client.collectDefaultMetrics({ prefix: 'educonnect_' });
  global.__educonnectMetricsInit = true;
}

function getHttpDuration() {
  const name = 'educonnect_http_request_duration_seconds';
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing;
  return new client.Histogram({
    name,
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  });
}

const httpDuration = getHttpDuration();

function routeLabel(req) {
  if (req.route?.path) {
    const base = (req.baseUrl || '').replace(/\/$/, '');
    return `${base}${req.route.path}` || req.route.path;
  }
  const url = (req.originalUrl || req.url || '/').split('?')[0];
  if (url.startsWith('/uploads/')) return '/uploads/*';
  return url.replace(/\/[0-9a-f-]{8,}/gi, '/:id');
}

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode),
    });
  });
  next();
}

async function metricsHandler(req, res) {
  const expected = process.env.METRICS_BEARER;
  if (process.env.NODE_ENV === 'production' && !expected) {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  if (expected) {
    const got = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (got !== expected) return res.status(401).json({ error: 'Non autorisé' });
  }
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
}

module.exports = { metricsMiddleware, metricsHandler };
