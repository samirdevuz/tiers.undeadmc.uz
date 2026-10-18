'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { db } = require('./db');
const { config } = require('./config');

// Fayl nomi: tiers-2026-10-18_0400.db.gz
const NAME_RE = /^tiers-\d{4}-\d{2}-\d{2}_\d{4}\.db\.gz$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

let running = null;

// SQLite online backup API — server ishlab turganda ham xavfsiz.
function createBackup() {
  if (running) return running;
  running = (async () => {
    fs.mkdirSync(config.backupDir, { recursive: true });
    const base = path.join(config.backupDir, `tiers-${stamp()}`);
    const raw = `${base}.db`;
    try {
      await db.backup(raw);
      await pipeline(fs.createReadStream(raw), zlib.createGzip({ level: 9 }), fs.createWriteStream(`${base}.db.gz`));
    } finally {
      fs.rmSync(raw, { force: true });
    }
    prune();
    return `${base}.db.gz`;
  })().finally(() => {
    running = null;
  });
  return running;
}

function listBackups() {
  let names;
  try {
    names = fs.readdirSync(config.backupDir);
  } catch {
    return [];
  }
  return names
    .filter((name) => NAME_RE.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(config.backupDir, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

// Faqat to'g'ri nomli fayl yo'li qaytariladi (papkadan tashqariga chiqib bo'lmaydi).
function backupPath(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
  const full = path.join(config.backupDir, name);
  return fs.existsSync(full) ? full : null;
}

function prune() {
  if (!config.backupKeepDays) return;
  const limit = Date.now() - config.backupKeepDays * 24 * 60 * 60 * 1000;
  for (const b of listBackups()) {
    if (Date.parse(b.createdAt) < limit) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
  }
}

// Har BACKUP_INTERVAL_HOURS soatda avtomatik nusxa (0 — o'chirilgan). SSH/cron kerak emas.
function scheduleBackups() {
  const hours = config.backupIntervalHours;
  if (!hours) return;
  const intervalMs = hours * 60 * 60 * 1000;
  const run = () => {
    createBackup()
      .then((file) => console.info(`[backup] ${path.basename(file)}`))
      .catch((err) => console.error(`[backup] xato: ${err.message}`));
  };
  const latest = listBackups()[0];
  const age = latest ? Date.now() - Date.parse(latest.createdAt) : Infinity;
  const delay = age >= intervalMs ? 60 * 1000 : intervalMs - age;
  setTimeout(() => {
    run();
    setInterval(run, intervalMs).unref();
  }, delay).unref();
}

module.exports = { createBackup, listBackups, backupPath, scheduleBackups };
