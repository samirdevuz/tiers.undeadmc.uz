'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { config } = require('./src/config');
const { db } = require('./src/db');
const data = require('./src/data');
const pages = require('./src/pages');
const { startSessionCleanup } = require('./src/auth');
const { bootstrapOnStartup } = require('./src/bootstrap');
const { scheduleBackups } = require('./src/backup');
const { HttpError, NICK_RE } = require('./src/util');
const publicApi = require('./src/routes/public');
const adminApi = require('./src/routes/admin');

const app = express();

// Ilova bitta HTTPS proksi ortida ishlaydi (mcweb.uz yoki nginx): haqiqiy IP va protokol
// X-Forwarded-* sarlavhalaridan olinadi. Proksisiz to'g'ridan-to'g'ri internetga ochmang.
app.set('trust proxy', 1);
app.disable('x-powered-by');

const csp = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", 'https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'https://mc-heads.net'],
  connectSrc: ["'self'"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"]
};
if (!config.isDev) csp.upgradeInsecureRequests = [];

app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: csp },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  strictTransportSecurity: config.isDev ? false : { maxAge: 31536000, includeSubDomains: false }
}));

// Platforma sog'lig'ini tekshirish uchun (health check).
app.get('/healthz', (req, res) => {
  db.prepare('SELECT 1').get();
  res.set('Cache-Control', 'no-store').json({ ok: true });
});

app.use(compression());

app.use(express.static(config.publicDir, {
  index: false,
  redirect: false,
  setHeaders(res, filePath) {
    const rel = path.relative(config.publicDir, filePath).split(path.sep);
    if (rel[0] === 'css' || rel[0] === 'js') {
      res.setHeader('Cache-Control', res.req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
    } else if (rel[0] === 'assets') {
      res.setHeader('Cache-Control', 'public, max-age=2592000');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

app.use('/api', publicApi);
app.use('/admin/api', adminApi);

function sendPage(res, status, html) {
  res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
}

app.get('/', (req, res) => sendPage(res, 200, pages.index()));

app.get('/player/:nick', (req, res) => {
  const nick = String(req.params.nick);
  const profile = NICK_RE.test(nick) ? data.playerProfile(nick) : null;
  if (profile && profile.nick !== nick) {
    return res.redirect(301, `/player/${encodeURIComponent(profile.nick)}`);
  }
  sendPage(res, profile ? 200 : 404, pages.index(profile ? profile.nick : null, !profile));
});

app.get('/admin', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  sendPage(res, 200, pages.admin());
});

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
    return res.status(404).json({ error: 'Topilmadi' });
  }
  sendPage(res, 404, pages.notFound());
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err instanceof HttpError ? err.status : err.status || err.statusCode || 500;
  let message = err instanceof HttpError ? err.message : "Server xatosi. Birozdan keyin qayta urinib ko'ring.";
  if (!(err instanceof HttpError) && status < 500) {
    message = err.type === 'entity.too.large' ? "So'rov juda katta." : "So'rov formati noto'g'ri.";
  }
  if (status < 400 || status > 599) status = 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
    return res.status(status).json({ error: message });
  }
  res.status(status).type('text/plain').send(message);
});

pages.assetVersion();
bootstrapOnStartup();
startSessionCleanup();
scheduleBackups();

const server = app.listen(config.port, config.host, () => {
  const where = config.host ? `${config.host}:${config.port}` : `port ${config.port}`;
  console.info(`[tiers] ${where} (${config.isDev ? 'development' : 'production'}), baza: ${config.dbPath}`);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM staff').get();
  if (!n) console.warn("[tiers] Hali admin yo'q: ADMIN_USERNAME va ADMIN_PASSWORD_HASH ni sozlab, qayta ishga tushiring.");
});

function shutdown(signal) {
  console.info(`[tiers] ${signal} — to'xtatilmoqda...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
