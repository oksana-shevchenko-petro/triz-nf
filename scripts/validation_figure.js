'use strict';
// Writes docs/validation.json: calculated vs measured rates for the two published field cases.
// Figure is drawn by scripts/validation_figure.py (matplotlib).
const fs = require('fs');
const T = require('../src/core.js');
const g = {}; new Function('self', fs.readFileSync(__dirname + '/../src/data.js', 'utf8'))(g);
const DATA = g.TRIZ_DATA;

const B = DATA.B2, resB = Object.assign({ KR: 6.07 }, B.res);
const listB = B.wells.map(w => ({ name: w[0], well: { type: 'GS', method: 'B', L: w[1], h: w[2], k: w[3], b: w[4] }, Qfact: w[5] }));
const cb = T.calibrate('KR', listB, resB, 1, 20);

const A = DATA.AS3;
const listA = A.wells.map(w => ({ name: w[0], well: { type: 'GS_MGRP', n: w[1], xf: w[2], h: w[3], L: w[4], dP: w[5] }, Qfact: w[6] }));
const ca = T.calibrate('Aef', listA, A.res, 100, 1e5);

const fit = T.fitDecline(DATA.AS3_DECLINE.map(p => ({ t: p[0], q: p[1] })), '4.26');
const curve = [];
for (let t = 0; t <= 960; t += 10) curve.push([t, fit.Q0 * T.declineF(t, fit.a, fit.t1, fit.t2)]);

fs.writeFileSync(__dirname + '/../docs/validation.json', JSON.stringify({
  B2: { KR: cb.value, meanAbs: cb.meanAbs, loo: cb.looMeanAbs, wells: listB.map((w, i) => ({ name: w.name, fact: w.Qfact, calc: cb.Q[i] })) },
  AS3: { Aef: ca.value, medAbs: ca.medAbs, wells: listA.map((w, i) => ({ name: w.name, fact: w.Qfact, calc: ca.Q[i] })) },
  decline: { phi: fit.phi, tau: fit.t1, points: DATA.AS3_DECLINE, curve }
}, null, 1));
console.log('B2 KR=%s meanAbs=%s%%  AS3 Aef=%s medAbs=%s%%  decline phi=%s tau=%s', cb.value.toFixed(2), cb.meanAbs.toFixed(1), ca.value.toFixed(0), ca.medAbs.toFixed(1), fit.phi.toFixed(2), fit.t1.toFixed(0));
