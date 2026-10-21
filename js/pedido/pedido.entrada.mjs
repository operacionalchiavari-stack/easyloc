// Entrada comercial do pedido: dados do evento e ferramentas do pedido.
// A barra de cima (out/2026, pedido do usuário) segue o cabeçalho do catálogo: as etapas já vistas ficam à esquerda,
// a atual no centro em destaque e as próximas à direita; trocar de etapa anima o nome (técnica FLIP, sem biblioteca).
// "Módulo 3D" (out/2026): o 3D Livre dentro do pedido; o que for adicionado ao projeto lá entra no pedido da cliente.
const ETAPAS=[{id:'dados',nome:'Dados do pedido'},{id:'catalogo',nome:'Catálogo'},{id:'modulo3d',nome:'3D'},{id:'plantas',nome:'Plantas'},{id:'lista',nome:'Ambientes e lista'},{id:'financeiro',nome:'Financeiro e pagamentos'}];

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
  trilha.innerHTML='<button type="button" class="ct-voltar">← Voltar</button><div class="ct-linha"><div class="ct-antes"></div><h2 class="ct-atual" aria-live="polite"></h2><div class="ct-depois"></div></div><div class="ct-direita"><div class="ct-ferramentas" role="group" aria-label="Ferramentas de criação"><button type="button" data-etapa="catalogo">Catálogo</button><button type="button" data-etapa="modulo3d">3D</button><button type="button" data-etapa="plantas">Plantas</button></div><div class="ct-acoes"><span class="ct-numero" aria-live="polite" aria-atomic="true"></span><button type="button" class="ct-avancar"></button></div></div><p class="ct-erro" role="alert"></p>';
  tela.prepend(trilha);
  const voltarStatus=document.createElement('div');voltarStatus.className='ct-voltar-status';
  const voltar=trilha.querySelector('.ct-voltar');voltar.before(voltarStatus);voltarStatus.append(voltar);
  const statusPedido=document.getElementById('pedidoStatus');
  if(statusPedido){
    statusPedido.hidden=true;
    const seletor=document.createElement('select');seletor.id='pedidoStatusComercial';seletor.className='ct-status-select';seletor.setAttribute('aria-label','Alterar status do pedido');
    for(const [value,label] of [['orcamento','Orçamento'],['pre_reserva','Pré-reserva'],['aprovado','Reservado'],['cancelado','Cancelado']]){
      seletor.add(new Option(label,value));
    }
    const sincronizar=()=>{
      const status=window.__PEDIDO_STATUS_ATUAL || document.querySelector('.timeline-step.active')?.dataset.status || 'orcamento';
      seletor.value=status;seletor.dataset.status=status;
    };
    new MutationObserver(sincronizar).observe(statusPedido,{childList:true,characterData:true,subtree:true});
    seletor.addEventListener('change',()=>{
      const alvo=seletor.value;sincronizar();
      document.querySelector('.timeline-step[data-status="'+alvo+'"]')?.click();
    });
    voltarStatus.append(seletor);sincronizar();
  }

  const financeiro=document.createElement('section');financeiro.className='pedido-etapa-financeiro';financeiro.hidden=true;
  financeiro.setAttribute('aria-label','Financeiro e programa??o de pagamentos');
  const programacao=tela.querySelector('.pagamento-card');
  const resumo=tela.querySelector('.pedido-financeiro');
  // Os campos de cálculo permanecem no pedido, fora da aba financeira.
  const calculosLogistica=document.createElement('div');calculosLogistica.hidden=true;
  calculosLogistica.id='pedidoCalculosLogistica';
  resumo?.querySelectorAll('.logistica-card').forEach(card=>calculosLogistica.append(card));
  tela.append(calculosLogistica);
  if(programacao)financeiro.append(programacao);
  if(resumo)financeiro.append(resumo);
  tela.append(financeiro);
  let etapaAtual='dados';
  const reduzido=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const erroTrilha=texto=>{trilha.querySelector('.ct-erro').textContent=texto || '';};
  function medir(){
    const mapa=new Map();
    trilha.querySelectorAll('.ct-linha [data-etapa]').forEach(el=>mapa.set(el.dataset.etapa,el.getBoundingClientRect()));
    return mapa;
  }
  function pintarTrilha(animar){
    const antes=animar && !reduzido()?medir():null;
    const passos=ETAPAS.filter(e=>e.id==='dados' || e.id==='lista' || e.id==='financeiro');
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
  for(const [titulo,dataId,horaId] of [['Entrega','dataEntrega','horaEntrega'],['Evento','dataEvento',null],['Coleta','dataColeta','horaColeta']]){
    const card=document.createElement('section');card.className='entrada-data-card';
    const tituloCard=document.createElement('h4');tituloCard.textContent=titulo;card.appendChild(tituloCard);
    card.appendChild(document.getElementById(dataId).closest('.meta-item'));
    if(horaId)card.appendChild(document.getElementById(horaId).closest('.meta-item'));
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
      if(rotuloInicio)rotuloInicio.textContent=periodo?'Primeiro dia':'Data evento';
      modo.querySelectorAll('button').forEach(b=>{const ativo=b.dataset.modo===m;b.classList.toggle('is-ativo',ativo);b.setAttribute('aria-pressed',String(ativo));});
    };
    modo.addEventListener('click',e=>{const b=e.target.closest('[data-modo]');if(!b)return;definirModo(b.dataset.modo);if(b.dataset.modo==='periodo')document.getElementById('dataEventoFim')?.focus();});
    window.__definirModoEvento=definirModo;
    definirModo(document.getElementById('dataEventoFim').value?'periodo':'dia');
  }

  const clienteCampo=document.getElementById('clienteInput');
  const atualizarPendenciasDados=()=>{
    const moeda=texto=>Number(String(texto||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;
    const parcelas=[...document.querySelectorAll('#cronogramaParcelas tr')].filter(row=>row.querySelector('.pg-valor'));
    const total=moeda(document.getElementById('pgValorFinal')?.textContent || document.getElementById('resumoTotalGeral')?.textContent);
    const programado=parcelas.reduce((s,row)=>s+moeda(row.querySelector('.pg-valor')?.textContent),0);
    const financeiroPendente=Math.abs(total-programado)>.01 || (total>0 && !parcelas.length) || parcelas.some(row=>{
      const metodo=row.querySelector('.pg-metodo')?.value || row.querySelector('.pg-metodo-text')?.textContent || '';
      return !row.querySelector('.pg-vencimento')?.value || moeda(row.querySelector('.pg-valor')?.textContent)<=0 || !metodo.trim() || /combinar/i.test(metodo);
    });
    trilha.classList.toggle('financeiro-incompleto',financeiroPendente);
    const abaFinanceiro=trilha.querySelector('.ct-linha [data-etapa="financeiro"]');
    if(abaFinanceiro){
      if(financeiroPendente)abaFinanceiro.setAttribute('title','Confira os valores, vencimentos e formas de pagamento da programação.');
      else abaFinanceiro.removeAttribute('title');
    }
    const campos=['clienteInput','telefoneInput','tipoEventoSelect','dataEntrega','horaEntrega','dataEvento','dataColeta','horaColeta','localInput'];
    if(fimItem && !fimItem.hidden)campos.push('dataEventoFim');
    const faltantes=campos.filter(id=>!document.getElementById(id)?.value?.trim());
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
    identidade.querySelector('p').textContent=c.telefone || 'Cliente selecionado para este projeto';
  });
  clienteCampo.addEventListener('input',()=>{
    window.__pedidoClienteAtual=null;
    identidade.querySelector('.entrada-retrato').textContent='+';
    identidade.querySelector('h3').textContent='Quem assina este evento?';
    identidade.querySelector('p').textContent='Selecione o cliente para trazer sua identidade ao projeto.';
  });

  /* ---------- troca de etapa ---------- */
  const frame=()=>vitrine.querySelector('iframe');
  async function esperarCatalogo(fn){
    for(let i=0;i<150;i++){const cw=frame()?.contentWindow;if(cw && typeof cw[fn]==='function')return cw;await new Promise(r=>setTimeout(r,100));}
    throw Error('Aguarde o catálogo terminar de carregar.');
  }
  function validarDados(){
    const cliente=document.getElementById('clienteInput'),data=document.getElementById('dataEvento');
    if(!cliente?.value.trim()){cliente?.focus();return 'Informe o cliente deste projeto.';}
    if(!data?.value){data?.focus();return 'Informe a data do evento para consultar o acervo.';}
    if(fimItem && !fimItem.hidden){
      const fim=document.getElementById('dataEventoFim');
      if(!fim.value){fim.focus();return 'Informe até quando vai o evento.';}
      if(fim.value<=data.value){fim.focus();return 'O último dia do evento precisa ser depois do primeiro.';}
    }
    return '';
  }
  function mostrarCatalogo(){
    financeiro.hidden=true;tela.classList.remove('em-financeiro');
    origem.insertBefore(info,seguinte);
    entrada.hidden=true;tela.classList.remove('em-entrada');tela.classList.add('em-catalogo-comercial');
    const f=frame();if(f && !f.getAttribute('src'))f.src=f.dataset.src;
    window.scrollTo({top:0,behavior:'instant'});
  }
  function mostrarDados(){
    financeiro.hidden=true;tela.classList.remove('em-financeiro');
    entrada.querySelector('.entrada-campos').appendChild(info);entrada.hidden=false;
    entrada.querySelector('.entrada-formulario').hidden=false;
    tela.classList.remove('em-catalogo-comercial');tela.classList.add('em-entrada');window.scrollTo({top:0,behavior:'instant'});
  }
  let ocupado=false;
  async function irPara(destino){
    if(ocupado || destino===etapaAtual)return;
    ocupado=true;erroTrilha('');trilha.classList.add('is-ocupado');
    try{
      if(destino==='financeiro'){
        const cw=frame()?.contentWindow;
        if(cw?.sincronizarPedidoCatalogo)await cw.sincronizarPedidoCatalogo();
        entrada.hidden=true;financeiro.hidden=false;
        tela.classList.remove('em-entrada','em-catalogo-comercial');tela.classList.add('em-financeiro');
        window.scrollTo({top:0,behavior:'instant'});
      }else if(destino==='dados'){
        const cw=frame()?.contentWindow;
        if(cw?.sincronizarPedidoCatalogo)await cw.sincronizarPedidoCatalogo();
        mostrarDados();
      }else{
        // Prepara a tela solicitada antes de exibir o documento incorporado.
        const f=frame();if(f && !f.getAttribute('src'))f.src=f.dataset.src;
        if(destino==='plantas')await (await esperarCatalogo('abrirPlantasComercialPedido')).abrirPlantasComercialPedido();
        if(destino==='modulo3d')await (await esperarCatalogo('abrirModulo3dComercialPedido')).abrirModulo3dComercialPedido();
        if(destino==='catalogo')await (await esperarCatalogo('abrirCatalogoComercialPedido')).abrirCatalogoComercialPedido();
        if(destino==='lista')await (await esperarCatalogo('abrirProjetoComercialPedido')).abrirProjetoComercialPedido();
        mostrarCatalogo();
      }
      etapaAtual=destino;pintarTrilha(true);
    }catch(error){erroTrilha(error.message);}
    finally{ocupado=false;trilha.classList.remove('is-ocupado');}
  }
  trilha.querySelector('.ct-ferramentas').addEventListener('click',e=>{const b=e.target.closest('button[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-depois').addEventListener('click',e=>{const b=e.target.closest('button[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-antes').addEventListener('click',e=>{const b=e.target.closest('[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-avancar').addEventListener('click',async()=>{
    if(ocupado)return;
    ocupado=true;erroTrilha('');const botao=trilha.querySelector('.ct-avancar');botao.disabled=true;
    try{
      const erro=validarDados();
      if(erro){if(etapaAtual!=='dados'){mostrarDados();etapaAtual='dados';pintarTrilha(true);}throw Error(erro);}
      const f=frame();
      if(f?.getAttribute('src')){
        const cw=await esperarCatalogo('sincronizarPedidoCatalogo');
        await cw.sincronizarPedidoCatalogo();
      }
      await window.__salvarPedidoOperacional?.();
    }
    catch(error){erroTrilha(error.message);}
    finally{ocupado=false;botao.disabled=false;}
  });
  // O catálogo (iframe) usa estes dois: "editar dados" volta para a 1ª etapa, e quando a própria tela do
  // catálogo troca entre o acervo e a lista do projeto, a barra acompanha.
  window.__pedidoIrPara=irPara;
  // Voltar navega pelas etapas; nos dados retorna para a Central de pedidos.
  trilha.querySelector('.ct-voltar').onclick=async()=>{
    if(ocupado)return;
    if(etapaAtual==='financeiro')return irPara('lista');
    if(etapaAtual==='lista')return irPara('dados');
    if(etapaAtual==='modulo3d' || etapaAtual==='plantas')return irPara('lista');
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
