/* Condições reutilizáveis; vazio significa não informado, nunca Não. */
(function(){
 'use strict';
 const campos={cliente:[['reclamacao','Há reclamação operacional registrada?','bool'],['exclusivo','Cliente possui exclusividade?','bool']],local:[['baldeacao','O transporte exige baldeação?','bool'],['escada','O transporte das peças exige escada?','bool'],['distancia_manual_m','Distância do caminhão até a montagem (metros)','numero']],item:[['fragil','Peça frágil?','bool'],['volumoso','Exige manuseio de carga volumosa?','bool'],['sob_medida','Peça sob medida?','bool'],['grupo','Grupo utilizado na complexidade','grupo']]};
 const grupos=[['sofa','Sofá'],['cadeira_puff','Cadeira, poltrona ou puff'],['bar','Bar'],['mesa','Mesa'],['aparador_estante','Aparador ou estante'],['painel','Painel'],['outro','Outro']];
 campos.kit=campos.item;
 const bases={},hosts={};
 function montar(tipo){
  if(hosts[tipo])return hosts[tipo];
  const root=document.querySelector(tipo==='cliente'?'#modal .clientes-detail-card':tipo==='local'?'#locais-modal .locais-detail-card':tipo==='kit'?'#kitsModal [data-kit-panel="dados"]':'[data-item-panel="dados"],#itensModal .modal-content');
  if(!root)return null;
  const box=document.createElement('fieldset');box.className='cx-cadastro';box.dataset.cxCadastro=tipo;
  box.innerHTML='<legend>Condições para a complexidade dos pedidos</legend><p>Informe uma vez para reutilizar nos pedidos. Deixe “Não informado” quando ainda não souber. Exceções podem ser registradas em cada pedido.</p><div class="cx-cadastro-campos"></div>';
  for(const [key,label,t] of campos[tipo]){
   const l=document.createElement('label');l.textContent=label;
   const input=document.createElement(t==='numero'?'input':'select');input.id='cx-'+tipo+'-'+key;input.dataset.cxCampo=key;
   if(t==='numero'){input.type='number';input.min='0';input.max='100000';input.placeholder='Não informado';input.step='0.1';}
   else{input.add(new Option(t==='grupo'?'Usar família/categoria do item':'Não informado',''));for(const [v,n] of t==='grupo'?grupos:[['true','Sim'],['false','Não']])input.add(new Option(n,v));}
   l.append(input);box.querySelector('div').append(l);
  }
  const footer=root.querySelector('.modal-actions-right,.modal-footer');if(footer)footer.before(box);else root.append(box);
  hosts[tipo]=box;return box;
 }
 function preencher(tipo,dados){const host=montar(tipo);if(!host)return;bases[tipo]={...(dados||{})};for(const [k,,t] of campos[tipo])host.querySelector('[data-cx-campo="'+k+'"]').value=dados?.[k]===null||dados?.[k]===undefined?'':String(dados[k]);}
 function ler(tipo){const host=montar(tipo);if(!host)return undefined;const r={...(bases[tipo]||{})};for(const [k,,t] of campos[tipo]){const v=host.querySelector('[data-cx-campo="'+k+'"]').value;r[k]=v===''?null:t==='bool'?v==='true':t==='numero'?Number(v):v;if(t==='numero'&&v!==''&&(!Number.isFinite(r[k])||r[k]<0||r[k]>100000))throw Error('Confira a distância de transporte das peças.');}return r;}
 window.CXCadastro={preencher,ler};
 ['cliente','local','item','kit'].forEach(t=>preencher(t,{}));
 const css=document.createElement('style');css.textContent='.cx-cadastro{min-width:0;margin:22px 0;padding:18px;border:1px solid var(--el-color-border,#e4e0d8);border-radius:16px}.cx-cadastro legend{font-size:16px;font-weight:600}.cx-cadastro p{font-size:13px;color:var(--el-color-text-muted,#746e65);line-height:1.5}.cx-cadastro-campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}.cx-cadastro label{display:flex;flex-direction:column;gap:7px;font-size:13px}.cx-cadastro select,.cx-cadastro input{width:100%;min-height:44px;padding:10px;border:1px solid #dcdfe4;border-radius:10px;background:white;color:#292929;font:inherit}';document.head.append(css);
})();
