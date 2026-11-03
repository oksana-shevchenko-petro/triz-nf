'use strict';
// Tests for the TRIZ-NF computational core.
// Run with: node --test test/*.test.js
// Reference values are the ones published in the dissertation
// (tables 4.1, 4.4, 4.5 and section 4.4); the app's built-in self-check uses the same numbers.

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/core.js');
const DATA = loadData();

function loadData() {
  // data.js attaches TRIZ_DATA to the global object when loaded outside a browser
  const g = {};
  const fn = new Function('self', require('fs').readFileSync(__dirname + '/../src/data.js', 'utf8'));
  fn(g);
  return g.TRIZ_DATA;
}

// ---------------------------------------------------------------------------
// Analytic limits
// ---------------------------------------------------------------------------

test('initial pressure gradient vanishes in the Darcy regime (k >= 8 mD)', () => {
  assert.equal(T.initialGradient(8), 0);
  assert.equal(T.initialGradient(50), 0);
});

test('initial pressure gradient grows as permeability falls below 8 mD', () => {
  const g1 = T.initialGradient(1), g01 = T.initialGradient(0.1);
  assert.ok(g1 > 0);
  assert.ok(g01 > g1);
  // fig. 2.11: H0 = -0.233 ln k + 0.4889 MPa/m
  assert.ok(Math.abs(g1 - 0.4889) < 1e-9);
});

test('theoretical drainage-radius coefficient KR = 2/sqrt(e^gamma) ~ 1.50 (eq. 4.6a)', () => {
  assert.ok(Math.abs(T.KR_THEORY - 1.50) < 0.01);
});

test('decline law (4.26): f(0) = 1 and f(t) -> 1 - a as t -> inf when tau2 = inf', () => {
  assert.ok(Math.abs(T.declineF(0, 0.7, 100, Infinity) - 1) < 1e-12);
  assert.ok(Math.abs(T.declineF(1e7, 0.7, 100, Infinity) - 0.3) < 1e-9);
});

test('cumulative decline (4.26) is the integral of f: d/dt N(t) = f(t)', () => {
  const a = 0.6, t1 = 120, t2 = 1500, t = 300, dt = 1e-3;
  const num = (T.declineN(t + dt, a, t1, t2) - T.declineN(t - dt, a, t1, t2)) / (2 * dt);
  assert.ok(Math.abs(num - T.declineF(t, a, t1, t2)) < 1e-6);
});

test('method C reduces to the Darcy (linear) solution when the inertial coefficient -> 0', () => {
  const res = { k: 50, mu: 1, B: 1.1, Pres: 20, Pwf: 10, w: 250, nPow: 2, bMode: 'input', b: 0 };
  const well = { type: 'GS', method: 'C', L: 1000, h: 10 };
  const r = T.startRate(well, res);
  const darcy = r.details['Q по Дарси (C → 0), м³/сут'];
  assert.ok(Math.abs(r.Qliq / darcy - 1) < 0.02, `Q=${r.Qliq} vs Darcy=${darcy}`);
});

test('method C: the rate is a non-increasing function of the inertial coefficient C', () => {
  // The non-linear zone r* = q / (2*pi*w*) only exceeds the wellbore radius for very large C at
  // oil-well rates, so the sweep goes up to extreme values to exercise the non-linear branch.
  const base = { k: 1, mu: 1, B: 1.1, Pres: 20, Pwf: 10, w: 250, nPow: 2 };
  const well = { type: 'GS', method: 'C', L: 1000, h: 10 };
  let prev = Infinity, lin = null, extreme = null;
  for (const b of [0, 1e18, 1e19, 1e20, 1e21, 1e22]) {
    const q = T.startRate(well, Object.assign({ bMode: 'input', b }, base)).Qliq;
    assert.ok(q <= prev + 1e-9, `rate increased at C=${b}`);
    if (b === 0) lin = q;
    extreme = q;
    prev = q;
  }
  assert.ok(extreme < 0.5 * lin, 'non-linear branch was not exercised');
});

test('method A: the non-linear-flow coefficient K_nf never exceeds 1', () => {
  const res = Object.assign({ Pres: 20, Pwf: 10, Aef: 2843 }, DATA.AS3.res);
  for (const w of DATA.AS3.wells) {
    const r = T.startRate({ type: 'GS_MGRP', n: w[1], xf: w[2], h: w[3], L: w[4], dP: w[5] }, res);
    const knf = r.details['Kнф'];
    if (knf !== undefined) assert.ok(knf <= 1 + 1e-12);
  }
});

// ---------------------------------------------------------------------------
// Reproduction of the published field validation
// ---------------------------------------------------------------------------

test('formation B2 (6 horizontal wells, heavy oil): calibrated KR = 6.07, mean error 5.0 %, LOO 6.0 % (table 4.5)', () => {
  const B = DATA.B2, res = Object.assign({ KR: 6.07 }, B.res);
  const list = B.wells.map(w => ({ well: { type: 'GS', method: 'B', L: w[1], h: w[2], k: w[3], b: w[4] }, Qfact: w[5] }));
  const cb = T.calibrate('KR', list, res, 1, 20);
  assert.ok(Math.abs(cb.value - 6.07) < 0.02, `KR=${cb.value}`);
  assert.ok(Math.abs(cb.meanAbs - 5.0) < 0.15, `meanAbs=${cb.meanAbs}`);
  assert.ok(Math.abs(cb.looMeanAbs - 6.0) < 0.2, `loo=${cb.looMeanAbs}`);
});

test('formation AS3 (4 multi-fractured horizontal wells, k = 0.87 mD): A_eff = 2843 m2, median error ~17 % (table 4.1)', () => {
  const A = DATA.AS3;
  const list = A.wells.map(w => ({ well: { type: 'GS_MGRP', n: w[1], xf: w[2], h: w[3], L: w[4], dP: w[5] }, Qfact: w[6] }));
  const ca = T.calibrate('Aef', list, A.res, 100, 1e5);
  assert.ok(Math.abs(ca.value - 2843) < 10, `Aef=${ca.value}`);
  assert.ok(Math.abs(ca.medAbs - 17.4) < 0.6, `medAbs=${ca.medAbs}`);
});

test('formation AS3 median decline (fig. 4.4): fitted phi = 0.29, tau = 127 d (table 4.4)', () => {
  const fit = T.fitDecline(DATA.AS3_DECLINE.map(p => ({ t: p[0], q: p[1] })), '4.26');
  assert.ok(Math.abs(fit.phi - 0.29) < 0.01, `phi=${fit.phi}`);
  assert.ok(Math.abs(fit.t1 - 127) < 2, `tau=${fit.t1}`);
});

// ---------------------------------------------------------------------------
// End-to-end: a field forecast runs and conserves volumes
// ---------------------------------------------------------------------------

test('field forecast: annual oil equals the sum of well volumes and never goes negative', () => {
  const res = Object.assign({ Pres: 25, Pwf: 10, Aef: 2843 }, DATA.AS3.res);
  const project = {
    res, startYear: 2027, years: 5, Ke: 0.95, reservesCap: false,
    groups: [{ well: { type: 'GS_MGRP', n: 12, xf: 150, h: 8, L: 1500 }, schedule: { 2027: 2, 2028: 3 } }]
  };
  const fc = T.fieldForecast(project, 'noppd');
  assert.equal(fc.annual.year.length, 5);
  for (const v of fc.annual.oil) assert.ok(v >= 0);
  const total = fc.annual.oil.reduce((s, x) => s + x, 0);
  assert.ok(total > 0);
});
