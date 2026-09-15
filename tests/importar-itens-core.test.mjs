import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNumeroBR, parseBooleanoEstrito, parseKitCell,
  detectarLinhaCabecalho, detectarColunasDePreco, mapearColunas,
  criarCanonicalizador, validarLinha, construirPayloadItem, casarFornecedor,
  montarDescricaoTotal, CAMPOS_ITEM, ehMarcadorDeVazio,
} from "../Modulos/Importacao/ImportarItens/importar-itens-core.mjs";

// ===================== parseNumeroBR =====================

test("parseNumeroBR: formato BR com milhar e decimal (1.500,00)", () => {
  assert.equal(parseNumeroBR("1.500,00"), 1500);
});

test("parseNumeroBR: decimal simples com ponto nao vira milhar (1.2 continua 1.2)", () => {
  assert.equal(parseNumeroBR("1.2"), 1.2);
});

test("parseNumeroBR: decimal com virgula sem milhar (1,5)", () => {
  assert.equal(parseNumeroBR("1,5"), 1.5);
});

test("parseNumeroBR: numero já number passa direto", () => {
  assert.equal(parseNumeroBR(288.75), 288.75);
});

test("parseNumeroBR: string vazia/nula vira NaN", () => {
  assert.ok(Number.isNaN(parseNumeroBR("")));
  assert.ok(Number.isNaN(parseNumeroBR(null)));
});

// ===================== parseBooleanoEstrito =====================

test("parseBooleanoEstrito: aceita Sim/S/1/Verdadeiro/True/X como verdadeiro", () => {
  for (const v of ["Sim", "s", "1", "Verdadeiro", "TRUE", "x", "X"]) {
    assert.equal(parseBooleanoEstrito(v, false).value, true, `esperava true para "${v}"`);
    assert.equal(parseBooleanoEstrito(v, false).recognized, true);
  }
});

test("parseBooleanoEstrito: aceita Nao/N/0/Falso/False como falso", () => {
  for (const v of ["Não", "nao", "N", "0", "Falso", "false"]) {
    assert.equal(parseBooleanoEstrito(v, true).value, false, `esperava false para "${v}"`);
    assert.equal(parseBooleanoEstrito(v, true).recognized, true);
  }
});

test("parseBooleanoEstrito: celula vazia usa o default e nao conta como pendencia", () => {
  const r = parseBooleanoEstrito("", true);
  assert.equal(r.value, true);
  assert.equal(r.recognized, true);
  assert.equal(r.vazio, true);
});

test("parseBooleanoEstrito: valor desconhecido NAO é convertido silenciosamente", () => {
  const r = parseBooleanoEstrito("talvez", false);
  assert.equal(r.recognized, false);
  assert.equal(r.vazio, false);
  // ainda devolve o default pra nao quebrar o payload, mas fica marcado como não-reconhecido
  assert.equal(r.value, false);
});

// ===================== parseKitCell =====================

test("parseKitCell: ITEM simples", () => {
  const r = parseKitCell("ITEM");
  assert.deepEqual(r, { reconhecido: true, tipo: "Item", componentes: [] });
});

test("parseKitCell: COMPONENTE simples (case-insensitive)", () => {
  const r = parseKitCell("componente");
  assert.equal(r.tipo, "Componente");
});

test("parseKitCell: KIT com componentes multi-linha (formato real do cliente)", () => {
  const r = parseKitCell("KIT\n1|APA020-BASE\n1|JMA038-VIDRO");
  assert.equal(r.reconhecido, true);
  assert.equal(r.tipo, "Kit");
  assert.deepEqual(r.componentes, [
    { quantidade: 1, referencia: "APA020-BASE" },
    { quantidade: 1, referencia: "JMA038-VIDRO" },
  ]);
  assert.equal(r.erros.length, 0);
});

test("parseKitCell: KIT com quantidade maior que 1", () => {
  const r = parseKitCell("KIT\n2|APA023-PE\n1|APA023-TAMPO");
  assert.equal(r.componentes[0].quantidade, 2);
});

