/* ТРИЗ-НФ — проект-пример и шаблоны скважин. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TRIZ_DEMO = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function decl(noLiq, noOil, ppdLiq, ppdOil) {
    return {
      sameOil: false,
      noppd: { liq: Object.assign({ tauMode: 'input' }, noLiq), oil: Object.assign({ tauMode: 'input' }, noOil) },
      ppd: { liq: Object.assign({ phiMode: 'input', tauMode: 'input' }, ppdLiq), oil: Object.assign({ phiMode: 'input', tauMode: 'input' }, ppdOil) }
    };
  }
  // Пресеты падения (таблицы 4.4, 4.7): без ППД — двухъёмная модель (4.34) по аналогу БП16;
  // с ППД — (4.26): нефть по медиане АС3, жидкость по аналогу ЮВ1.
  var DECL_GS = decl({ a: 0.71, t1: 105, t2: 1462 }, { a: 0.77, t1: 144, t2: 1627 }, { phi: 0.52, tau: 141 }, { phi: 0.29, tau: 127 });
  var DECL_NNS = decl({ a: 0.65, t1: 79, t2: 1544 }, { a: 0.61, t1: 113, t2: 1145 }, { phi: 0.52, tau: 141 }, { phi: 0.29, tau: 127 });

  var C = { S: 0, rw: 0.084, pumpOn: false, cn: 1.38, method: 'auto' };
  function tpl(type, o) { return Object.assign({ type: type, Qnom: 125, fw0: 25 }, C, o); }
  var TEMPLATES = {
    VS: tpl('VS', { fw0: 30, Qnom: 80 }),
    NNS: tpl('NNS', { alpha: 30, fw0: 30, Qnom: 80 }),
    NNS_GRP: tpl('NNS_GRP', { alpha: 30, xf: 80, fw0: 30, Qnom: 80 }),
    NNS_MGRP: tpl('NNS_MGRP', { alpha: 35, xf: 80, nZ: 3, fw0: 30, Qnom: 100 }),
    PS: tpl('PS', { alpha: 80, fw0: 25, Qnom: 100 }),
    BS: tpl('BS', { alpha: 30, fw0: 40, Qnom: 80 }),
    BS_GRP: tpl('BS_GRP', { alpha: 30, xf: 70, fw0: 40, Qnom: 80 }),
    GS: tpl('GS', { L: 800, fw0: 20 }),
    GS_WAVE: tpl('GS_WAVE', { L: 800, amp: 5, fw0: 20 }),
    GS_LONG: tpl('GS_LONG', { L: 800, xf: 420, fw0: 25 }),
    GS_MGRP: tpl('GS_MGRP', { L: 1000, n: 8, xf: 120, fw0: 30, lenCorr: false }),
    BGS: tpl('BGS', { L: 400, fw0: 35 }),
    BGS_MGRP: tpl('BGS_MGRP', { L: 500, n: 5, xf: 100, fw0: 35 }),
    MZS: tpl('MZS', { nLat: 3, Llat: 600, latAngle: 25, nLev: 1, Kint: 0.5, fw0: 20 }),
    MZS_MGRP: tpl('MZS_MGRP', { nLat: 3, Llat: 600, latAngle: 25, nLat_st: 4, xfLat: 60, Kint: 0, fw0: 25 }),
    FISHBONE: tpl('FISHBONE', { L: 1000, nRib: 12, lRib: 120, ribAngle: 45, ribLayout: 'pairs', fw0: 25 }),
    RADIAL: tpl('RADIAL', { nCh: 4, lCh: 100, nLev: 1, rCh: 0.025, fw0: 30, Qnom: 80 })
  };
  var NNS_DECL_TYPES = { VS: 1, NNS: 1, NNS_GRP: 1, NNS_MGRP: 1, PS: 1, BS: 1, BS_GRP: 1, RADIAL: 1 };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function newWell(type) {
    var w = clone(TEMPLATES[type] || TEMPLATES.GS);
    w.decl = clone(NNS_DECL_TYPES[type] ? DECL_NNS : DECL_GS);
    return w;
  }

  function demoProject() {
    var g = function (name, type, sched, over) {
      var w = newWell(type); Object.assign(w, over || {});
      return { name: name, well: w, schedule: sched };
    };
    return {
      meta: { name: 'Пример: низкопроницаемый объект (параметры типа пласта АС3)', field: 'Объект-пример', author: '', created: new Date().toISOString().slice(0, 10) },
      startYear: 2027, years: 20, Ke: 0.95, reservesCap: true,
      res: {
        k: 1.0, h: 8, m: 0.18, So: 0.6, mu: 0.8, B: 1.244, rho: 0.84, Pres: 20, Pwf: 10,
        betaL: 1.8e-3, betaR: 0.076e-3, chiMode: 'calc', chi: 1e-3,
        Aef: 2843, gamma: 1, Aef35: 1050, gamma35: 0.71, Rk: 250,
        RekvMode: 'KR', KR: 6.07, tR: 30, spacingA: 500, spacingB: 600,
        dgMode: 'input', dg: 0.0398, Gmode: 'auto', G: 0, bMode: 'auto', b: 0, w: 300, nPow: 2,
        KV: 0.76, KIN: 0.25, nLayers: 1, kvkh: 1
      },
      ppd: { ratio: 3, comp: 100, Bw: 1.0, existingInj: 0 },
      groups: [
        g('ГС с МГРП', 'GS_MGRP', { 2027: 6, 2028: 10, 2029: 10, 2030: 6 }),
        g('ННС с ГРП', 'NNS_GRP', { 2027: 4, 2028: 6, 2029: 6 }),
        g('МЗС с МГРП', 'MZS_MGRP', { 2028: 2, 2029: 3, 2030: 3 }),
        g('Фишбон', 'FISHBONE', { 2029: 2, 2030: 3 })
      ],
      econ: { Kd: 0.2, discount: 3 }
    };
  }

  return { TEMPLATES: TEMPLATES, newWell: newWell, demoProject: demoProject, clone: clone };
}));
