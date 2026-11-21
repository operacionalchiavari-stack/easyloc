/* Parâmetros > Complexidade (nov/2026): aba própria com as regras da matriz automática, como a nota é calculada e os
   pontos de cada pergunta (Sim / Não), mostrando quanto cada uma pesa na nota do setor. Grava pela RPC
   complexidade_config_salvar (mesma de antes; o banco confere os pesos e limites). */
(function(){
 'use strict';
 let host,config,podeEditar=true;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=n=>(Math.round(n*10)/10).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 // De onde vem cada resposta (mesma regra de js/shared/complexidade.js). {x} = parâmetro da empresa.
 const REGRA={
  1:'Sim quando o pedido tem personalização de estofado em um sofá.',
  2:'Sim quando há personalização de estofado em cadeira, poltrona ou puff.',
  3:'Sim quando há personalização de forração em um bar.',
  4:'Sim quando as peças com estofado passam de {limite_personalizados}.',
  5:'Sim quando o cliente tem reclamação no histórico de feedback ou marcada no cadastro dele.',
  6:'Sim quando o cliente já teve um pedido reservado antes deste.',
  7:'Sim quando o tipo do evento está na lista de eventos especiais (abaixo).',
  9:'Sim quando o carregamento cai de segunda a quarta (cronograma; antes dele, a data de entrega do pedido).',
  10:'Sim quando as personalizações do pedido passam por mais de um setor (ex.: pintura e estofado).',
  11:'Sim quando há pintura em cadeira, poltrona ou puff.',
  12:'Sim quando há pintura em bar ou mesa.',
  13:'Sim quando há pintura em aparador ou estante.',
  14:'Sim quando as peças pintadas passam de {limite_personalizados}.',
  15:'Sim quando o local tem a etiqueta "Necessita Baldeação" (Cadastro de Locais). Sem a etiqueta: Não.',
  16:'Sim quando o local tem a etiqueta "Tem escadas" (Cadastro de Locais). Sem a etiqueta: Não.',
  18:'Sim quando os caminhões escalados no carregamento passam de {limite_caminhoes}. Sem escala ainda: Não.',
  19:'Sim quando as peças físicas do pedido (kits abertos nos componentes) passam de {limite_pecas}.',
  20:'Sim quando alguma peça é de vidro, espelho ou laca (ou está marcada como frágil no item).',
  21:'Sim quando o pedido tem alguma personalização.',
  22:'Sim quando o pedido foi confirmado (1º pagamento ou dia em que virou Reservado) a menos de {antecedencia_horas}h da montagem.',
  23:'Sim quando algum móvel é de um grupo volumoso (lista abaixo; o grupo vem do nome e da categoria do item).',
  24:'Sim quando alguma peça é de vidro, espelho ou laca — mesma regra da Triagem.',
  26:'Sim quando o carregamento é fora do expediente (dias e horário abaixo).'
 };
 const regra=id=>(REGRA[id]||'').replace(/\{(\w+)\}/g,(_,k)=>config[k]);
 const titulo=id=>CXRegras.perguntas.find(q=>q.id===id)?.titulo||'';
 const mx=id=>Math.max(Number(config.pesos[id]?.sim)||0,Number(config.pesos[id]?.nao)||0);
 const mn=id=>Math.min(Number(config.pesos[id]?.sim)||0,Number(config.pesos[id]?.nao)||0);
 // Faixas de cor da nota (nov/2026): até azul_ate = azul; até amarelo_ate = amarelo; acima = vermelho.
 const faixas=()=>({azul_ate:50,amarelo_ate:75,...(config.faixas_cor||{})});
 function pintarCores(){
  const az=Number(host.querySelector('[data-cx-faixa="azul_ate"]')?.value),am=Number(host.querySelector('[data-cx-faixa="amarelo_ate"]')?.value);
  const v=host.querySelector('[data-cx-vermelho]');if(v)v.textContent=(Number.isFinite(am)?am:'?')+'%';
  if(Number.isFinite(az)&&Number.isFinite(am)&&az<am){host.querySelector('[data-cx-prev="azul"]').style.flex=String(az);host.querySelector('[data-cx-prev="amarelo"]').style.flex=String(am-az);host.querySelector('[data-cx-prev="vermelho"]').style.flex=String(100-am);}
 }
 const maxSetor=s=>[...CXRegras.gerais,...s.perguntas].reduce((t,id)=>t+mx(id),0);

 function linha(id,s){
  return '<tr data-cx-linha="'+id+'"><td class="cx-p"><b>'+esc(titulo(id))+'</b><small data-cx-regra="'+id+'">'+esc(regra(id))+'</small></td>'+
   ['sim','nao'].map(k=>'<td class="cx-pt"><input type="number" min="0" max="1000" step="1" inputmode="numeric" aria-label="Pontos se '+(k==='sim'?'Sim':'Não')+' — '+esc(titulo(id))+'" data-cx-peso="'+id+'" data-resposta="'+k+'" value="'+esc(config.pesos[id][k])+'"'+(podeEditar?'':' disabled')+'></td>').join('')+
   '<td class="cx-imp"><span class="cx-barra"><i data-cx-barra="'+id+'"></i></span><span data-cx-imp="'+id+'"></span></td></tr>';
 }
 function tabela(ids,s){
  return '<div class="cx-tab-rolar"><table class="cx-tab"><thead><tr><th>Pergunta e regra automática</th><th>Pontos se Sim</th><th>Pontos se Não</th><th>'+(s?'Peso na nota do setor':'Peso na nota de cada setor')+'</th></tr></thead><tbody>'+ids.map(id=>linha(id,s)).join('')+'</tbody></table></div>';
 }
 // Recalcula as barras de importância e a faixa de nota de cada setor (ao abrir e a cada número digitado).
 function atualizar(){
  host.querySelectorAll('[data-cx-peso]').forEach(el=>{const v=Number(el.value);config.pesos[el.dataset.cxPeso][el.dataset.resposta]=Number.isFinite(v)?v:0;});
  for(const s of CXRegras.setores){
   const tot=maxSetor(s),min=[...CXRegras.gerais,...s.perguntas].reduce((t,id)=>t+mn(id),0);
   const f=host.querySelector('[data-cx-faixa="'+s.id+'"]');
   if(f)f.textContent=tot>0?'A nota deste setor vai de '+pct(min/tot*100)+' (tudo no mais fácil) a 100% (tudo no mais difícil). Máximo de pontos: '+tot+'.':'Defina pontos para este setor.';
   for(const id of s.perguntas){const p=tot>0?mx(id)/tot*100:0;host.querySelector('[data-cx-imp="'+id+'"]').textContent=pct(p);host.querySelector('[data-cx-barra="'+id+'"]').style.width=Math.min(100,p*2.5)+'%';}
  }
  for(const id of CXRegras.gerais){
   const vals=CXRegras.setores.map(s=>{const t=maxSetor(s);return t>0?mx(id)/t*100:0;}),a=Math.min(...vals),b=Math.max(...vals);
   host.querySelector('[data-cx-imp="'+id+'"]').textContent=Math.abs(a-b)<0.05?pct(a):pct(a)+' a '+pct(b);
   host.querySelector('[data-cx-barra="'+id+'"]').style.width=Math.min(100,b*2.5)+'%';
  }
  host.querySelectorAll('[data-cx-regra]').forEach(el=>{el.textContent=regra(Number(el.dataset.cxRegra));});
 }

 window.carregarParametrosComplexidade=async(root,empresa)=>{
  if(root.dataset.cxCarregado)return;
  podeEditar=window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar')!==false;
  const {data,error}=await window.supabaseClient.from('complexidade_config').select('config').eq('empresa_id',empresa).maybeSingle();if(error)throw error;
  config={...CXRegras.padrao(),...(data?.config||{}),pesos:{...CXRegras.padrao().pesos,...(data?.config?.pesos||{})}};
  host=root;root.dataset.cxCarregado='1';
  const numeros=[['limite_personalizados','Limite de peças personalizadas','Estofados e Pintura'],['limite_pecas','Limite de peças físicas','Triagem'],['limite_caminhoes','Limite de caminhões','Montagem'],['antecedencia_horas','Antecedência mínima da confirmação (horas)','Triagem']];
  const dis=podeEditar?'':' disabled';
  root.innerHTML=
   '<section class="pr-card cx-como"><h3>Como a nota de complexidade é calculada</h3>'+
    '<p class="pr-ajuda">Cada pedido recebe uma nota de 0 a 100% em cinco setores: Estofados, Pintura, Montagem, Triagem e Carregamento. As respostas são 100% automáticas — vêm do pedido, das etiquetas do local, dos itens (material e tipo), das personalizações, do cronograma e da escala. A nota alimenta a comissão e o bônus da Central de Metas.</p>'+
    '<ol class="cx-passos">'+
     '<li><b>Cada pergunta dá pontos.</b> Ela tem um valor para "Sim" e outro para "Não". Quanto mais difícil a situação, mais pontos.</li>'+
     '<li><b>Cada setor soma as perguntas dele</b> mais os fatores gerais (que valem para todos os setores).</li>'+
     '<li><b>Nota do setor = pontos do pedido ÷ pontos máximos do setor × 100.</b> O máximo é a soma, pergunta a pergunta, do maior valor entre Sim e Não.</li>'+
     '<li><b>Peso na nota</b> (barra ao lado de cada pergunta) mostra quanto aquela pergunta pode pesar no setor. Aumente os pontos do que é mais importante para vocês.</li>'+
    '</ol>'+
    '<div class="cx-exemplo"><b>Exemplo:</b> um setor com 3 perguntas de 10, 20 e 30 pontos no "Sim" (e 0 no "Não") tem máximo de 60. Um pedido com "Sim" só na de 30 fica com 30 ÷ 60 = <b>50%</b>.</div>'+
    '<ul class="cx-regras-extra">'+
     '<li><b>Setor sem serviço no pedido</b> (sem personalização de estofado ou pintura, ou sem montagem): as perguntas do setor contam como "Não" e só os fatores gerais variam — aparece "Dificuldade mínima".</li>'+
     '<li><b>Personalização mais complexa</b> soma um acréscimo à nota de Estofados e Pintura sobre o que falta até 100% (média +15%, alta +30%), conforme a complexidade da personalização.</li>'+
     '<li><b>Exceção no pedido:</b> no Painel de Complexidade dá para trocar uma resposta de um pedido, sempre com motivo (fica registrado).</li>'+
     '<li><b>Avaliação encerrada:</b> quando o pedido é finalizado, a nota é congelada com as regras e os pontos daquele momento. Mudar os pontos aqui vale para os pedidos em aberto.</li>'+
    '</ul></section>'+
   '<section class="pr-card"><h3>Fatores gerais</h3><p class="pr-ajuda">Entram na nota de todos os setores.</p>'+tabela(CXRegras.gerais,null)+'</section>'+
   CXRegras.setores.map(s=>'<section class="pr-card" data-cx-setor="'+s.id+'"><h3>'+esc(s.nome)+'</h3><p class="pr-ajuda cx-faixa" data-cx-faixa="'+s.id+'"></p>'+tabela(s.perguntas,s)+'</section>').join('')+
   '<section class="pr-card cx-cores"><h3>Cores do resultado</h3><p class="pr-ajuda">Cor do card da nota (%) no Painel de Complexidade. Nota parcial usa a maior nota possível.</p>'+
    '<div class="cx-cores-linha"><label><span class="cx-chip cx-azul">Azul</span> de 0% até <input type="number" min="1" max="98" step="1" data-cx-faixa="azul_ate" value="'+esc(faixas().azul_ate)+'"'+dis+'>%</label>'+
    '<label><span class="cx-chip cx-amarelo">Amarelo</span> acima disso até <input type="number" min="2" max="99" step="1" data-cx-faixa="amarelo_ate" value="'+esc(faixas().amarelo_ate)+'"'+dis+'>%</label>'+
    '<span class="cx-faixa-vermelho"><span class="cx-chip cx-vermelho">Vermelho</span> acima de <b data-cx-vermelho></b> até 100%</span></div>'+
    '<div class="cx-cores-previa" aria-hidden="true"><i class="cx-azul" data-cx-prev="azul"></i><i class="cx-amarelo" data-cx-prev="amarelo"></i><i class="cx-vermelho" data-cx-prev="vermelho"></i></div></section>'+
   '<section class="pr-card"><h3>Limites e referências das regras</h3><p class="pr-ajuda">Os números e listas que as regras acima usam.</p><div class="cx-param-grid">'+
    numeros.map(([k,n,setor])=>'<label>'+n+'<small>'+setor+'</small><input data-cx-param="'+k+'" type="number" min="1" max="100000" value="'+esc(config[k])+'"'+dis+'></label>').join('')+
    ['inicio_expediente','fim_expediente'].map((k,i)=>'<label>'+['Início do expediente','Fim do expediente'][i]+'<small>Carregamento</small><input data-cx-param="'+k+'" type="time" value="'+esc(config[k])+'"'+dis+'></label>').join('')+
    '<label>Eventos com operação especial (um por linha)<small>Fator geral</small><textarea data-cx-param="tipos_especiais"'+dis+'>'+esc(config.tipos_especiais.join('\n'))+'</textarea></label>'+
    '<label>Grupos de móveis volumosos (um por linha)<small>Carregamento · ex.: sofa, bar, painel</small><textarea data-cx-param="grupos_volumosos"'+dis+'>'+esc(config.grupos_volumosos.join('\n'))+'</textarea></label></div>'+
    '<fieldset class="cx-dias"><legend>Dias de expediente</legend>'+['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((n,i)=>'<label><input type="checkbox" data-cx-dia="'+i+'"'+(config.dias_expediente.includes(i)?' checked':'')+dis+'> '+n+'</label>').join('')+'</fieldset></section>'+
   '<div class="pr-acoes cx-acoes"><span id="cxParamStatus" role="status"></span><button type="button" class="btn secondary" id="cxRestaurar"'+dis+'>Voltar aos pontos padrão</button><button type="button" class="btn primary" id="cxSalvar"'+dis+'>Salvar complexidade</button></div>';
  const style=document.createElement('style');style.textContent=
   '#pr-painel-complexidade .cx-passos{margin:6px 0 12px;padding-left:20px;display:grid;gap:6px;font-size:14px;line-height:1.5}'+
   '#pr-painel-complexidade .cx-exemplo{background:#f6f8fb;border:1px solid #e3e7ec;border-radius:10px;padding:10px 14px;font-size:14px;margin:4px 0 12px}'+
   '#pr-painel-complexidade .cx-regras-extra{margin:0;padding-left:20px;display:grid;gap:6px;font-size:13px;line-height:1.5;color:#4f4f4f}'+
   '#pr-painel-complexidade .cx-tab-rolar{overflow-x:auto}#pr-painel-complexidade .cx-tab{width:100%;border-collapse:collapse;min-width:640px}'+
   '#pr-painel-complexidade .cx-tab th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b;padding:8px 10px;border-bottom:1px solid #e3e7ec}'+
   '#pr-painel-complexidade .cx-tab td{padding:10px;border-bottom:1px solid #eef1f4;vertical-align:middle}'+
   '#pr-painel-complexidade .cx-p b{display:block;font-weight:600;font-size:14px}#pr-painel-complexidade .cx-p small{display:block;color:#6b6b6b;font-size:12.5px;margin-top:3px;line-height:1.45}'+
   '#pr-painel-complexidade .cx-pt{width:110px}#pr-painel-complexidade .cx-pt input{width:80px;min-height:38px;border:1px solid #dce0e5;border-radius:9px;padding:6px 9px;font:inherit;text-align:right}'+
   '#pr-painel-complexidade .cx-imp{width:200px;white-space:nowrap;font-size:13px;font-weight:600}'+
   '#pr-painel-complexidade .cx-barra{display:inline-block;vertical-align:middle;width:110px;height:8px;border-radius:999px;background:#eef1f4;margin-right:8px;overflow:hidden}'+
   '#pr-painel-complexidade .cx-barra i{display:block;height:100%;background:#123f86;border-radius:999px;transition:width .2s}'+
   '#pr-painel-complexidade .cx-param-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px}'+
   '#pr-painel-complexidade .cx-param-grid label{display:flex;flex-direction:column;gap:5px;font-size:13px}#pr-painel-complexidade .cx-param-grid small{color:#6b6b6b;font-size:12px}'+
   '#pr-painel-complexidade .cx-param-grid input,#pr-painel-complexidade .cx-param-grid textarea{min-height:42px;border:1px solid #dce0e5;border-radius:9px;padding:9px;font:inherit;width:100%}'+
   '#pr-painel-complexidade .cx-dias{margin:18px 0 0;border:1px solid #dce0e5;border-radius:12px;padding:12px 14px;display:flex;gap:16px;flex-wrap:wrap}#pr-painel-complexidade .cx-dias label{font-size:13px}'+
   '#pr-painel-complexidade .cx-cores-linha{display:flex;flex-wrap:wrap;gap:12px 28px;align-items:center;font-size:14px}#pr-painel-complexidade .cx-cores-linha label{display:inline-flex;align-items:center;gap:8px}'+
   '#pr-painel-complexidade .cx-cores-linha input{width:70px;min-height:38px;border:1px solid #dce0e5;border-radius:9px;padding:6px 9px;font:inherit;text-align:right}'+
   '#pr-painel-complexidade .cx-chip{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:600;font-size:13px}'+
   '#pr-painel-complexidade .cx-azul{background:#e3edfb;color:#123f86}#pr-painel-complexidade .cx-amarelo{background:#fdf1cf;color:#7a5a00}#pr-painel-complexidade .cx-vermelho{background:#fbe1df;color:#a8261d}'+
   '#pr-painel-complexidade .cx-cores-previa{display:flex;height:12px;border-radius:999px;overflow:hidden;margin-top:14px}#pr-painel-complexidade .cx-cores-previa i{display:block;flex:1}'+
   '#pr-painel-complexidade .cx-cores-previa .cx-azul{background:#9dbbe8}#pr-painel-complexidade .cx-cores-previa .cx-amarelo{background:#f2d27a}#pr-painel-complexidade .cx-cores-previa .cx-vermelho{background:#ec9a92}'+
   '#pr-painel-complexidade .cx-acoes{position:sticky;bottom:0;background:#f3f5f6;padding:12px 0;display:flex;gap:10px;justify-content:flex-end;align-items:center;z-index:2}#pr-painel-complexidade .cx-acoes span{margin-right:auto;font-size:13px}';
  root.append(style);
  root.addEventListener('input',e=>{if(e.target.matches('[data-cx-faixa]'))pintarCores();if(e.target.matches('[data-cx-peso],[data-cx-param]')){if(e.target.matches('[data-cx-param]'))lerParams();atualizar();}});
  root.querySelector('#cxSalvar').addEventListener('click',async()=>{const st=root.querySelector('#cxParamStatus');st.textContent='Salvando…';
   try{await window.salvarParametrosComplexidade(empresa);st.textContent='Complexidade salva. Vale para os pedidos em aberto.';}catch(err){st.textContent='Não foi possível salvar: '+err.message;window.alerta?.(st.textContent,'Parâmetros','erro');}});
  root.querySelector('#cxRestaurar').addEventListener('click',()=>{const p=CXRegras.padrao().pesos;root.querySelectorAll('[data-cx-peso]').forEach(el=>{el.value=p[el.dataset.cxPeso][el.dataset.resposta];});atualizar();root.querySelector('#cxParamStatus').textContent='Pontos padrão restaurados. Clique em Salvar para gravar.';});
  atualizar();pintarCores();
 };
 function lerParams(){host.querySelectorAll('[data-cx-param]').forEach(el=>{const k=el.dataset.cxParam;config[k]=el.type==='number'?Number(el.value):el.tagName==='TEXTAREA'?el.value.split('\n').map(s=>s.trim()).filter(Boolean):el.value;});}
 window.salvarParametrosComplexidade=async empresa=>{
  if(!host)return;lerParams();atualizar();const novo=structuredClone(config);
  novo.dias_expediente=[...host.querySelectorAll('[data-cx-dia]:checked')].map(el=>Number(el.dataset.cxDia));
  for(const s of CXRegras.setores)if(maxSetor(s)<=0)throw Error('Defina pontos positivos para '+s.nome+'.');
  const az=Number(host.querySelector('[data-cx-faixa="azul_ate"]').value),am=Number(host.querySelector('[data-cx-faixa="amarelo_ate"]').value);
  if(!(az>=1&&am<=99&&az<am))throw Error('Cores do resultado: o azul vai até um número menor que o do amarelo (de 1% a 99%).');
  novo.faixas_cor={azul_ate:az,amarelo_ate:am};
  const {error}=await window.supabaseClient.rpc('complexidade_config_salvar',{p_empresa:empresa,p_config:novo});if(error)throw error;config=novo;
 };
})();
