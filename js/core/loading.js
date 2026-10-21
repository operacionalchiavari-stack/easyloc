// Apresentação compartilhada de estados de carregamento, inclusive nos módulos antigos.
(function () {
  if(window.__loadingPresentationReady) return;
  window.__loadingPresentationReady = true;
  const style=document.createElement('style');
  style.textContent='.el-loading-indicator{display:inline-flex!important;align-items:center!important;justify-content:center!important;vertical-align:middle;line-height:1!important}.el-loading-ring{display:inline-block!important;box-sizing:border-box!important;width:34px!important;height:34px!important;flex:none!important;border:3px solid var(--el-color-border,#e3e7ec)!important;border-top-color:#5f5f5f!important;border-radius:50%!important;animation:elLoadingSpin .8s linear infinite!important}button .el-loading-ring{width:16px!important;height:16px!important;border-width:2px!important}@keyframes elLoadingSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
  const mensagem=/^carregando(?:\s+[^<>\n]{1,100}?)?(?:\.{1,3}|…)?$/i;
  const ignorar='script,style,textarea,input,[contenteditable="true"],.el-loading-indicator,[data-loading-ignore],.sidebar-user,.usuario-dados,#usuarioNome,#empresaNome';
  const circulos='.el-spinner,.spinner,.loading-spinner,.loader-circle,.giro,.pa-carregando i,.el-loading-indicator';
  function converter(node){
    const parent=node.parentElement;
    if(!parent || parent.closest(ignorar) || !mensagem.test(node.textContent.trim())) return;
    const label=node.textContent.trim();
    if(parent.tagName==='OPTION'){
      parent.setAttribute('aria-label',label);node.textContent='';return;
    }
    // O círculo pode ser irmão do rótulo, não apenas filho do mesmo elemento.
    const irmao=parent.matches('span,p,.loader-text')
      ? Array.from(parent.parentElement?.children || []).find(el=>el!==parent && el.matches(circulos)) : null;
    const existente=parent.matches(circulos)?parent:parent.querySelector(circulos) || irmao;
    if(existente){
      parent.setAttribute('role','status');parent.setAttribute('aria-label',label);
      node.textContent='';return;
    }
    const indicador=document.createElement('span');
    indicador.className='el-loading-indicator';indicador.setAttribute('role','status');indicador.setAttribute('aria-label',label);
    const ring=document.createElement('span');ring.className='el-loading-ring';ring.setAttribute('aria-hidden','true');
    indicador.appendChild(ring);node.replaceWith(indicador);
  }
  function revisar(root){
    if(root.nodeType===Node.TEXT_NODE){converter(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE || root.closest(ignorar))return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(converter);
  }
  revisar(document.documentElement);
  new MutationObserver(changes=>{
    for(const change of changes){
      if(change.type==='characterData')converter(change.target);
      else change.addedNodes.forEach(revisar);
    }
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
