/* ТРИЗ-НФ — минимальный генератор XLSX (SpreadsheetML) на JSZip: листы, формулы, стили. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('jszip'));
  else root.XLSXW = factory(root.JSZip);
}(typeof self !== 'undefined' ? self : this, function (JSZip) {
  'use strict';
  var STYLES = ['', 'h', 'b', 'title', 'n0', 'n1', 'n2', 'n3', 'pct', 'in', 'note', 'inn', 'bn0', 'bn1', 'tc'];
  // fontId, fillId, borderId, numFmtId, wrap
  var XF = {
    '': [0, 0, 0, 0], h: [1, 2, 1, 0, 1], b: [1, 0, 0, 0], title: [2, 0, 0, 0], n0: [0, 0, 1, 165], n1: [0, 0, 1, 166], n2: [0, 0, 1, 4],
    n3: [0, 0, 1, 167], pct: [0, 0, 1, 168], 'in': [3, 3, 1, 0], note: [4, 0, 0, 0, 1], inn: [3, 3, 1, 169], bn0: [1, 0, 1, 165], bn1: [1, 0, 1, 166], tc: [0, 0, 1, 0, 1]
  };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function ref(r, c) { return colName(c) + r; }

  function Sheet(name, opts) {
    this.name = String(name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31);
    this.opts = opts || {}; this.rows = []; this.merges = [];
  }
  Sheet.prototype.row = function (cells) { this.rows.push(cells || []); return this.rows.length; };
  Sheet.prototype.next = function () { return this.rows.length + 1; };
  Sheet.prototype.merge = function (r1, c1, r2, c2) { this.merges.push(ref(r1, c1) + ':' + ref(r2, c2)); };
  Sheet.prototype.xml = function () {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    if (this.opts.freeze) {
      var m = this.opts.freeze.match(/^([A-Z]+)(\d+)$/), cols = 0;
      for (var i = 0; i < m[1].length; i++) cols = cols * 26 + (m[1].charCodeAt(i) - 64);
      cols -= 1; var rows = +m[2] - 1;
      x += '<sheetViews><sheetView workbookViewId="0"><pane ' + (cols ? 'xSplit="' + cols + '" ' : '') + (rows ? 'ySplit="' + rows + '" ' : '') + 'topLeftCell="' + this.opts.freeze + '" activePane="' + (cols && rows ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight') + '" state="frozen"/></sheetView></sheetViews>';
    }
    if (this.opts.cols) {
      x += '<cols>';
      this.opts.cols.forEach(function (w, i) { x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; });
      x += '</cols>';
    }
    x += '<sheetData>';
    this.rows.forEach(function (cells, ri) {
      var r = ri + 1;
      x += '<row r="' + r + '">';
      cells.forEach(function (cell, ci) {
        if (cell === null || cell === undefined || cell === '') return;
        var c = (typeof cell === 'object') ? cell : { v: cell };
        var s = STYLES.indexOf(c.s || (typeof c.v === 'number' && !c.f ? 'n2' : '')); if (s < 0) s = 0;
        var at = ' r="' + ref(r, ci) + '"' + (s ? ' s="' + s + '"' : '');
        if (c.f) {
          var isStr = typeof c.v === 'string';
          x += '<c' + at + (isStr ? ' t="str"' : '') + '><f>' + esc(c.f) + '</f>' + (c.v !== undefined && c.v !== null && (isStr || isFinite(c.v)) ? '<v>' + esc(c.v) + '</v>' : '') + '</c>';
        } else if (typeof c.v === 'number') {
          if (isFinite(c.v)) x += '<c' + at + '><v>' + c.v + '</v></c>';
        } else if (typeof c.v === 'boolean') x += '<c' + at + ' t="b"><v>' + (c.v ? 1 : 0) + '</v></c>';
        else if (c.v !== undefined) x += '<c' + at + ' t="inlineStr"><is><t xml:space="preserve">' + esc(c.v) + '</t></is></c>';
      });
      x += '</row>';
    });
    x += '</sheetData>';
    if (this.merges.length) x += '<mergeCells count="' + this.merges.length + '">' + this.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
    x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    return x;
  };

  function Workbook() { this.sheets = []; this.props = {}; }
  Workbook.prototype.sheet = function (name, opts) { var s = new Sheet(name, opts); this.sheets.push(s); return s; };
  Workbook.prototype.zip = function () {
    var z = new JSZip(), n = this.sheets.length, i;
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    for (i = 1; i <= n; i++) ct += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    z.file('[Content_Types].xml', ct + '</Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    z.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(this.props.title || '') + '</dc:title><dc:creator>' + esc(this.props.author || '') + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created></cp:coreProperties>');
    z.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>' + esc(this.props.app || 'TRIZ-NF') + '</Application></Properties>');
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (i = 0; i < n; i++) {
      wb += '<sheet name="' + esc(this.sheets[i].name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      rels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      z.file('xl/worksheets/sheet' + (i + 1) + '.xml', this.sheets[i].xml());
    }
    wb += '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    rels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    z.file('xl/workbook.xml', wb);
    z.file('xl/_rels/workbook.xml.rels', rels);
    var st = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="6"><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="#,##0.0"/><numFmt numFmtId="167" formatCode="0.000"/><numFmt numFmtId="168" formatCode="0.0%"/><numFmt numFmtId="169" formatCode="General"/><numFmt numFmtId="170" formatCode="0.00E+00"/></numFmts>' +
      '<fonts count="5"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/><family val="2"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7E0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + STYLES.length + '">';
    STYLES.forEach(function (k) {
      var a = XF[k];
      st += '<xf numFmtId="' + a[3] + '" fontId="' + a[0] + '" fillId="' + a[1] + '" borderId="' + a[2] + '" xfId="0"' + (a[3] ? ' applyNumberFormat="1"' : '') + (a[0] ? ' applyFont="1"' : '') + (a[1] ? ' applyFill="1"' : '') + (a[2] ? ' applyBorder="1"' : '') + (a[4] ? ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' : '/>');
    });
    st += '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    z.file('xl/styles.xml', st);
    return z;
  };
  Workbook.prototype.toBlob = function () { return this.zip().generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' }); };
  Workbook.prototype.toBuffer = function () { return this.zip().generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); };

  return { workbook: function () { return new Workbook(); }, ref: ref, colName: colName };
}));
