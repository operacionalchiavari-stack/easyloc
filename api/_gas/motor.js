// =====================================================================
// Motor de compatibilidade Apps Script → Supabase.
//
// Cada chamada do navegador (google.script.run.funcao(args)) roda o código
// ORIGINAL do sistema, numa "execução" nova (igual ao Apps Script: variáveis
// globais começam do zero). As abas são lidas do Supabase quando o código
// pede; o que foi alterado é gravado tudo de uma vez no final, numa
// transação. Se outra pessoa gravou a mesma aba no meio do caminho, a
// chamada é refeita com os dados novos (no lugar do LockService).
// =====================================================================
process.env.TZ = "America/Sao_Paulo";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { fetchSincrono } = require("./sincrono");
const { formatarData } = require("./datas");
const { Aba, Planilha } = require("./planilha");

const FUSO = "America/Sao_Paulo";
const BUCKET = "gs-arquivos";

// Abas já lidas nesta instância (reaproveitadas enquanto a versão não muda)
const CACHE_ABAS = new Map();
// Código dos projetos já carregado
const CODIGO = new Map();

class ErroConflito extends Error {}

// ---------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------
function cabecalhos(cfg, extra) {
  return Object.assign({ apikey: cfg.chave, Authorization: "Bearer " + cfg.chave, "Content-Type": "application/json" }, extra || {});
}

function rpcSincrono(cfg, nome, corpo) {
  const r = fetchSincrono(cfg.url + "/rest/v1/rpc/" + nome, { method: "POST", headers: cabecalhos(cfg), body: JSON.stringify(corpo || {}) });
  const texto = r.corpo.toString("utf8");
  if (r.status >= 300) { throw new Error("Banco (" + nome + "): " + texto.slice(0, 300)); }
  return texto ? JSON.parse(texto) : null;
}

async function rpc(cfg, nome, corpo) {
  const r = await fetch(cfg.url + "/rest/v1/rpc/" + nome, { method: "POST", headers: cabecalhos(cfg), body: JSON.stringify(corpo || {}) });
  const texto = await r.text();
  if (!r.ok) {
    if (/GS_CONFLITO/.test(texto)) { throw new ErroConflito(texto); }
    throw new Error("Banco (" + nome + "): " + texto.slice(0, 300));
  }
  return texto ? JSON.parse(texto) : null;
}

// ---------------------------------------------------------------------
// Bytes no formato do Apps Script (array de inteiros com sinal)
// ---------------------------------------------------------------------
const paraBytesGS = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const deBytesGS = v => (Buffer.isBuffer(v) ? v : Array.isArray(v) ? Buffer.from(v.map(b => (b < 0 ? b + 256 : b))) : Buffer.from(String(v), "utf8"));

class Blob {
  constructor(dados, tipo, nome) { this._buf = deBytesGS(dados === undefined ? "" : dados); this._tipo = tipo || "application/octet-stream"; this._nome = nome || null; }
  getBytes() { return paraBytesGS(this._buf); }
  getDataAsString(cs) { return this._buf.toString(cs && /latin|8859/i.test(cs) ? "latin1" : "utf8"); }
  getContentType() { return this._tipo; }
  setContentType(t) { this._tipo = t; return this; }
  getName() { return this._nome; }
  setName(n) { this._nome = n; return this; }
  setBytes(b) { this._buf = deBytesGS(b); return this; }
  setDataFromString(s) { this._buf = Buffer.from(String(s), "utf8"); return this; }
  getAs(t) { return new Blob(this._buf, t, this._nome); }
  copyBlob() { return new Blob(this._buf, this._tipo, this._nome); }
  isGoogleType() { return false; }
}

const EXTENSOES = { "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf" };

