export function iniciarEntradaComercial(vitrine){
  const tela=document.querySelector('.pedido-screen');
  if(!tela)return;
  const pedidoExistente=Boolean(window.__PEDIDO_ATUAL_ID || new URLSearchParams(location.search).has('pedido'));
  const info=tela.querySelector('.pedido-info-card');
  if(!info)return;
  const origem=info.parentNode,seguinte=info.nextSibling;
  const entrada=document.createElement('section');
  entrada.className='pedido-entrada';
  entrada.innerHTML='<div class="pedido-entrada-shell"><button type="button" class="entrada-voltar">← Central de pedidos</button><div class="entrada-intro"><span>COMERCIAL · NOVO PEDIDO</span><h1>Qual história vamos<br><em>criar hoje?</em></h1><div class="entrada-regua"></div><button type="button" class="entrada-novo">+ Novo projeto</button><p>Comece pelos dados do evento. Depois, escolha as peças no acervo.</p></div><div class="entrada-formulario" hidden><div class="entrada-campos"></div><p class="entrada-erro" role="alert"></p><div class="entrada-avancar"><button type="button">Avançar para o catálogo →</button></div></div></div>';
  tela.prepend(entrada);tela.classList.add('em-entrada');
  if(pedidoExistente){
    entrada.querySelector('.entrada-intro').hidden=true;
    entrada.querySelector('.entrada-formulario').hidden=false;
  }
  const topo=document.createElement('div');topo.className='entrada-topo';
  entrada.querySelector('.pedido-entrada-shell').prepend(topo);
  topo.appendChild(entrada.querySelector('.entrada-voltar'));
  const numero=document.createElement('span');numero.className='entrada-numero';topo.appendChild(numero);
  const barra=document.createElement('nav');barra.className='comercial-fluxo-bar';barra.setAttribute('aria-label','Etapas do pedido');
  barra.innerHTML='<button type="button" data-etapa="dados">← Dados do pedido</button><button type="button" data-etapa="catalogo">Catálogo</button><button type="button" data-etapa="lista">Ambientes e lista →</button><button type="button" data-etapa="salvar">Salvar pedido</button><span class="comercial-numero"></span><span class="comercial-fluxo-erro" role="alert"></span>';
  vitrine.prepend(barra);
  const atualizarNumero=()=>{const valor=document.getElementById('orcamentoNumero')?.textContent.trim();numero.textContent=valor?`Pedido ${valor}`:'';barra.querySelector('.comercial-numero').textContent=numero.textContent;};
  atualizarNumero();
  const numeroOriginal=document.getElementById('orcamentoNumero');
  if(numeroOriginal)new MutationObserver(atualizarNumero).observe(numeroOriginal,{childList:true,subtree:true,characterData:true});
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
  for(const [titulo,dataId,horaId] of [['Entrega','dataEntrega','horaEntrega'],['Evento','dataEvento',null],['Coleta','dataColeta','horaColeta']]){
    const card=document.createElement('section');card.className='entrada-data-card';
    const tituloCard=document.createElement('h4');tituloCard.textContent=titulo;card.appendChild(tituloCard);
    card.appendChild(document.getElementById(dataId).closest('.meta-item'));
    if(horaId)card.appendChild(document.getElementById(horaId).closest('.meta-item'));
    agenda.appendChild(card);
  }
  identidade.appendChild(agenda);
  const clienteCampo=document.getElementById('clienteInput');
  clienteCampo.addEventListener('cliente-selecionado',e=>{
    const c=e.detail,retrato=identidade.querySelector('.entrada-retrato');retrato.replaceChildren();
    if(/^https?:\/\//i.test(c.catalogo_logo_url || '')){
      const img=document.createElement('img');img.src=c.catalogo_logo_url;img.alt=c.nome_razao;
      img.onerror=()=>{retrato.textContent=c.nome_razao?.charAt(0) || '?';};retrato.appendChild(img);
    }else retrato.textContent=c.nome_razao?.charAt(0) || '?';
    identidade.querySelector('h3').textContent=c.nome_razao;
    identidade.querySelector('p').textContent=c.telefone || 'Cliente selecionado para este projeto';
  });
  clienteCampo.addEventListener('input',()=>{
    identidade.querySelector('.entrada-retrato').textContent='+';
    identidade.querySelector('h3').textContent='Quem assina este evento?';
    identidade.querySelector('p').textContent='Selecione o cliente para trazer sua identidade ao projeto.';
  });
  entrada.querySelector('.entrada-voltar').onclick=()=>document.getElementById('btnVoltarCentralPedidos')?.click();
  entrada.querySelector('.entrada-novo').onclick=()=>{
    entrada.querySelector('.entrada-intro').hidden=true;
    entrada.querySelector('.entrada-formulario').hidden=false;
    document.getElementById('clienteInput')?.focus();
  };
  function entrar(){
    const cliente=document.getElementById('clienteInput'),data=document.getElementById('dataEvento');
    const erro=entrada.querySelector('.entrada-erro');
    if(!cliente?.value.trim()){erro.textContent='Informe o cliente deste projeto.';cliente?.focus();return;}
    if(!data?.value){erro.textContent='Informe a data do evento para consultar o acervo.';data?.focus();return;}
    erro.textContent='';
    origem.insertBefore(info,seguinte);
    entrada.hidden=true;tela.classList.remove('em-entrada');tela.classList.add('em-catalogo-comercial');
    const frame=vitrine.querySelector('iframe');if(frame && !frame.getAttribute('src'))frame.src=frame.dataset.src;
    vitrine.scrollIntoView({behavior:'smooth',block:'start'});
  }
  entrada.querySelector('.entrada-avancar button').onclick=entrar;
  const editar=document.createElement('button');editar.type='button';editar.className='comercial-editar-evento';editar.textContent='Dados do projeto';
  vitrine.querySelector('.vitrine-cabecalho').appendChild(editar);
  editar.onclick=()=>{
    entrada.querySelector('.entrada-campos').appendChild(info);entrada.hidden=false;
    entrada.querySelector('.entrada-intro').hidden=true;entrada.querySelector('.entrada-formulario').hidden=false;
    tela.classList.remove('em-catalogo-comercial');tela.classList.add('em-entrada');entrada.scrollIntoView({behavior:'smooth'});
  };
  barra.addEventListener('click',async event=>{
    const botao=event.target.closest('[data-etapa]');if(!botao)return;
    const frame=vitrine.querySelector('iframe'),catalogo=frame?.contentWindow,erro=barra.querySelector('.comercial-fluxo-erro');
    erro.textContent='';botao.disabled=true;
    try{
      if(!catalogo?.sincronizarPedidoCatalogo)throw Error('Aguarde o catálogo terminar de carregar.');
      if(botao.dataset.etapa==='dados'){await catalogo.sincronizarPedidoCatalogo();editar.click();}
      if(botao.dataset.etapa==='catalogo')await catalogo.abrirCatalogoComercialPedido();
      if(botao.dataset.etapa==='lista')await catalogo.abrirProjetoComercialPedido();
      if(botao.dataset.etapa==='salvar'){await catalogo.sincronizarPedidoCatalogo();await window.__salvarPedidoOperacional?.();}
    }catch(error){erro.textContent=error.message;}finally{botao.disabled=false;}
  });
}
