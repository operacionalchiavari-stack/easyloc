// Nov/2026 — fechamentos de parceiros no Financeiro (trazido da Tecnoweld).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const d = new Date(), ANO = d.getFullYear(), M = d.getMonth() + 1;
const mm = (m) => ANO + "-" + String(m).padStart(2, "0");
const HOJE = d.toLocaleDateString("sv-SE");
const mesAnt = M > 1 ? M - 1 : 1;
const mock = `(() => {
  window.__rpc = []; window.__falhaMov = false;window.__div={abertas:[],resolvidas:[],relatorios:[]};window.__falhaResolver=false;
  window.__mov = {aguardando:[
    {tipo:'frete',data:'2026-11-22',hora:'08:30',pedido:'19',cliente:'Ana Souza',cliente_foto:'http://acervo.teste/assets/agentes/ideia.jpg',local:'Espaço Serra Verde',direcao:'entrega',caminhao:'Iveco Daily · TST1F23',valor_sistema:250,valor_cobrado:250,valor_final:250,situacao:'aguardando_fechamento'},
    {tipo:'frete',data:'2026-11-22',hora:'18:00',pedido:'19',cliente:'Ana Souza',local:'Espaço Serra Verde',direcao:'coleta',caminhao:'Iveco Daily · TST1F23',valor_sistema:250,valor_cobrado:250,valor_final:250,situacao:'aguardando_fechamento'},
    {tipo:'frete',data:'2026-11-25',pedido:'22',cliente:'Bruno Lima',local:'Galpão',valor_sistema:300,valor_cobrado:null,situacao:'agendado'},
    ...[298.5,280,5000].map((valor,i)=>({tipo:'frete',data:'2026-11-22',local:['Espaço Serra Verde','Galpão','chiavari'][i],fora_sistema:true,caminhao:'Iveco Daily · TST1F23',valor_sistema:null,valor_cobrado:valor,situacao:'lancado_sem_envio'})),
    {tipo:'conta',data:'2026-11-23',documento:'NF 42',valor_sistema:null,valor_cobrado:400,situacao:'conta_aberta'}
  ],pagos:[]};
  const H = "${HOJE}", MA = "${mm(M)}", MP = "${mm(mesAnt)}";
  window.__mov.aguardando[0].caminhoes=[{id:'cam-1',nome:'Iveco Daily · TST1F23',foto_url:'http://acervo.teste/truck-fixture.svg'}];
  const cat = (id, codigo, nome, tipo, pai, chave, ordem) => ({ id, empresa_id: "e1", codigo, nome, tipo, pai_id: pai, chave, ativo: true, ordem });
  const banco = {
    fin_contas: [{ id: "c1", empresa_id: "e1", nome: "Itaú", tipo: "corrente", ativo: true }],
    fin_config: [{ empresa_id: "e1" }],
    fin_categorias: [
      cat("r", "1", "Receitas", "entrada", null, null, 1), cat("r1", "1.1", "Locação de mobiliário", "entrada", "r", "locacao", 2), cat("r2", "1.2", "Frete cobrado do cliente", "entrada", "r", "frete", 3),
      cat("c", "2", "Custos da operação", "saida", null, null, 4), cat("c1", "2.1", "Fretes e transporte", "saida", "c", "fretes", 5), cat("c2", "2.2", "Montadores e equipe free", "saida", "c", "equipe_free", 6),
      cat("i", "3", "Impostos", "saida", null, "impostos", 7),
      cat("a", "4", "Despesas administrativas", "saida", null, null, 8), cat("a1", "4.1", "Folha e encargos", "saida", "a", "folha", 9), cat("a2", "4.2", "Aluguel e utilidades", "saida", "a", "aluguel", 10)],
    fin_centros_custo: [{ id: "cc1", empresa_id: "e1", nome: "Operação", ativo: true }],
    fin_receber: [
      { id: "x1", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "7", componente: "locacao", cliente_nome: "Lis", descricao: "Pedido 7 · Locação", competencia: MA + "-05", vencimento: MA + "-05", valor: 6000, recebido: 6000, aberto: 0, parcela: 1, parcelas: 2, categoria_id: "r1", status: "recebido" },
      { id: "x2", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "7", componente: "locacao", cliente_nome: "Lis", descricao: "Pedido 7 · Locação", competencia: MA + "-20", vencimento: H, valor: 3000, recebido: 1000, aberto: 2000, parcela: 2, parcelas: 2, categoria_id: "r1", status: "parcial" },
      { id: "x3", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "7", componente: "frete", cliente_nome: "Lis", descricao: "Pedido 7 · Frete", competencia: MA + "-20", vencimento: H, valor: 1000, recebido: 0, aberto: 1000, parcela: 1, parcelas: 1, categoria_id: "r2", status: "aberto" },
      { id: "x4", empresa_id: "e1", origem: "pedido", grupo: "g2", pedido_id: "p2", pedido_numero: "8", componente: "locacao", cliente_nome: "Ana", descricao: "Pedido 8 · Locação", competencia: MP + "-10", vencimento: MP + "-10", valor: 8000, recebido: 8000, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "r1", status: "recebido" }],
    fin_pagar: [
      { id: "y1", empresa_id: "e1", fornecedor_nome: "Receita Federal", descricao: "Simples Nacional", competencia: MA + "-20", vencimento: MA + "-20", valor: 1200, pago: 1200, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "i", status: "pago" },
      { id: "y2", empresa_id: "e1", fornecedor_nome: "Receita Federal", descricao: "Simples Nacional", competencia: MP + "-20", vencimento: MP + "-20", valor: 800, pago: 800, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "i", status: "pago" },
      { id: "y3", empresa_id: "e1", fornecedor_nome: "Transp X", descricao: "Fretes", competencia: MA + "-15", vencimento: MA + "-15", valor: 900, pago: 0, aberto: 900, parcela: 1, parcelas: 1, categoria_id: "c1", status: "aberto" },
      { id: "y4", empresa_id: "e1", fornecedor_nome: "Imobiliária", descricao: "Aluguel", competencia: MA + "-10", vencimento: MA + "-10", valor: 2500, pago: 2500, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "a2", status: "pago" },
      { id: "y6", empresa_id: "e1", fornecedor_nome: "Posto", descricao: "Combustível", emissao: "2026-11-10", vencimento: "2026-12-15", valor: 300, pago: 0, aberto: 300, parcela: 1, parcelas: 1, categoria_id: "c1", status: "aberto", cartao_id: "k1", cartao_compra_em: "2026-11-10", fatura_id: "f1" },
      { id: "y7", empresa_id: "e1", fornecedor_nome: "Loja X", descricao: "Ferramentas", emissao: "2026-11-11", vencimento: "2026-12-15", valor: 200, pago: 0, aberto: 200, parcela: 1, parcelas: 1, categoria_id: "a2", status: "aberto", cartao_id: "k1", cartao_compra_em: "2026-11-11", fatura_id: "f1" },
      { id: "y5", empresa_id: "e1", fornecedor_nome: "Papelaria", descricao: "Material", competencia: MA + "-12", vencimento: MA + "-12", valor: 100, pago: 0, aberto: 100, parcela: 1, parcelas: 1, categoria_id: null, status: "aberto" }],
    fornecedores: [], clientes_empresas: [],
    fin_cartoes: [{ id: "k1", empresa_id: "e1", nome: "Itaú Empresas", final: "1234", dia_virada: 5, dia_vencimento: 15, conta_id: "c1", ativo: true }],
    fin_cartao_faturas: [{ id: "f1", empresa_id: "e1", cartao_id: "k1", vencimento: "2026-12-15", virada: "2026-12-05" }],
    fin_baixas: [{ receber_id: "x1", data: MA + "-08", estornado_em: null }, { receber_id: "x2", data: MA + "-03", estornado_em: null }],
    fin_custos_evento: [{ pedido_id: "p1", categoria: "frete", descricao: "Frete ida", valor: 800, cancelado_em: null, criado_em: MA + "-25" }, { pedido_id: "p1", categoria: "equipe", descricao: "Equipe free", valor: 1200, cancelado_em: null, criado_em: MA + "-25" },
      { pedido_id: "p2", categoria: "frete", descricao: "Frete", valor: 9000, cancelado_em: null, criado_em: MP + "-12" }],
    separacoes_pedidos: [
      { id: "p1", empresa_id: "e1", numero_pedido: "7", cliente_nome: "Lis", tipo_evento: "Casamento", data_evento: MA + "-25", data_entrega: MA + "-24", data_coleta: MA + "-26", local_nome: "Villa Bisutti", valor_total: 10000, status_comercial: "aprovado" },
      { id: "p2", empresa_id: "e1", numero_pedido: "8", cliente_nome: "Ana", tipo_evento: "Festa", data_evento: MP + "-12", valor_total: 8000, status_comercial: "aprovado" }]
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false;
    const q = { select(){ return q; }, order(){ return q; }, gte(){ return q; }, lte(){ return q; }, is(){ return q; }, not(){ return q; }, limit(){ return q; }, range(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(p){ q._u = p; return q; },
      then(ok, erro){ if (q._u) linhas.forEach((l) => Object.assign(l, q._u)); return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); } };
    return q;
  }
  const respostas = { funcionario_contexto: () => ({ ativo: true, administrador_legado: true }), fin_saldos: () => [{ conta_id: "c1", saldo: 5000 }], fin_fluxo: () => [], fin_bancos_resumo: () => [{ conta_id: "c1", saldo: 5000, pendentes: 0 }], fin_bancos_extrato: () => ({ contas: [], linhas: [] }),
    fin_cartao_faturas: () => [{ id: "f1", vencimento: "2026-12-15", virada: "2026-12-05", total: 500, aberto: 500, pago: 0, qtd: 2, linhas: 2, linhas_pendentes: 1, situacao: "aberta", atual: true }],
    fin_cartao_fatura_detalhe: () => ({ fatura: { id: "f1", cartao_id: "k1", vencimento: "2026-12-15", virada: "2026-12-05", valor_banco: 545, arquivo_nome: "fatura.csv" }, outras: [],
      parcelas: [{ id: "y6", fornecedor: "Posto", descricao: "Combustível", compra: "2026-11-10", parcela: 1, parcelas: 1, valor: 300, aberto: 300, pago: 0, status: "aberto", linha_id: "l1" }, { id: "y7", fornecedor: "Loja X", descricao: "Ferramentas", compra: "2026-11-11", parcela: 1, parcelas: 1, valor: 200, aberto: 200, pago: 0, status: "aberto", linha_id: null }],
      linhas: [{ id: "l1", data: "2026-11-10", descricao: "POSTO SHELL", valor: 300, situacao: "conferida", titulo_id: "y6", titulo_fatura_id: "f1" }, { id: "l2", data: "2026-11-20", descricao: "ANUIDADE", valor: 45, situacao: "pendente", sugestao: { tipo: "lancar", categoria_id: "a2", descricao: "Anuidade do cartão", confianca: "alta", motivo: "É anuidade." } }] }),
    fin_parceiro_movimentos: () => {if(window.__falhaMov)throw Error('Falha de rede simulada');return window.__mov;},
    divergencias_acompanhar: () => {if(window.__falhaDiv)throw Error('Divergências indisponíveis');return window.__div;},
    frete_div_resolver: (a) => {if(window.__falhaResolver)throw Error('Decisão já alterada por outro usuário');const d=window.__div.abertas.find(d=>d.referencia===a.p_id);if(!d)throw Error('Divergência não encontrada');window.__div.abertas=window.__div.abertas.filter(x=>x!==d);window.__div.resolvidas.push({...d,motivo:a.p_motivo,tratado_por:'Supervisora',tratado_em:'2026-11-23T12:00:00Z'});const x=window.__mov.aguardando.find(x=>x.frete_lancamento_id===a.p_id);if(x){x.situacao='aguardando_fechamento';x.valor_final=a.p_acao==='recusar'?0:a.p_acao==='corrigir'?a.p_valor:x.valor_cobrado;}return {};},
    fin_fechamento_fornecedores: () => [{ id: "s1", nome: "Lounge Parceria", tipo: "Sublocação", aguardando_valor: 500, aguardando_pedidos: 2, forma_padrao: "boleto", condicao_padrao: "30/60",
      periodo: "mensal", fechamento_dia: 30,
      fechamentos: [{ id: "fe1", referencia: "Novembro/2026", status: "em_conferencia", total: 0, aberto: 0 },{id:'fe0',referencia:'Outubro/2026',status:'unificado',total:700,aberto:0}] },
      { id: "s2", nome: "Transportes Caminho Certo", tipo: "Transporte", aguardando_valor: 800, aguardando_pedidos: 3, periodo: "semanal", dia_semana: 5, fechamentos: [] }],
    fin_fechamento_criar: (a) => { window.__criar = a; return "fe9"; },
    fin_fechamento_preparar: (a) => { window.__criar=a;return "fe9"; },
    fin_frete_cobranca_opcoes:()=>({frete:true,opcoes:[]}),
    fin_fechamento_detalhe: (a) => a.p_id==='fe0'?{fechamento:{id:'fe0',referencia:'Outubro/2026',status:'unificado',fornecedor:'Lounge Parceria',forma_pagamento:'pix'},linhas:[],compras:[],parcelas:[{id:'parc0',numero:1,vencimento:'2026-11-05',valor:700,aberto:0}],pago:true}:({ fechamento: { id: "fe1", referencia: "Novembro/2026", status: "em_conferencia", fornecedor: "Lounge Parceria", forma_padrao: "boleto", condicao_padrao: "30/60", arquivo_nome: "cobranca.xlsx" },
      linhas: [{ id: "a1", data: "2026-11-10", descricao: "Sublocação evento Pedido 12", valor: 300, situacao: "conferida", titulo_id: "t1", nosso_valor: 300, rotulo: "Sublocação · Pedido 12" },
               { id: "a2", data: "2026-11-20", descricao: "Taxa de entrega", valor: 40, situacao: "pendente" }],
      compras: [{ titulo_id: "t1", valor: 300, data: "2026-11-10", descricao: "Sublocação · Pedido 12", rotulo: "Sublocação · Pedido 12", linha_id: "a1" },
                { titulo_id: "t2", valor: 200, data: "2026-11-25", descricao: "Sublocação · Pedido 14", rotulo: "Sublocação · Pedido 14" }], parcelas: [], pago: false }),
    fin_fechamento_linha_acao: (a) => { window.__acoesF = (window.__acoesF || []).concat([a]); return { ok: true }; },
    fin_cartao_linha_acao: (a) => { window.__acoes = (window.__acoes || []).concat([a]); return { ok: true }; },
    fin_resultado_eventos: () => ({ eventos: [
      { id: "p1", numero_pedido: "7", cliente_nome: "Lis", data_evento: MA + "-25", valor_total: 10000, credito: 0, reposicao: 0, recebido: 7000, em_aberto: 3000, custos_revisados: true },
      { id: "p2", numero_pedido: "8", cliente_nome: "Ana", data_evento: MP + "-12", valor_total: 8000, credito: 0, reposicao: 0, recebido: 8000, em_aberto: 0, custos_revisados: false }], itens: [] }) };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta, functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: (n, a) => ({ then: (ok, erro) => {window.__rpc.push({n,a});return Promise.resolve({ data: respostas[n] ? respostas[n](a) : null, error: null }).then(ok, erro);} })
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if(u===BASE+'truck-fixture.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="108" viewBox="0 0 144 108"><rect width="144" height="108" fill="#edf2f5"/><path d="M16 27h74v51H16z" fill="#648596"/><path d="M92 45h22l15 19v14H92z" fill="#a9bec9"/><path d="M98 49h13l11 15H98z" fill="#eef8fc"/><circle cx="39" cy="80" r="11" fill="#36424a"/><circle cx="109" cy="80" r="11" fill="#36424a"/></svg>'});
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) { const f = path.join(raiz, decodeURIComponent(new URL(u).pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css", ".png":"image/png" }[path.extname(f)] || "text/javascript" }); }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Financeiro/financeiro.html?aba=pagar");
  await page.waitForSelector('#finAbas [data-aba="fechamentos"]', { timeout: 15000 });
  assert.strictEqual(await page.locator("#finSubAbas button", { hasText: "Fechamentos de parceiros" }).count(), 0, "não é mais sub-aba de A pagar");
  await page.click('#finAbas [data-aba="fechamentos"]');
  await page.waitForSelector("[data-fe-forn]", { timeout: 15000 });
  await page.waitForSelector('.fe-mov-grupos');
  assert.equal(await page.locator('#feMain>.fe-parceiro-barra').count(),1,'navegação antes de todo o conteúdo');
  assert.deepEqual(await page.locator('.fe-abas-forn [data-fe-aba]').evaluateAll(bs=>bs.map(b=>b.dataset.feAba)),['aguardando','pagos'],'Pagos por último, sem aba Fechamentos');
  assert.equal(await page.locator('#feRodape #feConc').count(),1,'cobranca pendente aparece antes da nota e das parcelas');
  assert.equal(await page.locator('#feMain .pla-grupo').count(),4,'dois pedidos, fora do sistema e contas');
  assert.deepEqual(await page.locator('.fe-mov-grupos thead').first().locator('th').allTextContents(),['Data e horário','Status','Ida/Volta','Caminhão','Valor do sistema','Cobrado','Valor final']);
  const fora=page.locator('.pla-grupo').filter({has:page.locator('.pla-cli strong',{hasText:'Vínculo pendente'})});
  assert.equal(await fora.locator('tbody tr').count(),3);
  assert.deepEqual(await fora.locator('.fe-status').allTextContents(),['Divergente','Divergente','Divergente'],'fretes fora do sistema sinalizados em vermelho');
  assert.equal(await fora.locator('[data-fe-foto-exemplo]').count(),3,'foto ilustrativa nos caminhões ainda sem imagem');await fora.locator('[data-fe-foto-exemplo] img').first().waitFor();
  assert.equal(await fora.locator('.fe-final .fe-tr').count(),3,'lançamento não aprovado não vira valor a pagar');
  const cliente=page.locator('.pla-grupo').filter({has:page.locator('.pla-cli strong',{hasText:'Ana Souza'})});
  assert.equal(await cliente.locator('.fe-cli-foto img').count(),1);assert.equal(await cliente.locator('tbody tr').count(),2);
  assert.deepEqual(await cliente.locator('.fe-status').allTextContents(),['Conforme','Conforme'],'fretes conferidos em verde');
  assert.equal(await cliente.locator('.fe-mov-div').count(),0,'valores iguais sem divergência não exibem caixas de justificativa');
  assert.deepEqual(await cliente.locator('.fe-direcao').allTextContents(),['Ida','Volta']);assert.deepEqual(await fora.locator('.fe-direcao').allTextContents(),['—','—','—'],'sem direção registrada não presume ida ou volta');
  await cliente.locator('.fe-caminhao-foto').first().waitFor();assert.equal(await cliente.locator('.fe-caminhao-foto').first().getAttribute('alt'),'Foto do caminhão Iveco Daily · TST1F23');assert.ok(await cliente.locator('.fe-caminhao-foto').first().evaluate(img=>img.complete&&img.naturalWidth>0),'foto carregada na coluna Caminhão');
  assert.equal(await cliente.locator('tbody tr').first().locator('td').first().innerText(),'22/11/2026\n08:30','data e horário sem informações de serviço ou local');
  const futuro=page.locator('.pla-grupo').filter({has:page.locator('.pla-cli strong',{hasText:'Bruno Lima'})});assert.equal(await futuro.locator('tbody td').nth(5).locator('.fe-tr').innerText(),'—','sem cobrança informada não vira zero');
  assert.equal(await futuro.locator('.fe-status').innerText(),'Pendente','sem cobrança não marca como conforme');
  assert.ok(await page.locator('#feRodape .fe-nf').isVisible(),'nota fiscal no final da lista');assert.equal(await page.locator('[data-fe-periodo],[data-fe-historico]').count(),0,'sem atalhos de fechamento');assert.ok(await page.locator('[data-fe-importar]').isVisible(),'importar cobrança no topo');assert.ok(await page.locator('#feRodape .fe-unificar').isVisible(),'parcelamento no rodapé');
  await page.screenshot({path:'.tmp/financeiro-parceiros-tabela-desktop.png',fullPage:true});
  await page.evaluate(()=>FinanceiroClara.lerCobranca=async()=>({linhas:[{data:'2026-11-22',valor:100,descricao:'Frete no documento'}]}));await page.locator('[data-fe-importacao]').setInputFiles({name:'cobranca.csv',mimeType:'text/csv',buffer:Buffer.from('data;valor\n22/11/2026;100')});await page.locator('.fe-import-dialogo form').waitFor();assert.match(await page.locator('.fe-import-dialogo').innerText(),/Frete no documento/);await page.click('.fe-import-dialogo [data-cancelar]');assert.equal(await page.evaluate(()=>__rpc.filter(c=>c.n==='fin_frete_cobranca_importar').length),0,'botao importa arquivo para conferencia antes de gravar');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem rolagem lateral da página no celular');await page.screenshot({path:'.tmp/financeiro-parceiros-tabela-mobile.png',fullPage:true});await page.setViewportSize({width:1500,height:950});
  assert.equal(await page.locator('[data-fe-aba="divergencias"]').count(),0,'sem aba separada de divergências');
  await page.evaluate(()=>Object.assign(window.__mov.aguardando[2],{frete_lancamento_id:'antigo',explicacao:'Precisou esperar a liberação do local.',decisao_motivo:'Espera conferida com o cliente.',decisao_por:'Supervisora',decisao_em:'2026-10-01T12:00:00Z'}));await page.click('[data-fe-aba="aguardando"]');
  assert.ok(await page.locator('[data-fe-justificativa="freteiro"]').filter({hasText:'Precisou esperar'}).isVisible(),'justificativa antiga aparece sem depender da lista de divergências recentes');assert.ok(await page.locator('[data-fe-justificativa="supervisor"]').filter({hasText:'Espera conferida'}).isVisible(),'justificativa do supervisor aparece na linha sem clique');
  await page.evaluate(()=>{
    window.__mov.aguardando[0].frete_lancamento_id='frete-1';window.__mov.aguardando[0].situacao='divergencia';window.__mov.aguardando[0].valor_cobrado=280;
    window.__div.abertas=[{origem:'frete',fornecedor_id:'s1',referencia:'frete-1',chave:'frete:frete-1',tipo:'valor',pedido:'19',cliente:'Ana Souza',data:'2026-11-22',titulo:'Valor diferente do combinado',valor_previsto:250,valor_informado:280,explicacao:'Precisei fazer uma viagem extra.',registro:{id:'frete-1',divergencia:'valor'}}];
  });
  await page.click('[data-fe-aba="aguardando"]');await page.locator('[data-fe-resolver="frete-1"]').first().waitFor();
  assert.equal(await page.locator('#feMain .pla-grupo').count(),4,'a divergência usa a linha já existente, sem duplicar fretes');
  assert.ok(await page.locator('[data-fe-justificativa="freteiro"]').filter({hasText:'viagem extra'}).isVisible(),'a explicação fica visível na própria linha');assert.equal(await page.locator('.fe-mov-div summary').count(),0,'sem justificativas recolhidas');
  const linhaFrete=cliente.locator('tbody tr').first();
  assert.equal(await linhaFrete.locator('.fe-status').innerText(),'Divergente','caso aberto prevalece sobre valor aprovado antigo');
  assert.equal(await linhaFrete.locator('td').nth(4).locator('[data-fe-justificativa="supervisor"]').count(),1,'supervisor abaixo do valor do sistema');
  assert.equal(await linhaFrete.locator('td').nth(5).locator('[data-fe-justificativa="freteiro"]').count(),1,'freteiro abaixo do valor cobrado');
  assert.equal(await linhaFrete.locator('.fe-final .fe-tr').innerText(),'A definir','divergência não usa o valor cobrado como aprovado');
  assert.equal(await linhaFrete.locator('.fe-final [data-fe-resolver]').count(),3,'ações na coluna do valor final');
  await page.screenshot({path:'.tmp/financeiro-divergencia-inline.png',fullPage:true});
  await page.click('[data-fe-resolver="frete-1"][data-acao="corrigir"]');await page.locator('.fe-div-dialogo[open]').waitFor();
  await page.locator('.fe-div-dialogo [type=submit]').click();assert.equal(await page.evaluate(()=>__rpc.filter(c=>c.n==='frete_div_resolver').length),0,'motivo e valor são obrigatórios');
  await page.fill('.fe-div-dialogo [name=valor]','260.50');await page.fill('.fe-div-dialogo [name=motivo]','Ajuste confirmado com o parceiro.');
  await page.evaluate(()=>window.__falhaResolver=true);await page.locator('.fe-div-dialogo [type=submit]').click();await page.getByText('Decisão já alterada por outro usuário',{exact:true}).waitFor();assert.ok(await page.locator('.fe-div-dialogo [type=submit]').isEnabled(),'falha mantém a decisão disponível para correção');
  await page.evaluate(()=>window.__falhaResolver=false);await page.locator('.fe-div-dialogo [type=submit]').click();await page.locator('.fe-div-dialogo').waitFor({state:'detached'});await page.locator('[data-fe-justificativa="supervisor"]').filter({hasText:'Ajuste confirmado'}).waitFor();
  assert.match(await linhaFrete.locator('.fe-val-final').innerText(),/260,50/,'valor final usa a decisão');assert.match(await linhaFrete.locator('.fe-val-cob').innerText(),/280,00/,'cobrança original preservada');
  assert.equal(await linhaFrete.locator('.fe-status').innerText(),'Conforme','decisão concluída deixa a linha conferida sem perder a cobrança original');
  const decisao=await page.evaluate(()=>__rpc.filter(c=>c.n==='frete_div_resolver').at(-1).a);assert.deepEqual(decisao,{p_empresa:'e1',p_id:'frete-1',p_acao:'corrigir',p_valor:260.5,p_motivo:'Ajuste confirmado com o parceiro.'});
  await page.evaluate(()=>window.__div.abertas=[{origem:'frete',fornecedor_id:'s1',referencia:'frete-fora',tipo:'valor',data:'2026-11-22',titulo:'Frete não encontrado',valor_previsto:null,valor_informado:90,registro:{id:'frete-fora',divergencia:'sem_frete',destino:'Outro local'}}]);await page.click('[data-fe-aba="aguardando"]');await page.locator('[data-fe-resolver="frete-fora"]').first().waitFor({state:'attached'});assert.equal(await page.locator('[data-fe-resolver="frete-fora"]').count(),3,'divergência sem movimento projetado continua disponível para decisão');
  await page.evaluate(()=>{const anterior=EasyLocPermissions.hasPermission;EasyLocPermissions.hasPermission=k=>k==='logistica.planejamento.editar'?false:anterior(k);});await page.click('[data-fe-aba="aguardando"]');assert.equal(await page.locator('[data-fe-resolver]').count(),0,'as ações respeitam as permissões existentes');await page.evaluate(()=>{EasyLocPermissions.hasPermission=()=>true;window.__div.abertas=[];window.__div.resolvidas=[];});
  for(const acao of ['aceitar','recusar']){
    await page.evaluate(acao=>window.__div.abertas=[{origem:'frete',fornecedor_id:'s1',referencia:'outro-'+acao,tipo:'valor',data:'2026-11-22',titulo:'Frete extra',valor_informado:90,registro:{id:'outro-'+acao,divergencia:'sem_frete'}}],acao);
    await page.click('[data-fe-aba="aguardando"]');await page.locator('[data-fe-resolver="outro-'+acao+'"][data-acao="'+acao+'"]').click();await page.fill('.fe-div-dialogo [name=motivo]','Decisão conferida com o parceiro.');await page.locator('.fe-div-dialogo [type=submit]').click();await page.locator('.fe-div-dialogo').waitFor({state:'detached'});
    assert.ok(await page.evaluate(acao=>__rpc.some(c=>c.n==='frete_div_resolver'&&c.a.p_id==='outro-'+acao&&c.a.p_acao===acao&&c.a.p_valor===null),acao));
  }
  await page.click('[data-fe-aba="pagos"]');await page.getByText('Nada pago a este parceiro ainda.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.__mov.pagos=[{pago_em:'2026-11-20',documento:'FE-9',descricao:'Frete liquidado',vencimento:'2026-11-20',forma:'PIX',pago:500,valor:500,frete_lancamento_id:'pago',explicacao:'Frete extra solicitado pelo cliente.',decisao_motivo:'Serviço conferido e autorizado.',decisao_por:'Supervisora'}];});await page.click('[data-fe-aba="pagos"]');await page.getByText('Frete liquidado',{exact:true}).waitFor();assert.match(await page.locator('#feMain tfoot').innerText(),/500,00/);assert.ok(await page.locator('[data-fe-justificativa="freteiro"]').filter({hasText:'Frete extra solicitado'}).isVisible());assert.ok(await page.locator('[data-fe-justificativa="supervisor"]').filter({hasText:'Serviço conferido e autorizado'}).isVisible(),'pagamento mantém as duas justificativas');
  await page.getByText('Outubro/2026',{exact:true}).waitFor();assert.equal(await page.locator('[data-fe-fech="fe1"]').count(),0,'Pagos mostra o historico concluido');await page.click('[data-fe-fech="fe0"]');await page.waitForSelector('#feFech .fe-nf');assert.match(await page.locator('#feFech').innerText(),/700,00/);assert.equal(await page.locator('[data-fe-unificar]').count(),0,'fechamento concluido preserva parcelas');
  await page.click('[data-fe-aba="aguardando"]');await page.waitForSelector('#feRodape .fe-nf');
  const txt = await page.textContent("#finConteudo");
  assert.match(txt, /Lounge Parceria/); assert.match(txt, /Taxa de entrega/); assert.match(txt, /Sublocação · Pedido 14/);
  assert.equal(await page.locator('.fe-mov-grupos').count(),1,'tabela e rodape na mesma tela');assert.equal(await page.locator('#feMain > :last-child').getAttribute('id'),'feRodape');
  assert.ok(await page.locator('[data-fe-unificar]').isDisabled(),'mantém bloqueio para cobrança com pendências');
  console.log("ok 1 - Fechamentos: parceiro, cobrança e as contas nossas (sublocação) que não vieram");
  // nov/2026: parceiro com fechamento semanal
  assert.match(await page.textContent('[data-fe-forn="s1"]'), /Fechamento mensal · dia 30/);
  assert.match(await page.textContent('[data-fe-forn="s2"]'), /Fechamento semanal · toda sexta/);
  await page.evaluate(()=>window.__falhaDiv=true);await page.click('[data-fe-forn="s2"]');await page.locator('[data-fe-div-atualizar]').waitFor();assert.match(await page.locator('#feMain [role=alert]').innerText(),/Divergências indisponíveis/);await page.evaluate(()=>window.__falhaDiv=false);await page.click('[data-fe-div-atualizar]');await page.locator('[data-fe-div-atualizar]').waitFor({state:'detached'});
  await page.click('[data-fe-forn="s2"]');await page.waitForSelector('#feRodape .fe-nf');await page.fill('#feRodape [name=nf_numero]','123');await page.click('#feRodape [data-fe-nf]');await page.waitForFunction(()=>window.__criar);
  const ref = await page.evaluate(() => window.__criar.p_referencia);
  const m = ref.match(/^Semana (\d\d)\/(\d\d) a (\d\d)\/(\d\d)\/(\d{4})$/); assert.ok(m, "referência semanal: " + ref);
  const fim = new Date(+m[5], +m[4] - 1, +m[3]); assert.strictEqual(fim.getDay(), 5, "a semana termina na sexta: " + ref);
  assert.ok(fim <= new Date() && new Date() - fim < 7 * 864e5, "é a sexta mais recente: " + ref);
  console.log("ok 2 - fechamento semanal: periodicidade na lista e referência da semana");
  await page.evaluate(()=>window.__falhaMov=true);await page.click('[data-fe-aba="aguardando"]');await page.locator('[data-fe-tentar]').waitFor();assert.match(await page.locator('#feMain [role=alert]').innerText(),/Falha de rede/);assert.equal(await page.locator('.fe-mov-grupos').count(),0,'falha não apresenta valores como vazios');await page.evaluate(()=>window.__falhaMov=false);await page.click('[data-fe-tentar]');await page.waitForSelector('.fe-mov-grupos');
  await page.evaluate(()=>window.__mov.aguardando=[{tipo:'frete',data:'2026-11-22',cliente:'Cliente sem pedido',cliente_foto:'http://acervo.teste/assets/agentes/ideia.jpg',fora_sistema:true,valor_cobrado:280,situacao:'lancado_sem_envio'}]);await page.click('[data-fe-aba="aguardando"]');await page.getByText('Cliente sem pedido',{exact:true}).waitFor();assert.equal(await page.locator('.fe-cli-foto img').count(),1,'cliente com vínculo explícito também aparece sem pedido');
  await page.evaluate(()=>window.__mov.aguardando=[{tipo:'conta',tipo_servico:'frete',data:'2026-11-22',avulso_id:'si-1',solicitacao_interna:true,avulso:'Buscar material na oficina',valor_sistema:120,valor_cobrado:120,valor_final:120}]);await page.click('[data-fe-aba="aguardando"]');await page.getByText('Buscar material na oficina',{exact:true}).waitFor();assert.equal(await page.locator('.pla-pedido').innerText(),'Solicitação interna','solicitação interna aparece no lugar do pedido mesmo após virar conta');assert.equal(await page.locator('.fe-mov-div').count(),0,'valores iguais em solicitação interna também dispensam justificativa');
  await page.evaluate(()=>window.__mov.aguardando=[]);await page.click('[data-fe-aba="aguardando"]');await page.getByText('Nenhum frete ou conta pendente deste parceiro.',{exact:true}).waitFor();
  await page.screenshot({ path: path.join(process.env.TEMP || ".", "fechamentos.png"), fullPage: true });
  assert.deepEqual(erros, []);
  console.log("financeiro-fechamentos-browser: ok");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
