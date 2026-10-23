'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const { config } = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(fs.readFileSync(config.schemaPath, 'utf8'));

// Eski bazalarga skin ustunlarini qo'shish (schema.sql faqat yangi jadvallarni yaratadi).
const playerColumns = new Set(db.prepare('PRAGMA table_info(players)').all().map((c) => c.name));
if (!playerColumns.has('skin_hash')) db.exec('ALTER TABLE players ADD COLUMN skin_hash TEXT');
if (!playerColumns.has('skin_png')) db.exec('ALTER TABLE players ADD COLUMN skin_png BLOB');
db.exec('CREATE INDEX IF NOT EXISTS idx_players_skin ON players (skin_hash)');

module.exports = { db };
