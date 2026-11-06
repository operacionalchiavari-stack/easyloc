(async function(){
 'use strict';
 await window.aguardarContexto?.();
 try{await window.EasyLocPermissions?.load?.();if(!window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.visualizar'))return;}catch(_){return;}
 const container=document.querySelector('.container-fornecedores');if(!container)return;
 const detalhes=document.createElement('details');detalhes.className='fornecedores-app';detalhes.style.cssText='margin:12px 0;border:1px solid var(--el-color-border,#dde3eb);border-radius:14px;background:var(--el-color-surface,#fff);overflow:hidden';
 detalhes.innerHTML='<summary style="padding:12px 16px;cursor:pointer;font-weight:600">Cadastros recebidos pelo app</summary><p style="margin:0;padding:0 16px 12px;font-size:13px;color:var(--el-color-text-muted,#64748b)">Ao aprovar, o fornecedor e o caminhão são cadastrados e vinculados automaticamente.</p>';
 container.querySelector('.table-wrapper')?.before(detalhes);
 let quadro;
 detalhes.addEventListener('toggle',()=>{if(!detalhes.open||quadro)return;quadro=document.createElement('iframe');quadro.id='fornecedoresCadastrosApp';quadro.title='Cadastros do app em análise';quadro.style.cssText='display:block;width:100%;height:240px;border:0';quadro.src='../../Chiavari/Fretes/freteiros.html?integrado=fornecedores';detalhes.append(quadro);});
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||!quadro||e.source!==quadro.contentWindow)return;
  if(e.data?.tipo==='fretes-cadastros-altura')quadro.style.height=Math.min(420,Math.max(80,Number(e.data.altura)||80))+'px';
  if(e.data?.tipo==='fretes-cadastro-aprovado')window.dispatchEvent(new Event('fornecedores-atualizar'));
 });
})();
