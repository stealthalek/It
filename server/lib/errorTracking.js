let Sentry = null;

function init() {
  if (!process.env.SENTRY_DSN) return;
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
  });
}

function captureError(err) {
  if (Sentry) Sentry.captureException(err);
}

module.exports = { init, captureError };
