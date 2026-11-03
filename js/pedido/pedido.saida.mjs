export function instalarProtecaoSaida({temAlteracoes,salvar,rascunho=()=>{},janela=window}){
 let pendente=null,liberado=false;
 async function conferir(){
  if(liberado||!temAlteracoes())return true;
  if(pendente)return pendente;
  pendente=(async()=>{
   rascunho();
   const texto='Este pedido tem alterações não salvas. Salve antes de sair para não perder informações. Deseja salvar agora?';
   const sim=janela.confirmarGlobal?await janela.confirmarGlobal(texto,'Salvar pedido antes de sair'):janela.confirm(texto);
   if(!sim)return false;
   try{return await salvar()===true;}catch(e){janela.alerta?.(e.message||'Não foi possível salvar o pedido.','Pedido','erro');return false;}
  })();
  try{return await pendente;}finally{pendente=null;}
 }
 janela.appBeforeLeave=conferir;
 janela.addEventListener('beforeunload',e=>{if(!liberado&&temAlteracoes()){rascunho();e.preventDefault();e.returnValue='';}});
 janela.document.addEventListener('click',async e=>{
  const a=e.target.closest?.('a[href]');if(!a||a.download||a.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button>0)return;
  const url=new URL(a.href,janela.location.href);
  if(!['http:','https:'].includes(url.protocol)||url.href.split('#')[0]===janela.location.href.split('#')[0])return;
  if(!temAlteracoes())return;
  e.preventDefault();e.stopImmediatePropagation();
  if(await conferir()){liberado=true;(a.target==='_parent'?janela.parent:a.target==='_top'?janela.top:janela).location.assign(url.href);}
 },true);
 return conferir;
}
