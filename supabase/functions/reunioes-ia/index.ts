// Reuniões (nov/2026): transcrição com reconhecimento das vozes cadastradas, ata gerada pela IA e "pergunte à reunião".
// Ações (sempre com o login da equipe + verificação em duas etapas; o acesso à reunião é conferido pela RPC reuniao_acesso
// COMO o usuário, e só depois a chave de serviço lê o áudio/grava):
//   transcrever_parte {empresa_id, reuniao_id, parte_id}  → separa as falas (gpt-4o-transcribe-diarize), com até 4 vozes
//                                                            cadastradas dos convidados já com o nome; grava em reuniao_partes.
//   gerar_ata {empresa_id, reuniao_id}                     → junta as partes e escreve a ata (resumo, tópicos, decisões, tarefas…)
//   perguntar {empresa_id, reuniao_id, pergunta}           → responde sobre o que foi dito (não grava nada).
import { comUsoIA } from "../_shared/ia-uso.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELO = Deno.env.get("REUNIOES_MODEL") || "gpt-4.1";
const MAX_AUDIO = 25 * 1024 * 1024;
const FUSO = "America/Sao_Paulo";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

async function autenticar(req: Request, empresaId: string, reuniaoId: string) {
  if (!empresaId || !reuniaoId) return { erro: "Reunião não informada.", status: 400 };
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { erro: "Entre no sistema para continuar.", status: 401 };
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return { erro: "Sessão inválida.", status: 401 };
  if (await segundaEtapaPendente(auth)) return { erro: MENSAGEM_2FA, status: 403 };
  const { data: ctx } = await usuario.rpc("funcionario_contexto", { p_empresa_id: empresaId });
  if (!ctx?.ativo) return { erro: "Seu acesso não está ativo nesta empresa.", status: 403 };
  const { data: acesso, error } = await usuario.rpc("reuniao_acesso", { p_id: reuniaoId });
  if (error || !acesso?.ver) return { erro: "Reunião não encontrada ou sem acesso.", status: 403 };
  const db = admin();
  const { data: r } = await db.from("reunioes").select("*").eq("id", reuniaoId).eq("empresa_id", empresaId).maybeSingle();
  if (!r) return { erro: "Reunião não encontrada.", status: 404 };
  return { user, acesso, r, db };
}

