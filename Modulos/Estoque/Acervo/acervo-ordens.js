(function(){'use strict';
 const setores=['Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados'];
 window.AcervoOrdens={abrir({dlg,r,ordem,esc,rpc,concluido}){
  const inline=dlg.tagName!=='DIALOG',fechar=()=>{if(inline)dlg.replaceChildren();else dlg.close();};
  const o=ordem,fechada=o?.concluida,opcoes=setores.map(s=>'<option '+(s===o?.setor?'selected':'')+'>'+esc(s)+'</option>').join('');
  dlg.innerHTML='<div class="ac-dialogo-topo"><h2>'+(o?'O.S #'+esc(o.numero):'Nova ordem de serviço')+'</h2><button type="button" data-fechar aria-label="Fechar">×</button></div><section class="ac-card"><h3>'+esc(r.nome)+'</h3><p>'+esc(r.quantidade)+' unidade(s) · '+esc(r.motivo||'')+'</p>'+
   (fechada?'<p>O.S concluída. A liberação das peças depende da inspeção do acervo.</p>':'<form id="acOSNativa"><label>Ação<select name="acao">'+(o?'<option value="encaminhar">Atualizar / encaminhar</option><option value="concluir">Concluir serviço</option>':'<option value="criar">Abrir O.S</option>')+'</select></label><label>Setor<select name="setor" required>'+opcoes+'</select></label><label>Prazo<input name="prazo" type="date" value="'+esc(o?.prazo||'')+'"></label><label>Responsável<input name="responsavel" maxlength="120" value="'+esc(o?.responsavel||'')+'"></label>'+(o?'<label>Resultado / motivo<input name="motivo" required minlength="5" maxlength="1000"></label>':'')+'<button type="submit">Salvar</button></form>')+
   '<p data-os-status role="status"></p>'+(o?.historico?.length?'<details><summary>Histórico</summary>'+o.historico.map(h=>'<p>'+esc(new Date(h.em).toLocaleString('pt-BR'))+' · '+esc(h.acao)+' · '+esc(h.setor||'')+' '+esc(h.motivo||'')+'</p>').join('')+'</details>':'')+'</section>';
  dlg.querySelector('[data-fechar]').onclick=fechar;if(inline)dlg.querySelector('[data-fechar]').textContent='Cancelar';else if(!dlg.open)dlg.showModal();
  dlg.querySelector('form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;const status=dlg.querySelector('[data-os-status]');status.textContent='Salvando…';try{
   if(o)await rpc('acervo_os_atualizar',{p_os:o.id,p_versao:o.versao,p_acao:f.elements.acao.value,p_setor:f.elements.setor.value,p_prazo:f.elements.prazo.value||null,p_responsavel:f.elements.responsavel.value,p_motivo:f.elements.motivo.value});
   else await rpc('acervo_os_criar',{p_retorno:r.id,p_versao:r.versao,p_setor:f.elements.setor.value,p_prazo:f.elements.prazo.value||null,p_responsavel:f.elements.responsavel.value});
   fechar();await concluido();
  }catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{b.disabled=false;}});
 }};
})();
