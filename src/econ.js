/*
 * ТРИЗ-НФ — экономический блок.
 * Денежный поток недропользователя: выручка − НДПИ − ОРЕХ − налог на имущество − налог на прибыль − CAPEX.
 * Показатели: ЧД, ЧДД, ВНД, ИД, срок окупаемости (простой и дисконтированный), цена безубыточности.
 * НДПИ на нефть: НДПИ = 919·Кц − Дм, Кц = (Ц − 15)·Р/261, Дм = 559·Кц·(1 − Кз·Кд·Кдв·Ккан) − Кк − Кабдт − Кман
 * (ст. 342, 342.2, 342.5 НК РФ; значения коэффициентов проверять по действующей редакции).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.TRIZ_ECON = factory(root.TRIZ);
}(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  var num = T.num;

  var DEFAULTS = {
    priceMode: 'urals', urals: 60, discount: 3, bblPerT: 7.3, usd: 90, transport: 2500, netback: 25000,
    priceGrowth: 0, costInflation: 4,
    ndpiMode: 'formula', Kz: 1, Kd: 1, Kdv: 1, Kkan: 1, Kk: 428, Kabdt: 0, KmanMode: 'auto', Kman: 0, ndpiManual: 15000,
    capex: { VS: 55, NNS: 70, PS: 85, GS: 120, BS: 35, BGS: 50, NNS_frac: 12, stage: 4, latExtra: 35, rib: 3, radialCh: 1.5, infra: 15, infraSide: 3, inj: 70, injInfra: 10 },
    opexLiq: 300, opexOil: 1500, opexFixProd: 6000, opexInj: 60, opexFixInj: 2000,
    profitTax: 25, propTax: 2.2, deprYears: 10, lossCarry: true, discountRate: 15, econLimit: true
  };

  /** Нетбэк, руб/т. */
  function netback(e, yearIdx) {
    var g = Math.pow(1 + num(e.priceGrowth, 0) / 100, yearIdx);
    if (e.priceMode === 'netback') return num(e.netback, 25000) * g;
    return ((num(e.urals, 60) - num(e.discount, 0)) * num(e.bblPerT, 7.3) * num(e.usd, 90) - num(e.transport, 0)) * g;
  }

  /** ЭП, долл/т (п. 8 ст. 342.5) по цене Urals в долл/т. */
  function EP(uralsT) {
    var e;
    if (uralsT <= 109.5) e = 0;
    else if (uralsT <= 146) e = 0.35 * (uralsT - 109.5);
    else if (uralsT <= 182.5) e = 12.78 + 0.45 * (uralsT - 146);
    else e = 29.2 + 0.30 * (uralsT - 182.5);
    return Math.floor(e * 10) / 10;
  }

  /** НДПИ, руб/т. */
  function ndpi(e, yearIdx) {
    if (e.ndpiMode === 'manual') return num(e.ndpiManual, 15000);
    var g = Math.pow(1 + num(e.priceGrowth, 0) / 100, yearIdx);
    var U = num(e.urals, 60) * g, R = num(e.usd, 90);
    var Kc = (U - 15) * R / 261;
    // Кман по п. 8 ст. 342.5: цена Urals в долл/т – по нормативному коэффициенту 7,3 барр/т (не зависит от плотности нефти объекта)
    var Kman = e.KmanMode === 'manual' ? num(e.Kman, 0) : EP(U * 7.3) * R;
    // Кд по п. 2 ст. 342.2 НК РФ (действующая редакция) применяется до истечения 180 налоговых периодов (15 лет), начинающихся с 1 января года,
    // в котором степень выработанности запасов залежи впервые превысила 1 %; далее Кд = 1.
    // KdYears – число лет прогноза (с первого года), в которые применяется Кд; если задан год KdFrom, KdYears вычисляется в evaluate(). По умолчанию – весь срок.
    var Kd = (yearIdx === undefined || yearIdx < num(e.KdYears, Infinity)) ? num(e.Kd, 1) : 1;
    var Dm = 559 * Kc * (1 - num(e.Kz, 1) * Kd * num(e.Kdv, 1) * num(e.Kkan, 1)) - num(e.Kk, 428) - num(e.Kabdt, 0) - Kman;
    return { value: Math.max(0, 919 * Kc - Dm), Kc: Kc, Dm: Dm, Kman: Kman };
  }
  /** Число лет прогноза с Кд < 1: по году KdFrom (выработанность > 1 %) и сроку KdPeriods налоговых периодов (месяцев, по умолчанию 180) или по KdYears. */
  function kdYears(e, project) {
    if (e.KdFrom === undefined || e.KdFrom === null || e.KdFrom === '' || !isFinite(+e.KdFrom)) return e.KdYears;
    return Math.max(0, +e.KdFrom + num(e.KdPeriods, 180) / 12 - num((project || {}).startYear, 2027));
  }
  function ndpiValue(e, y) { var r = ndpi(e, y); return typeof r === 'number' ? r : r.value; }

  /** CAPEX на одну скважину группы, млн руб. */
  function wellCapex(well, e) {
    if (well.capex !== undefined && well.capex !== '' && well.capex !== null) return num(well.capex, 0);
    var c = Object.assign({}, DEFAULTS.capex, e.capex || {}), t = T.LEGACY_TYPES[well.type] || well.type, v;
    var Nl = Math.max(1, Math.round(num(well.nLat, 2)));
    switch (t) {
      case 'VS': v = c.VS; break;
      case 'NNS': v = c.NNS; break;
      case 'NNS_GRP': v = c.NNS + c.NNS_frac; break;
      case 'NNS_MGRP': v = c.NNS + c.stage * num(well.nZ, 3); break;
      case 'PS': v = c.PS; break;
      case 'BS': v = c.BS; break;
      case 'BS_GRP': v = c.BS + c.NNS_frac; break;
      case 'GS': case 'GS_WAVE': v = c.GS; break;
      case 'GS_LONG': v = c.GS + c.NNS_frac * 2; break;
      case 'GS_MGRP': v = c.GS + c.stage * num(well.n, 10); break;
      case 'BGS': v = c.BGS; break;
      case 'BGS_MGRP': v = c.BGS + c.stage * num(well.n, 5); break;
      case 'MZS': v = c.GS + c.latExtra * (Nl - 1); break;
      case 'MZS_MGRP': v = c.GS + c.latExtra * (Nl - 1) + c.stage * Nl * num(well.nLat_st, 4); break;
      case 'FISHBONE': v = c.GS + c.rib * num(well.nRib, 10); break;
      case 'RADIAL': v = c.VS + c.radialCh * num(well.nCh, 4) * Math.max(1, Math.round(num(well.nLev, 1))); break;
      default: v = c.GS;
    }
    return v + ((T.TYPES[t] || {}).side ? c.infraSide : c.infra);
  }

  function npvAt(cf, r) { var s = 0; for (var i = 0; i < cf.length; i++) s += cf[i] / Math.pow(1 + r, i); return s; }
  function irr(cf) {
    // ВНД — наименьший корень ЧДД(r) = 0 на сетке r ∈ (−0,99; 10], уточнённый делением пополам.
    // Если поток меняет знак несколько раз (затраты на ликвидацию и т.п.), берётся корень, ближайший к 0 сверху.
    var grid = [], r; for (r = -0.99; r <= 10.0001; r += 0.01) grid.push(r);
    var roots = [];
    for (var k = 1; k < grid.length; k++) {
      var a = grid[k - 1], b = grid[k], fa = npvAt(cf, a), fb = npvAt(cf, b);
      if (fa === 0) { roots.push(a); continue; }
      if (fa * fb < 0) { for (var i = 0; i < 80; i++) { var m = (a + b) / 2, fm = npvAt(cf, m); if (fm * fa > 0) { a = m; fa = fm; } else b = m; } roots.push((a + b) / 2); }
    }
    if (!roots.length) return npvAt(cf, 10) > 0 ? Infinity : NaN;   // ВНД > 1000 % или не существует
    var pos = roots.filter(function (x) { return x >= 0; });
    return pos.length ? pos[0] : roots[roots.length - 1];
  }
  function payback(cum, years) {
    for (var i = 0; i < cum.length; i++) {
      if (cum[i] >= 0 && i > 0 && cum[i - 1] < 0) return i - 1 + (-cum[i - 1]) / (cum[i] - cum[i - 1]) + 1;
      if (cum[i] >= 0 && i === 0) return 1;
    }
    return NaN;
  }

  /**
   * Расчёт экономики по прогнозу fc (T.fieldForecast) и проекту.
   * mult: {price, capex, opex, prod} — множители для анализа чувствительности.
   */
  function evaluate(project, fc, mult) {
    mult = mult || {};
    var e = Object.assign({}, DEFAULTS, project.econ || {});
    e.capex = Object.assign({}, DEFAULTS.capex, (project.econ || {}).capex || {});
    e.KdYears = kdYears(e, project);
    var A = fc.annual, NY = A.year.length, mP = num(mult.price, 1), mC = num(mult.capex, 1), mO = num(mult.opex, 1), mQ = num(mult.prod, 1);
    var rho = num(project.res.rho, 0.85);
    var r = num(e.discountRate, 15) / 100;
    var rows = [], y;
    // CAPEX по годам
    var capex = new Array(NY).fill(0), capexWells = new Array(NY).fill(0), capexInj = new Array(NY).fill(0);
    fc.groups.forEach(function (g, gi) {
      var w = project.groups[gi].well, c = wellCapex(w, e);
      for (y = 0; y < NY; y++) capexWells[y] += g.newByYear[y] * c;
    });
    for (y = 0; y < NY; y++) {
      capexInj[y] = fc.scenario === 'ppd' ? A.newInj[y] * (e.capex.inj + e.capex.injInfra) : 0;
      var infl = Math.pow(1 + num(e.costInflation, 0) / 100, y);
      capex[y] = (capexWells[y] + capexInj[y]) * 1e6 * infl * mC;
    }
    // операционные потоки
    var oil = [], liq = [], inj = [], rev = [], tax = [], opex = [], ocf = [], prices = [];
    for (y = 0; y < NY; y++) {
      var infl2 = Math.pow(1 + num(e.costInflation, 0) / 100, y);
      oil[y] = A.oil[y] * mQ; liq[y] = A.liq[y] * mQ; inj[y] = A.inj[y] * mQ;
      // множитель цены применяется к котировке Urals (дисконт и транспорт — в абсолютных величинах)
      var eP = Object.assign({}, e, { urals: num(e.urals, 60) * mP, netback: num(e.netback, 25000) * mP });
      var price = netback(eP, y);
      prices[y] = price;
      rev[y] = oil[y] * price;
      tax[y] = oil[y] * ndpiValue(eP, y);
      var liqT = liq[y] * (rho + 1) / 2; // т жидкости (приближённо)
      opex[y] = (liqT * e.opexLiq + oil[y] * e.opexOil + A.activeWells[y] * e.opexFixProd * 1e3 +
        inj[y] * e.opexInj + A.injWells[y] * e.opexFixInj * 1e3) * infl2 * mO;
      ocf[y] = rev[y] - tax[y] - opex[y];
    }
    // рентабельный срок: после последнего года с положительным операционным потоком добыча прекращается
    var lastY = NY - 1;
    if (e.econLimit) {
      lastY = -1;
      for (y = NY - 1; y >= 0; y--) if (ocf[y] > 0) { lastY = y; break; }
      // если операционный поток нигде не положителен, добыча прекращается после года ввода последних скважин
      for (y = NY - 1; y >= 0; y--) if (A.newWells[y] > 0) { lastY = Math.max(lastY, y); break; }
    }
    var depr = new Array(NY).fill(0), resid = 0, residPrev = 0, carry = 0, cf = [], dcf = [], cum = [], dcum = [], cumV = 0, dcumV = 0;
    var dYears = Math.max(1, Math.round(num(e.deprYears, 10)));
    var capexHist = [];
    for (y = 0; y < NY; y++) {
      var active = y <= lastY;
      if (!active) { rev[y] = 0; tax[y] = 0; opex[y] = 0; oil[y] = 0; liq[y] = 0; inj[y] = 0; }
      capexHist.push(capex[y]);
      var d = 0;
      for (var j = 0; j < capexHist.length; j++) if (y - j < dYears) d += capexHist[j] / dYears;
      depr[y] = active ? d : 0;
      residPrev = resid; resid = Math.max(0, resid + capex[y] - d);
      var prop = active ? (residPrev + resid) / 2 * num(e.propTax, 2.2) / 100 : 0;
      var pbt = rev[y] - tax[y] - opex[y] - depr[y] - prop;
      var base = pbt;
      if (e.lossCarry) {
        if (pbt < 0) { carry += -pbt; base = 0; }
        else { var use = Math.min(carry, 0.5 * pbt); carry -= use; base = pbt - use; }
      } else base = Math.max(0, pbt);
      var ptax = Math.max(0, base) * num(e.profitTax, 25) / 100;
      var net = pbt - ptax;
      var c = net + depr[y] - capex[y];
      var df = 1 / Math.pow(1 + r, y);
      cf.push(c); dcf.push(c * df); cumV += c; dcumV += c * df; cum.push(cumV); dcum.push(dcumV);
      rows.push({
        year: A.year[y], oil: oil[y], liq: liq[y], inj: inj[y], wells: A.activeWells[y], injWells: A.injWells[y],
        price: prices[y], ndpiT: oil[y] > 0 ? tax[y] / oil[y] : ndpiValue(e, y), revenue: rev[y], ndpi: tax[y], opex: opex[y], depr: depr[y],
        propTax: prop, pbt: pbt, profitTax: ptax, net: net, capex: capex[y], cf: c, df: df, dcf: c * df, cum: cumV, dcum: dcumV
      });
    }
    var pvCapex = capex.reduce(function (s, v, i) { return s + v / Math.pow(1 + r, i); }, 0);
    var npv = dcumV, irrV = irr(cf);
    return {
      rows: rows, NPV: npv, NCF: cumV, IRR: irrV, PI: pvCapex > 0 ? 1 + npv / pvCapex : NaN,
      PP: payback(cum), DPP: payback(dcum), capexTotal: capex.reduce(function (s, v) { return s + v; }, 0),
      oilTotal: oil.reduce(function (s, v) { return s + v; }, 0), lastYear: A.year[lastY], rentYears: lastY + 1,
      unitCapex: 0, ndpiNow: ndpi(e, 0), netbackNow: netback(e, 0)
    };
  }

  /** Анализ чувствительности ЧДД (±delta) и цена безубыточности. */
  function sensitivity(project, fc, delta) {
    delta = delta || 0.2;
    var base = evaluate(project, fc).NPV;
    var keys = [['price', 'Цена нефти'], ['prod', 'Добыча (стартовые дебиты)'], ['capex', 'Капвложения'], ['opex', 'Операционные затраты']];
    var out = keys.map(function (k) {
      var lo = {}, hi = {}; lo[k[0]] = 1 - delta; hi[k[0]] = 1 + delta;
      return { key: k[0], name: k[1], low: evaluate(project, fc, lo).NPV, high: evaluate(project, fc, hi).NPV };
    });
    // цена безубыточности (множитель к цене)
    var a = 0.05, b = 5, fa = evaluate(project, fc, { price: a }).NPV, fb = evaluate(project, fc, { price: b }).NPV, be = NaN;
    if (fa * fb < 0) {
      for (var i = 0; i < 80; i++) { var m = (a + b) / 2, fm = evaluate(project, fc, { price: m }).NPV; if (fm * fa > 0) { a = m; fa = fm; } else b = m; }
      be = (a + b) / 2;
    }
    var e = Object.assign({}, DEFAULTS, project.econ || {});
    return { base: base, items: out, delta: delta, breakEvenMult: be, breakEvenUrals: e.priceMode === 'urals' ? num(e.urals, 60) * be : NaN, breakEvenNetback: netback(e, 0) * be };
  }

  /** Полный расчёт проекта: стартовые дебиты, прогнозы и экономика обоих вариантов. */
  function computeAll(P, newWell) {
    var R = { starts: P.groups.map(function (g) { return T.startRate(g.well, P.res); }), fc: {}, ev: {}, sens: {} };
    if (newWell) R.cmp = compareTypes(P, newWell);
    ['noppd', 'ppd'].forEach(function (sc) {
      R.fc[sc] = T.fieldForecast(P, sc);
      R.ev[sc] = evaluate(P, R.fc[sc]);
      R.sens[sc] = sensitivity(P, R.fc[sc]);
    });
    return R;
  }

  /**
   * Сравнение конструкций: одна скважина каждого типа при текущих свойствах объекта.
   * newWell(type) — шаблон скважины; доля CAPEX нагнетательной скважины в варианте с ППД = (inj + injInfra)/ratio.
   */
  function compareTypes(P, newWell) {
    var e = Object.assign({}, DEFAULTS, P.econ || {}); e.capex = Object.assign({}, DEFAULTS.capex, (P.econ || {}).capex || {});
    var ratio = Math.max(0.5, num((P.ppd || {}).ratio, 3));
    return Object.keys(T.TYPES).map(function (type) {
      var w = newWell(type), out = { type: type, name: T.TYPES[type].name };
      var sr = T.startRate(w, P.res); out.start = sr; out.capex = wellCapex(w, e);
      ['noppd', 'ppd'].forEach(function (sc) {
        var w2 = JSON.parse(JSON.stringify(w));
        w2.capex = out.capex + (sc === 'ppd' ? (e.capex.inj + e.capex.injInfra) / ratio : 0);
        var Pc = Object.assign({}, P, { groups: [{ name: out.name, well: w2, schedule: {} }], ppd: Object.assign({}, P.ppd, { ratio: 1e9, existingInj: 0 }) });
        Pc.groups[0].schedule[num(P.startYear, 2027)] = 1;
        var fc = T.fieldForecast(Pc, sc), ev = evaluate(Pc, fc);
        var A = fc.annual;
        out[sc] = { oil1: A.oil[0] + (A.oil[1] || 0) * 0, oil10: A.cumOil[Math.min(9, A.cumOil.length - 1)], oilRent: ev.oilTotal, NPV: ev.NPV, IRR: ev.IRR, capex: w2.capex,
          unit: ev.oilTotal > 0 ? w2.capex * 1e6 / ev.oilTotal : NaN };
        var p1 = T.wellProfile(w2, P.res, sc, 12, { Ke: P.Ke }); out[sc].oil1 = p1.volOil.reduce(function (a, b) { return a + b; }, 0);
      });
      return out;
    });
  }

  return { computeAll: computeAll, compareTypes: compareTypes, DEFAULTS: DEFAULTS, netback: netback, ndpi: ndpi, kdYears: kdYears, EP: EP, wellCapex: wellCapex, evaluate: evaluate, sensitivity: sensitivity, irr: irr, npvAt: npvAt };
}));
