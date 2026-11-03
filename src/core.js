/*
 * ТРИЗ-НФ — расчётное ядро.
 * Прогноз добычи нефти для залежей с трудноизвлекаемыми запасами
 * на основе нелинейного закона фильтрации (Шевченко О.Н.).
 * Правообладатель и автор математической модели: Шевченко Оксана Николаевна.
 *
 * Формулы (нумерация по диссертации «Математическая модель нефтеизвлечения
 * в условиях нелинейной фильтрации жидкости к горизонтальным скважинам»):
 *   H0(k)        — начальный градиент давления нефти, рис. 2.11;
 *   (3.36)–(3.39)— двучленное уравнение притока к ГС в пласте-полосе;
 *   (4.3)–(4.5)  — дебит ГС с МГРП с коэффициентом нелинейной фильтрации Kнф;
 *   (4.6а)       — эквивалентный радиус дренирования по пьезопроводности;
 *   (4.29)–(4.31)— дебит ГС при фильтрации с предельным градиентом;
 *   (4.26)–(4.28)— падение дебита с учётом упругоёмкости и подпитки;
 *   (4.32)       — доля подпитки от системы ППД;
 *   (4.33)–(4.34)— двухъёмная модель упругого режима;
 *   (4.35)–(4.36)— поправка на длину ствола и ограничение по насосу.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TRIZ = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.2.0';
  var DAY = 86400;
  var MONTH_DAYS = 365.25 / 12;
  var MD = 1e-15;           // 1 мД = 10⁻³ мкм² ≈ 1e-15 м² (как в диссертации)
  var MPA = 1e6;
  var MPAS = 1e-3;          // 1 мПа·с

  // Конструкции скважин. fam — расчётное семейство: vert — один ствол без ГРП; vfrac — ННС/БС с ГРП (одна или
  // несколько зон); gs — горизонтальный ствол без ГРП; gslong — ГС с продольной трещиной; mgrp — ГС/БГС с поперечными
  // трещинами МГРП; mzs — многозабойная без ГРП; mzsfrac — многозабойная с МГРП; fish — «рыбья кость»; radial — радиальное вскрытие.
  var TYPES = {
    VS:        { name: 'ВС',              full: 'Вертикальная скважина', fam: 'vert', methods: ['A', 'B'], decl: 'NNS' },
    NNS:       { name: 'ННС',             full: 'Наклонно-направленная скважина без ГРП', fam: 'vert', methods: ['A', 'B'], decl: 'NNS' },
    NNS_GRP:   { name: 'ННС с ГРП',       full: 'Наклонно-направленная скважина с ГРП', fam: 'vfrac', methods: ['A', 'B'], decl: 'NNS' },
    NNS_MGRP:  { name: 'ННС с МГРП',      full: 'Наклонно-направленная скважина с многозонным (многостадийным) ГРП', fam: 'vfrac', methods: ['A', 'B'], decl: 'NNS' },
    PS:        { name: 'Пологая скв.',    full: 'Пологая (субгоризонтальная) скважина', fam: 'vert', methods: ['A', 'B'], decl: 'NNS' },
    BS:        { name: 'БС (ЗБС)',        full: 'Боковой наклонный ствол (зарезка из существующей скважины)', fam: 'vert', methods: ['A', 'B'], decl: 'NNS', side: true },
    BS_GRP:    { name: 'БС с ГРП',        full: 'Боковой наклонный ствол с ГРП', fam: 'vfrac', methods: ['A', 'B'], decl: 'NNS', side: true },
    GS:        { name: 'ГС',              full: 'Горизонтальная скважина без ГРП', fam: 'gs', methods: ['B', 'C'], decl: 'GS', verified: 'B' },
    GS_WAVE:   { name: 'Волнообразная ГС', full: 'Горизонтальная скважина с волнообразным (синусоидальным) профилем', fam: 'gs', methods: ['B', 'C'], decl: 'GS' },
    GS_LONG:   { name: 'ГС с продольным ГРП', full: 'Горизонтальная скважина с продольной трещиной ГРП вдоль ствола', fam: 'gslong', methods: ['A', 'B'], decl: 'GS' },
    GS_MGRP:   { name: 'ГС с МГРП',       full: 'Горизонтальная скважина с многостадийным ГРП (поперечные трещины)', fam: 'mgrp', methods: ['A'], decl: 'GS', verified: 'A' },
    BGS:       { name: 'БГС (ЗБГС)',      full: 'Боковой горизонтальный ствол', fam: 'gs', methods: ['B', 'C'], decl: 'GS', side: true },
    BGS_MGRP:  { name: 'БГС с МГРП',      full: 'Боковой горизонтальный ствол с многостадийным ГРП', fam: 'mgrp', methods: ['A'], decl: 'GS', side: true },
    MZS:       { name: 'МЗС',             full: 'Многозабойная (многоствольная) скважина без ГРП', fam: 'mzs', methods: ['B', 'C'], decl: 'GS' },
    MZS_MGRP:  { name: 'МЗС с МГРП',      full: 'Многозабойная скважина с многостадийным ГРП на стволах', fam: 'mzsfrac', methods: ['A', 'B'], decl: 'GS' },
    FISHBONE:  { name: 'Фишбон',          full: 'Многоствольная скважина типа «рыбья кость»', fam: 'fish', methods: ['A', 'B'], decl: 'GS' },
    RADIAL:    { name: 'Радиальное вскрытие', full: 'Скважина с радиальными каналами (радиальное вскрытие пласта)', fam: 'radial', methods: ['A', 'B'], decl: 'NNS' }
  };
  var LEGACY_TYPES = { MZS_KGRP: 'MZS_MGRP' };
  function fam(well) { var t = TYPES[well.type] || TYPES[LEGACY_TYPES[well.type]] || TYPES.GS; return t.fam; }
  var METHODS = {
    A: 'Метод A — эффективная поверхность фильтрации, Kнф = min{1; (Aэф/Aт)^γ}, (4.3)–(4.5)',
    B: 'Метод B — закон фильтрации с предельным градиентом и эквивалентный радиус дренирования, (4.29)–(4.31)',
    C: 'Метод C — двучленное уравнение притока к ГС в пласте-полосе, (3.36)–(3.39)',
    F: 'Стартовый дебит задан пользователем (фактический или по аналогу); падение и экономика — по формулам программы'
  };

  function num(v, d) { var x = Number(v); return (v === '' || v === null || v === undefined || !isFinite(x)) ? d : x; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* ------------------------------------------------------------------ */
  /* Свойства пласта и флюида                                            */
  /* ------------------------------------------------------------------ */

  /** Начальный градиент давления нефти по керну (рис. 2.11): H0 = −0,233 ln k + 0,4889, МПа/м; k в 10⁻³ мкм². */
  function initialGradient(k_mD) {
    if (!(k_mD > 0) || k_mD >= 8) return 0;           // при k ≥ 7–8·10⁻³ мкм² действует закон Дарси
    return Math.max(0, -0.233 * Math.log(k_mD) + 0.4889);
  }

  /** Инерционный коэффициент b = β·ρ, Па·с²/м³, закон Форхгеймера grad p = (μ/k)·v + b·v².
   *  β = 0,005/(k^0,5·m^5,5), β в м⁻¹ при k в м² (размерно согласованная формула; m – пористость, доли ед.):
   *  Geertsma J. Estimating the coefficient of inertial resistance in fluid flow through porous media //
   *  SPE Journal. 1974. Vol. 14, No. 5. P. 445–450. DOI 10.2118/4706-PA.
   *  Для метода C коэффициент C = b относится к n = 2. Прежняя корреляция b ∝ k^−1,5 (опорная точка по пласту Б2) заменена (круг 4). */
  function forchheimerB(k_m2, m, rho_kgm3) {
    var phi = clamp(num(m, 0.2), 0.01, 0.6), rho = num(rho_kgm3, 850);
    return 0.005 / (Math.sqrt(k_m2) * Math.pow(phi, 5.5)) * rho;
  }

  /** Упругоёмкость β* = m·βж + βс, 1/МПа (по умолчанию – пласт АС3: m = 0,18 и βж = 1,8·10⁻³ по табл. П4.1, βс = 0,076·10⁻³ по табл. П3.1). */
  function betaStar(r) { return num(r.m, 0.18) * num(r.betaL, 1.8e-3) + num(r.betaR, 0.076e-3); }

  /** Пьезопроводность χ = k/(μ·β*), м²/с. */
  function piezo(r, k_mD, mu) {
    if (r.chiMode === 'input') return num(r.chi, 1e-3);
    return (k_mD * MD) / (mu * MPAS * betaStar(r) / MPA);
  }

  /** Эффективные (с учётом переопределений группы скважин) свойства. */
  function props(well, res) {
    var k = num(well.k, num(res.k, 1));
    var h = num(well.h, num(res.h, 8));
    var dP = num(well.dP, num(res.Pres, 20) - num(res.Pwf, 10));
    var mu = num(res.mu, 1);
    return { k: k, h: h, dP: dP, mu: mu, B: num(res.B, 1.1), rho: num(res.rho, 0.85) };
  }

  /* ------------------------------------------------------------------ */
  /* Эквивалентный радиус дренирования                                    */
  /* ------------------------------------------------------------------ */

  /** (4.29б): положительный корень π·R² + 2L·R − Sд = 0. */
  function rekvFromArea(L, Sd) { return (Math.sqrt(L * L + Math.PI * Sd) - L) / Math.PI; }
  /** (4.6а): R = 2·√(χt/1,781) ≈ 1,50·√(χt). */
  var KR_THEORY = 2 / Math.sqrt(Math.exp(0.5772));

  function rekv(res, L, chi) {
    if (res.RekvMode === 'grid') {
      var Sd = num(res.spacingA, 500) * num(res.spacingB, 500);
      return { R: rekvFromArea(L, Sd), how: '(4.29б), Sд = ' + fmt(Sd / 1e4, 1) + ' га' };
    }
    var t = num(res.tR, 30) * DAY;
    var KR = num(res.KR, 6.07);
    return { R: KR * Math.sqrt(chi * t), how: 'Rэкв = KR·√(χt), KR = ' + fmt(KR, 2) + ', t = ' + num(res.tR, 30) + ' сут' };
  }

  /* ------------------------------------------------------------------ */
  /* Геометрия стволов в плане (для метода B)                            */
  /* ------------------------------------------------------------------ */

  function boreSegments(well, h) {
    var segs = [], f = fam(well), L = num(well.L, 1000), i;
    if (f === 'vert' || f === 'vfrac') {
      var a = (well.type === 'VS' ? 0 : num(well.alpha, well.type === 'PS' ? 80 : 30)) * Math.PI / 180;
      var lp = h * Math.tan(clamp(a, 0, 1.55));
      segs.push([0, 0, lp, 0]);
    } else if (f === 'gs' || f === 'gslong' || f === 'mgrp') {
      segs.push([-L / 2, 0, L / 2, 0]);
    } else if (f === 'fish') {
      segs.push([-L / 2, 0, L / 2, 0]);
      var N = Math.max(0, Math.round(num(well.nRib, 0)));
      var lr = num(well.lRib, 100), th = num(well.ribAngle, 45) * Math.PI / 180;
      var pairs = well.ribLayout !== 'alternate';
      var stations = pairs ? Math.ceil(N / 2) : N;
      var made = 0;
      for (i = 0; i < stations && made < N; i++) {
        var x = -L / 2 + (i + 0.5) * L / stations;
        var sides = pairs ? [1, -1] : [(i % 2 === 0) ? 1 : -1];
        for (var s = 0; s < sides.length && made < N; s++, made++)
          segs.push([x, 0, x + lr * Math.cos(th), sides[s] * lr * Math.sin(th)]);
      }
    } else if (f === 'mzs' || f === 'mzsfrac') {
      var Nl = Math.max(1, Math.round(num(well.nLat, 2)));
      var Ll = num(well.Llat, 500), da = num(well.latAngle, 30) * Math.PI / 180;
      for (i = 0; i < Nl; i++) {
        var ang = (i - (Nl - 1) / 2) * da;
        segs.push([0, 0, Ll * Math.cos(ang), Ll * Math.sin(ang)]);
      }
    } else if (f === 'radial') {
      var Nr = Math.max(1, Math.round(num(well.nCh, 4))), lc = num(well.lCh, 100);
      for (i = 0; i < Nr; i++) { var an = 2 * Math.PI * i / Nr; segs.push([0, 0, lc * Math.cos(an), lc * Math.sin(an)]); }
    }
    return segs;
  }
  function distSeg(px, py, s) {
    var dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy, u = 0;
    if (l2 > 0) u = clamp(((px - s[0]) * dx + (py - s[1]) * dy) / l2, 0, 1);
    var qx = s[0] + u * dx - px, qy = s[1] + u * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }

  /** Площадь объединения полос шириной 2R вокруг стволов (численно, с поправкой на сетку). */
  function unionArea(segs, R, nGrid) {
    nGrid = nGrid || 360;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, i, j, k;
    segs.forEach(function (s) {
      x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]);
      y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]);
    });
    x0 -= R; x1 += R; y0 -= R; y1 += R;
    var dx = (x1 - x0) / nGrid, dy = (y1 - y0) / nGrid, cnt = 0, cnt0 = 0;
    for (i = 0; i < nGrid; i++) {
      var px = x0 + (i + 0.5) * dx;
      for (j = 0; j < nGrid; j++) {
        var py = y0 + (j + 0.5) * dy, inside = false;
        if (distSeg(px, py, segs[0]) <= R) { cnt0++; inside = true; }
        for (k = 1; !inside && k < segs.length; k++) if (distSeg(px, py, segs[k]) <= R) inside = true;
        if (inside) cnt++;
      }
    }
    var s0 = segs[0], L0 = Math.hypot(s0[2] - s0[0], s0[3] - s0[1]);
    var exact0 = 2 * L0 * R + Math.PI * R * R;
    var corr = cnt0 > 0 ? exact0 / (cnt0 * dx * dy) : 1;
    return cnt * dx * dy * corr;
  }

  /* ------------------------------------------------------------------ */
  /* Метод B: (4.29)–(4.31)                                              */
  /* ------------------------------------------------------------------ */

  /** Скорость фильтрации из закона grad P − G = (μ/k)·v + b·v², м/с; dg в Па/м. */
  function velocity(muk, b, dg) {
    if (dg <= 0) return 0;
    if (!(b > 0)) return dg / muk;
    return (-muk + Math.sqrt(muk * muk + 4 * b * dg)) / (2 * b);
  }

  function methodB(well, res, p, warn) {
    var kSI = p.k * MD, muSI = p.mu * MPAS;
    var chi = piezo(res, p.k, p.mu);
    var segs = boreSegments(well, p.h);
    var L0 = Math.hypot(segs[0][2] - segs[0][0], segs[0][3] - segs[0][1]);
    var R0 = rekv(res, L0, chi);
    var R = R0.R;
    var Leq = L0, Su = null;
    if (segs.length > 1) {
      Su = unionArea(segs, R);
      Leq = Math.max(0, (Su - Math.PI * R * R) / (2 * R));
    } else Su = 2 * L0 * R + Math.PI * R * R;
    var b = res.bMode === 'input' ? num(res.b, 0) : forchheimerB(kSI, res.m, p.rho * 1000);
    if (well.b !== undefined && well.b !== '' && well.b !== null) b = num(well.b, b);
    var G = res.Gmode === 'input' ? num(res.G, 0) : initialGradient(p.k);   // МПа/м
    var dg;
    if (res.dgMode === 'dp') {
      dg = (p.dP / R - G);
      if (dg <= 0) warn.push('Действующий градиент ΔP/Rэкв − G ≤ 0: фильтрация на контуре дренирования не начинается (G = ' + fmt(G, 3) + ' МПа/м). Задайте градиент по скважинам-аналогам.');
    } else dg = num(res.dg, 0.0398);
    var muk = muSI / kSI;
    var v = velocity(muk, b, dg * MPA);
    var Rbig = Leq / 2 + R, r = p.h / 2, F = 2 * Math.PI * Rbig * r;
    var Q = DAY * v * F / p.B;
    if (res.RekvMode !== 'grid' && res.KR === undefined) warn.push('KR не задан — принято 6,07 (пласт Б2).');
    return {
      Q: Q,
      d: {
        'χ, м²/с': chi, 'Rэкв, м': R, 'способ Rэкв': R0.how, 'Lэкв по оси, м': Leq,
        'Sд (зона дренирования), га': Su / 1e4, 'R = L/2 + Rэкв, м': Rbig, 'r = h/2, м': r, 'F = 2πRr, м²': F,
        'G, МПа/м': G, '(grad P − G), МПа/м': dg, 'μ/k, Па·с/м²': muk, 'b, Па·с²/м³': b,
        'v, м/с': v, 'b·v², Па/м': b * v * v, '(μ/k)·v, Па/м': muk * v
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Метод A: (4.3)–(4.5), (4.35), (4.36)                                */
  /* ------------------------------------------------------------------ */

  /** Дебит по Дарси к n поперечным трещинам ствола длиной L, (4.3), м³/сут. */
  function darcyFractures(n, xf, L, p, S) {
    var s = L / n, Rd = Math.sqrt(s * (s + 2 * xf) / Math.PI), rf = xf / 2;
    var q = n * 2 * Math.PI * p.k * MD * p.h * p.dP * MPA / (p.mu * MPAS * (Math.log(Rd / rf) + S)) * DAY / p.B;
    return { Q: q, s: s, Rd: Rd, rf: rf, ratio: Rd / rf };
  }

  /** Псевдоскин наклонного ствола по Cinco-Ley (θ ≤ 75°), kv/kh — анизотропия. */
  function slantSkin(alphaDeg, h, rw, kvkh) {
    var a = clamp(alphaDeg, 0, 75) * Math.PI / 180, an = Math.sqrt(kvkh);
    var th = Math.atan(an * Math.tan(a)) * 180 / Math.PI;
    if (th < 0.5) return 0;
    var hD = (h / rw) / an;
    return -Math.pow(th / 41, 2.06) - Math.pow(th / 56, 1.865) * Math.log10(hD / 100);
  }

  function dupuit(p, kh, Rk, rEff, S) {
    return 2 * Math.PI * p.k * MD * kh * p.dP * MPA / (p.mu * MPAS * (Math.log(Rk / rEff) + S)) * DAY / p.B;
  }

  function methodA(well, res, p, warn) {
    var f = fam(well), t = well.type, S = num(well.S, 0), rw = num(well.rw, 0.084);
    var Aef = num(res.Aef, 2843), gam = num(res.gamma, 1);
    var QD = 0, At = 0, parts = [], d = {}, i;
    var Rk = num(res.Rk, 250), kvkh = num(res.kvkh, 1);
    var alpha = t === 'VS' ? 0 : num(well.alpha, t === 'PS' ? 80 : 30);
    if (f === 'vert') {
      var Sth = slantSkin(alpha, p.h, rw, kvkh);
      if (alpha > 75) warn.push('Зенитный угол > 75°: псевдоскин по Cinco-Ley рассчитан для 75°; для пологих скважин метод B точнее.');
      QD = dupuit(p, p.h, Rk, rw, S + Sth);
      At = 2 * Math.PI * rw * p.h / Math.max(0.05, Math.cos(clamp(alpha, 0, 87) * Math.PI / 180));
      d['rс, м'] = rw; d['Rк, м'] = Rk; d['псевдоскин наклона Sθ'] = Sth;
    } else if (f === 'vfrac') {
      var xf = num(well.xf, 80), rf = xf / 2, nz = t === 'NNS_MGRP' ? Math.max(1, Math.round(num(well.nZ, 3))) : 1;
      var Kr = Math.max(1, Math.round(num(res.nLayers, 1))), hc = p.h * Math.min(1, nz / Kr);
      if (Rk / rf < 1.2) warn.push('Rк/rf < 1,2 — формула теряет смысл; увеличьте Rк.');
      QD = dupuit(p, hc, Rk, rf, S) + (p.h - hc > 1e-9 ? dupuit(p, p.h - hc, Rk, rw, S + slantSkin(alpha, p.h, rw, kvkh)) : 0);
      At = 2 * xf * hc;
      d['rf = xf/2, м'] = rf; d['Rк, м'] = Rk; d['число зон ГРП'] = nz; d['охваченная трещинами толщина, м'] = hc;
    } else if (f === 'gslong') {
      var L = num(well.L, 1000), xl = num(well.xf, L / 2 + 20), rfl = xl / 2;
      var Sd = num(res.spacingA, 500) * num(res.spacingB, 500), Rd = Math.sqrt(Sd / Math.PI);
      if (Rd / rfl < 1.2) warn.push('Rd/rf = ' + fmt(Rd / rfl, 2) + ' < 1,2: площадь дренирования мала для трещины длиной ' + fmt(2 * xl, 0) + ' м — увеличьте сетку скважин.');
      QD = dupuit(p, p.h, Rd, rfl, S);
      At = 2 * xl * p.h;
      d['xf (вдоль ствола), м'] = xl; d['rf = xf/2, м'] = rfl; d['Rd = √(Sд/π), м'] = Rd;
    } else if (f === 'radial') {
      var Nc = Math.max(1, Math.round(num(well.nCh, 4))), lc = num(well.lCh, 100), m = Math.max(1, Math.round(num(well.nLev, 1))), rch = num(well.rCh, 0.025);
      var rEff = lc * Math.pow(4, -1 / Nc);                       // логарифмическая ёмкость «звезды» из Nc лучей
      var Sc = Math.max(0, (p.h / (m * Nc * lc)) * Math.log((p.h / m) / (2 * Math.PI * rch)));
      if (Rk / rEff < 1.2) warn.push('Rк/rэфф < 1,2 — увеличьте Rк.');
      QD = dupuit(p, p.h, Rk, rEff, S + Sc);
      At = Nc * lc * p.h;
      d['rэфф = l·4^(−1/N), м'] = rEff; d['скин схождения каналов'] = Sc; d['Rк, м'] = Rk;
    } else {
      var bores = [];
      if (f === 'mgrp') bores.push({ n: num(well.n, 10), xf: num(well.xf, 100), L: num(well.L, 1000), S: S });
      else if (f === 'mzsfrac') {
        var Nl = Math.max(1, Math.round(num(well.nLat, 2)));
        for (i = 0; i < Nl; i++) bores.push({ n: num(well.nLat_st, 4), xf: num(well.xfLat, 60), L: num(well.Llat, 500), S: S });
      } else if (f === 'fish') {
        var N = Math.max(1, Math.round(num(well.nRib, 10)));
        var pr = num(well.lRib, 100) * Math.sin(num(well.ribAngle, 45) * Math.PI / 180);
        var Sconv = Math.max(0, (p.h / (2 * pr)) * Math.log(p.h / (2 * Math.PI * rw)));
        bores.push({ n: N / 2, xf: pr, L: num(well.L, 1000), S: S + Sconv });
        d['проекция ответвления p = l·sinθ, м'] = pr; d['скин схождения ответвления'] = Sconv;
      } else {
        warn.push('Для горизонтальных и многозабойных стволов без ГРП метод A не применяется — используйте метод B или C.');
        return { Q: 0, d: d };
      }
      bores.forEach(function (b, j) {
        var r = darcyFractures(b.n, b.xf, b.L, p, b.S);
        QD += r.Q; At += 2 * b.n * b.xf * p.h;
        parts.push(r);
        if (r.ratio < 1.2) warn.push('Ствол ' + (j + 1) + ': Rd/rf = ' + fmt(r.ratio, 2) + ' < 1,2 — трещины слишком сближены, формула (4.3) теряет смысл.');
      });
      d['s = L/n, м'] = parts[0].s; d['Rd, м'] = parts[0].Rd; d['rf, м'] = parts[0].rf; d['Rd/rf'] = parts[0].ratio;
    }
    var AefW = Aef;
    if (f === 'mzsfrac') {
      var Nl2 = Math.max(1, Math.round(num(well.nLat, 2)));
      AefW = Aef * (1 + (Nl2 - 1) * clamp(num(well.Kint, 0), 0, 1));
      d['Kи (независимость стволов)'] = clamp(num(well.Kint, 0), 0, 1);
    }
    var Knf = Math.min(1, Math.pow(AefW / At, gam));
    var Q = Knf * QD;
    if (f === 'mgrp' && well.lenCorr) {
      var A35 = num(res.Aef35, 1050), g35 = num(res.gamma35, 0.71);
      Q = Math.min(QD, A35 * Math.pow(num(well.L, 1000) / 1000, g35) * QD / At);
      d['поправка (4.35)'] = 'Aэф = ' + A35 + ' м², γ = ' + g35;
    }
    d['QД (Дарси), м³/сут'] = QD; d['Aт, м²'] = At; d['Aэф скважины, м²'] = AefW; d['Kнф'] = Knf;
    return { Q: Q, d: d };
  }
  /* ------------------------------------------------------------------ */
  /* Метод C: (3.36)–(3.39) — пласт-полоса                               */
  /* ------------------------------------------------------------------ */

  /** ln(ch x − c) без переполнения. */
  function lnChMinus(x, c) {
    x = Math.abs(x);
    if (c === 1) {                                  // ch x − 1 = 2 sh²(x/2)
      if (x < 30) { var sh = Math.sinh(x / 2); return Math.log(2 * sh * sh); }
      return x - Math.log(2) + Math.log(1 - 2 * Math.exp(-x) + Math.exp(-2 * x));
    }
    if (x < 30) return Math.log(Math.cosh(x) - c);
    return x - Math.log(2) + Math.log(1 + Math.exp(-2 * x) - 2 * c * Math.exp(-x));
  }

  /** Φ(r) решения для закона Дарси в пласте-полосе (раздел 3.2). */
  function stripPhi(r, w, h, h2) {
    var c = Math.cos(2 * Math.PI * h2 / h);
    return lnChMinus(Math.PI * w / h, c) - lnChMinus(Math.PI * r / h, c) + lnChMinus(Math.PI * w / h, 1) - lnChMinus(Math.PI * r / h, 1);
  }

  /** Депрессия, необходимая для удельного притока q, м²/с, по (3.36), Па. */
  function stripDp(q, o) {
    var wst = Math.pow(o.mu / (o.k * o.C), 1 / (o.n - 1));
    var rs = Math.max(o.rw, q / (2 * Math.PI * wst));
    rs = Math.min(rs, 0.99 * Math.min(o.h2, o.h - o.h2, o.w));
    var lin = o.mu * stripPhi(rs, o.w, o.h, o.h2) / (4 * Math.PI * o.k) * q;
    var non = o.C > 0 && rs > o.rw ? o.C * Math.pow(q / (2 * Math.PI), o.n) * (Math.pow(rs, 1 - o.n) - Math.pow(o.rw, 1 - o.n)) / (1 - o.n) : 0;
    return { dp: lin + non, rs: rs, wst: wst };
  }

  function stripQ(L, h2, o, dpt) {
    o = Object.assign({}, o, { h2: h2 });
    var lo = 0, hi = 1e-6, it = 0;
    while (stripDp(hi, o).dp < dpt && it++ < 200) hi *= 2;
    for (it = 0; it < 200; it++) { var mid = (lo + hi) / 2; if (stripDp(mid, o).dp < dpt) lo = mid; else hi = mid; }
    var q = (lo + hi) / 2;
    return { q: q, st: stripDp(q, o), h2: h2 };
  }

  function methodC(well, res, p, warn) {
    var f = fam(well);
    var o = {
      mu: p.mu * MPAS, k: p.k * MD, h: p.h, w: num(res.w, 250), rw: num(well.rw, 0.084),
      n: num(res.nPow, 2), C: res.bMode === 'input' ? num(res.b, 0) : forchheimerB(p.k * MD, res.m, p.rho * 1000)
    };
    var h2 = num(well.h2, p.h / 2);
    if (h2 <= o.rw || h2 >= o.h - o.rw) { h2 = o.h / 2; warn.push('Положение ствола h₂ вне пласта — принято h/2.'); }
    var dpt = p.dP * MPA, L = f === 'mzs' ? num(well.Llat, 500) : num(well.L, 1000), d = {};
    var positions = [h2];
    if (well.type === 'GS_WAVE') {
      var amp = clamp(num(well.amp, p.h * 0.6), 0, p.h - 4 * o.rw);
      positions = [];
      for (var i = 0; i < 7; i++) positions.push(p.h / 2 - amp / 2 + amp * i / 6);
      d['амплитуда волны, м'] = amp;
    }
    var sols = positions.map(function (y) { return stripQ(L, y, o, dpt); });
    var q = sols.reduce(function (a, s) { return a + s.q; }, 0) / sols.length, st = sols[Math.floor(sols.length / 2)].st;
    var Q = q * L * DAY / p.B;
    if (f === 'mzs') {
      var N = Math.max(1, Math.round(num(well.nLat, 2))), Ki = clamp(num(well.Kint, 0.5), 0, 1);
      Q *= 1 + (N - 1) * Ki;
      d['стволов × Kи'] = N + ' × ' + fmt(Ki, 2);
    }
    var linOnly = dpt / (o.mu * stripPhi(o.rw, o.w, o.h, positions[Math.floor(positions.length / 2)]) / (4 * Math.PI * o.k)) * L * DAY / p.B;
    Object.assign(d, { 'q (на 1 м ствола), м²/с': q, 'ω*, м/с': st.wst, 'r*, м': st.rs, 'Φ(r*)': stripPhi(st.rs, o.w, o.h, positions[Math.floor(positions.length / 2)]), 'C, Па·с²/м³': o.C, 'n': o.n, 'w, м': o.w, 'h₂, м': positions.length > 1 ? 'от ' + fmt(positions[0], 2) + ' до ' + fmt(positions[positions.length - 1], 2) : positions[0], 'Q по Дарси (C → 0), м³/сут': linOnly });
    return { Q: Q, d: d };
  }
  /* ------------------------------------------------------------------ */
  /* Стартовый дебит                                                      */
  /* ------------------------------------------------------------------ */

  function chooseMethod(well, res) {
    if (LEGACY_TYPES[well.type]) well.type = LEGACY_TYPES[well.type];
    if (well.type === 'NNS' && well.frac) { well.type = 'NNS_GRP'; delete well.frac; }
    var avail = TYPES[well.type].methods, f = fam(well);
    if (well.method && well.method !== 'auto' && avail.indexOf(well.method) >= 0) return well.method;
    var mu = num(res.mu, 1);
    if (f === 'gs' || f === 'mzs') return mu >= 30 ? 'B' : 'C';
    if (f === 'mgrp') return 'A';
    if (mu >= 30 && avail.indexOf('B') >= 0) return 'B';
    return avail[0];
  }
  /**
   * Доля нефтенасыщенной толщины, дренируемая стволом, в расчленённом пласте из Kр пропластков,
   * разделённых непроницаемыми прослоями (Kр = 1 — однородный пласт). Трещины ГРП принимаются
   * пересекающими прослои; горизонтальный ствол, ответвления и каналы дренируют свой пропласток.
   */
  function coverage(well, res) {
    var Kr = Math.max(1, Math.round(num(res.nLayers, 1))), f = fam(well), t = well.type;
    if (Kr === 1) return 1;
    if (t === 'GS_WAVE') { var cov = clamp(num(well.amp, 0) / num(well.h, num(res.h, 8)), 0, 1); return 1 / Kr + (1 - 1 / Kr) * cov; }
    if (f === 'gs' || f === 'fish') return 1 / Kr;
    if (f === 'mzs' || f === 'radial') return Math.min(1, Math.max(1, Math.round(num(well.nLev, 1))) / Kr);
    return 1;
  }

  function startRate(well, res) {
    var warn = [], method = chooseMethod(well, res), p = props(well, res);
    var cov = coverage(well, res);
    if (cov < 1) { p.hFull = p.h; p.h = p.h * cov; }
    var r;
    if (num(well.Qset, 0) > 0) {                       // стартовый дебит задан по факту / по аналогу
      method = 'F';
      r = { Q: num(well.Qset, 0), d: { 'Qж₀ задан (факт, аналог), м³/сут': num(well.Qset, 0) } };
    } else r = method === 'A' ? methodA(well, res, p, warn) : method === 'B' ? methodB(well, res, p, warn) : methodC(well, res, p, warn);
    var Q = r.Q, limited = false;
    if (well.pumpOn) {
      var lim = num(well.cn, 1.38) * num(well.Qnom, 100);
      if (Q > lim) { Q = lim; limited = true; }
      r.d['ограничение по насосу (4.36), м³/сут'] = lim;
    }
    if (p.k >= 8 && method === 'A' && !(num(well.Qset, 0) > 0)) warn.push('k ≥ 8·10⁻³ мкм²: по данным керна (глава 2) фильтрация линейная, Kнф может быть завышен — проверьте по аналогам.');
    if (num(res.mu, 1) < 30 && method === 'B') warn.push('μ < 30 мПа·с: метод B разработан для структурированной (высоковязкой) нефти; KR и градиент задайте по аналогам.');
    var fw0 = clamp(num(well.fw0, 0), 0, 99.9) / 100;
    return {
      method: method, methodName: METHODS[method],
      Qliq: Q, Qoil: Q * (1 - fw0) * p.rho, QoilM3: Q * (1 - fw0), fw0: fw0,
      pumpLimited: limited, details: (cov < 1 ? Object.assign({ 'дренируемая доля толщины': cov }, r.d) : r.d), warnings: warn, props: p
    };
  }

  /* ------------------------------------------------------------------ */
  /* Падение дебита: (4.26), (4.32), (4.34)                              */
  /* ------------------------------------------------------------------ */

  /** Относительный дебит f(t) = a·e^(−t/τ₁) + (1−a)·e^(−t/τ₂); τ₂ = ∞ → (4.26) с φ = 1 − a. */
  function declineF(t, a, t1, t2) {
    var f = a * Math.exp(-t / t1);
    f += (1 - a) * (isFinite(t2) && t2 > 0 ? Math.exp(-t / t2) : 1);
    return f;
  }
  /** Накопленная относительная добыча ∫f dt, сут. */
  function declineN(t, a, t1, t2) {
    var n = a * t1 * (1 - Math.exp(-t / t1));
    n += (1 - a) * (isFinite(t2) && t2 > 0 ? t2 * (1 - Math.exp(-t / t2)) : t);
    return n;
  }
  /** (4.32): φ ≈ 0,08 + 0,12·k (k в 10⁻³ мкм², оценочно для k = 1,2–4,3). */
  function phiPPD(k_mD) { return clamp(0.08 + 0.12 * k_mD, 0, 0.95); }

  /** Объём, отвечающий за упругий запас: VSRV = 2xf·h·L (трещины) или Vу = h·(2L·Rэкв + πRэкв²) (4.7). */
  function drainVolume(well, res, sr) {
    var p = sr.props, f = fam(well);
    if (f === 'mgrp') return 2 * num(well.xf, 100) * p.h * num(well.L, 1000);
    if (f === 'mzsfrac') return Math.max(1, Math.round(num(well.nLat, 2))) * 2 * num(well.xfLat, 60) * p.h * num(well.Llat, 500);
    if (f === 'fish') return 2 * num(well.lRib, 100) * Math.sin(num(well.ribAngle, 45) * Math.PI / 180) * p.h * num(well.L, 1000);
    if (f === 'vfrac') return 2 * num(well.xf, 80) * (sr.details['охваченная трещинами толщина, м'] || p.h) * 2 * num(well.xf, 80);
    if (f === 'radial') return Math.PI * Math.pow(num(well.lCh, 100), 2) * p.h;
    var R = sr.details['Rэкв, м'] || num(res.Rk, 250), L = sr.details['Lэкв по оси, м'];
    if (L === undefined) L = (f === 'vert') ? 0 : (f === 'mzs' ? num(well.Llat, 500) * Math.max(1, Math.round(num(well.nLat, 2))) : num(well.L, 1000));
    return p.h * (2 * L * R + Math.PI * R * R);
  }
  /** (4.26): τ = β*·KV·V·ΔP/(B·Q0), сут. */
  function tauCalc(well, res, sr) {
    var V = drainVolume(well, res, sr);
    return betaStar(res) * num(res.KV, 0.76) * V * sr.props.dP / (sr.props.B * Math.max(1e-6, sr.Qliq));
  }

  /** Параметры падения для сценария: {liq:{a,t1,t2}, oil:{a,t1,t2}}. */
  function declineParams(well, res, sr, scenario) {
    var D = well.decl || {};
    function pick(phase) {
      if (scenario === 'ppd') {
        var P = (D.ppd && D.ppd[phase]) || {};
        var phi = P.phiMode === '4.32' ? phiPPD(sr.props.k) : num(P.phi, 0.29);
        var tau = P.tauMode === 'calc' ? tauCalc(well, res, sr) : num(P.tau, 127);
        return { a: 1 - phi, t1: tau, t2: Infinity, phi: phi };
      }
      var N = (D.noppd && D.noppd[phase]) || {};
      var t1 = N.tauMode === 'calc' ? tauCalc(well, res, sr) : num(N.t1, 105);
      var t2 = num(N.t2, 1462);
      return { a: clamp(num(N.a, 0.71), 0, 1), t1: t1, t2: t2 > 0 ? t2 : Infinity };
    }
    var liq = pick('liq');
    var oil = (D.sameOil) ? liq : pick('oil');
    return { liq: liq, oil: oil };
  }

  /** Извлекаемые запасы нефти на скважину, т: Sд·h·m·Sн·ρ/B·КИН. */
  function wellReserves(well, res) {
    var p = props(well, res);
    var Sd = num(res.spacingA, 500) * num(res.spacingB, 500);
    return Sd * p.h * num(res.m, 0.2) * num(res.So, 0.6) * p.rho / p.B * num(res.KIN, 0.25);
  }

  /** Помесячный профиль одной скважины (с первого месяца работы). */
  function wellProfile(well, res, scenario, months, opts) {
    opts = opts || {};
    var sr = startRate(well, res);
    var dp = declineParams(well, res, sr, scenario);
    var Ke = num(opts.Ke, 0.95);
    var cap = opts.reservesCap ? wellReserves(well, res) : Infinity;
    var lim = well.pumpOn ? num(well.cn, 1.38) * num(well.Qnom, 100) : Infinity;
    var qL = [], qO = [], volL = [], volO = [], cumO = 0, i;
    var Q0L = well.pumpOn ? sr.Qliq : sr.Qliq; // уже с ограничением по насосу
    var Q0Lraw = sr.Qliq;
    for (i = 0; i < months; i++) {
      var t = (i + 0.5) * MONTH_DAYS;
      var ql = Math.min(Q0Lraw * declineF(t, dp.liq.a, dp.liq.t1, dp.liq.t2), lim);
      var qo = sr.Qoil * declineF(t, dp.oil.a, dp.oil.t1, dp.oil.t2);       // т/сут
      var qoM3 = qo / sr.props.rho;
      if (qoM3 > ql) { qoM3 = ql; qo = ql * sr.props.rho; }
      var vo = qo * MONTH_DAYS * Ke;
      if (cumO + vo > cap) { var fr = Math.max(0, (cap - cumO) / vo); vo *= fr; qo *= fr; ql *= fr; qoM3 *= fr; }
      cumO += vo;
      qL.push(ql); qO.push(qo); volL.push(ql * MONTH_DAYS * Ke); volO.push(vo);
    }
    return { start: sr, decl: dp, qLiq: qL, qOil: qO, volLiq: volL, volOil: volO, reserves: cap, Q0L: Q0L };
  }

  /* ------------------------------------------------------------------ */
  /* Прогноз по объекту                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * project = { res, startYear, years, Ke, reservesCap, groups:[{well, schedule:{год:число}}], ppd:{ratio, comp, Bw} }
   * scenario: 'noppd' | 'ppd'
   */
  function fieldForecast(project, scenario) {
    var Y0 = num(project.startYear, 2027), NY = Math.max(1, Math.round(num(project.years, 20))), M = NY * 12;
    var res = project.res, opts = { Ke: project.Ke, reservesCap: project.reservesCap };
    var mL = new Array(M).fill(0), mO = new Array(M).fill(0);
    var groupsOut = [], wellsOut = [], y, m;
    var annual = { year: [], oil: [], liq: [], water: [], fw: [], newWells: [], activeWells: [], qOilAvg: [], inj: [], injWells: [], newInj: [], cumOil: [], byGroup: [] };
    var newByYear = new Array(NY).fill(0);
    // каждая скважина учитывается отдельно; добыча объекта = сумма добычи всех скважин
    project.groups.forEach(function (g, gi) {
      var prof = wellProfile(g.well, res, scenario, M, opts);
      var gm = new Array(M).fill(0), nby = new Array(NY).fill(0), no = 0;
      for (y = 0; y < NY; y++) {
        var c = num((g.schedule || {})[Y0 + y], 0);
        if (c <= 0) continue;
        nby[y] = c; newByYear[y] += c;
        var nInt = Math.floor(c), frac = c - nInt, starts = [];
        for (var j = 0; j < nInt; j++) starts.push({ m: y * 12 + Math.floor(12 * (j + 0.5) / Math.max(1, Math.ceil(c))), w: 1 });
        if (frac > 0) starts.push({ m: y * 12 + 11, w: frac });
        starts.forEach(function (st) {
          no++;
          var wo = new Array(NY).fill(0), wl = new Array(NY).fill(0);
          for (m = st.m; m < M; m++) {
            var k = m - st.m, vo = prof.volOil[k] * st.w, vl = prof.volLiq[k] * st.w, yy = Math.floor(m / 12);
            wo[yy] += vo; wl[yy] += vl; gm[m] += vo; mO[m] += vo; mL[m] += vl;
          }
          wellsOut.push({ name: (g.name || TYPES[g.well.type].name) + ' — скв. ' + no, group: gi, groupName: g.name || TYPES[g.well.type].name, type: g.well.type,
            startYear: Y0 + Math.floor(st.m / 12), startMonth: st.m % 12 + 1, share: st.w, oil: wo, liq: wl,
            cumOil: wo.reduce(function (a, b) { return a + b; }, 0), cumLiq: wl.reduce(function (a, b) { return a + b; }, 0) });
        });
      }
      groupsOut.push({ name: g.name || TYPES[g.well.type].name, type: g.well.type, profile: prof, monthlyOil: gm, newByYear: nby });
    });
    var rho = num(res.rho, 0.85), B = num(res.B, 1.1);
    var ppd = project.ppd || {}, ratio = Math.max(0.5, num(ppd.ratio, 3)), comp = num(ppd.comp, 100) / 100, Bw = num(ppd.Bw, 1.0);
    var cum = 0, active = 0, injPrev = num(ppd.existingInj, 0);
    for (y = 0; y < NY; y++) {
      // годовая добыча объекта — сумма по скважинам
      var o = 0, l = 0, w = 0, inj = 0;
      wellsOut.forEach(function (wl) { o += wl.oil[y]; l += wl.liq[y]; });
      for (m = y * 12; m < y * 12 + 12; m++) {
        var oM3 = mO[m] / rho, wat = Math.max(0, mL[m] - oM3);
        w += wat;
        if (scenario === 'ppd') inj += comp * (oM3 * B + wat * Bw);
      }
      cum += o; active += newByYear[y];
      var injW = scenario === 'ppd' ? Math.ceil(active / ratio) : 0;
      annual.year.push(Y0 + y); annual.oil.push(o); annual.liq.push(l); annual.water.push(w);
      annual.fw.push(l > 0 ? w / l : 0); annual.newWells.push(newByYear[y]); annual.activeWells.push(active);
      annual.qOilAvg.push(active > 0 ? o / (365.25 * num(project.Ke, 0.95)) / active : 0);
      annual.inj.push(inj); annual.injWells.push(injW); annual.newInj.push(Math.max(0, injW - injPrev)); injPrev = Math.max(injPrev, injW);
      annual.cumOil.push(cum);
    }
    annual.byGroup = groupsOut.map(function (g, gi) {
      var arr = [];
      for (y = 0; y < NY; y++) { var s = 0; wellsOut.forEach(function (wl) { if (wl.group === gi) s += wl.oil[y]; }); arr.push(s); }
      return { name: g.name, oil: arr, newWells: g.newByYear };
    });
    return { scenario: scenario, monthly: { liq: mL, oil: mO }, annual: annual, groups: groupsOut, wells: wellsOut, startYear: Y0, years: NY };
  }

  /* ------------------------------------------------------------------ */
  /* Вероятностная оценка P90 / P50 / P10 (метод Монте-Карло)            */
  /* ------------------------------------------------------------------ */
  // Принято по SPE-PRMS: P90 — значение, которое будет превышено с вероятностью 90 % (пессимистичная оценка),
  // P50 — медиана, P10 — превышается с вероятностью 10 % (оптимистичная оценка).
  var UNC_DEFAULT = [
    { key: 'k', name: 'Проницаемость k', low: -30, high: 30, dist: 'logn', on: true },
    { key: 'h', name: 'Нефтенасыщенная толщина h', low: -20, high: 20, dist: 'tri', on: true },
    { key: 'dP', name: 'Депрессия ΔP', low: -15, high: 15, dist: 'tri', on: true },
    { key: 'mu', name: 'Вязкость нефти μ', low: -15, high: 15, dist: 'tri', on: true },
    { key: 'Aef', name: 'Эффективная поверхность фильтрации Aэф', low: -30, high: 30, dist: 'logn', on: true },
    { key: 'xf', name: 'Полудлина трещин xf', low: -25, high: 25, dist: 'tri', on: true },
    { key: 'KR', name: 'Коэффициент KR (метод B)', low: -20, high: 20, dist: 'tri', on: true },
    { key: 'decl', name: 'Время падения дебита τ', low: -25, high: 25, dist: 'tri', on: false }
  ];
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function normInv(u) { // Acklam
    var a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924],
      b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857],
      c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878],
      d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742], q, r;
    if (u < 0.02425) { q = Math.sqrt(-2 * Math.log(u)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (u > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - u)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = u - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // множитель к базовому значению; low/high — отклонения, %: для треугольного и равномерного — границы,
  // для логнормального — уровни 10 % и 90 % (медиана = базовое значение)
  function sampleMult(u, p) {
    var lo = 1 + num(p.low, 0) / 100, hi = 1 + num(p.high, 0) / 100;
    lo = Math.max(0.01, Math.min(lo, 1)); hi = Math.max(hi, 1);
    if (p.dist === 'uni') return lo + u * (hi - lo);
    if (p.dist === 'logn') { // логнормальное с медианой 1; ветви ниже/выше медианы проходят через P90 = lo и P10 = hi
      var z = normInv(Math.min(1 - 1e-9, Math.max(1e-9, u))); return Math.exp(z * (z < 0 ? -Math.log(lo) : Math.log(hi)) / 1.2815516); }
    var mode = 1, fc = (mode - lo) / (hi - lo || 1);
    return u < fc ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
  }
  function pctl(arr, p) { var a = arr.filter(isFinite).slice().sort(function (x, y) { return x - y; }); if (!a.length) return NaN; var i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }
  function pSummary(arr) { return { P90: pctl(arr, 0.10), P50: pctl(arr, 0.50), P10: pctl(arr, 0.90), mean: arr.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, arr.length) }; }
  function applyMult(project, m) {
    var P = JSON.parse(JSON.stringify(project)), r = P.res;
    if (m.k) { r.k = num(r.k, 1) * m.k; }
    if (m.h) r.h = num(r.h, 8) * m.h;
    if (m.mu) r.mu = num(r.mu, 1) * m.mu;
    if (m.Aef && r.Aef !== undefined) r.Aef = num(r.Aef, 2843) * m.Aef;
    if (m.KR && r.KR !== undefined) r.KR = num(r.KR, 6) * m.KR;
    P.groups.forEach(function (g) {
      var w = g.well;
      if (m.k && w.k !== undefined && w.k !== '') w.k = num(w.k, 1) * m.k;
      if (m.h && w.h !== undefined && w.h !== '') w.h = num(w.h, 8) * m.h;
      if (m.dP) w.dP = num(w.dP, num(r.Pres, 20) - num(r.Pwf, 10)) * m.dP;
      if (m.xf) ['xf', 'xfLat'].forEach(function (k) { if (w[k] !== undefined && w[k] !== '') w[k] = num(w[k], 100) * m.xf; });
      if (m.decl && w.decl) ['noppd', 'ppd'].forEach(function (sc) { ['liq', 'oil'].forEach(function (ph) { var o = (w.decl[sc] || {})[ph]; if (!o) return; ['t1', 't2', 'tau'].forEach(function (k) { if (isFinite(+o[k]) && o[k] !== '') o[k] = +o[k] * m.decl; }); }); });
    });
    return P;
  }
  /**
   * opts = { params:[{key,low,high,dist,on}], n: число реализаций, seed, production: true — считать профили добычи,
   *          evaluate: fn(project, fc) → {NPV, oilTotal} (экономика, передаётся из econ.js) }
   */
  function probabilistic(project, opts) {
    opts = opts || {};
    var params = (opts.params || UNC_DEFAULT).filter(function (p) { return p.on !== false; });
    var n = Math.max(20, Math.min(20000, Math.round(num(opts.n, 1000)))), rnd = rng(num(opts.seed, 20261017));
    var G = project.groups.length, q = project.groups.map(function () { return []; }), qOil = project.groups.map(function () { return []; }), qSum = [];
    var prod = opts.production, nP = prod ? Math.min(n, Math.max(20, Math.round(num(opts.nProd, 300)))) : 0;
    var out = { n: n, nProd: nP, params: params, groups: [], field: {}, samples: { qSum: qSum } };
    var cumO = { noppd: [], ppd: [] }, npv = { noppd: [], ppd: [] }, yearOil = { noppd: [], ppd: [] };
    for (var i = 0; i < n; i++) {
      var m = {};
      params.forEach(function (p) { m[p.key] = sampleMult(rnd(), p); });
      var Pi = applyMult(project, m), s = 0;
      for (var g = 0; g < G; g++) { var sr = startRate(Pi.groups[g].well, Pi.res); q[g].push(sr.Qliq); qOil[g].push(sr.Qoil); s += sr.Qliq * Object.keys(Pi.groups[g].schedule || {}).reduce(function (a, y) { return a + num(Pi.groups[g].schedule[y], 0); }, 0); }
      qSum.push(s);
      if (i < nP) ['noppd', 'ppd'].forEach(function (sc) {
        var fc = fieldForecast(Pi, sc); cumO[sc].push(fc.annual.cumOil[fc.annual.cumOil.length - 1]); yearOil[sc].push(fc.annual.oil);
        if (opts.evaluate) npv[sc].push(opts.evaluate(Pi, fc).NPV);
      });
    }
    out.groups = project.groups.map(function (gr, g) { return { name: gr.name, liq: pSummary(q[g]), oil: pSummary(qOil[g]), base: startRate(gr.well, project.res).Qliq }; });
    out.field.qStart = pSummary(qSum);
    if (nP) ['noppd', 'ppd'].forEach(function (sc) {
      var NY = yearOil[sc][0].length, py = { P90: [], P50: [], P10: [] };
      for (var y = 0; y < NY; y++) { var col = yearOil[sc].map(function (a) { return a[y]; }), ps = pSummary(col); py.P90.push(ps.P90); py.P50.push(ps.P50); py.P10.push(ps.P10); }
      out.field[sc] = { cumOil: pSummary(cumO[sc]), npv: npv[sc].length ? pSummary(npv[sc]) : null, npvPos: npv[sc].length ? npv[sc].filter(function (v) { return v > 0; }).length / npv[sc].length : NaN, yearOil: py };
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Идентификация параметров по скважинам-аналогам                     */
  /* ------------------------------------------------------------------ */

  function golden(f, a, b, tol) {
    var gr = (Math.sqrt(5) - 1) / 2, c = b - gr * (b - a), d = a + gr * (b - a), fc = f(c), fd = f(d), it = 0;
    while (Math.abs(b - a) > tol * (Math.abs(c) + Math.abs(d)) && it++ < 300) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
    }
    return (a + b) / 2;
  }

  /**
   * Подбор одного параметра (param: 'KR' | 'Aef' | 'dg') минимизацией Σ ln²(Qрасч/Qфакт).
   * wells: [{well, res?, Qfact}] — свойства в well (k, h, dP, b) переопределяют общие.
   */
  function calibrate(param, wells, res, lo, hi) {
    function predict(val, list) {
      return list.map(function (w) {
        var r = Object.assign({}, res, w.res || {}); r[param] = val;
        if (param === 'Aef') r.gamma = num(r.gamma, 1);
        return startRate(w.well, r).Qliq;
      });
    }
    function obj(val, list) {
      var q = predict(val, list), s = 0;
      list.forEach(function (w, i) { s += Math.pow(Math.log(Math.max(1e-9, q[i]) / w.Qfact), 2); });
      return s;
    }
    function fit(list) { return Math.exp(golden(function (x) { return obj(Math.exp(x), list); }, Math.log(lo), Math.log(hi), 1e-7)); }
    var best = fit(wells), q = predict(best, wells);
    var errs = wells.map(function (w, i) { return (q[i] / w.Qfact - 1) * 100; });
    var loo = wells.map(function (w, i) {
      var rest = wells.filter(function (_, j) { return j !== i; });
      var v = fit(rest), qi = predict(v, [w])[0];
      return { value: v, err: (qi / w.Qfact - 1) * 100 };
    });
    function meanAbs(a) { return a.reduce(function (s, x) { return s + Math.abs(x); }, 0) / a.length; }
    function medAbs(a) { var b = a.map(Math.abs).sort(function (x, y) { return x - y; }), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; }
    return {
      param: param, value: best, Q: q, err: errs, meanAbs: meanAbs(errs), medAbs: medAbs(errs),
      loo: loo, looMeanAbs: meanAbs(loo.map(function (x) { return x.err; })),
      looRange: [Math.min.apply(null, loo.map(function (x) { return x.value; })), Math.max.apply(null, loo.map(function (x) { return x.value; }))]
    };
  }

  /** Подбор параметров падения по фактической динамике (Нелдер–Мид, Σ ln²). model: '4.26' | '4.34'. */
  function fitDecline(points, model) {
    var pts = points.filter(function (p) { return p.t >= 0 && p.q > 0; });
    var q0g = pts[0].q;
    function unpack(x) {
      if (model === '4.26') return { Q0: Math.exp(x[0]), a: 1 / (1 + Math.exp(-x[1])), t1: Math.exp(x[2]), t2: Infinity };
      return { Q0: Math.exp(x[0]), a: 1 / (1 + Math.exp(-x[1])), t1: Math.exp(x[2]), t2: Math.exp(x[2]) + Math.exp(x[3]) };
    }
    function f(x) {
      var p = unpack(x), s = 0;
      pts.forEach(function (pt) { s += Math.pow(Math.log(p.Q0 * declineF(pt.t, p.a, p.t1, p.t2) / pt.q), 2); });
      return s;
    }
    var x0 = model === '4.26' ? [Math.log(q0g), 0.8, Math.log(150)] : [Math.log(q0g), 0.8, Math.log(120), Math.log(1500)];
    var best = nelderMead(f, x0, 4000);
    var p = unpack(best);
    var err = pts.reduce(function (s, pt) { return s + Math.abs(p.Q0 * declineF(pt.t, p.a, p.t1, p.t2) / pt.q - 1); }, 0) / pts.length * 100;
    return { Q0: p.Q0, a: p.a, phi: 1 - p.a, t1: p.t1, t2: p.t2, meanAbs: err };
  }

  function nelderMead(f, x0, maxIt) {
    var n = x0.length, S = [x0.slice()], i, j;
    for (i = 0; i < n; i++) { var x = x0.slice(); x[i] += 0.5; S.push(x); }
    var F = S.map(f);
    for (var it = 0; it < maxIt; it++) {
      var idx = F.map(function (v, k) { return k; }).sort(function (a, b) { return F[a] - F[b]; });
      S = idx.map(function (k) { return S[k]; }); F = idx.map(function (k) { return F[k]; });
      if (Math.abs(F[n] - F[0]) < 1e-12) break;
      var c = new Array(n).fill(0);
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += S[i][j] / n;
      var xr = c.map(function (v, k) { return v + (v - S[n][k]); }), fr = f(xr);
      if (fr < F[0]) {
        var xe = c.map(function (v, k) { return v + 2 * (v - S[n][k]); }), fe = f(xe);
        if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; }
      } else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        var xc = c.map(function (v, k) { return v + 0.5 * (S[n][k] - v); }), fc = f(xc);
        if (fc < F[n]) { S[n] = xc; F[n] = fc; }
        else for (i = 1; i <= n; i++) { S[i] = S[i].map(function (v, k) { return S[0][k] + 0.5 * (v - S[0][k]); }); F[i] = f(S[i]); }
      }
    }
    return S[0];
  }

  /* ------------------------------------------------------------------ */
  function fmt(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    var s = Number(x).toFixed(d === undefined ? 2 : d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',');
  }

  /** Пресеты параметров падения (таблицы 4.4, 4.7 диссертации). */
  var DECLINE_PRESETS = {
    'БП16 ГС — жидкость (4.34)': { a: 0.71, t1: 105, t2: 1462 },
    'БП16 ГС — нефть (4.34)': { a: 0.77, t1: 144, t2: 1627 },
    'БП16 ННС — жидкость (4.34)': { a: 0.65, t1: 79, t2: 1544 },
    'БП16 ННС — нефть (4.34)': { a: 0.61, t1: 113, t2: 1145 },
    'Аналог 2, ЮВ2 — жидкость (4.34)': { a: 0.23, t1: 90, t2: 3643 },
    'Аналог 2, ЮВ2 — нефть (4.34)': { a: 0.09, t1: 60, t2: 960 }
  };
  var PPD_PRESETS = {
    'АС3 медиана — нефть (4.26)': { phi: 0.29, tau: 127 },
    'АС3, 83 ГС — нефть (4.26)': { phi: 0.27, tau: 127 },
    'Аналог 2, ЮВ1 ГС — нефть (4.26)': { phi: 0.28, tau: 223 },
    'Аналог 2, ЮВ1 ГС — жидкость (4.26)': { phi: 0.52, tau: 141 },
    'Аналог 2, ачимовские — нефть (4.26)': { phi: 0.22, tau: 183 },
    'Аналог 2, ачимовские — жидкость (4.26)': { phi: 0.71, tau: 169 }
  };

  return {
    VERSION: VERSION, TYPES: TYPES, METHODS: METHODS, KR_THEORY: KR_THEORY, MONTH_DAYS: MONTH_DAYS,
    initialGradient: initialGradient, forchheimerB: forchheimerB, betaStar: betaStar, piezo: piezo,
    rekvFromArea: rekvFromArea, velocity: velocity, darcyFractures: darcyFractures, stripPhi: stripPhi,
    boreSegments: boreSegments, unionArea: unionArea, fam: fam, slantSkin: slantSkin, LEGACY_TYPES: LEGACY_TYPES,
    startRate: startRate, chooseMethod: chooseMethod, declineF: declineF, declineN: declineN, phiPPD: phiPPD,
    declineParams: declineParams, tauCalc: tauCalc, wellReserves: wellReserves, wellProfile: wellProfile,
    fieldForecast: fieldForecast, probabilistic: probabilistic, UNC_DEFAULT: UNC_DEFAULT, sampleMult: sampleMult, pctl: pctl, calibrate: calibrate, fitDecline: fitDecline, fmt: fmt, num: num,
    DECLINE_PRESETS: DECLINE_PRESETS, PPD_PRESETS: PPD_PRESETS
  };
}));
