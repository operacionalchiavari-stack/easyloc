// Etapa 2: pedidos criados NA TELA DO PEDIDO (a tela calcula frete, montagem, valores e parcelas como no dia a dia).
// Uso: node Scripts/demo-diretoria/2-pedidos.cjs [chave ...]   (sem chave: todos os que ainda não existem)
const C = require("./comum.cjs");
const { abrirNavegador } = require("./navegador.cjs");

const I = {
  katrinaVerde: "dfdf4ec2-30b9-46c6-8a77-1f39011d2409", katrinaCaqui: "3ae98e53-3167-4633-a66d-c48fa0e72fee", argus: "d5074734-b973-4815-a2b1-42927e6d4f85",
  toscana: "97e71ac5-7b5b-408d-bfc6-2e8d9d371ab1", emporio: "2a84dff8-5b14-47a5-a50b-af49e96a81d2", arabesco: "6f732353-10a6-4428-8724-b35918a44404",
  poltronaEllie: "182f777f-e746-4604-8637-1e174746757a", puffCapitone: "40c82b02-0c6c-43bf-ad20-6d6f4bf467f2", recamier: "5ccb49d2-3526-4976-9a93-279186ce14eb",
  blocco: "b4c5f821-0358-4a95-91e2-c1e22685752d", berlim: "956ae284-f6a5-441a-a8b4-e92fbffdecdb", chester: "ab681d85-fb0d-405c-9242-c290818bbe5d",
  gomus: "3d2a5de5-f529-4095-af20-db3fee830eb4", haus: "3877dc76-5870-492f-94e3-8ce33f1dde0d", aguines: "7120e7af-df70-4b5c-b81f-96a6a2e73c81",
  puffRipado: "13620fe3-1715-4a3b-9884-1f87e012fc26", mesaCarvalho: "67a416b1-4db7-452c-a35d-001454460547", elo: "5a94038e-e201-4a96-b6c5-2bbb475d4d53",
  nice: "0bffa539-f0cf-404d-9264-b7911c618383", estela: "8dcdb36a-8de4-4c58-ab9e-32bd1958979c", verona: "249cf1f2-c110-408a-a50f-4d86885c49b3",
  aparadorCacau: "01886a72-39bc-4f6b-af35-599e781eea50", aparadorOtto: "9c4d791c-c80a-4b2e-a580-3cb7e2bd872b", comodaToulon: "6e48b8d9-4988-4868-a216-ec5a1d974c76",
  estanteLord: "292162e4-1914-46fa-aa2f-6fa11831f855", estanteNoir: "2b7747eb-bdd5-4794-94ac-303dd2758437", provance: "07e4e3a8-76e9-4c3a-8ab6-90affd9c8d16",
  barDemolicao: "79fbc426-aaa6-4275-a919-ced981021d89", bancoPiton: "cee29755-dcd7-4931-a051-cf564dc1719a", carrinhoCha: "5b6d8cb4-5989-4d4f-ae60-1c8534ea50c5",
  estanteSolar: "a505df78-fc8a-49ee-94a7-f01af63c9954",
};
const MC = "Mesa dos convidados", LG = "Lounge", BAR = "Bar", CER = "Cerimônia", BOLO = "Mesa do bolo";
// finais: clientes finais (quem contrata o evento); etapa: até onde a operação vai (etapa 3)
const PEDIDOS = [
  { k: "P26", cli: "Ateliê Flor de Lis", loc: "Pousada Bosque das Hortênsias", tipo: /anivers/i, ev: -28, st: "aprovado", etapa: "fechado", finais: [["Helena Martins Castro", 1]], itens: [[I.katrinaCaqui, 30, MC], [I.estela, 4, MC], [I.puffRipado, 6, LG], [I.aparadorCacau, 1, BOLO]] },
  { k: "P25", cli: "Carolina Vieira", loc: "Hotel Mirante da Serra", tipo: /casamento/i, ev: -20, st: "aprovado", etapa: "fechado", finais: [["Beatriz Lacerda Souza", 2], ["Gustavo Henrique Prates", 3]], itens: [[I.argus, 50, MC], [I.nice, 5, MC], [I.chester, 1, LG], [I.poltronaEllie, 4, LG], [I.mesaCarvalho, 4, LG]] },
  { k: "P1", cli: "Mariana Albuquerque", loc: "Quinta das Araucárias", tipo: /casamento/i, ev: -12, st: "aprovado", etapa: "fechado", finais: [["Ana Beatriz Fontes", 4], ["Rafael Monteiro Lima", 5]], itens: [[I.toscana, 60, MC], [I.nice, 6, MC], [I.berlim, 2, LG], [I.poltronaEllie, 4, LG], [I.mesaCarvalho, 4, LG], [I.aparadorCacau, 2, BAR]] },
  { k: "P2", cli: "Ateliê Flor de Lis", loc: "Fazenda Vale do Cuiabá", tipo: /casamento/i, ev: -9, st: "aprovado", etapa: "fechado", finais: [["Larissa Quintela Dias", 6], ["Pedro Augusto Ramos", 7]], itens: [[I.katrinaCaqui, 40, MC], [I.estela, 5, MC], [I.gomus, 2, LG], [I.puffRipado, 6, LG], [I.barDemolicao, 1, BAR]] },
  { k: "P3", cli: "Bruna Campos Eventos", loc: "Hotel Mirante da Serra", tipo: /corporativ/i, ev: -6, st: "aprovado", etapa: "posicao", finais: [["Grupo Serra Alimentos Ltda", 8, true]], itens: [[I.argus, 50, MC], [I.verona, 3, MC], [I.chester, 1, LG], [I.haus, 4, LG], [I.elo, 2, LG]] },
  { k: "P4", cli: "Juliana Prado Design", loc: "Solar das Palmeiras", tipo: /casamento/i, ev: -4, st: "aprovado", etapa: "volta", finais: [["Mariana Couto Ribeiro", 9], ["Thiago Bastos Leal", 10]], itens: [[I.emporio, 30, MC], [I.nice, 4, MC], [I.aguines, 4, LG], [I.recamier, 1, LG], [I.estanteLord, 2, BAR]] },
  { k: "P5", cli: "Renata Lins Decorações", loc: "Recanto Serra Verde", tipo: /15|debut/i, ev: -1, st: "aprovado", etapa: "montado", finais: [["Cláudia Regina Nogueira", 11]], itens: [[I.katrinaVerde, 50, MC], [I.estela, 6, MC], [I.blocco, 2, LG], [I.puffCapitone, 4, LG], [I.comodaToulon, 1, BOLO]] },
  { k: "P6", cli: "Carolina Vieira", loc: "Pousada Bosque das Hortênsias", tipo: /anivers/i, ev: 0, st: "aprovado", etapa: "carregado", finais: [["Roberto Almeida Pinto", 12]], itens: [[I.arabesco, 20, MC], [I.mesaCarvalho, 6, MC], [I.haus, 2, LG], [I.provance, 1, BAR]] },
  { k: "P7", cli: "Studio Ramos Festas", loc: "Casa Alvorada Eventos", tipo: /casamento/i, ev: 2, st: "aprovado", etapa: "separado", finais: [["Júlia Fernandes Melo", 13], ["Bruno César Antunes", 14]], itens: [[I.katrinaCaqui, 30, MC], [I.nice, 4, MC], [I.gomus, 1, LG], [I.bancoPiton, 2, CER], [I.carrinhoCha, 1, BAR]] },
  { k: "P8", cli: "Mariana Albuquerque", loc: "Espaço Lago Azul", tipo: /casamento/i, ev: 3, st: "aprovado", etapa: "triagem", finais: [["Isabela Torres Vidal", 15], ["Lucas Andrade Brito", 16]], itens: [[I.argus, 40, MC], [I.verona, 2, MC], [I.berlim, 1, LG], [I.poltronaEllie, 4, LG]] },
  { k: "P9", cli: "Patrícia Moreira", loc: "Quinta das Araucárias", tipo: /anivers/i, ev: 9, st: "aprovado", finais: [["Fernanda Lopes Araújo", 17]], itens: [[I.toscana, 40, MC], [I.estela, 4, MC], [I.aparadorOtto, 1, BOLO]] },
  { k: "P10", cli: "Casa Lume Decoração", loc: "Hotel Mirante da Serra", tipo: /corporativ/i, ev: 14, st: "aprovado", finais: [["Vale Verde Tecnologia S.A.", 18, true]], itens: [[I.emporio, 20, MC], [I.verona, 2, MC], [I.chester, 1, LG]] },
  { k: "P11", cli: "Aline Duarte Eventos", loc: "Recanto Serra Verde", tipo: /casamento/i, ev: 16, st: "aprovado", finais: [["Camila Rezende Prado", 19], ["Diego Martins Sá", 20]], itens: [[I.katrinaVerde, 30, MC], [I.mesaCarvalho, 4, LG], [I.puffRipado, 4, LG]] },
  { k: "P12", cli: "Juliana Prado Design", loc: "Fazenda Vale do Cuiabá", tipo: /casamento/i, ev: 23, st: "aprovado", finais: [["Letícia Barros Cunha", 21], ["André Luiz Moreira", 22]], itens: [[I.argus, 60, MC], [I.nice, 6, MC], [I.berlim, 2, LG], [I.aguines, 4, LG], [I.barDemolicao, 1, BAR]] },
  { k: "P13", cli: "Renata Lins Decorações", loc: "Solar das Palmeiras", tipo: /casamento/i, ev: 30, st: "aprovado", finais: [["Paula Regina Faria", 23], ["Marcelo Viana Costa", 24]], itens: [[I.toscana, 50, MC], [I.estela, 6, MC], [I.gomus, 2, LG], [I.estanteSolar, 2, BAR]] },
  { k: "P14", cli: "Bruna Campos Eventos", loc: "Casa Alvorada Eventos", tipo: /corporativ/i, ev: 37, st: "aprovado", finais: [["Construtora Monte Belo Ltda", 25, true]], itens: [[I.arabesco, 24, MC], [I.elo, 2, LG], [I.haus, 4, LG]] },
  { k: "P15", cli: "Ateliê Flor de Lis", loc: "Pousada Bosque das Hortênsias", tipo: /anivers/i, ev: 12, st: "pre_reserva", ate: 5, itens: [[I.katrinaCaqui, 30, MC], [I.puffCapitone, 4, LG], [I.estanteNoir, 1, BAR]] },
  { k: "P16", cli: "Carolina Vieira", loc: "Espaço Lago Azul", tipo: /casamento/i, ev: 20, st: "pre_reserva", ate: 2, itens: [[I.emporio, 30, MC], [I.nice, 4, MC]] },
  { k: "P17", cli: "Studio Ramos Festas", loc: "Quinta das Araucárias", tipo: /15|debut/i, ev: 27, st: "pre_reserva", ate: 8, itens: [[I.argus, 30, MC], [I.blocco, 2, LG], [I.mesaCarvalho, 4, LG]] },
  { k: "P18", cli: "Mariana Albuquerque", loc: "Hotel Mirante da Serra", tipo: /casamento/i, ev: 44, st: "pre_reserva", ate: 1, itens: [[I.toscana, 40, MC], [I.chester, 1, LG], [I.haus, 2, LG]] },
  { k: "P19", cli: "Patrícia Moreira", loc: "Casa Alvorada Eventos", tipo: /anivers/i, ev: 18, st: "orcamento", itens: [[I.katrinaVerde, 25, MC], [I.estela, 3, MC]] },
  { k: "P20", cli: "Aline Duarte Eventos", loc: "Solar das Palmeiras", tipo: /casamento/i, ev: 33, st: "orcamento", itens: [[I.toscana, 30, MC], [I.berlim, 1, LG]] },
  { k: "P21", cli: "Casa Lume Decoração", loc: "Fazenda Vale do Cuiabá", tipo: /corporativ/i, ev: 40, st: "orcamento", itens: [[I.argus, 40, MC], [I.nice, 5, MC], [I.haus, 2, LG]] },
  { k: "P22", cli: "Juliana Prado Design", loc: "Recanto Serra Verde", tipo: /casamento/i, ev: 50, st: "orcamento", itens: [[I.emporio, 20, MC], [I.gomus, 1, LG], [I.comodaToulon, 1, BOLO]] },
  { k: "P23", cli: "Renata Lins Decorações", loc: "Pousada Bosque das Hortênsias", tipo: /anivers/i, ev: 25, st: "orcamento", cancelar: "Fechou com outro fornecedor", itens: [[I.katrinaVerde, 20, MC], [I.puffCapitone, 2, LG]] },
  { k: "P24", cli: "Bruna Campos Eventos", loc: "Quinta das Araucárias", tipo: /corporativ/i, ev: 35, st: "orcamento", cancelar: "Evento cancelado pelo cliente", itens: [[I.argus, 30, MC], [I.verona, 2, MC]] },
];

