import { formatCurrency } from './pedido.utils.mjs';
import { iniciarDetalhesSaldoCliente } from './pedido.saldo-tooltip.mjs?v=20261117-uso-saldo';

export function iniciarSaldoClientePedido() {
  let clienteAtual=null, empresaAtual=null, pedidoAtual=null, versao=0, status='idle', saldo={}, aplicacoes=[], consultado=0;
  const valor=id=>Math.max(0,Number(document.getElementById(id)?.value)||0);
  const aplicado=()=>({bv:valor('bvTotal')+valor('bvAbatido'),credito:valor('pagamentoCreditoCliente')});
  const r2=v=>Math.round(v*100)/100;
  const registrado=()=>aplicacoes.find(a=>a.pedido_id===pedidoAtual)||{};
  const disponivel=()=>{
    const uso=aplicado(),salvo=registrado();
    return {bv:Math.max(0,r2((saldo.bv||0)+(Number(salvo.bv)||0)-uso.bv)),credito:Math.max(0,r2((saldo.credito||0)+(Number(salvo.credito)||0)-uso.credito))};
  };
  const detalhes=document.createElement?iniciarDetalhesSaldoCliente({lerEstado:()=>({cliente:clienteAtual,empresa:empresaAtual,status,saldo:disponivel(),aplicado:aplicado(),consultado})}):null;
  const pintar=()=>{
    const livre=disponivel(),uso=aplicado();
    window.__PEDIDO_SALDO_CONTA_CLIENTE=status==='pronto'?{cliente_id:clienteAtual,...livre,total:r2(livre.bv+livre.credito)}:null;
    for(const [id,chave] of [['pgResumoBV','bv'],['pgResumoCredito','credito']]){
      const el=document.getElementById(id);if(!el)continue;
      el.textContent=status==='loading'?'…':status==='erro'?'Indisponível':formatCurrency(livre[chave]);
      el.setAttribute('aria-busy',String(status==='loading'));
    }
    for(const [sufixo,chave] of [['BV','bv'],['Credito','credito']]){
      const campo=document.getElementById('pagamentoAbatimento'+sufixo),nota=document.getElementById('pagamentoDisponivel'+sufixo);
      if(campo){campo.disabled=status!=='pronto'||livre[chave]<=0;campo.max=String(livre[chave]);if(campo.disabled)campo.value='';}
      if(nota)nota.textContent=status==='loading'?'Consultando saldo…':status==='erro'?'Saldo indisponível':`Disponível: ${formatCurrency(livre[chave])}`;
    }
    const btn=document.getElementById('btnConfirmarAbatimento');if(btn)btn.disabled=status!=='pronto'||(livre.bv<=0&&livre.credito<=0);
    const resumo=document.getElementById('pagamentoAbatimentosAplicados');
    if(resumo){
      resumo.replaceChildren();resumo.hidden=uso.bv+uso.credito<=0;
      if(!resumo.hidden){
        const cabecalho=document.createElement('header'),grupo=document.createElement('div'),titulo=document.createElement('span'),total=document.createElement('span'),totalValor=document.createElement('strong');
        cabecalho.className='pg-grupo';grupo.className='pg-grupo-head';titulo.className='pg-grupo-chip';titulo.textContent='Abatimentos neste pedido';
        total.className='pg-grupo-total';totalValor.textContent=formatCurrency(r2(uso.bv+uso.credito));total.append('Valor ',totalValor);
        grupo.append(titulo,total);cabecalho.append(grupo);resumo.append(cabecalho);
        const corpo=document.createElement('div');corpo.className='pagamento-abatimentos-corpo';resumo.append(corpo);
        for(const [chave,nome] of [['bv','BV'],['credito','Crédito']]){
          if(!uso[chave])continue;
          const linha=document.createElement('div'),texto=document.createElement('span'),rotulo=document.createElement('span'),quantia=document.createElement('strong'),remover=document.createElement('button');
          linha.className='pagamento-abatimento-linha';texto.className='pagamento-abatimento-info';
          rotulo.textContent=`${nome} aplicado:`;quantia.textContent=formatCurrency(uso[chave]);texto.append(rotulo,' ',quantia);
          remover.type='button';remover.dataset.removerAbatimento=chave;remover.textContent='Remover';remover.setAttribute('aria-label',`Remover ${nome} aplicado`);
          linha.append(texto,remover);corpo.append(linha);
        }
        const nota=document.createElement('small');
        nota.className='pagamento-abatimentos-nota';
        const salvo=registrado(),pendente=Math.abs(uso.bv-(Number(salvo.bv)||0))>.005||Math.abs(uso.credito-(Number(salvo.credito)||0))>.005;
        nota.textContent=pendente?'Salve o pedido para confirmar o uso destes saldos.':'Uso registrado na conta do cliente.';resumo.append(nota);
      }
    }
    detalhes?.atualizar();
  };
  const atualizar=async(forcar=false)=>{
    const cliente=document.getElementById('clienteIdHidden')?.value||'';
    const empresa=window.__CONTEXT?.empresa_id||'';
    const pedido=window.__PEDIDO_ATUAL_ID||window.__PEDIDO_DADOS_ATUAL?.id||null;
    const mesmo=cliente===clienteAtual&&empresa===empresaAtual&&pedido===pedidoAtual;
    if(mesmo&&!forcar&&(status==='loading'||Date.now()-consultado<30000)){pintar();return;}
    clienteAtual=cliente;empresaAtual=empresa;pedidoAtual=pedido;const revisao=++versao;
    saldo={};aplicacoes=[];consultado=Date.now();
    if(!cliente||!empresa){status='idle';pintar();return;}
    status='loading';pintar();
    try{
      const {data,error}=await window.supabaseClient.rpc('pedido_saldo_conta_cliente',{p_empresa:empresa,p_cliente:cliente});
      if(revisao!==versao)return;if(error)throw error;
      saldo={bv:Number(data?.bv||0),credito:Number(data?.credito||0)};
      aplicacoes=Array.isArray(data?.aplicacoes)?data.aplicacoes:[];status='pronto';
    }catch{if(revisao!==versao)return;status='erro';}
    pintar();
  };
  const validar=(bv,credito,limite)=>{
    if(status!=='pronto')return 'Aguarde a consulta do saldo do cliente.';
    if(bv+credito<=0)return 'Informe um valor de BV ou crédito.';
    const livre=disponivel();
    if(bv>livre.bv+.005)return `BV insuficiente. Disponível: ${formatCurrency(livre.bv)}.`;
    if(credito>livre.credito+.005)return `Crédito insuficiente. Disponível: ${formatCurrency(livre.credito)}.`;
    if(bv+credito>limite+.005)return 'O abatimento não pode superar o valor restante do pedido.';
    return '';
  };
  document.getElementById('clienteInput')?.addEventListener('cliente-selecionado',()=>atualizar(true));
  window.addEventListener('focus',()=>atualizar(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)atualizar(true);});
  window.__pedidoAtualizarSaldoCliente=()=>atualizar(true);
  atualizar();return {atualizar,validar};
}
