/* UNDEAD MC — piksel ikonkalar. SVG elementlari DOM orqali yaratiladi (innerHTML ishlatilmaydi). */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var CUR = "currentColor";

  function svgRoot(w, h, pixel) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    if (pixel) svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    return svg;
  }

  function addPath(svg, d, fill, opacity) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill);
    if (opacity != null) p.setAttribute("fill-opacity", String(opacity));
    svg.appendChild(p);
  }

  // Har bir ikonka — qatorlar ro'yxati: "." bo'sh, boshqa belgilar palitradagi rangga mos.
  function pixel(rows, palette) {
    var w = rows[0].length, h = rows.length, paths = {};
    rows.forEach(function (row, y) {
      var x = 0;
      while (x < w) {
        var ch = row[x];
        if (ch === ".") { x++; continue; }
        var start = x;
        while (x < w && row[x] === ch) x++;
        paths[ch] = (paths[ch] || "") + "M" + start + " " + y + "h" + (x - start) + "v1h-" + (x - start) + "z";
      }
    });
    var svg = svgRoot(w, h, true);
    Object.keys(paths).forEach(function (ch) {
      var c = palette[ch];
      if (Array.isArray(c)) addPath(svg, paths[ch], c[0], c[1]);
      else addPath(svg, paths[ch], c);
    });
    return svg;
  }

  function vector(d) {
    var svg = svgRoot(24, 24, false);
    addPath(svg, d, CUR);
    return svg;
  }

  var SILVER = "#d4d4d4", WHITE = "#ffffff", RED = "#e01b1b", WOOD = "#8b5a2b";

  var TEMPLATES = {
    /* --- kitlar --- */
    sword: pixel([
      "........ss",
      ".......sws",
      "......sws.",
      "..g..sws..",
      "...gsws...",
      "....g.....",
      "...h.g....",
      "..h...g...",
      ".h........",
      "p........."
    ], { s: SILVER, w: WHITE, g: RED, h: WOOD, p: RED }),

    axe: pixel([
      "....ss....",
      "...swss.h.",
      "...swwsh..",
      "....ssh...",
      ".....h....",
      "....h.....",
      "...h......",
      "..h.......",
      ".h........",
      "h........."
    ], { s: SILVER, w: WHITE, h: WOOD }),

    mace: pixel([
      ".......s..",
      "......ddd.",
      ".....sdwds",
      "......ddd.",
      ".....h.s..",
      "....h.....",
      "...h......",
      "..h.......",
      ".h........",
      "h........."
    ], { s: SILVER, d: "#6b7280", w: WHITE, h: WOOD }),

    nethpot: pixel([
      "..........",
      "...nnnn...",
      "..nNNNNn..",
      ".nNwNNNNn.",
      ".nNNNNNNn.",
      ".nn....nn.",
      ".nN....Nn.",
      ".nN.rr.Nn.",
      ".nn.rr.nn.",
      ".........."
    ], { n: "#5b4f56", N: "#8a7d84", w: "#c9bec4", r: "#ff3b3b" }),

    crystal: pixel([
      "....gg....",
      "...gppg...",
      "..gpmmpg..",
      ".gpmwmmpg.",
      "gpmmmmmmpg",
      "gpmmmmmmpg",
      ".gpmmmmpg.",
      "..gpmmpg..",
      "...gppg...",
      "....gg...."
    ], { g: "#d9ccff", p: "#b07cff", m: "#ff6fd8", w: WHITE }),

    smp: pixel([
      "gggggggg",
      "glgggglg",
      "dgdggdgd",
      "bdbbdbbb",
      "bbbBbbbb",
      "bBbbbbBb",
      "bbbbBbbb",
      "bbBbbbbb"
    ], { g: "#4ade5a", l: "#7cf08a", d: "#2f9e3d", b: "#8b5a2b", B: "#6b4423" }),

    uhc: pixel([
      "....h.....",
      ".....hll..",
      "..gg.hgg..",
      ".gwgggggg.",
      ".gwgggggg.",
      ".ggggggGg.",
      ".ggggggGg.",
      "..ggggGg..",
      "...gGGg...",
      ".........."
    ], { g: "#f5c542", G: "#c9971c", w: "#fff6cc", h: WOOD, l: "#4ade5a" }),

    pot: pixel([
      "....cc....",
      "...ssss...",
      "....ss....",
      "...srrs...",
      "..srwrrs..",
      ".srwrrrrs.",
      ".srrrrrrs.",
      ".srrrrrrs.",
      "..srrrrs..",
      "...ssss..."
    ], { c: "#a0682f", s: "#cbd5e1", r: "#ff3b3b", w: "#ffd1d1" }),

    bow: pixel([
      "....hhs...",
      "...h..s...",
      "..h...s...",
      "..h...s...",
      ".hd...s...",
      ".hd...s...",
      "..h...s...",
      "..h...s...",
      "...h..s...",
      "....hhs..."
    ], { h: WOOD, d: "#5a3518", s: "#e5e7eb" }),

    trident: pixel([
      "c...c...c",
      "c...c...c",
      "ccccccccc",
      "....c....",
      "....t....",
      "....t....",
      "....t....",
      "....t....",
      "....t....",
      "....t...."
    ], { c: "#3fe0ff", t: "#1fa3b3" }),

    shield: pixel([
      ".sssssss.",
      "srrrrrrrs",
      "srrrwrrrs",
      "srrwwwrrs",
      "srrrwrrrs",
      "srrrwrrrs",
      ".srrrrrs.",
      ".srrrrrs.",
      "..srrrs..",
      "...sss..."
    ], { s: SILVER, r: RED, w: WHITE }),

    cart: pixel([
      "s........s",
      "sd......ds",
      "sdddddddds",
      ".ssssssss.",
      "..k....k..",
      ".kkk..kkk.",
      "..k....k.."
    ], { s: SILVER, d: "#3f3f46", k: "#9ca3af" }),

    elytra: pixel([
      "ppp....ppp",
      "pPPp..pPPp",
      "pPPPppPPPp",
      "pPPP..PPPp",
      "pPP....PPp",
      "pP......Pp",
      "p........p"
    ], { p: "#8c7bb5", P: "#b5a6d6" }),

    star: pixel([
      "....y....",
      "....y....",
      "...yyy...",
      "yyyyyyyyy",
      ".yyyyyyy.",
      "..yyyyy..",
      "..yy.yy..",
      ".yy...yy.",
      ".y.....y."
    ], { y: "#ffd84a" }),

    /* --- interfeys --- */
    trophy: pixel([
      "yyyyyyyyy",
      "yywyyyyyy",
      ".ywyyyyy.",
      "..yyyyy..",
      "...yyy...",
      "....y....",
      "...ddd...",
      "..ddddd.."
    ], { y: "#f5c542", w: "#fff3c4", d: "#c9971c" }),

    crown: pixel([
      "g...g...g",
      "g..ggg..g",
      "gg.ggg.gg",
      "ggggggggg",
      "grggwggrg",
      "ggggggggg",
      "ddddddddd"
    ], { g: CUR, d: [CUR, 0.6], r: RED, w: WHITE }),

    search: pixel([
      ".cccc....",
      "c....c...",
      "c....c...",
      "c....c...",
      "c....c...",
      ".cccc....",
      ".....cc..",
      "......cc.",
      ".......cc"
    ], { c: CUR }),

    close: pixel([
      "c.....c",
      "cc...cc",
      ".cc.cc.",
      "..ccc..",
      ".cc.cc.",
      "cc...cc",
      "c.....c"
    ], { c: CUR }),

    chevron: pixel([
      "c.....c",
      "cc...cc",
      ".cc.cc.",
      "..ccc..",
      "...c..."
    ], { c: CUR }),

    chest: pixel([
      "bbbbbbbbbb",
      "bwwwwwwwwb",
      "bwwwwwwwwb",
      "cccccccccc",
      "bwwwyywwwb",
      "bwwwyywwwb",
      "bwwwwwwwwb",
      "bbbbbbbbbb"
    ], { b: "#5a3518", w: "#a0682f", c: CUR, y: SILVER }),

    discord: vector("M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.12l.37-.3a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01l.37.3a.08.08 0 0 1 0 .12c-.6.35-1.22.65-1.88.9a.08.08 0 0 0-.04.1c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"),

    telegram: vector("M21.94 4.3 18.7 19.6c-.24 1.08-.88 1.35-1.79.84l-4.94-3.64-2.38 2.29c-.26.26-.48.48-.99.48l.35-5.03 9.16-8.28c.4-.35-.09-.55-.62-.2L6.17 13.2l-4.88-1.52c-1.06-.33-1.08-1.06.22-1.57L20.6 2.75c.88-.33 1.66.2 1.34 1.55z")
  };

  var KIT_KEYS = ["sword", "axe", "mace", "nethpot", "crystal", "smp", "uhc", "pot",
    "bow", "trident", "shield", "cart", "elytra", "star"];

  function icon(name) {
    var t = TEMPLATES[name] || TEMPLATES.star;
    return t.cloneNode(true);
  }

  function fillIcons(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-icon]"), function (node) {
      if (!node.firstChild) node.appendChild(icon(node.getAttribute("data-icon")));
    });
  }

  window.UMC = { icon: icon, fillIcons: fillIcons, kitKeys: KIT_KEYS };
})();
