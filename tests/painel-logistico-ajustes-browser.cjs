// Out/2026 — Painel Logístico: mostra a escala da semana, ajusta responsável/equipe/caminhão,
// avisa conflito antes de gravar e só grava com "Salvar mesmo assim"; "Preencher vazios" pede ao servidor.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const SAIDA = process.env.SHOT_DIR || "";

const regras = { deslocamento_h: 1, volume_padrao_m3: 10, usar_free: true, etapas: {
  triagem: { equipe: "triagem", caminhao: false }, carregamento: { equipe: "carregamento", caminhao: true },
  descarregamento: { equipe: "carregamento", caminhao: true }, montagem: { equipe: "montagem", caminhao: true }, desmontagem: { equipe: "montagem", caminhao: true } } };
const pessoas = [
  { nome: "Kauã Bernardes", equipe: "montagem", lider: true }, { nome: "Wesley Santos", equipe: "montagem", lider: true },
  { nome: "Igor Ramos", equipe: "montagem", lider: false }, { nome: "Vitor Machado", equipe: "montagem", lider: false },
  { nome: "Fabio Luiz", equipe: "carregamento", lider: true }, { nome: "Thiago Free", equipe: "free", lider: false, free: true }
];
const caminhoes = [{ codigo: "M", modelo: "Mercedez - Benz", capacidade: 42, empresa: "Simas Frete" }, { codigo: "G", modelo: "Volkswagen", capacidade: 54, empresa: "Simas Frete" }, { codigo: "P", modelo: "Hyundai HR", capacidade: 0, empresa: "Edir" }];
function painel() {
  return { inicio: "2026-10-20", fim: "2026-10-26", hoje: "2026-10-20", preenchidas: 0, regras, pessoas, caminhoes, etapas: [
    { id: "e1", pedido: "2104", cliente: "Marcos Vinícius", local: "Haras Pedra do Elefante", etapa: "Carregamento", tipo: "carregamento", data: "2026-10-20", hora: "07:00", responsavel: "Fabio Luiz", equipe: [], caminhoes: ["M"], m3: 30, pecas: 40, sugerido: 2, freeConfirmados: [], conflitos: [], avisos: ["Equipe pequena: 1 de 2 pessoas sugeridas"], passada: false },
    { id: "e2", montagem_extra: true, pedido: "2104", cliente: "Marcos Vinícius", local: "Haras Pedra do Elefante", etapa: "Montagem", tipo: "montagem", data: "2026-10-20", hora: "09:00", responsavel: "Kauã Bernardes", equipe: ["Igor Ramos", "Vitor Machado", "Thiago Free"], caminhoes: ["M"], m3: 30, pecas: 40, sugerido: 4, freeConfirmados: ["Thiago Free"], conflitos: [], avisos: [], passada: false },
    { id: "e3", pedido: "2117", cliente: "Grupo Horizonte", local: "Espaço Jardim", etapa: "Montagem", tipo: "montagem", data: "2026-10-20", hora: "10:00", responsavel: "Wesley Santos", equipe: ["Igor Ramos"], caminhoes: ["G"], m3: 12, pecas: 10, sugerido: 2, freeConfirmados: [], conflitos: ["Igor Ramos também está em Montagem do pedido 2104 (09:00)"], avisos: [], passada: false }
  ] };
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [], chamadas = [];
  page.on("pageerror", e => erros.push(e.message));
  let tentativa = 0;const planejamento=painel();planejamento.pessoas[2].foto_url=BASE+'foto-igor.png';planejamento.pessoas.push({nome:'Bruno Lima',foto_url:BASE+'foto-igor.png',equipe:'montagem',lider:false});planejamento.etapas.push({...planejamento.etapas[1],id:'pre',data:'2026-10-22',pedido:'9999',cliente:'Pre reserva em consulta',somente_consulta:true,responsavel:'',equipe:[],caminhoes:[]});planejamento.etapas.push({...planejamento.etapas[1],id:'e4',data:'2026-10-21',cliente:'Evento do dia seguinte',responsavel:'',equipe:[],caminhoes:[]});
  await page.addInitScript(()=>{window.__CONTEXT={empresa_id:'e1',usuario_id:'u1'};window.aguardarContexto=async()=>window.__CONTEXT;window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:[],error:null})};});
  await page.route("**/*", r => {
    if(r.request().url().includes('/js/core/permissions.js'))return r.fulfill({contentType:'text/javascript',body:'window.EasyLocPermissions={load:async()=>{},hasPermission:()=>true};window.hasPermission=()=>true;'});
    if(r.request().url().includes('/js/core/context.js')||r.request().url().includes('/js/core/supabase.js'))return r.fulfill({contentType:'text/javascript',body:''});
    const u = r.request().url();
    if(u.endsWith("foto-igor.png"))return r.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="gray"/></svg>'});
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
    if (u.includes("/api/gs")) {
      const { fn, args } = JSON.parse(r.request().postData() || "{}");
      chamadas.push({ fn, args });
      let res = null;
      if (fn === "ESC_painel") { res = structuredClone(planejamento); if (args[2]) res.preenchidas = 3; }
      if (fn === "ESC_salvarEtapa") { tentativa++; res = args[2] ? { ok: true, conflitos: ["Caminhão M também está em Montagem do pedido 2104"] } : (args[1].caminhoes.includes("M") && args[0] === "e3" ? { ok: false, conflitos: ["Caminhão M também está em Montagem do pedido 2104 (09:00)"] } : { ok: true, conflitos: [] }); }
      if(fn==='ESC_salvarEtapa'&&res.ok){Object.assign(planejamento.etapas.find(e=>e.id===args[0]),args[1]);}
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: res }) });
    }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.clock.setFixedTime(new Date('2026-10-20T15:00:00Z'));
  await page.goto(BASE + "Modulos/Logistica/PainelLogistico/painel-logistico.html");
  await page.waitForSelector(".pl-etapa");
  assert.equal(await page.locator('[data-selecionar=e2] .pl-montagem-extra').innerText(),'Com montagem extra');
  assert.equal(await page.locator('[data-selecionar=e3] .pl-montagem-extra').innerText(),'Sem montagem extra');
  await page.evaluate(()=>{window.EntregasColetas={podeSelecionarOperacao:()=>true,definirOperacao(){},definirDia(){},iniciar:async()=>{},contadores:()=>({entrega:0,coleta:0})};});
  for(const aba of ['Entrega','Coleta']){
    await page.locator('#plTab'+aba).click();
    assert.equal(await page.locator('#plAbasDias').isVisible(),false);
    assert.equal(await page.locator('#plModuloEntregas').isVisible(),true);
  }
  await page.locator('#plTabEquipe').click();
  assert.equal(await page.locator('#plAbasDias').isVisible(),true);
  console.log('OK - cards indicam montagem extra; Entrega e Coleta sem faixa de datas; Equipe preservada');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
