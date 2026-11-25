/* =====================================================
   FECHAMENTOS DE PARCEIROS (trazido da Tecnoweld em nov/2026) — Financeiro → A pagar → "Fechamentos de parceiros".
   Parceiros: fornecedores de Compras, empresas de sublocação (custo dos itens sublocados nos pedidos) e transportadoras/freteiros
   (fretes: o relatório do App do Freteiro, depois das divergências resolvidas).
   Fornecedor marcado no cadastro "Cobra por fechamento" (mensal ou semanal, nov/2026): as contas do período ficam como prévia
   ("Vai no fechamento"). No fim do período: arrasta a cobrança do fornecedor (a IA lê, igual ao extrato), cada linha
   é ligada a um pedido nosso (pelo número do pedido ou pelo valor). Diferenças: ajustar ao valor deles, contestar, lançar o que
   só eles têm, ignorar; pedido nosso que não veio fica para o próximo fechamento. Unificar: forma + parcelas combinadas ->
   cada parcela vira UMA linha no A pagar (o botão "Ver compras" mostra o que compõe). Nota fiscal: anexa a qualquer momento.
   Banco: fin_fechamento_* (migração 20261114000600).
===================================================== */
(function () {
  "use strict";
  const T = { forn: null, fech: null, det: null, busy: false };
  let C = null;
  const zerar = () => { T.sel = new Set(); T.edit = {}; T.selIni = false; T.filtro = "todas"; };
  const $ = (id) => document.getElementById(id);
  const num = (v) => { const s = String(v ?? "").trim(); if (!s) return null; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : null; };
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const isoHoje = () => new Date().toISOString().slice(0, 10);
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const SIT = {
    pendente: ["aberto", "Sem compra nossa"], conferida: ["pago", "Confere"], divergente: ["vencido", "Valor diferente"], ajustada: ["parcial", "Valor ajustado"],
    lancada: ["parcial", "Lançada"], contestada: ["vencido", "Contestada"], ignorada: ["cancelado", "Ignorada"],
  };
  const PC = (n) => "PC-" + String(n).padStart(6, "0");
  const FORMAS = [["boleto", "Boleto"], ["pix", "PIX"], ["transferencia", "Transferência"], ["dinheiro", "Dinheiro"]];
  // "30/60/90", "28 dias", "3x", "à vista" -> parcelas iguais (a última fica com os centavos)
  function parcelasDaCondicao(cond, total, base) {
    const t = String(cond || "").toLowerCase();
    let dias = (t.match(/\d+/g) || []).map(Number);
    if (/vista|antecipad/.test(t) || !dias.length) dias = [0];
    else if (/(\d+)\s*x/.test(t) && dias.length === 1) dias = Array.from({ length: dias[0] }, (_, k) => 30 * (k + 1));
    const n = dias.length, parte = Math.floor((total / n) * 100) / 100;
    return dias.map((d, k) => ({ vencimento: somaDias(base, d), valor: k === n - 1 ? r2(total - parte * (n - 1)) : parte }));
  }

  // Fechamento mensal ou semanal (nov/2026). Semana: dia_semana 1 = segunda ... 7 = domingo (ISO).
  const DIAS_SEMANA = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
  const periodoTexto = (f) => f.periodo === "semanal"
    ? "Fechamento semanal" + (f.dia_semana ? " · toda " + DIAS_SEMANA[f.dia_semana] : "")
    : "Fechamento mensal" + (f.fechamento_dia ? " · dia " + f.fechamento_dia : "");
  const ddmm = (d) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  function referenciaNova(forn, hoje = new Date()) {
    if (forn.periodo === "semanal") {
      // a semana que termina no dia do fechamento mais recente (hoje, se hoje for o dia); sem dia escolhido, a semana passada (seg a dom)
      const alvo = Number(forn.dia_semana) || 7, iso = (d) => ((d.getDay() + 6) % 7) + 1;
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      fim.setDate(fim.getDate() - ((iso(fim) - alvo + 7) % 7));
      const ini = new Date(fim); ini.setDate(ini.getDate() - 6);
      return "Semana " + ddmm(ini) + " a " + ddmm(fim) + "/" + fim.getFullYear();
    }
    const mes = new Date(hoje); mes.setDate(0); // mês passado (o fechamento costuma chegar no começo do mês seguinte)
    const ref = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][hoje.getDate() > 20 ? hoje.getMonth() : mes.getMonth()];
    const ano = hoje.getDate() > 20 ? hoje.getFullYear() : mes.getFullYear();
    return ref.charAt(0).toUpperCase() + ref.slice(1) + "/" + ano;
  }

  async function render(ctx) {
    C = ctx;
    const box = $("finConteudo");
    let forns = [];
    try { forns = (await C.rpc("fin_fechamento_fornecedores", { p_empresa: C.S.emp })) || []; }
    catch (e) { box.innerHTML = '<div class="fin-vazio">' + C.esc(e.message) + "</div>"; return; }
    try { T.div = await C.rpc("divergencias_acompanhar", { p_empresa: C.S.emp, p_origens: ["frete", "uber"] }); T.divErro = null; } catch (e) { T.div = null; T.divErro = e.message; }
    if (!forns.length && !T.div) {
      box.innerHTML = '<section class="fin-bloco"><h3>Fechamentos de parceiros</h3><div class="fin-vazio">Nenhum parceiro cobra por fechamento.<br>Para usar, marque <b>Cobra por fechamento</b> no cadastro do parceiro e escolha se o fechamento é <b>mensal</b> ou <b>semanal</b> (Estoque → Cadastros → Fornecedores).</div></section>';
      return;
    }
    if (!T.forn || (T.forn !== "__div" && !forns.some((f) => f.id === T.forn))) T.forn = forns.length ? forns[0].id : "__div";
    if (T.forn === "__div" && !divDe((x) => x.origem === "uber").abertas.length && !divDe((x) => x.origem === "uber").resolvidas.length && forns.length) T.forn = forns[0].id;
    const ini = (n) => String(n || "?").replace(/^TST\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const foto = (f) => '<span class="fe-av" aria-hidden="true">' + (f.logo_url ? '<img src="' + C.esc(f.logo_url) + '" alt="">' : C.esc(ini(f.nome))) + "</span>";
    const nDivForn = (id) => divDe((x) => x.fornecedor_id === id).abertas.length;
    const nav = forns.map((f) => '<button type="button" class="bk-item fe-forn' + (f.id === T.forn ? " ativa" : "") + '" data-fe-forn="' + f.id + '">' + foto(f) + '<span class="bk-item-txt"><span class="bk-item-nome">' + C.esc(f.nome) + "</span>" +
      (nDivForn(f.id) ? '<small class="fe-div-aviso"><b class="fe-div-n">' + nDivForn(f.id) + "</b> divergência" + (nDivForn(f.id) === 1 ? "" : "s") + " aguardando decisão</small>" : "") +
      '<small class="fe-periodo">' + C.esc(periodoTexto(f)) + "</small>" +
      "<small>" + (Number(f.aguardando_valor) > 0 ? C.brl(f.aguardando_valor) + " aguardando em " + f.aguardando_pedidos + " compra(s)" : "nada aguardando") + "</small>" +
      (f.fechamentos.some((x) => x.status === "em_conferencia") ? '<small class="fe-em-conf">fechamento em conferência</small>' : "") + "</span></button>").join("");
    // As divergências de frete ficam nas próprias linhas; só o Uber, que não tem parceiro, fica à parte.
    const dUber = divDe((x) => x.origem === "uber");
    const nAb = dUber.abertas.length;
    const navDiv = dUber.abertas.length || dUber.resolvidas.length ? '<button type="button" class="bk-item fe-forn fe-div-item' + (T.forn === "__div" ? " ativa" : "") + '" data-fe-forn="__div"><span class="fe-av fe-av-div" aria-hidden="true">!</span><span class="bk-item-txt"><span class="bk-item-nome">Divergências · Uber</span><small>' + (nAb ? '<b class="fe-div-n">' + nAb + "</b> aguardando decisão" : "nenhuma em aberto") + "</small></span></button>" : "";
    box.innerHTML = '<div class="bk-layout fe-layout"><nav class="bk-contas" aria-label="Parceiros com fechamento">' + navDiv + nav + '</nav><div class="bk-main" id="feMain"></div></div>';
    box.querySelectorAll("[data-fe-forn]").forEach((b) => b.addEventListener("click", () => { T.forn = b.dataset.feForn; T.fech = null; T.periodo = null; T.abaForn = "aguardando"; zerar(); render(C); }));
    if (T.forn === "__div") { await pintarDivergencias(); return; }
    const forn = forns.find((f) => f.id === T.forn);
    if (!T.fech) T.fech = (forn.fechamentos.find((x) => x.status === "em_conferencia") || {}).id || null;
    if (T.fech && !forn.fechamentos.some((x) => x.id === T.fech)) T.fech = null;
    await pintarFornecedor(forn);
  }


  /* Divergências (22/11; 23/11 dentro do parceiro): o Financeiro acompanha as duas justificativas; quem decide é a Logística. */
  function divDe(filtro) {
    const d = T.div || {};
    return { abertas: (d.abertas || []).filter(filtro), resolvidas: (d.resolvidas || []).filter(filtro), relatorios: (d.relatorios || []).filter(filtro) };
  }
  async function divHtml(d) {
    const aba = T.divAba || "abertas", lista = aba === "abertas" ? d.abertas : d.resolvidas;
    if (window.DivergenciasTabela) await window.DivergenciasTabela.lerFotos(C.S.emp, [...d.abertas, ...d.resolvidas]);
    const rel = d.relatorios.length ? '<section class="fin-bloco fe-div-rel"><h3>Relatórios em conferência</h3><table class="fin-tabela"><thead><tr><th>Enviado por</th><th>Período</th><th>Enviado em</th><th class="num">Total informado</th></tr></thead><tbody>' +
      d.relatorios.map((r) => "<tr><td>" + C.esc(r.freteiro || "") + "</td><td>" + C.dataBr(r.periodo_ini) + " a " + C.dataBr(r.periodo_fim) + "</td><td>" + (r.enviado_em ? new Date(r.enviado_em).toLocaleString("pt-BR") : "—") + '</td><td class="num">' + C.brl(r.total) + "</td></tr>").join("") +
      "</tbody></table><p class=\"fe-div-nota\">Viram conta a pagar (no fechamento) quando a Logística decidir todas as divergências do relatório.</p></section>" : "";
    return '<div class="fe-div-sub" role="tablist"><button type="button" role="tab" class="' + (aba === "abertas" ? "ativa" : "") + '" data-fe-div="abertas">Aguardando decisão (' + d.abertas.length + ')</button><button type="button" role="tab" class="' + (aba === "resolvidas" ? "ativa" : "") + '" data-fe-div="resolvidas">Decididas · 30 dias (' + d.resolvidas.length + ")</button></div>" +
      '<p class="fe-div-nota">Quem decide é o supervisor da Logística (Painel Logístico › Divergências). Aqui aparecem as duas justificativas: a do parceiro (enviada pelo app) e a do supervisor.</p>' + rel +
      (lista.length && window.DivergenciasTabela ? window.DivergenciasTabela.html(lista, { resolvidas: aba === "resolvidas" }) : '<div class="fin-vazio">' + (aba === "abertas" ? "Nenhuma divergência aguardando decisão." : "Nenhuma divergência decidida nos últimos 30 dias.") + "</div>");
  }
  async function pintarDivergencias() {
    const el = $("feMain");
    el.innerHTML = await divHtml(divDe((x) => x.origem === "uber"));
    el.querySelectorAll("[data-fe-div]").forEach((b) => b.addEventListener("click", () => { T.divAba = b.dataset.feDiv; pintarDivergencias(); }));
  }
  // tempo real: com divergências na tela, relê a cada 30 s
  setInterval(async () => {
    if (!C || document.hidden || !$("feMain") || document.querySelector("dialog[open]")) return;
    if (T.forn !== "__div" && T.abaForn && T.abaForn !== "aguardando") return;
    if (T.busy || T.formDirty || document.querySelector("#feRodape input:focus,#feRodape select:focus")) return;
    try { T.div = await C.rpc("divergencias_acompanhar", { p_empresa: C.S.emp, p_origens: ["frete", "uber"] }); await render(C); } catch (_) {}
  }, 30000);

  // Fretes e contas primeiro, Pagos por último; o período é fechado pela ação do próprio parceiro.
  const podeEditarFechamento = () => window.EasyLocPermissions?.hasPermission?.('financeiro.contas_pagar.editar') === true;
  function previaFechamento(forn,mov){
    const contas=(mov||[]).filter(x=>x.titulo_id&&x.situacao==='conta_fechamento');
    return {fechamento:{id:null,referencia:referenciaNova(forn),status:'em_conferencia',fornecedor:forn.nome,fornecedor_id:forn.id,forma_padrao:forn.forma_padrao,condicao_padrao:forn.condicao_padrao},linhas:contas.map(x=>({id:x.titulo_id,titulo_id:x.titulo_id,valor:x.valor_final,nosso_valor:x.valor_final,situacao:'conferida'})),compras:[],parcelas:[]};
  }
  async function garantirFechamento(f){
    if(f.id)return f.id;
    const forn=T.fornecedorAtual;if(!forn)throw Error('Selecione o parceiro novamente.');
    f.id=await C.rpc('fin_fechamento_preparar',{p_empresa:C.S.emp,p_fornecedor:forn.id,p_referencia:f.referencia});T.fech=f.id;return f.id;
  }
  async function importarCobranca(arquivo,forn){
    await window.FinanceiroImportarCobranca.abrir({C,forn,arquivo,referencia:referenciaNova(forn),concluido:async()=>{T.fech=null;T.abaForn='aguardando';zerar();await C.carregar();await render(C);}});
  }
  const podeResolverDivergencia = () => window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.editar') === true;
  function acoesDivergencia(x) {
    const d=x.caso, id=d?.referencia||d?.registro?.id;
    return d&&!d.resolvida&&id&&podeResolverDivergencia() ? '<div class="fe-div-acoes">'+[['aceitar','Aceitar valor'],['corrigir','Corrigir valor'],['recusar','Recusar']].map(([acao,nome])=>'<button type="button" class="fin-btn peq claro" data-fe-resolver="'+C.esc(id)+'" data-acao="'+acao+'">'+nome+'</button>').join('')+'</div>' : '';
  }
  function justificativasInline(x,lado) {
    const d=x.caso, r=d?.registro||{};
    if(!d&&!x.frete_lancamento_id&&x.tipo!=='frete'&&x.tipo_servico!=='frete')return '';
    const valoresIguais=x.valor_sistema!=null&&x.valor_cobrado!=null&&Math.abs(Number(x.valor_sistema)-Number(x.valor_cobrado))<=0.009;
    const divergenciaPendente=d?!d.resolvida:x.situacao==='divergencia'||!!x.divergencia;
    if(valoresIguais&&!divergenciaPendente)return '';
    const explicacao=String(d?.explicacao||x.explicacao||r.explicacao||'').trim();
    const motivo=String(d?.motivo||x.decisao_motivo||r.decisao_motivo||'').trim();
    const supervisor=d?.tratado_por||x.decisao_por||r.decisao_por;
    const em=d?.tratado_em||x.decisao_em||r.decisao_em;
    const freteiro='<div class="dvt-lado '+(explicacao?'is-parceiro':'is-vazio')+'" data-fe-justificativa="freteiro"><b>Justificativa do freteiro</b><p>'+C.esc(explicacao||'Ainda não informada.')+'</p></div>';
    const decisao='<div class="dvt-lado '+(motivo?'is-supervisor':'is-vazio')+'" data-fe-justificativa="supervisor"><b>Justificativa do supervisor</b>'+(supervisor||em?'<small>'+C.esc([supervisor,em?new Date(em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):''].filter(Boolean).join(' · '))+'</small>':'')+'<p>'+C.esc(motivo||'Ainda não registrada.')+'</p></div>';
    return '<div class="fe-mov-div"><div class="dvt-lados">'+(lado==='freteiro'?freteiro:lado==='supervisor'?decisao:freteiro+decisao)+'</div></div>';
  }
  function resolverDivergencia(item,acao) {
    if(!item||!podeResolverDivergencia()||!['aceitar','corrigir','recusar'].includes(acao))return;
    const empresa=C.S.emp, id=item.referencia||item.registro?.id;
    if(!id)return;
    const dialog=document.createElement('dialog');dialog.className='fe-div-dialogo';let salvando=false;
    const titulo={aceitar:'Aceitar valor do frete',corrigir:'Corrigir valor do frete',recusar:'Recusar frete'}[acao];
    dialog.innerHTML='<form><h2>'+titulo+'</h2><p>'+C.esc(item.titulo||'Divergência de frete')+'</p>'+(acao==='corrigir'?'<label>Valor correto (R$)<input type="number" name="valor" min="0.01" step="0.01" required></label>':'')+'<label>Motivo da decisão<textarea name="motivo" rows="4" minlength="3" maxlength="2000" required></textarea></label><p class="fin-erro" role="alert" hidden></p><footer><button type="button" class="fin-btn claro" data-cancelar>Cancelar</button><button type="submit" class="fin-btn">Confirmar decisão</button></footer></form>';
    document.body.append(dialog);dialog.querySelector('[data-cancelar]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.oncancel=e=>{if(salvando)e.preventDefault();};
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();if(salvando)return;
      const motivo=dialog.querySelector('[name=motivo]').value.trim(),valor=acao==='corrigir'?num(dialog.querySelector('[name=valor]').value):null,erro=dialog.querySelector('[role=alert]');
      if(motivo.length<3||acao==='corrigir'&&!(valor>0)){erro.textContent='Informe o motivo e um valor válido.';erro.hidden=false;return;}
      salvando=true;erro.hidden=true;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
      try{await C.rpc('frete_div_resolver',{p_empresa:empresa,p_id:id,p_acao:acao,p_valor:valor,p_motivo:motivo});}
      catch(ex){erro.textContent=ex.message;erro.hidden=false;salvando=false;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);return;}
      dialog.close();
      try{await C.carregar();await render(C);}
      catch(ex){C.avisar('Decisão salva. Não foi possível atualizar a tela: '+ex.message,'Fechamentos','aviso');}
    };
    dialog.showModal();dialog.querySelector('input,textarea').focus();
  }
  async function pintarFornecedor(forn) {
    T.formDirty=false;
    const el = $("feMain");
    const pedidoTela = T.pedidoTela = (T.pedidoTela || 0) + 1;
    let mov = { aguardando: [], pagos: [] };
    try { mov = (await C.rpc("fin_parceiro_movimentos", { p_empresa: C.S.emp, p_fornecedor: forn.id })) || mov; }
    catch (e) {
      if (pedidoTela !== T.pedidoTela || T.forn !== forn.id) return;
      el.innerHTML = '<section class="fin-bloco"><p role="alert">Não foi possível carregar os lançamentos: ' + C.esc(e.message) + '</p><button type="button" class="fin-btn claro" data-fe-tentar>Tentar novamente</button></section>';
      el.querySelector('[data-fe-tentar]').onclick = () => pintarFornecedor(forn); return;
    }
    if (pedidoTela !== T.pedidoTela || T.forn !== forn.id) return;
    const dForn = divDe((x) => x.fornecedor_id === forn.id);
    if (T.abaForn === 'divergencias' || T.abaForn === 'fechamentos') T.abaForn = 'aguardando';
    const aba = T.abaForn || "aguardando";
    const porId = new Map([...dForn.resolvidas.map(d=>({...d,resolvida:true})), ...dForn.abertas].map(d=>[d.referencia||d.registro?.id,d]).filter(([id])=>!!id));
    const movimentos = mov.aguardando.map(x=>({...x,caso:porId.get(x.frete_lancamento_id)}));
    const presentes = new Set(movimentos.map(x=>x.frete_lancamento_id).filter(Boolean));
    // Uma divergência aberta nunca some por estar ausente da projeção de movimentos.
    dForn.abertas.filter(d=>!presentes.has(d.referencia||d.registro?.id)).forEach(d=>{
      const r=d.registro||{},pedido=window.DivergenciasTabela?.pedidoDe(d);
      movimentos.push({tipo:'frete',frete_lancamento_id:d.referencia||r.id,pedido,cliente:window.DivergenciasTabela?.clienteDe(d),data:d.data,hora:d.hora,
        local:d.local||r.destino,caminhao:r.caminhao,direcao:d.direcao||r.direcao||r.sistema?.direcao,avulso_id:r.avulso_id,avulso:r.avulso?.motivo,valor_sistema:d.valor_previsto,valor_cobrado:d.valor_informado,divergencia:r.divergencia,
        fora_sistema:r.divergencia==='sem_frete',situacao:'divergencia',caso:d});
    });
    const rotulo = movimentos.some((x) => x.tipo === 'frete' || x.tipo === 'transportadora' || x.tipo_servico === 'frete') ? 'Fretes e contas' : 'Contas e serviços';
    const abas = '<div class="fe-parceiro-barra"><div class="fe-abas-forn" role="tablist" aria-label="Registros do parceiro">' + [
      ['aguardando', rotulo, movimentos.length],
      ['pagos', 'Pagos', mov.pagos.length]
    ].map(([chave, nome, quantidade]) => '<button type="button" role="tab" aria-selected="' + (aba === chave) + '" class="' + (aba === chave ? 'ativa' : '') + '" data-fe-aba="' + chave + '">' + nome + '<span>' + quantidade + '</span></button>').join('') + '</div>' + (aba === 'aguardando' && podeEditarFechamento() ? '<div class="fe-periodo-acoes"><button type="button" class="fin-btn" data-fe-importar>Importar cobrança</button><input type="file" data-fe-importacao accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.pdf" hidden></div>' : '') + '</div>';
    const ligar = () => {
      el.querySelectorAll("[data-fe-aba]").forEach((b) => b.addEventListener("click", () => { T.abaForn = b.dataset.feAba; T.fech=T.abaForn==='aguardando'?forn.fechamentos.find(f=>f.status==='em_conferencia')?.id||null:null;T.periodo = null; pintarFornecedor(forn); }));
      el.querySelector('[data-fe-importar]')?.addEventListener('click',()=>el.querySelector('[data-fe-importacao]').click());
      el.querySelector('[data-fe-importacao]')?.addEventListener('change',e=>{const arquivo=e.target.files?.[0];e.target.value='';if(arquivo)importarCobranca(arquivo,forn);});
    };
    if (aba === "pagos") {
      el.innerHTML = abas + (mov.pagos.length ? '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela fe-mov"><thead><tr><th>Pago em</th><th>Documento</th><th>Descrição</th><th>Vencimento</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>' +
        mov.pagos.map((x) => "<tr><td>" + C.dataBr(x.pago_em) + "</td><td>" + C.esc(x.documento || "—") + "</td><td>" + "<span>" + C.esc(x.descricao || "") + "</span>" + justificativasInline(x) + "</td><td>" + C.dataBr(x.vencimento) + "</td><td>" + C.esc(x.forma || "—") + '</td><td class="num">' + C.brl(x.pago || x.valor) + "</td></tr>").join("") +
        '</tbody><tfoot><tr><td colspan="5"><b>Total pago</b></td><td class="num"><b>' + C.brl(mov.pagos.reduce((t, x) => t + Number(x.pago || x.valor || 0), 0)) + "</b></td></tr></tfoot></table></div></section>"
        : '<section class="fin-bloco"><div class="fin-vazio">Nada pago a este parceiro ainda.</div></section>');
      ligar();
      el.insertAdjacentHTML('beforeend','<div id="feHistorico"></div>');await pintarHistoricoFornecedor($('feHistorico'),forn);return;
    }
    if (dForn.abertas.length || dForn.resolvidas.length) await window.DivergenciasTabela?.lerFotos(C.S.emp,[...dForn.abertas,...dForn.resolvidas]);
    if (pedidoTela !== T.pedidoTela || T.forn !== forn.id) return;
    movimentos.forEach(x=>{if(!x.cliente_foto&&x.pedido)x.cliente_foto=window.DivergenciasTabela?.fotoPedido?.(x.pedido);});
    const iniciais = (n) => String(n || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
    const fotoCli = (x) => '<span class="fe-cli-foto">' + (x.cliente_foto ? '<img src="' + C.esc(x.cliente_foto) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "<b>" + C.esc(iniciais(x.cliente)) + "</b></span>";
    const fotoCaminhao = (k) => k.foto_url?'<img class="fe-caminhao-foto" src="'+C.esc(k.foto_url)+'" alt="Foto do caminhão '+C.esc(k.nome||'')+'" loading="lazy" onerror="this.remove()">':'<span class="fe-caminhao-miniatura" data-fe-foto-exemplo title="Foto ilustrativa para visualizar o layout"><img class="fe-caminhao-foto" src="../../assets/financeiro/caminhao-exemplo.png" alt="Foto ilustrativa de caminhão" loading="lazy" onerror="this.parentElement.remove()"><span>Ilustrativa</span></span>';
    const caminhaoHtml = (x) => {
      const veiculos=Array.isArray(x.caminhoes)?x.caminhoes:[];
      if(!veiculos.length)return x.caminhao?'<div class="fe-caminhao">'+fotoCaminhao({})+'<span class="fe-cam">'+C.esc(x.caminhao)+'</span></div>':'<span class="fe-tr">—</span>';
      return '<div class="fe-caminhoes">'+veiculos.map(k=>'<div class="fe-caminhao">'+fotoCaminhao({...k,nome:k.nome||x.caminhao})+'<span class="fe-cam">'+C.esc(k.nome||x.caminhao||'Caminhão')+'</span></div>').join('')+'</div>';
    };
    // Agrupado por pedido / cliente, como em Logística › Fretes anunciados (22/11).
    const cobradoDe = (x) => (x.valor_cobrado != null && x.divergencia !== "nao_lancado" ? Number(x.valor_cobrado) : null);
    const finalDe = (x) => {
      if(x.caso&&!x.caso.resolvida)return null;
      const valor=x.valor_final??x.caso?.registro?.valor_final;
      if(valor!=null)return Number(valor);
      return x.tipo==='conta'?Number(x.aberto??x.valor_cobrado??0):null;
    };
    const statusMov = (x) => {
      const final=finalDe(x),cobrado=cobradoDe(x);
      let estado='pendente',texto='Pendente',detalhe='Aguardando lançamento ou conferência.';
      if((x.tipo==='frete'||x.tipo_servico==='frete')&&!x.pedido&&!x.avulso_id&&!x.solicitacao_interna){
        estado='divergente';texto='Divergente';detalhe='Frete antigo aguardando vínculo com pedido ou solicitação interna na Logística.';
      }else if(x.caso&&!x.caso.resolvida||x.situacao==='divergencia'){
        estado='divergente';texto='Divergente';detalhe='Divergência aguardando decisão.';
      }else if(x.caso?.registro?.situacao==='recusado'||final===0&&cobrado>0){
        estado='divergente';texto='Divergente';detalhe='Frete recusado na conferência.';
      }else if(final!=null){
        estado='conforme';texto='Conforme';detalhe='Valor conferido para pagamento.';
      }else if(x.fora_sistema||x.divergencia||x.valor_sistema!=null&&cobrado!=null&&Math.abs(Number(x.valor_sistema)-cobrado)>0.009){
        estado='divergente';texto='Divergente';detalhe=x.fora_sistema?'Frete lançado sem correspondência no sistema.':'Cobrança diferente do previsto no sistema.';
      }
      return '<span class="fe-status is-'+estado+'" title="'+C.esc(detalhe)+'">'+texto+'</span>';
    };
    const linhaMov = (x) => "<tr><td>" + C.dataBr(x.data) + (x.hora ? '<small class="fe-hora">' + C.esc(x.hora) + "</small>" : "") +
        '</td><td class="fe-status-col">'+statusMov(x)+
        '</td><td class="fe-direcao">' + ({entrega:'Ida',coleta:'Volta'}[x.direcao]||'<span class="fe-tr">—</span>') +
        "</td><td>" + caminhaoHtml(x) +
        '</td><td class="num fe-valor-justificado">' + (x.valor_sistema != null ? '<span class="fe-val fe-val-sis">' + C.brl(x.valor_sistema) + "</span>" : '<span class="fe-tr">—</span>') + justificativasInline(x,'supervisor') +
        '</td><td class="num fe-valor-justificado">' + (cobradoDe(x) != null ? '<span class="fe-val fe-val-cob">' + C.brl(cobradoDe(x)) + "</span>" : '<span class="fe-tr">—</span>') + justificativasInline(x,'freteiro') +
        '</td><td class="num fe-final">' + (finalDe(x)!=null?'<span class="fe-val fe-val-final">'+C.brl(finalDe(x))+'</span>':'<span class="fe-tr">A definir</span>') + acoesDivergencia(x) + "</td></tr>";
    const grupos = [], porChave = {};
    movimentos.forEach((x) => {
      const interna=!!(x.avulso_id||x.solicitacao_interna);
      const tipo = interna ? 'interna' : !x.pedido&&(x.tipo==='frete'||x.tipo_servico==='frete') ? 'pendente' : x.tipo === 'conta' ? 'conta' : 'sem';
      const k = JSON.stringify(interna?['interna',x.avulso_id||x.avulso]:x.pedido ? ['pedido', x.pedido] : x.cliente ? ['cliente', x.cliente, tipo] : [tipo]);
      if (!porChave[k]) { porChave[k] = { k, tipo, itens: [], x }; grupos.push(porChave[k]); }
      porChave[k].itens.push(x);
    });
    const NOMES = { interna: ["Solicitação interna", "Frete autorizado pelo supervisor na Logística"], conta: ["Contas a pagar", "Já lançadas, ainda não pagas"], pendente: ["Vínculo pendente", "Fretes antigos aguardando vínculo com pedido ou solicitação interna na Logística"], sem: ["Sem pedido", ""] };
    const grupoMov = (g) => {
      const x = g.x, nm = NOMES[g.tipo];
      const cab = '<header class="pla-cab">' + (x.pedido ? '<span class="pla-pedido fe-pla-ped">' + C.esc(x.pedido) + "</span>" : '<span class="pla-pedido is-sem">' + (g.tipo === "conta" ? "Contas" : g.tipo === "interna" ? "Solicitação interna" : g.tipo === "pendente" ? "Vínculo pendente" : "Sem pedido") + "</span>") +
        (x.cliente ? fotoCli(x).replace("fe-cli-foto", "fe-cli-foto fe-cli-foto-g") : "") +
        '<div class="pla-cli"><strong>' + C.esc(x.cliente || (x.pedido ? 'Sem cliente' : g.tipo==='interna' ? x.avulso||'Frete interno' : nm[0])) + "</strong><small>" + C.esc(x.pedido ? x.local || "" : nm[1]) + "</small></div></header>";
      return '<section class="pla-grupo">' + cab + '<div class="pla-tabela-caixa"><table class="pla-tabela fe-mov"><colgroup><col style="width:14%"><col style="width:10%"><col style="width:8%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:14%"></colgroup><thead><tr><th>Data e horário</th><th>Status</th><th>Ida/Volta</th><th>Caminhão</th><th class="pla-num">Valor do sistema</th><th class="pla-num">Cobrado</th><th class="pla-num fe-final">Valor final</th></tr></thead><tbody>' +
        g.itens.map(linhaMov).join("") + "</tbody></table></div></section>";
    };
    const tabMov = movimentos.length ? '<div class="fe-mov-grupos">' + grupos.map(grupoMov).join("") + "</div>" : '<section class="fin-bloco"><div class="fin-vazio">Nenhum frete ou conta pendente deste parceiro.</div></section>';
    const historico = dForn.resolvidas.filter(d=>!presentes.has(d.referencia||d.registro?.id));
    el.innerHTML = abas + (T.divErro?'<p role="alert">Não foi possível consultar as divergências: '+C.esc(T.divErro)+' <button type="button" class="fin-btn peq claro" data-fe-div-atualizar>Tentar novamente</button></p>':'') + tabMov + (historico.length&&window.DivergenciasTabela ? '<details class="fin-bloco fe-div-historico"><summary>Divergências decididas · últimos 30 dias ('+historico.length+')</summary>'+window.DivergenciasTabela.html(historico,{resolvidas:true})+'</details>' : ''); ligar();
    el.insertAdjacentHTML('beforeend','<div id="feRodape"></div>');
    await pintarFechamento($('feRodape'),{rodape:true,forn,mov:movimentos});
    $('feRodape')?.addEventListener('input',()=>{T.formDirty=true;});
    $('feRodape')?.addEventListener('click',e=>{if(e.target.closest('[data-fe-addp],[data-fe-delp],[data-fe-gerar]'))T.formDirty=true;});
    el.querySelector('[data-fe-div-atualizar]')?.addEventListener('click',()=>render(C));
    el.querySelectorAll('[data-fe-resolver]').forEach(b=>b.onclick=()=>resolverDivergencia(dForn.abertas.find(d=>(d.referencia||d.registro?.id)===b.dataset.feResolver),b.dataset.acao));
  }

  async function pintarHistoricoFornecedor(el, forn) {
    T.fornecedorAtual=forn;
    const somenteHistorico = T.abaForn === 'pagos';
    const hist = forn.fechamentos.filter(x=>somenteHistorico?x.status!=='em_conferencia':x.status==='em_conferencia');
    if (!hist.some(x=>x.id===T.fech)) T.fech = somenteHistorico ? null : hist[0]?.id || null;
    const temAberto = forn.fechamentos.some((x) => x.status === "em_conferencia");
    el.innerHTML = '<div class="bk-cab fe-cab"><div class="cc-fats fe-fats" aria-label="Fechamentos de ' + C.esc(forn.nome) + '">' +
      hist.slice().reverse().map((x) => '<button type="button" class="cc-fat' + (x.id === T.fech ? " ativa" : "") + '" aria-pressed="' + (x.id === T.fech) + '" data-fe-fech="' + x.id + '"><b>' + C.esc(x.referencia) + "</b>" +
        (x.status === "unificado" ? "<span>" + C.brl(x.total) + "</span>" : "") + '<span class="fin-status ' + (x.status === "unificado" ? (Number(x.aberto) <= 0.005 ? "pago" : "parcial") : "aberto") + '">' +
        (x.status === "unificado" ? (Number(x.aberto) <= 0.005 ? "Pago" : "Unificado") : "Conferindo") + "</span></button>").join("") + "</div>" +
      '<span class="fin-esp"></span>' + (temAberto || somenteHistorico ? "" : '<button type="button" class="fin-btn" data-fe-novo>+ Novo fechamento</button>') + "</div>" +
      '<div id="feFech"></div>';
    el.querySelectorAll("[data-fe-fech]").forEach((b) => b.addEventListener("click", () => { T.fech = b.dataset.feFech; zerar(); pintarFornecedor(forn); }));
    el.querySelector("[data-fe-novo]")?.addEventListener("click", async () => {
      try { T.fech = await C.rpc("fin_fechamento_criar", { p_empresa: C.S.emp, p_fornecedor: forn.id, p_referencia: referenciaNova(forn) }); await render(C); }
      catch (e) { C.avisar(e.message, "Fechamentos", "erro"); }
    });
    const alvo = $("feFech");
    if (!T.fech) {
      if(somenteHistorico){alvo.innerHTML='<section class="fin-bloco"><div class="fin-vazio">'+(hist.length?'Selecione um fechamento para consultar a nota fiscal, as parcelas e os pagamentos.':'Nenhum fechamento concluído deste parceiro.')+'</div></section>';return;}
      alvo.innerHTML = '<section class="fin-bloco"><div class="fin-vazio">' + (Number(forn.aguardando_valor) > 0 ? C.brl(forn.aguardando_valor) + " em " + forn.aguardando_pedidos + " compra(s) aguardando o fechamento. Quando chegar a cobrança do parceiro, clique em <b>+ Novo fechamento</b>." : "Nada aguardando fechamento deste parceiro.") + "</div></section>";
      return;
    }
    await pintarFechamento(alvo);
  }

  // (2026-11-13) Fechamento de parceiros no MESMO formato da conciliação do banco e da fatura do cartão: faixa "Para conferir" com
  // filtros (Prontas / Confira / Sem sugestão), área de envio, linhas por dia com a sugestão (tipo + confiança + resumo + motivo),
  // caixinhas + "Confirmar selecionadas", Alterar/Escolher abre o editor abaixo da linha, "Já reconhecidas" e as nossas compras que
  // não vieram. No fim: resumo, nota e "Unificar no contas a pagar" com forma e quantidade de parcelas.
  async function pintarFechamento(el,opcoes={}) {
    let d;
    const id = T.fech;
    try { d = id ? await C.rpc("fin_fechamento_detalhe", { p_empresa: C.S.emp, p_id: id }) : previaFechamento(opcoes.forn,opcoes.mov); }
    catch (e) { el.innerHTML = '<div class="fin-vazio">' + C.esc(e.message) + "</div>"; return; }
    if (T.fech !== id || !el.isConnected || !opcoes.rodape && T.abaForn !== 'pagos') return;
    T.det = d;T.fornecedorAtual=opcoes.forn||T.fornecedorAtual;
    const f = d.fechamento, linhas = d.linhas || [], compras = d.compras || [];
    const conf = f.status === "em_conferencia";
    const somaL = (st) => r2(linhas.filter((l) => st.includes(l.situacao)).reduce((s, l) => s + Number(l.valor), 0));
    const cobrado = r2(linhas.reduce((s, l) => s + Number(l.valor), 0));
    const conferido = r2(linhas.filter((l) => ["conferida", "ajustada", "lancada"].includes(l.situacao)).reduce((s, l) => s + Number(l.situacao === "conferida" ? l.nosso_valor ?? l.valor : l.valor), 0));
    const pend = linhas.filter((l) => ["pendente", "divergente"].includes(l.situacao));
    const fora = compras.filter((c) => !c.linha_id);
    const totalParc = r2((d.parcelas || []).reduce((s, p) => s + Number(p.valor), 0)), abertoParc = r2((d.parcelas || []).reduce((s, p) => s + Number(p.aberto), 0));
    const st = (rot, val, sub) => '<div class="fe-stat"><small>' + rot + "</small><b>" + val + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>";
    const nfHtml = '<section class="fin-bloco fe-nf"><h3>Nota fiscal do fechamento <small>pode anexar a qualquer momento</small></h3><div class="fin-form fe-nf-form">' +
      '<label>Número da NF<input name="nf_numero" value="' + C.esc(f.nf_numero || "") + '"></label><label>Arquivo (PDF ou foto)<input type="file" name="nf_arquivo" accept="application/pdf,image/*"></label>' +
      '<div class="fe-nf-acoes">' + (f.nf_arquivo_url ? '<button type="button" class="fin-btn peq claro" data-fe-nf-ver>Ver ' + C.esc(f.nf_arquivo_nome || "nota") + "</button>" : "") + '<button type="button" class="fin-btn peq" data-fe-nf>Salvar nota</button></div></div></section>';
    el.innerHTML = (opcoes.rodape ? (pend.length?'<section class="fin-bloco"><h3>Conferir cobrança importada</h3><div id="feFiltrosSlot"></div><div id="feConc"></div></section>':'') :
      '<div class="fe-strip cc-strip"><div class="cc-strip-filtros" id="feFiltrosSlot"></div>' +
        (!conf && C.verFechamentoNoPagar ? '<button type="button" class="fin-btn claro cc-ver-pagar" data-fe-ver-pagar title="Abrir o A pagar na linha deste fechamento">Ver no A pagar →</button>' : "") + "</div>" +
      (conf && !linhas.length ? '<section class="cl-envio"><label class="cl-drop" id="feDrop"><input type="file" id="feArquivo" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.ofx,.pdf" hidden><b>' + (linhas.length ? "Enviar a cobrança de novo" : "Arraste aqui a cobrança do parceiro") + "</b><span>" +
        (linhas.length ? "Último arquivo: " + C.esc(f.arquivo_nome || "") + " · " + linhas.length + " linha(s) · " : "ou clique para escolher · Excel, CSV, PDF… Cada linha é comparada com as nossas compras deste parceiro. ") +
        '<button type="button" class="fe-link" data-fe-addl>+ linha à mão</button></span></label><div class="cl-etapa" id="feEtapa" hidden></div><div id="feAddLinha"></div></section>' : "") +
      '<div id="feConc"></div>' +
      '<section class="fin-bloco cc-fim">' +
        (conf ? '<label class="fe-stat fe-strip-ref"><small>Referência</small><input id="feRef" value="' + C.esc(f.referencia) + '"></label>' : st("Fechamento", C.esc(f.referencia))) +
        st("Cobrado", C.brl(cobrado), linhas.length + " linha(s)") + st("Conferido", C.brl(conferido)) + st("Contestado", C.brl(somaL(["contestada"]))) +
        st("Fora da cobrança", C.brl(fora.reduce((s, c) => s + Number(c.valor), 0)), fora.length + " p/ o próximo") +
        (conf ? "" : st("Unificado", C.brl(totalParc), (d.parcelas || []).length + " parcela(s)" + (abertoParc > 0.005 ? " · em aberto " + C.brl(abertoParc) : " · pago"))) +
        '<span class="fin-esp"></span>' + (linhas.some((l) => l.situacao === "contestada") ? '<button type="button" class="fin-btn claro" data-fe-contest>Relatório da contestação</button>' : "") +
        (conf ? '<button type="button" class="fin-btn claro" data-fe-excluir>Excluir fechamento</button>' : d.pago ? "" : '<button type="button" class="fin-btn claro verm" data-fe-desfazer>Desfazer unificação</button>') + "</section>") +
      nfHtml +
      (conf ? '<section class="fin-bloco fe-unificar"><h3>Unificar no contas a pagar <small>total conferido ' + C.brl(conferido) + " · cada parcela vira uma linha no A pagar</small></h3>" +
        (pend.length ? '<div class="cl-aviso">Falta decidir ' + pend.length + " linha(s) da cobrança.</div>" : "") +
        '<div class="fin-form fe-pag-form"><label>Forma de pagamento<select id="feForma">' + FORMAS.map(([k, r]) => '<option value="' + k + '"' + ((f.forma_padrao || "boleto") === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></label>" +
        '<label>Quantidade de parcelas<input type="number" id="feQtd" min="1" max="24" step="1" value="' + qtdDaCondicao(f.condicao_padrao) + '"></label>' +
        '<label>1º vencimento<input type="date" id="feBase" value="' + somaDias(isoHoje(), primeiroPrazo(f.condicao_padrao)) + '"></label>' +
        '<label>Intervalo entre parcelas (dias)<input type="number" id="feIntervalo" min="1" max="120" step="1" value="30"></label>' +
        '<div class="fe-nf-acoes"><button type="button" class="fin-btn peq claro" data-fe-gerar>Gerar parcelas</button><button type="button" class="fin-btn peq claro" data-fe-addp>+ Parcela</button></div></div>' +
        (f.condicao_padrao ? '<p class="cl-dica">Condição do cadastro do parceiro: ' + C.esc(f.condicao_padrao) + "</p>" : "") +
        '<div class="fin-rolar"><table class="fin-tabela fe-parcelas"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th></th></tr></thead><tbody id="feParc"></tbody></table></div>' +
        '<div class="fe-rodape"><span id="feSoma"></span><span class="fin-esp"></span><button type="button" class="fin-btn verde" data-fe-unificar' + (pend.length || conferido <= 0 ? " disabled" : "") + ">Unificar no contas a pagar</button></div></section>"
      : '<section class="fin-bloco"><h3>Parcelas no contas a pagar <small>cada parcela é uma linha no A pagar; o débito no banco paga a parcela inteira</small></h3><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Forma</th><th class="num">Valor</th><th class="num">Em aberto</th></tr></thead><tbody>' +
        (d.parcelas || []).map((p) => "<tr><td>" + p.numero + "/" + d.parcelas.length + "</td><td>" + C.dataBr(p.vencimento) + "</td><td>" + C.esc((FORMAS.find((x) => x[0] === f.forma_pagamento) || [0, f.forma_pagamento || "—"])[1]) + '</td><td class="num">' + C.brl(p.valor) + '</td><td class="num">' + C.brl(p.aberto) + "</td></tr>").join("") + "</tbody></table></div></section>");
    const recarregar = async () => { await C.carregar(); await render(C); };
    if($("feConc"))renderConc($("feConc"), d, conf, recarregar);
    if(!podeEditarFechamento())el.querySelectorAll("input,select,button[data-fe-nf],button[data-fe-unificar],button[data-fe-gerar],button[data-fe-addp]").forEach(x=>x.disabled=true);
    ligarComum(el, f);
    ligarFechamento(el, f, conf, conferido, recarregar);
  }

  // "30/60/90" -> 3, "3x" -> 3, "28 dias" -> 1; 1º prazo em dias
  function qtdDaCondicao(cond) { const t = String(cond || "").toLowerCase(), n = (t.match(/\d+/g) || []).map(Number); if (!n.length || /vista/.test(t)) return 1; if (/(\d+)\s*x/.test(t) && n.length === 1) return Math.max(1, Math.min(24, n[0])); return Math.max(1, Math.min(24, n.length)); }
  function primeiroPrazo(cond) { const t = String(cond || "").toLowerCase(), n = (t.match(/\d+/g) || []).map(Number); if (!n.length || /vista/.test(t)) return 0; if (/(\d+)\s*x/.test(t) && n.length === 1) return 30; return n[0]; }

  const CONF = { alta: "Pronta", media: "Confira", baixa: "Palpite" };
  const TIPO = { ligar: ["t-baixar", "Compra"], ajustar: ["t-baixar", "Aceitar valor"], lancar: ["t-lancar", "Lançar"], contestar: ["t-transferencia", "Contestar"], ignorar: ["t-ignorar", "Ignorar"] };
  const catNome = (id) => { const c = (C.S.cats || []).find((x) => x.id === id); return c ? (c.codigo ? c.codigo + " " : "") + c.nome : ""; };
  const ccNome = (id) => (C.S.ccs || []).find((x) => x.id === id)?.nome || "";
  const compraRot = (c) => (c.numero ? PC(c.numero) : c.rotulo || "Conta avulsa");

  function renderConc(box, d, conf, recarregar) {
    T.sel = T.sel || new Set(); T.edit = T.edit || {}; T.filtro = T.filtro || "todas";
    const linhas = d.linhas || [], compras = d.compras || [];
    const pendentes = conf ? linhas.filter((l) => ["pendente", "divergente"].includes(l.situacao)) : [];
    const feitas = linhas.filter((l) => !pendentes.includes(l));
    const livres = compras.filter((c) => !c.linha_id);
    const chave = (c) => (c.po_id ? "po:" + c.po_id : "t:" + c.titulo_id);
    const compraDe = (k) => compras.find((c) => chave(c) === k) || null;
    // categoria mais usada nas compras deste parceiro (palpite para o que só eles têm)
    const freq = {}; compras.forEach((c) => { if (c.categoria_id) freq[c.categoria_id] = (freq[c.categoria_id] || 0) + 1; });
    const catComum = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || "";
    // sugestões automáticas (sem IA): mesmo número de pedido ou mesmo valor = pronta; valor parecido = palpite. Cada compra só uma vez.
    const auto = {}, usadas = new Set();
    pendentes.filter((l) => l.situacao === "divergente").forEach((l) => {
      auto[l.id] = { tipo: "ajustar", conf: "media", resumo: "Aceitar o valor deles · nosso " + C.brl(l.nosso_valor) + " → " + C.brl(l.valor), motivo: "Ligada a " + (l.po_numero ? PC(l.po_numero) : "uma conta nossa") + "; diferença de " + C.brl(Number(l.valor) - Number(l.nosso_valor)) + ". Se não concorda, conteste." };
    });
    const soPend = pendentes.filter((l) => l.situacao === "pendente");
    soPend.forEach((l) => { const txt = String((l.documento || "") + " " + (l.descricao || ""));
      const c = livres.find((x) => x.numero && !usadas.has(chave(x)) && new RegExp("\\b0*" + x.numero + "\\b").test(txt));
      if (c) { usadas.add(chave(c)); auto[l.id] = { tipo: "ligar", compra: chave(c), conf: "alta", resumo: "Compra · " + compraRot(c) + " · " + C.brl(c.valor), motivo: "O número do pedido aparece na cobrança." + (Math.abs(c.valor - l.valor) > 0.01 ? " Valor diferente: depois decida se aceita o valor deles." : "") }; } });
    soPend.filter((l) => !auto[l.id]).forEach((l) => { const c = livres.find((x) => !usadas.has(chave(x)) && Math.abs(Number(x.valor) - Number(l.valor)) < 0.01);
      if (c) { usadas.add(chave(c)); auto[l.id] = { tipo: "ligar", compra: chave(c), conf: "alta", resumo: "Compra · " + compraRot(c) + " · " + C.brl(c.valor), motivo: "Mesmo valor de uma compra nossa de " + C.dataBr(c.data) + "." }; } });
    soPend.filter((l) => !auto[l.id]).forEach((l) => {
      const c = livres.filter((x) => !usadas.has(chave(x)) && Number(x.valor) > 0 && Math.abs(Number(x.valor) - Number(l.valor)) / Number(x.valor) <= 0.2).sort((a, b) => Math.abs(a.valor - l.valor) - Math.abs(b.valor - l.valor))[0];
      if (c) { usadas.add(chave(c)); auto[l.id] = { tipo: "ligar", compra: chave(c), conf: "baixa", resumo: "Compra · " + compraRot(c) + " · " + C.brl(c.valor), motivo: "Valor parecido (diferença de " + C.brl(Number(l.valor) - Number(c.valor)) + "). Ao confirmar, fica para aceitar o valor deles ou contestar." }; return; }
      if (catComum) auto[l.id] = { tipo: "lancar", categoria_id: catComum, descricao: l.descricao || "", conf: "baixa", resumo: "Lançar · " + catNome(catComum), motivo: "Não achei compra nossa; a categoria é a mais usada nas compras deste parceiro." };
    });
    const sug = (l) => T.edit[l.id] || auto[l.id] || null;
    const nivel = (l) => { const s = sug(l); return s ? s.conf || "baixa" : "sem"; };
    const dreCel = (cat, cc) => '<td class="bk-dre">' + (cat || cc ? "<div><b>" + C.esc(catNome(cat) || "Sem categoria") + "</b>" + (cc ? "<span>" + C.esc(ccNome(cc)) + "</span>" : "") + "</div>" : '<span class="bk-sem">—</span>') + "</td>";
    const dreDe = (l, s) => { if (s?.tipo === "lancar") return dreCel(s.categoria_id, s.centro_custo_id); if (s?.tipo === "ligar") { const c = compraDe(s.compra); return dreCel(c?.categoria_id, c?.centro_custo_id); } if (s?.tipo === "ignorar" || s?.tipo === "contestar") return dreCel(); return dreCel(l.categoria_id, l.centro_custo_id); };
    const nossaCel = (l, s) => { const c = s?.tipo === "ligar" ? compraDe(s.compra) : null;
      if (c) return "<td><b>" + compraRot(c) + "</b><small>" + C.brl(c.valor) + "</small></td>";
      if (l.po_id || l.titulo_id) return "<td><b>" + (l.po_numero ? PC(l.po_numero) : l.situacao === "lancada" ? "Lançada" : (l.rotulo || "Conta avulsa")) + "</b>" + (l.nosso_valor != null && l.situacao !== "lancada" ? "<small>nosso " + C.brl(l.situacao === "ajustada" ? l.valor_anterior : l.nosso_valor) + "</small>" : "") + "</td>";
      return '<td><span class="bk-sem">—</span></td>'; };
    const descTd = (l) => "<td>" + C.esc([l.documento, l.descricao].filter(Boolean).join(" · ") || "-") + "</td>";
    const dia = (data, n) => '<tr class="bk-dia"><td colspan="' + n + '">' + C.esc(data ? new Date(String(data).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "Sem data") + "</td></tr>";
    const ordenar = (xs) => xs.slice().sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")));
    const porDia = (lista, n, html) => { let ult = "§"; return ordenar(lista).map((l) => (String(l.data || "") !== ult ? ((ult = String(l.data || "")), dia(l.data, n)) : "") + html(l)).join(""); };
    const linhaPend = (l) => {
      const s = sug(l), n = nivel(l);
      return '<tr class="cl-n-' + n + '" data-fe-linha="' + l.id + '"><td class="cl-ck"><input type="checkbox" data-fe-sel="' + l.id + '"' + (T.sel.has(l.id) ? " checked" : "") + (s ? "" : " disabled") + ' aria-label="Selecionar"></td>' + descTd(l) +
        '<td class="cl-sug bk-conc">' + (s ? '<div><span class="cl-tipo ' + TIPO[s.tipo][0] + '">' + TIPO[s.tipo][1] + '</span> <span class="cl-conf c-' + n + '">' + (CONF[n] || "") + (T.edit[l.id] ? " · alterada por você" : "") + "</span></div>" +
          '<div class="cl-res">' + C.esc(s.resumo || "") + "</div>" + (s.motivo ? '<div class="cl-motivo">' + C.esc(s.motivo) + "</div>" : "") : '<div class="cl-res sem">Sem compra nossa</div>') + "</td>" +
        '<td class="num">' + C.brl(l.valor) + "</td>" + nossaCel(l, s) + dreDe(l, s) +
        '<td class="num"><button type="button" class="fin-btn peq claro" data-fe-alterar="' + l.id + '">' + (s ? "Alterar" : "Escolher") + "</button></td></tr>";
    };
    const ROTF = { conferida: "Compra · confere", ajustada: "Compra · valor ajustado ao deles", lancada: "Lançado no fechamento", contestada: "Contestada", ignorada: "Ignorada" };
    const linhaFeita = (l) => '<tr data-fe-linha="' + l.id + '">' + descTd(l) + '<td class="bk-conc">' + C.esc(ROTF[l.situacao] || l.situacao) + (l.motivo ? '<div class="cl-motivo">' + C.esc(l.motivo) + "</div>" : "") + "</td>" +
      '<td class="num">' + C.brl(l.valor) + "</td>" + nossaCel(l, null) + (["contestada", "ignorada"].includes(l.situacao) ? dreCel() : dreCel(l.categoria_id, l.centro_custo_id)) +
      "<td class=\"num\">" + (conf ? '<button type="button" class="fin-btn peq claro" data-fe-alterar="' + l.id + '">Alterar</button>' : "") + "</td></tr>";
    const cont = { todas: pendentes.length, alta: 0, media: 0, baixa: 0, sem: 0 }; pendentes.forEach((l) => { cont[nivel(l)]++; });
    const vis = pendentes.filter((l) => T.filtro === "todas" || nivel(l) === T.filtro || (T.filtro === "conferir" && ["media", "baixa"].includes(nivel(l))));
    const CAB = '<th>Descrição</th><th>Conciliação</th><th class="num">Valor</th><th>Nossa compra</th><th>DRE</th>';
    box.innerHTML =
      (conf ? '<section class="fin-bloco cl-lista">' + (vis.length ? '<div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr><th class="cl-ck"><input type="checkbox" data-fe-todas aria-label="Selecionar todas"' + (vis.every((l) => T.sel.has(l.id)) ? " checked" : "") + "></th>" + CAB + "<th></th></tr></thead><tbody>" +
        porDia(vis, 7, linhaPend) + "</tbody></table></div>" : '<div class="fin-vazio">' + (linhas.length ? (pendentes.length ? "Nada neste filtro." : "Tudo conferido neste fechamento.") : "Envie a cobrança do parceiro para conferir com as nossas compras.") + "</div>") + "</section>" +
        '<div class="cl-barra" id="feBarra" hidden></div>' : "") +
      (feitas.length ? '<details class="fin-bloco cl-feitas" open><summary>Já reconhecidas <small>' + feitas.length + '</small></summary><div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr>' + CAB + "<th></th></tr></thead><tbody>" +
        porDia(feitas, 6, linhaFeita) + "</tbody></table></div></details>" : "") +
      (livres.length && conf ? '<section class="fin-bloco"><h3>Nossas compras que ' + (linhas.length ? "não vieram nesta cobrança" : "esperam a cobrança do parceiro") + " <small>" + livres.length + " · continuam aguardando o próximo fechamento</small></h3>" +
        '<div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr><th>Data</th><th>Compra · itens</th><th class="num">Valor</th><th>Recibo</th><th>DRE</th></tr></thead><tbody>' +
        livres.map((c) => "<tr><td>" + C.dataBr(c.data) + "</td><td><b>" + compraRot(c) + "</b><small>" + C.esc(c.descricao || "") + (c.numero ? (c.recebido ? " · recebido" : " · ainda não recebido") : "") + '</small></td><td class="num">' + C.brl(c.valor) + "</td><td>" +
          (c.recibo_url ? '<a href="' + C.esc(c.recibo_url) + '" target="_blank" rel="noopener">ver recibo</a>' : '<span class="bk-sem">—</span>') + "</td>" + dreCel(c.categoria_id, c.centro_custo_id) + "</tr>").join("") + "</tbody></table></div></section>" : "");

    const slot = $("feFiltrosSlot");
    if (slot) slot.innerHTML = '<div class="cc-strip-tit"><b>' + (conf ? "Para conferir" : "Fechamento unificado") + "</b><span>" + (conf ? pendentes.length + " linha(s) da cobrança" : C.esc(d.fechamento.referencia)) + "</span></div>" +
      (conf ? '<div class="cl-filtros">' + [["todas", "Todas", cont.todas], ["alta", "Prontas", cont.alta], ["conferir", "Confira", cont.media + cont.baixa], ["sem", "Sem sugestão", cont.sem]]
        .map(([k, t2, n2]) => '<button type="button" data-fe-filtro="' + k + '" class="' + (T.filtro === k ? "ativa " : "") + "f-" + k + '">' + t2 + " <b>" + n2 + "</b></button>").join("") + "</div>" : "");
    if (!conf) return;
    const barra = () => {
      const el = $("feBarra"), sel = pendentes.filter((l) => T.sel.has(l.id) && sug(l));
      if (!sel.length) { el.hidden = true; el.innerHTML = ""; return; }
      el.hidden = false;
      el.innerHTML = "<span><b>" + sel.length + "</b> selecionada(s) · " + C.brl(sel.reduce((a, l) => a + Number(l.valor), 0)) + '</span><button type="button" class="fin-btn verde" data-fe-confirmar>Confirmar selecionadas</button>';
      el.querySelector("[data-fe-confirmar]").addEventListener("click", async (e) => {
        e.target.disabled = true; let ok = 0; const erros = [];
        for (const l of sel) {
          const s = sug(l);
          let p;
          if (s.tipo === "ligar") { const [tp, cid] = s.compra.split(":"); p = { tipo: "vincular", po_id: tp === "po" ? cid : "", titulo_id: tp === "t" ? cid : "" }; }
          else if (s.tipo === "lancar") p = { tipo: "lancar", descricao: s.descricao || l.descricao, categoria_id: s.categoria_id, centro_custo_id: s.centro_custo_id || "" };
          else if (s.tipo === "contestar") p = { tipo: "contestar", motivo: s.motivo_texto };
          else p = { tipo: s.tipo };
          try { await C.rpc("fin_fechamento_linha_acao", { p_empresa: C.S.emp, p_linha: l.id, p_acao: p }); ok++; T.sel.delete(l.id); delete T.edit[l.id]; }
          catch (err) { erros.push(([l.documento, l.descricao].filter(Boolean).join(" · ") || "") + ": " + err.message); }
        }
        if (erros.length) C.avisar(ok + " conferida(s). Não foi possível em " + erros.length + ":\n" + erros.slice(0, 6).join("\n"), "Fechamentos", "aviso");
        else C.avisar(ok + " linha(s) da cobrança conferida(s).", "Fechamentos", "sucesso");
        T.selIni = false; await recarregar();
      });
    };
    barra();
    if (!T.selIni) { pendentes.filter((l) => nivel(l) === "alta").forEach((l) => T.sel.add(l.id)); T.selIni = true; renderConc(box, d, conf, recarregar); return; }
    slot?.querySelectorAll("[data-fe-filtro]").forEach((b) => b.addEventListener("click", () => { T.filtro = b.dataset.feFiltro; renderConc(box, d, conf, recarregar); }));
    box.querySelectorAll("[data-fe-sel]").forEach((ck) => ck.addEventListener("change", () => { if (ck.checked) T.sel.add(ck.dataset.feSel); else T.sel.delete(ck.dataset.feSel); barra(); }));
    box.querySelector("[data-fe-todas]")?.addEventListener("change", (e) => { box.querySelectorAll("[data-fe-sel]:not(:disabled)").forEach((ck) => { ck.checked = e.target.checked; if (e.target.checked) T.sel.add(ck.dataset.feSel); else T.sel.delete(ck.dataset.feSel); }); barra(); });
    box.querySelectorAll("[data-fe-alterar]").forEach((b) => b.addEventListener("click", () => {
      const l = linhas.find((x) => x.id === b.dataset.feAlterar);
      if (pendentes.includes(l)) editorPend(b.closest("tr"), l, sug(l), { livres, compraDe, chave, rerender: () => renderConc(box, d, conf, recarregar) });
      else editorFeita(b.closest("tr"), l, recarregar);
    }));
  }

  // editor da linha para conferir (igual ao do banco/cartão): escolhe o tipo, ajusta e "Usar esta escolha"
  function editorPend(tr, l, atual, ctx) {
    document.querySelectorAll("tr.cl-inline-ed").forEach((x) => { x.previousElementSibling?.classList.remove("cl-editando"); x.remove(); });
    const div = l.situacao === "divergente";
    const tipos = div ? ["ajustar", "ligar", "contestar", "ignorar"] : ["ligar", "lancar", "contestar", "ignorar"];
    let tipo = atual && tipos.includes(atual.tipo) ? atual.tipo : tipos[0];
    const ROT = { ligar: div ? "Ligar a outra compra" : "Ligar a uma compra", ajustar: "Aceitar o valor deles", lancar: "Lançar (só eles têm)", contestar: "Contestar", ignorar: "Ignorar" };
    const optCat = (sel) => '<option value="">Escolha</option>' + (C.S.cats || []).filter((c) => c.tipo === "saida" && c.ativo !== false).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc((c.codigo ? c.codigo + " " : "") + c.nome) + "</option>").join("");
    const optCc = (sel) => '<option value="">Sem centro de custo</option>' + (C.S.ccs || []).filter((c) => c.ativo !== false).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc(c.nome) + "</option>").join("");
    const ed = document.createElement("tr"); ed.className = "cl-inline-ed";
    const corpoTipo = () => {
      if (tipo === "lancar") return '<div class="fin-form"><label class="inteiro">Descrição<input name="descricao" value="' + C.esc(atual?.descricao || l.descricao || "") + '"></label><label>Categoria (DRE)<select name="categoria_id">' + optCat(atual?.categoria_id) + '</select></label><label>Centro de custo<select name="centro_custo_id">' + optCc(atual?.centro_custo_id) + "</select></label></div>";
      if (tipo === "ligar") {
        const lista = ctx.livres.slice().sort((a, b) => Math.abs(a.valor - l.valor) - Math.abs(b.valor - l.valor));
        return '<div class="cc-escolha">' + (lista.length ? lista.map((c) => '<label class="cl-alt-t"><input type="radio" name="compra" value="' + ctx.chave(c) + '"' + (atual?.compra === ctx.chave(c) ? " checked" : "") + "><span><b>" + compraRot(c) + "</b><small>" + C.esc([C.dataBr(c.data), c.descricao].filter(Boolean).join(" · ")) + '</small></span><span class="num">' + C.brl(c.valor) + (Math.abs(c.valor - l.valor) < 0.01 ? ' <small class="cl-bate">✓ bate</small>' : "") + "</span></label>").join("") : '<div class="fin-vazio">Nenhuma compra deste parceiro aguardando.</div>') + "</div>";
      }
      if (tipo === "ajustar") return '<p class="cl-dica">O valor da nossa compra no contas a pagar muda de ' + C.brl(l.nosso_valor) + " para " + C.brl(l.valor) + " (fica registrado de quanto para quanto).</p>";
      if (tipo === "contestar") return '<div class="fin-form"><label class="inteiro">Motivo da contestação<input name="motivo" value="' + C.esc(atual?.motivo_texto || "") + '" placeholder="Ex.: não recebemos, valor diferente do combinado, item devolvido"></label></div><p class="cl-dica">A linha fica fora do total. Use "Relatório da contestação" para mandar ao parceiro.</p>';
      return '<p class="cl-dica">A linha sai da lista sem mexer em nenhuma conta.</p>';
    };
    const pintarEd = () => {
      ed.innerHTML = '<td colspan="' + tr.children.length + '"><div class="cl-inline-caixa"><div class="cl-alt-linha"><b>' + C.dataBr(l.data) + "</b> · " + C.esc([l.documento, l.descricao].filter(Boolean).join(" · ")) + " · <b>" + C.brl(l.valor) + "</b></div>" +
        (atual?.motivo && !T.edit[l.id] ? '<p class="cl-alt-motivo">' + C.esc(atual.motivo) + "</p>" : "") +
        '<div class="cl-alt-tipos">' + tipos.map((k) => '<button type="button" data-fe-tipo="' + k + '" class="' + (tipo === k ? "ativa" : "") + '">' + ROT[k] + "</button>").join("") + "</div>" + corpoTipo() +
        '<p class="cl-inline-erro" role="alert"></p><div class="cl-inline-acoes"><button type="button" class="fin-btn claro" data-x>Cancelar</button><button type="button" class="fin-btn" data-ok>Usar esta escolha</button></div></div></td>';
      ed.querySelectorAll("[data-fe-tipo]").forEach((b) => b.addEventListener("click", () => { tipo = b.dataset.feTipo; pintarEd(); }));
      ed.querySelector("[data-x]").addEventListener("click", () => { ed.remove(); tr.classList.remove("cl-editando"); });
      ed.querySelector("[data-ok]").addEventListener("click", () => {
        const er = ed.querySelector(".cl-inline-erro"), d = C.campos(ed);
        let s;
        if (tipo === "lancar") { if (!d.categoria_id) { er.textContent = "Escolha a categoria (é ela que entra na DRE)."; return; } s = { tipo, descricao: d.descricao, categoria_id: d.categoria_id, centro_custo_id: d.centro_custo_id, resumo: "Lançar · " + [catNome(d.categoria_id), ccNome(d.centro_custo_id), d.descricao].filter(Boolean).join(" · ") }; }
        else if (tipo === "ligar") { const k = ed.querySelector("[name=compra]:checked")?.value; if (!k) { er.textContent = "Escolha a compra."; return; } const c = ctx.compraDe(k); s = { tipo, compra: k, resumo: "Compra · " + compraRot(c) + " · " + C.brl(c.valor) }; }
        else if (tipo === "contestar") { if (!String(d.motivo || "").trim()) { er.textContent = "Informe o motivo."; return; } s = { tipo, motivo_texto: d.motivo.trim(), resumo: "Contestar · " + d.motivo.trim() }; }
        else if (tipo === "ajustar") s = { tipo, resumo: "Aceitar o valor deles · " + C.brl(l.valor) };
        else s = { tipo: "ignorar", resumo: "Ignorar" };
        T.edit[l.id] = { ...s, conf: "alta", motivo: "Escolhido por você." }; T.sel.add(l.id); ctx.rerender();
      });
    };
    pintarEd();
    tr.after(ed); tr.classList.add("cl-editando");
    ed.addEventListener("keydown", (e) => { if (e.key === "Escape") { ed.remove(); tr.classList.remove("cl-editando"); } });
    ed.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // linha já reconhecida: categoria/centro da compra e desfazer
  function editorFeita(tr, l, recarregar) {
    document.querySelectorAll("tr.cl-inline-ed").forEach((x) => { x.previousElementSibling?.classList.remove("cl-editando"); x.remove(); });
    const titulos = l.po_id ? (C.S.pagar || []).filter((x) => x.origem === "compra" && x.origem_id === l.po_id && x.status !== "cancelado") : l.titulo_id ? (C.S.pagar || []).filter((x) => x.id === l.titulo_id) : [];
    const temDre = titulos.length && !["contestada", "ignorada"].includes(l.situacao);
    const podeDesfazer = ["conferida", "contestada", "ignorada"].includes(l.situacao);
    const optCat = (sel) => '<option value="">Sem categoria</option>' + (C.S.cats || []).filter((c) => c.tipo === "saida" && (c.ativo !== false || c.id === sel)).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc((c.codigo ? c.codigo + " " : "") + c.nome) + "</option>").join("");
    const optCc = (sel) => '<option value="">Sem centro de custo</option>' + (C.S.ccs || []).filter((c) => c.ativo !== false || c.id === sel).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc(c.nome) + "</option>").join("");
    const ed = document.createElement("tr"); ed.className = "cl-inline-ed";
    ed.innerHTML = '<td colspan="' + tr.children.length + '"><div class="cl-inline-caixa">' +
      (temDre ? '<div class="fin-form"><label>Categoria (DRE)<select name="categoria_id">' + optCat(l.categoria_id) + '</select></label><label>Centro de custo<select name="centro_custo_id">' + optCc(l.centro_custo_id) + "</select></label></div>" +
        (titulos.length > 1 ? '<p class="cl-dica">Vale para as ' + titulos.length + " contas deste pedido.</p>" : "") : '<p class="cl-dica">' + (l.situacao === "lancada" ? "Linha lançada: para refazer, cancele a conta no contas a pagar." : l.situacao === "ajustada" ? "O valor já foi ajustado ao deles." : "Esta linha não mexeu em nenhuma conta.") + "</p>") +
      '<p class="cl-inline-erro" role="alert"></p><div class="cl-inline-acoes">' + (podeDesfazer ? '<button type="button" class="fin-btn claro" data-desfazer>Desfazer</button><span class="fin-esp"></span>' : "") +
      '<button type="button" class="fin-btn claro" data-x>Cancelar</button>' + (temDre ? '<button type="button" class="fin-btn" data-ok>Salvar</button>' : "") + "</div></div></td>";
    tr.after(ed); tr.classList.add("cl-editando");
    const fechar = () => { ed.remove(); tr.classList.remove("cl-editando"); };
    ed.querySelector("[data-x]").addEventListener("click", fechar);
    ed.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    ed.querySelector("[data-desfazer]")?.addEventListener("click", async () => {
      try { await C.rpc("fin_fechamento_linha_acao", { p_empresa: C.S.emp, p_linha: l.id, p_acao: { tipo: l.situacao === "conferida" ? "desvincular" : "reabrir" } }); T.selIni = false; await recarregar(); }
      catch (e) { ed.querySelector(".cl-inline-erro").textContent = e.message; }
    });
    ed.querySelector("[data-ok]")?.addEventListener("click", async () => {
      const d = C.campos(ed);
      try { for (const t of titulos) await C.rpc("fin_editar_titulo", { p_empresa: C.S.emp, p_tipo: "pagar", p_id: t.id, p_dados: { categoria_id: d.categoria_id || null, centro_custo_id: d.centro_custo_id || null } }); await recarregar(); }
      catch (e) { ed.querySelector(".cl-inline-erro").textContent = e.message; }
    });
  }

  function ligarComum(el, f) {
    el.querySelector("[data-fe-nf]")?.addEventListener("click", async (e) => {
      const sec = e.target.closest(".fe-nf"), numero = sec.querySelector("[name=nf_numero]").value.trim(), arq = sec.querySelector("[name=nf_arquivo]").files?.[0];
      e.target.disabled = true;
      try {
        await garantirFechamento(f);
        const dados = { nf_numero: numero };
        if (arq) {
          // bucket privado compras-documentos, pasta <empresa>/financeiro/fechamentos/… (abre por link assinado)
          const caminho = C.S.emp + "/financeiro/fechamentos/" + f.id + "/" + Date.now() + "-" + arq.name.replace(/[^\w.-]+/g, "_");
          const up = await C.S.sb.storage.from("compras-documentos").upload(caminho, arq, { contentType: arq.type || "application/octet-stream", upsert: false });
          if (up.error) throw new Error(up.error.message);
          dados.nf_arquivo_url = "compras-documentos:" + caminho; dados.nf_arquivo_nome = arq.name;
        }
        await C.rpc("fin_fechamento_salvar", { p_empresa: C.S.emp, p_id: f.id, p_dados: dados });
        C.avisar("Nota do fechamento salva.", "Fechamentos", "sucesso"); await C.carregar(); await render(C);
      } catch (err) { e.target.disabled = false; C.avisar(err.message, "Fechamentos", "erro"); }
    });
    el.querySelector("[data-fe-contest]")?.addEventListener("click", () => relatorioContestacao());
    el.querySelector("[data-fe-nf-ver]")?.addEventListener("click", async () => {
      const u = String(f.nf_arquivo_url || "");
      if (!u.startsWith("compras-documentos:")) return window.open(u, "_blank", "noopener");
      const r = await C.S.sb.storage.from("compras-documentos").createSignedUrl(u.slice("compras-documentos:".length), 600);
      if (r.error) return C.avisar(r.error.message, "Fechamentos", "erro");
      window.open(r.data.signedUrl, "_blank", "noopener");
    });
    el.querySelector("[data-fe-ver-pagar]")?.addEventListener("click", () => C.verFechamentoNoPagar(f.id));
    el.querySelector("[data-fe-desfazer]")?.addEventListener("click", async () => {
      if (!(await C.confirmar("Desfazer a unificação? As parcelas saem do contas a pagar e as compras voltam a aguardar o fechamento, como antes.", "Desfazer"))) return;
      try { await C.rpc("fin_fechamento_desfazer", { p_empresa: C.S.emp, p_id: f.id }); T.abaForn='aguardando'; await C.carregar(); await render(C); C.avisar("Unificação desfeita.", "Fechamentos", "sucesso"); }
      catch (e) { C.avisar(e.message, "Fechamentos", "erro"); }
    });
  }

  function ligarFechamento(el, f, conf, conferido, recarregar) {
    if (!conf) return;
    $("feRef")?.addEventListener("change", async (e) => { try { await C.rpc("fin_fechamento_salvar", { p_empresa: C.S.emp, p_id: f.id, p_dados: { referencia: e.target.value } }); await render(C); } catch (err) { C.avisar(err.message, "Fechamentos", "erro"); } });
    el.querySelector("[data-fe-excluir]")?.addEventListener("click", async () => {
      if (!(await C.confirmar("Excluir este fechamento? As compras continuam aguardando o próximo.", "Excluir"))) return;
      try { await C.rpc("fin_fechamento_excluir", { p_empresa: C.S.emp, p_id: f.id }); T.fech = null; await render(C); } catch (err) { C.avisar(err.message, "Fechamentos", "erro"); }
    });
    // arquivo da cobrança
    const inp = $("feArquivo"), drop = $("feDrop");
    if (inp) {
      inp.addEventListener("change", (e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) enviar(a, f, recarregar); });
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-sobre"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-sobre"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-sobre"); const a = e.dataTransfer?.files?.[0]; if (a) enviar(a, f, recarregar); });
    }
    // linha à mão (o botão fica dentro da área de envio: não abre o seletor de arquivo)
    el.querySelectorAll("[data-fe-addl]").forEach((b) => b.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const box = $("feAddLinha"); if (!box) return;
      box.innerHTML = '<div class="cl-inline-caixa"><div class="fin-form fe-addl-form"><label>Data<input type="date" name="data" value="' + isoHoje() + '"></label><label>Documento / recibo<input name="documento"></label><label>Descrição<input name="descricao"></label><label>Valor<input name="valor" inputmode="decimal" placeholder="0,00"></label></div>' +
        '<p class="cl-inline-erro" role="alert"></p><div class="cl-inline-acoes"><button type="button" class="fin-btn claro" data-x>Cancelar</button><button type="button" class="fin-btn" data-ok>Adicionar</button></div></div>';
      box.querySelector("[name=documento]").focus();
      box.querySelector("[data-x]").addEventListener("click", () => { box.innerHTML = ""; });
      box.querySelector("[data-ok]").addEventListener("click", async () => {
        const d = C.campos(box);
        try { await C.rpc("fin_fechamento_linha_add", { p_empresa: C.S.emp, p_id: f.id, p_dados: { ...d, valor: num(d.valor) } }); T.selIni = false; await recarregar(); }
        catch (err) { box.querySelector(".cl-inline-erro").textContent = err.message; }
      });
    }));
    // parcelas: forma + quantidade + 1º vencimento + intervalo -> tabela editável
    const tb = $("feParc"), soma = $("feSoma");
    const linhaP = (k, p) => "<tr><td>" + (k + 1) + '</td><td><input type="date" data-fe-v value="' + (p.vencimento || "") + '"></td><td class="num"><input inputmode="decimal" data-fe-val value="' + (p.valor != null ? String(Number(p.valor).toFixed(2)).replace(".", ",") : "") + '"></td><td><button type="button" class="fin-btn peq claro" data-fe-delp aria-label="Remover parcela">×</button></td></tr>';
    const ler = () => [...tb.querySelectorAll("tr")].map((tr) => ({ vencimento: tr.querySelector("[data-fe-v]").value, valor: num(tr.querySelector("[data-fe-val]").value) || 0 }));
    const atual = () => { const s = r2(ler().reduce((a, p) => a + p.valor, 0)); soma.innerHTML = "Soma das parcelas <b>" + C.brl(s) + "</b>" + (Math.abs(s - conferido) > 0.01 ? ' <span class="cc-falta">· precisa ser ' + C.brl(conferido) + "</span>" : ' <span class="cc-ok">✓</span>'); };
    const pintarP = (lista) => { tb.innerHTML = lista.map((p, k) => linhaP(k, p)).join(""); atual(); };
    const gerar = () => {
      const n = Math.max(1, Math.min(24, parseInt($("feQtd").value, 10) || 1)), base = $("feBase").value || isoHoje(), passo = Math.max(1, parseInt($("feIntervalo").value, 10) || 30);
      const parte = Math.floor((conferido / n) * 100) / 100;
      pintarP(Array.from({ length: n }, (_, k) => ({ vencimento: passo === 30 ? somaMeses(base, k) : somaDias(base, passo * k), valor: k === n - 1 ? r2(conferido - parte * (n - 1)) : parte })));
    };
    if (conferido > 0) gerar(); else pintarP([]);
    tb.addEventListener("input", atual);
    tb.addEventListener("click", (e) => { if (e.target.closest("[data-fe-delp]")) { e.target.closest("tr").remove(); pintarP(ler()); } });
    ["feQtd", "feBase", "feIntervalo"].forEach((id) => $(id).addEventListener("change", gerar));
    el.querySelector("[data-fe-gerar]").addEventListener("click", gerar);
    el.querySelector("[data-fe-addp]").addEventListener("click", () => { const l = ler(); l.push({ vencimento: "", valor: null }); pintarP(l); });
    el.querySelector("[data-fe-unificar]")?.addEventListener("click", async (e) => {
      const ps = ler();
      if (!ps.length || ps.some((p) => !p.vencimento || !(p.valor > 0))) return C.avisar("Revise as parcelas: vencimento e valor em todas.", "Fechamentos");
      const s = r2(ps.reduce((a, p) => a + p.valor, 0));
      if (Math.abs(s - conferido) > 0.01) return C.avisar("A soma das parcelas (" + C.brl(s) + ") precisa ser igual ao total conferido (" + C.brl(conferido) + ").", "Fechamentos");
      if (!(await C.confirmar("Unificar " + C.brl(conferido) + " em " + ps.length + " parcela(s) (" + $("feForma").selectedOptions[0].textContent + ") no contas a pagar? Cada parcela vira uma linha; clicando nela aparecem as compras que a compõem.", "Unificar"))) return;
      e.target.disabled = true;
      try { await garantirFechamento(f);await C.rpc("fin_fechamento_unificar", { p_empresa: C.S.emp, p_id: f.id, p_parcelas: ps, p_forma: $("feForma").value }); T.abaForn='pagos';T.fech=f.id; C.avisar("Fechamento unificado no contas a pagar.", "Fechamentos", "sucesso"); await recarregar(); }
      catch (err) { e.target.disabled = false; C.avisar(err.message, "Fechamentos", "erro"); }
    });
  }
  const somaMeses = (iso, n) => { const d = new Date(iso + "T12:00:00"), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(dia, fim)); return d.toISOString().slice(0, 10); };

  // arquivo da cobrança: a Clara lê (mesma leitura do extrato) e o banco compara com as nossas compras
  async function enviar(arquivo, f, recarregar) {
    if (T.busy) return;
    const et = $("feEtapa"), mostrar = (t) => { if (et) { et.hidden = !t; et.textContent = t || ""; } };
    T.busy = true;
    try {
      mostrar("Lendo a cobrança " + arquivo.name + "…");
      const conta = (C.S.contas.find((c) => c.ativo && c.tipo !== "caixa") || C.S.contas[0] || {}).id;
      const lido = await window.FinanceiroClara.lerArquivo(arquivo, conta);
      const linhas = (lido.linhas || []).filter((x) => Number(x.valor));
      if (!linhas.length) throw new Error("Não encontrei lançamentos nesse arquivo.");
      mostrar("Comparando " + linhas.length + " linha(s) com as nossas compras…");
      const r = await C.rpc("fin_fechamento_importar", { p_empresa: C.S.emp, p_id: f.id, p_arquivo: lido.arquivo || arquivo.name,
        p_linhas: linhas.map((x) => ({ data: x.data, documento: x.documento || "", descricao: [x.descricao, x.contraparte].filter(Boolean).join(" · "), valor: Math.abs(Number(x.valor)) })) });
      C.avisar(r.linhas + " linha(s) lidas; " + r.ligadas + " ligadas a compras nossas.", "Fechamentos", "sucesso");
      zerar();
      await recarregar();
    } catch (e) { console.error(e); C.avisar(e.message || String(e), "Fechamentos", "erro"); }
    finally { T.busy = false; mostrar(""); }
  }

  // A4 com as linhas contestadas (para mandar ao fornecedor)
  async function relatorioContestacao() {
    const f = T.det.fechamento, ls = (T.det.linhas || []).filter((l) => l.situacao === "contestada");
    let co = {}; try { const r = await C.S.sb.from("empresas").select("nome,razao_social,cnpj,logo_url").eq("id", C.S.emp).maybeSingle(); co = r.data || {}; co.nome_fantasia = co.nome; co.documento = co.cnpj; } catch (_) { /* sem logo */ }
    const tot = ls.reduce((s, l) => s + Number(l.valor), 0);
    const html = '<div class="rr-doc"><header class="rr-head"><div>' + (co.logo_url ? '<img src="' + C.esc(co.logo_url) + '" alt="">' : "") + '<div class="rr-head-company">' + C.esc([co.razao_social || co.nome_fantasia, co.documento].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="rr-head-id">Contestação de cobrança<strong>' + C.esc(f.referencia) + "</strong>Emitido em " + new Date().toLocaleString("pt-BR") + "</div></header>" +
      '<div class="rr-title"><div><span>Para: ' + C.esc(f.fornecedor || "") + "</span><h1>Itens contestados no fechamento " + C.esc(f.referencia) + "</h1></div></div>" +
      '<div class="rr-note">Os itens abaixo estão na cobrança do fechamento, mas não conferem com o nosso controle. Pedimos que revisem e nos enviem a cobrança corrigida.</div>' +
      '<div class="rr-section"><table><thead><tr><th style="width:14%">Data</th><th>Item da cobrança</th><th>Motivo</th><th class="num" style="width:16%">Valor</th></tr></thead><tbody>' +
      ls.map((l) => "<tr><td>" + C.dataBr(l.data) + "</td><td>" + C.esc([l.documento, l.descricao].filter(Boolean).join(" · ") || "-") + "</td><td>" + C.esc(l.motivo || "") + '</td><td class="num">' + C.brl(l.valor) + "</td></tr>").join("") +
      '</tbody><tfoot><tr><td colspan="3"><b>Total contestado</b></td><td class="num"><b>' + C.brl(tot) + "</b></td></tr></tfoot></table></div></div>";
    window.FinRelatorioA4.previa(html, "Contestação · " + f.referencia);
  }

  window.FinanceiroFechamentos = { render };
})();
