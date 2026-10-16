// Assistente comercial do catálogo (out/2026).
//
// Uma "representante comercial" dentro do catálogo: conversa humanizada com o decorador (ou a equipe testando), consulta
// o acervo e a disponibilidade, acrescenta/tira itens do projeto, sugere combinações, manda imagens de composições
// montadas a partir dos FORMATOS cadastrados no 3D Livre e aprende o gosto de cada decorador (perfil guardado no banco).
//
// O servidor NÃO mexe no projeto nem renderiza nada: devolve "ações" que o catálogo executa no navegador (o projeto é
// salvo pelo autosave de sempre e a imagem sai do mesmo motor 3D + studio-ai-engine do botão "Renderizar com IA"). Assim
// não existe um segundo caminho de gravação brigando com o autosave, e a imagem é exatamente a do catálogo.
//
// Ações (body.action):
//   historico        → últimas mensagens + perfil
//   conversar        → { mensagem, projeto, modo } → { resposta, acoes, itens }
//   salvar_imagem    → { imagem (data URL), cena (snapshot), legenda, itens } → grava a imagem pronta na conversa
//   limpar           → apaga a conversa (o perfil fica)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const NOME_ASSISTENTE = Deno.env.get("CATALOGO_ASSISTENTE_NOME") || "Helena";
const MODELO = Deno.env.get("CATALOGO_ASSISTENTE_MODEL") || "gpt-4.1";
const BUCKET = "catalogo-assistente";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Ctx = {
  empresaId: string;
  dono: string;
  clienteId: string | null;
  usuarioId: string | null;
  nome: string;
  token: string | null;
  service: SupabaseClient;
  // RPCs que dependem de quem chama (projeto_ctx): com token (decorador) ou com o JWT da equipe.
  rpc: (nome: string, params: Record<string, unknown>) => Promise<any>;
};

async function autenticar(req: Request, body: any): Promise<Ctx | { erro: string; status: number }> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const empresaId = String(body?.empresa_id || "");
  if (!empresaId) return { erro: "Empresa ausente", status: 400 };
  const token = body?.catalog_token ? String(body.catalog_token) : null;

  if (token) {
    const { data, error } = await service.rpc("catalogo_validar_sessao", { p_token: token });
    if (error || !data?.valido || String(data.empresa_id) !== empresaId) return { erro: "Sua sessão do catálogo expirou. Entre novamente.", status: 401 };
    const clienteId = String(data.cliente_id);
    const { data: cli } = await service.from("clientes_empresas").select("nome_razao").eq("id", clienteId).maybeSingle();
    return {
      empresaId, dono: `cliente:${clienteId}`, clienteId, usuarioId: null, nome: cli?.nome_razao || "", token, service,
      rpc: async (nome, params) => {
        const { data, error } = await service.rpc(nome, { p_token: token, ...params });
        if (error) throw new Error(error.message);
        return data;
      },
    };
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { erro: "Entre no catálogo para conversar com a assistente.", status: 401 };
  const usuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return { erro: "Sessão inválida", status: 401 };
  const { data: vinculo } = await service.from("usuarios_empresas").select("empresa_id").eq("user_id", user.id).eq("empresa_id", empresaId).maybeSingle();
  if (!vinculo) return { erro: "Usuário sem acesso a esta empresa", status: 403 };
  const { data: perfilUsuario } = await service.from("usuarios").select("nome").eq("id", user.id).maybeSingle();
  return {
    empresaId, dono: `usuario:${user.id}`, clienteId: null, usuarioId: user.id,
    nome: perfilUsuario?.nome || user.user_metadata?.nome || user.email || "", token: null, service,
    rpc: async (nome, params) => {
      const { data, error } = await usuario.rpc(nome, { p_empresa_id: empresaId, ...params });
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Acervo
const normalizar = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Mesmo slugify do catalogo.mjs (as peças dos formatos guardam categoria/subcategoria assim).
const slugify = (v: unknown) => String(v || "sem-categoria").trim().toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sem-categoria";
const cm = (v: unknown) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);

type Item = {
  // ref = apelido curto ("m12") que o MODELO vê e devolve; UUIDs longos ele erra uma letra de vez em quando.
  ref: string; id: string; nome: string; categoria: string; subcategoria: string; cat: string; subcat: string;
  material: string; cor: string; estilo: string; familia: string; medidas: string; valor: number | null;
  tem3d: boolean; foto: string; personalizavel: boolean; busca: string;
};

function mapearItem(row: any): Item {
  const nome = row.produto_base ? `${row.produto_base} ${row.produto || ""}`.trim() : (row.produto || "Item");
  const dims = [row.largura, row.altura, row.profundidade].map(cm);
  const medidas = dims.every((d) => d === null) ? "" : `(L) ${dims[0] ?? "–"} × (A) ${dims[1] ?? "–"} × (P) ${dims[2] ?? "–"} cm`;
  const modelos = Array.isArray(row.itens_modelos_3d) ? row.itens_modelos_3d : [];
  const item: Item = {
    ref: "", id: String(row.id), nome, categoria: row.categoria || "", subcategoria: row.subcategoria || "",
    cat: slugify(row.categoria), subcat: row.subcategoria ? slugify(row.subcategoria) : "",
    material: row.material || "", cor: row.cor || "", estilo: row.estilo || "", familia: row.familia || "",
    medidas, valor: row.valor_locacao === null || row.valor_locacao === undefined ? null : Number(row.valor_locacao),
    tem3d: modelos.some((m: any) => m?.url && m.status !== "removido"), foto: row.foto_url || "",
    personalizavel: Boolean(row.personalizable), busca: "",
  };
  item.busca = normalizar([item.nome, item.categoria, item.subcategoria, item.material, item.cor, item.estilo, item.familia, row.descricao_complementar, row.referencia].join(" "));
  return item;
}

async function carregarAcervo(ctx: Ctx): Promise<Item[]> {
  const { data, error } = await ctx.service.rpc("catalogo_acervo", { p_empresa_id: ctx.empresaId });
  if (error) throw new Error("Não foi possível ler o catálogo: " + error.message);
  return (Array.isArray(data) ? data : []).map((row: any, n: number) => ({ ...mapearItem(row), ref: `m${n + 1}` }));
}

// Acha um item pelo apelido ("m12") ou pelo UUID.
const acharItem = (acervo: Item[], x: unknown) => { const k = String(x ?? "").trim(); return acervo.find((i) => i.ref === k || i.id === k); };

// Peças que a pessoa citou pelo nome: nome completo ("sofá becca") ou modelo + tipo ("poltrona ... águines campo").
// Uma por nome (variantes de cor contam uma vez); até 12.
function pecasCitadas(mensagem: string, acervo: Item[]) {
  const texto = " " + normalizar(mensagem).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
  const achadas = new Map<string, Item>();
  for (const i of acervo) {
    const nome = normalizar(i.nome).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+(p|m|g|gg)$/, "").trim();
    const [tipo, ...resto] = nome.split(" ");
    const modelo = resto.join(" ");
    const casa = texto.includes(` ${nome} `) || (modelo.length >= 4 && texto.includes(` ${modelo} `) && texto.includes(` ${tipo}`));
    if (casa && !achadas.has(nome)) achadas.set(nome, i);
    if (achadas.size >= 12) break;
  }
  return [...achadas.values()];
}

const resumoItem = (i: Item) => ({
  id: i.ref, nome: i.nome, categoria: i.categoria, subcategoria: i.subcategoria || undefined,
  material: i.material || undefined, cor: i.cor || undefined, estilo: i.estilo || undefined,
  medidas: i.medidas || undefined,
  valor_locacao: i.valor === null ? "sob consulta" : i.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  tem_modelo_3d: i.tem3d, personalizavel_tecido: i.personalizavel || undefined,
});

function buscarItens(acervo: Item[], a: any, disp?: Map<string, { total: number; livre: number }> | null) {
  const termos = normalizar(a?.texto).split(/\s+/).filter((t) => t.length > 1);
  const cat = normalizar(a?.categoria), sub = normalizar(a?.subcategoria);
  const mat = normalizar(a?.material), cor = normalizar(a?.cor), est = normalizar(a?.estilo);
  let lista = acervo.filter((i) =>
    (!cat || normalizar(i.categoria).includes(cat)) && (!sub || normalizar(i.subcategoria).includes(sub)) &&
    (!mat || normalizar(i.material).includes(mat)) && (!cor || normalizar(i.cor).includes(cor)) &&
    (!est || normalizar(i.estilo).includes(est)) && (!a?.somente_com_3d || i.tem3d));
  if (termos.length) {
    lista = lista.map((i) => ({ i, s: termos.reduce((s, t) => s + (i.busca.includes(t) ? (normalizar(i.nome).includes(t) ? 3 : 1) : 0), 0) }))
      .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).map((x) => x.i);
  }
  if (disp) lista = lista.filter((i) => { const d = disp.get(i.id); return !d || !d.total || d.livre > 0; });
  // Uma linha por PEÇA (nome sem tamanho), com as cores/variações juntas — sem isso, 12 resultados viravam 12 variações
  // do mesmo sofá modular e ela concluía que "só tem esse".
  const grupos = new Map<string, Item[]>();
  for (const i of lista) {
    const chave = normalizar(i.nome).replace(/\s+(p|m|g|gg)$/, "").replace(/\s*-?\s*\d+\s*modulos?.*$/, "").trim();
    grupos.set(chave, [...(grupos.get(chave) || []), i]);
  }
  const limite = Math.min(Math.max(Number(a?.limite) || 20, 1), 30);
  const livres = (i: Item) => { const d = disp?.get(i.id); return d ? (d.total ? d.livre : "estoque não cadastrado") : undefined; };
  return { pecas_diferentes_encontradas: grupos.size, ...(disp ? { filtrado_por_data: a.disponivel_em } : {}),
    itens: [...grupos.values()].slice(0, limite).map((g) => ({
      ...resumoItem(g[0]), ...(disp ? { livres_na_data: livres(g[0]) } : {}),
      ...(g.length > 1 ? { variacoes: g.slice(0, 8).map((v) => ({ id: v.ref, nome: v.nome, cor: v.cor || undefined, ...(disp ? { livres_na_data: livres(v) } : {}) })), total_variacoes: g.length } : {}),
    })) };
}

