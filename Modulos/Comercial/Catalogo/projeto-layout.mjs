// Layout de apresentação do projeto — o que o decorador personaliza pra gerar o LINK e o PDF de um projeto (capa, cores, letras, página,
// ambientes, móveis, rodapé, formato do PDF). Módulo puro, sem DOM: é importado pelo editor (catalogo-layouts.mjs) e pela página de
// apresentação (projeto.mjs), então os dois concordam sobre o que cada opção significa.
//
// O layout mora no banco como um jsonb livre (projeto_layouts.config) — o servidor só garante que é um objeto de tamanho razoável.
// QUEM VALIDA O CONTEÚDO É normalizarLayout(): toda opção passa por uma lista fechada de valores/limites (VALORES, LIMITES), então um
// layout adulterado ou de uma versão antiga nunca quebra a página nem injeta CSS/HTML (cores só entram como #rrggbb, textos são
// escapados na hora de desenhar, e TUDO que vira CSS vem de tabelas fixas deste arquivo — nunca do texto do layout). Opção que faltar
// cai no padrão — por isso opções novas podem ser acrescentadas sem migrar nada: layouts antigos continuam iguais.

export const FONTES = {
  classica: {
    nome: "Clássica", amostra: "Ana & Bruno",
    titulo: '"Cormorant Garamond",serif', corpo: '"Manrope",sans-serif',
    google: "family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Manrope:wght@400;500;600;700",
  },
  moderna: {
    nome: "Moderna", amostra: "Ana & Bruno",
    titulo: '"Manrope",sans-serif', corpo: '"Manrope",sans-serif',
    google: "family=Manrope:wght@400;500;600;700",
  },
  elegante: {
    nome: "Elegante", amostra: "Ana & Bruno",
    titulo: '"Playfair Display",serif', corpo: '"Inter",sans-serif',
    google: "family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700",
  },
  editorial: {
    nome: "Editorial", amostra: "Ana & Bruno",
    titulo: '"DM Serif Display",serif', corpo: '"DM Sans",sans-serif',
    google: "family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700",
  },
  romantica: {
    nome: "Romana", amostra: "Ana & Bruno",
    titulo: '"Cinzel",serif', corpo: '"Lato",sans-serif',
    google: "family=Cinzel:wght@400;500;600&family=Lato:wght@400;700",
  },
  manuscrita: {
    nome: "Manuscrita", amostra: "Ana & Bruno",
    titulo: '"Great Vibes",cursive', corpo: '"Lato",sans-serif',
    google: "family=Great+Vibes&family=Lato:wght@400;700",
  },
  livro: {
    nome: "Livro", amostra: "Ana & Bruno",
    titulo: '"Libre Baskerville",serif', corpo: '"Source Sans 3",sans-serif',
    google: "family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:wght@400;500;600;700",
  },
  geometrica: {
    nome: "Geométrica", amostra: "Ana & Bruno",
    titulo: '"Poppins",sans-serif', corpo: '"Poppins",sans-serif',
    google: "family=Poppins:wght@300;400;500;600",
  },
  leve: {
    nome: "Leve", amostra: "Ana & Bruno",
    titulo: '"Jost",sans-serif', corpo: '"Jost",sans-serif',
    google: "family=Jost:wght@300;400;500;600",
  },
};

