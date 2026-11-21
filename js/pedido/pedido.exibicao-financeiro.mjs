import {formatCurrency} from './pedido.utils.mjs';
import {colorirValor} from './pedido.valores-ui.mjs';
import {descontosPorArea,agruparDescontosResumo} from './pedido.desconto-area.mjs?v=20261118-resumo-areas';

export function normalizarExibicaoFinanceira(config={}){
  return {frete_desconto:config?.frete_desconto===true,montagem_desconto:config?.montagem_desconto===true,
    bv_desconto:config?.bv_desconto===true||config?.desconto_mostrar===true,bv_texto:String(config?.bv_texto||config?.desconto_texto||'').trim().slice(0,100)||'Desconto especial',
    // Desconto fixo do cliente (18/11/2026): "Mostrar no pedido e no resumo". Desmarcado, a locação já aparece com o
    // desconto e a linha de desconto some (só quando o pedido tem desconto fixo: tem_fixo).
    fixo_mostrar:config?.fixo_mostrar!==false,tem_fixo:config?.tem_fixo===true};
}

// Troca a apresentação do valor líquido por bruto + desconto, mantendo a soma.
export function aplicarExibicaoFinanceira(financeiro,valores={},config={}){
  if(!financeiro)return financeiro;
  const exibicao=normalizarExibicaoFinanceira(config),resumo=[];
  for(const linha of financeiro.resumo||[]){
    const tipo=linha.rotulo==='Frete'?'frete':linha.rotulo==='Montagem'?'montagem':null;
    if(tipo&&exibicao[tipo+'_desconto']){
      const liquido=Number(linha.valor)||0,bruto=Math.max(liquido,Number(valores[tipo+'_bruto'])||liquido);
      resumo.push({...linha,valor:bruto});
      const desconto=Math.round((bruto-liquido)*100)/100;
      if(desconto>0)resumo.push({rotulo:tipo==='frete'?'Desconto de frete':'Desconto de montagem',valor:-desconto});
    }else if(linha.tipo==='bv_convertido'){
      if(exibicao.bv_desconto)resumo.push({...linha,rotulo:exibicao.bv_texto});
      else {
        // Mostra a locação líquida sem revelar a origem do benefício.
        let restante=Math.abs(Number(linha.valor)||0);
        for(const alvo of resumo.filter(l=>['Valor de locação','Locação','Customizações','Serviços adicionais','Frete','Montagem'].includes(l.rotulo))){
          const parte=Math.min(restante,Math.max(0,Number(alvo.valor)||0));alvo.valor-=parte;restante-=parte;if(restante<=0)break;
        }
      }
    }else if(!exibicao.fixo_mostrar&&exibicao.tem_fixo&&(linha.rotulo==='Desconto na locação'||(linha.rotulo==='Desconto'&&Number(linha.valor)<0))){
      let restante=Math.abs(Number(linha.valor)||0);
      for(const alvo of resumo.filter(l=>['Valor de locação','Locação'].includes(l.rotulo))){
        const parte=Math.min(restante,Math.max(0,Number(alvo.valor)||0));alvo.valor-=parte;restante-=parte;if(restante<=0)break;
      }
      if(restante>0.004)resumo.push({...linha,valor:-restante});
    }else resumo.push({...linha});
  }
  return {...financeiro,resumo:agruparDescontosResumo(resumo)};
}

