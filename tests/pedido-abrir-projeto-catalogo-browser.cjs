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
      { id: "i1", empresa_id: "e1", codigo: "SOF1", produto: "Sofá Berlim", descricao_total: "Sofá Berlim", valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", empresa_id: "e1", codigo: "BAR1", produto: "Bar Bistrol", descricao_total: "Bar Bistrol", valor_locacao: 200, valor_reposicao: 3000 } ],
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
    rpc: (nome, args) => { window.__rpcs.push({ nome, args }); if(nome === "catalogo_carregar_interno") return Promise.resolve({data:{itens:banco.itens,empresa:banco.empresas[0]},error:null}); if(nome === "pedido_salvar_integrado") return Promise.resolve({data:{id:"novo-separacoes_pedidos",revisao:0},error:null}); return { then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
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

  // A trilha comercial separa as duas etapas das ferramentas de criação.
  assert.deepStrictEqual(await page.locator('.ct-ferramentas button').allTextContents(), ['Catálogo','3D','Plantas']);
  assert.ok(!(await page.locator('.ct-linha').innerText()).includes('Catálogo'));
  assert.strictEqual(await page.locator('.ct-avancar').innerText(), 'Salvar');
  assert.strictEqual(await page.locator('.ct-depois button[data-etapa="lista"]').count(), 1, 'lista acessivel pelo menu');
  assert.strictEqual(await page.locator('.ct-avancar').evaluate(el=>getComputedStyle(el).position), 'static');
  await page.evaluate(() => {
    window.__abriuListaSemCatalogo = [];
    const tela=document.querySelector('.pedido-screen');
    new MutationObserver(() => {
      if(!tela.classList.contains('em-catalogo-comercial'))return;
      const doc=document.querySelector('iframe.pedido-catalogo-real')?.contentDocument;
      window.__abriuListaSemCatalogo.push(Boolean(doc?.querySelector('#catalogProjetos:not(.hidden) .cpj-work-comercial')));
    }).observe(tela,{attributes:true,attributeFilter:['class']});
  });
  await page.locator('.ct-depois button[data-etapa="lista"]').click();
  const cf=page.frameLocator('iframe.pedido-catalogo-real');
  await cf.locator('.cpj-work-comercial [data-resumo-comercial] .resumo-card').waitFor({timeout:20000});
  assert.strictEqual(await cf.locator('[data-cpj-worktab="plantas"]').count(),0);
  assert.ok(await page.evaluate(()=>window.__abriuListaSemCatalogo.length>0 && window.__abriuListaSemCatalogo.every(Boolean)), 'lista preparada antes de exibir o iframe');
  const isolamento=await cf.locator('body').evaluate(async()=>{
    const projeto=window.catalogAssistenteProjeto;
    const antes=projeto.retrato().ambientes.find(a=>a.nome==='Lounge').itens.find(i=>i.item_id==='i1').quantidade;
    await projeto.quantidade({item_id:'i1',quantidade:antes+1,ambiente:'Lounge'});
    await window.sincronizarPedidoCatalogo();
    const alterado=window.parent.__pedidoProjetoComercial.dados.ambientes.find(a=>a.nome==='Lounge').itens.find(i=>i.item_id==='i1').quantidade;
    await projeto.quantidade({item_id:'i1',quantidade:antes,ambiente:'Lounge'});
    await window.sincronizarPedidoCatalogo();
    return {alterado,esperado:antes+1,rpcCatalogo:window.__rpcs.some(c=>c.nome==='projeto_salvar'),escritasAcervo:window.__gravados.filter(c=>['itens','itens_fotos','projetos'].includes(c.tabela))};
  });
  assert.strictEqual(isolamento.alterado,isolamento.esperado);
  assert.strictEqual(isolamento.rpcCatalogo,false);
  await cf.locator('[data-cpj="foto-remover"]').evaluate(el=>el.click());
  assert.deepStrictEqual(await cf.locator("body").evaluate(()=>window.__removidos),[], "remover foto do pedido preserva o arquivo original do catalogo");
  assert.deepStrictEqual(isolamento.escritasAcervo,[]);
  assert.ok(await cf.locator('.cpj-work-comercial').evaluate(el=>{
    const p=el.querySelector('[data-cpj-panel]').getBoundingClientRect(),r=el.querySelector('[data-resumo-comercial]').getBoundingClientRect();
    return r.left>=p.right;
  }), 'pedido a esquerda do resumo');
  await cf.locator('[data-cpj-amb="a1"]').click();
  await cf.locator('[data-cpj-render="r1"] img').evaluate(img=>new Promise((resolve,reject)=>{
    if(img.complete && img.naturalWidth>0)return resolve();
    const timer=setTimeout(()=>reject(Error('Imagem nao recuperou')),5000);
    img.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});
  }));
  assert.strictEqual(transformacoes,0,'renderizacao usa o arquivo original');
  assert.ok(pedidosImagem>=2,'repete uma vez quando o carregamento falha');
  await cf.locator('[data-cpj-render="r2"] .cpj-render-erro').getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();
  liberarImagem=true;
  await cf.locator('[data-cpj-render="r2"] .cpj-render-erro').getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await cf.locator('[data-cpj-render="r2"] .cpj-render-erro').waitFor({state:'detached'});
  assert.ok(await cf.locator('[data-cpj-render="r2"] img').evaluate(img=>img.naturalWidth>0 && img.src.includes('/object/public/')));
  assert.strictEqual(await cf.locator('[data-cpj="ir-estudio"]').count(),0,'botao 3D Livre removido apenas do comercial');
  await cf.locator('body').evaluate(async()=>{
    const {cenaEditor}=await import('./catalogo-studio3d.mjs?v=20261015-assistente');
    cenaEditor.pronto=()=>true;cenaEditor.abrir=async()=>({faltando:0});cenaEditor.fechar=async()=>{};
    cenaEditor.capturar=()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,20,20);return {foto:canvas.toDataURL('image/png'),snapshot:{}};};
  });
  liberarImagem=false;
  await cf.locator('[data-cpj-render="r2"] img').evaluate(img=>{img.src=img.src+'&simular_arquivo_removido=1';});
  await cf.locator('[data-cpj-render="r2"] .cpj-render-erro').getByRole('button',{name:'Recuperar foto do 3D',exact:true}).click();
  await cf.locator('[data-cpj-render="r2"] .cpj-render-erro').waitFor({state:'detached'});
  assert.ok(await cf.locator('[data-cpj-render="r2"] img').evaluate(img=>img.src.includes('/comercial/')), 'imagem recuperada usa pasta exclusiva do pedido');
  console.log('OK - imagens originais, tentativa manual e recuperacao pela cena sem alterar itens');
  await page.locator('.ct-ferramentas [data-etapa="plantas"]').click();
  await cf.locator('.cpj-work-comercial.is-plantas').waitFor();
  await page.locator('.ct-antes [data-etapa="lista"]').click();
  await cf.locator('.cpj-work-comercial:not(.is-plantas)').waitFor();
  await page.locator('.ct-antes [data-etapa="dados"]').click();
  // O resumo na lista incorporada acompanha os valores da tela principal.
  const mirror = await page.evaluate(async () => {
    const f=document.createElement('iframe');document.body.appendChild(f);
    const doc=f.contentDocument;doc.body.innerHTML='<section id="resumo"></section>';
    const mod=await f.contentWindow.eval('import('+JSON.stringify(new URL('../Catalogo/pedido-resumo-comercial.mjs',location.href).href)+')');
    mod.montarResumoComercial(doc.getElementById('resumo'));
    document.getElementById('resumoFreteBruto').textContent='R$ 180,00';
    document.getElementById('resumoMontagemBruto').textContent='R$ 300,00';
    await new Promise(r=>setTimeout(r,100));
    const txt=doc.getElementById('resumo').textContent;
    const result={frete:txt.includes('R$ 180,00'),montagem:txt.includes('R$ 300,00'),input:!!doc.querySelector('#lista-distancia-km'),cards:[...doc.querySelectorAll('.finance-card h2')].map(el=>el.textContent)};
    f.remove();return result;
  });
  assert.deepStrictEqual(mirror,{frete:true,montagem:true,input:true,cards:['Resumo do pedido','Frete','Montagem']});
  await page.locator('.ct-avancar').click();
  await page.waitForFunction(() => window.__rpcs.some((r) => r.nome === "projeto_atualizar_status"), null, { timeout: 10000 });
  const salvo = await page.evaluate(() => ({
    insert: window.__rpcs.find((r) => r.nome === "pedido_salvar_integrado")?.args.p_pedido,
    rpc: window.__rpcs.find((r) => r.nome === "projeto_atualizar_status")?.args, url: location.search
  }));
  assert.strictEqual(salvo.insert.observacoes.projeto_catalogo_id, "pj1", "pedido fica ligado ao projeto");
  assert.strictEqual(salvo.insert.status_comercial, "orcamento", "entra como orçamento, sem reservar");
  assert.deepStrictEqual(salvo.insert.observacoes.projeto_comercial.dados.ambientes.map((a) => a.nome), ["Lounge", "Bar"]);
  assert.deepStrictEqual(salvo.rpc, { p_empresa_id: "e1", p_id: "pj1", p_status: "convertido" });
  assert.ok(/pedido=novo-separacoes_pedidos/.test(salvo.url), "endereço passa a ser o do pedido");
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("OK — projeto do catálogo abre e salva como pedido");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
