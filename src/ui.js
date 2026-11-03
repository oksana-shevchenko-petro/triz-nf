/* ТРИЗ-НФ — интерфейс пользователя. © Шевченко О.Н. */
(function () {
  'use strict';
  var DIO = window.TRIZ_DATAIO, T = window.TRIZ, E = window.TRIZ_ECON, CH = window.TRIZ_CHARTS, RP = window.TRIZ_REPORTS, DM = window.TRIZ_DEMO, DATA = window.TRIZ_DATA;
  var f = T.fmt, num = T.num;
  var STORE_KEY = 'trizNF.project.v1';
  var P, R, PR = null, tab = 'project', selGroup = 0, fcView = 'both', ecView = 'ppd', calib = null, timer = null;

  /* ---------------- утилиты ---------------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function get(o, path) { return path.split('.').reduce(function (a, k) { return a === undefined || a === null ? undefined : a[k]; }, o); }
  function set(o, path, v) { var ks = path.split('.'), last = ks.pop(); ks.forEach(function (k) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }); o[last] = v; }
  function parseNum(s) { if (s === '' || s === null || s === undefined) return ''; var x = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : ''; }
  function showNum(v) { if (v === '' || v === undefined || v === null) return ''; var x = +v; if (!isFinite(x)) return String(v); return String(x).replace('.', ','); }
  function sig(x, d) { if (!isFinite(x)) return '—'; var a = Math.abs(x); if (a !== 0 && (a < 1e-3 || a >= 1e7)) return x.toExponential(d === undefined ? 2 : d).replace('.', ','); return f(x, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 4); }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 3200); }
  function saveBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function fileSafe(s) { return String(s || 'проект').replace(/[\\\/:*?"<>|]+/g, '_').slice(0, 60); }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(P)); } catch (e) { /* хранилище недоступно */ } }

  /* ---------------- описание полей ---------------- */
  function F(path, label, unit, o) { return Object.assign({ path: path, label: label, unit: unit || '', type: 'num' }, o || {}); }
  var RES_SECTIONS = [
    { title: 'Пласт и флюид', fields: [
      F('res.k', 'Проницаемость k', '10⁻³ мкм² (мД)'), F('res.h', 'Нефтенасыщенная толщина h', 'м'), F('res.m', 'Пористость m', 'д.ед.'), F('res.So', 'Нефтенасыщенность', 'д.ед.'),
      F('res.mu', 'Вязкость нефти в пласт. условиях μ', 'мПа·с'), F('res.B', 'Объёмный коэффициент B', '—'), F('res.rho', 'Плотность дегаз. нефти', 'т/м³'),
      F('res.Pres', 'Пластовое давление', 'МПа'), F('res.nLayers', 'Расчленённость — число пропластков', 'шт.', { hint: '1 — однородный пласт' }), F('res.kvkh', 'Анизотропия kв/kг', 'д.ед.', { hint: 'для псевдоскина наклона' }), F('res.Pwf', 'Забойное давление', 'МПа'), F('res.betaL', 'Сжимаемость жидкости βж', '1/МПа'), F('res.betaR', 'Сжимаемость породы βс', '1/МПа'), F('res.KIN', 'КИН (ограничение запасов)', 'д.ед.')] },
    { title: 'Метод A — эффективная поверхность фильтрации (4.3)–(4.5)', fields: [
      F('res.Aef', 'Aэф — эффективная поверхность', 'м²', { hint: 'АС3: 2 843 м² (4 ГС), 2 568 м² (82 ГС)' }), F('res.gamma', 'Показатель γ', '—', { hint: 'в диссертации γ = 1' }),
      F('res.Rk', 'Радиус контура питания ННС Rк', 'м'), F('res.Aef35', 'Aэф для поправки (4.35)', 'м²', { hint: 'нефть, АС3: 1 050' }), F('res.gamma35', 'γ для (4.35)', '—', { hint: 'АС3: 0,71' })] },
    { title: 'Метод B — предельный градиент и эквивалентный радиус (4.29)–(4.31)', fields: [
      F('res.RekvMode', 'Способ расчёта Rэкв', '', { type: 'sel', options: [['KR', 'Rэкв = KR·√(χt)'], ['grid', 'по сетке скважин (4.29б)']] }),
      F('res.KR', 'Коэффициент KR', '—', { hint: 'Б2: 6,07; теория (4.6а): 1,50', show: function () { return P.res.RekvMode !== 'grid'; } }),
      F('res.tR', 'Время t', 'сут', { show: function () { return P.res.RekvMode !== 'grid'; } }),
      F('res.spacingA', 'Расстояние между скважинами в ряду a', 'м'), F('res.spacingB', 'Расстояние между рядами b', 'м'),
      F('res.chiMode', 'Пьезопроводность χ', '', { type: 'sel', options: [['calc', 'рассчитать: χ = k/(μβ*)'], ['input', 'задать']] }),
      F('res.chi', 'χ', 'м²/с', { show: function () { return P.res.chiMode === 'input'; } }),
      F('res.dgMode', 'Действующий градиент grad P − G', '', { type: 'sel', options: [['input', 'задать (по аналогам)'], ['dp', 'по депрессии: ΔP/Rэкв − G']] }),
      F('res.dg', 'grad P − G', 'МПа/м', { hint: 'Б2: 0,0398', show: function () { return P.res.dgMode !== 'dp'; } }),
      F('res.Gmode', 'Предельный градиент G', '', { type: 'sel', options: [['auto', 'по керну: G = −0,233 ln k + 0,489'], ['input', 'задать']] }),
      F('res.G', 'G', 'МПа/м', { show: function () { return P.res.Gmode === 'input'; } }),
      F('res.bMode', 'Инерционный коэффициент b', '', { type: 'sel', options: [['auto', 'по J. Geertsma (1974): β = 0,005/(k^0,5·m^5,5), b = β·ρ'], ['input', 'задать']] }),
      F('res.b', 'b', 'Па·с²/м³', { show: function () { return P.res.bMode === 'input'; } })] },
    { title: 'Метод C — пласт-полоса (3.36)–(3.39)', fields: [F('res.w', 'Полуширина пласта-полосы w', 'м', { hint: 'половина расстояния до контура питания' }), F('res.nPow', 'Показатель степени n', '—', { hint: 'n = 2 — двучленный закон' })] },
    { title: 'Падение дебита', fields: [F('res.KV', 'Коэффициент использования упругого запаса KV', 'д.ед.', { hint: 'АС3: 0,3' })] }
  ];

  var TYPE_OPTS = Object.keys(T.TYPES).map(function (k) { return [k, T.TYPES[k].name + ' — ' + T.TYPES[k].full]; });
  function wellFields(w) {
    var t = w.type, fm = T.fam(w), a = [
      F('name', 'Название группы', '', { type: 'text', group: true }),
      F('well.type', 'Тип скважины', '', { type: 'sel', options: TYPE_OPTS, rerender: true }),
      F('well.method', 'Метод расчёта', '', { type: 'sel', options: [['auto', 'автоматически']].concat(T.TYPES[t].methods.map(function (m) { return [m, 'Метод ' + m]; })), rerender: true })];
    if ((fm === 'vert' || fm === 'vfrac') && t !== 'VS') a.push(F('well.alpha', 'Зенитный угол в пласте', '°', { hint: t === 'PS' ? 'пологая скважина: 70–85°' : '' }));
    if (fm === 'vfrac') a.push(F('well.xf', 'Полудлина трещины xf', 'м'));
    if (t === 'NNS_MGRP') a.push(F('well.nZ', 'Число зон (стадий) ГРП', 'шт.', { hint: 'эффект — в расчленённом пласте (вкладка «Объект»)' }));
    if (fm === 'gs' || fm === 'gslong' || fm === 'mgrp' || fm === 'fish') a.push(F('well.L', 'Длина горизонтального участка L', 'м'));
    if (fm === 'gs') a.push(F('well.h2', 'Расстояние от ствола до подошвы h₂', 'м', { hint: 'метод C; пусто — h/2' }));
    if (t === 'GS_WAVE') a.push(F('well.amp', 'Амплитуда волны по вертикали', 'м', { hint: 'не более h' }));
    if (fm === 'gslong') a.push(F('well.xf', 'Полудлина продольной трещины', 'м', { hint: 'обычно ≈ L/2' }));
    if (fm === 'mgrp') a.push(F('well.n', 'Число стадий МГРП n', 'шт.'), F('well.xf', 'Полудлина трещины xf', 'м'), F('well.lenCorr', 'Поправка на длину ствола (4.35)', '', { type: 'chk' }));
    if (fm === 'mzs' || fm === 'mzsfrac') a.push(F('well.nLat', 'Число стволов', 'шт.'), F('well.Llat', 'Длина ствола', 'м'), F('well.latAngle', 'Угол между стволами', '°'));
    if (fm === 'mzsfrac') a.push(F('well.nLat_st', 'Стадий МГРП на ствол', 'шт.'), F('well.xfLat', 'Полудлина трещины МГРП', 'м'));
    if (fm === 'mzs' || fm === 'mzsfrac') a.push(F('well.Kint', 'Коэффициент независимости стволов Kи', '0…1', { hint: '0 — стволы работают как один, 1 — независимо' }));
    if (fm === 'mzs' || fm === 'radial') a.push(F('well.nLev', 'Число уровней стволов (каналов)', 'шт.', { hint: 'в расчленённом пласте' }));
    if (fm === 'fish') a.push(F('well.nRib', 'Число ответвлений', 'шт.'), F('well.lRib', 'Длина ответвления', 'м'), F('well.ribAngle', 'Угол к основному стволу', '°'),
      F('well.ribLayout', 'Расположение', '', { type: 'sel', options: [['pairs', 'попарно с двух сторон'], ['alternate', 'в шахматном порядке']] }));
    if (fm === 'radial') a.push(F('well.nCh', 'Каналов на уровне', 'шт.'), F('well.lCh', 'Длина канала', 'м'), F('well.rCh', 'Радиус канала', 'м'));
    a.push(F('well.S', 'Скин-фактор S', '—'), F('well.rw', 'Радиус скважины rс', 'м'), F('well.fw0', 'Начальная обводнённость', '%'),
      F('well.k', 'k для группы (если отличается)', 'мД', { hint: 'пусто — как у объекта' }), F('well.h', 'h для группы', 'м', { hint: 'пусто — как у объекта' }), F('well.dP', 'Депрессия для группы', 'МПа', { hint: T.TYPES[t].side ? 'для боковых стволов — с учётом текущего пластового давления' : 'пусто — Pпл − Pзаб' }),
      F('well.Qset', 'Стартовый дебит жидкости задан', 'м³/сут', { hint: 'по факту или аналогу; пусто — расчёт по формулам' }),
      F('well.pumpOn', 'Ограничение по насосу (4.36)', '', { type: 'chk', rerender: true }),
      F('well.Qnom', 'Номинальная подача насоса', 'м³/сут', { show: function () { return !!w.pumpOn; } }), F('well.cn', 'Коэффициент cн', '—', { hint: 'АС3: 1,38', show: function () { return !!w.pumpOn; } }),
      F('well.capex', 'CAPEX на скважину (если задан)', 'млн руб', { hint: 'пусто — по удельным затратам' }));
    return a;
  }

  var ECON_SECTIONS = [
    { title: 'Цена нефти', fields: [
      F('econ.priceMode', 'Способ задания цены', '', { type: 'sel', options: [['urals', 'от котировки Urals'], ['netback', 'нетбэк задан']], rerender: true }),
      F('econ.urals', 'Urals', '$/барр'), F('econ.discount', 'Дисконт к Urals', '$/барр', { show: function () { return econ().priceMode !== 'netback'; } }),
      F('econ.usd', 'Курс', 'руб/$'), F('econ.bblPerT', 'Баррелей в тонне', '—'), F('econ.transport', 'Транспорт и подготовка', 'руб/т', { show: function () { return econ().priceMode !== 'netback'; } }),
      F('econ.netback', 'Нетбэк', 'руб/т', { show: function () { return econ().priceMode === 'netback'; } }), F('econ.priceGrowth', 'Рост цены', '%/год'), F('econ.costInflation', 'Инфляция затрат', '%/год')] },
    { title: 'НДПИ (ст. 342, 342.2, 342.5 НК РФ)', fields: [
      F('econ.ndpiMode', 'Расчёт НДПИ', '', { type: 'sel', options: [['formula', 'по формуле 919·Кц − Дм'], ['manual', 'задать, руб/т']], rerender: true }),
      F('econ.Kd', 'Кд — степень сложности', '', { type: 'sel', num: true, options: [[1, '1 — прочие залежи'], [0.8, '0,8 — тюменская свита'], [0.4, '0,4 — k ≤ 2 мД, h > 10 м'], [0.2, '0,2 — k ≤ 2 мД, h ≤ 10 м']], show: function () { return econ().ndpiMode !== 'manual'; } }),
      F('econ.KdFrom', 'Год, в котором выработанность запасов залежи впервые превысила 1 %', 'год', { hint: 'Кд действует 180 налоговых периодов (15 лет) с 1 января этого года (п. 2 ст. 342.2 НК РФ); пусто – по сроку ниже', show: function () { return econ().ndpiMode !== 'manual' && num(econ().Kd, 1) < 1; } }),
      F('econ.KdYears', 'Срок действия Кд, если год не задан', 'лет прогноза', { hint: 'пусто – весь срок', show: function () { return econ().ndpiMode !== 'manual' && num(econ().Kd, 1) < 1 && (econ().KdFrom === undefined || econ().KdFrom === ''); } }),
      F('econ.Kz', 'Кз', '—', { show: function () { return econ().ndpiMode !== 'manual'; } }), F('econ.Kdv', 'Кдв', '—', { show: function () { return econ().ndpiMode !== 'manual'; } }), F('econ.Kkan', 'Ккан', '—', { show: function () { return econ().ndpiMode !== 'manual'; } }),
      F('econ.Kk', 'Кк', 'руб/т', { show: function () { return econ().ndpiMode !== 'manual'; } }), F('econ.Kabdt', 'Кабдт', 'руб/т', { show: function () { return econ().ndpiMode !== 'manual'; } }),
      F('econ.KmanMode', 'Кман', '', { type: 'sel', options: [['auto', 'по ЭП (п. 8 ст. 342.5), ФМ = 0'], ['manual', 'задать']], show: function () { return econ().ndpiMode !== 'manual'; } }),
      F('econ.Kman', 'Кман', 'руб/т', { show: function () { return econ().ndpiMode !== 'manual' && econ().KmanMode === 'manual'; } }),
      F('econ.ndpiManual', 'НДПИ', 'руб/т', { show: function () { return econ().ndpiMode === 'manual'; } })] },
    { title: 'Капитальные вложения, млн руб', fields: Object.keys(E.DEFAULTS.capex).map(function (k) { return F('econ.capex.' + k, RP.CAPEX_NAMES[k], 'млн руб'); }) },
    { title: 'Операционные затраты', fields: [F('econ.opexLiq', 'На тонну жидкости', 'руб/т'), F('econ.opexOil', 'На тонну нефти', 'руб/т'), F('econ.opexFixProd', 'Условно-постоянные на доб. скв.', 'тыс. руб/год'),
      F('econ.opexInj', 'Закачка воды', 'руб/м³'), F('econ.opexFixInj', 'Условно-постоянные на нагн. скв.', 'тыс. руб/год')] },
    { title: 'Налоги и дисконтирование', fields: [F('econ.profitTax', 'Налог на прибыль', '%'), F('econ.propTax', 'Налог на имущество', '%'), F('econ.deprYears', 'Срок амортизации', 'лет'),
      F('econ.discountRate', 'Ставка дисконтирования', '%'), F('econ.lossCarry', 'Перенос убытков (не более 50 % базы)', '', { type: 'chk' }), F('econ.econLimit', 'Ограничивать рентабельным сроком', '', { type: 'chk' })] }
  ];
  function econ() { return Object.assign({}, E.DEFAULTS, P.econ || {}); }

  function fieldVal(fd, base) {
    var v = get(base, fd.path);
    if ((v === undefined || v === '') && fd.path.indexOf('econ.') === 0) {
      var k = fd.path.slice(5); v = k.indexOf('capex.') === 0 ? E.DEFAULTS.capex[k.slice(6)] : E.DEFAULTS[k];
    }
    return v;
  }
  function fieldHTML(fd, base, prefix) {
    if (fd.show && !fd.show()) return '';
    var v = fieldVal(fd, base), id = 'f_' + Math.random().toString(36).slice(2, 8);
    var attr = ' data-path="' + esc((prefix || '') + fd.path) + '" data-type="' + fd.type + '"' + (fd.num ? ' data-num="1"' : '') + (fd.rerender ? ' data-rerender="1"' : '') + ' id="' + id + '"';
    var lab = '<label for="' + id + '">' + esc(fd.label) + (fd.unit ? ', <span class="u">' + esc(fd.unit) + '</span>' : '') + '</label>';
    var h = fd.hint ? '<span class="hint">' + esc(fd.hint) + '</span>' : '';
    if (fd.type === 'chk') return '<div class="field chk"><input type="checkbox"' + attr + (v ? ' checked' : '') + '><label for="' + id + '">' + esc(fd.label) + '</label></div>';
    if (fd.type === 'sel') {
      return '<div class="field">' + lab + '<select' + attr + '>' + fd.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + h + '</div>';
    }
    if (fd.type === 'text') return '<div class="field">' + lab + '<input type="text"' + attr + ' value="' + esc(v) + '">' + h + '</div>';
    return '<div class="field">' + lab + '<input type="text" inputmode="decimal"' + attr + ' value="' + esc(showNum(v)) + '">' + h + '</div>';
  }
  function fieldsHTML(list, base, prefix) { return '<div class="fields">' + list.map(function (fd) { return fieldHTML(fd, base, prefix); }).join('') + '</div>'; }

  /* ---------------- расчёт ---------------- */
  function recompute() {
    try { R = E.computeAll(P, DM.newWell); } catch (e) { console.error(e); toast('Ошибка расчёта: ' + e.message); }
    if (PR) PR.stale = true;
    persist();
  }
  function schedule(rerender) {
    clearTimeout(timer);
    timer = setTimeout(function () { recompute(); if (rerender) render(); else refreshOutputs(); }, 220);
  }

  /* ---------------- общие блоки ---------------- */
  function kpis() {
    if (!R) return '';
    var a = R.ev.noppd, b = R.ev.ppd;
    function k(l, x, y, fm, u) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v"><b class="a" title="без ППД">' + fm(x) + '</b><b class="p" title="с ППД">' + fm(y) + '</b><small>' + u + '</small></div></div>'; }
    return '<div class="kpis">' +
      k('ЧДД (без ППД / с ППД)', a.NPV, b.NPV, function (v) { return f(v / 1e6, 0); }, 'млн руб') +
      k('ВНД', a.IRR, b.IRR, function (v) { return v === Infinity ? '>1000' : isFinite(v) ? f(v * 100, 1) : '—'; }, '%') +
      k('Добыча нефти', a.oilTotal, b.oilTotal, function (v) { return f(v / 1e3, 0); }, 'тыс. т') +
      k('Окупаемость (дисконт.)', a.DPP, b.DPP, function (v) { return isFinite(v) ? f(v, 1) : '—'; }, 'лет') +
      k('Капвложения', a.capexTotal, b.capexTotal, function (v) { return f(v / 1e6, 0); }, 'млн руб') + '</div>';
  }

  var TABS = [
    ['project', 'Проект'], ['res', 'Объект разработки'], ['wells', 'Скважины'], ['start', 'Стартовые дебиты'], ['forecast', 'Прогноз добычи'],
    ['econ', 'Экономика'], ['prob', 'P90 / P50 / P10'], ['calib', 'Калибровка по аналогам'], ['reports', 'Отчёты'], ['about', 'О программе']
  ];
  function nav() {
    return TABS.map(function (t, i) { return '<a data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'active' : '') + '"><span class="n">' + (i + 1) + '</span>' + t[1] + '</a>' + (i === 6 ? '<div class="sep"></div>' : ''); }).join('') +
      '<div class="foot">ТРИЗ-НФ ' + T.VERSION + '<br>© Шевченко О.Н.<br>Работает без интернета; данные остаются на этом компьютере.</div>';
  }

  /* ---------------- вкладки ---------------- */
  function vProject() {
    return '<h1>Проект</h1><p class="lead">Программа рассчитывает стартовые дебиты скважин по нелинейному закону фильтрации (формулы диссертации О.Н. Шевченко), строит профиль добычи объекта в двух вариантах — без поддержания пластового давления и с ППД — и оценивает экономическую эффективность. Результаты выгружаются в Word, PowerPoint и Excel.</p>' +
      kpis() +
      '<div class="card"><h2>Общие сведения</h2>' + fieldsHTML([F('meta.name', 'Название проекта', '', { type: 'text' }), F('meta.field', 'Месторождение / объект', '', { type: 'text' }), F('meta.author', 'Исполнитель', '', { type: 'text' }),
        F('startYear', 'Год начала прогноза', ''), F('years', 'Горизонт прогноза', 'лет'), F('Ke', 'Коэффициент эксплуатации', 'д.ед.'), F('reservesCap', 'Ограничивать добычу скважины извлекаемыми запасами (Sд·h·m·Sн·ρ/B·КИН)', '', { type: 'chk' })], P) + '</div>' +
      '<div class="card"><h2>Система ППД (для варианта «с ППД»)</h2>' + fieldsHTML([F('ppd.ratio', 'Соотношение добывающих и нагнетательных', 'доб. на 1 нагн.'), F('ppd.comp', 'Компенсация отборов закачкой', '%'), F('ppd.Bw', 'Объёмный коэффициент воды', '—'), F('ppd.existingInj', 'Имеющиеся нагнетательные скважины', 'шт.')], P) +
      '<p class="note">Вариант без ППД: падение дебита по двухъёмной модели упругого режима (4.34) с конечным τ₂. Вариант с ППД: предельный случай τ₂ → ∞ — формула (4.26) с долей подпитки φ. Параметры задаются для каждой группы скважин на вкладке «Скважины».</p></div>';
  }

  function vRes() {
    var r = P.res, bs = T.betaStar(r), chi = T.piezo(r, num(r.k, 1), num(r.mu, 1)), G = T.initialGradient(num(r.k, 1)), b = T.forchheimerB(num(r.k, 1) * 1e-15, r.m, num(r.rho, 0.85) * 1000);
    var Rk = num(r.KR, 6.07) * Math.sqrt(chi * num(r.tR, 30) * 86400);
    return '<h1>Объект разработки</h1><p class="lead">Свойства пласта и флюида и параметры методов расчёта. Параметры Aэф, KR и действующий градиент идентифицируются по скважинам-аналогам (вкладка «Калибровка»).</p>' +
      RES_SECTIONS.map(function (s, i) { return '<details class="sec"' + (i < 3 ? ' open' : '') + '><summary>' + esc(s.title) + '</summary>' + fieldsHTML(s.fields, P) + '</details>'; }).join('') +
      '<div class="card"><h2>Расчётные характеристики</h2><div class="kv" id="resCalc">' +
      '<div>Упругоёмкость β* = mβж + βс, 1/МПа</div><div>' + sig(bs) + '</div>' +
      '<div>Пьезопроводность χ, м²/с</div><div>' + sig(chi) + '</div>' +
      '<div>Rэкв = KR·√(χt) для ГС, м</div><div>' + f(Rk, 0) + '</div>' +
      '<div>Начальный градиент по керну H₀(k), МПа/м</div><div>' + f(G, 3) + (num(r.k, 1) >= 8 ? ' (k ≥ 8 мД — закон Дарси)' : '') + '</div>' +
      '<div>Инерционный коэффициент b(k), Па·с²/м³</div><div>' + sig(b) + '</div>' +
      '<div>Доля подпитки от ППД φ по (4.32)</div><div>' + f(T.phiPPD(num(r.k, 1)), 2) + '</div>' +
      '<div>Рекомендуемый метод</div><div>' + (num(r.mu, 1) >= 30 ? 'B — структурированная нефть (μ ≥ 30 мПа·с)' : num(r.k, 1) < 8 ? 'A — низкопроницаемый коллектор (k < 8 мД)' : 'A/B — проверить по аналогам') + '</div>' +
      '</div></div>';
  }

  function groupCard(g, i) {
    var s = R && R.starts[i];
    return '<div class="g' + (i === selGroup ? ' sel' : '') + '" data-group="' + i + '"><span class="q">' + (s ? f(s.Qliq, 0) + ' м³/сут' : '') + '</span><b>' + esc(g.name) + '</b><small>' + T.TYPES[g.well.type].name + (s ? ' · метод ' + s.method : '') + ' · ' + Object.keys(g.schedule || {}).reduce(function (a, y) { return a + num(g.schedule[y], 0); }, 0) + ' скв.</small></div>';
  }

  function declHTML(g, gi) {
    var w = g.well, d = w.decl;
    var pre = 'groups.' + gi + '.well.decl.';
    function presetSel(kind, phase) {
      var src = kind === 'noppd' ? T.DECLINE_PRESETS : T.PPD_PRESETS;
      return '<select class="preset" data-kind="' + kind + '" data-phase="' + phase + '"><option value="">— пресет из диссертации —</option>' + Object.keys(src).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select>';
    }
    function noppd(phase) {
      var o = d.noppd[phase];
      return '<h3>' + (phase === 'liq' ? 'Жидкость' : 'Нефть') + ' ' + presetSel('noppd', phase) + '</h3>' + fieldsHTML([
        F('a', 'Доля быстрой составляющей a', '—'), F('tauMode', 'τ₁', '', { type: 'sel', options: [['input', 'задать'], ['calc', 'по формуле τ = β*KV·V·ΔP/(B·Q₀)']], rerender: true }),
        F('t1', 'τ₁ — быстрое падение', 'сут', { show: function () { return o.tauMode !== 'calc'; } }), F('t2', 'τ₂ — подпитка из удалённой зоны', 'сут')], o, pre + 'noppd.' + phase + '.');
    }
    function ppd(phase) {
      var o = d.ppd[phase];
      return '<h3>' + (phase === 'liq' ? 'Жидкость' : 'Нефть') + ' ' + presetSel('ppd', phase) + '</h3>' + fieldsHTML([
        F('phiMode', 'Доля подпитки φ', '', { type: 'sel', options: [['input', 'задать'], ['4.32', 'по (4.32): φ = 0,08 + 0,12k']], rerender: true }),
        F('phi', 'φ', 'д.ед.', { show: function () { return o.phiMode !== '4.32'; } }),
        F('tauMode', 'τ', '', { type: 'sel', options: [['input', 'задать'], ['calc', 'по формуле (4.26)']], rerender: true }),
        F('tau', 'τ — время падения', 'сут', { show: function () { return o.tauMode !== 'calc'; } })], o, pre + 'ppd.' + phase + '.');
    }
    var s = R && R.starts[gi], dp1 = s ? T.declineParams(w, P.res, s, 'noppd') : null, dp2 = s ? T.declineParams(w, P.res, s, 'ppd') : null;
    var info = s ? '<p class="note">Расчётные параметры: без ППД — жидкость a = ' + f(dp1.liq.a, 2) + ', τ₁ = ' + f(dp1.liq.t1, 0) + ' сут, τ₂ = ' + (isFinite(dp1.liq.t2) ? f(dp1.liq.t2, 0) : '∞') + ' сут; с ППД — нефть φ = ' + f(1 - dp2.oil.a, 2) + ', τ = ' + f(dp2.oil.t1, 0) + ' сут. Снижение дебита нефти за первый год: без ППД — ' + f((1 - T.declineF(365, dp1.oil.a, dp1.oil.t1, dp1.oil.t2)) * 100, 0) + ' %, с ППД — ' + f((1 - T.declineF(365, dp2.oil.a, dp2.oil.t1, dp2.oil.t2)) * 100, 0) + ' %.</p>' : '';
    return '<div class="card"><h2>Падение дебита</h2>' +
      '<div class="field chk"><input type="checkbox" data-path="' + pre + 'sameOil" data-type="chk" data-rerender="1"' + (d.sameOil ? ' checked' : '') + ' id="sameOil"><label for="sameOil">Одинаковое падение нефти и жидкости (постоянная обводнённость)</label></div>' +
      '<div class="grid2"><div><h2 style="margin-top:12px">Без ППД — двухъёмная модель (4.34)</h2>' + noppd('liq') + (d.sameOil ? '' : noppd('oil')) + '</div>' +
      '<div><h2 style="margin-top:12px">С ППД — формула (4.26), τ₂ → ∞</h2>' + ppd('liq') + (d.sameOil ? '' : ppd('oil')) + '</div></div>' + info + '</div>';
  }

  function vWells() {
    if (!P.groups.length) return '<h1>Скважины</h1><div class="card"><p>Групп скважин нет.</p>' + addBtns() + '</div>';
    selGroup = Math.min(selGroup, P.groups.length - 1);
    var g = P.groups[selGroup], w = g.well, s = R && R.starts[selGroup];
    var yrs = []; for (var y = 0; y < Math.min(num(P.years, 20), 15); y++) yrs.push(num(P.startYear, 2027) + y);
    var ver = T.TYPES[w.type].verified, ext = ver ? '<span class="badge">проверено в диссертации (метод ' + ver + ')</span>' : '<span class="badge ext">расширение методики — нужна калибровка</span>';
    return '<h1>Скважины</h1><p class="lead">Группы однотипных скважин: конструкция, график ввода и параметры падения дебита для обоих вариантов разработки.</p>' +
      '<div class="groups"><div class="glist">' + P.groups.map(groupCard).join('') + addBtns() + '</div><div>' +
      '<div class="card"><div class="row"><h2 style="margin:0">' + esc(g.name) + ext + '</h2><span class="spacer"></span><button class="btn small" data-act="dupGroup">Копировать</button><button class="btn small danger" data-act="delGroup">Удалить</button></div><div style="height:10px"></div>' +
      fieldsHTML(wellFields(w), g, 'groups.' + selGroup + '.') + '</div>' +
      '<div class="grid2"><div class="card"><h2>Стартовый дебит</h2><div id="wellStart">' + startBlock(selGroup) + '</div></div>' +
      '<div class="card"><h2>Схема в плане</h2><div class="chart" id="wellPlan">' + (s ? CH.wellPlan(w, s, T) : '') + '</div></div></div>' +
      '<div class="card"><h2>График ввода скважин, шт.</h2><div class="sched">' + yrs.map(function (yy) { return '<div class="field"><label>' + yy + '</label><input type="text" inputmode="decimal" data-path="groups.' + selGroup + '.schedule.' + yy + '" data-type="num" value="' + esc(showNum((g.schedule || {})[yy])) + '"></div>'; }).join('') + '</div></div>' +
      declHTML(g, selGroup) + '</div></div>';
  }
  function addBtns() {
    return '<div class="row" style="margin-top:6px"><select id="newType">' + TYPE_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === 'GS_MGRP' ? ' selected' : '') + '>' + esc(T.TYPES[o[0]].name) + '</option>'; }).join('') + '</select><button class="btn small primary" data-act="addGroup">+ Группа</button></div>';
  }
  function startBlock(gi) {
    var s = R && R.starts[gi]; if (!s) return '';
    var html = '<div class="kv"><div>Метод</div><div><b>' + s.method + '</b></div><div>Дебит жидкости Q₀, м³/сут</div><div><b>' + f(s.Qliq, 1) + '</b></div><div>Дебит нефти, т/сут</div><div><b>' + f(s.Qoil, 1) + '</b></div>';
    Object.keys(s.details).forEach(function (k) { var v = s.details[k]; html += '<div>' + esc(k) + '</div><div>' + (typeof v === 'number' ? sig(v) : esc(v)) + '</div>'; });
    html += '</div>';
    s.warnings.forEach(function (w) { html += '<div class="warn">' + esc(w) + '</div>'; });
    html += '<p class="note">' + esc(T.METHODS[s.method]) + '</p>';
    return html;
  }

  function vStart() {
    if (!R) return '';
    var rows = P.groups.map(function (g, i) {
      var s = R.starts[i];
      return '<tr><td class="l">' + esc(g.name) + '</td><td>' + T.TYPES[g.well.type].name + '</td><td>' + s.method + '</td><td>' + f(s.Qliq, 1) + '</td><td>' + f(s.fw0 * 100, 0) + '</td><td>' + f(s.Qoil, 1) + '</td><td>' +
        (s.details['Kнф'] !== undefined ? f(s.details['Kнф'], 3) : '—') + '</td><td>' + (s.details['Rэкв, м'] ? f(s.details['Rэкв, м'], 0) : '—') + '</td><td>' + f(E.wellCapex(g.well, econ()), 0) + '</td><td class="l">' + (s.warnings.length ? '<span class="bad">' + s.warnings.length + '</span>' : '<span class="ok">✓</span>') + '</td></tr>';
    }).join('');
    var bars = CH.bars({ title: 'Стартовые дебиты', x: P.groups.map(function (g) { return g.name; }), series: [{ name: 'Жидкость, м³/сут', color: CH.COLORS.s1, values: R.starts.map(function (s) { return s.Qliq; }) }, { name: 'Нефть, т/сут', color: CH.COLORS.s2, values: R.starts.map(function (s) { return s.Qoil; }) }], height: 300 });
    return '<h1>Стартовые дебиты</h1><p class="lead">Дебит первого месяца работы по формулам нелинейной фильтрации. Подробный расчёт с промежуточными величинами — на вкладке «Скважины».</p>' +
      '<div class="card"><div class="scroll"><table class="t"><thead><tr><th>Группа</th><th>Тип</th><th>Метод</th><th>Qж, м³/сут</th><th>Обв., %</th><th>Qн, т/сут</th><th>Kнф</th><th>Rэкв, м</th><th>CAPEX, млн руб</th><th class="l">Предупр.</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="card chart">' + bars + '</div>' + cmpCard() +
      '<div class="grid2">' + P.groups.map(function (g, i) { return '<div class="card"><h2>' + esc(g.name) + '</h2><div class="chart">' + CH.wellPlan(g.well, R.starts[i], T) + '</div></div>'; }).join('') + '</div>';
  }

  function cmpCard() {
    if (!R.cmp) return '';
    var rows = R.cmp.map(function (c) {
      return '<tr><td class="l">' + esc(c.name) + '</td><td>' + c.start.method + '</td><td>' + f(c.start.Qliq, 1) + '</td><td>' + f(c.start.Qoil, 1) + '</td><td>' + f(c.noppd.oil1 / 1e3, 1) + '</td><td>' + f(c.noppd.oil10 / 1e3, 1) + '</td><td>' + f(c.ppd.oil10 / 1e3, 1) + '</td><td>' + f(c.capex, 0) + '</td><td>' + f(c.noppd.unit, 0) + '</td><td>' + f(c.noppd.NPV / 1e6, 0) + '</td><td>' + f(c.ppd.NPV / 1e6, 0) + '</td></tr>';
    }).join('');
    return '<div class="card"><h2>Сравнение конструкций скважин</h2><p class="note">Одна скважина каждого типа с параметрами шаблона при текущих свойствах объекта и экономических допущениях; в варианте с ППД к CAPEX добавлена доля нагнетательной скважины. Конструкции задаются на вкладке «Скважины» для групп; здесь — типовые шаблоны.</p>' +
      '<div class="scroll"><table class="t"><thead><tr><th>Тип</th><th>Метод</th><th>Qж₀, м³/сут</th><th>Qн₀, т/сут</th><th>Нефть за 1 год, тыс. т</th><th>Нефть за 10 лет без ППД, тыс. т</th><th>с ППД, тыс. т</th><th>CAPEX, млн руб</th><th>Уд. CAPEX без ППД, руб/т</th><th>ЧДД скв. без ППД, млн руб</th><th>с ППД, млн руб</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function fcCharts() {
    var A1 = R.fc.noppd.annual, A2 = R.fc.ppd.annual, x = A1.year.map(String), s1 = CH.COLORS.s1, s2 = CH.COLORS.s2;
    var oil = CH.line({ title: 'Годовая добыча нефти, тыс. т', x: x, series: [{ name: 'Без ППД', color: s1, values: A1.oil.map(function (v) { return v / 1e3; }) }, { name: 'С ППД', color: s2, values: A2.oil.map(function (v) { return v / 1e3; }) }] });
    var liq = CH.line({ title: 'Годовая добыча жидкости, тыс. м³', x: x, series: [{ name: 'Без ППД', color: s1, values: A1.liq.map(function (v) { return v / 1e3; }) }, { name: 'С ППД', color: s2, values: A2.liq.map(function (v) { return v / 1e3; }) }] });
    var fw = CH.line({ title: 'Обводнённость, %', x: x, series: [{ name: 'Без ППД', color: s1, values: A1.fw.map(function (v) { return v * 100; }) }, { name: 'С ППД', color: s2, values: A2.fw.map(function (v) { return v * 100; }) }] });
    var grp = CH.bars({ title: 'Добыча нефти по группам скважин (с ППД), тыс. т', x: x, stacked: true, series: A2.byGroup.map(function (g, i) { return { name: g.name, color: CH.SERIES[(i + 2) % 8], values: g.oil.map(function (v) { return v / 1e3; }) }; }) });
    return { oil: oil, liq: liq, fw: fw, grp: grp };
  }
  function vForecast() {
    if (!R) return '';
    var c = fcCharts(), sc = fcView === 'noppd' ? 'noppd' : 'ppd', A = R.fc[sc].annual;
    var rows = A.year.map(function (y, i) { return '<tr><td>' + y + '</td><td>' + f(A.oil[i] / 1e3, 2) + '</td><td>' + f(A.liq[i] / 1e3, 2) + '</td><td>' + f(A.fw[i] * 100, 1) + '</td><td>' + f(A.newWells[i], 0) + '</td><td>' + f(A.activeWells[i], 0) + '</td><td>' + f(A.qOilAvg[i], 1) + '</td><td>' + f(A.injWells[i], 0) + '</td><td>' + f(A.inj[i] / 1e3, 1) + '</td><td>' + f(A.cumOil[i] / 1e3, 1) + '</td></tr>'; }).join('');
    return '<h1>Прогноз добычи</h1><p class="lead">Профиль объекта — сумма профилей скважин с учётом графика ввода, коэффициента эксплуатации и ограничения по извлекаемым запасам.</p>' + kpis() +
      '<div class="grid2"><div class="card chart" id="chOil">' + c.oil + '</div><div class="card chart" id="chFw">' + c.fw + '</div><div class="card chart" id="chLiq">' + c.liq + '</div><div class="card chart" id="chGrp">' + c.grp + '</div></div>' +
      '<div class="card"><div class="row"><h2 style="margin:0">Технологические показатели</h2><span class="spacer"></span><div class="seg"><button data-fc="noppd" class="' + (sc === 'noppd' ? 'on' : '') + '">Без ППД</button><button data-fc="ppd" class="' + (sc === 'ppd' ? 'on' : '') + '">С ППД</button></div></div><div style="height:10px"></div>' +
      '<div class="scroll"><table class="t"><thead><tr><th>Год</th><th>Нефть, тыс. т</th><th>Жидкость, тыс. м³</th><th>Обводн., %</th><th>Ввод</th><th>Фонд доб.</th><th>Ср. дебит нефти, т/сут</th><th>Нагн. скв.</th><th>Закачка, тыс. м³</th><th>Накопл. нефть, тыс. т</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' + wellTable(sc);
  }
  function wellTable(sc) {
    var fc = R.fc[sc], W = fc.wells || [], Y = fc.annual.year;
    var head = '<tr><th style="text-align:left">Скважина</th><th>Ввод</th>' + Y.map(function (y) { return '<th>' + y + '</th>'; }).join('') + '<th>Итого</th></tr>';
    var body = W.map(function (w) { return '<tr><td class="l">' + esc(w.name) + (w.share < 1 ? ' (' + f(w.share, 2) + ')' : '') + '</td><td>' + w.startYear + '-' + ('0' + w.startMonth).slice(-2) + '</td>' + w.oil.map(function (v) { return '<td>' + f(v / 1e3, 2) + '</td>'; }).join('') + '<td><b>' + f(w.cumOil / 1e3, 2) + '</b></td></tr>'; }).join('');
    var tot = Y.map(function (y, i) { return W.reduce(function (a, w) { return a + w.oil[i]; }, 0); });
    body += '<tr><td class="l"><b>Итого по объекту = сумма скважин</b></td><td></td>' + tot.map(function (v) { return '<td><b>' + f(v / 1e3, 2) + '</b></td>'; }).join('') + '<td><b>' + f(tot.reduce(function (a, b) { return a + b; }, 0) / 1e3, 1) + '</b></td></tr>';
    return '<div class="card"><h2>Добыча нефти по скважинам и годам, тыс. т — ' + (sc === 'ppd' ? 'с ППД' : 'без ППД') + '</h2><p class="note">Каждая скважина рассчитывается отдельно (профиль группы со сдвигом на дату ввода); годовая добыча объекта — сумма по всем ' + W.length + ' скважинам. Таблица выгружается в Excel и в итоговый файл (листы «По скважинам»).</p><div class="scroll"><table class="t">' + head + body + '</table></div></div>';
  }

  function vEcon() {
    if (!R) return '';
    var sc = ecView, ev = R.ev[sc], S = R.sens[sc], x = R.fc.noppd.annual.year.map(String);
    var nd = E.ndpi(econ(), 0);
    var cf = CH.line({ title: 'Накопленный дисконтированный денежный поток, млн руб', x: x, series: [{ name: 'Без ППД', color: CH.COLORS.s1, values: R.ev.noppd.rows.map(function (r) { return r.dcum / 1e6; }) }, { name: 'С ППД', color: CH.COLORS.s2, values: R.ev.ppd.rows.map(function (r) { return r.dcum / 1e6; }) }] });
    var tor = CH.tornado({ title: 'Чувствительность ЧДД, млн руб (' + (sc === 'ppd' ? 'с ППД' : 'без ППД') + ')', items: S.items.map(function (i) { return { name: i.name, low: i.low / 1e6, high: i.high / 1e6 }; }), base: S.base / 1e6, delta: S.delta, height: 260 });
    var rows = ev.rows.map(function (r) { return '<tr><td>' + r.year + '</td><td>' + f(r.oil / 1e3, 1) + '</td><td>' + f(r.price, 0) + '</td><td>' + f(r.ndpiT, 0) + '</td><td>' + f(r.revenue / 1e6, 0) + '</td><td>' + f(r.ndpi / 1e6, 0) + '</td><td>' + f(r.opex / 1e6, 0) + '</td><td>' + f(r.capex / 1e6, 0) + '</td><td>' + f((r.profitTax + r.propTax) / 1e6, 0) + '</td><td>' + f(r.cf / 1e6, 0) + '</td><td>' + f(r.dcum / 1e6, 0) + '</td></tr>'; }).join('');
    return '<h1>Экономика</h1><p class="lead">Денежный поток недропользователя по годам, показатели эффективности и чувствительность. Значения по умолчанию условные — замените их на данные своего объекта.</p>' + kpis() +
      '<div class="grid2"><div>' + ECON_SECTIONS.map(function (s, i) { return '<details class="sec"' + (i < 2 ? ' open' : '') + '><summary>' + esc(s.title) + '</summary>' + fieldsHTML(s.fields, P) + '</details>'; }).join('') +
      '<div class="card"><div class="kv"><div>Нетбэк в первый год, руб/т</div><div>' + f(E.netback(econ(), 0), 0) + '</div><div>НДПИ в первый год, руб/т</div><div>' + f(typeof nd === 'object' ? nd.value : nd, 0) + '</div>' + (typeof nd === 'object' ? '<div>Кц</div><div>' + f(nd.Kc, 3) + '</div><div>Дм, руб/т</div><div>' + f(nd.Dm, 0) + '</div><div>Кман, руб/т</div><div>' + f(nd.Kman, 0) + '</div>' : '') +
      '<div>Цена безубыточности Urals: без ППД / с ППД, $/барр</div><div>' + f(R.sens.noppd.breakEvenUrals, 1) + ' / ' + f(R.sens.ppd.breakEvenUrals, 1) + '</div></div><p class="note">Коэффициенты НДПИ меняются законодательно — сверяйте с действующей редакцией НК РФ.</p></div></div>' +
      '<div><div class="card chart">' + cf + '</div><div class="card"><div class="row"><span class="spacer"></span><div class="seg"><button data-ec="noppd" class="' + (sc === 'noppd' ? 'on' : '') + '">Без ППД</button><button data-ec="ppd" class="' + (sc === 'ppd' ? 'on' : '') + '">С ППД</button></div></div><div class="chart">' + tor + '</div></div></div></div>' +
      '<div class="card"><h2>Денежный поток — ' + (sc === 'ppd' ? 'с ППД' : 'без ППД') + ', млн руб</h2><div class="scroll"><table class="t"><thead><tr><th>Год</th><th>Нефть, тыс. т</th><th>Нетбэк, руб/т</th><th>НДПИ, руб/т</th><th>Выручка</th><th>НДПИ</th><th>ОРЕХ</th><th>CAPEX</th><th>Налоги на приб. и имущ.</th><th>ДП</th><th>Накопл. ДДП</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---- калибровка ---- */
  function calibDefault(kind) {
    if (kind === 'KR' || kind === 'dg') return { kind: kind, rows: DATA.B2.wells.map(function (w) { return { name: w[0], L: w[1], h: w[2], k: w[3], b: w[4], Q: w[5] }; }), res: Object.assign({}, DATA.B2.res) };
    return { kind: 'Aef', rows: DATA.AS3.wells.map(function (w) { return { name: w[0], n: w[1], xf: w[2], h: w[3], L: w[4], dP: w[5], Q: w[6] }; }), res: Object.assign({}, DATA.AS3.res) };
  }
  function vCalib() {
    if (!calib) calib = { kind: 'Aef', data: calibDefault('Aef'), result: null, pts: DATA.AS3_DECLINE.map(function (p) { return p.join(' '); }).join('\n'), model: '4.26', fit: null };
    var c = calib, isA = c.kind === 'Aef';
    var cols = isA ? [['name', 'Скважина'], ['n', 'n'], ['xf', 'xf, м'], ['h', 'h, м'], ['L', 'L, м'], ['dP', 'ΔP, МПа'], ['Q', 'Qфакт, м³/сут']] : [['name', 'Скважина'], ['L', 'L, м'], ['h', 'h, м'], ['k', 'k, мД'], ['b', 'b, Па·с²/м³'], ['Q', 'Qфакт, м³/сут']];
    var resF = isA ? [F('k', 'k', 'мД'), F('mu', 'μ', 'мПа·с'), F('B', 'B', '—'), F('gamma', 'γ', '—')]
      : [F('mu', 'μ', 'мПа·с'), F('B', 'B', '—'), F('chi', 'χ', 'м²/с'), F('tR', 't', 'сут'), c.kind === 'KR' ? F('dg', 'grad P − G', 'МПа/м') : F('KR', 'KR', '—')];
    var body = c.data.rows.map(function (r, i) {
      var res = c.result, q = res ? res.Q[i] : null, err = res ? res.err[i] : null;
      return '<tr>' + cols.map(function (cl) { return '<td><input data-crow="' + i + '" data-ckey="' + cl[0] + '" value="' + esc(cl[0] === 'name' ? r[cl[0]] : showNum(r[cl[0]])) + '"' + (cl[0] === 'name' ? ' style="width:70px;text-align:left"' : '') + '></td>'; }).join('') +
        '<td>' + (q !== null ? f(q, 1) : '') + '</td><td>' + (err !== null ? f(err, 1) : '') + '</td><td>' + (res ? f(res.loo[i].err, 1) : '') + '</td><td><button class="btn small" data-act="delRow" data-i="' + i + '">×</button></td></tr>';
    }).join('');
    var r = c.result, pname = { Aef: 'Aэф, м²', KR: 'KR', dg: 'grad P − G, МПа/м' }[c.kind];
    var resHtml = r ? '<div class="kv" style="max-width:520px"><div>' + pname + ' (подбор, Σ ln²(Q/Qф) → min)</div><div><b>' + sig(r.value, 4) + '</b></div><div>Средняя погрешность, %</div><div>' + f(r.meanAbs, 1) + '</div><div>Медианная погрешность, %</div><div>' + f(r.medAbs, 1) + '</div><div>Перекрёстная проверка (исключение по одной), средняя, %</div><div>' + f(r.looMeanAbs, 1) + '</div><div>Диапазон параметра при перекрёстной проверке</div><div>' + sig(r.looRange[0], 3) + ' – ' + sig(r.looRange[1], 3) + '</div></div><div class="row" style="margin-top:10px"><button class="btn accent" data-act="applyCalib">Применить к объекту</button></div>' : '';
    var fit = c.fit;
    var fitHtml = fit ? '<div class="kv" style="max-width:520px"><div>Q₀</div><div>' + f(fit.Q0, 2) + '</div>' + (c.model === '4.26' ? '<div>φ</div><div>' + f(fit.phi, 3) + '</div><div>τ, сут</div><div>' + f(fit.t1, 1) + '</div>' : '<div>a</div><div>' + f(fit.a, 3) + '</div><div>τ₁, сут</div><div>' + f(fit.t1, 1) + '</div><div>τ₂, сут</div><div>' + f(fit.t2, 0) + '</div>') + '<div>Средняя погрешность аппроксимации, %</div><div>' + f(fit.meanAbs, 1) + '</div></div>' +
      '<div class="row" style="margin-top:10px"><select id="fitGroup">' + P.groups.map(function (g, i) { return '<option value="' + i + '">' + esc(g.name) + '</option>'; }).join('') + '</select><select id="fitPhase"><option value="oil">нефть</option><option value="liq">жидкость</option><option value="both">нефть и жидкость</option></select><button class="btn accent" data-act="applyFit">Применить к группе</button></div>' : '';
    var fitChart = '';
    if (fit) {
      var pts = parsePts(c.pts), xs = pts.map(function (p) { return Math.round(p.t); });
      fitChart = CH.line({ title: 'Факт и расчёт', x: xs.map(String), series: [{ name: 'Факт', color: CH.COLORS.s3, values: pts.map(function (p) { return p.q; }) }, { name: 'Формула (' + c.model + ')', color: CH.COLORS.s2, values: pts.map(function (p) { return fit.Q0 * T.declineF(p.t, fit.a, fit.t1, fit.t2); }) }], height: 260 });
    }
    return '<h1>Калибровка по скважинам-аналогам</h1><p class="lead">Подбор параметров формул по фактическим стартовым дебитам и динамике добычи — так, как это сделано в диссертации: минимизация суммы квадратов логарифмических отклонений и перекрёстная проверка с исключением каждой скважины.</p>' +
      '<div class="card"><div class="row"><h2 style="margin:0">Стартовые дебиты</h2><span class="spacer"></span><div class="seg"><button data-ck="Aef" class="' + (c.kind === 'Aef' ? 'on' : '') + '">Aэф (метод A)</button><button data-ck="KR" class="' + (c.kind === 'KR' ? 'on' : '') + '">KR (метод B)</button><button data-ck="dg" class="' + (c.kind === 'dg' ? 'on' : '') + '">grad P − G (метод B)</button></div></div>' +
      '<p class="note">По умолчанию загружены данные диссертации: ' + (isA ? '4 ГС с МГРП пласта АС3 (таблица 4.1) — ожидаемый результат Aэф ≈ 2 843 м², медиана 17 %.' : '6 ГС пласта Б2 (таблица 4.5) — ожидаемый результат KR ≈ 6,07, средняя погрешность 5,0 %.') + ' Замените строки своими скважинами.</p>' +
      fieldsHTML(resF, c.data.res, 'calib.res.') +
      '<div style="height:10px"></div><div class="scroll"><table class="t"><thead><tr>' + cols.map(function (cl) { return '<th>' + cl[1] + '</th>'; }).join('') + '<th>Qрасч</th><th>δ, %</th><th>δ LOO, %</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn" data-act="addRow">+ Скважина</button><button class="btn" data-act="resetCalib">Данные диссертации</button><span class="spacer"></span><button class="btn primary" data-act="runCalib">Подобрать</button></div><div style="height:10px"></div>' + resHtml + '</div>' +
      '<div class="card"><div class="row"><h2 style="margin:0">Параметры падения дебита</h2><span class="spacer"></span><div class="seg"><button data-cm="4.26" class="' + (c.model === '4.26' ? 'on' : '') + '">(4.26) φ, τ</button><button data-cm="4.34" class="' + (c.model === '4.34' ? 'on' : '') + '">(4.34) a, τ₁, τ₂</button></div></div>' +
      '<p class="note">Строки «время, сут — дебит». По умолчанию — медианная динамика ГС пласта АС3 (оцифровка рис. 4.4): ожидаемый результат Q₀ ≈ 26,5 т/сут, φ ≈ 0,29, τ ≈ 127 сут, погрешность 4,3 %.</p>' +
      '<div class="grid2"><div><textarea class="pts" id="ptsArea">' + esc(c.pts) + '</textarea><div class="row" style="margin-top:8px"><button class="btn primary" data-act="runFit">Подобрать</button></div><div style="height:10px"></div>' + fitHtml + '</div><div class="chart">' + fitChart + '</div></div></div>';
  }
  function parsePts(txt) { return txt.split(/\n/).map(function (l) { var a = l.trim().replace(/;/g, ' ').replace(/\t/g, ' ').split(/\s+/); return { t: parseNum(a[0]), q: parseNum(a[1]) }; }).filter(function (p) { return p.t !== '' && p.q !== '' && p.q > 0; }); }

  function vReports() {
    return '<h1>Отчёты</h1><p class="lead">Формирование отчётов по текущему проекту. Файлы создаются на этом компьютере без отправки данных в интернет.</p>' + kpis() +
      '<div class="grid3">' +
      '<div class="card"><h2>Word</h2><p class="note">Отчёт: исходные данные, методика с формулами, стартовые дебиты и схемы скважин, профили добычи с ППД и без ППД, экономика, чувствительность, выводы.</p><button class="btn primary" data-act="docx">Сформировать .docx</button></div>' +
      '<div class="card"><h2>PowerPoint</h2><p class="note">Презентация из 9 слайдов с редактируемыми диаграммами: ключевые результаты, методика, дебиты, профили, обводнённость и фонд, экономика, чувствительность, выводы.</p><button class="btn primary" data-act="pptx">Сформировать .pptx</button></div>' +
      '<div class="card"><h2>Excel</h2><p class="note">Книга с расчётом стартовых дебитов в формулах Excel, профилями по годам и месяцам, денежным потоком с формулами ЧДД и ВНД, чувствительностью.</p><button class="btn primary" data-act="xlsx">Сформировать .xlsx</button></div>' +
      '</div><div class="grid3">' +
      '<div class="card"><h2>Итоговый файл</h2><p class="note">Одна книга Excel со всеми исходными данными и результатами: стартовые дебиты, добыча по скважинам и годам (итог объекта — сумма скважин), профили, экономика, чувствительность, оценки P90/P50/P10. Файл можно снова открыть в программе.</p><button class="btn accent" data-act="final">Сохранить итоговый файл</button></div>' +
      '<div class="card"><h2>Загрузка исходных данных</h2><p class="note">Шаблон Excel с листами «ИД_Объект», «ИД_Скважины», «ИД_График». Заполните столбец «Значение» и загрузите книгу — данные подставятся автоматически. Можно перетащить файл в окно программы.</p><button class="btn" data-act="template">Скачать шаблон</button> <button class="btn primary" data-act="load">Загрузить данные</button></div>' +
      '<div class="card"><h2>Проект</h2><p class="note">Файл проекта (.json) хранит все исходные данные; его можно открыть позже кнопкой «Открыть».</p><button class="btn" data-act="save">Сохранить проект</button></div></div>';
  }

  function validationRows() {
    var out = [];
    var B = DATA.B2, res = Object.assign({ KR: 6.07 }, B.res);
    var list = B.wells.map(function (w) { return { well: { type: 'GS', method: 'B', L: w[1], h: w[2], k: w[3], b: w[4] }, Qfact: w[5] }; });
    var cb = T.calibrate('KR', list, res, 1, 20);
    out.push(['Пласт Б2, KR (табл. 4.5, раздел 4.4)', '6,07', f(cb.value, 2), Math.abs(cb.value - 6.07) < 0.02]);
    out.push(['Пласт Б2, средняя погрешность, %', '5,0', f(cb.meanAbs, 1), Math.abs(cb.meanAbs - 5.0) < 0.15]);
    out.push(['Пласт Б2, перекрёстная проверка, %', '6,0', f(cb.looMeanAbs, 1), Math.abs(cb.looMeanAbs - 6.0) < 0.2]);
    var A = DATA.AS3, la = A.wells.map(function (w) { return { well: { type: 'GS_MGRP', n: w[1], xf: w[2], h: w[3], L: w[4], dP: w[5] }, Qfact: w[6] }; });
    var ca = T.calibrate('Aef', la, A.res, 100, 1e5);
    out.push(['Пласт АС3, Aэф, м² (табл. 4.1)', '2 843', f(ca.value, 0), Math.abs(ca.value - 2843) < 10]);
    out.push(['Пласт АС3, медианная погрешность, %', '17', f(ca.medAbs, 1), Math.abs(ca.medAbs - 17.4) < 0.6]);
    var fit = T.fitDecline(DATA.AS3_DECLINE.map(function (p) { return { t: p[0], q: p[1] }; }), '4.26');
    out.push(['АС3, падение (4.26): φ / τ (табл. 4.4)', '0,29 / 127', f(fit.phi, 2) + ' / ' + f(fit.t1, 0), Math.abs(fit.phi - 0.29) < 0.01 && Math.abs(fit.t1 - 127) < 2]);
    out.push(['Теоретический KR по (4.6а)', '1,50', f(T.KR_THEORY, 2), Math.abs(T.KR_THEORY - 1.5) < 0.01]);
    return out;
  }
  function vAbout() {
    var v = validationRows();
    return '<h1>О программе</h1><p class="lead">«ТРИЗ-НФ» — программа прогноза добычи нефти для залежей с трудноизвлекаемыми запасами на основе нелинейного закона фильтрации. Версия ' + T.VERSION + '.</p>' +
      '<div class="card"><h2>Математическая модель</h2>' + RP.FORMULAS.map(function (fm) { return '<h3>' + esc(fm[0]) + '</h3>' + fm[1].map(function (t) { return '<div class="formula">' + esc(t) + '</div>'; }).join(''); }).join('') +
      '<p class="note">' + esc(RP.EXT_NOTE) + '</p></div>' +
      '<div class="card"><h2>Самопроверка: воспроизведение результатов диссертации</h2><table class="t"><thead><tr><th>Проверка</th><th>Диссертация</th><th>Программа</th><th>Результат</th></tr></thead><tbody>' +
      v.map(function (r) { return '<tr><td class="l">' + esc(r[0]) + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + (r[3] ? '<span class="ok">совпадает</span>' : '<span class="bad">расхождение</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="card"><h2>Правовая информация</h2><p>Автор математической модели и программы, правообладатель: <b>Шевченко Оксана Николаевна</b>. Копирование, распространение и модификация программы без письменного разрешения правообладателя запрещены.</p>' +
      '<p class="note">Программа использует свободные библиотеки с лицензией MIT: docx (формирование Word), PptxGenJS (PowerPoint), JSZip (архивы Office). Тексты лицензий приведены в исходном коде.</p></div>';
  }

  /* ---------------- отрисовка ---------------- */
  var VIEWS = { project: vProject, res: vRes, wells: vWells, start: vStart, forecast: vForecast, econ: vEcon, prob: vProb, calib: vCalib, reports: vReports, about: vAbout };
  function render() {
    $('#nav').innerHTML = nav();
    $('#projname').textContent = (P.meta.name || 'Проект') + (P.meta.field ? ' · ' + P.meta.field : '');
    var sy = window.scrollY;
    $('#main').innerHTML = VIEWS[tab]();
    window.scrollTo(0, sy);
  }
  function refreshOutputs() {
    // обновление расчётных блоков без перерисовки полей ввода (сохраняет фокус)
    var active = document.activeElement, path = active && active.getAttribute && active.getAttribute('data-path');
    var selStart = active && active.selectionStart;
    if (tab === 'wells') {
      var ws = $('#wellStart'), wp = $('#wellPlan');
      if (ws) ws.innerHTML = startBlock(selGroup);
      if (wp && R) wp.innerHTML = CH.wellPlan(P.groups[selGroup].well, R.starts[selGroup], T);
      document.querySelectorAll('.glist .g').forEach(function (el, i) { el.outerHTML = groupCard(P.groups[i], i); });
      var k = $('.kpis'); if (k) k.outerHTML = kpis();
      return;
    }
    if (tab === 'calib' || tab === 'about') return;
    render();
    if (path) { var el = document.querySelector('[data-path="' + path + '"]'); if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch (e) { /* select */ } } }
  }

  /* ---------------- события ---------------- */
  function onInput(e) {
    var el = e.target;
    if (el.hasAttribute('data-crow')) {
      var r = calib.data.rows[+el.getAttribute('data-crow')], key = el.getAttribute('data-ckey');
      r[key] = key === 'name' ? el.value : parseNum(el.value); return;
    }
    if (el.id === 'ptsArea') { calib.pts = el.value; return; }
    var path = el.getAttribute('data-path'); if (!path) return;
    var type = el.getAttribute('data-type'), v;
    if (type === 'chk') v = el.checked;
    else if (type === 'num') v = parseNum(el.value);
    else if (type === 'sel') v = el.getAttribute('data-num') ? +el.value : el.value;
    else v = el.value;
    if (path.indexOf('calib.res.') === 0) { set(calib.data.res, path.slice(10), v); return; }
    set(P, path, v);
    var rer = el.hasAttribute('data-rerender') || type === 'sel' || type === 'chk';
    if (path.indexOf('.well.type') > 0) { var g = P.groups[selGroup], oldT = Object.keys(T.TYPES).filter(function (k) { return T.TYPES[k].name === g.name; })[0]; g.well = DM.newWell(v); if (oldT || !g.name) g.name = T.TYPES[v].name; }
    if (e.type === 'change' || type === 'num' || type === 'text') schedule(rer && e.type === 'change');
  }
  function onClick(e) {
    var t = e.target.closest('[data-tab],[data-group],[data-act],[data-fc],[data-ec],[data-ck],[data-cm]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.group !== undefined) { selGroup = +t.dataset.group; render(); return; }
    if (t.dataset.fc) { fcView = t.dataset.fc; render(); return; }
    if (t.dataset.ec) { ecView = t.dataset.ec; render(); return; }
    if (t.dataset.ck) { calib.kind = t.dataset.ck; calib.data = calibDefault(t.dataset.ck); calib.result = null; render(); return; }
    if (t.dataset.cm) { calib.model = t.dataset.cm; calib.fit = null; render(); return; }
    var a = t.dataset.act;
    if (a === 'addGroup') { var ty = $('#newType').value; P.groups.push({ name: T.TYPES[ty].name, well: DM.newWell(ty), schedule: {} }); selGroup = P.groups.length - 1; recompute(); render(); }
    if (a === 'dupGroup') { var c = DM.clone(P.groups[selGroup]); c.name += ' (копия)'; P.groups.splice(selGroup + 1, 0, c); selGroup++; recompute(); render(); }
    if (a === 'delGroup') { if (P.groups.length > 1 || confirmDel()) { P.groups.splice(selGroup, 1); selGroup = Math.max(0, selGroup - 1); recompute(); render(); } }
    if (a === 'addRow') { calib.data.rows.push(calib.kind === 'Aef' ? { name: 'скв.', n: 10, xf: 100, h: 8, L: 1000, dP: 10, Q: 50 } : { name: 'скв.', L: 200, h: 3, k: 1500, b: '', Q: 80 }); render(); }
    if (a === 'delRow') { calib.data.rows.splice(+t.dataset.i, 1); calib.result = null; render(); }
    if (a === 'resetCalib') { calib.data = calibDefault(calib.kind); calib.result = null; render(); }
    if (a === 'runCalib') runCalib();
    if (a === 'applyCalib') applyCalib();
    if (a === 'runFit') { var pts = parsePts(calib.pts); if (pts.length < 4) { toast('Нужно не менее 4 точек'); return; } calib.fit = T.fitDecline(pts, calib.model); render(); }
    if (a === 'applyFit') applyFit();
    if (a === 'docx' || a === 'pptx' || a === 'xlsx' || a === 'final' || a === 'template') makeReport(a);
    if (a === 'load') $('#fileIn').click();
    if (a === 'runProb') runProb(true);
    if (a === 'resetUnc') { P.unc = defaultUnc(); PR = null; render(); }
    if (a === 'save') saveProject();
  }
  function confirmDel() { toast('Нельзя удалить последнюю группу'); return false; }

  function runCalib() {
    var c = calib, res = Object.assign({}, c.data.res), list;
    if (c.kind === 'Aef') list = c.data.rows.map(function (r) { return { well: { type: 'GS_MGRP', n: r.n, xf: r.xf, h: r.h, L: r.L, dP: r.dP }, Qfact: r.Q }; });
    else list = c.data.rows.map(function (r) { return { well: { type: 'GS', method: 'B', L: r.L, h: r.h, k: r.k, b: r.b }, Qfact: r.Q }; });
    list = list.filter(function (x) { return x.Qfact > 0; });
    if (list.length < 2) { toast('Нужно не менее двух скважин с фактическим дебитом'); return; }
    if (c.kind !== 'Aef') { res.chiMode = 'input'; res.RekvMode = 'KR'; res.dgMode = 'input'; if (c.data.rows.some(function (r) { return r.b === '' || r.b === undefined; })) res.bMode = 'auto'; else res.bMode = 'input'; }
    var range = { Aef: [10, 1e6], KR: [0.05, 100], dg: [1e-5, 10] }[c.kind];
    try { c.result = T.calibrate(c.kind, list, res, range[0], range[1]); } catch (e) { toast('Ошибка подбора: ' + e.message); }
    render();
  }
  function applyCalib() {
    var c = calib; if (!c.result) return;
    if (c.kind === 'Aef') P.res.Aef = +c.result.value.toFixed(0);
    if (c.kind === 'KR') { P.res.KR = +c.result.value.toFixed(3); P.res.RekvMode = 'KR'; P.res.tR = c.data.res.tR; }
    if (c.kind === 'dg') { P.res.dg = +c.result.value.toPrecision(4); P.res.dgMode = 'input'; }
    recompute(); toast('Параметр применён к объекту разработки'); render();
  }
  function applyFit() {
    var fit = calib.fit, gi = +$('#fitGroup').value, ph = $('#fitPhase').value, d = P.groups[gi].well.decl;
    var phases = ph === 'both' ? ['liq', 'oil'] : [ph];
    phases.forEach(function (p) {
      if (calib.model === '4.26') Object.assign(d.ppd[p], { phiMode: 'input', tauMode: 'input', phi: +fit.phi.toFixed(3), tau: +fit.t1.toFixed(1) });
      else Object.assign(d.noppd[p], { tauMode: 'input', a: +fit.a.toFixed(3), t1: +fit.t1.toFixed(1), t2: +fit.t2.toFixed(0) });
    });
    recompute(); toast('Параметры падения применены к группе «' + P.groups[gi].name + '» (' + (calib.model === '4.26' ? 'вариант с ППД' : 'вариант без ППД') + ')');
  }
  function onPreset(e) {
    var el = e.target; if (!el.classList.contains('preset') || !el.value) return;
    var d = P.groups[selGroup].well.decl, kind = el.dataset.kind, ph = el.dataset.phase;
    if (kind === 'noppd') Object.assign(d.noppd[ph], T.DECLINE_PRESETS[el.value], { tauMode: 'input' });
    else Object.assign(d.ppd[ph], T.PPD_PRESETS[el.value], { phiMode: 'input', tauMode: 'input' });
    recompute(); render();
  }

  /* ---------------- отчёты ---------------- */
  function reportCharts() {
    var c = fcCharts(), x = R.fc.noppd.annual.year.map(String), best = R.ev.ppd.NPV > R.ev.noppd.NPV ? 'ppd' : 'noppd', S = R.sens[best];
    var svgs = {
      oil: c.oil, fw: c.fw,
      cf: CH.line({ title: 'Накопленный ДДП, млн руб', x: x, series: [{ name: 'Без ППД', color: CH.COLORS.s1, values: R.ev.noppd.rows.map(function (r) { return r.dcum / 1e6; }) }, { name: 'С ППД', color: CH.COLORS.s2, values: R.ev.ppd.rows.map(function (r) { return r.dcum / 1e6; }) }] }),
      tornado: CH.tornado({ title: 'Чувствительность ЧДД, млн руб', items: S.items.map(function (i) { return { name: i.name, low: i.low / 1e6, high: i.high / 1e6 }; }), base: S.base / 1e6, delta: S.delta, height: 260 })
    };
    P.groups.forEach(function (g, i) { svgs['plan' + i] = CH.wellPlan(g.well, R.starts[i], T); });
    var keys = Object.keys(svgs), img = {};
    return Promise.all(keys.map(function (k) { return CH.toPng(svgs[k], 2).then(function (r) { img[k] = r; }); })).then(function () { return img; });
  }
  function makeReport(kind) {
    if (!R) return;
    var base = fileSafe((P.meta.field || P.meta.name || 'проект')) + '_' + new Date().toISOString().slice(0, 10);
    toast('Формирую файл…');
    var p;
    if (kind === 'template') {
      var wt = window.XLSXW.workbook(); wt.props = { title: 'Исходные данные ТРИЗ-НФ', app: 'ТРИЗ-НФ ' + T.VERSION };
      p = DIO.addInputSheets(wt, P, labelMap()).toBlob().then(function (b) { saveBlob(b, 'Исходные_данные_' + base + '.xlsx'); });
      p.then(function () { toast('Шаблон исходных данных сохранён'); }).catch(function (e) { toast('Ошибка: ' + e.message); });
      return;
    }
    ensureProb();
    if (kind === 'final') p = Promise.resolve().then(function () { var wb = RP.buildXlsx(P, R); DIO.addInputSheets(wb, P, labelMap()); DIO.addJsonSheet(wb, P, T.VERSION); return wb.toBlob(); }).then(function (b) { saveBlob(b, 'Итоговый_расчёт_' + base + '.xlsx'); });
    else if (kind === 'xlsx') p = RP.buildXlsx(P, R).toBlob().then(function (b) { saveBlob(b, 'Прогноз_' + base + '.xlsx'); });
    else if (kind === 'docx') p = reportCharts().then(function (img) { return window.docx.Packer.toBlob(RP.buildDocx(P, R, img)); }).then(function (b) { saveBlob(b, 'Отчёт_' + base + '.docx'); });
    else p = reportCharts().then(function (img) { return RP.buildPptx(P, R, img).write({ outputType: 'blob' }); }).then(function (b) { saveBlob(b, 'Презентация_' + base + '.pptx'); });
    p.then(function () { toast('Файл сформирован и сохранён в папку загрузок'); }).catch(function (e) { console.error(e); toast('Ошибка: ' + e.message); });
  }

  /* ---------------- проект ---------------- */
  function saveProject() {
    var b = new Blob([JSON.stringify({ app: 'TRIZ-NF', version: T.VERSION, project: P }, null, 1)], { type: 'application/json' });
    saveBlob(b, fileSafe(P.meta.name || 'проект') + '.trizproj.json'); toast('Проект сохранён');
  }
  function openProject(file) {
    var fr = new FileReader();
    fr.onload = function () {
      DIO.loadAny(file.name, fr.result).then(function (r) {
        var pr = r.project;
        if (!pr.groups || !pr.res) throw new Error('файл не является проектом ТРИЗ-НФ');
        P = normalize(pr); PR = null; selGroup = 0; recompute(); render();
        toast('Исходные данные загружены: ' + r.source + (r.warnings.length ? '. Замечания: ' + r.warnings.join('; ') : ''));
      }).catch(function (e) { toast('Не удалось загрузить: ' + e.message); });
    };
    fr.readAsArrayBuffer(file);
  }
  function labelMap() {
    var m = {};
    RES_SECTIONS.concat(ECON_SECTIONS).forEach(function (s) { s.fields.forEach(function (fd) { m[fd.path] = [fd.label, fd.unit || '']; }); });
    Object.keys(T.TYPES).forEach(function (t) { wellFields(DM.newWell(t)).forEach(function (fd) { if (!m[fd.path]) m[fd.path] = [fd.label, fd.unit || '']; }); });
    [['meta.name', 'Название проекта'], ['meta.field', 'Месторождение, объект'], ['meta.author', 'Исполнитель'], ['meta.created', 'Дата'], ['startYear', 'Первый год прогноза'], ['years', 'Горизонт прогноза', 'лет'], ['Ke', 'Коэффициент эксплуатации', 'д.ед.'], ['reservesCap', 'Ограничение по извлекаемым запасам', 'да/нет'],
      ['ppd.ratio', 'Соотношение добывающих и нагнетательных', 'доб./нагн.'], ['ppd.comp', 'Компенсация отбора закачкой', '%'], ['ppd.Bw', 'Объёмный коэффициент воды', '—'], ['ppd.existingInj', 'Существующие нагнетательные скважины', 'шт.']].forEach(function (x) { if (!m[x[0]]) m[x[0]] = [x[1], x[2] || '']; });
    return m;
  }

  /* ---------------- вероятностная оценка ---------------- */
  function defaultUnc() { return { params: DM.clone(T.UNC_DEFAULT), n: 1000, nProd: 300 }; }
  function runProb(show) {
    if (!P.unc) P.unc = defaultUnc();
    try {
      PR = T.probabilistic(P, { params: P.unc.params, n: P.unc.n, nProd: P.unc.nProd, production: true, evaluate: function (pp, fc) { return E.evaluate(pp, fc); } });
      R.prob = PR; persist();
      if (show) { render(); toast('Вероятностная оценка выполнена: ' + PR.n + ' реализаций'); }
    } catch (e) { console.error(e); toast('Ошибка вероятностной оценки: ' + e.message); }
  }
  function ensureProb() { if (!PR || PR.stale) runProb(false); R.prob = PR; }
  function vProb() {
    if (!P.unc) P.unc = defaultUnc();
    var U = P.unc, DN = [['tri', 'треугольное'], ['logn', 'логнормальное'], ['uni', 'равномерное']];
    var rows = U.params.map(function (p, i) {
      return '<tr><td class="l"><label><input type="checkbox" data-path="unc.params.' + i + '.on" data-type="chk"' + (p.on !== false ? ' checked' : '') + '> ' + esc(p.name) + '</label></td>' +
        '<td><input data-path="unc.params.' + i + '.low" data-type="num" value="' + esc(showNum(p.low)) + '" style="width:70px"></td><td><input data-path="unc.params.' + i + '.high" data-type="num" value="' + esc(showNum(p.high)) + '" style="width:70px"></td>' +
        '<td><select data-path="unc.params.' + i + '.dist" data-type="sel">' + DN.map(function (d) { return '<option value="' + d[0] + '"' + (p.dist === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select></td></tr>';
    }).join('');
    var set = '<div class="card"><h2>Неопределённые параметры</h2><p class="note">Отклонения от базовых значений, %. Для треугольного и равномерного распределения — границы, для логнормального — уровни P90 и P10 (медиана — базовое значение). В одной реализации множитель одинаков для всех групп скважин.</p>' +
      '<div class="scroll"><table class="t"><thead><tr><th style="text-align:left">Параметр</th><th>Нижн., %</th><th>Верхн., %</th><th>Распределение</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="row" style="margin-top:10px"><div class="field" style="width:200px"><label>Реализаций (дебиты)</label><input data-path="unc.n" data-type="num" value="' + esc(showNum(U.n)) + '"></div><div class="field" style="width:220px"><label>Реализаций (добыча и ЧДД)</label><input data-path="unc.nProd" data-type="num" value="' + esc(showNum(U.nProd)) + '"></div><span class="spacer"></span><button class="btn" data-act="resetUnc">По умолчанию</button><button class="btn primary" data-act="runProb">Рассчитать</button></div></div>';
    var res = '';
    if (PR) {
      var tr = PR.groups.map(function (g) { return '<tr><td class="l">' + esc(g.name) + '</td><td>' + f(g.liq.P90, 1) + '</td><td><b>' + f(g.liq.P50, 1) + '</b></td><td>' + f(g.liq.P10, 1) + '</td><td>' + f(g.base, 1) + '</td><td>' + f(g.oil.P90, 1) + ' / ' + f(g.oil.P50, 1) + ' / ' + f(g.oil.P10, 1) + '</td></tr>'; }).join('');
      var fr = ['noppd', 'ppd'].map(function (sc) { var F = PR.field[sc]; if (!F) return ''; return '<tr><td class="l">' + (sc === 'ppd' ? 'С ППД' : 'Без ППД') + '</td><td>' + f(F.cumOil.P90 / 1e3, 0) + ' / <b>' + f(F.cumOil.P50 / 1e3, 0) + '</b> / ' + f(F.cumOil.P10 / 1e3, 0) + '</td><td>' + (F.npv ? f(F.npv.P90 / 1e6, 0) + ' / <b>' + f(F.npv.P50 / 1e6, 0) + '</b> / ' + f(F.npv.P10 / 1e6, 0) : '—') + '</td><td>' + (F.npv ? f(100 * F.npvPos, 0) + ' %' : '—') + '</td></tr>'; }).join('');
      var sc = R.ev.ppd.NPV > R.ev.noppd.NPV ? 'ppd' : 'noppd', Fy = PR.field[sc].yearOil, x = R.fc.noppd.annual.year.map(String);
      var ch = CH.line({ title: 'Годовая добыча нефти, тыс. т — ' + (sc === 'ppd' ? 'с ППД' : 'без ППД'), x: x, series: [{ name: 'P90', color: CH.COLORS.s1, values: Fy.P90.map(function (v) { return v / 1e3; }) }, { name: 'P50', color: CH.COLORS.s3 || '#14213D', values: Fy.P50.map(function (v) { return v / 1e3; }) }, { name: 'P10', color: CH.COLORS.s2, values: Fy.P10.map(function (v) { return v / 1e3; }) }], height: 300 });
      var hs = hist(PR.samples.qSum, 16), hc = CH.bars({ title: 'Распределение суммарного стартового дебита жидкости, м³/сут', x: hs.labels, series: [{ name: 'Доля реализаций, %', color: CH.COLORS.s1, values: hs.vals }], height: 300 });
      res = (PR.stale ? '<div class="warn">Исходные данные изменились после расчёта — нажмите «Рассчитать» (при выгрузке отчётов расчёт обновится автоматически).</div>' : '') +
        '<div class="card"><h2>Стартовые дебиты: P90 / P50 / P10</h2><p class="note">P90 — значение превышается с вероятностью 90 % (пессимистичная оценка), P50 — медиана, P10 — превышается с вероятностью 10 % (оптимистичная). ' + PR.n + ' реализаций.</p><div class="scroll"><table class="t"><thead><tr><th style="text-align:left">Группа</th><th>Qж P90</th><th>Qж P50</th><th>Qж P10</th><th>Детерм.</th><th>Qн P90 / P50 / P10, т/сут</th></tr></thead><tbody>' + tr +
        '<tr><td class="l"><b>Сумма по вводимым скважинам, м³/сут</b></td><td>' + f(PR.field.qStart.P90, 0) + '</td><td><b>' + f(PR.field.qStart.P50, 0) + '</b></td><td>' + f(PR.field.qStart.P10, 0) + '</td><td></td><td></td></tr></tbody></table></div></div>' +
        '<div class="card"><h2>Добыча и ЧДД объекта</h2><div class="scroll"><table class="t"><thead><tr><th style="text-align:left">Вариант</th><th>Накопленная нефть за ' + P.years + ' лет, тыс. т (P90 / P50 / P10)</th><th>ЧДД, млн руб (P90 / P50 / P10)</th><th>Вероятность ЧДД > 0</th></tr></thead><tbody>' + fr + '</tbody></table></div><p class="note">' + PR.nProd + ' реализаций.</p></div>' +
        '<div class="grid2"><div class="card chart">' + ch + '</div><div class="card chart">' + hc + '</div></div>';
    }
    return '<h1>Вероятностная оценка P90 / P50 / P10</h1><p class="lead">Метод Монте-Карло: параметры пласта и скважин варьируются в заданных пределах, для каждой реализации рассчитываются стартовые дебиты, профили добычи и ЧДД. Результаты включаются в отчёты Word, PowerPoint, Excel и в итоговый файл.</p>' + kpis() + set + res;
  }
  function hist(arr, nb) {
    var a = arr.filter(isFinite), lo = Math.min.apply(null, a), hi = Math.max.apply(null, a), w = (hi - lo) / nb || 1, c = new Array(nb).fill(0);
    a.forEach(function (v) { c[Math.min(nb - 1, Math.floor((v - lo) / w))]++; });
    return { labels: c.map(function (x, i) { return f(lo + (i + 0.5) * w, 0); }), vals: c.map(function (x) { return 100 * x / a.length; }) };
  }
  function normalize(pr) {
    var d = DM.demoProject();
    pr.meta = Object.assign({}, d.meta, pr.meta || {}); pr.res = Object.assign({}, d.res, pr.res || {}); pr.ppd = Object.assign({}, d.ppd, pr.ppd || {}); pr.econ = pr.econ || {};
    pr.groups.forEach(function (g) {
      if (T.LEGACY_TYPES[g.well.type]) g.well.type = T.LEGACY_TYPES[g.well.type];
      if (g.well.type === 'NNS' && g.well.frac) { g.well.type = 'NNS_GRP'; delete g.well.frac; }
      var t = DM.newWell(T.TYPES[g.well.type] ? g.well.type : 'GS'); g.well = Object.assign(t, g.well); g.schedule = g.schedule || {};
    });
    ['startYear', 'years', 'Ke'].forEach(function (k) { if (pr[k] === undefined) pr[k] = d[k]; });
    return pr;
  }

  function init() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    P = saved && saved.groups ? normalize(saved) : DM.demoProject();
    recompute();
    document.addEventListener('input', onInput);
    document.addEventListener('change', function (e) { if (e.target.classList.contains('preset')) onPreset(e); else onInput(e); });
    document.addEventListener('click', onClick);
    $('#btnNew').onclick = function () { P = DM.demoProject(); P.groups = [{ name: 'ГС с МГРП', well: DM.newWell('GS_MGRP'), schedule: {} }]; P.groups[0].schedule[P.startYear] = 10; P.meta.name = 'Новый проект'; P.meta.field = ''; selGroup = 0; recompute(); tab = 'project'; render(); };
    $('#btnDemo').onclick = function () { P = DM.demoProject(); selGroup = 0; recompute(); render(); toast('Загружен проект-пример'); };
    $('#btnSave').onclick = saveProject;
    $('#btnOpen').onclick = function () { $('#fileIn').click(); };
    $('#fileIn').onchange = function (e) { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; };
    $('#btnFinal').onclick = function () { makeReport('final'); };
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); var fl = e.dataTransfer && e.dataTransfer.files[0]; if (fl) openProject(fl); });
    render();
  }
  window.TRIZ_APP = { get project() { return P; }, get results() { return R; }, setTab: function (t) { tab = t; render(); }, makeReport: makeReport };
  document.addEventListener('DOMContentLoaded', init);
}());
