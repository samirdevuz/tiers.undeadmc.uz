-- UNDEAD MC tier sayti — SQLite sxemasi.
-- Server har ishga tushganda shu faylni bajaradi (hamma narsa IF NOT EXISTS).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'tester')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY,
  nick       TEXT    NOT NULL COLLATE NOCASE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- Nik katta-kichik harfdan qat'i nazar yagona.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nick ON players (nick COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS kits (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tiers (
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  kit_id     INTEGER NOT NULL REFERENCES kits (id) ON DELETE CASCADE,
  tier       TEXT    NOT NULL CHECK (tier IN ('HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5')),
  updated_at TEXT    NOT NULL,
  updated_by INTEGER REFERENCES staff (id) ON DELETE SET NULL,
  PRIMARY KEY (player_id, kit_id)
);
CREATE INDEX IF NOT EXISTS idx_tiers_kit_tier ON tiers (kit_id, tier);

CREATE TABLE IF NOT EXISTS tier_history (
  id         INTEGER PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  kit_id     INTEGER NOT NULL REFERENCES kits (id) ON DELETE CASCADE,
  old_tier   TEXT,
  new_tier   TEXT,
  staff_id   INTEGER REFERENCES staff (id) ON DELETE SET NULL,
  -- Xodim o'chirilsa ham tarixda ismi qolishi uchun.
  staff_name TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_player_kit ON tier_history (player_id, kit_id, id);

CREATE TABLE IF NOT EXISTS sessions (
  -- Cookie dagi tokenning HMAC qiymati (tokenning o'zi saqlanmaydi).
  id         TEXT    PRIMARY KEY,
  staff_id   INTEGER NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  csrf_token TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_staff ON sessions (staff_id);
