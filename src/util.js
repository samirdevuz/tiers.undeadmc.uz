'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const KIT_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '.+_-]{0,23}$/u;

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, "Noto'g'ri ID.");
  return n;
}

function toPage(value) {
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) && n > 0 && n < 100000 ? n : 1;
}

// SQLite vaqti: 2026-10-18T09:30:00Z
function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// LIKE ichidagi maxsus belgilarni ekranlash (ESCAPE '\').
function likeEscape(s) {
  return s.replace(/[\\%_]/g, '\\$&');
}

function isUniqueError(err) {
  return Boolean(err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT_UNIQUE'));
}

module.exports = {
  HttpError, NICK_RE, SLUG_RE, USERNAME_RE, KIT_NAME_RE,
  str, toId, toPage, nowIso, likeEscape, isUniqueError
};