// =====================================================================
// Uma execução
// =====================================================================
class Execucao {
  constructor(cfg, projeto) {
    this.cfg = cfg;
    this.projeto = projeto;
    this.planilhas = new Map();
    this.abas = new Map();           // "id|nome" -> Aba
    this.lidas = new Map();          // "id|nome" -> versão lida
    this.escritas = new Set();
    this.excluidas = new Set();
    this.novasPlanilhas = [];
    this.uploads = [];
    this.usouLock = false;
    this.propsAlteradas = new Map();
    this.cacheLocal = new Map();
    this.cacheAlterado = new Map();
    this.logs = [];

    const v = rpcSincrono(cfg, "gs_versoes");
    this.infoPlanilhas = v.planilhas || {};
    this.infoAbas = new Map();
    (v.abas || []).forEach(([pid, nome, versao, ordem, sheetId]) => this.infoAbas.set(pid + "|" + nome, { versao, ordem, sheetId }));
    const est = rpcSincrono(cfg, "gs_estado", { p_projeto: projeto.chave });
    this.props = Object.assign({}, (est && est.props) || {});
  }

  // ---------------- planilhas e abas ----------------
  _urlPlanilha(id) { return this.cfg.urlBase + "/api/gs-planilha?id=" + encodeURIComponent(id); }

  abrirPlanilha(id) {
    id = String(id);
    if (this.planilhas.has(id)) { return this.planilhas.get(id); }
    const info = this.infoPlanilhas[id];
    if (!info) { throw new Error("Exception: Unexpected error while getting the method or property openById on object SpreadsheetApp."); }
    const p = new Planilha(this, id, info.nome, info.fuso || FUSO);
    this.planilhas.set(id, p);
    return p;
  }

  _nomesAbas(pid) {
    const nomes = [];
    const ordem = [];
    this.infoAbas.forEach((info, chave) => { const [p, n] = [chave.slice(0, chave.indexOf("|")), chave.slice(chave.indexOf("|") + 1)]; if (p === pid && !this.excluidas.has(chave)) { ordem.push([info.ordem, n]); } });
    this.abas.forEach((aba, chave) => { if (chave.startsWith(pid + "|") && aba._nova && !this.excluidas.has(chave)) { ordem.push([aba._ordem, aba._nome]); } });
    ordem.sort((a, b) => a[0] - b[0]).forEach(x => { if (nomes.indexOf(x[1]) < 0) { nomes.push(x[1]); } });
    return nomes;
  }

  _aba(planilha, nome) {
    const chave = planilha._id + "|" + nome;
    if (this.excluidas.has(chave)) { return null; }
    if (this.abas.has(chave)) { return this.abas.get(chave); }
    const info = this.infoAbas.get(chave);
    if (!info) { return null; }
    let dados = CACHE_ABAS.get(chave);
    if (!dados || dados.versao !== info.versao) {
      const r = rpcSincrono(this.cfg, "gs_ler_aba", { p_planilha: planilha._id, p_aba: nome });
      if (!r) { return null; }
      dados = { versao: r.versao, colunas: r.colunas, formatos: r.formatos || [], sheet_id: r.sheet_id, linhas: r.linhas || [], formatosLinhas: r.formatos_linhas || [] };
      CACHE_ABAS.set(chave, dados);
    }
    const aba = new Aba(this, planilha, { nome, linhas: dados.linhas, formatosLinhas: dados.formatosLinhas, colunas: dados.colunas, formatos: dados.formatos, sheet_id: dados.sheet_id, ordem: info.ordem, versao: dados.versao });
    this.abas.set(chave, aba);
    this.lidas.set(chave, dados.versao);
    return aba;
  }

  _novaAba(planilha, nome) {
    const chave = planilha._id + "|" + nome;
    if (this._aba(planilha, nome)) { throw new Error('Exception: A sheet with the name "' + nome + '" already exists. Please enter another name.'); }
    this.excluidas.delete(chave);
    const aba = new Aba(this, planilha, { nome, linhas: [], colunas: 0, formatos: [], ordem: this._nomesAbas(planilha._id).length, versao: 0, nova: true });
    aba._copiado = true;
    this.abas.set(chave, aba);
    this.escritas.add(aba);
    return aba;
  }

