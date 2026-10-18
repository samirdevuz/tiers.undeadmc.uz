'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('./config');

const VIEWS = path.join(config.root, 'views');

const DEFAULT_META = {
  title: 'UNDEAD MC Tierlar — PvP reyting',
  description: "UNDEAD MC o'zbek Minecraft serverining PvP tier reytingi: Sword, Axe, Mace, Crystal va boshqa kitlar bo'yicha o'yinchilar tierlari, umumiy reyting va profillar.",
  path: '/',
  robots: 'index, follow'
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function fill(html, values) {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));
}

// CSS/JS fayllari o'zgarsa versiya ham o'zgaradi (?v=...), shuning uchun ularni uzoq keshlash mumkin.
function assetVersion() {
  const hash = crypto.createHash('sha256');
  for (const dir of ['css', 'js']) {
    const full = path.join(config.publicDir, dir);
    for (const file of fs.readdirSync(full).sort()) hash.update(fs.readFileSync(path.join(full, file)));
  }
  return hash.digest('hex').slice(0, 10);
}

let cached = null;

function templates() {
  if (cached && !config.isDev) return cached;
  const shared = {
    v: assetVersion(),
    discord: escapeHtml(config.discordUrl),
    shop: escapeHtml(config.shopUrl),
    telegram: escapeHtml(config.telegramUrl),
    site: escapeHtml(config.siteUrl)
  };
  const read = (name) => fill(fs.readFileSync(path.join(VIEWS, name), 'utf8'), shared);
  cached = { index: read('index.html'), admin: read('admin.html'), notFound: read('404.html') };
  return cached;
}

function index(nick, missing) {
  const meta = nick
    ? {
        title: `${nick} — UNDEAD MC Tierlar`,
        description: `${nick} — UNDEAD MC PvP tier reytingidagi profil: kitlar bo'yicha tierlar, umumiy ball va o'rin.`,
        path: `/player/${encodeURIComponent(nick)}`,
        robots: 'index, follow'
      }
    : DEFAULT_META;
  return fill(templates().index, {
    title: escapeHtml(meta.title),
    description: escapeHtml(meta.description),
    url: escapeHtml(config.siteUrl + meta.path),
    robots: missing ? 'noindex' : meta.robots
  });
}

function admin() {
  return templates().admin;
}

function notFound() {
  return templates().notFound;
}

module.exports = { index, admin, notFound, assetVersion };