// Valores permitidos de cada opção de lista (caminho "grupo.campo"). O editor (catalogo-layouts.mjs) monta as opções na tela com os
// mesmos valores, e o teste confere que os dois concordam.
export const VALORES = {
  "capa.estilo": ["foto", "limpa", "lateral"],
  "capa.alinhamento": ["centro", "esquerda"],
  "capa.fundo": ["creme", "branco", "escuro", "cor"],
  "capa.altura": ["cheia", "alta", "media", "compacta"],
  "capa.escurecer": ["nenhum", "suave", "forte"],
  "capa.tamanhoNome": ["discreto", "medio", "grande", "enorme"],
  "capa.caixaNome": ["normal", "maiusculas"],
  "capa.formatoFotoCasal": ["redonda", "arredondada", "quadrada"],
  "capa.tamanhoFotoCasal": ["pequena", "media", "grande"],
  "capa.posicaoLogo": ["auto", "esquerda", "centro", "direita"],
  "capa.tamanhoLogo": ["pequena", "media", "grande"],
  "texto.tamanho": ["pequeno", "normal", "grande", "enorme"],
  "texto.pesoTitulos": ["leve", "normal", "forte"],
  "pagina.largura": ["estreita", "normal", "larga", "total"],
  "pagina.espaco": ["compacto", "normal", "amplo"],
  "pagina.cantos": ["retos", "suaves", "redondos", "muito"],
  "pagina.navegacao": ["fixa", "normal", "escondida"],
  "pagina.navegacaoEstilo": ["pilulas", "sublinhado"],
  "pagina.divisoria": ["linha", "destaque", "nenhuma"],
  "ambientes.renders": ["destaque", "grade"],
  "ambientes.tamanhoTitulo": ["pequeno", "medio", "grande", "enorme"],
  "ambientes.alinhamento": ["esquerda", "centro"],
  "ambientes.caixaTitulo": ["normal", "maiusculas"],
  "ambientes.proporcao": ["panoramica", "classica", "quadrada", "retrato"],
  "ambientes.espacoFotos": ["colado", "pequeno", "normal", "amplo"],
  "ambientes.ordem": ["renders", "moveis"],
  "moveis.estilo": ["cartao", "limpo"],
  "moveis.posicaoQuantidade": ["selo", "nome"],
  "moveis.estiloSelo": ["cheio", "contorno"],
  "moveis.proporcaoFoto": ["quadrada", "retrato", "paisagem"],
  "moveis.ajusteFoto": ["inteira", "preencher"],
  "moveis.fundoFoto": ["auto", "suave", "branco", "nenhum"],
  "moveis.caixaNome": ["normal", "maiusculas"],
  "moveis.espacamento": ["compacto", "normal", "amplo"],
  "moveis.alinhamentoTexto": ["esquerda", "centro"],
  "rodape.fundo": ["auto", "creme", "branco", "escuro", "destaque"],
  "rodape.tamanhoMensagem": ["media", "grande", "enorme"],
  "pdf.orientacao": ["retrato", "paisagem"],
  "pdf.papel": ["a4", "carta", "a3"],
  "pdf.margem": ["estreita", "normal", "ampla"],
};
const LIMITES = { "moveis.colunas": [2, 5], "ambientes.colunasFotos": [1, 3] };          // opções numéricas: [mínimo, máximo]
const LIMITES_TEXTO = { "capa.textoAbertura": 60, "capa.subtitulo": 100, "ambientes.tituloMoveis": 40, "rodape.mensagem": 160, "rodape.assinatura": 80 };
const CAMPOS_COR = new Set(["capa.corFundo", "cores.principal", "cores.destaque", "cores.fundoPagina", "cores.tomSuave", "cores.fundoCartoes"]);

// O que cada opção vale de verdade (valores CSS/medidas). Tudo que chega na página passa por aqui — o layout guarda só a CHAVE da opção.
const TAMANHO_TEXTO = { pequeno: "15px", normal: "16px", grande: "17.5px", enorme: "19px" };
const PESO_TITULOS = { leve: "400", normal: "500", forte: "600" };
const ESCALA_NOME = { discreto: 0.7, medio: 0.85, grande: 1, enorme: 1.2 };
const ESCALA_TITULO = { pequeno: 0.7, medio: 0.85, grande: 1, enorme: 1.25 };
const LARGURA = { estreita: "980px", normal: "1240px", larga: "1520px", total: "100%" };
const ESPACO_SECOES = { compacto: "40px", normal: "64px", amplo: "104px" };
const CANTOS = { retos: "0px", suaves: "8px", redondos: "16px", muito: "28px" };
const PROPORCAO_RENDER = { panoramica: "16/9", classica: "4/3", quadrada: "1/1", retrato: "3/4" };
const ESPACO_FOTOS = { colado: "0px", pequeno: "6px", normal: "14px", amplo: "28px" };
const ESPACO_MOVEIS = { compacto: "10px", normal: "18px", amplo: "32px" };
const PROPORCAO_MOVEL = { quadrada: "1/1", retrato: "4/5", paisagem: "4/3" };
const ALTURA_CAPA = { cheia: 100, alta: 82, media: 64, compacta: 46 };                         // % da altura da janela
const LOGO = { pequena: ["44px", "130px"], media: ["64px", "190px"], grande: ["96px", "280px"] };   // [altura, largura] máximas
const FOTO_CASAL = { pequena: 0.72, media: 1, grande: 1.35 };
const CASAL_CANTOS = { redonda: "50%", arredondada: "22%", quadrada: "0" };
const ESCURECER = { nenhum: [0, 0], suave: [0.28, 0.55], forte: [0.5, 0.82] };
const ESCALA_MENSAGEM = { media: 0.8, grande: 1, enorme: 1.3 };
const PAPEL_MM = { a4: [210, 297], carta: [216, 279], a3: [297, 420] };                         // [largura, altura] em pé
const PAPEL_CSS = { a4: "A4", carta: "letter", a3: "A3" };
const MARGEM_MM = { estreita: 8, normal: 12, ampla: 20 };

