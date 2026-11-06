// Ideia Premiada (nov/2026): assistente que ouve a ideia do funcionário, faz perguntas até entender (o problema, a
// solução, os benefícios) e devolve um resumo para a pessoa aprovar. Quem grava a ideia é o navegador, depois que a
// pessoa aprova, pela RPC ideias_premiadas_enviar (cai em Recebidas, na Gestão de Pessoas).
// Ações: conversar {empresa_id, mensagens:[{papel:'pessoa'|'ia', texto}]} e transcrever {empresa_id, audio: dataURL}.
// Só a equipe logada (usuarios_empresas + funcionário ativo + verificação em duas etapas). Nada é guardado aqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("IDEIA_ASSISTENTE_MODEL") || "gpt-4.1";
const AREAS = ["Operação e eventos", "Estoque e triagem", "Logística", "Comercial e atendimento", "Financeiro", "Pessoas e bem-estar", "Sustentabilidade", "Outra área"];

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
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: f } = await service.from("funcionarios_acesso").select("nome").eq("id", user.id).maybeSingle();
  const { data: u } = await service.from("usuarios").select("nome").eq("id", user.id).maybeSingle();
  return { nome: String(f?.nome || u?.nome || user.email || "").trim() };
}

const SISTEMA = (nome: string) => `Você é a assistente da Ideia Premiada da Chiavari (empresa de locação de móveis para eventos).
Seu papel: ouvir com atenção a ideia de melhoria de um funcionário e entendê-la de verdade, para que o RH possa avaliá-la bem.
Quem está falando: ${nome || "um funcionário"}. Use o primeiro nome com moderação, sem repetir a cada mensagem.

Como conduzir:
- Português do Brasil, tom acolhedor e simples, frases curtas. Valorize a iniciativa sem exagero.
- Faça UMA única pergunta por mensagem (um só ponto de interrogação). Nunca mande duas perguntas nem lista de perguntas.
- Respostas curtas: no máximo 2 frases antes da pergunta.
- Descubra, nesta ordem, só o que ainda não estiver claro: (1) qual situação ou problema a pessoa percebeu e onde acontece;
  (2) como a solução funcionaria na prática (quem faz, o que muda, o que precisaria); (3) quais benefícios ela traz
  (economia de dinheiro, tempo, menos retrabalho ou perda, segurança, qualidade, satisfação do cliente, bem-estar da equipe)
  e, se der, algum número ou exemplo real; (4) se há algum custo, cuidado ou dificuldade para colocar em prática.
- Se a pessoa já contou algo, não pergunte de novo. Se ela não souber responder, siga em frente.
- Ajude a pessoa a enxergar benefícios que ela talvez não citou, perguntando ("isso também ajudaria em...?"), sem inventar fatos.
- Nunca prometa prêmio, aprovação ou prazo. Quem avalia é a empresa.
- Não trate de assuntos fora da ideia; se a pessoa desviar, traga a conversa de volta com gentileza.
- Normalmente bastam de 3 a 6 perguntas. Quando já der para descrever bem o problema, a ideia e os benefícios, pare de
  perguntar: responda com uma frase curta dizendo que vai mostrar o resumo para ela conferir, e marque pronto=true.
- Se a pessoa pedir para mudar algo no resumo, ajuste e mande de novo com pronto=true.

O resumo (quando pronto=true) é escrito em primeira pessoa, como se fosse a própria pessoa explicando, claro e completo:
- titulo: nome curto da ideia (5 a 80 caracteres);
- area: uma destas exatamente: ${AREAS.join(", ")};
- problema: a situação atual e a dificuldade percebida (2 a 5 frases);
- proposta: como a ideia funcionaria na prática (2 a 6 frases);
- beneficio: os benefícios esperados, com números ou exemplos quando a pessoa deu, e cuidados/custos citados (2 a 5 frases).
Enquanto pronto=false, devolva o resumo com textos vazios.`;

