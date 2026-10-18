// Entrada comercial do pedido: "Qual história vamos criar hoje?" → dados do evento → catálogo → ambientes e lista.
// A barra de cima (out/2026, pedido do usuário) segue o cabeçalho do catálogo: as etapas já vistas ficam à esquerda,
// a atual no centro em destaque e as próximas à direita; trocar de etapa anima o nome (técnica FLIP, sem biblioteca).
// "Módulo 3D" (out/2026): o 3D Livre dentro do pedido; o que for adicionado ao projeto lá entra no pedido da cliente.
const ETAPAS=[{id:'dados',nome:'Dados do pedido'},{id:'catalogo',nome:'Catálogo'},{id:'modulo3d',nome:'Módulo 3D'},{id:'lista',nome:'Ambientes e lista'}];
const PROXIMO={dados:'Avançar para o catálogo →',catalogo:'Ambientes e lista →',modulo3d:'Ambientes e lista →',lista:'Salvar pedido'};

export function iniciarEntradaComercial(vitrine){
  const tela=document.querySelector('.pedido-screen');
  if(!tela)return;
  const pedidoExistente=Boolean(window.__PEDIDO_ATUAL_ID || new URLSearchParams(location.search).has('pedido') || new URLSearchParams(location.search).has('projeto'));
  const info=tela.querySelector('.pedido-info-card');
  if(!info)return;
  const origem=info.parentNode,seguinte=info.nextSibling;
  const entrada=document.createElement('section');
  entrada.className='pedido-entrada';
  entrada.innerHTML='<div class="pedido-entrada-shell"><div class="entrada-intro"><span>COMERCIAL · NOVO PEDIDO</span><h1>Qual história vamos<br><em>criar hoje?</em></h1><div class="entrada-regua"></div><button type="button" class="entrada-novo">+ Novo projeto</button><p>Comece pelos dados do evento. Depois, escolha as peças no acervo.</p></div><div class="entrada-formulario" hidden><div class="entrada-campos"></div></div></div>';
  tela.prepend(entrada);tela.classList.add('em-entrada');

  /* ---------- barra de etapas no topo ---------- */
  const trilha=document.createElement('div');trilha.className='comercial-trilha';trilha.setAttribute('role','navigation');trilha.setAttribute('aria-label','Etapas do pedido');
  trilha.innerHTML='<button type="button" class="ct-voltar">← Voltar</button><div class="ct-linha"><div class="ct-antes"></div><h2 class="ct-atual" aria-live="polite"></h2><div class="ct-depois"></div></div><div class="ct-acoes"><span class="ct-numero"></span><button type="button" class="ct-avancar"></button></div><p class="ct-erro" role="alert"></p>';
  tela.prepend(trilha);
  let etapaAtual='dados';
  const emIntro=()=>!entrada.hidden && !entrada.querySelector('.entrada-intro').hidden;
  const reduzido=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const erroTrilha=texto=>{trilha.querySelector('.ct-erro').textContent=texto || '';};
  function medir(){
    const mapa=new Map();
    trilha.querySelectorAll('.ct-linha [data-etapa]').forEach(el=>mapa.set(el.dataset.etapa,el.getBoundingClientRect()));
    return mapa;
  }
  function pintarTrilha(animar){
    const antes=animar && !reduzido()?medir():null;
    const i=ETAPAS.findIndex(e=>e.id===etapaAtual);
    trilha.querySelector('.ct-antes').innerHTML=ETAPAS.slice(0,i).map(e=>'<button type="button" class="ct-passo" data-etapa="'+e.id+'">'+e.nome+'</button>').join('');
    trilha.querySelector('.ct-depois').innerHTML=ETAPAS.slice(i+1).map(e=>etapaAtual==='dados'?'<span class="ct-passo ct-futuro" data-etapa="'+e.id+'">'+e.nome+'</span>':'<button type="button" class="ct-passo ct-futuro" data-etapa="'+e.id+'">'+e.nome+'</button>').join('');
    const atual=trilha.querySelector('.ct-atual');atual.textContent=ETAPAS[i].nome;atual.dataset.etapa=ETAPAS[i].id;
    trilha.querySelector('.ct-avancar').textContent=PROXIMO[etapaAtual];
    trilha.classList.toggle('em-intro',emIntro());
    if(!antes)return;
    trilha.querySelectorAll('.ct-linha [data-etapa]').forEach(el=>{
      const de=antes.get(el.dataset.etapa),para=el.getBoundingClientRect();
      if(!de || !para.width)return;
      const dx=(de.left+de.width/2)-(para.left+para.width/2),dy=(de.top+de.height/2)-(para.top+para.height/2);
      el.animate([{transform:`translate(${dx}px,${dy}px) scale(${de.width/para.width})`},{transform:'none'}],{duration:640,easing:'cubic-bezier(.22,1,.36,1)'});
    });
  }
  const atualizarNumero=()=>{const valor=document.getElementById('orcamentoNumero')?.textContent.trim();trilha.querySelector('.ct-numero').textContent=valor?`Pedido ${valor}`:'';};
  atualizarNumero();
  const numeroOriginal=document.getElementById('orcamentoNumero');
  if(numeroOriginal)new MutationObserver(atualizarNumero).observe(numeroOriginal,{childList:true,subtree:true,characterData:true});

  if(pedidoExistente){
    entrada.querySelector('.entrada-intro').hidden=true;
    entrada.querySelector('.entrada-formulario').hidden=false;
  }

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
  entrada.querySelector('.entrada-novo').onclick=()=>{
    entrada.querySelector('.entrada-intro').hidden=true;
    entrada.querySelector('.entrada-formulario').hidden=false;
    pintarTrilha(false);
    document.getElementById('clienteInput')?.focus();
  };

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
    origem.insertBefore(info,seguinte);
    entrada.hidden=true;tela.classList.remove('em-entrada');tela.classList.add('em-catalogo-comercial');
    const f=frame();if(f && !f.getAttribute('src'))f.src=f.dataset.src;
    window.scrollTo({top:0,behavior:'instant'});
  }
  function mostrarDados(){
    entrada.querySelector('.entrada-campos').appendChild(info);entrada.hidden=false;
    entrada.querySelector('.entrada-intro').hidden=true;entrada.querySelector('.entrada-formulario').hidden=false;
    tela.classList.remove('em-catalogo-comercial');tela.classList.add('em-entrada');window.scrollTo({top:0,behavior:'instant'});
  }
  let ocupado=false;
  async function irPara(destino){
    if(ocupado || destino===etapaAtual)return;
    ocupado=true;erroTrilha('');trilha.classList.add('is-ocupado');
    try{
      if(destino==='dados'){
        const cw=frame()?.contentWindow;
        if(cw?.sincronizarPedidoCatalogo)await cw.sincronizarPedidoCatalogo();
        mostrarDados();
      }else{
        if(etapaAtual==='dados'){const erro=validarDados();if(erro)throw Error(erro);mostrarCatalogo();}
        if(destino==='modulo3d')await (await esperarCatalogo('abrirModulo3dComercialPedido')).abrirModulo3dComercialPedido();
        if(destino==='catalogo' && etapaAtual!=='dados')await (await esperarCatalogo('abrirCatalogoComercialPedido')).abrirCatalogoComercialPedido();
        if(destino==='lista')await (await esperarCatalogo('abrirProjetoComercialPedido')).abrirProjetoComercialPedido();
      }
      etapaAtual=destino;pintarTrilha(true);
    }catch(error){erroTrilha(error.message);}
    finally{ocupado=false;trilha.classList.remove('is-ocupado');}
  }
  trilha.querySelector('.ct-depois').addEventListener('click',e=>{const b=e.target.closest('button[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-antes').addEventListener('click',e=>{const b=e.target.closest('[data-etapa]');if(b)irPara(b.dataset.etapa);});
  trilha.querySelector('.ct-avancar').addEventListener('click',async()=>{
    if(etapaAtual==='dados')return irPara('catalogo');
    if(etapaAtual==='catalogo' || etapaAtual==='modulo3d')return irPara('lista');
    if(ocupado)return;
    ocupado=true;erroTrilha('');const botao=trilha.querySelector('.ct-avancar');botao.disabled=true;
    try{const cw=await esperarCatalogo('sincronizarPedidoCatalogo');await cw.sincronizarPedidoCatalogo();await window.__salvarPedidoOperacional?.();}
    catch(error){erroTrilha(error.message);}
    finally{ocupado=false;botao.disabled=false;}
  });
  // O catálogo (iframe) usa estes dois: "editar dados" volta para a 1ª etapa, e quando a própria tela do
  // catálogo troca entre o acervo e a lista do projeto, a barra acompanha.
  window.__pedidoIrPara=irPara;
  // "← Voltar" volta sempre UMA tela (pedido do usuário: clicar sem querer não pode jogar tudo pra Central):
  // lista → catálogo; no catálogo, item → categoria → categorias e só então os dados; nos dados de um pedido novo,
  // a abertura ("Qual história..."); só da abertura (ou dos dados de um pedido já salvo) vai pra Central de pedidos.
  trilha.querySelector('.ct-voltar').onclick=async()=>{
    if(ocupado)return;
    if(etapaAtual==='lista' || etapaAtual==='modulo3d')return irPara('catalogo');
    if(etapaAtual==='catalogo'){
      const cw=frame()?.contentWindow;
      if(cw?.voltarCatalogoComercial?.())return;
      return irPara('dados');
    }
    if(!emIntro() && !pedidoExistente){
      entrada.querySelector('.entrada-formulario').hidden=true;
      entrada.querySelector('.entrada-intro').hidden=false;
      erroTrilha('');pintarTrilha(false);window.scrollTo({top:0,behavior:'instant'});
      return;
    }
    document.getElementById('btnVoltarCentralPedidos')?.click();
  };
  window.__pedidoSincronizarEtapa=etapa=>{
    if(ocupado || etapaAtual==='dados' || etapa===etapaAtual || !ETAPAS.some(e=>e.id===etapa))return;
    etapaAtual=etapa;pintarTrilha(true);
  };
  pintarTrilha(false);
}
