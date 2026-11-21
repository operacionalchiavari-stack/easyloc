// Histórico de movimentação do item (15/11/2026). Só aparece o que muda a quantidade do item: saldo de implantação,
// compra, saída e retorno de locação e o que a Gestão do acervo faz (manutenção, reparo, baixa, perda, inventário).
// Conferências e divergências de contagem não são movimento: o retorno com divergência só entra quando a Gestão do
// acervo resolve (regra no banco, item_historico_sincronizar_pedido / item_historico_e_movimento).
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NOMES={
 saldo_referencia:'Saldo de implantação',cadastro_estoque:'Saldo de implantação',implantacao:'Saldo de implantação',
 entrada_estoque:'Entrada de estoque',baixa_estoque:'Baixa de estoque',
 entrada_compra:'Compra',correcao_compra:'Correção de compra',
 saida_evento:'Saída de locação',correcao_saida:'Correção da saída de locação',
 retorno_evento:'Retorno de locação',correcao_retorno:'Correção do retorno de locação',
 bloqueio_manutencao:'Entrada em manutenção',liberacao_manutencao:'Saída da manutenção',
 ajuste_inventario:'Ajuste do inventário',perda_confirmada:'Perda confirmada',
 baixa_acervo:'Baixa pela Gestão do acervo',entrada_acervo:'Entrada pela Gestão do acervo'};
const ACERVO={investigacao:'Em investigação',reparo:'Enviado para reparo',limpeza:'Enviado para limpeza',inspecao:'Em inspeção',
 manutencao:'Enviado para manutenção',liberado:'Liberado para uso',baixado:'Baixado',costura:'Enviado para costura',pintura:'Enviado para pintura'};
const ORIGEM={implantacao:'Implantação',implantacao_historico:'Implantação',cadastro_estoque:'Cadastro do item',compras:'Compras',
 carregamento:'Expedição (carregamento)',descarregamento:'Expedição (descarregamento)',retorno:'Triagem da volta',
 gestao_acervo:'Gestão do acervo',manutencao:'Gestão do acervo',inventario:'Inventário',divergencias:'Gestão do acervo'};
const num=v=>v==null?'—':Number(v).toLocaleString('pt-BR');
const iniciais=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase()||'?';