function listarCategorias(acervo: Item[]) {
  const mapa = new Map<string, { categoria: string; itens: number; subcategorias: Map<string, number> }>();
  for (const i of acervo) {
    const c = mapa.get(i.categoria) || { categoria: i.categoria, itens: 0, subcategorias: new Map() };
    c.itens++;
    if (i.subcategoria) c.subcategorias.set(i.subcategoria, (c.subcategorias.get(i.subcategoria) || 0) + 1);
    mapa.set(i.categoria, c);
  }
  const materiais = new Map<string, number>();
  acervo.forEach((i) => i.material && materiais.set(i.material, (materiais.get(i.material) || 0) + 1));
  return {
    categorias: [...mapa.values()].map((c) => ({ categoria: c.categoria, itens: c.itens, subcategorias: Object.fromEntries(c.subcategorias) })),
    materiais_mais_comuns: [...materiais.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([m]) => m),
    estilos_cadastrados: [...new Set(acervo.map((i) => i.estilo).filter(Boolean))],
  };
}

// Combinações: mesmo estilo (quando cadastrado), mesmo material/cor/família, em categorias DIFERENTES da do item base
// (um sofá combina com poltronas, mesas de centro, aparadores — não com outro sofá).
function sugerirCombinacoes(acervo: Item[], a: any, perfil: any) {
  const base = acharItem(acervo, a?.item_id);
  if (!base) return { erro: "Item não encontrado." };
  const gosto = normalizar([...(perfil?.materiais || []), ...(perfil?.cores || []), ...(perfil?.estilos || []), ...(perfil?.tons || [])].join(" "));
  // Categoria complementar já vale 1 ponto (um sofá combina com poltrona e mesa de centro mesmo sem material igual);
  // estilo, família, material, cor e o gosto da pessoa ordenam.
  const pontos = (i: Item) => {
    let s = 1;
    if (base.estilo && i.estilo && normalizar(i.estilo) === normalizar(base.estilo)) s += 5;
    if (base.familia && i.familia && normalizar(i.familia) === normalizar(base.familia)) s += 4;
    if (base.material && i.material && normalizar(i.material) === normalizar(base.material)) s += 2;
    if (base.cor && i.cor && normalizar(i.cor) === normalizar(base.cor)) s += 2;
    if (gosto && [i.material, i.cor, i.estilo].some((v) => v && gosto.includes(normalizar(v)))) s += 1;
    if (a?.somente_com_3d && !i.tem3d) s = -1;
    return s;
  };
  const porCategoria = new Map<string, Item[]>();
  acervo.filter((i) => i.categoria !== base.categoria || (i.subcategoria && i.subcategoria !== base.subcategoria))
    .map((i) => ({ i, s: pontos(i) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s)
    .forEach(({ i }) => { const l = porCategoria.get(i.categoria) || []; if (l.length < 3) l.push(i); porCategoria.set(i.categoria, l); });
  return {
    item_base: resumoItem(base),
    criterio: base.estilo ? `estilo "${base.estilo}"` : "material, cor e família (o estilo deste item não está cadastrado)",
    sugestoes: [...porCategoria.entries()].slice(0, 6).map(([categoria, itens]) => ({ categoria, itens: itens.map(resumoItem) })),
  };
}

// Mapa item → { total, livre } numa data (mesma regra de verificarDisponibilidade, pra todos os itens de uma vez — usado
// no filtro "disponível em" da busca e na trava de adicionar_ao_pedido). total 0 = estoque não cadastrado.
async function mapaDisponibilidade(ctx: Ctx, data: string) {
  // A API devolve no máximo 1000 linhas por consulta: itens em páginas; reservas só dos pedidos perto da data (±60 dias,
  // e a cobertura exata é conferida abaixo), depois as linhas desses pedidos em lotes.
  const itens: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data: pagina } = await ctx.service.from("itens").select("id,estoque_total,estoque_manutencao").eq("empresa_id", ctx.empresaId).order("id").range(de, de + 999);
    itens.push(...(pagina || []));
    if (!pagina || pagina.length < 1000) break;
  }
  const dia = new Date(data + "T12:00:00Z");
  const janela = (d: number) => new Date(dia.getTime() + d * 86400000).toISOString().slice(0, 10);
  const { data: pedidos } = await ctx.service.from("separacoes_pedidos").select("id,data_evento,data_entrega,data_coleta,data_hora,status,status_comercial")
    .eq("empresa_id", ctx.empresaId).gte("data_evento", janela(-60)).lte("data_evento", janela(60)).range(0, 999);
  const ativos = (pedidos || []).filter((p: any) => {
    const st = normalizar(p.status), com = normalizar(p.status_comercial);
    if (st === "cancelado" || com === "cancelado" || com === "orcamento") return false;
    const ini = String(p.data_entrega || p.data_evento || p.data_hora || "").slice(0, 10);
    const fim = String(p.data_coleta || p.data_evento || p.data_hora || "").slice(0, 10);
    return ini && fim ? data >= ini && data <= fim : String(p.data_evento || "").slice(0, 10) === data;
  }).map((p: any) => p.id);
  const reservado = new Map<string, number>();
  for (let k = 0; k < ativos.length; k += 50) {
    for (let de = 0; ; de += 1000) {
      const { data: linhas } = await ctx.service.from("separacoes_itens").select("item_id,quantidade_solicitada").in("separacao_pedido_id", ativos.slice(k, k + 50)).order("id").range(de, de + 999);
      for (const r of linhas || []) reservado.set(String(r.item_id), (reservado.get(String(r.item_id)) || 0) + (Number(r.quantidade_solicitada) || 0));
      if (!linhas || linhas.length < 1000) break;
    }
  }
  const mapa = new Map<string, { total: number; livre: number }>();
  for (const i of itens || []) {
    const total = Number(i.estoque_total) || 0;
    mapa.set(String(i.id), { total, livre: Math.max(0, total - (Number(i.estoque_manutencao) || 0) - (reservado.get(String(i.id)) || 0)) });
  }
  return mapa;
}

