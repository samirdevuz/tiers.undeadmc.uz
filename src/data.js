'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('./db');
const cache = require('./cache');
const { config, POINTS, TIERS, KIT_ICONS } = require('./config');
const {
  HttpError, NICK_RE, SLUG_RE, USERNAME_RE, KIT_NAME_RE,
  str, nowIso, likeEscape, isUniqueError
} = require('./util');

const BCRYPT_COST = 12;
const RESERVED_SLUGS = new Set(['umumiy', 'reyting', 'tier-test', 'admin', 'api', 'player']);

// Faqat config.js dagi tekshirilgan POINTS jadvalidan quriladi, foydalanuvchi ma'lumotidan emas.
const POINTS_SQL = `CASE t.tier ${TIERS.map((t) => `WHEN '${t}' THEN ${POINTS[t]}`).join(' ')} ELSE 0 END`;

const q = {
  // --- ommaviy ---
  activeKits: db.prepare('SELECT id, slug, name, icon FROM kits WHERE active = 1 ORDER BY sort_order, id'),
  ranking: db.prepare(`
    SELECT p.id, p.nick, SUM(${POINTS_SQL}) AS total, COUNT(*) AS tested
    FROM players p
    JOIN tiers t ON t.player_id = p.id
    JOIN kits k ON k.id = t.kit_id AND k.active = 1
    GROUP BY p.id
    ORDER BY total DESC, tested DESC, p.nick COLLATE NOCASE ASC`),
  activeTiers: db.prepare(`
    SELECT t.player_id AS playerId, k.slug, t.tier
    FROM tiers t JOIN kits k ON k.id = t.kit_id AND k.active = 1`),
  kitBoard: db.prepare(`
    SELECT p.nick, t.tier
    FROM tiers t JOIN players p ON p.id = t.player_id
    WHERE t.kit_id = ?
    ORDER BY p.nick COLLATE NOCASE`),
  playerByNick: db.prepare('SELECT id, nick FROM players WHERE nick = ?'),
  playerTiers: db.prepare(`
    SELECT k.slug, t.tier, t.updated_at AS testedAt,
      (SELECT h.staff_name FROM tier_history h
        WHERE h.player_id = t.player_id AND h.kit_id = t.kit_id
        ORDER BY h.id DESC LIMIT 1) AS tester
    FROM tiers t JOIN kits k ON k.id = t.kit_id
    WHERE t.player_id = ? AND k.active = 1`),
  search: db.prepare(`
    SELECT id, nick FROM players
    WHERE nick LIKE @contains ESCAPE '\\'
    ORDER BY (nick LIKE @prefix ESCAPE '\\') DESC, length(nick), nick COLLATE NOCASE
    LIMIT 8`),

  // --- o'yinchilar (admin) ---
  adminPlayers: db.prepare(`
    SELECT p.id, p.nick, p.created_at AS createdAt,
      (SELECT COUNT(*) FROM tiers t WHERE t.player_id = p.id) AS tested
    FROM players p
    WHERE @like IS NULL OR p.nick LIKE @like ESCAPE '\\'
    ORDER BY p.nick COLLATE NOCASE
    LIMIT @limit OFFSET @offset`),
  adminPlayersCount: db.prepare(`
    SELECT COUNT(*) AS n FROM players p
    WHERE @like IS NULL OR p.nick LIKE @like ESCAPE '\\'`),
  playerById: db.prepare('SELECT id, nick, created_at AS createdAt FROM players WHERE id = ?'),
  playerTiersAll: db.prepare('SELECT kit_id AS kitId, tier, updated_at AS updatedAt FROM tiers WHERE player_id = ?'),
  playerHistory: db.prepare(`
    SELECT h.id, k.name AS kit, h.old_tier AS oldTier, h.new_tier AS newTier,
      h.staff_name AS staff, h.created_at AS at
    FROM tier_history h JOIN kits k ON k.id = h.kit_id
    WHERE h.player_id = ?
    ORDER BY h.id DESC LIMIT 30`),
  insertPlayer: db.prepare('INSERT INTO players (nick, created_at) VALUES (?, ?)'),
  renamePlayer: db.prepare('UPDATE players SET nick = ? WHERE id = ?'),
  deletePlayer: db.prepare('DELETE FROM players WHERE id = ?'),
  tierFor: db.prepare('SELECT tier FROM tiers WHERE player_id = ? AND kit_id = ?'),
  upsertTier: db.prepare(`
    INSERT INTO tiers (player_id, kit_id, tier, updated_at, updated_by)
    VALUES (@playerId, @kitId, @tier, @at, @staffId)
    ON CONFLICT (player_id, kit_id) DO UPDATE SET
      tier = excluded.tier, updated_at = excluded.updated_at, updated_by = excluded.updated_by`),
  deleteTier: db.prepare('DELETE FROM tiers WHERE player_id = ? AND kit_id = ?'),
  insertHistory: db.prepare(`
    INSERT INTO tier_history (player_id, kit_id, old_tier, new_tier, staff_id, staff_name, created_at)
    VALUES (@playerId, @kitId, @oldTier, @newTier, @staffId, @staffName, @at)`),
  recentHistory: db.prepare(`
    SELECT h.id, p.nick, k.name AS kit, h.old_tier AS oldTier, h.new_tier AS newTier,
      h.staff_name AS staff, h.created_at AS at
    FROM tier_history h
    JOIN players p ON p.id = h.player_id
    JOIN kits k ON k.id = h.kit_id
    ORDER BY h.id DESC LIMIT ?`),

  // --- kitlar (admin) ---
  allKits: db.prepare(`
    SELECT k.id, k.slug, k.name, k.icon, k.sort_order AS sortOrder, k.active,
      (SELECT COUNT(*) FROM tiers t WHERE t.kit_id = k.id) AS players
    FROM kits k ORDER BY k.sort_order, k.id`),
  kitById: db.prepare('SELECT id, slug, name, icon, sort_order AS sortOrder, active FROM kits WHERE id = ?'),
  kitIds: db.prepare('SELECT id FROM kits'),
  maxKitOrder: db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM kits'),
  insertKit: db.prepare(`
    INSERT INTO kits (slug, name, icon, sort_order, active)
    VALUES (@slug, @name, @icon, @sortOrder, @active)`),
  updateKit: db.prepare('UPDATE kits SET slug = @slug, name = @name, icon = @icon, active = @active WHERE id = @id'),
  setKitOrder: db.prepare('UPDATE kits SET sort_order = ? WHERE id = ?'),

  // --- xodimlar (admin) ---
  allStaff: db.prepare(`
    SELECT id, username, role, created_at AS createdAt
    FROM staff ORDER BY role, username COLLATE NOCASE`),
  staffById: db.prepare('SELECT id, username, role, password_hash AS hash FROM staff WHERE id = ?'),
  insertStaff: db.prepare('INSERT INTO staff (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)'),
  updateStaffRole: db.prepare('UPDATE staff SET role = ? WHERE id = ?'),
  updateStaffPassword: db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?'),
  deleteStaff: db.prepare('DELETE FROM staff WHERE id = ?'),
  adminCount: db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'admin'"),
  deleteOtherSessions: db.prepare('DELETE FROM sessions WHERE staff_id = ? AND id IS NOT ?')
};

