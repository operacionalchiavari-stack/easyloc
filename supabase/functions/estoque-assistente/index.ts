// Cora · assistente do estoque (18/11/2026; nome trocado de "Vera" em 19/11), na Gestão do acervo. Especialista em
// garantir que todo material esteja pronto e em condições no dia de cada evento. Lê, COM O LOGIN DE QUEM PERGUNTA
// (mesmas permissões da tela), as próximas saídas, as divergências de contagem, os problemas da separação, as peças
// danificadas/ordens de serviço e o inventário, e responde com análise e soluções. Não grava nada.
// Toda resposta traz os itens comentados COM FOTO (pedido do usuário: "sempre fotos dos itens, nunca só texto"): cada
// item dos dados ganha um apelido curto (c1, c2…) que a IA cita; o servidor troca pelo item de verdade (nome, código,
// foto). Se a IA não citar nenhum, entram os itens mais críticos das próximas saídas.
// Ações: conversar {empresa_id, dias?, mensagens:[{papel:'pessoa'|'ia', texto}]} → {resposta, itens[]}
//        relatorio {empresa_id, dias?, pedido} → {relatorio:{titulo, resumo, destaques[], secoes[{titulo,texto,itens[]}], o_que_fazer[]}}
import { comUsoIA } from "../_shared/ia-uso.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("ESTOQUE_ASSISTENTE_MODEL") || "gpt-4.1";
const NOME = Deno.env.get("ESTOQUE_ASSISTENTE_NOME") || "Cora";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const n = (v: unknown) => Number(v) || 0;
const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

async function autenticar(req: Request, empresaId: string) {
  if (!empresaId) return { erro: "Empresa ausente", status: 400 } as const;
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { erro: "Entre no sistema para conversar.", status: 401 } as const;
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const usuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return { erro: "Sessão inválida", status: 401 } as const;
  if (await segundaEtapaPendente(auth)) return { erro: MENSAGEM_2FA, status: 403 } as const;
  const { data: ctx, error } = await usuario.rpc("funcionario_contexto", { p_empresa_id: empresaId });
  if (error || !ctx?.ativo) return { erro: "Seu acesso não está ativo nesta empresa.", status: 403 } as const;
  return { usuario, nome: String(ctx?.nome || user.email || "").trim() } as const;
}

// registro dos itens citáveis: apelido curto → item de verdade
type ItemReg = { ref: string; id: string; nome: string; codigo?: string; foto?: string; categoria?: string };
class Registro {
  porId = new Map<string, ItemReg>(); porRef = new Map<string, ItemReg>();
  ref(id: string, nome: string, codigo?: string, foto?: string, categoria?: string) {
    if (!id) return undefined;
    let r = this.porId.get(id);
    if (!r) { r = { ref: "c" + (this.porId.size + 1), id, nome: nome || "Item", codigo, foto, categoria }; this.porId.set(id, r); this.porRef.set(r.ref, r); }
    else { if (!r.foto && foto) r.foto = foto; if (!r.codigo && codigo) r.codigo = codigo; }
    return r.ref;
  }
}

