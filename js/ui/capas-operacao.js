(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const instancias=new Map();let seq=0;
 class ConferenciaCapas{
  constructor({sb,pedido,etapa,cega=false}){this.sb=sb;this.pedido=pedido;this.etapa=etapa;this.cega=cega;this.rows=[];this.dirty=new Map();this.id='cp'+(++seq);this.fila=Promise.resolve();instancias.set(this.id,this);this.carregando=true;this.pronto=this.carregar();}
  async carregar(){const {data,error}=await this.sb.rpc('capas_pedido',{p_pedido:this.pedido,p_etapa:this.etapa});this.carregando=false;if(error){this.erro=error;throw error;}this.erro=null;this.rows=Array.isArray(data)?data:[];return this;}
  linha(p){return this.rows.find(r=>String(r.item_id)===String(p.item_id)&&String(r.pedido_id)===String(p.pedido_id||p.separacao_pedido_id||this.pedido));}
  resumo(r){
   if(this.cega&&!r.concluida)return '';
   const partes=[];
   if(['retorno','descarregamento'].includes(this.etapa)){
    if(r.enviadas==null)partes.push('Saida sem registro de materiais');
    else{partes.push('Sairam '+r.enviadas);if(r.quantidade!=null&&r.quantidade<r.enviadas)partes.push((r.enviadas-r.quantidade)+' nao devolvido(s)');}
   }
   if(r.danificadas)partes.push(r.danificadas+' danificado(s)');
   return partes.join(' / ');
  }

  celula(p,editavel=true){
   const r=this.linha(p);if(this.erro)return '<div class="cp-cell cp-alerta">Não foi possível consultar os materiais</div>';if(this.carregando)return '<div class="cp-cell cp-sem">Carregando materiais…</div>';
   if(!r||!r.usa_capa)return '<div class="cp-cell cp-sem"><span>Material de proteção</span><small>'+(r?.configurado?'Sem material':'Não cadastrada')+'</small></div>';
   const disabled=!editavel||r.concluida;
   return '<div class="cp-cell'+(r.quantidade!=null&&(r.danificadas>0||r.esperado!=null&&r.quantidade!==r.esperado)?' cp-diferenca':'')+'" data-capas-instancia="'+this.id+'" data-capas-chave="'+esc(r.chave)+'"><div class="cp-quantidade-label">Material de proteção</div><div class="cp-stepper"><button type="button" data-capas-delta="-1" aria-label="Diminuir material" '+(disabled?'disabled':'')+'>-</button><input type="number" min="0" max="1000000" step="1" inputmode="numeric" data-capas-campo="quantidade" aria-label="Material: '+esc(r.nome)+'" value="'+esc(r.quantidade??'')+'" '+(disabled?'disabled':'')+'><button type="button" data-capas-delta="1" aria-label="Aumentar material" '+(disabled?'disabled':'')+'>+</button></div><small data-capas-resumo>'+esc(this.resumo(r))+'</small><details><summary>Condição / observação</summary><label>Danificadas dentro do total<input type="number" min="0" max="1000000" step="1" data-capas-campo="danificadas" value="'+esc(r.danificadas||0)+'" '+(disabled?'disabled':'')+'></label>'+(['triagem','carregamento'].includes(this.etapa)?'<label>Prote&#231;&#227;o aplicada no item?<select data-capas-campo="protecao_aplicada" '+(disabled?'disabled':'')+'><option value="" '+(r.protecao_aplicada==null?'selected':'')+'>N&#227;o verificado</option><option value="true" '+(r.protecao_aplicada===true?'selected':'')+'>Sim</option><option value="false" '+(r.protecao_aplicada===false?'selected':'')+'>N&#227;o</option></select></label>':'')+'<label>Observação<input maxlength="500" data-capas-campo="observacao" value="'+esc(r.observacao||'')+'" '+(disabled?'disabled':'')+'></label></details><small class="cp-capacidade">'+esc(r.capacidade)+' unidade(s) por material'+(r.chaves?.length>1?' · contagem única deste modelo no pedido':'')+'</small><small data-capas-status role="status"></small></div>';
  }
  atualizar(el){const box=el.closest('[data-capas-chave]'),r=this.rows.find(r=>r.chave===box.dataset.capasChave);if(!r)return;
   const campo=el.dataset.capasCampo;r[campo]=campo==='protecao_aplicada'?(el.value===''?null:el.value==='true'):campo==='observacao'?el.value:el.value===''?null:Number(el.value);this.dirty.set(r.chave,{...(this.dirty.get(r.chave)||{}),revisao:(this.dirty.get(r.chave)?.revisao||0)+1});
   document.querySelectorAll('[data-capas-instancia="'+this.id+'"]').forEach(b=>{if(b.dataset.capasChave!==r.chave)return;const outro=b.querySelector('[data-capas-campo="'+campo+'"]');if(outro&&outro!==el)outro.value=el.value;b.querySelector('[data-capas-resumo]').textContent=this.resumo(r);b.querySelector('[data-capas-status]').textContent='A salvar';});
  }
  diferencas(){return this.rows.filter(r=>r.usa_capa&&r.quantidade!=null&&(r.danificadas>0||r.esperado!=null&&r.quantidade!==r.esperado)).length;}
  async salvar(exigirTodos=false){
   await this.pronto;
   const trabalho=async()=>{if(this.erro)throw this.erro;const versoes=new Map(this.dirty);const alteradas=this.rows.filter(r=>this.dirty.has(r.chave));
    for(const r of alteradas)if(!Number.isInteger(r.quantidade)||r.quantidade<0||!Number.isInteger(r.danificadas)||r.danificadas<0||r.danificadas>r.quantidade)throw Error('Confira o total de capas e as danificadas de '+r.nome+'. Informe 0 quando não houver.');
    if(alteradas.length){const {data,error}=await this.sb.rpc('capas_contagem_salvar',{p_pedido:this.pedido,p_etapa:this.etapa,p_contagens:alteradas.map(r=>({chave:r.chave,quantidade:r.quantidade,danificadas:r.danificadas,observacao:r.observacao||'',protecao_aplicada:r.protecao_aplicada??null,versao:r.versao||0}))});if(error)throw error;
     for(const [k,v] of versoes)if(this.dirty.get(k)?.revisao===v.revisao)this.dirty.delete(k);
     const locais=new Map(this.rows.filter(r=>this.dirty.has(r.chave)).map(r=>[r.chave,r]));this.rows=(Array.isArray(data)?data:this.rows).map(r=>locais.has(r.chave)?{...r,quantidade:locais.get(r.chave).quantidade,danificadas:locais.get(r.chave).danificadas,observacao:locais.get(r.chave).observacao,protecao_aplicada:locais.get(r.chave).protecao_aplicada}:r);
    }
    if(exigirTodos){if(!this.dirty.size)await this.carregar();const falta=this.rows.find(r=>r.usa_capa&&!r.concluida&&r.quantidade==null);if(falta)throw Error('Informe a quantidade de materiais de '+falta.nome+' (0 quando não houver).');}
    document.querySelectorAll('[data-capas-instancia="'+this.id+'"] [data-capas-status]').forEach(e=>e.textContent=this.dirty.size?'A salvar':'Salvo');return true;
   };
   const atual=this.fila.catch(()=>{}).then(trabalho);this.fila=atual;return atual;
  }
 }
 document.addEventListener('click',e=>{
  const botao=e.target.closest('[data-capas-delta]');if(!botao||botao.disabled)return;
  const box=botao.closest('[data-capas-instancia]'),c=instancias.get(box?.dataset.capasInstancia),input=box?.querySelector('[data-capas-campo="quantidade"]');
  if(!c||!input||input.disabled)return;
  input.value=String(Math.max(0,Math.min(1000000,(Number(input.value)||0)+Number(botao.dataset.capasDelta))));
  c.atualizar(input);c.salvar().catch(err=>{box.querySelector('[data-capas-status]').textContent='Nao salvo: '+err.message;});
 });
 document.addEventListener('input',e=>{const b=e.target.closest('[data-capas-instancia]');if(b&&e.target.dataset.capasCampo)instancias.get(b.dataset.capasInstancia)?.atualizar(e.target);});
 document.addEventListener('change',e=>{const b=e.target.closest('[data-capas-instancia]');if(!b||!e.target.dataset.capasCampo)return;const c=instancias.get(b.dataset.capasInstancia);c?.salvar().catch(err=>{b.querySelector('[data-capas-status]').textContent='Não salvo: '+err.message;});});
 window.CapasOperacao={criar:opts=>new ConferenciaCapas(opts)};
})();
