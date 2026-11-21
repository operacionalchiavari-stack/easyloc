// Out/2026 — parcela paga no Financeiro aparece como Pago na tela do pedido e não pode ser alterada.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const raiz = path.resolve(__dirname, "..");
const BASE = "http://acervo.teste/";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

const mockSupabase = `
(() => {
  window.__gravados = []; window.__rpcs = []; window.__removidos = [];
  const banco = {
    usuarios_empresas: [{user_id:"u1",empresa_id:"e1"}],
    empresas: [{id:"e1",nome_fantasia:"Teste"}],
    projetos: [{ id: "pj1", empresa_id: "e1", cliente_id: "c1", noivos: "Ana e Bruno", data_evento: "2026-11-20",
      local_evento: "Villa Teste", status: "pedido_enviado",
      dados: { foto_casal:{url:"https://fixture/casal.jpg",path:"e1/pj1/casal/original.jpg"}, evento: { tipo: "Casamento", data_entrega: "2026-11-19", hora_entrega: "09:00", data_coleta: "2026-11-21", hora_coleta: "10:00",
        obs_entrega: "Portão lateral" },
        ambientes: [
          { id: "a1", nome: "Lounge", itens: [{ item_id: "i1", quantidade: 2 }], renders: [{id:"r1",url:"https://fixture/storage/v1/object/public/projetos/e1/pj1/renders/teste.jpg",origem:"3D Livre"},{id:"r2",url:"https://fixture/storage/v1/render/image/public/projetos/e1/pj1/renders/indisponivel.jpg?width=960&quality=74",origem:"3D Livre",cena:{url:"data:application/json,%7B%22version%22%3A1%7D",tipo:"print"}}], notas: "" },
          { id: "a2", nome: "Bar", itens: [{ item_id: "i1", quantidade: 1 }, { item_id: "i2", quantidade: 3 }], renders: [], notas: "" } ] } }],
    clientes_empresas: [{ id: "c1", empresa_id: "e1", nome_razao: "Lis Baêtas", telefone: "11999990000" }],
    itens: [
      { id: "i1", tipo:"Item", empresa_id: "e1", codigo: "SOF1", produto: "Sofá Berlim", descricao_total: "Sofá Berlim", valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", tipo:"Item", empresa_id: "e1", codigo: "BAR1", produto: "Bar Bistrol", descricao_total: "Bar Bistrol", valor_locacao: 200, valor_reposicao: 3000 } ],
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "1", cliente_nome: "Lis Baêtas", tipo_evento: "Casamento", local_nome: "Villa", status: "pendente", status_comercial: "aprovado", revisao: 1,
        data_evento: "2026-11-20", data_entrega: "2026-11-19", data_coleta: "2026-11-21", valor_total: 1000, operacao: {},
        observacoes: { horario_entrega: "10:00", horario_coleta: "08:00", valores: { locacao: 900, frete: 100, montagem: 0, total: 1000 }, pagamento_config: {}, parcelas_financeiras: [
          { tipo: "Parcela 1", valor: 500, metodo: "PIX", numero: "1", status: "Programado", componente: "locacao", vencimento: "2026-10-26" },
          { tipo: "Parcela 2", valor: 300, metodo: "PIX", numero: "2", status: "Programado", componente: "locacao", vencimento: "2026-11-26" },
          { tipo: "Parcela 3", valor: 100, metodo: "PIX", numero: "3", status: "Programado", componente: "locacao", vencimento: "2026-12-26" },
          { tipo: "Parcela 1", valor: 100, metodo: "PIX", numero: "4", status: "Programado", componente: "frete", vencimento: "2026-12-30" }] } }],
    separacoes_itens: [],
    fin_receber: [
      { pedido_id: "p1", origem: "pedido", componente: "locacao", parcela: 1, valor: 500, recebido: 500, aberto: 0, vencimento: "2026-10-26", forma: "PIX", status: "recebido" },
      { pedido_id: "p1", origem: "pedido", componente: "locacao", parcela: 2, valor: 300, recebido: 100, aberto: 200, vencimento: "2026-11-26", forma: "PIX", status: "parcial" },
      { pedido_id: "p1", origem: "pedido", componente: "locacao", parcela: 3, valor: 100, recebido: 0, aberto: 100, vencimento: "2026-12-26", forma: "PIX", status: "aberto" },
      { pedido_id: "p1", origem: "pedido", componente: "frete", parcela: 1, valor: 100, recebido: 0, aberto: 100, vencimento: "2026-12-30", forma: "PIX", status: "aberto" }]
  };
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; }, is(){ return q; }, gt(){ return q; }, lt(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      insert(p){ window.__gravados.push({ tabela, tipo: "insert", p }); linhas = [{ id: "novo-" + tabela, ...(Array.isArray(p) ? p[0] : p) }]; return q; },
      update(p){ window.__gravados.push({ tabela, tipo: "update", p }); return q; }, upsert(){ return q; }, delete(){ return q; },
      then(ok, erro){ return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); }
    };
    return q;
  }
  const canal = { on(){ return canal; }, subscribe(){ return canal; } };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }),
      getUser: async () => ({ data: { user: { id: "u1", email: "a@b" } } }), signOut: async () => {},
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (nome, args) => { window.__rpcs.push({ nome, args }); if(nome === "pedido_estoque_detalhes") return Promise.resolve({data:{componentes:[{codigo:'SARGENTO',nome:'Componente',foto_url:'https://fixture/item.png',necessario:6,estoque:5,livre:0,manutencao:0,pedidos:[{numero:'123',cliente:'Decoradora Teste',evento:'2026-11-20',local:'Salao Teste',situacao:'aprovado',quantidade:6,inicio:'2026-11-19',fim:'2026-11-21'}],bloqueios:[]}]},error:null}); if(nome === "pedido_catalogo_estoque") return Promise.resolve({data:{i1:[0,0],i2:[5,0]},error:null}); if(nome === "pedido_disponibilidade_comercial") return Promise.resolve({data:[{origens:['i1'],descricao:'SARGENTO',necessario:12,disponivel:5,faltante:7}],error:null}); if(nome === "catalogo_carregar_interno" || nome === "pedido_catalogo_carregar") return Promise.resolve({data:{itens:banco.itens,empresa:banco.empresas[0]},error:null}); if(nome === "pedido_salvar_integrado") return Promise.resolve({data:{id:"novo-separacoes_pedidos",revisao:0},error:null}); return { then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: [], error: null }).then(ok, erro) }; },
    channel: () => canal, removeChannel(){},
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }), upload: async()=>({error:null}), remove: async paths => {window.__removidos.push(...paths);return {error:null};} }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: Number(process.env.LARG||1440), height: 900 } });
  await page.addInitScript(() => { if(!crypto.randomUUID) crypto.randomUUID = () => "fixture-" + Math.random().toString(36).slice(2); });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide is not defined/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { if(location.origin!=='http://acervo.teste')return; sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.startsWith("https://fixture/")) return rota.fulfill({ contentType: "image/png", body: PNG });
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });

  let pedidosImagem=0,transformacoes=0,liberarImagem=false;
  await page.route('https://fixture/storage/v1/**',r=>{
    const url=new URL(r.request().url());
    if(url.pathname.includes('/render/image/')){transformacoes++;return r.fulfill({status:400,body:'Transformacao indisponivel'});}
    if(url.pathname.endsWith('/renders/teste.jpg') && ++pedidosImagem===1)return r.fulfill({status:503,body:'Falha temporaria'});
    if(url.pathname.endsWith('/renders/indisponivel.jpg') && !liberarImagem)return r.fulfill({status:404,body:'Indisponivel'});
    return r.fulfill({contentType:'image/png',body:PNG});
  });
  await page.goto(BASE + "Modulos/Comercial/Pedidos/pedido.html?pedido=p1&modo=editar");
  await page.waitForFunction(() => document.querySelectorAll("#cronogramaParcelas tr.pg-linha.pg-travada").length === 2, null, { timeout: 20000 });
  const linhas = (comp) => page.evaluate((c) => [...document.querySelectorAll('#cronogramaParcelas tr.pg-linha[data-componente="' + c + '"]')].map((r) => ({
    badge: r.querySelector(".pg-status-badge").textContent, travada: !!r.dataset.travada, venc: r.querySelector(".pg-vencimento").disabled, valor: r.querySelector(".pg-valor").isContentEditable,
    metodo: r.querySelector(".pg-metodo").disabled, remover: !r.querySelector('[data-pg-action="remove"]').hidden, cobranca: !r.querySelector("[data-cobranca-parcela]").hidden })), comp);
  let l = await linhas("locacao");
  assert.equal(l[0].badge, "Pago"); assert.equal(l[1].badge, "Pago em parte"); assert.notEqual(l[2].badge, "Pago");
  assert.ok(l[0].venc && !l[0].valor && l[0].metodo && !l[0].remover && !l[0].cobranca, "paga travada: " + JSON.stringify(l[0]));
  assert.ok(l[1].venc && !l[1].valor && !l[1].remover, "paga em parte travada");
  assert.ok(!l[2].venc && l[2].valor && l[2].remover && l[2].cobranca, "aberta depois da paga continua livre: " + JSON.stringify(l[2]));
  console.log("ok 1 - paga e paga em parte sinalizadas e travadas; a aberta continua livre");

  const antesAtualizar=await page.evaluate(()=>({total:window.__TOTAL_PEDIDO,valores:structuredClone(window.__PEDIDO_VALORES),parcelas:window.__pedidoFinanceiroResumo().parcelas.filter(p=>p.componente==='locacao').map(p=>p.valor)}));
  await page.evaluate(()=>{window.__PEDIDO_VALORES={locacao:950,frete:0,montagem:0};window.__TOTAL_PEDIDO=950;window.atualizarPagamento();});
  assert.deepEqual(await page.evaluate(()=>window.__pedidoFinanceiroResumo().parcelas.filter(p=>p.componente==='locacao').map(p=>p.valor)),[500,300,150]);
  await page.evaluate(antes=>{window.__TOTAL_PEDIDO=antes.total;window.__PEDIDO_VALORES=antes.valores;window.atualizarPagamento();},antesAtualizar);
  // plano automático e limpar não apagam a divisão com parcela paga; a divisão sem recebimento continua sendo refeita
  await page.evaluate(() => { const e = document.getElementById("pagamentoParcelas"); if (e) { e.value = "6"; e.dispatchEvent(new Event("input", { bubbles: true })); } });
  await page.waitForTimeout(200);
  l = await linhas("locacao");
  assert.equal(l.length, 3, "plano não refaz a divisão com recebimento"); assert.equal(l[0].badge, "Pago"); assert.equal(l[1].badge, "Pago em parte");
  const gravar = await page.evaluate(() => window.__pedidoFinanceiroResumo().parcelas.filter((p) => p.componente === "locacao").map((p) => [p.valor, p.vencimento]));
  assert.deepEqual(gravar[0], [500, "2026-10-26"], "o que vai para o banco é o valor pago"); assert.deepEqual(gravar[1], [300, "2026-11-26"]);
  assert.ok(await page.evaluate(() => window.__pedidoFinanceiroResumo().parcelas.every((p) => !p.recebido)), "não reenvia recebido (o Financeiro daria baixa em dobro)");
  await page.evaluate(() => document.getElementById("btnLimparProgramacao").click());
  l = await linhas("locacao"); assert.equal(l.filter((x) => x.travada).length, 2, "limpar mantém as pagas");
  console.log("ok 2 - plano automático e limpar respeitam as parcelas pagas");
  await page.evaluate(()=>{
    for(const [id,valor] of Object.entries({clienteInput:'Cliente teste',localInput:'Local teste',localIdHidden:'local-teste',dataEvento:'2026-11-20',dataEntrega:'2026-11-19',dataColeta:'2026-11-21',horaEntrega:'09:00',horaColeta:'10:00'}))document.getElementById(id).value=valor;
    return window.__pedidoIrPara('financeiro');
  });
  await page.locator('.pedido-etapa-financeiro').waitFor({state:'visible'});
  assert.equal(await page.locator('.pedido-financeiro-resumo>.resumo-card').count(),1);
  assert.equal(await page.locator('.pedido-financeiro-resumo>.finance-card').count(),1,'direita contém somente o resumo');
  assert.equal(await page.locator('.pedido-financeiro-principal #cardMontagemPedido').count(),1);
  assert.equal(await page.locator('.pedido-financeiro-principal #cardLogisticaPedido').count(),1);
  const ordem=await page.evaluate(()=>{const m=document.querySelector('#cardMontagemPedido').getBoundingClientRect(),f=document.querySelector('#cardLogisticaPedido').getBoundingClientRect(),p=document.querySelector('.pagamento-card').getBoundingClientRect(),r=document.querySelector('.pedido-financeiro-resumo').getBoundingClientRect();return {montagemPrimeiro:m.left<f.left&&Math.abs(m.top-f.top)<2,parcelasAbaixo:p.top>=Math.max(m.bottom,f.bottom),resumoDireita:r.left>p.right};});
  assert.ok(ordem.montagemPrimeiro&&ordem.parcelasAbaixo&&ordem.resumoDireita,JSON.stringify(ordem));
  assert.equal(await page.locator('.pedido-financeiro-detalhes').evaluate(el=>getComputedStyle(el).position),'static','os controles da esquerda não acompanham a rolagem');
  assert.ok(await page.locator('.pedido-financeiro-resumo').evaluate(el=>el.getBoundingClientRect().width>=360),'resumo mais largo');
  await page.evaluate(()=>{
    let bv=document.querySelector('.pedido-bv-card');
    if(!bv){bv=document.createElement('section');bv.className='finance-card pedido-bv-card';document.querySelector('.pedido-financeiro-resumo').append(bv);}
    bv.hidden=false;bv.innerHTML='<h2>BV do decorador</h2><p style="padding:20px">BV deste pedido: 0% · R$ 0,00</p>';
  });
  await page.waitForFunction(()=>document.querySelector('.pedido-bv-card')?.parentElement.classList.contains('pedido-financeiro-detalhes'));
  await page.evaluate(()=>{const espaco=document.createElement('div');espaco.style.height='1600px';espaco.dataset.testeRolagem='';document.querySelector('.pedido-financeiro-principal').append(espaco);});
  for(const y of [400,800]){
    await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),y);
    const pos=await page.evaluate(()=>({resumo:document.querySelector('.pedido-financeiro-resumo').getBoundingClientRect().top,cabecalho:document.querySelector('.comercial-trilha').getBoundingClientRect().bottom,detalhes:document.querySelector('.pedido-financeiro-detalhes').getBoundingClientRect().bottom,parcelas:document.querySelector('.pagamento-card').getBoundingClientRect().top}));
    assert.ok(Math.abs(pos.resumo-pos.cabecalho-16)<3,'resumo acompanha a rolagem abaixo do cabeçalho: '+JSON.stringify(pos));
    assert.ok(pos.parcelas>=pos.detalhes,'montagem, frete e BV não cobrem as parcelas durante a rolagem: '+JSON.stringify(pos));
    if(y===400)await page.screenshot({path:'.tmp/pedido-resumo-rolagem-sem-sobreposicao.png'});
  }
  await page.evaluate(()=>{document.querySelector('[data-teste-rolagem]').remove();window.scrollTo({top:0,behavior:'instant'});});
  await page.screenshot({path:'.tmp/pedido-resumo-lateral.png'});
  console.log('ok 3 - montagem/frete e parcelas à esquerda; só resumo à direita, acompanhando a rolagem');
  const financeiroAgrupado=await page.evaluate(()=>{
    window.__TOTAL_PEDIDO=1200;window.__PEDIDO_VALORES={locacao:1000,locacao_bv:800,customizacoes:200,subtotal:1000,frete:120,frete_bruto:200,montagem:80,montagem_bruto:100,total:1200};
    for(const [id,valor] of Object.entries({resumoCustomizacoes:'R$ 200,00',resumoTerceirizados:'R$ 0,00',resumoServicos:'R$ 0,00'}))document.getElementById(id).textContent=valor;
    window.__pedidoAplicarPagamentoConfig({descontosAreas:{locacao:100.25,customizacao:25.5,frete:10.1,montagem:5.2},descontoBV:0,abatidoBV:0,creditoCliente:0});
    window.__pedidoAplicarExibicaoFinanceira({frete_desconto:true,montagem_desconto:true});
    return window.__pedidoFinanceiroResumo();
  });
  assert.deepEqual(financeiroAgrupado.resumo.filter(l=>l.valor).map(l=>[l.rotulo,l.valor]),[['Valor de locação',800],['Desconto',-100.25],['Customizações',200],['Desconto em customizações',-25.5],['Frete',200],['Desconto de frete',-90.1],['Montagem',100],['Desconto de montagem',-25.2]]);
  assert.equal(financeiroAgrupado.total,1058.95);assert.equal(Math.round(financeiroAgrupado.resumo.reduce((s,l)=>s+l.valor,0)*100)/100,1058.95);
  console.log('ok 4 - prévia/PDF usam descontos agrupados por área, sem duplicar o desconto da tela');
  if(process.env.SP){await page.evaluate(()=>{document.querySelectorAll("[data-etapa],.pedido-shell,.pagamento-card").forEach(()=>{});window.__pedidoIrPara?.("financeiro")});await page.waitForTimeout(900);await page.evaluate(()=>document.querySelector("#cronogramaParcelas")?.scrollIntoView({block:"center"}));await page.waitForTimeout(300);await page.screenshot({path:process.env.SP+"/parc.png"});}
  assert.deepEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
