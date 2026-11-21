// Etapa 4: Compras e Almoxarifado como no dia a dia (mesmas funções das telas), feito pela vendedora da demonstração:
// fornecedores completos (com logo), materiais no Almoxarifado com entrada de estoque, solicitações de compra da equipe,
// solicitações de manutenção, cotação com propostas de 2 a 3 fornecedores, pedido de compra e pagamento no Contas a Pagar.
const C = require("./comum.cjs");
// anotações próprias (o roteiro dos pedidos grava o arquivo comum ao mesmo tempo)
const fsx = require("fs"), arqC = require("path").join(C.raiz, ".tmp", "demo-diretoria-compras.json");
const lerC = () => { try { return JSON.parse(fsx.readFileSync(arqC, "utf8")); } catch { return {}; } };
const { chromium } = require("playwright");
const crypto = require("crypto");

const FORN = {
  "Tintas Horizonte": { cat: "materiais", resp: "Sérgio Paiva", tel: "2422314455", email: "vendas@tintashorizonte.com.br", rua: "Rua Dr. Thouzet", num: "310", bairro: "Quitandinha", cidade: "Petrópolis", cond: "28 dias" },
  "Marcenaria Forma & Arte": { cat: "madeira", resp: "Antônio Reis", tel: "24988012233", email: "contato@formaearte.com.br", rua: "Estrada Mineira", num: "1420", bairro: "Corrêas", cidade: "Petrópolis", cond: "50% entrada / 50% entrega" },
  "Ferragens Base Sul": { cat: "materiais", resp: "Cláudio Mendes", tel: "2422427788", email: "pedidos@ferragensbasesul.com.br", rua: "Rua Washington Luiz", num: "88", bairro: "Centro", cidade: "Petrópolis", cond: "À vista no PIX" },
  "Limpeza Brilho Total": { cat: "limpeza", resp: "Rosana Freitas", tel: "24999324411", email: "atendimento@brilhototal.com.br", rua: "Rua General Rondon", num: "75", bairro: "Quitandinha", cidade: "Petrópolis", cond: "21 dias" },
  "Tecidos Aurora Ltda": { cat: "insumos", resp: "Mônica Aurora", tel: "2125078899", email: "comercial@tecidosaurora.com.br", rua: "Rua Senhor dos Passos", num: "214", bairro: "Centro", cidade: "Rio de Janeiro", cond: "30/60 dias" },
  "Transportes Caminho Certo": { cat: "servicos", resp: "Wagner Lopes", tel: "24992216677", email: "operacao@caminhocerto.com.br", rua: "Estrada União e Indústria", num: "5300", bairro: "Itaipava", cidade: "Petrópolis", cond: "Fechamento semanal" },
};
const MATERIAIS = [
  { nome: "Feltro adesivo para pés de móveis", unidade: "PCT", cat: "Insumos", min: 10, ideal: 30, valor: 18.9, qtd: 6, forn: "Ferragens Base Sul" },
  { nome: "Plástico bolha 1,30 m x 100 m", unidade: "RL", cat: "Embalagem", min: 4, ideal: 12, valor: 145, qtd: 9, forn: "Ferragens Base Sul" },
  { nome: "Fita crepe 48 mm", unidade: "UN", cat: "Embalagem", min: 24, ideal: 60, valor: 9.8, qtd: 30, forn: "Ferragens Base Sul" },
  { nome: "Tecido linho off white", unidade: "M", cat: "Tecidos", min: 30, ideal: 100, valor: 42.5, qtd: 64, forn: "Tecidos Aurora Ltda" },
  { nome: "Espuma D33 5 cm", unidade: "UN", cat: "Estofamento", min: 6, ideal: 20, valor: 89, qtd: 11, forn: "Tecidos Aurora Ltda" },
  { nome: "Verniz marítimo 3,6 L", unidade: "GL", cat: "Pintura", min: 3, ideal: 8, valor: 178, qtd: 2, forn: "Tintas Horizonte" },
  { nome: "Lixa d'água grão 220", unidade: "UN", cat: "Pintura", min: 50, ideal: 150, valor: 2.4, qtd: 120, forn: "Tintas Horizonte" },
  { nome: "Cola de contato 2,8 kg", unidade: "UN", cat: "Estofamento", min: 2, ideal: 6, valor: 96, qtd: 5, forn: "Tecidos Aurora Ltda" },
  { nome: "Detergente neutro 5 L", unidade: "GL", cat: "Limpeza", min: 4, ideal: 10, valor: 38, qtd: 7, forn: "Limpeza Brilho Total" },
  { nome: "Parafuso philips 4,0 x 40 (caixa 500)", unidade: "CX", cat: "Ferragens", min: 2, ideal: 6, valor: 54, qtd: 4, forn: "Ferragens Base Sul" },
];
// Solicitações de compra da equipe (o que a Carla registraria depois da conversa)
const SOLICITACOES = [
  { k: "s1", descricao_item: "Feltro adesivo para pés de móveis", quantidade: 20, unidade: "PCT", dias: 6, motivo: "Proteger o deck de madeira no evento do Solar das Palmeiras", justificativa: "O local exige feltro em todos os pés dos móveis e o estoque atual (6 pacotes) não cobre as 60 cadeiras.", alternativas: "Conferido no almoxarifado: só 6 pacotes.", pedido: "Pedido 13 · Solar das Palmeiras", material: "Feltro adesivo para pés de móveis", cotar: "c1" },
  { k: "s2", descricao_item: "Verniz marítimo 3,6 L", quantidade: 4, unidade: "GL", dias: 8, motivo: "Retocar as mesas Nice que voltaram riscadas", justificativa: "Duas mesas voltaram do último casamento com o tampo marcado; o estoque tem só 2 galões.", alternativas: "Polimento não resolve os riscos fundos.", pedido: "", material: "Verniz marítimo 3,6 L", cotar: "c1" },
  { k: "s3", descricao_item: "Plástico bolha 1,30 m x 100 m", quantidade: 6, unidade: "RL", dias: 5, motivo: "Embalar estofados no transporte", justificativa: "Temporada de casamentos: 4 eventos com sofás nas próximas semanas.", alternativas: "Reaproveitamos o que dá, mas os rolos estão no fim.", pedido: "", material: "Plástico bolha 1,30 m x 100 m", cotar: "c1" },
  { k: "s4", descricao_item: "Tecido linho off white", quantidade: 40, unidade: "M", dias: 15, motivo: "Trocar a capa de 4 poltronas Ellie", justificativa: "As capas estão desbotadas e a decoradora Juliana Prado pediu o tom claro para o evento do dia 12/12.", alternativas: "Lavagem já foi feita duas vezes, não volta a cor.", pedido: "Pedido 12 · Fazenda Vale do Cuiabá", material: "Tecido linho off white", cotar: "c2" },
  { k: "s5", descricao_item: "Luvas de proteção nitrílicas (par)", quantidade: 30, unidade: "PAR", dias: 4, motivo: "Equipe de montagem", justificativa: "As luvas atuais rasgaram; a equipe carrega móveis com farpas e vidro.", alternativas: "Não há luvas no almoxarifado.", pedido: "" },
  { k: "s6", descricao_item: "Carrinho de carga plataforma 300 kg", quantidade: 1, unidade: "UN", dias: 20, motivo: "Subir móveis no Recanto Serra Verde (2º andar, sem elevador)", justificativa: "Hoje carregamos no braço; o carrinho reduz o tempo de montagem e o risco de dano.", alternativas: "Pegamos emprestado uma vez, não dá para depender disso.", pedido: "Pedido 11 · Recanto Serra Verde", produto_url: "https://exemplo.com.br/carrinho-plataforma-300kg" },
];
const MANUTENCAO = [
  { titulo: "Lâmpadas queimadas no corredor do estoque de cadeiras", local: "Galpão · Corredor B", categoria: "eletrica", prioridade: "alta", dias: 3, descricao: "Três lâmpadas queimadas no corredor B. A triagem está separando cadeiras com lanterna à noite." },
  { titulo: "Infiltração na parede da costura", local: "Galpão · Sala de costura", categoria: "alvenaria", prioridade: "normal", dias: 15, descricao: "Mancha de umidade de 1 metro na parede atrás das máquinas. Os tecidos não podem ficar encostados." },
  { titulo: "Portão de carga travando", local: "Galpão · Doca de carregamento", categoria: "portas_janelas", prioridade: "urgente", dias: 2, descricao: "O portão da doca trava no meio do caminho; atrasou o carregamento de ontem em 20 minutos." },
];

