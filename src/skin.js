'use strict';

const crypto = require('crypto');
const { HttpError, NICK_RE } = require('./util');

const MAX_BYTES = 64 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FETCH_TIMEOUT_MS = 8000;

// Faqat Minecraft skin formati: PNG, eni 64, bo'yi 64 (yangi) yoki 32 (eski format).
function validateSkin(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'Skin fayli yuborilmadi.');
  if (buf.length > MAX_BYTES) throw new HttpError(400, 'Skin fayli juda katta (64 KB dan oshmasin).');
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new HttpError(400, "Skin PNG formatida bo'lishi kerak.");
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new HttpError(400, `Skin o'lchami 64x64 yoki 64x32 bo'lishi kerak (yuborilgan: ${width}x${height}).`);
  }
  return buf;
}

function skinHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

async function fetchOk(url, what) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
  } catch {
    throw new HttpError(502, `${what}: Mojang serveriga ulanib bo'lmadi. Birozdan keyin qayta urinib ko'ring.`);
  }
  return res;
}

// Litsenziya (Mojang) akkauntining skinini yuklab oladi: nik → UUID → profil → textures.minecraft.net.
async function fetchMojangSkin(rawNick) {
  const nick = typeof rawNick === 'string' ? rawNick.trim() : '';
  if (!NICK_RE.test(nick)) throw new HttpError(400, "Litsenziya nik 3–16 belgi bo'lsin: lotin harflari, raqamlar yoki _.");

  const profileRes = await fetchOk(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nick)}`, 'Nik');
  if (profileRes.status === 204 || profileRes.status === 404) {
    throw new HttpError(404, `"${nick}" nomli litsenziya akkaunt topilmadi.`);
  }
  if (!profileRes.ok) throw new HttpError(502, `Mojang javob bermadi (${profileRes.status}).`);
  const { id } = await profileRes.json();
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/i.test(id)) throw new HttpError(502, "Mojang javobi noto'g'ri.");

  const sessionRes = await fetchOk(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, 'Profil');
  if (!sessionRes.ok) throw new HttpError(502, `Mojang javob bermadi (${sessionRes.status}).`);
  const session = await sessionRes.json();
  const prop = (session.properties || []).find((p) => p && p.name === 'textures');
  let skinUrl = null;
  try {
    const textures = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
    skinUrl = textures.textures.SKIN.url;
  } catch {
    skinUrl = null;
  }
  if (!skinUrl) throw new HttpError(404, `"${nick}" akkauntida skin o'rnatilmagan (standart Steve/Alex).`);

  // Faqat Mojang tekstura serveridan yuklanadi.
  const url = new URL(skinUrl);
  if (url.hostname !== 'textures.minecraft.net') throw new HttpError(502, "Mojang javobi noto'g'ri.");
  url.protocol = 'https:';
  const pngRes = await fetchOk(url.href, 'Skin');
  if (!pngRes.ok) throw new HttpError(502, `Skinni yuklab bo'lmadi (${pngRes.status}).`);
  const buf = Buffer.from(await pngRes.arrayBuffer());
  return validateSkin(buf);
}

module.exports = { validateSkin, skinHash, fetchMojangSkin, MAX_BYTES };
