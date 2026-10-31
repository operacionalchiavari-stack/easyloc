// Out/2026 — Cancelar pedido: motivos vindos de Parâmetros > Comercial, "Outro motivo" exige observação, cancelar não
// exige o financeiro distribuído, grava motivo/observação/quem/quando; se não grava, a situação volta à anterior.
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
    comercial_motivos_cancelamento: [{id:"m1",empresa_id:"e1",nome:"Concorrência mais barata",descricao:"Fechou por preço menor",ativo:true,ordem:1},{id:"m9",empresa_id:"e1",nome:"Outro motivo",descricao:"Detalhar",ativo:true,ordem:99}],
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
  await page.evaluate(() => { window.__al = []; window.alerta = (m, t) => window.__al.push(t + ": " + m); window.confirmarGlobal = async () => true; });
  const salvos = () => page.evaluate(() => window.__rpcs.filter((r) => r.nome === "pedido_salvar_integrado").map((x) => x.args.p_pedido || x.args.p));
  // 1) pedido sem telefone: não cancela e volta a ser Reservado
  await page.selectOption("#pedidoStatusComercial", "cancelado");
  await page.waitForSelector("#modalCancelarOrcamento:not(.hidden) [data-motivo-id=m1]");
  assert.deepEqual(await page.$$eval("#cancelamentoMotivos [data-motivo]", (l) => l.map((x) => x.dataset.motivo)), ["Concorrência mais barata", "Outro motivo"], "motivos de Parâmetros");
  await page.click("[data-motivo-id=m9]"); await page.click("#btnConfirmarCancelamentoPedido");
  assert.ok(await page.isVisible("#modalCancelarOrcamento:not(.hidden)"), "Outro motivo sem observação não confirma");
  await page.click("[data-motivo-id=m1]"); await page.click("#btnConfirmarCancelamentoPedido");
  await page.waitForFunction(() => window.__al.some((m) => /telefone/i.test(m)));
  assert.equal(await page.evaluate(() => window.__PEDIDO_STATUS_ATUAL), "aprovado", "não gravou: a situação volta");
  assert.equal((await salvos()).length, 0);
  assert.ok(!(await page.evaluate(() => window.__al.join(" "))).includes("Pedido cancelado"));
  console.log("ok 1 - motivos de Parâmetros; Outro motivo exige observação; sem gravar a situação volta");
  // 2) com telefone: cancela mesmo com o financeiro como está, grava o motivo
  await page.evaluate(() => { const t = document.getElementById("clienteTelefone") || document.querySelector("[id*=elefone]"); if (t) t.value = "11999990000"; window.__al = []; });
  await page.selectOption("#pedidoStatusComercial", "cancelado");
  await page.waitForSelector("#modalCancelarOrcamento:not(.hidden) [data-motivo-id=m1]");
  await page.click("[data-motivo-id=m1]"); await page.fill("#motivoCancelamentoPedido", "Fechou com outra empresa"); await page.click("#btnConfirmarCancelamentoPedido");
  await page.waitForFunction(() => window.__al.some((m) => /Pedido cancelado/.test(m)), null, { timeout: 15000 });
  const ped = (await salvos()).pop();
  assert.equal(ped.status_comercial, "cancelado");
  assert.equal(ped.observacoes.cancelamento.motivo, "Concorrência mais barata"); assert.equal(ped.observacoes.cancelamento.motivo_id, "m1");
  assert.equal(ped.observacoes.cancelamento.observacao, "Fechou com outra empresa"); assert.ok(ped.observacoes.cancelamento.data && ped.observacoes.cancelamento.usuario);
  console.log("ok 2 - cancela com o motivo, a observação, quem e quando");
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });