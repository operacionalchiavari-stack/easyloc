// Registro do uso de IA por empresa (21/11/2026). Ver supabase/migrations/20261121000500_ia_uso.sql.
//
// Como usar numa Edge Function:  Deno.serve(comUsoIA("clara", async (req) => { ... }))
// Isso abre um "contexto" por requisição e instala, uma vez, um vigia no fetch: toda chamada a api.openai.com feita
// durante a requisição tem o consumo que a própria OpenAI devolve (tokens, segundos) gravado em public.ia_uso.
// O custo e os créditos são calculados no banco (tabela ia_precos). A IA nunca é bloqueada por isso: o registro roda
// em paralelo e, se falhar, só vira aviso no log.
//
// Quem usou: o "sub" do token de login (equipe) e, no catálogo, o decorador do catalog_token. A empresa vem do
// empresa_id da requisição (todas as funções já exigem e conferem). Quando a função já sabe tudo isso, pode completar
// com iaContexto({ empresa_id, usuario_id, cliente_id }).
import { AsyncLocalStorage } from "node:async_hooks";

type CtxIA = {
  origem: string; acao?: string; empresa_id?: string; usuario_id?: string | null; cliente_id?: string | null;
  token?: string; pendentes: Promise<unknown>[];
};
const als = new AsyncLocalStorage<CtxIA>();
const fetchOriginal: typeof fetch = globalThis.fetch.bind(globalThis);
let instalado = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : undefined);

function subDoToken(auth: string | null): string | null {
  try {
    const t = String(auth || "").replace(/^Bearer\s+/i, "").split(".")[1];
    if (!t) return null;
    const dados = JSON.parse(atob(t.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(t.length / 4) * 4, "=")));
    return dados?.role === "authenticated" ? uuid(dados.sub) || null : null;
  } catch { return null; }
}

const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

function lerUso(endpoint: string, u: any) {
  const r: Record<string, number> = {};
  if (!u || typeof u !== "object") return r;
  if (u.type === "duration") { r.segundos = Number(u.seconds) || 0; return r; }
  if (endpoint.startsWith("images")) {
    r.tokens_entrada = n(u.input_tokens_details?.text_tokens ?? u.input_tokens);
    r.tokens_imagem_entrada = n(u.input_tokens_details?.image_tokens);
    r.tokens_imagem_saida = n(u.output_tokens);
    return r;
  }
  if (endpoint.startsWith("audio/transcriptions")) {
    const audio = n(u.input_token_details?.audio_tokens ?? u.input_tokens);
    r.tokens_audio_entrada = audio;
    r.tokens_entrada = n(u.input_token_details?.text_tokens);
    r.tokens_saida = n(u.output_tokens);
    return r;
  }
  const entrada = n(u.prompt_tokens ?? u.input_tokens);
  const det = u.prompt_tokens_details || u.input_tokens_details || {};
  const audio = n(det.audio_tokens);
  r.tokens_entrada = Math.max(0, entrada - audio);
  r.tokens_audio_entrada = audio;
  r.tokens_cache = n(det.cached_tokens);
  r.tokens_saida = n(u.completion_tokens ?? u.output_tokens);
  return r;
}

