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
  let recursosAbertos = false;
  const edicoesLiberadas=new Set();
  const podeEditar=e=>!!e&&!e.somente_consulta&&(!e.passada||edicoesLiberadas.has(e.id));
  let diaSelecionado=null,etapaSelecionada=null,abaRecursos='cam';
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

  function mostrarErro(msg) { const el = $("plErro"); el.hidden = !msg; el.textContent = msg || ""; }

  async function carregar(preencher) {
    if(salvando||filaSalvamentos.length)return;
    mostrarErro("");
    $("plPreencher").disabled = true;
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
    } finally { $("plPreencher").disabled = dados?.regras.automatica===false || !dados?.etapas.some(e=>e.data===diaSelecionado&&!e.passada&&!e.somente_consulta); }
  }

  async function buscarFaixa(de, n) {
    const partes = await Promise.all(Array.from({length: Math.ceil(n / BLOCO)}, (_, k) => chamar("ESC_painel", somar(de, k * BLOCO), Math.min(BLOCO, n - k * BLOCO), false)));
    return partes.reduce((a, b) => juntar(a, b), null);
  }
  function juntar(a, b) {
    if (!a) return b;
    const ids = new Set(a.etapas.map(e => e.id));
    return {...b, inicio: a.inicio, preenchidas: a.preenchidas, etapas: a.etapas.concat(b.etapas.filter(e => !ids.has(e.id))), ocupacoes: (a.ocupacoes || []).concat(b.ocupacoes || [])};
  }
  async function carregarMais(direcao='depois') {
    if (carregandoMais || !dados) return;
    carregandoMais = true;
    window.PainelLogisticoDias?.carregando(true);
    try {
      const antes=direcao==='antes';
      const mais = await buscarFaixa(somar(dados.inicio,antes?-BLOCO:totalDias), BLOCO);
      dados = antes ? {...juntar(mais,dados),fim:dados.fim} : juntar(dados,mais);
      inicio=dados.inicio;
      totalDias += BLOCO;
      carregandoMais = false;
      window.PainelLogisticoDias?.carregando(false);
      desenhar();
    } catch (e) {
      mostrarErro(e.message || "Não foi possível carregar mais dias.");
      setTimeout(() => { carregandoMais = false; window.PainelLogisticoDias?.carregando(false); }, 4000);
    }
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
  function chave(n) { return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim(); }
  function caminhaoInfo(cod) { return (dados.caminhoes || []).find(c => chave(c.codigo) === chave(cod)) || null; }

  function equipeCompleta(e) {
    return !e.somente_consulta && !!e.responsavel && new Set([e.responsavel,...e.equipe].map(chave)).size>=Math.max(1,Number(e.sugerido)||1) && !(e.conflitos||[]).length;
  }
  function escalaCompleta(e) {
    if(!equipeCompleta(e)||(e.avisos||[]).length)return false;
    if(e.servico||!dados.regras.etapas[e.tipo]?.caminhao)return true;
    const capacidade=e.caminhoes.reduce((total,codigo)=>total+(Number(caminhaoInfo(codigo)?.capacidade)||0),0);
    return e.caminhoes.length>0 && capacidade>0 && capacidade>=(Number(e.m3)||0);
  }
  function desenhar() {
    const planejamento=dados.etapas.filter(e=>['montagem','desmontagem'].includes(e.tipo)).map(e=>({...e,planejamento_completo:escalaCompleta(e)}));
    const indicador=$('plTabEquipe').querySelector('.pl-alerta-aba');
    const faltam=planejamento.filter(e=>!e.planejamento_completo).length;
    indicador.textContent=String(faltam);
    indicador.hidden=faltam===0;
    $('plTabEquipe').title=faltam?faltam+' montagem(ns)/desmontagem(ns) ainda sem equipe ou caminhão completos':'Todas as montagens e desmontagens estão com equipe e caminhão';
    window.PainelLogisticoDias.atualizar(dados.inicio,dados.hoje,planejamento,totalDias);
    diaSelecionado=window.PainelLogisticoDias.data;
    const dias=Array.from({length:totalDias},(_,i)=>somar(dados.inicio,i));
    if(!dias.includes(diaSelecionado))diaSelecionado=dias.includes(dados.hoje)?dados.hoje:dias[0];
    const doDia=dados.etapas.filter(e=>e.data===diaSelecionado).sort((a,b)=>(a.hora||'99').localeCompare(b.hora||'99'));
    $('plPreencher').dataset.automaticadesativada=String(dados.regras.automatica===false);
    $('plPreencher').hidden=dados.regras.automatica===false || $('plTabEquipe').getAttribute('aria-selected')!=='true';
    $('plPreencher').disabled=dados.regras.automatica===false || !doDia.some(e=>!e.passada&&!e.somente_consulta);
    $('plDias').setAttribute('aria-labelledby','plTab-'+diaSelecionado);
    const mostrar=doDia.filter(e=>['montagem','desmontagem'].includes(e.tipo));
    if(!mostrar.some(e=>e.id===etapaSelecionada))etapaSelecionada=(mostrar.find(e=>['montagem','desmontagem'].includes(e.tipo))||mostrar[0])?.id||null;
    const atual=mostrar.find(e=>e.id===etapaSelecionada);
    const principais=mostrar;
    const markup=`<div class="pl-planejamento"><section class="pl-planejamento-lista pl-painel"><header class="pl-painel-cab"><div><h2>Montagens e desmontagens</h2></div><b>${principais.length}</b></header><div class="pl-servicos-lista">${principais.map(servico).join('')||'<p class="pl-vazio">Nenhuma montagem ou desmontagem neste dia.</p>'}</div></section><div class="pl-planejamento-edicao">${atual?informacoesSupervisor(atual)+cartao(atual):'<section class="pl-painel"><p class="pl-vazio">'+'Selecione uma etapa para montar a equipe e distribuir os caminhões.'+'</p></section>'}</div><dialog id="plDisponiveisDialog" class="pl-disponiveis-dialog" aria-labelledby="plDisponiveisTitulo"><header class="pl-disponiveis-topo"><h2 id="plDisponiveisTitulo">Dispon&#237;veis no dia</h2><button type="button" data-fechar-disponiveis aria-label="Fechar dispon&#237;veis">&times;</button></header>${recursosDoDia(doDia,atual)}</dialog></div>`;
    const existente=$('plDisponiveisDialog');
    if(existente){
      const novo=document.createElement('div');novo.innerHTML=markup;
      for(const seletor of ['.pl-planejamento-lista','.pl-planejamento-edicao']){
        const alvo=$('plDias').querySelector(seletor),conteudo=novo.querySelector(seletor);if(alvo&&conteudo)alvo.replaceWith(conteudo);
      }
      const alvo=existente.querySelector('.pl-recursos-painel'),conteudo=novo.querySelector('.pl-recursos-painel');
      if(alvo&&conteudo&&alvo.innerHTML!==conteudo.innerHTML){const topo=existente.scrollTop;alvo.innerHTML=conteudo.innerHTML;existente.scrollTop=topo;}
    }else $('plDias').innerHTML=markup;
    const dialog = $('plDisponiveisDialog');
    const gatilho = document.querySelector('[data-abrir-disponiveis]');
    if (gatilho) {
      const quantidade = tipo => dialog.querySelector('#plRecursoTab-'+tipo+' .pl-disponiveis')?.textContent || '0';
      gatilho.innerHTML = '<span class="pl-disponiveis-titulo">Equipe dispon&#237;vel</span><span class="pl-disponiveis-contagens"><span>Equipe <b>'+quantidade('interna')+'</b></span><span>Caminh&#245;es <b>'+quantidade('cam')+'</b></span><span>Free <b>'+quantidade('free')+'</b></span></span>';
      gatilho.disabled = false;
    }
    if(!dialog.dataset.iniciado){dialog.dataset.iniciado='1';
    dialog.addEventListener('close', () => { recursosAbertos = false; document.querySelector('[data-abrir-disponiveis]')?.focus(); });
    dialog.addEventListener('cancel', () => { recursosAbertos = false; });
    dialog.addEventListener('click', ev => {
      if (ev.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close();
    });
    }
    if (recursosAbertos&&!dialog.open) dialog.showModal();
    estadoSalvamento();
    pintarFotosServicos(principais).catch(() => {});
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
    document.querySelectorAll('.pl-servico').forEach(card => {
      const e = porId.get(card.dataset.selecionar), avatar = card.querySelector('[data-decorador-foto]');
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
    return `<section class="pl-painel pl-info-supervisor" aria-label="Informações da operação"><header class="pl-painel-cab"><h2>Informações da operação</h2><dl class="pl-info-datas">${campo('Entrega',dataHora(d.data_entrega,d.horario_entrega))}${campo('Coleta',dataHora(d.data_coleta,d.horario_coleta))}${campo('Evento',dataHora(d.data_evento,''))}</dl></header><div class="pl-info-conteudo"><dl class="pl-info-grade">${campo('Endereço completo',d.endereco)}${e.tipo==='desmontagem'?'':campo('Montagem programada',dataHora(e.data,e.hora))}</dl><div class="pl-info-observacoes">${e.tipo==='desmontagem'?obs('Observações de coleta',d.observacoes_coleta):obs('Observações de entrega',d.observacoes_entrega)}</div>${acessoCampos.length?`<dl class="pl-info-acesso">${acessoCampos.map(([k,v])=>campo(k,v)).join('')}</dl>`:''}</div></section>`;
  }

  function servico(e){return `<button type="button" class="pl-servico ${e.id===etapaSelecionada?'is-selecionado':''} ${escalaCompleta(e)?'is-completo':''}" data-selecionar="${esc(e.id)}" data-tipo="${esc(e.tipo)}" aria-pressed="${e.id===etapaSelecionada}"><span class="pl-etapa-linha1"><b class="pl-hora">${esc(e.hora||'--:--')}</b><span class="pl-servico-etapa">${e.tipo==='desmontagem'?'Coleta':'Entrega'}</span><b class="pl-pedido-numero">Pedido #${esc(String(e.pedido||"-").replace(/^#/,""))}</b></span><span class="pl-servico-cliente"><span class="pl-decorador-foto" data-decorador-foto>${esc(String(e.cliente||"?").trim().charAt(0))}</span><span class="pl-servico-identidade"><strong>${esc(e.cliente)}</strong><span class="pl-local">${esc(e.local)}</span></span></span>${e.somente_consulta?'<span class="pl-consulta">Pré-reserva · somente consulta</span>':''}</button>`;}

  function fotoRecurso(p,tipo){const url=p.foto_url||'';return '<div class="pl-recurso-foto">'+(tipo==='cam'?iconeCam:iconePessoa)+(/^https?:\/\//i.test(url)?'<img src="'+esc(url)+'" alt="'+esc(p.nome||p.codigo)+'" loading="lazy">':'')+'</div>';}
  function recursosDoDia(etapas,atual){
    const ids=new Set(dados.etapas.map(e=>e.id));
    etapas=[...(dados.ocupacoes||[]).filter(e=>!ids.has(e.id)),...dados.etapas.filter(e=>!e.somente_consulta)].filter(e=>e.data===diaSelecionado);
    const pessoasUsadas=new Set(etapas.flatMap(e=>[e.responsavel,...e.equipe]).filter(Boolean).map(chave)),camsUsados=new Set(etapas.flatMap(e=>e.caminhoes).map(chave));
    const pessoas=dados.pessoas.filter(p=>!pessoasUsadas.has(chave(p.nome))),cams=dados.caminhoes.filter(c=>c.codigo&&!camsUsados.has(chave(c.codigo)));
    const editavel=podeEditar(atual),camEditavel=podeEditar(atual),usaCam=atual&&!atual.servico&&dados.regras.etapas[atual.tipo]?.caminhao;
    const grupos=[['cam','Caminhões',cams],['interna','Equipe interna',pessoas.filter(p=>!p.free)],['free','Equipe Free',pessoas.filter(p=>p.free)]];
    const [tipo,nome,lista]=grupos.find(g=>g[0]===abaRecursos);
    const linhas=lista.map(p=>{
      const cam=tipo==='cam',valor=cam?p.codigo:p.nome,habilitado=cam?camEditavel&&usaCam:editavel;
      return `<button type="button" class="pl-recurso pl-recurso-card" data-recurso="${cam?'cam':'equipe'}" data-valor="${esc(valor)}" aria-label="${cam?'Alocar caminh&#227;o':'Adicionar'} ${esc(valor)}" ${habilitado?'':'disabled'}>${fotoRecurso(p,cam?'cam':'pessoa')}<span class="pl-recurso-dados"><strong>${esc(valor)}</strong><small>${cam?esc(p.modelo)+(p.capacidade?' &#183; '+p.capacidade+' m&#179;':''):(p.free?'Free':esc(EQUIPE[p.equipe]||'Equipe'))+(p.lider?' &#183; L&#237;der':'')}</small>${cam&&p.placa?`<small>${esc(p.placa)}</small>`:''}</span></button>`;
    }).join('');
    return `<section class="pl-painel pl-recursos-painel"><div class="pl-recursos-abas" role="tablist" aria-label="Recursos disponíveis">${grupos.map(([id,label,itens])=>`<button type="button" role="tab" id="plRecursoTab-${id}" aria-controls="plRecursoConteudo" aria-selected="${abaRecursos===id}" tabindex="${abaRecursos===id?'0':'-1'}" data-aba-recurso="${id}"><small class="pl-disponiveis" aria-label="${itens.length} dispon?veis neste dia">${itens.length}</small><span>${label}</span></button>`).join('')}</div><div id="plRecursoConteudo" role="tabpanel" aria-labelledby="plRecursoTab-${tipo}"><header class="pl-painel-cab"><h2>${nome}</h2></header><p class="pl-recurso-nota">Sem alocação neste dia${tipo==='cam'?'':' · horários validados ao salvar'}</p><div class="pl-recursos-lista">${linhas||'<p class="pl-vazio">Nenhum recurso disponível neste dia.</p>'}</div></div></section>`;
  }

  // Quem e quais caminhões não aparecem em nenhuma etapa do dia
  function livresDoDia(doDia) {
    if (!doDia.length) return "";
    const ocupadas = new Set(doDia.flatMap(e => [e.responsavel, ...e.equipe]).filter(Boolean).map(chave));
    const usados = new Set(doDia.flatMap(e => e.caminhoes).map(chave));
    const pessoas = dados.pessoas.filter(p => !p.free && !ocupadas.has(chave(p.nome))).map(p => p.nome.split(" ")[0]);
    const cams = dados.caminhoes.filter(c => c.codigo && !usados.has(chave(c.codigo))).map(c => c.codigo);
    return `<p class="pl-livres"><b>Sem etapa no dia:</b> ${pessoas.length ? esc(pessoas.join(", ")) : "ninguém"} · <b>Caminhões livres:</b> ${cams.length ? esc(cams.join(", ")) : "nenhum"}</p>`;
  }

  const iconePessoa='<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="15" r="9" fill="currentColor"/><path d="M8 44v-7a16 16 0 0 1 32 0v7" fill="currentColor"/></svg>';
  const iconeCam='<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M3 5h35v28H3zM40 15h12l9 11v7H40z" fill="currentColor"/><circle cx="15" cy="35" r="7" fill="currentColor" stroke="white" stroke-width="3"/><circle cx="49" cy="35" r="7" fill="currentColor" stroke="white" stroke-width="3"/></svg>';
  function planoCaminhoes(e){
    let restante=Math.max(0,Number(e.m3)||Number(dados.regras.volume_padrao_m3)||0);
    const frota=dados.caminhoes.filter(c=>Number(c.capacidade)>0).sort((a,b)=>a.capacidade-b.capacidade),vagas=[];
    while(restante>0&&frota.length){const i=frota.findIndex(c=>c.capacidade>=restante),c=frota.splice(i<0?frota.length-1:i,1)[0];vagas.push(c);restante-=c.capacidade;}
    if(!vagas.length)vagas.push({capacidade:0});
    return {vagas,insuficiente:restante>0};
  }
  function cartao(e) {
    const editavel=podeEditar(e),usaCaminhao=!e.servico&&!!dados.regras.etapas[e.tipo]?.caminhao,equipeTipo=dados.regras.etapas[e.tipo]?.equipe;
    const total=(e.responsavel?1:0)+e.equipe.length;
    const remover=(nome,papel)=>editavel?`<button type="button" class="pl-vaga-remover" aria-label="Tirar ${esc(nome)}" data-acao="tirar" data-papel="${papel}" data-nome="${esc(nome)}">×</button>`:'';
    const vagaPessoa=(nome,papel)=>{
      const p=pessoaInfo(nome),foto=p?.foto_url||p?.fotoUrl||p?.miniatura||'',url=/^https?:\/\//i.test(foto)?foto:'';
      return `<div ${!nome&&editavel?'role="button" tabindex="0" aria-label="Selecionar pessoa"':''} class="pl-vaga pl-vaga-pessoa ${nome?'is-preenchida':'is-vazia'}"><div class="pl-avatar">${iconePessoa}${nome&&url?`<img src="${esc(url)}" alt="${esc(nome)}" loading="lazy">`:''}</div><strong>${esc(nome||(papel==='resp'?'Responsável':'Selecionar pessoa'))}</strong><small>${papel==='resp'?'Líder da equipe':nome?(p?.free?'Free':'Equipe'):'Vaga disponível'}</small>${nome?remover(nome,papel):''}</div>`;
    };
    const vagasEquipe=e.equipe.map(n=>vagaPessoa(n,'equipe')).join('')+Array.from({length:Math.max(0,(Number(e.sugerido)||1)-1-e.equipe.length)},()=>vagaPessoa('','equipe')).join('');
    const plano=planoCaminhoes(e),restantes=e.caminhoes.map(c=>caminhaoInfo(c)||{codigo:c,capacidade:0});
    const vagaCam=(c,alocado)=>`<div ${!alocado&&editavel?'role="button" tabindex="0" aria-label="Selecionar caminh&#227;o"':''} class="pl-vaga pl-vaga-cam ${alocado?'is-preenchida':'is-vazia'}"><div class="pl-caminhao-icone">${iconeCam}${alocado&&/^https?:\/\//i.test(c.foto_url||'')?`<img src="${esc(c.foto_url)}" alt="${esc(c.codigo)}">`:''}</div><strong>${esc(alocado?c.codigo:c.capacidade?'Caminhão · '+c.capacidade+' m³':'Selecionar caminhão')}</strong><small>${esc(alocado?(c.modelo||'Caminhão selecionado'):'A preencher')}</small><small class="pl-capacidade-caminhao">${Number(c.capacidade)>0?Number(c.capacidade).toLocaleString('pt-BR')+' m\u00b3 de capacidade':'Capacidade n\u00e3o cadastrada'}</small>${alocado?remover(c.codigo,'cam'):''}</div>`;
    const capacidadeDistribuida=e.caminhoes.reduce((s,c)=>s+Math.max(0,Number(caminhaoInfo(c)?.capacidade)||0),0),capacidadeNecessaria=Math.max(0,Number(e.m3)||0);
    const camVagas=plano.vagas.map(v=>{let i=restantes.findIndex(c=>c.capacidade>=v.capacidade);return i>=0?vagaCam(restantes.splice(i,1)[0],true):vagaCam(v,false);}).join('')+restantes.map(c=>vagaCam(c,true)).join('');
    return `<article class="pl-etapa pl-painel${e.passada&&!editavel?' is-passada':''}" data-id="${esc(e.id)}"><header class="pl-painel-cab"><h2>Montagem da equipe</h2>${e.passada&&!e.somente_consulta?`<button type="button" class="pl-edicao-passada" data-liberar-edicao="${esc(e.id)}" aria-label="${editavel?'Bloquear':'Liberar'} edi&#231;&#227;o desta opera&#231;&#227;o" title="${editavel?'Bloquear':'Liberar'} edi&#231;&#227;o desta opera&#231;&#227;o" aria-pressed="${editavel}"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="${editavel?'M9 10V6a4 4 0 0 1 8 0':'M8 10V6a4 4 0 0 1 8 0v4'}"/></svg></button>`:''}${e.somente_consulta?'<span class="pl-consulta">Pré-reserva · somente consulta</span>':''}<b>${total}/${e.sugerido}</b></header><div class="pl-etapa-escala"><div class="pl-vagas">${vagaPessoa(e.responsavel,'resp')}${vagasEquipe}</div></div><section class="pl-distribuicao"><header class="pl-painel-cab"><h2>Distribuição de caminhões</h2>${usaCaminhao||e.caminhoes.length?`<div class="pl-capacidade-resumo"><span>Capacidade necess\u00e1ria <b>${capacidadeNecessaria.toLocaleString('pt-BR')} m\u00b3</b></span><span>Caminh\u00f5es distribu\u00eddos <b>${capacidadeDistribuida.toLocaleString('pt-BR')} m\u00b3</b></span>${capacidadeDistribuida<capacidadeNecessaria?'<span class="is-falta">Faltam '+(capacidadeNecessaria-capacidadeDistribuida).toLocaleString('pt-BR')+' m\u00b3</span>':''}</div>`:""}</header><div class="pl-etapa-escala">${usaCaminhao||e.caminhoes.length?`<div class="pl-vagas">${camVagas}</div>`:'<p class="pl-dica">Esta etapa não exige caminhão.</p>'}</div></section></article>`;
  }


  // Lista de quem pode entrar: primeiro a equipe operacional da etapa, depois o resto e os free
  function seletor(papel, e, equipeTipo) {
    if (papel === "cam") {
      const usados = new Set(e.caminhoes.map(chave));
      const opcoes = dados.caminhoes.filter(c => c.codigo && !usados.has(chave(c.codigo)))
        .map(c => `<option value="${esc(c.codigo)}">${esc(c.codigo)} · ${esc(c.modelo)}${c.capacidade ? " · " + c.capacidade + " m³" : " · sem capacidade"}${c.empresa ? " · " + esc(c.empresa) : ""}</option>`);
      return `<select class="pl-add" data-papel="cam" aria-label="Adicionar caminhão"><option value="">+ caminhão</option>${opcoes.join("")}</select>`;
    }
    const ja = new Set([e.responsavel, ...e.equipe].filter(Boolean).map(chave));
    const lista = dados.pessoas.filter(p => !ja.has(chave(p.nome)) && (papel !== "resp" || p.lider));
    const grupos = {};
    lista.forEach(p => { const g = p.equipe === equipeTipo ? "1" : p.free ? "3" : "2"; (grupos[g] = grupos[g] || []).push(p); });
    const nomeGrupo = { "1": "Equipe " + (EQUIPE[equipeTipo] || ""), "2": "Outras equipes", "3": "Free aprovados" };
    const opts = Object.keys(grupos).sort().map(g => `<optgroup label="${esc(nomeGrupo[g])}">${grupos[g].map(p => `<option value="${esc(p.nome)}">${esc(p.nome)}${p.lider ? " (líder)" : ""}</option>`).join("")}</optgroup>`).join("");
    return `<select class="pl-add" data-papel="${papel}" aria-label="${papel === "resp" ? "Trocar responsável" : "Adicionar à equipe"}"><option value="">${papel === "resp" ? (e.responsavel ? "trocar" : "+ responsável") : "+ pessoa"}</option>${opts}</select>`;
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
  }
  function salvar(e,novo){
    if(!podeEditar(e))return;
    const anterior={...escala(e),avisos:[...(e.avisos||[])],conflitos:[...(e.conflitos||[])]};
    novo={responsavel:novo.responsavel,equipe:[...new Set(novo.equipe)],caminhoes:[...new Set(novo.caminhoes)]};
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
    const card = el.closest(".pl-etapa");
    return card && dados.etapas.find(e => e.id === card.dataset.id);
  }

  $("plDias").addEventListener("change", ev => {
    const sel = ev.target.closest("select.pl-add");
    if (!sel || !sel.value) return;
    const e = etapaDo(sel);
    if (!e || e.somente_consulta) return;
    const novo = { responsavel: e.responsavel, equipe: e.equipe.slice(), caminhoes: e.caminhoes.slice() };
    if (sel.dataset.papel === "resp") {
      if (e.responsavel) novo.equipe = novo.equipe.filter(n => chave(n) !== chave(sel.value));
      novo.responsavel = sel.value;
      novo.equipe = novo.equipe.filter(n => chave(n) !== chave(sel.value));
    } else if (sel.dataset.papel === "equipe") novo.equipe.push(sel.value);
    else novo.caminhoes.push(sel.value);
    salvar(e, novo);
  });

  $("plDias").addEventListener("click", ev => {

    const liberar=ev.target.closest('[data-liberar-edicao]');
    if(liberar){if(salvando)return;const id=liberar.dataset.liberarEdicao;edicoesLiberadas.has(id)?edicoesLiberadas.delete(id):edicoesLiberadas.add(id);desenhar();document.querySelector('[data-liberar-edicao="'+CSS.escape(id)+'"]')?.focus();return;}
    const vaga=ev.target.closest('.pl-vaga.is-vazia');
    if(vaga){const e=etapaDo(vaga);if(!podeEditar(e))return;abaRecursos=vaga.classList.contains('pl-vaga-cam')?'cam':'interna';recursosAbertos=true;desenhar();return;}
    if (ev.target.closest('[data-fechar-disponiveis]')) { $('plDisponiveisDialog').close(); return; }

    const aba=ev.target.closest('[data-aba-recurso]');if(aba){abaRecursos=aba.dataset.abaRecurso;desenhar();$('plRecursoTab-'+abaRecursos).focus();return;}
    const selecionado=ev.target.closest('[data-selecionar]');
    if(selecionado){etapaSelecionada=selecionado.dataset.selecionar;desenhar();return;}
    const recurso=ev.target.closest('[data-recurso]');
    if(recurso){const e=dados.etapas.find(e=>e.id===etapaSelecionada);if(!podeEditar(e))return;const novo={responsavel:e.responsavel,equipe:e.equipe.slice(),caminhoes:e.caminhoes.slice()};if(recurso.dataset.recurso==='cam')novo.caminhoes.push(recurso.dataset.valor);else if(!e.responsavel&&pessoaInfo(recurso.dataset.valor)?.lider)novo.responsavel=recurso.dataset.valor;else novo.equipe.push(recurso.dataset.valor);salvar(e,novo);return;}
    const b = ev.target.closest('button[data-acao="tirar"]');
    if (!b) return;
    const e = etapaDo(b);
    const novo = { responsavel: e.responsavel, equipe: e.equipe.slice(), caminhoes: e.caminhoes.slice() };
    if (b.dataset.papel === "resp") novo.responsavel = "";
    else if (b.dataset.papel === "equipe") novo.equipe = novo.equipe.filter(n => n !== b.dataset.nome);
    else novo.caminhoes = novo.caminhoes.filter(c => c !== b.dataset.nome);
    salvar(e, novo);
  });

  $('plDias').addEventListener('keydown',ev=>{const vaga=ev.target.closest('.pl-vaga[role=button]');if(vaga&&['Enter',' '].includes(ev.key)){ev.preventDefault();vaga.click();return;}const tab=ev.target.closest('[data-aba-recurso]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const tabs=[...document.querySelectorAll('[data-aba-recurso]')],i=tabs.indexOf(tab),n=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[n].click();});
  $('plDias').addEventListener('error',ev=>{if(ev.target.matches('.pl-avatar img,.pl-recurso-foto img,.pl-caminhao-icone img'))ev.target.remove();},true);
  document.querySelector('[data-abrir-disponiveis]').onclick = () => {
    const dialog = $('plDisponiveisDialog');
    if (!dialog) return;
    recursosAbertos = true; dialog.showModal();
  };
  $("plPreencher").onclick = () => carregar(true);


  window.addEventListener('beforeunload',ev=>{if(!filaSalvamentos.length)return;ev.preventDefault();ev.returnValue='';});
  window.addEventListener('escala-parametros-alterados',()=>carregar(false));
  window.PainelLogisticoEquipe = { iniciar: () => carregar(false), carregarMais, definirDia: dia => { diaSelecionado=dia;etapaSelecionada=null;if(dados)desenhar(); } };
  if (!document.getElementById("plModuloAbas")) carregar(false);
})();
