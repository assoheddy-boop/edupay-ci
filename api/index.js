require('dotenv/config');

try {
  module.exports = require('../src/app');
} catch (err) {
  console.error('FATAL_APP_LOAD', err);
  module.exports = (_req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      error: 'startup_failed',
      message: err && err.message ? err.message : 'unknown',
    }));
  };
}