function invalidate() {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Ommaviy ma'lumotlar                                                 */
/* ------------------------------------------------------------------ */

function activeKits() {
  return cache.wrap('_kits', () => q.activeKits.all());
}

// Butun reyting bir marta hisoblanadi va 15 soniya keshlanadi.
function ranking() {
  return cache.wrap('_ranking', () => {
    const tiersByPlayer = new Map();
    for (const row of q.activeTiers.all()) {
      let tiers = tiersByPlayer.get(row.playerId);
      if (!tiers) tiersByPlayer.set(row.playerId, (tiers = {}));
      tiers[row.slug] = row.tier;
    }
    const list = q.ranking.all().map((row, i) => ({
      rank: i + 1,
      id: row.id,
      nick: row.nick,
      total: row.total,
      tested: row.tested,
      tiers: tiersByPlayer.get(row.id) || {}
    }));
    return { list, byId: new Map(list.map((p) => [p.id, p])) };
  });
}

function publicKits() {
  return {
    kits: activeKits().map(({ slug, name, icon }) => ({ slug, name, icon })),
    points: POINTS,
    ranked: ranking().list.length
  };
}

function leaderboard(page) {
  const { list } = ranking();
  const size = config.pageSize;
  const players = list
    .slice((page - 1) * size, page * size)
    .map(({ rank, nick, total, tested, tiers }) => ({ rank, nick, total, tested, tiers }));
  return {
    page,
    pageSize: size,
    total: list.length,
    totalPages: Math.max(1, Math.ceil(list.length / size)),
    players
  };
}

function kitBoard(slug) {
  const kit = activeKits().find((k) => k.slug === slug);
  if (!kit) return null;
  const tiers = [1, 2, 3, 4, 5].map((n) => ({ tier: n, ht: [], lt: [] }));
  const rows = q.kitBoard.all(kit.id);
  for (const { nick, tier } of rows) {
    const column = tiers[Number(tier.slice(2)) - 1];
    (tier.startsWith('HT') ? column.ht : column.lt).push(nick);
  }
  return { kit: { slug: kit.slug, name: kit.name, icon: kit.icon }, total: rows.length, tiers };
}

function playerProfile(nick) {
  const player = q.playerByNick.get(nick);
  if (!player) return null;
  const ranked = ranking().byId.get(player.id);
  const byKit = new Map(q.playerTiers.all(player.id).map((row) => [row.slug, row]));
  return {
    nick: player.nick,
    rank: ranked ? ranked.rank : null,
    total: ranked ? ranked.total : 0,
    tested: ranked ? ranked.tested : 0,
    kits: activeKits().map((kit) => {
      const t = byKit.get(kit.slug);
      return {
        slug: kit.slug,
        name: kit.name,
        icon: kit.icon,
        tier: t ? t.tier : null,
        points: t ? POINTS[t.tier] : 0,
        testedAt: t ? t.testedAt : null,
        tester: t ? t.tester : null
      };
    })
  };
}

function searchPlayers(term) {
  const esc = likeEscape(term);
  const { byId } = ranking();
  return q.search.all({ contains: `%${esc}%`, prefix: `${esc}%` }).map((p) => {
    const ranked = byId.get(p.id);
    return { nick: p.nick, rank: ranked ? ranked.rank : null, total: ranked ? ranked.total : 0 };
  });
}

/* ------------------------------------------------------------------ */
/* O'yinchilar (admin)                                                 */
/* ------------------------------------------------------------------ */

function validateNick(raw) {
  const nick = str(raw);
  if (!NICK_RE.test(nick)) {
    throw new HttpError(400, "Nik 3–16 belgidan iborat bo'lsin: lotin harflari, raqamlar yoki _.");
  }
  return nick;
}

function adminListPlayers(term, page) {
  const like = term ? `%${likeEscape(term)}%` : null;
  const size = config.pageSize;
  const total = q.adminPlayersCount.get({ like }).n;
  const { byId } = ranking();
  const players = q.adminPlayers.all({ like, limit: size, offset: (page - 1) * size }).map((p) => {
    const ranked = byId.get(p.id);
    return { ...p, total: ranked ? ranked.total : 0, rank: ranked ? ranked.rank : null };
  });
  return { page, pageSize: size, total, totalPages: Math.max(1, Math.ceil(total / size)), players };
}

function adminGetPlayer(id) {
  const player = q.playerById.get(id);
  if (!player) throw new HttpError(404, "Bunday o'yinchi topilmadi.");
  const ranked = ranking().byId.get(id);
  const tiers = {};
  for (const t of q.playerTiersAll.all(id)) tiers[t.kitId] = { tier: t.tier, updatedAt: t.updatedAt };
  return {
    ...player,
    total: ranked ? ranked.total : 0,
    rank: ranked ? ranked.rank : null,
    tiers,
    history: q.playerHistory.all(id)
  };
}

function addPlayer(rawNick) {
  const nick = validateNick(rawNick);
  let info;
  try {
    info = q.insertPlayer.run(nick, nowIso());
  } catch (err) {
    if (isUniqueError(err)) throw new HttpError(409, "Bu nikdagi o'yinchi allaqachon bor.");
    throw err;
  }
  invalidate();
  return adminGetPlayer(Number(info.lastInsertRowid));
}

function renamePlayer(id, rawNick) {
  const nick = validateNick(rawNick);
  let info;
  try {
    info = q.renamePlayer.run(nick, id);
  } catch (err) {
    if (isUniqueError(err)) throw new HttpError(409, "Bu nikdagi o'yinchi allaqachon bor.");
    throw err;
  }
  if (info.changes === 0) throw new HttpError(404, "Bunday o'yinchi topilmadi.");
  invalidate();
  return adminGetPlayer(id);
}

function deletePlayer(id) {
  const info = q.deletePlayer.run(id);
  if (info.changes === 0) throw new HttpError(404, "Bunday o'yinchi topilmadi.");
  invalidate();
}

const applyTierChanges = db.transaction((playerId, changes, staff) => {
  const at = nowIso();
  let changed = 0;
  for (const { kitId, tier } of changes) {
    const current = q.tierFor.get(playerId, kitId);
    const oldTier = current ? current.tier : null;
    if (oldTier === tier) continue;
    if (tier) q.upsertTier.run({ playerId, kitId, tier, at, staffId: staff.id });
    else q.deleteTier.run(playerId, kitId);
    q.insertHistory.run({
      playerId, kitId, oldTier, newTier: tier,
      staffId: staff.id, staffName: staff.username, at
    });
    changed++;
  }
  return changed;
});

function setPlayerTiers(playerId, rawChanges, staff) {
  if (!q.playerById.get(playerId)) throw new HttpError(404, "Bunday o'yinchi topilmadi.");
  if (!Array.isArray(rawChanges) || rawChanges.length === 0 || rawChanges.length > 100) {
    throw new HttpError(400, "O'zgarishlar ro'yxati noto'g'ri.");
  }
  const kitIds = new Set(q.kitIds.all().map((k) => k.id));
  const seen = new Set();
  const changes = rawChanges.map((c) => {
    const kitId = Number(c && c.kitId);
    if (!kitIds.has(kitId) || seen.has(kitId)) throw new HttpError(400, 'Kit topilmadi.');
    seen.add(kitId);
    const tier = c.tier == null || c.tier === '' ? null : String(c.tier).toUpperCase();
    if (tier !== null && !TIERS.includes(tier)) throw new HttpError(400, "Noto'g'ri tier.");
    return { kitId, tier };
  });
  const changed = applyTierChanges(playerId, changes, staff);
  if (changed) invalidate();
  return { changed, player: adminGetPlayer(playerId) };
}

function recentHistory(limit) {
  return q.recentHistory.all(limit);
}

/* ------------------------------------------------------------------ */
/* Kitlar (admin)                                                      */
/* ------------------------------------------------------------------ */

function listKits() {
  return q.allKits.all();
}

function validateKit(body, base) {
  const name = body.name !== undefined ? str(body.name) : base.name;
  const slug = body.slug !== undefined ? str(body.slug).toLowerCase() : base.slug;
  const icon = body.icon !== undefined ? str(body.icon) : base.icon;
  const active = body.active !== undefined ? (body.active === true || body.active === 1 ? 1 : 0) : base.active;
  if (!KIT_NAME_RE.test(name)) throw new HttpError(400, "Kit nomi 1–24 belgidan iborat bo'lsin.");
  if (!SLUG_RE.test(slug)) {
    throw new HttpError(400, "Slug 2–24 belgi bo'lsin: kichik lotin harflari, raqamlar va - belgisi.");
  }
  if (RESERVED_SLUGS.has(slug)) throw new HttpError(400, "Bu slug band qilingan, boshqasini tanlang.");
  if (!KIT_ICONS.includes(icon)) throw new HttpError(400, "Noma'lum ikonka.");
  return { name, slug, icon, active };
}

function createKit(body) {
  const kit = validateKit(body, { name: '', slug: '', icon: '', active: 1 });
  let info;
  try {
    info = q.insertKit.run({ ...kit, sortOrder: q.maxKitOrder.get().m + 1 });
  } catch (err) {
    if (isUniqueError(err)) throw new HttpError(409, 'Bu slug bilan kit allaqachon bor.');
    throw err;
  }
  invalidate();
  return q.kitById.get(Number(info.lastInsertRowid));
}

function updateKit(id, body) {
  const existing = q.kitById.get(id);
  if (!existing) throw new HttpError(404, 'Kit topilmadi.');
  const kit = validateKit(body, existing);
  try {
    q.updateKit.run({ ...kit, id });
  } catch (err) {
    if (isUniqueError(err)) throw new HttpError(409, 'Bu slug bilan kit allaqachon bor.');
    throw err;
  }
  invalidate();
  return q.kitById.get(id);
}

const writeKitOrder = db.transaction((ids) => {
  ids.forEach((id, i) => q.setKitOrder.run(i + 1, id));
});

function reorderKits(rawIds) {
  const all = q.kitIds.all().map((k) => k.id);
  const ids = Array.isArray(rawIds) ? rawIds.map(Number) : [];
  const unique = new Set(ids);
  if (ids.length !== all.length || unique.size !== ids.length || !all.every((id) => unique.has(id))) {
    throw new HttpError(400, "Kitlar tartibi noto'g'ri.");
  }
  writeKitOrder(ids);
  invalidate();
  return listKits();
}

/* ------------------------------------------------------------------ */
/* Xodimlar (admin)                                                    */
/* ------------------------------------------------------------------ */

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) {
    throw new HttpError(400, "Parol 8–128 belgidan iborat bo'lsin.");
  }
  return pw;
}

