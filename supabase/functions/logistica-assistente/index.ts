// Luísa · Logística, versão do supervisor (Painel Logístico, 21/11/2026).
// No App do Montador a Luísa conversa com cada equipe e guarda o relato do evento em montagem_relatos_ia.
// Aqui ela atende o supervisor: lê, COM O LOGIN DE QUEM PERGUNTA (mesmas regras de acesso das telas),
// os relatos das equipes e as etapas de montagem/desmontagem (escala, caminhão, observações) e responde.
// Não grava nada.
// Ação: conversar {empresa_id, mensagens:[{papel:'pessoa'|'ia', texto}]} → {resposta, pedidos:[numero], com_relato}
import { comUsoIA } from "../_shared/ia-uso.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("LOGISTICA_ASSISTENTE_MODEL") || "gpt-4.1";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const corta = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

async function autenticar(req: Request, empresa: string) {
  if (!empresa) return { erro: "Empresa ausente", status: 400 } as const;
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { erro: "Entre no sistema para conversar.", status: 401 } as const;
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return { erro: "Sessão inválida", status: 401 } as const;
  if (await segundaEtapaPendente(auth)) return { erro: MENSAGEM_2FA, status: 403 } as const;
  const { data: ctx, error } = await usuario.rpc("funcionario_contexto", { p_empresa_id: empresa });
  if (error || !ctx?.ativo) return { erro: "Seu acesso não está ativo nesta empresa.", status: 403 } as const;
  return { usuario, nome: String(ctx?.nome || user.email || "").trim() } as const;
}

async function contexto(db: any, empresa: string) {
  const h = hoje(), de = somaDias(h, -120), ate = somaDias(h, 30);
  const { data: etapas, error } = await db.from("operacao_etapas")
    .select("id,pedido_id,nome,tipo,data,hora,observacao")
    .eq("empresa_id", empresa).in("tipo", ["montagem", "desmontagem"]).gte("data", de).lte("data", ate)
    .order("data", { ascending: false }).limit(400);
  if (error) throw new Error("Não foi possível ler o cronograma: " + error.message);
  const ids = (etapas || []).map((e: any) => e.id);
  const pedIds = [...new Set((etapas || []).map((e: any) => e.pedido_id).filter(Boolean))];
  const vazio = { data: [] as any[] };
  const [rel, pes, cam, ped] = await Promise.all([
    ids.length ? db.from("montagem_relatos_ia").select("etapa_id,resumo,autor,atualizado_em,fotos").in("etapa_id", ids) : vazio,
    ids.length ? db.from("operacao_etapa_pessoas").select("etapa_id,nome,papel").in("etapa_id", ids) : vazio,
    ids.length ? db.from("operacao_etapa_caminhoes").select("etapa_id,caminhoes(codigo,modelo)").in("etapa_id", ids) : vazio,
    pedIds.length ? db.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,local_nome").in("id", pedIds) : vazio,
  ]);
  const pedidos = new Map((ped.data || []).map((p: any) => [p.id, p]));
  const relatos = new Map((rel.data || []).map((r: any) => [r.etapa_id, r]));
  const pessoas = new Map<string, any[]>();
  for (const p of pes.data || []) { if (!pessoas.has(p.etapa_id)) pessoas.set(p.etapa_id, []); pessoas.get(p.etapa_id)!.push(p); }
  const camis = new Map<string, string[]>();
  for (const c of cam.data || []) { if (!camis.has(c.etapa_id)) camis.set(c.etapa_id, []); camis.get(c.etapa_id)!.push([c.caminhoes?.codigo, c.caminhoes?.modelo].filter(Boolean).join(" ")); }
  const lista = (etapas || []).filter((e: any) => !e.pedido_id || pedidos.has(e.pedido_id)).map((e: any) => {
    const p: any = pedidos.get(e.pedido_id) || {}, r: any = relatos.get(e.id), ps = pessoas.get(e.id) || [];
    const resumo = r ? Object.fromEntries(Object.entries(r.resumo || {}).filter(([k]) => k !== "pendencias_obrigatorias").map(([k, v]) => [k, corta(v, 900)])) : null;
    return {
      pedido: p.numero_pedido || null, cliente: p.cliente_nome || null, local: p.local_nome || null,
      etapa: e.tipo, data: e.data, hora: e.hora ? String(e.hora).slice(0, 5) : null, ja_passou: e.data < h,
      responsavel: ps.find((x) => x.papel === "responsavel")?.nome || null,
      equipe: ps.filter((x) => x.papel === "equipe").map((x) => x.nome),
      caminhoes: camis.get(e.id) || [],
      observacao: corta(e.observacao, 300) || undefined,
      relato_da_equipe: resumo
        ? { registrado_por: r.autor, em: String(r.atualizado_em).slice(0, 16).replace("T", " "), fotos: (r.fotos || []).length, ...resumo }
        : "sem relato registrado",
    };
  });
  return { hoje: h, periodo: { de, ate }, etapas: lista, com_relato: lista.filter((x: any) => typeof x.relato_da_equipe === "object").length };
}

