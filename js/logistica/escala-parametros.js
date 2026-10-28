(function(){
 'use strict';
 window.carregarParametrosEscala=async function(host,empresa,opcoes={}){
  const sb=window.supabaseClient,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const conferir=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
  const [controle,restricoes,pessoas,pode]=await Promise.all([
   conferir(sb.from('empresa_escala_controle').select('*').eq('empresa_id',empresa)),
   conferir(sb.from('escala_restricoes_pessoas').select('*').eq('empresa_id',empresa).order('pessoa_a')),
   conferir(sb.rpc('operacao_pessoas')),
   conferir(sb.rpc('escala_controle_pode',{p_empresa:empresa}))
  ]);
  const nomes=new Map((pessoas||[]).map(p=>[(p.free?'free:':'func:')+p.id,p.nome]));
  const opts='<option value="">Selecione</option>'+[...nomes].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([id,nome])=>`<option value="${esc(id)}">${esc(nome)}${id.startsWith('free:')?' (Free)':''}</option>`).join('');
  const painel=document.createElement('div');painel.className='escala-parametros';
  painel.innerHTML=`<section class="escala-parametros-card"><h2>Escala autom\u00e1tica</h2><form data-controle><label class="escala-parametros-check"><input type="checkbox" name="automatica" ${controle?.[0]?.automatica===false?'':'checked'}>Montar a escala automaticamente</label><p>O sistema completa os espa\u00e7os vazios com respons\u00e1vel, equipe e caminh\u00f5es. Desativar preserva as escalas existentes e permite continuar montando a equipe manualmente.</p><button type="submit" class="btn primary">Salvar</button></form></section><section class="escala-parametros-card"><h2>Pessoas que n\u00e3o podem trabalhar juntas</h2><p>A restri\u00e7\u00e3o vale na mesma etapa, incluindo o respons\u00e1vel e a equipe. Tamb\u00e9m se aplica aos ajustes manuais. Escalas existentes precisam ser revisadas; n\u00e3o s\u00e3o alteradas automaticamente.</p><form data-restricao><label>Primeira pessoa<select name="a" class="el-select" required>${opts}</select></label><label>Segunda pessoa<select name="b" class="el-select" required>${opts}</select></label><label>Motivo (opcional)<input name="motivo" class="el-input" maxlength="300"></label><button type="submit" class="btn primary">Adicionar restri\u00e7\u00e3o</button></form><div data-restricoes></div></section>`;
  if(opcoes.mostrarAutomatica===false)painel.querySelector('[data-controle]').closest('section').remove();
  host.replaceChildren(painel);let lista=restricoes||[],ocupado=false;
  function render(){painel.querySelector('[data-restricoes]').innerHTML=lista.length?'<table><thead><tr><th>Pessoas</th><th>Motivo</th><th></th></tr></thead><tbody>'+lista.map(r=>`<tr><td>${esc(nomes.get(r.pessoa_a)||'Pessoa fora da equipe ativa')}<br>${esc(nomes.get(r.pessoa_b)||'Pessoa fora da equipe ativa')}</td><td>${esc(r.motivo||'\u2014')}</td><td>${pode?`<button type="button" class="btn" data-remover="${esc(r.id)}">Remover</button>`:''}</td></tr>`).join('')+'</tbody></table>':'<p>Nenhuma restri\u00e7\u00e3o cadastrada.</p>';}
  render();painel.querySelectorAll('input,select,button').forEach(el=>el.disabled=!pode);
  async function salvar(acao){if(ocupado||!pode)return;ocupado=true;painel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await acao();window.alerta('Par\u00e2metros da escala salvos.','Sucesso','sucesso');window.dispatchEvent(new CustomEvent('escala-parametros-alterados'));}catch(e){window.alerta(e.message,'Aten\u00e7\u00e3o','aviso');}finally{ocupado=false;painel.querySelectorAll('button').forEach(b=>b.disabled=!pode);}}
  painel.querySelector('[data-controle]')?.addEventListener('submit',e=>{e.preventDefault();salvar(()=>conferir(sb.rpc('escala_controle_salvar',{p_empresa:empresa,p_automatica:e.target.elements.automatica.checked})));});
  painel.querySelector('[data-restricao]').addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(f.elements.a.value===f.elements.b.value){window.alerta('Selecione duas pessoas diferentes.','Aten\u00e7\u00e3o','aviso');return;}salvar(async()=>{await conferir(sb.rpc('escala_restricao_salvar',{p_empresa:empresa,p_a:f.elements.a.value,p_b:f.elements.b.value,p_motivo:f.elements.motivo.value.trim()}));lista=await conferir(sb.from('escala_restricoes_pessoas').select('*').eq('empresa_id',empresa).order('pessoa_a'));render();f.reset();});});
  painel.addEventListener('click',e=>{const b=e.target.closest('[data-remover]');if(!b)return;salvar(async()=>{await conferir(sb.rpc('escala_restricao_excluir',{p_empresa:empresa,p_id:b.dataset.remover}));lista=lista.filter(r=>r.id!==b.dataset.remover);render();});});
 };
})();
