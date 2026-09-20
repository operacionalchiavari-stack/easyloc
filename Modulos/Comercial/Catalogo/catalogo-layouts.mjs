// Layouts de apresentação (pedido explícito do usuário: "cada decorador pode criar o layout dele de projeto, assim cada decorador pode
// imprimir de uma forma diferente um do outro... criar mais uma versão... depois ele decide em qual layout gerar o link e o PDF").
// Este módulo é a tela "Layouts" dentro de Projetos: lista dos layouts do decorador + editor com pré-visualização ao vivo. Fica
// separado de catalogo-projetos.mjs (que já é grande) e recebe dele, em initLayouts(), tudo que precisa (rpc, diálogos, projeto ativo).
//
// Um layout é só um conjunto de OPÇÕES de apresentação (projeto-layout.mjs) — nada dos dados do projeto. O editor edita um rascunho
// (sempre passando por normalizarLayout, então nunca fica com valor inválido) e SALVA SOZINHO (debounce), como os projetos: a alteração vale
// na hora pros projetos que usam aquele layout. A pré-visualização é a própria página projeto.html (?modo=editor) dentro de um iframe:
// ela recebe os dados uma vez e o rascunho a cada mudança por postMessage — o que se vê aqui é exatamente o que o link/PDF vai mostrar.
import { FONTES, MODELOS, normalizarLayout, layoutDoModelo, temaDaPagina } from "./projeto-layout.mjs?v=20260921-mais-opcoes";

let H = null;
const L = {
  lista: [], carregada: false, erro: "",
  edit: null,            // { id, nome, config, padrao } — o layout aberto no editor
  save: "idle", rev: 0, timer: 0, salvando: null,
  payload: null, origemPayload: "", iframe: null, pronto: false,
};