function validateRole(role) {
  if (role !== 'admin' && role !== 'tester') throw new HttpError(400, "Rol noto'g'ri.");
  return role;
}

function listStaff() {
  return q.allStaff.all();
}

async function createStaff(body) {
  const username = str(body.username);
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, "Login 3–32 belgi bo'lsin: lotin harflari, raqamlar, _ . -");
  }
  const role = validateRole(body.role);
  const hash = await bcrypt.hash(validatePassword(body.password), BCRYPT_COST);
  try {
    q.insertStaff.run(username, hash, role, nowIso());
  } catch (err) {
    if (isUniqueError(err)) throw new HttpError(409, 'Bu login band.');
    throw err;
  }
  return listStaff();
}

async function updateStaff(id, body, actor) {
  const target = q.staffById.get(id);
  if (!target) throw new HttpError(404, 'Xodim topilmadi.');
  if (body.role !== undefined) {
    const role = validateRole(body.role);
    if (target.role === 'admin' && role !== 'admin' && q.adminCount.get().n <= 1) {
      throw new HttpError(400, 'Kamida bitta admin qolishi kerak.');
    }
    q.updateStaffRole.run(role, id);
  }
  if (body.password !== undefined) {
    const hash = await bcrypt.hash(validatePassword(body.password), BCRYPT_COST);
    q.updateStaffPassword.run(hash, id);
    // Parol almashsa, shu xodimning boshqa sessiyalari yopiladi.
    q.deleteOtherSessions.run(id, id === actor.id ? actor.sessionId : null);
  }
  return listStaff();
}

