'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { config, sessionSecret } = require('./config');
const { HttpError, str } = require('./util');

const SESSION_COOKIE = 'tl_sid';
const PRELOGIN_COOKIE = 'tl_csrf';
const COOKIE_PATH = '/admin';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const q = {
  insert: db.prepare(`
    INSERT INTO sessions (id, staff_id, csrf_token, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`),
  get: db.prepare(`
    SELECT s.id, s.csrf_token AS csrf, s.expires_at AS expiresAt,
      st.id AS staffId, st.username, st.role
    FROM sessions s JOIN staff st ON st.id = s.staff_id
    WHERE s.id = ?`),
  delete: db.prepare('DELETE FROM sessions WHERE id = ?'),
  deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  staffByUsername: db.prepare('SELECT id, username, role, password_hash AS hash FROM staff WHERE username = ?')
};

// Login topilmasa ham bcrypt tekshiruvi bajariladi — javob vaqti bir xil bo'lishi uchun.
let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);
  return dummyHash;
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Bazada tokenning o'zi emas, HMAC qiymati saqlanadi.
function sessionId(token) {
  return crypto.createHmac('sha256', sessionSecret()).update(token).digest('base64url');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function cookieOptions(maxAge) {
  return { httpOnly: true, secure: !config.isDev, sameSite: 'strict', path: COOKIE_PATH, maxAge };
}

function clearCookie(res, name) {
  const { maxAge, ...opts } = cookieOptions(0);
  res.clearCookie(name, opts);
}

// Har bir /admin so'rovida cookie dan sessiyani o'qiydi.
function loadSession(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  req.staff = null;
  req.session = null;
  const token = req.cookies[SESSION_COOKIE];
  if (token && token.length <= 128) {
    const id = sessionId(token);
    const row = q.get.get(id);
    if (row && row.expiresAt > Date.now()) {
      req.session = { id: row.id, csrf: row.csrf };
      req.staff = { id: row.staffId, username: row.username, role: row.role, sessionId: row.id };
    } else {
      if (row) q.delete.run(id);
      clearCookie(res, SESSION_COOKIE);
    }
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.staff) return next(new HttpError(401, 'Avval tizimga kiring.'));
  next();
}

function requireAdmin(req, res, next) {
  if (!req.staff) return next(new HttpError(401, 'Avval tizimga kiring.'));
  if (req.staff.role !== 'admin') return next(new HttpError(403, 'Bu amal faqat adminlar uchun.'));
  next();
}

// Proksi ortida Host ichki nom bo'lishi mumkin: shuning uchun X-Forwarded-Host (req.host,
// trust proxy yoqilgan) va SITE_URL ham qabul qilinadi.
function sameOrigin(req) {
  const origin = req.get('origin');
  if (origin) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    return url.origin === config.siteUrl || url.host === req.host || url.host === req.get('host');
  }
  const site = req.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}

// O'zgartiruvchi har bir so'rovda CSRF token tekshiriladi:
// kirgandan keyin — sessiya tokeni, kirishdan oldin — cookie dagi token (double submit).
function csrfProtect(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const sent = req.get('x-csrf-token') || (req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '');
  const expected = req.session ? req.session.csrf : req.cookies[PRELOGIN_COOKIE];
  if (!sameOrigin(req) || !sent || !expected || !safeEqual(sent, expected)) {
    return next(new HttpError(403, "Xavfsizlik tokeni eskirgan. Sahifani yangilang va qayta urinib ko'ring."));
  }
  next();
}

function publicUser(staff) {
  return staff ? { id: staff.id, username: staff.username, role: staff.role } : null;
}

// GET /admin/api/session — joriy foydalanuvchi va CSRF token.
function sessionInfo(req, res) {
  res.set('Cache-Control', 'no-store');
  if (req.staff) return res.json({ user: publicUser(req.staff), csrf: req.session.csrf });
  let csrf = req.cookies[PRELOGIN_COOKIE];
  if (!csrf || csrf.length > 128) {
    csrf = randomToken();
    res.cookie(PRELOGIN_COOKIE, csrf, cookieOptions(2 * 60 * 60 * 1000));
  }
  res.json({ user: null, csrf });
}

async function login(req, res) {
  const username = str(req.body && req.body.username).slice(0, 64);
  const password = req.body && typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';
  if (!username || !password) throw new HttpError(400, 'Login va parolni kiriting.');

  const staff = q.staffByUsername.get(username);
  const ok = await bcrypt.compare(password, staff ? staff.hash : getDummyHash());
  if (!staff || !ok) throw new HttpError(401, "Login yoki parol noto'g'ri.");

  // Eski sessiya bo'lsa yopiladi, yangisi yaratiladi.
  const oldToken = req.cookies[SESSION_COOKIE];
  if (oldToken) q.delete.run(sessionId(oldToken));

  const token = randomToken();
  const csrf = randomToken();
  const now = Date.now();
  q.insert.run(sessionId(token), staff.id, csrf, now, now + config.sessionTtlMs);
  res.cookie(SESSION_COOKIE, token, cookieOptions(config.sessionTtlMs));
  clearCookie(res, PRELOGIN_COOKIE);
  res.set('Cache-Control', 'no-store');
  res.json({ user: publicUser(staff), csrf });
}

function logout(req, res) {
  if (req.session) q.delete.run(req.session.id);
  clearCookie(res, SESSION_COOKIE);
  res.json({ ok: true });
}

function startSessionCleanup() {
  const run = () => q.deleteExpired.run(Date.now());
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}

module.exports = {
  loadSession, requireStaff, requireAdmin, csrfProtect,
  sessionInfo, login, logout, startSessionCleanup
};
