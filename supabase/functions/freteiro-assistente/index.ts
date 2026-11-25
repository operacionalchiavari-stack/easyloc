// Luísa no App do Freteiro (21/11/2026): conversa com o freteiro sobre UMA divergência do relatório de fretes e monta
// a explicação que vai para a Logística. O freteiro não tem login do sistema: a sessão é o token do App do Freteiro,
// conferido no banco (frete_lanc_contexto). Não grava nada; a explicação é enviada pelo app (frete_lanc_explicar).
// Ação única: {token, lancamento_id, mensagens:[{papel:'ia'|'pessoa', texto}]} → {resposta, pronto, explicacao}
import { comUsoIA } from "../_shared/ia-uso.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("FRETEIRO_ASSISTENTE_MODEL") || "gpt-4.1";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const corta = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
const TIPO: Record<string, string> = {
  valor: "o valor que ele lançou não bate com o combinado para esse frete",
  sem_frete: "o sistema não encontrou esse frete na data lançada",
  nao_lancado: "existe um frete dele nessa data que ele não colocou no relatório",
};

function sistema(ctx: any) {
  const l = ctx.lancamento || {};
  return `Você é Luísa, auxiliar de logística da empresa (móveis para eventos). Está conversando pelo App do Freteiro com ${ctx.freteiro || "o freteiro"}, um freteiro autônomo, sobre uma divergência no relatório de fretes que ele enviou: ${TIPO[l.divergencia] || "há uma divergência nesse frete"}.
O que ele lançou: ${JSON.stringify({ data: l.data, saiu_de: l.origem, foi_para: l.destino, valor: l.valor, extras: l.extras, observacao: l.observacao, lancado_por_ele: l.lancado_por_ele })}.
Sua função: entender o que aconteceu e montar uma explicação clara e honesta para a Logística decidir. Pergunte UMA coisa por vez, de forma simples e educada (ele está no celular). Investigue conforme o caso: se fez mesmo o frete e em que data, de onde saiu e para onde foi, qual valor foi combinado e com quem, se houve espera, pedágio, ajudante, viagem extra ou mudança de endereço, ou se ele se confundiu (data, valor, frete repetido). Se ele admitir que se confundiu, registre isso sem julgar.
Regras: você NÃO sabe nem informa o valor do sistema e não promete pagamento nem aprovação; quem decide é a Logística. Não invente fatos. Em no máximo 3 a 5 perguntas, quando já der para entender, devolva pronto=true e a explicacao: um texto curto em primeira pessoa (como se fosse ele), com os fatos que ele contou, em até 600 caracteres. Enquanto ainda faltar informação, pronto=false e explicacao vazia.
Responda SEMPRE em JSON: {"resposta": "sua mensagem para ele", "pronto": true|false, "explicacao": "texto ou vazio"}.`;
}

Deno.serve(comUsoIA("montagem", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.token || !body?.lancamento_id) return json({ erro: "Entre no app de novo." }, 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { data: ctx, error } = await db.rpc("frete_lanc_contexto", { p_token: String(body.token), p_id: String(body.lancamento_id) });
    if (error || !ctx) return json({ erro: String(error?.message || "Frete não encontrado.").replace(/^SESSAO_EXPIRADA:\s*/, "") }, 403);
    if (ctx.situacao !== "divergente") return json({ erro: "Esta divergência já foi resolvida pela logística." }, 409);
    const msgs = (Array.isArray(body.mensagens) ? body.mensagens : []).slice(-14)
      .map((m: any) => ({ role: m?.papel === "ia" ? "assistant" : "user", content: corta(m?.texto, 2000) })).filter((m: any) => m.content);
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ erro: "Escreva sua mensagem." }, 400);
    const chave = Deno.env.get("OPENAI_API_KEY");
    if (!chave) return json({ erro: "A Luísa não está disponível agora. Escreva a explicação." }, 500);
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "system", content: sistema(ctx) }, ...msgs] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = String(d?.error?.message || "");
      if (/quota|billing|insufficient/i.test(m)) return json({ erro: "A Luísa está sem créditos agora. Escreva a explicação." }, 503);
      return json({ erro: "A Luísa não conseguiu responder agora. Tente de novo ou escreva a explicação." }, 502);
    }
    let saida: any = {};
    try { saida = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch (_) { saida = {}; }
    const pronto = !!saida.pronto && String(saida.explicacao || "").trim().length >= 10;
    return json({ resposta: String(saida.resposta || "Pode me contar um pouco mais?"), pronto, explicacao: pronto ? corta(saida.explicacao, 1500) : "" , empresa_id: ctx.empresa_id });
  } catch (e) {
    return json({ erro: (e as Error).message || "Erro inesperado." }, 500);
  }
}));
