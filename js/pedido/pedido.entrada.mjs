// Entrada comercial do pedido: dados do evento e ferramentas do pedido.
// A barra de cima (out/2026, pedido do usuário) segue o cabeçalho do catálogo: as etapas já vistas ficam à esquerda,
// a atual no centro em destaque e as próximas à direita; trocar de etapa anima o nome (técnica FLIP, sem biblioteca).
// "Módulo 3D" (out/2026): o 3D Livre dentro do pedido; o que for adicionado ao projeto lá entra no pedido da cliente.
const ETAPAS=[{id:'dados',nome:'Dados do pedido'},{id:'catalogo',nome:'Catálogo'},{id:'modulo3d',nome:'3D'},{id:'plantas',nome:'Plantas'},{id:'lista',nome:'Ambientes e lista'},{id:'financeiro',nome:'Financeiro e pagamentos'},{id:'contrato',nome:'Contrato'},{id:'pedido',nome:'Pedido'}];

export function iniciarEntradaComercial(vitrine){
  const tela=document.querySelector('.pedido-screen');
  if(!tela)return;
  const info=tela.querySelector('.pedido-info-card');
  if(!info)return;
  const origem=info.parentNode,seguinte=info.nextSibling;
  const entrada=document.createElement('section');
  entrada.className='pedido-entrada';
  entrada.innerHTML='<div class="pedido-entrada-shell"><div class="entrada-formulario"><div class="entrada-campos"></div></div></div>';
  tela.prepend(entrada);tela.classList.add('em-entrada');

  /* ---------- barra de etapas no topo ---------- */
  const trilha=document.createElement('div');trilha.className='comercial-trilha';trilha.setAttribute('role','navigation');trilha.setAttribute('aria-label','Etapas do pedido');
  trilha.innerHTML='<button type="button" class="ct-voltar">← Voltar</button><div class="ct-linha"><div class="ct-antes"></div><h2 class="ct-atual" aria-live="polite"></h2><div class="ct-depois"></div></div><div class="ct-direita"><div class="ct-ferramentas" role="group" aria-label="Ferramentas de criação"><button type="button" data-etapa="modulo3d">3D</button></div><div class="ct-acoes"><span class="ct-numero" aria-live="polite" aria-atomic="true"></span><button type="button" class="ct-avancar"></button></div></div><p class="ct-erro" role="alert"></p>';
  tela.prepend(trilha);
  const sublocacao=tela.querySelector('[data-sublocacoes="atual"]');
  if(sublocacao)trilha.querySelector('.ct-ferramentas').append(sublocacao);
  const voltarStatus=document.createElement('div');voltarStatus.className='ct-voltar-status';
  const voltar=trilha.querySelector('.ct-voltar');voltar.before(voltarStatus);voltarStatus.append(voltar);
  const statusPedido=document.getElementById('pedidoStatus');
  if(statusPedido){
    statusPedido.hidden=true;
    const seletor=document.createElement('select');seletor.id='pedidoStatusComercial';seletor.className='ct-status-select';seletor.setAttribute('aria-label','Alterar status do pedido');
    for(const [value,label] of [['orcamento','Orçamento'],['pre_reserva','Pré-reserva'],['aprovado','Reservado'],['cancelado','Cancelado']]){
      seletor.add(new Option(label,value));
    }
    // Pré-reserva tem validade (out/2026): ao escolher "Pré-reserva" aparece "até [data]" ao lado, obrigatório para salvar.
    const statusCard=document.createElement('div');statusCard.className='ct-status-card';
    const validade=document.createElement('label');validade.className='ct-pre-reserva';validade.hidden=true;
    validade.innerHTML='<input type="date" id="preReservaAte" aria-label="Pré-reserva válida até">';
    const sincronizar=()=>{
      const status=window.__PEDIDO_STATUS_ATUAL || document.querySelector('.timeline-step.active')?.dataset.status || 'orcamento';
      seletor.value=status;seletor.dataset.status=status;statusCard.dataset.status=status;
      validade.hidden=status!=='pre_reserva';
    };
    new MutationObserver(sincronizar).observe(statusPedido,{childList:true,characterData:true,subtree:true});
    seletor.addEventListener('change',()=>{
      const alvo=seletor.value;sincronizar();
      document.querySelector('.timeline-step[data-status="'+alvo+'"]')?.click();
      sincronizar();
      // a troca de status termina um instante depois (confere o contrato); só então mostra e foca a data
      if(alvo==='pre_reserva')(async()=>{for(let i=0;i<20 && validade.hidden;i++){await new Promise(r=>setTimeout(r,50));sincronizar();}const campo=validade.querySelector('input');if(!validade.hidden && !campo.value){campo.focus();try{campo.showPicker?.();}catch{}}})();
    });
    statusCard.append(seletor,validade);voltarStatus.append(statusCard);sincronizar();
  }

  const financeiro=document.createElement('section');financeiro.className='pedido-etapa-financeiro';financeiro.hidden=true;
  financeiro.setAttribute('aria-label','Financeiro e programação de pagamentos');
  const programacao=tela.querySelector('.pagamento-card');
  const resumo=tela.querySelector('.pedido-financeiro');
  // Frete e Montagem (out/2026, pedido do usuário): ficam no Financeiro e pagamentos, na coluna da direita, logo abaixo do
  // "Resumo do pedido" (os próprios cartões do pedido, com caminhões, volume, distância, ajuste manual e montagem).
  if(programacao)financeiro.append(programacao);
  if(resumo)financeiro.append(resumo);
  tela.append(financeiro);
  // Três colunas (out/2026, pedido do usuário): parcelas | Frete em cima e Resumo embaixo | Montagem em cima e BV embaixo.
  // O card do BV é criado por pedido.bv.mjs; o observador põe cada card na sua coluna, não importa a ordem.
  if(resumo){
    const colA=document.createElement('div');colA.className='pf-col pf-col-a';
    const colB=document.createElement('div');colB.className='pf-col pf-col-b';
    resumo.append(colA,colB);
    const organizar=()=>{
      [['#cardLogisticaPedido',colA],['.resumo-card',colA],['#cardMontagemPedido',colB],['.pedido-bv-card',colB]].forEach(([sel,col])=>{
        // reanexa na ordem certa (o observador só olha os filhos diretos, então não entra em laço)
        const el=resumo.querySelector(sel);if(el)col.append(el);
      });
    };
    organizar();
    new MutationObserver(organizar).observe(resumo,{childList:true});
  }
  const contrato=document.createElement('section');contrato.className='pedido-etapa-contrato';contrato.hidden=true;
  contrato.setAttribute('aria-label','Contrato do pedido');
  const contratoCard=tela.querySelector('#pedidoContratoCard');
  if(contratoCard)contrato.append(contratoCard);
  tela.append(contrato);
  let etapaAtual='dados';
  const reduzido=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Avisos da barra (dado faltando, financeiro pendente, erro ao salvar) vão para o alerta global do sistema (out/2026);
  // a faixa .ct-erro embaixo do Salvar só é usada se o alerta global não estiver carregado.
  const erroTrilha=texto=>{
    const faixa=trilha.querySelector('.ct-erro');
    if(!texto){faixa.textContent='';return;}
    if(typeof window.alerta==='function'){faixa.textContent='';window.alerta(texto,'Pedido','aviso');}
    else faixa.textContent=texto;
  };
  function medir(){
    const mapa=new Map();
    trilha.querySelectorAll('.ct-linha [data-etapa]').forEach(el=>mapa.set(el.dataset.etapa,el.getBoundingClientRect()));
    return mapa;
  }
  function pintarTrilha(animar){
    const antes=animar && !reduzido()?medir():null;
    // Etapas da barra (out/2026): Catálogo logo depois de Dados do pedido e Plantas depois de Ambientes e lista; o 3D continua como ferramenta.
    const passos=['dados','catalogo','lista','plantas','financeiro','contrato','pedido'].map(id=>ETAPAS.find(e=>e.id===id));
    const i=passos.findIndex(e=>e.id===etapaAtual);
    const ferramenta=i<0;
    trilha.querySelectorAll('.ct-ferramentas button').forEach(b=>{b.classList.toggle('is-active',b.dataset.etapa===etapaAtual);b.setAttribute('aria-pressed',String(b.dataset.etapa===etapaAtual));});
    trilha.querySelector('.ct-antes').innerHTML=(ferramenta ? passos : passos.slice(0,i)).map(e=>'<button type="button" class="ct-passo" data-etapa="'+e.id+'">'+e.nome+'</button>').join('');
    trilha.querySelector('.ct-depois').innerHTML=(ferramenta ? [] : passos.slice(i+1)).map(e=>'<button type="button" class="ct-passo ct-futuro" data-etapa="'+e.id+'">'+e.nome+'</button>').join('');
    const atual=trilha.querySelector('.ct-atual');atual.textContent=ETAPAS.find(e=>e.id===etapaAtual).nome;atual.dataset.etapa=etapaAtual;
    trilha.querySelector('.ct-avancar').textContent='Salvar';
    if(!antes)return;
    trilha.querySelectorAll('.ct-linha [data-etapa]').forEach(el=>{
      const de=antes.get(el.dataset.etapa),para=el.getBoundingClientRect();
      if(!de || !para.width)return;
      const dx=(de.left+de.width/2)-(para.left+para.width/2),dy=(de.top+de.height/2)-(para.top+para.height/2);
      el.animate([{transform:`translate(${dx}px,${dy}px) scale(${de.width/para.width})`},{transform:'none'}],{duration:640,easing:'cubic-bezier(.22,1,.36,1)'});
    });
  }
  const atualizarNumero=()=>{
    const valor=document.getElementById('orcamentoNumero')?.textContent.trim();
    const numero=trilha.querySelector('.ct-numero');
    const label=document.createElement('span');label.textContent='Pedido';
    const destaque=document.createElement('strong');destaque.textContent=valor || 'Novo';
    numero.replaceChildren(label,destaque);
  };
  atualizarNumero();
  const numeroOriginal=document.getElementById('orcamentoNumero');
  if(numeroOriginal)new MutationObserver(atualizarNumero).observe(numeroOriginal,{childList:true,subtree:true,characterData:true});


  /* ---------- formulário de dados (mesmos campos da tela antiga) ---------- */
  entrada.querySelector('.entrada-campos').appendChild(info);
  const identidade=document.createElement('div');identidade.className='entrada-identidade';
  identidade.innerHTML='<div class="entrada-retrato"><span>+</span></div><div><small>CLIENTE / DECORADORA</small><h3>Quem assina este evento?</h3><p>Selecione o cliente para trazer sua identidade ao projeto.</p></div>';
  info.prepend(identidade);
  const composicao=document.createElement('div');composicao.className='entrada-composicao';
  const dados=document.createElement('div');dados.className='entrada-dados';
  const local=document.createElement('div');local.className='entrada-destino';
  dados.innerHTML='<div class="entrada-bloco-titulo"><span>01</span><div><h3>O evento</h3><p>Uma boa experiência começa pelos detalhes.</p></div></div>';
  local.innerHTML='<div class="entrada-bloco-titulo"><span>02</span><div><h3>O cenário</h3><p>Onde vamos transformar este projeto em realidade.</p></div></div>';
  dados.appendChild(info.querySelector('.pedido-meta-strip'));local.appendChild(info.querySelector('.pedido-location-strip'));
  composicao.append(dados,local);info.appendChild(composicao);
  const cabecalhoLocal=local.querySelector('.entrada-bloco-titulo');
  cabecalhoLocal.classList.add('entrada-cenario-topo');
  cabecalhoLocal.appendChild(local.querySelector('.location-field'));
  dados.appendChild(info.querySelector('.pedido-observacoes-evento'));
  const agenda=document.createElement('div');agenda.className='entrada-agenda';
  let cardEvento=null;
  // pedido do usuário: "primeiro a pessoa deve preencher a data do evento e só depois entrega e coleta"
  for(const [titulo,dataId,horaId] of [['Evento','dataEvento',null],['Entrega','dataEntrega','horaEntrega'],['Coleta','dataColeta','horaColeta']]){
    const card=document.createElement('section');card.className='entrada-data-card';
    const tituloCard=document.createElement('h4');tituloCard.textContent=titulo;card.appendChild(tituloCard);
    card.appendChild(document.getElementById(dataId).closest('.meta-item'));
    if(horaId)card.appendChild(document.getElementById(horaId).closest('.meta-item'));
    /* o título do card já diz de qual data é: rótulos curtos ("Data", "Horário") */
    for(const span of card.querySelectorAll('.meta-item>span'))span.textContent=span.textContent.includes('Hor')?'Horário':'Data';
    if(dataId==='dataEvento')cardEvento=card;
    agenda.appendChild(card);
  }
  identidade.appendChild(agenda);

  /* Evento de um dia ou de vários dias (out/2026): "Um dia" usa só a data; "Vários dias" mostra "Até". */
  const fimItem=document.getElementById('dataEventoFim')?.closest('.meta-item');
  if(cardEvento && fimItem){
    cardEvento.classList.add('entrada-card-evento');
    const cabeca=document.createElement('div');cabeca.className='entrada-data-head';
    cabeca.appendChild(cardEvento.querySelector('h4'));
    const modo=document.createElement('div');modo.className='evento-modo';modo.setAttribute('role','group');modo.setAttribute('aria-label','Duração do evento');
    modo.innerHTML='<button type="button" data-modo="dia">Um dia</button><button type="button" data-modo="periodo">Vários dias</button>';
    cabeca.appendChild(modo);cardEvento.prepend(cabeca);cardEvento.appendChild(fimItem);
    const rotuloInicio=document.getElementById('dataEvento').closest('.meta-item').querySelector('span');
    const definirModo=m=>{
      const periodo=m==='periodo';
      cardEvento.classList.toggle('is-periodo',periodo);fimItem.hidden=!periodo;
      if(rotuloInicio)rotuloInicio.textContent=periodo?'Primeiro dia':'Data';
      window.__pedidoSincronizarDatas?.();
      modo.querySelectorAll('button').forEach(b=>{const ativo=b.dataset.modo===m;b.classList.toggle('is-ativo',ativo);b.setAttribute('aria-pressed',String(ativo));});
    };
    modo.addEventListener('click',e=>{const b=e.target.closest('[data-modo]');if(!b)return;definirModo(b.dataset.modo);window.__pedidoHouveEdicao?.();if(b.dataset.modo==='periodo')document.getElementById('dataEventoFim')?.focus();});
    window.__definirModoEvento=definirModo;
    definirModo(document.getElementById('dataEventoFim').value?'periodo':'dia');
  }

  /* Regras de data (out/2026, pedido do usuário):
     - entrega e coleta só depois da data do evento (ficam travadas até ela);
     - entrega nunca depois do evento e coleta nunca antes do último dia (o calendário já limita e o salvar confere);
     - entrega mais de 2 dias antes do evento, ou coleta mais de 2 dias depois do último dia, pergunta "tem certeza?". */
  const DIAS_FOLGA=2;
  const elData=id=>document.getElementById(id);
  const somarDias=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
  const dataBr=iso=>iso.split('-').reverse().join('/');
  const ultimoDiaEvento=()=>(fimItem && !fimItem.hidden && elData('dataEventoFim')?.value) || elData('dataEvento')?.value || '';
  // pedido extra (out/2026): coleta e evento seguem o principal; a entrega pode ser até a coleta
  const ehExtra=()=>!!window.__pedidoExtra;
  function sincronizarDatas(){
    const evento=elData('dataEvento')?.value||'',ultimo=ultimoDiaEvento();
    for(const id of ['dataEntrega','horaEntrega','dataColeta','horaColeta']){
      const el=elData(id);if(!el)continue;
      el.disabled=!evento || (ehExtra() && (id==='dataColeta'||id==='horaColeta'));
      el.title=evento?'':'Preencha primeiro a data do evento';
    }
    document.querySelectorAll('.entrada-data-card').forEach(card=>card.classList.toggle('aguardando-evento',!evento && !card.contains(elData('dataEvento'))));
    if(elData('dataEntrega'))elData('dataEntrega').max=(ehExtra()?elData('dataColeta')?.value:evento)||'';
    if(elData('dataColeta'))elData('dataColeta').min=ultimo||'';
  }
  window.__pedidoSincronizarDatas=sincronizarDatas;
  const coletaMesmoDia=document.createElement('button');coletaMesmoDia.type='button';coletaMesmoDia.className='coleta-mesmo-dia';coletaMesmoDia.textContent='Coletar no dia do evento';
  coletaMesmoDia.style.cssText='border:0;background:transparent;color:#123f86;font:12px Inter,system-ui;cursor:pointer;padding:8px 0;text-align:left';
  elData('dataColeta')?.closest('.entrada-data-card')?.append(coletaMesmoDia);
  coletaMesmoDia.addEventListener('click',()=>{sincronizarDatas();const el=elData('dataColeta');if(el.disabled)return;el.value=ultimoDiaEvento();window.__pedidoHouveEdicao?.();el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));elData('horaColeta')?.focus();});
  elData('dataColeta')?.addEventListener('focus',sincronizarDatas);
  const perguntar=async(texto,titulo)=>window.confirmarGlobal?await window.confirmarGlobal(texto,titulo):window.confirm(texto);
  const aceitas=new Set(),conferindo=new Set();
  async function conferirData(el,tipo){conferindo.add(el);try{await conferirData_(el,tipo);}finally{conferindo.delete(el);}}
  async function conferirData_(el,tipo){
    const v=el.value,evento=elData('dataEvento')?.value,ultimo=ultimoDiaEvento();
    const anterior=el.dataset.valorConferido||'';
    if(!v||!evento){el.dataset.valorConferido=v;return;}
    if(tipo==='entrega' && ehExtra()){
      const coleta=elData('dataColeta')?.value||'';
      if(coleta && v>coleta){el.value=anterior&&anterior<=coleta?anterior:'';window.alerta?.('A entrega do pedido extra precisa ser até a coleta ('+dataBr(coleta)+').','Data de entrega','aviso');el.dispatchEvent(new Event('input',{bubbles:true}));return;}
    }else if(tipo==='entrega'){
      if(v>evento){el.value=anterior&&anterior<=evento?anterior:'';window.alerta?.('A data de entrega não pode ser depois da data do evento ('+dataBr(evento)+').','Data de entrega','aviso');el.dispatchEvent(new Event('input',{bubbles:true}));return;}
      const limite=somarDias(evento,-DIAS_FOLGA);
      if(v<limite && !aceitas.has('entrega:'+v+':'+evento)){
        const ok=await perguntar('A entrega em '+dataBr(v)+' fica mais de '+DIAS_FOLGA+' dias antes do evento ('+dataBr(evento)+'). Normalmente a entrega é até '+DIAS_FOLGA+' dias antes. Tem certeza?','Entrega antecipada');
        if(!ok){el.value=anterior;el.dispatchEvent(new Event('input',{bubbles:true}));return;}
        aceitas.add('entrega:'+v+':'+evento);
      }
    }else{
      if(v<ultimo){el.value=anterior&&anterior>=ultimo?anterior:'';window.alerta?.('A data de coleta não pode ser antes do último dia do evento ('+dataBr(ultimo)+').','Data de coleta','aviso');el.dispatchEvent(new Event('input',{bubbles:true}));return;}
      const limite=somarDias(ultimo,DIAS_FOLGA);
      if(v>limite && !aceitas.has('coleta:'+v+':'+ultimo)){
        const ok=await perguntar('A coleta em '+dataBr(v)+' fica mais de '+DIAS_FOLGA+' dias depois do evento ('+dataBr(ultimo)+'). Normalmente a desmontagem é até '+DIAS_FOLGA+' dias depois. Tem certeza?','Coleta depois do prazo');
        if(!ok){el.value=anterior;el.dispatchEvent(new Event('input',{bubbles:true}));return;}
        aceitas.add('coleta:'+v+':'+ultimo);
      }
    }
    el.dataset.valorConferido=el.value;
  }
  elData('dataEntrega')?.addEventListener('change',e=>conferirData(e.target,'entrega'));
  elData('dataColeta')?.addEventListener('change',e=>conferirData(e.target,'coleta'));
  for(const id of ['dataEvento','dataEventoFim'])elData(id)?.addEventListener('change',sincronizarDatas);
  sincronizarDatas();

  const clienteCampo=document.getElementById('clienteInput');
  // Pendência na programação de pagamento (out/2026: o pedido não salva com ela). Devolve o motivo, ou '' sem pendência.
  const moeda=texto=>Number(String(texto||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;
  const reais=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function pendenciaFinanceiro(){
    const parcelas=[...document.querySelectorAll('#cronogramaParcelas tr')].filter(row=>row.querySelector('.pg-valor'));
    const total=moeda(document.getElementById('pgValorFinal')?.textContent || document.getElementById('resumoTotalGeral')?.textContent);
    const programado=parcelas.reduce((s,row)=>s+moeda(row.querySelector('.pg-valor')?.textContent),0);
    if(total>0 && !parcelas.length)return 'Distribua o pagamento do pedido em Financeiro e pagamentos antes de salvar.';
    if(total-programado>.01)return `Falta distribuir ${reais(total-programado)} na programação de pagamento.`;
    if(programado-total>.01)return `A programação de pagamento passou ${reais(programado-total)} do total do pedido.`;
    const ruim=parcelas.some(row=>{
      const metodo=row.querySelector('.pg-metodo')?.value || row.querySelector('.pg-metodo-text')?.textContent || '';
      return !row.querySelector('.pg-vencimento')?.value || moeda(row.querySelector('.pg-valor')?.textContent)<=0 || !metodo.trim() || /combinar/i.test(metodo);
    });
    return ruim ? 'Há parcela sem vencimento, valor ou forma de pagamento definida em Financeiro e pagamentos.' : '';
  }
  window.__pedidoPendenciaFinanceiro=pendenciaFinanceiro;
  const atualizarPendenciasDados=()=>{
    const financeiroPendente=Boolean(pendenciaFinanceiro());
    trilha.classList.toggle('financeiro-incompleto',financeiroPendente);
    const abaFinanceiro=trilha.querySelector('.ct-linha [data-etapa="financeiro"]');
    if(abaFinanceiro){
      if(financeiroPendente)abaFinanceiro.setAttribute('title','Confira os valores, vencimentos e formas de pagamento da programação.');
      else abaFinanceiro.removeAttribute('title');
    }
    const campos=['clienteInput','telefoneInput','tipoEventoSelect','dataEntrega','horaEntrega','dataEvento','dataColeta','horaColeta','localInput'];
    if(fimItem && !fimItem.hidden)campos.push('dataEventoFim');
    const faltantes=campos.filter(id=>!document.getElementById(id)?.value?.trim());
    sincronizarDatas();
    for(const id of ['dataEntrega','dataColeta']){const el=document.getElementById(id);if(el && document.activeElement!==el && !conferindo.has(el))el.dataset.valorConferido=el.value;}
    trilha.classList.toggle('dados-incompletos',faltantes.length>0);
    const aba=trilha.querySelector('.ct-linha [data-etapa="dados"]');
    if(aba){
      if(faltantes.length)aba.setAttribute('title','Há campos não preenchidos nos dados do pedido.');
      else aba.removeAttribute('title');
    }
  };
  tela.addEventListener('input',atualizarPendenciasDados);
  tela.addEventListener('change',atualizarPendenciasDados);
  // Seleções de cliente/local e carregamento do pedido também preenchem valores por código.
  const intervaloPendencias=setInterval(atualizarPendenciasDados,500);
  window.addEventListener('pagehide',()=>clearInterval(intervaloPendencias),{once:true});
  atualizarPendenciasDados();
  clienteCampo.addEventListener('cliente-selecionado',e=>{
    const c=e.detail,retrato=identidade.querySelector('.entrada-retrato');retrato.replaceChildren();
    // Decoradora solicitante: o catálogo (iframe) mostra a foto dela na lista do pedido.
    window.__pedidoClienteAtual={nome:c.nome_razao || '',foto:/^https?:\/\//i.test(c.catalogo_logo_url || '')?c.catalogo_logo_url:''};
    if(/^https?:\/\//i.test(c.catalogo_logo_url || '')){
      const img=document.createElement('img');img.src=c.catalogo_logo_url;img.alt=c.nome_razao;
      img.onerror=()=>{retrato.textContent=c.nome_razao?.charAt(0) || '?';};retrato.appendChild(img);
    }else retrato.textContent=c.nome_razao?.charAt(0) || '?';
    identidade.querySelector('h3').textContent=c.nome_razao;
    identidade.querySelector('p').textContent=(c.telefone && window.EasyLocMascara ? window.EasyLocMascara.formatar('telefone', c.telefone) : c.telefone) || 'Cliente selecionado para este projeto';
    pintarEtiquetasCliente(c.tags);
  });
  // Nov/2026: etiquetas do cadastro da cliente (estilo, canal, horário, orçamento, comportamento) ao lado do nome.
  const etiquetasCli=document.createElement('div');etiquetasCli.className='entrada-cli-tags';etiquetasCli.hidden=true;
  identidade.querySelector('.entrada-retrato').nextElementSibling.appendChild(etiquetasCli);
  let gruposCli=null;
  async function pintarEtiquetasCliente(tags){
    etiquetasCli.replaceChildren();etiquetasCli.hidden=true;
    if(!tags||typeof tags!=='object')return;
    if(!gruposCli){
      gruposCli=[];
      try{const sb=window.supabaseClient,emp=sessionStorage.getItem('empresa_id');
        const {data}=await sb.from('cadastro_etiquetas').select('grupos').eq('empresa_id',emp).eq('cadastro','cliente').maybeSingle();
        gruposCli=Array.isArray(data?.grupos)?data.grupos:[];}catch(e){console.warn('Etiquetas do cliente:',e);}
    }
    const titulo=k=>gruposCli.find(g=>g.chave===k)?.titulo||k.charAt(0).toUpperCase()+k.slice(1);
    const cor=k=>gruposCli.find(g=>g.chave===k)?.cor||'azul';
    const ordem=[...gruposCli.map(g=>g.chave),...Object.keys(tags).filter(k=>!gruposCli.some(g=>g.chave===k))];
    for(const k of ordem){
      const valores=[].concat(tags[k]??[]).map(v=>String(v||'').trim()).filter(Boolean);
      if(!valores.length)continue;
      const chip=document.createElement('span');chip.className='entrada-cli-tag cor-'+cor(k);
      const r=document.createElement('small');r.textContent=titulo(k);chip.append(r,document.createTextNode(valores.join(' · ')));
      etiquetasCli.appendChild(chip);
    }
    etiquetasCli.hidden=!etiquetasCli.children.length;
  }
  clienteCampo.addEventListener('input',()=>{
    etiquetasCli.replaceChildren();etiquetasCli.hidden=true;
    window.__pedidoClienteAtual=null;
    identidade.querySelector('.entrada-retrato').textContent='+';
    identidade.querySelector('h3').textContent='Quem assina este evento?';
    identidade.querySelector('p').textContent='Selecione o cliente para trazer sua identidade ao projeto.';
  });

  /* ---------- troca de etapa ---------- */
  const frame=()=>vitrine.querySelector('iframe');
  async function esperarCatalogo(fn){
    for(let i=0;i<150;i++){const cw=frame()?.contentWindow;if(cw && typeof cw[fn]==='function')return cw;if(cw?.__catalogoFalhou)throw Error('O catálogo não carregou. Recarregue a página para tentar de novo.');await new Promise(r=>setTimeout(r,100));}
    throw Error('Aguarde o catálogo terminar de carregar.');
  }
  // Dados obrigatórios do pedido (out/2026): cliente, local e as datas de entrega, evento e coleta, em ordem. Sem eles
  // não dá pra consultar a disponibilidade, então também travam o catálogo, a lista, o 3D e as plantas. O banco
  // (pedido_salvar_integrado) confere de novo ao salvar.
  const estilosInvalidos=new WeakMap();
  function marcarInvalido(el,mensagem){
    if(!el)return;
    const host=el.closest('.meta-item,.location-field') || el.parentElement;
    const id='erro-'+el.id;
    let aviso=document.getElementById(id);
    if(!aviso){aviso=document.createElement('small');aviso.id=id;aviso.className='pedido-campo-erro';host.append(aviso);}
    aviso.textContent=mensagem;
    el.classList.add('is-invalido');el.setAttribute('aria-invalid','true');
    if(!estilosInvalidos.has(el)){
      estilosInvalidos.set(el,['border-color','background-color','box-shadow'].map(p=>[p,el.style.getPropertyValue(p),el.style.getPropertyPriority(p)]));
    }
    el.style.setProperty('border-color','#dc2626','important');
    el.style.setProperty('background-color','#fef2f2','important');
    el.style.setProperty('box-shadow','0 0 0 3px rgba(220,38,38,.15)','important');
    const descricoes=(el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if(!descricoes.includes(id))descricoes.push(id);
    el.setAttribute('aria-describedby',descricoes.join(' '));
    const limpar=()=>{
      el.classList.remove('is-invalido');el.removeAttribute('aria-invalid');
      for(const [propriedade,valor,prioridade] of estilosInvalidos.get(el) || []){
        if(valor)el.style.setProperty(propriedade,valor,prioridade);else el.style.removeProperty(propriedade);
      }
      estilosInvalidos.delete(el);
      document.getElementById(id)?.remove();
      const restantes=(el.getAttribute('aria-describedby') || '').split(' ').filter(v=>v && v!==id);
      if(restantes.length)el.setAttribute('aria-describedby',restantes.join(' '));else el.removeAttribute('aria-describedby');
    };
    el.addEventListener('input',limpar,{once:true});el.addEventListener('change',limpar,{once:true});
  }
  // completo:true (ao salvar): todos os dados do pedido são obrigatórios, menos as observações (out/2026).
  function validarDados({completo=false}={}){
    const campo=id=>document.getElementById(id);
    const cliente=campo('clienteInput'),local=campo('localInput'),data=campo('dataEvento'),entrega=campo('dataEntrega'),coleta=campo('dataColeta');
    const focar=el=>{el?.focus({preventScroll:true});el?.scrollIntoView({block:'center',behavior:'smooth'});};
    const falta=(el,msg)=>{marcarInvalido(el,msg);focar(el);return msg;};
    // horários de entrega e coleta também são obrigatórios para avançar (pedido do usuário, out/2026)
    const obrigatorios=[[cliente,'Informe o cliente do pedido.'],[data,'Informe a data do evento.'],[entrega,'Informe a data de entrega.'],[campo('horaEntrega'),'Informe o horário de entrega.'],[coleta,'Informe a data de coleta.'],[campo('horaColeta'),'Informe o horário de coleta.'],[local,'Informe o local do evento.']];
    if(fimItem && !fimItem.hidden)obrigatorios.push([campo('dataEventoFim'),'Informe até quando vai o evento.']);
    if(completo)obrigatorios.splice(1,0,[campo('telefoneInput'),'Informe o telefone / WhatsApp.'],[campo('tipoEventoSelect'),'Escolha o tipo de evento.']);
    const vazios=obrigatorios.filter(([el])=>!el?.value.trim());
    if(vazios.length){
      vazios.forEach(([el,msg])=>marcarInvalido(el,msg));focar(vazios[0][0]);
      return vazios[0][1];
    }
    if(!cliente?.value.trim())return falta(cliente,'Informe o cliente do pedido.');
    if(!data?.value)return falta(data,'Informe a data do evento — sem ela o sistema não consegue ver a disponibilidade.');
    if(fimItem && !fimItem.hidden){
      const fim=campo('dataEventoFim');
      if(!fim.value)return falta(fim,'Informe até quando vai o evento.');
      if(fim.value<=data.value)return falta(fim,'O último dia do evento precisa ser depois do primeiro.');
    }
    if(!entrega?.value)return falta(entrega,'Informe a data de entrega.');
    if(window.__pedidoExtra){if(coleta?.value && entrega.value>coleta.value)return falta(entrega,'A entrega do pedido extra precisa ser até a coleta.');}
    else if(entrega.value>data.value)return falta(entrega,'A entrega precisa ser no dia do evento ou antes.');
    if(!coleta?.value)return falta(coleta,'Informe a data de coleta.');
    const ultimoDia=(fimItem && !fimItem.hidden && campo('dataEventoFim')?.value) || data.value;
    if(coleta.value<ultimoDia)return falta(coleta,'A coleta precisa ser no último dia do evento ou depois.');
    if(!local?.value.trim())return falta(local,'Informe o local do evento.');
    // Nov/2026 (teste do usuário final, item 2): local digitado e não escolhido da lista não tem endereço nem
    // distância, e o frete saía R$ 0,00. Só vale local cadastrado (a lista oferece "+ Cadastrar ... como novo local").
    if(!campo('localIdHidden')?.value)return falta(local,'Escolha o local na lista. Se ele não existir, use "+ Cadastrar como novo local" no fim da lista.');
    return '';
  }
  window.__pedidoValidarDados=validarDados;
  function mostrarCatalogo(){
    contrato.hidden=true;tela.classList.remove('em-contrato');
    financeiro.hidden=true;tela.classList.remove('em-financeiro');
    origem.insertBefore(info,seguinte);
    entrada.hidden=true;tela.classList.remove('em-entrada');tela.classList.add('em-catalogo-comercial');
    const f=frame();if(f && !f.getAttribute('src'))f.src=f.dataset.src;
    window.scrollTo({top:0,behavior:'instant'});
  }
  function mostrarDados(){
    contrato.hidden=true;tela.classList.remove('em-contrato');
    financeiro.hidden=true;tela.classList.remove('em-financeiro');
    entrada.querySelector('.entrada-campos').appendChild(info);entrada.hidden=false;
    entrada.querySelector('.entrada-formulario').hidden=false;
    tela.classList.remove('em-catalogo-comercial');tela.classList.add('em-entrada');window.scrollTo({top:0,behavior:'instant'});
  }
  function mostrarFinanceiro(){
    contrato.hidden=true;tela.classList.remove('em-contrato');
    entrada.hidden=true;financeiro.hidden=false;
    tela.classList.remove('em-entrada','em-catalogo-comercial');tela.classList.add('em-financeiro');
    window.__pedidoAtualizarSaldoCliente?.();
    window.scrollTo({top:0,behavior:'instant'});
  }
  let ocupado=false;
  async function irPara(destino){
    if(ocupado || destino===etapaAtual)return;
    ocupado=true;erroTrilha('');trilha.classList.add('is-ocupado');
    // Nov/2026: a etapa clicada mostra que está abrindo (antes parecia que o clique não tinha pegado).
    const clicados=[...trilha.querySelectorAll('[data-etapa="'+destino+'"]')];clicados.forEach(b=>b.classList.add('is-abrindo'));
    try{
      // Catálogo, lista, 3D, plantas e financeiro só depois dos dados do pedido (a disponibilidade depende deles).
      if(destino!=='dados'){
        const erro=validarDados();
        if(erro){if(etapaAtual!=='dados'){mostrarDados();etapaAtual='dados';pintarTrilha(true);}const el=document.activeElement;throw Object.assign(Error(erro),{campo:el});}
      }
      if(destino==='contrato'){
        const cw=frame()?.contentWindow;
        if(cw?.sincronizarPedidoCatalogo)await cw.sincronizarPedidoCatalogo();
        await window.__pedidoContratoInitPromise;
        await window.__pedidoContratoAtualizar?.();
        entrada.hidden=true;financeiro.hidden=true;contrato.hidden=false;
        tela.classList.remove('em-entrada','em-catalogo-comercial','em-financeiro');tela.classList.add('em-contrato');
        window.scrollTo({top:0,behavior:'instant'});
      }else if(destino==='financeiro'){
        const cw=frame()?.contentWindow;
        if(cw?.sincronizarPedidoCatalogo)await cw.sincronizarPedidoCatalogo();
        mostrarFinanceiro();
      }else if(destino==='dados'){
        const cw=frame()?.contentWindow;
        if(cw?.sincronizarPedidoCatalogo)await cw.sincronizarPedidoCatalogo();
        mostrarDados();
      }else{
        // Prepara a tela solicitada antes de exibir o documento incorporado.
        const f=frame();if(f && !f.getAttribute('src'))f.src=f.dataset.src;
        if(destino==='pedido')await (await esperarCatalogo('abrirPedidoComercialPedido')).abrirPedidoComercialPedido();
        if(destino==='plantas')await (await esperarCatalogo('abrirPlantasComercialPedido')).abrirPlantasComercialPedido();
        if(destino==='modulo3d')await (await esperarCatalogo('abrirModulo3dComercialPedido')).abrirModulo3dComercialPedido();
        if(destino==='catalogo')await (await esperarCatalogo('abrirCatalogoComercialPedido')).abrirCatalogoComercialPedido();
        if(destino==='lista')await (await esperarCatalogo('abrirProjetoComercialPedido')).abrirProjetoComercialPedido();
        mostrarCatalogo();
      }
      etapaAtual=destino;pintarTrilha(true);
    }catch(error){erroTrilha(error.message);}
    finally{ocupado=false;trilha.classList.remove('is-ocupado');trilha.querySelectorAll('.is-abrindo').forEach(b=>b.classList.remove('is-abrindo'));}
  }
  trilha.querySelector('.ct-ferramentas').addEventListener('click',e=>{const b=e.target.closest('button[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-depois').addEventListener('click',e=>{const b=e.target.closest('button[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-antes').addEventListener('click',e=>{const b=e.target.closest('[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-avancar').addEventListener('click',async()=>{
    if(ocupado)return;
    ocupado=true;erroTrilha('');const botao=trilha.querySelector('.ct-avancar');botao.disabled=true;
    try{
      const erro=validarDados({completo:true});
      if(erro){if(etapaAtual!=='dados'){mostrarDados();etapaAtual='dados';pintarTrilha(true);}throw Error(erro);}
      const f=frame();
      // catálogo que não carregou não tem alteração a trazer: o salvar segue sem ele (antes travava para sempre)
      if(f?.getAttribute('src') && !f.contentWindow?.__catalogoFalhou){
        const cw=await esperarCatalogo('sincronizarPedidoCatalogo').catch(e=>{if(f.contentWindow?.__catalogoFalhou)return null;throw e;});
        if(cw)await cw.sincronizarPedidoCatalogo();
      }
      const erroFin=pendenciaFinanceiro();
      if(erroFin){if(etapaAtual!=='financeiro'){mostrarFinanceiro();etapaAtual='financeiro';pintarTrilha(true);}throw Error(erroFin);}
      await window.__salvarPedidoOperacional?.();
    }
    catch(error){erroTrilha(error.message);}
    finally{ocupado=false;botao.disabled=false;}
  });
  // O catálogo (iframe) usa estes dois: "editar dados" volta para a 1ª etapa, e quando a própria tela do
  // catálogo troca entre o acervo e a lista do projeto, a barra acompanha.
  window.__pedidoIrPara=irPara;
  // Janela modal aberta dentro do catálogo do pedido: a área do catálogo ocupa a tela toda (por cima da barra de etapas).
  window.__pedidoCatalogoModal=aberto=>tela.classList.toggle('catalogo-modal-aberto',Boolean(aberto));
  // Voltar navega pelas etapas; nos dados retorna para a Central de pedidos.
  trilha.querySelector('.ct-voltar').onclick=async()=>{
    if(ocupado)return;
    if(etapaAtual==='pedido')return irPara('contrato');
    if(etapaAtual==='contrato')return irPara('financeiro');
    if(etapaAtual==='financeiro')return irPara('plantas');
    if(etapaAtual==='plantas' || etapaAtual==='modulo3d')return irPara('lista');
    if(etapaAtual==='lista')return irPara('catalogo');
    if(etapaAtual==='catalogo'){
      const cw=frame()?.contentWindow;
      if(cw?.voltarCatalogoComercial?.())return;
      return irPara('dados');
    }
    document.getElementById('btnVoltarCentralPedidos')?.click();
  };
  // Atalhos de teclado (out/2026): F2 vai para o Catálogo; F4 vai para o Catálogo e põe o cursor na pesquisa
  // (Alt+C/Alt+P continuam valendo).
  // Também chegam aqui quando o cursor está dentro do catálogo (o iframe repassa por window.__pedidoAtalho).
  const btnCatalogo=trilha.querySelector('.ct-ferramentas [data-etapa="catalogo"]');
  if(btnCatalogo){btnCatalogo.title='Catálogo (F2) · pesquisar no catálogo (F4)';btnCatalogo.setAttribute('aria-keyshortcuts','F2');btnCatalogo.insertAdjacentHTML('beforeend','<kbd class="ct-kbd">F2</kbd>');}
  window.__pedidoAtalho=async acao=>{
    if(etapaAtual==='catalogo'){if(acao==='catalogo')await frame()?.contentWindow?.abrirCatalogoComercialPedido?.();}
    else await irPara('catalogo');
    if(acao!=='pesquisar')return;
    const cw=await esperarCatalogo('focarPesquisaCatalogo').catch(()=>null);
    for(let i=0;cw && i<30;i++){frame()?.focus();if(cw.focarPesquisaCatalogo())return;await new Promise(r=>setTimeout(r,100));}
  };
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.repeat)return;
    const acao=!e.altKey?(e.key==='F2'?'catalogo':e.key==='F4'?'pesquisar':''):(e.code==='KeyC'?'catalogo':e.code==='KeyP'?'pesquisar':'');
    if(!acao||document.querySelector('dialog[open]'))return;
    e.preventDefault();window.__pedidoAtalho(acao);
  });
  window.__pedidoSincronizarEtapa=etapa=>{
    if(ocupado || etapaAtual==='dados' || etapa===etapaAtual || !ETAPAS.some(e=>e.id===etapa))return;
    etapaAtual=etapa;pintarTrilha(true);
  };
  pintarTrilha(false);
}