export const LAYOUT_PADRAO = Object.freeze({
  versao: 1,
  capa: {
    estilo: "foto", alinhamento: "centro", altura: "cheia", fundo: "creme", corFundo: "#efe3d3", escurecer: "suave", moldura: false,
    textoAbertura: "Projeto do evento", tamanhoNome: "grande", caixaNome: "normal", subtitulo: "", linhaFina: true,
    mostrarData: true, mostrarLocal: true, mostrarRolagem: true,
    mostrarFotoCasal: true, formatoFotoCasal: "redonda", tamanhoFotoCasal: "media",
    mostrarLogo: true, posicaoLogo: "auto", tamanhoLogo: "media",
  },
  cores: { usarDoDecorador: true, principal: "#251e19", destaque: "#b99a72", fundoPagina: "#ffffff", tomSuave: "#f7f3ec", fundoCartoes: "#ffffff" },
  fonte: "classica",
  texto: { tamanho: "normal", pesoTitulos: "normal" },
  pagina: { largura: "normal", espaco: "normal", cantos: "redondos", navegacao: "fixa", navegacaoEstilo: "pilulas", mostrarBotaoPdf: true, divisoria: "linha", efeitoFotos: true, ampliarFotos: true },
  resumo: true,
  ambientes: {
    numeracao: true, notas: true, tamanhoTitulo: "grande", alinhamento: "esquerda", caixaTitulo: "normal", contagem: false, ordem: "renders",
    renders: "destaque", colunasFotos: 2, proporcao: "classica", espacoFotos: "normal", tituloMoveis: "Móveis deste ambiente", umaPorPagina: true,
  },
  moveis: {
    estilo: "cartao", colunas: 4, espacamento: "normal", proporcaoFoto: "quadrada", ajusteFoto: "inteira", fundoFoto: "auto",
    caixaNome: "normal", alinhamentoTexto: "esquerda", medidas: true, materialCor: true, quantidade: true, posicaoQuantidade: "selo", estiloSelo: "cheio", efeito: false,
  },
  rodape: { mostrar: true, fundo: "auto", mensagem: "Obrigado por nos deixar fazer parte deste dia.", tamanhoMensagem: "grande", italico: true, assinatura: "", mostrarLogo: true, mostrarMarca: true, contato: true, mostrarCredito: true },
  pdf: { orientacao: "retrato", papel: "a4", margem: "normal", capaPaginaInteira: true, numerarPaginas: false },
});

