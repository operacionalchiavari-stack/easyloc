// =====================================================================
// SpreadsheetApp em cima do Supabase (tabelas gs_abas / gs_linhas).
// Imita o comportamento do Google Sheets no que os sistemas usam:
// getRange/getValues/setValues/appendRow/deleteRow, conversão automática
// de texto em número/data ao gravar, getDisplayValues em pt_BR.
// =====================================================================
const { formatarData, partesNoFuso, dataNoFuso } = require("./datas");

// ---------- Células: como ficam guardadas (jsonb) e como o código as vê ----------
function decodificar(c) {
  if (c && typeof c === "object" && c.$d) { return new Date(c.$d); }
  return c === null || c === undefined ? "" : c;
}

function ehTextoPuro(formato) { return formato === "@"; }

/** Converte o que o código grava no que a planilha guardaria (Sheets converte texto em número/data). */
function codificar(v, formato, fuso) {
  if (v === null || v === undefined) { return ""; }
  if (v instanceof Date) { return isNaN(v.getTime()) ? "" : { $d: v.toISOString() }; }
  if (typeof v === "number") { return isFinite(v) ? v : "#NUM!"; }
  if (typeof v === "boolean") { return v; }
  if (typeof v !== "string") { return String(v); }

  if (v.charAt(0) === "'") { return v.slice(1); }
  if (ehTextoPuro(formato)) { return v; }
  const t = v.trim();
  if (!t) { return v; }

  // Números (pt_BR): 123  -12  1,5  1.234,56
  if (/^-?\d{1,15}$/.test(t)) { return Number(t); }
  if (/^-?\d+,\d+$/.test(t)) { return Number(t.replace(",", ".")); }
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) { return Number(t.replace(/\./g, "").replace(",", ".")); }

  // Datas (pt_BR): dd/mm/aaaa [hh:mm[:ss]]  ·  aaaa-mm-dd [hh:mm[:ss]]  ·  dd/mm
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m && validaData(+m[3], +m[2], +m[1])) {
    return { $d: dataNoFuso(fuso, +m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).toISOString() };
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m && validaData(+m[1], +m[2], +m[3])) {
    return { $d: dataNoFuso(fuso, +m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).toISOString() };
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m && validaData(2000, +m[2], +m[1])) {
    const ano = partesNoFuso(new Date(), fuso).ano;
    return { $d: dataNoFuso(fuso, ano, +m[2], +m[1], 0, 0, 0).toISOString() };
  }
  // Horário puro vira data de 30/12/1899 (igual ao Sheets)
  m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m && +m[1] < 24 && +m[2] < 60) {
    return { $d: dataNoFuso(fuso, 1899, 12, 30, +m[1], +m[2], +(m[3] || 0)).toISOString() };
  }
  return v;
}

function validaData(a, m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 1800 && a <= 2200; }