// Disponibilidade: mesma conta da tela Disponibilidade de Itens (estoque − manutenção − reservado em pedidos que não são
// orçamento/cancelados, no período do pedido). Sem estoque cadastrado, não afirma nada: "a equipe confirma".
async function verificarDisponibilidade(ctx: Ctx, acervo: Item[], a: any, dataPadrao: string | null) {
  const ids = (Array.isArray(a?.item_ids) ? a.item_ids : []).map((x: unknown) => acharItem(acervo, x)?.id).filter(Boolean).slice(0, 20) as string[];
  if (!ids.length) return { erro: "Informe ao menos um item válido." };
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(a?.data || "")) ? String(a.data) : dataPadrao;
  const [{ data: itens }, { data: patrimonios }, { data: reservas }] = await Promise.all([
    ctx.service.from("itens").select("id,estoque_total,estoque_manutencao,estoque_indisponivel").eq("empresa_id", ctx.empresaId).in("id", ids),
    ctx.service.from("itens_patrimonios").select("item_id,status").eq("empresa_id", ctx.empresaId).in("item_id", ids),
    data ? ctx.service.from("separacoes_itens").select("item_id,quantidade_solicitada,separacoes_pedidos(data_evento,data_entrega,data_coleta,data_hora,status,status_comercial)").eq("empresa_id", ctx.empresaId).in("item_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const quantidade = Number(a?.quantidade) || 1;
  return {
    data: data || "sem data definida",
    itens: ids.map((id: string) => {
      const row: any = (itens || []).find((r: any) => String(r.id) === id) || {};
      const pats = (patrimonios || []).filter((p: any) => String(p.item_id) === id);
      const total = Number(row.estoque_total) || pats.filter((p: any) => p.status !== "inativo").length;
      const nome = acervo.find((i) => i.id === id)?.nome;
      const ref = acervo.find((i) => i.id === id)?.ref;
      if (!total) return { id: ref, nome, situacao: "estoque não cadastrado no sistema — a equipe comercial confirma a disponibilidade" };
      const manut = Number(row.estoque_manutencao) || pats.filter((p: any) => p.status === "manutencao").length;
      const reservado = !data ? 0 : (reservas || []).filter((r: any) => {
        if (String(r.item_id) !== id) return false;
        const p = r.separacoes_pedidos || {};
        const st = normalizar(p.status), com = normalizar(p.status_comercial);
        if (st === "cancelado" || com === "cancelado" || com === "orcamento") return false;
        const ini = String(p.data_entrega || p.data_evento || p.data_hora || "").slice(0, 10);
        const fim = String(p.data_coleta || p.data_evento || p.data_hora || "").slice(0, 10);
        return ini && fim ? data >= ini && data <= fim : String(p.data_evento || "").slice(0, 10) === data;
      }).reduce((s: number, r: any) => s + (Number(r.quantidade_solicitada) || 0), 0);
      const livre = Math.max(0, total - manut - reservado);
      return { id: ref, nome, disponivel: livre, atende_quantidade_pedida: livre >= quantidade, situacao: livre >= quantidade ? "disponível" : livre ? "disponível em quantidade menor" : "sem unidades livres nessa data" };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Formatos (3D Livre): o formato decide ONDE cada peça fica; a assistente só escolhe QUAL móvel entra em cada posição.
const BUILTIN = {
  id: "lounge-compacto", nome: "Lounge compacto", categoria: "Lounge",
  pecas: [
    { papel: "sofa", rotulo: "Sofá", posicoes: 1, obrigatorio: true, padrao: /sof[aá]/i },
    { papel: "armchair", rotulo: "Poltrona", posicoes: 2, obrigatorio: true, padrao: /poltrona/i },
    { papel: "center", rotulo: "Mesa de centro", posicoes: 1, padrao: /mesa.*centro|centro.*mesa/i },
    { papel: "side", rotulo: "Mesa lateral/canto", posicoes: 2, padrao: /mesa.*(lateral|canto)|(lateral|canto).*mesa/i },
    { papel: "console", rotulo: "Aparador", posicoes: 1, padrao: /aparador/i },
  ],
};
const LEGADO: Record<string, RegExp> = { sofa: /sof[aá]/i, armchair: /poltrona/i, center: /mesa.*centro|centro.*mesa/i, side: /mesa.*(lateral|canto)|(lateral|canto).*mesa/i, console: /aparador/i };

type Peca = { papel: string; rotulo: string; posicoes: number; obrigatorio?: boolean; aceita: (i: Item) => boolean; descricao: string; original?: string };
type Formato = { id: string; nome: string; categoria: string; pecas: Peca[] };

function montarFormatos(registros: any[], acervo: Item[]): Formato[] {
  const rotuloCat = (cat: string, sub?: string) => {
    const achado = acervo.find((i) => i.cat === cat && (!sub || i.subcat === sub));
    return sub ? `${achado?.subcategoria || sub} (${achado?.categoria || cat})` : (achado?.categoria || cat);
  };
  const lista: Formato[] = [{
    id: BUILTIN.id, nome: BUILTIN.nome, categoria: BUILTIN.categoria,
    pecas: BUILTIN.pecas.map((p) => ({ papel: p.papel, rotulo: p.rotulo, posicoes: p.posicoes, obrigatorio: p.obrigatorio,
      aceita: (i: Item) => i.tem3d && p.padrao.test(`${i.categoria} ${i.nome}`), descricao: `${p.rotulo}${p.obrigatorio ? " (obrigatório)" : " (opcional)"}` })),
  }];
  for (const r of registros) {
    const grupos = new Map<string, any[]>();
    (Array.isArray(r.papeis) ? r.papeis : []).forEach((p: any) => { if (p?.role) grupos.set(p.role, [...(grupos.get(p.role) || []), p]); });
    const pecas: Peca[] = [];
    for (const [papel, lista2] of grupos) {
      const p = lista2[0];
      let aceita: (i: Item) => boolean, descricao: string;
      if (p.version === 2) {
        aceita = p.subcat ? (i) => i.tem3d && i.cat === p.cat && i.subcat === p.subcat : (i) => i.tem3d && i.cat === p.cat;
        descricao = rotuloCat(p.cat, p.subcat);
      } else if (papel.startsWith("sub:")) {
        const [, c, s] = papel.split(":"); aceita = (i) => i.tem3d && i.cat === c && i.subcat === s; descricao = rotuloCat(c, s);
      } else if (papel.startsWith("cat:")) {
        const c = papel.slice(4); aceita = (i) => i.tem3d && i.cat === c; descricao = rotuloCat(c);
      } else if (LEGADO[papel]) {
        const re = LEGADO[papel]; aceita = (i) => i.tem3d && re.test(`${i.categoria} ${i.nome}`); descricao = papel;
      } else continue;
      const original = p.item_id ? acervo.find((i) => i.id === String(p.item_id))?.nome : undefined;
      pecas.push({ papel, rotulo: p.label || descricao, posicoes: lista2.length, aceita, descricao, original });
    }
    if (pecas.length) lista.push({ id: `custom:${r.id}`, nome: r.nome || "Formato", categoria: r.categoria || "Outros", pecas });
  }
  return lista;
}

async function carregarFormatos(ctx: Ctx, acervo: Item[]) {
  let registros: any[] = [];
  try { registros = (await ctx.rpc("lounge_formatos_listar", {})) || []; } catch (e) { console.warn("formatos:", e); }
  return montarFormatos(Array.isArray(registros) ? registros : [], acervo);
}

// Cada posição já leva os móveis COM 3D que cabem nela (poupa buscas e evita a IA escolher peça que não serve).
const formatoParaIA = (f: Formato, acervo: Item[], disp?: Map<string, { total: number; livre: number }> | null) => ({
  formato_id: f.id, nome: f.nome, categoria: f.categoria,
  pecas: f.pecas.map((p) => {
    const opcoes = acervo.filter(p.aceita);
    return { papel: p.papel, o_que_vai_aqui: p.descricao, posicoes_no_formato: p.posicoes, obrigatorio: p.obrigatorio || undefined, movel_original: p.original,
      moveis_com_3d_que_servem: opcoes.slice(0, 10).map((i) => { const d = disp?.get(i.id); return { id: i.ref, nome: i.nome, cor: i.cor || undefined, material: i.material || undefined, ...(d && d.total ? { livres_na_data_do_evento: d.livre } : {}) }; }),
      total_que_servem: opcoes.length };
  }),
});

// ---------------------------------------------------------------------------------------------------------------
// Perfil (o que a assistente aprendeu do decorador)
const LISTAS_PERFIL = ["tons", "cores", "estilos", "materiais", "categorias_preferidas", "evita", "tipos_de_evento"];
function mesclarPerfil(atual: any, novo: any) {
  const p = { ...(atual || {}) };
  for (const k of LISTAS_PERFIL) {
    if (!Array.isArray(novo?.[k])) continue;
    const vistos = new Set((p[k] || []).map(normalizar));
    p[k] = [...(p[k] || [])];
    for (const v of novo[k]) { const t = String(v || "").trim().slice(0, 60); if (t && !vistos.has(normalizar(t))) { p[k].push(t); vistos.add(normalizar(t)); } }
    p[k] = p[k].slice(-15);
  }
  if (Array.isArray(novo?.remover)) for (const v of novo.remover) for (const k of LISTAS_PERFIL) if (Array.isArray(p[k])) p[k] = p[k].filter((x: string) => normalizar(x) !== normalizar(v));
  if (typeof novo?.observacoes === "string" && novo.observacoes.trim()) p.observacoes = novo.observacoes.trim().slice(0, 1200);
  if (typeof novo?.como_prefere_ser_atendida === "string" && novo.como_prefere_ser_atendida.trim()) p.como_prefere_ser_atendida = novo.como_prefere_ser_atendida.trim().slice(0, 300);
  return p;
}
// Aprendizado também pelo que ela ESCOLHE (não só pelo que diz): cada item posto no projeto conta pra material/cor/estilo.
function registrarEscolha(perfil: any, item: Item) {
  const h = { ...(perfil.historico || {}) };
  const somar = (grupo: string, valor: string) => { if (!valor) return; h[grupo] = { ...(h[grupo] || {}) }; h[grupo][valor] = (h[grupo][valor] || 0) + 1; };
  somar("materiais", item.material); somar("cores", item.cor); somar("estilos", item.estilo); somar("categorias", item.categoria);
  perfil.historico = h;
}
function topo(obj: Record<string, number> | undefined, n = 5) {
  return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v}×)`);
}

// ---------------------------------------------------------------------------------------------------------------
function promptDoSistema({ ctx, perfil, projeto, modo, empresa, formatos, acervo, dispEvento }: any) {
  const subcats = () => { const m = new Map<string, Set<string>>(); (acervo || []).forEach((i: Item) => { if (!m.has(i.categoria)) m.set(i.categoria, new Set()); if (i.subcategoria) m.get(i.categoria)!.add(i.subcategoria); }); return [...m.entries()].map(([c, ss]) => `${c}${ss.size ? ` [${[...ss].join(", ")}]` : ""}`).join("; "); };
  const contar = (campo: "categoria" | "estilo") => { const m = new Map<string, number>(); (acervo || []).forEach((i: Item) => i[campo] && m.set(i[campo], (m.get(i[campo]) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", "); };
  const p = perfil || {};
  const aprendido = [
    p.tons?.length && `tons: ${p.tons.join(", ")}`, p.cores?.length && `cores: ${p.cores.join(", ")}`,
    p.estilos?.length && `estilos: ${p.estilos.join(", ")}`, p.materiais?.length && `materiais: ${p.materiais.join(", ")}`,
    p.categorias_preferidas?.length && `gosta de usar: ${p.categorias_preferidas.join(", ")}`, p.evita?.length && `evita: ${p.evita.join(", ")}`,
    p.tipos_de_evento?.length && `eventos que costuma fazer: ${p.tipos_de_evento.join(", ")}`,
    p.como_prefere_ser_atendida && `jeito de atender: ${p.como_prefere_ser_atendida}`, p.observacoes && `notas: ${p.observacoes}`,
    p.historico && `o que mais escolheu até hoje — materiais: ${topo(p.historico.materiais).join(", ") || "—"}; cores: ${topo(p.historico.cores).join(", ") || "—"}; categorias: ${topo(p.historico.categorias).join(", ") || "—"}`,
  ].filter(Boolean).join("\n- ");
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const proj = projeto ? `Projeto aberto agora: "${projeto.noivos}" — ${projeto.data_evento || "sem data"} — ${projeto.local_evento || "sem local"}. Status: ${projeto.status || "rascunho"}.
Ambiente ativo: ${projeto.ambientes?.find((a: any) => a.id === projeto.ambiente_ativo)?.nome || "nenhum"}.
Itens já no pedido: ${JSON.stringify((projeto.ambientes || []).map((a: any) => ({ ambiente: a.nome, itens: (a.itens || []).map((i: any) => `${i.quantidade}× ${i.nome || "item"}${i.ref ? ` [${i.ref}]` : ""}`) })))}` : "Nenhum projeto aberto ainda.";
  return `Você é ${NOME_ASSISTENTE}, consultora comercial da ${empresa || "Chiavari"} — locação de mobiliário para eventos (casamentos, festas, corporativos). Você atende pelo chat do catálogo online.
Hoje é ${hoje}. Você está falando com ${ctx.nome || "um(a) decorador(a)"}${ctx.clienteId ? " (cliente decorador(a))" : " (alguém da equipe interna testando o atendimento)"}.

QUEM VOCÊ É
- Uma pessoa de verdade do comercial: calorosa, segura, com bom gosto e olho de decoradora. Fala português do Brasil natural, como no WhatsApp profissional — frases curtas, sem listas enormes, sem jargão, sem "Como posso ajudar?" repetido, sem soar robô.
- Nunca diga que é uma IA, um robô ou um sistema, a menos que perguntem diretamente; se perguntarem, seja honesta com leveza.
- Responda primeiro o que foi perguntado, de forma natural. Depois, conduza com delicadeza para o próximo passo do fechamento (montar o projeto, escolher peças que faltam, confirmar quantidades, ver a imagem da composição, enviar o pedido). Uma pergunta por vez. Nada de pressão nem de empurrar o que não combina.
- Use o que você já sabe da pessoa (perfil abaixo) sem anunciar que "aprendeu" ou que "vai lembrar": só aja como quem já conhece o gosto dela.
- Mensagens curtas: normalmente 1 a 4 frases. Pode usar *itálico* ou **negrito** com moderação. Sem emojis em excesso (no máximo um, às vezes).

O OBJETIVO
Fechar o pedido: o decorador sair com o projeto montado (ambientes, peças e quantidades) e enviado para a equipe da Chiavari. O caminho típico: entender o evento (noivos/cliente, data, local, estilo, número de convidados, ambientes) → sugerir peças e combinações → colocar no projeto → mandar imagem da composição quando ajudar a decidir → revisar → enviar o pedido.

REGRAS DE VERDADE (MUITO IMPORTANTES)
- Só fale de itens que existem no acervo: use as ferramentas para buscar. Nunca invente peça, medida, cor, preço ou disponibilidade.
- Cada item tem um código curto (ex.: m12). Nas ferramentas use exatamente esse código; nunca mostre o código para a pessoa.
- Valores: mostre o valor de locação da ferramenta; "sob consulta" quando não houver. Frete, montagem e serviços extras quem confirma é a equipe comercial no pedido oficial.
- Nunca diga que colocou, incluiu, tirou ou trocou algo sem ter chamado a ferramenta (adicionar_ao_pedido/remover_do_pedido) e recebido ok.
- Disponibilidade: use verificar_disponibilidade. Quando uma peça pedida não tiver unidades livres na data do evento, diga com clareza e gentileza: "infelizmente o <peça> não está disponível para <data>", e na mesma resposta ofereça 2 ou 3 alternativas do mesmo tipo/estilo que ESTÃO livres nessa data (buscar_itens com disponivel_em). Se houver só parte da quantidade, diga quantas restam. Nunca coloque no pedido uma peça indisponível na data.
- Disponibilidade: use verificar_disponibilidade. Quando o estoque não estiver cadastrado, diga que a equipe confirma a disponibilidade no pedido oficial (não diga que está disponível nem indisponível).
- Para acrescentar ou tirar itens do projeto use as ferramentas; confirme com naturalidade depois ("Coloquei 2 poltronas Olivia no Lounge").
- Se não houver projeto aberto e for preciso um, PERGUNTE com naturalidade o nome dos noivos (ou do cliente final), a data e o local do evento. Só chame criar_projeto depois que a pessoa tiver dito os três de verdade e concordado em criar. Nunca invente, nunca use "a definir", e nunca use o nome do(a) decorador(a) como nome dos noivos. Sem projeto você ainda pode sugerir peças, mostrar cartões e montar imagens normalmente.${modo === "pedido" ? "\n- Você está dentro de um PEDIDO da equipe: o projeto é o próprio pedido. Não crie projeto nem envie pedido; só monte as peças." : ""}
- Mostre os itens que você recomenda com mostrar_itens (aparecem com foto para a pessoa clicar). Faça isso sempre que citar peças específicas.
- Para sugerir peças use o acervo INTEIRO (buscar_itens / sugerir_combinacoes sem filtro de 3D). Ter ou não modelo 3D só importa para montar a imagem da composição — nunca limite as sugestões a isso nem fale de "acervo 3D" para a pessoa.

IMAGENS DE COMPOSIÇÃO
- Quando pedirem uma foto/imagem de peças juntas (ex.: "me manda uma foto do sofá Alex com a poltrona Olivia"), ou quando uma imagem ajudar a decidir, use listar_formatos e escolha o formato cadastrado que melhor recebe essas peças; depois gerar_imagem_composicao.
- Em cada posição (papel) do formato só entra um móvel do tipo que aquela posição aceita, e o móvel precisa ter modelo 3D. Preencha apenas as posições das peças pedidas/combinadas; posições não preenchidas ficam fora da imagem. Se o formato tem 2 posições de poltrona, a poltrona escolhida vai nas duas.
- Nunca prometa "vou checar", "já te mando" ou "vou ver" sem fazer isso na MESMA resposta: se perguntaram disponibilidade, chame verificar_disponibilidade agora e responda com o resultado. Data sem ano ("20 de novembro") é a próxima ocorrência a partir de hoje.
- Antes de dizer que uma peça não existe, procure com buscar_itens. Nunca diga que uma peça "não está no acervo" se ela existe.
- Se a peça existe mas NÃO tem modelo 3D (tem_modelo_3d: false), deixe claro que ela está no acervo e pode entrar no pedido — mostre-a com mostrar_itens —, mas que dela ainda não dá pra montar a foto da composição. Ofereça montar a imagem com a alternativa com 3D mais próxima (mesmo estilo/tipo), deixando claro que é uma alternativa.
- Se não existir formato que receba as peças pedidas, diga com naturalidade que dessa combinação você ainda não consegue montar a imagem e ofereça a alternativa mais próxima.
- A imagem é uma fotografia de estúdio feita a partir do 3D real das peças — nada é inventado. Ela leva 1 a 2 minutos e aparece aqui na conversa; avise a pessoa disso em uma frase.

ACERVO
- Categorias e subcategorias que existem (use estes nomes nos filtros; para um TIPO de peça — sofá, poltrona, puff, mesa de centro — filtre pela subcategoria): ${subcats()}.
- Estilos cadastrados nas peças: ${contar("estilo")}.
- Quando pedirem um estilo (boho, clássico, rústico...), filtre buscar_itens pelo campo estilo e por categorias reais (ex.: lounge = Estofados + Mesas Auxiliares + Aparadores). Só chame uma peça de "boho" (ou outro estilo) se o estilo dela for esse; se faltar peça de algum tipo naquele estilo, diga e ofereça a mais próxima, deixando claro o estilo dela.
- Sempre que citar peças, mostre-as com mostrar_itens.

APRENDER COM A PESSOA
- Sempre que ela revelar gosto ou hábito (tons claros/escuros, estilos, materiais, cores, o que evita, tipo de evento, como gosta de ser atendida), chame atualizar_perfil com o que aprendeu. Faça isso discretamente, sem comentar.

O QUE VOCÊ JÁ SABE DESTA PESSOA
- ${aprendido || "ainda nada — este pode ser o primeiro contato."}

CONTEXTO DA TELA
${proj}

FORMATOS CADASTRADOS NO 3D (para imagens de composição; cada posição lista os móveis com 3D que servem nela)
${JSON.stringify((formatos || []).map((f: Formato) => formatoParaIA(f, acervo, dispEvento)))}
(Atenção: essa lista diz quais peças têm modelo 3D — NÃO quais estão disponíveis. Disponibilidade só pelas ferramentas ou pelo campo livres_na_data_do_evento.)

EFICIÊNCIA
- Quando precisar de várias ferramentas independentes, chame-as juntas na mesma vez.
- Para pedir a imagem, use direto os formatos acima com gerar_imagem_composicao (não precisa listar de novo).`;
}

const FERRAMENTAS = (modo: string) => [
  { name: "buscar_itens", description: "Busca peças no acervo por texto livre (nome, material, cor...) e/ou filtros.", parameters: { type: "object", properties: {
    texto: { type: "string" }, categoria: { type: "string" }, subcategoria: { type: "string" }, material: { type: "string" }, cor: { type: "string" }, estilo: { type: "string" },
    somente_com_3d: { type: "boolean", description: "Só peças que têm modelo 3D (necessário para imagem de composição)." }, limite: { type: "integer" },
    disponivel_em: { type: "string", description: "AAAA-MM-DD: devolve só peças com unidades livres nessa data (e quantas). Com projeto aberto, o padrão já é a data do evento." },
    incluir_indisponiveis: { type: "boolean", description: "true para ver também peças sem unidades livres na data do evento." } } } },
  { name: "listar_categorias", description: "Categorias, subcategorias, materiais e estilos existentes no acervo.", parameters: { type: "object", properties: {} } },
  { name: "sugerir_combinacoes", description: "Peças de outras categorias que combinam com um item (estilo, família, material, cor e o gosto da pessoa).", parameters: { type: "object", properties: { item_id: { type: "string" }, somente_com_3d: { type: "boolean" } }, required: ["item_id"] } },
  { name: "verificar_disponibilidade", description: "Disponibilidade de itens numa data (padrão: data do projeto aberto).", parameters: { type: "object", properties: { item_ids: { type: "array", items: { type: "string" } }, data: { type: "string", description: "AAAA-MM-DD" }, quantidade: { type: "integer" } }, required: ["item_ids"] } },
  { name: "mostrar_itens", description: "Mostra cartões com foto dos itens citados, para a pessoa ver e abrir.", parameters: { type: "object", properties: { item_ids: { type: "array", items: { type: "string" } } }, required: ["item_ids"] } },
  { name: "adicionar_ao_pedido", description: "Coloca (ou define a quantidade de) um item num ambiente do projeto aberto. Cria o ambiente se não existir.", parameters: { type: "object", properties: {
    item_id: { type: "string" }, quantidade: { type: "integer", description: "Quantidade final desejada desse item no ambiente." }, ambiente: { type: "string", description: "Nome do ambiente (ex.: Lounge, Cerimônia, Bar). Vazio = ambiente ativo." } }, required: ["item_id", "quantidade"] } },
  { name: "remover_do_pedido", description: "Tira um item de um ambiente do projeto aberto.", parameters: { type: "object", properties: { item_id: { type: "string" }, ambiente: { type: "string" } }, required: ["item_id"] } },
  ...(modo === "pedido" ? [] : [
    { name: "criar_projeto", description: "Cria um projeto novo (necessário para montar o pedido). Precisa de noivos/cliente, data e local.", parameters: { type: "object", properties: {
      noivos: { type: "string" }, data_evento: { type: "string", description: "AAAA-MM-DD" }, local_evento: { type: "string" }, ambientes: { type: "array", items: { type: "string" } },
      confirmado_pela_pessoa: { type: "boolean", description: "true só se a pessoa informou noivos, data e local e concordou em criar." } }, required: ["noivos", "data_evento", "local_evento", "confirmado_pela_pessoa"] } },
    { name: "enviar_pedido", description: "Abre para a pessoa a revisão final e o envio do pedido à equipe da Chiavari (ela confirma na tela).", parameters: { type: "object", properties: { observacao: { type: "string" } } } },
  ]),
  { name: "listar_formatos", description: "Formatos de composição cadastrados no 3D (lounges, mesas...), com as posições e o tipo de móvel que cada uma aceita.", parameters: { type: "object", properties: { categoria: { type: "string" } } } },
  { name: "gerar_imagem_composicao", description: "Monta um formato cadastrado com os móveis escolhidos e gera a fotografia de estúdio da composição (aparece na conversa em 1-2 min).", parameters: { type: "object", properties: {
    formato_id: { type: "string" }, pecas: { type: "array", items: { type: "object", properties: { papel: { type: "string" }, item_id: { type: "string" } }, required: ["papel", "item_id"] } },
    legenda: { type: "string", description: "Frase curta que acompanha a imagem." } }, required: ["formato_id", "pecas"] } },
  { name: "atualizar_perfil", description: "Guarda o que você aprendeu sobre o gosto/hábitos desta pessoa (use sempre que ela revelar algo).", parameters: { type: "object", properties: {
    tons: { type: "array", items: { type: "string" } }, cores: { type: "array", items: { type: "string" } }, estilos: { type: "array", items: { type: "string" } },
    materiais: { type: "array", items: { type: "string" } }, categorias_preferidas: { type: "array", items: { type: "string" } }, evita: { type: "array", items: { type: "string" } },
    tipos_de_evento: { type: "array", items: { type: "string" } }, como_prefere_ser_atendida: { type: "string" }, observacoes: { type: "string", description: "Resumo curto do perfil (substitui o anterior)." },
    remover: { type: "array", items: { type: "string" }, description: "Gostos que deixaram de valer." } } } },
].map((f) => ({ type: "function", function: f }));

async function chamarOpenAI(messages: any[], tools: any[], toolChoice: "auto" | "required" = "auto") {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, temperature: 0.7, messages, tools, tool_choice: toolChoice, parallel_tool_calls: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "A assistente está indisponível agora.");
  return data.choices?.[0]?.message;
}

// Leitura dedicada de gostos em CADA mensagem da pessoa (roda em paralelo com a resposta). Não depende de o modelo
// principal lembrar de chamar atualizar_perfil — o aprendizado é o objetivo central, não pode ser opcional.
async function extrairGostos(mensagem: string, perfil: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || mensagem.length < 8) return null;
  const lista = { type: "array", items: { type: "string" } };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("CATALOGO_ASSISTENTE_MODEL_PERFIL") || "gpt-4.1-mini", temperature: 0,
        messages: [
          { role: "system", content: "Você extrai preferências de decoração de eventos que um(a) decorador(a) revelou SOBRE SI na mensagem (gostos pessoais e hábitos, não um pedido pontual de uma peça específica). Termos curtos em português, minúsculas. Liste só o que estiver claro; sem nada, devolva listas vazias. remover = gostos que a pessoa disse que NÃO valem mais. Perfil atual: " + JSON.stringify(perfil || {}).slice(0, 1500) },
          { role: "user", content: mensagem },
        ],
        response_format: { type: "json_schema", json_schema: { name: "gostos", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: { tons: lista, cores: lista, estilos: lista, materiais: lista, categorias_preferidas: lista, evita: lista, tipos_de_evento: lista, remover: lista },
          required: ["tons", "cores", "estilos", "materiais", "categorias_preferidas", "evita", "tipos_de_evento", "remover"],
        } } },
      }),
    });
    const d = await r.json();
    if (!r.ok) return null;
    const g = JSON.parse(d.choices?.[0]?.message?.content || "null");
    return g && Object.values(g).some((v: any) => Array.isArray(v) && v.length) ? g : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------------------
async function carregarPerfil(ctx: Ctx) {
  const { data } = await ctx.service.from("catalogo_assistente_perfis").select("perfil").eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).maybeSingle();
  return data?.perfil || {};
}
async function gravarPerfil(ctx: Ctx, perfil: any) {
  await ctx.service.from("catalogo_assistente_perfis").upsert({
    empresa_id: ctx.empresaId, dono: ctx.dono, cliente_id: ctx.clienteId, usuario_id: ctx.usuarioId, nome: ctx.nome || null,
    perfil, atualizado_em: new Date().toISOString(),
  }, { onConflict: "empresa_id,dono" });
}
async function historico(ctx: Ctx, limite = 40) {
  const { data } = await ctx.service.from("catalogo_assistente_mensagens").select("id,papel,conteudo,anexos,criado_em")
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).order("criado_em", { ascending: false }).limit(limite);
  return (data || []).reverse();
}
async function gravarMensagem(ctx: Ctx, papel: string, conteudo: string, anexos: any[] = [], projetoId: string | null = null) {
  const { data } = await ctx.service.from("catalogo_assistente_mensagens").insert({
    empresa_id: ctx.empresaId, dono: ctx.dono, papel, conteudo: conteudo.slice(0, 8000), anexos, projeto_id: projetoId,
  }).select("id,papel,conteudo,anexos,criado_em").single();
  return data;
}

function limparProjeto(p: any, acervo: Item[]) {
  if (!p || typeof p !== "object" || !p.id) return null;
  return {
    id: String(p.id), noivos: String(p.noivos || "").slice(0, 120), data_evento: String(p.data_evento || "").slice(0, 10),
    local_evento: String(p.local_evento || "").slice(0, 160), status: String(p.status || ""), ambiente_ativo: p.ambiente_ativo ? String(p.ambiente_ativo) : null,
    ambientes: (Array.isArray(p.ambientes) ? p.ambientes : []).slice(0, 30).map((a: any) => ({
      id: String(a.id), nome: String(a.nome || "").slice(0, 60),
      itens: (Array.isArray(a.itens) ? a.itens : []).slice(0, 200).map((i: any) => { const it = acervo.find((x) => x.id === String(i.item_id)); return { item_id: String(i.item_id), quantidade: Number(i.quantidade) || 1, nome: it?.nome, ref: it?.ref }; }),
    })),
  };
}

async function conversar(ctx: Ctx, body: any) {
  const mensagem = String(body?.mensagem || "").trim().slice(0, 2000);
  if (!mensagem) return json({ erro: "Mensagem vazia" }, 400);
  const modo = body?.modo === "pedido" ? "pedido" : "catalogo";

  // Freio simples contra uso abusivo: até 20 mensagens por minuto por pessoa.
  const umMinuto = new Date(Date.now() - 60000).toISOString();
  const { count } = await ctx.service.from("catalogo_assistente_mensagens").select("id", { count: "exact", head: true })
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).eq("papel", "user").gte("criado_em", umMinuto);
  if ((count || 0) >= 20) return json({ erro: "Muitas mensagens em pouco tempo. Aguarde um instante." }, 429);

  const [acervo, perfilInicial, passadas, { data: empresa }] = await Promise.all([
    carregarAcervo(ctx), carregarPerfil(ctx), historico(ctx, 24),
    ctx.service.from("empresas").select("nome").eq("id", ctx.empresaId).maybeSingle(),
  ]);
  let perfil = perfilInicial;
  let perfilMudou = false;
  let projeto = limparProjeto(body?.projeto, acervo);
  let formatos: Formato[] | null = await carregarFormatos(ctx, acervo);
  const acoes: any[] = [];
  const mostrados = new Set<string>();

  const porAudio = Boolean(body?.por_audio);
  await gravarMensagem(ctx, "user", mensagem, porAudio ? [{ tipo: "audio" }] : [], projeto?.id || null);

  const mapas = new Map<string, Map<string, { total: number; livre: number }>>();
  const dataDoEvento = /^\d{4}-\d{2}-\d{2}$/.test(String(projeto?.data_evento || "")) ? String(projeto!.data_evento) : "";
  if (dataDoEvento) mapas.set(dataDoEvento, await mapaDisponibilidade(ctx, dataDoEvento));
  const messages: any[] = [
    { role: "system", content: promptDoSistema({ ctx, perfil, projeto, modo, empresa: empresa?.nome, formatos, acervo, dispEvento: dataDoEvento ? mapas.get(dataDoEvento) : null }) },
    ...passadas.map((m: any) => ({ role: m.papel, content: m.conteudo + ((m.anexos || []).some((a: any) => a.tipo === "imagem") ? "\n[imagem da composição enviada na conversa]" : "") })),
    { role: "user", content: porAudio ? `[mensagem de voz transcrita — pode ter pequenos erros de transcrição em nomes; interprete pelo contexto e pelo acervo]\n${mensagem}` : mensagem },
  ];
  const tools = FERRAMENTAS(modo);
  const rastro: any[] = [];
  const encontrados = new Set<string>(); // itens que as ferramentas devolveram nesta mensagem (pros cartões automáticos)
  // Peças citadas pela pessoa, já procuradas no acervo pelo servidor (não depende do modelo buscar): evita "não temos" de
  // uma peça que existe e dá a ela o estilo e se tem 3D. Casa o nome inteiro ("sofá becca") ou o modelo + tipo da peça.
  const citadas = pecasCitadas(mensagem, acervo);
  if (citadas.length) {
    messages.splice(messages.length - 1, 0, { role: "system", content: "Peças que a pessoa citou nesta mensagem e que EXISTEM no acervo (confirmado pelo sistema): " + JSON.stringify(citadas.map(resumoItem)) + ". Trate-as como existentes. tem_modelo_3d false = existe e pode entrar no pedido, só não dá pra montar a foto dela." });
    citadas.forEach((i) => encontrados.add(i.id));
  }
  const itemValido = (id: unknown) => acharItem(acervo, id);

  const executar = async (nome: string, a: any): Promise<unknown> => {
    switch (nome) {
      case "buscar_itens": {
        // Com projeto numa data, a busca já filtra pelo que está livre nesse dia (a não ser que peça incluir_indisponiveis).
        const data = /^\d{4}-\d{2}-\d{2}$/.test(String(a?.disponivel_em || "")) ? String(a.disponivel_em) : (a?.incluir_indisponiveis ? "" : dataDoEvento);
        if (data && !a?.disponivel_em) a = { ...a, disponivel_em: data };
        if (data && !mapas.has(data)) mapas.set(data, await mapaDisponibilidade(ctx, data));
        return buscarItens(acervo, a, data ? mapas.get(data) : null);
      }
      case "listar_categorias": return listarCategorias(acervo);
      case "sugerir_combinacoes": return sugerirCombinacoes(acervo, a, perfil);
      case "verificar_disponibilidade": return verificarDisponibilidade(ctx, acervo, a, projeto?.data_evento || null);
      case "mostrar_itens": {
        const ids = (Array.isArray(a?.item_ids) ? a.item_ids : []).map((x: unknown) => itemValido(x)?.id).filter(Boolean).slice(0, 8) as string[];
        ids.forEach((id: string) => mostrados.add(id));
        return { mostrados: ids.length };
      }
      case "adicionar_ao_pedido": case "remover_do_pedido": {
        const item = itemValido(a?.item_id);
        if (!item) return { erro: "Item não existe no acervo." };
        if (!projeto) return { erro: modo === "pedido" ? "O pedido ainda não está pronto." : "Não há projeto aberto. Peça noivos/cliente, data e local e use criar_projeto." };
        const ambNome = String(a?.ambiente || "").trim().slice(0, 60);
        const amb = ambNome ? projeto.ambientes.find((x: any) => normalizar(x.nome) === normalizar(ambNome)) : projeto.ambientes.find((x: any) => x.id === projeto!.ambiente_ativo) || projeto.ambientes[0];
        const quantidade = nome === "remover_do_pedido" ? 0 : Math.max(1, Math.min(999, Math.round(Number(a?.quantidade) || 1)));
        if (!amb && !ambNome && nome === "adicionar_ao_pedido") return { erro: "O projeto não tem ambientes. Informe o nome do ambiente (ex.: Lounge)." };
        if (!amb && nome === "remover_do_pedido") return { erro: "Ambiente não encontrado no projeto." };
        // Trava de disponibilidade na data do evento: conta a mesma peça nos OUTROS ambientes do pedido também.
        const dataEvento = /^\d{4}-\d{2}-\d{2}$/.test(String(projeto.data_evento || "")) ? projeto.data_evento : "";
        if (quantidade && dataEvento) {
          if (!mapas.has(dataEvento)) mapas.set(dataEvento, await mapaDisponibilidade(ctx, dataEvento));
          const d = mapas.get(dataEvento)!.get(item.id);
          const outros = projeto.ambientes.filter((x: any) => x !== amb).reduce((t: number, x: any) => t + x.itens.filter((i: any) => i.item_id === item.id).reduce((q: number, i: any) => q + i.quantidade, 0), 0);
          if (d && d.total && quantidade + outros > d.livre) {
            const restam = Math.max(0, d.livre - outros);
            return { erro: restam
              ? `INDISPONÍVEL nessa quantidade: em ${dataEvento} só há ${restam} unidade(s) livre(s) de ${item.nome}${outros ? ` (já há ${outros} em outro ambiente deste pedido)` : ""}. Nada foi adicionado. Diga isso à pessoa e pergunte se quer essa quantidade ou uma alternativa.`
              : `INDISPONÍVEL: ${item.nome} não tem unidades livres em ${dataEvento}. Nada foi adicionado. Diga à pessoa que infelizmente não está disponível nessa data e ofereça alternativas disponíveis (buscar_itens com disponivel_em).` };
          }
        }
        acoes.push({ tipo: "quantidade", item_id: item.id, quantidade, ambiente: amb?.nome || ambNome });
        // Mantém o retrato do projeto em dia para as próximas ferramentas desta mesma resposta.
        let alvo = amb;
        if (!alvo) { alvo = { id: `novo:${ambNome}`, nome: ambNome, itens: [] }; projeto.ambientes.push(alvo); }
        alvo.itens = alvo.itens.filter((i: any) => i.item_id !== item.id);
        if (quantidade) { alvo.itens.push({ item_id: item.id, quantidade, nome: item.nome, ref: item.ref }); registrarEscolha(perfil, item); perfilMudou = true; }
        return { ok: true, item: item.nome, ambiente: alvo.nome, quantidade_no_ambiente: quantidade };
      }
      case "criar_projeto": {
        if (modo === "pedido") return { erro: "Indisponível dentro do pedido." };
        const noivos = String(a?.noivos || "").trim(), data = String(a?.data_evento || "").trim(), local = String(a?.local_evento || "").trim();
        if (!noivos || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !local) return { erro: "Preciso de noivos/cliente, data (AAAA-MM-DD) e local." };
        // Trava: nada de projeto com dado inventado/provisório (já aconteceu em teste: local "(definir)" e o nome da decoradora como noivos).
        if (local.length < 3 || /defin|confirmar|\?|^-+$|^n\/?a$|sem local/i.test(local)) return { erro: "O local ainda não foi informado. Pergunte o local do evento antes de criar o projeto." };
        if (ctx.nome && normalizar(noivos) === normalizar(ctx.nome)) return { erro: "Esse é o nome do(a) decorador(a), não dos noivos. Pergunte o nome dos noivos ou do cliente final." };
        if (!a?.confirmado_pela_pessoa) return { erro: "Confirme com a pessoa os dados (noivos, data e local) antes de criar o projeto." };
        const ambientes = (Array.isArray(a?.ambientes) ? a.ambientes : []).map((x: unknown) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 12);
        const criado = await ctx.rpc("projeto_criar", { p_noivos: noivos, p_data_evento: data, p_local_evento: local, p_ambientes: ambientes });
        const dados = criado?.dados || {};
        projeto = { id: String(criado.id), noivos, data_evento: data, local_evento: local, status: "rascunho", ambiente_ativo: dados.ambientes?.[0]?.id || null,
          ambientes: (dados.ambientes || []).map((x: any) => ({ id: String(x.id), nome: x.nome, itens: [] })) };
        acoes.push({ tipo: "usar_projeto", projeto_id: projeto.id });
        return { ok: true, projeto: projeto.noivos, ambientes: projeto.ambientes.map((x: any) => x.nome) };
      }
      case "enviar_pedido": {
        if (!projeto) return { erro: "Não há projeto aberto." };
        const total = projeto.ambientes.reduce((s: number, x: any) => s + x.itens.length, 0);
        if (!total) return { erro: "O projeto ainda não tem itens." };
        acoes.push({ tipo: "enviar_pedido", observacao: String(a?.observacao || "").slice(0, 1000) });
        return { ok: true, observacao: "A revisão do pedido foi aberta na tela; a pessoa confirma o envio por lá." };
      }
      case "listar_formatos": {
        formatos ||= await carregarFormatos(ctx, acervo);
        // Sempre todos (são poucos): formato sem categoria cairia fora de um filtro e é justamente o da equipe.
        return { formatos: formatos.map((f) => formatoParaIA(f, acervo)) };
      }
      case "gerar_imagem_composicao": {
        formatos ||= await carregarFormatos(ctx, acervo);
        const f = formatos.find((x) => x.id === String(a?.formato_id));
        if (!f) return { erro: "Formato não encontrado. Use listar_formatos." };
        const selecao: Record<string, string> = {};
        const problemas: string[] = [];
        for (const p of Array.isArray(a?.pecas) ? a.pecas : []) {
          const peca = f.pecas.find((x) => x.papel === String(p?.papel));
          const item = itemValido(p?.item_id);
          if (!peca) { problemas.push(`posição "${p?.papel}" não existe neste formato`); continue; }
          if (!item) { problemas.push(`item ${p?.item_id} não existe`); continue; }
          if (!item.tem3d) { problemas.push(`${item.nome} não tem modelo 3D`); continue; }
          if (!peca.aceita(item)) { problemas.push(`${item.nome} não serve na posição "${peca.rotulo}" (aceita: ${peca.descricao})`); continue; }
          selecao[peca.papel] = item.id;
        }
        if (problemas.length) return { erro: "Ajuste as peças: " + problemas.join("; ") };
        if (!Object.keys(selecao).length) return { erro: "Escolha ao menos um móvel." };
        const faltaObrigatorio = f.pecas.filter((p) => p.obrigatorio && !selecao[p.papel]);
        if (faltaObrigatorio.length) return { erro: `Neste formato é obrigatório: ${faltaObrigatorio.map((p) => p.rotulo).join(", ")}.` };
        const itens = Object.values(selecao).map((id) => itemValido(id)!.nome);
        acoes.push({ tipo: "renderizar", formato_id: f.id, formato_nome: f.nome, selecao, legenda: String(a?.legenda || "").slice(0, 200), itens });
        return { ok: true, observacao: "A imagem está sendo gerada (1 a 2 minutos) e aparece na conversa quando ficar pronta." };
      }
      case "atualizar_perfil": {
        perfil = mesclarPerfil(perfil, a); perfilMudou = true;
        return { ok: true };
      }
    }
    return { erro: "Ferramenta desconhecida" };
  };

  const gostos = extrairGostos(mensagem, perfil);
  let resposta = "";
  // Pedido de ação ("coloca", "inclui", "tira", "quero o sofá X no lounge"...): na 1ª rodada a ferramenta é obrigatória —
  // em teste ela respondeu "vou incluir" sem chamar nada (não incluiu nem conferiu a data).
  const pedeAcao = /\b(coloc|inclu|adicion|acrescent|bota|bote|poe|põe|ponha|tira|tire|remov|troca|troque|quero (o|a|os|as|um|uma|\d))/i.test(normalizar(mensagem));
  for (let rodada = 0; rodada < 7; rodada++) {
    const msg = await chamarOpenAI(messages, tools, rodada === 0 && pedeAcao ? "required" : "auto");
    if (!msg) break;
    messages.push(msg);
    if (!msg.tool_calls?.length) { resposta = String(msg.content || "").trim(); break; }
    for (const chamada of msg.tool_calls) {
      let resultado: unknown;
      try { resultado = await executar(chamada.function.name, JSON.parse(chamada.function.arguments || "{}")); }
      catch (e) { resultado = { erro: (e as Error).message || "Falha na ferramenta" }; }
      JSON.stringify(resultado).replace(/"id":"(m\d+)"/g, (_, ref) => { const it = itemValido(ref); if (it) encontrados.add(it.id); return ""; });
      rastro.push({ ferramenta: chamada.function.name, args: chamada.function.arguments, resultado: JSON.stringify(resultado).slice(0, 400) });
      messages.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(resultado).slice(0, 14000) });
    }
  }
  if (!resposta) resposta = "Desculpa, me perdi aqui por um instante. Pode repetir pra mim?";
  // Cartões com foto sem depender do modelo lembrar de mostrar_itens: toda peça encontrada nesta mensagem cujo nome
  // aparece na resposta vira cartão (até 8).
  if (mostrados.size < 8) {
    const textoResposta = normalizar(resposta);
    const candidatos = [...encontrados].map((id) => itemValido(id)!).filter((i) => !mostrados.has(i.id))
      .filter((i) => textoResposta.includes(normalizar(i.nome)));
    const vistosNome = new Set<string>();
    for (const i of candidatos) { const k = normalizar(i.nome); if (vistosNome.has(k) || mostrados.size >= 8) continue; vistosNome.add(k); mostrados.add(i.id); }
  }
  const aprendido = await gostos;
  if (aprendido) { perfil = mesclarPerfil(perfil, aprendido); perfilMudou = true; }
  if (perfilMudou) await gravarPerfil(ctx, perfil);
  const dispCartoes = dataDoEvento ? mapas.get(dataDoEvento) : null;
  const itens = [...mostrados].map((id) => { const i = itemValido(id)!; const d = dispCartoes?.get(i.id); return { id: i.id, nome: i.nome, foto: i.foto, medidas: i.medidas, categoria: i.categoria, ...(d && d.total ? { livres: d.livre, data: dataDoEvento } : {}) }; });
  const anexos = [
    ...(itens.length ? [{ tipo: "itens", itens }] : []),
    ...acoes.filter((x) => x.tipo === "renderizar").map((x) => ({ tipo: "renderizando", formato: x.formato_nome, itens: x.itens })),
  ];
  const gravada = await gravarMensagem(ctx, "assistant", resposta, anexos, projeto?.id || null);
  return json({ mensagem: gravada, acoes, nome: NOME_ASSISTENTE, ...(body?.debug ? { rastro } : {}) });
}

// Áudio (mensagem de voz do decorador). Transcrição com o modelo mais preciso da OpenAI (CATALOGO_ASSISTENTE_TRANSCRICAO,
// padrão gpt-4o-transcribe), em português, recebendo como "prompt" o vocabulário do acervo (nomes das famílias, estilos,
// categorias) — é isso que faz "Becca", "Águines", "Chesterfield", "Provençal" saírem certos. Se o modelo principal falhar,
// tenta whisper-1. O texto volta pro navegador, que mostra no balão e manda pra conversa como uma mensagem normal.
async function vocabulario(ctx: Ctx) {
  const acervo = await carregarAcervo(ctx);
  // Nome da família = nome sem tamanho (P/M/G) e sem as partes de componente ("Corpo", "Almofada Assento"...).
  const familias = new Set<string>();
  for (const i of acervo) familias.add(i.nome.replace(/\s+(P|M|G|GG)$/i, "").trim());
  const nomes = [...familias].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const extras = [...new Set(acervo.flatMap((i) => [i.categoria, i.estilo, i.material, i.cor]).filter(Boolean))];
  const base = "Conversa de decoradora de eventos com a consultora da Chiavari sobre locação de móveis. Termos: lounge, boho, provençal, rústico, cerimônia, mesa de convidados, bar, puff, poltrona, aparador, banqueta, " + extras.join(", ") + ". Peças do acervo: ";
  let prompt = base;
  for (const n of nomes) { if ((prompt + n).length > 3500) break; prompt += n + ", "; }
  return { prompt, nomes };
}

// Revisão dos nomes: a transcrição costuma acertar a frase e errar nome próprio de peça ("Beca" → Becca, "Agnes" → Águines).
// Um modelo pequeno compara com a lista REAL do acervo e corrige só esses nomes; o resto da fala fica igual.
async function corrigirNomes(texto: string, nomes: string[]) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || !texto) return texto;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("CATALOGO_ASSISTENTE_MODEL_PERFIL") || "gpt-4.1-mini", temperature: 0,
        messages: [
          { role: "system", content: "Você revisa a transcrição automática de uma mensagem de voz em português de uma decoradora falando com uma loja de móveis para eventos. Corrija APENAS nomes de peças/modelos que foram transcritos errado e que, pelo som e pelo contexto, correspondem a um nome da lista do acervo (ex.: 'sofá Beca' → 'sofá Becca', 'poltrona Agnes' → 'poltrona Águines'). Use a grafia exata da lista. Não corrija palavras comuns que não são nome de peça (ex.: 'cerimônia' como evento continua 'cerimônia'; mas 'aparador cerimônia' é o 'Aparador Cerimony'). Não mude mais nada: mantenha pontuação, números, ordem e palavras. Se não houver o que corrigir, devolva o texto igual." },
          { role: "user", content: "LISTA DO ACERVO:\n" + nomes.join("; ") + "\n\nTRANSCRIÇÃO:\n" + texto },
        ],
        response_format: { type: "json_schema", json_schema: { name: "revisao", strict: true, schema: { type: "object", additionalProperties: false, properties: { texto: { type: "string" } }, required: ["texto"] } } },
      }),
    });
    const d = await r.json();
    if (!r.ok) return texto;
    const novo = String(JSON.parse(d.choices?.[0]?.message?.content || "{}").texto || "").trim();
    // Proteção: a revisão não pode reescrever a frase (só trocar nomes) — se mudou demais, fica a transcrição original.
    return novo && Math.abs(novo.length - texto.length) <= Math.max(25, texto.length * 0.2) ? novo : texto;
  } catch { return texto; }
}

async function transcrever(ctx: Ctx, body: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "Transcrição indisponível agora." }, 500);
  const m = String(body?.audio || "").match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return json({ erro: "Áudio inválido." }, 400);
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length < 800) return json({ erro: "O áudio ficou curto demais. Segure um pouco mais e fale de novo." }, 400);
  if (bytes.length > 12 * 1024 * 1024) return json({ erro: "Áudio longo demais. Mande em partes de até 2 minutos." }, 400);
  const tipo = m[1].toLowerCase();
  const ext = tipo.includes("mp4") || tipo.includes("m4a") || tipo.includes("aac") ? "m4a" : tipo.includes("ogg") ? "ogg" : tipo.includes("wav") ? "wav" : tipo.includes("mpeg") || tipo.includes("mp3") ? "mp3" : "webm";
  const vocab = await vocabulario(ctx).catch(() => ({ prompt: "", nomes: [] as string[] }));
  const tentar = async (modelo: string) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: tipo }), `audio.${ext}`);
    form.append("model", modelo);
    form.append("language", "pt");
    // whisper-1 só aceita prompt curto (~224 tokens); o gpt-4o-transcribe aceita o vocabulário inteiro.
    const prompt = modelo === "whisper-1" ? vocab.prompt.slice(0, 800) : vocab.prompt;
    if (prompt) form.append("prompt", prompt);
    form.append("response_format", "json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `Falha na transcrição (${r.status})`);
    return String(d?.text || "").trim();
  };
  let texto = "";
  try { texto = await tentar(Deno.env.get("CATALOGO_ASSISTENTE_TRANSCRICAO") || "gpt-4o-transcribe"); }
  catch (e) { console.warn("transcrição principal falhou:", e); texto = await tentar("whisper-1"); }
  if (!texto) return json({ erro: "Não consegui entender o áudio. Pode falar de novo, um pouco mais perto do microfone?" }, 422);
  const revisado = await corrigirNomes(texto, vocab.nomes);
  return json({ texto: revisado.slice(0, 2000), ...(body?.debug ? { bruto: texto } : {}) });
}

async function salvarImagem(ctx: Ctx, body: any) {
  const imagem = String(body?.imagem || "");
  const m = imagem.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return json({ erro: "Imagem inválida" }, 400);
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > 11 * 1024 * 1024) return json({ erro: "Imagem grande demais" }, 400);
  const pasta = `${ctx.empresaId}/${ctx.dono.replace(":", "-")}`;
  const id = crypto.randomUUID();
  const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
  const caminho = `${pasta}/${id}.${ext}`;
  const { error } = await ctx.service.storage.from(BUCKET).upload(caminho, bytes, { contentType: m[1], upsert: false });
  if (error) return json({ erro: error.message }, 500);
  const url = ctx.service.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  let cenaUrl = "";
  if (body?.cena && typeof body.cena === "object") {
    const texto = JSON.stringify(body.cena);
    if (texto.length < 6 * 1024 * 1024) {
      const cenaCaminho = `${pasta}/${id}.json`;
      const { error: e2 } = await ctx.service.storage.from(BUCKET).upload(cenaCaminho, new TextEncoder().encode(texto), { contentType: "application/json" });
      if (!e2) cenaUrl = ctx.service.storage.from(BUCKET).getPublicUrl(cenaCaminho).data.publicUrl;
    }
  }
  const itens = (Array.isArray(body?.itens) ? body.itens : []).slice(0, 30).map((x: unknown) => String(x).slice(0, 120));
  const legenda = String(body?.legenda || "").trim().slice(0, 300) || "Prontinho, olha como ficou a composição:";
  const gravada = await gravarMensagem(ctx, "assistant", legenda, [{ tipo: "imagem", url, cena_url: cenaUrl, itens, formato: String(body?.formato || "").slice(0, 120) }], body?.projeto_id ? String(body.projeto_id) : null);
  return json({ mensagem: gravada });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const ctx = await autenticar(req, body);
    if ("erro" in ctx) return json({ erro: ctx.erro }, ctx.status);
    const acao = String(body?.action || "conversar");
    if (acao === "historico") {
      const [mensagens, perfil] = await Promise.all([historico(ctx, 40), carregarPerfil(ctx)]);
      return json({ mensagens, perfil, nome: NOME_ASSISTENTE, cliente: ctx.nome });
    }
    if (acao === "conversar") return await conversar(ctx, body);
    if (acao === "transcrever") return await transcrever(ctx, body);
    // Disponibilidade de algumas peças numa data (o app mostra "X livres em 25/10" na tela do item).
    if (acao === "disponibilidade") {
      const data = String(body?.data || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ erro: "Data inválida" }, 400);
      const ids = (Array.isArray(body?.item_ids) ? body.item_ids : []).map(String).slice(0, 40);
      const mapa = await mapaDisponibilidade(ctx, data);
      return json({ data, itens: Object.fromEntries(ids.map((id) => [id, mapa.get(id) || null])) });
    }
    if (acao === "salvar_imagem") return await salvarImagem(ctx, body);
    if (acao === "falha_imagem") {
      const texto = String(body?.mensagem || "").trim().slice(0, 300) || "Não consegui terminar a imagem dessa vez. Quer que eu tente de novo?";
      return json({ mensagem: await gravarMensagem(ctx, "assistant", texto) });
    }
    if (acao === "limpar") {
      await ctx.service.from("catalogo_assistente_mensagens").delete().eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono);
      return json({ ok: true });
    }
    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error("catalogo-assistente:", e);
    return json({ erro: (e as Error).message || "Erro inesperado" }, 500);
  }
});
