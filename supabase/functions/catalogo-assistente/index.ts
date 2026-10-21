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
//   limpar           → apaga a conversa fora de pedido (a de um pedido fica como registro; o perfil fica)
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
    const nome = normalizar(i.nome).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().replace(/\s+(p|m|g|gg)$/, "");
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

// Todas as peças de um tipo/estilo livres na data (pedido do usuário: ela mostra o que tem e a pessoa escolhe).
function opcoesDisponiveis(acervo: Item[], a: any, disp?: Map<string, { total: number; livre: number }> | null): string[] {
  const termos = normalizar(a?.texto).split(/\s+/).filter((t) => t.length > 1);
  const cat = normalizar(a?.categoria), sub = normalizar(a?.subcategoria);
  const mat = normalizar(a?.material), cor = normalizar(a?.cor), est = normalizar(a?.estilo);
  return acervo.filter((i) =>
    (!cat || normalizar(i.categoria).includes(cat)) && (!sub || normalizar(i.subcategoria).includes(sub)) &&
    (!mat || normalizar(i.material).includes(mat)) && (!cor || normalizar(i.cor).includes(cor)) &&
    (!est || normalizar(i.estilo).includes(est)) && termos.every((t) => i.busca.includes(t)) &&
    (!disp || (() => { const d = disp.get(i.id); return !d || !d.total || d.livre > 0; })()))
    .slice(0, 80).map((i) => i.id);
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

// Mapa item → { total, livre } numa data. A conta é a do banco (operacao_disponibilidade, out/2026): a mesma regra que
// trava a reserva do pedido e a tela Disponibilidade de Itens — kit vale pelos componentes, peça em avaria/manutenção ou
// que ainda não voltou não está livre, evento de vários dias reserva o período inteiro. total 0 = estoque não cadastrado.
async function mapaDisponibilidade(ctx: Ctx, data: string) {
  const mapa = new Map<string, { total: number; livre: number }>();
  for (let de = 0; ; de += 1000) {
    const { data: pagina, error } = await ctx.service.rpc("operacao_disponibilidade", { p_empresa: ctx.empresaId, p_data: data }).order("item_id").range(de, de + 999);
    if (error) throw new Error("Não foi possível consultar a disponibilidade: " + error.message);
    for (const r of pagina || []) mapa.set(String(r.item_id), { total: Number(r.total) || 0, livre: Number(r.livre) || 0 });
    if (!pagina || pagina.length < 1000) break;
  }
  return mapa;
}

// Disponibilidade de alguns itens numa data, pela mesma conta do banco (mapaDisponibilidade). Sem estoque cadastrado,
// não afirma nada: "a equipe confirma".
async function verificarDisponibilidade(ctx: Ctx, acervo: Item[], a: any, dataPadrao: string | null) {
  const ids = (Array.isArray(a?.item_ids) ? a.item_ids : []).map((x: unknown) => acharItem(acervo, x)?.id).filter(Boolean).slice(0, 20) as string[];
  if (!ids.length) return { erro: "Informe ao menos um item válido." };
  const data = DATA_RE.test(String(a?.data || "")) ? String(a.data) : dataPadrao;
  const mapa = await mapaDisponibilidade(ctx, data || new Date().toISOString().slice(0, 10));
  const quantidade = Number(a?.quantidade) || 1;
  return {
    data: data || "sem data definida",
    itens: ids.map((id: string) => {
      const d = mapa.get(id) || { total: 0, livre: 0 };
      const nome = acervo.find((i) => i.id === id)?.nome;
      const ref = acervo.find((i) => i.id === id)?.ref;
      if (!d.total) return { id: ref, nome, situacao: "estoque não cadastrado no sistema — a equipe comercial confirma a disponibilidade" };
      const livre = data ? d.livre : d.total;
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
  const proj = projeto ? `Pedido (projeto) aberto agora: "${projeto.noivos}" — ${descreverEvento(projeto)}. Status: ${projeto.status || "rascunho"}.
Ambiente ativo: ${projeto.ambientes?.find((a: any) => a.id === projeto.ambiente_ativo)?.nome || "nenhum"}.
Itens já no pedido: ${JSON.stringify((projeto.ambientes || []).map((a: any) => ({ ambiente: a.nome, itens: (a.itens || []).map((i: any) => `${i.quantidade}× ${i.nome || "item"}${i.ref ? ` [${i.ref}]` : ""}`) })))}` : "Nenhum projeto aberto ainda.";
  return `Você é ${NOME_ASSISTENTE}, consultora comercial da ${empresa || "Chiavari"} — locação de mobiliário para eventos (casamentos, festas, corporativos). Você atende pelo chat do catálogo online.
Hoje é ${hoje}. Você está falando com ${ctx.nome || "um(a) decorador(a)"}${ctx.clienteId ? " (cliente decorador(a))" : " (alguém da equipe interna testando o atendimento)"}.

QUEM VOCÊ É
- Uma pessoa de verdade do comercial: calorosa, segura, com bom gosto e olho de decoradora. Fala português do Brasil natural, como no WhatsApp profissional — frases curtas, sem listas enormes, sem jargão, sem "Como posso ajudar?" repetido, sem soar robô.
- Nunca diga que é uma IA, um robô ou um sistema, a menos que perguntem diretamente; se perguntarem, seja honesta com leveza.
- Responda primeiro o que foi perguntado, de forma natural. Uma pergunta por vez. Nada de pressão nem de empurrar o que não combina.
- Sem bordões também por escrito: não abra as mensagens sempre com "Perfeito", "Ótimo", "Claro" ou com o nome da pessoa; varie e vá direto ao ponto.
- Não afirme dados do evento que a pessoa não disse nesta conversa e que não estão no projeto aberto (ex.: data e local); se forem do histórico, confirme como pergunta.
- Use o que você já sabe da pessoa (perfil abaixo) sem anunciar que "aprendeu" ou que "vai lembrar": só aja como quem já conhece o gosto dela.
- SEJA OBJETIVA: o normal é 1 ou 2 frases curtas por mensagem (3 só numa proposta de peças). Se dá pra dizer em duas frases, não use três. Corte o que não acrescenta: nada de recapitular o que a pessoa acabou de dizer (a única recapitulação é o resumo antes de criar o pedido), de elogiar a ideia dela toda vez, de explicar o que você vai fazer, nem de oferecer várias opções de próximo passo — uma pergunta só, direta.
- Formato: Pode usar *itálico* ou **negrito** com moderação. Sem emojis em excesso (no máximo um, às vezes).

COMO CONDUZIR O ATENDIMENTO (o lado humano vem antes do produto)
O objetivo final é a pessoa sair com o projeto montado e o pedido enviado à Chiavari — mas você chega lá como uma consultora atenciosa, não como uma vendedora apressada. Siga estas etapas, no ritmo da pessoa:
1. Acolher: cumprimente com calma e deixe a pessoa falar. Não ofereça produto, categoria ou ambiente nesse momento ("vamos começar pelo lounge?" logo de cara é proibido).
2. Conhecer o evento: que tipo de evento é, para quem (a história), datas, local e número de convidados. Pergunte uma coisa por vez, com interesse genuíno, e comente o que ouviu antes da próxima pergunta. Não é questionário.
3. Entender a visão: o clima que imaginam, estilo, cores, o que já está definido, o que ainda está em aberto e o que a decoradora quer causar nos convidados. Escute mais do que fala.
4. Confirmar o entendimento: resuma em poucas palavras o que entendeu e pergunte se é isso mesmo. Só siga depois da confirmação.
5. Montar cada ambiente (lounge, bar, cerimônia...) — muitas clientes conhecem a linha inteira da Chiavari, então NÃO saia sugerindo:
   a) Primeiro pergunte se ela já sabe quais peças quer naquele ambiente.
   b) Se ela sabe: ela diz as peças e você coloca (confirmando quantidade). Sem palpite.
   c) Se não sabe: pergunte que tipo de peça e o estilo, e mostre TUDO o que está disponível desse tipo/estilo com mostrar_opcoes (o catálogo dela abre só com essas peças). Não escolha, não destaque e não cite peças por conta própria: diga só quantas opções há e deixe ela olhar e escolher.
   d) Quando ela escolher uma peça, destaque-a na tela com circular_escolha e confira em poucas palavras ("é essa que destaquei?"). Ao colocar no pedido ela também é destacada automaticamente.
   e) Só recomende peças ou combinações específicas ("eu iria de...", "combina com...") quando ela PEDIR sugestão ("o que você sugere?", "monta pra mim").
   NÃO ofereça peças, combinações, complementos nem "que tal também..." por iniciativa própria em nenhum momento.
6. Montar junto: confirme quantidades e ambientes antes de colocar no pedido; mostre fotos quando ajudarem a decidir.
7. Fechar sem pressão: revise o pedido com ela e combine o próximo passo (enviar à equipe).
Quando ela PEDIR uma sugestão ou pedir para você montar ("monta pra mim", "o que você sugere pro lounge?"), proponha já na mesma resposta: peças concretas do acervo (buscadas e mostradas em cartões), quantidades e o porquê — nunca responda "vou sugerir" no lugar da proposta.
Exceções: se a pessoa já chega com um pedido objetivo ("preciso de 20 cadeiras Tiffany para o dia 25"), atenda direto, sem obrigar a passar pelas etapas — só pergunte o que faltar. Se você já sabe algo (projeto aberto com data/local, perfil da pessoa, conversa anterior), não pergunte de novo: use e siga de onde parou. Se a pessoa mudar de assunto, acompanhe.

REGRAS DE VERDADE (MUITO IMPORTANTES)
- Só fale de itens que existem no acervo: use as ferramentas para buscar. Nunca invente peça, medida, cor, preço ou disponibilidade.
- Cada item tem um código curto (ex.: m12). Nas ferramentas use exatamente esse código; nunca mostre o código para a pessoa.
- Valores: mostre o valor de locação da ferramenta; "sob consulta" quando não houver. Frete, montagem e serviços extras quem confirma é a equipe comercial no pedido oficial.
- Nunca diga que colocou, incluiu, tirou ou trocou algo sem ter chamado a ferramenta (adicionar_ao_pedido/remover_do_pedido) e recebido ok.
- Disponibilidade: use verificar_disponibilidade. Quando uma peça pedida não tiver unidades livres na data do evento, diga com clareza e gentileza: "infelizmente o <peça> não está disponível para <data>", e na mesma resposta mostre as opções do mesmo tipo que ESTÃO livres nessa data com mostrar_opcoes (sem escolher por ela). Se houver só parte da quantidade, diga quantas restam. Nunca coloque no pedido uma peça indisponível na data.
- Disponibilidade: use verificar_disponibilidade. Quando o estoque não estiver cadastrado, diga que a equipe confirma a disponibilidade no pedido oficial (não diga que está disponível nem indisponível).
- Para acrescentar ou tirar itens do projeto use as ferramentas; confirme com naturalidade depois ("Coloquei 2 poltronas Olivia no Lounge").
- Cada pedido tem a sua conversa. Se não houver pedido aberto e a pessoa quiser tratar de um que já existe, use listar_projetos e abrir_projeto (pergunte qual, se não estiver claro). Se ela falar de outro pedido enquanto um está aberto, confirme e troque com abrir_projeto.

PEDIDO NOVO (criar_projeto) — o que você precisa saber antes de criar, perguntando com naturalidade, uma coisa por vez:
- Tipo de evento (casamento, aniversário, 15 anos, corporativo, bodas, batizado...).
- Data de ENTREGA dos móveis (horário só se ela disser — não pergunte; se ela disser só um período como "de manhã" ou "à tarde", não transforme em horário: anote como observação de entrega).
- Data do EVENTO — pode ser um dia só ou um período de vários dias (aí pergunte o primeiro e o último dia). Não presuma a data de entrega a partir da data do evento: pergunte.
- Data de COLETA (desmontagem/retirada) dos móveis (horário só se ela disser — não pergunte; período vago vai como observação de coleta).
- Local do evento: quando a pessoa disser o local, use buscar_local (procura nos locais cadastrados e, se não achar, no Google). O resultado aparece com mapa na tela dela: pergunte se é aquele mesmo. Se vierem vários (ex.: dois "Vale dos Desejos"), pergunte qual — cidade ou bairro. Só use o local depois da confirmação, passando local_ref. Quando a pessoa tocar em "É este" (mensagem que começa com "É este:"), isso JÁ é a confirmação: não pergunte de novo, guarde o local e siga. Se ela disser que não é nenhum, peça mais detalhes (cidade, bairro, rua) e procure de novo (so_google se o cadastrado não era o certo). Se não achar de jeito nenhum, use o endereço que ela disser em local_evento.
- O nome dos noivos (ou do homenageado) é OPCIONAL: pode perguntar com leveza, mas se a pessoa não disser, siga sem ele.
- NÃO pergunte cliente nem contato: o cliente é quem está falando com você (já está logado).
- Observações de entrega, de coleta e de separação: NÃO pergunte. Só preencha se a pessoa mencionar algo por conta própria (ex.: "a entrega tem que ser pelo elevador de serviço", "a coleta só depois da meia-noite", "cuidado com as almofadas").
- Muitas vezes a decoradora ainda não sabe a data exata de entrega ou de coleta. Mesmo assim ela precisa dizer uma data provável: explique com leveza que pode ser uma previsão e que, se mudar, é só avisar a equipe da Chiavari depois. Nunca crie com data inventada por você nem com "a definir".
- Antes de criar, repita em uma frase o resumo (tipo, entrega, evento, coleta, local) e peça a confirmação. Só chame criar_projeto com confirmado_pela_pessoa = true depois do "sim".
- Para mudar depois alguma dessas informações (data, local, tipo, observação), use atualizar_evento.
- Quando a pessoa pedir pra ver/abrir o pedido (a versão final, com fotos e valores), use ver_pedido com abrir=true; pra fechar, abrir=false. Funciona de qualquer lugar do catálogo. Nunca diga que abriu ou fechou o pedido sem ter chamado ver_pedido nesta resposta.
Sem pedido aberto você ainda pode sugerir peças, mostrar cartões e montar imagens normalmente.${modo === "pedido" ? "\n- Você está dentro de um PEDIDO da equipe: o projeto é o próprio pedido. Não crie projeto nem envie pedido; só monte as peças." : ""}
- O que você mostra aparece NO PRÓPRIO CATÁLOGO, na tela da pessoa. mostrar_opcoes = todas as peças disponíveis de um tipo/estilo, pra ela escolher (sem destaque). mostrar_itens = só as peças que ELA citou ou pediu pra ver (sem destaque). circular_escolha = destaca a peça que ELA escolheu, pra confirmar. Fale disso com naturalidade ("tá na sua tela", "destaquei a que você escolheu"), nunca em "cartão" nem "quer ver a foto?".
- Para sugerir peças use o acervo INTEIRO (buscar_itens / sugerir_combinacoes sem filtro de 3D). Ter ou não modelo 3D só importa para montar a imagem da composição — nunca limite as sugestões a isso nem fale de "acervo 3D" para a pessoa.

IMAGENS DE COMPOSIÇÃO
- Quando pedirem uma foto/imagem de peças juntas (ex.: "me manda uma foto do sofá Alex com a poltrona Olivia"), ou quando uma imagem ajudar a decidir, use listar_formatos e escolha o formato cadastrado que melhor recebe essas peças; depois gerar_imagem_composicao.
- Em cada posição (papel) do formato só entra um móvel do tipo que aquela posição aceita, e o móvel precisa ter modelo 3D. Preencha apenas as posições das peças pedidas/combinadas; posições não preenchidas ficam fora da imagem. Se o formato tem 2 posições de poltrona, a poltrona escolhida vai nas duas.
- Nunca prometa "vou checar", "já te mando" ou "vou ver" sem fazer isso na MESMA resposta: se perguntaram disponibilidade, chame verificar_disponibilidade agora e responda com o resultado. Data sem ano ("20 de novembro") é a próxima ocorrência a partir de hoje.
- Antes de dizer que uma peça não existe, procure com buscar_itens. Nunca diga que uma peça "não está no acervo" se ela existe.
- Se a peça existe mas NÃO tem modelo 3D (tem_modelo_3d: false), deixe claro que ela está no acervo e pode entrar no pedido — mostre-a com mostrar_itens —, mas que dela ainda não dá pra montar a foto da composição. Ofereça montar a imagem com a alternativa com 3D mais próxima (mesmo estilo/tipo), deixando claro que é uma alternativa.
- Se não existir formato que receba as peças pedidas, diga com naturalidade que dessa combinação você ainda não consegue montar a imagem e ofereça a alternativa mais próxima.
- Se a pessoa pedir para apagar uma foto que você mandou, use apagar_foto com a ref da foto (aparece na conversa). Se houver mais de uma e não estiver claro qual, pergunte antes. Apagar tira só da conversa; o que já foi para o projeto continua lá.
- A imagem é uma fotografia de estúdio feita a partir do 3D real das peças — nada é inventado. Ela leva 1 a 2 minutos e aparece aqui na conversa; avise a pessoa disso em uma frase.

ARQUIVOS E PLANTAS
- A pessoa pode mandar arquivos (planta do espaço em PDF ou foto, foto do local, referência de decoração). Você os enxerga.
- Ao receber uma planta: diga em poucas palavras o que entendeu (áreas — cerimônia, lounge, bar, pista, buffet, mesas —, a forma do espaço e, SE a planta tiver cotas ou escala, as medidas aproximadas). Nunca invente medida que a planta não mostra; sem medidas, pergunte ou trabalhe com proporções. Se estiver ilegível ou cortada, diga e peça outra.
- Depois siga o roteiro: confirme se entendeu certo e pergunte o que faltar (estilo, número de convidados, data, quais áreas ela quer montar com a Chiavari).
- Proponha a montagem área por área, no estilo pedido: quais peças e quantas, por que combinam e por que cabem no espaço (use as medidas das peças e deixe circulação). Peças disponíveis na data, se houver data. Mostre os itens.
- Só coloque no pedido depois que a pessoa aprovar a proposta (pode ser área por área). Use os nomes das áreas da planta como ambientes do pedido.
- Se pedirem para apagar um arquivo, use apagar_foto com a ref do arquivo (arquivo-xxxxxx).

ACERVO
- Categorias e subcategorias que existem (use estes nomes nos filtros; para um TIPO de peça — sofá, poltrona, puff, mesa de centro — filtre pela subcategoria): ${subcats()}.
- Estilos cadastrados nas peças: ${contar("estilo")}.
- Quando pedirem um estilo (boho, clássico, rústico...), filtre buscar_itens pelo campo estilo e por categorias reais (ex.: lounge = Estofados + Mesas Auxiliares + Aparadores). Só chame uma peça de "boho" (ou outro estilo) se o estilo dela for esse; se faltar peça de algum tipo naquele estilo, diga e ofereça a mais próxima, deixando claro o estilo dela.
- Quando ela citar peças pelo nome, mostre-as com mostrar_itens.

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
  { name: "mostrar_itens", description: "Leva a pessoa até peças específicas que ELA citou ou pediu pra ver, no próprio catálogo (sem destaque).", parameters: { type: "object", properties: { item_ids: { type: "array", items: { type: "string" } } }, required: ["item_ids"] } },
  { name: "mostrar_opcoes", description: "Abre o catálogo da pessoa só com TODAS as peças disponíveis (na data do evento) de um tipo/estilo, pra ela escolher. Use em vez de escolher peças por ela.", parameters: { type: "object", properties: {
    titulo: { type: "string", description: "Como chamar essa seleção na tela (ex.: Sofás boho, Mesas de centro)." },
    categoria: { type: "string" }, subcategoria: { type: "string", description: "Tipo de peça (sofá, poltrona, puff...)." }, estilo: { type: "string" }, material: { type: "string" }, cor: { type: "string" }, texto: { type: "string" } }, required: ["titulo"] } },
  { name: "ver_pedido", description: "Abre (abrir=true) ou fecha (abrir=false) na tela da pessoa a VERSÃO FINAL do pedido aberto: a prévia com fotos, renderizações, quantidades e valores, de qualquer lugar do catálogo.", parameters: { type: "object", properties: { abrir: { type: "boolean" } }, required: ["abrir"] } },
  { name: "circular_escolha", description: "Destaca (moldura dourada e selo Sua escolha) na tela da pessoa a(s) peça(s) que ELA escolheu, pra ela conferir que é a certa.", parameters: { type: "object", properties: { item_ids: { type: "array", items: { type: "string" } } }, required: ["item_ids"] } },
  { name: "adicionar_ao_pedido", description: "Coloca (ou define a quantidade de) um item num ambiente do projeto aberto. Cria o ambiente se não existir.", parameters: { type: "object", properties: {
    item_id: { type: "string" }, quantidade: { type: "integer", description: "Quantidade final desejada desse item no ambiente." }, ambiente: { type: "string", description: "Nome do ambiente (ex.: Lounge, Cerimônia, Bar). Vazio = ambiente ativo." } }, required: ["item_id", "quantidade"] } },
  { name: "remover_do_pedido", description: "Tira um item de um ambiente do projeto aberto.", parameters: { type: "object", properties: { item_id: { type: "string" }, ambiente: { type: "string" } }, required: ["item_id"] } },
  ...(modo === "pedido" ? [] : [
    { name: "criar_projeto", description: "Cria um pedido novo (projeto). Precisa de tipo de evento, data de entrega, data do evento (ou período), data de coleta e local, todos ditos pela pessoa.", parameters: { type: "object", properties: {
      tipo_evento: { type: "string", description: "Casamento, aniversário, 15 anos, corporativo..." },
      data_entrega: { type: "string", description: "AAAA-MM-DD (pode ser previsão dita pela pessoa)" }, hora_entrega: { type: "string", description: "HH:MM, só se ela disser um horário (\"14h\", \"às 9\"). \"De manhã\"/\"à tarde\" não é horário: vai em observacao_entrega." },
      data_evento: { type: "string", description: "AAAA-MM-DD — primeiro (ou único) dia do evento" }, data_evento_fim: { type: "string", description: "AAAA-MM-DD — último dia, só se o evento durar vários dias" },
      data_coleta: { type: "string", description: "AAAA-MM-DD (pode ser previsão dita pela pessoa)" }, hora_coleta: { type: "string", description: "HH:MM, só se ela disser um horário. \"De manhã\"/\"à noite\" não é horário: vai em observacao_coleta." },
      local_evento: { type: "string", description: "Só se não houver local_ref (local que não foi achado nem no cadastro nem no Google)." }, local_ref: { type: "string", description: "O local_ref (ex.: local2) do local que a pessoa confirmou no mapa, como veio de buscar_local." },
      noivos: { type: "string", description: "Opcional: nome dos noivos/homenageado, só se a pessoa disser." },
      observacao_entrega: { type: "string", description: "Só se a pessoa mencionar." }, observacao_coleta: { type: "string", description: "Só se a pessoa mencionar." }, observacao_separacao: { type: "string", description: "Só se a pessoa mencionar." },
      ambientes: { type: "array", items: { type: "string" } },
      confirmado_pela_pessoa: { type: "boolean", description: "true só depois de você repetir o resumo e a pessoa confirmar." } },
      required: ["tipo_evento", "data_entrega", "data_evento", "data_coleta", "confirmado_pela_pessoa"] } },
    { name: "atualizar_evento", description: "Muda dados do pedido aberto: tipo, datas (entrega, evento, coleta), horários, local, nome dos noivos ou observações de entrega/coleta/separação. Mande só o que mudou.", parameters: { type: "object", properties: {
      tipo_evento: { type: "string" }, data_entrega: { type: "string" }, hora_entrega: { type: "string" }, data_evento: { type: "string" }, data_evento_fim: { type: "string", description: "AAAA-MM-DD, ou \"\" para voltar a ser um dia só" },
      data_coleta: { type: "string" }, hora_coleta: { type: "string" }, local_evento: { type: "string" }, local_ref: { type: "string", description: "Ref do local confirmado no mapa (buscar_local)." }, noivos: { type: "string" },
      observacao_entrega: { type: "string" }, observacao_coleta: { type: "string" }, observacao_separacao: { type: "string" } } } },
    { name: "enviar_pedido", description: "Abre para a pessoa a revisão final e o envio do pedido à equipe da Chiavari (ela confirma na tela).", parameters: { type: "object", properties: { observacao: { type: "string" } } } },
  ]),
  { name: "buscar_local", description: "Procura o local do evento: primeiro nos locais cadastrados da Chiavari, depois no Google. Os resultados aparecem com mapa na tela da pessoa, pra ela confirmar qual é.", parameters: { type: "object", properties: {
    texto: { type: "string", description: "Nome do local como a pessoa disse, com cidade/bairro se ela tiver dito." },
    so_google: { type: "boolean", description: "true para procurar direto no Google (ex.: o cadastrado não era o certo)." } }, required: ["texto"] } },
  { name: "listar_projetos", description: "Os pedidos (projetos) desta pessoa: nome, tipo, data e local. Use para saber de qual pedido ela quer falar.", parameters: { type: "object", properties: {} } },
  { name: "abrir_projeto", description: "Abre um pedido existente (a conversa passa a ser a dele).", parameters: { type: "object", properties: { projeto_id: { type: "string" } }, required: ["projeto_id"] } },
  { name: "listar_formatos", description: "Formatos de composição cadastrados no 3D (lounges, mesas...), com as posições e o tipo de móvel que cada uma aceita.", parameters: { type: "object", properties: { categoria: { type: "string" } } } },
  { name: "gerar_imagem_composicao", description: "Monta um formato cadastrado com os móveis escolhidos e gera a fotografia de estúdio da composição (aparece na conversa em 1-2 min).", parameters: { type: "object", properties: {
    formato_id: { type: "string" }, pecas: { type: "array", items: { type: "object", properties: { papel: { type: "string" }, item_id: { type: "string" } }, required: ["papel", "item_id"] } },
    legenda: { type: "string", description: "Frase curta que acompanha a imagem." } }, required: ["formato_id", "pecas"] } },
  { name: "apagar_foto", description: "Apaga da conversa uma foto de composição que você mandou (a pessoa pediu para apagar). Não mexe no projeto: se a foto já foi adicionada ao projeto, continua lá. Se não estiver claro qual foto, pergunte antes.", parameters: { type: "object", properties: { ref: { type: "string", description: "Referência da foto (ex.: foto-1a2b3c), como aparece na conversa." } }, required: ["ref"] } },
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
async function historico(ctx: Ctx, limite = 40, projetoId: string | null = null) {
  let q = ctx.service.from("catalogo_assistente_mensagens").select("id,papel,conteudo,anexos,criado_em")
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono);
  q = projetoId ? q.eq("projeto_id", projetoId) : q.is("projeto_id", null);
  const { data } = await q.order("criado_em", { ascending: false }).limit(limite);
  return (data || []).reverse();
}
// Ao criar um pedido pela conversa, o que foi falado antes (sem pedido) vira a conversa dele — fica junto, como registro.
async function levarConversaParaProjeto(ctx: Ctx, projetoId: string) {
  const desde = new Date(Date.now() - 12 * 3600000).toISOString();
  await ctx.service.from("catalogo_assistente_mensagens").update({ projeto_id: projetoId })
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).is("projeto_id", null).gte("criado_em", desde);
}
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/, HORA_RE = /^\d{2}:\d{2}$/;
const CAMPOS_EVENTO = ["tipo", "data_entrega", "hora_entrega", "data_fim", "data_coleta", "hora_coleta", "obs_entrega", "obs_coleta", "obs_separacao", "endereco", "lat", "lng", "local_id", "place_id"];
function eventoLimpo(e: any) {
  const out: Record<string, string> = {};
  for (const k of CAMPOS_EVENTO) {
    const v = String(e?.[k] ?? "").trim();
    if (!v) continue;
    if (k.startsWith("data_") && !DATA_RE.test(v)) continue;
    if (k.startsWith("hora_") && !HORA_RE.test(v)) continue;
    if ((k === "lat" || k === "lng") && !/^-?\d{1,3}(\.\d+)?$/.test(v)) continue;
    out[k] = v.slice(0, k.startsWith("obs_") || k === "endereco" ? 600 : k === "place_id" ? 300 : 80);
  }
  return out;
}
// Ordem das datas: entrega ≤ 1º dia do evento ≤ último dia ≤ coleta.
function conferirDatas(data: string, ev: Record<string, string>) {
  if (ev.data_fim && ev.data_fim < data) return "O último dia do evento ficou antes do primeiro. Confirme as datas com a pessoa.";
  if (ev.data_entrega && ev.data_entrega > data) return "A entrega ficou depois do evento. Confirme com a pessoa.";
  if (ev.data_coleta && ev.data_coleta < (ev.data_fim || data)) return "A coleta ficou antes do fim do evento. Confirme com a pessoa.";
  return "";
}
// Locais: primeiro os cadastrados da empresa (locais_empresas); sem resultado bom, Google (Places, com fallback no
// Geocoding). Cada candidato tem uma ref ("c:<id>" cadastro, "g:<place_id>" Google) que a Helena usa ao criar/atualizar
// o pedido — assim o endereço e o ponto no mapa vêm da fonte, nunca digitados por ela.
const PALAVRAS_GENERICAS = new Set(["espaco", "sitio", "casa", "fazenda", "chacara", "buffet", "salao", "de", "do", "da", "dos", "das", "e", "festas", "eventos", "evento", "em", "no", "na"]);
function tokensLocal(t: string) { return normalizar(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !PALAVRAS_GENERICAS.has(w)); }
async function locaisCadastrados(ctx: Ctx, texto: string) {
  const { data } = await ctx.service.from("locais_empresas").select("id,nome_razao,endereco,numero_endereco,latitude,longitude,google_place_id,status")
    .eq("empresa_id", ctx.empresaId).limit(1000);
  const q = tokensLocal(texto);
  if (!q.length) return [];
  return (data || []).map((l: any) => {
    const alvo = new Set(tokensLocal(`${l.nome_razao || ""} ${l.endereco || ""}`));
    const nome = new Set(tokensLocal(l.nome_razao || ""));
    const acertos = q.filter((w) => alvo.has(w)).length, noNome = q.filter((w) => nome.has(w)).length;
    // Todas as palavras que importam precisam bater ("Villa Bisutti" não pode virar "Villa Imperial"); com 3+ palavras, pode faltar uma.
    const minimo = q.length <= 2 ? q.length : q.length - 1;
    return { l, nota: acertos >= minimo && noNome ? acertos / q.length : 0 };
  }).filter((x: any) => x.nota > 0 && String(x.l.status || "ativo").toLowerCase() !== "inativo").sort((a: any, b: any) => b.nota - a.nota).slice(0, 4)
    .map(({ l }: any) => ({ ref: "c:" + l.id, nome: l.nome_razao, endereco: [l.endereco, l.numero_endereco].filter(Boolean).join(", "),
      lat: l.latitude != null ? Number(l.latitude) : null, lng: l.longitude != null ? Number(l.longitude) : null, place_id: l.google_place_id || null, fonte: "cadastro" }));
}
async function locaisGoogle(texto: string) {
  const key = Deno.env.get("GOOGLE_MAPS_KEY");
  if (!key) return [];
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location" },
      body: JSON.stringify({ textQuery: texto, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 5 }) });
    const d = await r.json();
    if (r.ok && Array.isArray(d.places)) return d.places.map((p: any) => ({ ref: "g:" + p.id, nome: p.displayName?.text || String(p.formattedAddress || texto).split(",")[0], endereco: p.formattedAddress || "", lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null, place_id: p.id, fonte: "google" }));
    console.warn("places(new):", d?.error?.message || r.status);
  } catch (e) { console.warn("places(new):", e); }
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(texto)}&language=pt-BR&region=br&key=${key}`, { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    if (d.status === "OK") return d.results.slice(0, 5).map((p: any) => ({ ref: "g:" + p.place_id, nome: p.name || String(p.formatted_address || texto).split(",")[0], endereco: p.formatted_address || "", lat: p.geometry?.location?.lat ?? null, lng: p.geometry?.location?.lng ?? null, place_id: p.place_id, fonte: "google" }));
    if (d.status !== "ZERO_RESULTS") console.warn("places(legado):", d.status, d.error_message);
  } catch (e) { console.warn("places(legado):", e); }
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(texto)}&language=pt-BR&region=br&key=${key}`, { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    if (d.status === "OK") return d.results.slice(0, 3).map((p: any) => ({ ref: "g:" + p.place_id, nome: String(p.formatted_address || texto).split(",").slice(0, 2).join(","), endereco: p.formatted_address || "", lat: p.geometry?.location?.lat ?? null, lng: p.geometry?.location?.lng ?? null, place_id: p.place_id, fonte: "google" }));
  } catch (e) { console.warn("geocode:", e); }
  return [];
}
async function resolverLocal(ctx: Ctx, ref: string) {
  if (ref.startsWith("c:")) {
    const { data: l } = await ctx.service.from("locais_empresas").select("id,nome_razao,endereco,numero_endereco,latitude,longitude,google_place_id")
      .eq("empresa_id", ctx.empresaId).eq("id", ref.slice(2)).maybeSingle();
    if (!l) return null;
    return { nome: l.nome_razao, endereco: [l.endereco, l.numero_endereco].filter(Boolean).join(", "), lat: l.latitude, lng: l.longitude, local_id: l.id, place_id: l.google_place_id || "" };
  }
  if (ref.startsWith("g:")) {
    const key = Deno.env.get("GOOGLE_MAPS_KEY"), id = ref.slice(2);
    if (!key) return null;
    try {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=pt-BR`, { signal: AbortSignal.timeout(12000), headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" } });
      const p = await r.json();
      if (r.ok && p?.id) return { nome: p.displayName?.text || "", endereco: p.formattedAddress || "", lat: p.location?.latitude, lng: p.location?.longitude, local_id: "", place_id: p.id };
    } catch (e) { console.warn("place details:", e); }
    try {
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(id)}&language=pt-BR&key=${key}`, { signal: AbortSignal.timeout(12000) });
      const d = await r.json();
      const p = d.results?.[0];
      if (p) return { nome: p.address_components?.[0]?.long_name || "", endereco: p.formatted_address || "", lat: p.geometry?.location?.lat, lng: p.geometry?.location?.lng, local_id: "", place_id: id };
    } catch (e) { console.warn("geocode place:", e); }
  }
  return null;
}
// Aplica o local escolhido (ref) no evento: nome do local, endereço completo e o ponto no mapa.
async function localMostrado(ctx: Ctx, ref: string, agora: any[] = []) {
  const alvo = String(ref || "").trim();
  const bate = (l: any) => l && (l.apelido === alvo || l.ref === alvo || l.place_id === alvo || l.ref === "g:" + alvo || l.ref === "c:" + alvo);
  const daqui = agora.find(bate);
  if (daqui) return daqui;
  const { data } = await ctx.service.from("catalogo_assistente_mensagens").select("anexos").eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono)
    .contains("anexos", JSON.stringify([{ tipo: "locais" }])).order("criado_em", { ascending: false }).limit(10);
  for (const m of data || []) { const l = ((m.anexos || []).find((a: any) => a.tipo === "locais")?.locais || []).find(bate); if (l) return l; }
  return null;
}
async function aplicarLocalRef(ctx: Ctx, ref: string, ev: Record<string, string>, agora: any[] = []) {
  const visto = await localMostrado(ctx, ref, agora);
  const l = visto ? { nome: visto.nome, endereco: visto.endereco, lat: visto.lat, lng: visto.lng, local_id: String(visto.ref || "").startsWith("c:") ? visto.ref.slice(2) : "", place_id: visto.place_id || "" }
    : await resolverLocal(ctx, ref) || (!/^[cg]:/.test(ref) ? await resolverLocal(ctx, "g:" + ref) : null);
  if (!l) return null;
  ev.endereco = String(l.endereco || "").slice(0, 600);
  if (l.lat != null && l.lng != null) { ev.lat = String(Number(l.lat)); ev.lng = String(Number(l.lng)); } else { delete ev.lat; delete ev.lng; }
  if (l.local_id) ev.local_id = l.local_id; else delete ev.local_id;
  if (l.place_id) ev.place_id = l.place_id; else delete ev.place_id;
  return String(l.nome || l.endereco || "").slice(0, 160);
}

// Locais mostrados numa mensagem anterior (com a ref), pra ela usar quando a pessoa confirmar depois.
function locaisDaMensagem(m: any) {
  const l = (m.anexos || []).find((a: any) => a.tipo === "locais")?.locais || [];
  return l.length ? "\n[locais mostrados com mapa: " + l.map((x: any) => `${x.nome} — ${x.endereco} (${x.fonte === "cadastro" ? "cadastrado" : "Google"}, local_ref ${x.apelido || x.ref})`).join("; ") + "]" : "";
}
// Datas no passado (o modelo pôs o ano corrente numa data sem ano que já passou): todas vão pro ano seguinte, juntas.
// Devolve a nova data do evento, ou null se nada mudou.
function ajustarAno(ev: Record<string, string>, data: string) {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  if ((ev.data_entrega || data) >= hoje) return null;
  const mais1 = (d: string) => (DATA_RE.test(d || "") ? `${Number(d.slice(0, 4)) + 1}${d.slice(4)}` : d);
  for (const k of ["data_entrega", "data_fim", "data_coleta"]) if (ev[k]) ev[k] = mais1(ev[k]);
  return mais1(data);
}
// Data sem ano é a próxima ocorrência: o modelo às vezes põe o ano corrente numa data que já passou.
function dataNoPassado(d: string) {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return d && d < hoje ? `A data ${d.split("-").reverse().join("/")} já passou. Se a pessoa não disse o ano, ela quis dizer a próxima vez que essa data acontece (${Number(d.slice(0, 4)) + 1}): corrija TODAS as datas para o ano certo e chame a ferramenta de novo agora, sem perguntar nada à pessoa. Só pergunte se ela tiver dito explicitamente um ano que já passou.` : "";
}
const fmtData = (d: string) => (DATA_RE.test(d || "") ? d.split("-").reverse().join("/") : "");
function descreverEvento(p: any) {
  const e = p?.evento || {};
  return [
    `tipo: ${e.tipo || "não informado"}`,
    `entrega: ${fmtData(e.data_entrega) || "não informada"}${e.hora_entrega ? " às " + e.hora_entrega : ""}`,
    `evento: ${fmtData(p?.data_evento) || "sem data"}${e.data_fim ? " a " + fmtData(e.data_fim) : ""}`,
    `coleta: ${fmtData(e.data_coleta) || "não informada"}${e.hora_coleta ? " às " + e.hora_coleta : ""}`,
    `local: ${p?.local_evento || "sem local"}${e.endereco ? " (" + e.endereco + ")" : ""}${e.lat ? " [local confirmado no mapa]" : ""}`,
    ...(e.obs_entrega ? [`obs. entrega: ${e.obs_entrega}`] : []), ...(e.obs_coleta ? [`obs. coleta: ${e.obs_coleta}`] : []), ...(e.obs_separacao ? [`obs. separação: ${e.obs_separacao}`] : []),
  ].join("; ");
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
    id: String(p.id), noivos: String(p.noivos || "").slice(0, 120), data_evento: String(p.data_evento || "").slice(0, 10), evento: eventoLimpo(p.evento),
    local_evento: String(p.local_evento || "").slice(0, 160), status: String(p.status || ""), ambiente_ativo: p.ambiente_ativo ? String(p.ambiente_ativo) : null,
    ambientes: (Array.isArray(p.ambientes) ? p.ambientes : []).slice(0, 30).map((a: any) => ({
      id: String(a.id), nome: String(a.nome || "").slice(0, 60),
      itens: (Array.isArray(a.itens) ? a.itens : []).slice(0, 200).map((i: any) => { const it = acervo.find((x) => x.id === String(i.item_id)); return { item_id: String(i.item_id), quantidade: Number(i.quantidade) || 1, nome: it?.nome, ref: it?.ref }; }),
    })),
  };
}

// Executor das ferramentas da Helena — o mesmo para a conversa por texto e para a ligação (voz em tempo real).
// E = estado da conversa: acervo, modo, perfil, projeto (retrato que vai se atualizando), formatos, ações para a tela,
// itens a mostrar em cartão e o mapa de disponibilidade por data.
function criarExecutor(ctx: Ctx, E: any) {
  const itemValido = (id: unknown) => acharItem(E.acervo, id);
  return async (nome: string, a: any): Promise<unknown> => {
    switch (nome) {
      case "buscar_itens": {
        // Com projeto numa data, a busca já filtra pelo que está livre nesse dia (a não ser que peça incluir_indisponiveis).
        const data = /^\d{4}-\d{2}-\d{2}$/.test(String(a?.disponivel_em || "")) ? String(a.disponivel_em) : (a?.incluir_indisponiveis ? "" : E.dataDoEvento);
        if (data && !a?.disponivel_em) a = { ...a, disponivel_em: data };
        if (data && !E.mapas.has(data)) E.mapas.set(data, await mapaDisponibilidade(ctx, data));
        return buscarItens(E.acervo, a, data ? E.mapas.get(data) : null);
      }
      case "listar_categorias": return listarCategorias(E.acervo);
      case "sugerir_combinacoes": return sugerirCombinacoes(E.acervo, a, E.perfil);
      case "verificar_disponibilidade": return verificarDisponibilidade(ctx, E.acervo, a, E.projeto?.data_evento || null);
      case "mostrar_itens": {
        const ids = (Array.isArray(a?.item_ids) ? a.item_ids : []).map((x: unknown) => itemValido(x)?.id).filter(Boolean).slice(0, 8) as string[];
        ids.forEach((id: string) => E.mostrados.add(id));
        return { mostrados: ids.length, na_tela: "o catálogo foi até elas (sem destaque)" };
      }
      case "mostrar_opcoes": {
        const data = E.dataDoEvento;
        if (data && !E.mapas.has(data)) E.mapas.set(data, await mapaDisponibilidade(ctx, data));
        const ids = opcoesDisponiveis(E.acervo, a, data ? E.mapas.get(data) : null);
        if (!ids.length) return { opcoes: 0, aviso: "Nada disponível com esse filtro. Diga isso e pergunte se ela quer ver outro tipo ou estilo." };
        E.opcoes = { titulo: String(a?.titulo || "Opções").slice(0, 60), ids };
        const nomes = new Set(ids.map((id) => itemValido(id)!.nome.replace(/\s+(P|M|G|GG)$/i, "")));
        E.opcoes.total = nomes.size;
        // Com o código de cada peça: quando ela escolher, circular_escolha usa exatamente esse id.
        return { opcoes: nomes.size, ...(data ? { disponiveis_em: data } : {}), na_tela: "o catálogo dela está mostrando todas essas opções, sem destaque — deixe ela escolher",
          pecas: ids.map((id) => { const i = itemValido(id)!; return { id: i.ref, nome: i.nome, ...(i.cor ? { cor: i.cor } : {}) }; }) };
      }
      case "circular_escolha": {
        const ids = (Array.isArray(a?.item_ids) ? a.item_ids : []).map((x: unknown) => itemValido(x)?.id).filter(Boolean).slice(0, 4) as string[];
        if (!ids.length) return { erro: "Informe a peça escolhida." };
        ids.forEach((id: string) => E.circular.add(id));
        return { destacadas: ids.map((id) => itemValido(id)!.nome) };
      }
      case "adicionar_ao_pedido": case "remover_do_pedido": {
        const item = itemValido(a?.item_id);
        if (!item) return { erro: "Item não existe no acervo." };
        if (!E.projeto) return { erro: E.modo === "pedido" ? "O pedido ainda não está pronto." : "Não há projeto aberto. Peça noivos/cliente, data e local e use criar_projeto." };
        const ambNome = String(a?.ambiente || "").trim().slice(0, 60);
        const amb = ambNome ? E.projeto.ambientes.find((x: any) => normalizar(x.nome) === normalizar(ambNome)) : E.projeto.ambientes.find((x: any) => x.id === E.projeto!.ambiente_ativo) || E.projeto.ambientes[0];
        const quantidade = nome === "remover_do_pedido" ? 0 : Math.max(1, Math.min(999, Math.round(Number(a?.quantidade) || 1)));
        if (!amb && !ambNome && nome === "adicionar_ao_pedido") return { erro: "O projeto não tem ambientes. Informe o nome do ambiente (ex.: Lounge)." };
        if (!amb && nome === "remover_do_pedido") return { erro: "Ambiente não encontrado no projeto." };
        // Trava de disponibilidade na data do evento: conta a mesma peça nos OUTROS ambientes do pedido também.
        const dataEvento = /^\d{4}-\d{2}-\d{2}$/.test(String(E.projeto.data_evento || "")) ? E.projeto.data_evento : "";
        if (quantidade && dataEvento) {
          if (!E.mapas.has(dataEvento)) E.mapas.set(dataEvento, await mapaDisponibilidade(ctx, dataEvento));
          const d = E.mapas.get(dataEvento)!.get(item.id);
          const outros = E.projeto.ambientes.filter((x: any) => x !== amb).reduce((t: number, x: any) => t + x.itens.filter((i: any) => i.item_id === item.id).reduce((q: number, i: any) => q + i.quantidade, 0), 0);
          if (d && d.total && quantidade + outros > d.livre) {
            const restam = Math.max(0, d.livre - outros);
            return { erro: restam
              ? `INDISPONÍVEL nessa quantidade: em ${dataEvento} só há ${restam} unidade(s) livre(s) de ${item.nome}${outros ? ` (já há ${outros} em outro ambiente deste pedido)` : ""}. Nada foi adicionado. Diga isso à pessoa e pergunte se quer essa quantidade ou uma alternativa.`
              : `INDISPONÍVEL: ${item.nome} não tem unidades livres em ${dataEvento}. Nada foi adicionado. Diga à pessoa que infelizmente não está disponível nessa data e ofereça alternativas disponíveis (buscar_itens com disponivel_em).` };
          }
        }
        E.acoes.push({ tipo: "quantidade", item_id: item.id, quantidade, ambiente: amb?.nome || ambNome });
        if (quantidade) E.circular?.add(item.id);
        // Mantém o retrato do projeto em dia para as próximas ferramentas desta mesma resposta.
        let alvo = amb;
        if (!alvo) { alvo = { id: `novo:${ambNome}`, nome: ambNome, itens: [] }; E.projeto.ambientes.push(alvo); }
        alvo.itens = alvo.itens.filter((i: any) => i.item_id !== item.id);
        if (quantidade) { alvo.itens.push({ item_id: item.id, quantidade, nome: item.nome, ref: item.ref }); registrarEscolha(E.perfil, item); E.perfilMudou = true; }
        return { ok: true, item: item.nome, ambiente: alvo.nome, quantidade_no_ambiente: quantidade };
      }
      case "criar_projeto": {
        if (E.modo === "pedido") return { erro: "Indisponível dentro do pedido." };
        let data = String(a?.data_evento || "").trim();
        const tipo = String(a?.tipo_evento || "").trim();
        let local = String(a?.local_evento || "").trim();
        const noivos = String(a?.noivos || "").trim();
        const ev = eventoLimpo({ tipo, data_entrega: a?.data_entrega, hora_entrega: a?.hora_entrega, data_fim: a?.data_evento_fim, data_coleta: a?.data_coleta, hora_coleta: a?.hora_coleta,
          obs_entrega: a?.observacao_entrega, obs_coleta: a?.observacao_coleta, obs_separacao: a?.observacao_separacao });
        if (a?.local_ref) { const nomeLocal = await aplicarLocalRef(ctx, String(a.local_ref), ev, [...(E.locais || []), ...(E.perfil?._locais || [])]); if (!nomeLocal) return { erro: "Não achei esse local. Use buscar_local de novo." }; local = nomeLocal; }
        const faltam = [!tipo && "tipo de evento", !ev.data_entrega && "data de entrega", !DATA_RE.test(data) && "data do evento", !ev.data_coleta && "data de coleta", !local && "local (use buscar_local e confirme no mapa)"].filter(Boolean);
        if (faltam.length) return { erro: `Ainda falta: ${faltam.join(", ")}. Pergunte à pessoa (datas no formato AAAA-MM-DD; entrega e coleta podem ser uma previsão que ela disser).` };
        // Trava: nada de projeto com dado inventado/provisório (já aconteceu em teste: local "(definir)" e o nome da decoradora como noivos).
        if (local.length < 3 || /defin|confirmar|\?|^-+$|^n\/?a$|sem local/i.test(local)) return { erro: "O local ainda não foi informado. Pergunte o local do evento antes de criar." };
        if (noivos && ctx.nome && normalizar(noivos) === normalizar(ctx.nome)) return { erro: "Esse é o nome do(a) decorador(a), não dos noivos. Deixe o nome dos noivos em branco ou pergunte." };
        if (ev.data_fim === data) delete ev.data_fim;
        const anoAjustado = DATA_RE.test(data) ? ajustarAno(ev, data) : null;
        if (anoAjustado) data = anoAjustado;
        const problema = conferirDatas(data, ev) || dataNoPassado(ev.data_entrega || data);
        if (problema) return { erro: problema };
        if (!a?.confirmado_pela_pessoa) return { erro: "Repita o resumo (tipo, entrega, evento, coleta e local) e peça a confirmação da pessoa antes de criar." };
        const ambientes = (Array.isArray(a?.ambientes) ? a.ambientes : []).map((x: unknown) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 12);
        const criado = await ctx.rpc("projeto_criar", { p_noivos: noivos || null, p_data_evento: data, p_local_evento: local, p_ambientes: ambientes, p_evento: ev });
        const dados = criado?.dados || {};
        E.projeto = { id: String(criado.id), noivos: String(criado.noivos || noivos), data_evento: data, local_evento: local, evento: ev, status: "rascunho", ambiente_ativo: dados.ambientes?.[0]?.id || null,
          ambientes: (dados.ambientes || []).map((x: any) => ({ id: String(x.id), nome: x.nome, itens: [] })) };
        E.projetoCriado = E.projeto.id;
        await levarConversaParaProjeto(ctx, E.projeto.id);
        E.acoes.push({ tipo: "usar_projeto", projeto_id: E.projeto.id });
        return { ok: true, projeto: E.projeto.noivos, ambientes: E.projeto.ambientes.map((x: any) => x.nome),
          ...(anoAjustado ? { observacao: `As datas tinham ficado num ano que já passou; foram gravadas em ${anoAjustado.slice(0, 4)}. Diga isso à pessoa numa frase curta.` } : {}) };
      }
      case "atualizar_evento": {
        if (E.modo === "pedido") return { erro: "Dentro do pedido da equipe, os dados do evento são editados na tela do pedido." };
        if (!E.projeto) return { erro: "Não há pedido aberto." };
        const atual = { ...(E.projeto.evento || {}) };
        const mapa: Record<string, string> = { tipo_evento: "tipo", data_entrega: "data_entrega", hora_entrega: "hora_entrega", data_evento_fim: "data_fim", data_coleta: "data_coleta", hora_coleta: "hora_coleta",
          observacao_entrega: "obs_entrega", observacao_coleta: "obs_coleta", observacao_separacao: "obs_separacao" };
        const mudou: string[] = [];
        for (const [de, para] of Object.entries(mapa)) if (a && de in a) { atual[para] = String(a[de] ?? "").trim(); mudou.push(de); }
        const ev = eventoLimpo(atual);
        for (const k of ["data_entrega", "data_fim", "data_coleta", "hora_entrega", "hora_coleta"]) if (atual[k] && !ev[k]) return { erro: `Formato inválido em ${k} (datas AAAA-MM-DD, horários HH:MM).` };
        let data = a?.data_evento !== undefined && String(a.data_evento).trim() ? String(a.data_evento).trim() : E.projeto.data_evento;
        if (!DATA_RE.test(data)) return { erro: "Data do evento inválida (AAAA-MM-DD)." };
        const anoAjustado = ["data_evento", "data_entrega", "data_coleta", "data_evento_fim"].some((k) => a && k in a) ? ajustarAno(ev, data) : null;
        if (anoAjustado) data = anoAjustado;
        if (ev.data_fim === data) delete ev.data_fim;
        const problema = conferirDatas(data, ev);
        if (problema) return { erro: problema };
        let local = a?.local_evento !== undefined && String(a.local_evento).trim() ? String(a.local_evento).trim().slice(0, 160) : E.projeto.local_evento;
        if (a?.local_ref) { const nomeLocal = await aplicarLocalRef(ctx, String(a.local_ref), ev, [...(E.locais || []), ...(E.perfil?._locais || [])]); if (!nomeLocal) return { erro: "Não achei esse local. Use buscar_local de novo." }; local = nomeLocal; }
        else if (a?.local_evento !== undefined && String(a.local_evento).trim()) { delete ev.endereco; delete ev.lat; delete ev.lng; delete ev.local_id; delete ev.place_id; }
        const noivos = a?.noivos !== undefined ? String(a.noivos || "").trim().slice(0, 120) : undefined;
        E.projeto = { ...E.projeto, data_evento: data, local_evento: local, evento: ev, ...(noivos !== undefined && noivos ? { noivos } : {}) };
        E.acoes.push({ tipo: "atualizar_evento", data_evento: data, local_evento: local, evento: ev, ...(noivos !== undefined ? { noivos } : {}) });
        return { ok: true, pedido: descreverEvento(E.projeto) };
      }
      case "buscar_local": {
        const texto = String(a?.texto || "").trim().slice(0, 160);
        if (texto.length < 3) return { erro: "Diga o nome do local." };
        const cad = a?.so_google ? [] : await locaisCadastrados(ctx, texto);
        const google = cad.length ? [] : await locaisGoogle(texto);
        const lista = [...cad, ...google].slice(0, 5);
        if (!lista.length) return { encontrados: 0, observacao: "Não achei esse local nem no cadastro nem no Google. Peça o endereço completo (rua, número, cidade) e procure de novo." };
        lista.forEach((l: any, i: number) => { l.apelido = "local" + (i + 1); });
        E.locais = lista;
        // Guardado no perfil também: na ligação, cada ferramenta é uma chamada separada ao servidor e a confirmação
        // ("É este") chega depois, sem nada disso na conversa gravada.
        E.perfil = { ...(E.perfil || {}), _locais: lista }; E.perfilMudou = true;
        return { encontrados: lista.length, fonte: cad.length ? "cadastro" : "google", locais: lista.map((l: any) => ({ local_ref: l.apelido, nome: l.nome, endereco: l.endereco })),
          observacao: (cad.length ? "Vieram dos locais CADASTRADOS da Chiavari. " : "Vieram do Google Maps (não são locais cadastrados; não diga que estão cadastrados). ") + (lista.length > 1 ? "Os locais aparecem com mapa na tela. Pergunte qual é (cidade/bairro), sem ler todos os endereços inteiros." : "O local aparece com mapa na tela. Pergunte se é esse mesmo.") };
      }
      case "listar_projetos": {
        if (E.modo === "pedido") return { erro: "Dentro do pedido da equipe não dá para trocar de pedido." };
        const lista = (await ctx.rpc("projeto_listar", {})) || [];
        const hoje = new Date().toISOString().slice(0, 10);
        return { pedidos: lista.filter((p: any) => String(p.data_evento || "") >= hoje || p.id === E.projeto?.id).slice(0, 30)
          .map((p: any) => ({ id: p.id, nome: p.noivos, tipo: p.evento?.tipo || "", data: p.data_evento, local: p.local_evento, status: p.status, aberto: p.id === E.projeto?.id })) };
      }
      case "abrir_projeto": {
        if (E.modo === "pedido") return { erro: "Dentro do pedido da equipe não dá para trocar de pedido." };
        const id = String(a?.projeto_id || "");
        const p = await ctx.rpc("projeto_obter", { p_id: id }).catch(() => null);
        if (!p?.id) return { erro: "Pedido não encontrado. Use listar_projetos." };
        E.projeto = limparProjeto({ ...p, evento: p.evento || p.dados?.evento, ambientes: (p.dados?.ambientes || []), ambiente_ativo: p.dados?.ambientes?.[0]?.id }, E.acervo);
        E.dataDoEvento = DATA_RE.test(String(p.data_evento || "")) ? String(p.data_evento) : "";
        E.acoes.push({ tipo: "usar_projeto", projeto_id: id });
        return { ok: true, pedido: `${p.noivos} — ${descreverEvento(E.projeto)}`, itens: (E.projeto?.ambientes || []).map((x: any) => `${x.nome}: ${x.itens.length} peça(s)`) };
      }
      case "ver_pedido": {
        const abrir = a?.abrir !== false;
        if (abrir && !E.projeto) return { erro: "Não há pedido aberto. Pergunte qual pedido (listar_projetos/abrir_projeto) ou crie um." };
        E.acoes.push({ tipo: "ver_pedido", abrir });
        return { ok: true, na_tela: abrir ? "a versão final do pedido está aberta na tela dela" : "a versão final do pedido foi fechada" };
      }
      case "enviar_pedido": {
        if (!E.projeto) return { erro: "Não há projeto aberto." };
        const total = E.projeto.ambientes.reduce((s: number, x: any) => s + x.itens.length, 0);
        if (!total) return { erro: "O projeto ainda não tem itens." };
        E.acoes.push({ tipo: "enviar_pedido", observacao: String(a?.observacao || "").slice(0, 1000) });
        return { ok: true, observacao: "A revisão do pedido foi aberta na tela; a pessoa confirma o envio por lá." };
      }
      case "listar_formatos": {
        E.formatos ||= await carregarFormatos(ctx, E.acervo);
        // Sempre todos (são poucos): formato sem categoria cairia fora de um filtro e é justamente o da equipe.
        return { formatos: (E.formatos as Formato[]).map((f) => formatoParaIA(f, E.acervo)) };
      }
      case "gerar_imagem_composicao": {
        E.formatos ||= await carregarFormatos(ctx, E.acervo);
        const f = (E.formatos as Formato[]).find((x) => x.id === String(a?.formato_id));
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
        E.acoes.push({ tipo: "renderizar", formato_id: f.id, formato_nome: f.nome, selecao, legenda: String(a?.legenda || "").slice(0, 200), itens });
        return { ok: true, observacao: "A imagem está sendo gerada (1 a 2 minutos) e aparece na conversa quando ficar pronta." };
      }
      case "apagar_foto": {
        const r = await apagarFoto(ctx, String(a?.ref || ""));
        if ("erro" in r) return r;
        E.acoes.push({ tipo: "apagar_imagem", mensagem_id: r.id });
        return { ok: true, observacao: "A foto foi apagada da conversa. Se ela tinha sido adicionada ao projeto, continua lá." };
      }
      case "atualizar_perfil": {
        E.perfil = mesclarPerfil(E.perfil, a); E.perfilMudou = true;
        return { ok: true };
      }
    }
    return { erro: "Ferramenta desconhecida" };
  };
}

// Lembrete final (vem por último no prompt, que é o que o modelo mais segue): respostas curtas e diretas.
const OBJETIVIDADE = `

ANTES DE RESPONDER, CONFIRA (vale mais que qualquer exemplo acima):
- No máximo 2 frases curtas (3 só quando estiver propondo peças). Se der pra dizer em menos palavras, diga em menos.
- No máximo UMA pergunta por mensagem.
- Não pergunte de novo nem "confirme" o que a pessoa já respondeu nesta conversa; use e siga.
- Horário/período de entrega e coleta: é opcional. Se a pessoa não disser junto com a data, não pergunte.
- Sem abrir com "Perfeito", "Ótimo", "Claro" ou o nome da pessoa; sem repetir o que ela acabou de dizer.
- Não ofereça peças, complementos nem combinações que ela não pediu ("quer complementar com poltronas?", "que tal uma mesa?" são proibidos). Depois de colocar uma peça, pergunte só o que falta sobre ela (quantidade, ambiente) ou o que ela quer fazer agora.`;

async function conversar(ctx: Ctx, body: any) {
  const arquivos = arquivosValidos(ctx, body?.arquivos);
  const mensagem = String(body?.mensagem || "").trim().slice(0, 2000);
  if (!mensagem && !arquivos.length) return json({ erro: "Mensagem vazia" }, 400);
  const modo = body?.modo === "pedido" ? "pedido" : "catalogo";

  // Freio simples contra uso abusivo: até 20 mensagens por minuto por pessoa.
  const umMinuto = new Date(Date.now() - 60000).toISOString();
  const { count } = await ctx.service.from("catalogo_assistente_mensagens").select("id", { count: "exact", head: true })
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).eq("papel", "user").gte("criado_em", umMinuto);
  if ((count || 0) >= 20) return json({ erro: "Muitas mensagens em pouco tempo. Aguarde um instante." }, 429);

  const [acervo, perfilInicial, passadas, { data: empresa }] = await Promise.all([
    carregarAcervo(ctx), carregarPerfil(ctx), historico(ctx, 24, (body?.projeto?.id && String(body.projeto.id)) || null),
    ctx.service.from("empresas").select("nome").eq("id", ctx.empresaId).maybeSingle(),
  ]);
  const perfil = perfilInicial;
  const projeto = limparProjeto(body?.projeto, acervo);
  const formatos: Formato[] | null = await carregarFormatos(ctx, acervo);
  const acoes: any[] = [];
  const mostrados = new Set<string>();

  const porAudio = Boolean(body?.por_audio);
  const pergunta = await gravarMensagem(ctx, "user", mensagem, [...(porAudio ? [{ tipo: "audio" }] : []), ...arquivos], projeto?.id || null);

  const mapas = new Map<string, Map<string, { total: number; livre: number }>>();
  const dataDoEvento = /^\d{4}-\d{2}-\d{2}$/.test(String(projeto?.data_evento || "")) ? String(projeto!.data_evento) : "";
  if (dataDoEvento) mapas.set(dataDoEvento, await mapaDisponibilidade(ctx, dataDoEvento));
  const messages: any[] = [
    { role: "system", content: promptDoSistema({ ctx, perfil, projeto, modo, empresa: empresa?.nome, formatos, acervo, dispEvento: dataDoEvento ? mapas.get(dataDoEvento) : null }) + OBJETIVIDADE },
    ...passadas.map((m: any) => ({ role: m.papel, content: textoComArquivos(m) + locaisDaMensagem(m) + ((m.anexos || []).some((a: any) => a.tipo === "imagem") ? `\n[foto da composição enviada na conversa — ref ${refFoto(m.id)}: ${((m.anexos || []).find((a: any) => a.tipo === "imagem")?.itens || []).join(", ")}]` : "") })),
    { role: "user", content: porAudio ? `[mensagem de voz transcrita — pode ter pequenos erros de transcrição em nomes; interprete pelo contexto e pelo acervo]\n${mensagem}` : mensagem },
  ];
  // Arquivos (planta em PDF/foto): o modelo enxerga os da mensagem atual e os de até 2 mensagens anteriores com arquivo.
  {
    const comArquivo = passadas.filter((m: any) => m.papel === "user" && (m.anexos || []).some((a: any) => a.tipo === "arquivo")).slice(-2).map((m: any) => m.id);
    for (const id of comArquivo) {
      const i = passadas.findIndex((m: any) => m.id === id);
      const m = passadas[i];
      messages[i + 1] = { role: "user", content: [{ type: "text", text: textoComArquivos(m) || "[arquivo]" }, ...(await partesDosArquivos(ctx, m.anexos))] };
    }
    if (arquivos.length) {
      const atual = messages[messages.length - 1];
      const texto = (atual.content || "") + "\n" + arquivos.map((a) => `[arquivo enviado agora: ${a.nome}]`).join("\n");
      messages[messages.length - 1] = { role: "user", content: [{ type: "text", text: texto.trim() }, ...(await partesDosArquivos(ctx, arquivos))] };
    }
  }
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

  const E: any = { acervo, modo, perfil, perfilMudou: false, projeto, formatos, acoes, mostrados, mapas, dataDoEvento, circular: new Set<string>(), opcoes: null };
  // A peça que a pessoa nomeou por inteiro ("quero o Sofá Modular Duo - 2 Módulos Horizontal") é circulada na tela dela
  // pra conferir que é essa (pedido do usuário) — sem depender do modelo lembrar de circular_escolha. Só o nome completo;
  // se um nome achado estiver dentro de outro também achado, vale o mais longo.
  {
    const limpo = (v: string) => normalizar(v).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const texto = " " + limpo(mensagem) + " ";
    const inteiras = citadas.filter((i) => texto.includes(" " + limpo(i.nome).replace(/\s+(p|m|g|gg)$/, "") + " "));
    const nomes = inteiras.map((i) => limpo(i.nome));
    inteiras.filter((_, n) => !nomes.some((o, k) => k !== n && o.length > nomes[n].length && o.includes(nomes[n]))).slice(0, 3).forEach((i) => E.circular.add(i.id));
    if (E.circular.size) messages.splice(messages.length - 1, 0, { role: "system", content: "O sistema já destacou na tela dela (moldura dourada, selo Sua escolha): " + [...E.circular].map((id) => acharItem(acervo, id)!.nome).join(", ") + ". Não precisa chamar circular_escolha pra essas." });
  }
  const executar = criarExecutor(ctx, E);

  const gostos = extrairGostos(mensagem, E.perfil);
  let resposta = "";
  // Pedido de ação ("coloca", "inclui", "tira", "quero o sofá X no lounge"...): na 1ª rodada a ferramenta é obrigatória —
  // em teste ela respondeu "vou incluir" sem chamar nada (não incluiu nem conferiu a data).
  const pedeAcao = /\b(coloc|inclu|adicion|acrescent|bota|bote|poe|põe|ponha|tira|tire|remov|troca|troque|abr(e|a|ir)|fech(a|e|ar)|quero (o|a|os|as|um|uma|\d))/i.test(normalizar(mensagem));
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
  if (mostrados.size < 8 && !E.opcoes) {
    const textoResposta = normalizar(resposta);
    const candidatos = [...encontrados].map((id) => itemValido(id)!).filter((i) => !mostrados.has(i.id))
      .filter((i) => textoResposta.includes(normalizar(i.nome)));
    const vistosNome = new Set<string>();
    for (const i of candidatos) { const k = normalizar(i.nome); if (vistosNome.has(k) || mostrados.size >= 8) continue; vistosNome.add(k); mostrados.add(i.id); }
  }
  const aprendido = await gostos;
  if (aprendido) { E.perfil = mesclarPerfil(E.perfil, aprendido); E.perfilMudou = true; }
  if (E.perfilMudou) await gravarPerfil(ctx, E.perfil);
  const dispCartoes = dataDoEvento ? mapas.get(dataDoEvento) : null;
  const itens = [...mostrados].map((id) => { const i = itemValido(id)!; const d = dispCartoes?.get(i.id); return { id: i.id, nome: i.nome, foto: i.foto, medidas: i.medidas, categoria: i.categoria, ...(d && d.total ? { livres: d.livre, data: dataDoEvento } : {}) }; });
  const anexos = [
    ...(itens.length ? [{ tipo: "itens", itens }] : []),
    ...(E.opcoes ? [{ tipo: "opcoes", titulo: E.opcoes.titulo, ids: E.opcoes.ids, total: E.opcoes.total }] : []),
    ...(E.circular.size ? [{ tipo: "escolha", ids: [...E.circular] }] : []),
    ...(E.locais?.length ? [{ tipo: "locais", locais: E.locais }] : []),
    ...acoes.filter((x) => x.tipo === "renderizar").map((x) => ({ tipo: "renderizando", formato: x.formato_nome, itens: x.itens })),
  ];
  const gravada = await gravarMensagem(ctx, "assistant", resposta, anexos, E.projeto?.id || null);
  return json({ mensagem: gravada, pergunta, acoes, nome: NOME_ASSISTENTE, ...(body?.debug ? { rastro } : {}) });
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

// Arquivos enviados pela pessoa (planta em PDF ou foto). O navegador sobe direto pro Storage com uma URL assinada
// (ação arquivo_upload) e depois manda só o caminho; aqui só aceitamos caminhos da pasta da própria pessoa.
const TIPOS_ARQUIVO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const pastaArquivos = (ctx: Ctx) => `${ctx.empresaId}/${ctx.dono.replace(":", "-")}/arquivos/`;
function arquivosValidos(ctx: Ctx, lista: unknown) {
  return (Array.isArray(lista) ? lista : []).slice(0, 4).map((a: any) => ({
    tipo: "arquivo", path: String(a?.path || ""), mime: String(a?.mime || ""), nome: String(a?.nome || "arquivo").slice(0, 120),
  })).filter((a) => a.path.startsWith(pastaArquivos(ctx)) && !a.path.includes("..") && TIPOS_ARQUIVO[a.mime])
    .map((a) => ({ ...a, url: ctx.service.storage.from(BUCKET).getPublicUrl(a.path).data.publicUrl }));
}
function textoComArquivos(m: any) {
  const arqs = (m.anexos || []).filter((a: any) => a.tipo === "arquivo");
  return String(m.conteudo || "") + arqs.map((a: any) => `\n[arquivo enviado: ${a.nome} — ref ${refFoto(m.id).replace("foto-", "arquivo-")}]`).join("");
}
async function partesDosArquivos(ctx: Ctx, anexos: any[]) {
  const partes: any[] = [];
  for (const a of (anexos || []).filter((x: any) => x.tipo === "arquivo")) {
    if (a.mime === "application/pdf") {
      const { data } = await ctx.service.storage.from(BUCKET).download(a.path);
      if (!data) continue;
      const bytes = new Uint8Array(await data.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      partes.push({ type: "file", file: { filename: /\.pdf$/i.test(a.nome) ? a.nome : a.nome + ".pdf", file_data: `data:application/pdf;base64,${btoa(bin)}` } });
    } else partes.push({ type: "image_url", image_url: { url: a.url, detail: "high" } });
  }
  return partes;
}
async function urlDeUpload(ctx: Ctx, body: any) {
  const mime = String(body?.mime || "");
  if (!TIPOS_ARQUIVO[mime]) return json({ erro: "Envie uma imagem (JPG, PNG) ou um PDF." }, 400);
  if (Number(body?.tamanho) > 20 * 1024 * 1024) return json({ erro: "Arquivo grande demais (máximo 20 MB)." }, 400);
  const path = `${pastaArquivos(ctx)}${crypto.randomUUID()}.${TIPOS_ARQUIVO[mime]}`;
  const { data, error } = await ctx.service.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return json({ erro: error?.message || "Não consegui preparar o envio." }, 500);
  return json({ path, token: data.token, url: ctx.service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
}

// Fotos da conversa: a referência curta ("foto-1a2b3c" = começo do id da mensagem) é o que o modelo vê e usa.
const refFoto = (id: unknown) => "foto-" + String(id || "").replace(/-/g, "").slice(0, 6);
async function apagarFoto(ctx: Ctx, ref: string): Promise<{ id: string } | { erro: string }> {
  const prefixo = String(ref).replace(/^(foto|arquivo)-/i, "").trim().toLowerCase();
  const { data } = await ctx.service.from("catalogo_assistente_mensagens").select("id,anexos")
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).order("criado_em", { ascending: false }).limit(300);
  const fotos = (data || []).filter((m: any) => (m.anexos || []).some((x: any) => x.tipo === "imagem" || x.tipo === "arquivo"));
  const alvo = prefixo.length === 36 ? fotos.find((m: any) => m.id === prefixo)
    : fotos.find((m: any) => m.id.replace(/-/g, "").startsWith(prefixo));
  if (!alvo || !prefixo) return { erro: "Não achei essa foto na conversa." };
  const caminhos: string[] = [];
  for (const x of alvo.anexos || []) for (const u of [x.url, x.cena_url]) {
    const m = String(u || "").match(/\/object\/public\/catalogo-assistente\/(.+)$/);
    if (m) caminhos.push(decodeURIComponent(m[1].split("?")[0]));
  }
  if (caminhos.length) await ctx.service.storage.from(BUCKET).remove(caminhos);
  await ctx.service.from("catalogo_assistente_mensagens").delete().eq("id", alvo.id).eq("dono", ctx.dono);
  return { id: alvo.id };
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

// ---------------------------------------------------------------------------------------------------------------
// LIGAÇÃO (voz em tempo real). O navegador fala direto com a OpenAI por WebRTC (é o que dá ~1 s de resposta e deixa a
// pessoa interromper); a chave de verdade nunca sai daqui: o servidor entrega uma chave temporária da sessão, já com as
// instruções e as ferramentas. Cada ferramenta que ela chama durante a ligação volta pra cá (ação "ferramenta") e roda
// no MESMO executor da conversa por texto — mesmas regras, inclusive a trava de peça esgotada na data do evento.
const MODELO_VOZ = Deno.env.get("CATALOGO_ASSISTENTE_REALTIME_MODEL") || "gpt-realtime-2.1";
const VOZ = Deno.env.get("CATALOGO_ASSISTENTE_VOZ") || "marin";

const JEITO_DE_FALAR = `

AGORA É UMA LIGAÇÃO DE VOZ (isto vale acima das regras de formato de texto)
- Você está ao telefone com a pessoa. Fale como uma consultora brasileira experiente: calorosa, segura, ritmo de conversa, entonação viva, ênfase nas palavras que importam e pausas naturais.
- VÍCIOS DE LINGUAGEM SÃO PROIBIDOS. Não comece as respostas sempre do mesmo jeito; não use bordões nem muletas ("olha", "perfeito", "ótimo", "maravilha", "com certeza", "prontinho", "deixa eu ver aqui", "só um segundinho", "entendi", "show"). No máximo uma interjeição curta a cada várias falas, e nunca a mesma duas vezes na ligação. Não repita o nome da pessoa a toda hora (só no cumprimento e, se fizer sentido, uma vez mais). Não repita o que a pessoa acabou de dizer antes de responder. Varie as palavras como uma pessoa real varia.
- Seja objetiva: uma frase curta sempre que der, no máximo duas por vez. Nada de recapitular o que a pessoa disse nem de explicar o que vai fazer e então pare e deixe a pessoa falar. Nada de listas, tópicos, markdown, asteriscos ou códigos. Se houver várias peças, cite no máximo três.
- NUNCA RESPONDA A SI MESMA: quando fizer uma pergunta, termine a fala ali e espere a pessoa responder — não sugira a resposta, não continue falando, não pergunte e responda em seguida. Se você ainda vai consultar algo, não faça pergunta antes.
- Ferramentas: só fale antes de usar uma se a consulta for demorar, e aí uma frase muito curta e neutra, diferente a cada vez (sem pergunta). Depois que o resultado chegar, siga direto para a resposta — não cumprimente de novo, não repita o que já disse, não anuncie "pronto" toda vez.
- Não narre o que acontece por dentro ("não encontrei esse nome", "vou buscar parecidos", tentativas): fale só o resultado, como quem já sabe.
- Números, valores e datas por extenso, do jeito que se fala ("trezentos e cinquenta reais a diária", "vinte e cinco de outubro"). Medidas só se perguntarem, arredondadas.
- Descreva peças como uma vendedora descreveria, sem recitar ficha técnica. NÃO comente se uma peça tem ou não modelo 3D/imagem de composição (mesmo que a ferramenta diga tem_modelo_3d false) — só se a pessoa pedir uma foto da composição.
- Não ofereça nem indique peças por conta própria. Quando ela quiser ver opções, chame mostrar_opcoes (o catálogo dela abre com tudo o que está disponível daquele tipo) e diga só quantas são; quando ela citar uma peça, mostrar_itens; quando ela escolher, circular_escolha (destaca) e confirme se é aquela. Só sugira se ela pedir.
- Se a pessoa interromper, pare e escute. Se não entendeu algum nome, confirme de forma leve. Se o que você ouviu parecer só ruído, eco ou um pedaço da sua própria fala, não responda como se fosse uma pergunta: espere a pessoa falar.
- Confirme com naturalidade o que colocou ou tirou do pedido (quantidade, peça e ambiente), cada vez com palavras diferentes.
- Para encerrar, despeça-se com carinho e diga que o que conversaram já está no pedido e na conversa por escrito.
- A sua PRIMEIRA fala é só atender: cumprimente pelo primeiro nome ("{{PRIMEIRO_NOME}}") numa frase curta e calorosa e pergunte em que pode ajudar. Não cite pedido, evento, peça nem nada da conversa anterior, e não use ferramentas nessa primeira fala. Depois descubra de qual pedido ela quer falar.`;

async function estadoDaConversa(ctx: Ctx, body: any) {
  const modo = body?.modo === "pedido" ? "pedido" : "catalogo";
  const acervo = await carregarAcervo(ctx);
  const projeto = limparProjeto(body?.projeto, acervo);
  const dataDoEvento = /^\d{4}-\d{2}-\d{2}$/.test(String(projeto?.data_evento || "")) ? String(projeto!.data_evento) : "";
  return { acervo, modo, projeto, dataDoEvento };
}

async function ligacaoIniciar(ctx: Ctx, body: any) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ erro: "Ligação indisponível agora." }, 500);
  // Freio: até 6 ligações por hora por pessoa (cada uma custa por minuto).
  const umaHora = new Date(Date.now() - 3600000).toISOString();
  const { count } = await ctx.service.from("catalogo_assistente_mensagens").select("id", { count: "exact", head: true })
    .eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).eq("papel", "assistant").gte("criado_em", umaHora).contains("anexos", JSON.stringify([{ tipo: "ligacao" }]));
  if ((count || 0) >= 6) return json({ erro: "Muitas ligações em pouco tempo. Tente de novo daqui a pouco ou fale por mensagem." }, 429);
  const { acervo, modo, projeto, dataDoEvento } = await estadoDaConversa(ctx, body);
  const [perfil, formatos, { data: empresa }, dispEvento, passadas, vocab] = await Promise.all([
    carregarPerfil(ctx), carregarFormatos(ctx, acervo),
    ctx.service.from("empresas").select("nome").eq("id", ctx.empresaId).maybeSingle(),
    dataDoEvento ? mapaDisponibilidade(ctx, dataDoEvento) : Promise.resolve(null),
    modo === "pedido" ? Promise.resolve([]) : ctx.rpc("projeto_listar", {}).catch(() => []), vocabulario(ctx).catch(() => ({ prompt: "" })),
  ]);
  // A ligação começa do zero: nada da conversa por escrito entra aqui (pode ser sobre outro pedido). Ela só sabe quais
  // pedidos a pessoa tem, pra perguntar de qual quer falar (ou se é um novo).
  const hojeIso = new Date().toISOString().slice(0, 10);
  const pedidos = (Array.isArray(passadas) ? passadas : []).filter((p: any) => String(p.data_evento || "") >= hojeIso).slice(0, 20);
  const recente = "\n\nLIGAÇÃO: esta ligação começa do zero. Não continue nem cite a conversa por escrito anterior. Primeiro entenda a necessidade da pessoa e SOBRE QUAL PEDIDO ela quer falar — pode ser um pedido existente (mesmo que não seja o aberto na tela) ou um novo. Quando souber qual, use abrir_projeto (ou siga as regras de PEDIDO NOVO)." +
    (pedidos.length ? "\nPedidos desta pessoa: " + pedidos.map((p: any) => `${p.noivos} (${p.evento?.tipo || "evento"}, ${fmtData(p.data_evento)}, ${p.local_evento}) [id ${p.id}]`).join("; ") + "." : "\nEla ainda não tem pedidos.") +
    (projeto ? `\nNa tela dela está aberto o pedido "${projeto.noivos}", mas não presuma que a ligação é sobre ele.` : "");
  const primeiro = String(ctx.nome || "").trim().split(/\s+/)[0] || "a pessoa";
  const instructions = promptDoSistema({ ctx, perfil, projeto, modo, empresa: empresa?.nome, formatos, acervo, dispEvento }) + recente + JEITO_DE_FALAR.replace("{{PRIMEIRO_NOME}}", primeiro);
  const tools = FERRAMENTAS(modo).map((t: any) => ({ type: "function", ...t.function }));
  const sessao = (model: string) => ({
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime", model, instructions, tools, tool_choice: "auto",
      audio: {
        input: {
          transcription: { model: "gpt-4o-transcribe", language: "pt", prompt: `A consultora se chama ${NOME_ASSISTENTE}. ` + String(vocab.prompt || "").slice(0, 900) },
          turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true },
          noise_reduction: { type: "far_field" },
        },
        output: { voice: VOZ },
      },
    },
  });
  let ultimoErro = "";
  for (const model of [...new Set([MODELO_VOZ, "gpt-realtime"])]) {
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(sessao(model)),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.value) {
      return json({ chave: d.value, modelo: model, nome: NOME_ASSISTENTE, cliente: ctx.nome || "", duracao_max: 20 * 60 });
    }
    ultimoErro = d?.error?.message || `Falha ao abrir a ligação (${r.status})`;
    console.warn("ligacao:", model, ultimoErro);
  }
  return json({ erro: "Não consegui abrir a ligação agora. " + ultimoErro }, 502);
}

async function ferramentaDaLigacao(ctx: Ctx, body: any) {
  const nome = String(body?.nome || "");
  if (!FERRAMENTAS("catalogo").some((t: any) => t.function.name === nome)) return json({ erro: "Ferramenta desconhecida" }, 400);
  let args: any = body?.args;
  if (typeof args === "string") { try { args = JSON.parse(args || "{}"); } catch { args = {}; } }
  const { acervo, modo, projeto, dataDoEvento } = await estadoDaConversa(ctx, body);
  const mapas = new Map<string, Map<string, { total: number; livre: number }>>();
  const E: any = { acervo, modo, perfil: await carregarPerfil(ctx), perfilMudou: false, projeto, formatos: null, acoes: [], mostrados: new Set<string>(), mapas, dataDoEvento, circular: new Set<string>(), opcoes: null };
  let resultado: unknown;
  try { resultado = await criarExecutor(ctx, E)(nome, args || {}); }
  catch (e) { resultado = { erro: (e as Error).message || "Falha na ferramenta" }; }
  if (E.perfilMudou) await gravarPerfil(ctx, E.perfil);
  const disp = dataDoEvento ? mapas.get(dataDoEvento) || null : null;
  const itens = [...E.mostrados].map((id: string) => { const i = acharItem(acervo, id)!; const d = disp?.get(i.id); return { id: i.id, nome: i.nome, foto: i.foto, medidas: i.medidas, categoria: i.categoria, ...(d && d.total ? { livres: d.livre, data: dataDoEvento } : {}) }; });
  return json({ resultado: JSON.stringify(resultado).slice(0, 14000), acoes: E.acoes, itens, locais: E.locais || [], opcoes: E.opcoes, circular: [...E.circular] });
}

// No fim da ligação a transcrição vira parte da conversa por escrito (fica no histórico e alimenta o perfil).
async function ligacaoRegistrar(ctx: Ctx, body: any) {
  const falas = (Array.isArray(body?.falas) ? body.falas : []).slice(0, 120)
    .map((f: any) => ({ papel: f?.papel === "user" ? "user" : "assistant", texto: String(f?.texto || "").trim().slice(0, 2000) }))
    .filter((f: any) => f.texto && !(f.papel === "user" && /^(A consultora se chama|Conversa de decoradora)/i.test(f.texto)));
  const segundos = Math.max(0, Math.min(7200, Math.round(Number(body?.segundos) || 0)));
  const projetoId = body?.projeto_id ? String(body.projeto_id) : null;
  const gravadas: any[] = [];
  for (const f of falas) gravadas.push(await gravarMensagem(ctx, f.papel, f.texto, [{ tipo: f.papel === "user" ? "voz" : "voz_helena" }], projetoId));
  const fim = `Ligação encerrada${segundos ? ` · ${Math.floor(segundos / 60)} min ${segundos % 60} s` : ""}.`;
  gravadas.push(await gravarMensagem(ctx, "assistant", fim, [{ tipo: "ligacao", segundos }], projetoId));
  const fala = falas.filter((f: any) => f.papel === "user").map((f: any) => f.texto).join("\n").slice(0, 4000);
  if (fala) {
    const perfil = await carregarPerfil(ctx);
    const aprendido = await extrairGostos(fala, perfil);
    if (aprendido) await gravarPerfil(ctx, mesclarPerfil(perfil, aprendido));
  }
  return json({ mensagens: gravadas.filter(Boolean) });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const ctx = await autenticar(req, body);
    if ("erro" in ctx) return json({ erro: ctx.erro }, ctx.status);
    const acao = String(body?.action || "conversar");
    if (acao === "historico") {
      const [mensagens, perfil] = await Promise.all([historico(ctx, 60, body?.projeto_id ? String(body.projeto_id) : null), carregarPerfil(ctx)]);
      return json({ mensagens, perfil, nome: NOME_ASSISTENTE, cliente: ctx.nome });
    }
    if (acao === "conversar") return await conversar(ctx, body);
    if (acao === "transcrever") return await transcrever(ctx, body);
    if (acao === "ligacao_iniciar") return await ligacaoIniciar(ctx, body);
    if (acao === "ferramenta") return await ferramentaDaLigacao(ctx, body);
    if (acao === "ligacao_registrar") return await ligacaoRegistrar(ctx, body);
    // Amostra de voz (texto fixo) pra escolher a voz da Helena.
    if (acao === "amostra_voz") {
      const voz = String(body?.voz || "");
      if (!["marin", "coral", "shimmer", "sage", "alloy", "ballad", "verse", "ash", "echo", "cedar"].includes(voz)) return json({ erro: "Voz inválida" }, 400);
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: voz, response_format: "mp3",
          input: "Oi, Lis! Que bom falar com você. Me conta do evento: já tem data e local? Pro lounge, eu pensei no sofá Becca com duas poltronas Olivia. Fica lindo, bem leve, e as duas estão livres no dia vinte e cinco.",
          instructions: "Fale em português do Brasil, com sotaque brasileiro natural, como uma consultora comercial simpática e segura numa ligação." }),
      });
      if (!r.ok) return json({ erro: (await r.text()).slice(0, 300) }, 502);
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return json({ audio: btoa(bin) });
    }
    // Disponibilidade de algumas peças numa data (o app mostra "X livres em 25/10" na tela do item).
    if (acao === "disponibilidade") {
      const data = String(body?.data || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ erro: "Data inválida" }, 400);
      const mapa = await mapaDisponibilidade(ctx, data);
      if (body?.todos) return json({ data, mapa: Object.fromEntries([...mapa].filter(([, d]) => d.total > 0).map(([id, d]) => [id, [d.total, d.livre]])) });
      const ids = (Array.isArray(body?.item_ids) ? body.item_ids : []).map(String).slice(0, 40);
      return json({ data, itens: Object.fromEntries(ids.map((id: string) => [id, mapa.get(id) || null])) });
    }
    if (acao === "salvar_imagem") return await salvarImagem(ctx, body);
    if (acao === "arquivo_upload") return await urlDeUpload(ctx, body);
    if (acao === "apagar_imagem") {
      const r = await apagarFoto(ctx, String(body?.mensagem_id || ""));
      return "erro" in r ? json(r, 404) : json({ ok: true, id: r.id });
    }
    if (acao === "falha_imagem") {
      const texto = String(body?.mensagem || "").trim().slice(0, 300) || "Não consegui terminar a imagem dessa vez. Quer que eu tente de novo?";
      return json({ mensagem: await gravarMensagem(ctx, "assistant", texto, [], body?.projeto_id ? String(body.projeto_id) : null) });
    }
    if (acao === "limpar") {
      // Conversa de um pedido é o registro do que foi combinado: não se apaga. "Nova conversa" só vale fora de pedido.
      if (body?.projeto_id) return json({ erro: "A conversa de um pedido fica guardada como registro do que foi combinado." }, 400);
      await ctx.service.from("catalogo_assistente_mensagens").delete().eq("empresa_id", ctx.empresaId).eq("dono", ctx.dono).is("projeto_id", null);
      return json({ ok: true });
    }
    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error("catalogo-assistente:", e);
    return json({ erro: (e as Error).message || "Erro inesperado" }, 500);
  }
});
