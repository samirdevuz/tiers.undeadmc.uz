'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const data = require('../data');
const backup = require('../backup');
const skin = require('../skin');
const { config, POINTS, TIERS, KIT_ICONS } = require('../config');
const { HttpError, str, toId, toPage } = require('../util');
const {
  loadSession, requireStaff, requireAdmin, csrfProtect,
  sessionInfo, login, logout
} = require('../auth');

const router = express.Router();

// Skin fayli xom PNG sifatida keladi (PUT /players/:id/skin), qolgan hammasi JSON.
router.use(express.raw({ type: 'image/png', limit: skin.MAX_BYTES }));
router.use(express.json({ limit: '20kb' }));
router.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(loadSession);
router.use(csrfProtect);

// O'zgartirishlar pm2 logiga yoziladi.
router.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.on('finish', () => {
      const who = req.staff ? req.staff.username : '-';
      console.info(`[admin] ${req.method} ${req.originalUrl} ${res.statusCode} user=${who} ip=${req.ip}`);
    });
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring." });
  }
});

/* --- sessiya --- */

router.get('/session', sessionInfo);
router.post('/login', loginLimiter, login);
router.post('/logout', requireStaff, logout);

router.post('/me/password', requireStaff, async (req, res) => {
  await data.changeOwnPassword(req.staff, req.body.current, req.body.next);
  res.json({ ok: true });
});

/* --- o'yinchilar (tester va admin) --- */

router.get('/players', requireStaff, (req, res) => {
  res.json(data.adminListPlayers(str(req.query.q).slice(0, 16), toPage(req.query.page)));
});

router.post('/players', requireStaff, (req, res) => {
  res.status(201).json(data.addPlayer(req.body.nick));
});

router.get('/players/:id', requireStaff, (req, res) => {
  res.json(data.adminGetPlayer(toId(req.params.id)));
});

router.patch('/players/:id', requireStaff, (req, res) => {
  res.json(data.renamePlayer(toId(req.params.id), req.body.nick));
});

router.put('/players/:id/tiers', requireStaff, (req, res) => {
  res.json(data.setPlayerTiers(toId(req.params.id), req.body.changes, req.staff));
});

router.put('/players/:id/skin', requireStaff, (req, res) => {
  const png = Buffer.isBuffer(req.body) ? req.body : null;
  res.json(data.setPlayerSkin(toId(req.params.id), skin.validateSkin(png)));
});

router.post('/players/:id/skin/import', requireStaff, async (req, res) => {
  const id = toId(req.params.id);
  data.adminGetPlayer(id);
  res.json(data.setPlayerSkin(id, await skin.fetchMojangSkin(req.body.nick)));
});

router.delete('/players/:id/skin', requireStaff, (req, res) => {
  res.json(data.setPlayerSkin(toId(req.params.id), null));
});

router.delete('/players/:id', requireAdmin, (req, res) => {
  data.deletePlayer(toId(req.params.id));
  res.json({ ok: true });
});

router.get('/history', requireStaff, (req, res) => {
  res.json({ history: data.recentHistory(100) });
});

/* --- kitlar --- */

router.get('/kits', requireStaff, (req, res) => {
  res.json({ kits: data.listKits(), icons: KIT_ICONS, tiers: TIERS, points: POINTS });
});

router.post('/kits', requireAdmin, (req, res) => {
  res.status(201).json(data.createKit(req.body));
});

router.put('/kits/order', requireAdmin, (req, res) => {
  res.json({ kits: data.reorderKits(req.body.ids) });
});

router.patch('/kits/:id', requireAdmin, (req, res) => {
  res.json(data.updateKit(toId(req.params.id), req.body));
});

/* --- xodimlar (faqat admin) --- */

router.get('/staff', requireAdmin, (req, res) => {
  res.json({ staff: data.listStaff() });
});

router.post('/staff', requireAdmin, async (req, res) => {
  res.status(201).json({ staff: await data.createStaff(req.body) });
});

router.patch('/staff/:id', requireAdmin, async (req, res) => {
  res.json({ staff: await data.updateStaff(toId(req.params.id), req.body, req.staff) });
});

router.delete('/staff/:id', requireAdmin, (req, res) => {
  res.json({ staff: data.deleteStaff(toId(req.params.id), req.staff) });
});

/* --- zaxira nusxalar (faqat admin) --- */

function backupInfo() {
  return {
    backups: backup.listBackups(),
    dir: config.backupDir,
    intervalHours: config.backupIntervalHours,
    keepDays: config.backupKeepDays
  };
}

router.get('/backups', requireAdmin, (req, res) => {
  res.json(backupInfo());
});

router.post('/backups', requireAdmin, async (req, res) => {
  await backup.createBackup();
  res.status(201).json(backupInfo());
});

router.get('/backups/:name', requireAdmin, (req, res) => {
  const file = backup.backupPath(req.params.name);
  if (!file) throw new HttpError(404, 'Nusxa topilmadi.');
  res.download(file, req.params.name);
});

router.use((req, res) => {
  res.status(404).json({ error: 'Topilmadi' });
});

module.exports = router;
