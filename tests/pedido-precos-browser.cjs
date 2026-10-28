// Out/2026 — projeto que o decorador montou no catálogo abre na tela do pedido (pedido.html?projeto=<id>) já
// preenchido; salvar cria o pedido (orçamento, ligado ao projeto) e marca o projeto como "convertido".
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
      dados: { foto_casal:{url:"https://fixture/casal.jpg",path:"e1/pj1/casal/original.jpg"}, evento: { tipo: "Casamento", data_entrega: "2026-11-19", hora_entrega: "09:00", data_coleta: "2026-11-21",
        obs_entrega: "Portão lateral" },
        ambientes: [
          { id: "a1", nome: "Lounge", itens: [{ item_id: "i1", quantidade: 2 }], renders: [{id:"r1",url:"https://fixture/storage/v1/object/public/projetos/e1/pj1/renders/teste.jpg",origem:"3D Livre"},{id:"r2",url:"https://fixture/storage/v1/render/image/public/projetos/e1/pj1/renders/indisponivel.jpg?width=960&quality=74",origem:"3D Livre",cena:{url:"data:application/json,%7B%22version%22%3A1%7D",tipo:"print"}}], notas: "" },
          { id: "a2", nome: "Bar", itens: [{ item_id: "i1", quantidade: 1 }, { item_id: "i2", quantidade: 3 }], renders: [], notas: "" } ] } }],
    clientes_empresas: [{ id: "c1", empresa_id: "e1", nome_razao: "Lis Baêtas", telefone: "11999990000" }],
    itens: [
      { id: "i1", tipo:"Item", empresa_id: "e1", codigo: "SOF1", produto: "Sofá Berlim", descricao_total: "Sofá Berlim", valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", tipo:"Item", empresa_id: "e1", codigo: "BAR1", produto: "Bar Bistrol", descricao_total: "Bar Bistrol", valor_locacao: 200, valor_reposicao: 3000 } ],
    separacoes_pedidos: [], separacoes_itens: []
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.goto(BASE + "Modulos/Comercial/Pedidos/pedido.html?modo=editar");
  const mapaInicial=page.locator('#pedidoMiniMapa iframe');
  await mapaInicial.waitFor({state:'visible'});
  const consultaMapa=new URL(await mapaInicial.getAttribute('src'));
  assert.equal(consultaMapa.hostname,'www.google.com');
  assert.equal(consultaMapa.searchParams.get('output'),'embed');
  assert.match(consultaMapa.searchParams.get('q'),/Chiavari Eventos/,'empresa sem endereço usa origem de frete');
  assert.equal(await page.locator('#localInput').inputValue(),'','mapa inicial não seleciona destino');
  assert.equal(await page.locator('.entrada-formulario').isVisible(),true);
  console.log('OK - novo pedido sem endereço na empresa solicita mapa Google da origem de frete');
  await page.goto(BASE + "Modulos/Comercial/Pedidos/pedido.html?projeto=pj1&modo=editar");
  await page.waitForFunction(() => document.getElementById("clienteInput")?.value === "Lis Baêtas", null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("tr.item-row[data-item-id]").length === 2, null, { timeout: 10000 });
  const tela = await page.evaluate(() => ({
    intro: !document.querySelector(".entrada-intro"),
    dadosVisiveis: document.querySelector(".entrada-formulario")?.checkVisibility(),
    cliente: document.getElementById("clienteIdHidden").value,
    evento: document.getElementById("dataEvento").value,
    entrega: document.getElementById("dataEntrega").value,
    hora: document.getElementById("horaEntrega").value,
    coleta: document.getElementById("dataColeta").value,
    local: document.getElementById("localInput").value,
    obs: document.getElementById("observacoesEntrega").value,
    linhas: [...document.querySelectorAll("tr.item-row[data-item-id]")].map((tr) => [tr.dataset.itemId, tr.querySelector(".qtd").innerText]),
    projeto: window.__pedidoProjetoComercial?.dados?.ambientes?.map((a) => a.nome)
  }));
  console.log(tela);
  assert.strictEqual(tela.intro, true, "pula a tela de abertura");
  assert.strictEqual(tela.dadosVisiveis, true, "abre diretamente nos dados do pedido");
  assert.strictEqual(tela.cliente, "c1");
  assert.strictEqual(tela.evento, "2026-11-20");
  assert.strictEqual(tela.entrega, "2026-11-19");
  assert.strictEqual(tela.hora, "09:00");
  assert.strictEqual(tela.coleta, "2026-11-21");
  assert.strictEqual(tela.local, "Villa Teste");
  assert.strictEqual(tela.obs, "Portão lateral");
  assert.deepStrictEqual(tela.linhas.sort(), [["i1", "3"], ["i2", "3"]], "mesma peça em 2 ambientes vira uma linha com a soma");
  assert.deepStrictEqual(tela.projeto, ["Lounge", "Bar"], "ambientes vão para o catálogo do pedido");


  await page.locator('.ct-depois button[data-etapa="lista"]').click();
  const cf=page.frameLocator('iframe.pedido-catalogo-real');
  await cf.locator('.pa-geral [data-pa-item]').first().waitFor({timeout:20000});
  await cf.locator('.pedido-item-faltas').first().waitFor();
  assert.match(await cf.locator('.pedido-item-faltas').first().innerText(),/SARGENTO.*12.*5.*7/);
  assert.equal(await cf.locator('tr.pedido-item-sem-estoque').count(),2);
  const cor=await cf.locator('.pedido-item-faltas').first().evaluate(el=>getComputedStyle(el).color);
  assert.equal(cor,'rgb(185, 28, 28)');
  const chamada=await cf.locator('body').evaluate(()=>window.__rpcs.find(r=>r.nome==='pedido_disponibilidade_comercial'));
  assert.equal(chamada.args.p_inicio,'2026-11-19');assert.equal(chamada.args.p_fim,'2026-11-21');
  const texto=await cf.locator('.pa-geral').innerText();
  const nota=cf.locator('.pa-geral tr[data-pa-item="i1"] [data-cpj-item-observacao]').first();
  await nota.fill('Separar as pecas sem riscos.');
  await cf.locator('body').evaluate(()=>window.sincronizarPedidoCatalogo());
  assert.equal(await page.evaluate(()=>window.__pedidoProjetoComercial.dados.ambientes[0].itens.find(i=>i.item_id==='i1').observacao),'Separar as pecas sem riscos.');
  assert.equal(await cf.locator('.pa-geral tr[data-pa-item="i1"] [data-cpj-item-observacao]').nth(1).inputValue(),'','outro ambiente tem observacao independente');
  assert.ok(!texto.includes('Sob consulta'),'pedido interno exibe valores cadastrados');
  assert.match(texto,/300,00/);assert.match(texto,/5\.000,00/);
  assert.ok(await cf.locator('body').evaluate(()=>window.__rpcs.some(r=>r.nome==='pedido_catalogo_carregar')));
  console.log('OK - lista do pedido carrega locacao e reposicao pelo acesso comercial.');
  await page.locator('.ct-linha [data-etapa="catalogo"]').first().click();
  await cf.locator('[data-home-category]').first().click();
  await cf.locator('[data-stock-item="i1"] .is-esgotado').waitFor();
  assert.match(await cf.locator('[data-stock-item="i1"]').innerText(),/Estoque\s+0/);
  assert.match(await cf.locator('[data-stock-item="i1"]').innerText(),/Esgotado/);
  await cf.locator('[data-stock-item="i1"] .is-esgotado').hover();
  await cf.locator('#pedidoEstoqueTooltip .pedido-estoque-reserva').waitFor();
  assert.equal(await cf.locator('.pedido-estoque-numeros dt').count(),4);
  assert.equal(await cf.locator('.pedido-estoque-foto img').count(),1);
  assert.equal(await cf.locator('.pedido-estoque-insuficiente dd').first().evaluate(el=>getComputedStyle(el).color),'rgb(185, 28, 28)');
  const detalhe=await cf.locator('#pedidoEstoqueTooltip').innerText();
  assert.match(detalhe,/SARGENTO/);assert.match(detalhe,/123/);assert.match(detalhe,/Salao Teste/);assert.equal(await cf.locator('.pedido-estoque-tabela th').count(),6);assert.match(detalhe,/Decoradora Teste/);
  assert.match(detalhe,/19\/11\/2026/);
  const pin=cf.locator('.pedido-estoque-fixar');
  await pin.click();
  assert.equal(await pin.getAttribute('aria-pressed'),'true');
  await page.mouse.move(2,2);
  assert.equal(await cf.locator('#pedidoEstoqueTooltip').isVisible(),true,'fixado continua aberto ao sair do item');
  await cf.locator('#pedidoEstoqueTooltip').evaluate(el=>{el.style.maxHeight='120px';el.scrollTop=60;});
  assert.ok(await cf.locator('#pedidoEstoqueTooltip').evaluate(el=>el.scrollTop>0),'fixado permite rolar');
  await pin.click();
  assert.equal(await cf.locator('#pedidoEstoqueTooltip').isVisible(),false);
  await cf.locator('#catalogPedidoCategorias').click();
  await cf.locator('[data-home-category]').first().waitFor();
  await page.locator('.ct-antes button[data-etapa="lista"], .ct-depois button[data-etapa="lista"]').click();
  const linhasLista=cf.locator('.pa-geral tr[data-pa-item]');
  await linhasLista.first().waitFor();
  const antes=await linhasLista.count();
  const alvoRemover=linhasLista.first();
  const ambienteRemover=await alvoRemover.getAttribute('data-pa-amb');
  const itemRemover=await alvoRemover.getAttribute('data-pa-item');
  await alvoRemover.locator('[data-cpj="item-remover"]').click();
  const confirmarExclusao=cf.locator('dialog.cpj-modal');
  await confirmarExclusao.waitFor();
  assert.equal(await linhasLista.count(),antes,'abrir modal ainda não remove');
  await confirmarExclusao.locator('[data-cpj-cancel]').click();
  assert.equal(await linhasLista.count(),antes,'cancelar mantém o item');
  await alvoRemover.locator('.pa-quantidade [data-cpj="item-remover"]').click();
  await confirmarExclusao.locator('button[type="submit"]').click();
  assert.equal(await linhasLista.count(),antes-1);
  assert.equal(await cf.locator(`tr[data-pa-amb="${ambienteRemover}"][data-pa-item="${itemRemover}"]`).count(),0);
  assert.equal(await cf.locator(`tr[data-pa-item="${itemRemover}"]`).count(),1,'mesmo item no outro ambiente permanece');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
