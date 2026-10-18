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

module.exports = { db };
