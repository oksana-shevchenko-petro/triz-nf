/* ТРИЗ-НФ — графики (SVG без внешних библиотек). */
(function (root) {
  'use strict';
  var C = {
    s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100', s5: '#e87ba4', s6: '#008300', s7: '#4a3aa7', s8: '#e34948',
    text: '#1d1d1b', muted: '#5f5e5a', grid: '#e4e3de', axis: '#b9b8b1', bg: '#ffffff'
  };
  var SERIES = [C.s1, C.s2, C.s3, C.s4, C.s5, C.s6, C.s7, C.s8];
  var FONT = "Segoe UI, Arial, sans-serif";

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function niceStep(range, ticks) {
    var raw = range / Math.max(1, ticks), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function axisRange(min, max) {
    if (min === max) { max = min + 1; }
    var step = niceStep(max - min, 5);
    return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step: step };
  }
  function fmtTick(v) {
    var a = Math.abs(v);
    var s = a >= 1e9 ? (v / 1e9).toFixed(a % 1e9 ? 1 : 0) + ' млрд' : a >= 1e6 ? (v / 1e6).toFixed(a % 1e6 ? 1 : 0) + ' млн' : a >= 1e4 ? (v / 1e3).toFixed(0) + ' тыс' : (Math.round(v * 100) / 100).toString();
    return s.replace('.', ',');
  }

  function frame(o) {
    var W = o.width || 760, H = o.height || 320;
    return { W: W, H: H, L: o.left || 64, R: o.right || 16, T: o.top || (o.title ? 34 : 14), B: o.bottom || 44 };
  }

  function header(f, o) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f.W + ' ' + f.H + '" width="' + f.W + '" height="' + f.H + '" font-family="' + FONT + '" role="img">';
    s += '<rect width="100%" height="100%" fill="' + C.bg + '"/>';
    if (o.title) s += '<text x="' + f.L + '" y="20" font-size="14" font-weight="600" fill="' + C.text + '">' + esc(o.title) + '</text>';
    return s;
  }

  function yAxis(f, ax, o) {
    var s = '', ih = f.H - f.T - f.B;
    for (var v = ax.lo; v <= ax.hi + ax.step / 2; v += ax.step) {
      var y = f.T + ih - (v - ax.lo) / (ax.hi - ax.lo) * ih;
      s += '<line x1="' + f.L + '" x2="' + (f.W - f.R) + '" y1="' + y + '" y2="' + y + '" stroke="' + (Math.abs(v) < 1e-12 ? C.axis : C.grid) + '" stroke-width="1"/>';
      s += '<text x="' + (f.L - 6) + '" y="' + (y + 4) + '" font-size="11" text-anchor="end" fill="' + C.muted + '">' + esc((o.yFmt || fmtTick)(v)) + '</text>';
    }
    if (o.yTitle) s += '<text transform="translate(14,' + (f.T + ih / 2) + ') rotate(-90)" font-size="11" text-anchor="middle" fill="' + C.muted + '">' + esc(o.yTitle) + '</text>';
    return s;
  }

  function legend(f, series) {
    var s = '', x = f.L, y = f.H - 10;
    series.forEach(function (sr) {
      if (!sr.name) return;
      s += '<rect x="' + x + '" y="' + (y - 9) + '" width="12" height="' + (sr.dash ? 2 : 10) + '" fill="' + sr.color + '"' + (sr.dash ? ' transform="translate(0,4)"' : '') + '/>';
      s += '<text x="' + (x + 16) + '" y="' + y + '" font-size="11" fill="' + C.text + '">' + esc(sr.name) + '</text>';
      x += 26 + sr.name.length * 6.3;
    });
    return s;
  }

  /** Линейный график. o = {x:[подписи], series:[{name,color,values,dash}], title, yTitle, yFmt} */
  function line(o) {
    var f = frame(o), all = [];
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (isFinite(v)) all.push(v); }); });
    var ax = axisRange(Math.min(0, Math.min.apply(null, all.concat([0]))), Math.max.apply(null, all.concat([1e-9])));
    var iw = f.W - f.L - f.R, ih = f.H - f.T - f.B, n = o.x.length;
    var X = function (i) { return f.L + (n > 1 ? i / (n - 1) : 0.5) * iw; };
    var Y = function (v) { return f.T + ih - (v - ax.lo) / (ax.hi - ax.lo) * ih; };
    var s = header(f, o) + yAxis(f, ax, o);
    var every = Math.ceil(n / 12);
    o.x.forEach(function (lab, i) {
      if (i % every === 0 || i === n - 1) s += '<text x="' + X(i) + '" y="' + (f.H - f.B + 16) + '" font-size="11" text-anchor="middle" fill="' + C.muted + '">' + esc(lab) + '</text>';
    });
    o.series.forEach(function (sr) {
      var d = sr.values.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join('');
      s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '" stroke-width="2"' + (sr.dash ? ' stroke-dasharray="6 4"' : '') + ' stroke-linejoin="round"/>';
      if (n <= 30) sr.values.forEach(function (v, i) { s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.5" fill="' + sr.color + '"><title>' + esc(o.x[i] + ': ' + (o.tipFmt || fmtTick)(v)) + '</title></circle>'; });
    });
    s += legend(f, o.series) + '</svg>';
    return s;
  }

  /** Столбцы (сгруппированные или накопленные). o = {x, series, stacked, title, yTitle} */
  function bars(o) {
    var f = frame(o), n = o.x.length, k = o.series.length, mx = 0, mn = 0;
    for (var i = 0; i < n; i++) {
      if (o.stacked) { var p = 0, q = 0; o.series.forEach(function (s) { var v = s.values[i] || 0; if (v > 0) p += v; else q += v; }); mx = Math.max(mx, p); mn = Math.min(mn, q); }
      else o.series.forEach(function (s) { mx = Math.max(mx, s.values[i] || 0); mn = Math.min(mn, s.values[i] || 0); });
    }
    var ax = axisRange(mn, mx), iw = f.W - f.L - f.R, ih = f.H - f.T - f.B, bw = iw / n;
    var Y = function (v) { return f.T + ih - (v - ax.lo) / (ax.hi - ax.lo) * ih; };
    var s = header(f, o) + yAxis(f, ax, o), every = Math.ceil(n / 14);
    for (i = 0; i < n; i++) {
      var x0 = f.L + i * bw, pos = 0, neg = 0;
      o.series.forEach(function (sr, j) {
        var v = sr.values[i] || 0, x, w, y1, y2;
        if (o.stacked) { w = bw * 0.7; x = x0 + bw * 0.15; if (v >= 0) { y1 = Y(pos + v); y2 = Y(pos); pos += v; } else { y1 = Y(neg); y2 = Y(neg + v); neg += v; } }
        else { w = bw * 0.8 / k; x = x0 + bw * 0.1 + j * w; y1 = Y(Math.max(0, v)); y2 = Y(Math.min(0, v)); }
        s += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + Math.max(1, w - 1).toFixed(1) + '" height="' + Math.max(0, y2 - y1).toFixed(1) + '" fill="' + sr.color + '"><title>' + esc(o.x[i] + ', ' + sr.name + ': ' + (o.tipFmt || fmtTick)(v)) + '</title></rect>';
      });
      if (i % every === 0) s += '<text x="' + (x0 + bw / 2) + '" y="' + (f.H - f.B + 16) + '" font-size="11" text-anchor="middle" fill="' + C.muted + '">' + esc(o.x[i]) + '</text>';
    }
    if (o.lineSeries) o.lineSeries.forEach(function (sr) {
      var d = sr.values.map(function (v, j) { return (j ? 'L' : 'M') + (f.L + (j + 0.5) * bw).toFixed(1) + ',' + Y(v).toFixed(1); }).join('');
      s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '" stroke-width="2"/>';
    });
    s += legend(f, o.series.concat(o.lineSeries || [])) + '</svg>';
    return s;
  }

  /** «Торнадо» чувствительности ЧДД. */
  function tornado(o) {
    var f = frame(Object.assign({ left: 190, bottom: 30 }, o)), items = o.items.slice().sort(function (a, b) { return Math.abs(b.high - b.low) - Math.abs(a.high - a.low); });
    var vals = [o.base]; items.forEach(function (it) { vals.push(it.low, it.high); });
    var ax = axisRange(Math.min.apply(null, vals), Math.max.apply(null, vals));
    var iw = f.W - f.L - f.R, ih = f.H - f.T - f.B, rh = ih / items.length;
    var X = function (v) { return f.L + (v - ax.lo) / (ax.hi - ax.lo) * iw; };
    var s = header(f, o);
    for (var v = ax.lo; v <= ax.hi + ax.step / 2; v += ax.step) {
      s += '<line x1="' + X(v) + '" x2="' + X(v) + '" y1="' + f.T + '" y2="' + (f.H - f.B) + '" stroke="' + C.grid + '"/>';
      s += '<text x="' + X(v) + '" y="' + (f.H - f.B + 14) + '" font-size="11" text-anchor="middle" fill="' + C.muted + '">' + esc((o.fmt || fmtTick)(v)) + '</text>';
    }
    items.forEach(function (it, i) {
      var y = f.T + i * rh + rh * 0.2, h = rh * 0.6;
      [[it.low, C.s2, '−' + Math.round(o.delta * 100) + ' %'], [it.high, C.s1, '+' + Math.round(o.delta * 100) + ' %']].forEach(function (b) {
        var x1 = Math.min(X(o.base), X(b[0])), x2 = Math.max(X(o.base), X(b[0]));
        s += '<rect x="' + x1 + '" y="' + y + '" width="' + Math.max(1, x2 - x1) + '" height="' + h + '" fill="' + b[1] + '"><title>' + esc(it.name + ' ' + b[2] + ': ' + (o.fmt || fmtTick)(b[0])) + '</title></rect>';
      });
      s += '<text x="' + (f.L - 8) + '" y="' + (y + h / 2 + 4) + '" font-size="12" text-anchor="end" fill="' + C.text + '">' + esc(it.name) + '</text>';
    });
    s += '<line x1="' + X(o.base) + '" x2="' + X(o.base) + '" y1="' + (f.T - 4) + '" y2="' + (f.H - f.B) + '" stroke="' + C.text + '" stroke-width="1.5"/>';
    var lx = f.W - f.R - 190;
    s += '<rect x="' + lx + '" y="8" width="12" height="10" fill="' + C.s2 + '"/><text x="' + (lx + 16) + '" y="17" font-size="11" fill="' + C.text + '">−' + Math.round(o.delta * 100) + ' %</text>';
    s += '<rect x="' + (lx + 70) + '" y="8" width="12" height="10" fill="' + C.s1 + '"/><text x="' + (lx + 86) + '" y="17" font-size="11" fill="' + C.text + '">+' + Math.round(o.delta * 100) + ' %</text>';
    s += '</svg>';
    return s;
  }

  /** Схема скважины в плане: стволы, трещины, зона дренирования. */
  function wellPlan(well, sr, T) {
    var h = sr.props.h, segs = T.boreSegments(well, h), method = sr.method;
    var R = sr.details['Rэкв, м'] || 0;
    var fr = [];
    var fm = T.fam(well);
    if (method === 'A') {
      if (fm === 'mgrp') {
        var L = +well.L || 1000, n = Math.max(1, Math.round(+well.n || 1)), xf = +well.xf || 100;
        for (var i = 0; i < n; i++) { var x = -L / 2 + (i + 0.5) * L / n; fr.push([x, -xf, x, xf]); }
      } else if (fm === 'mzsfrac') {
        var ns = Math.max(1, Math.round(+well.nLat_st || 1)), xl = +well.xfLat || 60;
        segs.forEach(function (s) {
          var dx = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
          for (var j = 0; j < ns; j++) { var t = (j + 0.5) / ns, cx = s[0] + dx * t, cy = s[1] + dy * t; fr.push([cx - uy * xl, cy + ux * xl, cx + uy * xl, cy - ux * xl]); }
        });
      } else if (fm === 'vfrac') { var x2 = +well.xf || 80; fr.push([segs[0][2] / 2, -x2, segs[0][2] / 2, x2]); }
      else if (fm === 'gslong') { var xl2 = +well.xf || ((+well.L || 1000) / 2 + 20); fr.push([-xl2, 6, xl2, 6]); }
    }
    var pts = []; segs.concat(fr).forEach(function (s) { pts.push([s[0], s[1]], [s[2], s[3]]); });
    var pad = method === 'B' ? R : (method === 'A' ? Math.max(60, (+well.xf || 60) * 0.3, fm === 'vert' || fm === 'vfrac' ? 120 : 0) : 60);
    var x0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })) - pad, x1 = Math.max.apply(null, pts.map(function (p) { return p[0]; })) + pad;
    var y0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })) - pad, y1 = Math.max.apply(null, pts.map(function (p) { return p[1]; })) + pad;
    var W = 520, H = 300, sc = Math.min((W - 40) / (x1 - x0), (H - 50) / (y1 - y0));
    var X = function (x) { return 20 + (x - x0) * sc + ((W - 40) - (x1 - x0) * sc) / 2; };
    var Y = function (y) { return 30 + (y1 - y) * sc + ((H - 50) - (y1 - y0) * sc) / 2; };
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" font-family="' + FONT + '">';
    s += '<rect width="100%" height="100%" fill="#fbfbf9"/>';
    if (method === 'B' && R > 0) {
      s += '<g opacity="0.22">';
      segs.forEach(function (sg) { s += '<line x1="' + X(sg[0]) + '" y1="' + Y(sg[1]) + '" x2="' + X(sg[2]) + '" y2="' + Y(sg[3]) + '" stroke="' + C.s1 + '" stroke-width="' + (2 * R * sc) + '" stroke-linecap="round"/>'; });
      s += '</g>';
      s += '<text x="12" y="18" font-size="12" fill="' + C.text + '">Зона дренирования: Rэкв = ' + Math.round(R) + ' м, Sд = ' + T.fmt(sr.details['Sд (зона дренирования), га'], 1) + ' га</text>';
    } else if (method === 'A') {
      s += '<text x="12" y="18" font-size="12" fill="' + C.text + '">Работающая поверхность: Kнф = ' + T.fmt(sr.details['Kнф'], 3) + ' (Aэф/Aт)</text>';
    } else s += '<text x="12" y="18" font-size="12" fill="' + C.text + '">Пласт-полоса, полуширина w = ' + (sr.details['w, м'] || '') + ' м</text>';
    fr.forEach(function (f) { s += '<line x1="' + X(f[0]) + '" y1="' + Y(f[1]) + '" x2="' + X(f[2]) + '" y2="' + Y(f[3]) + '" stroke="' + C.s2 + '" stroke-width="2"/>'; });
    if (method === 'A' && fr.length && sr.details['Kнф'] < 1) {
      var k = sr.details['Kнф'];
      fr.forEach(function (f) {
        var mx = (f[0] + f[2]) / 2, my = (f[1] + f[3]) / 2;
        s += '<line x1="' + X(mx + (f[0] - mx) * k) + '" y1="' + Y(my + (f[1] - my) * k) + '" x2="' + X(mx + (f[2] - mx) * k) + '" y2="' + Y(my + (f[3] - my) * k) + '" stroke="' + C.s8 + '" stroke-width="5" opacity="0.8"/>';
      });
    }
    segs.forEach(function (sg) {
      s += '<line x1="' + X(sg[0]) + '" y1="' + Y(sg[1]) + '" x2="' + X(sg[2]) + '" y2="' + Y(sg[3]) + '" stroke="' + C.text + '" stroke-width="3" stroke-linecap="round"/>';
    });
    s += '<circle cx="' + X(segs[0][0]) + '" cy="' + Y(segs[0][1]) + '" r="5" fill="' + C.text + '"/>';
    // масштабная линейка
    var bar = niceStep(x1 - x0, 4), bx = W - 30 - bar * sc;
    s += '<line x1="' + bx + '" x2="' + (W - 30) + '" y1="' + (H - 14) + '" y2="' + (H - 14) + '" stroke="' + C.muted + '" stroke-width="2"/>';
    s += '<text x="' + (W - 30) + '" y="' + (H - 20) + '" font-size="11" text-anchor="end" fill="' + C.muted + '">' + bar + ' м</text>';
    var leg = method === 'A' && fr.length ? '<tspan fill="' + C.s2 + '">— трещины (проект)</tspan>' + (fr.length && sr.details['Kнф'] < 1 ? '  <tspan fill="' + C.s8 + '">— работающая часть</tspan>' : '') : '';
    if (leg) s += '<text x="12" y="' + (H - 10) + '" font-size="11">' + leg + '</text>';
    s += '</svg>';
    return s;
  }

  /** SVG → PNG (dataURL) для отчётов. */
  function toPng(svg, scale) {
    scale = scale || 2;
    return new Promise(function (resolve, reject) {
      var m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = m ? +m[1] : 760, h = m ? +m[2] : 320;
      var s2 = svg.replace(/^<svg[^>]*>/, function (tag) {
        return tag.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', '<svg width="' + w + '" height="' + h + '"');
      });
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve({ data: c.toDataURL('image/png'), w: w, h: h });
      };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s2);
    });
  }

  root.TRIZ_CHARTS = { line: line, bars: bars, tornado: tornado, wellPlan: wellPlan, toPng: toPng, COLORS: C, SERIES: SERIES, fmtTick: fmtTick };
}(typeof self !== 'undefined' ? self : this));
