// Transporte simulado para testes de interface. As regras reais são exercitadas em operacao-integrada-db.cjs.
module.exports = function operacaoRpcFixture(banco, nome, args = {}) {
  const ok = data => Promise.resolve({data,error:null});
  const erro = message => Promise.resolve({data:null,error:{message}});
  if(nome === 'funcionario_contexto') return ok({ativo:true,administrador_legado:true});
  const p=(banco.separacoes_pedidos || []).find(p=>p.id===args.p_pedido);
  if(nome==='operacao_atualizar_separacao'){
    const i=(banco.separacoes_itens || []).find(i=>i.id===args.p_item);
    if(!i)return erro('Item não encontrado');
    Object.assign(i,args.p_dados);
    if(args.p_etiqueta){const e=banco.separacoes_etiquetas.find(e=>e.id===args.p_etiqueta);if(e)e.lida_separacao_em=new Date().toISOString();}
    window.__gravados.push({t:'separacoes_itens',tipo:'update',p:args.p_dados});
    return ok(null);
  }
  if(nome==='operacao_ler_peca'){
    if(window.__falhaRede) return erro('Failed to fetch');
    const campo={carregamento:'lida_carregamento_em',descarregamento:'lida_descarregamento_em',retorno:'lida_retorno_em'}[args.p_etapa];
    const pat=(banco.itens_patrimonios||[]).find(p=>p.codigo_patrimonio===args.p_codigo);
    const chave=args.p_pedido+':'+args.p_etapa+':'+args.p_codigo;
    const anteriores=banco.__patrimoniosLidos ||= new Set();
    if(args.p_tipo==='PAT' && anteriores.has(chave))return erro('Este móvel já foi conferido');
    const e=(banco.separacoes_etiquetas||[]).find(e=>e.separacao_pedido_id===args.p_pedido && (args.p_tipo==='PAT' ? e.item_id===pat?.item_id && !e[campo] : e.codigo===args.p_codigo));
    if(!e)return erro('Etiqueta não pertence a este pedido');
    if(e[campo])return erro('Já conferida');
    e[campo]=new Date().toISOString();if(args.p_tipo==='PAT')anteriores.add(chave);
    window.__gravados.push({t:'separacoes_etiquetas',tipo:'update',p:{[campo]:e[campo]}});
    return ok({...e});
  }
  if(nome==='operacao_concluir_conferencia'){
    const campo={carregamento:'lida_carregamento_em',descarregamento:'lida_descarregamento_em',retorno:'lida_retorno_em'}[args.p_etapa];
    let etqs=(banco.separacoes_etiquetas||[]).filter(e=>e.separacao_pedido_id===args.p_pedido);
    if(args.p_etapa!=='carregamento' && etqs.some(e=>e.lida_carregamento_em)) etqs=etqs.filter(e=>e.lida_carregamento_em);
    const faltando=etqs.filter(e=>!e[campo]).map(e=>({codigo:e.codigo,item:(banco.separacoes_itens||[]).find(i=>i.id===e.separacao_item_id)?.item_nome||'Item'}));
    const registro={concluido_em:new Date().toISOString(),por:'Igor',total:etqs.length,lidas:etqs.length-faltando.length,faltando};
    p.operacao={...(p.operacao||{}),[args.p_etapa]:registro};p.status_operacional={carregamento:'carregado',descarregamento:'descarregado',retorno:'retornado'}[args.p_etapa];
    window.__gravados.push({t:'separacoes_pedidos',tipo:'update',p:{status_operacional:p.status_operacional,operacao:p.operacao}});
    return ok(registro);
  }
  if(nome==='pedido_liberar_reducao'){
    p.reducao_liberada_em=args.p_liberar?new Date().toISOString():null;return ok(null);
  }
  return ok([]);
};