async function criarPedido(abrir, p, E) {
  const ped = await abrir("Modulos/Comercial/Pedidos/pedido.html");
  try {
    await ped.waitForSelector(".pedido-entrada", { timeout: 60000 });
    await ped.waitForFunction(() => typeof window.pedidoAdicionarDoCatalogo === "function" && window.__CONTEXT?.empresa_id, null, { timeout: 60000 });
    await ped.fill("#clienteInput", p.cli);
    await ped.locator(".autocomplete-item", { hasText: p.cli }).first().click({ timeout: 20000 });
    const tipos = await ped.$$eval("#tipoEventoSelect option", (os) => os.map((o) => [o.value, o.textContent.trim()]).filter((o) => o[0]));
    const tipo = tipos.find(([, t]) => p.tipo.test(t)) || tipos[0];
    if (tipo) await ped.selectOption("#tipoEventoSelect", tipo[0]);
    const ev = C.dia(p.ev), ent = C.dia(p.ev - (p.ev % 3 === 0 ? 1 : 0)), col = C.dia(p.ev + 1);
    await ped.fill("#dataEvento", ev); await ped.locator("#dataEvento").dispatchEvent("change");
    await ped.fill("#dataEntrega", ent); await ped.locator("#dataEntrega").dispatchEvent("change");
    await ped.fill("#horaEntrega", ["08:00", "09:30", "10:00", "13:00"][p.ev & 3]);
    await ped.fill("#dataColeta", col); await ped.locator("#dataColeta").dispatchEvent("change");
    await ped.fill("#horaColeta", ["09:00", "10:00", "08:30"][Math.abs(p.ev) % 3]);
    // datas muito separadas pedem confirmação (janela do sistema): aceita
    for (let i = 0; i < 3; i++) { const b = ped.locator(".el-alert-confirm .el-alert__actions button").last(); if (await b.isVisible().catch(() => false)) await b.click(); else break; }
    await ped.fill("#localInput", p.loc);
    await ped.locator("#localLista .autocomplete-item", { hasText: p.loc }).first().click({ timeout: 20000 });
    await ped.waitForFunction(() => document.getElementById("localIdHidden")?.value, null, { timeout: 15000 });
    const tel = ped.locator("#telefoneInput, #clienteTelefone, [data-campo=telefone]").first();
    if (await tel.count() && !(await tel.inputValue().catch(() => ""))) await tel.fill("24999990000");
    // clientes finais (o contrato sai no nome deles)
    for (const [i, [nome, seed, pj]] of (p.finais || []).entries()) {
      if (i > 0) await ped.click("[data-cf-add]");
      const b = `[data-cf-pessoa="${i}"]`;
      await ped.fill(`${b} [data-cf="nome"]`, nome);
      await ped.fill(`${b} [data-cf="documento"]`, pj ? C.cnpj("final" + seed) : C.cpf("final" + seed));
      if (!pj) await ped.fill(`${b} [data-cf="rg"]`, String(10000000 + seed * 731113).slice(0, 9));
      await ped.fill(`${b} [data-cf="telefone"]`, "2499" + String(8100000 + seed * 3917).slice(0, 7));
      await ped.fill(`${b} [data-cf="email"]`, nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + seed + "@exemplo.com.br");
      await ped.fill(`${b} [data-cf="endereco"]`, ["Rua Montecaseros, 120 - Centro, Petrópolis - RJ", "Av. Atlântica, 2100 - Copacabana, Rio de Janeiro - RJ", "Rua Dr. Sá Earp, 45 - Itaipava, Petrópolis - RJ"][seed % 3]);
    }
    // itens pelo catálogo do pedido (mesmo caminho do "+")
    await ped.waitForFunction(() => { const w = document.querySelector("iframe.pedido-catalogo-real")?.contentWindow; return w?.catalogAssistenteProjeto && typeof w.sincronizarPedidoCatalogo === "function"; }, null, { timeout: 120000 });
    await ped.evaluate(async (itens) => {
      const w = document.querySelector("iframe.pedido-catalogo-real").contentWindow;
      for (const [item, qtd, amb] of itens) await w.catalogAssistenteProjeto.quantidade({ item_id: item, quantidade: qtd, ambiente: amb });
      await w.sincronizarPedidoCatalogo();
    }, p.itens);
    // financeiro: uma parcela por divisão com o que falta (como o "+ Parcela")
    await ped.click(".comercial-trilha [data-etapa=financeiro]");
    await ped.waitForSelector(".pedido-etapa-financeiro:not([hidden])", { timeout: 20000 });
    await ped.waitForFunction(() => document.querySelectorAll("#cronogramaParcelas .pg-grupo").length >= 1, null, { timeout: 40000 });
    await ped.waitForTimeout(3500);
    for (let volta = 0; volta < 2; volta++) {
      for (const comp of await ped.$$eval("#cronogramaParcelas .pg-grupo", (gs) => gs.map((g) => g.dataset.componente))) {
        const falta = (await ped.textContent(`#cronogramaParcelas .pg-grupo[data-componente=${comp}] [data-pg-grupo-falta]`).catch(() => "")).trim();
        if (/Falta/i.test(falta)) await ped.click(`#cronogramaParcelas [data-pg-add=${comp}]`);
      }
      await ped.waitForTimeout(1500);
    }
    // forma de pagamento: PIX na entrada, boleto no resto
    await ped.evaluate(() => { document.querySelectorAll("#cronogramaParcelas tr.pg-linha select").forEach((s, i) => { const o = [...s.options].find((x) => (i === 0 ? /pix/i : /boleto|pix/i).test(x.textContent)); if (o && s.value !== o.value) { s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); } }); });
    await ped.selectOption("#pedidoStatusComercial", p.st);
    if (p.st === "pre_reserva") { await ped.fill("#preReservaAte", C.dia(p.ate)); await ped.locator("#preReservaAte").dispatchEvent("change"); }
    await ped.evaluate(() => { window.__alertas = []; const o = window.alerta; window.alerta = (...a) => { window.__alertas.push(a.slice(0, 2).join(" · ")); return o?.(...a); }; });
    await ped.click(".ct-avancar");
    await ped.waitForFunction(() => window.__PEDIDO_ATUAL_ID, null, { timeout: 60000 }).catch(() => {});
    const id = await ped.evaluate(() => window.__PEDIDO_ATUAL_ID);
    if (!id) throw Error("não salvou: " + (await ped.evaluate(() => (window.__alertas || []).join(" / "))));
    await ped.waitForTimeout(2500);
    return id;
  } finally { await ped.close(); }
}

