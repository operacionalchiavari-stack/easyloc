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
    { id: "e2", pedido: "2104", cliente: "Marcos Vinícius", local: "Haras Pedra do Elefante", etapa: "Montagem", tipo: "montagem", data: "2026-10-20", hora: "09:00", responsavel: "Kauã Bernardes", equipe: ["Igor Ramos", "Vitor Machado", "Thiago Free"], caminhoes: ["M"], m3: 30, pecas: 40, sugerido: 4, freeConfirmados: ["Thiago Free"], conflitos: [], avisos: [], passada: false },
    { id: "e3", pedido: "2117", cliente: "Grupo Horizonte", local: "Espaço Jardim", etapa: "Montagem", tipo: "montagem", data: "2026-10-20", hora: "10:00", responsavel: "Wesley Santos", equipe: ["Igor Ramos"], caminhoes: ["G"], m3: 12, pecas: 10, sugerido: 2, freeConfirmados: [], conflitos: ["Igor Ramos também está em Montagem do pedido 2104 (09:00)"], avisos: [], passada: false }
  ] };
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [], chamadas = [];
  page.on("pageerror", e => erros.push(e.message));
  let atrasoSalvar=0,falharSalvar=false,conflitarSalvar=false;
  let tentativa = 0;const planejamento=painel();planejamento.pessoas[2].foto_url=BASE+'foto-igor.png';planejamento.pessoas.push({nome:'Bruno Lima',foto_url:BASE+'foto-igor.png',equipe:'montagem',lider:false});planejamento.etapas.push({...planejamento.etapas[1],id:'pre',data:'2026-10-22',pedido:'9999',cliente:'Pre reserva em consulta',somente_consulta:true,responsavel:'',equipe:[],caminhoes:[]});planejamento.etapas.push({...planejamento.etapas[1],id:'e4',data:'2026-10-21',cliente:'Evento do dia seguinte',responsavel:'',equipe:[],caminhoes:[]});
  await page.addInitScript(()=>{window.__CONTEXT={empresa_id:'e1',usuario_id:'u1'};window.aguardarContexto=async()=>window.__CONTEXT;window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:[],error:null})};});
  await page.route("**/*", async r => {
    if(r.request().url().includes('/js/core/permissions.js'))return r.fulfill({contentType:'text/javascript',body:'window.EasyLocPermissions={load:async()=>{},hasPermission:()=>true};window.hasPermission=()=>true;'});
    if(r.request().url().includes('/js/core/context.js')||r.request().url().includes('/js/core/supabase.js'))return r.fulfill({contentType:'text/javascript',body:''});
    const u = r.request().url();
    if(u.endsWith("foto-igor.png"))return r.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="gray"/></svg>'});
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
    if (u.includes("/api/gs")) {
      const { fn, args } = JSON.parse(r.request().postData() || "{}");
      chamadas.push({ fn, args });
      if(fn==='ESC_salvarEtapa'){
        if(atrasoSalvar)await new Promise(resolve=>setTimeout(resolve,atrasoSalvar));
        if(falharSalvar){falharSalvar=false;return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,erro:'Falha simulada ao salvar'})});}
        if(conflitarSalvar&&!args[2])return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,resultado:{ok:false,conflitos:['Conflito simulado']}})});
      }
      let res = null;
      if (fn === "ESC_painel") { res = structuredClone(planejamento); res.inicio=args[0];const fim=new Date(args[0]+'T12:00:00');fim.setDate(fim.getDate()+args[1]-1);res.fim=fim.toISOString().slice(0,10);res.etapas=res.etapas.filter(e=>e.data>=res.inicio&&e.data<=res.fim); if (args[2]) res.preenchidas = 3; }
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
  planejamento.etapas.find(e=>e.id==='e3').supervisor={local:'Espaco Jardim',endereco:'Rua das Flores, 120 - Centro',referencia:'Portao lateral',data_entrega:'2026-10-20',horario_entrega:'08:30',data_coleta:'2026-10-21',horario_coleta:'17:00',observacoes_entrega:'Entrar pelo portao lateral <confirmar>',observacoes_coleta:'Retirar apos o evento',acesso:{escada:'Um lance',horario_limite:'09:00'}};
  await page.clock.setFixedTime(new Date('2026-10-20T15:00:00Z'));
  await page.goto(BASE + "Modulos/Logistica/PainelLogistico/painel-logistico.html");
  await page.waitForSelector(".pl-etapa");

  assert.equal(await page.locator('[data-selecionar=e2]').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(22, 199, 90)', 'card completo selecionado deve ter borda verde');
  await page.locator('[data-selecionar=e3]').click();
  const card=page.locator('.pl-planejamento-edicao');
  const info=card.locator('.pl-info-supervisor');
  assert.match(await info.innerText(),/Rua das Flores, 120 - Centro/);
  assert.match(await info.innerText(),/Entrar pelo portao lateral <confirmar>/);
  assert.match(await info.innerText(),/08:30/);
  assert.match(await info.innerText(),/Um lance/);

  assert.match(await card.locator('.pl-capacidade-resumo').innerText(),/12.*54/s);
  assert.match(await card.locator('.pl-capacidade-caminhao').first().innerText(),/54/);
  const dialog = page.locator('#plDisponiveisDialog');
  assert.equal(await dialog.isVisible(), false);
  await page.locator('[data-abrir-disponiveis]').click();
  assert.equal(await dialog.isVisible(), true);
  await page.locator('[data-aba-recurso="interna"]').click();
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await page.locator('[data-aba-recurso="interna"]').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  await page.locator('[data-abrir-disponiveis]').click();
  await page.locator('[data-fechar-disponiveis]').click();
  assert.equal(await dialog.isVisible(), false);
  const faixa=page.locator('#plAbasDias');
  const antes=await page.evaluate(()=>PainelLogisticoDias.inicio);
  const selecionado=await page.evaluate(()=>PainelLogisticoDias.data);
  const historico={...planejamento.etapas.find(e=>e.id==='e2'),id:'historico',data:'2026-10-05',cliente:'Entrega anterior',passada:true,caminhoes:[]};planejamento.etapas.push(historico);
  await faixa.evaluate(nav=>nav.scrollLeft=0);
  await page.waitForFunction(inicio=>PainelLogisticoDias.inicio<inicio,antes);
  assert.equal(await page.evaluate(()=>PainelLogisticoDias.data),selecionado,'carregar passado preserva selecao');
  assert.ok(await faixa.evaluate(nav=>nav.scrollLeft>500),'novos dias preservam a posicao visual');
  await page.locator('[data-dia="2026-10-05"]').click();
  await page.locator('[data-selecionar=historico]').waitFor();
  assert.equal(await page.locator('[data-selecionar=historico] .pl-servico-etapa').innerText(),'Entrega');
  const cadeado=page.locator('[data-liberar-edicao=historico]');
  assert.equal(await cadeado.getAttribute('aria-pressed'),'false');
  await page.locator('[data-abrir-disponiveis]').click();await page.locator('[data-aba-recurso=cam]').click();
  assert.equal(await page.locator('[data-recurso=cam][data-valor=G]').isDisabled(),true);
  await page.locator('[data-fechar-disponiveis]').click();
  await cadeado.click();assert.equal(await cadeado.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.pl-etapa[data-id=historico]').evaluate(el=>el.classList.contains('is-passada')),false);
  const equipeAntes=historico.equipe.slice(),responsavelAntes=historico.responsavel;
  await page.locator('.pl-etapa[data-id=historico] .pl-vaga-cam.is-vazia').click();
  assert.equal(await page.locator('#plDisponiveisDialog').isVisible(),true,'vaga abre a selecao apos liberar');
  await page.locator('[data-aba-recurso=cam]').click();
  assert.equal(await page.locator('[data-recurso=cam][data-valor=G]').isEnabled(),true,'caminhao pode ser alocado em data passada');
  await page.locator('[data-recurso=cam][data-valor=G]').click();
  await page.waitForFunction(()=>document.querySelector('.pl-etapa[data-id=historico] .pl-vaga-cam.is-preenchida strong')?.textContent==='G');
  const gravacao=chamadas.filter(c=>c.fn==='ESC_salvarEtapa'&&c.args[0]==='historico').at(-1);
  assert.deepEqual(gravacao.args[1],{responsavel:responsavelAntes,equipe:equipeAntes,caminhoes:['G']});
  assert.equal(await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=cam]').count(),1,'permite corrigir o caminhao selecionado');
  assert.equal(await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=resp]').count(),1,'equipe liberada tambem');
  await page.locator('[data-fechar-disponiveis]').click();
  await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=equipe]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=equipe]').length===2);
  assert.equal(await cadeado.getAttribute('aria-pressed'),'true','liberacao permanece apos salvar');
  await cadeado.click();assert.equal(await cadeado.getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar]').count(),0,'bloqueia novamente equipe e caminhoes');
  const total=await page.evaluate(()=>PainelLogisticoDias.quantos);
  await faixa.evaluate(nav=>nav.scrollLeft=nav.scrollWidth);
  await page.waitForFunction(n=>PainelLogisticoDias.quantos>n,total);
  assert.equal(await page.evaluate(()=>PainelLogisticoDias.data),'2026-10-05');
  assert.ok(chamadas.filter(c=>c.fn==='ESC_painel').every(c=>c.args[1]<=14),'requisicoes em blocos de ate 14 dias');
  await page.goto(BASE+'Modulos/Logistica/PainelLogistico/painel-logistico.html?dia=2026-10-05');
  await page.locator('[data-selecionar=historico]').waitFor();
  assert.equal(await page.evaluate(()=>PainelLogisticoDias.data),'2026-10-05','link abre diretamente o dia passado');
  await page.locator('[data-liberar-edicao=historico]').click();
  await page.locator('[data-abrir-disponiveis]').click();await page.locator('[data-aba-recurso=cam]').click();
  await page.evaluate(()=>window.__dialogOriginal=document.getElementById('plDisponiveisDialog'));
  const leiturasAntes=chamadas.filter(c=>c.fn==='ESC_painel').length;
  const enviosAntes=chamadas.filter(c=>c.fn==='ESC_salvarEtapa').length;
  atrasoSalvar=1200;
  await page.locator('[data-recurso=cam][data-valor=M] .pl-recurso-dados').click();
  await page.locator('[data-recurso=cam][data-valor=P] .pl-recurso-dados').click();
  assert.equal(await page.locator('.pl-etapa[data-id=historico] .pl-vaga-cam.is-preenchida').count(),3,'dois cliques entram imediatamente antes da resposta');
  assert.equal(chamadas.filter(c=>c.fn==='ESC_salvarEtapa').length,enviosAntes+1,'envios sao sequenciais');
  assert.equal(await page.evaluate(()=>__dialogOriginal===document.getElementById('plDisponiveisDialog')&&__dialogOriginal.open),true,'mesma janela permanece aberta');
  await page.waitForFunction(()=>document.getElementById('plSalvamentoEstado')?.hidden===true);
  assert.deepEqual(planejamento.etapas.find(e=>e.id==='historico').caminhoes,['G','M','P']);
  assert.equal(chamadas.filter(c=>c.fn==='ESC_painel').length,leiturasAntes,'salvar nao recarrega o painel');
  assert.equal(await page.locator('.pl-toast.is-on').count(),0,'sem aviso de salvo a cada clique');
  await page.locator('[data-fechar-disponiveis]').click();
  falharSalvar=true;
  const antesFalha=chamadas.filter(c=>c.fn==='ESC_salvarEtapa').length;
  await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=cam][data-nome=M]').click();
  await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=cam][data-nome=P]').click();
  assert.equal(await page.locator('.pl-etapa[data-id=historico] .pl-vaga-cam.is-preenchida').count(),1);
  await page.waitForFunction(()=>document.getElementById('plErro').textContent.includes('Falha simulada'));
  assert.equal(await page.locator('.pl-etapa[data-id=historico] .pl-vaga-cam.is-preenchida').count(),3,'falha restaura a selecao confirmada');
  assert.equal(chamadas.filter(c=>c.fn==='ESC_salvarEtapa').length,antesFalha+1,'mudanca dependente da falha nao e enviada');
  atrasoSalvar=0;conflitarSalvar=true;
  await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=cam][data-nome=M]').click();
  await page.locator('#plConflito').waitFor({state:'visible'});await page.locator('#plConflitoVoltar').click();
  await page.waitForFunction(()=>document.getElementById('plSalvamentoEstado').hidden);
  assert.equal(await page.locator('.pl-etapa[data-id=historico] [data-papel=cam][data-nome=M]').count(),1,'cancelar conflito desfaz a selecao');
  await page.locator('.pl-etapa[data-id=historico] [data-acao=tirar][data-papel=cam][data-nome=M]').click();
  await page.locator('#plConflito').waitFor({state:'visible'});await page.locator('#plConflitoSalvar').click();
  await page.waitForFunction(()=>document.getElementById('plSalvamentoEstado').hidden);
  assert.deepEqual(planejamento.etapas.find(e=>e.id==='historico').caminhoes,['G','P'],'confirmacao explicita salva com conflito');
  console.log('OK - cards clicaveis, resposta imediata, fila de cliques, rollback e conflitos.');
  assert.deepEqual(erros,[]);
  console.log('OK - datas anteriores e futuras, selecao, posicao da faixa e link de data passada.');
  await page.screenshot({path:'.tmp/caminhoes-capacidades.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=392));
  await browser.close();
  console.log('OK - capacidade por veiculo, total necessario, total distribuido e celular.');
})().catch(e=>{console.error(e);process.exit(1);});