// Pontos de partida ao criar um layout novo (o decorador ajusta a partir daí).
export const MODELOS = [
  { chave: "classico", nome: "Clássico", descricao: "Capa com foto em tela cheia, serifa elegante e móveis em cartões.", config: {} },
  { chave: "moderno", nome: "Moderno", descricao: "Capa limpa à esquerda, fonte sem serifa e móveis sem moldura.",
    config: { capa: { estilo: "limpa", alinhamento: "esquerda", fundo: "branco" }, fonte: "moderna", cores: { usarDoDecorador: false, principal: "#1f1f1f", destaque: "#3a6ea5" },
              ambientes: { renders: "grade" }, moveis: { estilo: "limpo", colunas: 3 } } },
  { chave: "editorial", nome: "Editorial", descricao: "Capa dividida com foto ao lado, fundo escuro e PDF em paisagem.",
    config: { capa: { estilo: "lateral", alinhamento: "esquerda", fundo: "escuro" }, fonte: "elegante", cores: { usarDoDecorador: false, principal: "#14202b", destaque: "#c8a15a" },
              moveis: { colunas: 3 }, pdf: { orientacao: "paisagem" } } },
  { chave: "minimalista", nome: "Minimalista", descricao: "Só o essencial: capa branca, sem resumo nem numeração, móveis em 5 colunas.",
    config: { capa: { estilo: "limpa", alinhamento: "centro", fundo: "branco", textoAbertura: "" }, fonte: "moderna", cores: { usarDoDecorador: false, principal: "#111111", destaque: "#8a8a8a" },
              resumo: false, ambientes: { numeracao: false, renders: "grade" }, moveis: { estilo: "limpo", colunas: 5, materialCor: false }, rodape: { mensagem: "" } } },
  { chave: "romantico", nome: "Romântico", descricao: "Tons de rosa suave, letras manuscritas, moldura fina na capa e cantos bem arredondados.",
    config: { capa: { estilo: "limpa", fundo: "cor", corFundo: "#f6e7e4", altura: "alta", moldura: true, tamanhoNome: "enorme", formatoFotoCasal: "redonda" }, fonte: "manuscrita",
              cores: { usarDoDecorador: false, principal: "#5a3b3b", destaque: "#c08a86", fundoPagina: "#fffaf8", tomSuave: "#f6e7e4" },
              pagina: { cantos: "muito", espaco: "amplo", divisoria: "nenhuma" }, ambientes: { alinhamento: "centro", tamanhoTitulo: "grande" },
              moveis: { colunas: 3, alinhamentoTexto: "centro" }, rodape: { fundo: "creme" } } },
  { chave: "noturno", nome: "Noturno", descricao: "Página escura com dourado, nome em maiúsculas sobre a foto escurecida e letras romanas.",
    config: { capa: { estilo: "foto", fundo: "cor", corFundo: "#0f1216", escurecer: "forte", caixaNome: "maiusculas", tamanhoNome: "medio" }, fonte: "romantica",
              cores: { usarDoDecorador: false, principal: "#e6d5a8", destaque: "#c8a15a", fundoPagina: "#15181d", tomSuave: "#1e232a", fundoCartoes: "#1e232a" },
              pagina: { cantos: "suaves", divisoria: "destaque" }, ambientes: { caixaTitulo: "maiusculas", tamanhoTitulo: "medio" }, moveis: { estilo: "cartao", colunas: 3, caixaNome: "maiusculas" },
              rodape: { fundo: "creme" } } },
];

const escolha = (valor, permitidos, padrao) => (permitidos.includes(valor) ? valor : padrao);
const booleano = (valor, padrao) => (typeof valor === "boolean" ? valor : padrao);
const cor = (valor, padrao) => (typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor.trim()) ? valor.trim().toLowerCase() : padrao);
const texto = (valor, padrao, max) => (typeof valor === "string" ? valor.replace(/[ -]/g, " ").slice(0, max).trim() : padrao);
const inteiro = (valor, min, max, padrao) => (Number.isFinite(Number(valor)) && valor !== null && valor !== "" ? Math.min(max, Math.max(min, Math.round(Number(valor)))) : padrao);
const obj = (valor) => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {});

// Cada grupo é normalizado a partir do PADRÃO: só as chaves que o padrão conhece existem (chave desconhecida some), e o tipo do valor
// padrão diz como validar (booleano, número com limites, cor #rrggbb, lista fechada ou texto com tamanho máximo).
function normalizarGrupo(nome, bruto, padrao){
  const b = obj(bruto), saida = {};
  Object.keys(padrao).forEach((chave) => {
    const caminho = `${nome}.${chave}`, p = padrao[chave], v = b[chave];
    if(typeof p === "boolean") saida[chave] = booleano(v, p);
    else if(typeof p === "number") saida[chave] = inteiro(v, ...(LIMITES[caminho] || [0, 100]), p);
    else if(CAMPOS_COR.has(caminho)) saida[chave] = cor(v, p);
    else if(VALORES[caminho]) saida[chave] = escolha(v, VALORES[caminho], p);
    else saida[chave] = texto(v, p, LIMITES_TEXTO[caminho] ?? 120);
  });
  return saida;
}

export function normalizarLayout(bruto){
  const b = obj(bruto), P = LAYOUT_PADRAO;
  const capa = normalizarGrupo("capa", b.capa, P.capa);
  const rodape = normalizarGrupo("rodape", b.rodape, P.rodape);
  if(typeof obj(b.rodape).mostrarLogo !== "boolean") rodape.mostrarLogo = capa.mostrarLogo;   // layouts antigos: a logo do rodapé seguia a da capa
  return {
    versao: 1,
    capa,
    cores: normalizarGrupo("cores", b.cores, P.cores),
    fonte: escolha(b.fonte, Object.keys(FONTES), P.fonte),
    texto: normalizarGrupo("texto", b.texto, P.texto),
    pagina: normalizarGrupo("pagina", b.pagina, P.pagina),
    resumo: booleano(b.resumo, P.resumo),
    ambientes: normalizarGrupo("ambientes", b.ambientes, P.ambientes),
    moveis: normalizarGrupo("moveis", b.moveis, P.moveis),
    rodape,
    pdf: normalizarGrupo("pdf", b.pdf, P.pdf),
  };
}

