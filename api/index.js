require('dotenv/config');

try {
  module.exports = require('../src/app');
} catch (err) {
  console.error('FATAL_APP_LOAD', err?.message || 'startup_failed');
  module.exports = (_req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    const payload = { ok: false, error: 'startup_failed' };
    if (process.env.NODE_ENV !== 'production' && err?.message) {
      payload.message = err.message;
    }
    res.end(JSON.stringify(payload));
  };
}