export function criarHistoricoQuantidades({sb,contexto}){
 let ocupado=false,proximo=null,sequencia=0;
 const $=id=>document.getElementById(id),corpo=$('itemHistoricoLinhas'),aviso=$('itemHistoricoAviso');
 function nomeDe(r){
  if(NOMES[r.tipo])return NOMES[r.tipo];
  const e=String(r.tipo||'').replace(/^acervo_/,'');
  return ACERVO[e]||(e.charAt(0).toUpperCase()+e.slice(1).replaceAll('_',' ')); // a coluna Pedido/origem já diz Gestão do acervo
 }
 function sentido(r){
  if(r.variacao!=null&&Number(r.variacao)!==0)return Math.sign(Number(r.variacao));
  if(['saldo_referencia','implantacao','cadastro_estoque','entrada_compra','retorno_evento','liberacao_manutencao'].includes(r.tipo))return 1;
  if(['saida_evento','bloqueio_manutencao','perda_confirmada','baixa_acervo'].includes(r.tipo))return -1;
  return 0;
 }
 function responsavel(r,empresaId){
  const nome=r.responsavel_nome||r.responsavel||'Sistema';
  const sistema=!r.responsavel_usuario&&/^(sistema|equipe|registro anterior|responsavel nao informado)$/i.test(nome);
  let foto='';
  if(r.responsavel_usuario&&empresaId){try{foto=sb.storage.from('avatares').getPublicUrl(empresaId+'/'+r.responsavel_usuario+'.jpg').data?.publicUrl||'';}catch(_){}}
  const ini='<span class="ih-ini">'+esc(sistema?'⚙':iniciais(nome))+'</span>';
  return '<span class="ih-pessoa"><span class="ih-foto'+(sistema?' is-sistema':'')+'">'+(foto?'<img src="'+esc(foto)+'" alt="" loading="lazy" onerror="this.remove()">':'')+ini+'</span><span class="ih-nome">'+esc(sistema?'Sistema':nome)+'</span></span>';
 }
 function linha(r,componentes,empresaId){
  const s=sentido(r);
  const q=r.variacao!=null&&Number(r.variacao)!==0?Math.abs(Number(r.variacao)):Number(r.quantidade||0);
  const qtd=(s>0?'+':s<0?'−':'')+num(q);
  const extra=[];
  if(componentes)extra.push(r.item_nome||'Componente');
  if(r.detalhes?.conferido_gestao_acervo){extra.push('Conferido pela Gestão do acervo'+(Number(r.detalhes?.perda)>0?' · '+num(r.detalhes.perda)+' perdida(s)':''));}
  let motivo=r.detalhes?.motivo||r.detalhes?.observacao||r.detalhes?.nome||'';
  // Gestão do acervo: só o motivo curto ("Problema identificado no inventário"), sem o detalhe da contagem
  if(String(r.tipo).startsWith('acervo_'))motivo=String(motivo).split(/\s+[—–-]\s+|:\s/)[0].trim();
  if(motivo&&!/^Registro de teste/i.test(motivo))extra.push(motivo);
  if(r.tipo==='saldo_referencia')extra.splice(0,extra.length,'Quantidade que o item tinha quando o histórico começou');
  const saldo=r.saldo_depois!=null?'<small>Estoque: '+num(r.saldo_antes??0)+' → '+num(r.saldo_depois)+'</small>':'';
  const pedido=r.pedido_numero
   ?(r.origem==='compras'?'<span class="ih-pedido is-compra">'+esc(r.pedido_numero)+'</span>':'<span class="ih-pedido">Pedido '+esc(r.pedido_numero)+'</span>')
     +(r.pedido_cliente?'<small>'+esc(r.pedido_cliente)+'</small>':'')+'<small>'+esc(ORIGEM[r.origem]||'')+'</small>'
   :'<span class="ih-origem">'+esc(ORIGEM[r.origem]||r.origem||'—')+'</span>';
  const d=new Date(r.registrado_em);
  return '<tr class="'+(s>0?'is-entrada':s<0?'is-saida':'is-neutro')+'">'
   +'<td><span class="ih-data">'+esc(d.toLocaleDateString('pt-BR'))+'</span><small>'+esc(d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))+'</small></td>'
   +'<td><span class="ih-mov"><i class="ih-seta" aria-hidden="true">'+(s>0?'+':s<0?'−':'•')+'</i><strong>'+esc(nomeDe(r))+'</strong></span>'+extra.map(t=>'<small>'+esc(t)+'</small>').join('')+'</td>'
   +'<td class="ih-qtd"><b class="item-historico-quantidade">'+esc(qtd)+'</b>'+saldo+'</td>'
   +'<td>'+pedido+'</td>'
   +'<td>'+responsavel(r,empresaId)+'</td></tr>';
 }
 async function carregar(mais=false){
  if(ocupado)return;const {empresaId,itemId}=contexto();
  if(!itemId){aviso.textContent='Salve o cadastro para consultar as movimentações.';return;}
  ocupado=true;const atual=++sequencia;$('itemHistoricoAtualizar').disabled=true;$('itemHistoricoMais').disabled=true;
  if(!mais){corpo.replaceChildren();proximo=null;$('itemHistoricoResumo').replaceChildren();}
  aviso.textContent='Carregando movimentações...';
  try{
   const {data,error}=await sb.rpc('item_historico_quantidades_ler',{p_empresa:empresaId,p_item:itemId,p_antes:mais?proximo:null,p_limite:50});
   if(error)throw error;if(atual!==sequencia)return;
   const registros=data?.registros||[];proximo=data?.proximo||null;
   if(!mais){
    const it=data?.item||{};
    $('itemHistoricoResumo').innerHTML=(it.tipo==='Kit'?'':'<span>Em estoque<strong>'+num(it.estoque_total??0)+'</strong></span><span>Em manutenção<strong>'+num(it.estoque_manutencao??0)+'</strong></span>')
     +'<p>'+(data?.inclui_componentes?'Movimentações do kit e dos seus componentes. ':'')+'Entram: saldo de implantação, compra, saída e retorno de locação e o que a Gestão do acervo faz. Divergência de contagem só vira movimentação depois que a Gestão do acervo resolve.</p>';
   }
   corpo.insertAdjacentHTML('beforeend',registros.map(r=>linha(r,data?.inclui_componentes,empresaId)).join(''));
   aviso.textContent=corpo.children.length?'':'Nenhuma movimentação registrada para este item.';
   $('itemHistoricoMais').hidden=!data?.tem_mais;
  }catch(error){
   console.error(error);aviso.textContent='';$('itemHistoricoMais').hidden=true;
   window.alerta?.('Não foi possível carregar o histórico. Tente atualizar.','Histórico','erro');
  }finally{ocupado=false;$('itemHistoricoAtualizar').disabled=false;$('itemHistoricoMais').disabled=false;}
 }
 $('itemHistoricoAtualizar').onclick=()=>carregar();$('itemHistoricoMais').onclick=()=>carregar(true);
 return {carregar};
}
