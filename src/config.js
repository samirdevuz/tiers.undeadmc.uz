'use strict';

const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

/*
 * BALLAR JADVALI — har bir tier necha ball beradi.
 * O'yinchining umumiy bali = barcha faol kitlardagi ballar yig'indisi.
 * O'zgartirgandan keyin serverni qayta ishga tushiring: pm2 restart undeadmc-tiers
 */
const POINTS = Object.freeze({
  HT1: 60,
  LT1: 45,
  HT2: 30,
  LT2: 20,
  HT3: 10,
  LT3: 6,
  HT4: 4,
  LT4: 3,
  HT5: 2,
  LT5: 1
});

// Eng yuqoridan eng pastgacha. Bazadagi CHECK cheklovi ham shu ro'yxat bilan bir xil.
const TIERS = Object.freeze(['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5']);

// public/js/icons.js dagi piksel ikonkalar kalitlari.
const KIT_ICONS = Object.freeze([
  'sword', 'axe', 'mace', 'nethpot', 'crystal', 'smp', 'uhc', 'pot',
  'bow', 'trident', 'shield', 'cart', 'elytra', 'star'
]);

const DEFAULT_KITS = Object.freeze([
  { slug: 'sword', name: 'Sword', icon: 'sword' },
  { slug: 'axe', name: 'Axe', icon: 'axe' },
  { slug: 'mace', name: 'Mace', icon: 'mace' },
  { slug: 'nethpot', name: 'NethPot', icon: 'nethpot' },
  { slug: 'crystal', name: 'Crystal', icon: 'crystal' },
  { slug: 'smp', name: 'SMP', icon: 'smp' },
  { slug: 'uhc', name: 'UHC', icon: 'uhc' },
  { slug: 'pot', name: 'Pot', icon: 'pot' }
]);

for (const [tier, pts] of Object.entries(POINTS)) {
  if (!TIERS.includes(tier)) throw new Error(`POINTS: noma'lum tier "${tier}"`);
  if (!Number.isInteger(pts) || pts < 0) throw new Error(`POINTS: ${tier} uchun ball butun musbat son bo'lishi kerak`);
}
for (const tier of TIERS) {
  if (!(tier in POINTS)) throw new Error(`POINTS: ${tier} uchun ball yozilmagan`);
}

const isDev = process.env.NODE_ENV === 'development';

let cachedSecret = null;

// Faqat server so'raganda tekshiriladi — seed va boshqa skriptlarga kerak emas.
function sessionSecret() {
  if (cachedSecret) return cachedSecret;
  const s = process.env.SESSION_SECRET || '';
  if (s.length >= 32 && !s.startsWith('almashtiring')) {
    cachedSecret = s;
  } else if (isDev) {
    console.warn('[config] SESSION_SECRET berilmagan — vaqtinchalik kalit ishlatiladi (faqat development).');
    cachedSecret = crypto.randomBytes(48).toString('base64url');
  } else {
    throw new Error("SESSION_SECRET kamida 32 belgidan iborat bo'lishi kerak (.env yoki platforma sozlamalarida).");
  }
  return cachedSecret;
}

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// Saytning ommaviy manzili (canonical/OG havolalar va proksi ortida CSRF Origin tekshiruvi uchun).
function siteUrl() {
  try {
    return new URL(process.env.SITE_URL || 'https://tier.undeadmc.uz').origin;
  } catch {
    return 'https://tier.undeadmc.uz';
  }
}

// Baza va zaxira nusxalar shu papkada. Platformada uni doimiy diskka (volume) ulang.
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');

const config = Object.freeze({
  root: ROOT,
  isDev,
  port: intEnv('PORT', 3000),
  // Bo'sh bo'lsa barcha interfeyslarda tinglaydi (platforma konteyneri uchun kerak).
  host: process.env.HOST || undefined,
  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, 'tiers.db'),
  backupDir: path.join(DATA_DIR, 'backups'),
  backupIntervalHours: intEnv('BACKUP_INTERVAL_HOURS', 24),
  backupKeepDays: intEnv('BACKUP_KEEP_DAYS', 30),
  publicDir: path.join(ROOT, 'public'),
  schemaPath: path.join(ROOT, 'db', 'schema.sql'),
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  discordUrl: process.env.DISCORD_URL || 'https://discord.gg/KNRKCRJenc',
  shopUrl: 'https://shop.undeadmc.uz',
  telegramUrl: 'https://t.me/undeadmcuz',
  siteUrl: siteUrl(),
  pageSize: 50,
  cacheTtlMs: 15 * 1000
});

module.exports = { config, sessionSecret, POINTS, TIERS, KIT_ICONS, DEFAULT_KITS };
