// Filtros de consulta não são campos de credenciais do navegador.
(function(){
  if(window.__filterInputsReady)return;
  window.__filterInputsReady=true;
  const configurados=new WeakSet(),editados=new WeakSet(),campos=new Set();
  let emailLogin='';
  const style=document.createElement('style');
  style.textContent='@keyframes elFilterAutofill{from{}to{}}input[data-query-filter]:-webkit-autofill{animation-name:elFilterAutofill!important;animation-duration:.01s!important}';
  document.head.appendChild(style);
  function limparAutomatico(input){
    if(editados.has(input)||!input.value)return;
    input.value='';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function verificar(input){
    let autofill=false;
    try{autofill=input.matches(':autofill,:-webkit-autofill');}catch(_){}
    if(autofill || (emailLogin && input.value.trim().toLowerCase()===emailLogin))limparAutomatico(input);
  }
  async function identificarLogin(){
    try{
      const {data}=await window.supabaseClient?.auth?.getSession?.() || {};
      emailLogin=String(data?.session?.user?.email || '').trim().toLowerCase();
      campos.forEach(verificar);
    }catch(_){}
  }
  const filtros='.filters,.filtros,.filtros-painel,.filter-bar,.el-filter-bar,[role="search"]';
  function configurar(input){
    if(!['text','search'].includes(input.type) || input.autocomplete==='username')return;
    if(!input.closest(filtros) && !/filtro|filter|search/i.test(input.id) && !/^(buscar|pesquisar|filtrar)\b/i.test(input.placeholder))return;
    if(configurados.has(input))return;
    configurados.add(input);campos.add(input);
    input.setAttribute('data-query-filter','');
    input.type='search';
    input.autocomplete='off';
    input.setAttribute('data-lpignore','true');
    input.setAttribute('data-1p-ignore','true');
    input.setAttribute('autocapitalize','off');
    input.spellcheck=false;
    if(!input.name)input.name='consulta-'+(input.id || 'filtro');
    input.setAttribute('data-bwignore','true');
    // Impede o preenchimento na abertura, liberando o campo ao receber foco.
    if(!input.value && !input.readOnly && document.activeElement!==input){
      input.readOnly=true;
      input.addEventListener('focus',()=>{input.readOnly=false;verificar(input);},{once:true});
    }
    input.addEventListener('beforeinput',event=>{
      if(event.isTrusted && /^(insertText|insertFromPaste|delete)/.test(event.inputType))editados.add(input);
    });
    input.addEventListener('paste',event=>{if(event.isTrusted)editados.add(input);});
    input.addEventListener('animationstart',event=>{if(event.animationName==='elFilterAutofill')limparAutomatico(input);});
    input.addEventListener('input',()=>verificar(input));
    verificar(input);
  }
  function revisar(root){
    if(root.nodeType!==1)return;
    if(root.matches('input'))configurar(root);
    root.querySelectorAll('input').forEach(configurar);
  }
  revisar(document.documentElement);
  identificarLogin();
  window.addEventListener('easyloc:context-ready',identificarLogin);
  [100,500,1500,4000].forEach(delay=>setTimeout(()=>{
    for(const input of campos){if(input.isConnected)verificar(input);else campos.delete(input);}
    if(!emailLogin)identificarLogin();
  },delay));
  new MutationObserver(changes=>changes.forEach(change=>change.addedNodes.forEach(revisar)))
    .observe(document.documentElement,{childList:true,subtree:true});
})();
