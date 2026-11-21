// Demonstração para a diretoria (19/11/2026): utilitários comuns.
// Tudo é criado por uma vendedora fictícia (Larissa Mendes) logada no sistema, pelas mesmas funções que as telas usam.
// O que é criado fica anotado em sistema_demo_lotes (lote DEMO-DIRETORIA-20261119) para apagar depois:
//   node Scripts/remover-demo.cjs            (ensaio)
//   DEMO_LOTE=DEMO-DIRETORIA-20261119 node Scripts/remover-demo.cjs --aplicar
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const raiz = path.resolve(__dirname, "..", "..");
const EMPRESA = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b";
const LOTE = "DEMO-DIRETORIA-20261119";
const GALPAO = [-22.3866, -43.1338];
const arqEstado = path.join(raiz, ".tmp", "demo-diretoria.json");

const url = process.env.SUPABASE_URL;
if (new URL(url).hostname !== "awemuohtvwvrdzfxwrmd.supabase.co") throw Error("Projeto inesperado");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = () => createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const check = (r, onde = "") => { if (r.error) throw Error((onde ? onde + ": " : "") + (r.error.message || JSON.stringify(r.error))); return r.data; };

function lerEstado() { try { return JSON.parse(fs.readFileSync(arqEstado, "utf8")); } catch { return {}; } }
// grava juntando com o que outro roteiro tenha gravado ao mesmo tempo (objetos de 1º nível são somados)
function gravarEstado(e) {
  fs.mkdirSync(path.dirname(arqEstado), { recursive: true });
  const atual = lerEstado();
  for (const [k, v] of Object.entries(e)) atual[k] = v && typeof v === "object" && !Array.isArray(v) && atual[k] && typeof atual[k] === "object" ? { ...atual[k], ...v } : v;
  fs.writeFileSync(arqEstado, JSON.stringify(atual, null, 2));
}

// manifesto do lote (o removedor segue as chaves estrangeiras a partir daqui)
async function anotar(itens) {
  const atual = (await admin.from("sistema_demo_lotes").select("manifesto").eq("id", LOTE).maybeSingle()).data;
  const manifesto = { ...(atual?.manifesto || {}), registros: [...(atual?.manifesto?.registros || []), ...itens] };
  check(await admin.from("sistema_demo_lotes").upsert({ id: LOTE, empresa_id: EMPRESA, manifesto }), "manifesto");
}

const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); };
const km = (lat, lng) => { const R = 6371, r = (x) => x * Math.PI / 180; const a = Math.sin(r(lat - GALPAO[0]) / 2) ** 2 + Math.cos(r(GALPAO[0])) * Math.cos(r(lat)) * Math.sin(r(lng - GALPAO[1]) / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 1.35 * 10) / 10; };
function cpf(seed) { const h = crypto.createHash("md5").update("cpf" + seed).digest(); const n = Array.from({ length: 9 }, (_, i) => h[i] % 10); if (new Set(n).size === 1) n[0] = (n[0] + 1) % 10; for (const t of [10, 11]) { const s = n.reduce((a, d, i) => a + d * (t - i), 0) % 11; n.push(s < 2 ? 0 : 11 - s); } return n.join(""); }
function cnpj(seed) { const h = crypto.createHash("md5").update("cnpj" + seed).digest(); const n = [...Array.from({ length: 8 }, (_, i) => h[i] % 10), 0, 0, 0, 1]; for (const len of [12, 13]) { let s = 0, p = len - 7; for (let i = 0; i < len; i++) { s += n[i] * p--; if (p < 2) p = 9; } const r = s % 11; n.push(r < 2 ? 0 : 11 - r); } return n.join(""); }