export function iniciarExibicaoFinanceira(){
  let config=normalizarExibicaoFinanceira(window.__PEDIDO_DADOS_ATUAL?.observacoes?.exibicao_financeiro);
  const sincronizar=()=>{
    for(const el of document.querySelectorAll('[data-exibicao-financeiro]')){
      const chave=el.dataset.exibicaoFinanceiro;
      if(el.type==='checkbox')el.checked=Boolean(config[chave]);
      else if(document.activeElement!==el)el.value=config[chave]||'';
    }
    for(const el of document.querySelectorAll('[data-bv-texto-desconto]'))el.hidden=!config.bv_desconto;
  };
  const atualizarResumo=()=>{
    const valores=window.__PEDIDO_VALORES||{};
    const descontos=descontosPorArea(window.__pedidoColetarPagamentoConfig?.());
    const bv=Math.max(0,Number(window.__pedidoBVDesconto?.())||0);
    const beneficio=document.getElementById('resumoDescontoBvPedido');
    if(beneficio){beneficio.closest('.resumo-linha').hidden=!config.bv_desconto||bv<=0;beneficio.previousElementSibling.textContent=config.bv_texto.trim()||'Desconto especial';}
    for(const [id,chave] of [['resumoLocacaoBruto','locacao_bv'],['resumoSubtotal','subtotal']]){
      const el=document.getElementById(id);
      if(el&&Number.isFinite(valores[chave])){const comercial=chave==='subtotal'?descontos.locacao+descontos.customizacao:0;
        const valor=Math.max(0,valores[chave]-comercial-(config.bv_desconto?0:bv));el.textContent=formatCurrency(valor);colorirValor(el,valor);}
    }
    const descLocacao=descontos.locacao+Math.max(0,Number(valores.locacao_desconto)||0);
    const esconderFixo=!config.fixo_mostrar&&!!window.__pedidoColetarPagamentoConfig?.()?.descontoFixo;
    if(esconderFixo){const el=document.getElementById('resumoLocacaoBruto');if(el&&Number.isFinite(valores.locacao_bv)){const v=Math.max(0,valores.locacao_bv-descLocacao-(config.bv_desconto?0:bv));el.textContent=formatCurrency(v);colorirValor(el,v);}}
    for(const [id,valor] of [['resumoLocacaoDesconto',-descLocacao],['resumoCustomizacoesDesconto',-descontos.customizacao]]){
      const el=document.getElementById(id);if(el){el.textContent=formatCurrency(valor||0);colorirValor(el,valor);if(id==='resumoCustomizacoesDesconto')el.closest('.resumo-linha').hidden=valor===0;
        if(id==='resumoLocacaoDesconto')el.closest('.resumo-linha').hidden=esconderFixo;}
    }
    for(const [tipo,id] of [['frete','Frete'],['montagem','Montagem']]){
      const liquido=Number(valores[tipo])||0,bruto=Math.max(liquido,Number(valores[tipo+'_bruto'])||liquido);
      const mostrar=config[tipo+'_desconto'],valor=mostrar?bruto:liquido;
      const el=document.getElementById('resumo'+id+'Bruto');if(el){el.textContent=formatCurrency(valor);colorirValor(el,valor);}
      const desconto=document.getElementById('resumo'+id+'Desconto');
      if(desconto){const total=Math.round(((mostrar?bruto-liquido:0)+descontos[tipo])*100)/100;
        desconto.textContent=formatCurrency(-total);colorirValor(desconto,-total);desconto.closest('.resumo-linha').hidden=total<=0;}
    }
  };
  const alterou=(event)=>{
    const el=event.target.closest('[data-exibicao-financeiro]');if(!el)return;
    const chave=el.dataset.exibicaoFinanceiro;
    if(event.type==='input'&&el.type==='checkbox')return;
    config={...config,[chave]:el.type==='checkbox'?el.checked:el.value.slice(0,100)};
    sincronizar();atualizarResumo();window.__pedidoHouveEdicao?.();
    window.atualizarPagamento?.();
    document.dispatchEvent(new CustomEvent('pedido-exibicao-financeira-mudou',{detail:{campo:chave}}));
  };
  document.addEventListener('change',alterou);document.addEventListener('input',alterou);
  window.__pedidoColetarExibicaoFinanceira=()=>{const c=normalizarExibicaoFinanceira(config);delete c.tem_fixo;return c;};
  window.__pedidoAplicarExibicaoFinanceira=valor=>{config=normalizarExibicaoFinanceira(valor);sincronizar();atualizarResumo();};
  window.__pedidoAtualizarExibicaoResumo=atualizarResumo;
  sincronizar();return {sincronizar};
}