// ---------- Valor exibido (getDisplayValues) ----------
function numeroBR(n, casas, milhar) {
  const neg = n < 0;
  let s = casas === null ? String(Math.abs(n)) : Math.abs(n).toFixed(casas);
  let [int, dec] = s.split(".");
  if (milhar) { int = int.replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  return (neg ? "-" : "") + int + (dec ? "," + dec : "");
}

function formatoSheetsParaJava(f) {
  // 'mm' é minuto quando vem depois de h ou antes de s; senão é mês
  let s = f.replace(/AM\/PM/gi, "a");
  s = s.replace(/(h+[^a-z]*)(m{1,2})/gi, (x, a, b) => a + "§".repeat(b.length));
  s = s.replace(/(m{1,2})([^a-z]*s)/gi, (x, a, b) => "§".repeat(a.length) + b);
  s = s.replace(/m/g, "M").replace(/§/g, "m");
  s = s.replace(/D/g, "d").replace(/Y/g, "y").replace(/h/g, ( /a/.test(s) ? "h" : "H"));
  return s;
}

function exibir(c, formato, fuso) {
  let v = decodificar(c);
  if (v === "") { return ""; }
  const f = String(formato || "");
  // O Sheets arredonda o segundo e mostra no máximo 10 algarismos significativos
  if (v instanceof Date) { v = new Date(Math.round(v.getTime() / 1000) * 1000); }
  if (typeof v === "number" && !Number.isInteger(v)) { v = Number(v.toPrecision(10)); }
  if (v instanceof Date) {
    if (/[dy]/i.test(f) || /h/i.test(f)) { return formatarData(v, fuso, formatoSheetsParaJava(f)); }
    const p = partesNoFuso(v, fuso);
    if (p.ano === 1899 && p.mes === 12 && p.dia === 30) { return formatarData(v, fuso, "HH:mm:ss"); }
    if (p.hora === 0 && p.minuto === 0 && p.segundo === 0) { return formatarData(v, fuso, "dd/MM/yyyy"); }
    return formatarData(v, fuso, "dd/MM/yyyy HH:mm:ss");
  }
  if (typeof v === "number") {
    if (/%/.test(f)) { const casas = (f.split(".")[1] || "").replace(/[^0#]/g, "").length; return numeroBR(v * 100, casas, false) + "%"; }
    const secao = f.split(";")[0];
    const m = secao.match(/([#0,]*[#0])(?:\.([#0]*))?/);
    if (m && f !== "General" && f !== "") {
      const dec = m[2] || "";
      const min = (dec.match(/0/g) || []).length, max = dec.length;
      const curto = String(Math.abs(v));
      const casasCurto = /e/.test(curto) ? 99 : (curto.split(".")[1] || "").length;
      const corpo = numeroBR(Math.abs(v), casasCurto <= max ? Math.max(casasCurto, min) : max, /,/.test(m[1]));
      const limpar = s => s.replace(/\[\$([^\]-]*)[^\]]*\]/g, "$1").replace(/["\\]/g, "").replace(/_.|\*./g, "");
      const antes = limpar(secao.slice(0, m.index)), depois = limpar(secao.slice(m.index + m[0].length));
      return (v < 0 ? "-" : "") + antes + corpo + depois;
    }
    if (Number.isInteger(v)) { return String(v); }
    return numeroBR(v, null, false);
  }
  if (typeof v === "boolean") { return v ? "VERDADEIRO" : "FALSO"; }
  return String(v);
}

// ---------- A1 ----------
function colunaParaNumero(l) { let n = 0; for (const ch of l.toUpperCase()) { n = n * 26 + (ch.charCodeAt(0) - 64); } return n; }
function numeroParaColuna(n) { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

// =====================================================================
// Aba (Sheet)
// =====================================================================
class Aba {
  constructor(motor, planilha, dados) {
    this._motor = motor;
    this._planilha = planilha;
    this._nome = dados.nome;
    this._linhas = dados.linhas;          // array de arrays (células codificadas)
    this._colunas = dados.colunas || 0;
    this._formatos = dados.formatos || [];
    this._fmtLinhas = dados.formatosLinhas || [];   // formato por célula quando foge do padrão da coluna
    this._sheetId = dados.sheet_id || Math.floor(Math.random() * 1e9);
    this._ordem = dados.ordem || 0;
    this._versao = dados.versao || 0;
    this._nova = !!dados.nova;
    this._copiado = false;                // copy-on-write (o cache é compartilhado entre chamadas)
    this._alteradas = new Set();
    this._estrutura = !!dados.nova;
  }

  // --- infraestrutura ---
  _paraEscrever() {
    if (!this._copiado) {
      this._linhas = this._linhas.map(l => l.slice());
      this._formatos = this._formatos.slice();
      this._fmtLinhas = this._fmtLinhas.map(f => (f ? f.slice() : null));
      this._copiado = true;
    }
    this._motor._marcarEscrita(this);
  }
  _formato(r, c) {
    const f = this._fmtLinhas[r - 1];
    return f && f[c - 1] !== undefined && f[c - 1] !== null ? f[c - 1] : (this._formatos[c - 1] || "");
  }
  _definirFormato(r, c, formato) {
    while (this._fmtLinhas.length < r) { this._fmtLinhas.push(null); }
    let f = this._fmtLinhas[r - 1];
    if (!f) {
      if ((this._formatos[c - 1] || "") === formato) { return; }
      f = this._fmtLinhas[r - 1] = this._formatos.map(x => x || "");
    }
    while (f.length < c) { f.push(this._formatos[f.length] || ""); }
    f[c - 1] = formato;
    this._alteradas.add(r);
  }
  _celula(r, c) { const l = this._linhas[r - 1]; return l && l[c - 1] !== undefined ? l[c - 1] : ""; }
  _gravarCelula(r, c, v) {
    while (this._linhas.length < r) {
      // Linha nova herda o formato da linha de cima (colunas formatadas no Sheets)
      const anterior = this._fmtLinhas[this._linhas.length - 1];
      this._fmtLinhas[this._linhas.length] = anterior ? anterior.slice() : null;
      this._linhas.push([]);
    }
    const l = this._linhas[r - 1];
    while (l.length < c) { l.push(""); }
    const formato = this._formato(r, c);
    const valor = codificar(v, formato, this._planilha._fuso);
    l[c - 1] = valor;
    // Texto que virou data/hora ganha o formato que o Sheets daria
    if (typeof v === "string" && valor && valor.$d && !/[dyhs]/i.test(formato)) {
      const t = v.trim();
      this._definirFormato(r, c, /^\d{1,2}:\d{2}:\d{2}$/.test(t) ? "hh:mm:ss" : /^\d{1,2}:\d{2}$/.test(t) ? "hh:mm" : /\d:\d{2}/.test(t) ? "dd/mm/yyyy hh:mm:ss" : "dd/mm/yyyy");
    }
    if (c > this._colunas) { this._colunas = c; }
    this._alteradas.add(r);
  }

  // --- API do Apps Script ---
  getName() { return this._nome; }
  getSheetName() { return this._nome; }
  getSheetId() { return this._sheetId; }
  getIndex() { return this._ordem + 1; }
  getParent() { return this._planilha; }
  getLastRow() {
    for (let i = this._linhas.length - 1; i >= 0; i--) {
      if (this._linhas[i].some(c => c !== "" && c !== null)) { return i + 1; }
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    for (const l of this._linhas) { for (let j = l.length - 1; j >= max; j--) { if (l[j] !== "" && l[j] !== null) { max = j + 1; break; } } }
    return max;
  }
  getMaxRows() { return Math.max(1000, this._linhas.length); }
  getMaxColumns() { return Math.max(26, this._colunas); }
  getFrozenRows() { return 1; }
  getFrozenColumns() { return 0; }

  getRange(a, b, c, d) {
    if (typeof a === "string") { return this._rangeA1(a); }
    if (!(a >= 1) || !(b >= 1)) { throw new Error("Exception: The starting row or column of the range is too small."); }
    const nl = c === undefined ? 1 : c, nc = d === undefined ? 1 : d;
    if (nl < 1 || nc < 1) { throw new Error("Exception: The number of rows in the range must be at least 1."); }
    return new Intervalo(this, a, b, nl, nc);
  }
  _rangeA1(ref) {
    const s = String(ref).replace(/\$/g, "").split("!").pop();
    const [ini, fim] = s.split(":");
    const parte = p => { const m = p.match(/^([A-Za-z]*)(\d*)$/); return { c: m[1] ? colunaParaNumero(m[1]) : null, l: m[2] ? Number(m[2]) : null }; };
    const a = parte(ini), b = fim ? parte(fim) : a;
    const l1 = a.l || 1, c1 = a.c || 1;
    const l2 = b.l || Math.max(this.getMaxRows(), l1), c2 = b.c || Math.max(this.getMaxColumns(), c1);
    return new Intervalo(this, l1, c1, l2 - l1 + 1, c2 - c1 + 1);
  }
  getDataRange() { return new Intervalo(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }

  appendRow(valores) {
    this._paraEscrever();
    const r = this.getLastRow() + 1;
    (valores || []).forEach((v, j) => this._gravarCelula(r, j + 1, v));
    if (!valores || !valores.length) { this._gravarCelula(r, 1, ""); }
    return this;
  }
  deleteRow(n) { return this.deleteRows(n, 1); }
  deleteRows(n, qtd) {
    this._paraEscrever();
    this._linhas.splice(n - 1, qtd || 1);
    this._fmtLinhas.splice(n - 1, qtd || 1);
    this._estrutura = true;
    return this;
  }
  insertRowBefore(n) { return this.insertRowsBefore(n, 1); }
  insertRowAfter(n) { return this.insertRowsAfter(n, 1); }
  insertRowsBefore(n, qtd) { this._paraEscrever(); while (this._linhas.length < n - 1) { this._linhas.push([]); } this._linhas.splice(n - 1, 0, ...Array.from({ length: qtd }, () => [])); while (this._fmtLinhas.length < n - 1) { this._fmtLinhas.push(null); } this._fmtLinhas.splice(n - 1, 0, ...Array(qtd).fill(null)); this._estrutura = true; return this; }
  insertRowsAfter(n, qtd) { return this.insertRowsBefore(n + 1, qtd); }
  insertColumnAfter(c) { return this.insertColumnsAfter(c, 1); }
  insertColumnsAfter(c, qtd) {
    this._paraEscrever();
    for (const l of this._linhas) { if (l.length > c) { l.splice(c, 0, ...Array(qtd).fill("")); } }
    for (const f of this._fmtLinhas) { if (f && f.length > c) { f.splice(c, 0, ...Array(qtd).fill("")); } }
    this._formatos.splice(c, 0, ...Array(qtd).fill(""));
    this._colunas += qtd;
    this._estrutura = true;
    return this;
  }
  insertColumnBefore(c) { return this.insertColumnsAfter(c - 1, 1); }
  deleteColumn(c) { return this.deleteColumns(c, 1); }
  deleteColumns(c, qtd) {
    this._paraEscrever();
    for (const l of this._linhas) { l.splice(c - 1, qtd); }
    for (const f of this._fmtLinhas) { if (f) { f.splice(c - 1, qtd); } }
    this._formatos.splice(c - 1, qtd);
    this._colunas = Math.max(0, this._colunas - qtd);
    this._estrutura = true;
    return this;
  }
  clear() { return this.clearContents(); }
  clearContents() { this._paraEscrever(); this._linhas = []; this._fmtLinhas = []; this._estrutura = true; return this; }
  setName(n) {
    this._motor._renomearAba(this, String(n));
    return this;
  }
  activate() { return this; }
  showSheet() { return this; }
  hideSheet() { return this; }
  isSheetHidden() { return false; }
  getFilter() { return null; }
  getProtections() { return []; }
  toString() { return "Sheet"; }
}

// Formatação visual não existe no banco: os métodos continuam funcionando, sem efeito.
const SEM_EFEITO_ABA = ["setFrozenRows", "setFrozenColumns", "setColumnWidth", "setColumnWidths", "setRowHeight", "setRowHeights", "autoResizeColumn", "autoResizeColumns",
  "setTabColor", "hideColumns", "showColumns", "hideRows", "showRows", "setConditionalFormatRules", "clearFormats", "setHiddenGridlines", "protect", "sort"];
SEM_EFEITO_ABA.forEach(n => { if (!Aba.prototype[n]) { Aba.prototype[n] = function () { return this; }; } });

// =====================================================================
// Intervalo (Range)
// =====================================================================
class Intervalo {
  constructor(aba, l, c, nl, nc) { this._aba = aba; this._l = l; this._c = c; this._nl = nl; this._nc = nc; }

  getSheet() { return this._aba; }
  getRow() { return this._l; }
  getColumn() { return this._c; }
  getRowIndex() { return this._l; }
  getNumRows() { return this._nl; }
  getNumColumns() { return this._nc; }
  getLastRow() { return this._l + this._nl - 1; }
  getLastColumn() { return this._c + this._nc - 1; }
  getA1Notation() {
    const a = numeroParaColuna(this._c) + this._l;
    return this._nl === 1 && this._nc === 1 ? a : a + ":" + numeroParaColuna(this.getLastColumn()) + this.getLastRow();
  }
  getCell(r, c) { return new Intervalo(this._aba, this._l + r - 1, this._c + c - 1, 1, 1); }
  offset(r, c, nl, nc) { return new Intervalo(this._aba, this._l + r, this._c + c, nl || this._nl, nc || this._nc); }

  getValues() {
    const s = [];
    for (let i = 0; i < this._nl; i++) {
      const l = [];
      for (let j = 0; j < this._nc; j++) { l.push(decodificar(this._aba._celula(this._l + i, this._c + j))); }
      s.push(l);
    }
    return s;
  }
  getValue() { return decodificar(this._aba._celula(this._l, this._c)); }
  getDisplayValues() {
    const fuso = this._aba._planilha._fuso;
    const s = [];
    for (let i = 0; i < this._nl; i++) {
      const l = [];
      for (let j = 0; j < this._nc; j++) { l.push(exibir(this._aba._celula(this._l + i, this._c + j), this._aba._formato(this._l + i, this._c + j), fuso)); }
      s.push(l);
    }
    return s;
  }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getFormulas() { return Array.from({ length: this._nl }, () => Array(this._nc).fill("")); }
  getFormula() { return ""; }
  getNumberFormats() { return Array.from({ length: this._nl }, (y, i) => Array.from({ length: this._nc }, (x, j) => this._aba._formato(this._l + i, this._c + j))); }
  getNumberFormat() { return this._aba._formato(this._l, this._c); }
  isBlank() { return this.getValues().every(l => l.every(v => v === "")); }

  setValues(valores) {
    if (!Array.isArray(valores) || valores.length !== this._nl) {
      throw new Error("Exception: The number of rows in the data does not match the number of rows in the range. The data has " + (valores ? valores.length : 0) + " but the range has " + this._nl + ".");
    }
    valores.forEach(l => {
      if (!Array.isArray(l) || l.length !== this._nc) {
        throw new Error("Exception: The number of columns in the data does not match the number of columns in the range. The data has " + (l ? l.length : 0) + " but the range has " + this._nc + ".");
      }
    });
    this._aba._paraEscrever();
    valores.forEach((l, i) => l.forEach((v, j) => this._aba._gravarCelula(this._l + i, this._c + j, v)));
    return this;
  }
  setValue(v) {
    this._aba._paraEscrever();
    for (let i = 0; i < this._nl; i++) { for (let j = 0; j < this._nc; j++) { this._aba._gravarCelula(this._l + i, this._c + j, v); } }
    return this;
  }
  setFormula(f) { return this.setValue(String(f)); }
  clearContent() { return this.setValue(""); }
  clear() { return this.setValue(""); }
  setNumberFormat(f) {
    const aba = this._aba;
    aba._paraEscrever();
    const colunaInteira = this._l + this._nl - 1 >= aba.getMaxRows();
    for (let j = 0; j < this._nc; j++) {
      const c = this._c + j;
      if (colunaInteira) { aba._formatos[c - 1] = String(f); aba._alterouFormato = true; }
      const ate = colunaInteira ? aba._linhas.length : this._l + this._nl - 1;
      for (let r = this._l; r <= ate; r++) {
        if (colunaInteira) { const fl = aba._fmtLinhas[r - 1]; if (fl && fl[c - 1] !== undefined) { fl[c - 1] = String(f); aba._alteradas.add(r); } }
        else { aba._definirFormato(r, c, String(f)); }
      }
    }
    return this;
  }
  setNumberFormats(m) {
    this._aba._paraEscrever();
    (m || []).forEach((l, i) => (l || []).forEach((f, j) => this._aba._definirFormato(this._l + i, this._c + j, String(f))));
    return this;
  }
  setDataValidation() { return this; }
  getDataValidation() { return null; }
  createTextFinder(t) {
    const intervalo = this;
    return {
      matchEntireCell() { this._inteira = true; return this; },
      matchCase() { return this; },
      findNext() { const r = this.findAll(); return r[0] || null; },
      findAll() {
        const v = intervalo.getDisplayValues(); const out = [];
        v.forEach((l, i) => l.forEach((x, j) => { if (this._inteira ? x === String(t) : x.indexOf(String(t)) >= 0) { out.push(intervalo.getCell(i + 1, j + 1)); } }));
        return out;
      }
    };
  }
  toString() { return "Range"; }
}
["setFontWeight", "setFontWeights", "setFontColor", "setFontColors", "setBackground", "setBackgrounds", "setHorizontalAlignment", "setVerticalAlignment",
  "setHorizontalAlignments", "setWrap", "setWrapStrategy", "setBorder", "setFontSize", "setFontFamily", "setFontStyle", "merge", "mergeAcross", "breakApart",
  "setNote", "setNotes", "activate", "setBackgroundRGB", "setFontLine", "setTextRotation", "setRichTextValue", "setShowHyperlink", "applyRowBanding",
  "removeCheckboxes", "insertCheckboxes", "sort", "setVerticalText"].forEach(n => { Intervalo.prototype[n] = function () { return this; }; });

// =====================================================================
// Planilha (Spreadsheet)
// =====================================================================
class Planilha {
  constructor(motor, id, nome, fuso) { this._motor = motor; this._id = id; this._nome = nome; this._fuso = fuso || "America/Sao_Paulo"; }
  getId() { return this._id; }
  getName() { return this._nome; }
  getSpreadsheetTimeZone() { return this._fuso; }
  getSpreadsheetLocale() { return "pt_BR"; }
  getUrl() { return this._motor._urlPlanilha(this._id); }
  getSheetByName(n) { return this._motor._aba(this, String(n)); }
  getSheets() { return this._motor._nomesAbas(this._id).map(n => this._motor._aba(this, n)); }
  getActiveSheet() { return this.getSheets()[0] || null; }
  getSheetById(id) { return this.getSheets().find(a => a.getSheetId() === id) || null; }
  insertSheet(nome) { return this._motor._novaAba(this, nome === undefined ? "Página" + (this._motor._nomesAbas(this._id).length + 1) : String(nome)); }
  deleteSheet(aba) { this._motor._excluirAba(aba); }
  setName(n) { this._nome = String(n); return this; }
  toast() { return this; }
  getRange(ref) { const [aba, r] = String(ref).split("!"); return this.getSheetByName(aba.replace(/^'|'$/g, "")).getRange(r); }
  setActiveSheet(a) { return a; }
  addEditors() { return this; }
  addViewers() { return this; }
  toString() { return "Spreadsheet"; }
}

module.exports = { Aba, Intervalo, Planilha, codificar, decodificar, exibir };