  _excluirAba(aba) {
    const chave = aba._planilha._id + "|" + aba._nome;
    this.excluidas.add(chave);
    this.abas.delete(chave);
    this.escritas.add(Object.assign(Object.create(Aba.prototype), { _excluir: true, _planilha: aba._planilha, _nome: aba._nome, _versao: aba._versao, _nova: aba._nova }));
  }

  _renomearAba(aba, novo) {
    const nova = this._novaAba(aba._planilha, novo);
    nova._linhas = aba._linhas.map(l => l.slice());
    nova._colunas = aba._colunas;
    nova._formatos = aba._formatos.slice();
    nova._fmtLinhas = aba._fmtLinhas.map(f => (f ? f.slice() : null));
    nova._ordem = aba._ordem;
    this._excluirAba(aba);
    Object.assign(aba, { _nome: novo, _linhas: nova._linhas });
    this.abas.set(aba._planilha._id + "|" + novo, nova);
  }

  _marcarEscrita(aba) { this.escritas.add(aba); }

  criarPlanilha(nome) {
    const id = "gerada-" + crypto.randomUUID();
    this.infoPlanilhas[id] = { nome: String(nome), fuso: FUSO };
    this.novasPlanilhas.push([id, String(nome), FUSO]);
    const p = this.abrirPlanilha(id);
    this._novaAba(p, "Página1");
    return p;
  }

  // ---------------- gravação final ----------------
  async gravar() {
    const conferir = [];
    const abas = [];
    const vistas = new Set();
    for (const aba of this.escritas) {
      const chave = aba._planilha._id + "|" + aba._nome;
      if (vistas.has(chave)) { continue; }
      vistas.add(chave);
      if (!aba._nova) { conferir.push([aba._planilha._id, aba._nome, aba._versao]); }
      if (aba._excluir) {
        if (!aba._nova) { abas.push({ planilha: aba._planilha._id, aba: aba._nome, excluir: true }); }
        continue;
      }
      const tudo = aba._estrutura || aba._nova;
      const linhaDe = i => {
        const l = aba._linhas[i - 1] || [];
        const f = aba._fmtLinhas[i - 1];
        return [i, Array.from({ length: l.length }, (x, j) => (l[j] === undefined ? "" : l[j])), f ? f.map(x => x || "") : null];
      };
      const linhas = tudo
        ? aba._linhas.map((l, i) => linhaDe(i + 1))
        : Array.from(aba._alteradas).filter(r => r <= aba._linhas.length).map(linhaDe);
      const item = { planilha: aba._planilha._id, aba: aba._nome, modo: tudo ? "tudo" : "linhas", linhas, total: aba._linhas.length, colunas: aba._colunas, sheet_id: aba._sheetId, ordem: aba._ordem };
      if (aba._nova || aba._alterouFormato || aba._estrutura) { item.formatos = aba._formatos.map(f => f || ""); }
      abas.push(item);
    }
    if (this.usouLock) {
      this.lidas.forEach((v, chave) => {
        if (!vistas.has(chave)) { const i = chave.indexOf("|"); conferir.push([chave.slice(0, i), chave.slice(i + 1), v]); }
      });
    }
    const props = Array.from(this.propsAlteradas, ([k, v]) => [this.projeto.chave, k, v]);
    const cache = Array.from(this.cacheAlterado, ([k, v]) => [this.projeto.chave, k, v.valor, v.segundos]);
    if (!abas.length && !props.length && !cache.length && !this.novasPlanilhas.length) { return; }

    for (const u of this.uploads) {
      const r = await fetch(this.cfg.url + "/storage/v1/object/" + BUCKET + "/" + u.caminho, {
        method: "POST", headers: cabecalhos(this.cfg, { "Content-Type": u.tipo, "x-upsert": "true" }), body: u.bytes
      });
      if (!r.ok) { throw new Error("Não foi possível salvar o arquivo (" + r.status + "): " + (await r.text()).slice(0, 200)); }
    }

    await rpc(this.cfg, "gs_gravar", { p_dados: { conferir, abas, props, cache, planilhas: this.novasPlanilhas } });

    // A instância já fica com a versão nova (evita reler o que acabou de gravar)
    for (const item of abas) {
      const chave = item.planilha + "|" + item.aba;
      if (item.excluir) { CACHE_ABAS.delete(chave); continue; }
      const aba = this.abas.get(chave);
      if (!aba) { continue; }
      const anterior = this.infoAbas.get(chave);
      CACHE_ABAS.set(chave, { versao: anterior ? aba._versao + 1 : 1, colunas: aba._colunas, formatos: aba._formatos.slice(), sheet_id: aba._sheetId, linhas: aba._linhas, formatosLinhas: aba._fmtLinhas });
    }
  }

