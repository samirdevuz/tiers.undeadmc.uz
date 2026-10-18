/* UNDEAD MC — tier reyting sahifasi. Foydalanuvchi matni faqat textContent orqali chiqariladi. */
(function () {
  "use strict";

  var U = window.UMC;
  if (!U) return;

  var BASE_TITLE = "UNDEAD MC Tierlar — PvP reyting";
  var PLAYER_PATH = /^\/player\/([A-Za-z0-9_]{1,16})\/?$/;
  var NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
  var SEARCH_RE = /^[A-Za-z0-9_]{1,16}$/;
  var STEVE = "/assets/steve.svg";
  var mqColumns = window.matchMedia("(min-width: 900px)");
  var mqNav = window.matchMedia("(min-width: 960px)");
  var DISCORD = document.body.getAttribute("data-discord") || "#";

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

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function api(path) {
    return fetch(path, { headers: { Accept: "application/json" }, credentials: "same-origin" }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.error || "Xatolik");
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  }

  function playerUrl(nick) { return "/player/" + encodeURIComponent(nick); }

  function onImgError(e) {
    var img = e.currentTarget;
    img.removeEventListener("error", onImgError);
    img.src = STEVE;
  }

  function headImg(nick, cls) {
    var img = el("img", {
      class: "pixel-img" + (cls ? " " + cls : ""),
      src: "https://mc-heads.net/avatar/" + encodeURIComponent(nick) + "/64",
      width: 64, height: 64, alt: "",
      loading: "lazy", decoding: "async", referrerpolicy: "no-referrer"
    });
    img.addEventListener("error", onImgError);
    return img;
  }

  function tierBadge(tier, kit, large) {
    var cls = "tb" + (large ? " tb-lg" : "");
    if (tier) cls += " t" + tier.charAt(2) + (tier.charAt(0) === "H" ? " ht" : " lt");
    else cls += " none";
    var spoken = (kit ? kit.name + ": " : "") + (tier || "tekshirilmagan");
    return el("span", { class: cls, title: kit ? spoken : null }, [
      kit ? el("span", { class: "tb-ico" }, [U.icon(kit.icon)]) : null,
      el("span", { "aria-hidden": "true", text: tier || "—" }),
      el("span", { class: "sr-only", text: spoken })
    ]);
  }

  function stateBox(title, sub, action) {
    return el("div", { class: "state", role: "status" }, [
      el("p", { class: "state-title", text: title }),
      sub ? el("p", { text: sub }) : null,
      action || null
    ]);
  }

  function errorBox(err, retry) {
    var sub = err && err.status === 429 ? err.message : "Internet aloqasini tekshirib, qayta urinib ko'ring.";
    var btn = el("button", { class: "btn btn-ghost", type: "button", text: "Qayta urinish" });
    btn.addEventListener("click", retry);
    var box = stateBox("Ma'lumotni yuklab bo'lmadi", sub, btn);
    box.classList.add("state-error");
    return box;
  }

  /* ---------- holat ---------- */

  var state = {
    kits: [],
    tab: "umumiy",
    token: 0,
    kitData: null,
    lb: null
  };

  var panel = $("[data-panel]");
  var tabsEl = $("[data-tabs]");
  var board = $("#reyting");

  function kitBySlug(slug) {
    for (var i = 0; i < state.kits.length; i++) if (state.kits[i].slug === slug) return state.kits[i];
    return null;
  }

  /* ---------- navbar ---------- */

  var nav = $("[data-nav]");
  var menu = $("#nav-menu");
  var burger = $("[data-burger]");
  var searchWrap = $("[data-search]");
  var searchToggle = $("[data-search-toggle]");

  function setMenuOpen(open, focusBack) {
    menu.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    if (open) setSearchOpen(false);
    else if (focusBack) burger.focus();
  }

  function setSearchOpen(open, focusBack) {
    searchWrap.classList.toggle("is-open", open);
    searchToggle.setAttribute("aria-expanded", String(open));
    if (open) {
      setMenuOpen(false);
      $("#search-input").focus();
    } else {
      search.hideList();
      if (focusBack) searchToggle.focus();
    }
  }

  function initNav() {
    burger.addEventListener("click", function () {
      setMenuOpen(!menu.classList.contains("is-open"));
    });
    searchToggle.addEventListener("click", function () {
      setSearchOpen(!searchWrap.classList.contains("is-open"));
    });
    $$("a", menu).forEach(function (a) {
      a.addEventListener("click", function () { setMenuOpen(false); });
    });
    menu.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-open")) setMenuOpen(false, true);
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) {
        setMenuOpen(false);
        if (!mqNav.matches) setSearchOpen(false);
      }
    });
    mqNav.addEventListener("change", function () {
      setMenuOpen(false);
      setSearchOpen(false);
    });
  }

  /* ---------- qidiruv (combobox) ---------- */

  var search = (function () {
    var form = $("[data-search-form]");
    var input = $("#search-input");
    var list = $("#search-results");
    var live = el("p", { class: "sr-only", "aria-live": "polite" });
    form.appendChild(live);

    var timer = null;
    var reqId = 0;
    var results = [];
    var resultsFor = null;
    var active = -1;
    var pendingEnter = false;

    function setExpanded(open) {
      list.hidden = !open;
      input.setAttribute("aria-expanded", String(open));
      if (!open) setActive(-1);
    }

    function setActive(i) {
      active = i;
      $$(".search-option", list).forEach(function (li, idx) {
        li.setAttribute("aria-selected", String(idx === i));
        if (idx === i) li.scrollIntoView({ block: "nearest" });
      });
      if (i >= 0) input.setAttribute("aria-activedescendant", "so-" + i);
      else input.removeAttribute("aria-activedescendant");
    }

    function message(text) {
      list.textContent = "";
      results = [];
      list.appendChild(el("li", { class: "search-message", role: "option", "aria-disabled": "true", text: text }));
      setExpanded(true);
    }

    function choose(nick) {
      clearTimeout(timer);
      pendingEnter = false;
      setExpanded(false);
      input.value = "";
      results = [];
      resultsFor = null;
      if (!mqNav.matches) setSearchOpen(false);
      openProfile(nick, { push: true });
    }

    function pickForEnter(q) {
      var lower = q.toLowerCase();
      for (var i = 0; i < results.length; i++) if (results[i].nick.toLowerCase() === lower) return results[i].nick;
      return results.length ? results[0].nick : null;
    }

    function render(players, q) {
      list.textContent = "";
      results = players;
      resultsFor = q;
      active = -1;
      if (!players.length) {
        message("Bunday o'yinchi topilmadi");
        live.textContent = "Bunday o'yinchi topilmadi";
        pendingEnter = false;
        return;
      }
      players.forEach(function (p, i) {
        var li = el("li", { class: "search-option", role: "option", id: "so-" + i, "aria-selected": "false" }, [
          headImg(p.nick),
          el("span", { class: "so-nick", text: p.nick }),
          el("span", { class: "so-meta", text: p.rank ? "#" + p.rank + " · " + p.total + " ball" : "tekshirilmagan" })
        ]);
        li.addEventListener("mousedown", function (e) { e.preventDefault(); });
        li.addEventListener("click", function () { choose(p.nick); });
        list.appendChild(li);
      });
      setExpanded(true);
      live.textContent = players.length + " ta o'yinchi topildi";
      if (pendingEnter) {
        pendingEnter = false;
        choose(pickForEnter(q));
      }
    }

    function run() {
      clearTimeout(timer);
      timer = null;
      var q = input.value.trim();
      if (!q) { pendingEnter = false; setExpanded(false); return; }
      if (!SEARCH_RE.test(q)) { pendingEnter = false; message("Bunday o'yinchi topilmadi"); return; }
      var id = ++reqId;
      if (!results.length) message("Yuklanmoqda...");
      api("/api/search?q=" + encodeURIComponent(q)).then(function (data) {
        if (id === reqId) render(data.players || [], q);
      }, function (err) {
        if (id !== reqId) return;
        pendingEnter = false;
        message(err.status === 429 ? err.message : "Qidiruvda xatolik. Qayta urinib ko'ring.");
      });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(run, 220);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim() && list.childNodes.length) setExpanded(true);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.hidden) { if (input.value.trim()) run(); return; }
        if (!results.length) return;
        var next = e.key === "ArrowDown"
          ? (active + 1) % results.length
          : (active <= 0 ? results.length - 1 : active - 1);
        setActive(next);
      } else if (e.key === "Escape") {
        if (!list.hidden) {
          e.preventDefault();
          setExpanded(false);
        } else if (searchWrap.classList.contains("is-open")) {
          e.preventDefault();
          setSearchOpen(false, true);
        }
      }
    });

    // Enter (yoki mobil klaviaturadagi "Qidirish") — profilni ochadi.
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      if (active >= 0 && results[active]) return choose(results[active].nick);
      if (resultsFor === q && timer === null) {
        var nick = pickForEnter(q);
        if (nick) return choose(nick);
        return;
      }
      if (!SEARCH_RE.test(q)) return message("Bunday o'yinchi topilmadi");
      pendingEnter = true;
      run();
    });

    input.addEventListener("blur", function () {
      setTimeout(function () {
        if (!searchWrap.contains(document.activeElement)) setExpanded(false);
      }, 150);
    });

    return { hideList: function () { setExpanded(false); } };
  })();

  /* ---------- tablar ---------- */

  function tabButtons() { return $$("[data-tab]", tabsEl); }

  function renderTabs() {
    tabButtons().forEach(function (b) {
      if (b.getAttribute("data-tab") !== "umumiy") b.remove();
    });
    state.kits.forEach(function (kit) {
      tabsEl.appendChild(el("button", {
        class: "tab", type: "button", role: "tab", id: "tab-" + kit.slug,
        "aria-controls": "board-panel", "aria-selected": "false", tabindex: -1, "data-tab": kit.slug
      }, [el("span", { class: "tab-icon" }, [U.icon(kit.icon)]), el("span", { text: kit.name })]));
    });
    updateTabsMask();
  }

  function updateTabsMask() {
    tabsEl.classList.toggle("is-end", tabsEl.scrollLeft + tabsEl.clientWidth >= tabsEl.scrollWidth - 2);
  }

  function revealTab(btn) {
    var tr = tabsEl.getBoundingClientRect();
    var br = btn.getBoundingClientRect();
    if (br.left < tr.left) tabsEl.scrollLeft -= tr.left - br.left + 8;
    else if (br.right > tr.right) tabsEl.scrollLeft += br.right - tr.right + 28;
  }

  function selectTab(slug, opts) {
    opts = opts || {};
    if (slug !== "umumiy" && !kitBySlug(slug)) slug = "umumiy";
    var changed = slug !== state.tab || !opts.keep;
    state.tab = slug;
    tabButtons().forEach(function (b) {
      var on = b.getAttribute("data-tab") === slug;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) {
        panel.setAttribute("aria-labelledby", b.id);
        if (opts.focus) b.focus();
        revealTab(b);
      }
    });
    if (opts.updateUrl && !PLAYER_PATH.test(location.pathname)) {
      history.replaceState(history.state, "", location.pathname + location.search + (slug === "umumiy" ? "" : "#" + slug));
    }
    if (changed) loadBoard();
  }

  function initTabs() {
    tabsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      var slug = btn.getAttribute("data-tab");
      if (slug === state.tab) return;
      selectTab(slug, { updateUrl: true, keep: true });
    });
    tabsEl.addEventListener("keydown", function (e) {
      var keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
      if (!has(keys, e.key)) return;
      e.preventDefault();
      var btns = tabButtons();
      var i = btns.indexOf(document.activeElement);
      if (i < 0) i = 0;
      var k = keys[e.key];
      var next = k === "first" ? 0 : k === "last" ? btns.length - 1 : (i + k + btns.length) % btns.length;
      selectTab(btns[next].getAttribute("data-tab"), { focus: true, updateUrl: true, keep: true });
    });
    tabsEl.addEventListener("scroll", updateTabsMask, { passive: true });
    window.addEventListener("resize", updateTabsMask);
  }

  function hashTab() {
    var h = location.hash.slice(1).toLowerCase();
    if (h === "umumiy" || h === "reyting") return "umumiy";
    return kitBySlug(h) ? h : null;
  }

  function scrollToBoard() {
    board.scrollIntoView({ block: "start" });
  }

  /* ---------- reyting paneli ---------- */

  function boardHead(iconName, title, count) {
    return el("div", { class: "board-head" }, [
      el("h3", { class: "board-title" }, [el("span", { class: "icon" }, [U.icon(iconName)]), el("span", { text: title })]),
      el("p", { class: "board-count", text: count })
    ]);
  }

  function emptyBox(sub) {
    var link = el("a", { class: "btn btn-primary", href: "#tier-test", text: "Tier test olish" });
    return stateBox("Hali hech kim tekshirilmagan", sub, link);
  }

  function loadBoard() {
    var token = ++state.token;
    state.kitData = null;
    if (state.tab === "umumiy") return startLeaderboard(token);
    panel.textContent = "";
    panel.appendChild(stateBox("Yuklanmoqda..."));
    api("/api/kit/" + encodeURIComponent(state.tab)).then(function (data) {
      if (token !== state.token) return;
      state.kitData = data;
      renderKitBoard(data);
    }, function (err) {
      if (token !== state.token) return;
      panel.textContent = "";
      panel.appendChild(errorBox(err, loadBoard));
    });
  }

  /* Umumiy reyting: 50 tadan, pastga aylantirganda keyingi sahifa yuklanadi. */

  var observer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) loadMore();
      }, { rootMargin: "600px 0px" })
    : null;

  function startLeaderboard(token) {
    if (observer) observer.disconnect();
    state.lb = { token: token, page: 0, totalPages: 1, loading: false, list: null, moreWrap: null, moreBtn: null };
    panel.textContent = "";
    panel.appendChild(stateBox("Yuklanmoqda..."));
    loadMore();
  }

  function updateMore() {
    var lb = state.lb;
    var done = lb.page >= lb.totalPages;
    lb.moreWrap.hidden = done;
    lb.moreBtn.disabled = lb.loading;
    lb.moreBtn.textContent = lb.loading ? "Yuklanmoqda..." : "Yana ko'rsatish";
    if (done && observer) observer.disconnect();
  }

  function loadMore() {
    var lb = state.lb;
    if (!lb || lb.loading || lb.token !== state.token) return;
    if (lb.page > 0 && lb.page >= lb.totalPages) return;
    lb.loading = true;
    if (lb.moreBtn) updateMore();
    api("/api/leaderboard?page=" + (lb.page + 1)).then(function (data) {
      if (lb.token !== state.token) return;
      lb.loading = false;
      lb.page = data.page;
      lb.totalPages = data.totalPages;
      if (!lb.list) {
        panel.textContent = "";
        if (!data.total) {
          panel.appendChild(emptyBox("Birinchi bo'lib tier test topshiring va reytingga chiqing."));
          return;
        }
        panel.appendChild(boardHead("trophy", "Umumiy reyting", data.total + " o'yinchi"));
        lb.list = el("ol", { class: "lb" });
        panel.appendChild(lb.list);
        lb.moreBtn = el("button", { class: "btn btn-ghost", type: "button" });
        lb.moreBtn.addEventListener("click", loadMore);
        var sentinel = el("div", { class: "lb-sentinel", "aria-hidden": "true" });
        lb.moreWrap = el("div", { class: "lb-more" }, [lb.moreBtn]);
        panel.appendChild(sentinel);
        panel.appendChild(lb.moreWrap);
        if (observer) observer.observe(sentinel);
      }
      var frag = document.createDocumentFragment();
      data.players.forEach(function (p) { frag.appendChild(leaderRow(p)); });
      lb.list.appendChild(frag);
      updateMore();
    }, function (err) {
      if (lb.token !== state.token) return;
      lb.loading = false;
      if (!lb.list) {
        panel.textContent = "";
        panel.appendChild(errorBox(err, function () { startLeaderboard(state.token); }));
      } else {
        updateMore();
        lb.moreBtn.textContent = "Qayta urinish";
      }
    });
  }

  function leaderRow(p) {
    var tiers = p.tiers || {};
    var badges = el("span", { class: "lb-badges" }, state.kits.map(function (kit) {
      return tierBadge(has(tiers, kit.slug) ? tiers[kit.slug] : null, kit);
    }));
    var link = el("a", { class: "lb-link", href: playerUrl(p.nick), "data-nick": p.nick }, [
      el("span", { class: "lb-rank" }, [el("span", { class: "sr-only", text: "O'rin: " }), String(p.rank)]),
      headImg(p.nick, "lb-head"),
      el("span", { class: "lb-name" }, [
        el("span", { class: "lb-nick", text: p.nick }),
        el("span", { class: "lb-sub", text: p.tested + " ta kit" })
      ]),
      el("span", { class: "lb-points" }, [el("strong", { text: String(p.total) }), "ball"]),
      badges
    ]);
    return el("li", { class: "lb-row" + (p.rank <= 3 ? " top-" + p.rank : "") }, [link]);
  }

  /* Kit bo'yicha: 5 ta ustun (Tier 1 … Tier 5), mobilda yig'iladigan bo'limlar. */

  function renderKitBoard(data) {
    var desktop = mqColumns.matches;
    panel.textContent = "";
    panel.appendChild(boardHead(data.kit.icon, data.kit.name, data.total + " o'yinchi"));
    if (!data.total) {
      panel.appendChild(emptyBox("Bu kitda hali test o'tkazilmagan."));
      return;
    }
    var grid = el("div", { class: "kb" });
    var opened = 0;
    data.tiers.forEach(function (col) {
      var count = col.ht.length + col.lt.length;
      var bodyId = "kb-body-" + col.tier;
      var expanded = desktop || (count > 0 && opened < 2);
      if (!desktop && expanded) opened++;

      var headParts = [
        el("span", { class: "kb-tier", text: "Tier " + col.tier }),
        el("span", { class: "kb-count", text: String(count) }),
        el("span", { class: "kb-chevron" }, [U.icon("chevron")])
      ];
      var head;
      if (desktop) {
        head = el("span", { class: "kb-toggle" }, headParts);
      } else {
        head = el("button", { class: "kb-toggle", type: "button", "aria-expanded": String(expanded), "aria-controls": bodyId }, headParts);
        head.addEventListener("click", function () {
          var open = head.getAttribute("aria-expanded") !== "true";
          head.setAttribute("aria-expanded", String(open));
          body.hidden = !open;
        });
      }

      var body;
      if (count) {
        body = el("ul", { class: "kb-list", id: bodyId });
        col.ht.forEach(function (nick) { body.appendChild(kitEntry(nick, "HT" + col.tier)); });
        col.lt.forEach(function (nick) { body.appendChild(kitEntry(nick, "LT" + col.tier)); });
      } else {
        body = el("p", { class: "kb-empty", id: bodyId, text: "Hali hech kim yo'q" });
      }
      body.hidden = !expanded;

      grid.appendChild(el("section", { class: "kb-col t" + col.tier, "aria-label": "Tier " + col.tier }, [
        el("h4", { class: "kb-col-title" }, [head]),
        body
      ]));
    });
    panel.appendChild(grid);
  }

  function kitEntry(nick, tier) {
    var ht = tier.charAt(0) === "H";
    return el("li", null, [
      el("a", { class: "kb-entry " + (ht ? "ht" : "lt"), href: playerUrl(nick), "data-nick": nick }, [
        headImg(nick),
        el("span", { class: "kb-nick", text: nick }),
        el("span", { class: "kb-tag", text: tier })
      ])
    ]);
  }

  mqColumns.addEventListener("change", function () {
    if (state.kitData && state.tab !== "umumiy") renderKitBoard(state.kitData);
  });

  // Reytingdagi nikni bosish — profil oynasini ochadi (Ctrl/yangi tab bilan esa oddiy havola).
  panel.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-nick]");
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openProfile(a.getAttribute("data-nick"), { push: true });
  });

  /* ---------- ballar jadvali va statistika ---------- */

  function renderLegend(points) {
    var box = $("[data-legend]");
    if (!box || !points) return;
    box.textContent = "";
    [1, 2, 3, 4, 5].forEach(function (n) {
      box.appendChild(el("li", { class: "legend-tier t" + n }, [
        el("span", { class: "legend-name", text: "Tier " + n }),
        el("div", { class: "legend-row" }, [tierBadge("HT" + n), el("span", { text: points["HT" + n] + " ball" })]),
        el("div", { class: "legend-row" }, [tierBadge("LT" + n), el("span", { text: points["LT" + n] + " ball" })])
      ]));
    });
  }

  function renderStats(data) {
    var ranked = $('[data-stat="ranked"]');
    var kits = $('[data-stat="kits"]');
    if (ranked) ranked.textContent = String(data.ranked || 0);
    if (kits) kits.textContent = String(data.kits.length);
  }

  /* ---------- o'yinchi profili (modal) ---------- */

  var dialog = $("[data-profile]");
  var dialogBody = $("[data-profile-body]");
  var profileReq = 0;
  var opener = null;
  var pushed = false;
  var isOpen = false;
  var downOnBackdrop = false;

  function openProfile(nick, opts) {
    opts = opts || {};
    if (opts.push) {
      var url = playerUrl(nick) + location.hash;
      if (PLAYER_PATH.test(location.pathname)) {
        history.replaceState({ profile: nick }, "", url);
      } else {
        history.pushState({ profile: nick }, "", url);
        pushed = true;
      }
    }
    if (!isOpen) {
      opener = document.activeElement;
      isOpen = true;
      if (!dialog.open) dialog.showModal();
    }
    document.title = nick + " — UNDEAD MC Tierlar";
    var id = ++profileReq;
    dialogBody.textContent = "";
    dialogBody.appendChild(el("h2", { id: "profile-title", class: "sr-only", text: "O'yinchi profili" }));
    dialogBody.appendChild(stateBox("Yuklanmoqda..."));
    api("/api/player/" + encodeURIComponent(nick)).then(function (p) {
      if (id === profileReq) renderProfile(p);
    }, function (err) {
      if (id !== profileReq) return;
      dialogBody.textContent = "";
      if (err.status === 404) {
        dialogBody.appendChild(el("h2", { id: "profile-title", class: "pf-nick", text: "Bunday o'yinchi topilmadi" }));
        dialogBody.appendChild(el("p", { class: "section-lead", text: "Nikni tekshiring. Hali test topshirmagan bo'lsangiz, Discord orqali tier test oling." }));
        dialogBody.appendChild(el("p", { class: "howto-cta" }, [
          el("a", { class: "btn btn-primary", href: DISCORD, target: "_blank", rel: "noopener", text: "Discordga qo'shilish" })
        ]));
      } else {
        dialogBody.appendChild(el("h2", { id: "profile-title", class: "sr-only", text: "Xatolik" }));
        dialogBody.appendChild(errorBox(err, function () { openProfile(nick); }));
      }
    });
  }

  function statItem(value, label, cls) {
    return el("li", { class: "pf-stat" + (cls ? " " + cls : "") }, [el("strong", { text: value }), el("span", { text: label })]);
  }

  function renderProfile(p) {
    dialogBody.textContent = "";
    var body = el("img", {
      class: "pf-body",
      src: "https://mc-heads.net/body/" + encodeURIComponent(p.nick) + "/240",
      width: 120, height: 240, alt: p.nick + " skini",
      decoding: "async", referrerpolicy: "no-referrer"
    });
    body.addEventListener("error", onImgError);

    dialogBody.appendChild(el("div", { class: "pf-hero" }, [
      body,
      el("h2", { id: "profile-title", class: "pf-nick", text: p.nick }),
      el("ul", { class: "pf-stats" }, [
        statItem(p.rank ? "#" + p.rank : "—", "o'rin", "is-rank"),
        statItem(String(p.total), "ball"),
        statItem(p.tested + "/" + p.kits.length, "kit tekshirilgan")
      ])
    ]));

    dialogBody.appendChild(el("h3", { class: "pf-section-title", text: "Kitlar bo'yicha tierlar" }));
    if (!p.kits.length) {
      dialogBody.appendChild(el("p", { class: "section-lead", text: "Hozircha faol kitlar yo'q." }));
      return;
    }
    var list = el("ul", { class: "pf-kits" });
    p.kits.forEach(function (k) {
      list.appendChild(el("li", { class: "pf-kit" + (k.tier ? "" : " is-empty") }, [
        el("span", { class: "pf-kit-icon" }, [U.icon(k.icon)]),
        el("span", { class: "pf-kit-name" }, [k.name, k.tier ? el("small", { text: "+" + k.points + " ball" }) : null]),
        tierBadge(k.tier, null, true),
        el("p", {
          class: "pf-kit-meta",
          text: k.tier
            ? "Oxirgi test: " + fmtDate(k.testedAt) + ", tester: " + (k.tester || "—")
            : "Hali tekshirilmagan"
        })
      ]));
    });
    dialogBody.appendChild(list);
  }

  function focusables(root) {
    return $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', root).filter(function (n) {
      return n.offsetParent !== null;
    });
  }

  // Yopishning yagona yo'li: tugma, Esc, tashqarini bosish va "Orqaga" shu yerga keladi.
  function closeProfile(viaHistory) {
    if (!isOpen) return;
    isOpen = false;
    profileReq++;
    if (dialog.open) dialog.close();
    document.title = BASE_TITLE;
    if (viaHistory) {
      pushed = false;
    } else if (PLAYER_PATH.test(location.pathname)) {
      if (pushed) {
        pushed = false;
        history.back();
      } else {
        history.replaceState(null, "", "/" + location.search + location.hash);
      }
    }
    var target = opener && document.contains(opener) && opener.offsetParent !== null ? opener : null;
    opener = null;
    if (target) target.focus();
  }

  function initProfile() {
    $("[data-profile-close]").addEventListener("click", function () { closeProfile(); });
    dialog.addEventListener("cancel", function () { closeProfile(); });
    dialog.addEventListener("close", function () { closeProfile(); });

    // Oyna tashqarisini bosish — yopadi (matn belgilashda tasodifan yopilmasligi uchun mousedown ham tekshiriladi).
    dialog.addEventListener("mousedown", function (e) { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog && downOnBackdrop) closeProfile();
      downOnBackdrop = false;
    });

    // Fokus oyna ichida aylanadi.
    dialog.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = focusables(dialog);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    window.addEventListener("popstate", function () {
      var m = PLAYER_PATH.exec(location.pathname);
      if (m) {
        pushed = false;
        openProfile(m[1]);
      } else {
        closeProfile(true);
      }
      var t = hashTab();
      if (t && t !== state.tab) selectTab(t, { keep: true });
    });
  }

  /* ---------- ishga tushirish ---------- */

  function loadKits() {
    api("/api/kits").then(function (data) {
      state.kits = data.kits || [];
      renderTabs();
      renderLegend(data.points);
      renderStats(data);
      var t = hashTab();
      selectTab(t || "umumiy");
      if (t && location.hash.toLowerCase() !== "#reyting" && !isOpen) scrollToBoard();
    }, function (err) {
      panel.textContent = "";
      panel.appendChild(errorBox(err, function () {
        panel.textContent = "";
        panel.appendChild(stateBox("Yuklanmoqda..."));
        loadKits();
      }));
    });
  }

  window.addEventListener("hashchange", function () {
    var t = hashTab();
    if (!t) return;
    selectTab(t, { keep: true });
    if (location.hash.toLowerCase() !== "#reyting") scrollToBoard();
  });

  U.fillIcons();
  initNav();
  initTabs();
  initProfile();

  var deep = PLAYER_PATH.exec(location.pathname);
  if (deep && NICK_RE.test(deep[1])) openProfile(deep[1]);

  loadKits();
})();