async function rest(caminho: string, corpo: unknown) {
  const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) throw new Error("sem SUPABASE_URL/SERVICE_ROLE");
  const r = await fetchOriginal(`${url}/rest/v1/${caminho}`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${await r.text().catch(() => "")}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function consulta(caminho: string) {
  const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetchOriginal(`${url}/rest/v1/${caminho}`, { headers: { apikey: chave!, Authorization: `Bearer ${chave}` } });
  return r.ok ? r.json() : null;
}

// Descobre o decorador (catálogo) e, se faltar, a empresa do usuário — uma vez por requisição.
async function completarQuem(ctx: CtxIA) {
  if (ctx.token && !ctx.cliente_id) {
    try {
      const d = await rest("rpc/catalogo_validar_sessao", { p_token: ctx.token });
      const s = Array.isArray(d) ? d[0] : d;
      if (s?.valido) { ctx.cliente_id = uuid(s.cliente_id) || null; ctx.empresa_id = ctx.empresa_id || uuid(s.empresa_id); }
    } catch { /* sem decorador */ }
    ctx.token = undefined;
  }
  if (!ctx.empresa_id && ctx.usuario_id) {
    const d = await consulta(`usuarios_empresas?select=empresa_id&user_id=eq.${ctx.usuario_id}&limit=1`).catch(() => null);
    ctx.empresa_id = uuid(d?.[0]?.empresa_id);
  }
}

async function gravar(ctx: CtxIA, linha: Record<string, unknown>) {
  try {
    await completarQuem(ctx);
    if (!ctx.empresa_id) return;
    await rest("ia_uso", {
      empresa_id: ctx.empresa_id, origem: ctx.origem, acao: ctx.acao || null,
      usuario_id: ctx.cliente_id ? null : (ctx.usuario_id || null), cliente_id: ctx.cliente_id || null, ...linha,
    });
  } catch (e) { console.warn("[ia-uso] não registrou:", e instanceof Error ? e.message : e); }
}

function modeloDoPedido(init?: RequestInit): { modelo?: string; caracteres: number; arquivo?: Blob } {
  const b: any = init?.body;
  try {
    if (typeof b === "string") {
      const j = JSON.parse(b);
      return { modelo: j?.model, caracteres: typeof j?.input === "string" ? j.input.length : 0 };
    }
    if (b instanceof FormData) {
      const f = b.get("file");
      return { modelo: String(b.get("model") || "") || undefined, caracteres: 0, arquivo: f instanceof Blob ? f : undefined };
    }
  } catch { /* corpo que não é JSON */ }
  return { caracteres: 0 };
}

function instalar() {
  if (instalado) return;
  instalado = true;
  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const resp = await fetchOriginal(input as any, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://api.openai.com/")) return resp;
      const ctx = als.getStore();
      if (!ctx || !resp.ok) return resp;
      const endpoint = new URL(url).pathname.replace(/^\/v1\//, "");
      if (endpoint.startsWith("realtime")) return resp; // a ligação é registrada no fim, pela duração
      const pedido = modeloDoPedido(init);
      const tipo = resp.headers.get("content-type") || "";
      const tarefa = (async () => {
        let linha: Record<string, unknown> = {};
        let modelo = pedido.modelo;
        if (tipo.includes("json")) {
          const j = await resp.clone().json().catch(() => null);
          modelo = modelo || j?.model;
          linha = lerUso(endpoint, j?.usage);
          if (endpoint.startsWith("audio/transcriptions") && !j?.usage && pedido.arquivo) {
            linha.segundos = Math.round(pedido.arquivo.size / (/wav/i.test(pedido.arquivo.type) ? 32000 : 4000));
          }
        } else if (endpoint.startsWith("audio/speech")) {
          linha.caracteres = pedido.caracteres;
        } else if (endpoint.startsWith("audio/transcriptions") && pedido.arquivo) {
          linha.segundos = Math.round(pedido.arquivo.size / (/wav/i.test(pedido.arquivo.type) ? 32000 : 4000));
        }
        await gravar(ctx, { modelo: modelo || null, endpoint, ...linha });
      })();
      ctx.pendentes.push(tarefa);
    } catch (e) { console.warn("[ia-uso]", e); }
    return resp;
  };
}

export function comUsoIA(origem: string | ((corpo: any) => string), handler: (req: Request) => Response | Promise<Response>) {
  instalar();
  return async (req: Request): Promise<Response> => {
    const ctx: CtxIA = { origem: typeof origem === "string" ? origem : "ia", pendentes: [] };
    try {
      ctx.usuario_id = subDoToken(req.headers.get("authorization"));
      if ((req.headers.get("content-type") || "").includes("json") && req.method === "POST") {
        const b = await req.clone().json().catch(() => null);
        if (b && typeof b === "object") {
          ctx.empresa_id = uuid(b.empresa_id) || uuid(b.empresaId);
          if (typeof b.catalog_token === "string" && b.catalog_token) ctx.token = b.catalog_token;
          const a = b.action ?? b.acao ?? b.mode ?? b.tipo;
          if (typeof a === "string") ctx.acao = a.slice(0, 60);
          if (typeof origem === "function") ctx.origem = String(origem(b) || "ia").slice(0, 40);
        }
      }
    } catch { /* segue sem contexto completo */ }
    return await als.run(ctx, async () => {
      const resp = await handler(req);
      if (ctx.pendentes.length) {
        const fim = Promise.allSettled(ctx.pendentes);
        const er = (globalThis as any).EdgeRuntime;
        if (er?.waitUntil) er.waitUntil(fim); else await fim;
      }
      return resp;
    });
  };
}

// Completa quem está usando quando a função já descobriu (ex.: o decorador já validado).
export function iaContexto(dados: { empresa_id?: string | null; usuario_id?: string | null; cliente_id?: string | null; acao?: string }) {
  const c = als.getStore();
  if (!c) return;
  if (dados.empresa_id) c.empresa_id = dados.empresa_id;
  if (dados.cliente_id !== undefined) c.cliente_id = dados.cliente_id;
  if (dados.usuario_id !== undefined) c.usuario_id = dados.usuario_id;
  if (dados.acao) c.acao = dados.acao;
}

// Uso que não passa pelo fetch daqui (ligação em tempo real: o celular fala direto com a OpenAI).
export function registrarUsoIA(linha: { modelo: string; segundos?: number; acao?: string; tokens_entrada?: number; tokens_saida?: number; tokens_audio_entrada?: number; tokens_audio_saida?: number }) {
  const c = als.getStore();
  if (!c) return;
  const { acao, ...resto } = linha;
  const ctx = acao ? { ...c, acao } : c;
  c.pendentes.push(gravar(ctx as CtxIA, { endpoint: "realtime", ...resto }));
}
