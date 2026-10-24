(function () {
  "use strict";
  var D = window.MAJESTIC;
  var $ = function (id) { return document.getElementById(id); };
  var modelInput = $("model"), seasonSel = $("season"), results = $("results");
  var curPart = null; // the part chosen under "What needs replacing?", or null

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function link(url, text) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>";
  }

  // ---- index: model -> seasons -> van ----
  var byModel = {};
  D.vans.forEach(function (v) {
    (byModel[v.m] = byModel[v.m] || {})[v.s] = v;
  });
  var allSeasons = [];
  for (var y = D.firstSeason; y <= D.lastSeason; y++) allSeasons.push(y);

  // ---- form setup ----
  var dl = $("model-list");
  Object.keys(byModel).sort(function (a, b) { return a - b; }).forEach(function (m) {
    var o = document.createElement("option");
    o.value = m;
    dl.appendChild(o);
  });

  function fillSeasons(model, keep) {
    var known = byModel[model] || {};
    var prev = keep || seasonSel.value;
    seasonSel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = model && byModel[model] ? "Choose a season" : "Choose a model first";
    seasonSel.appendChild(ph);
    allSeasons.slice().reverse().forEach(function (s) {
      var o = document.createElement("option");
      o.value = String(s);
      var v = known[s];
      if (v) o.textContent = s + (v.unlisted ? " (range list not found)" : "");
      else { o.textContent = s + " (no Majestic " + (model || "") + " listed)"; o.disabled = !!model && !!byModel[model]; }
      seasonSel.appendChild(o);
    });
    if (prev && known[prev]) seasonSel.value = prev;
  }

  // quick chips grouped by family
  var quick = $("quick-models");
  D.familyOrder.forEach(function (fk) {
    var fam = D.families[fk];
    var models = Object.keys(byModel).filter(function (m) {
      return Object.keys(byModel[m]).some(function (s) { return byModel[m][s].f === fk; });
    }).sort(function (a, b) { return a - b; });
    if (!models.length) return;
    var g = document.createElement("div");
    g.className = "quick-group";
    g.innerHTML = "<span>" + esc(fam.label) + "</span>";
    models.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = m;
      b.setAttribute("aria-pressed", "false");
      b.dataset.model = m;
      b.dataset.fam = fk;
      b.addEventListener("click", function () {
        modelInput.value = m;
        var seasons = Object.keys(byModel[m]).filter(function (s) { return byModel[m][s].f === fk; }).map(Number).sort();
        var cur = Number(seasonSel.value);
        fillSeasons(m, String(seasons.indexOf(cur) >= 0 ? cur : seasons[seasons.length - 1]));
        go();
      });
      g.appendChild(b);
    });
    quick.appendChild(g);
  });

  modelInput.addEventListener("input", function () {
    modelInput.value = modelInput.value.replace(/\D/g, "").slice(0, 3);
    fillSeasons(modelInput.value);
  });
  $("finder").addEventListener("submit", function (e) { e.preventDefault(); go(); });
  seasonSel.addEventListener("change", function () { if (modelInput.value && seasonSel.value) go(); });

  function go() {
    var m = modelInput.value.trim(), s = seasonSel.value;
    if (m && s) location.hash = m + "/" + s + (curPart ? "/" + curPart : "");
    else if (m) location.hash = m;
    else render(null, null);
  }
  window.addEventListener("hashchange", fromHash);

  function fromHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    var pm = h.match(/^part\/([a-z_]+)$/);
    if (pm && D.catInfo[pm[1]]) { curPart = pm[1]; showChips(); renderPart(pm[1]); return; }
    var mm = h.match(/^(\d{3})(?:[\/-](\d{4}))?(?:\/([a-z_]+))?$/);
    if (!mm) { if (!h) { curPart = null; showChips(); render(null, null); } return; }
    curPart = mm[2] && mm[3] && D.catInfo[mm[3]] ? mm[3] : null;
    showChips();
    modelInput.value = mm[1];
    fillSeasons(mm[1], mm[2]);
    if (mm[2]) seasonSel.value = byModel[mm[1]] && byModel[mm[1]][mm[2]] ? mm[2] : "";
    render(mm[1], mm[2] ? Number(mm[2]) : null);
  }

  // ---- rendering ----
  function srcBadge(key) {
    var s = D.sources[key];
    if (!s) return '<span class="badge gap">' + esc(key) + "</span>";
    return '<span class="badge ' + esc(s.k) + '">' + esc(s.short) + "</span>";
  }
  function srcLink(key) {
    var s = D.sources[key];
    if (!s) return esc(key);
    return s.u ? link(s.u, s.t) : esc(s.t);
  }

  function factsFor(v) {
    return D.facts.filter(function (f) {
      if (f.f !== v.f && f.f !== "all") return false;
      if (f.s.indexOf(v.s) < 0) return false;
      if (f.m.indexOf("all") < 0 && f.m.indexOf(v.m) < 0) return false;
      if (f.x && f.x.indexOf(v.m) >= 0) return false;
      return true;
    });
  }
  function gapsFor(v) {
    return D.gaps.filter(function (g) {
      return (g.f === v.f || g.f === "all") && g.s.indexOf(v.s) >= 0 &&
        (!g.m || g.m.indexOf("all") >= 0 || g.m.indexOf(v.m) >= 0);
    });
  }

  var KIND_ORDER = { maj: 0, eld: 1, rev: 0, own: 2 };

  function short(q, n) {
    var w = String(q || "").replace(/^[\s"'“‘….]+|[\s"'”’…]+$/g, "").split(/\s+/);
    return w.length > n ? w.slice(0, n).join(" ") + " …" : w.join(" ");
  }
  function labelOf(f) {
    var mk = f.mk || "", pr = f.pr || "";
    if (mk && pr && norm(pr).indexOf(norm(mk)) === 0) return pr;
    if (mk && pr && norm(mk).indexOf(norm(pr)) >= 0) return mk;
    return [mk, pr].filter(Boolean).join(" ");
  }
  function mergeFacts(list) {
    var map = {}, out = [];
    list.forEach(function (f) {
      var named = !!f.nm;
      var label = labelOf(f) || short(f.q, 12);
      var key = named ? "n|" + norm(label) + "|" + norm(f.pn) : "d|" + norm(label);
      if (!map[key]) { map[key] = { label: label, pn: f.pn, ds: [], ce: f.ce, mk: f.mk, pr: f.pr, named: named, refs: [], rank: 9 }; out.push(map[key]); }
      var e = map[key];
      e.refs.push(f);
      if (f.d && norm(f.d) !== norm(label) && !e.ds.some(function (x) { return norm(x) === norm(f.d); })) e.ds.push(f.d);
      var k = (D.sources[f.src] || {}).k || "eld";
      e.rank = Math.min(e.rank, KIND_ORDER[k] != null ? KIND_ORDER[k] : 3);
      if (f.ce !== "fitted") e.ce = f.ce;
    });
    out.sort(function (a, b) { return (b.named - a.named) || (a.rank - b.rank); });
    return out;
  }
  function summaryOf(named) {
    var labels = [];
    named.forEach(function (e) {
      var l = e.label + (e.pn && norm(e.label).indexOf(norm(e.pn)) < 0 ? " " + e.pn : "");
      if (!labels.some(function (x) { return norm(x) === norm(l); })) labels.push(l);
    });
    labels = labels.filter(function (l) {
      return !labels.some(function (o) { return o !== l && norm(o).indexOf(norm(l)) === 0; });
    });
    return labels.slice(0, 4).join("; ") + (labels.length > 4 ? " …" : "");
  }

  var CERT = {
    "may-be-fitted": "may be fitted",
    "where-fitted": "where fitted",
    "option": "optional extra",
    "conflict": "sources disagree"
  };

  function itemHtml(e, idx) {
    var h = '<div class="item' + (e.named ? "" : " desc") + '">';
    var showPn = e.pn && norm(e.label).indexOf(norm(e.pn)) < 0;
    h += '<div class="name">' + esc(cap(e.label)) + (showPn ? ' <span class="pn">' + esc(e.pn) + "</span>" : "") + "</div>";
    if (CERT[e.ce]) h += '<div class="detail"><strong>' + esc(CERT[e.ce]) + "</strong></div>";
    e.ds.slice(0, 3).forEach(function (d) { h += '<div class="detail">' + esc(d) + "</div>"; });
    h += '<div class="srcs">';
    var seen = {};
    e.refs.forEach(function (r) { if (!seen[r.src]) { seen[r.src] = 1; h += srcBadge(r.src); } });
    h += ' <button type="button" class="srcbtn" data-toggle="q' + idx + '">show source</button></div>';
    h += '<div id="q' + idx + '" hidden>';
    var qs = {};
    e.refs.forEach(function (r) {
      var k = r.src + "|" + r.q;
      if (qs[k]) return;
      qs[k] = 1;
      h += '<blockquote class="quote">"' + esc(r.q) + '"<cite>' + srcLink(r.src) + (r.loc ? ", " + esc(r.loc) : "") + "</cite></blockquote>";
    });
    h += "</div></div>";
    return h;
  }

  function routesFor(cat, makers, products, v) {
    var out = [];
    var c = D.catInfo[cat] || {};
    if (c.genuine === "peugeot") {
      out.push({ k: "Genuine", h: "Any Peugeot dealer, quoting the VIN. " + (c.genuineNote || "") });
    } else if (c.genuine !== "none") {
      var twin = v ? " and the Elddis twin, <strong>" + esc(v.tw.name) + " (" + v.s + ")</strong>" : " and your van's Elddis twin (shown once you choose your model and season above)";
      out.push({ k: "Genuine", h: "Any Elddis approved retailer or Marquis branch, quoting your 17-digit VIN" + twin + "." });
    }
    var mk = makers.map(norm);
    var routes = D.routes.filter(function (r) { return r.c === cat; });
    var pr = products.map(norm).filter(function (x) { return x.length > 2; });
    var hit = function (a, b) { return a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); };
    var matched = routes.filter(function (r) {
      if (!r.mk && !(r.pr && r.pr.length)) return true;
      if (r.mk && mk.some(function (x) { return hit(x, norm(r.mk)); })) return true;
      return (r.pr || []).some(function (p) { return pr.some(function (x) { return hit(x, norm(p)); }); });
    });
    var general = (!mk.length && !matched.some(function (r) { return r.mk || (r.pr && r.pr.length); })) || c.all;
    // one row per supplier and maker, with every page for it
    var rows = [], byKey = {};
    (general ? routes : matched).forEach(function (r) {
      var key = r.sup + "|" + norm(r.mk);
      var row = byKey[key];
      if (!row) {
        row = byKey[key] = { sup: D.sup[r.sup] || { n: r.sup }, mk: r.mk, links: [], notes: [] };
        rows.push(row);
      }
      if (r.u && !row.links.some(function (l) { return l.u === r.u; })) row.links.push({ u: r.u, t: (r.pr || []).slice(0, 3).join(", ") });
      if (r.n && row.notes.indexOf(r.n) < 0) row.notes.push(r.n);
    });
    var order = { "official-service": 0, "maker-uk": 1, "dealer-network": 2, "retailer": 3, "replica-maker": 4, "repairer": 5, "breaker": 6 };
    rows.sort(function (a, b) { return (order[a.sup.k] != null ? order[a.sup.k] : 9) - (order[b.sup.k] != null ? order[b.sup.k] : 9); });
    rows.forEach(function (row) {
      var kind = D.supKinds[row.sup.k] || "Supplier";
      var h = "<strong>" + esc(row.sup.n) + "</strong>" + (row.mk ? ' <span class="badge gap">' + esc(row.mk) + "</span>" : "");
      h += '<span class="links">' + row.links.map(function (l, i) {
        return link(l.u, l.t || (row.links.length > 1 ? "page " + (i + 1) : "open page"));
      }).join(" · ") + "</span>";
      var note = row.notes.join(" ");
      if (row.sup.ph) note += (note ? " · " : "") + row.sup.ph;
      out.push({ k: kind, h: h, n: note });
    });
    D.generic.filter(function (g) { return g.c === cat; }).forEach(function (g) {
      out.push({ k: "Alternative (fit not confirmed by us)", h: esc(g.alt) + (g.u ? " · " + link(g.u, "source") : ""), n: "Instead of: " + g.o + (g.n ? ". " + g.n : "") });
    });
    return { list: out, general: general && routes.length > 0 };
  }

  function routesHtml(rt) {
    var body = "<h4>Where to replace</h4>";
    if (rt.general) body += '<p class="gapnote">The maker is not documented, so these are suppliers for this type of part.</p>';
    body += '<ul class="routes">';
    rt.list.forEach(function (r) {
      body += '<li class="route"><span class="rk">' + esc(r.k) + "</span>" + r.h + (r.n ? '<span class="rn">' + esc(r.n) + "</span>" : "") + "</li>";
    });
    return body + "</ul>";
  }
  function nearSlot(cat, makers) {
    return '<div class="near" data-cat="' + esc(cat) + '" data-mk="' + esc(makers.join("|")) + '"></div>';
  }

  var idx = 0;
  function catHtml(cat, v, facts, gaps, focus) {
    var cf = facts.filter(function (f) { return f.c === cat; });
    var cg = gaps.filter(function (x) { return x.c === cat; });
    var label = D.catInfo[cat].label;
    var merged = mergeFacts(cf);
    var named = merged.filter(function (e) { return e.named; }), desc = merged.filter(function (e) { return !e.named; });
    var makers = [], products = [];
    named.forEach(function (e) {
      if (e.mk && makers.indexOf(e.mk) < 0) makers.push(e.mk);
      [e.pr, e.pn].forEach(function (p) { if (p && products.indexOf(p) < 0) products.push(p); });
    });
    var summary = named.length ? summaryOf(named)
      : desc.length ? "Described, but no maker or model named" : "Not mentioned in any source found for this season";
    var body = "<h4>Maker and model</h4>";
    if (named.length) named.forEach(function (e) { body += itemHtml(e, idx++); });
    else body += '<p class="gapnote">No brochure, price list, handbook or test we found names the maker or model for this season. Check the label on the part itself.</p>';
    if (desc.length) {
      body += "<h4>Also described (no maker named)</h4>";
      desc.forEach(function (e) { body += itemHtml(e, idx++); });
    }
    cg.forEach(function (x) { if (merged.length) body += '<p class="gapnote">' + esc(x.n) + "</p>"; });
    var onlyElddis = named.length && named.every(function (e) { return e.rank >= 1; });
    if (onlyElddis) body += '<p class="gapnote">Only the Elddis range handbook names this part. Marquis upgraded some items on the Majestic, so check the label on yours.</p>';
    body += nearSlot(cat, makers);
    body += routesHtml(routesFor(cat, makers, products, v));
    return '<details class="cat' + (focus ? " focus" : "") + '" id="cat-' + cat + '"' + (focus ? " open" : "") + '><summary><span class="t">' + esc(label) +
      '</span><span class="chev" aria-hidden="true">›</span><span class="s">' + esc(summary) + "</span></summary><div class=\"cat-body\">" + body + "</div></details>";
  }

  function render(m, s) {
    var vv = m && s && byModel[m] && byModel[m][s];
    document.querySelectorAll(".chip[data-model]").forEach(function (b) { b.setAttribute("aria-pressed", String(!!vv && b.dataset.model === m && b.dataset.fam === vv.f)); });
    if (!m) { results.innerHTML = ""; return; }
    if (!byModel[m]) {
      results.innerHTML = '<p class="empty">No Majestic motorhome numbered <strong>' + esc(m) + "</strong> appears in any brochure, price list or handbook we found. Numbers found: " +
        Object.keys(byModel).sort(function (a, b) { return a - b; }).join(", ") + ".</p>";
      return;
    }
    if (!s) {
      var ss = Object.keys(byModel[m]).sort();
      results.innerHTML = '<p class="empty">Majestic ' + esc(m) + " is listed for these seasons: " + ss.join(", ") + ". Choose one above.</p>";
      return;
    }
    var v = byModel[m][s];
    if (!v) {
      results.innerHTML = '<p class="empty">No source lists a Majestic ' + esc(m) + " for the " + s + " season. Majestic " + esc(m) + " is listed for: " + Object.keys(byModel[m]).sort().join(", ") + ".</p>";
      return;
    }
    var fam = D.families[v.f];
    var facts = factsFor(v), gaps = gapsFor(v);
    var h = '<div class="result-head">';
    h += "<h2>Majestic " + esc(v.m) + " · " + v.s + " season</h2>";
    h += '<p class="sub">' + esc(fam.label) + " (built by Elddis on the " + esc(fam.range) + ")" + (v.layout ? " · " + esc(v.layout) : "") + "</p>";
    h += '<div class="facts-grid">';
    h += '<div class="fact-box"><div class="k">Search for parts under</div><div class="v">Elddis ' + esc(v.tw.name) + " " + v.s +
      ' <button type="button" class="copy" data-copy="Elddis ' + esc(v.tw.name) + " " + v.s + '">Copy</button></div><div class="n">' + esc(v.tw.note) + "</div></div>";
    h += '<div class="fact-box"><div class="k">Base vehicle</div><div class="v">' + esc(v.base || "Peugeot Boxer") + '</div><div class="n">' + esc(v.eng || "") + "</div></div>";
    h += '<div class="fact-box"><div class="k">Listed in</div><div class="v">' + v.lst.map(function (k) { return srcLink(k); }).join("; ") + "</div></div>";
    h += "</div>";
    h += '<p class="warn-line">Check your own van before ordering: options, dealer fits and earlier repairs change what is fitted. Read the label on the part and quote your VIN.</p>';
    if (v.unlisted) h += '<p class="warn-line">' + esc(v.unlisted) + "</p>";
    if (v.warn) h += '<p class="warn-line">' + esc(v.warn) + "</p>";
    if (v.docs && v.docs.length) {
      h += '<ul class="docs">';
      v.docs.forEach(function (d) { h += "<li>" + esc(d.label) + ": " + link(d.u, d.t) + "</li>"; });
      h += "</ul>";
    }
    h += "</div>";

    h += '<div class="legend"><span><span class="badge maj">Majestic</span> Marquis brochure, price list or a test of a Majestic</span>' +
      '<span><span class="badge eld">Elddis</span> Elddis handbook for the whole ' + esc(fam.range) + ' range that season; Marquis may have changed it</span>' +
      '<span><span class="badge own">Owner</span> owner report, not verified</span></div>';

    idx = 0;
    if (curPart) {
      h += '<section class="group" id="focus"><div class="focus-head"><h3>' + esc(D.catInfo[curPart].label) + " in this van</h3>" +
        '<a class="linkbtn" href="#' + esc(v.m + "/" + v.s) + '">Show all fittings</a></div>' + catHtml(curPart, v, facts, gaps, true) + "</section>";
    }
    h += '<div class="toolbar"><button type="button" id="open-all">Open all</button><button type="button" id="close-all">Close all</button><button type="button" id="print">Print / save as PDF</button></div>';
    D.groups.forEach(function (g) {
      var gh = "";
      g.cats.forEach(function (cat) { if (cat !== curPart) gh += catHtml(cat, v, facts, gaps, false); });
      if (gh) h += '<section class="group"><h3>' + esc(g.label) + "</h3>" + gh + "</section>";
    });
    results.innerHTML = h;
    wire();
    fillNear();
    var target = curPart ? $("focus") : results;
    if (target.getBoundingClientRect().top > window.innerHeight * 0.6 || curPart) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- one part across every Majestic (no van chosen yet) ----
  var famSeasons = {};
  D.vans.forEach(function (v) { (famSeasons[v.f] = famSeasons[v.f] || {})[v.s] = 1; });
  function ranges(list) {
    list = list.slice().sort(function (a, b) { return a - b; });
    var out = [], a = null, b = null;
    list.forEach(function (y) {
      if (a === null) { a = b = y; return; }
      if (y === b + 1) { b = y; return; }
      out.push(a === b ? String(a) : a + "–" + b); a = b = y;
    });
    if (a !== null) out.push(a === b ? String(a) : a + "–" + b);
    return out.join(", ");
  }
  function makersFitted(cat) {
    var by = {}, order = [];
    D.facts.forEach(function (f) {
      if (f.c !== cat || !f.nm || !f.mk) return;
      var k = norm(f.mk);
      if (!by[k]) { by[k] = { mk: f.mk, f: {} }; order.push(k); }
      (f.f === "all" ? D.familyOrder : [f.f]).forEach(function (fk) {
        f.s.forEach(function (y) {
          if (famSeasons[fk] && famSeasons[fk][y]) (by[k].f[fk] = by[k].f[fk] || {})[y] = 1;
        });
      });
    });
    return order.map(function (k) { return by[k]; }).filter(function (x) { return Object.keys(x.f).length; });
  }
  function renderPart(cat) {
    document.querySelectorAll(".chip[data-model]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    var label = D.catInfo[cat].label, fm = makersFitted(cat);
    var h = '<div class="result-head" id="focus"><h2>' + esc(label) + "</h2>";
    h += '<p class="sub">Every Majestic, 2011–2024 seasons. Choose your model and season above to see the one fitted to your van.</p>';
    if (fm.length) {
      h += '<div class="k-line">Makers named in the sources</div><ul class="docs">';
      fm.forEach(function (x) {
        h += "<li><strong>" + esc(x.mk) + "</strong>: " + D.familyOrder.filter(function (fk) { return x.f[fk]; }).map(function (fk) {
          return esc(D.families[fk].label) + " " + ranges(Object.keys(x.f[fk]).map(Number));
        }).join("; ") + "</li>";
      });
      h += '</ul><p class="help">From Majestic brochures, price lists and tests, and Elddis handbooks. A handbook covers a whole Elddis range, so some are “may be fitted”.</p>';
    } else {
      h += '<p class="gapnote">No source we found names the maker of this part on a Majestic. Check the label on the part itself.</p>';
    }
    h += "</div>";
    var makers = fm.map(function (x) { return x.mk; });
    var body = nearSlot(cat, makers) + routesHtml(routesFor(cat, makers, [], null));
    h += '<section class="group"><details class="cat focus" open id="cat-' + cat + '"><summary><span class="t">Where to get ' + esc(label.toLowerCase()) +
      '</span><span class="chev" aria-hidden="true">›</span><span class="s">' + esc(makers.length ? makers.join(", ") : "Maker not documented") + "</span></summary><div class=\"cat-body\">" + body + "</div></details></section>";
    results.innerHTML = h;
    wire();
    fillNear();
    $("focus").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function wire() {
    results.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = $(b.dataset.toggle);
        t.hidden = !t.hidden;
        b.textContent = t.hidden ? "show source" : "hide source";
      });
    });
    results.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var txt = b.dataset.copy;
        var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () {});
      });
    });
    var all = function (open) { results.querySelectorAll("details.cat").forEach(function (d) { d.open = open; }); };
    if (!$("open-all")) return;
    $("open-all").addEventListener("click", function () { all(true); });
    $("close-all").addEventListener("click", function () { all(false); });
    $("print").addEventListener("click", function () { all(true); window.print(); });
  }

  // ---- near you ----
  var PL = window.MAJESTIC_PLACES || { places: [], src: {} };
  var VEHICLE = { base_vehicle: 1, engine: 1, tyres: 1 };
  var ROLE = { mq: "Marquis branch", ed: "Elddis dealer", es: "Elddis service centre", wf: "Approved workshop", wb: "Approved workshop, also mobile", wm: "Mobile technician", gs: "Gas Safe accredited" };
  var LISTED = { marquis: "Marquis", elddis: "Elddis", aws: "Approved Workshop Scheme" };
  var pcInput = $("pc"), nearSt = $("near-status");
  var here = null, byDist = [];
  try { here = JSON.parse(localStorage.getItem("majestic-near") || "null"); } catch (e) { here = null; }

  function miles(la1, lo1, la2, lo2) {
    var r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 3958.8 * 2 * Math.asin(Math.sqrt(h));
  }
  function sortPlaces() {
    byDist = [];
    if (!here) return;
    PL.places.forEach(function (p) { p.d = miles(here.la, here.lo, p.la, p.lo); });
    byDist = PL.places.slice().sort(function (a, b) { return a.d - b.d; });
  }
  function setHere(h) {
    here = h;
    try { if (h) localStorage.setItem("majestic-near", JSON.stringify(h)); else localStorage.removeItem("majestic-near"); } catch (e) {}
    sortPlaces();
    nearStatus();
    fillNear();
  }
  function nearStatus(msg, bad) {
    nearSt.className = "help" + (bad ? " bad" : "");
    if (msg) { nearSt.textContent = msg; return; }
    nearSt.innerHTML = here
      ? "Listing places near <strong>" + esc(here.label) + "</strong> under each part. <button type=\"button\" class=\"linkbtn\" id=\"near-clear\">Clear</button>"
      : "Your postcode is sent only to postcodes.io, a free UK postcode lookup, to find its position, and is remembered in this browser only.";
    var c = $("near-clear");
    if (c) c.addEventListener("click", function () { pcInput.value = ""; setHere(null); });
  }

  var FULL = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/, OUTW = /^[A-Z]{1,2}\d[A-Z\d]?$/;
  function lookup(q) {
    var s = String(q || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!FULL.test(s) && !OUTW.test(s)) return Promise.reject(new Error("Enter a UK postcode such as LS15 4NG, or just its first part, such as LS15."));
    var req = FULL.test(s)
      ? fetch("https://api.postcodes.io/postcodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcodes: [s] }) })
        .then(function (r) { return r.json(); }).then(function (j) { return j.result && j.result[0] && j.result[0].result; })
      : fetch("https://api.postcodes.io/outcodes/" + s).then(function (r) { return r.json(); }).then(function (j) { return j.result; });
    return req.then(function (res) {
      if (!res || res.latitude == null) throw new Error("postcodes.io does not know " + q.trim().toUpperCase() + ". Check it, or enter just the first part.");
      var dist = Array.isArray(res.admin_district) ? res.admin_district[0] : res.admin_district;
      return { label: (res.postcode || res.outcode) + (dist ? " (" + dist + ")" : ""), q: q.trim().toUpperCase(), la: res.latitude, lo: res.longitude };
    }, function () { throw new Error("Could not reach postcodes.io to look up the postcode. Try again, or use your location."); });
  }
  $("near-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = pcInput.value;
    if (!q.trim()) { setHere(null); return; }
    nearStatus("Looking up " + q.trim().toUpperCase() + " …");
    lookup(q).then(setHere, function (err) { nearStatus(err.message, true); });
  });
  $("geo").addEventListener("click", function () {
    if (!navigator.geolocation) { nearStatus("This browser cannot share its location. Enter a postcode instead.", true); return; }
    nearStatus("Asking the browser for your location …");
    navigator.geolocation.getCurrentPosition(function (pos) {
      pcInput.value = "";
      // about 1 km precision is plenty for "nearest"
      setHere({ label: "your location", la: Math.round(pos.coords.latitude * 100) / 100, lo: Math.round(pos.coords.longitude * 100) / 100 });
    }, function () { nearStatus("Location not shared. Enter a postcode instead.", true); }, { timeout: 15000, maximumAge: 600000 });
  });

  var LISTED_MAKERS = {};
  PL.places.forEach(function (p) { (p.mk || []).forEach(function (m) { LISTED_MAKERS[m.m] = 1; }); });
  function has(roles) {
    return function (p) { return p.r.some(function (r) { return roles.indexOf(r) >= 0; }); };
  }
  function nearGroups(cat, makers) {
    var g = [], mk = makers.map(norm).filter(Boolean);
    var hit = function (a, b) { return a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); };
    if (mk.length) {
      var names = [], roles = [];
      var agents = byDist.filter(function (p) {
        return (p.mk || []).some(function (m) {
          var ok = mk.some(function (x) { return hit(x, norm(m.m)); });
          if (ok && names.indexOf(m.m) < 0) names.push(m.m);
          if (ok && roles.indexOf(m.r) < 0) roles.push(m.r);
          return ok;
        });
      });
      var plural = roles.map(function (r) { return r.replace(/y$/, "ie") + "s"; });
      var rl = plural.length > 1 ? plural.slice(0, -1).join(", ") + " and " + plural[plural.length - 1] : plural[0];
      if (agents.length) g.push({ t: names.join(" or ") + ": " + rl, n: "From the maker's own UK list. Mobile engineers come to you; the distance is to their base.", list: agents });
      // a maker that publishes no list (Whale): say so rather than leave the owner wondering
      Object.keys(PL.src).forEach(function (k) {
        var m = k.slice(3);
        if (k.indexOf("mk:") === 0 && !LISTED_MAKERS[m] && mk.some(function (x) { return hit(x, norm(m)); }))
          g.push({ t: m + " service agents", n: m + " does not publish a list of UK service agents. Ask the places below whether they work on " + m + " appliances.", list: [] });
      });
    }
    if (!VEHICLE[cat]) {
      var genuine = has(["mq", "ed", "es"]);
      g.push({ t: "Genuine parts: Marquis branches and Elddis dealers", n: "Order the part here, quoting your VIN. Each also has a workshop.", list: byDist.filter(genuine) });
      g.push({ t: "Approved workshops", n: "Approved Workshop Scheme members that work on motorhomes. Ask whether they supply and fit this part.",
        list: byDist.filter(function (p) { return has(["wf", "wb"])(p) && !genuine(p); }) });
      g.push({ t: "Mobile technicians (they come to you)", n: "Approved Workshop Scheme mobile technicians. The distance is to the base they list.", list: byDist.filter(has(["wm"])) });
    }
    return g;
  }
  function placeHtml(p) {
    var tags = p.r.map(function (r) { return ROLE[r]; }).filter(Boolean);
    (p.mk || []).forEach(function (m) { tags.push(m.m + " " + m.r); });
    var mob = p.r.indexOf("wm") >= 0 || (p.mk || []).some(function (m) { return m.mob; });
    var dm = Math.round(p.d);
    var d = p.d < 0.95 ? "under 1 mile" : dm + (dm === 1 ? " mile" : " miles");
    var h = '<li class="place"><div class="pl-top"><strong>' + esc(p.n) + '</strong><span class="dist">' + (mob ? "based " : "") + d + "</span></div>";
    h += '<div class="pl-tags">' + tags.map(esc).join(" · ") + "</div>";
    if (p.aka) h += '<div class="pl-aka">Also listed as ' + p.aka.map(esc).join(", ") + "</div>";
    h += '<div class="pl-addr">' + esc([p.a, p.pc].filter(Boolean).join(", ")) + "</div>";
    var links = [];
    // some lists give two numbers in one field ("T 07967 679793 / 01924 298109"): one link per complete UK number
    var tels = {}, re = /(^|[^\d+])((?:\+44[\s-]?(?:\(0\)\s?)?0?|0)(?:\d[\s-]?){8,9}\d)/g, mt;
    while ((mt = re.exec(p.ph || ""))) {
      var n = mt[2].trim(), uk = n.replace(/\(0\)/, "").replace(/\D/g, "").replace(/^44/, "0").replace(/^00/, "0");
      if ((uk.length === 10 || uk.length === 11) && !tels[uk]) { tels[uk] = 1; links.push('<a href="tel:' + uk + '">' + esc(n) + "</a>"); }
    }
    if (p.ph && !links.length) links.push(esc(p.ph));  // printed as the list gives it when it holds no complete UK number
    if (p.w) links.push(link(p.w, "Website"));
    links.push(link("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.n + ", " + (p.pc || p.a)), "Map"));
    var listed = [], seen = {};
    var add = function (u, t) { if (u && !seen[u]) { seen[u] = 1; listed.push(link(u, t)); } };
    Object.keys(p.l).forEach(function (k) { if (k !== "makers") add(p.l[k] === 1 ? PL.src[k].u : p.l[k], LISTED[k] || k); });
    (p.mk || []).forEach(function (m) { add((PL.src["mk:" + m.m] || {}).u, m.m); });
    h += '<div class="pl-links">' + links.join(" · ") + '</div><div class="pl-src">Listed by ' + listed.join(", ") + "</div></li>";
    return h;
  }
  function fillNear() {
    results.querySelectorAll(".near[data-cat]").forEach(function (el) {
      var cat = el.dataset.cat, makers = el.dataset.mk ? el.dataset.mk.split("|") : [];
      if (VEHICLE[cat]) {
        el.innerHTML = "<h4>Near you</h4><p class=\"near-ask\">Base vehicle parts come from Peugeot dealers: " + link(PL.peugeot.u, PL.peugeot.t) + ".</p>";
        return;
      }
      if (!here) {
        el.innerHTML = '<h4>Near you</h4><p class="near-ask">Add your postcode to list the nearest dealers, workshops' + (makers.length ? " and service agents" : "") +
          ' for this part. <button type="button" class="linkbtn" data-near-focus>Add postcode</button></p>';
        return;
      }
      var h = "<h4>Near " + esc(here.label) + "</h4>";
      nearGroups(cat, makers).forEach(function (g) {
        if (!g.list.length) {
          if (g.n) h += '<div class="near-group"><div class="ng-t">' + esc(g.t) + '</div><div class="ng-n">' + esc(g.n) + "</div></div>";
          return;
        }
        h += '<div class="near-group"><div class="ng-t">' + esc(g.t) + '</div><div class="ng-n">' + esc(g.n) + '</div><ul class="places">' + g.list.slice(0, 3).map(placeHtml).join("") + "</ul>";
        if (g.list.length > 3) {
          h += '<ul class="places more-list" hidden>' + g.list.slice(3, 10).map(placeHtml).join("") + "</ul>" +
            '<button type="button" class="linkbtn" data-more>Show ' + Math.min(7, g.list.length - 3) + " more</button>";
        }
        h += "</div>";
      });
      el.innerHTML = h;
    });
  }
  results.addEventListener("click", function (e) {
    var t = e.target.closest("[data-near-focus],[data-more]");
    if (!t) return;
    if (t.hasAttribute("data-more")) {
      t.previousElementSibling.hidden = false;
      t.parentNode.removeChild(t);
      return;
    }
    pcInput.scrollIntoView({ behavior: "smooth", block: "center" });
    pcInput.focus({ preventScroll: true });
  });

  // ---- what needs replacing? ----
  var partQ = $("part-q"), partChips = $("part-chips");
  var WORDS = {}, PROD = {}, ORDER = {};
  Object.keys(D.catInfo).forEach(function (c) {
    WORDS[c] = (D.catInfo[c].label + " " + (D.partWords[c] || "")).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  });
  // maker and product names from the sources find their part too (Heki, Combi, Aquasource …)
  D.facts.forEach(function (f) { if (f.nm) PROD[f.c] = (PROD[f.c] || "") + " " + [f.mk, f.pr, f.pn].filter(Boolean).join(" ").toLowerCase(); });
  D.common.forEach(function (x, i) { ORDER[x.c] = i; });
  function partMatches(q) {
    var qs = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!qs.length) return [];
    var out = [];
    Object.keys(D.catInfo).forEach(function (c) {
      var lab = D.catInfo[c].label.toLowerCase().split(/[^a-z0-9]+/), score = 0, hits = 0;
      qs.forEach(function (w) {
        var pre = function (x) { return x.indexOf(w) === 0; };
        var sc = lab.some(pre) ? 3 : WORDS[c].some(pre) ? 2 : w.length > 2 && (PROD[c] || "").indexOf(w) >= 0 ? 1 : 0;
        if (sc) { score += sc; hits++; }
      });
      if (hits) out.push({ c: c, h: hits, s: score });
    });
    out.sort(function (a, b) {
      return (b.h - a.h) || (b.s - a.s) || ((ORDER[a.c] != null ? ORDER[a.c] : 99) - (ORDER[b.c] != null ? ORDER[b.c] : 99));
    });
    return out.map(function (x) { return x.c; });
  }
  function chipHtml(c, text) {
    return '<button type="button" class="chip part" data-part="' + esc(c) + '" aria-pressed="' + (curPart === c) + '">' + esc(text || D.catInfo[c].label) + "</button>";
  }
  function showChips(all) {
    var q = partQ.value.trim(), h;
    if (all) {
      h = D.groups.map(function (g) { return g.cats.map(function (c) { return chipHtml(c); }).join(""); }).join("");
    } else if (q) {
      var m = partMatches(q);
      h = m.length ? m.slice(0, 8).map(function (c) { return chipHtml(c); }).join("")
        : '<p class="help">No part matches “' + esc(q) + '”. Try another word, or <button type="button" class="linkbtn" data-all-parts>show every part</button>.</p>';
    } else {
      h = D.common.map(function (x) { return chipHtml(x.c, x.t); }).join("") + '<button type="button" class="chip ghost" data-all-parts>Every part …</button>';
    }
    partChips.innerHTML = h;
  }
  function pickPart(c) {
    var m = modelInput.value.trim(), s = seasonSel.value;
    curPart = c;
    if (m && s && byModel[m] && byModel[m][s]) location.hash = m + "/" + s + "/" + c;
    else location.hash = "part/" + c;
  }
  partChips.addEventListener("click", function (e) {
    var b = e.target.closest("[data-part],[data-all-parts]");
    if (!b) return;
    if (b.hasAttribute("data-all-parts")) { partQ.value = ""; showChips(true); return; }
    pickPart(b.dataset.part);
  });
  partQ.addEventListener("input", function () { showChips(); });
  partQ.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    var m = partMatches(partQ.value);
    if (m.length) pickPart(m[0]);
  });

  // ---- static sections ----
  $("about-cards").innerHTML = D.about.map(function (c) { return '<div class="card"><h3>' + esc(c.title) + "</h3>" + c.html + "</div>"; }).join("");
  $("method-body").innerHTML = D.method;
  $("checked-line").textContent = "Facts and links checked " + D.checked + ".";

  fillSeasons("");
  if (here) { pcInput.value = here.q || ""; sortPlaces(); }
  nearStatus();
  showChips();
  fromHash();
})();
