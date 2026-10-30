// Out/2026 — regras de data nos dados do pedido (ver CLAUDE.md, "Datas do pedido").
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
  await page.goto(BASE + "Modulos/Comercial/Pedidos/pedido.html?modo=editar");
  await page.locator('.entrada-formulario').waitFor({ state: 'visible' });
  // Evento vem primeiro; entrega e coleta travadas até ele
  const ordem = await page.evaluate(() => [...document.querySelectorAll('.entrada-data-card h4')].map((h) => h.textContent.trim()));
  assert.deepEqual(ordem, ['Evento', 'Entrega', 'Coleta']);
  assert.equal(await page.locator('#dataEntrega').isDisabled(), true); assert.equal(await page.locator('#dataColeta').isDisabled(), true);
  if(process.env.FOTO){await page.fill('#dataEvento','2026-11-20');await page.locator('#dataEvento').dispatchEvent('change');await page.locator('.entrada-agenda').screenshot({path:process.env.FOTO});const h=await page.evaluate(()=>[...document.querySelectorAll('.entrada-data-card')].map(c=>Math.round(c.getBoundingClientRect().height)));console.log('alturas',h);await page.fill('#dataEvento','');await page.locator('#dataEvento').dispatchEvent('change');}
  console.log('ok 1 - evento primeiro, entrega e coleta travadas até preencher o evento');
  let perguntas = [];
  const responder = (r) => page.evaluate((r) => { window.__resp = r; window.confirmarGlobal = async (t) => { (window.__perg ||= []).push(t); return window.__resp; }; }, r);
  await responder(false);
  await page.fill('#dataEvento', '2026-11-20'); await page.locator('#dataEvento').dispatchEvent('change');
  assert.equal(await page.locator('#dataEntrega').isDisabled(), false);
  assert.equal(await page.locator('#dataEntrega').getAttribute('max'), '2026-11-20'); assert.equal(await page.locator('#dataColeta').getAttribute('min'), '2026-11-20');
  const mudar = async (id, v) => { await page.fill(id, v); await page.locator(id).dispatchEvent('change'); await page.waitForTimeout(150); };
  await mudar('#dataEntrega', '2026-11-19');
  assert.equal(await page.inputValue('#dataEntrega'), '2026-11-19'); assert.equal((await page.evaluate(() => window.__perg || [])).length, 0, '1 dia antes não pergunta');
  await mudar('#dataEntrega', '2026-11-21');
  assert.equal(await page.inputValue('#dataEntrega'), '2026-11-19', 'entrega depois do evento é recusada');
  await mudar('#dataEntrega', '2026-11-15');
  assert.match((await page.evaluate(() => window.__perg))[0], /mais de 2 dias antes do evento/);
  assert.equal(await page.inputValue('#dataEntrega'), '2026-11-19', 'respondeu não: volta para a data anterior');
  await responder(true); await mudar('#dataEntrega', '2026-11-15');
  assert.equal(await page.inputValue('#dataEntrega'), '2026-11-15', 'respondeu sim: fica');
  console.log('ok 2 - entrega: nunca depois do evento; mais de 2 dias antes pergunta');
  await page.evaluate(() => { window.__perg = []; }); await responder(false);
  await mudar('#dataColeta', '2026-11-22');
  assert.equal(await page.inputValue('#dataColeta'), '2026-11-22'); assert.equal((await page.evaluate(() => window.__perg)).length, 0);
  await mudar('#dataColeta', '2026-11-19');
  assert.equal(await page.inputValue('#dataColeta'), '2026-11-22', 'coleta antes do evento é recusada');
  await mudar('#dataColeta', '2026-11-25');
  assert.match((await page.evaluate(() => window.__perg))[0], /mais de 2 dias depois do evento/);
  assert.equal(await page.inputValue('#dataColeta'), '2026-11-22');
  console.log('ok 3 - coleta: nunca antes do evento; mais de 2 dias depois pergunta');
  // Salvamento automático: o rascunho fica no navegador e, ao reabrir, oferece recuperar
  await page.fill('#horaEntrega', '08:30');
  await page.click('#observacoesEntrega'); await page.keyboard.type('Portão lateral'); // digitação de verdade (evento do usuário)
  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pedido_rascunho:e1:novo') || 'null')?.pedido?.data_evento === '2026-11-20'; } catch { return false; } }, null, { timeout: 12000 });
  console.log('ok 4 - rascunho gravado sozinho no navegador');
  await page.addInitScript(() => { Object.defineProperty(window, 'confirmarGlobal', { configurable: true, get(){ return async (t) => { (window.__perg ||= []).push(t); return true; }; }, set(){} }); });
  await page.reload();
  await page.waitForFunction(() => (window.__perg || []).some((t) => /não foram salvas/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('dataEvento')?.value === '2026-11-20' && document.getElementById('horaEntrega')?.value === '08:30' && document.getElementById('observacoesEntrega')?.value === 'Portão lateral', null, { timeout: 8000 });
  assert.equal(await page.inputValue('#dataEntrega'), '2026-11-15'); assert.equal(await page.inputValue('#dataColeta'), '2026-11-22');
  console.log('ok 5 - ao reabrir pergunta e recupera o que estava preenchido');
  assert.deepEqual(erros, []);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