test("parseKitCell: KIT sem nenhuma linha de componente gera erro", () => {
  const r = parseKitCell("KIT");
  assert.equal(r.tipo, "Kit");
  assert.equal(r.erros.length, 1);
});

test("parseKitCell: linha de componente mal formada (sem \"|\") vira erro, nao trava", () => {
  const r = parseKitCell("KIT\nAPA020-BASE\n1|JMA038-VIDRO");
  assert.equal(r.componentes.length, 1);
  assert.equal(r.erros.length, 1);
});

test("parseKitCell: valor desconhecido (nao vazio) nao é reconhecido", () => {
  assert.equal(parseKitCell("qualquer coisa").reconhecido, false);
});

test('parseKitCell: "ITEM E COMPONENTE" (caso real: produto alugado avulso e usado como peca de kit) vira Item', () => {
  const r = parseKitCell("ITEM E COMPONENTE");
  assert.equal(r.reconhecido, true);
  assert.equal(r.tipo, "Item");
  assert.equal(r.combinado, true);
});

test('parseKitCell: variacoes de separador da combinacao Item/Componente sao aceitas', () => {
  for (const v of ["ITEM/COMPONENTE", "Componente e Item", "item, componente", "COMPONENTE/ITEM"]) {
    const r = parseKitCell(v);
    assert.equal(r.reconhecido, true, `esperava reconhecido para "${v}"`);
    assert.equal(r.tipo, "Item", `esperava tipo Item para "${v}"`);
  }
});

test('parseKitCell: "componente" sozinho (sem combinacao) NAO conta como combinado', () => {
  const r = parseKitCell("componente");
  assert.equal(r.tipo, "Componente");
  assert.equal(r.combinado, undefined);
});

test("parseKitCell: celula vazia vira Item por padrao (nao bloqueia a linha)", () => {
  const r = parseKitCell("");
  assert.equal(r.reconhecido, true);
  assert.equal(r.tipo, "Item");
  assert.equal(r.vazio, true);
  assert.deepEqual(r.componentes, []);
});

test("parseKitCell: exemplo real do cliente (KIT / 1|COC001-PE / 1|COC001-TAMPO)", () => {
  const r = parseKitCell("KIT\n1|COC001-PE\n1|COC001-TAMPO");
  assert.equal(r.reconhecido, true);
  assert.equal(r.tipo, "Kit");
  assert.deepEqual(r.componentes, [
    { quantidade: 1, referencia: "COC001-PE" },
    { quantidade: 1, referencia: "COC001-TAMPO" },
  ]);
  assert.equal(r.erros.length, 0);
});

// ===================== ehMarcadorDeVazio ("#" = em branco) =====================

test('ehMarcadorDeVazio: celula com exatamente "#" e marcador de vazio', () => {
  assert.equal(ehMarcadorDeVazio("#"), true);
  assert.equal(ehMarcadorDeVazio(" # "), true);
});

test('ehMarcadorDeVazio: "#" dentro de outro texto NAO conta (só a célula inteira)', () => {
  assert.equal(ehMarcadorDeVazio("#123"), false);
  assert.equal(ehMarcadorDeVazio(""), false);
  assert.equal(ehMarcadorDeVazio("Sofá"), false);
});

// ===================== detectarLinhaCabecalho =====================

test("detectarLinhaCabecalho: cabecalho de uma linha so (modelo baixavel)", () => {
  const linhas = [
    ["Código", "ESPECIFICAÇÃO", "PRODUTO", "KIT"],
    ["APA001", "Aparador P", "Aparador", "ITEM"],
  ];
  assert.equal(detectarLinhaCabecalho(linhas), 0);
});

