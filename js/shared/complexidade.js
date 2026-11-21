/* Regras compartilhadas pelo servidor, parâmetros e painel. Sem acesso a dados ou DOM. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CXRegras=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const perguntas=[
 [1,'Sofás exigem personalização de estofamento?'],[2,'Cadeiras ou puffs exigem personalização de estofamento?'],[3,'Bares exigem personalização de forração?'],[4,'A quantidade de peças para estofamento ultrapassa o limite?'],
 [5,'Cliente possui reclamação operacional registrada?'],[6,'Cliente já possui pedido confirmado anterior?'],[7,'Tipo de evento exige operação especial?'],[9,'Carregamento entre segunda e quarta?'],[10,'A personalização exige mais de um setor?'],
 [11,'Cadeiras ou poltronas exigem pintura?'],[12,'Bares ou mesas exigem pintura?'],[13,'Aparadores ou estantes exigem pintura?'],[14,'A quantidade de peças para pintura ultrapassa o limite?'],
 [15,'O transporte exige baldeação?'],[16,'O transporte das peças exige escada?'],[18,'A quantidade de caminhões na entrega ultrapassa o limite?'],
 [19,'A quantidade de peças físicas ultrapassa o limite da triagem?'],[20,'Há peças frágeis?'],[21,'Há personalização ou peças sob medida?'],[22,'A confirmação ocorreu com antecedência menor que a referência?'],
 [23,'Há peças de manuseio volumoso?'],[24,'Há peças frágeis na carga?'],[26,'Carregamento fora do expediente?']
 ].map(([id,titulo])=>({id,titulo}));
 const setores=[{id:'personalizacao',nome:'Estofados',perguntas:[1,2,3,4],campo:'score'},{id:'pintura',nome:'Pintura',perguntas:[11,12,13,14],campo:'scorePintura'},{id:'montagem',nome:'Montagem',perguntas:[15,16,18],campo:'scoreMontagem'},{id:'triagem',nome:'Triagem',perguntas:[19,20,21,22],campo:'scoreTriagem'},{id:'carregamento',nome:'Carregamento',perguntas:[23,24,26],campo:'scoreCarregamento'}];
 const gerais=[5,6,7,9,10]; // nov/2026: a 8 (primeiro pedido) saiu, era o contrário da 6
 function padrao(){const pesos={};/* pesos das 26 posições originais (igual ao banco); as removidas (8, 17, 25) ficam sem uso */for(let id=1;id<=26;id++)pesos[id]=id>=5&&id<=10?({5:{sim:7,nao:2},6:{sim:4,nao:5},7:{sim:4,nao:1},8:{sim:3,nao:1},9:{sim:5,nao:2},10:{sim:7,nao:2}})[id]:[{sim:18,nao:6},{sim:14,nao:5},{sim:14,nao:5},{sim:24,nao:8}][id-[1,11,15,19,23].filter(b=>b<=id).pop()];return {versao:1,pesos,limite_personalizados:4,limite_pecas:50,limite_caminhoes:2,distancia_manual_m:50,antecedencia_horas:48,inicio_expediente:'08:00',fim_expediente:'18:00',dias_expediente:[1,2,3,4,5],tipos_especiais:['Feira','Mídia'],grupos_volumosos:['sofa','bar','painel']};}
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const bool=v=>typeof v==='boolean'?v:null;
 function grupo(it){if(it.complexidade?.grupo)return it.complexidade.grupo;for(const raw of [it.produto_base,it.categoria,it.familia]){const t=norm(raw);if(/sofa/.test(t))return 'sofa';if(/cadeira|poltrona|puff|pufe/.test(t))return 'cadeira_puff';if(/aparador|estante|armario/.test(t))return 'aparador_estante';if(/\bbar(es)?\b/.test(t))return 'bar';if(/mesa/.test(t))return 'mesa';if(/painel/.test(t))return 'painel';}return null;}
 const anyTri=list=>list.some(v=>v===true)?true:list.some(v=>v===null)?null:false;
 function avaliar(c){
  const cfg={...padrao(),...(c.config||{}),pesos:{...padrao().pesos,...(c.config?.pesos||{})}};
  const r={},put=(id,valor,fonte,detalhe)=>{r[id]={valor:bool(valor),fonte,detalhe:detalhe||fonte};};
  const itens=c.itens||[],servicos=c.servicos||[],local=c.local||{},cliente=c.cliente||{},ex=c.excecoes||{};
  let tagsLocal=local.tags||{};if(typeof tagsLocal==='string'){try{tagsLocal=JSON.parse(tagsLocal);}catch(_){tagsLocal={};}}
  const observacoes=tagsLocal?.observacoes;const tags=(Array.isArray(observacoes)?observacoes:typeof observacoes==='string'?[observacoes]:[]).map(norm);
  function condLocal(campo,positivas,negativas){const v=bool(local.complexidade?.[campo]);if(v!==null)return v;if(positivas.some(s=>tags.includes(norm(s))))return true;if(negativas.some(s=>tags.includes(norm(s))))return false;return c.local?false:null;} // nov/2026: sem a etiqueta no local = Não
  put(15,condLocal('baldeacao',['Necessita Baldeação'],['Não necessita baldeação']),'Cadastro do local','Baldeação no trajeto das peças');
  put(16,condLocal('escada',['Tem escadas'],['Sem escadas']),'Cadastro do local','Escada utilizada no transporte; a exceção do pedido prevalece');
  put(18,Number(c.caminhoes||0)>cfg.limite_caminhoes,'Escala do Painel Logístico',c.caminhoes>0?'Caminhões distintos no carregamento: '+c.caminhoes+'; limite: '+cfg.limite_caminhoes:'Ainda sem caminhão escalado; limite: '+cfg.limite_caminhoes);
  const reclamacao=cliente.reclamacao_historico;
  put(5,reclamacao?bool(reclamacao.valor):bool(cliente.complexidade?.reclamacao),reclamacao?.fonte||'Cadastro do cliente',reclamacao?.detalhe||'Registro explícito de reclamação operacional; exigência não significa reclamação');
  const anteriores=c.pedidos_anteriores;
  put(6,Number.isInteger(anteriores)?anteriores>0:null,'Histórico do cliente','Pedidos confirmados anteriores: '+(anteriores??'cliente não vinculado'));
  put(7,c.tipo_evento?cfg.tipos_especiais.map(norm).includes(norm(c.tipo_evento)):null,'Tipo de evento',c.tipo_evento||'Preencha o tipo de evento no pedido');
  // Sem etapa no cronograma (orçamento, pré-reserva): o carregamento é estimado pela data e horário de entrega do pedido (nov/2026).
  const cargaCron=c.carregamento?.data?c.carregamento:null,carga=cargaCron||(c.data_entrega?{data:String(c.data_entrega).slice(0,10),hora:c.hora_entrega||null}:null);
  const dia=carga?.data?new Date(carga.data.slice(0,10)+'T12:00:00Z').getUTCDay():null;
  put(9,dia!==null?[1,2,3].includes(dia):null,cargaCron?'Cronograma':'Entrega do pedido',carga?.data?(cargaCron?carga.data:'Ainda sem cronograma; data de entrega '+carga.data):'Preencha a data de entrega do pedido');
  put(26,dia!==null&&carga?.hora?(!cfg.dias_expediente.includes(dia)||carga.hora.slice(0,5)<cfg.inicio_expediente||carga.hora.slice(0,5)>=cfg.fim_expediente):null,cargaCron?'Cronograma':'Entrega do pedido',carga?carga.data+' '+(carga.hora||'sem horário'):'Preencha a data e o horário de entrega do pedido');
  const previstos=new Set();let indefinidos=false;
  const serv=servicos.map(s=>{const fonte=Array.isArray(s.etapas)?s.etapas:[];const revisao=fonte.some(e=>e?.revisao===true);let etapas=revisao?[]:fonte.map(e=>norm(e?.setor||e)).filter(e=>['pintura','forracao','personalizacao'].includes(e));if(!etapas.length&&!revisao){const t=norm(s.tipo);if(t==='pintura')etapas=['pintura'];if(['forracao','tecido','costura','estofado','estofados'].includes(t))etapas=['forracao'];}if(!etapas.length)indefinidos=true;etapas.forEach(e=>previstos.add(e));return {...s,etapas};});
  put(10,previstos.size>1?true:indefinidos?null:false,'Personalizações do pedido','Setores previstos: '+([...previstos].join(', ')||'nenhuma personalização'));
  const itemPorId=new Map(itens.map(i=>[i.item_id,i]));
  function trabalho(setor,ids,grupos){
   const lista=serv.filter(s=>s.etapas.includes(setor));
   ids.slice(0,3).forEach((id,i)=>{const candidatos=lista.map(s=>{const g=grupo(s.item||itemPorId.get(s.item_id)||{});return g===null?false:grupos[i].includes(g); /* nov/2026: móvel de outro tipo não é sofá/cadeira/bar */});put(id,indefinidos&&!candidatos.includes(true)?null:anyTri(candidatos),'Personalizações do pedido','Considera serviço solicitado; uma peça pronta na cor desejada não gera pintura');});
   const qtd=lista.reduce((n,s)=>n+Number(s.quantidade||0),0);
   put(ids[3],indefinidos?null:qtd>cfg.limite_personalizados,'Personalizações do pedido',qtd+' peças com serviço de '+({forracao:'forração',pintura:'pintura'}[setor]||setor)+'; referência: '+cfg.limite_personalizados);
   return lista.length>0?true:indefinidos?null:false;
  }
  const est=trabalho('forracao',[1,2,3,4],[['sofa'],['cadeira_puff'],['bar']]);
  const pin=trabalho('pintura',[11,12,13,14],[['cadeira_puff'],['bar','mesa'],['aparador_estante']]);
  const pecas=c.pecas||[];
  const qtdFisica=pecas.reduce((n,i)=>n+Number(i.quantidade||0),0);
  put(19,qtdFisica>cfg.limite_pecas,'Itens e componentes dos kits',qtdFisica+' peças físicas; limite: '+cfg.limite_pecas+'. Sem duplicar kit e componentes');
  const fragil=pecas.some(i=>{const b=bool(i.complexidade?.fragil);return b!==null?b:/vidro|espelho|laca/.test(norm(i.material));}); // nov/2026: pelo material
  put(20,fragil,'Material dos itens','Vidro, espelho ou laca (ou item marcado como frágil)');put(24,fragil,'Material dos itens','Mesma regra da Triagem: vidro, espelho ou laca');
  put(21,servicos.length>0,'Personalizações do pedido',servicos.length?servicos.length+' item(ns) com personalização':'Nenhuma personalização no pedido');
  const volume=itens.some(i=>{const v=bool(i.complexidade?.volumoso);return v!==null?v:cfg.grupos_volumosos.includes(grupo(i));}); // nov/2026: pelo grupo do móvel
  put(23,volume,'Grupo dos itens','Grupos de manuseio volumoso: '+cfg.grupos_volumosos.join(', '));
  const refMontagem=c.montagem?.data?c.montagem:(c.data_entrega?{data:String(c.data_entrega).slice(0,10),hora:c.hora_entrega||'08:00'}:null);
  const montagem=refMontagem?.data?Date.parse(refMontagem.data.slice(0,10)+'T'+String(refMontagem.hora||'08:00').slice(0,5)+':00-03:00'):NaN;
  const confirmado=ex.confirmado_em||c.confirmado_em||c.reservado_em;
  const dt=Date.parse(confirmado);
  put(22,Number.isFinite(montagem)&&Number.isFinite(dt)?(montagem-dt)<cfg.antecedencia_horas*3600000:confirmado?null:false,ex.confirmado_em?'Confirmação autorizada no pedido':c.confirmado_em?'Primeiro pagamento':c.reservado_em?'Dia em que virou Reservado':'Situação do pedido',confirmado?'Confirmação: '+confirmado+'; referência: '+cfg.antecedencia_horas+'h até a montagem':'Pedido ainda não confirmado');
  for(const q of perguntas){const e=ex.respostas?.[q.id];if(typeof e?.valor==='boolean'&&e.motivo){r[q.id]={valor:e.valor,fonte:'Exceção do pedido',detalhe:e.motivo,por:e.por,em:e.em};}}
  // Nov/2026: nenhum setor fica "a confirmar": triagem e carregamento sempre participam; montagem quando há etapa ou valor de montagem.
  const aplica={personalizacao:est,pintura:pin,montagem:typeof ex.montagem_aplica==='boolean'?ex.montagem_aplica:(c.montagem||Number(c.valor_montagem)>0)?true:false,triagem:true,carregamento:true};
  const resultado={};
  for(const s of setores){const ids=[...gerais,...s.perguntas],baseGeral=aplica[s.id]===false;
   // A ausência de serviço mantém os fatores gerais e os pesos "Não" do setor.
   // As respostas de origem continuam intactas para consulta e auditoria.
   const valor=id=>baseGeral&&s.perguntas.includes(id)?false:r[id].valor;
   const pendentes=ids.filter(i=>valor(i)===null);let total=0,maximo=0,minimoPendente=0,maximoPendente=0;for(const id of ids){const p=cfg.pesos[id];maximo+=Math.max(p.sim,p.nao);if(valor(id)!==null)total+=valor(id)?p.sim:p.nao;else{minimoPendente+=Math.min(p.sim,p.nao);maximoPendente+=Math.max(p.sim,p.nao);}}
   const status=aplica[s.id]===null||pendentes.length||maximo<=0?'pendente':'completo';
   const intervalo=maximo>0?{minimo:Math.round((total+minimoPendente)/maximo*1000)/10,maximo:Math.round((total+maximoPendente)/maximo*1000)/10}:null;
   const area=s.id==='personalizacao'?['forracao','personalizacao']:s.id==='pintura'?['pintura']:[];
   const classificados=serv.filter(v=>v.etapas.some(e=>area.includes(e))&&Number(v.personalizacao_complexidade)>0);
   const acrescimos={simples:0,media:15,alta:30,...(c.custos_personalizacao?.complexidades||{})};
   const quantidade=classificados.reduce((a,v)=>a+Math.max(0,Number(v.quantidade)||0),0);
   const acrescimo=quantidade?classificados.reduce((a,v)=>{const nivel=Number(v.personalizacao_complexidade)>=1.3?'alta':Number(v.personalizacao_complexidade)>=1.15?'media':'simples';return a+Math.max(0,Number(v.quantidade)||0)*Number(acrescimos[nivel]);},0)/quantidade:0;
   const ajustar=v=>Math.round(Math.min(100,v+(100-v)*acrescimo/100)*10)/10;
   if(intervalo&&acrescimo){intervalo.minimo=ajustar(intervalo.minimo);intervalo.maximo=ajustar(intervalo.maximo);}
   resultado[s.id]={status,score:status==='completo'?ajustar(total/maximo*100):null,intervalo,pendentes,aplica:aplica[s.id],base_geral:baseGeral,ajuste_personalizacao:{acrescimo_percentual:acrescimo,quantidade,criterio:'Média pela quantidade de peças do setor; acréscimo sobre a dificuldade restante até 100%'}};
  }
  return {versao:1,respostas:r,setores:resultado,congelado:!!c.congelado_em,congelado_em:c.congelado_em||null};
 }
 function paraPainel(c){const cx=avaliar(c),p={id:c.id,empresa_id:c.empresa_id,numero:c.numero,cliente:c.cliente_nome,local:c.local_nome,data:c.data_evento,valorLocacao:c.valor_locacao||0,valorMontagem:c.valor_montagem||0,valorFrete:c.valor_frete||0,automatico:true,complexidade:cx};for(const q of perguntas)p['r'+q.id]=cx.respostas[q.id].valor;for(const s of setores)p[s.campo]=cx.setores[s.id].score;return p;}
 function mesclar(manual,automaticos){
  const chave=p=>String(p.numero||'').trim(),contar=a=>a.reduce((m,p)=>(m.set(chave(p),(m.get(chave(p))||0)+1),m),new Map());
  const ano=v=>{if(v&&typeof v.getFullYear==='function')return String(v.getFullYear());const t=String(v||'');const m=t.match(/^(\d{4})-/)||t.match(/\/(\d{4})$/);return m?m[1]:null;};
  const cm=contar(manual),ca=contar(automaticos),substituir=new Set();
  const novos=automaticos.map(p=>{const k=chave(p);if(k&&ca.get(k)===1&&cm.get(k)===1){
   const antigo=manual.find(m=>chave(m)===k);if(antigo.id!==p.id&&ano(antigo.data)&&ano(p.data)&&ano(antigo.data)!==ano(p.data))return {...p,vinculo_ambiguo:true};
   substituir.add(k);const novo={...p,manual_original:antigo,complexidade:{...p.complexidade,setores:{...p.complexidade.setores}}};
   for(const s of setores){const v=antigo[s.campo],n=typeof v==='number'?v:Number(String(v??'').replace(',','.'));
    if(n>0&&novo.complexidade.setores[s.id].status!=='completo'){
     novo.complexidade.setores[s.id]={...novo.complexidade.setores[s.id],status:'manual_preservado',score:n};novo[s.campo]=n;
     const sufixo=s.id==='personalizacao'?'':s.id[0].toUpperCase()+s.id.slice(1);
     for(const campo of ['comissao'+sufixo,'valorComissao'+sufixo])if(antigo[campo]!==undefined)novo[campo]=antigo[campo];
    }
   }return novo;
  }if(cm.get(k)>1||ca.get(k)>1){return {...p,vinculo_ambiguo:true};}return p;});
  return manual.filter(m=>!substituir.has(chave(m))).concat(novos);
 }
 function linhas(legado,automaticos){
  const ms=legado.slice(1).map(l=>{const p={numero:l[2],id:l[0],data:l[1],linha:l};for(const [s,col] of setores.map((s,i)=>[s,[18,25,32,39,46][i]])){p[s.campo]=l[col];const sufixo=s.id==='personalizacao'?'':s.id[0].toUpperCase()+s.id.slice(1);p['comissao'+sufixo]=l[col+1];p['valorComissao'+sufixo]=l[col+2];}return p;});const unificados=mesclar(ms,automaticos);
  return [legado[0]||[],...unificados.filter(p=>!p.vinculo_ambiguo).map(p=>{
   if(p.linha)return p.linha;
   const l=Array(50).fill('');Object.assign(l,{0:p.id,1:p.data,2:p.numero,3:p.cliente,4:p.local,5:p.valorLocacao,6:p.valorMontagem,7:p.valorFrete});
   [1,2,3,4,5,6,7,8,9,10].forEach((id,i)=>l[8+i]=p['r'+id]==null?'':p['r'+id]?'Sim':'Não');
   for(const [s,col,ini] of [['personalizacao',18,1],['pintura',25,11],['montagem',32,15],['triagem',39,19],['carregamento',46,23]]){
    if(s!=='personalizacao')for(let i=0;i<4;i++)l[col-4+i]=p['r'+(ini+i)]==null?'':p['r'+(ini+i)]?'Sim':'Não';
    l[col]=p.complexidade.setores[s].score;
    const chave=s==='personalizacao'?'':s[0].toUpperCase()+s.slice(1);
    l[col+1]=p['comissao'+chave]||0;l[col+2]=p['valorComissao'+chave]||0;
   }
   l[49]={automatico:true,setores:p.complexidade.setores};return l;
  })];
 }
 function apresentarScore(s){
  if(!s)return {texto:'Pendente',legenda:'',detalhe:'Avaliação ainda indisponível.'};
  const percentual=n=>n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const base=s.base_geral?'Sem serviço específico neste setor: os fatores gerais continuam pontuando e as perguntas específicas usam o peso de Não. ':'';
  if(s.status==='pendente'){
   const n=s.pendentes.length,pendencias=n+' '+(n===1?'resposta pendente':'respostas pendentes');
   const texto=s.intervalo?(s.intervalo.minimo===s.intervalo.maximo?percentual(s.intervalo.minimo):percentual(s.intervalo.minimo)+' – '+percentual(s.intervalo.maximo)):'Pendente';
   return {texto,legenda:'Parcial · '+(s.aplica===null?'setor a confirmar':pendencias),detalhe:base+'Faixa possível de dificuldade com os dados atuais. '+pendencias+'.'+(s.aplica===null?' Confirme se este setor participa do pedido.':'')+' O percentual final será definido após completar as informações.'};
  }
  return {texto:percentual(s.score),legenda:s.status==='manual_preservado'?'Avaliação anterior':s.base_geral?'Dificuldade mínima':'',detalhe:s.status==='manual_preservado'?'Percentual da avaliação manual preservada enquanto as fontes automáticas estão incompletas.':base+'Dificuldade calculada automaticamente com os dados do sistema.'};
 }
 return {padrao,perguntas,setores,gerais,avaliar,paraPainel,grupo,mesclar,linhas,apresentarScore};
});