// Próximas saídas resumidas: por item, cada dia com saída e o que sobra livre naquele dia.
function resumirSaidas(lista: any[], reg: Registro) {
  const itens: any[] = [];
  let pecas = 0; const eventos = new Set<string>();
  for (const i of lista || []) {
    const dias = new Map<string, any[]>();
    for (const p of i.pedidos || []) { const k = String(p.data || "").slice(0, 10); if (!k) continue; if (!dias.has(k)) dias.set(k, []); dias.get(k)!.push(p); eventos.add(String(p.numero)); pecas += n(p.quantidade); }
    const saidas = [...dias].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, peds]) => {
      const d = i.livre_dia?.[dia] || {};
      const total = n(d.total ?? i.total), manut = n(d.manutencao), bloq = n(d.bloqueado), res = n(d.reservado);
      const livre = i.contagem_pendente ? 0 : total - manut - bloq - res;
      return { dia, sai: peds.reduce((t: number, p: any) => t + n(p.quantidade), 0), pedidos: peds.map((p: any) => `${p.numero}${p.pre_reserva ? " (pré-reserva)" : ""} ${p.cliente || ""} ×${n(p.quantidade)}`), estoque: total, manutencao: manut, fora_galpao: bloq, reservado_no_dia: res, livre };
    });
    const pior = saidas.reduce((m, x) => Math.min(m, x.livre), Infinity);
    const capa = i.capa ? (i.capa.usa ? { tipo: i.capa.tipo, precisa: n(i.capa.precisa), tem: n(i.capa.disponivel), contada: !!i.capa.conferido } : "não usa") : "sem material de proteção cadastrado";
    const ref = reg.ref(i.item_id, i.nome, i.codigo, i.foto_url, i.categoria);
    itens.push({ ref, item: i.nome, codigo: i.codigo, categoria: i.categoria, contagem_pendente: !!i.contagem_pendente, pior_livre: isFinite(pior) ? pior : null, protecao: capa, saidas });
  }
  itens.sort((a, b) => (a.pior_livre ?? 99) - (b.pior_livre ?? 99));
  return { itens_saindo: itens.length, eventos: eventos.size, pecas, itens };
}

