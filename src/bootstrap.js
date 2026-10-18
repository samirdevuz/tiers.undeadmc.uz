'use strict';

const { db } = require('./db');
const { DEFAULT_KITS } = require('./config');
const { USERNAME_RE, nowIso } = require('./util');

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Kitlar jadvali bo'sh bo'lsa standart 8 ta kit qo'shiladi.
function seedKitsIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM kits').get();
  if (n > 0) return 0;
  const insert = db.prepare('INSERT INTO kits (slug, name, icon, sort_order, active) VALUES (?, ?, ?, ?, 1)');
  db.transaction(() => {
    DEFAULT_KITS.forEach((kit, i) => insert.run(kit.slug, kit.name, kit.icon, i + 1));
  })();
  return DEFAULT_KITS.length;
}

// Platforma panelida hash qo'shtirnoq bilan kiritilgan bo'lsa ham ishlaydi.
function adminFromEnv() {
  const username = (process.env.ADMIN_USERNAME || '').trim();
  const hash = (process.env.ADMIN_PASSWORD_HASH || '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!USERNAME_RE.test(username)) {
    return { error: "ADMIN_USERNAME 3–32 belgi bo'lsin (lotin harflari, raqamlar, _ . -)." };
  }
  if (!BCRYPT_HASH_RE.test(hash)) {
    return { error: "ADMIN_PASSWORD_HASH noto'g'ri yoki berilmagan. Hash olish: npm run hash-password" };
  }
  return { username, hash };
}

/*
 * Adminni muhit o'zgaruvchilaridan yaratadi.
 *  - force=false: faqat xodimlar jadvali bo'sh bo'lsa (birinchi ishga tushirish).
 *  - force=true:  admin bo'lsa paroli yangilanadi, bo'lmasa yaratiladi (seed, ADMIN_FORCE_RESET).
 * Natija: { action: 'created' | 'updated' | 'skipped' | 'missing', username?, error? }
 */
function ensureAdmin(force) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM staff').get();
  if (n > 0 && !force) return { action: 'skipped' };
  const env = adminFromEnv();
  if (env.error) return { action: 'missing', error: env.error };
  const existing = db.prepare('SELECT id FROM staff WHERE username = ?').get(env.username);
  if (existing) {
    db.prepare("UPDATE staff SET password_hash = ?, role = 'admin' WHERE id = ?").run(env.hash, existing.id);
    db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(existing.id);
    return { action: 'updated', username: env.username };
  }
  db.prepare("INSERT INTO staff (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)")
    .run(env.username, env.hash, nowIso());
  return { action: 'created', username: env.username };
}

// Server ishga tushganda: SSH siz birinchi sozlash.
function bootstrapOnStartup() {
  const kits = seedKitsIfEmpty();
  if (kits) console.info(`[setup] ${kits} ta standart kit qo'shildi.`);

  const force = /^(1|true|yes)$/i.test(process.env.ADMIN_FORCE_RESET || '');
  const admin = ensureAdmin(force);
  if (admin.action === 'created') {
    console.info(`[setup] Admin "${admin.username}" yaratildi (ADMIN_USERNAME / ADMIN_PASSWORD_HASH).`);
  } else if (admin.action === 'updated') {
    console.warn(`[setup] ADMIN_FORCE_RESET: "${admin.username}" paroli yangilandi. Endi ADMIN_FORCE_RESET ni o'chiring!`);
  } else if (admin.action === 'missing') {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM staff').get();
    if (n === 0 || force) console.warn(`[setup] Admin yaratilmadi: ${admin.error}`);
  }
}

module.exports = { seedKitsIfEmpty, ensureAdmin, bootstrapOnStartup };