(async () => {
  const E = { ...C.lerEstado(), compras: lerC() };
  E.compras ||= {};
  const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const rpc = async (nome, args, onde) => C.check(await sb.rpc(nome, args), onde || nome);
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    /* 1. fornecedores completos (como na tela Cadastro de Fornecedores) */
    const fornIds = {};
    const fs = C.check(await sb.from("fornecedores").select("id,nome_fantasia,nome_razao_social,foto_url").eq("empresa_id", C.EMPRESA));
    for (const f of fs) {
      const nome = f.nome_fantasia || f.nome_razao_social, d = FORN[nome];
      fornIds[nome] = f.id;
      if (!d || E.compras["forn:" + nome]) continue;
      const img = await C.fotoFicticia(browser, { tipo: "logo", seed: "forn-" + nome, texto: nome.split(" ")[0] });
      const pth = `${C.EMPRESA}/fornecedores/${f.id}-${Date.now()}.jpg`;
      C.check(await sb.storage.from("itens").upload(pth, img, { contentType: "image/jpeg" }), "logo do fornecedor");
      const foto = sb.storage.from("itens").getPublicUrl(pth).data.publicUrl;
      C.check(await sb.from("fornecedores").update({ categoria: d.cat, status: "ativo", tipo: d.cat === "servicos" ? "servicos" : d.cat === "insumos" ? "insumos" : "materiais", nome_razao_social: f.nome_razao_social || nome + " Ltda", documento: C.cnpj("forn" + nome),
        logradouro: d.rua, numero: d.num, bairro: d.bairro, cidade: d.cidade, estado: "RJ", endereco_google: `${d.rua}, ${d.num} - ${d.bairro}, ${d.cidade} - RJ`,
        telefone: d.tel, email: d.email, responsavel: d.resp, contato_responsavel: d.resp, condicao_pagamento_padrao: d.cond, forma_pagamento_padrao: /PIX/i.test(d.cond) ? "pix" : "boleto",
        observacoes: "Fornecedor homologado em 2025.", foto_url: foto, foto_path: pth }).eq("id", f.id), "fornecedor " + nome);
      E.compras["forn:" + nome] = true; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1));
      console.log("ok - fornecedor completo: " + nome);
    }

    /* 2. materiais no Almoxarifado com entrada de estoque (mesmo caminho do "Entrada de material") */
    E.compras.materiais ||= {};
    for (const m of MATERIAIS) {
      if (E.compras.materiais[m.nome]) continue;
      const mat = C.check(await sb.from("warehouse_materials").insert({ empresa_id: C.EMPRESA, codigo: "", nome: m.nome, categoria: m.cat, unidade: m.unidade, valor_unitario: m.valor,
        estoque_minimo: m.min, estoque_ideal: m.ideal, status: "disponivel", localizacao: "Galpão · Prateleira " + "ABCD"[m.nome.length % 4] + (m.nome.length % 6 + 1) }).select().single(), "material " + m.nome);
      await rpc("register_warehouse_manual_movement", { p_material_id: mat.id, p_tipo: "entrada", p_quantidade: m.qtd,
        p_payload: { unidade: m.unidade, documento: "NF " + (41000 + m.nome.length * 37), observacao: "Compra de reposição", valor_unitario: m.valor, fornecedor: m.forn } }, "entrada " + m.nome);
      E.compras.materiais[m.nome] = mat.id; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1));
      await C.anotar([{ tabela: "warehouse_materials", chave: "id", valor: mat.id }]);
      console.log("ok - material " + mat.codigo + " " + m.nome + " (" + m.qtd + " " + m.unidade + ")");
    }

    /* 3. solicitações de compra da equipe (compras_galpao, a mesma da tela Solicitação de compra) */
    E.compras.sol ||= {};
    for (const s of SOLICITACOES) {
      if (E.compras.sol[s.k]) continue;
      const obs = ["Para que: " + s.motivo, "Por que precisa: " + s.justificativa, s.alternativas ? "Alternativas: " + s.alternativas : "", s.pedido ? "Pedido / evento: " + s.pedido : ""].filter(Boolean).join("\n");
      const r = await rpc("compras_galpao", { p_empresa: C.EMPRESA, p_acao: "criar", p_dados: { descricao_item: s.descricao_item, quantidade: s.quantidade, unidade: s.unidade, data_necessidade: C.dia(s.dias), produto_url: s.produto_url || "",
        observacao: obs, motivo: s.motivo, justificativa: s.justificativa, alternativas: s.alternativas, pedido: s.pedido, observacao_extra: "" } }, "solicitação " + s.k);
      const id = r?.id || r?.registro?.id || r;
      if (s.material) await rpc("compras_operar", { p_empresa: C.EMPRESA, p_acao: "vincular_material", p_dados: { id, material_id: E.compras.materiais[s.material] } }, "vincular " + s.k);
      E.compras.sol[s.k] = id; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1));
      await C.anotar([{ tabela: "compras_registros", chave: "id", valor: id }]);
      console.log("ok - solicitação de compra: " + s.descricao_item);
    }

    /* 4. solicitações de manutenção (o Marcos registraria; viram serviços em Compras) */
    E.compras.manut ||= {};
    for (const m of MANUTENCAO) {
      if (E.compras.manut[m.titulo]) continue;
      const r = await rpc("manutencao_predial_operar", { p_empresa: C.EMPRESA, p_acao: "criar", p_dados: { token: crypto.randomUUID(), titulo: m.titulo, local: m.local, descricao: m.descricao, categoria: m.categoria, prioridade: m.prioridade, necessario_ate: C.dia(m.dias) } }, "manutenção");
      const id = r?.id || r?.solicitacao?.id || r;
      E.compras.manut[m.titulo] = id; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1));
      await C.anotar([{ tabela: "manutencao_predial_solicitacoes", chave: "id", valor: id }]);
      console.log("ok - manutenção: " + m.titulo);
    }
    console.log(JSON.stringify(E.compras, null, 1).slice(0, 600));
  } finally { await browser.close(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
