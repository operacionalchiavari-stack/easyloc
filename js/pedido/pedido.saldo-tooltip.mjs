import {formatCurrency} from './pedido.utils.mjs';

// Consulta os mesmos títulos do saldo, apenas ao abrir o detalhamento.
export function iniciarDetalhesSaldoCliente({lerEstado}){
  const caixa=document.createElement('aside');
  caixa.id='pedidoSaldoTooltip';caixa.className='pedido-saldo-tooltip';caixa.hidden=true;
  caixa.setAttribute('role','tooltip');document.body.appendChild(caixa);
  let alvo=null,chaveAtual='',timer=null,revisao=0;
  const cache=new Map();
  const fechar=()=>{clearTimeout(timer);++revisao;alvo?.removeAttribute('aria-describedby');alvo=null;caixa.hidden=true;};
  const adiar=()=>{clearTimeout(timer);timer=setTimeout(fechar,180);};
  const texto=(tag,conteudo)=>{const el=document.createElement(tag);el.textContent=conteudo;return el;};
  const posicionar=()=>{
    if(!alvo?.isConnected){fechar();return;}
    const z=Number.parseFloat(getComputedStyle(document.documentElement).zoom)||1;
    caixa.style.width=`${Math.min(380,window.innerWidth/z-24)}px`;
    const r=alvo.getBoundingClientRect(),b=caixa.getBoundingClientRect();
    caixa.style.left=`${Math.max(12,Math.min(r.left,window.innerWidth-b.width-12))/z}px`;
    const y=r.bottom+b.height+8<=window.innerHeight-12?r.bottom+8:Math.max(12,r.top-b.height-8);
    caixa.style.top=`${y/z}px`;
  };
  function pintar(chave,estado,lancamentos,erro=false){
    caixa.replaceChildren(texto('h3',chave==='bv'?'BV disponível na conta corrente':'Crédito disponível na conta corrente'));
    caixa.append(texto('p',chave==='bv'?'Bonificações de pedidos anteriores ainda em aberto para este cliente.':'Créditos reconhecidos para este cliente, como pagamentos a maior, adiantamentos e ajustes.'));
    const resumo=texto('div','');resumo.className='pedido-saldo-tooltip-total';
    resumo.append(texto('span','Saldo disponível'),texto('strong',formatCurrency(estado.saldo[chave]||0)));caixa.append(resumo);
    if(estado.aplicado?.[chave]>0)caixa.append(texto('p',`Aplicado neste pedido: ${formatCurrency(estado.aplicado[chave])}`));
    if(estado.status==='idle') caixa.append(texto('p','Selecione um cliente para consultar a conta corrente.'));
    else if(estado.status==='loading') caixa.append(texto('p','Consultando saldo…'));
    else if(estado.status==='erro') caixa.append(texto('p','Não foi possível consultar o saldo. Entre novamente nesta etapa para atualizar.'));
    else if(erro) caixa.append(texto('p','Não foi possível carregar os lançamentos deste saldo.'));
    else if(lancamentos===null) caixa.append(texto('p','Carregando lançamentos…'));
    else {
      const lista=document.createElement('ul');
      for(const l of lancamentos.filter(l=>(chave==='bv'?l.origem==='bv':l.origem==='credito_cliente'))){
        const item=document.createElement('li'),identidade=document.createElement('div');
        identidade.append(texto('b',l.numero_pedido?`Pedido #${l.numero_pedido}`:l.descricao||'Crédito do cliente'));
        const detalhe=[l.numero_pedido?l.descricao:'',l.emissao?String(l.emissao).slice(0,10).split('-').reverse().join('/'):'',l.observacoes].filter(Boolean).join(' · ');
        if(detalhe) identidade.append(texto('small',detalhe));
        item.append(identidade,texto('strong',formatCurrency(l.aberto||0)));lista.append(item);
      }
      caixa.append(lista.children.length?lista:texto('p',`Nenhum ${chave==='bv'?'BV':'crédito'} em aberto para este cliente.`));
    }
    caixa.append(texto('small','Consultar este saldo não aplica abatimento ao pedido.'));
    posicionar();
  }
  async function abrir(card,chave){
    clearTimeout(timer);alvo?.removeAttribute('aria-describedby');alvo=card;chaveAtual=chave;
    const vez=++revisao,estado=lerEstado(),identidade=`${estado.empresa}:${estado.cliente}:${estado.consultado}`;
    card.setAttribute('aria-describedby',caixa.id);caixa.hidden=false;
    pintar(chave,estado,null);
    if(estado.status!=='pronto') return;
    try{
      if(!cache.has(identidade)){
        cache.clear();
        cache.set(identidade,window.supabaseClient.rpc('pedido_saldo_conta_cliente_detalhes',{p_empresa:estado.empresa,p_cliente:estado.cliente})
          .then(({data,error})=>{if(error)throw error;return data?.lancamentos||[];}));
      }
      const linhas=await cache.get(identidade);
      const atual=lerEstado();
      if(vez!==revisao || atual.cliente!==estado.cliente || atual.empresa!==estado.empresa) return;
      pintar(chave,atual,linhas);
    }catch{cache.delete(identidade);if(vez===revisao)pintar(chave,lerEstado(),[],true);}
  }
  for(const [id,chave] of [['pgResumoBV','bv'],['pgResumoCredito','credito']]){
    const card=document.getElementById(id)?.closest('.pagamento-mini-card');if(!card)continue;
    card.tabIndex=0;card.setAttribute('aria-label',chave==='bv'?'Detalhar saldo de BV':'Detalhar saldo de crédito');
    card.addEventListener('pointerenter',()=>abrir(card,chave));card.addEventListener('pointerleave',adiar);
    card.addEventListener('focus',()=>abrir(card,chave));card.addEventListener('blur',adiar);
    card.addEventListener('click',()=>abrir(card,chave));
  }
  caixa.addEventListener('pointerenter',()=>clearTimeout(timer));caixa.addEventListener('pointerleave',adiar);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fechar();});
  document.addEventListener('pointerdown',e=>{if(alvo&&!alvo.contains(e.target)&&!caixa.contains(e.target))fechar();});
  window.addEventListener('resize',fechar);window.addEventListener('scroll',e=>{if(!caixa.contains(e.target))fechar();},true);
  return {atualizar(){if(alvo)abrir(alvo,chaveAtual);}};
}