test("detectarLinhaCabecalho: planilha real com linha de grupo acima do cabecalho", () => {
  const linhas = [
    ["", "", "", "TABELA 2026 Padrão"],
    ["Código", "ESPECIFICAÇÃO", "PRODUTO", "Val Unitário Locação"],
    ["APA001", "Aparador P", "Aparador", "288.75"],
  ];
  assert.equal(detectarLinhaCabecalho(linhas), 1);
});

// ===================== detectarColunasDePreco =====================

test("detectarColunasDePreco: acha as 3 colunas de preco e le nome/ano da linha de grupo", () => {
  const headerRow = ["Código", "KIT", "Val Unitário Locação", "Val Unitário Locação", "Val Unitário Locação"];
  const groupRow = ["", "", "TABELA 2024 Padrão", "TABELA 2025 Padrão", "TABELA 2026 Promocional"];
  const colunas = detectarColunasDePreco(headerRow, groupRow);
  assert.equal(colunas.length, 3);
  assert.equal(colunas[0].nomeTabela, "TABELA 2024 Padrão");
  assert.equal(colunas[0].ano, 2024);
  assert.equal(colunas[2].ano, 2026);
});

test("detectarColunasDePreco: sem linha de grupo, nome fica null (nao inventa)", () => {
  const headerRow = ["Código", "Val Unitário Locação"];
  const colunas = detectarColunasDePreco(headerRow, null);
  assert.equal(colunas.length, 1);
  assert.equal(colunas[0].nomeTabela, null);
  assert.equal(colunas[0].ano, null);
});

test("detectarColunasDePreco: nome cortado/sem ano reconhecivel nao inventa ano", () => {
  const headerRow = ["Código", "Val Unitário Locação"];
  const groupRow = ["", "TABELA 20..."];
  const colunas = detectarColunasDePreco(headerRow, groupRow);
  assert.equal(colunas[0].nomeTabela, "TABELA 20...");
  assert.equal(colunas[0].ano, null, "nao deve adivinhar ano de um nome truncado");
});

// ===================== canonicalizador (normalização de classificação) =====================

test("canonicalizador: reaproveita a primeira grafia vista (acento/caixa)", () => {
  const canon = criarCanonicalizador();
  assert.equal(canon("Sofá"), "Sofá");
  assert.equal(canon("sofá"), "Sofá");
  assert.equal(canon("SOFÁ "), "Sofá");
  assert.equal(canon("Sofás"), "Sofás"); // plural é uma palavra normalizada diferente, não funde
});

test("canonicalizador: espacos extras sao sempre colapsados", () => {
  const canon = criarCanonicalizador();
  assert.equal(canon("  Contemporânea   Classica "), "Contemporânea Classica");
});

test("canonicalizador: pode receber valores ja existentes no banco como base", () => {
  const canon = criarCanonicalizador(["Contemporânea"]);
  assert.equal(canon("contemporanea"), "Contemporânea");
  assert.equal(canon("Conteporanea"), "Conteporanea"); // normalizado diferente (typo real), não funde sozinho
});

// ===================== mapearColunas =====================

test("mapearColunas: acha colunas por nome, ignora reordenacao", () => {
  const headerRow = ["KIT", "Código", "ESPECIFICAÇÃO"];
  const { indices, faltando } = mapearColunas(headerRow);
  assert.equal(indices.referencia, 1);
  assert.equal(indices.kit_raw, 0);
  assert.ok(faltando.includes("CATEGORIA"));
});

// ===================== montarDescricaoTotal =====================

test("montarDescricaoTotal: monta no padrao usado pelo cadastro manual", () => {
  const texto = montarDescricaoTotal({ produto: "Aparador Clássico P", material: "Madeira", cor: "Castanho", descricao_complementar: "", largura: 0.84, altura: 0.78, profundidade: 0.42 });
  assert.equal(texto, "Aparador Clássico P Madeira Castanho (L) 0.84 m (A) 0.78 m (P) 0.42 m");
});

