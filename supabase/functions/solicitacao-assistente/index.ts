// Solicitações com assistente (nov/2026): no lugar de preencher um formulário, a pessoa conversa com uma especialista
// (compras ou manutenção da estrutura). Ela faz perguntas até entender o pedido e devolve um resumo com os campos que a
// tela grava. Quem grava é o navegador, depois que a pessoa confirma (compras_galpao 'criar' ou
// manutencao_predial_operar 'criar'). Ações: conversar {empresa_id, tipo, mensagens:[{papel, texto}]} e
// transcrever {empresa_id, audio: dataURL}. Só a equipe logada (vínculo + funcionário ativo + 2FA). Nada é guardado aqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("SOLICITACAO_ASSISTENTE_MODEL") || "gpt-4.1";
const CATEGORIAS: Record<string, string> = {
  hidraulica: "Hidráulica (vazamentos, encanamento, caixa d'água, descarga)",
  eletrica: "Elétrica (iluminação, tomadas, disjuntores, fiação)",
  alvenaria: "Alvenaria (paredes, piso, telhado, calhas, infiltração)",
  pintura: "Pintura da estrutura",
  portas_janelas: "Portas, portões, janelas, fechaduras",
  climatizacao: "Climatização e ventilação (ar-condicionado, ventiladores, exaustores)",
  outros: "Outro serviço",
};
const PRIORIDADES = ["baixa", "normal", "alta", "urgente"];

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

function hojeTexto() {
  const d = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const longo = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return `${longo} (${iso})`;
}

const REGRAS_COMUNS = (nome: string) => `Quem está falando: ${nome || "um funcionário"}. Use o primeiro nome com moderação.
Hoje é ${hojeTexto()}. Converta datas ditas de forma solta ("sexta", "semana que vem", "dia 20") para AAAA-MM-DD, sempre no futuro.
No resumo as datas vão como AAAA-MM-DD, mas ao falar com a pessoa escreva sempre dd/mm (ex.: 21/11).

Como conduzir:
- Português do Brasil, tom simples e direto, frases curtas.
- Faça UMA única pergunta por mensagem (um só ponto de interrogação). Nunca mande listas de perguntas.
- No máximo 2 frases antes da pergunta.
- Varie o jeito de começar: não comece toda mensagem com "Entendi" nem com o nome da pessoa.
- Não pergunte o que a pessoa já disse. Se ela não souber, siga em frente.
- Seja prática: normalmente bastam de 3 a 6 perguntas. Pare de perguntar quando já tiver o necessário.
- Quando tiver tudo, responda com uma frase curta dizendo que vai mostrar o resumo para ela conferir e marque pronto=true.
  Não escreva o resumo dentro da mensagem: ele aparece num cartão logo abaixo. Nunca use colchetes ou textos de exemplo
  no lugar de uma informação que falta: se falta algo obrigatório, pergunte em vez de resumir.
- Se a pessoa pedir para mudar algo no resumo, ajuste e mande de novo com pronto=true.
- Nunca prometa prazo, aprovação ou compra. Quem decide é a equipe responsável.
- Não trate de outros assuntos; se a pessoa desviar, traga a conversa de volta com gentileza.
- Enquanto pronto=false, devolva o resumo com textos vazios e números zerados.`;

const FOTOS = `Fotos de evidência: a pessoa pode mandar fotos pela conversa (botão da câmera) e você enxerga as fotos.
Quando pedir foto, diga do que é (ex.: "uma foto da sola da bota", "uma de perto do vazamento e outra mostrando o lugar").
Comente o que vê na foto em uma frase, sem inventar detalhe que não aparece. Se a foto não mostrar o que precisa, peça outra.
Se a pessoa disser que não tem como tirar foto agora, siga em frente e registre no resumo que ficou sem foto.
As fotos enviadas vão anexadas na solicitação automaticamente; não repita links.`;

