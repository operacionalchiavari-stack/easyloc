import { formatCurrency } from './pedido.utils.mjs';

export function iniciarSaldoClientePedido() {
  let clienteAtual=null, empresaAtual=null, versao=0, status='idle', saldo={}, consultado=0;
  const pintar=()=>{
    for(const [id,chave] of [['pgResumoBV','bv'],['pgResumoCredito','credito']]){
      const el=document.getElementById(id);if(!el)continue;
      el.textContent=status==='loading'?'…':status==='erro'?'Indisponível':formatCurrency(saldo[chave] || 0);
      el.setAttribute('aria-busy',String(status==='loading'));
      el.title=status==='erro'?'Não foi possível consultar a conta corrente. Entre novamente nesta etapa para atualizar.':
        (chave==='bv'?'BV em aberto':'Outros créditos disponíveis')+' na conta corrente do cliente. A consulta não aplica abatimento ao pedido.';
    }
  };
  const atualizar=async(forcar=false)=>{
    const cliente=document.getElementById('clienteIdHidden')?.value || '';
    const empresa=window.__CONTEXT?.empresa_id || '';
    const mesmo=cliente===clienteAtual && empresa===empresaAtual;
    if(mesmo && (status==='loading' || (!forcar && Date.now()-consultado<30000))){pintar();return;}
    clienteAtual=cliente;empresaAtual=empresa;const revisao=++versao;
    saldo={};consultado=Date.now();
    window.__PEDIDO_SALDO_CONTA_CLIENTE=null;
    if(!cliente || !empresa){status='idle';pintar();return;}
    status='loading';pintar();
    try{
      const {data,error}=await window.supabaseClient.rpc('pedido_saldo_conta_cliente',{p_empresa:empresa,p_cliente:cliente});
      if(revisao!==versao)return;
      if(error)throw error;
      saldo={bv:Number(data?.bv || 0),credito:Number(data?.credito || 0)};
      status='pronto';
      window.__PEDIDO_SALDO_CONTA_CLIENTE={cliente_id:cliente,...saldo,total:saldo.bv+saldo.credito};
    }catch{
      if(revisao!==versao)return;
      status='erro';
    }
    pintar();
  };
  document.getElementById('clienteInput')?.addEventListener('cliente-selecionado',()=>atualizar(true));
  window.addEventListener('focus',()=>atualizar(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)atualizar(true);});
  window.__pedidoAtualizarSaldoCliente=()=>atualizar(true);
  atualizar();
  return {atualizar};
}