test("montarDescricaoTotal: PRODUTO (produto_base), quando preenchido, sempre vem primeiro no nome gerado", () => {
  const texto = montarDescricaoTotal({ produto_base: "Bar", produto: "Bistrol", material: "", cor: "", descricao_complementar: "", largura: 0.84, altura: 0.78, profundidade: 0.42 });
  assert.equal(texto, "Bar Bistrol (L) 0.84 m (A) 0.78 m (P) 0.42 m");
});

test("montarDescricaoTotal: sem PRODUTO (produto_base vazio), nome comeca direto pela ESPECIFICACAO", () => {
  const texto = montarDescricaoTotal({ produto_base: "", produto: "Aparador Clássico P", material: "", cor: "", descricao_complementar: "", largura: 0.84, altura: 0.78, profundidade: 0.42 });
  assert.equal(texto, "Aparador Clássico P (L) 0.84 m (A) 0.78 m (P) 0.42 m");
});

// ===================== casarFornecedor =====================

const FORNECEDORES = [
  { id: "f1", nome_razao_social: "Araras Móveis LTDA", nome_fantasia: "Araras" },
  { id: "f2", nome_razao_social: "MR Móveis Comércio", nome_fantasia: "MR Móveis" },
];

test("casarFornecedor: casa por nome fantasia normalizado", () => {
  const r = casarFornecedor("araras", FORNECEDORES);
  assert.equal(r.status, "encontrado");
  assert.equal(r.fornecedorId, "f1");
});

test("casarFornecedor: nao encontrado nao vincula (evita vinculo errado)", () => {
  const r = casarFornecedor("Fornecedor Novo Ltda", FORNECEDORES);
  assert.equal(r.status, "nao_encontrado");
  assert.equal(r.fornecedorId, null);
});

test("casarFornecedor: celula vazia nao tenta casar", () => {
  const r = casarFornecedor("", FORNECEDORES);
  assert.equal(r.status, "vazio");
});

// ===================== validarLinha (integração) =====================

const HEADER_ROW = CAMPOS_ITEM.map((c) => c.header);
const { indices: INDICES } = mapearColunas(HEADER_ROW);
const COLUNAS_PRECO_TESTE = [{ colIndex: HEADER_ROW.length, nomeTabela: "TABELA 2026 Padrão", ano: 2026 }];

function linhaCompleta(overrides = {}) {
  const base = {
    "Código": "APA001",
    "PRODUTO": "Aparador",
    "ESPECIFICAÇÃO": "Aparador Clássico P",
    "MATERIAL": "Madeira",
    "MARCA/MODELO": "",
    "COR": "Castanho Médio",
    "DESCRIÇÃO COMPLEMENTAR": "",
    "CATEGORIA": "Aparadores",
    "SUB-CATEGORIA": "Aparadores Clássicos",
    "FAMÍLIA": "Sala de Estar",
    "SETOR SEPARAÇÃO (CHAR 30)": "Aparadores",
    "LARGURA ou DIÂMETRO": 0.84,
    "ALTURA": 0.78,
    "PROFUNDIDADE": 0.42,
    "Fornecedor": "Araras",
    "Valor de Compra": 1400,
    "Valor de Reposição (+100%)": 2800,
    "Ordem de Exposição no Site": 170,
    "EXIBIR NO SITE (S/N)": "Sim",
    "DESTAQUE SITE (S/N)": "Não",
    "LOCAR SOMENTE NO KIT (S/N)": "Não",
    "ATIVO (S/N)": "Sim",
    "EXCLUSIVO (S/N)": "Não",
    "KIT": "ITEM",
    "Val Unitário Locação": 288.75,
  };
  Object.assign(base, overrides);
  const linhaArray = HEADER_ROW.map((h) => base[h] ?? "");
  linhaArray.push(base["Val Unitário Locação"]);
  return linhaArray;
}

function canonicalizadoresTeste() {
  return {
    categoria: criarCanonicalizador(), subcategoria: criarCanonicalizador(),
    familia: criarCanonicalizador(), grupo_separacao: criarCanonicalizador(), estilo: criarCanonicalizador(),
  };
}

