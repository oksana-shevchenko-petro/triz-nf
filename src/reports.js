/* ТРИЗ-НФ — формирование отчётов: Excel (XLSX), Word (DOCX), PowerPoint (PPTX). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./econ.js'), require('./xlsxw.js'), require('docx'), require('pptxgenjs'));
  else root.TRIZ_REPORTS = factory(root.TRIZ, root.TRIZ_ECON, root.XLSXW, root.docx, root.PptxGenJS);
}(typeof self !== 'undefined' ? self : this, function (T, E, XW, D, PptxGenJS) {
  'use strict';
  var f = T.fmt;
  var SC = { noppd: 'Без ППД', ppd: 'С ППД' };
  var PROGRAM = 'ТРИЗ-НФ ' + T.VERSION;
  var COPY = '© Шевченко О.Н. Программа «ТРИЗ-НФ». Все права защищены.';

  var FORMULAS = [
    ['Метод A — эффективная поверхность фильтрации (скважины с трещинами ГРП и МГРП, многоствольные, наклонные)', [
      'QД = n·2πkhΔP / (μ·[ln(Rd/rf) + S]) · 86400/B;  Rd = √(s(s + 2xf)/π);  rf = xf/2;  s = L/n   (4.3)',
      'Kнф = min{1; (Aэф/Aт)^γ};  Aт = 2·n·xf·h   (4.4)',
      'Q₀ = Kнф·QД   (4.5)']],
    ['Метод B — фильтрация с предельным градиентом (высоковязкая нефть; все конструкции через зону дренирования)', [
      'Rэкв = KR·√(χt), χ = k/(μβ*);  либо Rэкв = (√(L² + πSд) − L)/π   (4.6а), (4.29б)',
      'R = L/2 + Rэкв;  r = h/2;  F = 2πRr   (4.29)',
      'grad P − G = (μ/k)·v + b·v²;  v = [−μ/k + √((μ/k)² + 4b(grad P − G))]/(2b)   (4.30)',
      'Q₀ = 86400·v·F/B   (4.31)']],
    ['Метод C — двучленное уравнение притока к горизонтальному стволу в пласте-полосе (ГС, БГС, волнообразная ГС, МЗС)', [
      'pк − pс = μΦ(r*)/(4πk)·q + C(q/2π)ⁿ·(r*^(1−n) − rс^(1−n))/(1 − n)   (3.36)',
      'r* = q/(2πω*);  ω* = (μ/(kC))^(1/(n−1))   (3.39);  Q₀ = q·L·86400/B']],
    ['Падение дебита', [
      'Без ППД: Q(t) = Q₀[a·e^(−t/τ₁) + (1 − a)·e^(−t/τ₂)]   (4.34)',
      'С ППД (τ₂ → ∞): Q(t) = Q₀[φ + (1 − φ)·e^(−t/τ)]   (4.26);  τ = β*·KV·V·ΔP/(B·Q₀);  φ ≈ 0,08 + 0,12k   (4.32)']]
  ];
  var EXT_NOTE = 'Формулы (4.3)–(4.5) идентифицированы по ГС с МГРП пласта АС3, формулы (4.29)–(4.31) — по ГС пласта Б2. Для остальных конструкций (ВС, ННС, пологие скважины, боковые стволы, ГС с продольным ГРП, волнообразные ГС, МЗС, МЗС с МГРП, фишбоны, радиальное вскрытие) программа применяет те же уравнения через эквивалентную геометрию: наклонный ствол — с псевдоскином Cinco-Ley, ответвления и радиальные каналы — как эквивалентные трещины с эффективным радиусом «звезды» и скином схождения, зона дренирования многоствольной скважины — по площади объединения зон отдельных стволов. Эти расширения требуют калибровки Aэф, KR и Kи по скважинам-аналогам объекта.';

  function compRows(R) {
    return [
      ['Накопленная добыча нефти за рентабельный период, тыс. т', R.ev.noppd.oilTotal / 1e3, R.ev.ppd.oilTotal / 1e3, 1],
      ['Рентабельный срок, лет', R.ev.noppd.rentYears, R.ev.ppd.rentYears, 0],
      ['Капитальные вложения, млн руб', R.ev.noppd.capexTotal / 1e6, R.ev.ppd.capexTotal / 1e6, 0],
      ['ЧД, млн руб', R.ev.noppd.NCF / 1e6, R.ev.ppd.NCF / 1e6, 0],
      ['ЧДД, млн руб', R.ev.noppd.NPV / 1e6, R.ev.ppd.NPV / 1e6, 0],
      ['ВНД, %', Math.min(R.ev.noppd.IRR, 10) * 100, Math.min(R.ev.ppd.IRR, 10) * 100, 1],
      ['ИД, д. ед.', R.ev.noppd.PI, R.ev.ppd.PI, 2],
      ['Срок окупаемости (дисконт.), лет', R.ev.noppd.DPP, R.ev.ppd.DPP, 1],
      ['Цена безубыточности Urals, $/барр', R.sens.noppd.breakEvenUrals, R.sens.ppd.breakEvenUrals, 1]
    ];
  }

  function conclusions(P, R) {
    var a = R.ev.noppd, b = R.ev.ppd, out = [];
    var best = b.NPV > a.NPV ? 'ppd' : 'noppd';
    out.push('Стартовые дебиты рассчитаны по нелинейному закону фильтрации: ' + R.starts.map(function (s, i) { return P.groups[i].name + ' — ' + f(s.Qliq, 1) + ' м³/сут жидкости (' + f(s.Qoil, 1) + ' т/сут нефти, метод ' + s.method + ')'; }).join('; ') + '.');
    out.push('Накопленная добыча нефти за рентабельный период: без ППД — ' + f(a.oilTotal / 1e3, 0) + ' тыс. т, с ППД — ' + f(b.oilTotal / 1e3, 0) + ' тыс. т.');
    out.push('ЧДД при ставке ' + T.num((P.econ || {}).discountRate, 15) + ' %: без ППД — ' + f(a.NPV / 1e6, 0) + ' млн руб, с ППД — ' + f(b.NPV / 1e6, 0) + ' млн руб. По критерию ЧДД предпочтителен вариант «' + SC[best] + '».');
    var it = R.sens[best].items.slice().sort(function (x, y) { return Math.abs(y.high - y.low) - Math.abs(x.high - x.low); })[0];
    out.push('Наибольшее влияние на ЧДД варианта «' + SC[best] + '» оказывает параметр «' + it.name + '» (±' + Math.round(R.sens[best].delta * 100) + ' % → ЧДД от ' + f(it.low / 1e6, 0) + ' до ' + f(it.high / 1e6, 0) + ' млн руб).');
    var warn = []; R.starts.forEach(function (s, i) { s.warnings.forEach(function (w) { warn.push(P.groups[i].name + ': ' + w); }); });
    if (warn.length) out.push('Предупреждения расчёта: ' + warn.join(' '));
    out.push('Прогноз носит оценочный характер; параметры Aэф, KR, φ, τ рекомендуется уточнять по фактическим стартовым дебитам, забойным давлениям и динамике добычи скважин-аналогов.');
    return out;
  }

  /* ================================================================== */
  /* EXCEL                                                              */
  /* ================================================================== */
  function buildXlsx(P, R) {
    var wb = XW.workbook(); wb.props = { title: 'Прогноз добычи — ' + (P.meta.field || ''), author: P.meta.author || '', app: PROGRAM };
    var res = P.res, e = Object.assign({}, E.DEFAULTS, P.econ || {});
    // --- Сводка
    var s = wb.sheet('Сводка', { cols: [52, 18, 18] });
    s.row([{ v: 'Прогноз добычи нефти и экономическая оценка', s: 'title' }]);
    s.row([{ v: (P.meta.name || '') + (P.meta.field ? ' — ' + P.meta.field : ''), s: 'note' }]);
    s.row([{ v: 'Сформировано программой ' + PROGRAM + ', ' + new Date().toLocaleDateString('ru-RU'), s: 'note' }]);
    s.row([]);
    s.row([{ v: 'Показатель', s: 'h' }, { v: 'Без ППД', s: 'h' }, { v: 'С ППД', s: 'h' }]);
    compRows(R).forEach(function (r) { s.row([{ v: r[0], s: 'tc' }, { v: r[1], s: r[3] ? 'n1' : 'n0' }, { v: r[2], s: r[3] ? 'n1' : 'n0' }]); });
    s.row([]);
    s.row([{ v: 'Выводы', s: 'b' }]);
    conclusions(P, R).forEach(function (t) { s.row([{ v: t, s: 'note' }]); });
    s.row([]); s.row([{ v: COPY, s: 'note' }]);

    // --- Исходные данные
    var d = wb.sheet('Исходные данные', { cols: [46, 16, 14] });
    d.row([{ v: 'Параметры объекта разработки', s: 'title' }]);
    d.row([{ v: 'Параметр', s: 'h' }, { v: 'Значение', s: 'h' }, { v: 'Ед. изм.', s: 'h' }]);
    RES_FIELDS.forEach(function (fl) { if (res[fl[0]] !== undefined && typeof res[fl[0]] !== 'object') d.row([fl[1], { v: isNaN(+res[fl[0]]) ? String(res[fl[0]]) : +res[fl[0]], s: isNaN(+res[fl[0]]) ? '' : 'in' }, fl[2]]); });
    d.row([]);
    d.row([{ v: 'Группы скважин', s: 'b' }]);
    d.row([{ v: 'Группа', s: 'h' }, { v: 'Тип', s: 'h' }, { v: 'Параметры', s: 'h' }]);
    P.groups.forEach(function (g) { d.row([g.name, T.TYPES[g.well.type].name, { v: wellParamText(g.well), s: 'tc' }]); });
    d.row([]);
    d.row([{ v: 'График ввода скважин, шт.', s: 'b' }]);
    var yrs = R.fc.noppd.annual.year;
    d.row([{ v: 'Группа', s: 'h' }].concat(yrs.slice(0, 12).map(function (y) { return { v: String(y), s: 'h' }; })));
    P.groups.forEach(function (g) { d.row([g.name].concat(yrs.slice(0, 12).map(function (y) { return { v: T.num((g.schedule || {})[y], 0), s: 'n0' }; }))); });

    // --- Стартовые дебиты (формулы)
    var q = wb.sheet('Стартовые дебиты', { cols: [22, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 12, 12, 12, 10, 12, 12] });
    q.row([{ v: 'Стартовые дебиты: расчёт по формулам (ячейки с синим шрифтом — исходные данные, остальные — формулы Excel)', s: 'b' }]);
    q.row([{ v: 'Метод A: QД = n·2πkhΔP/(μ[ln(Rd/rf)+S])·86400/B (4.3); Kнф = min{1; Aэф/Aт} (4.4); Q = Kнф·QД (4.5)', s: 'note' }]);
    var hA = ['Группа', 'N стволов', 'n на ствол', 'xf, м', 'L ствола, м', 'h, м', 'k, мД', 'ΔP, МПа', 'μ, мПа·с', 'B', 'S', 's = L/n', 'Rd, м', 'rf, м', 'QД, м³/сут', 'Aт, м²', 'Aэф скв., м²', 'Kнф', 'Q₀, м³/сут'];
    q.row(hA.map(function (h) { return { v: h, s: 'h' }; }));
    var anyA = false;
    P.groups.forEach(function (g, gi) {
      var sr = R.starts[gi], w = g.well, p = sr.props;
      var fm = T.fam(w);
      if (sr.method !== 'A' || ['mgrp', 'mzsfrac', 'fish'].indexOf(fm) < 0) return;
      anyA = true;
      var N = 1, n, xf, L, S = T.num(w.S, 0);
      if (fm === 'mgrp') { n = T.num(w.n, 10); xf = T.num(w.xf, 100); L = T.num(w.L, 1000); }
      else if (fm === 'mzsfrac') { N = Math.max(1, Math.round(T.num(w.nLat, 2))); n = T.num(w.nLat_st, 4); xf = T.num(w.xfLat, 60); L = T.num(w.Llat, 500); }
      else { n = Math.max(1, Math.round(T.num(w.nRib, 10))) / 2; xf = sr.details['проекция ответвления p = l·sinθ, м']; L = T.num(w.L, 1000); S += sr.details['скин схождения ответвления'] || 0; }
      var r = q.next(), c = function (col) { return XW.colName(col) + r; };
      var aefW = sr.details['Aэф скважины, м²'];
      q.row([g.name, { v: N, s: 'in' }, { v: n, s: 'in' }, { v: xf, s: 'in' }, { v: L, s: 'in' }, { v: p.h, s: 'in' }, { v: p.k, s: 'in' }, { v: p.dP, s: 'in' }, { v: p.mu, s: 'in' }, { v: p.B, s: 'in' }, { v: S, s: 'in' },
        { f: c(4) + '/' + c(2), v: L / n, s: 'n1' },
        { f: 'SQRT(' + c(11) + '*(' + c(11) + '+2*' + c(3) + ')/PI())', v: sr.details['Rd, м'], s: 'n1' },
        { f: c(3) + '/2', v: xf / 2, s: 'n1' },
        { f: c(1) + '*' + c(2) + '*2*PI()*' + c(6) + '*1E-15*' + c(5) + '*' + c(7) + '*1E6/(' + c(8) + '*0.001*(LN(' + c(12) + '/' + c(13) + ')+' + c(10) + '))*86400/' + c(9), v: sr.details['QД (Дарси), м³/сут'], s: 'n1' },
        { f: '2*' + c(1) + '*' + c(2) + '*' + c(3) + '*' + c(5), v: sr.details['Aт, м²'], s: 'n0' },
        { v: aefW, s: 'in' },
        { f: 'MIN(1,(' + c(16) + '/' + c(15) + ')^' + T.num(res.gamma, 1) + ')', v: sr.details['Kнф'], s: 'n3' },
        { f: c(17) + '*' + c(14), v: sr.Qliq, s: 'bn1' }]);
    });
    if (!anyA) q.row([{ v: 'нет групп, рассчитанных методом A по трещинам', s: 'note' }]);
    q.row([]);
    q.row([{ v: 'Метод B: Rэкв = KR·√(χt); F = 2π(Lэкв/2 + Rэкв)(h/2) (4.29); v — корень (4.30); Q = 86400·v·F/B (4.31)', s: 'note' }]);
    var hB = ['Группа', 'Lэкв, м', 'h, м', 'k, мД', 'μ, мПа·с', 'B', 'b, Па·с²/м³', 'grad P − G, МПа/м', 'χ, м²/с', 'Rэкв, м', 'μ/k', 'v, м/с', 'F, м²', 'Q₀, м³/сут'];
    q.row(hB.map(function (h) { return { v: h, s: 'h' }; }));
    var anyB = false;
    P.groups.forEach(function (g, gi) {
      var sr = R.starts[gi], p = sr.props, dd = sr.details;
      if (sr.method !== 'B') return;
      anyB = true;
      var r = q.next(), c = function (col) { return XW.colName(col) + r; };
      q.row([g.name, { v: dd['Lэкв по оси, м'], s: 'in' }, { v: p.h, s: 'in' }, { v: p.k, s: 'in' }, { v: p.mu, s: 'in' }, { v: p.B, s: 'in' }, { v: dd['b, Па·с²/м³'], s: 'in' }, { v: dd['(grad P − G), МПа/м'], s: 'in' }, { v: dd['χ, м²/с'], s: 'in' }, { v: dd['Rэкв, м'], s: 'in' },
        { f: c(4) + '*0.001/(' + c(3) + '*1E-15)', v: dd['μ/k, Па·с/м²'], s: 'n0' },
        { f: '(-' + c(10) + '+SQRT(' + c(10) + '^2+4*' + c(6) + '*' + c(7) + '*1E6))/(2*' + c(6) + ')', v: dd['v, м/с'] },
        { f: '2*PI()*(' + c(1) + '/2+' + c(9) + ')*' + c(2) + '/2', v: dd['F = 2πRr, м²'], s: 'n0' },
        { f: '86400*' + c(11) + '*' + c(12) + '/' + c(5), v: sr.Qliq, s: 'bn1' }]);
    });
    if (!anyB) q.row([{ v: 'нет групп, рассчитанных методом B', s: 'note' }]);
    q.row([]);
    q.row([{ v: 'Все группы (итог)', s: 'b' }]);
    q.row(['Группа', 'Метод', 'Qж, м³/сут', 'Обв., %', 'Qн, т/сут', 'Предупреждения'].map(function (h) { return { v: h, s: 'h' }; }));
    P.groups.forEach(function (g, gi) { var sr = R.starts[gi]; q.row([g.name, sr.method, { v: sr.Qliq, s: 'n1' }, { v: sr.fw0 * 100, s: 'n1' }, { v: sr.Qoil, s: 'n1' }, { v: sr.warnings.join(' '), s: 'note' }]); });

    // --- Сравнение конструкций
    if (R.cmp) {
      var cm = wb.sheet('Сравнение конструкций', { cols: [16, 8, 12, 12, 14, 16, 14, 12, 14, 14, 14] });
      cm.row([{ v: 'Сравнение конструкций: одна скважина каждого типа (шаблоны) при текущих свойствах объекта', s: 'b' }]);
      cm.row(['Тип', 'Метод', 'Qж₀, м³/сут', 'Qн₀, т/сут', 'Нефть 1 год, т', 'Нефть 10 лет без ППД, т', 'Нефть 10 лет с ППД, т', 'CAPEX, млн руб', 'Уд. CAPEX, руб/т', 'ЧДД без ППД, млн руб', 'ЧДД с ППД, млн руб'].map(function (h) { return { v: h, s: 'h' }; }));
      R.cmp.forEach(function (c) { cm.row([c.name, c.start.method, { v: c.start.Qliq, s: 'n1' }, { v: c.start.Qoil, s: 'n1' }, { v: c.noppd.oil1, s: 'n0' }, { v: c.noppd.oil10, s: 'n0' }, { v: c.ppd.oil10, s: 'n0' }, { v: c.capex, s: 'n0' }, { v: c.noppd.unit, s: 'n0' }, { v: c.noppd.NPV / 1e6, s: 'n0' }, { v: c.ppd.NPV / 1e6, s: 'n0' }]); });
    }

    // --- Профили и экономика
    ['noppd', 'ppd'].forEach(function (sc) {
      var A = R.fc[sc].annual, pr = wb.sheet('Добыча ' + SC[sc].toLowerCase(), { cols: [8, 14, 14, 14, 10, 10, 12, 10, 14] , freeze: 'A3' });
      pr.row([{ v: 'Профиль добычи — вариант «' + SC[sc] + '»', s: 'title' }]);
      pr.row(['Год', 'Нефть, т', 'Жидкость, м³', 'Вода, м³', 'Обводн., %', 'Ввод скв.', 'Фонд доб.', 'Нагн. скв.', 'Закачка, м³'].map(function (h) { return { v: h, s: 'h' }; }));
      var r0 = pr.next();
      A.year.forEach(function (y, i) { pr.row([y, { v: A.oil[i], s: 'n0' }, { v: A.liq[i], s: 'n0' }, { v: A.water[i], s: 'n0' }, { v: A.fw[i] * 100, s: 'n1' }, { v: A.newWells[i], s: 'n0' }, { v: A.activeWells[i], s: 'n0' }, { v: A.injWells[i], s: 'n0' }, { v: A.inj[i], s: 'n0' }]); });
      var r1 = pr.next() - 1;
      pr.row([{ v: 'Итого', s: 'b' }, { f: 'SUM(B' + r0 + ':B' + r1 + ')', v: A.oil.reduce(sum, 0), s: 'bn0' }, { f: 'SUM(C' + r0 + ':C' + r1 + ')', v: A.liq.reduce(sum, 0), s: 'bn0' }, { f: 'SUM(D' + r0 + ':D' + r1 + ')', v: A.water.reduce(sum, 0), s: 'bn0' }]);
      pr.row([]);
      pr.row([{ v: 'Добыча нефти по группам, т', s: 'b' }]);
      pr.row([{ v: 'Год', s: 'h' }].concat(A.byGroup.map(function (g) { return { v: g.name, s: 'h' }; })));
      A.year.forEach(function (y, i) { pr.row([y].concat(A.byGroup.map(function (g) { return { v: g.oil[i], s: 'n0' }; }))); });

      var ev = R.ev[sc], ec = wb.sheet('Экономика ' + SC[sc].toLowerCase(), { cols: [8, 12, 12, 12, 15, 15, 15, 14, 14, 15, 14, 15, 15, 14, 9, 15, 15], freeze: 'B4' });
      ec.row([{ v: 'Денежный поток — вариант «' + SC[sc] + '», руб (ставка дисконтирования в ячейке B2)', s: 'title' }]);
      ec.row(['Ставка, д.ед.', { v: T.num(e.discountRate, 15) / 100, s: 'in' }]);
      var H = ['Год', 'Нефть, т', 'Нетбэк, руб/т', 'НДПИ, руб/т', 'Выручка', 'НДПИ', 'ОРЕХ', 'Амортизация', 'Налог на имущ.', 'Прибыль до налога', 'Налог на прибыль', 'Чистая прибыль', 'CAPEX', 'Денежный поток', 'Коэф. диск.', 'ДДП', 'Накопл. ДДП'];
      ec.row(H.map(function (h) { return { v: h, s: 'h' }; }));
      var e0 = ec.next();
      ev.rows.forEach(function (rw, i) {
        var r = ec.next(), c = function (col) { return XW.colName(col) + r; };
        ec.row([rw.year, { v: rw.oil, s: 'n0' }, { v: rw.price, s: 'n0' }, { v: rw.ndpiT, s: 'n0' },
          { f: c(1) + '*' + c(2), v: rw.revenue, s: 'n0' }, { f: c(1) + '*' + c(3), v: rw.ndpi, s: 'n0' }, { v: rw.opex, s: 'n0' }, { v: rw.depr, s: 'n0' }, { v: rw.propTax, s: 'n0' },
          { f: c(4) + '-' + c(5) + '-' + c(6) + '-' + c(7) + '-' + c(8), v: rw.pbt, s: 'n0' }, { v: rw.profitTax, s: 'n0' },
          { f: c(9) + '-' + c(10), v: rw.net, s: 'n0' }, { v: rw.capex, s: 'n0' },
          { f: c(11) + '+' + c(7) + '-' + c(12), v: rw.cf, s: 'n0' }, { f: '1/(1+$B$2)^' + i, v: rw.df, s: 'n3' },
          { f: c(13) + '*' + c(14), v: rw.dcf, s: 'n0' }, { f: i === 0 ? c(15) : c(15) + '+Q' + (r - 1), v: rw.dcum, s: 'n0' }]);
      });
      var e1 = ec.next() - 1;
      ec.row([]);
      ec.row([{ v: 'ЧДД, руб', s: 'b' }, { f: 'SUM(P' + e0 + ':P' + e1 + ')', v: ev.NPV, s: 'bn0' }]);
      ec.row([{ v: 'ЧД, руб', s: 'b' }, { f: 'SUM(N' + e0 + ':N' + e1 + ')', v: ev.NCF, s: 'bn0' }]);
      ec.row([{ v: 'ВНД', s: 'b' }, { f: 'IRR(N' + e0 + ':N' + e1 + ')', v: ev.IRR, s: 'pct' }]);
      ec.row([{ v: 'ИД', s: 'b' }, { v: ev.PI, s: 'n2' }]);
      ec.row([{ v: 'Срок окупаемости дисконтированный, лет', s: 'b' }, { v: ev.DPP, s: 'n1' }]);
      ec.row([{ v: 'Налог на прибыль и налог на имущество рассчитаны программой (перенос убытков, остаточная стоимость); ОРЕХ — по удельным затратам листа «Исходные данные».', s: 'note' }]);
    });

    // --- Добыча по скважинам и годам: итог по объекту = сумма по всем скважинам (формулы SUM)
    ['noppd', 'ppd'].forEach(function (sc) { wellSheet(wb, R.fc[sc], sc); });
    // --- Вероятностная оценка
    if (R.prob) probSheet(wb, P, R.prob);

    // --- Чувствительность
    var sn = wb.sheet('Чувствительность', { cols: [34, 16, 16, 16] });
    ['noppd', 'ppd'].forEach(function (sc) {
      var S = R.sens[sc];
      sn.row([{ v: 'Чувствительность ЧДД, млн руб — «' + SC[sc] + '» (±' + Math.round(S.delta * 100) + ' %)', s: 'b' }]);
      sn.row(['Фактор', '−' + Math.round(S.delta * 100) + ' %', 'База', '+' + Math.round(S.delta * 100) + ' %'].map(function (h) { return { v: h, s: 'h' }; }));
      S.items.forEach(function (it) { sn.row([it.name, { v: it.low / 1e6, s: 'n0' }, { v: S.base / 1e6, s: 'n0' }, { v: it.high / 1e6, s: 'n0' }]); });
      sn.row(['Цена безубыточности Urals, $/барр', { v: S.breakEvenUrals, s: 'n1' }]);
      sn.row([]);
    });
    // --- Экономические допущения
    var ea = wb.sheet('Экон. допущения', { cols: [52, 16] });
    ea.row([{ v: 'Экономические допущения', s: 'title' }]);
    ECON_FIELDS.forEach(function (fl) { var v = e[fl[0]]; if (v !== undefined && v !== '' && typeof v !== 'object' && !(typeof v === 'number' && !isFinite(v))) ea.row([fl[1], { v: isNaN(+v) ? String(v) : +v, s: 'in' }]); });
    Object.keys(E.DEFAULTS.capex).forEach(function (k) { ea.row(['CAPEX: ' + CAPEX_NAMES[k] + ', млн руб', { v: T.num((e.capex || {})[k], E.DEFAULTS.capex[k]), s: 'in' }]); });
    var nd = E.ndpi(e, 0);
    if (typeof nd === 'object') { ea.row(['НДПИ (1-й год), руб/т', { v: nd.value, s: 'n0' }]); ea.row(['Кц', { v: nd.Kc, s: 'n3' }]); ea.row(['Дм, руб/т', { v: nd.Dm, s: 'n0' }]); ea.row(['Кман, руб/т', { v: nd.Kman, s: 'n0' }]); }
    ea.row([{ v: 'Значения коэффициентов НДПИ (Кк, Кабдт, Кд и др.) проверяйте по действующей редакции ст. 342, 342.2, 342.5 НК РФ.', s: 'note' }]);

    // --- Помесячно
    var mo = wb.sheet('Помесячно', { cols: [10, 14, 14, 14, 14], freeze: 'A2' });
    mo.row(['Месяц', 'Нефть без ППД, т', 'Жидкость без ППД, м³', 'Нефть с ППД, т', 'Жидкость с ППД, м³'].map(function (h) { return { v: h, s: 'h' }; }));
    var M = R.fc.noppd.monthly.oil.length, Y0 = R.fc.noppd.startYear;
    for (var i = 0; i < M; i++) mo.row([(Y0 + Math.floor(i / 12)) + '-' + ('0' + (i % 12 + 1)).slice(-2), { v: R.fc.noppd.monthly.oil[i], s: 'n0' }, { v: R.fc.noppd.monthly.liq[i], s: 'n0' }, { v: R.fc.ppd.monthly.oil[i], s: 'n0' }, { v: R.fc.ppd.monthly.liq[i], s: 'n0' }]);
    return wb;
  }
  function sum(a, b) { return a + b; }

  function wellSheet(wb, fc, sc) {
    var Y = fc.annual.year, W = fc.wells || [], ws = wb.sheet('По скважинам ' + SC[sc].toLowerCase(), { cols: [30, 18, 9, 7, 7].concat(Y.map(function () { return 11; })).concat([13]), freeze: 'F4' });
    var c0 = 5, lastC = c0 + Y.length - 1, totC = lastC + 1;
    function block(title, key, unit) {
      ws.row([{ v: title + ' по скважинам и годам, ' + unit + ' — вариант «' + SC[sc] + '». Итог по объекту — сумма по всем скважинам.', s: 'b' }]);
      ws.row([{ v: 'Скважина', s: 'h' }, { v: 'Группа (тип)', s: 'h' }, { v: 'Ввод, год', s: 'h' }, { v: 'Мес.', s: 'h' }, { v: 'Доля', s: 'h' }].concat(Y.map(function (y) { return { v: y, s: 'h' }; })).concat([{ v: 'Итого', s: 'h' }]));
      var r0 = ws.next();
      W.forEach(function (w) {
        var r = ws.next();
        ws.row([w.name, w.groupName, w.startYear, w.startMonth, { v: w.share, s: 'n2' }].concat(w[key].map(function (v) { return { v: v, s: 'n0' }; }))
          .concat([{ f: 'SUM(' + XW.colName(c0) + r + ':' + XW.colName(lastC) + r + ')', v: w[key].reduce(sum, 0), s: 'bn0' }]));
      });
      var r1 = ws.next() - 1, tot = key === 'oil' ? fc.annual.oil : fc.annual.liq;
      ws.row([{ v: 'Итого по объекту (сумма скважин)', s: 'b' }, '', '', '', ''].concat(Y.map(function (y, i) { var cl = XW.colName(c0 + i); return { f: 'SUM(' + cl + r0 + ':' + cl + r1 + ')', v: tot[i], s: 'bn0' }; }))
        .concat([{ f: 'SUM(' + XW.colName(totC) + r0 + ':' + XW.colName(totC) + r1 + ')', v: tot.reduce(sum, 0), s: 'bn0' }]));
      ws.row([]);
    }
    block('Добыча нефти', 'oil', 'т');
    block('Добыча жидкости', 'liq', 'м³');
    ws.row([{ v: 'Скважины одной группы имеют одинаковый профиль, сдвинутый на дату ввода; дробный ввод (доля < 1) учитывается долей скважины. Добыча учтена с коэффициентом эксплуатации и ограничением по извлекаемым запасам.', s: 'note' }]);
  }
  function probRows(P, PR) {
    var rows = [];
    PR.groups.forEach(function (g) { rows.push(['Стартовый дебит жидкости: ' + g.name + ', м³/сут', g.liq, 1, g.base]); });
    PR.groups.forEach(function (g) { rows.push(['Стартовый дебит нефти: ' + g.name + ', т/сут', g.oil, 1]); });
    rows.push(['Суммарный стартовый дебит жидкости всех вводимых скважин, м³/сут', PR.field.qStart, 0]);
    ['noppd', 'ppd'].forEach(function (sc) {
      var F = PR.field[sc]; if (!F) return;
      rows.push(['Накопленная добыча нефти за ' + T.num(P.years, 20) + ' лет, тыс. т — ' + SC[sc].toLowerCase(), scale(F.cumOil, 1e-3), 0]);
      if (F.npv) rows.push(['ЧДД, млн руб — ' + SC[sc].toLowerCase(), scale(F.npv, 1e-6), 0]);
    });
    return rows;
  }
  function scale(o, k) { return { P90: o.P90 * k, P50: o.P50 * k, P10: o.P10 * k, mean: o.mean * k }; }
  function probSheet(wb, P, PR) {
    var s = wb.sheet('P90-P50-P10', { cols: [62, 13, 13, 13, 13, 13] });
    s.row([{ v: 'Вероятностная оценка (метод Монте-Карло): P90 — пессимистичная, P50 — медиана, P10 — оптимистичная', s: 'title' }]);
    s.row([{ v: 'P90 превышается с вероятностью 90 %, P10 — с вероятностью 10 % (SPE-PRMS). Реализаций: ' + PR.n + ' для дебитов, ' + PR.nProd + ' для добычи и ЧДД.', s: 'note' }]);
    s.row(['Показатель', 'P90', 'P50', 'P10', 'Среднее', 'Детерм. расчёт'].map(function (h) { return { v: h, s: 'h' }; }));
    probRows(P, PR).forEach(function (r) { var st = r[2] ? 'n1' : 'n0'; s.row([{ v: r[0], s: 'tc' }, { v: r[1].P90, s: st }, { v: r[1].P50, s: st }, { v: r[1].P10, s: st }, { v: r[1].mean, s: st }, r[3] !== undefined ? { v: r[3], s: st } : '']); });
    s.row([]);
    s.row([{ v: 'Неопределённые параметры (множители к базовым значениям, одинаковые для всех групп в одной реализации)', s: 'b' }]);
    s.row(['Параметр', 'Нижн., %', 'Верхн., %', 'Распределение'].map(function (h) { return { v: h, s: 'h' }; }));
    var DN = { tri: 'треугольное', uni: 'равномерное', logn: 'логнормальное (границы — P90/P10)' };
    PR.params.forEach(function (p) { s.row([p.name, { v: +p.low, s: 'n0' }, { v: +p.high, s: 'n0' }, DN[p.dist] || p.dist]); });
    ['noppd', 'ppd'].forEach(function (sc) {
      var F = PR.field[sc]; if (!F) return;
      s.row([]);
      s.row([{ v: 'Годовая добыча нефти, тыс. т — ' + SC[sc].toLowerCase(), s: 'b' }]);
      s.row(['Год', 'P90', 'P50', 'P10'].map(function (h) { return { v: h, s: 'h' }; }));
      F.yearOil.P50.forEach(function (v, i) { s.row([T.num(P.startYear, 2027) + i, { v: F.yearOil.P90[i] / 1e3, s: 'n1' }, { v: v / 1e3, s: 'n1' }, { v: F.yearOil.P10[i] / 1e3, s: 'n1' }]); });
    });
  }

  var RES_FIELDS = [
    ['k', 'Проницаемость k', '10⁻³ мкм²'], ['h', 'Нефтенасыщенная толщина h', 'м'], ['m', 'Пористость m', 'д.ед.'], ['So', 'Нефтенасыщенность', 'д.ед.'],
    ['mu', 'Вязкость нефти μ (пласт.)', 'мПа·с'], ['B', 'Объёмный коэффициент B', '—'], ['rho', 'Плотность нефти (дегаз.)', 'т/м³'],
    ['Pres', 'Пластовое давление', 'МПа'], ['Pwf', 'Забойное давление', 'МПа'], ['betaL', 'Сжимаемость жидкости βж', '1/МПа'], ['betaR', 'Сжимаемость породы βс', '1/МПа'],
    ['nLayers', 'Расчленённость (число пропластков)', 'шт.'], ['kvkh', 'Анизотропия kв/kг', 'д.ед.'], ['Aef', 'Эффективная поверхность фильтрации Aэф', 'м²'], ['gamma', 'Показатель γ', '—'], ['Rk', 'Радиус контура питания ННС Rк', 'м'],
    ['RekvMode', 'Способ расчёта Rэкв', ''], ['KR', 'Коэффициент KR', '—'], ['tR', 'Время t для Rэкв', 'сут'], ['spacingA', 'Расстояние между скважинами в ряду', 'м'], ['spacingB', 'Расстояние между рядами', 'м'],
    ['dgMode', 'Способ задания действующего градиента', ''], ['dg', 'Действующий градиент grad P − G', 'МПа/м'], ['Gmode', 'Предельный градиент G', ''], ['G', 'G (если задан)', 'МПа/м'],
    ['bMode', 'Коэффициент b', ''], ['b', 'b (если задан)', 'Па·с²/м³'], ['w', 'Полуширина пласта-полосы w', 'м'], ['KV', 'Коэффициент использования упругого запаса KV', 'д.ед.'], ['KIN', 'КИН', 'д.ед.']
  ];
  var ECON_FIELDS = [
    ['priceMode', 'Способ задания цены'], ['urals', 'Urals, $/барр'], ['discount', 'Дисконт к Urals, $/барр'], ['bblPerT', 'Баррелей в тонне'], ['usd', 'Курс, руб/$'], ['transport', 'Транспорт, руб/т'],
    ['netback', 'Нетбэк (если задан), руб/т'], ['priceGrowth', 'Рост цены, %/год'], ['costInflation', 'Инфляция затрат, %/год'], ['ndpiMode', 'Способ расчёта НДПИ'],
    ['Kz', 'Кз'], ['Kd', 'Кд'], ['KdFrom', 'Год выработанности 1 % (начало срока Кд)'], ['KdYears', 'Срок Кд, лет прогноза'], ['Kdv', 'Кдв'], ['Kkan', 'Ккан'], ['Kk', 'Кк, руб/т'], ['Kabdt', 'Кабдт, руб/т'], ['KmanMode', 'Кман'], ['Kman', 'Кман (если задан), руб/т'], ['ndpiManual', 'НДПИ (если задан), руб/т'],
    ['opexLiq', 'ОРЕХ на тонну жидкости, руб/т'], ['opexOil', 'ОРЕХ на тонну нефти, руб/т'], ['opexFixProd', 'Условно-пост. затраты на доб. скв., тыс. руб/год'], ['opexInj', 'Затраты на закачку, руб/м³'], ['opexFixInj', 'Условно-пост. затраты на нагн. скв., тыс. руб/год'],
    ['profitTax', 'Налог на прибыль, %'], ['propTax', 'Налог на имущество, %'], ['deprYears', 'Срок амортизации, лет'], ['discountRate', 'Ставка дисконтирования, %']
  ];
  var CAPEX_NAMES = { VS: 'ВС (бурение)', NNS: 'ННС (бурение)', PS: 'пологая скважина (бурение)', GS: 'ГС (бурение)', BS: 'зарезка бокового ствола', BGS: 'зарезка БГС', NNS_frac: 'одиночный ГРП', stage: 'стадия МГРП', latExtra: 'доп. ствол МЗС', rib: 'ответвление фишбона', radialCh: 'радиальный канал', infra: 'обустройство новой скважины', infraSide: 'обустройство бокового ствола', inj: 'нагнетательная скважина', injInfra: 'обустройство ППД на нагн. скв.' };

  function wellParamText(w) {
    var t = T.LEGACY_TYPES[w.type] || w.type, fm = T.fam(w), s = [], n = T.num;
    if (fm === 'vert' || fm === 'vfrac') { if (t !== 'VS') s.push('зенитный угол в пласте ' + n(w.alpha, t === 'PS' ? 80 : 30) + '°'); }
    if (fm === 'vfrac') s.push((t === 'NNS_MGRP' ? n(w.nZ, 3) + ' зоны ГРП, ' : 'ГРП, ') + 'xf = ' + n(w.xf, 80) + ' м');
    if (fm === 'gs' || fm === 'gslong' || fm === 'mgrp' || fm === 'fish') s.push('L = ' + n(w.L, 1000) + ' м');
    if (t === 'GS_WAVE') s.push('амплитуда ' + n(w.amp, 5) + ' м');
    if (fm === 'gslong') s.push('продольная трещина, xf = ' + n(w.xf, 420) + ' м');
    if (fm === 'mgrp') s.push('n = ' + n(w.n, 10), 'xf = ' + n(w.xf, 100) + ' м');
    if (fm === 'mzs' || fm === 'mzsfrac') s.push(n(w.nLat, 2) + ' ствола × ' + n(w.Llat, 500) + ' м');
    if (fm === 'mzsfrac') s.push(n(w.nLat_st, 4) + ' стадий МГРП на ствол, xf = ' + n(w.xfLat, 60) + ' м', 'Kи = ' + n(w.Kint, 0));
    if (fm === 'mzs') s.push('Kи = ' + n(w.Kint, 0.5));
    if (fm === 'fish') s.push(n(w.nRib, 10) + ' ответвлений × ' + n(w.lRib, 100) + ' м под ' + n(w.ribAngle, 45) + '°');
    if (fm === 'radial') s.push(n(w.nCh, 4) + ' каналов × ' + n(w.lCh, 100) + ' м, уровней ' + n(w.nLev, 1));
    s.push('обводнённость ' + n(w.fw0, 0) + ' %');
    if (w.k !== undefined && w.k !== '') s.push('k = ' + w.k + ' мД');
    if (w.h !== undefined && w.h !== '') s.push('h = ' + w.h + ' м');
    if (w.pumpOn) s.push('насос ' + n(w.Qnom, 100) + ' м³/сут × ' + n(w.cn, 1.38));
    return s.join('; ');
  }

  /* ================================================================== */
  /* WORD                                                               */
  /* ================================================================== */
  function buildDocx(P, R, img) {
    var A = D.AlignmentType, W = D.WidthType;
    var FONT = 'Times New Roman';
    function p(text, o) {
      o = o || {};
      return new D.Paragraph({ alignment: o.align || A.JUSTIFIED, spacing: { after: o.after === undefined ? 120 : o.after, line: 300 }, indent: o.noIndent ? undefined : { firstLine: 567 }, heading: o.heading,
        children: (Array.isArray(text) ? text : [text]).map(function (t) { return typeof t === 'string' ? new D.TextRun({ text: t, font: FONT, size: o.size || 24, bold: o.bold, italics: o.italics }) : t; }) });
    }
    function h(text, lvl) { return new D.Paragraph({ heading: lvl === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new D.TextRun({ text: text, font: FONT, bold: true, size: lvl === 2 ? 26 : 28 })] }); }
    function formula(text) { return new D.Paragraph({ alignment: A.CENTER, spacing: { after: 80 }, children: [new D.TextRun({ text: text, font: 'Cambria', size: 22, italics: false })] }); }
    function table(head, rows, widths) {
      var total = widths.reduce(sum, 0);
      var border = { style: D.BorderStyle.SINGLE, size: 4, color: '999999' };
      var borders = { top: border, bottom: border, left: border, right: border };
      function cell(t, i, isH) {
        return new D.TableCell({ width: { size: widths[i], type: W.DXA }, borders: borders, shading: isH ? { type: D.ShadingType.CLEAR, color: 'auto', fill: 'DCE6F2' } : undefined,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: [new D.Paragraph({ alignment: i === 0 ? A.LEFT : A.CENTER, children: [new D.TextRun({ text: String(t), font: FONT, size: 20, bold: !!isH })] })] });
      }
      return new D.Table({ width: { size: total, type: W.DXA }, columnWidths: widths,
        rows: [new D.TableRow({ tableHeader: true, cantSplit: true, children: head.map(function (t, i) { return cell(t, i, true); }) })].concat(rows.map(function (r) { return new D.TableRow({ cantSplit: true, children: r.map(function (t, i) { return cell(t, i, false); }) }); })) });
    }
    function image(key, wPx) {
      var im = img && img[key]; if (!im) return p('[график недоступен]', { noIndent: true });
      var b64 = im.data.split(',')[1];
      var bytes = typeof atob === 'function' ? Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }) : Buffer.from(b64, 'base64');
      var w = wPx || 620, hh = Math.round(w * im.h / im.w);
      return new D.Paragraph({ alignment: A.CENTER, spacing: { after: 60 }, children: [new D.ImageRun({ type: 'png', data: bytes, transformation: { width: w, height: hh } })] });
    }
    function caption(t) { return new D.Paragraph({ alignment: A.CENTER, keepNext: true, spacing: { after: 60, before: 60 }, children: [new D.TextRun({ text: t, font: FONT, size: 22, italics: true })] }); }
    var ch = [], fig = 0, tab = 0, e = Object.assign({}, E.DEFAULTS, P.econ || {});
    // Титул
    ch.push(p(PROGRAM, { align: A.RIGHT, noIndent: true, size: 20 }));
    for (var i = 0; i < 6; i++) ch.push(p('', { noIndent: true }));
    ch.push(p('ПРОГНОЗ ДОБЫЧИ НЕФТИ И ТЕХНИКО-ЭКОНОМИЧЕСКАЯ ОЦЕНКА', { align: A.CENTER, noIndent: true, bold: true, size: 32 }));
    ch.push(p('вариантов разработки с поддержанием и без поддержания пластового давления', { align: A.CENTER, noIndent: true, size: 26 }));
    ch.push(p('', { noIndent: true }));
    ch.push(p(P.meta.name || '', { align: A.CENTER, noIndent: true, size: 26, bold: true }));
    if (P.meta.field) ch.push(p(P.meta.field, { align: A.CENTER, noIndent: true, size: 24 }));
    for (i = 0; i < 6; i++) ch.push(p('', { noIndent: true }));
    if (P.meta.author) ch.push(p('Исполнитель: ' + P.meta.author, { align: A.RIGHT, noIndent: true }));
    ch.push(p('Дата: ' + new Date().toLocaleDateString('ru-RU'), { align: A.RIGHT, noIndent: true }));
    ch.push(new D.Paragraph({ children: [new D.PageBreak()] }));

    ch.push(h('1. Исходные данные'));
    ch.push(p('Расчёт выполнен для объекта разработки с параметрами, приведёнными в таблице ' + (++tab) + '. Горизонт прогноза — ' + P.years + ' лет с ' + P.startYear + ' г., коэффициент эксплуатации скважин — ' + f(T.num(P.Ke, 0.95), 2) + '.'));
    ch.push(caption('Таблица ' + tab + ' — Параметры объекта разработки'));
    ch.push(table(['Параметр', 'Значение', 'Ед. изм.'], RES_FIELDS.filter(function (fl) { return P.res[fl[0]] !== undefined && P.res[fl[0]] !== ''; }).map(function (fl) { var v = P.res[fl[0]]; return [fl[1], isNaN(+v) ? modeName(v) : numTxt(+v), fl[2]]; }), [5200, 2200, 1900]));
    ch.push(p(''));
    ch.push(caption('Таблица ' + (++tab) + ' — Группы скважин и график ввода'));
    var yrs = R.fc.noppd.annual.year;
    ch.push(table(['Группа', 'Тип', 'Конструкция и параметры', 'Ввод, шт. (по годам)'], P.groups.map(function (g) {
      return [g.name, T.TYPES[g.well.type].name, wellParamText(g.well), yrs.filter(function (y) { return T.num((g.schedule || {})[y], 0) > 0; }).map(function (y) { return y + ': ' + g.schedule[y]; }).join(', ')];
    }), [1700, 1300, 4300, 2000]));

    ch.push(h('2. Методика расчёта'));
    ch.push(p('Стартовые дебиты рассчитаны по аналитическим формулам нелинейной фильтрации, полученным в диссертации О.Н. Шевченко «Математическая модель нефтеизвлечения в условиях нелинейной фильтрации жидкости к горизонтальным скважинам»; номера формул соответствуют диссертации. Метод для каждой группы выбирается по типу скважины и свойствам нефти (структурированная нефть вязкостью более 30 мПа·с — метод B) или задаётся пользователем.'));
    FORMULAS.forEach(function (fm) { ch.push(p(fm[0], { bold: true, noIndent: true })); fm[1].forEach(function (t) { ch.push(formula(t)); }); });
    ch.push(p(EXT_NOTE));
    ch.push(p('Вариант без ППД описывается двухъёмной моделью упругого режима (4.34) с конечным временем τ₂ подпитки из удалённой части пласта; вариант с ППД — предельным случаем τ₂ → ∞ (постоянное давление на внешней границе), который приводит к формуле (4.26) с долей стационарной подпитки φ. Обводнённость продукции определяется различием темпов падения дебитов жидкости и нефти.'));

    ch.push(h('3. Стартовые дебиты скважин'));
    ch.push(caption('Таблица ' + (++tab) + ' — Стартовые дебиты (первый месяц работы)'));
    ch.push(table(['Группа', 'Метод', 'Qж, м³/сут', 'Обводн., %', 'Qн, т/сут', 'Ключевые параметры'], P.groups.map(function (g, gi) {
      var s = R.starts[gi], d = s.details, k = s.method === 'A' ? 'Kнф = ' + f(d['Kнф'], 3) + ', QД = ' + f(d['QД (Дарси), м³/сут'], 0) + ' м³/сут, Aт = ' + f(d['Aт, м²'], 0) + ' м²'
        : s.method === 'B' ? 'Rэкв = ' + f(d['Rэкв, м'], 0) + ' м, F = ' + f(d['F = 2πRr, м²'], 0) + ' м², v = ' + (d['v, м/с'] || 0).toExponential(2) + ' м/с'
          : s.method === 'F' ? 'стартовый дебит задан (факт/аналог)' : 'r* = ' + f(d['r*, м'], 3) + ' м, Q (Дарси) = ' + f(d['Q по Дарси (C → 0), м³/сут'], 1);
      return [g.name, s.method, f(s.Qliq, 1), f(s.fw0 * 100, 0), f(s.Qoil, 1), k];
    }), [1600, 800, 1100, 1000, 1000, 3800]));
    if (R.cmp) {
      ch.push(p('Для выбора конструкции в таблице ' + (tab + 1) + ' сопоставлены показатели одной скважины каждого типа (типовые шаблоны) при свойствах рассматриваемого объекта.'));
      ch.push(caption('Таблица ' + (++tab) + ' — Сравнение конструкций скважин'));
      ch.push(table(['Тип', 'Метод', 'Qж₀, м³/сут', 'Qн₀, т/сут', 'Нефть за 10 лет без ППД / с ППД, тыс. т', 'CAPEX, млн руб', 'ЧДД без ППД / с ППД, млн руб'], R.cmp.map(function (c) {
        return [c.name, c.start.method, f(c.start.Qliq, 1), f(c.start.Qoil, 1), f(c.noppd.oil10 / 1e3, 1) + ' / ' + f(c.ppd.oil10 / 1e3, 1), f(c.capex, 0), f(c.noppd.NPV / 1e6, 0) + ' / ' + f(c.ppd.NPV / 1e6, 0)];
      }), [1500, 800, 1100, 1100, 1900, 1100, 1800]));
    }
    P.groups.forEach(function (g, gi) { if (img && img['plan' + gi]) { ch.push(image('plan' + gi, 420)); ch.push(caption('Рисунок ' + (++fig) + ' — Схема скважины «' + g.name + '» в плане')); } });

    ch.push(h('4. Прогноз добычи'));
    ch.push(p('На рисунке ' + (fig + 1) + ' сопоставлены профили добычи нефти по вариантам без ППД и с ППД, на рисунке ' + (fig + 2) + ' — обводнённость продукции.'));
    ch.push(image('oil')); ch.push(caption('Рисунок ' + (++fig) + ' — Годовая добыча нефти по вариантам'));
    ch.push(image('fw')); ch.push(caption('Рисунок ' + (++fig) + ' — Обводнённость продукции'));
    ['noppd', 'ppd'].forEach(function (sc) {
      var An = R.fc[sc].annual;
      ch.push(caption('Таблица ' + (++tab) + ' — Технологические показатели, вариант «' + SC[sc] + '»'));
      ch.push(table(['Год', 'Нефть, тыс. т', 'Жидкость, тыс. м³', 'Обводн., %', 'Фонд доб., шт.', 'Нагн., шт.', 'Закачка, тыс. м³'], An.year.map(function (y, i) {
        return [String(y), f(An.oil[i] / 1e3, 1), f(An.liq[i] / 1e3, 1), f(An.fw[i] * 100, 1), f(An.activeWells[i], 0), f(An.injWells[i], 0), f(An.inj[i] / 1e3, 1)];
      }), [900, 1400, 1500, 1200, 1400, 1100, 1500]));
      ch.push(p(''));
    });

    // добыча по скважинам (итог объекта = сумма скважин; полная таблица по годам — в Excel)
    var Wn = R.fc.noppd.wells || [], Wp = R.fc.ppd.wells || [];
    if (Wn.length) {
      ch.push(p('Добыча рассчитывается для каждой скважины отдельно (профиль группы, сдвинутый на дату ввода); годовая добыча объекта равна сумме добычи всех скважин. Накопленная добыча по скважинам приведена в таблице ' + (tab + 1) + ', добыча по скважинам и годам — на листах «По скважинам» книги Excel.'));
      ch.push(caption('Таблица ' + (++tab) + ' — Накопленная добыча нефти по скважинам за ' + P.years + ' лет, тыс. т'));
      var trows = Wn.map(function (w, i) { return [w.name, w.startYear + '-' + ('0' + w.startMonth).slice(-2), f(w.cumOil / 1e3, 2), f((Wp[i] || {}).cumOil / 1e3, 2)]; });
      trows.push(['Итого по объекту (сумма скважин)', '', f(Wn.reduce(function (a, w) { return a + w.cumOil; }, 0) / 1e3, 1), f(Wp.reduce(function (a, w) { return a + w.cumOil; }, 0) / 1e3, 1)]);
      ch.push(table(['Скважина', 'Ввод', 'Без ППД', 'С ППД'], trows, [4300, 1400, 1800, 1800]));
      ch.push(p(''));
    }
    if (R.prob) {
      var PR = R.prob;
      ch.push(h('4.1. Вероятностная оценка P90 / P50 / P10', 2));
      ch.push(p('Неопределённость исходных данных учтена методом Монте-Карло (' + PR.n + ' реализаций для дебитов, ' + PR.nProd + ' — для добычи и ЧДД): параметры ' + PR.params.map(function (q) { return q.name + ' (' + q.low + '…+' + q.high + ' %)'; }).join(', ') + ' варьируются одновременно для всех групп скважин. P90 — значение, которое будет превышено с вероятностью 90 % (пессимистичная оценка), P50 — медиана, P10 — оптимистичная оценка (SPE-PRMS).'));
      ch.push(caption('Таблица ' + (++tab) + ' — Вероятностные оценки'));
      ch.push(table(['Показатель', 'P90', 'P50', 'P10', 'Детерм.'], probRows(P, PR).map(function (r) { var d = r[2] ? 1 : 0; return [r[0], f(r[1].P90, d), f(r[1].P50, d), f(r[1].P10, d), r[3] !== undefined ? f(r[3], d) : '']; }), [4700, 1150, 1150, 1150, 1150]));
      ch.push(p(''));
    }

    ch.push(h('5. Экономическая оценка'));
    var nd = E.ndpi(e, 0), nb = E.netback(e, 0);
    ch.push(p('Экономическая оценка выполнена по денежному потоку недропользователя: выручка по цене нетбэк ' + f(nb, 0) + ' руб/т минус НДПИ (' + (typeof nd === 'object' ? f(nd.value, 0) + ' руб/т в первый год, Кд = ' + T.num(e.Kd, 1) + (T.num(e.Kd, 1) < 1 && isFinite(E.kdYears(e, P)) ? ' в течение ' + Math.max(0, Math.round(E.kdYears(e, P))) + ' лет прогноза, далее 1' : '') : 'задан пользователем') + '), операционные затраты, налог на имущество (' + T.num(e.propTax, 2.2) + ' %), налог на прибыль (' + T.num(e.profitTax, 25) + ' %) и капитальные вложения. Ставка дисконтирования — ' + T.num(e.discountRate, 15) + ' %. Добыча прекращается после последнего года с положительным операционным потоком (рентабельный срок).'));
    ch.push(caption('Таблица ' + (++tab) + ' — Сравнение вариантов разработки'));
    ch.push(table(['Показатель', 'Без ППД', 'С ППД'], compRows(R).map(function (r) { return [r[0], f(r[1], r[3]), f(r[2], r[3])]; }), [5300, 2000, 2000]));
    ch.push(image('cf')); ch.push(caption('Рисунок ' + (++fig) + ' — Накопленный дисконтированный денежный поток'));
    ch.push(image('tornado')); ch.push(caption('Рисунок ' + (++fig) + ' — Чувствительность ЧДД лучшего варианта'));

    ch.push(h('6. Выводы'));
    conclusions(P, R).forEach(function (t, i) { ch.push(p((i + 1) + '. ' + t)); });
    ch.push(h('7. Ограничения применимости', 2));
    ch.push(p('Метод A применим к низкопроницаемым терригенным коллекторам (k < 7–8·10⁻³ мкм²) на начальном периоде эксплуатации при Rd/rf ≥ 1,2; значение Aэф подлежит идентификации по скважинам-аналогам с фактическими забойными давлениями. Метод B применим к залежам нефти с выраженными структурно-механическими свойствами в однородном поровом коллекторе; коэффициент KR и действующий градиент идентифицируются по скважинам-аналогам. Параметры падения дебита (a, τ₁, τ₂, φ, τ) задаются по фактической динамике аналогов.'));

    var doc = new D.Document({
      creator: P.meta.author || 'ТРИЗ-НФ', title: 'Прогноз добычи — ' + (P.meta.field || ''), description: PROGRAM,
      styles: { default: { document: { run: { font: FONT, size: 24 } } } },
      sections: [{
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: A.CENTER, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], font: FONT, size: 20 })] }), new D.Paragraph({ alignment: A.CENTER, children: [new D.TextRun({ text: COPY, font: FONT, size: 16, color: '777777' })] })] }) },
        children: ch
      }]
    });
    return doc;
  }
  function numTxt(x) {
    if (x === 0) return '0'; var a = Math.abs(x);
    if (a < 1e-3 || a >= 1e7) return x.toExponential(3).replace('.', ',');
    var d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 3 : 5;
    var t = f(x, d); if (t.indexOf(',') >= 0) t = t.replace(/0+$/, '').replace(/,$/, ''); return t;
  }
  function modeName(v) {
    return ({ KR: 'KR·√(χt)', grid: 'по сетке скважин (4.29б)', input: 'задан', dp: 'по депрессии ΔP/Rэкв − G', auto: 'по корреляции', calc: 'расчёт' })[v] || String(v);
  }

  /* ================================================================== */
  /* POWERPOINT                                                         */
  /* ================================================================== */
  function buildPptx(P, R, img) {
    var pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13,33 × 7,5 дюйма
    pres.author = P.meta.author || 'ТРИЗ-НФ'; pres.title = 'Прогноз добычи — ' + (P.meta.field || '');
    var DARK = '14213D', ACC = 'EB6834', BLUE = '2A78D6', TXT = '1D1D1B', MUT = '5F5E5A', LIGHT = 'F4F3EF';
    var FONT_H = 'Cambria', FONT_B = 'Calibri';
    var chartBase = function () { return { catAxisLabelColor: MUT, valAxisLabelColor: MUT, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, catAxisLabelFontFace: FONT_B, valAxisLabelFontFace: FONT_B, valGridLine: { color: 'E4E3DE', size: 0.75 }, catGridLine: { style: 'none' }, legendFontSize: 12, legendFontFace: FONT_B, showLegend: true, legendPos: 'b' }; };
    function title(s, t, sub) {
      s.addText(t, { x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontFace: FONT_H, fontSize: 30, bold: true, color: DARK, isTextBox: true, margin: 0 });
      if (sub) s.addText(sub, { x: 0.6, y: 1.1, w: 12.1, h: 0.4, fontFace: FONT_B, fontSize: 14, color: MUT, isTextBox: true, margin: 0 });
      s.addText(PROGRAM + '  ·  ' + COPY, { x: 0.6, y: 7.05, w: 10, h: 0.3, fontFace: FONT_B, fontSize: 9, color: '9A9992', isTextBox: true, margin: 0 });
    }
    // 1. Титул
    var s = pres.addSlide(); s.background = { color: DARK };
    s.addText('Прогноз добычи нефти и экономическая оценка', { x: 0.8, y: 2.0, w: 11.7, h: 1.2, fontFace: FONT_H, fontSize: 40, bold: true, color: 'FFFFFF', isTextBox: true, margin: 0 });
    s.addText('варианты разработки с ППД и без ППД · нелинейная фильтрация', { x: 0.8, y: 3.2, w: 11.7, h: 0.6, fontFace: FONT_B, fontSize: 20, color: 'CADCFC', isTextBox: true, margin: 0 });
    s.addText((P.meta.name || '') + (P.meta.field ? '\n' + P.meta.field : ''), { x: 0.8, y: 4.3, w: 11.7, h: 1.0, fontFace: FONT_B, fontSize: 18, color: 'FFFFFF', isTextBox: true, margin: 0 });
    s.addText(PROGRAM + (P.meta.author ? ' · ' + P.meta.author : '') + ' · ' + new Date().toLocaleDateString('ru-RU'), { x: 0.8, y: 6.6, w: 11.7, h: 0.4, fontFace: FONT_B, fontSize: 12, color: 'CADCFC', isTextBox: true, margin: 0 });

    // 2. Ключевые результаты
    s = pres.addSlide(); s.background = { color: 'FFFFFF' };
    var best = R.ev.ppd.NPV > R.ev.noppd.NPV ? 'ppd' : 'noppd';
    title(s, 'Ключевые результаты', 'Рекомендуемый по ЧДД вариант — «' + SC[best] + '»');
    var cards = [['ЧДД', R.ev, 'NPV', function (v) { return f(v / 1e6, 0); }, 'млн руб'], ['ВНД', R.ev, 'IRR', function (v) { return v === Infinity ? '>1000' : isFinite(v) ? f(v * 100, 1) : '—'; }, '%'],
      ['Добыча нефти', R.ev, 'oilTotal', function (v) { return f(v / 1e3, 0); }, 'тыс. т'], ['Окупаемость', R.ev, 'DPP', function (v) { return isFinite(v) ? f(v, 1) : '—'; }, 'лет']];
    cards.forEach(function (c, i) {
      var x = 0.6 + i * 3.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x, y: 1.8, w: 2.85, h: 3.2, fill: { color: LIGHT }, line: { color: LIGHT }, rectRadius: 0.12 });
      s.addText(c[0], { x: x + 0.25, y: 1.95, w: 2.4, h: 0.4, fontFace: FONT_B, fontSize: 15, color: MUT, isTextBox: true, margin: 0 });
      s.addText(c[3](c[1].noppd[c[2]]), { x: x + 0.25, y: 2.45, w: 2.4, h: 0.8, fontFace: FONT_H, fontSize: 34, bold: true, color: BLUE, isTextBox: true, margin: 0 });
      s.addText('без ППД, ' + c[4], { x: x + 0.25, y: 3.2, w: 2.4, h: 0.3, fontFace: FONT_B, fontSize: 11, color: MUT, isTextBox: true, margin: 0 });
      s.addText(c[3](c[1].ppd[c[2]]), { x: x + 0.25, y: 3.7, w: 2.4, h: 0.8, fontFace: FONT_H, fontSize: 34, bold: true, color: ACC, isTextBox: true, margin: 0 });
      s.addText('с ППД, ' + c[4], { x: x + 0.25, y: 4.45, w: 2.4, h: 0.3, fontFace: FONT_B, fontSize: 11, color: MUT, isTextBox: true, margin: 0 });
    });
    var concl = conclusions(P, R).slice(1, 3);
    s.addText(concl.map(function (t, i) { return { text: t, options: { bullet: true, breakLine: i < concl.length - 1 } }; }), { x: 0.6, y: 5.3, w: 12.1, h: 1.6, fontFace: FONT_B, fontSize: 14, color: TXT, paraSpaceAfter: 6, isTextBox: true, valign: 'top' });

    // 3. Метод
    s = pres.addSlide(); title(s, 'Методика: нелинейный закон фильтрации', 'Формулы диссертации О.Н. Шевченко; номера — по тексту диссертации');
    var y = 1.75;
    FORMULAS.forEach(function (fm) {
      s.addText(fm[0], { x: 0.6, y: y, w: 12.1, h: 0.35, fontFace: FONT_B, fontSize: 14, bold: true, color: DARK, isTextBox: true, margin: 0 });
      y += 0.38;
      fm[1].forEach(function (t) { s.addText(t, { x: 0.9, y: y, w: 11.8, h: 0.3, fontFace: 'Cambria', fontSize: 12, color: TXT, isTextBox: true, margin: 0 }); y += 0.3; });
      y += 0.12;
    });

    // 4. Стартовые дебиты
    s = pres.addSlide(); title(s, 'Стартовые дебиты по типам скважин', 'Первый месяц работы; жидкость и нефть');
    s.addChart(pres.charts.BAR, [{ name: 'Жидкость, м³/сут', labels: P.groups.map(function (g) { return g.name; }), values: R.starts.map(function (x) { return +x.Qliq.toFixed(1); }) },
      { name: 'Нефть, т/сут', labels: P.groups.map(function (g) { return g.name; }), values: R.starts.map(function (x) { return +x.Qoil.toFixed(1); }) }],
      Object.assign(chartBase(), { x: 0.6, y: 1.7, w: 6.6, h: 5.1, barDir: 'col', barGrouping: 'clustered', chartColors: [BLUE, ACC], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: TXT, dataLabelFormatCode: '0' }));
    var rows = [[{ text: 'Группа', options: { bold: true, fill: { color: 'DCE6F2' } } }, { text: 'Метод', options: { bold: true, fill: { color: 'DCE6F2' } } }, { text: 'Ключевой параметр', options: { bold: true, fill: { color: 'DCE6F2' } } }]];
    P.groups.forEach(function (g, gi) {
      var sr = R.starts[gi], d = sr.details;
      rows.push([g.name, sr.method, sr.method === 'A' ? 'Kнф = ' + f(d['Kнф'], 2) + ' (Aт = ' + f(d['Aт, м²'], 0) + ' м²)' : sr.method === 'B' ? 'Rэкв = ' + f(d['Rэкв, м'], 0) + ' м, F = ' + f(d['F = 2πRr, м²'], 0) + ' м²' : sr.method === 'F' ? 'дебит задан' : 'r* = ' + f(d['r*, м'], 2) + ' м']);
    });
    s.addTable(rows, { x: 7.5, y: 1.8, w: 5.2, colW: [1.6, 0.8, 2.8], fontFace: FONT_B, fontSize: 12, color: TXT, border: { type: 'solid', color: 'BFBFBF', pt: 0.75 } });
    if (img && img.plan0) s.addImage({ data: img.plan0.data, x: 7.5, y: 4.4, w: 5.2, h: 5.2 * img.plan0.h / img.plan0.w });

    // 5. Профили добычи
    var yrs = R.fc.noppd.annual.year.map(String);
    s = pres.addSlide(); title(s, 'Добыча нефти: с ППД и без ППД', 'Годовая добыча, тыс. т');
    s.addChart(pres.charts.LINE, [{ name: 'Без ППД', labels: yrs, values: R.fc.noppd.annual.oil.map(function (v) { return +(v / 1e3).toFixed(1); }) },
      { name: 'С ППД', labels: yrs, values: R.fc.ppd.annual.oil.map(function (v) { return +(v / 1e3).toFixed(1); }) }],
      Object.assign(chartBase(), { x: 0.6, y: 1.7, w: 8.2, h: 5.2, chartColors: [BLUE, ACC], lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 5 }));
    var a = R.ev.noppd, b = R.ev.ppd;
    s.addText([
      { text: 'Накопленная добыча за рентабельный период', options: { bold: true, breakLine: true } },
      { text: 'без ППД — ' + f(a.oilTotal / 1e3, 0) + ' тыс. т (' + a.rentYears + ' лет)', options: { color: BLUE, breakLine: true } },
      { text: 'с ППД — ' + f(b.oilTotal / 1e3, 0) + ' тыс. т (' + b.rentYears + ' лет)', options: { color: ACC, breakLine: true } },
      { text: ' ', options: { breakLine: true } },
      { text: 'Без ППД — двухъёмная модель (4.34); с ППД — предельный случай τ₂ → ∞, формула (4.26).', options: { color: MUT } }
    ], { x: 9.1, y: 1.9, w: 3.7, h: 4.5, fontFace: FONT_B, fontSize: 14, color: TXT, valign: 'top', isTextBox: true });

    // 6. Обводнённость и фонд
    s = pres.addSlide(); title(s, 'Обводнённость и фонд скважин', 'Обводнённость, %; действующий фонд добывающих и нагнетательных скважин, шт.');
    s.addChart(pres.charts.LINE, [{ name: 'Обводн. без ППД', labels: yrs, values: R.fc.noppd.annual.fw.map(function (v) { return +(v * 100).toFixed(1); }) },
      { name: 'Обводн. с ППД', labels: yrs, values: R.fc.ppd.annual.fw.map(function (v) { return +(v * 100).toFixed(1); }) }],
      Object.assign(chartBase(), { x: 0.6, y: 1.7, w: 6.1, h: 5.1, chartColors: [BLUE, ACC], lineSize: 2.5, valAxisMaxVal: 100, valAxisMinVal: 0 }));
    s.addChart(pres.charts.BAR, [{ name: 'Добывающие', labels: yrs, values: R.fc.ppd.annual.activeWells }, { name: 'Нагнетательные (ППД)', labels: yrs, values: R.fc.ppd.annual.injWells }],
      Object.assign(chartBase(), { x: 6.9, y: 1.7, w: 5.9, h: 5.1, barDir: 'col', barGrouping: 'stacked', chartColors: ['1BAF7A', ACC] }));

    // 7. Экономика: сравнение
    s = pres.addSlide(); title(s, 'Экономическая эффективность вариантов', 'Ставка дисконтирования ' + T.num((P.econ || {}).discountRate, 15) + ' %');
    var tr = [[{ text: 'Показатель', options: { bold: true, fill: { color: 'DCE6F2' } } }, { text: 'Без ППД', options: { bold: true, fill: { color: 'DCE6F2' }, align: 'center' } }, { text: 'С ППД', options: { bold: true, fill: { color: 'DCE6F2' }, align: 'center' } }]];
    compRows(R).forEach(function (r) { tr.push([r[0], { text: f(r[1], r[3]), options: { align: 'center' } }, { text: f(r[2], r[3]), options: { align: 'center' } }]); });
    s.addTable(tr, { x: 0.6, y: 1.8, w: 6.4, colW: [3.8, 1.3, 1.3], fontFace: FONT_B, fontSize: 13, color: TXT, border: { type: 'solid', color: 'BFBFBF', pt: 0.75 } });
    s.addChart(pres.charts.LINE, [{ name: 'Без ППД', labels: yrs, values: R.ev.noppd.rows.map(function (r) { return +(r.dcum / 1e6).toFixed(0); }) },
      { name: 'С ППД', labels: yrs, values: R.ev.ppd.rows.map(function (r) { return +(r.dcum / 1e6).toFixed(0); }) }],
      Object.assign(chartBase(), { x: 7.2, y: 1.7, w: 5.6, h: 5.1, chartColors: [BLUE, ACC], lineSize: 2.5, showTitle: true, title: 'Накопленный ДДП, млн руб', titleFontSize: 13, titleColor: TXT, titleFontFace: FONT_B }));

    // 8. Чувствительность
    var Sb = R.sens[best];
    s = pres.addSlide(); title(s, 'Чувствительность ЧДД', 'Вариант «' + SC[best] + '», изменение факторов на ±' + Math.round(Sb.delta * 100) + ' %, млн руб');
    var items = Sb.items.slice().sort(function (x, z) { return Math.abs(x.high - x.low) - Math.abs(z.high - z.low); });
    s.addChart(pres.charts.BAR, [{ name: '−' + Math.round(Sb.delta * 100) + ' %', labels: items.map(function (i) { return i.name; }), values: items.map(function (i) { return +((i.low - Sb.base) / 1e6).toFixed(0); }) },
      { name: '+' + Math.round(Sb.delta * 100) + ' %', labels: items.map(function (i) { return i.name; }), values: items.map(function (i) { return +((i.high - Sb.base) / 1e6).toFixed(0); }) }],
      Object.assign(chartBase(), { x: 0.6, y: 1.7, w: 8.4, h: 5.1, barDir: 'bar', barGrouping: 'clustered', chartColors: [ACC, BLUE], showValue: true, dataLabelFontSize: 11, dataLabelColor: TXT, catAxisLabelPos: 'low' }));
    s.addText([
      { text: 'Базовый ЧДД: ' + f(Sb.base / 1e6, 0) + ' млн руб', options: { bold: true, breakLine: true } },
      { text: 'Цена безубыточности Urals: ' + (isFinite(Sb.breakEvenUrals) ? f(Sb.breakEvenUrals, 1) + ' $/барр' : '—'), options: { breakLine: true } },
      { text: ' ', options: { breakLine: true } },
      { text: 'Столбцы — отклонение ЧДД от базового значения.', options: { color: MUT } }
    ], { x: 9.3, y: 1.9, w: 3.5, h: 3.5, fontFace: FONT_B, fontSize: 14, color: TXT, valign: 'top', isTextBox: true });

    // 9. Вероятностная оценка
    if (R.prob) {
      var PRb = R.prob, sc2 = PRb.field.ppd ? (best === 'ppd' ? 'ppd' : 'noppd') : null;
      s = pres.addSlide(); title(s, 'Вероятностная оценка: P90 / P50 / P10', 'Монте-Карло, ' + PRb.n + ' реализаций; P90 — пессимистичная, P10 — оптимистичная оценка');
      var hd = function (t) { return { text: t, options: { bold: true, fill: { color: 'DCE6F2' }, align: 'center' } }; };
      var pt = [[{ text: 'Показатель', options: { bold: true, fill: { color: 'DCE6F2' } } }, hd('P90'), hd('P50'), hd('P10')]];
      probRows(P, PRb).filter(function (r) { return r[0].indexOf('нефти:') < 0; }).forEach(function (r) { var d = r[2] ? 1 : 0; pt.push([r[0], { text: f(r[1].P90, d), options: { align: 'center' } }, { text: f(r[1].P50, d), options: { align: 'center' } }, { text: f(r[1].P10, d), options: { align: 'center' } }]); });
      s.addTable(pt, { x: 0.6, y: 1.7, w: 6.9, colW: [4.2, 0.9, 0.9, 0.9], fontFace: FONT_B, fontSize: 11, color: TXT, border: { type: 'solid', color: 'BFBFBF', pt: 0.75 } });
      if (sc2) {
        var Fy = PRb.field[sc2].yearOil;
        s.addChart(pres.charts.LINE, [{ name: 'P90', labels: yrs, values: Fy.P90.map(function (v) { return +(v / 1e3).toFixed(1); }) }, { name: 'P50', labels: yrs, values: Fy.P50.map(function (v) { return +(v / 1e3).toFixed(1); }) }, { name: 'P10', labels: yrs, values: Fy.P10.map(function (v) { return +(v / 1e3).toFixed(1); }) }],
          Object.assign(chartBase(), { x: 7.7, y: 1.7, w: 5.1, h: 5.1, chartColors: [ACC, DARK, BLUE], lineSize: 2, showTitle: true, title: 'Добыча нефти, тыс. т/год — ' + SC[sc2].toLowerCase(), titleFontSize: 12, titleColor: TXT, titleFontFace: FONT_B }));
      }
    }

    // 9. Выводы
    s = pres.addSlide(); s.background = { color: DARK };
    s.addText('Выводы', { x: 0.6, y: 0.4, w: 12, h: 0.8, fontFace: FONT_H, fontSize: 32, bold: true, color: 'FFFFFF', isTextBox: true, margin: 0 });
    var cc = conclusions(P, R);
    s.addText(cc.map(function (t, i) { return { text: t, options: { bullet: true, breakLine: i < cc.length - 1 } }; }), { x: 0.6, y: 1.4, w: 12.1, h: 5.4, fontFace: FONT_B, fontSize: 14, color: 'FFFFFF', paraSpaceAfter: 8, valign: 'top', isTextBox: true });
    return pres;
  }

  return { buildXlsx: buildXlsx, buildDocx: buildDocx, buildPptx: buildPptx, conclusions: conclusions, FORMULAS: FORMULAS, EXT_NOTE: EXT_NOTE, RES_FIELDS: RES_FIELDS, ECON_FIELDS: ECON_FIELDS, CAPEX_NAMES: CAPEX_NAMES, wellParamText: wellParamText };
}));