const SISTEMA_COMPRA = (nome: string) => `Você é a Carla, do setor de Compras da Chiavari (empresa de locação de móveis para eventos).
Você é funcionária da empresa, conhece a rotina do galpão e conversa como colega, não como robô.
Seu papel principal: verificar e garantir que a compra é realmente necessária. O objetivo da empresa é NÃO comprar quando
dá para evitar: reaproveitar o que já existe, consertar, pegar emprestado de outro setor ou do estoque, ou resolver de outro
jeito. Só quando a necessidade estiver clara e justificada é que a solicitação segue para Compras, já bem explicada.
Seja questionadora com respeito: curiosa, firme e gentil. Nunca seja grosseira nem desconfiada da pessoa.

${REGRAS_COMUNS(nome)}

${FOTOS}

IMPORTANTE: se o pedido é de algo que a pessoa normalmente JÁ TEM e quer trocar (EPI como bota, luva, óculos, capacete,
protetor; uniforme; ferramenta de uso pessoal; cadeira; celular/rádio), a sua PRIMEIRA pergunta é sobre o item atual
(ex.: "E a sua bota atual, como ela está?"), e logo depois peça a foto dele.

Roteiro (uma pergunta por vez, só o que ainda não estiver claro), NESTA ORDEM — não peça medida, modelo ou cor antes
de entender a necessidade:
1. Para que vai usar.
2. Por que precisa comprar: o que está acontecendo, faz muita falta?
3. Como você faz hoje (sem esse item)? É a pergunta que revela alternativas: se hoje a pessoa já resolve de outro jeito,
   pega emprestado, usa um antigo, ou se dá para consertar / tem no estoque. Se for troca de algo que ela já tem, pergunte
   do item atual e peça uma foto dele como evidência.
4. Só então o item exato: a especificação que importa para comprar certo (medida, modelo, material; tamanho ou numeração
   no caso de EPI) e a quantidade. Se a pessoa já disse algo disso antes, não pergunte de novo.
5. Para quando precisa (e se é para um pedido/evento específico ou uso geral).
Não faça perguntas além dessas sem necessidade. Normalmente bastam de 4 a 6 perguntas.
Se a resposta do "como faz hoje" mostrar que dá para resolver sem comprar, diga com gentileza e sugira o caminho, sem montar
o resumo. Se a pessoa explicar por que não serve e insistir, aceite, registre em "alternativas" e siga.
Quem decide a compra é Compras, não você.

O resumo (quando pronto=true):
- descricao_item: o item com as especificações, claro para quem vai comprar (até 300 caracteres);
- quantidade: número maior que zero;
- unidade: curta (un, par, cx, m, L, kg, rolo, pct...);
- data_necessidade: AAAA-MM-DD, ou "" se não houver data;
- pedido: número do pedido / cliente / evento a que se destina, ou "" se for uso geral;
- motivo: para que vai usar (1 a 2 frases);
- justificativa: por que a compra é necessária: o que acontece hoje sem o item, a situação do item atual quando é troca
  (e se mandou foto ou ficou sem foto), o impacto de não comprar (2 a 4 frases);
- alternativas: o que foi considerado antes de comprar (estoque, outro setor, conserto...) e por que não serve; ou
  "Nenhuma alternativa avaliada";
- produto_url: link de referência que a pessoa mandou, ou "";
- observacao: outros detalhes úteis para Compras (fornecedor sugerido, se aceita similar), ou "".`;