async function dataUrl(b: Blob, tipo: string) {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${(tipo || "audio/webm").split(";")[0]};base64,${btoa(bin)}`;
}

const ext = (t: string) => t.includes("mp4") || t.includes("m4a") || t.includes("aac") ? "m4a" : t.includes("ogg") ? "ogg" : t.includes("wav") ? "wav" : t.includes("mpeg") || t.includes("mp3") ? "mp3" : "webm";

async function transcreverParte(ctx: any, parteId: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "A inteligência artificial ainda não foi configurada." }, 500);
  if (!ctx.acesso.editar) return json({ erro: "Só quem participa da reunião pode transcrever." }, 403);
  const { db, r } = ctx;
  const { data: parte } = await db.from("reuniao_partes").select("*").eq("id", parteId).eq("reuniao_id", r.id).maybeSingle();
  if (!parte) return json({ erro: "Parte da gravação não encontrada." }, 404);
  const { data: blob, error } = await db.storage.from("reunioes").download(parte.path);
  if (error || !blob) return json({ erro: "Não foi possível ler a gravação." }, 500);
  if (blob.size > MAX_AUDIO) return json({ erro: "Esta parte passou de 25 MB. Envie o áudio em qualidade menor ou em partes." }, 400);
  if (blob.size < 2000) {
    await db.from("reuniao_partes").update({ transcricao: [], transcrita_em: new Date().toISOString(), vozes_reconhecidas: 0 }).eq("id", parte.id);
    return json({ segmentos: [], vozes: 0 });
  }
  const tipo = parte.tipo || blob.type || "audio/webm";
  const arquivo = new File([blob], `parte-${parte.ordem}.${ext(tipo)}`, { type: tipo.split(";")[0] });

  // Vozes: convidados internos com voz cadastrada (até 4: presentes, confirmados e depois os demais).
  const { data: parts } = await db.from("reuniao_participantes").select("funcionario_id,nome,presente,resposta").eq("reuniao_id", r.id).not("funcionario_id", "is", null);
  const ids = (parts || []).map((p: any) => p.funcionario_id);
  const { data: vozes } = ids.length ? await db.from("reuniao_vozes").select("funcionario_id,path,tipo").in("funcionario_id", ids) : { data: [] };
  const peso = (p: any) => (p.presente ? 0 : 2) + (p.resposta === "confirmado" ? 0 : 1);
  const escolhidos = (parts || []).filter((p: any) => (vozes || []).some((v: any) => v.funcionario_id === p.funcionario_id))
    .sort((a: any, b: any) => peso(a) - peso(b)).slice(0, 4);
  const nomesUsados = new Set<string>();
  const conhecidos: { nome: string; ref: string; id: string }[] = [];
  for (const p of escolhidos) {
    const v = (vozes || []).find((x: any) => x.funcionario_id === p.funcionario_id);
    const { data: vb } = await db.storage.from("reunioes").download(v.path);
    if (!vb) continue;
    let nome = String(p.nome || "").trim().slice(0, 60);
    if (nomesUsados.has(nome)) nome = `${nome} (${conhecidos.length + 1})`;
    nomesUsados.add(nome);
    conhecidos.push({ nome, ref: await dataUrl(vb, v.tipo || vb.type), id: p.funcionario_id });
  }

  let segmentos: { quem: string; ini: number; fim: number; texto: string; id?: string }[] = [];
  let reconhecidas = 0;
  try {
    const form = new FormData();
    form.append("file", arquivo);
    form.append("model", Deno.env.get("REUNIOES_DIARIZE_MODEL") || "gpt-4o-transcribe-diarize");
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    form.append("language", "pt");
    for (const c of conhecidos) { form.append("known_speaker_names[]", c.nome); form.append("known_speaker_references[]", c.ref); }
    const rr = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(280000) });
    const d = await rr.json().catch(() => ({}));
    if (!rr.ok) console.warn("diarize:", d?.error?.message);
    if (rr.ok && Array.isArray(d.segments)) {
      const porNome = new Map(conhecidos.map((c) => [c.nome, c.id]));
      const achados = new Set<string>();
      for (const s of d.segments) {
        const fala = String(s.text || "").trim();
        if (!fala) continue;
        const sp = String(s.speaker ?? "?");
        const id = porNome.get(sp);
        if (id) achados.add(id);
        segmentos.push({ quem: id ? sp.replace(/ \(\d+\)$/, "") : `Participante ${sp}`, ini: Number(s.start) || 0, fim: Number(s.end) || 0, texto: fala, ...(id ? { id } : {}) });
      }
      reconhecidas = achados.size;
      if (achados.size) await db.from("reuniao_participantes").update({ presente: true }).eq("reuniao_id", r.id).in("funcionario_id", [...achados]).is("presente", null);
    }
  } catch (e) { console.warn("diarize falhou:", e); }
  if (!segmentos.length) {
    const form = new FormData();
    form.append("file", arquivo);
    form.append("model", Deno.env.get("REUNIOES_TRANSCRICAO_MODEL") || "gpt-4o-transcribe");
    form.append("language", "pt");
    form.append("response_format", "json");
    const rr = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(240000) });
    const d = await rr.json().catch(() => ({}));
    if (!rr.ok) return json({ erro: erroIA(d?.error?.message, "A transcrição falhou. Tente de novo.") }, 502);
    const texto = String(d.text || "").trim();
    segmentos = texto ? [{ quem: "Reunião", ini: 0, fim: parte.segundos || 0, texto }] : [];
  }
  await db.from("reuniao_partes").update({ transcricao: segmentos, transcrita_em: new Date().toISOString(), vozes_reconhecidas: reconhecidas }).eq("id", parte.id);
  return json({ segmentos: segmentos.length, vozes: reconhecidas, cadastradas: conhecidos.length });
}

// Erros da OpenAI em português (o caso mais comum: conta sem créditos).
function erroIA(m: unknown, padrao: string) {
  const t = String((m as any)?.message || m || "");
  if (/credit|quota|billing|insufficient_quota/i.test(t)) return "A IA está sem créditos na conta da OpenAI da empresa. Avise o administrador do sistema; a gravação continua salva e a ata pode ser gerada depois.";
  if (/rate limit/i.test(t)) return "A IA está ocupada agora. Tente de novo em um minuto.";
  return t || padrao;
}

const mmss = (s: number) => { const t = Math.max(0, Math.round(s)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const x = t % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0")) + `:${String(x).padStart(2, "0")}`; };

async function textoDaReuniao(db: any, reuniaoId: string) {
  const { data: partes } = await db.from("reuniao_partes").select("ordem,segundos,transcricao").eq("reuniao_id", reuniaoId).order("ordem");
  let base = 0; const linhas: string[] = []; let faltam = 0;
  for (const p of partes || []) {
    if (!Array.isArray(p.transcricao)) { faltam++; base += p.segundos || 0; continue; }
    let ultimo = "", buf = "", ini = 0;
    const solta = () => { if (buf.trim()) linhas.push(`[${mmss(ini)}] ${ultimo}: ${buf.trim()}`); buf = ""; };
    for (const s of p.transcricao) {
      if (s.quem !== ultimo) { solta(); ultimo = s.quem; ini = base + (s.ini || 0); }
      buf += " " + s.texto;
    }
    solta();
    base += p.segundos || 0;
  }
  return { texto: linhas.join("\n"), faltam, partes: (partes || []).length };
}

function contexto(r: any, participantes: any[]) {
  const quando = new Date(r.inicio).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "full", timeStyle: "short" });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: FUSO });
  return `Reunião: ${r.titulo}\nTipo: ${r.tipo || "não informado"}\nData: ${quando}\nHoje é ${hoje}.\nPauta prevista: ${r.pauta || "não informada"}\n` +
    `Convidados: ${participantes.map((p) => `${p.nome}${p.setor ? ` (${p.setor})` : ""}${p.externo ? " (externo)" : ""}`).join(", ") || "não informados"}\n` +
    (r.notas ? `Anotações feitas durante a reunião:\n${String(r.notas).slice(0, 6000)}\n` : "");
}

const SISTEMA_ATA = `Você é a secretária executiva de uma empresa de locação de móveis para eventos (Chiavari) e redige a ATA de uma reunião
interna em português do Brasil a partir da transcrição. A transcrição vem como "[minuto] Nome: fala". "Participante A/B…" é
alguém cuja voz não foi reconhecida: não invente o nome (só use o nome se a própria pessoa ou outra a chamar pelo nome).
Regras: escreva só o que foi dito (não invente números, datas, nomes nem decisões); linguagem clara, objetiva e profissional;
os tópicos seguem a ordem em que foram discutidos; agrupe falas repetidas; decisões são o que ficou combinado; tarefas são
ações com alguém responsável ("quem vai fazer o quê"): use o nome exatamente como na lista de convidados e o prazo em
AAAA-MM-DD quando dito (converta "sexta", "semana que vem" a partir da data da reunião), senão "".
Pendências = assuntos que ficaram em aberto sem decisão. Destaques = até 4 frases marcantes, literais, com quem disse e o minuto.
Se a transcrição estiver vazia ou sem conteúdo, diga isso no resumo e deixe as listas vazias.`;

const ESQUEMA_ATA = {
  name: "ata_reuniao", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["resumo", "topicos", "decisoes", "tarefas", "pendencias", "destaques", "proxima_reuniao"],
    properties: {
      resumo: { type: "string" },
      topicos: { type: "array", items: { type: "object", additionalProperties: false, required: ["titulo", "minuto", "pontos"], properties: { titulo: { type: "string" }, minuto: { type: "string" }, pontos: { type: "array", items: { type: "string" } } } } },
      decisoes: { type: "array", items: { type: "string" } },
      tarefas: { type: "array", items: { type: "object", additionalProperties: false, required: ["descricao", "responsavel", "prazo"], properties: { descricao: { type: "string" }, responsavel: { type: "string" }, prazo: { type: "string" } } } },
      pendencias: { type: "array", items: { type: "string" } },
      destaques: { type: "array", items: { type: "object", additionalProperties: false, required: ["quem", "frase", "minuto"], properties: { quem: { type: "string" }, frase: { type: "string" }, minuto: { type: "string" } } } },
      proxima_reuniao: { type: "string" },
    },
  },
};

const norm = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function acharPessoa(nome: string, pessoas: any[]) {
  const n = norm(nome); if (!n) return null;
  const exato = pessoas.find((p) => norm(p.nome) === n); if (exato) return exato;
  const primeiro = n.split(/\s+/)[0];
  const cands = pessoas.filter((p) => norm(p.nome).split(/\s+/)[0] === primeiro || norm(p.nome).includes(n));
  return cands.length === 1 ? cands[0] : null;
}

async function chamarIA(key: string, mensagens: any[], esquema?: any, max = 6000) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(140000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.2, max_tokens: max, messages: mensagens, ...(esquema ? { response_format: { type: "json_schema", json_schema: esquema } } : {}) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(erroIA(d?.error?.message, "A IA não respondeu agora."));
  return String(d?.choices?.[0]?.message?.content || "");
}

async function gerarAta(ctx: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "A inteligência artificial ainda não foi configurada." }, 500);
  if (!ctx.acesso.editar) return json({ erro: "Só quem participa da reunião pode gerar a ata." }, 403);
  const { db, r } = ctx;
  if (r.ata_status === "aprovada") return json({ erro: "A ata já foi aprovada." }, 400);
  const t = await textoDaReuniao(db, r.id);
  if (!t.partes) return json({ erro: "Grave a reunião (ou envie o áudio) antes de gerar a ata." }, 400);
  if (t.faltam) return json({ erro: "Ainda há partes da gravação sem transcrição." }, 400);
  const { data: parts } = await db.from("reuniao_participantes").select("id,funcionario_id,nome,externo").eq("reuniao_id", r.id);
  const pessoas = (parts || []).filter((p: any) => p.funcionario_id);
  const saida = await chamarIA(key, [
    { role: "system", content: SISTEMA_ATA },
    { role: "user", content: `${contexto(r, parts || [])}\nTRANSCRIÇÃO:\n${(t.texto || "(vazia)").slice(0, 160000)}` },
  ], ESQUEMA_ATA, 8000);
  let ata: any; try { ata = JSON.parse(saida); } catch { return json({ erro: "A IA não conseguiu escrever a ata. Tente de novo." }, 502); }
  const tarefas = (ata.tarefas || []).filter((x: any) => String(x.descricao || "").trim().length >= 2).map((x: any) => {
    const p = acharPessoa(x.responsavel, pessoas);
    const prazo = /^\d{4}-\d{2}-\d{2}$/.test(x.prazo || "") ? x.prazo : null;
    return { reuniao_id: r.id, empresa_id: r.empresa_id, descricao: String(x.descricao).trim().slice(0, 600), responsavel_id: p?.funcionario_id || null,
      responsavel_nome: p?.nome || (String(x.responsavel || "").trim() || null), prazo, origem: "ia" };
  });
  const ataSalva = { ...ata, tarefas: undefined, gerada_por_ia: true, versao: 1 };
  delete ataSalva.tarefas;
  await db.from("reunioes").update({ ata: ataSalva, ata_status: "rascunho", ata_gerada_em: new Date().toISOString(), status: "realizada", atualizado_em: new Date().toISOString() }).eq("id", r.id);
  await db.from("reuniao_tarefas").delete().eq("reuniao_id", r.id).eq("origem", "ia").eq("concluida", false);
  if (tarefas.length) await db.from("reuniao_tarefas").insert(tarefas);
  return json({ ok: true, tarefas: tarefas.length });
}

async function perguntar(ctx: any, pergunta: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "A inteligência artificial ainda não foi configurada." }, 500);
  const q = String(pergunta || "").trim().slice(0, 1000);
  if (q.length < 3) return json({ erro: "Escreva a pergunta." }, 400);
  const { db, r } = ctx;
  const t = await textoDaReuniao(db, r.id);
  if (!t.texto) return json({ erro: "Esta reunião ainda não tem transcrição." }, 400);
  const { data: parts } = await db.from("reuniao_participantes").select("nome,externo").eq("reuniao_id", r.id);
  const resposta = await chamarIA(key, [
    { role: "system", content: "Você responde perguntas sobre uma reunião, só com base na transcrição e na ata. Português do Brasil, direto, no máximo 6 frases. Cite o minuto entre colchetes quando ajudar ([12:30]). Se a resposta não estiver na reunião, diga que isso não foi falado. Não invente." },
    { role: "user", content: `${contexto(r, parts || [])}\nATA: ${JSON.stringify(r.ata || {}).slice(0, 12000)}\nTRANSCRIÇÃO:\n${t.texto.slice(0, 150000)}\n\nPERGUNTA: ${q}` },
  ], undefined, 700);
  return json({ resposta: resposta.trim() });
}

Deno.serve(comUsoIA("reunioes", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ erro: "Pedido inválido" }, 400); }
  const ctx = await autenticar(req, String(body?.empresa_id || ""), String(body?.reuniao_id || ""));
  if ("erro" in ctx) return json({ erro: ctx.erro }, ctx.status);
  try {
    if (body.acao === "transcrever_parte") return await transcreverParte(ctx, String(body.parte_id || ""));
    if (body.acao === "gerar_ata") return await gerarAta(ctx);
    if (body.acao === "perguntar") return await perguntar(ctx, body.pergunta);
    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : "Algo deu errado. Tente de novo." }, 500);
  }
}));