function sistema(nome: string, ctx: unknown) {
  return `Você é Luísa, a auxiliar de logística com IA da empresa (móveis para eventos). No app, você conversa com as equipes de montagem e desmontagem em cada evento e registra o relato delas. Agora você atende ${nome || "o supervisor"} no Painel Logístico.
Responda em português, de forma direta e organizada, como uma coordenadora que conhece cada evento. Use SOMENTE os dados abaixo: os relatos das equipes (entrega, acessos, dificuldades, comentários do decorador, ocorrências, orientações para a desmontagem, cuidados, melhorias e pendências) e a escala de cada montagem e desmontagem dos últimos 120 dias e dos próximos 30.
Regras:
- Sempre cite o pedido (número), o cliente/local e a data ao falar de um evento. Diga quem registrou o relato quando for relevante.
- Diferencie o que a equipe relatou do que você está deduzindo. Nunca invente fatos, pessoas ou números; se não houver relato, diga que a equipe ainda não registrou.
- Em perguntas gerais (quais eventos tiveram problema, o que melhorar, como foi a semana), cruze todos os relatos e aponte padrões (locais difíceis, reclamações de decoradores, peças faltando ou danificadas, atrasos), com os pedidos de exemplo.
- Para uma desmontagem futura, traga as orientações que a equipe da montagem deixou para aquele pedido.
- Seja breve: até umas 10 linhas, com listas quando ajudar. Use **negrito** só para destacar pedidos e alertas.
- Você não altera escala, horários, quantidades nem abre ocorrências: só informa e sugere.
DADOS (JSON): ${JSON.stringify(ctx)}`;
}

Deno.serve(comUsoIA("montagem", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const a = await autenticar(req, String(body?.empresa_id || ""));
    if ("erro" in a) return json({ erro: a.erro }, a.status);
    const msgs = (Array.isArray(body?.mensagens) ? body.mensagens : []).slice(-16)
      .map((m: any) => ({ role: m?.papel === "ia" ? "assistant" : "user", content: corta(m?.texto, 4000) }))
      .filter((m: any) => m.content);
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ erro: "Escreva sua pergunta." }, 400);
    const ctx = await contexto(a.usuario, body.empresa_id);
    const chave = Deno.env.get("OPENAI_API_KEY");
    if (!chave) return json({ erro: "A IA não está configurada." }, 500);
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, temperature: 0.3, messages: [{ role: "system", content: sistema(a.nome, ctx) }, ...msgs] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = String(d?.error?.message || "");
      if (/quota|billing|insufficient/i.test(m)) return json({ erro: "A IA está sem créditos no momento. Avise o responsável pelo sistema." }, 503);
      return json({ erro: "A Luísa não conseguiu responder agora. Tente de novo." }, 502);
    }
    const resposta = String(d?.choices?.[0]?.message?.content || "").trim();
    const nums = new Set(ctx.etapas.map((e: any) => String(e.pedido || "")).filter(Boolean));
    const pedidos = [...new Set((resposta.match(/\b\d{1,6}\b/g) || []).filter((x) => nums.has(x)))].slice(0, 8);
    return json({ resposta, pedidos, com_relato: ctx.com_relato });
  } catch (e) {
    return json({ erro: (e as Error).message || "Erro inesperado." }, 500);
  }
}));