async function contexto(usuario: any, empresa: string, dias: number) {
  const reg = new Registro();
  const chamar = async (nome: string, args: Record<string, unknown>) => {
    const { data, error } = await usuario.rpc(nome, args);
    if (error) return { erro: error.message };
    return data;
  };
  const [saidas, divergencias, ocorrencias, painel] = await Promise.all([
    chamar("acervo_proximas_saidas", { p_empresa: empresa, p_dias: dias }),
    chamar("acervo_divergencias", { p_empresa: empresa }),
    chamar("separacao_ocorrencias_listar", { p_empresa: empresa, p_pedido: null }),
    chamar("acervo_painel", { p_empresa: empresa }),
  ]);
  const ctx: any = { hoje: hojeISO(), periodo_dias: dias };
  ctx.proximas_saidas = Array.isArray(saidas) ? resumirSaidas(saidas, reg) : saidas;
  ctx.divergencias = divergencias?.erro ? divergencias : {
    bloqueia_item_ate_contar: !!divergencias?.bloqueia,
    contagens_pendentes: (divergencias?.contagens || []).filter((c: any) => c.status === "pendente").map((c: any) => ({ ref: reg.ref(c.item_id, c.item?.nome, c.item?.codigo, c.item?.foto), item: c.item?.nome, codigo: c.item?.codigo, esperado: c.esperado, contado: c.contado })),
    em_aberto: (divergencias?.divergencias || []).filter((d: any) => !d.resolvida_em).slice(0, 60).map((d: any) => ({ ref: reg.ref(d.item_id, d.item?.nome || d.item_nome, d.item?.codigo, d.item?.foto), item: d.item?.nome || d.item_nome, pedido: d.pedido_numero, tipo: d.tipo, etapa: d.etapa, esperado: d.esperado, conferido: d.conferido })),
  };
  ctx.problemas_separacao = Array.isArray(ocorrencias) ? ocorrencias.filter((o: any) => o.estado !== "resolvida").slice(0, 60).map((o: any) => ({ ref: reg.ref(o.item_id, o.item_nome, o.item_codigo, o.item_foto), pedido: o.pedido_numero, cliente: o.cliente, item: o.item_nome, quantidade: o.quantidade, problema: o.motivo_nome, observacao: o.observacao, com: o.estado, entrega: o.pedido_hora_entrega, desde: String(o.criado_em || "").slice(0, 10) })) : ocorrencias;
  if (painel && !painel.erro) {
    const ret = (painel.retornos || []).filter((r: any) => !["liberado", "baixado"].includes(r.estado));
    ctx.pecas_fora_de_uso = ret.slice(0, 120).map((r: any) => ({ ref: reg.ref(r.item_id, r.item_nome || r.nome, r.codigo, r.foto_url), item: r.item_nome || r.nome, quantidade: r.quantidade, situacao: r.estado, origem: r.origem, pedido: r.numero_pedido || r.pedido_numero, cliente: r.cliente_nome, desde: String(r.criado_em || "").slice(0, 10), os: r.os_numero ? { numero: r.os_numero, setor: r.os_setor || r.setor, prazo: r.os_prazo || r.prazo } : null }));
    ctx.inventarios = (painel.inventarios || []).slice(0, 5).map((i: any) => ({ nome: i.nome || i.tipo, status: i.status, criado: String(i.criado_em || "").slice(0, 10), contados: i.contados, total: i.total }));
  } else ctx.pecas_fora_de_uso = painel;
  let texto = JSON.stringify(ctx);
  if (texto.length > 120000 && ctx.proximas_saidas?.itens) { ctx.proximas_saidas.itens = ctx.proximas_saidas.itens.slice(0, 120); ctx.proximas_saidas.cortado = true; texto = JSON.stringify(ctx); }
  if (texto.length > 120000) texto = texto.slice(0, 120000);
  // fotos que faltaram (contagens, ocorrências): uma consulta só no cadastro do item
  const semFoto = [...reg.porId.values()].filter((r) => !r.foto).map((r) => r.id);
  if (semFoto.length) {
    const { data } = await usuario.from("itens").select("id,foto_url,codigo,categoria").in("id", semFoto.slice(0, 300));
    for (const i of data || []) { const r = reg.porId.get(i.id); if (r) { r.foto = r.foto || i.foto_url; r.codigo = r.codigo || i.codigo; r.categoria = r.categoria || i.categoria; } }
  }
  // componente não tem foto no catálogo: usa a foto do kit de que ele faz parte
  const aindaSem = [...reg.porId.values()].filter((r) => !r.foto).map((r) => r.id);
  if (aindaSem.length) {
    const { data: ki } = await usuario.from("kit_itens").select("item_id,kit_id").in("item_id", aindaSem.slice(0, 300));
    const kits = [...new Set((ki || []).map((k: any) => k.kit_id))];
    if (kits.length) {
      const { data: kf } = await usuario.from("itens").select("id,foto_url,descricao_total,produto").in("id", kits.slice(0, 300)).not("foto_url", "is", null);
      const fotoKit = new Map((kf || []).map((k: any) => [k.id, k]));
      for (const k of ki || []) {
        const r = reg.porId.get(k.item_id), kit: any = fotoKit.get(k.kit_id);
        if (r && !r.foto && kit?.foto_url) { r.foto = kit.foto_url; (r as any).foto_kit = String(kit.produto || kit.descricao_total || "kit").split(" (L)")[0]; }
      }
    }
  }
  return { texto, reg, ctx };
}

const SISTEMA = (nome: string, dados: string) => `Você é ${NOME}, a especialista em estoque da Chiavari (locação de móveis para eventos). Sua responsabilidade é
garantir que TODO o material esteja pronto e em condições no momento de cada evento: quantidade suficiente, peças fora de
manutenção, contagens resolvidas, proteção (capas/caixas) suficiente e nada esquecido.
Quem pergunta: ${nome || "alguém da equipe do estoque"}.

Como responder (português do Brasil, direto e prático, como uma gerente de estoque experiente):
- Comece pela conclusão. Depois os fatos que a sustentam (item, pedido, dia, quantidade). Termine com "O que eu faria" em passos.
- Use listas curtas e **negrito** só no essencial. Datas em dd/mm. Nunca invente número: use só os DADOS abaixo.
- Se algo não estiver nos dados, diga que não tem a informação.
- "livre" é o que sobra no dia depois de estoque − manutenção − fora do galpão − reservado; livre < 0 = faltam peças; 0 = nenhum pedido novo cabe.
- Soluções que você pode sugerir: antecipar manutenção/limpeza das peças necessárias, cobrar o retorno de peças fora do galpão,
  resolver a contagem pendente antes da data, trocar por item equivalente, sublocar, renegociar quantidade/data com o Comercial,
  fabricar/comprar capas, priorizar a triagem dos pedidos mais próximos.
- Pré-reserva ainda pode cair: separe o que é risco com pedidos reservados do que depende de pré-reserva.
- ITENS COM FOTO: toda resposta mostra os itens de que você fala em cartões com foto. Cada item dos dados tem um "ref"
  (c1, c2…). Cite SEMPRE de 1 a 8 itens relevantes pelo ref, cada um com um comentário curto (1 frase) do porquê ele importa
  (ex.: "faltam 4 no sábado 22/11", "nenhuma sobra livre em 21/11", "3 em reparo na Forração, precisam voltar até 20/11"). Escreva como gente, nunca "livre=0" nem nomes de campo. Nunca invente ref.

DADOS DO ESTOQUE (hoje ${hojeISO()}):
${dados}`;