function deleteStaff(id, actor) {
  if (id === actor.id) throw new HttpError(400, "O'zingizni o'chira olmaysiz.");
  const target = q.staffById.get(id);
  if (!target) throw new HttpError(404, 'Xodim topilmadi.');
  if (target.role === 'admin' && q.adminCount.get().n <= 1) {
    throw new HttpError(400, 'Kamida bitta admin qolishi kerak.');
  }
  q.deleteStaff.run(id);
  return listStaff();
}

async function changeOwnPassword(actor, current, next) {
  const me = q.staffById.get(actor.id);
  if (!me || typeof current !== 'string' || !(await bcrypt.compare(current, me.hash))) {
    throw new HttpError(400, "Joriy parol noto'g'ri.");
  }
  const hash = await bcrypt.hash(validatePassword(next), BCRYPT_COST);
  q.updateStaffPassword.run(hash, actor.id);
  q.deleteOtherSessions.run(actor.id, actor.sessionId);
}

module.exports = {
  BCRYPT_COST,
  // ommaviy
  publicKits, leaderboard, kitBoard, playerProfile, searchPlayers,
  // admin
  adminListPlayers, adminGetPlayer, addPlayer, renamePlayer, deletePlayer, setPlayerTiers, recentHistory,
  listKits, createKit, updateKit, reorderKits,
  listStaff, createStaff, updateStaff, deleteStaff, changeOwnPassword
};
