(function () {
  "use strict";
  var D = window.MAJESTIC;
  var $ = function (id) { return document.getElementById(id); };
  var modelInput = $("model"), seasonSel = $("season"), results = $("results");

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
    if (m && s) location.hash = m + "/" + s;
    else if (m) location.hash = m;
    else render(null, null);
  }
  window.addEventListener("hashchange", fromHash);

  function fromHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    var mm = h.match(/^(\d{3})(?:[\/-](\d{4}))?$/);
    if (!mm) { if (!h) render(null, null); return; }
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
      out.push({ k: "Genuine", h: "Any Elddis approved retailer or Marquis branch, quoting your 17-digit VIN and the Elddis twin, <strong>" + esc(v.tw.name) + " (" + v.s + ")</strong>." });
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

  function render(m, s) {
    var vv = m && s && byModel[m] && byModel[m][s];
    document.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-pressed", String(!!vv && b.dataset.model === m && b.dataset.fam === vv.f)); });
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
    h += '<div class="toolbar"><button type="button" id="open-all">Open all</button><button type="button" id="close-all">Close all</button><button type="button" id="print">Print / save as PDF</button></div>';

    var idx = 0;
    D.groups.forEach(function (g) {
      var gh = "";
      g.cats.forEach(function (cat) {
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
        var rt = routesFor(cat, makers, products, v);
        body += "<h4>Where to replace</h4>";
        if (rt.general) body += '<p class="gapnote">The maker is not documented, so these are suppliers for this type of part.</p>';
        body += '<ul class="routes">';
        rt.list.forEach(function (r) {
          body += '<li class="route"><span class="rk">' + esc(r.k) + "</span>" + r.h + (r.n ? '<span class="rn">' + esc(r.n) + "</span>" : "") + "</li>";
        });
        body += "</ul>";
        gh += '<details class="cat" id="cat-' + cat + '"><summary><span class="t">' + esc(label) + '</span><span class="chev" aria-hidden="true">›</span><span class="s">' + esc(summary) + "</span></summary><div class=\"cat-body\">" + body + "</div></details>";
      });
      if (gh) h += '<section class="group"><h3>' + esc(g.label) + "</h3>" + gh + "</section>";
    });
    results.innerHTML = h;
    wire();
    if (results.getBoundingClientRect().top > window.innerHeight * 0.6) results.scrollIntoView({ behavior: "smooth", block: "start" });
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
    $("open-all").addEventListener("click", function () { all(true); });
    $("close-all").addEventListener("click", function () { all(false); });
    $("print").addEventListener("click", function () { all(true); window.print(); });
  }

  // ---- static sections ----
  $("about-cards").innerHTML = D.about.map(function (c) { return '<div class="card"><h3>' + esc(c.title) + "</h3>" + c.html + "</div>"; }).join("");
  $("method-body").innerHTML = D.method;
  $("checked-line").textContent = "Facts and links checked " + D.checked + ".";

  fillSeasons("");
  fromHash();
})();