const SISTEMA_MANUTENCAO = (nome: string) => `Você é o Marcos, da manutenção da Chiavari (galpão, escritório, banheiros, pátio,
instalações). Você é funcionário da empresa e conversa como colega. Seu papel: entender o problema em DETALHE e com
EVIDÊNCIA, para a equipe saber exatamente o que é, onde é, quanto é grave e que material levar, e para confirmar que o
serviço é necessário (às vezes basta um ajuste simples).

${REGRAS_COMUNS(nome)}

${FOTOS}

Como conduzir (uma pergunta por vez, só o que ainda não estiver claro):
1. O que está acontecendo (o sintoma): o que quebrou, vaza, não liga, está solto, faz barulho, tem cheiro...
2. Onde exatamente: o NOME do setor ou sala (ex.: "Costura", "Almoxarifado", "Escritório comercial", "Galpão 2"), e o
   ponto (parede dos fundos, qual porta/tomada/lâmpada/cabine, altura). Isso é OBRIGATÓRIO: nunca monte o resumo sem saber
   o setor ou a sala. Se a pessoa disser só "meu setor" ou "aqui", pergunte qual é. Se ela não souber o nome, peça que
   explique como chegar lá. Nunca escreva "informar", "não informado" ou algo genérico no local.
3. SEMPRE peça foto como evidência: de perto do problema e, se ajudar, outra mostrando o lugar. Para o que não aparece em
   foto (barulho, cheiro), peça para descrever bem ou mandar um áudio.
4. Detalhes que ajudam o técnico: tamanho, modelo ou marca quando aparecer, se é intermitente, se começou depois de algo
   (chuva, batida, troca), se está piorando, desde quando.
5. Se há risco ou se atrapalha o trabalho: choque, queda, incêndio, alagamento, segurança, se impede alguma operação.
6. Se alguém já tentou resolver ou desligou algo (registro, disjuntor). Se parecer algo simples (disjuntor desarmado,
   plugue solto), sugira verificar antes, sem pedir que a pessoa faça nada perigoso.
7. Até quando precisa estar resolvido, se houver um motivo (evento, visita).
Dê dicas curtas de segurança quando houver risco ("desligue o disjuntor", "isole a área"), sem substituir o técnico.
Normalmente bastam de 4 a 8 perguntas.

Prioridade: urgente = risco à segurança das pessoas, alagamento grande, falta de energia/água geral ou impede a operação agora;
alta = atrapalha o trabalho, desperdiça água/energia ou pode piorar em poucos dias; normal = precisa resolver mas não
atrapalha muito; baixa = melhoria ou incômodo pequeno.

O resumo (quando pronto=true):
- titulo: o problema em poucas palavras (ex.: "Vazamento na descarga do banheiro masculino") (5 a 120 caracteres);
- local: onde fica, do mais geral ao mais específico (ex.: "Galpão 2 · banheiro masculino · 2ª cabine");
- categoria: uma destas chaves exatamente: ${Object.entries(CATEGORIAS).map(([k, v]) => `${k} = ${v}`).join("; ")};
- prioridade: uma destas exatamente: ${PRIORIDADES.join(", ")};
- necessario_ate: AAAA-MM-DD, ou "" se não houver prazo;
- descricao: o problema completo para o técnico: sintoma, detalhes, o que aparece nas fotos (ou "sem foto"), desde quando,
  risco, o que já foi feito e o que se espera (4 a 10 frases).`;

const ESQUEMAS: Record<string, any> = {
  compra: {
    name: "resposta_compra", strict: true,
    schema: {
      type: "object", additionalProperties: false, required: ["resposta", "pronto", "resumo"],
      properties: {
        resposta: { type: "string" }, pronto: { type: "boolean" },
        resumo: {
          type: "object", additionalProperties: false,
          required: ["descricao_item", "quantidade", "unidade", "data_necessidade", "pedido", "motivo", "justificativa", "alternativas", "produto_url", "observacao"],
          properties: {
            descricao_item: { type: "string" }, quantidade: { type: "number" }, unidade: { type: "string" },
            data_necessidade: { type: "string" }, pedido: { type: "string" }, motivo: { type: "string" },
            justificativa: { type: "string" }, alternativas: { type: "string" },
            produto_url: { type: "string" }, observacao: { type: "string" },
          },
        },
      },
    },
  },
  manutencao: {
    name: "resposta_manutencao", strict: true,
    schema: {
      type: "object", additionalProperties: false, required: ["resposta", "pronto", "resumo"],
      properties: {
        resposta: { type: "string" }, pronto: { type: "boolean" },
        resumo: {
          type: "object", additionalProperties: false,
          required: ["titulo", "local", "categoria", "prioridade", "necessario_ate", "descricao"],
          properties: {
            titulo: { type: "string" }, local: { type: "string" }, categoria: { type: "string" },
            prioridade: { type: "string" }, necessario_ate: { type: "string" }, descricao: { type: "string" },
          },
        },
      },
    },
  },
};

const corta = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const dataOk = (v: unknown) => {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return s >= hoje ? s : "";
};

function validarCompra(r: any) {
  const q = Number(r?.quantidade);
  const link = corta(r?.produto_url, 600);
  const resumo = {
    descricao_item: corta(r?.descricao_item, 300), quantidade: Number.isFinite(q) && q > 0 ? Math.round(q * 100) / 100 : 0,
    unidade: corta(r?.unidade, 20) || "un", data_necessidade: dataOk(r?.data_necessidade), pedido: corta(r?.pedido, 200),
    motivo: corta(r?.motivo, 1500), justificativa: corta(r?.justificativa, 2000), alternativas: corta(r?.alternativas, 1500), produto_url: /^https?:\/\//i.test(link) ? link : "", observacao: corta(r?.observacao, 1500),
  };
  const completo = resumo.descricao_item.length >= 3 && resumo.quantidade > 0 && resumo.motivo.length >= 5 && resumo.justificativa.length >= 10;
  return completo ? resumo : null;
}
function localVago(local: string) {
  const t = String(local || "").toLowerCase();
  return /[\[\]{}<>]|nome do setor|seu setor|setor do\b|setor da\b|informar|não informad|nao informad|indefinid|a definir|desconhecid|qual setor|\?|meu setor|nosso setor|no setor\b|^setor\b(?!\s+[a-zà-ú0-9])/i.test(t) || t.replace(/[^a-zà-ú0-9]/gi, "").length < 4;
}
function validarManutencao(r: any) {
  const resumo = {
    titulo: corta(r?.titulo, 200), local: corta(r?.local, 200),
    categoria: CATEGORIAS[String(r?.categoria)] ? String(r.categoria) : "outros",
    prioridade: PRIORIDADES.includes(String(r?.prioridade)) ? String(r.prioridade) : "normal",
    necessario_ate: dataOk(r?.necessario_ate), descricao: corta(r?.descricao, 5000),
  };
  const completo = resumo.titulo.length >= 3 && resumo.local.length >= 2 && resumo.descricao.length >= 5;
  return completo ? resumo : null;
}

