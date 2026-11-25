(function(){
 'use strict';
 const dia=x=>x?String(x).slice(8,10)+'/'+String(x).slice(5,7)+'/'+String(x).slice(0,4):'Sem data';
 function sugestao(l,opcoes){
   if(!l.pedido||!l.data||!l.direcao)return '';
   const candidatas=opcoes.filter(o=>String(o.pedido||'').replace(/^0+/,'')===String(l.pedido).replace(/^0+/,'')&&o.data===l.data&&o.direcao===l.direcao);
   return candidatas.length===1?candidatas[0].chave:'';
 }
 async function abrir({C,forn,arquivo,referencia,concluido}){
   const emp=C.S.emp,d=document.createElement('dialog');d.className='fe-import-dialogo';let gravando=false,linhas,opcoes,frete;
   d.innerHTML='<header><h2>Importar cobrança</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><p>'+C.esc(forn.nome)+' · '+C.esc(arquivo.name)+'</p><p role="status">Lendo os serviços do documento…</p>';
   document.body.append(d);d.querySelector('[data-fechar]').onclick=()=>d.close();d.onclose=()=>{if(!gravando)d.remove();};d.oncancel=e=>{if(gravando)e.preventDefault();};d.showModal();
   try{
     if(arquivo.size>10*1024*1024)throw Error('Envie um arquivo de até 10 MB.');
     const [lido,vinculos]=await Promise.all([window.FinanceiroClara.lerCobranca(arquivo,C),C.rpc('fin_frete_cobranca_opcoes',{p_empresa:emp,p_fornecedor:forn.id})]);
     if(!d.open)return;linhas=lido.linhas||[];opcoes=vinculos?.opcoes||[];frete=!!vinculos?.frete;if(!linhas.length)throw Error('Não encontrei serviços cobrados no documento.');
     const rotulo=o=>[o.solicitacao_interna?'Solicitação interna: '+o.motivo:'Pedido '+o.pedido+' · '+(o.cliente||''),dia(o.data),o.direcao==='entrega'?'Ida':o.direcao==='coleta'?'Volta':'',o.freteiro,o.destino].filter(Boolean).join(' · ');
     d.querySelector('[role=status]').outerHTML='<p class="fe-import-ajuda">'+(frete?'Confira cada linha e escolha o frete correspondente. Sem pedido, use apenas uma solicitação interna cadastrada na Logística.':'Confira os serviços. A cobrança em conferência deste parceiro será substituída pelo documento; as contas serão comparadas novamente.')+'</p>'+
       (frete&&!opcoes.length?'<p class="cl-aviso">Não há fretes disponíveis para importar. Verifique se já foram enviados pelo app ou cadastre a solicitação interna na Logística.</p>':'')+
       '<form><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Importar</th><th>Data</th><th>Serviço no documento</th><th>Cobrado</th>'+(frete?'<th>Pedido ou solicitação interna</th>':'')+'</tr></thead><tbody>'+linhas.map((l,i)=>'<tr data-import-linha="'+i+'"><td><input type="checkbox" name="incluir" checked aria-label="Importar linha '+(i+1)+'"></td><td><input type="date" name="data" value="'+C.esc(l.data||'')+'" aria-label="Data da linha '+(i+1)+'"></td><td><strong>'+C.esc(l.descricao||l.documento||'Serviço')+'</strong>'+(l.explicacao?'<small>'+C.esc(l.explicacao)+'</small>':'')+'</td><td><input name="valor" type="number" min="0.01" step="0.01" value="'+C.esc(l.valor)+'" aria-label="Valor da linha '+(i+1)+'"></td>'+(frete?'<td><select name="chave" aria-label="Frete da linha '+(i+1)+'"><option value="">Escolha o frete</option>'+opcoes.map(o=>'<option value="'+C.esc(o.chave)+'"'+(o.chave===sugestao(l,opcoes)?' selected':'')+'>'+C.esc(rotulo(o))+'</option>').join('')+'</select></td>':'')+'</tr>').join('')+'</tbody></table></div><p role="alert" class="fin-erro" hidden></p><footer><span data-total></span><button type="button" class="fin-btn claro" data-cancelar>Cancelar</button><button type="submit" class="fin-btn">Importar serviços</button></footer></form>';
     const form=d.querySelector('form'),erro=form.querySelector('[role=alert]'),total=form.querySelector('[data-total]');
     const atualizar=()=>{const selecionadas=[...form.querySelectorAll('[data-import-linha]')].filter(tr=>tr.querySelector('[name=incluir]').checked);total.textContent=selecionadas.length+' serviço(s) · '+C.brl(selecionadas.reduce((n,tr)=>n+Number(tr.querySelector('[name=valor]').value||0),0));};form.oninput=atualizar;atualizar();
     form.querySelector('[data-cancelar]').onclick=()=>d.close();
     form.onsubmit=async e=>{
       e.preventDefault();if(gravando)return;erro.hidden=true;
       const dados=[...form.querySelectorAll('[data-import-linha]')].filter(tr=>tr.querySelector('[name=incluir]').checked).map(tr=>({...linhas[Number(tr.dataset.importLinha)],data:tr.querySelector('[name=data]').value,valor:Number(tr.querySelector('[name=valor]').value),chave:tr.querySelector('[name=chave]')?.value}));
       try{
         if(!dados.length)throw Error('Selecione pelo menos um serviço.');
         if(dados.some(l=>!(l.valor>0)||!l.data))throw Error('Confira a data e o valor dos serviços selecionados.');
         if(frete&&dados.some(l=>!l.chave))throw Error('Escolha o pedido ou a solicitação interna de cada frete.');
         if(frete&&new Set(dados.map(l=>l.chave)).size!==dados.length)throw Error('O mesmo frete foi escolhido em mais de uma linha.');
         if(frete&&dados.some(l=>opcoes.find(o=>o.chave===l.chave)?.data!==l.data))throw Error('A data do documento deve corresponder ao frete escolhido.');
         gravando=true;d.querySelectorAll('button,input,select').forEach(x=>x.disabled=true);
         if(frete){
           const caminho=emp+'/financeiro/cobrancas/'+crypto.randomUUID()+'/'+arquivo.name.replace(/[^\w.-]+/g,'_');
           const up=await C.S.sb.storage.from('compras-documentos').upload(caminho,arquivo,{contentType:arquivo.type||'application/octet-stream',upsert:false});if(up.error)throw Error(up.error.message);
           try{await C.rpc('fin_frete_cobranca_importar',{p_empresa:emp,p_fornecedor:forn.id,p_linhas:dados,p_arquivo:arquivo.name,p_arquivo_url:'compras-documentos:'+caminho});}
           catch(ex){await C.S.sb.storage.from('compras-documentos').remove([caminho]).catch(()=>{});throw ex;}
         }else{
           const id=forn.fechamentos.find(f=>f.status==='em_conferencia')?.id||await C.rpc('fin_fechamento_criar',{p_empresa:emp,p_fornecedor:forn.id,p_referencia:referencia});
           await C.rpc('fin_fechamento_importar',{p_empresa:emp,p_id:id,p_arquivo:arquivo.name,p_linhas:dados});
         }
       }catch(ex){gravando=false;erro.textContent=ex.message;erro.hidden=false;d.querySelectorAll('button,input,select').forEach(x=>x.disabled=false);return;}
       gravando=false;d.close();C.avisar('Cobrança importada. As diferenças ficam nos próprios fretes para conferência.','Importar cobrança','sucesso');await concluido();
     };
   }catch(ex){if(!d.open)return;const status=d.querySelector('[role=status]');if(status){status.setAttribute('role','alert');status.textContent=ex.message;}}
 }
 window.FinanceiroImportarCobranca={abrir};
})();
