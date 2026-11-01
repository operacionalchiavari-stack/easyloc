(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nomes={materiais:'Material de proteção',conferencia:'Conferência de móveis',acervo:'Gestão do acervo',qualidade:'Controle de qualidade',cronograma:'Cronograma'};
 const tipos={falta:'Falta',sobra:'Sobra',avaria:'Avaria',protecao_insuficiente:'Proteção insuficiente',sem_protecao:'Proteção não aplicada',divergencia_contagens:'Divergência entre contagens',perda:'Perda confirmada',reprovacao:'Inspeção reprovada',atraso_inicio:'Atraso de início',saida_sem_registro:'Saída sem registro',limpeza:'Limpeza',manutencao:'Manutenção',outro:'Outro'};
 const estados={aberta:'Pendente',encaminhada:'Encaminhada',registrada:'Registrada',resolvida:'Resolvida na origem',perda_confirmada:'Perda confirmada',em_revisao:'Etapa em revisão',cancelada:'Cancelada na origem'};
 const etapas={triagem:'Triagem da ida',carregamento:'Carregamento',descarregamento:'Descarregamento',retorno:'Triagem da volta',coleta:'Coleta',inspecao:'Inspeção',estoque:'Estoque',montagem:'Montagem',desmontagem:'Desmontagem'};
 Object.assign(nomes,{logistica:'Entregas e coletas',escala:'Escala operacional',campo:'Registros de campo',presenca:'Presença',transporte:'Transporte',inventario:'Inventário',posvenda:'Pós-venda operacional'});
 Object.assign(tipos,{
  revisao_sem_registro:'Envio sem revisão registrada',carregamento_incompleto:'Carregamento incompleto',entrega_incompleta:'Entrega incompleta',coleta_incompleta:'Coleta incompleta',
  confirmacao_entrega_atrasada:'Confirmação de entrega fora do horário',confirmacao_coleta_atrasada:'Confirmação de coleta fora do horário',retorno_pendente:'Triagem de volta pendente',
  equipe_sem_escala:'Equipe sem escala registrada',caminhao_sem_escala:'Caminhão sem programação',checklist_incompleto:'Checklist incompleto',evidencia_ausente:'Evidência obrigatória ausente',
  posicionamento_incorreto:'Posicionamento incorreto',uniforme_reprovado:'Uniformização reprovada',chegada_fora_area:'Chegada registrada fora da área',avaria_entrega:'Avaria identificada na entrega',
  divergencia_desmontagem_retorno:'Diferença entre desmontagem e retorno',checkin_ausente:'Check-in não registrado',checkout_ausente:'Check-out não registrado',alerta_motorista:'Alerta do motorista',
  troca_solicitada:'Troca de material solicitada',divergencia_inventario:'Divergência de inventário',estoque_material_negativo:'Estoque de proteção negativo',estoque_material_sem_contagem:'Estoque inicial de proteção não conferido',feedback_operacional_negativo:'Relato operacional negativo do cliente',divergencia_entrega:'Diferença entre conferências de entrega',equipe_incompleta:'Vagas com confirmações insuficientes',checkin_atrasado:'Check-in fora do horário',envio_reprovado:'Item enviado após reprovação',divergencia_contagem_geral:'Divergência na contagem geral'
 });
 Object.assign(etapas,{entrega:'Entrega',triagem_ida:'Triagem da ida',triagem_volta:'Triagem da volta'});
 const objetos={capa:'Capa',caixa:'Caixa',item:'Item do acervo',etapa:'Etapa operacional',presenca:'Presença da equipe',transporte:'Transporte',atendimento:'Retorno do cliente'};
 const data=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
 const dia=v=>v?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(v)):'';
 let sb,empresa,registros=[],ocupado=false,pagina=1,visiveis=[],anteriores=[],paginaLegado=1,totalLegado=1;
 function filtrar(){
  const q=$('opBusca').value.trim().toLocaleLowerCase('pt-BR');
  return registros.filter(r=>!q||[r.pedido,r.cliente,r.item,r.descricao,tipos[r.tipo],nomes[r.origem],estados[r.status]].join(' ').toLocaleLowerCase('pt-BR').includes(q));
 }
 function render(){
  visiveis=filtrar();const n=visiveis.length;
  pagina=Math.max(1,Math.min(pagina,Math.ceil(n/30)||1));
  $('opLinhas').innerHTML=visiveis.slice((pagina-1)*30,pagina*30).map(r=>'<tr><td>'+esc(data(r.data))+'</td><td><strong>'+esc(r.pedido||'Sem pedido')+'</strong><small>'+esc(r.cliente)+'</small></td><td>'+esc(r.item||'Etapa operacional')+'<small>'+esc(objetos[r.objeto]||'Registro operacional')+'</small></td><td>'+esc(tipos[r.tipo]||r.tipo)+'<small>'+esc(nomes[r.origem])+' · '+esc(etapas[r.etapa]||r.etapa||'')+'</small></td><td>'+esc(r.quantidade??'—')+(r.pendente!=null&&r.pendente!==r.quantidade?'<small>'+esc(r.pendente)+' pendente(s)</small>':'')+'</td><td><span class="op-status op-'+esc(r.status)+'">'+esc(estados[r.status]||r.status)+'</span></td><td><button type="button" class="btn secondary" data-detalhe="'+esc(r.id)+'">Ver evidências</button></td></tr>').join('')||'<tr><td colspan="7" class="op-vazio">Nenhuma ocorrência com estes filtros.</td></tr>';
  $('opPaginacao').textContent='Página '+pagina+' de '+(Math.ceil(n/30)||1)+' · '+n+' caso(s)';$('opAnterior').disabled=pagina<=1;$('opProxima').disabled=pagina*30>=n;
 }
 async function carregar(){
  if(ocupado||!empresa||document.hidden)return;ocupado=true;
  try{const {data,error}=await sb.rpc('ocorrencias_painel',{p_empresa:empresa});if(error)throw error;registros=Array.isArray(data)?data:[];render();$('opStatus').textContent='';}
  catch(e){$('opStatus').textContent='Não foi possível atualizar: '+e.message+' Os últimos dados carregados permanecem na tela.';}
  finally{ocupado=false;}
 }
 function evidencia(valor){
  if(valor==null)return '—';if(typeof valor==='boolean')return valor?'Sim':'Não';
  const campos={concluida_em:'Conferência concluída',contado_em:'Contagem registrada',criado_em:'Registro',danificadas:'Materiais danificados',protecao_aplicada:'Proteção aplicada',previsto:'Programado',realizado:'Início registrado',tolerancia_minutos:'Tolerância em minutos',perdas_confirmadas:'Perdas confirmadas',tratamentos:'Tratamentos do lote',estado:'Encaminhamento',dados:'Detalhes',status:'Resultado',resolvida_em:'Resolução',observacao:'Observação',observacoes:'Observações',tipo:'Tipo',quantidade:'Quantidade',esperado:'Esperado',conferido:'Conferido',descricao:'Descrição',resolucao:'Resolução',responsavel:'Responsável pelo registro',usuario_id:'Usuário que registrou',retorno:'Retorno',saida:'Saída',contagem:'Contagem',custo:'Custo',motivo:'Motivo',etapa:'Etapa',nome:'Nome',capacidade:'Unidades por material'};
  if(typeof valor==='object')return Array.isArray(valor)?valor.map(evidencia).join('<hr>'):'<dl>'+Object.entries(valor).filter(([k])=>!/(^id$|_id$|^chave$|^versao$)/.test(k)).map(([k,v])=>'<div><dt>'+esc(campos[k]||k.replaceAll('_',' '))+'</dt><dd>'+evidencia(k==='etapa'?(etapas[v]||v):v)+'</dd></div>').join('')+'</dl>';
  if(/^https:\/\//i.test(String(valor)))return '<a href="'+esc(valor)+'" target="_blank" rel="noopener noreferrer">Abrir evidência</a>';
  const passos={equipe:'Foto da equipe',sacolas:'Registro das sacolas',lista_assinada:'Lista assinada',lista_conferida:'Lista conferida',contagem_itens:'Contagem da desmontagem',desmontagem_concluida:'Conclusão da desmontagem',conferencia_entrega:'Conferência de entrega',posicionamento:'Posicionamento',FORA_DO_LOCAL:'Fora da área prevista',NO_LOCAL:'No local previsto'};
  return esc(passos[valor]||valor);
 }
 let detalheAtual=null;
 $('opLinhas').onclick=async e=>{const b=e.target.closest('[data-detalhe]');if(!b)return;const r=registros.find(r=>r.id===b.dataset.detalhe);if(!r)return;detalheAtual=r.id;
  $('opDetalheTitulo').textContent=tipos[r.tipo]||r.tipo;
  $('opDetalheCorpo').innerHTML='<p>'+esc(r.descricao)+'</p><p><strong>Origem:</strong> '+esc(nomes[r.origem])+' · '+esc(etapas[r.etapa]||r.etapa||'')+'</p><p><strong>Detectada:</strong> '+esc(data(r.detectada_em))+' · <strong>Atualizada:</strong> '+esc(data(r.atualizado_em))+'</p>'+(r.resolucao?'<p>'+esc(r.resolucao)+'</p>':'')+'<p>O estado acompanha os registros da operação. O usuário da conferência identifica quem registrou a evidência, sem atribuir culpa.</p><details open><summary>Evidências da origem</summary>'+evidencia(r.evidencias)+'</details>';
  $('opDetalhe').showModal();
  try{const {data,error}=await sb.rpc('ocorrencias_evidencias',{p_empresa:empresa,p_caso:r.id});if(error)throw error;if(detalheAtual!==r.id||!$('opDetalhe').open)return;
   const historico=(Array.isArray(data)?data:[]).map(e=>'<article><strong>'+esc(dataHoraEvento(e.data))+'</strong><p>'+esc(estados[e.registro?.status]||e.registro?.status)+' · '+esc(e.registro?.quantidade??'')+'</p>'+evidencia(e.registro?.evidencias)+'</article>').join('');
   $('opDetalheCorpo').insertAdjacentHTML('beforeend','<details><summary>Histórico de atualizações automáticas</summary>'+historico+'</details>');
  }catch(e){if(detalheAtual===r.id)$('opDetalheCorpo').insertAdjacentHTML('beforeend','<p>Histórico indisponível: '+esc(e.message)+'</p>');}
 };
 const dataHoraEvento=v=>data(v);
 $('opFecharDetalhe').onclick=()=>$('opDetalhe').close();
 $('opBusca').addEventListener('input',()=>{pagina=1;render();});
 $('opAnterior').onclick=()=>{pagina--;render();};$('opProxima').onclick=()=>{pagina++;render();};
 // Arquivo anterior permanece consultável, sem ações de inclusão, edição ou resolução.
 async function legado(){
  $('opLegadoStatus').textContent='Carregando registros anteriores...';
  try{const res=await new Promise((ok,erro)=>google.script.run.withSuccessHandler(ok).withFailureHandler(erro).buscarOcorrenciasOperacionais({pagina:paginaLegado,limite:30}));
   if(!res?.ok)throw Error(res?.mensagem||'Consulta indisponível');anteriores=res.dados||[];totalLegado=res.totalPaginas||1;
   $('opLegadoLinhas').innerHTML=anteriores.map(r=>'<tr><td>'+esc(r.dataHora)+'</td><td>'+esc(r.numeroPedido)+'</td><td>'+esc(r.item)+'</td><td>'+esc(r.ocorrencia)+'</td><td>'+esc(r.quantidade)+'</td><td>'+esc(r.status)+'</td><td>'+esc(r.observacao)+'</td></tr>').join('')||'<tr><td colspan="7">Nenhum registro anterior.</td></tr>';
   $('opLegadoStatus').textContent='Página '+paginaLegado+' de '+totalLegado+' · Arquivo anterior, fora dos indicadores automáticos.';
   $('opLegadoAnterior').disabled=paginaLegado<=1;$('opLegadoProxima').disabled=paginaLegado>=totalLegado;
  }catch(e){$('opLegadoStatus').textContent='Não foi possível consultar o arquivo anterior: '+e.message;}
 }
 $('opArquivo').addEventListener('toggle',()=>{if($('opArquivo').open)legado();});
 $('opLegadoAnterior').onclick=()=>{paginaLegado--;legado();};$('opLegadoProxima').onclick=()=>{paginaLegado++;legado();};
 (async()=>{const ctx=await window.aguardarContexto?.();empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;sb=window.supabaseClient;if(!empresa)throw Error('Entre no sistema para visualizar as ocorrências.');
  await carregar();setInterval(carregar,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)carregar();});
 })().catch(e=>$('opStatus').textContent=e.message);
})();
