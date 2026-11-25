/* Painel Logístico (out/2026): confere e ajusta a escala automática de cada etapa do cronograma
   (responsável, equipe e caminhão). O servidor (api/_gas/projetos/cronograma/Escala.js) monta a
   escala pelos parâmetros, impede a mesma pessoa/caminhão em horários que se cruzam e grava nas
   colunas da etapa — o cronograma só mostra o resultado. */
(function () {
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const TIPO = { triagem: "Triagem", carregamento: "Carregamento", descarregamento: "Descarregamento", montagem: "Montagem", desmontagem: "Desmontagem" };
  const EQUIPE = { triagem: "Triagem", carregamento: "Carregamento", montagem: "Montagem", free: "Free" };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let inicio = window.PainelLogisticoDias?.inicio || segundaOuHoje(new Date());
  let dados = null;
  let salvando = false;
  const filaSalvamentos=[];
  let versaoEdicao=0;
  const edicoesLiberadas=new Set();
  const podeEditar=e=>!!e&&window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.editar')!==false&&!e.somente_consulta&&(!e.passada||edicoesLiberadas.has(e.id));
  let diaSelecionado=null,etapaSelecionada=null;
  // Dias carregados (cresce quando a faixa de dias chega ao fim); o servidor devolve no máximo 14 por chamada.
  const BLOCO=14;
  let totalDias=window.PainelLogisticoDias?.quantos||BLOCO,carregandoMais=false;

  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function segundaOuHoje(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return iso(x); }
  function somar(isoData, n) { const d = new Date(isoData + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
  function br(isoData) { const p = isoData.split("-"); return p[2] + "/" + p[1]; }
  function diaSemana(isoData) { return DIAS[new Date(isoData + "T12:00:00").getDay()]; }

  function chamar(fn, ...args) {
    return new Promise((ok, falha) => {
      google.script.run.withSuccessHandler(ok).withFailureHandler(e => falha(e && e.message ? e : new Error(String(e))))[fn](...args);
    });
  }

  function mostrarErro(msg) { const el = $("plErro"); el.hidden = !msg; el.textContent = msg || ""; const editor=$("plEditorErro");if(editor){editor.hidden=!msg;editor.textContent=msg||"";} }

  async function carregar(preencher) {
    if(preencher&&window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.editar')===false)return;
    if(salvando||filaSalvamentos.length)return;
    mostrarErro("");
    if($("plPreencher")) $("plPreencher").disabled = true;
    try {
      if(preencher){const resultado=await chamar('ESC_painel',diaSelecionado||inicio,1,true);aviso(resultado.preenchidas?resultado.preenchidas+(resultado.preenchidas===1?' etapa preenchida':' etapas preenchidas'):'Nada vazio para preencher neste dia');}
      if(salvando||filaSalvamentos.length)return;
      const versao=versaoEdicao,resultado=await buscarFaixa(inicio,totalDias);
      if(versao!==versaoEdicao||salvando||filaSalvamentos.length)return;
      dados=resultado;
      desenhar();
    } catch (e) {
      mostrarErro(e.message || "Não foi possível carregar o painel.");
      if (!dados) $("plDias").innerHTML = "";
    } finally { if($("plPreencher")) $("plPreencher").disabled = dados?.regras.automatica===false || !dados?.etapas.some(e=>e.data===diaSelecionado&&!e.passada&&podeEditar(e)); }
  }

  async function buscarFaixa(de, n) {
    const partes = await Promise.all(Array.from({length: Math.ceil(n / BLOCO)}, async (_, k) => {
      const inicio= somar(de,k*BLOCO),quantos=Math.min(BLOCO,n-k*BLOCO),r=await chamar('ESC_painel',inicio,quantos,false);
      if(window.supabaseClient?.rpc){
        try{const q=await window.supabaseClient.rpc('rh_disponibilidade_logistica',{p_inicio:inicio,p_fim:somar(inicio,quantos-1)});if(q.error)throw Error(q.error.message);if(!Array.isArray(q.data))throw Error('Resposta de disponibilidade inválida');r.disponibilidade_rh=q.data;}
        catch(err){r.rh_erro='Não foi possível verificar a disponibilidade do RH. Atualize antes de escalar pessoas. '+err.message;r.disponibilidade_rh=[];}
      }
      return r;
    }));
    return partes.reduce((a, b) => juntar(a, b), null);
  }
  function juntar(a, b) {
    if (!a) return b;
    const ids = new Set(a.etapas.map(e => e.id));
    return {...b, inicio: a.inicio, preenchidas: a.preenchidas, etapas: a.etapas.concat(b.etapas.filter(e => !ids.has(e.id))), ocupacoes: (a.ocupacoes || []).concat(b.ocupacoes || []), disponibilidade_rh:[...(a.disponibilidade_rh||[]),...(b.disponibilidade_rh||[])],rh_erro:a.rh_erro||b.rh_erro};
  }
  async function carregarMais(direcao='depois') {
    if(carregandoMais||!dados||salvando||filaSalvamentos.length)return;
    carregandoMais=true;window.PainelCronogramaEquipe?.carregando(true);
    const versao=versaoEdicao;
    try{
      const antes=direcao==='antes',mais=await buscarFaixa(somar(dados.inicio,antes?-BLOCO:totalDias),BLOCO);
      if(versao!==versaoEdicao||salvando||filaSalvamentos.length)return;
      dados=antes?{...juntar(mais,dados),fim:dados.fim}:juntar(dados,mais);inicio=dados.inicio;totalDias+=BLOCO;desenhar();
    }catch(e){mostrarErro(e.message||'N\u00e3o foi poss\u00edvel carregar mais dias.');}
    finally{carregandoMais=false;window.PainelCronogramaEquipe?.carregando(false);}
  }

  function aviso(msg) {
    let el = document.querySelector(".pl-toast");
    if (!el) { el = document.createElement("div"); el.className = "pl-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("is-on");
    clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove("is-on"), 2800);
  }

  function pessoaInfo(nome) {
    const k = chave(nome);
    return (dados.pessoas || []).find(p => chave(p.nome) === k) || null;
  }
  function impedimentoRH(e,nome){const p=pessoaInfo(nome);if(!p||p.free)return '';if(dados.rh_erro)return 'Disponibilidade do RH não verificada';return (dados.disponibilidade_rh||[]).find(r=>r.etapa_id===e.id&&r.funcionario_id===p.id)?.motivo||'';}
  function chave(n) { return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim(); }
  function caminhaoInfo(cod) { return (dados.caminhoes || []).find(c => chave(c.codigo) === chave(cod)) || null; }

  function equipeCompleta(e) {
    return !e.somente_consulta && !!e.responsavel && new Set([e.responsavel,...e.equipe].map(chave)).size>=Math.max(1,Number(e.sugerido)||1) && !(e.conflitos||[]).length && ![e.responsavel,...e.equipe].some(n=>impedimentoRH(e,n));
  }
  function escalaCompleta(e) {
    if(!equipeCompleta(e)||(e.avisos||[]).length)return false;
    if(e.servico||!dados.regras.etapas[e.tipo]?.caminhao)return true;
    const capacidade=e.caminhoes.reduce((total,codigo)=>total+(Number(caminhaoInfo(codigo)?.capacidade)||0),0);
    return e.caminhoes.length>0 && capacidade>0 && capacidade>=(Number(e.m3)||0);
  }
  function desenhar() {
    const planejamento=dados.etapas.filter(e=>['montagem','desmontagem'].includes(e.tipo)).map(e=>({...e,planejamento_completo:escalaCompleta(e)}));
    const indicador=$('plTabEquipe').querySelector('.pl-alerta-aba'),faltam=planejamento.filter(e=>!e.planejamento_completo&&!e.somente_consulta).length;
    indicador.textContent=String(faltam);indicador.hidden=faltam===0;
    window.PainelLogisticoDias.atualizar(dados.inicio,dados.hoje,planejamento,totalDias);
    diaSelecionado=diaSelecionado||window.PainelLogisticoDias.data||dados.hoje;
    const atual=planejamento.find(e=>e.id===etapaSelecionada)||planejamento.find(e=>e.data===diaSelecionado)||planejamento[0];etapaSelecionada=atual?.id||null;
    const doDia=dados.etapas.filter(e=>e.data===diaSelecionado);
    if($('plPreencher')){$('plPreencher').dataset.automaticadesativada=String(dados.regras.automatica===false);$('plPreencher').hidden=dados.regras.automatica===false||$('plTabEquipe').getAttribute('aria-selected')!=='true';$('plPreencher').disabled=dados.regras.automatica===false||!doDia.some(e=>!e.passada&&podeEditar(e));}
    if(dados.rh_erro)mostrarErro(dados.rh_erro);
    window.PainelCronogramaEquipe.render({etapas:planejamento,hoje:dados.hoje,pessoa:pessoaInfo,impedimento:impedimentoRH,caminhao:caminhaoInfo,mais:carregarMais,opcoes:opcoesEscolha,podeEditar,podeLiberar:e=>e.passada&&!e.somente_consulta&&window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.editar')!==false});
    estadoSalvamento();pintarFotosServicos(planejamento).catch(()=>{});window.PainelUber?.definirPeriodo?.(dados.inicio,somar(dados.inicio,totalDias-1));
  }

  const fotosDecoradores = new Map();
  async function pintarFotosServicos(etapas) {
    const sb = window.supabaseClient;
    if (!sb) return;
    let ctx;
    try { ctx = await window.aguardarContexto?.(); } catch { return; }
    const empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if (!empresa) return;
    const porId = new Map(etapas.map(e => [String(e.id), e]));
    document.querySelectorAll('[data-etapa-id]').forEach(card => {
      const e = porId.get(card.dataset.etapaId), avatar = card.querySelector('[data-decorador-foto]');
      if (!e || !avatar) return;
      const chave = JSON.stringify([empresa,e.cliente_id || null,e.cliente]);
      if (!fotosDecoradores.has(chave)) fotosDecoradores.set(chave, (async () => {
        let q = sb.from('clientes_empresas').select('catalogo_logo_url').eq('empresa_id',empresa);
        q = e.cliente_id ? q.eq('id',e.cliente_id) : q.eq('nome_razao',e.cliente || '');
        const {data,error} = await q.limit(1);
        if (error) return '';
        const url = data?.[0]?.catalogo_logo_url || '';
        return /^https?:\/\//i.test(url) ? url : '';
      })().catch(() => ''));
      fotosDecoradores.get(chave).then(url => {
        if (!url || !avatar.isConnected) return;
        const img = document.createElement('img');
        img.alt = 'Foto de ' + (e.cliente || 'decorador'); img.loading = 'lazy';
        img.onerror = () => img.remove(); img.src = url; avatar.append(img);
      });
    });
  }

  function informacoesSupervisor(e) {
    const d=e.supervisor||{}, acesso=d.acesso||{};
    const dataHora=(data,hora)=>[data?br(String(data).slice(0,10)):'',hora||''].filter(Boolean).join(' · ')||'Não informado';
    const campo=(nome,valor)=>`<div class="pl-info-campo"><dt>${esc(nome)}</dt><dd>${esc(valor||'Não informado')}</dd></div>`;
    const acessoCampos=[['Baldeação',acesso.baldeacao],['Escada',acesso.escada],['Caminhão próximo',acesso.caminhao_perto],['Horário limite',acesso.horario_limite],['Lona',acesso.lona]].filter(([,v])=>v!=null&&String(v).trim());
    const obs=(titulo,texto)=>`<div class="pl-info-observacao"><h3>${esc(titulo)}</h3><p>${esc(texto||'Nenhuma observação registrada.')}</p></div>`;
    return `<section class="pl-painel pl-info-supervisor" aria-label="Informações da operação"><header class="pl-painel-cab"><h2>Informações da operação</h2><dl class="pl-info-datas">${campo('Entrega',dataHora(d.data_entrega,d.horario_entrega))}${campo('Coleta',dataHora(d.data_coleta,d.horario_coleta))}${campo('Evento',dataHora(d.data_evento,''))}</dl></header><div class="pl-info-conteudo"><dl class="pl-info-grade">${campo('Endereço completo',d.endereco)}${e.tipo==='desmontagem'?'':campo('Montagem programada',dataHora(e.data,e.hora))}</dl><div class="pl-info-observacoes">${e.tipo==='desmontagem'?obs('Observações de coleta',d.observacoes_coleta):obs('Observações de entrega',d.observacoes_entrega)}${d.particularidades?obs('Particularidades do local',d.particularidades):''}</div>${acessoCampos.length?`<dl class="pl-info-acesso">${acessoCampos.map(([k,v])=>campo(k,v)).join('')}</dl>`:''}</div></section>`;
  }



  function opcoesEscolha(e,papel){
    const cam=papel==='cam',usados=new Set((cam?e.caminhoes:[e.responsavel,...e.equipe]).filter(Boolean).map(chave));
    const ids=new Set(dados.etapas.map(e=>e.id)),outras=[...dados.etapas.filter(x=>!x.somente_consulta),...(dados.ocupacoes||[]).filter(x=>!ids.has(x.id))].filter(x=>x.id!==e.id&&x.data===e.data);
    const unicas=[...new Map(outras.map(x=>[x.id,x])).values()];
    return (cam?dados.caminhoes:dados.pessoas).filter(p=>!usados.has(chave(cam?p.codigo:p.nome))&&(cam?!!p.codigo:papel!=='resp'||p.lider)).map(p=>{
      const valor=cam?p.codigo:p.nome;
      const alocacoes=unicas.filter(x=>(cam?x.caminhoes||[]:[x.responsavel,...(x.equipe||[])]).some(n=>chave(n)===chave(valor))).sort((a,b)=>String(a.hora||'').localeCompare(String(b.hora||''))).map(x=>({pedido:x.pedido||'',etapa:TIPO[x.tipo]||x.etapa||'Escala',hora:x.hora||'Sem horário',local:x.local||x.supervisor?.local||'',cliente:x.cliente||''}));
      return {valor,nome:valor,impedimento:cam?'':impedimentoRH(e,p.nome),categoria:cam?'cam':p.lider?'responsaveis':p.free?'free':'interna',foto:p.foto_url||p.fotoUrl||p.miniatura||'',detalhe:cam?[p.modelo,p.capacidade?p.capacidade+' m³':''].filter(Boolean).join(' · '):[p.free?'Free':EQUIPE[p.equipe]||'Equipe interna',p.lider?'Líder':''].filter(Boolean).join(' · '),ocupado:alocacoes.length>0,alocacoes,vinculo:cam?(p.vinculo==='Próprio'?'Próprio':'Terceirizado'+(p.empresa?' · '+p.empresa:'')):''};
    }).sort((a,b)=>Number(!!a.impedimento)-Number(!!b.impedimento)||Number(a.ocupado)-Number(b.ocupado)||a.nome.localeCompare(b.nome,'pt-BR'));
  }
  const escala=e=>({responsavel:e.responsavel,equipe:e.equipe.slice(),caminhoes:e.caminhoes.slice()});
  function aplicarEscala(id,valor){
    const e=dados.etapas.find(e=>e.id===id);if(!e)return;
    Object.assign(e,valor,{equipe:valor.equipe.slice(),caminhoes:valor.caminhoes.slice()});
    e.avisos=(e.avisos||[]).filter(a=>!/^Equipe pequena:|^Sem respons|^Sem caminh|^Caminh.*pequeno:|^Capacidade do caminh/.test(a));
    const tem=(e.responsavel?1:0)+e.equipe.length;
    if(tem<e.sugerido)e.avisos.push('Equipe pequena: '+tem+' de '+e.sugerido+' pessoas sugeridas');
    if(!e.responsavel)e.avisos.push('Sem responsável (nenhum líder livre)');
    if(!e.servico&&dados.regras.etapas[e.tipo]?.caminhao){
      const cap=e.caminhoes.reduce((n,c)=>n+(Number(caminhaoInfo(c)?.capacidade)||0),0);
      if(!e.caminhoes.length)e.avisos.push('Sem caminhão');
      else if(!cap)e.avisos.push('Capacidade do caminhão não cadastrada');
      else if(cap<e.m3)e.avisos.push('Caminhão pequeno: '+cap+' m³ para '+e.m3+' m³');
    }
  }
  function estadoSalvamento(){
    let el=$('plSalvamentoEstado');if(!el){el=document.createElement('span');el.id='plSalvamentoEstado';el.className='pl-salvamento-estado';el.setAttribute('role','status');$('plAcoesDireita')?.append(el);}
    el.textContent=filaSalvamentos.length?'Salvando…':'';el.hidden=!filaSalvamentos.length;
    if($('plEditorSalvamento'))$('plEditorSalvamento').textContent=filaSalvamentos.length?'Salvando…':!$('plErro').hidden?'Altera\u00e7\u00e3o n\u00e3o salva. Confira o aviso.':'Altera\u00e7\u00f5es salvas automaticamente';
  }
  function salvar(e,novo){
    if(!podeEditar(e))return;
    const anterior={...escala(e),avisos:[...(e.avisos||[])],conflitos:[...(e.conflitos||[])]};
    novo={responsavel:novo.responsavel,equipe:[...new Set(novo.equipe)],caminhoes:[...new Set(novo.caminhoes)]};
    const indisponivel=[novo.responsavel,...novo.equipe].filter(Boolean).map(n=>({nome:n,motivo:impedimentoRH(e,n)})).find(p=>p.motivo);
    if(indisponivel){mostrarErro(indisponivel.nome+': '+indisponivel.motivo+'. Escolha uma pessoa disponível.');return;}
    filaSalvamentos.push({id:e.id,anterior,novo});versaoEdicao++;
    aplicarEscala(e.id,novo);mostrarErro('');desenhar();processarSalvamentos();
  }
  async function processarSalvamentos(){
    if(salvando)return;salvando=true;
    try{
      while(filaSalvamentos.length){
        const trabalho=filaSalvamentos[0];let redesenhar=false;
        try{
          let r=await chamar('ESC_salvarEtapa',trabalho.id,trabalho.novo,false);
          if(!r.ok){
            const aceitar=await confirmarConflito(r.conflitos||[]);
            if(!aceitar)throw Error('Alteração desfeita: o recurso possui conflito de horário.');
            r=await chamar('ESC_salvarEtapa',trabalho.id,trabalho.novo,true);
            if(!r.ok)throw Error('Não foi possível confirmar a alteração.');
          }
          filaSalvamentos.shift();
          if(!filaSalvamentos.some(t=>t.id===trabalho.id)){
            const e=dados.etapas.find(e=>e.id===trabalho.id);if(e){const conflitos=r.conflitos||[];redesenhar=JSON.stringify(e.conflitos||[])!==JSON.stringify(conflitos);e.conflitos=conflitos;}
          }
        }catch(err){
          // As pr?ximas mudan?as desta opera??o dependem da que falhou.
          for(let i=filaSalvamentos.length-1;i>=0;i--)if(filaSalvamentos[i].id===trabalho.id)filaSalvamentos.splice(i,1);
          aplicarEscala(trabalho.id,trabalho.anterior);redesenhar=true;
          mostrarErro((err.message||'Não foi possível salvar.')+' A seleção anterior foi restaurada.');
        }
        if(redesenhar)desenhar();else estadoSalvamento();
      }
    }finally{salvando=false;estadoSalvamento();window.PainelUber?.recarregar?.().catch(()=>{});}
  }

  function confirmarConflito(lista) {
    return new Promise(ok => {
      const d = $("plConflito");
      $("plConflitoLista").innerHTML = lista.map(c => `<li>${esc(c)}</li>`).join("");
      const fim = v => { d.close(); $("plConflitoSalvar").onclick = $("plConflitoVoltar").onclick = null; ok(v); };
      $("plConflitoSalvar").onclick = () => fim(true);
      $("plConflitoVoltar").onclick = () => fim(false);
      d.oncancel = () => fim(false);
      d.showModal();
    });
  }

  function etapaDo(el) {
    const card = el.closest(".pl-etapa,[data-etapa-id],[data-edicao-id]");
    return card && dados.etapas.find(e => e.id === (card.dataset.id||card.dataset.etapaId||card.dataset.edicaoId));
  }

  $("plDias").addEventListener("click", ev => {
    const row=ev.target.closest("[data-etapa-id]");if(row){const e=dados.etapas.find(e=>e.id===row.dataset.etapaId);if(e){etapaSelecionada=e.id;diaSelecionado=e.data;}}



    const escolha=ev.target.closest('[data-escolher-recurso]');
    if(escolha){const e=etapaDo(escolha);if(!podeEditar(e))return;const novo=escala(e),valor=escolha.dataset.valor,papel=escolha.dataset.papel;if(papel==='resp'){novo.responsavel=valor;novo.equipe=novo.equipe.filter(n=>chave(n)!==chave(valor));}else if(papel==='equipe')novo.equipe=novo.equipe.filter(n=>n!==escolha.dataset.substituir).concat(valor);else novo.caminhoes=novo.caminhoes.filter(n=>n!==escolha.dataset.substituir).concat(valor);salvar(e,novo);return;}
    const liberar=ev.target.closest('[data-liberar-edicao]');
    if(liberar){if(salvando)return;const id=liberar.dataset.liberarEdicao;edicoesLiberadas.has(id)?edicoesLiberadas.delete(id):edicoesLiberadas.add(id);desenhar();document.querySelector('[data-liberar-edicao="'+CSS.escape(id)+'"]')?.focus();return;}
    const b = ev.target.closest('button[data-acao="tirar"]');
    if (!b) return;
    const e = etapaDo(b);
    if(!podeEditar(e))return;
    const novo = { responsavel: e.responsavel, equipe: e.equipe.slice(), caminhoes: e.caminhoes.slice() };
    if (b.dataset.papel === "resp") novo.responsavel = "";
    else if (b.dataset.papel === "equipe") novo.equipe = novo.equipe.filter(n => n !== b.dataset.nome);
    else novo.caminhoes = novo.caminhoes.filter(c => c !== b.dataset.nome);
    salvar(e, novo);
  });

  $('plDias').addEventListener('error',ev=>{if(ev.target.matches('.pl-avatar img,.pl-recurso-foto img,.pl-caminhao-icone img'))ev.target.remove();},true);
  if($("plPreencher")) $("plPreencher").onclick = () => carregar(true);
  if($('plIrHoje')) $('plIrHoje').onclick=()=>{diaSelecionado=dados?.hoje;window.PainelCronogramaEquipe?.irPara(diaSelecionado);};


  window.addEventListener('beforeunload',ev=>{if(!filaSalvamentos.length)return;ev.preventDefault();ev.returnValue='';});
  window.addEventListener('escala-parametros-alterados',()=>carregar(false));
  window.addEventListener('rh-disponibilidade-alterada',()=>carregar(false));
  window.addEventListener('storage',e=>{if(e.key==='rh-disponibilidade-atualizada')carregar(false);});
  window.addEventListener('focus',()=>{if(dados&&!document.querySelector('#plEscolhaFlutuante[open]'))carregar(false);});
  window.PainelLogisticoEquipe = { infoEtapa:id=>{const e=dados?.etapas.find(e=>e.id===id);return e?{local:e.detalhes?.endereco||e.local,hora:e.hora}:null;}, iniciar: () => carregar(false), carregarMais, definirDia: dia => { diaSelecionado=dia||dados?.hoje;etapaSelecionada=null;if(dados)desenhar(); } };
  if (!document.getElementById("plModuloAbas")) carregar(false);
})();