const FORMATO_CHAT = `Responda SOMENTE em JSON: {"resposta": "texto em markdown simples", "itens": [{"ref": "c3", "comentario": "frase curta", "situacao": "falta|atencao|ok"}]}`;
const FORMATO_REL = `Monte um RELATÓRIO para imprimir. Responda SOMENTE em JSON:
{"titulo": "título curto", "resumo": "3 a 5 frases com a conclusão", "destaques": [{"rotulo": "Itens em risco", "valor": "5"}],
 "secoes": [{"titulo": "título da seção", "texto": "1 a 3 frases", "itens": [{"ref": "c3", "comentario": "2 frases sobre o item: o que acontece e o que fazer", "situacao": "falta|atencao|ok"}]}],
 "o_que_fazer": ["passo 1", "passo 2"]}
Use de 2 a 4 destaques, de 2 a 5 seções, e em cada seção de 2 a 8 itens pelo ref (todo item do relatório aparece com foto).`;

async function chamarIA(sistema: string, mensagens: any[]) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { erro: "A assistente está indisponível agora.", status: 500 };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "system", content: sistema }, ...mensagens] }),
    signal: AbortSignal.timeout(150000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.warn("openai:", d?.error?.message);
    const semCredito = /quota|billing|insufficient/i.test(String(d?.error?.message || d?.error?.code || ""));
    return { erro: semCredito ? "A IA está sem créditos no momento. Avise o administrador." : "A assistente não conseguiu responder agora. Tente de novo.", status: 502 };
  }
  try { return { dados: JSON.parse(String(d?.choices?.[0]?.message?.content || "{}")) }; } catch { return { dados: {} }; }
}

// troca os apelidos pelos itens de verdade; sem nenhum, entram os mais críticos das próximas saídas
function resolverItens(lista: any[], reg: Registro, ctx: any, minimo = 3) {
  const out: any[] = [], vistos = new Set<string>();
  for (const x of Array.isArray(lista) ? lista : []) {
    const r = reg.porRef.get(String(x?.ref || "").trim().toLowerCase());
    if (!r || vistos.has(r.id)) continue;
    vistos.add(r.id);
    out.push({ id: r.id, nome: r.nome, codigo: r.codigo || "", categoria: r.categoria || "", foto: r.foto || "", foto_kit: (r as any).foto_kit || "", comentario: String(x?.comentario || "").slice(0, 400), situacao: ["falta", "atencao", "ok"].includes(x?.situacao) ? x.situacao : "atencao" });
    if (out.length >= 12) break;
  }
  if (out.length < Math.min(minimo, 1) || !out.length) {
    for (const i of (ctx?.proximas_saidas?.itens || []).slice(0, minimo)) {
      const r = reg.porRef.get(i.ref); if (!r || vistos.has(r.id)) continue;
      const pior = i.saidas?.reduce((a: any, b: any) => (b.livre < a.livre ? b : a), i.saidas[0]);
      out.push({ id: r.id, nome: r.nome, codigo: r.codigo || "", categoria: r.categoria || "", foto: r.foto || "",
        comentario: pior ? `Pior dia ${pior.dia.slice(8, 10)}/${pior.dia.slice(5, 7)}: saem ${pior.sai}, ${pior.livre < 0 ? "faltam " + (-pior.livre) : "sobram " + pior.livre + " livres"}.` : "Item com saída próxima.",
        situacao: pior && pior.livre < 0 ? "falta" : pior && pior.livre <= 2 ? "atencao" : "ok" });
    }
  }
  return out;
}