// Fotos fictícias: desenho simples (rosto ou logo) gerado no navegador e salvo em JPEG.
async function fotoFicticia(browser, { tipo = "rosto", seed = "x", texto = "" }) {
  const h = crypto.createHash("md5").update(seed).digest();
  const pele = ["#f1c7a5", "#e0ac83", "#c68a5e", "#8d5a3b", "#f3d2b8"][h[0] % 5];
  const cabelo = ["#2b1d14", "#5a3a22", "#a8743f", "#d9b26a", "#1a1a1a", "#7a2e1e"][h[1] % 6];
  const fundo = ["#cfe0f0", "#f0dccf", "#dcefd8", "#efe3f5", "#f5efcf", "#e3e3e3"][h[2] % 6];
  const roupa = ["#123f86", "#7d603d", "#5a5a55", "#8a3b52", "#2f6f5e", "#b36b2c"][h[3] % 6];
  const longo = h[4] % 3 !== 0;
  const pessoa = (x, sk, hc, rc) => `<g transform="translate(${x},0)"><path d="M-45 330 Q-45 250 0 245 Q45 250 45 330 Z" fill="${rc}"/><ellipse cx="0" cy="200" rx="32" ry="38" fill="${sk}"/><path d="M-32 192 Q-30 158 0 156 Q32 158 32 192 Q20 172 0 174 Q-20 172 -32 192 Z" fill="${hc}"/><circle cx="-11" cy="203" r="3.5" fill="#222"/><circle cx="11" cy="203" r="3.5" fill="#222"/><path d="M-10 219 Q0 226 10 219" stroke="#8a3a3a" stroke-width="3" fill="none"/></g>`;
  if (tipo === "equipe") {
    const peles = ["#f1c7a5", "#c68a5e", "#e0ac83", "#8d5a3b"], cabs = ["#2b1d14", "#1a1a1a", "#5a3a22", "#a8743f"];
    var svgEq = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="#9fc3a0"/><rect y="230" width="480" height="90" fill="#7ea06a"/><rect x="300" y="60" width="150" height="120" fill="#e9e1d2" stroke="#b9ab92" stroke-width="4"/><path d="M300 60 L375 20 L450 60 Z" fill="#a8574a"/>${[90, 170, 250, 330].map((x, i) => pessoa(x, peles[(h[i] + i) % 4], cabs[(h[i + 4] + i) % 4], "#2f4f7a")).join("")}<text x="20" y="305" font-family="Arial" font-size="14" fill="#fff">Equipe Chiavari</text></svg>`;
  }
  if (tipo === "papel") {
    var svgPapel = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420"><rect width="320" height="420" fill="#8a7a66"/><rect x="30" y="20" width="260" height="380" fill="#fbfaf5"/>${Array.from({ length: 12 }, (_, i) => `<rect x="50" y="${70 + i * 22}" width="${150 + (h[i] % 60)}" height="6" fill="#c9c4b8"/><rect x="240" y="${70 + i * 22}" width="20" height="6" fill="#c9c4b8"/>`).join("")}<text x="160" y="52" text-anchor="middle" font-family="Arial" font-size="15" fill="#333">LISTA DE ITENS</text><path d="M70 370 C100 340 120 390 150 355 S200 380 230 350" stroke="#1d3c8a" stroke-width="3" fill="none"/></svg>`;
  }
  const svg = tipo === "equipe" ? svgEq : tipo === "papel" ? svgPapel : tipo === "rosto"
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="${fundo}"/>
      ${longo ? `<path d="M80 150 Q70 290 110 300 L210 300 Q250 290 240 150 Z" fill="${cabelo}"/>` : ""}
      <path d="M60 330 Q60 245 160 240 Q260 245 260 330 Z" fill="${roupa}"/><rect x="140" y="200" width="40" height="50" fill="${pele}"/>
      <ellipse cx="160" cy="150" rx="68" ry="80" fill="${pele}"/>
      <path d="M92 140 Q95 70 160 66 Q228 70 230 140 Q205 100 160 104 Q118 100 92 140 Z" fill="${cabelo}"/>
      <ellipse cx="135" cy="155" rx="7" ry="9" fill="#2a2a2a"/><ellipse cx="185" cy="155" rx="7" ry="9" fill="#2a2a2a"/>
      <path d="M122 138 Q135 130 148 138" stroke="${cabelo}" stroke-width="4" fill="none"/><path d="M172 138 Q185 130 198 138" stroke="${cabelo}" stroke-width="4" fill="none"/>
      <path d="M160 160 L154 185 L166 185" stroke="#b07a5a" stroke-width="3" fill="none"/>
      <path d="M138 202 Q160 ${212 + (h[5] % 8)} 182 202" stroke="#9c3c3c" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="122" cy="185" rx="10" ry="6" fill="#e88a8a" opacity=".35"/><ellipse cx="198" cy="185" rx="10" ry="6" fill="#e88a8a" opacity=".35"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="#fbfaf7"/>
      <circle cx="160" cy="135" r="78" fill="none" stroke="${roupa}" stroke-width="6"/>
      <path d="M160 85 C130 105 130 150 160 175 C190 150 190 105 160 85 Z" fill="${roupa}" opacity=".85"/>
      <path d="M115 135 C135 120 150 140 160 175 C140 165 120 160 115 135 Z" fill="${roupa}" opacity=".55"/>
      <path d="M205 135 C185 120 170 140 160 175 C180 165 200 160 205 135 Z" fill="${roupa}" opacity=".55"/>
      <text x="160" y="255" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#2a2a2a" letter-spacing="3">${texto.toUpperCase()}</text>
      <text x="160" y="285" text-anchor="middle" font-family="Arial" font-size="13" fill="#6b6b6b" letter-spacing="4">DECORAÇÃO DE EVENTOS</text></svg>`;
  const pg = await browser.newPage({ viewport: tipo === "equipe" ? { width: 480, height: 320 } : tipo === "papel" ? { width: 320, height: 420 } : { width: 320, height: 320 } });
  await pg.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const buf = await pg.screenshot({ type: "jpeg", quality: 55 });
  await pg.close();
  return buf;
}

async function sessaoDe(email, senha) {
  const c = anon();
  const s = check(await c.auth.signInWithPassword({ email, password: senha }), "login").session;
  return { client: c, sessao: s };
}

module.exports = { raiz, EMPRESA, LOTE, GALPAO, admin, anon, check, lerEstado, gravarEstado, anotar, dia, km, cpf, cnpj, fotoFicticia, sessaoDe };
