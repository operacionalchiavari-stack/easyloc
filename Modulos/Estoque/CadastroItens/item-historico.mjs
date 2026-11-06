const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nomes={saldo_referencia:'Saldo de refer\u00eancia',cadastro_estoque:'Saldo no cadastro',entrada_estoque:'Entrada de estoque',entrada_compra:'Entrada por compra',baixa_estoque:'Baixa / ajuste de estoque',saida_evento:'Sa\u00edda para evento',correcao_saida:'Corre\u00e7\u00e3o da sa\u00edda',retorno_evento:'Retorno do evento',correcao_retorno:'Ajuste da quantidade retornada',conferencia_retorno:'Triagem da volta',conferencia_descarregamento:'Descarregamento',conferencia_entrega:'Confer\u00eancia de entrega',conferencia_coleta:'Confer\u00eancia de coleta',contagem_geral:'Contagem geral do estoque',contagem_inventario:'Contagem de invent\u00e1rio',inventario_aprovado:'Invent\u00e1rio aprovado',divergencia_falta:'Falta em investiga\u00e7\u00e3o',divergencia_sobra:'Sobra em investiga\u00e7\u00e3o',divergencia_avaria:'Avaria registrada',divergencia_resolvida:'Diverg\u00eancia resolvida',bloqueio_manutencao:'Envio para manuten\u00e7\u00e3o',liberacao_manutencao:'Libera\u00e7\u00e3o da manuten\u00e7\u00e3o',composicao_referencia:'Composi\u00e7\u00e3o na implanta\u00e7\u00e3o',composicao_kit:'Composi\u00e7\u00e3o do kit'};
const origem={cadastro_estoque:'Cadastro de estoque',implantacao_historico:'Refer\u00eancia inicial',carregamento:'Expedi\u00e7\u00e3o',descarregamento:'Expedi\u00e7\u00e3o',retorno:'Triagem de volta',logistica:'Painel log\u00edstico',inventario:'Invent\u00e1rio',divergencias:'Gest\u00e3o do acervo',gestao_acervo:'Gest\u00e3o do acervo',compras:'Compras',manutencao:'Manuten\u00e7\u00e3o',componentes_kit:'Cadastro do kit'};
const numero=v=>v==null?'\u2014':Number(v).toLocaleString('pt-BR');
export function criarHistoricoQuantidades({sb,contexto}){
 let ocupado=false,proximo=null,temMais=false,sequencia=0;
 const $=id=>document.getElementById(id),corpo=$('itemHistoricoLinhas'),aviso=$('itemHistoricoAviso');
 function linha(r,componentes){
  const falta=r.diferenca!=null&&Number(r.diferenca)<0,aberta=r.detalhes?.aberta===true;
  const entrada=['entrada_estoque','entrada_compra','cadastro_estoque','retorno_evento','conferencia_retorno','conferencia_descarregamento','conferencia_coleta','acervo_triagem','acervo_liberado','liberacao_manutencao'].includes(r.tipo);
  const saida=['saida_evento','conferencia_entrega','baixa_estoque','divergencia_falta','acervo_baixado','bloqueio_manutencao'].includes(r.tipo);
  const contagem=['contagem_geral','contagem_inventario','inventario_aprovado'].includes(r.tipo);
  const sentido=Number(r.variacao)!==0&&r.variacao!=null?Math.sign(Number(r.variacao)):entrada?1:saida?-1:contagem?Math.sign(Number(r.diferenca)||0):0;
  const classe=[falta||aberta?'is-divergencia':'',sentido>0?'is-entrada':sentido<0?'is-saida':''].filter(Boolean).join(' ');
  let observacao=r.detalhes?.motivo||r.detalhes?.observacao||r.detalhes?.nome||'';
  if(r.detalhes?.status)observacao+=(observacao?' \u00b7 ':'')+'Situa\u00e7\u00e3o: '+r.detalhes.status;
  if(r.saldo_antes!=null&&r.saldo_depois!=null)observacao+=(observacao?' \u00b7 ':'')+'Estoque: '+numero(r.saldo_antes)+' \u2192 '+numero(r.saldo_depois);
  if(r.detalhes?.danificados>0)observacao+=' \u00b7 '+numero(r.detalhes.danificados)+' danificado(s)';
  if(r.detalhes?.desistencia>0)observacao+=' \u00b7 '+numero(r.detalhes.desistencia)+' desist\u00eancia(s)';
  const qtd=r.variacao==null?numero(r.quantidade):(r.variacao>0?'+':'')+numero(r.variacao);
  const diferenca=r.diferenca==null?'':Number(r.diferenca)<0?Math.abs(r.diferenca)+' faltante(s)':Number(r.diferenca)>0?r.diferenca+' a mais':'Quantidade confere';
  return '<tr class="'+classe+'"><td>'+esc(new Date(r.registrado_em).toLocaleString('pt-BR'))+'</td><td><strong>'+esc(nomes[r.tipo]||r.tipo.replace(/^acervo_/,'Acervo: ').replaceAll('_',' '))+'</strong>'+(componentes?'<small>'+esc(r.item_nome||'Componente')+'</small>':'')+(observacao?'<small>'+esc(observacao)+'</small>':'')+'</td><td><b class="item-historico-quantidade">'+esc(qtd)+'</b>'+(r.esperado==null?'':'<small>Esperado '+numero(r.esperado)+' \u00b7 Contado '+numero(r.contado)+'</small><small class="item-historico-diferenca">'+esc(diferenca)+'</small>')+'</td><td>'+esc(r.pedido_numero?(r.origem==='compras'?r.pedido_numero:'Pedido #'+r.pedido_numero):(origem[r.origem]||r.origem))+'<small>'+esc(r.pedido_numero?(origem[r.origem]||r.origem):'')+'</small></td><td>'+esc(r.responsavel||'Sistema')+'</td></tr>';
 }
 async function carregar(mais=false){
  if(ocupado)return;const {empresaId,itemId}=contexto();
  if(!itemId){aviso.textContent='Salve o cadastro para consultar as movimenta\u00e7\u00f5es.';return;}
  ocupado=true;const atual=++sequencia;$('itemHistoricoAtualizar').disabled=true;$('itemHistoricoMais').disabled=true;
  if(!mais){corpo.replaceChildren();proximo=null;$('itemHistoricoResumo').replaceChildren();}
  aviso.textContent='Carregando movimenta\u00e7\u00f5es...';
  try{
   const {data,error}=await sb.rpc('item_historico_quantidades_ler',{p_empresa:empresaId,p_item:itemId,p_antes:mais?proximo:null,p_limite:50});
   if(error)throw error;if(atual!==sequencia)return;
   const registros=data?.registros||[];temMais=!!data?.tem_mais;proximo=data?.proximo||null;
   if(!mais)$('itemHistoricoResumo').innerHTML=data?.inclui_componentes?'<p>Hist\u00f3rico do kit e dos seus componentes.</p>':'';
   corpo.insertAdjacentHTML('beforeend',registros.map(r=>linha(r,data?.inclui_componentes)).join(''));
   aviso.textContent=corpo.children.length?'':'Nenhuma movimenta\u00e7\u00e3o registrada para este item.';
   $('itemHistoricoMais').hidden=!temMais;
  }catch(error){
   aviso.textContent='';
   $('itemHistoricoMais').hidden=true;
   window.alerta?.('N\u00e3o foi poss\u00edvel carregar o hist\u00f3rico. Tente atualizar.','Hist\u00f3rico','erro');
  }finally{ocupado=false;$('itemHistoricoAtualizar').disabled=false;$('itemHistoricoMais').disabled=false;}
 }
 $('itemHistoricoAtualizar').onclick=()=>carregar();$('itemHistoricoMais').onclick=()=>carregar(true);
 return {carregar};
}
