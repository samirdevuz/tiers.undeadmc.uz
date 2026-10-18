#!/usr/bin/env node
'use strict';

/*
 * Bazani tayyorlaydi:
 *   npm run seed                 — kitlar (baza bo'sh bo'lsa) va .env dagi admin
 *   npm run seed -- --demo       — qo'shimcha ravishda 10 ta demo o'yinchi (sinov uchun)
 *   npm run seed -- --remove-demo — demo o'yinchilarni o'chiradi
 *
 * Qayta ishga tushirish xavfsiz: admin paroli ADMIN_PASSWORD_HASH bilan yangilanadi.
 * Eslatma: server ham birinchi ishga tushganda kitlar va adminni o'zi yaratadi (SSH shart emas).
 */

const { db } = require('../src/db');
const { TIERS } = require('../src/config');
const { nowIso } = require('../src/util');
const { seedKitsIfEmpty, ensureAdmin } = require('../src/bootstrap');

const args = new Set(process.argv.slice(2));

const DEMO_NICKS = [
  'Demo_Blaze', 'Demo_Creeper', 'Demo_Ender', 'Demo_Ghast', 'Demo_Husk',
  'Demo_Piglin', 'Demo_Shulker', 'Demo_Stray', 'Demo_Vex', 'Demo_Wither'
];

function seedKits() {
  const added = seedKitsIfEmpty();
  console.log(added ? `Kitlar: ${added} ta standart kit qo'shildi.` : "Kitlar: bazada allaqachon bor — o'zgartirilmadi.");
}

function seedAdmin() {
  const res = ensureAdmin(true);
  if (res.action === 'missing') throw new Error(res.error);
  console.log(res.action === 'created'
    ? `Admin "${res.username}" yaratildi.`
    : `Admin "${res.username}": paroli ADMIN_PASSWORD_HASH bilan yangilandi.`);
}

// Bir xil natija beradigan oddiy tasodifiy sonlar generatori.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function seedDemo() {
  const kits = db.prepare('SELECT id FROM kits ORDER BY sort_order, id').all();
  if (!kits.length) throw new Error('Avval kitlar kerak.');
  const insertPlayer = db.prepare('INSERT OR IGNORE INTO players (nick, created_at) VALUES (?, ?)');
  const getPlayer = db.prepare('SELECT id FROM players WHERE nick = ?');
  const upsertTier = db.prepare(`
    INSERT INTO tiers (player_id, kit_id, tier, updated_at, updated_by) VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT (player_id, kit_id) DO UPDATE SET tier = excluded.tier, updated_at = excluded.updated_at`);
  const insertHistory = db.prepare(`
    INSERT INTO tier_history (player_id, kit_id, old_tier, new_tier, staff_id, staff_name, created_at)
    VALUES (?, ?, NULL, ?, NULL, 'demo', ?)`);
  const random = rng(20261018);
  const at = nowIso();
  db.transaction(() => {
    DEMO_NICKS.forEach((nick, i) => {
      insertPlayer.run(nick, at);
      const { id } = getPlayer.get(nick);
      for (const kit of kits) {
        if (random() < 0.3) continue;
        // Kuchliroq o'yinchilar ro'yxat boshida.
        const idx = Math.min(TIERS.length - 1, Math.floor(random() * 6 + i * 0.45));
        upsertTier.run(id, kit.id, TIERS[idx], at);
        insertHistory.run(id, kit.id, TIERS[idx], at);
      }
    });
  })();
  console.log(`Demo: ${DEMO_NICKS.length} ta o'yinchi qo'shildi. O'chirish: npm run seed -- --remove-demo`);
}

function removeDemo() {
  const info = db.prepare("DELETE FROM players WHERE nick LIKE 'Demo\\_%' ESCAPE '\\'").run();
  console.log(`Demo: ${info.changes} ta o'yinchi o'chirildi.`);
}

try {
  if (args.has('--remove-demo')) {
    removeDemo();
  } else {
    seedKits();
    seedAdmin();
    if (args.has('--demo')) seedDemo();
  }
  db.close();
} catch (err) {
  console.error(`Xato: ${err.message}`);
  process.exit(1);
}