// Campos do editor: uma lista de grupos → o formulário sai desta tabela (e o teste percorre a mesma). Cada opção de lista usa os mesmos
// valores de VALORES (projeto-layout.mjs) — o teste confere. Tipos: seg (uma opção entre várias), chave (liga/desliga), cor, texto, sub (título de seção).
const SEG = (caminho, rotulo, opcoes, ajuda = "") => ({ tipo: "seg", caminho, rotulo, opcoes, ajuda });
const CHAVE = (caminho, rotulo) => ({ tipo: "chave", caminho, rotulo });
const COR = (caminho, rotulo, extra = {}) => ({ tipo: "cor", caminho, rotulo, ...extra });
const TEXTO = (caminho, rotulo, max, ajuda = "") => ({ tipo: "texto", caminho, rotulo, max, ajuda });
const SUB = (rotulo) => ({ tipo: "sub", rotulo });
const TAMANHOS = [["pequeno", "Pequeno"], ["medio", "Médio"], ["grande", "Grande"], ["enorme", "Enorme"]];
const MAIUSCULAS = [["normal", "Como digitado"], ["maiusculas", "MAIÚSCULAS"]];
export const GRUPOS = [
  { titulo: "Capa", campos: [
    SUB("Estilo"),
    SEG("capa.estilo", "Estilo da capa", [["foto", "Foto em tela cheia"], ["limpa", "Limpa"], ["lateral", "Foto ao lado"]], "“Foto em tela cheia” usa a primeira renderização do projeto como fundo."),
    SEG("capa.altura", "Altura da capa", [["cheia", "Tela toda"], ["alta", "Alta"], ["media", "Média"], ["compacta", "Compacta"]]),
    SEG("capa.alinhamento", "Alinhamento do texto", [["centro", "Centralizado"], ["esquerda", "À esquerda"]]),
    SEG("capa.fundo", "Fundo da capa", [["creme", "Creme"], ["branco", "Branco"], ["escuro", "Escuro"], ["cor", "Outra cor"]], "Vale quando a capa não usa foto de fundo. “Escuro” usa a cor principal."),
    COR("capa.corFundo", "Cor do fundo da capa", { ajuda: "Vale quando o fundo da capa é “Outra cor”." }),
    SEG("capa.escurecer", "Escurecer a foto de fundo", [["nenhum", "Não"], ["suave", "Suave"], ["forte", "Forte"]], "Ajuda o texto a ficar legível sobre a foto."),
    CHAVE("capa.moldura", "Moldura fina em volta da capa"),
    SUB("Textos"),
    TEXTO("capa.textoAbertura", "Texto acima do nome", 60, "Deixe em branco para não mostrar."),
    SEG("capa.tamanhoNome", "Tamanho do nome do casal", [["discreto", "Discreto"], ["medio", "Médio"], ["grande", "Grande"], ["enorme", "Enorme"]]),
    SEG("capa.caixaNome", "Letras do nome do casal", MAIUSCULAS),
    TEXTO("capa.subtitulo", "Frase abaixo do local", 100, "Deixe em branco para não mostrar."),
    CHAVE("capa.linhaFina", "Linha fina abaixo do nome"),
    CHAVE("capa.mostrarData", "Mostrar a data do evento"),
    CHAVE("capa.mostrarLocal", "Mostrar o local"),
    CHAVE("capa.mostrarRolagem", "Mostrar “Ver o projeto” no pé da capa"),
    SUB("Fotos e logo"),
    CHAVE("capa.mostrarFotoCasal", "Mostrar a foto dos noivos"),
    SEG("capa.formatoFotoCasal", "Formato da foto dos noivos", [["redonda", "Redonda"], ["arredondada", "Cantos suaves"], ["quadrada", "Quadrada"]]),
    SEG("capa.tamanhoFotoCasal", "Tamanho da foto dos noivos", [["pequena", "Pequena"], ["media", "Média"], ["grande", "Grande"]]),
    CHAVE("capa.mostrarLogo", "Mostrar a logo"),
    SEG("capa.posicaoLogo", "Posição da logo", [["auto", "Junto do texto"], ["esquerda", "Esquerda"], ["centro", "Centro"], ["direita", "Direita"]]),
    SEG("capa.tamanhoLogo", "Tamanho da logo", [["pequena", "Pequena"], ["media", "Média"], ["grande", "Grande"]]),
  ] },
  { titulo: "Cores", campos: [
    { tipo: "chave", caminho: "cores.usarDoDecorador", rotulo: "Usar as cores do meu catálogo", so: "decorador" },
    COR("cores.principal", "Cor principal (textos e botões)", { travavel: true }),
    COR("cores.destaque", "Cor de destaque (detalhes e títulos pequenos)", { travavel: true }),
    SUB("Fundos"),
    COR("cores.fundoPagina", "Fundo da página", { ajuda: "Se o fundo for escuro, o texto se ajusta sozinho para continuar legível." }),
    COR("cores.tomSuave", "Tom suave (faixas, capa e rodapé creme)"),
    COR("cores.fundoCartoes", "Fundo dos cartões dos móveis"),
  ] },
  { titulo: "Fonte", campos: [
    SEG("fonte", "Estilo das letras", Object.entries(FONTES).map(([chave, f]) => [chave, f.nome]), "Clássica: serifa fina. Moderna: sem serifa. Elegante: serifa marcada. Editorial e Romana: títulos de revista. Manuscrita: letra de assinatura."),
    SEG("texto.tamanho", "Tamanho do texto", [["pequeno", "Pequeno"], ["normal", "Normal"], ["grande", "Grande"], ["enorme", "Muito grande"]]),
    SEG("texto.pesoTitulos", "Peso dos títulos", [["leve", "Fino"], ["normal", "Normal"], ["forte", "Forte"]]),
  ] },
  { titulo: "Página", campos: [
    SEG("pagina.largura", "Largura do conteúdo", [["estreita", "Estreita"], ["normal", "Normal"], ["larga", "Larga"], ["total", "Tela toda"]]),
    SEG("pagina.espaco", "Espaço entre as seções", [["compacto", "Compacto"], ["normal", "Normal"], ["amplo", "Amplo"]]),
    SEG("pagina.cantos", "Cantos das fotos e cartões", [["retos", "Retos"], ["suaves", "Suaves"], ["redondos", "Redondos"], ["muito", "Bem redondos"]]),
    SEG("pagina.divisoria", "Linha entre os ambientes", [["linha", "Fina"], ["destaque", "Na cor de destaque"], ["nenhuma", "Nenhuma"]]),
    SUB("Navegação"),
    SEG("pagina.navegacao", "Barra de ambientes", [["fixa", "Fixa no topo"], ["normal", "Rola com a página"], ["escondida", "Escondida"]]),
    SEG("pagina.navegacaoEstilo", "Estilo dos botões da barra", [["pilulas", "Pílulas"], ["sublinhado", "Sublinhado"]]),
    CHAVE("pagina.mostrarBotaoPdf", "Mostrar o botão “Baixar PDF”"),
    SUB("Fotos"),
    CHAVE("pagina.efeitoFotos", "Efeito suave ao passar o mouse nas fotos"),
    CHAVE("pagina.ampliarFotos", "Ampliar a foto ao clicar"),
  ] },
  { titulo: "Ambientes", campos: [
    CHAVE("resumo", "Mostrar o resumo (nº de ambientes e peças)"),
    CHAVE("ambientes.numeracao", "Numerar os ambientes (01, 02…)"),
    CHAVE("ambientes.notas", "Mostrar as observações de cada ambiente"),
    CHAVE("ambientes.contagem", "Mostrar quantas peças tem cada ambiente"),
    SUB("Título do ambiente"),
    SEG("ambientes.tamanhoTitulo", "Tamanho do título", TAMANHOS),
    SEG("ambientes.alinhamento", "Alinhamento do título", [["esquerda", "À esquerda"], ["centro", "Centralizado"]]),
    SEG("ambientes.caixaTitulo", "Letras do título", MAIUSCULAS),
    SUB("Renderizações"),
    SEG("ambientes.renders", "Renderizações", [["destaque", "Uma em destaque"], ["grade", "Todas iguais"]]),
    SEG("ambientes.colunasFotos", "Fotos por linha", [["1", "1"], ["2", "2"], ["3", "3"]]),
    SEG("ambientes.proporcao", "Formato das fotos", [["panoramica", "Panorâmico"], ["classica", "Clássico"], ["quadrada", "Quadrado"], ["retrato", "Em pé"]]),
    SEG("ambientes.espacoFotos", "Espaço entre as fotos", [["colado", "Coladas"], ["pequeno", "Pequeno"], ["normal", "Normal"], ["amplo", "Amplo"]]),
    SEG("ambientes.ordem", "O que aparece primeiro", [["renders", "Renderizações"], ["moveis", "Móveis"]]),
    TEXTO("ambientes.tituloMoveis", "Título da lista de móveis", 40, "Deixe em branco para não mostrar."),
  ] },
  { titulo: "Móveis", campos: [
    SEG("moveis.estilo", "Cartão do móvel", [["cartao", "Com moldura"], ["limpo", "Sem moldura"]]),
    SEG("moveis.colunas", "Móveis por linha", [["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]),
    SEG("moveis.espacamento", "Espaço entre os móveis", [["compacto", "Compacto"], ["normal", "Normal"], ["amplo", "Amplo"]]),
    CHAVE("moveis.efeito", "Levantar o cartão ao passar o mouse"),
    SUB("Foto do móvel"),
    SEG("moveis.proporcaoFoto", "Formato da foto do móvel", [["quadrada", "Quadrada"], ["retrato", "Em pé"], ["paisagem", "Deitada"]]),
    SEG("moveis.ajusteFoto", "Ajuste da foto", [["inteira", "Inteira"], ["preencher", "Preencher o quadro"]]),
    SEG("moveis.fundoFoto", "Fundo da foto", [["auto", "Automático"], ["suave", "Suave"], ["branco", "Branco"], ["nenhum", "Sem fundo"]]),
    SUB("Texto do móvel"),
    SEG("moveis.caixaNome", "Letras do nome do móvel", MAIUSCULAS),
    SEG("moveis.alinhamentoTexto", "Alinhamento do nome e das medidas", [["esquerda", "À esquerda"], ["centro", "Centralizado"]]),
    CHAVE("moveis.medidas", "Mostrar as medidas"),
    CHAVE("moveis.materialCor", "Mostrar material e cor"),
    CHAVE("moveis.quantidade", "Mostrar a quantidade"),
    SEG("moveis.posicaoQuantidade", "Onde aparece a quantidade", [["selo", "Selo no canto da foto"], ["nome", "Junto do nome"]]),
    SEG("moveis.estiloSelo", "Estilo do selo", [["cheio", "Preenchido"], ["contorno", "Só contorno"]]),
  ] },
  { titulo: "Rodapé", campos: [
    CHAVE("rodape.mostrar", "Mostrar o rodapé"),
    SEG("rodape.fundo", "Fundo do rodapé", [["auto", "Automático"], ["creme", "Tom suave"], ["branco", "Branco"], ["escuro", "Cor principal"], ["destaque", "Cor de destaque"]]),
    TEXTO("rodape.mensagem", "Mensagem final", 160),
    SEG("rodape.tamanhoMensagem", "Tamanho da mensagem", [["media", "Média"], ["grande", "Grande"], ["enorme", "Enorme"]]),
    CHAVE("rodape.italico", "Mensagem em itálico"),
    TEXTO("rodape.assinatura", "Assinatura ou frase extra", 80, "Deixe em branco para não mostrar."),
    CHAVE("rodape.mostrarLogo", "Mostrar a logo no rodapé"),
    CHAVE("rodape.mostrarMarca", "Mostrar o nome da marca"),
    CHAVE("rodape.contato", "Mostrar telefone e e-mail"),
    CHAVE("rodape.mostrarCredito", "Mostrar o crédito “Mobiliário: …”"),
  ] },
  { titulo: "PDF", campos: [
    SEG("pdf.orientacao", "Orientação da página", [["retrato", "Retrato"], ["paisagem", "Paisagem"]], "Vale quando você gera o PDF."),
    SEG("pdf.papel", "Tamanho do papel", [["a4", "A4"], ["carta", "Carta"], ["a3", "A3"]]),
    SEG("pdf.margem", "Margem da página", [["estreita", "Estreita"], ["normal", "Normal"], ["ampla", "Ampla"]]),
    CHAVE("ambientes.umaPorPagina", "Cada ambiente começa numa página nova"),
    CHAVE("pdf.capaPaginaInteira", "A capa ocupa a página inteira"),
    CHAVE("pdf.numerarPaginas", "Numerar as páginas"),
  ] },
];

const ler = (obj, caminho) => caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
function gravar(obj, caminho, valor){
  const chaves = caminho.split(".");
  let o = obj;
  chaves.slice(0, -1).forEach((k) => { if(!o[k] || typeof o[k] !== "object") o[k] = {}; o = o[k]; });
  o[chaves[chaves.length - 1]] = valor;
}

const esc = (v) => H.escapeHtml(v);
const attr = (v) => H.escapeAttr(v);

// ---------------------------------------------------------------------------------------------------------------
// Dados
export async function carregarLayouts(){
  try{
    const lista = await H.rpc("layout_listar");
    L.lista = Array.isArray(lista) ? lista.map((l) => ({ ...l, config: normalizarLayout(l.config) })) : [];
    L.erro = "";
  }catch(error){
    L.erro = H.mensagemDe(error);
  }
  L.carregada = true;
}

const resumoLayout = (config) => `Capa ${({ foto: "com foto", limpa: "limpa", lateral: "com foto ao lado" })[config.capa.estilo]} · ${FONTES[config.fonte].nome} · PDF em ${config.pdf.orientacao}`;

// ---------------------------------------------------------------------------------------------------------------
// Lista
function miniatura(config){
  const tema = temaDaPagina(config, H.decorador());
  const escuro = tema.capaEscura || config.capa.estilo === "foto";
  return `<span class="lay-thumb" data-capa="${config.capa.estilo}" data-alinhamento="${config.capa.alinhamento}" style="--lay-fundo:${tema.capaFundo};--lay-ink:${escuro ? "#ffffff" : tema.capaTexto};--lay-destaque:${tema.destaque}" aria-hidden="true">
    <i class="lay-thumb-media"></i><span class="lay-thumb-texto"><b></b><em></em><s></s></span></span>`;
}

function cartaoLayout(l){
  return `<article class="lay-card" data-lay-id="${attr(l.id)}">
    <button type="button" class="lay-card-thumb" data-lay="editar" aria-label="Editar ${attr(l.nome)}">${miniatura(l.config)}</button>
    <div class="lay-card-body">
      <h3>${esc(l.nome)}${l.padrao ? ` <span class="lay-badge">Padrão</span>` : ""}</h3>
      <p>${esc(resumoLayout(l.config))}</p>
      <div class="lay-card-actions">
        <button type="button" class="cpj-btn cpj-btn-ghost" data-lay="editar">Editar</button>
        <button type="button" class="cpj-btn cpj-btn-ghost" data-lay="duplicar">Duplicar</button>
        <button type="button" class="cpj-btn cpj-btn-ghost" data-lay="padrao">${l.padrao ? "Tirar dos padrões" : "Usar como padrão"}</button>
        <button type="button" class="cpj-btn cpj-btn-ghost cpj-btn-danger-text" data-lay="excluir">Excluir</button>
      </div>
    </div>
  </article>`;
}

export function pintarLista(root){
  L.edit = null;
  L.lista.sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.nome.localeCompare(b.nome, "pt-BR"));   // o padrão vem primeiro, também depois de trocar o padrão no editor
  root.innerHTML = `<div class="cpj-wrap lay-listing" data-lay-lista>
    <header class="cpj-head">
      <div><h2>Layouts de apresentação</h2><p>O visual do seu link e do seu PDF. Crie quantos quiser e escolha, em cada projeto, qual usar.</p></div>
      <div class="cpj-work-actions"><button type="button" class="cpj-btn cpj-btn-ghost" data-lay="voltar-projetos">← Projetos</button><button type="button" class="cpj-btn cpj-btn-primary" data-lay="novo">＋ Novo layout</button></div>
    </header>
    ${!L.carregada ? `<p class="cpj-empty">Carregando layouts…</p>`
      : L.erro ? `<p class="cpj-empty">${esc(L.erro)} <button type="button" class="cpj-btn cpj-btn-link" data-lay="recarregar">Tentar novamente</button></p>`
      : !L.lista.length ? `<div class="lay-vazio"><strong>Você ainda não tem layouts</strong><span>Comece por um modelo pronto e ajuste do seu jeito — capa, cores, letras, como os móveis aparecem e o formato do PDF.</span>
          <div class="lay-modelos">${MODELOS.map((m) => `<button type="button" class="lay-modelo" data-lay="novo-modelo" data-modelo="${attr(m.chave)}">${miniatura(layoutDoModelo(m.chave))}<strong>${esc(m.nome)}</strong><small>${esc(m.descricao)}</small></button>`).join("")}</div></div>`
      : `<div class="lay-lista">${L.lista.map(cartaoLayout).join("")}</div>`}
  </div>`;
  if(!L.carregada) carregarLayouts().then(() => { if(document.querySelector("[data-lay-lista]")) pintarLista(root); });
}

// ---------------------------------------------------------------------------------------------------------------
// Criar / duplicar / padrão / excluir
async function criar(nome, config){
  const criado = await H.rpc("layout_salvar", { p_nome: nome, p_config: config, p_padrao: L.lista.length ? null : true });
  criado.config = normalizarLayout(criado.config);
  L.lista.push(criado);
  L.lista.sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.nome.localeCompare(b.nome, "pt-BR"));
  return criado;
}

async function fluxoNovo(modeloChave){
  const meus = L.lista;
  const escolhido = await H.abrirModal({
    titulo: "Novo layout", sub: "Dê um nome e escolha de onde começar — depois é só ajustar.", confirmar: "Criar e editar",
    corpo: `<label class="cpj-field"><span>Nome do layout</span><input name="nome" maxlength="60" placeholder="Ex.: Casamento clássico" autocomplete="off" autofocus></label>
      <label class="cpj-field"><span>Começar de</span><select name="base">
        <optgroup label="Modelos prontos">${MODELOS.map((m) => `<option value="m:${attr(m.chave)}"${m.chave === (modeloChave || "classico") ? " selected" : ""}>${esc(m.nome)} — ${esc(m.descricao)}</option>`).join("")}</optgroup>
        ${meus.length ? `<optgroup label="Meus layouts">${meus.map((l) => `<option value="l:${attr(l.id)}">${esc(l.nome)}</option>`).join("")}</optgroup>` : ""}
      </select></label>`,
    async onSubmit(api){
      const nome = api.form.elements.nome.value.trim();
      if(!nome) throw new Error("Dê um nome ao layout.");
      const [tipo, chave] = api.form.elements.base.value.split(/:(.*)/s);
      const config = tipo === "l" ? (meus.find((l) => String(l.id) === chave)?.config || layoutDoModelo("classico")) : layoutDoModelo(chave);
      return criar(nome, config);
    },
  });
  if(escolhido) abrirEditor(escolhido.id);
}

async function duplicar(id){
  const origem = L.lista.find((l) => String(l.id) === String(id));
  if(!origem) return;
  try{
    const copia = await criar(`${origem.nome} (cópia)`.slice(0, 60), origem.config);
    H.notify({ title: "Layout duplicado", message: copia.nome, status: "done", duration: 2500 });
    abrirEditor(copia.id);
  }catch(error){
    H.notify({ title: "Não foi possível duplicar", message: H.mensagemDe(error), status: "error" });
  }
}

async function alternarPadrao(id){
  const l = L.lista.find((x) => String(x.id) === String(id));
  if(!l) return;
  try{
    await H.rpc("layout_salvar", { p_id: l.id, p_nome: l.nome, p_config: l.config, p_padrao: !l.padrao });
    await carregarLayouts();
    pintarLista(document.getElementById("catalogProjetos"));
  }catch(error){
    H.notify({ title: "Não foi possível alterar", message: H.mensagemDe(error), status: "error" });
  }
}

async function excluir(id){
  const l = L.lista.find((x) => String(x.id) === String(id));
  if(!l) return;
  const ok = await H.abrirModal({ titulo: `Excluir “${l.nome}”?`, sub: "Os projetos que usam este layout passam a usar o seu layout padrão (ou o visual original). Isso não pode ser desfeito.", confirmar: "Excluir layout", perigo: true });
  if(!ok) return;
  try{
    await H.rpc("layout_excluir", { p_id: l.id });
    L.lista = L.lista.filter((x) => String(x.id) !== String(id));
    pintarLista(document.getElementById("catalogProjetos"));
    H.notify({ title: "Layout excluído", message: l.nome, status: "done", duration: 2500 });
  }catch(error){
    H.notify({ title: "Não foi possível excluir", message: H.mensagemDe(error), status: "error" });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Editor
function campoHtml(campo, config){
  if(campo.tipo === "sub") return `<p class="lay-sub">${esc(campo.rotulo)}</p>`;
  const valor = ler(config, campo.caminho);
  if(campo.so === "decorador" && !H.decorador()) return "";   // a equipe não tem "cores do catálogo do decorador"
  const ajuda = campo.ajuda ? `<small class="lay-ajuda">${esc(campo.ajuda)}</small>` : "";
  if(campo.tipo === "seg"){
    return `<div class="lay-campo"><span class="lay-rotulo">${esc(campo.rotulo)}</span><div class="lay-seg" role="radiogroup" aria-label="${attr(campo.rotulo)}">${campo.opcoes.map(([v, t]) => `<label><input type="radio" name="${attr(campo.caminho)}" value="${attr(v)}"${String(valor) === String(v) ? " checked" : ""}><span>${esc(t)}</span></label>`).join("")}</div>${ajuda}</div>`;
  }
  if(campo.tipo === "chave"){
    return `<label class="lay-chave"><input type="checkbox" name="${attr(campo.caminho)}"${valor ? " checked" : ""}><span class="lay-chave-trilho" aria-hidden="true"></span><span>${esc(campo.rotulo)}</span></label>`;
  }
  if(campo.tipo === "cor"){
    const travado = campo.travavel && config.cores.usarDoDecorador && H.decorador();   // principal/destaque travam quando vale a cor do catálogo do decorador
    return `<label class="lay-campo lay-cor"><span class="lay-rotulo">${esc(campo.rotulo)}</span><span class="lay-cor-linha"><input type="color" name="${attr(campo.caminho)}" value="${attr(valor)}"${campo.travavel ? " data-travavel" : ""}${travado ? " disabled" : ""}><code data-lay-cor-valor="${attr(campo.caminho)}">${esc(valor)}</code></span>${ajuda}</label>`;
  }
  return `<label class="lay-campo"><span class="lay-rotulo">${esc(campo.rotulo)}</span><input type="text" class="lay-texto" name="${attr(campo.caminho)}" value="${attr(valor)}" maxlength="${campo.max || 120}" autocomplete="off">${ajuda}</label>`;
}

export async function abrirEditor(id){
  const l = L.lista.find((x) => String(x.id) === String(id));
  if(!l) return;
  L.edit = { id: l.id, nome: l.nome, config: normalizarLayout(l.config), padrao: l.padrao };
  L.save = "saved"; L.rev = 0; L.pronto = false; L.payload = null;
  H.setView("layout");
}

export function pintarEditor(root){
  const e = L.edit;
  if(!e){ H.setView("layouts"); return; }
  root.innerHTML = `<div class="cpj-wrap lay-editor" data-lay-editor>
    <header class="lay-head">
      <button type="button" class="cpj-back" data-lay="voltar-lista">← Layouts</button>
      <input type="text" class="lay-nome" data-lay-nome value="${attr(e.nome)}" maxlength="60" aria-label="Nome do layout" autocomplete="off">
      <div class="cpj-work-actions">
        <span class="cpj-save-state" data-lay-estado aria-live="polite"></span>
        <label class="lay-chave lay-chave-padrao"><input type="checkbox" data-lay-padrao${e.padrao ? " checked" : ""}><span class="lay-chave-trilho" aria-hidden="true"></span><span>Layout padrão</span></label>
      </div>
    </header>
    <div class="lay-corpo">
      <form class="lay-form" data-lay-form autocomplete="off" novalidate>
        <p class="lay-aviso">As alterações são salvas sozinhas e valem na hora para os projetos que usam este layout.</p>
        ${GRUPOS.map((g) => `<fieldset class="lay-grupo"><legend>${esc(g.titulo)}</legend>${g.campos.map((c) => campoHtml(c, e.config)).join("")}</fieldset>`).join("")}
      </form>
      <aside class="lay-previa" aria-label="Pré-visualização">
        <div class="lay-previa-barra"><strong>Pré-visualização</strong><span data-lay-origem>${esc(L.origemPayload)}</span></div>
        <iframe class="lay-previa-quadro" data-lay-iframe title="Pré-visualização do layout" src="projeto.html?modo=editor" scrolling="no"></iframe>
      </aside>
    </div>
  </div>`;
  L.iframe = root.querySelector("[data-lay-iframe]");
  pintarEstado();
  prepararPayload();
}

// Dados da pré-visualização: o projeto aberto (com as renderizações e móveis de verdade) ou, sem projeto, um exemplo com itens do catálogo.
async function prepararPayload(){
  const projeto = H.projetoAtual();
  try{
    if(projeto){
      await H.garantirSalvo();
      L.payload = await H.rpc("projeto_previa", { p_id: projeto.id });
      L.origemPayload = `com o projeto “${projeto.noivos}”`;
    }else{
      L.payload = amostra();
      L.origemPayload = "com um projeto de exemplo";
    }
  }catch{
    L.payload = amostra();
    L.origemPayload = "com um projeto de exemplo";
  }
  const el = document.querySelector("[data-lay-origem]");
  if(el) el.textContent = L.origemPayload;
  enviarDados();
}

function amostra(){
  const itens = H.itens().filter((i) => i.photo).slice(0, 8);
  const publico = (item) => ({ id: item.id, nome: item.name, categoria: item.catLabel, material: item.material, cor: item.cor,
    largura: item.dimensions?.width ?? null, altura: item.dimensions?.height ?? null, profundidade: item.dimensions?.depth ?? null, foto_url: item.photo });
  const meio = Math.ceil(itens.length / 2);   // reparte o que houver no catálogo entre os 2 ambientes do exemplo (funciona até com poucos itens)
  const metade1 = itens.slice(0, meio), metade2 = itens.slice(meio);
  const daqui90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  // Sem projeto aberto não há renderizações de verdade: as fotos do catálogo fazem o papel delas (e a foto dos noivos), só pra que TODAS as
  // opções tenham o que mostrar na prévia (capa com foto, fotos por linha, proporção, espaço entre elas, formato da foto dos noivos…).
  const rendersDe = (lista) => lista.map((item, n) => ({ id: "rx" + n, url: item.photo }));
  return {
    ok: true,
    projeto: { noivos: "Ana & Bruno", data_evento: daqui90, local_evento: "Sítio Vale Verde", foto_casal: itens[0]?.photo || null, ambientes: [
      { id: "ex1", nome: "Cerimônia", notas: "Clima leve e acolhedor, com luz natural.", itens: metade1.map((i, n) => ({ item_id: i.id, quantidade: [40, 2, 6, 1][n % 4] })), renders: rendersDe(itens.slice(0, 3)) },
      { id: "ex2", nome: "Lounge", notas: "", itens: metade2.map((i, n) => ({ item_id: i.id, quantidade: [1, 2, 2, 1][n % 4] })), renders: rendersDe(itens.slice(3, 4)) },
    ] },
    itens: itens.map(publico), decorador: H.decorador() || null, empresa: H.empresa() || null, layout: null, layouts: [], amostra: true,
  };
}

// A apresentação dentro do iframe não tem barra de rolagem: ela informa a altura do conteúdo (pj-altura) e o iframe estica até lá.
// Crescer é na hora; ENCOLHER só depois de estabilizar — a cada redesenho as imagens colapsam por um instante, e encolher e crescer de
// novo faria a página inteira (que rola por fora) dar um pulo enquanto a pessoa mexe nas opções.
let timerEncolher = 0;
function ajustarAlturaPrevia(altura){
  if(!L.iframe || !Number.isFinite(altura) || altura < 100) return;
  const nova = Math.min(Math.ceil(altura), 60000);
  const atual = parseFloat(L.iframe.style.height) || 0;
  clearTimeout(timerEncolher);
  if(nova >= atual){ L.iframe.style.height = `${nova}px`; return; }
  timerEncolher = setTimeout(() => { if(L.iframe) L.iframe.style.height = `${nova}px`; }, 500);
}

function enviarDados(){
  if(!L.iframe?.contentWindow || !L.pronto || !L.payload || !L.edit) return;
  L.iframe.contentWindow.postMessage({ tipo: "pj-dados", payload: L.payload, rascunho: L.edit.config, layoutId: "" }, location.origin);
}
let rafPrevia = 0;
function enviarRascunho(){
  cancelAnimationFrame(rafPrevia);
  rafPrevia = requestAnimationFrame(() => {
    if(L.iframe?.contentWindow && L.pronto && L.edit) L.iframe.contentWindow.postMessage({ tipo: "pj-layout", layout: L.edit.config }, location.origin);
  });
}

// Salvamento automático (mesmo desenho do autosave dos projetos: nunca dois ao mesmo tempo; edição durante um salvamento vira "sujo" de novo).
function pintarEstado(){
  const el = document.querySelector("[data-lay-estado]");
  if(!el) return;
  el.textContent = { idle: "", dirty: "Salvando…", saving: "Salvando…", saved: "Salvo ✓", error: "Erro ao salvar" }[L.save] || "";
  el.dataset.state = L.save;
}
function marcarSujo(){
  if(!L.edit) return;
  L.rev += 1; L.save = "dirty"; pintarEstado();
  clearTimeout(L.timer);
  L.timer = setTimeout(salvarAgora, 800);
}
export async function salvarAgora(){
  clearTimeout(L.timer);
  if(L.salvando) await L.salvando;
  if(!L.edit || (L.save !== "dirty" && L.save !== "error")) return;
  const edicao = L.edit, rev = L.rev;
  const nome = edicao.nome.trim() || "Layout sem nome";
  L.save = "saving"; pintarEstado();
  L.salvando = (async () => {
    try{
      const salvo = await H.rpc("layout_salvar", { p_id: edicao.id, p_nome: nome, p_config: edicao.config, p_padrao: null });
      const na = L.lista.find((x) => String(x.id) === String(edicao.id));
      if(na){ na.nome = salvo.nome; na.config = normalizarLayout(salvo.config); }
      L.save = L.rev === rev ? "saved" : "dirty";
    }catch(error){
      L.save = "error";
      H.notify({ title: "Não foi possível salvar o layout", message: H.mensagemDe(error), status: "error" });
    }finally{
      L.salvando = null; pintarEstado();
    }
  })();
  await L.salvando;
}

function aoAlterarForm(event){
  const e = L.edit;
  if(!e) return;
  const alvo = event.target;
  if(alvo.matches("[data-lay-padrao]")){
    const marcado = alvo.checked;
    H.rpc("layout_salvar", { p_id: e.id, p_nome: e.nome.trim() || "Layout", p_config: e.config, p_padrao: marcado })
      .then(() => { e.padrao = marcado; L.lista.forEach((l) => { l.padrao = String(l.id) === String(e.id) ? marcado : (marcado ? false : l.padrao); }); })
      .catch((error) => { alvo.checked = !marcado; H.notify({ title: "Não foi possível alterar", message: H.mensagemDe(error), status: "error" }); });
    return;
  }
  if(alvo.matches("[data-lay-nome]")){ e.nome = alvo.value; marcarSujo(); return; }
  const nome = alvo.name;
  if(!nome || !alvo.closest("[data-lay-form]")) return;
  const valor = alvo.type === "checkbox" ? alvo.checked : alvo.value;
  if(alvo.type === "radio" && !alvo.checked) return;
  const rascunho = JSON.parse(JSON.stringify(e.config));
  gravar(rascunho, nome, valor);
  e.config = normalizarLayout(rascunho);
  // "Usar as cores do meu catálogo" trava/destrava os seletores de cor sem redesenhar o formulário (o foco ficaria perdido).
  if(nome === "cores.usarDoDecorador"){
    document.querySelectorAll('[data-lay-form] input[type="color"][data-travavel]').forEach((i) => { i.disabled = Boolean(e.config.cores.usarDoDecorador && H.decorador()); });
  }
  if(alvo.type === "color") document.querySelector(`[data-lay-cor-valor="${CSS.escape(nome)}"]`)?.replaceChildren(document.createTextNode(ler(e.config, nome) || valor));
  marcarSujo();
  enviarRascunho();
}

// ---------------------------------------------------------------------------------------------------------------
function aoClicar(event){
  const botao = event.target.closest("[data-lay]");
  if(!botao) return;
  const id = botao.closest("[data-lay-id]")?.dataset.layId;
  const acao = botao.dataset.lay;
  if(acao === "voltar-projetos"){ H.setView("list"); }
  else if(acao === "novo") fluxoNovo();
  else if(acao === "novo-modelo") fluxoNovo(botao.dataset.modelo);
  else if(acao === "recarregar"){ L.carregada = false; pintarLista(document.getElementById("catalogProjetos")); }
  else if(acao === "editar") abrirEditor(id);
  else if(acao === "duplicar") duplicar(id);
  else if(acao === "padrao") alternarPadrao(id);
  else if(acao === "excluir") excluir(id);
  else if(acao === "voltar-lista"){ salvarAgora().then(() => { H.setView("layouts"); }); }
}

export function initLayouts(helpers){
  H = helpers;
  const raiz = document.getElementById("catalogProjetos");
  raiz?.addEventListener("click", aoClicar);
  raiz?.addEventListener("change", (event) => { if(event.target.closest("[data-lay-editor]")) aoAlterarForm(event); });
  raiz?.addEventListener("input", (event) => {
    if(!event.target.closest("[data-lay-editor]")) return;
    if(event.target.matches('input[type="text"], input[type="color"]')) aoAlterarForm(event);
  });
  // A página de pré-visualização (iframe) avisa quando está pronta; só aceita a mensagem da própria janela do iframe.
  window.addEventListener("message", (event) => {
    if(event.origin !== location.origin || !L.iframe || event.source !== L.iframe.contentWindow) return;
    if(event.data?.tipo === "pj-pronto"){ L.pronto = true; enviarDados(); }
    else if(event.data?.tipo === "pj-altura") ajustarAlturaPrevia(Number(event.data.altura));
  });
  window.addEventListener("pagehide", () => { salvarAgora(); });
}

export const layoutsCarregados = () => L.carregada;
export const listaDeLayouts = () => L.lista;
