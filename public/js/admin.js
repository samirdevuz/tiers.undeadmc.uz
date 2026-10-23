/* UNDEAD MC — admin panel. Barcha foydalanuvchi matni textContent orqali chiqariladi. */
(function () {
  "use strict";

  var U = window.UMC;
  if (!U) return;

  /* ---------- yordamchilar ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : String(v));
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function field(form, name) { return form.elements.namedItem(name); }
  function val(form, name) { var f = field(form, name); return f ? f.value : ""; }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : fmtDate(iso) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // player: { nick, skin } — public/js/skin.js
  function headImg(player) { return U.skin.head(player); }

  function iconSpan(cls, name) {
    return el("span", { class: cls }, [U.icon(name)]);
  }

  /* ---------- API ---------- */

  var csrf = "";
  var me = null;
  var meta = { kits: [], icons: [], tiers: [], points: {} };

  function setCsrf(token) {
    csrf = token || "";
    $$('input[name="_csrf"]').forEach(function (i) { i.value = csrf; });
  }

  function api(method, path, body) {
    var opts = { method: method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (method !== "GET") {
      // Skin fayli (Blob) xom PNG bo'lib yuboriladi, qolgani JSON.
      var raw = typeof Blob !== "undefined" && body instanceof Blob;
      opts.headers["Content-Type"] = raw ? "image/png" : "application/json";
      opts.headers["X-CSRF-Token"] = csrf;
      opts.body = raw ? body : JSON.stringify(body || {});
    }
    return fetch("/admin/api" + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || "Xatolik yuz berdi.");
          err.status = res.status;
          if (res.status === 401 && path !== "/login") sessionExpired();
          throw err;
        }
        return data;
      });
    }, function () {
      throw new Error("Server bilan aloqa yo'q. Internetni tekshiring.");
    });
  }

  /* ---------- bildirishnoma va formalar ---------- */

  var toastEl = $("[data-toast]");
  var toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("is-error", Boolean(isError));
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }

  function formError(form, msg) {
    var e = $("[data-error]", form);
    if (!e) { if (msg) toast(msg, true); return; }
    e.textContent = msg || "";
    e.hidden = !msg;
  }

  function onSubmit(form, handler) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      formError(form, "");
      var buttons = $$("button", form);
      buttons.forEach(function (b) { b.disabled = true; });
      Promise.resolve()
        .then(function () { return handler(form); })
        .catch(function (err) { formError(form, err.message); })
        .then(function () { buttons.forEach(function (b) { b.disabled = false; }); });
    });
  }

  function csrfInput() {
    return el("input", { type: "hidden", name: "_csrf", value: csrf });
  }

  /* ---------- kirish / chiqish ---------- */

  var views = { login: $('[data-view="login"]'), app: $('[data-view="app"]') };
  var loginForm = $('[data-form="login"]');

  function showLogin(msg) {
    me = null;
    views.app.hidden = true;
    views.login.hidden = false;
    $("[data-user]").hidden = true;
    loginForm.reset();
    setCsrf(csrf);
    formError(loginForm, msg || "");
    field(loginForm, "username").focus();
  }

  var expiring = false;
  function sessionExpired() {
    if (expiring || !me) return;
    expiring = true;
    api("GET", "/session").then(function (d) {
      setCsrf(d.csrf);
      showLogin("Sessiya tugagan. Qaytadan kiring.");
    }).catch(function () {}).then(function () { expiring = false; });
  }

  onSubmit(loginForm, function (f) {
    return api("POST", "/login", { username: val(f, "username").trim(), password: val(f, "password") })
      .then(function (d) {
        setCsrf(d.csrf);
        f.reset();
        startApp(d.user);
      });
  });

  $("[data-logout]").addEventListener("click", function () {
    api("POST", "/logout").catch(function () {}).then(function () {
      return api("GET", "/session");
    }).then(function (d) {
      setCsrf(d.csrf);
      showLogin("");
    }).catch(function () { location.reload(); });
  });

  /* ---------- bo'limlar ---------- */

  var paneTabs = $$("[data-pane-tab]");
  var panes = {};
  $$("[data-pane]").forEach(function (p) { panes[p.getAttribute("data-pane")] = p; });
  var currentPane = "players";

  function visibleTabs() { return paneTabs.filter(function (t) { return !t.hidden; }); }

  function showPane(name, focusTab) {
    var tab = paneTabs.filter(function (t) { return t.getAttribute("data-pane-tab") === name && !t.hidden; })[0];
    if (!tab) name = "players";
    paneTabs.forEach(function (t) {
      var on = t.getAttribute("data-pane-tab") === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focusTab) t.focus();
    });
    Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== name; });
    currentPane = name;
    if (name === "players") loadPlayers();
    else if (name === "history") loadHistory();
    else if (name === "kits") loadMeta().then(renderKits);
    else if (name === "staff") loadStaff();
    else if (name === "backups") loadBackups();
  }

  $("[data-admin-tabs]").addEventListener("click", function (e) {
    var t = e.target.closest("[data-pane-tab]");
    if (t) showPane(t.getAttribute("data-pane-tab"));
  });
  $("[data-admin-tabs]").addEventListener("keydown", function (e) {
    var keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
    if (!Object.prototype.hasOwnProperty.call(keys, e.key)) return;
    e.preventDefault();
    var tabs = visibleTabs();
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) i = 0;
    var k = keys[e.key];
    var next = k === "first" ? 0 : k === "last" ? tabs.length - 1 : (i + k + tabs.length) % tabs.length;
    showPane(tabs[next].getAttribute("data-pane-tab"), true);
  });

  function loadMeta() {
    return api("GET", "/kits").then(function (d) {
      meta = d;
      fillIconSelect($("[data-icon-select]"), meta.icons[0]);
    });
  }

  function startApp(user) {
    me = user;
    $("[data-user-name]").textContent = user.username;
    $("[data-user-role]").textContent = user.role === "admin" ? "Admin" : "Tester";
    $("[data-user]").hidden = false;
    $$("[data-admin-only]").forEach(function (n) { n.hidden = user.role !== "admin"; });
    views.login.hidden = true;
    views.app.hidden = false;
    closeEditor();
    loadMeta().then(function () { showPane(currentPane); }, function (err) { toast(err.message, true); });
  }

  /* ---------- o'yinchilar ---------- */

  var layout = $("[data-players-layout]");
  var editor = $("[data-editor]");
  var pl = { q: "", page: 1, totalPages: 1, selectedId: null };

  function loadPlayers() {
    var url = "/players?page=" + pl.page + (pl.q ? "&q=" + encodeURIComponent(pl.q) : "");
    return api("GET", url).then(renderPlayerList, function (err) { toast(err.message, true); });
  }

  function renderPlayerList(d) {
    pl.page = d.page;
    pl.totalPages = d.totalPages;
    var list = $("[data-player-list]");
    list.textContent = "";
    $("[data-player-count]").textContent = d.total
      ? d.total + " ta o'yinchi"
      : (pl.q ? "Bunday o'yinchi topilmadi" : "Hali o'yinchi qo'shilmagan");
    d.players.forEach(function (p) {
      var btn = el("button", {
        class: "player-item", type: "button", "data-id": p.id,
        "aria-current": String(p.id === pl.selectedId)
      }, [
        headImg(p),
        el("span", { class: "pi-nick", text: p.nick }),
        el("span", { class: "pi-meta", text: p.total + " ball · " + p.tested + " kit" })
      ]);
      btn.addEventListener("click", function () { openEditor(p.id); });
      list.appendChild(el("li", null, [btn]));
    });
    $("[data-pager]").hidden = d.totalPages <= 1;
    $("[data-page-label]").textContent = d.page + " / " + d.totalPages;
    $('[data-page="prev"]').disabled = d.page <= 1;
    $('[data-page="next"]').disabled = d.page >= d.totalPages;
  }

  $('[data-page="prev"]').addEventListener("click", function () { pl.page--; loadPlayers(); });
  $('[data-page="next"]').addEventListener("click", function () { pl.page++; loadPlayers(); });

  var filterTimer = null;
  $("[data-player-filter]").addEventListener("input", function (e) {
    clearTimeout(filterTimer);
    var v = e.target.value.trim();
    filterTimer = setTimeout(function () {
      pl.q = v;
      pl.page = 1;
      loadPlayers();
    }, 250);
  });

  onSubmit($('[data-form="add-player"]'), function (f) {
    var nick = val(f, "nick").trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      throw new Error("Nik 3–16 belgidan iborat bo'lsin: lotin harflari, raqamlar yoki _.");
    }
    return api("POST", "/players", { nick: nick }).then(function (p) {
      toast(p.nick + " qo'shildi");
      f.reset();
      setCsrf(csrf);
      pl.selectedId = p.id;
      renderEditor(p, true);
      loadPlayers();
    });
  });

  function markSelected() {
    $$(".player-item").forEach(function (b) {
      b.setAttribute("aria-current", String(Number(b.getAttribute("data-id")) === pl.selectedId));
    });
  }

  function openEditor(id) {
    pl.selectedId = id;
    markSelected();
    return api("GET", "/players/" + id).then(function (p) { renderEditor(p, true); }, function (err) { toast(err.message, true); });
  }

  function closeEditor() {
    pl.selectedId = null;
    editor.hidden = true;
    editor.textContent = "";
    $("[data-editor-empty]").hidden = false;
    layout.classList.remove("is-editing");
    markSelected();
  }

  function renderEditor(p, focus) {
    editor.textContent = "";
    editor.hidden = false;
    $("[data-editor-empty]").hidden = true;
    layout.classList.add("is-editing");

    var back = el("button", { class: "btn btn-ghost btn-sm editor-back", type: "button", text: "← Ro'yxatga qaytish" });
    back.addEventListener("click", function () {
      var id = pl.selectedId;
      closeEditor();
      var btn = $('.player-item[data-id="' + id + '"]');
      if (btn) btn.focus();
    });
    editor.appendChild(back);

    editor.appendChild(el("div", { class: "editor-head" }, [
      headImg(p),
      el("div", null, [
        el("h2", { class: "editor-title", id: "editor-title", text: p.nick }),
        el("p", { class: "editor-sub" }, [
          (p.rank ? "#" + p.rank + " o'rin · " : "Reytingda yo'q · ") + p.total + " ball",
          el("a", { href: "/player/" + encodeURIComponent(p.nick), target: "_blank", rel: "noopener", text: "Profilni ko'rish" })
        ])
      ])
    ]));

    // Tierlar
    var tierForm = el("form", { class: "form", novalidate: true }, [csrfInput(), el("h3", { class: "admin-h2", text: "Tierlar" })]);
    var grid = el("div", { class: "tier-grid" });
    meta.kits.forEach(function (kit) {
      var cur = Object.prototype.hasOwnProperty.call(p.tiers, kit.id) ? p.tiers[kit.id] : null;
      var initial = cur ? cur.tier : "";
      var sel = el("select", { id: "tier-" + kit.id, "data-kit": kit.id, "data-initial": initial });
      sel.appendChild(el("option", { value: "", text: "— yo'q" }));
      meta.tiers.forEach(function (t) {
        sel.appendChild(el("option", { value: t, text: t + " (" + meta.points[t] + ")" }));
      });
      sel.value = initial;
      var info = cur ? cur.tier + " · " + fmtDate(cur.updatedAt) : "Tekshirilmagan";
      if (!kit.active) info += " · faol emas";
      var row = el("div", { class: "tier-row" }, [
        iconSpan("ti-icon", kit.icon),
        el("label", { for: "tier-" + kit.id }, [kit.name + " ", el("small", { text: info })]),
        sel
      ]);
      sel.addEventListener("change", function () { row.classList.toggle("is-changed", sel.value !== initial); });
      grid.appendChild(row);
    });
    tierForm.appendChild(grid);
    tierForm.appendChild(el("p", { class: "form-error", role: "alert", "data-error": true, hidden: true }));
    var resetBtn = el("button", { class: "btn btn-ghost", type: "button", text: "Bekor qilish" });
    resetBtn.addEventListener("click", function () {
      $$("select[data-kit]", tierForm).forEach(function (s) { s.value = s.getAttribute("data-initial"); });
      $$(".tier-row", tierForm).forEach(function (r) { r.classList.remove("is-changed"); });
      formError(tierForm, "");
    });
    tierForm.appendChild(el("div", { class: "editor-actions" }, [
      el("button", { class: "btn btn-primary", type: "submit", text: "Tierlarni saqlash" }),
      resetBtn
    ]));
    onSubmit(tierForm, function (f) {
      var changes = $$("select[data-kit]", f)
        .filter(function (s) { return s.value !== s.getAttribute("data-initial"); })
        .map(function (s) { return { kitId: Number(s.getAttribute("data-kit")), tier: s.value || null }; });
      if (!changes.length) throw new Error("Hech narsa o'zgartirilmadi.");
      return api("PUT", "/players/" + p.id + "/tiers", { changes: changes }).then(function (res) {
        toast(res.changed + " ta o'zgarish saqlandi");
        renderEditor(res.player, false);
        loadPlayers();
      });
    });
    editor.appendChild(tierForm);

    editor.appendChild(skinSection(p));

    // Nikni o'zgartirish
    var renameForm = el("form", { class: "form-inline", novalidate: true }, [
      csrfInput(),
      el("label", { class: "field field-grow" }, [
        el("span", { text: "Nikni o'zgartirish" }),
        el("input", { name: "nick", type: "text", value: p.nick, maxlength: 16, autocomplete: "off", autocapitalize: "off", spellcheck: "false", required: true })
      ]),
      el("button", { class: "btn btn-ghost", type: "submit", text: "Saqlash" }),
      el("p", { class: "form-error", role: "alert", "data-error": true, hidden: true })
    ]);
    onSubmit(renameForm, function (f) {
      var nick = val(f, "nick").trim();
      if (nick === p.nick) throw new Error("Nik o'zgarmagan.");
      return api("PATCH", "/players/" + p.id, { nick: nick }).then(function (np) {
        toast("Nik o'zgartirildi: " + np.nick);
        renderEditor(np, false);
        loadPlayers();
      });
    });
    editor.appendChild(renameForm);

    // O'chirish (faqat admin)
    if (me && me.role === "admin") {
      var del = el("button", { class: "btn btn-danger", type: "button", text: "O'yinchini o'chirish" });
      del.addEventListener("click", function () {
        if (!window.confirm(p.nick + " va uning barcha tierlari o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.")) return;
        del.disabled = true;
        api("DELETE", "/players/" + p.id).then(function () {
          toast(p.nick + " o'chirildi");
          closeEditor();
          loadPlayers();
        }, function (err) {
          del.disabled = false;
          toast(err.message, true);
        });
      });
      editor.appendChild(el("div", { class: "editor-actions" }, [el("span", { class: "spacer" }), del]));
    }

    // Tarix
    editor.appendChild(el("h3", { class: "admin-h2", text: "O'zgarishlar tarixi" }));
    if (!p.history.length) {
      editor.appendChild(el("p", { class: "muted small", text: "Hali o'zgarish yo'q." }));
    } else {
      editor.appendChild(el("ul", { class: "history-list" }, p.history.map(function (h) {
        return el("li", null, [
          el("time", { datetime: h.at, text: fmtDateTime(h.at) }),
          h.kit + ": " + (h.oldTier || "—") + " → " + (h.newTier || "olib tashlandi") + " (" + h.staff + ")"
        ]);
      })));
    }

    if (focus) editor.focus();
  }

  /* ---------- skin ---------- */

  var SKIN_MAX_BYTES = 64 * 1024;
  var SKIN_SIZE_ERROR = "Skin o'lchami 64x64 yoki 64x32 bo'lishi kerak";

  function afterSkinChange(np, msg) {
    toast(msg);
    renderEditor(np, false);
    loadPlayers();
  }

  function skinSection(p) {
    var preview = el("div", { class: "skin-preview" }, [U.skin.body(p, "skin-preview-body", 6, p.nick + " skini")]);
    var status = el("p", {
      class: "muted small",
      text: p.skin
        ? "Saytga yuklangan skin ishlatilmoqda."
        : "Skin o'rnatilmagan — mc-heads.net dan nik bo'yicha olinadi (litsenziya bo'lmasa Steve)."
    });

    // 1) PNG fayl yuklash
    var fileInput = el("input", { name: "file", type: "file", accept: "image/png", required: true });
    var uploadBtn = el("button", { class: "btn btn-primary", type: "submit", text: "Yuklash", disabled: true });
    var fileForm = el("form", { class: "form-inline", novalidate: true }, [
      el("label", { class: "field field-grow" }, [el("span", { text: "Skin fayli (PNG, 64x64 yoki 64x32)" }), fileInput]),
      uploadBtn,
      el("p", { class: "form-error", role: "alert", "data-error": true, hidden: true })
    ]);
    var picked = null;
    fileInput.addEventListener("change", function () {
      picked = null;
      uploadBtn.disabled = true;
      formError(fileForm, "");
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.type && file.type !== "image/png") return formError(fileForm, "Faqat PNG fayl yuklash mumkin.");
      if (file.size > SKIN_MAX_BYTES) return formError(fileForm, "Fayl juda katta (64 KB dan oshmasin).");
      createImageBitmap(file).then(function (bmp) {
        if (bmp.width !== 64 || (bmp.height !== 64 && bmp.height !== 32)) {
          formError(fileForm, SKIN_SIZE_ERROR + " (tanlangan: " + bmp.width + "x" + bmp.height + ").");
          return;
        }
        preview.textContent = "";
        preview.appendChild(U.skin.preview(bmp, "skin-preview-body", 6));
        preview.appendChild(el("span", { class: "skin-preview-note", text: "Saqlanmagan" }));
        picked = file;
        uploadBtn.disabled = false;
      }, function () {
        formError(fileForm, "Rasmni o'qib bo'lmadi. PNG skin faylini tanlang.");
      });
    });
    onSubmit(fileForm, function () {
      if (!picked) throw new Error("Avval skin faylini tanlang.");
      return api("PUT", "/players/" + p.id + "/skin", picked).then(function (np) {
        afterSkinChange(np, "Skin saqlandi");
      });
    });

    // 2) Litsenziya (Mojang) akkauntidan olish
    var importForm = el("form", { class: "form-inline", novalidate: true }, [
      csrfInput(),
      el("label", { class: "field field-grow" }, [
        el("span", { text: "Yoki litsenziya (Mojang) nikidan olish" }),
        el("input", { name: "nick", type: "text", value: p.nick, maxlength: 16, autocomplete: "off", autocapitalize: "off", spellcheck: "false", required: true })
      ]),
      el("button", { class: "btn btn-ghost", type: "submit", text: "Skinni olish" }),
      el("p", { class: "form-error", role: "alert", "data-error": true, hidden: true })
    ]);
    onSubmit(importForm, function (f) {
      var nick = val(f, "nick").trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) throw new Error("Nik 3–16 belgidan iborat bo'lsin: lotin harflari, raqamlar yoki _.");
      return api("POST", "/players/" + p.id + "/skin/import", { nick: nick }).then(function (np) {
        afterSkinChange(np, nick + " skini o'rnatildi");
      });
    });

    var controls = [status, fileForm, importForm];
    if (p.skin) {
      var remove = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Skinni olib tashlash" });
      remove.addEventListener("click", function () {
        if (!window.confirm(p.nick + " skini olib tashlansinmi?")) return;
        remove.disabled = true;
        api("DELETE", "/players/" + p.id + "/skin").then(function (np) {
          afterSkinChange(np, "Skin olib tashlandi");
        }, function (err) {
          remove.disabled = false;
          toast(err.message, true);
        });
      });
      controls.push(el("div", { class: "editor-actions" }, [remove]));
    }

    return el("section", { class: "skin-editor", "aria-labelledby": "skin-title" }, [
      el("h3", { class: "admin-h2", id: "skin-title", text: "Skin" }),
      el("div", { class: "skin-box" }, [preview, el("div", { class: "skin-controls" }, controls)])
    ]);
  }

  /* ---------- tarix ---------- */

  function loadHistory() {
    var body = $("[data-history]");
    api("GET", "/history").then(function (d) {
      body.textContent = "";
      if (!d.history.length) {
        body.appendChild(el("tr", null, [el("td", { colspan: 5, class: "muted", text: "Hali o'zgarish yo'q." })]));
        return;
      }
      d.history.forEach(function (h) {
        body.appendChild(el("tr", null, [
          el("td", null, [el("time", { datetime: h.at, text: fmtDateTime(h.at) })]),
          el("td", null, [el("a", { href: "/player/" + encodeURIComponent(h.nick), target: "_blank", rel: "noopener", text: h.nick })]),
          el("td", { text: h.kit }),
          el("td", { class: "change", text: (h.oldTier || "—") + " → " + (h.newTier || "olib tashlandi") }),
          el("td", { text: h.staff })
        ]));
      });
    }, function (err) { toast(err.message, true); });
  }

  /* ---------- kitlar (admin) ---------- */

  function fillIconSelect(select, value) {
    if (!select) return;
    select.textContent = "";
    meta.icons.forEach(function (key) { select.appendChild(el("option", { value: key, text: key })); });
    select.value = value;
  }

  function renderKits(focusSel) {
    var list = $("[data-kit-list]");
    list.textContent = "";
    meta.kits.forEach(function (k, i) {
      var preview = iconSpan("ki-icon", k.icon);
      var up = el("button", { class: "btn btn-ghost", type: "button", "aria-label": k.name + " — yuqoriga", "data-move": "up-" + k.id, text: "↑" });
      var down = el("button", { class: "btn btn-ghost", type: "button", "aria-label": k.name + " — pastga", "data-move": "down-" + k.id, text: "↓" });
      up.disabled = i === 0;
      down.disabled = i === meta.kits.length - 1;
      up.addEventListener("click", function () { moveKit(i, -1, "up-" + k.id); });
      down.addEventListener("click", function () { moveKit(i, 1, "down-" + k.id); });

      var iconSel = el("select", { name: "icon" });
      fillIconSelect(iconSel, k.icon);
      iconSel.addEventListener("change", function () {
        preview.textContent = "";
        preview.appendChild(U.icon(iconSel.value));
      });
      var active = el("input", { type: "checkbox", name: "active" });
      active.checked = Boolean(k.active);

      var form = el("form", { class: "kit-fields", novalidate: true }, [
        csrfInput(),
        el("label", { class: "field" }, [el("span", { text: "Nomi" }), el("input", { name: "name", type: "text", value: k.name, maxlength: 24, required: true })]),
        el("label", { class: "field" }, [el("span", { text: "Slug" }), el("input", { name: "slug", type: "text", value: k.slug, maxlength: 24, required: true })]),
        el("label", { class: "field" }, [el("span", { text: "Ikonka" }), iconSel]),
        el("label", { class: "check" }, [active, "Faol"]),
        el("button", { class: "btn btn-primary", type: "submit", text: "Saqlash" }),
        el("p", { class: "form-error", role: "alert", "data-error": true, hidden: true })
      ]);
      onSubmit(form, function (f) {
        return api("PATCH", "/kits/" + k.id, {
          name: val(f, "name").trim(),
          slug: val(f, "slug").trim(),
          icon: iconSel.value,
          active: active.checked
        }).then(function () {
          toast("Kit saqlandi");
          return loadMeta().then(function () { renderKits(); });
        });
      });

      list.appendChild(el("li", { class: "kit-item" + (k.active ? "" : " is-off") }, [
        el("div", { class: "kit-top" }, [
          preview,
          el("strong", { text: k.name }),
          k.active ? null : el("span", { class: "tag off", text: "FAOL EMAS" }),
          el("span", { class: "small muted", text: k.players + " o'yinchi" }),
          el("span", { class: "order-btns" }, [up, down])
        ]),
        form
      ]));
    });
    if (focusSel) {
      var target = $('[data-move="' + focusSel + '"]', list);
      if (target && !target.disabled) target.focus();
      else if (target) {
        var other = $('[data-move="' + (focusSel.indexOf("up-") === 0 ? "down-" : "up-") + focusSel.split("-")[1] + '"]', list);
        if (other) other.focus();
      }
    }
  }

  function moveKit(index, dir, focusSel) {
    var ids = meta.kits.map(function (k) { return k.id; });
    var j = index + dir;
    if (j < 0 || j >= ids.length) return;
    var tmp = ids[index];
    ids[index] = ids[j];
    ids[j] = tmp;
    api("PUT", "/kits/order", { ids: ids }).then(function (d) {
      meta.kits = d.kits;
      renderKits(focusSel);
    }, function (err) { toast(err.message, true); });
  }

  var addKitForm = $('[data-form="add-kit"]');
  var slugTouched = false;
  field(addKitForm, "slug").addEventListener("input", function () { slugTouched = true; });
  field(addKitForm, "name").addEventListener("input", function (e) {
    if (slugTouched) return;
    field(addKitForm, "slug").value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  });
  onSubmit(addKitForm, function (f) {
    return api("POST", "/kits", {
      name: val(f, "name").trim(),
      slug: val(f, "slug").trim(),
      icon: val(f, "icon"),
      active: true
    }).then(function (k) {
      toast(k.name + " kiti qo'shildi");
      f.reset();
      slugTouched = false;
      setCsrf(csrf);
      return loadMeta().then(function () { renderKits(); });
    });
  });

  /* ---------- xodimlar (admin) ---------- */

  function loadStaff() {
    api("GET", "/staff").then(function (d) { renderStaff(d.staff); }, function (err) { toast(err.message, true); });
  }

  function renderStaff(staff) {
    var list = $("[data-staff-list]");
    list.textContent = "";
    staff.forEach(function (s) {
      var isMe = me && s.id === me.id;
      var role = el("select", { name: "role" }, [
        el("option", { value: "tester", text: "Tester" }),
        el("option", { value: "admin", text: "Admin" })
      ]);
      role.value = s.role;
      var roleBtn = el("button", { class: "btn btn-ghost", type: "button", text: "Rolni saqlash" });
      var pw = el("input", { name: "password", type: "password", autocomplete: "new-password", minlength: 8, maxlength: 128, placeholder: "Yangi parol" });
      var pwBtn = el("button", { class: "btn btn-ghost", type: "button", text: "Parolni o'rnatish" });
      var delBtn = el("button", { class: "btn btn-danger", type: "button", text: "O'chirish" });
      delBtn.disabled = Boolean(isMe);

      function run(btn, promise, okMsg) {
        btn.disabled = true;
        promise.then(function (d) {
          toast(okMsg);
          renderStaff(d.staff);
        }, function (err) {
          btn.disabled = false;
          toast(err.message, true);
        });
      }

      roleBtn.addEventListener("click", function () {
        run(roleBtn, api("PATCH", "/staff/" + s.id, { role: role.value }), s.username + ": rol saqlandi");
      });
      pwBtn.addEventListener("click", function () {
        if (pw.value.length < 8) { toast("Parol kamida 8 belgidan iborat bo'lsin.", true); pw.focus(); return; }
        run(pwBtn, api("PATCH", "/staff/" + s.id, { password: pw.value }), s.username + ": parol almashtirildi");
      });
      delBtn.addEventListener("click", function () {
        if (!window.confirm(s.username + " o'chirilsinmi?")) return;
        run(delBtn, api("DELETE", "/staff/" + s.id), s.username + " o'chirildi");
      });

      list.appendChild(el("li", { class: "staff-item" }, [
        el("div", { class: "staff-top" }, [
          el("strong", { text: s.username }),
          el("span", { class: "tag" + (s.role === "admin" ? " admin" : ""), text: s.role === "admin" ? "ADMIN" : "TESTER" }),
          isMe ? el("span", { class: "small muted", text: "(siz)" }) : null,
          el("span", { class: "small muted", text: "Qo'shilgan: " + fmtDate(s.createdAt) })
        ]),
        el("form", { class: "staff-fields", novalidate: true }, [
          csrfInput(),
          el("label", { class: "field" }, [el("span", { text: "Rol" }), role]),
          roleBtn,
          el("label", { class: "field" }, [el("span", { text: "Yangi parol" }), pw]),
          pwBtn,
          delBtn
        ])
      ]));
    });
  }

  onSubmit($('[data-form="add-staff"]'), function (f) {
    return api("POST", "/staff", {
      username: val(f, "username").trim(),
      password: val(f, "password"),
      role: val(f, "role")
    }).then(function (d) {
      toast("Xodim qo'shildi");
      f.reset();
      setCsrf(csrf);
      renderStaff(d.staff);
    });
  });

  /* ---------- zaxira nusxalar (admin) ---------- */

  function fmtSize(bytes) {
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function renderBackups(d) {
    $("[data-backup-info]").textContent =
      (d.intervalHours ? "Avtomatik nusxa: har " + d.intervalHours + " soatda" : "Avtomatik nusxa o'chirilgan") +
      (d.keepDays ? ", " + d.keepDays + " kun saqlanadi" : "") + ". Joylashuv: " + d.dir;
    var body = $("[data-backups]");
    body.textContent = "";
    if (!d.backups.length) {
      body.appendChild(el("tr", null, [el("td", { colspan: 4, class: "muted", text: "Hali nusxa yo'q." })]));
      return;
    }
    d.backups.forEach(function (b) {
      body.appendChild(el("tr", null, [
        el("td", { text: b.name }),
        el("td", null, [el("time", { datetime: b.createdAt, text: fmtDateTime(b.createdAt) })]),
        el("td", { text: fmtSize(b.size) }),
        el("td", null, [el("a", { href: "/admin/api/backups/" + encodeURIComponent(b.name), download: b.name, text: "Yuklab olish" })])
      ]));
    });
  }

  function loadBackups() {
    api("GET", "/backups").then(renderBackups, function (err) { toast(err.message, true); });
  }

  onSubmit($('[data-form="backup-now"]'), function () {
    return api("POST", "/backups").then(function (d) {
      toast("Zaxira nusxa olindi");
      renderBackups(d);
    });
  });

  /* ---------- o'z parolini almashtirish ---------- */

  onSubmit($('[data-form="password"]'), function (f) {
    if (val(f, "next") !== val(f, "repeat")) throw new Error("Yangi parollar bir xil emas.");
    return api("POST", "/me/password", { current: val(f, "current"), next: val(f, "next") }).then(function () {
      toast("Parol almashtirildi. Boshqa qurilmalardagi sessiyalar yopildi.");
      f.reset();
      setCsrf(csrf);
    });
  });

  /* ---------- ishga tushirish ---------- */

  U.fillIcons();
  api("GET", "/session").then(function (d) {
    setCsrf(d.csrf);
    $("[data-boot]").hidden = true;
    if (d.user) startApp(d.user);
    else showLogin("");
  }, function (err) {
    $("[data-boot]").textContent = err.message;
  });
})();
