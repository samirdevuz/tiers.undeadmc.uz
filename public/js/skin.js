/* UNDEAD MC — o'yinchi skinlari. Saytga yuklangan skin (/skins/<hash>.png) canvas'da chiziladi:
   bosh — tekis yuz, tana — 3D (izometrik) to'liq personaj. Skin bo'lmasa mc-heads.net rasmi ishlatiladi. */
(function () {
  "use strict";

  var U = window.UMC;
  if (!U) return;

  var STEVE = "/assets/steve.svg";
  var HASH_RE = /^[0-9a-f]{32}$/;

  // Ekrandagi o'qlar (bitta skin pikseli uchun): X — o'yinchining eni, Z — chuqurlik (orqaga), Y — pastga.
  var AX = [0.9, 0.2];
  var AZ = [0.45, -0.3];
  var SHADE = { front: 0.92, side: 0.7, top: 1 };

  /* ---------- skin qismlari ---------- */

  // box: [x, y, z, eni, bo'yi, chuqurligi] skin piksellarida; uv: teksturadagi joyi.
  function parts(slim, legacy) {
    var aw = slim ? 3 : 4;
    var list = [
      { box: [4 - aw, 8, 0, aw, 12, 4], uv: [40, 16], over: [40, 32] },                   // o'ng qo'l
      { box: [4, 20, 0, 4, 12, 4], uv: [0, 16], over: [0, 32] },                          // o'ng oyoq
      legacy
        ? { box: [8, 20, 0, 4, 12, 4], uv: [0, 16], mirror: true }
        : { box: [8, 20, 0, 4, 12, 4], uv: [16, 48], over: [0, 48] },                     // chap oyoq
      { box: [4, 8, 0, 8, 12, 4], uv: [16, 16], over: [16, 32] },                         // tana
      legacy
        ? { box: [12, 8, 0, aw, 12, 4], uv: [40, 16], mirror: true }
        : { box: [12, 8, 0, aw, 12, 4], uv: [32, 48], over: [48, 48] },                   // chap qo'l
      { box: [4, 0, -2, 8, 8, 8], uv: [0, 0], over: [32, 0], inflate: 0.5, always: true } // bosh
    ];
    return list;
  }

  function inflated(box, e) {
    return [box[0] - e, box[1] - e, box[2] - e, box[3] + 2 * e, box[4] + 2 * e, box[5] + 2 * e];
  }

  function project(x, y, z) {
    return [x * AX[0] + z * AZ[0], x * AX[1] + y + z * AZ[1]];
  }

  // Barcha skinlar uchun bir xil o'lcham (eng katta — klassik qo'llar va kiyim qatlami bilan).
  var BOUNDS = (function () {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    parts(false, false).forEach(function (p) {
      var b = inflated(p.box, p.inflate || 0.25);
      [0, 1].forEach(function (i) {
        [0, 1].forEach(function (j) {
          [0, 1].forEach(function (k) {
            var pt = project(b[0] + i * b[3], b[1] + j * b[4], b[2] + k * b[5]);
            minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
          });
        });
      });
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  })();

  /* ---------- tekstura ---------- */

  function isSlim(px) {
    // Ingichka (Alex) qo'lda o'ng qo'lning orqa tomoni 3 piksel: 54–55 ustunlar bo'sh qoladi.
    for (var y = 20; y < 32; y++) {
      for (var x = 54; x < 56; x++) if (px[(y * 64 + x) * 4 + 3] !== 0) return false;
    }
    return true;
  }

  // Eski (64x32) skinlarda shlyapa qatlami butunlay to'ldirilgan bo'lsa, Minecraft uni ko'rsatmaydi.
  function clearOpaqueHat(px) {
    for (var y = 0; y < 16; y++) {
      for (var x = 32; x < 64; x++) if (px[(y * 64 + x) * 4 + 3] < 128) return;
    }
    for (var y2 = 0; y2 < 16; y2++) {
      for (var x2 = 32; x2 < 64; x2++) px[(y2 * 64 + x2) * 4 + 3] = 0;
    }
  }

  // img — <img> yoki ImageBitmap (admin panelda tanlangan fayl).
  function analyse(img) {
    var legacy = (img.naturalHeight || img.height) === 32;
    var tex = document.createElement("canvas");
    tex.width = 64;
    tex.height = 64;
    var ctx = tex.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, 64, 64);
    if (legacy) {
      clearOpaqueHat(data.data);
      ctx.putImageData(data, 0, 0);
    }
    return { tex: tex, px: data.data, legacy: legacy, slim: !legacy && isSlim(data.data) };
  }

  var loaded = {};
  function loadSkin(hash) {
    if (!loaded[hash]) {
      loaded[hash] = new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          try { resolve(analyse(img)); } catch (err) { reject(err); }
        };
        img.onerror = reject;
        img.src = skinUrl(hash);
      });
    }
    return loaded[hash];
  }

  /* ---------- chizish ---------- */

  // Teksturaning bitta to'rtburchagini ekrandagi parallelogrammga piksel-piksel chizadi.
  function face(ctx, px, region, flip, origin, u, v, shade) {
    var sx = region[0], sy = region[1], sw = region[2], sh = region[3];
    ctx.setTransform(u[0], u[1], v[0], v[1], origin[0], origin[1]);
    for (var ty = 0; ty < sh; ty++) {
      for (var tx = 0; tx < sw; tx++) {
        var i = ((sy + ty) * 64 + sx + (flip ? sw - 1 - tx : tx)) * 4;
        var a = px[i + 3];
        if (!a) continue;
        ctx.fillStyle = "rgba(" + Math.round(px[i] * shade) + "," + Math.round(px[i + 1] * shade) + "," +
          Math.round(px[i + 2] * shade) + "," + (a / 255) + ")";
        // To'liq piksellar biroz kattaroq chiziladi — qo'shni piksellar orasida chiziq qolmasligi uchun.
        var e = a === 255 ? 0.08 : 0;
        ctx.fillRect(tx, ty, 1 + e, 1 + e);
      }
    }
  }

  function cuboid(ctx, px, box, uv, mirror, inflate, scale, pad) {
    var w = box[3], h = box[4], d = box[5];
    var b = inflated(box, inflate);
    function at(x, y, z) {
      var p = project(x, y, z);
      return [(p[0] - BOUNDS.x) * scale + pad, (p[1] - BOUNDS.y) * scale + pad];
    }
    function vec(axis, len, texels) {
      var k = (len / texels) * scale;
      return axis === "x" ? [AX[0] * k, AX[1] * k] : axis === "z" ? [AZ[0] * k, AZ[1] * k] : [0, k];
    }
    var u = uv[0], v = uv[1];
    var down = vec("y", b[4], h);

    face(ctx, px, [u + d, v + d, w, h], mirror, at(b[0], b[1], b[2]), vec("x", b[3], w), down, SHADE.front);
    face(ctx, px, mirror ? [u, v + d, d, h] : [u + d + w, v + d, d, h], mirror,
      at(b[0] + b[3], b[1], b[2]), vec("z", b[5], d), down, SHADE.side);
    var back = vec("z", b[5], d);
    face(ctx, px, [u + d, v, w, d], mirror, at(b[0], b[1], b[2] + b[5]), vec("x", b[3], w),
      [-back[0], -back[1]], SHADE.top);
  }

  function bodyCanvas(scale) {
    var pad = Math.ceil(scale / 2);
    var c = document.createElement("canvas");
    c.width = Math.ceil(BOUNDS.w * scale) + pad * 2;
    c.height = Math.ceil(BOUNDS.h * scale) + pad * 2;
    return c;
  }

  function drawBody(c, skin, scale) {
    var pad = Math.ceil(scale / 2);
    var ctx = c.getContext("2d");
    parts(skin.slim, skin.legacy).forEach(function (p) {
      cuboid(ctx, skin.px, p.box, p.uv, Boolean(p.mirror), 0, scale, pad);
      if (p.over && (!skin.legacy || p.always)) {
        cuboid(ctx, skin.px, p.box, p.over, false, p.inflate || 0.25, scale, pad);
      }
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  // Bir xil skin bir necha joyda bo'lsa, bir marta chiziladi va nusxalanadi.
  var bodies = {};
  function renderBody(skin, hash, scale) {
    var key = hash + "@" + scale;
    if (!bodies[key]) bodies[key] = drawBody(bodyCanvas(scale), skin, scale);
    return bodies[key];
  }

  /* ---------- ommaviy funksiyalar ---------- */

  function skinUrl(hash) { return "/skins/" + hash + ".png"; }

  function validHash(hash) { return typeof hash === "string" && HASH_RE.test(hash); }

  function fallbackImg(src, cls, w, h, alt, lazy) {
    var img = document.createElement("img");
    img.className = "pixel-img" + (cls ? " " + cls : "");
    img.src = src;
    img.width = w;
    img.height = h;
    img.alt = alt || "";
    if (lazy) img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function onErr() {
      img.removeEventListener("error", onErr);
      img.src = STEVE;
    });
    return img;
  }

  function mcHead(nick, cls) {
    return fallbackImg("https://mc-heads.net/avatar/" + encodeURIComponent(nick) + "/64", cls, 64, 64, "", true);
  }

  function mcBody(nick, cls, alt) {
    return fallbackImg("https://mc-heads.net/body/" + encodeURIComponent(nick) + "/240", cls, 120, 240, alt, true);
  }

  function labelled(canvas, alt) {
    if (alt) {
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", alt);
    } else {
      canvas.setAttribute("aria-hidden", "true");
    }
  }

  // Bosh (yuz + shlyapa qatlami). player: { nick, skin }.
  function head(player, cls) {
    if (!validHash(player.skin)) return mcHead(player.nick, cls);
    var c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    c.className = "pixel-img skin-canvas" + (cls ? " " + cls : "");
    labelled(c, "");
    loadSkin(player.skin).then(function (skin) {
      var ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skin.tex, 8, 8, 8, 8, 0, 0, 8, 8);
      ctx.drawImage(skin.tex, 40, 8, 8, 8, 0, 0, 8, 8);
    }, function () {
      if (c.parentNode) c.replaceWith(mcHead(player.nick, cls));
    });
    return c;
  }

  // To'liq personaj (3D). scale — bitta skin pikseli necha ekran pikseli bo'lib chiziladi.
  function body(player, cls, scale, alt) {
    scale = scale || 8;
    if (!validHash(player.skin)) return mcBody(player.nick, cls, alt);
    var c = bodyCanvas(scale);
    c.className = "skin-canvas" + (cls ? " " + cls : "");
    labelled(c, alt);
    loadSkin(player.skin).then(function (skin) {
      c.getContext("2d").drawImage(renderBody(skin, player.skin, scale), 0, 0);
    }, function () {
      if (c.parentNode) c.replaceWith(mcBody(player.nick, cls, alt));
    });
    return c;
  }

  // Admin panelda tanlangan faylni yuklashdan oldin ko'rsatish (ImageBitmap — CSP blob:/data: talab qilmaydi).
  function preview(bitmap, cls, scale) {
    scale = scale || 8;
    var c = drawBody(bodyCanvas(scale), analyse(bitmap), scale);
    c.className = "skin-canvas" + (cls ? " " + cls : "");
    labelled(c, "Yangi skin");
    return c;
  }

  U.skin = { head: head, body: body, url: skinUrl, preview: preview };
})();
