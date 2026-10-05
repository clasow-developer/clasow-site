/* The Memory Wall, redrawn.
   A signature is stored as strokes in the order they were drawn, in thousandths of the pad.
   Nothing recorded the speed of the hand, so a stroke is written at an even pace, and the
   strokes follow one another as they did on the tablet. A pen tip can ride the line as it is written.
   The writing plays even under reduced motion: it is the content, ink appearing in place, not movement
   across the page. Windows with "Animation effects" off reports reduced motion to every browser, and
   the founder's own laptop is one (2026-10-05). The pages' fades and the pulse still respect it. */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var INK = { b: "#005BBF", o: "#C55500", k: "#191C23" };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function load(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("wall " + r.status);
      return r.json();
    });
  }

  // One signature as an SVG, cropped to its ink with a margin, every stroke a polyline.
  function tile(sig) {
    var a = sig.a || 2, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    var lines = sig.s.map(function (st) {
      var pts = [];
      for (var i = 0; i + 1 < st.length; i += 2) {
        var x = st[i] * a, y = st[i + 1];
        pts.push(x + "," + y);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (pts.length === 1) pts.push(pts[0]); // a dot is a stroke too
      return pts.join(" ");
    });
    var w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
    var pad = Math.max(w, h * 1.5) * 0.12;
    var vw = w + pad * 2, vh = h + pad * 2;
    if (vw / vh > 1.5) vh = vw / 1.5; else vw = vh * 1.5;
    var vx = minX - (vw - w) / 2, vy = minY - (vh - h) / 2;
    var sw = Math.min(Math.max(12, vw / 90), vw / 45);
    var ink = INK[sig.i] || INK.b;

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", [vx, vy, vw, vh].map(function (n) { return n.toFixed(1); }).join(" "));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    lines.forEach(function (p) {
      var pl = document.createElementNS(NS, "polyline");
      pl.setAttribute("points", p);
      pl.setAttribute("fill", "none");
      pl.setAttribute("stroke", ink);
      pl.setAttribute("stroke-width", sw.toFixed(1));
      pl.setAttribute("stroke-linecap", "round");
      pl.setAttribute("stroke-linejoin", "round");
      svg.appendChild(pl);
    });
    svg._took = sig.t || 4000;
    svg._ink = ink;
    svg._sw = sw;
    return svg;
  }

  // Hide the ink so it can be written. Must be called once the SVG is in the page.
  function blank(svg) {
    svg._run = (svg._run || 0) + 1; // stops any writing in progress
    if (svg._nib) { svg._nib.remove(); svg._nib = null; }
    Array.prototype.forEach.call(svg.querySelectorAll("polyline"), function (pl) {
      var len = pl.getTotalLength ? pl.getTotalLength() : 0;
      pl._len = Math.max(len, 1);
      pl.style.strokeDasharray = pl._len + " " + pl._len;
      pl.style.strokeDashoffset = pl._len;
    });
  }

  // Write the signature, stroke after stroke, over `ms` (default: a share of the real signing time).
  // opts.nib: a pen tip rides the line while it is written, then fades.
  // opts.onHead(point|null): called every frame with the writing point, in the SVG's own units.
  function write(svg, ms, opts) {
    opts = opts || {};
    var parts = Array.prototype.slice.call(svg.querySelectorAll("polyline"));
    if (!parts.length || !window.requestAnimationFrame) {
      parts.forEach(function (pl) { pl.style.strokeDashoffset = 0; });
      return Promise.resolve();
    }
    blank(svg);
    var run = svg._run;
    var total = 0;
    parts.forEach(function (pl) { total += pl._len; });
    var dur = ms || Math.min(Math.max(svg._took * 0.45, 1200), 3600);
    var gap = 70, at = 0;
    var plan = parts.map(function (pl) {
      var d = Math.max(dur * pl._len / total, 40), seg = { pl: pl, from: at, to: at + d };
      at += d + gap;
      return seg;
    });
    var end = at - gap;

    var nib = null;
    if (opts.nib) {
      nib = document.createElementNS(NS, "circle");
      nib.setAttribute("r", (svg._sw * 1.1).toFixed(1));
      nib.setAttribute("fill", svg._ink);
      nib.style.filter = "drop-shadow(0 0 " + (svg._sw * 1.2).toFixed(1) + "px " + svg._ink + ")";
      nib.style.transition = "opacity 300ms ease";
      svg.appendChild(nib);
      svg._nib = nib;
    }

    return new Promise(function (resolve) {
      var t0 = null;
      function frame(now) {
        if (svg._run !== run) return resolve();
        if (t0 === null) t0 = now;
        var t = now - t0, head = null;
        for (var i = 0; i < plan.length; i++) {
          var s = plan[i], p = t <= s.from ? 0 : t >= s.to ? 1 : (t - s.from) / (s.to - s.from);
          p = 0.5 - 0.5 * Math.cos(Math.PI * p); // a hand starts and ends a stroke slower than its middle
          s.pl.style.strokeDashoffset = s.pl._len * (1 - p);
          if (p > 0 && p < 1) head = s.pl.getPointAtLength(s.pl._len * p);
        }
        // Between strokes the pen is lifted, not gone: it waits where the last stroke ended.
        if (head) svg._head = head; else if (t < end) head = svg._head || null;
        if (nib && head) { nib.setAttribute("cx", head.x); nib.setAttribute("cy", head.y); nib.style.opacity = 1; }
        else if (nib) nib.style.opacity = 0;
        if (opts.onHead) opts.onHead(head);
        if (t < end) return requestAnimationFrame(frame);
        if (nib) setTimeout(function () { if (nib.parentNode) nib.remove(); }, 320);
        if (opts.onHead) opts.onHead(null);
        resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  // Sign a card again: the old ink fades, then the signature is written afresh. Never a jump to blank.
  function resign(svg, ms, opts) {
    if (svg._resigning) return svg._resigning;
    svg.style.transition = "opacity 280ms ease";
    svg.style.opacity = 0;
    svg._resigning = new Promise(function (r) { setTimeout(r, 300); }).then(function () {
      blank(svg);
      svg.style.transition = "none";
      svg.style.opacity = 1;
      return write(svg, ms, opts);
    }).then(function () { svg._resigning = null; });
    return svg._resigning;
  }

  // The numbers 0..n-1 in a random order.
  function shuffled(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)), t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }

  window.ClasowWall = { load: load, tile: tile, blank: blank, write: write, resign: resign, shuffled: shuffled, reduced: reduced };
})();