async function conversar(quem: any, body: any) {
  const lista = Array.isArray(body?.mensagens) ? body.mensagens.slice(-30) : [];
  if (!lista.length) return json({ erro: "Escreva a pergunta." }, 400);
  const dias = Math.min(365, Math.max(7, n(body?.dias) || 90));
  const { texto, reg, ctx } = await contexto(quem.usuario, String(body.empresa_id), dias);
  const mensagens = lista.map((m: any) => ({ role: m?.papel === "ia" ? "assistant" : "user", content: String(m?.texto || "").slice(0, 6000) })).filter((m: any) => m.content.trim());
  const r: any = await chamarIA(SISTEMA(quem.nome, texto) + "\n\n" + FORMATO_CHAT, mensagens);
  if (r.erro) return json({ erro: r.erro }, r.status);
  const resposta = String(r.dados?.resposta || "").trim() || "Não consegui montar a resposta. Pode perguntar de outro jeito?";
  return json({ resposta, itens: resolverItens(r.dados?.itens, reg, ctx, 3) });
}

async function relatorio(quem: any, body: any) {
  const pedido = String(body?.pedido || "").trim();
  if (!pedido) return json({ erro: "Escolha o relatório." }, 400);
  const dias = Math.min(365, Math.max(7, n(body?.dias) || 90));
  const { texto, reg, ctx } = await contexto(quem.usuario, String(body.empresa_id), dias);
  const r: any = await chamarIA(SISTEMA(quem.nome, texto) + "\n\n" + FORMATO_REL, [{ role: "user", content: pedido }]);
  if (r.erro) return json({ erro: r.erro }, r.status);
  const d = r.dados || {};
  const secoes = (Array.isArray(d.secoes) ? d.secoes : []).slice(0, 6).map((s: any) => ({ titulo: String(s?.titulo || "").slice(0, 120), texto: String(s?.texto || "").slice(0, 800), itens: resolverItens(s?.itens, reg, ctx, 0) }));
  if (!secoes.some((s: any) => s.itens.length)) secoes.push({ titulo: "Itens que pedem atenção", texto: "Os itens com menos folga nos próximos eventos.", itens: resolverItens([], reg, ctx, 6) });
  return json({ relatorio: {
    titulo: String(d.titulo || "Relatório do estoque").slice(0, 120), resumo: String(d.resumo || "").slice(0, 1500),
    destaques: (Array.isArray(d.destaques) ? d.destaques : []).slice(0, 4).map((x: any) => ({ rotulo: String(x?.rotulo || "").slice(0, 40), valor: String(x?.valor ?? "").slice(0, 20) })),
    secoes, o_que_fazer: (Array.isArray(d.o_que_fazer) ? d.o_que_fazer : []).slice(0, 8).map((x: any) => String(x).slice(0, 300)),
    periodo_dias: dias, gerado_em: new Date().toISOString(), por: quem.nome,
  } });
}

Deno.serve(comUsoIA("miguel", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ erro: "Pedido inválido" }, 400); }
  const quem = await autenticar(req, String(body?.empresa_id || ""));
  if ("erro" in quem) return json({ erro: quem.erro }, quem.status);
  try {
    if (body?.acao === "conversar") return await conversar(quem, body);
    if (body?.acao === "relatorio") return await relatorio(quem, body);
    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Algo deu errado. Tente de novo." }, 500);
  }
}));