async function conversar(nome: string, body: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "A assistente está indisponível agora." }, 500);
  const tipo = body?.tipo === "manutencao" ? "manutencao" : body?.tipo === "compra" ? "compra" : "";
  if (!tipo) return json({ erro: "Tipo de solicitação inválido." }, 400);
  const lista = Array.isArray(body?.mensagens) ? body.mensagens : [];
  if (!lista.length) return json({ erro: "Conte o que você precisa para começar." }, 400);
  if (lista.length > 60) return json({ erro: "A conversa ficou longa demais. Envie o resumo ou comece de novo." }, 400);
  // Fotos: só do bucket de evidências da própria empresa, e no máximo as 6 mais recentes (as outras viram só texto).
  const prefixo = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/solicitacoes-evidencias/${body.empresa_id}/`;
  let restantes = 6;
  const mensagens = lista.slice().reverse().map((m: any) => {
    const texto = String(m?.texto || "").slice(0, 4000);
    if (m?.papel === "ia") return { role: "assistant", content: texto };
    const fotos = (Array.isArray(m?.fotos) ? m.fotos : []).map(String).filter((u: string) => u.startsWith(prefixo));
    if (!fotos.length) return { role: "user", content: texto };
    const usar = fotos.slice(0, Math.max(0, restantes)); restantes -= usar.length;
    const legenda = (texto.trim() || "(foto)") + (usar.length < fotos.length ? ` [+${fotos.length - usar.length} foto(s) sem análise]` : "");
    return { role: "user", content: [{ type: "text", text: legenda }, ...usar.map((u: string) => ({ type: "image_url", image_url: { url: u, detail: "low" } }))] };
  }).reverse().filter((m: any) => typeof m.content !== "string" || m.content.trim());
  const sistema = tipo === "compra" ? SISTEMA_COMPRA(nome) : SISTEMA_MANUTENCAO(nome);
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.3, response_format: { type: "json_schema", json_schema: ESQUEMAS[tipo] }, messages: [{ role: "system", content: sistema }, ...mensagens] }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.warn("openai:", d?.error?.message); return json({ erro: "A assistente não conseguiu responder agora. Tente de novo." }, 502); }
  let saida: any;
  try { saida = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { saida = {}; }
  let resumo = saida?.pronto ? (tipo === "compra" ? validarCompra(saida.resumo) : validarManutencao(saida.resumo)) : null;
  let resposta = corta(saida?.resposta, 2000) || "Pode me contar um pouco mais?";
  // Manutenção sem o setor/sala: não fecha; pergunta o local (a IA às vezes resumia com "Setor (informar qual)").
  if (resumo && tipo === "manutencao" && localVago(resumo.local)) {
    resumo = null;
    resposta = "Antes de registrar, preciso saber o lugar certinho: em qual setor ou sala fica isso? Se não souber o nome, me diz como chegar lá.";
  }
  return json({ resposta, pronto: Boolean(resumo), resumo });
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
    form.append("prompt", "Funcionário da Chiavari pedindo uma compra ou uma manutenção: galpão, banheiro, disjuntor, vazamento, parafuso, tinta, fita, pedido, evento, montagem.");
    form.append("response_format", "json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `Falha na transcrição (${r.status})`);
    return String(d?.text || "").trim();
  };
  let texto = "";
  try { texto = await tentar(Deno.env.get("SOLICITACAO_ASSISTENTE_TRANSCRICAO") || "gpt-4o-transcribe"); }
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
