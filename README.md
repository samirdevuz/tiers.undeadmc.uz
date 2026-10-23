# UNDEAD MC Tierlar — tier.undeadmc.uz

UNDEAD MC serverining PvP tier reytingi. Testerlar o'yinchilarni kitlarda (Sword, Axe, Mace, ...) sinaydi
va har bir kit uchun tier qo'yadi: **HT1** (eng kuchli) … **LT5** (boshlang'ich).

Saytda:

- **Umumiy reyting** — barcha kitlardagi ballar yig'indisi bo'yicha, 50 tadan yuklanadi;
- **Kit tablari** — har bir kit uchun Tier 1 … Tier 5 ustunlari (manzil: `#sword`, `#axe`, ...);
- **O'yinchi profili** — `/player/NIK` manzilida ham ochiladi, har bir kit bo'yicha "Oxirgi test";
- **Admin panel** — `/admin`: o'yinchilar, tierlar, kitlar, xodimlar (admin / tester) va zaxira nusxalar.

Sayt shop.undeadmc.uz bilan bir xil brendda (logo, ranglar, shriftlar). Do'kon Vercel'da qoladi.

- **Repozitoriy:** `github.com/samirdevuz/tiers.undeadmc.uz` (`main` branch)
- **Hosting:** [mcweb.uz](https://mcweb.uz) — Node.js 22 "Web Service" (HTTPS va ishga tushirishni platforma qiladi)
- **Texnologiyalar:** Node.js 20+, Express, SQLite (better-sqlite3), oddiy HTML/CSS/JS (build kerak emas)

---

## Papkalar

| Yo'l | Nima uchun |
|---|---|
| `server.js` | Server (Express). `npm start` shu faylni ishga tushiradi. |
| `src/config.js` | Sozlamalar va **ballar jadvali** (`POINTS`). |
| `src/bootstrap.js` | Birinchi ishga tushirishda kitlar va adminni yaratadi. |
| `src/backup.js` | Avtomatik va qo'lda zaxira nusxalar. |
| `src/data.js` | Bazaga so'rovlar va reyting hisobi. |
| `src/auth.js` | Admin login, sessiya, CSRF himoyasi. |
| `src/routes/` | Ommaviy API (`/api/...`) va admin API (`/admin/api/...`). |
| `views/` | HTML sahifalar (bosh sahifa, admin, 404). |
| `public/` | CSS, JS, logo va ikonkalar. |
| `db/schema.sql` | SQLite jadvallari. |
| `scripts/` | `seed.js`, `hash-password.js`, `backup.js` / `backup.sh`. |
| `deploy/` | Faqat o'z VPS ingiz uchun: nginx, pm2, systemd (mcweb.uz da kerak emas). |
| `data/` | Standart `DATA_DIR`: baza (`tiers.db`) va `backups/`. Gitga kirmaydi. |

---

## 1. Kompyuterda sinab ko'rish

```bash
git clone https://github.com/samirdevuz/tiers.undeadmc.uz.git
cd tiers.undeadmc.uz
npm install
cp .env.example .env
npm run hash-password
```

`.env` faylida:

- `NODE_ENV=development` qiling (aks holda admin cookie faqat HTTPS orqali ishlaydi);
- `hash-password` chiqargan `ADMIN_PASSWORD_HASH='...'` qatorini qo'ying.

Keyin `npm run dev` va brauzerda `http://localhost:3000` (sayt), `http://localhost:3000/admin` (admin).
Birinchi ishga tushishda 8 ta kit va `.env` dagi admin avtomatik yaratiladi.

Sinov uchun 10 ta demo o'yinchi: `npm run seed -- --demo`. O'chirish: `npm run seed -- --remove-demo`.
Haqiqiy saytda demo ishlatmang.

---

## 2. mcweb.uz ga joylash (asosiy usul)

> mcweb.uz hujjatlari hali to'liq chiqmagan, shuning uchun paneldagi tugma va bo'lim nomlari
> quyidagidan biroz farq qilishi mumkin. Savollar uchun: [t.me/mcwebuz](https://t.me/mcwebuz).

### 2.1. Kodni GitHub'ga yuklash

Kod `github.com/samirdevuz/tiers.undeadmc.uz` repozitoriyasida bo'lishi kerak (`main` branch).
`.env`, `node_modules` va `*.db` fayllari `.gitignore` orqali gitga kirmaydi — maxfiy ma'lumotlar
faqat platforma sozlamalarida turadi.

### 2.2. Web Service yaratish

mcweb.uz panelida yangi loyiha (Web Service) yarating va GitHub repozitoriyani ulang:

| Sozlama | Qiymat |
|---|---|
| Repozitoriy | `samirdevuz/tiers.undeadmc.uz`, branch `main` |
| Runtime | Node.js 22 |
| Build buyrug'i | `npm ci` (odatda o'zi aniqlanadi) |
| Start buyrug'i | `npm start` |
| Port | platforma beradi (`PORT`) — ilova uni o'zi o'qiydi |
| Nusxalar soni (instances) | **1** (SQLite va login cheklovi bitta jarayonga mo'ljallangan) |
| Health check (bo'lsa) | `/healthz` |

### 2.3. Muhit o'zgaruvchilari (Environment variables)

| O'zgaruvchi | Qiymat | Majburiy |
|---|---|---|
| `NODE_ENV` | `production` | ha |
| `SESSION_SECRET` | kamida 32 ta tasodifiy belgi (pastga qarang) | ha |
| `ADMIN_USERNAME` | birinchi admin logini, masalan `komil` | ha |
| `ADMIN_PASSWORD_HASH` | `npm run hash-password` natijasi (qo'shtirnoqsiz ham bo'ladi) | ha |
| `DATA_DIR` | doimiy disk ulangan papka, masalan `/data` (2.4 ga qarang) | ha |
| `SITE_URL` | `https://tier.undeadmc.uz` | tavsiya |
| `DISCORD_URL` | Discord taklif havolasi | yo'q |
| `BACKUP_INTERVAL_HOURS` | avtomatik zaxira oralig'i, standart `24` (`0` — o'chirilgan) | yo'q |
| `BACKUP_KEEP_DAYS` | zaxiralar necha kun saqlanadi, standart `30` | yo'q |
| `ADMIN_FORCE_RESET` | faqat parolni tiklashda `true` (2.8) | yo'q |

`PORT` ni o'zingiz yozmang — uni platforma beradi.

Qiymatlarni o'z kompyuteringizda tayyorlang (loyiha papkasida, `npm install` dan keyin):

```bash
npm run hash-password
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Birinchisi parol hashini beradi (`ADMIN_PASSWORD_HASH='$2b$12$...'` — panelga faqat qo'shtirnoq
ichidagi qismni kiritish kifoya), ikkinchisi `SESSION_SECRET` uchun tasodifiy qator.

### 2.4. Doimiy disk (persistent storage) — muhim!

Baza (`tiers.db`) va zaxira nusxalar `DATA_DIR` papkasida saqlanadi. Konteyner har deploy da
yangidan yaratilsa, oddiy papkadagi fayllar **o'chib ketadi**. Shuning uchun:

1. Loyiha sozlamalarida doimiy disk (volume / storage) qo'shing va uni masalan `/data` ga ulang.
2. `DATA_DIR=/data` qiling.
3. Tekshiring: admin panelda bitta sinov o'yinchi qo'shing, qayta deploy qiling — o'yinchi qolishi kerak.
   **Zaxira** bo'limida nusxalar joylashuvi ko'rsatiladi.

Agar mcweb.uz tarifingizda doimiy disk bo'lmasa, saytni ishga tushirishdan oldin qo'llab-quvvatlash
xizmatidan so'rang — usiz har yangilanishda barcha tierlar yo'qoladi.

### 2.5. Birinchi ishga tushirish

Deploy tugagach, loglarda shunday qatorlar chiqadi:

```
[setup] 8 ta standart kit qo'shildi.
[setup] Admin "komil" yaratildi (ADMIN_USERNAME / ADMIN_PASSWORD_HASH).
```

SSH yoki `npm run seed` kerak emas: baza bo'sh bo'lsa, server kitlarni va adminni o'zi yaratadi.
Admin allaqachon bo'lsa, bu o'zgaruvchilar boshqa ta'sir qilmaydi.

Platforma bergan manzilni oching (`https://<nom>.mcweb.uz`) va `/admin` ga kiring.

> Agar `*.mcweb.uz` manzilida kirishda "Xavfsizlik tokeni eskirgan" chiqsa, `SITE_URL` ni vaqtincha
> shu manzilga (`https://<nom>.mcweb.uz`) o'zgartiring. Domen ulangandan keyin `https://tier.undeadmc.uz` qiling.

### 2.6. tier.undeadmc.uz domenini ulash

1. Loyiha sozlamalarida (Domains) `tier.undeadmc.uz` ni qo'shing. Panel qaysi DNS yozuvi kerakligini
   ko'rsatadi — odatda `CNAME` (`tier` → `<nom>.mcweb.uz`) yoki `A` (`tier` → IP manzil).
2. undeadmc.uz DNS sozlamalarida (domen ro'yxatdan o'tgan joyda) shu yozuvni qo'shing:

   | Turi | Nomi | Qiymati |
   |---|---|---|
   | panel ko'rsatgan (`CNAME` yoki `A`) | `tier` | panel ko'rsatgan qiymat |

   `shop` yozuviga (Vercel) tegmang.
3. DNS tarqalgach (bir necha daqiqadan bir necha soatgacha) platforma HTTPS sertifikatini o'zi chiqaradi.
4. `SITE_URL=https://tier.undeadmc.uz` ekanini tekshiring va servisni qayta ishga tushiring.

Tayyor: **https://tier.undeadmc.uz** va **https://tier.undeadmc.uz/admin**.

### 2.7. Saytni yangilash

`main` branch'ga `git push` qiling — mcweb.uz yangi versiyani o'zi build qilib ishga tushiradi.
Baza va zaxiralar `DATA_DIR` (doimiy disk) da bo'lgani uchun saqlanib qoladi.

### 2.8. Admin parolini unutsangiz

1. O'z kompyuteringizda `npm run hash-password` bilan yangi hash oling.
2. Platformada `ADMIN_PASSWORD_HASH` ni yangilang va `ADMIN_FORCE_RESET=true` qiling, qayta ishga tushiring.
   `ADMIN_USERNAME` dagi foydalanuvchi paroli yangilanadi (bo'lmasa — admin sifatida yaratiladi).
3. Kirgach, `ADMIN_FORCE_RESET` ni o'chiring (`false`) — aks holda har qayta ishga tushishda parol qayta yoziladi.

Testerlar parolini admin **Xodimlar** bo'limida o'zgartiradi.

---

## 3. Tierlarni qo'shish va o'zgartirish

1. `https://tier.undeadmc.uz/admin` ga kiring.
2. **O'yinchilar** bo'limida yangi nikni yozing va **Qo'shish** ni bosing
   (nik: 3–16 belgi, lotin harflari, raqamlar va `_`; katta-kichik harf farqi yo'q).
3. O'yinchini ro'yxatdan tanlang, kerakli kitlarda tierni tanlang va **Tierlarni saqlash** ni bosing.
   Tierni olib tashlash uchun "— yo'q" ni tanlang.
4. Har bir o'zgarish tarixga yoziladi (kim, qachon, eski → yangi) va saytdagi profilda
   "Oxirgi test: sana, tester: ism" bo'lib chiqadi. Sayt 15 soniya ichida yangilanadi.

### Skin qo'yish

O'yinchini tanlang, **Skin** bo'limida:

- **Fayl yuklash** — skin PNG faylini tanlang (64x64 yoki eski 64x32 format, 64 KB gacha).
  Oldindan ko'rinishi chiqadi, keyin **Yuklash** ni bosing. Ingichka qo'lli (Alex) skinlar o'zi aniqlanadi.
- **Litsenziya nikidan olish** — o'yinchining Mojang (litsenziya) akkaunti bo'lsa, nikini yozing va
  **Skinni olish** ni bosing: skin Mojang serveridan bir marta yuklab olinib saytda saqlanadi.
- **Skinni olib tashlash** — saytdagi skin o'chadi.

Skin bazada (`tiers.db`) saqlanadi, shuning uchun zaxira nusxalarga ham kiradi. Saytda skin to'liq
3D personaj bo'lib chiqadi: umumiy reytingning tepasida top 3 podiumi, har bir qatorda va profilda.
Skin qo'yilmagan o'yinchilar uchun avvalgidek mc-heads.net dan nik bo'yicha rasm olinadi.

**Rollar:**

- **Tester** — o'yinchi qo'shadi, nikini o'zgartiradi, tier va skin qo'yadi.
- **Admin** — yana: o'yinchilarni o'chiradi, kitlarni (qo'shish, nomlash, tartib, yoqish/o'chirish),
  xodimlarni (**Xodimlar**) va zaxira nusxalarni (**Zaxira**) boshqaradi.

Har bir xodim **Parolim** bo'limida o'z parolini almashtira oladi.

### Ballar jadvali

| Tier | HT1 | LT1 | HT2 | LT2 | HT3 | LT3 | HT4 | LT4 | HT5 | LT5 |
|---|---|---|---|---|---|---|---|---|---|---|
| Ball | 60 | 45 | 30 | 20 | 10 | 6 | 4 | 3 | 2 | 1 |

O'yinchining umumiy bali — barcha **faol** kitlardagi ballar yig'indisi. Reyting: ball bo'yicha,
teng bo'lsa — tekshirilgan kitlar soni bo'yicha, keyin nik bo'yicha (A–Z).

Ballarni o'zgartirish: `src/config.js` dagi `POINTS` obyektini tahrirlang va `main` ga push qiling.

---

## 4. Zaxira nusxa (backup)

- **Avtomatik:** server har `BACKUP_INTERVAL_HOURS` soatda (standart 24) `DATA_DIR/backups/` ga
  `tiers-YYYY-MM-DD_HHMM.db.gz` nusxa yozadi; `BACKUP_KEEP_DAYS` kundan (standart 30) eskilari o'chiriladi.
  Cron yoki SSH kerak emas. Nusxa olish sayt ishlab turganda ham xavfsiz.
- **Admin panel → Zaxira:** "Hozir nusxa olish" tugmasi va har bir nusxani **yuklab olish**.
  Haftada bir marta nusxani kompyuteringizga yuklab oling — disk buzilsa ham ma'lumot qoladi.
- **Buyruq orqali** (konsol bo'lsa yoki VPS da): `npm run backup` (yoki `bash scripts/backup.sh`).

**Tiklash:**

1. Servisni to'xtating.
2. Kerakli `.db.gz` faylni oching (`gunzip tiers-....db.gz`, Windows'da 7-Zip) va `DATA_DIR/tiers.db` o'rniga qo'ying.
3. `DATA_DIR` dagi `tiers.db-wal` va `tiers.db-shm` fayllarini o'chiring.
4. Servisni ishga tushiring.

mcweb.uz da diskdagi faylni almashtirish uchun platformaning konsoli / fayl menejeridan foydalaning
yoki qo'llab-quvvatlash xizmatiga murojaat qiling.

---

## 5. O'z VPS ingizda (muqobil usul)

`deploy/` papkasi o'z serveringiz (Ubuntu) uchun: nginx proksi, pm2 yoki systemd.

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx build-essential python3
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo adduser --system --group --home /home/undeadmc undeadmc

sudo git clone https://github.com/samirdevuz/tiers.undeadmc.uz.git /var/www/undeadmc-tiers
sudo chown -R undeadmc:undeadmc /var/www/undeadmc-tiers
cd /var/www/undeadmc-tiers
sudo -u undeadmc -H npm ci --omit=dev
sudo -u undeadmc -H cp .env.example .env
sudo -u undeadmc -H nano .env          # 2.3 dagi qiymatlar; DATA_DIR=./data qoldirsa bo'ladi
sudo chmod 600 .env

sudo -u undeadmc -H pm2 start deploy/ecosystem.config.cjs    # HOST=127.0.0.1, faqat nginx orqali
sudo -u undeadmc -H pm2 save
sudo env PATH=$PATH pm2 startup systemd -u undeadmc --hp /home/undeadmc

sudo cp deploy/nginx-tier.undeadmc.uz.conf /etc/nginx/sites-available/tier.undeadmc.uz
sudo ln -s /etc/nginx/sites-available/tier.undeadmc.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tier.undeadmc.uz
```

DNS: `A` yozuvi, nomi `tier`, qiymati — VPS IP manzili. Yangilash:
`git pull && npm ci --omit=dev && pm2 restart undeadmc-tiers` (`undeadmc` foydalanuvchisi nomidan).
pm2 o'rniga systemd: `deploy/undeadmc-tiers.service` dagi izohlarga qarang.

---

## 6. Ommaviy API

Javoblar JSON, serverda 15 soniya keshlanadi. Cheklov: bitta IP dan daqiqasiga 120 so'rov.

| So'rov | Javob |
|---|---|
| `GET /api/kits` | Faol kitlar, ballar jadvali, reytingdagi o'yinchilar soni |
| `GET /api/leaderboard?page=1` | Umumiy reyting, 50 tadan |
| `GET /api/kit/sword` | Kit bo'yicha o'yinchilar, Tier 1–5, HT/LT guruhlarida |
| `GET /api/player/NIK` | O'yinchi profili: o'rin, ball, kitlar, oxirgi test |
| `GET /api/search?q=nik` | Nik bo'yicha qidiruv (8 tagacha) |
| `GET /skins/HASH.png` | O'yinchi skini (PNG). Har bir o'yinchida `skin` maydoni: hash yoki `null` |
| `GET /healthz` | `{"ok":true}` — platforma sog'liq tekshiruvi uchun |

---

## 7. Xavfsizlik

- Admin parollari bcrypt bilan saqlanadi; sessiya cookie: `httpOnly`, `secure`, `sameSite=strict`.
- Login: bitta IP dan 15 daqiqada 5 ta xato urinish. Barcha o'zgartiruvchi so'rovlarda CSRF token
  va Origin tekshiruvi.
- Ilova bitta HTTPS proksi ortida ishlashga sozlangan (`trust proxy = 1`): mijozning haqiqiy IP manzili
  `X-Forwarded-For` dan olinadi. Ilovani proksisiz to'g'ridan-to'g'ri internetga ochmang.
- Barcha SQL so'rovlar prepared statement. Foydalanuvchi matni sahifaga faqat `textContent` orqali chiqadi.
- Qat'iy Content-Security-Policy (helmet): faqat o'z sayti, Google Fonts va mc-heads.net rasmlari.
- Admin amallari logga yoziladi (`[admin] POST ... user=... ip=...`).

## 8. Muammolar

- **Kirishda "Xavfsizlik tokeni eskirgan"** — sahifani yangilang. Takrorlansa: `SITE_URL` brauzerdagi
  manzil bilan bir xil ekanini tekshiring (2.5).
- **Admin panelga kira olmayapman, xato yo'q** — sayt HTTPS'da ochilganini tekshiring.
  Kompyuterda sinayotgan bo'lsangiz `.env` da `NODE_ENV=development` bo'lsin.
- **Loglarda "Admin yaratilmadi: ADMIN_PASSWORD_HASH noto'g'ri"** — hashni qayta oling va to'liq
  (`$2b$12$...`, 60 belgi) kiriting.
- **"Juda ko'p urinish"** — 15 daqiqa kuting yoki servisni qayta ishga tushiring.
- **Har deploy dan keyin o'yinchilar yo'qoladi** — `DATA_DIR` doimiy diskka ulanmagan (2.4).
- **Server ishga tushmaydi: "SESSION_SECRET kamida 32 belgi..."** — `SESSION_SECRET` ni o'rnating.
- **`npm ci` da better-sqlite3 xatosi** — Node.js 20+ ekanini tekshiring.
