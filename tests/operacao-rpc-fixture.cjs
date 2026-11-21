// Transporte simulado para testes de interface. As regras reais são exercitadas em operacao-integrada-db.cjs.
module.exports = function operacaoRpcFixture(banco, nome, args = {}) {
  const ok = data => Promise.resolve({data,error:null});
  const erro = message => Promise.resolve({data:null,error:{message}});
  if(nome === 'separacao_modos_disponiveis') return ok(window.__modosSeparacao || banco.modosSeparacao || {manual:true,qr:true,'um-clique':true});
  if(nome === 'funcionario_contexto') return ok({ativo:true,administrador_legado:true});
  if(nome === 'pedido_fluxo_fila'){
    const setor=args.p_setor;
    return ok((banco.separacoes_pedidos||[]).filter(p=>{
      if(p.status==='cancelado'||p.reducao_liberada_em||['orcamento','pre_reserva'].includes(p.status_comercial))return false;
      // Separado continua na Triagem (Concluídos) até a Expedição começar o carregamento.
      if(setor==='triagem')return p.operacao?.coleta?.concluido_em ? !p.operacao?.retorno?.concluido_em : (!['separado','separado_com_divergencia'].includes(p.status) || (!p.operacao?.carregamento?.iniciado_em && !p.operacao?.carregamento?.concluido_em && !(banco.separacoes_etiquetas||[]).some(e=>e.separacao_pedido_id===p.id&&e.lida_carregamento_em)));
      if(setor==='expedicao')return p.operacao?.coleta?.concluido_em ? !p.operacao?.descarregamento?.concluido_em : ['separado','separado_com_divergencia'].includes(p.status)&&!p.operacao?.carregamento?.concluido_em;
      if(setor==='entrega')return !!p.operacao?.carregamento?.concluido_em&&!p.operacao?.entrega?.concluido_em;
      if(setor==='coleta')return !!p.operacao?.entrega?.concluido_em&&!p.operacao?.coleta?.concluido_em;
      return false;
    }).map(p=>({...p,fluxo_etapa:setor==='expedicao'||(setor==='triagem'&&!p.operacao?.coleta?.concluido_em&&['separado','separado_com_divergencia'].includes(p.status))?(p.operacao?.coleta?.concluido_em?'retorno_simultaneo':'expedicao'):setor,somente_consulta:false})).slice(args.p_de||0,(args.p_de||0)+(args.p_limite||500)));
  }
  if(nome==='operacao_caminhoes_volta_programados')return ok([{pedido_id:'p1',caminhao_id:'c2',codigo:'M2',placa:'XYZ9K87'}]);
  const p=(banco.separacoes_pedidos || []).find(p=>p.id===args.p_pedido);
  const cargaPecas=()=>banco.cargaPecas||(banco.separacoes_itens||[]).filter(i=>i.separacao_pedido_id===args.p_pedido).flatMap(i=>{
    const filhos=(banco.kit_itens||[]).filter(k=>k.kit_id===i.item_id),q=Number(i.quantidade_solicitada??(banco.separacoes_etiquetas||[]).filter(e=>e.separacao_item_id===i.id).length);
    return (filhos.length?filhos:[{item_id:i.item_id,quantidade:1,itens:{produto:i.item_nome}}]).map(k=>({chave:i.id+'|'+k.item_id,item_id:k.item_id,linha:i.id,nome:k.itens?.produto||i.item_nome,esperado:q*Number(k.quantidade)}));
  });
  if(nome==='operacao_conferencia_pecas'&&banco.conferenciaManual)return ok(cargaPecas());
  const descarga=nome==='operacao_descarga_veiculo_base'||nome==='operacao_descarregamento_lote',etapaCarga=descarga?'descarregamento':'carregamento',veiculosCampo=descarga?'descarga_por_veiculo':'carga_por_veiculo';
  const cargaBase=()=>({itens:cargaPecas(),veiculos:p?.operacao?.[veiculosCampo]||[],token:String(p?.operacao?.carga_revisao||0),concluido:!!p?.operacao?.[etapaCarga]?.concluido_em});
  if((nome==='operacao_carga_veiculo_base'||nome==='operacao_descarga_veiculo_base'))return ok(cargaBase());
  if((nome==='operacao_carregamento_lote'||nome==='operacao_descarregamento_lote')){
    if(!p)return erro('Pedido nao encontrado');const b=cargaBase();if(b.concluido)return erro('Carregamento ja concluido');if(args.p_token!==b.token)return erro('A carga mudou');
    p.operacao||={};const frotaLocal=banco.caminhoes||[{id:'c1',codigo:'G',placa:'ABC1D23',modelo:'Bau grande'},{id:'c2',codigo:'M2',placa:'XYZ9K87',modelo:'Bau medio'}];
    if(args.p_caminhao){
      if(b.veiculos.some(c=>c.caminhao_id===args.p_caminhao))return erro('Caminhao ja carregado');
      if(!args.p_itens?.some(i=>i.quantidade>0))return erro('Informe os itens');
      for(const i of args.p_itens){const esperado=b.itens.find(p=>p.chave===i.chave)?.esperado,antes=b.veiculos.reduce((q,c)=>q+Number(c.itens.find(x=>x.chave===i.chave)?.quantidade||0),0);if(esperado==null||i.quantidade<0||antes+i.quantidade>esperado)return erro('Quantidade invalida');}
      const cam=frotaLocal.find(c=>c.id===args.p_caminhao);p.operacao[veiculosCampo]=[...b.veiculos,{caminhao_id:cam.id,codigo:cam.codigo,placa:cam.placa,itens:args.p_itens}];p.operacao.carga_revisao=Number(b.token)+1;
    }
    p.operacao[etapaCarga+'_observacoes']={...p.operacao[etapaCarga+'_observacoes'],...args.p_observacoes};
    const totais=Object.fromEntries(b.itens.map(i=>[i.chave,(p.operacao[veiculosCampo]||[]).reduce((q,c)=>q+Number(c.itens.find(x=>x.chave===i.chave)?.quantidade||0),0)]));
    const completo=b.itens.every(i=>totais[i.chave]===i.esperado);
    if(completo||args.p_finalizar){
      p.operacao[etapaCarga+'_caminhoes']=(p.operacao[veiculosCampo]||[]).map(c=>({id:c.caminhao_id,codigo:c.codigo,placa:c.placa}));
      const itens=b.itens.map(i=>({...i,conferido:totais[i.chave],obs:p.operacao[etapaCarga+'_observacoes'][i.chave]||''}));
      p.operacao[etapaCarga]={concluido_em:new Date().toISOString(),itens,total:b.itens.reduce((n,i)=>n+i.esperado,0),lidas:Object.values(totais).reduce((a,b)=>a+b,0),faltando:itens.filter(i=>i.conferido<i.esperado),caminhoes:p.operacao[etapaCarga+'_caminhoes'],...(args.p_pendencia?{pendencia:args.p_pendencia}:{})};
      p.status_operacional='carregado';
    }
    window.__gravados?.push({t:'separacoes_pedidos',tipo:'update',p:{operacao:structuredClone(p.operacao)}});
    window.__cargasTeste=structuredClone(p.operacao);
    return ok(structuredClone({base:cargaBase(),operacao:p.operacao,registro:p.operacao[etapaCarga]?.concluido_em?p.operacao[etapaCarga]:null}));
  }
  if(nome==='operacao_iniciar_conferencia'){
    if(!p)return erro('Pedido não encontrado');
    p.operacao||={};p.operacao[args.p_etapa]||={};if(!p.operacao[args.p_etapa].concluido_em)p.operacao[args.p_etapa].iniciado_em||=new Date().toISOString();return ok({...p});
  }
  if(nome==='operacao_transferir_pedido'){
    if(!p)return erro('Pedido não encontrado');
    if(args.p_acao==='reabrir_triagem'||args.p_acao==='devolver_triagem'){p.status='em_separacao';delete p.operacao?.carregamento;}
    if(args.p_acao==='devolver_comercial'){p.status='pendente';p.reducao_liberada_em=new Date().toISOString();}
    return ok({...p});
  }
  const frota=banco.caminhoes||[{id:'c1',codigo:'G',placa:'ABC1D23',modelo:'Baú grande'},{id:'c2',codigo:'M2',placa:'XYZ9K87',modelo:'Baú médio'}];
  if(nome==='operacao_caminhoes_programados'){
    const prog=banco.caminhoesProgramados||{};
    return ok((args.p_pedidos||[]).flatMap(id=>(prog[id]||[]).map(cid=>({pedido_id:id,caminhao_id:cid,...frota.find(c=>c.id===cid)}))));
  }
  if(nome==='operacao_frota') return ok(frota);
  if(nome==='operacao_registrar_caminhoes'){
    if(!p)return erro('Pedido não encontrado');
    const lista=frota.filter(c=>(args.p_caminhoes||[]).includes(c.id)).map(c=>({id:c.id,codigo:c.codigo,placa:c.placa,modelo:c.modelo}));
    if(!lista.length)return erro('Selecione o caminhão em que o pedido foi carregado.');
    p.operacao||={};p.operacao.carregamento_caminhoes=lista;window.__gravados?.push({t:'caminhoes',tipo:'rpc',p:lista});return ok(lista);
  }
  if(nome==='operacao_concluir_com_pendencia'){
    const pend=args.p_pendencia||{};
    if(!pend.motivo_id)return erro('Escolha o motivo da pendência (cadastrado em Parâmetros).');
    if(!pend.data||!pend.hora)return erro('Informe a data e o horário do carregamento das pendências.');
    return operacaoRpcFixture(banco,'operacao_concluir_conferencia',args).then(r=>{
      if(r.error)return r;
      const pendencia={...pend,caminhoes:[{codigo:'G',placa:'ABC1D23'}]};
      p.operacao.carregamento={...p.operacao.carregamento,pendencia};window.__pendencia=pend;
      return {data:{...r.data,pendencia},error:null};
    });
  }
  if(nome==='separacao_definir_modo'){
    if(!p)return erro('Pedido não encontrado');
    if(p.modo_separacao && p.modo_separacao!==args.p_modo)return erro('Este pedido já foi iniciado no modo '+p.modo_separacao+'. Ele precisa ser finalizado nesse modo.');
    p.modo_separacao=args.p_modo;return ok(p.modo_separacao);
  }
  if(nome==='operacao_atualizar_separacao'){
    const i=(banco.separacoes_itens || []).find(i=>i.id===args.p_item);
    if(!i)return erro('Item não encontrado');
    Object.assign(i,args.p_dados);
    if(args.p_etiqueta){const e=banco.separacoes_etiquetas.find(e=>e.id===args.p_etiqueta);if(e)e.lida_separacao_em=new Date().toISOString();}
    window.__gravados?.push({t:'separacoes_itens',tipo:'update',p:args.p_dados});
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
    window.__gravados?.push({t:'separacoes_etiquetas',tipo:'update',p:{[campo]:e[campo]}});
    return ok({...e});
  }
  if(nome==='operacao_concluir_conferencia'){
    if(args.p_etapa==='carregamento'&&!(p?.operacao?.carregamento_caminhoes||[]).length)return erro('Selecione o caminhão em que o pedido foi carregado.');
    const campo={carregamento:'lida_carregamento_em',descarregamento:'lida_descarregamento_em',retorno:'lida_retorno_em'}[args.p_etapa];
    let etqs=(banco.separacoes_etiquetas||[]).filter(e=>e.separacao_pedido_id===args.p_pedido);
    if(args.p_etapa!=='carregamento' && etqs.some(e=>e.lida_carregamento_em)) etqs=etqs.filter(e=>e.lida_carregamento_em);
    const faltando=etqs.filter(e=>!e[campo]).map(e=>({codigo:e.codigo,item:(banco.separacoes_itens||[]).find(i=>i.id===e.separacao_item_id)?.item_nome||'Item'}));
    const registro={concluido_em:new Date().toISOString(),por:'Igor',total:etqs.length,lidas:etqs.length-faltando.length,faltando,...(args.p_etapa==='carregamento'?{caminhoes:p.operacao.carregamento_caminhoes}:{})};
    p.operacao={...(p.operacao||{}),[args.p_etapa]:registro};p.status_operacional={carregamento:'carregado',descarregamento:'descarregado',retorno:'retornado'}[args.p_etapa];
    window.__gravados?.push({t:'separacoes_pedidos',tipo:'update',p:{status_operacional:p.status_operacional,operacao:p.operacao}});
    return ok(registro);
  }
  if(nome==='separacao_ocorrencias_listar')return ok(banco.ocorrenciasSeparacao||[]);
  if(nome==='separacao_meus_setores')return ok(banco.meusSetores||null);
  if(nome==='pedidos_pagamento_bloqueados')return ok((banco.bloqueadosFinanceiro||[]).filter(id=>(args.p_pedidos||[]).includes(id)));
  if(nome==='pedidos_sem_caminhao_bloqueados')return ok((banco.semCaminhao||[]).filter(id=>(args.p_pedidos||[]).includes(id)));
  if(nome==='carregamento_parametros_salvar')return ok(null);
  if(nome==='pedido_liberar_reducao'){
    p.reducao_liberada_em=args.p_liberar?new Date().toISOString():null;return ok(null);
  }
  return ok([]);
};
