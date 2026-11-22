// ===== Roster dashboard (3rd column of index_r.html; item.html reuses the area-cost chart via window.Dash) =====
// Needs js/card-rules.js (TYPES, TYPE_CODES, defaultPoints, defaultCost). Reads data/area.csv and, on index_r.html, the globals aPokemonData, defaultPoints, defaultCost, notePriority,
// NOTE_PRIORITIES, TYPES, getPokemonRegion, loadPokemonData. Call renderDashboard() after the data changes.
(function () {
    var C = {
        s1: "#3987e5",      // series 1 (blue)
        s2: "#d95926",      // series 2 (orange)
        s3: "#199e70",      // series 3 (aqua)
        none: "#5a5a6c",    // "absent" segment (neutral)
        grid: "#3f3f4e",
        text: "#ffffff",
        text2: "#a0a0b0",
        surface: "#2b2b36"
    };
    var RARITIES = ["B", "I", "A", "E", "M", "L"];
    var RARITY_NAMES = { B: "Basic", I: "Intermediate", A: "Advanced", E: "Expert", M: "Mythic", L: "Legendary" };
    var REGIONS = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"];
    var NS = "http://www.w3.org/2000/svg";
    var areaRows = null; // data/area.csv rows [ID, Name, Mana, active], loaded once
    var thesisCount = null; // named rows in data/data_thesis.csv, loaded once
    var PER_SHEET = { pokemon: 9, area: 9, thesis: 30 }; // cards per print sheet (thesis cards are 63 x 15.7 mm)

    // ---------- small helpers ----------
    function el(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function label(parent, x, y, s, attrs) {
        var t = el("text", Object.assign({ x: x, y: y, fill: C.text2, "font-size": 12 }, attrs || {}), parent);
        t.textContent = s;
        return t;
    }
    function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function fmt(v) { return Math.round(v) === v ? String(v) : v.toFixed(2); }
    function niceMax(v) {
        if (v <= 0) return 1;
        var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    }
    // Bar with only its data end rounded (4px), anchored to the baseline
    function vbarPath(x, y, w, h) {
        var r = Math.min(4, h, w / 2);
        return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
               "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
    }
    function hbarPath(x, y, w, h) {
        var r = Math.min(4, w, h / 2);
        return "M" + x + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
               "V" + (y + h - r) + "Q" + (x + w) + "," + (y + h) + " " + (x + w - r) + "," + (y + h) + "H" + x + "Z";
    }

    // ---------- tooltip ----------
    var tip;
    function showTip(evt, html) {
        if (!tip) { tip = document.createElement("div"); tip.className = "dash-tooltip"; document.body.appendChild(tip); }
        tip.innerHTML = html;
        tip.style.display = "block";
        var r = tip.getBoundingClientRect();
        var x = evt.clientX + 14, y = evt.clientY + 14;
        if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
        if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - 14;
        tip.style.left = x + "px";
        tip.style.top = y + "px";
    }
    function hideTip() { if (tip) tip.style.display = "none"; }
    function hover(node, htmlFn) {
        node.addEventListener("mousemove", function (e) { showTip(e, htmlFn()); });
        node.addEventListener("mouseleave", hideTip);
    }

    function openCard(id) {
        id = parseInt(id, 10);
        $("#menu_pokemon").val(id);
        var url = new URL(window.location);
        url.searchParams.set("id", id);
        window.history.replaceState({}, "", url);
        loadPokemonData(id - 1);
        $("html, body").animate({ scrollTop: 0 }, 200);
    }

    // ---------- data ----------
    function costTotal(cost) {
        var t = 0;
        (String(cost).match(/\{[^}]*\}/g) || []).forEach(function (tok) {
            var c = tok.slice(1, -1).trim();
            if (/^\d+$/.test(c)) t += parseInt(c, 10);
            else if (!/^x$/i.test(c)) t += 1; // each type icon counts as 1
        });
        return t;
    }
    function rosterFrom(list) {
        return $.grep(list || [], function (p) { return p.Name && p.Name.trim() !== ""; }).map(function (p) {
            var defPts = defaultPoints(p.Rarity), defCost = defaultCost(p.Rarity, p.Type1, p.Type2);
            var pts = p.Points !== undefined && p.Points !== "" ? parseFloat(p.Points) : defPts;
            var cost = p.Cost || defCost;
            return {
                p: p, id: p.ID, name: p.Name, rarity: p.Rarity, pts: Number(pts) || 0, cost: cost,
                total: costTotal(cost), custom: String(pts) !== String(defPts) || cost !== defCost,
                ability: !!(p.Ability_R_Name && p.Ability_R_Name.trim()),
                region: typeof getPokemonRegion === "function" ? getPokemonRegion(p.ID) : null
            };
        });
    }

    // ---------- areas (data/area.csv) ----------
    function codeToType() {
        var m = {};
        $.each(TYPE_CODES, function (name, code) { m[code] = name; });
        return m;
    }
    // rows: [ID, Name, Mana, active]; counts each type once per area that provides it
    function areaStats(rows) {
        var codeName = codeToType(), count = {}, all = 0;
        TYPES.forEach(function (t) { count[t] = 0; });
        rows.forEach(function (r) {
            var seen = {};
            (String(r[2]).match(/\{([^}]*)\}/g) || []).forEach(function (tok) {
                var code = tok.slice(1, -1).trim().toUpperCase();
                if (code === "ALL") { all++; return; }
                var t = codeName[code];
                if (t && !seen[t]) { seen[t] = true; count[t]++; }
            });
        });
        var total = TYPES.reduce(function (a, t) { return a + count[t]; }, 0) || 1;
        return { count: count, all: all, total: total, n: rows.length };
    }

    // "Areas vs area-cost demand": each type's share of the areas vs its share of the type icons in all area costs
    function costDemandPanel(root, st, data) {
        var codeName = codeToType(), areaCount = st.count, areaTotal = st.total;
        // Same comparison against what the roster actually asks for: the type icons in every Pokémon's area cost
        var costIcons = {}, costTotalIcons = 0;
        TYPES.forEach(function (t) { costIcons[t] = 0; });
        data.forEach(function (d) {
            (String(d.cost).match(/\{([^}]*)\}/g) || []).forEach(function (tok) {
                var t = codeName[tok.slice(1, -1).trim().toUpperCase()];
                if (t) { costIcons[t]++; costTotalIcons++; }
            });
        });
        var cmp2 = TYPES.map(function (t) {
            var cs = 100 * costIcons[t] / (costTotalIcons || 1), as = 100 * areaCount[t] / areaTotal;
            return { label: t, cs: cs, as: as, gap: as - cs, cn: costIcons[t], an: areaCount[t] };
        }).sort(function (x, y) { return y.gap - x.gap; });
        var $d = panel(root, "Areas vs area-cost demand",
            "Each type's share of the type icons in all " + data.length + " Pokémon area costs (" + costTotalIcons +
            " icons; generic {N} not counted), compared with its share in the areas. Bigger, rarer Pokémon need more type icons, so they count more.");
        legend($d, [{ name: "Areas", color: C.s1 }, { name: "Area-cost icons", color: C.s3 }]);
        hgroup(chartBox($d), cmp2.map(function (d) {
            var g = (d.gap >= 0 ? "+" : "−") + Math.abs(d.gap).toFixed(1);
            return {
                label: d.label, vals: [{ v: d.as, color: C.s1 }, { v: d.cs, color: C.s3 }], end: g,
                tip: "<b>" + d.label + "</b><br>Areas: " + d.as.toFixed(1) + "% (" + d.an + " areas)<br>Area-cost icons: " +
                     d.cs.toFixed(1) + "% (" + d.cn + " icons)<br>Gap: " + g + " pt" +
                     (d.gap < 0 ? " <span class='dt-muted'>· harder to pay for</span>" : " <span class='dt-muted'>· easier to pay for</span>")
            };
        }), { title: "Areas vs area-cost demand" });
    }

    // ---------- chart builders ----------
    function panel(root, title, sub) {
        var $p = $('<div class="dash-panel"></div>').appendTo(root);
        $p.append($("<h3>").text(title));
        if (sub) $p.append($('<p class="dash-sub">').text(sub));
        return $p;
    }
    function legend($p, entries) {
        var $l = $('<div class="dash-legend"></div>').appendTo($p);
        entries.forEach(function (e) {
            $l.append('<span><i style="background:' + e.color + (e.dashed ? ";height:0;border-top:2px dashed " + e.color + ";background:none" : "") + '"></i>' + esc(e.name) + "</span>");
        });
    }
    function chartBox($p) { return $('<div class="dash-chart"></div>').appendTo($p)[0]; }

    // Vertical bars; each item: { label, segs: [{ v, color, name }], tip }
    function vbars(box, items, o) {
        o = o || {};
        var W = Math.max(260, box.clientWidth), H = o.height || 190, m = { t: 20, r: 8, b: 30, l: 34 };
        var svg = el("svg", { width: W, height: H, role: "img", "aria-label": o.title || "" }, box);
        var max = niceMax(Math.max.apply(null, items.map(function (it) { return it.segs.reduce(function (a, s) { return a + s.v; }, 0); }).concat([0])));
        var ph = H - m.t - m.b, pw = W - m.l - m.r;
        var y = function (v) { return m.t + ph - (v / max) * ph; };
        [0, max / 2, max].forEach(function (t) {
            el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: C.grid, "stroke-width": 1 }, svg);
            label(svg, m.l - 6, y(t) + 4, fmt(t), { "text-anchor": "end", "font-size": 11 });
        });
        var slot = pw / items.length, bw = Math.min(46, slot * 0.6);
        items.forEach(function (it, i) {
            var x = m.l + i * slot + (slot - bw) / 2, base = 0, total = 0;
            it.segs.forEach(function (s, si) {
                if (s.v <= 0) return;
                var top = y(base + s.v), bottom = y(base);
                var h = bottom - top - (base > 0 ? 2 : 0); // 2px surface gap between stacked segments
                if (h > 0) el("path", { d: vbarPath(x, top, bw, h), fill: s.color }, svg);
                base += s.v;
            });
            total = base;
            if (o.valueLabels !== false) label(svg, x + bw / 2, y(total) - 6, fmt(o.valueFmt ? o.valueFmt(total) : total), { "text-anchor": "middle", fill: C.text, "font-size": 12 });
            label(svg, x + bw / 2, H - m.b + 18, it.label, { "text-anchor": "middle" });
            var hit = el("rect", { x: m.l + i * slot, y: m.t, width: slot, height: ph + 4, fill: "transparent" }, svg);
            hover(hit, function () { return it.tip; });
        });
    }

    // Horizontal stacked bars; each item: { label, segs: [{ v, color }], tip }
    function hbars(box, items, o) {
        o = o || {};
        var W = Math.max(260, box.clientWidth), row = 20, m = { t: 4, r: 34, b: 4, l: 74 };
        var H = m.t + m.b + items.length * row;
        var svg = el("svg", { width: W, height: H, role: "img", "aria-label": o.title || "" }, box);
        var max = Math.max.apply(null, items.map(function (it) { return it.segs.reduce(function (a, s) { return a + s.v; }, 0); }).concat([1]));
        var pw = W - m.l - m.r;
        items.forEach(function (it, i) {
            var yy = m.t + i * row, bh = 12, by = yy + (row - bh) / 2, base = 0;
            label(svg, m.l - 8, by + bh - 2, it.label, { "text-anchor": "end" });
            it.segs.forEach(function (s, si) {
                if (s.v <= 0) return;
                var x0 = m.l + (base / max) * pw + (base > 0 ? 2 : 0);
                var w = (s.v / max) * pw - (base > 0 ? 2 : 0);
                if (w > 0) el("path", { d: hbarPath(x0, by, w, bh), fill: s.color }, svg);
                base += s.v;
            });
            label(svg, m.l + (base / max) * pw + 6, by + bh - 2, String(base), { fill: C.text });
            var hit = el("rect", { x: 0, y: yy, width: W, height: row, fill: "transparent" }, svg);
            hover(hit, function () { return it.tip; });
        });
    }

    // Grouped horizontal bars: one thin bar per series in each row; each item: { label, vals: [{ v, color }], end, tip }
    function hgroup(box, items, o) {
        o = o || {};
        var W = Math.max(260, box.clientWidth), bh = 7, gap = 2, row = 2 * bh + gap + 9, m = { t: 4, r: 52, b: 4, l: 74 };
        var H = m.t + m.b + items.length * row;
        var svg = el("svg", { width: W, height: H, role: "img", "aria-label": o.title || "" }, box);
        var max = Math.max.apply(null, [].concat.apply([], items.map(function (it) { return it.vals.map(function (v) { return v.v; }); })).concat([0.0001]));
        var pw = W - m.l - m.r;
        items.forEach(function (it, i) {
            var yy = m.t + i * row, top = yy + (row - (2 * bh + gap)) / 2;
            label(svg, m.l - 8, top + bh + 4, it.label, { "text-anchor": "end" });
            it.vals.forEach(function (v, k) {
                var w = (v.v / max) * pw;
                if (w > 0) el("path", { d: hbarPath(m.l, top + k * (bh + gap), w, bh), fill: v.color }, svg);
            });
            if (it.end) label(svg, W - 4, top + bh + 4, it.end, { "text-anchor": "end", fill: C.text });
            var hit = el("rect", { x: 0, y: yy, width: W, height: row, fill: "transparent" }, svg);
            hover(hit, function () { return it.tip; });
        });
    }

    // Points vs area cost: one dot per (cost, points, default/custom), sized by how many Pokémon share it
    function scatter(box, data) {
        var W = Math.max(260, box.clientWidth), H = 260, m = { t: 14, r: 14, b: 38, l: 38 };
        var svg = el("svg", { width: W, height: H, role: "img", "aria-label": "Points versus area cost" }, box);
        var maxX = Math.max(12, Math.max.apply(null, data.map(function (d) { return d.total; }))) + 1;
        var maxY = Math.max(15, Math.max.apply(null, data.map(function (d) { return d.pts; }))) + 1;
        var pw = W - m.l - m.r, ph = H - m.t - m.b;
        var x = function (v) { return m.l + (v / maxX) * pw; }, y = function (v) { return m.t + ph - (v / maxY) * ph; };
        for (var gx = 0; gx <= maxX; gx += 2) {
            el("line", { x1: x(gx), x2: x(gx), y1: m.t, y2: m.t + ph, stroke: C.grid, "stroke-width": 1, "stroke-opacity": 0.5 }, svg);
            label(svg, x(gx), H - m.b + 16, gx, { "text-anchor": "middle", "font-size": 11 });
        }
        for (var gy = 0; gy <= maxY; gy += 3) {
            el("line", { x1: m.l, x2: m.l + pw, y1: y(gy), y2: y(gy), stroke: C.grid, "stroke-width": 1, "stroke-opacity": 0.5 }, svg);
            label(svg, m.l - 6, y(gy) + 4, gy, { "text-anchor": "end", "font-size": 11 });
        }
        label(svg, m.l + pw / 2, H - 4, "Area cost (total)", { "text-anchor": "middle" });
        label(svg, 12, m.t + ph / 2, "Points", { "text-anchor": "middle", transform: "rotate(-90 12 " + (m.t + ph / 2) + ")" });

        // Rarity default curve
        var curve = RARITIES.map(function (r) { return [costTotal(defaultCost(r, "Normal", "")), defaultPoints(r), r]; });
        el("polyline", { points: curve.map(function (c) { return x(c[0]) + "," + y(c[1]); }).join(" "), fill: "none", stroke: C.text2, "stroke-width": 2, "stroke-dasharray": "5 4" }, svg);
        curve.forEach(function (c) { label(svg, x(c[0]) - 6, y(c[1]) - 8, c[2], { "font-size": 11, "text-anchor": "end" }); });

        var groups = {};
        data.forEach(function (d) {
            var k = d.total + "|" + d.pts + "|" + (d.custom ? 1 : 0);
            (groups[k] = groups[k] || { total: d.total, pts: d.pts, custom: d.custom, items: [] }).items.push(d);
        });
        Object.keys(groups).map(function (k) { return groups[k]; })
            .sort(function (a, b) { return b.items.length - a.items.length; })
            .forEach(function (g) {
                var r = Math.min(16, 4 + Math.sqrt(g.items.length) * 1.8);
                var c = el("circle", { cx: x(g.total) + (g.custom ? 3 : 0), cy: y(g.pts), r: r, fill: g.custom ? C.s2 : C.s1, stroke: C.surface, "stroke-width": 2, style: "cursor:pointer" }, svg);
                hover(c, function () {
                    var names = g.items.slice(0, 8).map(function (d) { return esc(d.name) + " <span class='dt-muted'>(" + d.rarity + ")</span>"; }).join("<br>");
                    var more = g.items.length > 8 ? "<br><span class='dt-muted'>+" + (g.items.length - 8) + " more</span>" : "";
                    return "<b>" + g.items.length + " Pokémon</b> · cost " + g.total + " · " + g.pts + " pts" +
                           (g.custom ? " · <span class='dt-muted'>custom</span>" : "") + "<br>" + names + more +
                           "<br><span class='dt-muted'>Click to open " + esc(g.items[0].name) + "</span>";
                });
                c.addEventListener("click", function () { openCard(g.items[0].id); });
            });
    }

    // ---------- the dashboard ----------
    window.renderDashboard = function () {
        var root = document.querySelector(".dashboard-section");
        if (!root || !window.aPokemonData) return;
        hideTip();
        var data = rosterFrom(aPokemonData);
        $(root).empty();
        lastWidth = root.clientWidth;

        // Headline tiles
        var $head = $('<div class="dash-panel"></div>').appendTo(root);
        $head.append("<h2>Roster Dashboard</h2>");
        var n = data.length;
        var avg = function (f) { return n ? data.reduce(function (a, d) { return a + f(d); }, 0) / n : 0; };
        var notes = { "1": 0, "2": 0, "3": 0 };
        $.each(aPokemonData, function (i, p) { var pr = notePriority(p); if (notes[pr] != null) notes[pr]++; });
        var tiles = [
            ["Pokémon", n, "in the roster"],
            ["Avg points", avg(function (d) { return d.pts; }).toFixed(1), ""],
            ["Avg area cost", avg(function (d) { return d.total; }).toFixed(1), ""],
            ["With ability", data.filter(function (d) { return d.ability; }).length, Math.round(100 * data.filter(function (d) { return d.ability; }).length / (n || 1)) + "%"],
            ["Custom stats", data.filter(function (d) { return d.custom; }).length, "differ from rarity"],
            ["Open notes", notes[1] + notes[2] + notes[3],
             '<i class="note_dot note_p1"></i>' + notes[1] + ' <i class="note_dot note_p2"></i>' + notes[2] + ' <i class="note_dot note_p3"></i>' + notes[3]]
        ];
        var $tiles = $('<div class="dash-tiles"></div>').appendTo($head);
        tiles.forEach(function (t) {
            $tiles.append('<div class="dash-tile"><span class="dt-label">' + t[0] + '</span><span class="dt-value">' + t[1] + '</span><span class="dt-foot">' + t[2] + "</span></div>");
        });

        // Print sheets per card type and in total ("…" while that file is still loading)
        var sheetRows = [
            ["Pokémon sheets", n, PER_SHEET.pokemon],
            ["Area sheets", areaRows ? areaRows.length : null, PER_SHEET.area],
            ["Thesis sheets", thesisCount, PER_SHEET.thesis]
        ];
        var exact = 0, whole = 0, ready = true;
        $head.append('<h3 class="dash-subhead">Print sheets</h3>');
        var $sheets = $('<div class="dash-tiles"></div>').appendTo($head);
        sheetRows.forEach(function (r) {
            var known = r[1] != null, sh = known ? r[1] / r[2] : 0;
            if (known) { exact += sh; whole += Math.ceil(sh); } else ready = false;
            $sheets.append('<div class="dash-tile"><span class="dt-label">' + r[0] + '</span><span class="dt-value">' + (known ? sh.toFixed(1) : "…") +
                '</span><span class="dt-foot">' + (known ? r[1] + " cards ÷ " + r[2] + " per sheet<br>" + Math.ceil(sh) + " to print" : "loading") + "</span></div>");
        });
        $sheets.append('<div class="dash-tile dash-tile-total"><span class="dt-label">Grand total</span><span class="dt-value">' + (ready ? exact.toFixed(1) : "…") +
            '</span><span class="dt-foot">' + (ready ? "all card types<br>" + whole + " to print" : "loading") + "</span></div>");

        // Open notes, right under the headline panel
        var $n = panel(root, "Open balancing notes", "");
        var list = $.grep(aPokemonData, function (p) { return notePriority(p); })
            .sort(function (a, b) { return (String(a.Note_Priority) || "9").localeCompare(String(b.Note_Priority) || "9") || a.ID - b.ID; });
        if (!list.length) $n.append('<p class="dash-sub">No open notes.</p>');
        list.forEach(function (p) {
            var pr = notePriority(p);
            $('<button type="button" class="dash-note"></button>')
                .append('<i class="note_dot note_p' + pr + '"></i>')
                .append($('<span class="dn-name">').text("#" + String(p.ID).padStart(4, "0") + " " + p.Name))
                .append($('<span class="dn-text">').text(p.Note))
                .on("click", function () { openCard(p.ID); })
                .appendTo($n);
        });

        // Points vs cost
        var $sc = panel(root, "Points vs area cost", "Each dot is a group of Pokémon with the same cost and points; bigger means more. The dashed line is the rarity default.");
        legend($sc, [{ name: "Rarity default", color: C.s1 }, { name: "Custom", color: C.s2 }, { name: "Default curve", color: C.text2, dashed: true }]);
        scatter(chartBox($sc), data);

        // Rarity spread
        var $r = panel(root, "Rarity spread", "How many Pokémon of each rarity, split by whether they have an ability.");
        legend($r, [{ name: "With ability", color: C.s1 }, { name: "No ability", color: C.none }]);
        vbars(chartBox($r), RARITIES.map(function (r) {
            var all = data.filter(function (d) { return d.rarity === r; });
            var ab = all.filter(function (d) { return d.ability; }).length;
            return {
                label: r, segs: [{ v: ab, color: C.s1 }, { v: all.length - ab, color: C.none }],
                tip: "<b>" + RARITY_NAMES[r] + "</b>: " + all.length + " Pokémon<br>" + ab + " with ability · " + (all.length - ab) + " without"
            };
        }), { title: "Rarity spread" });

        // Points per cost
        var $e = panel(root, "Points per area cost", "Average points earned per point of area cost, by rarity. Hover for the range.");
        vbars(chartBox($e), RARITIES.map(function (r) {
            var all = data.filter(function (d) { return d.rarity === r && d.total > 0; });
            var ratios = all.map(function (d) { return d.pts / d.total; });
            var a = ratios.length ? ratios.reduce(function (x, y) { return x + y; }, 0) / ratios.length : 0;
            return {
                label: r, segs: [{ v: a, color: C.s1 }],
                tip: "<b>" + RARITY_NAMES[r] + "</b>: " + a.toFixed(2) + " pts per cost<br>" +
                     (ratios.length ? "range " + Math.min.apply(null, ratios).toFixed(2) + " – " + Math.max.apply(null, ratios).toFixed(2) : "no Pokémon")
            };
        }), { title: "Points per area cost", valueFmt: function (v) { return Math.round(v * 100) / 100; } });

        // Types
        var $t = panel(root, "Type appearances", "How often each type appears, as the first or second type.");
        legend($t, [{ name: "Type 1", color: C.s1 }, { name: "Type 2", color: C.s2 }]);
        var typeRows = TYPES.map(function (t) {
            var a = data.filter(function (d) { return d.p.Type1 === t; }).length;
            var b = data.filter(function (d) { return d.p.Type2 === t; }).length;
            return { label: t, a: a, b: b };
        }).sort(function (x, y) { return (y.a + y.b) - (x.a + x.b); });
        hbars(chartBox($t), typeRows.map(function (t) {
            return { label: t.label, segs: [{ v: t.a, color: C.s1 }, { v: t.b, color: C.s2 }],
                     tip: "<b>" + t.label + "</b>: " + (t.a + t.b) + "<br>" + t.a + " as Type 1 · " + t.b + " as Type 2" };
        }), { title: "Type appearances" });

        // Areas (data/area.csv): which types each tappable area provides
        if (areaRows) {
            var st = areaStats(areaRows);
            var areaCount = st.count, allAreas = st.all, areaTotal = st.total;

            var $a = panel(root, "Type appearances in areas",
                "How many of the " + areaRows.length + " areas provide each type" +
                (allAreas ? " (plus " + allAreas + " area that provides every type, not counted)." : "."));
            hbars(chartBox($a), TYPES.slice().sort(function (x, y) { return areaCount[y] - areaCount[x]; }).map(function (t) {
                return { label: t, segs: [{ v: areaCount[t], color: C.s1 }],
                         tip: "<b>" + t + "</b>: in " + areaCount[t] + " of " + areaRows.length + " areas" };
            }), { title: "Type appearances in areas" });

            // Compare shares, so the two different totals sit on one scale
            var rosterTotal = typeRows.reduce(function (a, t) { return a + t.a + t.b; }, 0) || 1;
            var cmp = typeRows.map(function (t) {
                var rs = 100 * (t.a + t.b) / rosterTotal, as = 100 * areaCount[t.label] / areaTotal;
                return { label: t.label, rs: rs, as: as, gap: as - rs, rn: t.a + t.b, an: areaCount[t.label] };
            }).sort(function (x, y) { return y.gap - x.gap; });
            var $c = panel(root, "Areas vs roster",
                "Each type's share of all type appearances in the areas and in the roster. Sorted from most over-supplied by areas (top) to most under-supplied (bottom); the number is the gap in percentage points.");
            legend($c, [{ name: "Areas", color: C.s1 }, { name: "Roster", color: C.s2 }]);
            hgroup(chartBox($c), cmp.map(function (d) {
                var g = (d.gap >= 0 ? "+" : "−") + Math.abs(d.gap).toFixed(1);
                return {
                    label: d.label, vals: [{ v: d.as, color: C.s1 }, { v: d.rs, color: C.s2 }], end: g,
                    tip: "<b>" + d.label + "</b><br>Areas: " + d.as.toFixed(1) + "% (" + d.an + " areas)<br>Roster: " +
                         d.rs.toFixed(1) + "% (" + d.rn + " Pokémon)<br>Gap: " + g + " pt" +
                         (d.gap < 0 ? " <span class='dt-muted'>· harder to pay for</span>" : " <span class='dt-muted'>· easier to pay for</span>")
                };
            }), { title: "Areas vs roster type share" });

            costDemandPanel(root, st, data);
        }

        // Regions
        var $g = panel(root, "Pokémon by region", "");
        vbars(chartBox($g), REGIONS.map(function (rg) {
            var c = data.filter(function (d) { return d.region === rg; }).length;
            return { label: rg.slice(0, 3), segs: [{ v: c, color: C.s1 }], tip: "<b>" + rg + "</b>: " + c + " Pokémon" };
        }), { title: "Pokémon by region", height: 170 });
    };

    $(function () {
        $.ajax({ url: "data/data_thesis.csv", dataType: "text", cache: false, success: function (csv) {
            thesisCount = $.grep($.csv.toObjects(csv), function (t) { return t.Name && t.Name.trim() !== ""; }).length;
            redraw();
        } });
        loadAreas();
    });

    function redraw() { (window.renderPageDashboard || window.renderDashboard)(); }

    function loadAreas() {
        $.ajax({ url: "data/area.csv", dataType: "text", cache: false, success: function (csv) {
            // 4th column (no header) is TRUE for every area today; a FALSE there is treated as "not in the game"
            areaRows = $.csv.toArrays(csv).slice(1).filter(function (r) {
                return r[1] && r[1].trim() !== "" && String(r[3] || "").trim().toUpperCase() !== "FALSE";
            });
            redraw();
        } });
    }

    window.Dash = {
        rosterFrom: rosterFrom,
        areaStats: areaStats,
        costDemandPanel: costDemandPanel,
        getAreaRows: function () { return areaRows; },
        reloadAreas: loadAreas,
        hideTip: hideTip
    };

    // Re-draw when the column width changes
    var lastWidth = 0, timer;
    $(function () {
        var root = document.querySelector(".dashboard-section");
        if (!root || !window.ResizeObserver) return;
        new ResizeObserver(function () {
            if (Math.abs(root.clientWidth - lastWidth) < 4) return; // height changes from re-drawing are ignored
            lastWidth = root.clientWidth;
            clearTimeout(timer);
            timer = setTimeout(redraw, 120);
        }).observe(root);
    });
})();