const ESQUEMA = {
  name: "resposta_ideia",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["resposta", "pronto", "resumo"],
    properties: {
      resposta: { type: "string" },
      pronto: { type: "boolean" },
      resumo: {
        type: "object", additionalProperties: false, required: ["titulo", "area", "problema", "proposta", "beneficio"],
        properties: { titulo: { type: "string" }, area: { type: "string" }, problema: { type: "string" }, proposta: { type: "string" }, beneficio: { type: "string" } },
      },
    },
  },
};

async function conversar(nome: string, body: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "A assistente está indisponível agora." }, 500);
  const lista = Array.isArray(body?.mensagens) ? body.mensagens : [];
  if (!lista.length) return json({ erro: "Conte sua ideia para começar." }, 400);
  if (lista.length > 60) return json({ erro: "A conversa ficou longa demais. Envie o resumo ou comece de novo." }, 400);
  const mensagens = lista.map((m: any) => ({
    role: m?.papel === "ia" ? "assistant" : "user",
    content: String(m?.texto || "").slice(0, 4000),
  })).filter((m: any) => m.content.trim());
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.4, response_format: { type: "json_schema", json_schema: ESQUEMA }, messages: [{ role: "system", content: SISTEMA(nome) }, ...mensagens] }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.warn("openai:", d?.error?.message); return json({ erro: "A assistente não conseguiu responder agora. Tente de novo." }, 502); }
  let saida: any;
  try { saida = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { saida = {}; }
  const res = saida?.resumo || {};
  const corta = (v: unknown, max: number) => String(v || "").trim().slice(0, max);
  const resumo = {
    titulo: corta(res.titulo, 120), area: AREAS.includes(String(res.area)) ? String(res.area) : "Outra área",
    problema: corta(res.problema, 3000), proposta: corta(res.proposta, 5000), beneficio: corta(res.beneficio, 3000),
  };
  const completo = resumo.titulo.length >= 5 && [resumo.problema, resumo.proposta, resumo.beneficio].every((t) => t.length >= 10);
  return json({ resposta: corta(saida?.resposta, 2000) || "Pode me contar um pouco mais?", pronto: Boolean(saida?.pronto) && completo, resumo: Boolean(saida?.pronto) && completo ? resumo : null });
}

async function transcrever(body: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "Transcrição indisponível agora." }, 500);
  const m = String(body?.audio || "").match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return json({ erro: "Áudio inválido." }, 400);
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length < 800) return json({ erro: "O áudio ficou curto demais. Fale de novo, um pouco mais." }, 400);
  if (bytes.length > 12 * 1024 * 1024) return json({ erro: "Áudio longo demais. Mande em partes de até 3 minutos." }, 400);
  const tipo = m[1].toLowerCase();
  const ext = tipo.includes("mp4") || tipo.includes("m4a") || tipo.includes("aac") ? "m4a" : tipo.includes("ogg") ? "ogg" : tipo.includes("wav") ? "wav" : tipo.includes("mpeg") || tipo.includes("mp3") ? "mp3" : "webm";
  const tentar = async (modelo: string) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: tipo }), `audio.${ext}`);
    form.append("model", modelo);
    form.append("language", "pt");
    form.append("prompt", "Funcionário da Chiavari contando uma ideia de melhoria: eventos, montagem, triagem, estoque, logística, caminhão, cliente, decorador.");
    form.append("response_format", "json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `Falha na transcrição (${r.status})`);
    return String(d?.text || "").trim();
  };
  let texto = "";
  try { texto = await tentar(Deno.env.get("IDEIA_ASSISTENTE_TRANSCRICAO") || "gpt-4o-transcribe"); }
  catch (e) { console.warn("transcrição principal falhou:", e); texto = await tentar("whisper-1"); }
  if (!texto) return json({ erro: "Não consegui entender o áudio. Pode falar de novo, mais perto do microfone?" }, 422);
  return json({ texto: texto.slice(0, 4000) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ erro: "Pedido inválido" }, 400); }
  const quem = await autenticar(req, String(body?.empresa_id || ""));
  if ("erro" in quem) return json({ erro: quem.erro }, quem.status);
  try {
    if (body?.acao === "transcrever") return await transcrever(body);
    if (body?.acao === "conversar") return await conversar(quem.nome, body);
    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Algo deu errado. Tente de novo." }, 500);
  }
});
