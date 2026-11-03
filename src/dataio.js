/* ТРИЗ-НФ — загрузка исходных данных из файла (xlsx/json) и итоговый файл расчёта.
 * Шаблон исходных данных: листы «ИД_Объект» (код параметра — значение), «ИД_Скважины» (параметры групп по столбцам),
 * «ИД_График» (ввод скважин по годам). Итоговый файл дополнительно содержит все результаты и лист «ИД_JSON»
 * с полной копией проекта, поэтому его можно снова открыть в программе без потерь. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./econ.js'), require('./demo.js'), require('jszip'));
  else root.TRIZ_DATAIO = factory(root.TRIZ, root.TRIZ_ECON, root.TRIZ_DEMO, root.JSZip);
}(typeof self !== 'undefined' ? self : this, function (T, E, DM, JSZip) {
  'use strict';
  var SHEET_OBJ = 'ИД_Объект', SHEET_WELLS = 'ИД_Скважины', SHEET_SCHED = 'ИД_График', SHEET_JSON = 'ИД_JSON';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function get(o, path) { return path.split('.').reduce(function (a, k) { return a === undefined || a === null ? undefined : a[k]; }, o); }
  function set(o, path, v) { var ks = path.split('.'), last = ks.pop(); ks.forEach(function (k) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }); o[last] = v; }
  function flatten(o, pre, out) {
    out = out || [];
    Object.keys(o || {}).forEach(function (k) {
      var v = o[k], p = pre ? pre + '.' + k : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
      else if (!Array.isArray(v)) out.push([p, v]);
    });
    return out;
  }
  // разбор значения ячейки: число (в т.ч. с запятой), логическое, строка
  function parseVal(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    var s = String(v).trim();
    if (s === '') return '';
    var low = s.toLowerCase();
    if (low === 'true' || low === 'да' || low === 'истина') return true;
    if (low === 'false' || low === 'нет' || low === 'ложь') return false;
    var n = s.replace(/\s/g, '').replace(',', '.');
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(n)) return parseFloat(n);
    return s;
  }
  function typeCode(v) {
    var s = String(v || '').trim();
    if (T.TYPES[s]) return s;
    if (T.LEGACY_TYPES && T.LEGACY_TYPES[s]) return T.LEGACY_TYPES[s];
    var k = Object.keys(T.TYPES).filter(function (c) { return T.TYPES[c].name.toLowerCase() === s.toLowerCase() || T.TYPES[c].full.toLowerCase() === s.toLowerCase(); })[0];
    return k || null;
  }

  /* ------------------------- запись листов исходных данных ------------------------- */
  function objectRows(P) {
    var rows = [];
    ['name', 'field', 'author', 'created'].forEach(function (k) { rows.push(['meta.' + k, P.meta ? P.meta[k] : '']); });
    ['startYear', 'years', 'Ke', 'reservesCap'].forEach(function (k) { rows.push([k, P[k]]); });
    flatten(P.res, 'res').forEach(function (r) { rows.push(r); });
    flatten(P.ppd, 'ppd').forEach(function (r) { rows.push(r); });
    var e = Object.assign({}, clone(E.DEFAULTS), clone(P.econ || {}));
    e.capex = Object.assign({}, clone(E.DEFAULTS.capex), (P.econ || {}).capex || {});
    flatten(e, 'econ').forEach(function (r) { rows.push(r); });
    return rows;
  }
  function addInputSheets(wb, P, labels) {
    labels = labels || {};
    var lab = function (p) { return labels[p] || ['', '']; };
    var s = wb.sheet(SHEET_OBJ, { cols: [26, 48, 16, 12], freeze: 'A3' });
    s.row([{ v: 'Исходные данные объекта (меняйте только столбец «Значение»; лист можно загрузить в ТРИЗ-НФ кнопкой «Загрузить данные»)', s: 'b' }]);
    s.row([{ v: 'Код параметра', s: 'h' }, { v: 'Наименование', s: 'h' }, { v: 'Значение', s: 'h' }, { v: 'Ед. изм.', s: 'h' }]);
    objectRows(P).forEach(function (r) {
      var v = r[1], isNum = typeof v === 'number';
      s.row([r[0], lab(r[0])[0], { v: v === undefined || v === null ? '' : (typeof v === 'boolean' ? (v ? 'да' : 'нет') : v), s: isNum ? 'inn' : 'in' }, lab(r[0])[1]]);
    });

    var w = wb.sheet(SHEET_WELLS, { cols: [28, 40].concat(P.groups.map(function () { return 18; })), freeze: 'C4' });
    w.row([{ v: 'Группы скважин: каждая группа — отдельный столбец. Тип — код или краткое название (ГС с МГРП, ННС с ГРП, МЗС с МГРП, Фишбон …)', s: 'b' }]);
    w.row([{ v: 'Код параметра', s: 'h' }, { v: 'Наименование', s: 'h' }].concat(P.groups.map(function (g, i) { return { v: 'Группа ' + (i + 1), s: 'h' }; })));
    w.row(['name', 'Название группы'].concat(P.groups.map(function (g) { return { v: g.name, s: 'in' }; })));
    w.row(['well.type', 'Тип скважины (код)'].concat(P.groups.map(function (g) { return { v: g.well.type, s: 'in' }; })));
    var keys = [], seen = {};
    P.groups.forEach(function (g) { flatten(g.well, 'well').forEach(function (r) { if (r[0] !== 'well.type' && !seen[r[0]]) { seen[r[0]] = 1; keys.push(r[0]); } }); });
    keys.forEach(function (k) {
      w.row([k, lab(k)[0] + (lab(k)[1] ? ', ' + lab(k)[1] : '')].concat(P.groups.map(function (g) {
        var v = get(g, k); if (v === undefined || v === null) return '';
        return { v: typeof v === 'boolean' ? (v ? 'да' : 'нет') : v, s: typeof v === 'number' ? 'inn' : 'in' };
      })));
    });

    var years = []; for (var y = +P.startYear; y < +P.startYear + (+P.years || 20); y++) years.push(y);
    var g = wb.sheet(SHEET_SCHED, { cols: [28].concat(years.map(function () { return 7; })), freeze: 'B3' });
    g.row([{ v: 'График ввода скважин, шт. (строки — группы в том же порядке, что на листе «ИД_Скважины»)', s: 'b' }]);
    g.row([{ v: 'Группа', s: 'h' }].concat(years.map(function (yy) { return { v: yy, s: 'h' }; })));
    P.groups.forEach(function (gr) { g.row([gr.name].concat(years.map(function (yy) { var v = (gr.schedule || {})[yy]; return v ? { v: +v, s: 'inn' } : ''; }))); });
    return wb;
  }
  function addJsonSheet(wb, P, version) {
    var s = wb.sheet(SHEET_JSON, { cols: [120] });
    var txt = JSON.stringify({ app: 'TRIZ-NF', version: version, project: P });
    s.row([{ v: 'Полная копия проекта для повторного открытия в ТРИЗ-НФ. Не редактируйте этот лист.', s: 'note' }]);
    for (var i = 0; i < txt.length; i += 30000) s.row([txt.slice(i, i + 30000)]);
    return wb;
  }

  /* ------------------------- чтение xlsx ------------------------- */
  // лёгкий разбор XML книги Excel регулярными выражениями (без внешних библиотек)
  function unesc(t) { return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, '&'); }
  function attrs(tag) { var o = {}, re = /([\w:]+)\s*=\s*"([^"]*)"/g, m; while ((m = re.exec(tag))) o[m[1]] = unesc(m[2]); return o; }
  function tTexts(x) { var out = [], re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g, m; while ((m = re.exec(x))) out.push(unesc(m[1])); return out.join(''); }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return c - 1; }
  function parseSheet(x, shared) {
    var rows = [], reRow = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g, mr, ri = -1;
    while ((mr = reRow.exec(x))) {
      var ra = attrs(mr[1]); ri = ra.r ? +ra.r - 1 : ri + 1;
      var row = [], reC = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g, mc, ci = -1;
      var body = mr[2] || '';
      while ((mc = reC.exec(body))) {
        var ca = attrs(mc[1]), inner = mc[2] || '', v; ci = ca.r ? colIndex(ca.r) : ci + 1;
        var vm = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner), vt = vm ? unesc(vm[1]) : '';
        if (ca.t === 's') v = shared[+vt];
        else if (ca.t === 'inlineStr') v = tTexts(inner);
        else if (ca.t === 'str' || ca.t === 'e') v = vt;
        else if (ca.t === 'b') v = vt === '1';
        else v = vm ? +vt : '';
        row[ci] = v;
      }
      rows[ri] = row;
    }
    return rows;
  }
  function readXlsx(data) {
    return JSZip.loadAsync(data).then(function (z) {
      var f = function (p) { var e = z.file(p); return e ? e.async('string') : Promise.resolve(null); };
      return Promise.all([f('xl/workbook.xml'), f('xl/_rels/workbook.xml.rels'), f('xl/sharedStrings.xml')]).then(function (a) {
        if (!a[0]) throw new Error('файл не является книгой Excel (.xlsx)');
        var rels = {}, shared = [], m, re;
        if (a[1]) { re = /<Relationship\b([^>]*)\/?>/g; while ((m = re.exec(a[1]))) { var ra = attrs(m[1]); rels[ra.Id] = ra.Target; } }
        if (a[2]) { re = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g; while ((m = re.exec(a[2]))) shared.push(tTexts(m[1])); }
        var sheets = []; re = /<(?:\w+:)?sheet\b([^>]*)\/?>/g;
        while ((m = re.exec(a[0]))) { var sa = attrs(m[1]), t = rels[sa['r:id']] || ''; t = t.replace(/^\//, ''); if (t.indexOf('xl/') !== 0) t = 'xl/' + t; sheets.push({ name: sa.name, path: t }); }
        return Promise.all(sheets.map(function (s) { return f(s.path); })).then(function (xs) {
          var out = {};
          sheets.forEach(function (s, i) { if (xs[i]) out[s.name] = parseSheet(xs[i], shared); });
          return out;
        });
      });
    });
  }

  /* ------------------------- сборка проекта из листов ------------------------- */
  function projectFromSheets(sh) {
    var warn = [];
    if (sh[SHEET_JSON]) {
      var txt = sh[SHEET_JSON].slice(1).map(function (r) { return r && r[0] ? String(r[0]) : ''; }).join('');
      try { var o = JSON.parse(txt); return { project: o.project || o, source: 'полная копия проекта (лист ИД_JSON)', warnings: warn }; } catch (e) { warn.push('лист ИД_JSON повреждён — данные взяты из листов исходных данных'); }
    }
    if (!sh[SHEET_OBJ] && !sh[SHEET_WELLS]) throw new Error('в книге нет листов «' + SHEET_OBJ + '» и «' + SHEET_WELLS + '» — используйте шаблон исходных данных ТРИЗ-НФ');
    var P = DM.demoProject(), n = 0;
    (sh[SHEET_OBJ] || []).forEach(function (r) {
      if (!r || !r[0] || String(r[0]).indexOf(' ') >= 0 || r[0] === 'Код параметра') return;
      var code = String(r[0]).trim(), v = parseVal(r[2]);
      if (v === '' && code.indexOf('meta.') !== 0) return;
      if (code.indexOf('econ.') === 0) { P.econ = P.econ || {}; set(P, code, v); }
      else set(P, code, code.indexOf('meta.') === 0 ? String(v) : v);
      n++;
    });
    var W = sh[SHEET_WELLS];
    if (W) {
      var nameRow = W.filter(function (r) { return r && r[0] === 'name'; })[0], typeRow = W.filter(function (r) { return r && r[0] === 'well.type'; })[0];
      if (!typeRow) throw new Error('на листе «' + SHEET_WELLS + '» нет строки well.type');
      var groups = [];
      for (var c = 2; c < typeRow.length; c++) {
        if (typeRow[c] === undefined || typeRow[c] === '') continue;
        var code = typeCode(typeRow[c]);
        if (!code) { warn.push('группа ' + (c - 1) + ': неизвестный тип «' + typeRow[c] + '», принят ГС'); code = 'GS'; }
        var g = { name: nameRow && nameRow[c] ? String(nameRow[c]) : T.TYPES[code].name, well: DM.newWell(code), schedule: {}, _col: c };
        W.forEach(function (r) {
          if (!r || !r[0] || r[0] === 'name' || r[0] === 'well.type' || String(r[0]).indexOf('well.') !== 0) return;
          var v = parseVal(r[c]); if (v === '') return;
          set(g, String(r[0]).trim(), v); n++;
        });
        groups.push(g);
      }
      if (!groups.length) throw new Error('на листе «' + SHEET_WELLS + '» не заполнена ни одна группа скважин');
      P.groups = groups;
    }
    var S = sh[SHEET_SCHED];
    if (S) {
      var head = S.filter(function (r) { return r && String(r[0]).trim() === 'Группа'; })[0] || [];
      var gi = 0;
      S.forEach(function (r) {
        if (!r || r === head || !r[0] || String(r[0]).indexOf('График') === 0) return;
        var g = P.groups.filter(function (x) { return x.name === String(r[0]).trim(); })[0] || P.groups[gi];
        gi++;
        if (!g) return;
        g.schedule = {};
        for (var c = 1; c < head.length; c++) { var y = parseVal(head[c]), v = parseVal(r[c]); if (typeof y === 'number' && typeof v === 'number' && v > 0) g.schedule[y] = v; }
      });
    }
    P.groups.forEach(function (g) { delete g._col; });
    return { project: P, source: 'шаблон исходных данных (' + n + ' значений)', warnings: warn };
  }

  // универсальная загрузка: xlsx (шаблон или итоговый файл) либо json-проект
  function loadAny(name, data) {
    var low = String(name || '').toLowerCase();
    if (/\.json$/.test(low)) {
      var str = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data);
      var o = JSON.parse(str); return Promise.resolve({ project: o.project || o, source: 'файл проекта', warnings: [] });
    }
    if (/\.(xlsx|xlsm)$/.test(low)) return readXlsx(data).then(projectFromSheets);
    return Promise.reject(new Error('поддерживаются файлы .xlsx (шаблон или итоговый файл ТРИЗ-НФ) и .json (проект)'));
  }

  return { SHEET_OBJ: SHEET_OBJ, SHEET_WELLS: SHEET_WELLS, SHEET_SCHED: SHEET_SCHED, SHEET_JSON: SHEET_JSON,
    addInputSheets: addInputSheets, addJsonSheet: addJsonSheet, readXlsx: readXlsx, projectFromSheets: projectFromSheets, loadAny: loadAny, parseVal: parseVal, typeCode: typeCode };
}));