// Junta parte de uma configuração (um modelo, ou o layout de outro decorador) por cima de outra, grupo a grupo.
export function mesclarLayout(base, parcial){
  const a = obj(base), p = obj(parcial), saida = { ...a };
  Object.keys(p).forEach((chave) => {
    saida[chave] = obj(a[chave]) === a[chave] && obj(p[chave]) === p[chave] ? { ...a[chave], ...p[chave] } : p[chave];
  });
  return saida;
}

export const layoutDoModelo = (chave) => normalizarLayout(mesclarLayout(LAYOUT_PADRAO, (MODELOS.find((m) => m.chave === chave) || MODELOS[0]).config));

// Cores efetivas: as do decorador (catálogo dele) quando o layout pede e elas existem; senão as do próprio layout.
export function coresEfetivas(layout, decorador){
  const c = layout.cores;
  const hexOuNada = (v) => (typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim().toLowerCase() : "");
  return {
    principal: (c.usarDoDecorador && hexOuNada(decorador?.cor_primaria)) || c.principal,
    destaque: (c.usarDoDecorador && hexOuNada(decorador?.cor_secundaria)) || c.destaque,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Contraste: quem escolhe uma página escura (ou um cartão escuro) não precisa lembrar de trocar a cor do texto — o texto se ajusta.
function rgb(hex){
  const h = String(hex || "").trim().replace("#", "");
  const cheio = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  if(!/^[0-9a-f]{6}$/i.test(cheio)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16));
}
const paraHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
export function luminancia(hex){
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b){
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Mistura t (0-1) de `a` com o resto de `b`.
export function misturar(a, b, t){
  const x = rgb(a), y = rgb(b);
  return paraHex(x.map((v, i) => v * t + y[i] * (1 - t)));
}
const TEXTO_CLARO = "#f7f3ec", TEXTO_ESCURO = "#1f1a16";
// Cor de texto legível sobre `fundo`: a preferida (a cor principal do layout) quando dá contraste, senão a melhor entre clara e escura.
export function textoSobre(fundo, preferida){
  if(preferida && contraste(preferida, fundo) >= 4.5) return preferida;
  return contraste(TEXTO_CLARO, fundo) >= contraste(TEXTO_ESCURO, fundo) ? TEXTO_CLARO : TEXTO_ESCURO;
}

// Tema resolvido: as cores que a página realmente usa (já com contraste conferido) — fundo da capa, do rodapé, texto da página e dos cartões.
export function temaDaPagina(layout, decorador){
  const { principal, destaque } = coresEfetivas(layout, decorador);
  const k = layout.cores, c = layout.capa;
  const fundo = k.fundoPagina, cartao = k.fundoCartoes, suave = k.tomSuave;
  const paginaEscura = luminancia(fundo) < 0.35;
  const texto = textoSobre(fundo, principal);
  const textoCartao = textoSobre(cartao, principal);
  const botao = contraste(principal, fundo) >= 3 ? principal : texto;
  const capaFundo = { creme: suave, branco: "#ffffff", escuro: principal, cor: c.corFundo }[c.fundo];
  const rodapeFundo = { auto: c.fundo === "escuro" ? principal : suave, creme: suave, branco: "#ffffff", escuro: principal, destaque }[layout.rodape.fundo];
  const rodapeTexto = textoSobre(rodapeFundo, principal);
  return {
    principal, destaque, fundo, cartao, suave, texto, textoCartao,
    muted: paginaEscura ? misturar(texto, fundo, 0.66) : "#77716a",
    linha: paginaEscura ? misturar(texto, fundo, 0.2) : "#e7e0d6",
    mutedCartao: misturar(textoCartao, cartao, 0.62),
    fotoMovel: misturar(cartao, destaque, 0.95),
    botao, botaoTexto: textoSobre(botao, "#ffffff"),
    capaFundo, capaEscura: luminancia(capaFundo) < 0.4, capaTexto: luminancia(capaFundo) < 0.4 ? "#ffffff" : textoSobre(capaFundo, principal),
    rodapeFundo, rodapeTexto, rodapeMuted: misturar(rodapeTexto, rodapeFundo, 0.7),
  };
}

// Medidas da página do PDF (mm): usadas pela regra @page e pela altura da capa impressa.
export function paginaPdf(layout){
  const p = layout.pdf, [larg, alt] = PAPEL_MM[p.papel], deitada = p.orientacao === "paisagem", margem = MARGEM_MM[p.margem];
  const altura = deitada ? larg : alt, largura = deitada ? alt : larg;
  // área útil menos uma folga: 3mm em pé, 8mm deitada (a capa nunca pode estourar a página e empurrar o resto)
  const util = altura - margem * 2 - (deitada ? 8 : 3);
  const fator = p.capaPaginaInteira ? 1 : ALTURA_CAPA[layout.capa.altura] / 100;
  return { largura, altura, margem, capaAltura: Math.round(util * fator * 10) / 10 };
}
export function regraPagina(layout){
  const p = layout.pdf, { margem } = paginaPdf(layout);
  const numero = p.numerarPaginas ? `@bottom-center{content:counter(page);font:9pt sans-serif;color:#77716a}` : "";
  return `@page{size:${PAPEL_CSS[p.papel]} ${p.orientacao === "paisagem" ? "landscape" : "portrait"};margin:${margem}mm;${numero}}`;
}

// Variáveis CSS da página (uma tabela só, consumida por projeto.mjs). Tudo sai de VALORES/tabelas acima ou de cores já validadas.
export function variaveisCss(layout, decorador){
  const t = temaDaPagina(layout, decorador), c = layout.capa, pg = layout.pagina, a = layout.ambientes, m = layout.moveis, r = layout.rodape;
  const fonte = FONTES[layout.fonte];
  const [sombraA, sombraB] = ESCURECER[c.escurecer];
  const [logoAlt, logoLarg] = LOGO[c.tamanhoLogo];
  return {
    "--pj-ink": t.principal, "--pj-accent": t.destaque,
    "--pj-titulo": fonte.titulo, "--pj-corpo": fonte.corpo, "--pj-cols": String(m.colunas),
    "--pj-fundo": t.fundo, "--pj-cream": t.suave, "--pj-cartao": t.cartao, "--pj-texto": t.texto, "--pj-texto-cartao": t.textoCartao,
    "--pj-muted": t.muted, "--pj-line": t.linha, "--pj-muted-cartao": t.mutedCartao, "--pj-foto-bg": t.fotoMovel,
    "--pj-btn": t.botao, "--pj-btn-texto": t.botaoTexto,
    "--pj-rodape-bg": t.rodapeFundo, "--pj-rodape-texto": t.rodapeTexto, "--pj-rodape-muted": t.rodapeMuted,
    "--pj-base": TAMANHO_TEXTO[layout.texto.tamanho], "--pj-peso-titulos": PESO_TITULOS[layout.texto.pesoTitulos],
    "--pj-h1-escala": String(ESCALA_NOME[c.tamanhoNome]), "--pj-h2-escala": String(ESCALA_TITULO[a.tamanhoTitulo]), "--pj-msg-escala": String(ESCALA_MENSAGEM[r.tamanhoMensagem]),
    "--pj-max": LARGURA[pg.largura], "--pj-espaco": ESPACO_SECOES[pg.espaco], "--pj-raio": CANTOS[pg.cantos],
    "--pj-rratio": PROPORCAO_RENDER[a.proporcao], "--pj-gap-fotos": ESPACO_FOTOS[a.espacoFotos],
    "--pj-gap-moveis": ESPACO_MOVEIS[m.espacamento], "--pj-mratio": PROPORCAO_MOVEL[m.proporcaoFoto],
    "--pj-capa-vh": String(ALTURA_CAPA[c.altura]), "--pj-capa-bg": t.capaFundo, "--pj-capa-texto": t.capaTexto,
    "--pj-sombra-a": String(sombraA), "--pj-sombra-b": String(sombraB),
    "--pj-logo-h": logoAlt, "--pj-logo-w": logoLarg, "--pj-casal-escala": String(FOTO_CASAL[c.tamanhoFotoCasal]), "--pj-casal-raio": CASAL_CANTOS[c.formatoFotoCasal],
    "--pj-capa-h": `${paginaPdf(layout).capaAltura}mm`,
  };
}