test("validarLinha: linha completa e valida", () => {
  const r = validarLinha(linhaCompleta(), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.valores.produto, "Aparador Clássico P");
  assert.equal(r.valores.produto_base, "Aparador");
  assert.equal(r.valores.categoria, "Aparadores");
  assert.equal(r.valores.tipo, "Item");
  assert.equal(r.precos.length, 1);
  assert.equal(r.precos[0].valor, 288.75);
});

test("validarLinha: sem codigo bloqueia a linha (chave de idempotencia)", () => {
  const r = validarLinha(linhaCompleta({ "Código": "" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes("Código")));
});

test("validarLinha: sem nome (ESPECIFICACAO) bloqueia", () => {
  const r = validarLinha(linhaCompleta({ "ESPECIFICAÇÃO": "" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes("ESPECIFICAÇÃO")));
});

test("validarLinha: sem categoria bloqueia", () => {
  const r = validarLinha(linhaCompleta({ "CATEGORIA": "" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes("CATEGORIA")));
});

test("validarLinha: dimensao invalida (texto nao numerico) bloqueia", () => {
  const r = validarLinha(linhaCompleta({ "LARGURA ou DIÂMETRO": "abc" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, false);
});

test("validarLinha: booleano desconhecido vira PENDENCIA, nao erro bloqueante", () => {
  const r = validarLinha(linhaCompleta({ "ATIVO (S/N)": "talvez" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true, "linha continua importavel");
  assert.ok(r.pendencias.some((p) => p.includes("ATIVO")));
});

test("validarLinha: KIT vazio (caso real encontrado na planilha do cliente) vira Item + pendencia, nao bloqueia", () => {
  const r = validarLinha(linhaCompleta({ "KIT": "" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true, "linha continua importavel mesmo com KIT vazio");
  assert.equal(r.valores.tipo, "Item");
  assert.ok(r.pendencias.some((p) => p.includes("KIT")), "deve avisar que assumiu Item por falta de valor");
});

test('validarLinha: KIT "ITEM E COMPONENTE" (caso real do cliente) vira Item + pendencia, nao bloqueia', () => {
  const r = validarLinha(linhaCompleta({ "KIT": "ITEM E COMPONENTE" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.valores.tipo, "Item");
  assert.ok(r.pendencias.some((p) => p.includes("Item e Componente")), `deveria avisar sobre a combinacao: ${JSON.stringify(r.pendencias)}`);
});

test('validarLinha: KIT nao reconhecido mostra o valor bruto lido da celula na mensagem de erro (pra diagnosticar sem precisar de print)', () => {
  const r = validarLinha(linhaCompleta({ "KIT": "KITS\n1|EST009-BASE" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes("KITS") && e.includes("EST009-BASE")), `mensagem deveria conter o texto bruto da celula: ${JSON.stringify(r.erros)}`);
});

test("validarLinha: PRODUTO vazio nao bloqueia a linha (campo opcional)", () => {
  const r = validarLinha(linhaCompleta({ "PRODUTO": "" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true);
  assert.equal(r.valores.produto_base, "");
});

test('validarLinha: "#" em coluna de texto opcional vira campo vazio (convencao da planilha do cliente)', () => {
  const r = validarLinha(linhaCompleta({ "SUB-CATEGORIA": "#", "MARCA/MODELO": "#" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true);
  assert.equal(r.valores.subcategoria, "");
  assert.equal(r.valores.marca_modelo, "");
});

test('validarLinha: "#" na coluna KIT e tratado como vazio, vira Item + pendencia (igual celula em branco)', () => {
  const r = validarLinha(linhaCompleta({ "KIT": "#" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true);
  assert.equal(r.valores.tipo, "Item");
  assert.ok(r.pendencias.some((p) => p.includes("KIT")));
});

test('validarLinha: "#" na coluna de preco nao gera preco nenhum (nao vira 0 nem erro)', () => {
  const r = validarLinha(linhaCompleta({ "Val Unitário Locação": "#" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true);
  assert.equal(r.precos.length, 0);
});

test("validarLinha: dimensao igual a zero e aceita (ex.: item sem profundidade real)", () => {
  const r = validarLinha(linhaCompleta({ "PROFUNDIDADE": 0 }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.valores.profundidade, 0);
});

test("validarLinha: dimensao negativa continua bloqueando (só zero passou a ser aceito)", () => {
  const r = validarLinha(linhaCompleta({ "PROFUNDIDADE": -1 }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.ok, false);
});

test("validarLinha: linha de KIT com dimensao em branco BLOQUEIA (Kit tem medida propria, igual Item/Componente)", () => {
  const r = validarLinha(
    linhaCompleta({ "KIT": "KIT\n1|EST009-BASE\n1|EST009-ANDAR", "Código": "EST009", "LARGURA ou DIÂMETRO": "" }),
    INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste(),
  );
  assert.equal(r.ok, false, "kit sem dimensao deve bloquear, cada linha de kit tem medida propria");
});

test("validarLinha: linha de KIT com dimensao preenchida (inclusive zero) passa normalmente", () => {
  const r = validarLinha(
    linhaCompleta({ "KIT": "KIT\n1|EST009-BASE\n1|EST009-ANDAR", "Código": "EST009" }),
    INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste(),
  );
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.valores.tipo, "Kit");
});

test("validarLinha: ordem de exposicao vazia vira null, nao zero", () => {
  const r = validarLinha(linhaCompleta({ "Ordem de Exposição no Site": "" }), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  assert.equal(r.valores.ordem_exposicao_site, null);
});

test("validarLinha: linha de KIT com componentes fica ok e guarda a lista", () => {
  const r = validarLinha(
    linhaCompleta({ "KIT": "KIT\n1|APA020-BASE\n1|JMA038-VIDRO", "Código": "APA020" }),
    INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste(),
  );
  assert.equal(r.ok, true);
  assert.equal(r.valores.tipo, "Kit");
  assert.equal(r.valores.componentesKit.length, 2);
});

test("validarLinha: classificacoes sao normalizadas pelo canonicalizador compartilhado entre linhas", () => {
  const canon = canonicalizadoresTeste();
  const r1 = validarLinha(linhaCompleta({ "CATEGORIA": "Sofás" }), INDICES, COLUNAS_PRECO_TESTE, canon);
  const r2 = validarLinha(linhaCompleta({ "CATEGORIA": "sofás " }), INDICES, COLUNAS_PRECO_TESTE, canon);
  assert.equal(r1.valores.categoria, "Sofás");
  assert.equal(r2.valores.categoria, "Sofás", "segunda linha reaproveita a grafia da primeira");
});

// ===================== construirPayloadItem =====================

test("construirPayloadItem: monta payload com todos os campos novos", () => {
  const r = validarLinha(linhaCompleta(), INDICES, COLUNAS_PRECO_TESTE, canonicalizadoresTeste());
  const payload = construirPayloadItem(r.valores, "empresa-1", r.valores.referencia, "fornecedor-1");
  assert.equal(payload.empresa_id, "empresa-1");
  assert.equal(payload.referencia, "APA001");
  assert.equal(payload.fornecedor_id, "fornecedor-1");
  assert.equal(payload.tipo, "Item");
  assert.equal(payload.locar_somente_kit, false);
  assert.equal(payload.ativo, true);
  assert.ok(payload.volume_cubico > 0);
  assert.ok(!("valor_locacao" in payload), "valor_locacao nao é escrito diretamente pela importação (só via itens_precos + trigger)");
  assert.equal(payload.produto_base, "Aparador");
  assert.equal(payload.descricao_total, "Aparador Aparador Clássico P Madeira Castanho Médio (L) 0.84 m (A) 0.78 m (P) 0.42 m", "PRODUTO (produto_base) deve vir sempre antes da ESPECIFICACAO no nome gerado");
});
