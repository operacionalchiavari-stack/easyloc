/* Parâmetros > Ocorrências (nov/2026): como as ocorrências operacionais nascem, os tempos que as regras usam e quais tipos
   a empresa quer acompanhar. Grava em operacao_ocorrencias_regras (tolerancia_minutos, antecedencia_escala_minutos,
   retorno_horas, tipos_desligados). Tipo desligado some do painel Ocorrências operacionais (ocorrencias_painel) e volta
   inteiro ao religar. */
(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Grupos de tipos: [chave, nome, regra]. {tol} {ant} {ret} = tempos abaixo.
 const GRUPOS=[
  ['Escala e equipe',[
   ['equipe_sem_escala','Equipe sem escala registrada','Etapa a menos de {ant} do início (ou já em execução) sem equipe escalada no Painel Logístico.'],
   ['caminhao_sem_escala','Caminhão sem programação','Carregamento a menos de {ant} do início sem caminhão programado ou escolhido.'],
   ['equipe_incompleta','Vagas com confirmações insuficientes','Vaga de freelancer com menos confirmados do que a quantidade pedida, a menos de {ant} do início.']]],
  ['Horários e presença',[
   ['atraso_inicio','Atraso de início','Etapa iniciada mais de {tol} depois do horário programado.'],
   ['checkin_ausente','Check-in não registrado','Freelancer confirmado sem check-in {tol} depois do horário previsto.'],
   ['checkin_atrasado','Check-in fora do horário','Check-in feito mais de {tol} depois do horário previsto.'],
   ['checkout_ausente','Check-out não registrado','Sem check-out {tol} depois do fim da etapa.'],
   ['chegada_fora_area','Chegada registrada fora da área','A foto de chegada foi tirada longe do local do evento.'],
   ['confirmacao_entrega_atrasada','Confirmação de entrega fora do horário','Entrega confirmada mais de {tol} depois do horário previsto.'],
   ['confirmacao_coleta_atrasada','Confirmação de coleta fora do horário','Coleta confirmada mais de {tol} depois do horário previsto.']]],
  ['Conferências e quantidades',[
   ['carregamento_incompleto','Carregamento incompleto','Carregamento concluído com móveis pendentes.'],
   ['entrega_incompleta','Entrega incompleta','Quantidade menor na conferência da entrega.'],
   ['coleta_incompleta','Coleta incompleta','Quantidade menor na conferência da coleta.'],
   ['divergencia_entrega','Diferença entre conferências de entrega','Confirmação de entrega e conferência visual com quantidades diferentes.'],
   ['divergencia_desmontagem_retorno','Diferença entre desmontagem e retorno','Contagem da desmontagem diferente da triagem de volta.'],
   ['divergencia_contagens','Divergência entre contagens','Descarregamento e triagem com quantidades diferentes.'],
   ['divergencia_contagem_geral','Divergência na contagem geral','Contagem geral do galpão diferente do esperado.'],
   ['divergencia_inventario','Divergência de inventário','Inventário aprovado com diferença entre saldo e contagem.'],
   ['retorno_pendente','Triagem de volta pendente','Triagem da volta não concluída {ret} depois da coleta.']]],
  ['Evidências e qualidade',[
   ['checklist_incompleto','Checklist incompleto','Etapa encerrada sem os registros obrigatórios do App do Montador.'],
   ['evidencia_ausente','Evidência obrigatória ausente','Registro enviado sem a foto ou identificação exigida.'],
   ['posicionamento_incorreto','Posicionamento incorreto','Posicionamento incorreto confirmado na montagem.'],
   ['uniforme_reprovado','Uniformização reprovada','Uniforme reprovado na avaliação da foto da equipe.'],
   ['reprovacao','Inspeção reprovada','Item reprovado no controle de qualidade.'],
   ['envio_reprovado','Item enviado após reprovação','Item carregado depois de reprovado na inspeção, sem nova aprovação.'],
   ['revisao_sem_registro','Envio sem revisão registrada','Item carregado sem inspeção aprovada registrada antes da saída.']]],
  ['Acervo e materiais',[
   ['falta','Falta','Peça que não voltou do evento.'],
   ['avaria','Avaria','Peça que voltou danificada.'],
   ['avaria_entrega','Avaria identificada na entrega','Móvel danificado confirmado na conferência da entrega.'],
   ['perda','Perda confirmada','Falta confirmada como perda na Gestão do acervo.'],
   ['sem_protecao','Proteção não aplicada','Proteção (capa, caixa) não aplicada na etapa.'],
   ['protecao_insuficiente','Proteção insuficiente','Carregamento com material de proteção insuficiente.'],
   ['saida_sem_registro','Saída sem registro','Retorno conferido sem contagem de saída.'],
   ['estoque_material_negativo','Estoque de proteção negativo','Saldo de material de proteção abaixo de zero.'],
   ['estoque_material_sem_contagem','Estoque de proteção não conferido','Material usado sem contagem inicial do disponível.'],
   ['troca_solicitada','Troca de material solicitada','Pedido de troca de material feito no App do Montador.']]],
  ['Cliente e transporte',[
   ['feedback_operacional_negativo','Relato operacional negativo do cliente','Cliente respondeu negativamente sobre a operação no pós-venda.'],
   ['alerta_motorista','Alerta do motorista','Alerta registrado pelo motorista no app.']]]
 ];
 let host,regras;
 const tempo=n=>n%60===0&&n>=60?(n/60)+'h':n+' min';
 function textoRegra(t){return t.replace('{tol}',tempo(Number(host.querySelector('[data-oc="tolerancia_minutos"]').value)||0)).replace('{ant}',tempo(Number(host.querySelector('[data-oc="antecedencia_escala_minutos"]').value)||0)).replace('{ret}',(Number(host.querySelector('[data-oc="retorno_horas"]').value)||0)+'h');}
 function atualizar(){
  host.querySelectorAll('[data-oc-regra]').forEach(el=>{el.textContent=textoRegra(el.dataset.ocRegra);});
  host.querySelectorAll('[data-oc-grupo]').forEach(g=>{const t=g.querySelectorAll('[data-oc-tipo]'),on=[...t].filter(x=>x.checked).length;g.querySelector('[data-oc-conta]').textContent=on+' de '+t.length+' acompanhados';});
 }
 window.carregarParametrosOcorrencias=async(root,empresa)=>{
  if(root.dataset.ocCarregado)return;
  const pode=window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar')!==false,dis=pode?'':' disabled';
  const {data,error}=await window.supabaseClient.from('operacao_ocorrencias_regras').select('tolerancia_minutos,antecedencia_escala_minutos,retorno_horas,tipos_desligados').eq('empresa_id',empresa).maybeSingle();
  if(error)throw error;
  regras={tolerancia_minutos:15,antecedencia_escala_minutos:120,retorno_horas:24,tipos_desligados:[],...(data||{})};
  host=root;root.dataset.ocCarregado='1';
  const desl=new Set(regras.tipos_desligados||[]);
  root.innerHTML=
   '<section class="pr-card"><h3>Como as ocorrências funcionam</h3>'+
    '<p class="pr-ajuda">O sistema cria as ocorrências sozinho, comparando o que estava programado com o que foi registrado: cronograma, escala do Painel Logístico, App do Montador, app dos freelancers, conferências (triagem, carregamento, entrega, coleta, volta), Gestão do acervo, controle de qualidade e pós-venda. Ninguém precisa abrir ocorrência à mão.</p>'+
    '<ul class="oc-lista"><li><b>Pendente</b>: a situação está acontecendo agora (ex.: etapa perto de começar e ainda sem equipe).</li>'+
    '<li><b>Resolvida na origem</b>: o registro que faltava foi feito ou a situação deixou de existir — some da lista de pendentes sozinha.</li>'+
    '<li><b>Encaminhada / Perda confirmada / Etapa em revisão</b>: a ocorrência seguiu para outro setor (ex.: Gestão do acervo) e acompanha o andamento de lá.</li></ul>'+
    '<p class="pr-ajuda">Abaixo você ajusta os tempos que as regras usam e escolhe quais tipos quer acompanhar. Tipo desligado não aparece no painel Ocorrências operacionais; ao ligar de novo, os casos voltam a aparecer.</p></section>'+
   '<section class="pr-card"><h3>Tempos das regras</h3><div class="oc-tempos">'+
    '<label>Tolerância de atraso<small>Quanto tempo depois do horário vira "atrasado" (início, check-in, check-out, confirmações).</small><span><input type="number" min="0" max="1440" data-oc="tolerancia_minutos" value="'+esc(regras.tolerancia_minutos)+'"'+dis+'> minutos</span></label>'+
    '<label>Antecedência para cobrar a escala<small>Quanto tempo antes do início a etapa já precisa ter equipe, caminhão e vagas confirmadas.</small><span><input type="number" min="0" max="10080" data-oc="antecedencia_escala_minutos" value="'+esc(regras.antecedencia_escala_minutos)+'"'+dis+'> minutos</span></label>'+
    '<label>Prazo da triagem de volta<small>Depois da coleta, em quanto tempo a triagem da volta precisa estar concluída.</small><span><input type="number" min="1" max="720" data-oc="retorno_horas" value="'+esc(regras.retorno_horas)+'"'+dis+'> horas</span></label></div></section>'+
   GRUPOS.map(([nome,tipos])=>'<section class="pr-card" data-oc-grupo><h3>'+esc(nome)+'</h3><p class="pr-ajuda" data-oc-conta></p><div class="oc-tipos">'+
    tipos.map(([k,n,r])=>'<label class="oc-tipo"><input type="checkbox" data-oc-tipo="'+k+'"'+(desl.has(k)?'':' checked')+dis+'><span><b>'+esc(n)+'</b><small data-oc-regra="'+esc(r)+'"></small></span></label>').join('')+'</div></section>').join('')+
   '<div class="pr-acoes oc-acoes"><span id="ocParamStatus" role="status"></span><button type="button" class="btn primary" id="ocSalvar"'+dis+'>Salvar ocorrências</button></div>';
  const st=document.createElement('style');st.textContent=
   '#pr-painel-ocorrencias .oc-lista{margin:4px 0 10px;padding-left:20px;display:grid;gap:6px;font-size:14px;line-height:1.5}'+
   '#pr-painel-ocorrencias .oc-tempos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:18px}'+
   '#pr-painel-ocorrencias .oc-tempos label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600}#pr-painel-ocorrencias .oc-tempos small{font-weight:400;color:#6b6b6b;font-size:12.5px;line-height:1.45}'+
   '#pr-painel-ocorrencias .oc-tempos span{display:inline-flex;align-items:center;gap:8px;font-weight:400}#pr-painel-ocorrencias .oc-tempos input{width:100px;min-height:40px;border:1px solid #dce0e5;border-radius:9px;padding:6px 10px;font:inherit;text-align:right}'+
   '#pr-painel-ocorrencias .oc-tipos{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:10px}'+
   '#pr-painel-ocorrencias .oc-tipo{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e3e7ec;border-radius:10px;cursor:pointer;background:#fff}'+
   '#pr-painel-ocorrencias .oc-tipo:has(input:not(:checked)){background:#f6f7f9;opacity:.75}#pr-painel-ocorrencias .oc-tipo input{margin-top:3px;width:16px;height:16px;flex:0 0 auto;accent-color:#123f86}'+
   '#pr-painel-ocorrencias .oc-tipo b{display:block;font-size:14px;font-weight:600}#pr-painel-ocorrencias .oc-tipo small{display:block;color:#6b6b6b;font-size:12.5px;line-height:1.45;margin-top:2px}'+
   '#pr-painel-ocorrencias .oc-acoes{position:sticky;bottom:0;background:#f3f5f6;padding:12px 0;display:flex;gap:10px;justify-content:flex-end;align-items:center;z-index:2}#pr-painel-ocorrencias .oc-acoes span{margin-right:auto;font-size:13px}';
  root.append(st);
  root.addEventListener('input',atualizar);root.addEventListener('change',atualizar);
  root.querySelector('#ocSalvar').addEventListener('click',async()=>{
   const s=root.querySelector('#ocParamStatus');
   try{
    const v=k=>Number(root.querySelector('[data-oc="'+k+'"]').value);
    const novo={empresa_id:empresa,tolerancia_minutos:v('tolerancia_minutos'),antecedencia_escala_minutos:v('antecedencia_escala_minutos'),retorno_horas:v('retorno_horas'),
     tipos_desligados:[...root.querySelectorAll('[data-oc-tipo]:not(:checked)')].map(x=>x.dataset.ocTipo)};
    if(!(Number.isInteger(novo.tolerancia_minutos)&&novo.tolerancia_minutos>=0&&novo.tolerancia_minutos<=1440))throw Error('Tolerância: de 0 a 1440 minutos.');
    if(!(Number.isInteger(novo.antecedencia_escala_minutos)&&novo.antecedencia_escala_minutos>=0&&novo.antecedencia_escala_minutos<=10080))throw Error('Antecedência: de 0 a 10080 minutos.');
    if(!(Number.isInteger(novo.retorno_horas)&&novo.retorno_horas>=1&&novo.retorno_horas<=720))throw Error('Prazo da triagem de volta: de 1 a 720 horas.');
    s.textContent='Salvando…';
    const {error}=await window.supabaseClient.from('operacao_ocorrencias_regras').upsert(novo,{onConflict:'empresa_id'});if(error)throw error;
    regras=novo;s.textContent='Ocorrências salvas.';
   }catch(err){s.textContent='Não foi possível salvar: '+err.message;window.alerta?.(s.textContent,'Parâmetros','erro');}
  });
  atualizar();
 };
})();
