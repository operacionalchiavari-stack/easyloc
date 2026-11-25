// 18/11/2026 — Central de Pedidos: aba "Confirmar datas" (entrega a N dias, confirmar sai da aba) e o Painel gerencial
// (resumo, clientes, locais, mapa de calor com Leaflet). Supabase simulado; o Leaflet é carregado do unpkg (precisa de internet).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const raiz = path.resolve(__dirname, "..");
const BASE = "http://localhost:5598/";

const mock = `(() => {
  const obs = (total) => ({ valores: { total, locacao: total * 0.8, locacao_bv: total * 0.8 }, pagamento_config: { descontosAreas: { locacao: total * 0.1 } }, bv: { percentual: 10 } });
  const banco = {
    separacoes_pedidos: [
      { id: "a1", empresa_id: "e1", numero_pedido: "101", cliente_id: "cl1", cliente_nome: "Kelly Decor", local_id: "l1", local_nome: "Villa Bisutti", status_comercial: "aprovado", data_evento: "2026-11-25", data_entrega: "2026-11-24", data_coleta: "2026-11-26", valor_total: 10000, observacoes: obs(10000), criado_em: "2026-10-01T10:00:00Z" },
      { id: "a2", empresa_id: "e1", numero_pedido: "102", cliente_id: "cl1", cliente_nome: "Kelly Decor", local_id: "l2", local_nome: "Fazenda Santa Clara", status_comercial: "aprovado", data_evento: "2026-12-20", data_entrega: "2026-12-19", data_coleta: "2026-12-21", valor_total: 5000, observacoes: obs(5000), criado_em: "2026-10-01T10:00:00Z" },
      { id: "a3", empresa_id: "e1", numero_pedido: "103", cliente_id: "cl2", cliente_nome: "Ana Eventos", local_id: "l1", local_nome: "Villa Bisutti", status_comercial: "aprovado", data_evento: "2026-11-22", data_entrega: "2026-11-21", data_coleta: "2026-11-23", valor_total: 8000, observacoes: obs(8000), criado_em: "2026-10-01T10:00:00Z" }
    ],
    locais_empresas: [
      { id: "l1", empresa_id: "e1", nome_razao: "Villa Bisutti", endereco: "Estrada União e Indústria, 1000 - Itaipava, Petrópolis - RJ, 25745-000, Brasil", latitude: -22.40, longitude: -43.13, distancia_galpao_km: 5 },
      { id: "l2", empresa_id: "e1", nome_razao: "Fazenda Santa Clara", endereco: "Rua A, 10 - Centro, Teresópolis - RJ, 25960-000, Brasil", latitude: -22.41, longitude: -42.97, distancia_galpao_km: 40 }
    ],
    clientes_empresas: [{ id: "cl1", empresa_id: "e1", nome_razao: "Kelly Decor" }, { id: "cl2", empresa_id: "e1", nome_razao: "Ana Eventos" }],
    fin_bv_comissoes: []
  };
  window.__confirmados = [];
  window.__bancoDatas = banco;
  window.__chamadasDatas = [];
  window.__erroDatas = false;
  function confirmarDatas(args){
    window.__chamadasDatas.push(args);
    if(window.__erroDatas) return {data:null,error:{message:'Falha de teste ao salvar datas'}};
    const pedido = banco.separacoes_pedidos.find(p => p.id === args.p_pedido);
    Object.assign(pedido,args.p_datas);
    window.__confirmados.push({pedido_id:pedido.id,entrega:pedido.data_entrega,evento:pedido.data_evento,coleta:pedido.data_coleta,por:'Teste'});
    return {data:{ok:true},error:null};
  }
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = { select(){return q;}, order(){return q;}, limit(){return q;}, range(a){ if(a>0) linhas=[]; return q;}, gte(){return q;}, lte(){return q;}, neq(){return q;}, or(){return q;}, ilike(){return q;}, not(){return q;}, is(){return q;},
      eq(c,v){ linhas = linhas.filter((l)=>!(c in l)||String(l[c])===String(v)); return q; }, in(c,vs){ linhas = linhas.filter((l)=>vs.map(String).includes(String(l[c]))); return q; },
      single(){unico=true;return q;}, maybeSingle(){unico=true;return q;}, update(){return q;}, insert(){return q;}, upsert(){return q;}, delete(){return q;},
      then(ok,erro){ return Promise.resolve({ data: unico ? (linhas[0]||null) : linhas, error: null }).then(ok,erro); } };
    return q;
  }
  const canal = { on(){return canal;}, subscribe(){return canal;} };
  const cliente = {
    auth: { getSession: async()=>({data:{session:{access_token:"t",user:{id:"u1"}}}}), getUser: async()=>({data:{user:{id:"u1",email:"a@b"}}}), signOut: async()=>{}, onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
    from: consulta,
    rpc: (nome, args) => ({ then: (ok, erro) => Promise.resolve(
      nome === "funcionario_contexto" ? { data: { ativo: true, administrador_legado: true }, error: null }
      : nome === "comercial_confirmar_datas_lista" ? { data: { dias: 10, confirmados: window.__confirmados }, error: null }
      : nome === "comercial_confirmar_datas_atualizar" ? confirmarDatas(args)
      : nome === "comercial_followup_lista" ? { data: { config: { dias: 3, motivos: [] }, acompanhamentos: [], encerrados: [] }, error: null }
      : { data: [], error: null }).then(ok, erro) }),
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.setFixedTime(new Date("2026-11-18T15:00:00Z"));
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide is not defined/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mock });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    if (/unpkg\.com|fonts\.g|tile\.openstreetmap/.test(url)) return rota.continue();
    return rota.fulfill({ status: 200, body: "" });
  });

  // Aba Confirmar datas
  await page.goto(BASE + "Modulos/Comercial/Pedidos/CentralPedidos.html");
  const aba = page.locator('[data-situacao="confirmar_datas"]');
  await aba.waitFor();
  assert.equal((await aba.locator(".central-situacao-conta").textContent()).trim(), "2", "101 (6 dias) e 103 (3 dias) pedem confirmação; 102 (31 dias) não");
  await aba.click();
  assert.equal(await page.locator("#centralPedidosTbody tr[data-pedido-id]").count(), 2);
  assert.ok((await page.locator("#centralColFluxo").textContent()).includes("Confirmação"));
  await page.locator('tr[data-pedido-id="a3"] [data-action="confirmar-datas"]').click();
  const dlg = page.locator('.central-confirmar-dialog');
  assert.equal(await dlg.locator('[data-mudar]').count(),0,'edição não exige abrir o pedido');
  assert.equal(await dlg.locator('[name=data_entrega]').inputValue(),'2026-11-21');
  await dlg.locator('[name=data_entrega]').fill('2026-11-20');
  await dlg.locator('[data-cancelar]').click();
  assert.equal(await page.evaluate(()=>__chamadasDatas.length),0,'cancelar não grava datas');
  await page.locator('tr[data-pedido-id="a3"] [data-action="confirmar-datas"]').click();
  assert.equal(await dlg.locator('[name=data_entrega]').inputValue(),'2026-11-21');
  await dlg.locator('[name=data_entrega]').fill('2026-11-24');
  await dlg.locator('[data-ok]').click();
  assert.match(await dlg.locator('.central-confirmar-erro').innerText(),/entrega precisa/);
  assert.equal(await page.evaluate(()=>__chamadasDatas.length),0);
  await dlg.locator('[name=data_entrega]').fill('2026-11-22');
  await dlg.locator('[name=data_evento]').fill('2026-11-23');
  await dlg.locator('[name=data_coleta]').fill('2026-11-24');
  await dlg.locator('textarea').fill('Datas ajustadas por telefone');
  await page.evaluate(()=>__erroDatas=true);
  await dlg.locator('[data-ok]').click();
  await page.waitForFunction(()=>document.querySelector('.central-confirmar-erro')?.textContent.includes('Falha de teste'));
  assert.equal(await dlg.locator('[name=data_entrega]').inputValue(),'2026-11-22','falha mantém as datas digitadas');
  assert.equal(await page.evaluate(()=>__bancoDatas.separacoes_pedidos.find(p=>p.id==='a3').data_entrega),'2026-11-21');
  await page.evaluate(()=>__erroDatas=false);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    assert.ok(await dlg.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'modal sem corte horizontal');
    fs.mkdirSync(path.join(raiz,'.tmp'),{recursive:true});
    await page.screenshot({path:path.join(raiz,'.tmp/confirmar-datas-editar-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator(".central-confirmar-dialog [data-ok]").click();
  await page.waitForFunction(() => document.querySelectorAll("#centralPedidosTbody tr[data-pedido-id]").length === 1);
  assert.deepEqual(await page.evaluate(()=>{const p=__bancoDatas.separacoes_pedidos.find(p=>p.id==='a3');return [p.data_entrega,p.data_evento,p.data_coleta];}),['2026-11-22','2026-11-23','2026-11-24']);
  assert.deepEqual(await page.evaluate(()=>__chamadasDatas.at(-1).p_antes),{data_entrega:'2026-11-21',data_evento:'2026-11-22',data_evento_fim:null,data_coleta:'2026-11-23'});
  assert.equal(await page.evaluate(()=>__confirmados.at(-1).entrega),'2026-11-22');
  console.log("ok 1 - Confirmar datas: edição no modal, cancelar, validação, falha preserva campos, datas e confirmação salvas juntas; desktop e celular");
  if(process.argv.includes('--somente-confirmar')){assert.deepEqual(erros,[]);await browser.close();return;}

  // Painel gerencial
  await page.goto(BASE + "Modulos/Comercial/Pedidos/gerencial.html");
  await page.locator(".ge-quadro").first().waitFor();
  const texto = await page.locator("#gConteudo").innerText();
  assert.ok(/Eventos\s*3/.test(texto), "3 eventos no ano");
  assert.ok(texto.includes("Kelly Decor") && texto.includes("Villa Bisutti") && texto.includes("Petrópolis/RJ"), "clientes, locais e cidades");
  await page.waitForFunction(() => document.querySelector("#gMapa .leaflet-container, #gMapa.leaflet-container"), null, { timeout: 15000 }).catch(() => {});
  const mapa = await page.evaluate(() => !!document.querySelector("#gMapa.leaflet-container") && !!document.querySelector("#gMapa canvas.leaflet-heatmap-layer"));
  assert.ok(mapa, "mapa de calor desenhado");
  await page.screenshot({ path: "tests/central-gerencial-preview.png", fullPage: false });
  console.log("ok 2 - Painel gerencial com resumo, clientes, locais, cidades e mapa de calor");
  assert.deepEqual(erros, []);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
