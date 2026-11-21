// Itens danificados (16/11/2026): quem achou o dano (Triagem da volta ou Separação) escolhe o setor de manutenção.
// Se ficar em dúvida, conversa com esta assistente, que diz para qual setor mandar. Não grava nada: quem abre a O.S
// é o navegador, pela RPC operacao_avaria_retorno / acervo_avaria_separacao, depois que a pessoa confirma.
// Ação conversar {empresa_id, item, mensagens:[{papel:'pessoa'|'ia', texto}], fotos:[url]}.
import { comUsoIA } from "../_shared/ia-uso.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("AVARIA_SETOR_MODEL") || "gpt-4.1";
const SETORES = ["Marcenaria", "Solda", "Acabamento e Pintura", "Costura", "Forração", "Limpeza de Estofados"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function autenticar(req: Request, empresaId: string) {
  if (!empresaId) return { erro: "Empresa ausente", status: 400 };
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { erro: "Entre no sistema para conversar.", status: 401 };
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const usuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return { erro: "Sessão inválida", status: 401 };
  if (await segundaEtapaPendente(auth)) return { erro: MENSAGEM_2FA, status: 403 };
  const { data: ctx, error } = await usuario.rpc("funcionario_contexto", { p_empresa_id: empresaId });
  if (error || !ctx?.ativo) return { erro: "Seu acesso não está ativo nesta empresa.", status: 403 };
  return { ok: true };
}

const SISTEMA = (item: string) => `Você ajuda a equipe da Chiavari (locação de móveis para eventos) a escolher para qual setor de manutenção mandar uma peça danificada.
Peça: ${item || "não informada"}.
Setores e o que cada um faz:
- Marcenaria: madeira quebrada, trincada, solta ou empenada; pé ou encaixe de madeira; tampo de madeira; MDF estufado.
- Solda: estrutura de metal/ferro/inox quebrada, solta, torta, solda rompida.
- Acabamento e Pintura: risco, lascado, descascado, mancha na pintura, verniz ou laca; retoque de cor; ferrugem superficial.
- Costura: tecido rasgado ou descosturado, zíper, capa, almofada aberta, costura solta.
- Forração: estofado afundado ou duro, espuma danificada, trocar o tecido do estofado, forro solto, grampo.
- Limpeza de Estofados: sujeira, mancha, cheiro ou bebida derramada em estofado ou tecido (sem rasgo).
Como responder:
- Português do Brasil, simples e curto (no máximo 2 frases).
- Se der para saber o setor, diga qual e por quê em uma frase e marque pronto=true com o setor exatamente como na lista.
- Se não der, faça UMA pergunta (onde está o dano, de que material é, o que aconteceu). Olhe as fotos se houver.
- Se o dano pede mais de um setor (ex.: solda e depois pintura), indique o primeiro; o setor pode encaminhar depois.
- Nunca invente setor fora da lista.`;

const ESQUEMA = {
  name: "resposta_setor",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["resposta", "pronto", "setor", "justificativa"],
    properties: { resposta: { type: "string" }, pronto: { type: "boolean" }, setor: { type: "string" }, justificativa: { type: "string" } },
  },
};

async function conversar(body: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "A assistente está indisponível agora." }, 500);
  const lista = Array.isArray(body?.mensagens) ? body.mensagens.slice(-30) : [];
  if (!lista.length) return json({ erro: "Descreva o dano para começar." }, 400);
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const fotos = (Array.isArray(body?.fotos) ? body.fotos : []).map(String)
    .filter((u: string) => u.startsWith(base + "/storage/v1/object/")).slice(-4);
  const mensagens: any[] = lista.map((m: any) => ({ role: m?.papel === "ia" ? "assistant" : "user", content: String(m?.texto || "").slice(0, 3000) }))
    .filter((m: any) => m.content.trim());
  if (fotos.length) {
    mensagens.push({ role: "user", content: [{ type: "text", text: "Fotos da peça danificada:" }, ...fotos.map((url: string) => ({ type: "image_url", image_url: { url } }))] });
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.2, response_format: { type: "json_schema", json_schema: ESQUEMA }, messages: [{ role: "system", content: SISTEMA(String(body?.item || "").slice(0, 300)) }, ...mensagens] }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(d?.error?.message || "");
    console.warn("openai:", msg);
    if (/quota|billing|credit/i.test(msg)) return json({ erro: "A IA está sem créditos agora. Escolha o setor pela lista." }, 502);
    return json({ erro: "A assistente não conseguiu responder agora. Tente de novo." }, 502);
  }
  let s: any; try { s = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { s = {}; }
  const setor = SETORES.includes(String(s?.setor)) ? String(s.setor) : "";
  const pronto = Boolean(s?.pronto) && !!setor;
  return json({ resposta: String(s?.resposta || "").slice(0, 1200) || "Pode me contar onde está o dano?", pronto, setor: pronto ? setor : null, justificativa: pronto ? String(s?.justificativa || "").slice(0, 600) : "" });
}

Deno.serve(comUsoIA("avaria", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ erro: "Pedido inválido" }, 400); }
  const quem = await autenticar(req, String(body?.empresa_id || ""));
  if ("erro" in quem) return json({ erro: quem.erro }, quem.status);
  try { return await conversar(body); }
  catch (e) { console.error(e); return json({ erro: "Não foi possível falar com a assistente agora." }, 500); }
}));