(async () => {
  const E = C.lerEstado();
  E.pedidos ||= {};
  const so = process.argv.slice(2);
  const { sessao } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const nav = await abrirNavegador(sessao);
  try {
    for (const p of PEDIDOS) {
      if (so.length && !so.includes(p.k)) continue;
      if (E.pedidos[p.k]) continue;
      const t0 = Date.now();
      try {
        const id = await criarPedido(nav.abrir, p, E);
        const atual = C.check(await C.admin.from("separacoes_pedidos").select("numero_pedido,observacoes,valor_total,status_comercial").eq("id", id).single());
        C.check(await C.admin.from("separacoes_pedidos").update({ observacoes: { ...atual.observacoes, demo_diretoria: C.LOTE } }).eq("id", id), "marca");
        E.pedidos[p.k] = { id, numero: atual.numero_pedido, etapa: p.etapa || null, cancelar: p.cancelar || null };
        C.gravarEstado(E);
        await C.anotar([{ tabela: "separacoes_pedidos", chave: "id", valor: id }]);
        console.log(`ok - ${p.k} pedido ${atual.numero_pedido} · ${p.cli} · ${atual.status_comercial} · R$ ${atual.valor_total} (${Math.round((Date.now() - t0) / 1000)}s)`);
      } catch (e) { console.log(`FALHOU ${p.k}: ${e.message.split("\n")[0]}`); }
    }
    if (nav.erros.length) console.log("Erros de tela:", [...new Set(nav.erros)].slice(0, 10).join("\n"));
  } finally { await nav.browser.close(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
module.exports = { PEDIDOS, I };
