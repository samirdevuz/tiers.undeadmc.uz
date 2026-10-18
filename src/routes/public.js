'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const cache = require('../cache');
const data = require('../data');
const { NICK_RE, SLUG_RE, toPage } = require('../util');

const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Juda ko'p so'rov. Birozdan keyin qayta urinib ko'ring." });
  }
}));

// Javob JSON matni holida 15 soniya keshlanadi va brauzerga ham shuncha muddat beriladi.
function send(res, key, build) {
  const entry = cache.wrap(`res:${key}`, () => {
    const out = build();
    return { status: out.status || 200, json: JSON.stringify(out.body) };
  });
  res
    .status(entry.status)
    .set('Cache-Control', 'public, max-age=15')
    .type('application/json')
    .send(entry.json);
}

const PLAYER_NOT_FOUND = { status: 404, body: { error: "Bunday o'yinchi topilmadi" } };
const KIT_NOT_FOUND = { status: 404, body: { error: 'Bunday kit topilmadi' } };

router.get('/kits', (req, res) => {
  send(res, 'kits', () => ({ body: data.publicKits() }));
});

router.get('/leaderboard', (req, res) => {
  const page = toPage(req.query.page);
  send(res, `lb:${page}`, () => ({ body: data.leaderboard(page) }));
});

router.get('/kit/:slug', (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  if (!SLUG_RE.test(slug)) return res.status(404).json(KIT_NOT_FOUND.body);
  send(res, `kit:${slug}`, () => {
    const board = data.kitBoard(slug);
    return board ? { body: board } : KIT_NOT_FOUND;
  });
});

router.get('/player/:nick', (req, res) => {
  const nick = String(req.params.nick);
  if (!NICK_RE.test(nick)) return res.status(404).json(PLAYER_NOT_FOUND.body);
  send(res, `player:${nick.toLowerCase()}`, () => {
    const profile = data.playerProfile(nick);
    return profile ? { body: profile } : PLAYER_NOT_FOUND;
  });
});

router.get('/search', (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!/^[A-Za-z0-9_]{1,16}$/.test(term)) {
    return res.set('Cache-Control', 'public, max-age=15').json({ players: [] });
  }
  send(res, `search:${term.toLowerCase()}`, () => ({ body: { players: data.searchPlayers(term) } }));
});

router.use((req, res) => {
  res.status(404).json({ error: 'Topilmadi' });
});

module.exports = router;
