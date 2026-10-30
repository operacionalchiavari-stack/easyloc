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
  let inicio = segundaOuHoje(new Date());
  let dados = null;
  let salvando = false;
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
    mostrarErro("");
    $("plPreencher").disabled = true;
    try {
      if(preencher){const resultado=await chamar('ESC_painel',diaSelecionado||inicio,1,true);aviso(resultado.preenchidas?resultado.preenchidas+(resultado.preenchidas===1?' etapa preenchida':' etapas preenchidas'):'Nada vazio para preencher neste dia');}
      dados = await buscarFaixa(inicio, totalDias);
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
  async function carregarMais() {
    if (carregandoMais || !dados) return;
    carregandoMais = true;
    window.PainelLogisticoDias?.carregando(true);
    try {
      const mais = await buscarFaixa(somar(dados.inicio, totalDias), BLOCO);
      dados = juntar(dados, mais);
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
    indicador.textContent=String(planejamento.length);
    indicador.hidden=planejamento.length===0;
    $('plTabEquipe').title=planejamento.length+' opera??es de montagem de equipe';
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
    $('plDias').innerHTML=`<div class="pl-planejamento"><section class="pl-planejamento-lista pl-painel"><header class="pl-painel-cab"><div><small>${diaSemana(diaSelecionado)} · ${br(diaSelecionado)}</small><h2>Montagens e desmontagens</h2></div><b>${principais.length}</b></header><div class="pl-servicos-lista">${principais.map(servico).join('')||'<p class="pl-vazio">Nenhuma montagem ou desmontagem neste dia.</p>'}</div></section><div class="pl-planejamento-edicao">${atual?cartao(atual):'<section class="pl-painel"><p class="pl-vazio">'+'Selecione uma etapa para montar a equipe e distribuir os caminhões.'+'</p></section>'}</div><aside class="pl-planejamento-recursos">${recursosDoDia(doDia,atual)}</aside></div>`;
  }

  function servico(e){return `<button type="button" class="pl-servico ${e.id===etapaSelecionada?'is-selecionado':''}" data-selecionar="${esc(e.id)}" data-tipo="${esc(e.tipo)}" aria-pressed="${e.id===etapaSelecionada}"><span class="pl-etapa-linha1"><b class="pl-hora">${esc(e.hora||'--:--')}</b><span class="pl-tipo pl-tipo-${esc(e.tipo)}">${esc(e.etapa)}</span><b class="pl-pedido-numero">Pedido #${esc(String(e.pedido||"-").replace(/^#/,""))}</b></span><strong>${esc(e.cliente)}</strong><span class="pl-local">${esc(e.local)}</span><small>${e.m3||0} m³ · ${(e.responsavel?1:0)+e.equipe.length}/${e.sugerido} pessoas · ${e.caminhoes.length} caminhão(ões)</small>${e.somente_consulta?'<span class="pl-consulta">Pré-reserva · somente consulta</span>':escalaCompleta(e)?'<span class="pl-situacao-ok pl-equipe-completa">✓ Equipe e caminhões completos</span>':''}</button>`;}

  function fotoRecurso(p,tipo){const url=p.foto_url||'';return '<div class="pl-recurso-foto">'+(tipo==='cam'?iconeCam:iconePessoa)+(/^https?:\/\//i.test(url)?'<img src="'+esc(url)+'" alt="'+esc(p.nome||p.codigo)+'" loading="lazy">':'')+'</div>';}
  function recursosDoDia(etapas,atual){
    etapas=dados.ocupacoes?dados.ocupacoes.filter(e=>e.data===diaSelecionado):etapas;
    const pessoasUsadas=new Set(etapas.flatMap(e=>[e.responsavel,...e.equipe]).filter(Boolean).map(chave)),camsUsados=new Set(etapas.flatMap(e=>e.caminhoes).map(chave));
    const pessoas=dados.pessoas.filter(p=>!pessoasUsadas.has(chave(p.nome))),cams=dados.caminhoes.filter(c=>c.codigo&&!camsUsados.has(chave(c.codigo)));
    const editavel=atual&&!atual.passada&&!atual.somente_consulta&&!salvando,usaCam=atual&&!atual.servico&&dados.regras.etapas[atual.tipo]?.caminhao;
    const grupos=[['cam','Caminhões',cams],['interna','Equipe interna',pessoas.filter(p=>!p.free)],['free','Equipe Free',pessoas.filter(p=>p.free)]];
    const [tipo,nome,lista]=grupos.find(g=>g[0]===abaRecursos);
    const linhas=lista.map(p=>tipo==='cam'?`<div class="pl-recurso">${fotoRecurso(p,'cam')}<div><strong>${esc(p.codigo)}</strong><small>${esc(p.modelo)}${p.capacidade?' · '+p.capacidade+' m³':''}</small>${p.placa?`<small>${esc(p.placa)}</small>`:''}</div><button type="button" data-recurso="cam" data-valor="${esc(p.codigo)}" aria-label="Alocar caminhão ${esc(p.codigo)}" ${editavel&&usaCam?'':'disabled'}>+</button></div>`:`<div class="pl-recurso">${fotoRecurso(p,'pessoa')}<div><strong>${esc(p.nome)}</strong><small>${p.free?'Free':esc(EQUIPE[p.equipe]||'Equipe')}${p.lider?' · Líder':''}</small></div><button type="button" data-recurso="equipe" data-valor="${esc(p.nome)}" aria-label="Adicionar ${esc(p.nome)} à equipe" ${editavel?'':'disabled'}>+</button></div>`).join('');
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
    const editavel=!e.passada&&!e.somente_consulta,usaCaminhao=!e.servico&&!!dados.regras.etapas[e.tipo]?.caminhao,equipeTipo=dados.regras.etapas[e.tipo]?.equipe;
    const total=(e.responsavel?1:0)+e.equipe.length;
    const remover=(nome,papel)=>editavel?`<button type="button" class="pl-vaga-remover" aria-label="Tirar ${esc(nome)}" data-acao="tirar" data-papel="${papel}" data-nome="${esc(nome)}">×</button>`:'';
    const vagaPessoa=(nome,papel)=>{
      const p=pessoaInfo(nome),foto=p?.foto_url||p?.fotoUrl||p?.miniatura||'',url=/^https?:\/\//i.test(foto)?foto:'';
      return `<div class="pl-vaga pl-vaga-pessoa ${nome?'is-preenchida':'is-vazia'}"><div class="pl-avatar">${iconePessoa}${nome&&url?`<img src="${esc(url)}" alt="${esc(nome)}" loading="lazy">`:''}</div><strong>${esc(nome||(papel==='resp'?'Responsável':'Selecionar pessoa'))}</strong><small>${papel==='resp'?'Líder da equipe':nome?(p?.free?'Free':'Equipe'):'Vaga disponível'}</small>${nome?remover(nome,papel):''}</div>`;
    };
    const vagasEquipe=e.equipe.map(n=>vagaPessoa(n,'equipe')).join('')+Array.from({length:Math.max(0,(Number(e.sugerido)||1)-1-e.equipe.length)},()=>vagaPessoa('','equipe')).join('');
    const plano=planoCaminhoes(e),restantes=e.caminhoes.map(c=>caminhaoInfo(c)||{codigo:c,capacidade:0});
    const vagaCam=(c,alocado)=>`<div class="pl-vaga pl-vaga-cam ${alocado?'is-preenchida':'is-vazia'}"><div class="pl-caminhao-icone">${iconeCam}${alocado&&/^https?:\/\//i.test(c.foto_url||'')?`<img src="${esc(c.foto_url)}" alt="${esc(c.codigo)}">`:''}</div><strong>${esc(alocado?c.codigo:c.capacidade?'Caminhão · '+c.capacidade+' m³':'Selecionar caminhão')}</strong><small>${esc(alocado?(c.modelo||'Caminhão selecionado'):'A preencher')}</small>${alocado?remover(c.codigo,'cam'):''}</div>`;
    const camVagas=plano.vagas.map(v=>{let i=restantes.findIndex(c=>c.capacidade>=v.capacidade);return i>=0?vagaCam(restantes.splice(i,1)[0],true):vagaCam(v,false);}).join('')+restantes.map(c=>vagaCam(c,true)).join('');
    return `<article class="pl-etapa pl-painel${e.passada?' is-passada':''}" data-id="${esc(e.id)}"><header class="pl-painel-cab"><h2>Montagem da equipe</h2>${equipeCompleta(e)?'<span class="pl-equipe-completa">✓ Equipe completa</span>':''}${e.somente_consulta?'<span class="pl-consulta">Pré-reserva · somente consulta</span>':''}<b>${total}/${e.sugerido}</b></header><div class="pl-etapa-escala"><div class="pl-vagas">${vagaPessoa(e.responsavel,'resp')}${vagasEquipe}</div></div><section class="pl-distribuicao"><header class="pl-painel-cab"><h2>Distribuição de caminhões</h2><b>${e.caminhoes.length}/${usaCaminhao?plano.vagas.length:0}</b></header><div class="pl-etapa-escala">${usaCaminhao||e.caminhoes.length?`<p class="pl-dica">Volume a transportar: ${esc(e.m3||0)} m³ · vagas sugeridas pela capacidade cadastrada.</p><div class="pl-vagas">${camVagas}</div>${plano.insuficiente?'<small class="pl-dica">Capacidade cadastrada insuficiente para completar a sugestão de transporte.</small>':''}`:'<p class="pl-dica">Esta etapa não exige caminhão.</p>'}</div></section></article>`;
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

  async function salvar(e, novo, forcar) {
    if (salvando || e.somente_consulta) return;
    salvando = true;
    document.querySelectorAll(`.pl-etapa[data-id="${CSS.escape(e.id)}"]`).forEach(el=>el.classList.add("is-salvando"));
    try {
      const r = await chamar("ESC_salvarEtapa", e.id, novo, !!forcar);
      if (!r.ok) {
        salvando = false;
        const sim = await confirmarConflito(r.conflitos);
        if (sim) return salvar(e, novo, true);
        desenhar();
        return;
      }
      aviso(r.conflitos && r.conflitos.length ? "Salvo com conflito" : "Escala salva");
      salvando = false;
      await carregar(false);
    } catch (err) {
      mostrarErro(err.message || "Não foi possível salvar.");
      desenhar();
    } finally { salvando = false; }
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
    const aba=ev.target.closest('[data-aba-recurso]');if(aba){abaRecursos=aba.dataset.abaRecurso;desenhar();$('plRecursoTab-'+abaRecursos).focus();return;}
    const selecionado=ev.target.closest('[data-selecionar]');
    if(selecionado){etapaSelecionada=selecionado.dataset.selecionar;desenhar();return;}
    const recurso=ev.target.closest('[data-recurso]');
    if(recurso){const e=dados.etapas.find(e=>e.id===etapaSelecionada);if(!e||e.passada)return;const novo={responsavel:e.responsavel,equipe:e.equipe.slice(),caminhoes:e.caminhoes.slice()};if(recurso.dataset.recurso==='cam')novo.caminhoes.push(recurso.dataset.valor);else if(!e.responsavel&&pessoaInfo(recurso.dataset.valor)?.lider)novo.responsavel=recurso.dataset.valor;else novo.equipe.push(recurso.dataset.valor);salvar(e,novo);return;}
    const b = ev.target.closest('button[data-acao="tirar"]');
    if (!b) return;
    const e = etapaDo(b);
    const novo = { responsavel: e.responsavel, equipe: e.equipe.slice(), caminhoes: e.caminhoes.slice() };
    if (b.dataset.papel === "resp") novo.responsavel = "";
    else if (b.dataset.papel === "equipe") novo.equipe = novo.equipe.filter(n => n !== b.dataset.nome);
    else novo.caminhoes = novo.caminhoes.filter(c => c !== b.dataset.nome);
    salvar(e, novo);
  });

  $('plDias').addEventListener('keydown',ev=>{const tab=ev.target.closest('[data-aba-recurso]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const tabs=[...document.querySelectorAll('[data-aba-recurso]')],i=tabs.indexOf(tab),n=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[n].click();});
  $('plDias').addEventListener('error',ev=>{if(ev.target.matches('.pl-avatar img,.pl-recurso-foto img,.pl-caminhao-icone img'))ev.target.remove();},true);
  $("plPreencher").onclick = () => carregar(true);


  window.addEventListener('escala-parametros-alterados',()=>carregar(false));
  window.PainelLogisticoEquipe = { iniciar: () => carregar(false), carregarMais, definirDia: dia => { diaSelecionado=dia;etapaSelecionada=null;if(dados)desenhar(); } };
  if (!document.getElementById("plModuloAbas")) carregar(false);
})();