  // ---------------- serviços do Apps Script ----------------
  servicos() {
    const ex = this;
    const cfg = this.cfg;

    const SpreadsheetApp = {
      openById: id => ex.abrirPlanilha(id),
      openByUrl: url => ex.abrirPlanilha((String(url).match(/\/d\/([\w-]+)/) || [])[1] || url),
      getActive: () => ex.abrirPlanilha(ex.projeto.planilhaAtiva),
      getActiveSpreadsheet: () => ex.abrirPlanilha(ex.projeto.planilhaAtiva),
      getActiveSheet: () => ex.abrirPlanilha(ex.projeto.planilhaAtiva).getActiveSheet(),
      create: nome => ex.criarPlanilha(nome),
      flush: () => {},
      getUi: () => { throw new Error("Exception: Cannot call SpreadsheetApp.getUi() from this context."); },
      newDataValidation: () => new Proxy({}, { get: (t, k) => (k === "build" ? () => ({}) : () => t.__self || (t.__self = new Proxy(t, {}))) }),
      BorderStyle: {}, WrapStrategy: {}, Dimension: { ROWS: "ROWS", COLUMNS: "COLUMNS" }
    };

    const Utilities = {
      formatDate: (d, fuso, padrao) => formatarData(d, fuso, padrao),
      getUuid: () => crypto.randomUUID(),
      sleep: ms => { const f = new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(f, 0, 0, Math.min(Number(ms) || 0, 5000)); },
      DigestAlgorithm: { MD2: "md2", MD5: "md5", SHA_1: "sha1", SHA_256: "sha256", SHA_384: "sha384", SHA_512: "sha512" },
      MacAlgorithm: { HMAC_MD5: "md5", HMAC_SHA_1: "sha1", HMAC_SHA_256: "sha256", HMAC_SHA_384: "sha384", HMAC_SHA_512: "sha512" },
      Charset: { UTF_8: "utf8", US_ASCII: "ascii" },
      computeDigest: (alg, valor) => paraBytesGS(crypto.createHash(alg).update(deBytesGS(valor)).digest()),
      computeHmacSignature: (alg, valor, chave) => paraBytesGS(crypto.createHmac(alg, deBytesGS(chave)).update(deBytesGS(valor)).digest()),
      computeHmacSha256Signature: (valor, chave) => paraBytesGS(crypto.createHmac("sha256", deBytesGS(chave)).update(deBytesGS(valor)).digest()),
      base64Encode: v => deBytesGS(v).toString("base64"),
      base64EncodeWebSafe: v => deBytesGS(v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      base64Decode: s => paraBytesGS(Buffer.from(String(s), "base64")),
      base64DecodeWebSafe: s => paraBytesGS(Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64")),
      newBlob: (d, t, n) => new Blob(d, t, n),
      jsonStringify: o => JSON.stringify(o),
      jsonParse: s => JSON.parse(s),
      parseCsv: s => String(s).split(/\r?\n/).filter(Boolean).map(l => l.split(",")),
      formatString: (f, ...a) => { let i = 0; return String(f).replace(/%[sd]/g, () => String(a[i++])); },
      zip: () => { throw new Error("Utilities.zip não disponível."); }
    };

    const Session = {
      getScriptTimeZone: () => FUSO,
      getActiveUser: () => ({ getEmail: () => "" }),
      getEffectiveUser: () => ({ getEmail: () => "" }),
      getTemporaryActiveUserKey: () => "",
      getActiveUserLocale: () => "pt_BR"
    };

    const trava = { waitLock: () => { ex.usouLock = true; }, tryLock: () => { ex.usouLock = true; return true; }, releaseLock: () => {}, hasLock: () => true };
    const LockService = { getScriptLock: () => trava, getDocumentLock: () => trava, getUserLock: () => trava };

    const cacheObj = {
      get: k => {
        k = String(k);
        if (ex.cacheLocal.has(k)) { const c = ex.cacheLocal.get(k); return c.expira > Date.now() ? c.valor : null; }
        const v = rpcSincrono(cfg, "gs_cache_ler", { p_projeto: ex.projeto.chave, p_chave: k });
        ex.cacheLocal.set(k, { valor: v === undefined ? null : v, expira: Date.now() + 60000 });
        return v === undefined ? null : v;
      },
      getAll: ks => { const o = {}; (ks || []).forEach(k => { const v = cacheObj.get(k); if (v !== null) { o[k] = v; } }); return o; },
      put: (k, v, seg) => { const s = Math.min(Number(seg) || 600, 21600); ex.cacheLocal.set(String(k), { valor: String(v), expira: Date.now() + s * 1000 }); ex.cacheAlterado.set(String(k), { valor: String(v), segundos: s }); },
      putAll: (o, seg) => Object.keys(o || {}).forEach(k => cacheObj.put(k, o[k], seg)),
      remove: k => { ex.cacheLocal.set(String(k), { valor: null, expira: 0 }); ex.cacheAlterado.set(String(k), { valor: null, segundos: 0 }); },
      removeAll: ks => (ks || []).forEach(k => cacheObj.remove(k))
    };
    const CacheService = { getScriptCache: () => cacheObj, getUserCache: () => cacheObj, getDocumentCache: () => cacheObj };

    const propsObj = {
      getProperty: k => (Object.prototype.hasOwnProperty.call(ex.props, k) ? ex.props[k] : null),
      getProperties: () => Object.assign({}, ex.props),
      getKeys: () => Object.keys(ex.props),
      setProperty: (k, v) => { ex.props[k] = String(v); ex.propsAlteradas.set(String(k), String(v)); return propsObj; },
      setProperties: (o, apagarOutras) => {
        if (apagarOutras) { Object.keys(ex.props).forEach(k => { if (!(k in o)) { propsObj.deleteProperty(k); } }); }
        Object.keys(o || {}).forEach(k => propsObj.setProperty(k, o[k]));
        return propsObj;
      },
      deleteProperty: k => { delete ex.props[k]; ex.propsAlteradas.set(String(k), null); return propsObj; },
      deleteAllProperties: () => { Object.keys(ex.props).forEach(k => propsObj.deleteProperty(k)); return propsObj; }
    };
    const PropertiesService = { getScriptProperties: () => propsObj, getDocumentProperties: () => propsObj, getUserProperties: () => propsObj };

    // ----- Drive: arquivos novos vão para o Storage do Supabase -----
    const urlPublica = caminho => cfg.url + "/storage/v1/object/public/" + BUCKET + "/" + caminho;
    const arquivo = (id, nome, tipo, tamanho) => ({
      getId: () => id, getName: () => nome, setName: function (n) { nome = n; return this; }, getMimeType: () => tipo, getSize: () => tamanho || 0,
      getUrl: () => (String(id).startsWith("sb:") ? urlPublica(id.slice(3)) : "https://drive.google.com/file/d/" + id + "/view"),
      getDownloadUrl: () => (String(id).startsWith("sb:") ? urlPublica(id.slice(3)) : "https://drive.google.com/uc?export=download&id=" + id),
      setSharing: function () { return this; }, setDescription: function () { return this; }, addViewer: function () { return this; },
      getBlob: () => { throw new Error("Leitura de arquivos antigos do Drive não está disponível."); },
      setTrashed: function () { return this; }, getDateCreated: () => new Date()
    });
    const pasta = (id, nome) => ({
      getId: () => id, getName: () => nome, getUrl: () => "", setSharing: function () { return this; },
      createFile: (a, b, c) => {
        const blob = a instanceof Blob ? a : new Blob(b, c, a);
        const tipo = blob.getContentType() || "application/octet-stream";
        const ext = EXTENSOES[tipo] || (String(blob.getName() || "").match(/\.[a-z0-9]{2,5}$/i) || [""])[0];
        const caminho = ex.projeto.chave + "/" + crypto.randomUUID() + ext;
        ex.uploads.push({ caminho, tipo, bytes: blob._buf });
        return arquivo("sb:" + caminho, blob.getName() || caminho, tipo, blob._buf.length);
      },
      createFolder: n => pasta("sb-pasta-" + crypto.randomUUID(), n),
      getFilesByName: () => ({ hasNext: () => false, next: () => null }),
      getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
      getFiles: () => ({ hasNext: () => false, next: () => null })
    });
    const DriveApp = {
      createFolder: n => pasta("sb-pasta-" + crypto.randomUUID(), n),
      getFolderById: id => pasta(String(id), ""),
      getRootFolder: () => pasta("raiz", "Meu Drive"),
      getFileById: id => arquivo(String(id), "", "", 0),
      createFile: (a, b, c) => pasta("raiz", "").createFile(a, b, c),
      getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
      getFilesByName: () => ({ hasNext: () => false, next: () => null }),
      Access: { ANYONE: "ANYONE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK", DOMAIN: "DOMAIN", PRIVATE: "PRIVATE" },
      Permission: { VIEW: "VIEW", EDIT: "EDIT", COMMENT: "COMMENT" }
    };

    // ----- UrlFetchApp -----
    const resposta = r => ({
      getResponseCode: () => r.status,
      getContentText: () => r.corpo.toString("utf8"),
      getContent: () => paraBytesGS(r.corpo),
      getBlob: () => new Blob(r.corpo, r.headers["content-type"]),
      getHeaders: () => r.headers,
      getAllHeaders: () => r.headers
    });
    const UrlFetchApp = {
      fetch: (url, p) => {
        p = p || {};
        const headers = Object.assign({}, p.headers || {});
        let body;
        if (p.payload !== undefined) {
          if (typeof p.payload === "string" || Buffer.isBuffer(p.payload)) { body = p.payload; }
          else if (p.payload instanceof Blob) { body = p.payload._buf; }
          else { body = new URLSearchParams(p.payload).toString(); headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded"; }
        }
        if (p.contentType) { headers["Content-Type"] = p.contentType; }
        const r = fetchSincrono(String(url), { method: String(p.method || (body !== undefined ? "post" : "get")).toUpperCase(), headers, body });
        if (r.status >= 400 && !p.muteHttpExceptions) {
          throw new Error("Exception: Request failed for " + String(url).split("?")[0] + " returned code " + r.status + ". Truncated server response: " + r.corpo.toString("utf8").slice(0, 200));
        }
        return resposta(r);
      },
      fetchAll: lista => lista.map(x => (typeof x === "string" ? UrlFetchApp.fetch(x) : UrlFetchApp.fetch(x.url, x)))
    };

    // ----- Maps (Geocoding / Directions por REST) -----
    const mapsGet = (api, params) => {
      if (!cfg.mapsKey) { return { status: "REQUEST_DENIED", error_message: "Chave do Google Maps não configurada", results: [], routes: [] }; }
      const q = new URLSearchParams(Object.assign({}, params, { key: cfg.mapsKey, language: params.language || "pt-BR" }));
      const r = fetchSincrono("https://maps.googleapis.com/maps/api/" + api + "/json?" + q.toString(), { method: "GET" });
      return JSON.parse(r.corpo.toString("utf8"));
    };
    const Maps = {
      newGeocoder: () => {
        const p = {};
        const g = {
          setRegion: v => { p.region = v; return g; }, setLanguage: v => { p.language = v; return g; }, setBounds: () => g,
          geocode: endereco => mapsGet("geocode", Object.assign({ address: String(endereco) }, p)),
          reverseGeocode: (lat, lng) => mapsGet("geocode", Object.assign({ latlng: lat + "," + lng }, p))
        };
        return g;
      },
      newDirectionFinder: () => {
        const p = {}; const paradas = [];
        const lugar = (a, b) => (b === undefined ? String(a) : a + "," + b);
        const d = {
          setOrigin: (a, b) => { p.origin = lugar(a, b); return d; }, setDestination: (a, b) => { p.destination = lugar(a, b); return d; },
          setMode: m => { p.mode = String(m).toLowerCase(); return d; }, setLanguage: v => { p.language = v; return d; }, setRegion: v => { p.region = v; return d; },
          addWaypoint: (a, b) => { paradas.push(lugar(a, b)); return d; }, setOptimizeWaypoints: v => { p.optimize = !!v; return d; },
          setAvoid: v => { p.avoid = String(v).toLowerCase(); return d; }, setDepart: t => { p.departure_time = Math.floor(new Date(t).getTime() / 1000); return d; },
          setArrive: t => { p.arrival_time = Math.floor(new Date(t).getTime() / 1000); return d; }, setAlternatives: v => { p.alternatives = !!v; return d; },
          getDirections: () => {
            const q = Object.assign({}, p);
            if (paradas.length) { q.waypoints = (p.optimize ? "optimize:true|" : "") + paradas.join("|"); }
            delete q.optimize;
            return mapsGet("directions", q);
          }
        };
        return d;
      },
      DirectionFinder: { Mode: { DRIVING: "driving", WALKING: "walking", BICYCLING: "bicycling", TRANSIT: "transit" }, Avoid: { TOLLS: "tolls", HIGHWAYS: "highways" } }
    };

    // ----- ScriptApp / HtmlService / ContentService (só o que o servidor usa) -----
    const gatilho = new Proxy({}, { get: (t, k) => (k === "create" ? () => ({ getUniqueId: () => "vercel-cron", getHandlerFunction: () => "" }) : () => gatilho) });
    const ScriptApp = {
      getService: () => ({ getUrl: () => ex.projeto.urlApp(cfg.urlBase), isEnabled: () => true }),
      getScriptId: () => ex.projeto.chave,
      getProjectTriggers: () => [],
      newTrigger: () => gatilho,
      deleteTrigger: () => {},
      getOAuthToken: () => "",
      getIdentityToken: () => "",
      WeekDay: { SUNDAY: "SUNDAY", MONDAY: "MONDAY", TUESDAY: "TUESDAY", WEDNESDAY: "WEDNESDAY", THURSDAY: "THURSDAY", FRIDAY: "FRIDAY", SATURDAY: "SATURDAY" },
      AuthMode: { FULL: "FULL", LIMITED: "LIMITED", NONE: "NONE" }
    };
    const saidaHtml = conteudo => {
      const o = new Proxy({}, { get: (t, k) => (k === "getContent" ? () => conteudo : k === "evaluate" ? () => o : k === "then" ? undefined : () => o) });
      return o;
    };
    const HtmlService = {
      createHtmlOutput: h => saidaHtml(String(h || "")),
      createHtmlOutputFromFile: () => saidaHtml(""),
      createTemplateFromFile: () => saidaHtml(""),
      createTemplate: h => saidaHtml(String(h || "")),
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL", DEFAULT: "DEFAULT" },
      SandboxMode: { IFRAME: "IFRAME", NATIVE: "NATIVE" }
    };
    const ContentService = {
      createTextOutput: t => { const o = { _t: String(t || ""), setMimeType: () => o, getContent: () => o._t, setContent: c => { o._t = c; return o; } }; return o; },
      MimeType: { JSON: "application/json", TEXT: "text/plain", CSV: "text/csv", JAVASCRIPT: "application/javascript" }
    };
    const semEmail = { sendEmail: () => { throw new Error("Envio de e-mail ainda não está disponível nesta versão."); }, getRemainingDailyQuota: () => 0 };

    const Logger = { log: (...a) => { ex.logs.push(a.map(String).join(" ")); console.log(...a); return Logger; }, getLog: () => ex.logs.join("\n"), clear: () => { ex.logs = []; } };

    return {
      SpreadsheetApp, Utilities, Session, LockService, CacheService, PropertiesService, DriveApp, UrlFetchApp, Maps,
      ScriptApp, HtmlService, ContentService, Logger, MailApp: semEmail, GmailApp: semEmail
    };
  }
}

// =====================================================================
// Código do projeto: todos os arquivos .js numa função (escopo próprio
// por execução, como no Apps Script).
// =====================================================================
const NOMES_SERVICOS = ["SpreadsheetApp", "Utilities", "Session", "LockService", "CacheService", "PropertiesService", "DriveApp", "UrlFetchApp", "Maps",
  "ScriptApp", "HtmlService", "ContentService", "Logger", "MailApp", "GmailApp"];

function carregarCodigo(projeto) {
  if (CODIGO.has(projeto.chave)) { return CODIGO.get(projeto.chave); }
  const pasta = projeto.pasta;
  const arquivos = fs.readdirSync(pasta).filter(f => /\.(js|gs)$/.test(f)).sort((a, b) => {
    const ia = (projeto.ordem || []).indexOf(a), ib = (projeto.ordem || []).indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
  let fonte = "";
  const funcoes = [];
  for (const f of arquivos) {
    const t = fs.readFileSync(path.join(pasta, f), "utf8");
    fonte += "\n//# arquivo: " + f + "\n" + t + "\n";
    for (const m of t.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) { funcoes.push(m[1]); }
  }
  const mapa = "\nreturn {" + funcoes.map(n => JSON.stringify(n) + ": typeof " + n + ' === "function" ? ' + n + " : undefined").join(",") + "};";
  const fabrica = new Function(...NOMES_SERVICOS, fonte + mapa);
  const r = { fabrica, funcoes: new Set(funcoes) };
  CODIGO.set(projeto.chave, r);
  return r;
}

/** Roda uma função pública do projeto. Devolve o resultado (já pronto para JSON). */
async function executar(cfg, projeto, nome, args) {
  const codigo = carregarCodigo(projeto);
  if (!codigo.funcoes.has(nome) || /_$/.test(nome) || (projeto.bloqueadas || []).indexOf(nome) >= 0) {
    throw new Error("Script function not found: " + nome);
  }
  for (let tentativa = 1; ; tentativa++) {
    const ex = new Execucao(cfg, projeto);
    const s = ex.servicos();
    const funcoes = codigo.fabrica(...NOMES_SERVICOS.map(n => s[n]));
    // Como no Apps Script, o que foi gravado antes de um erro continua gravado
    let resultado, erro = null;
    try { resultado = funcoes[nome].apply(null, args || []); } catch (e) { erro = e; }
    try {
      await ex.gravar();
    } catch (e) {
      if (e instanceof ErroConflito && tentativa < 4) { continue; }
      if (e instanceof ErroConflito) { throw new Error("Muitas pessoas salvando ao mesmo tempo. Tente de novo."); }
      throw e;
    }
    if (erro) { throw erro; }
    return trocarUrlsDeArquivo(cfg, resultado === undefined ? null : JSON.parse(JSON.stringify(resultado)));
  }
}

/** Fotos novas: links do Drive montados com id "sb:..." viram o link do Storage. */
function trocarUrlsDeArquivo(cfg, v) {
  if (typeof v === "string") {
    if (v.indexOf("sb:") < 0) { return v; }
    return v.replace(/https:\/\/(?:drive|lh\d)\.google(?:usercontent)?\.com\/[^\s"'<>]*?id=sb:([\w\-./]+?\.(?:jpg|png|webp|gif|pdf))[^\s"'<>]*/g,
      (x, c) => cfg.url + "/storage/v1/object/public/" + BUCKET + "/" + c);
  }
  if (Array.isArray(v)) { return v.map(x => trocarUrlsDeArquivo(cfg, x)); }
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) { o[k] = trocarUrlsDeArquivo(cfg, v[k]); } return o; }
  return v;
}

module.exports = { executar, carregarCodigo, Execucao };
