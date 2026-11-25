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
 let sb,empresa,registros=[],ocupado=false,pagina=1,visiveis=[];
 function filtrar(){
  const q=$('opBusca').value.trim().toLocaleLowerCase('pt-BR');
  return registros.filter(r=>!q||[r.pedido,r.cliente,r.item,r.descricao,r.responsavel_nome,tipos[r.tipo],nomes[r.origem],estados[r.status]].join(' ').toLocaleLowerCase('pt-BR').includes(q));
 }
 // Foto do cliente (nov/2026): a do catálogo (clientes_empresas.catalogo_logo_url), pelo nome; sem foto, iniciais.
 const fotos={},normNome=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 function fotoCliente(nome){const url=fotos[normNome(nome)],ini=String(nome||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
  return '<span class="op-foto"><i>'+esc(ini)+'</i>'+(url?'<img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.remove()">':'')+'</span>';}
 async function carregarFotos(){try{const {data}=await sb.from('clientes_empresas').select('nome_razao,catalogo_logo_url').eq('empresa_id',empresa);(data||[]).forEach(c=>{if(c.catalogo_logo_url)fotos[normNome(c.nome_razao)]=c.catalogo_logo_url;});if(registros.length)render();}catch(e){console.warn('fotos dos clientes',e);}}
 function render(){
  visiveis=filtrar();const n=visiveis.length;
  pagina=Math.max(1,Math.min(pagina,Math.ceil(n/30)||1));
  $('opLinhas').innerHTML=visiveis.slice((pagina-1)*30,pagina*30).map(r=>'<tr data-caso="'+esc(r.id)+'" tabindex="0" title="Abrir a ocorrência e as provas"><td>'+esc(data(r.data))+'</td><td class="op-num-ped">'+(r.pedido?'<span class="op-num-card">'+esc(r.pedido)+'</span>':'<small>Sem pedido</small>')+'</td><td class="op-cli"><span class="op-cli-linha">'+fotoCliente(r.cliente)+'<span>'+esc(r.cliente||'—')+'</span></span></td><td>'+esc(r.item||'Etapa operacional')+'<small>'+esc(objetos[r.objeto]||'Registro operacional')+'</small></td><td>'+esc(tipos[r.tipo]||r.tipo)+'<small>'+esc(nomes[r.origem])+' · '+esc(etapas[r.etapa]||r.etapa||'')+'</small></td><td>'+esc(r.quantidade??'—')+(r.pendente!=null&&r.pendente!==r.quantidade?'<small>'+esc(r.pendente)+' pendente(s)</small>':'')+'</td><td><span class="op-status op-'+esc(r.status)+'">'+esc(estados[r.status]||r.status)+'</span>'+(r.responsavel_nome?'<small>Responsável: '+esc(r.responsavel_nome)+'</small>':'')+'</td></tr>').join('')||'<tr><td colspan="7" class="op-vazio">Nenhuma ocorrência com estes filtros.</td></tr>';
  $('opPaginacao').textContent='Página '+pagina+' de '+(Math.ceil(n/30)||1)+' · '+n+' caso(s)';$('opAnterior').disabled=pagina<=1;$('opProxima').disabled=pagina*30>=n;
 }
 async function carregar(){
  if(ocupado||!empresa||document.hidden)return;ocupado=true;
  try{const {data,error}=await sb.rpc('ocorrencias_painel',{p_empresa:empresa});if(error)throw error;registros=Array.isArray(data)?data:[];render();$('opStatus').textContent='';}
  catch(e){$('opStatus').textContent='Não foi possível atualizar: '+e.message+' Os últimos dados carregados permanecem na tela.';}
  finally{ocupado=false;}
 }
 // nov/2026: o botão "Ver evidências" saiu; clicar na linha (ou Enter) abre a tela inteira com as provas (ocorrencia-tela.js).
 function abrirCaso(id){const r=registros.find(x=>x.id===id);if(r&&window.OPTela)window.OPTela.abrir(r,{sb,empresa,rotulos:{nomes,tipos,estados,etapas,objetos}});}
 $('opLinhas').addEventListener('click',e=>{const tr=e.target.closest('tr[data-caso]');if(tr)abrirCaso(tr.dataset.caso);});
 $('opLinhas').addEventListener('keydown',e=>{const tr=e.target.closest('tr[data-caso]');if(tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault();abrirCaso(tr.dataset.caso);}});
 $('opBusca').addEventListener('input',()=>{pagina=1;render();});
 $('opAnterior').onclick=()=>{pagina--;render();};$('opProxima').onclick=()=>{pagina++;render();};
 // nov/2026: "Consultar registros anteriores" (arquivo da planilha antiga) saiu da tela a pedido do usuário.
 (async()=>{const ctx=await window.aguardarContexto?.();empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;sb=window.supabaseClient;if(!empresa)throw Error('Entre no sistema para visualizar as ocorrências.');
  carregarFotos();await carregar();setInterval(carregar,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)carregar();});
 })().catch(e=>$('opStatus').textContent=e.message);
})();
