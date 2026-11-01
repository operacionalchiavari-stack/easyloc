/* Apresentação compartilhada. Login, presença, apontamento e bônus continuam nos apps originais. */
(function(){
 "use strict";
 const corpo=document.body;
 const tipo=corpo.dataset.appEquipe;
 if(!["montagem","free","bonus"].includes(tipo))return;
 const raiz=new URL("../../",document.currentScript.src);
 const icones={
  agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  equipe:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  avarias:'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01"/>',
  registros:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zm0 11 2 2 4-4"/>',
  inicio:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  conta:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  extrato:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8m-8 4h5"/>',
  premios:'<path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>',
  bonus:'<path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>',
  sair:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>',
  fechar:'<path d="m6 6 12 12M6 18 18 6"/>'
 };
 function svg(nome){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icones[nome]+'</svg>';}
 function logo(){
  const img=document.createElement("img");img.className="equipe-logo";
  img.addEventListener("load",()=>img.classList.toggle("quadrada",!!img.naturalHeight&&img.naturalWidth/img.naturalHeight<1.6));
  img.src=new URL("logo nova branca - sem fundo.png",raiz).href;img.alt="Chiavari · Móveis para eventos";return img;
 }
 document.querySelectorAll(".marca,.entrada-marca,.topo,.perfil").forEach(el=>el.prepend(logo()));
 if(tipo==='bonus'&&corpo.classList.contains('bonus-integrado')){identidade();return;}

 if(tipo==="montagem"||tipo==="free"){
  const texto=document.querySelector(".topo-texto");
  const descricao=document.createElement("p");descricao.className="equipe-descricao";
  descricao.textContent=tipo==="montagem"?"Cada detalhe faz o evento acontecer. Sua equipe começa por aqui.":"Novos eventos, novas oportunidades. Vamos fazer acontecer?";
  texto.append(descricao);
  const cabecalho=document.querySelector(".agenda-cabecalho");
  if(cabecalho){
   const conteudo=document.createElement("div");while(cabecalho.firstChild)conteudo.append(cabecalho.firstChild);
   cabecalho.append(introIcone("agenda"),conteudo);
  }
  if(tipo==="free"){
   const intro=document.createElement("div");intro.className="equipe-intro";
   intro.innerHTML='<div><h1>Vagas Free</h1><p>Encontre seu próximo evento e acompanhe suas confirmações.</p></div>';
   intro.prepend(introIcone("equipe"));document.querySelector("#telaApp .topo").after(intro);
  }
 }
 function introIcone(nome){const el=document.createElement("span");el.className="equipe-intro-icone";el.innerHTML=svg(nome);return el;}
 function marcar(botao,ativo){if(ativo){botao.setAttribute("aria-current","page");}else{botao.removeAttribute("aria-current");}}

 let navegacao;
 let atualizarBonus=()=>{};
 if(tipo==="montagem"){
  navegacao=document.getElementById("appNavegacao");
  navegacao.querySelectorAll("[data-acesso]").forEach(b=>{
   const anterior=b.querySelector("span");if(anterior)anterior.outerHTML=svg(b.dataset.acesso);
   marcar(b,b.classList.contains("ativo"));
  });
  new MutationObserver(()=>navegacao.querySelectorAll("[data-acesso]").forEach(b=>marcar(b,b.classList.contains("ativo"))))
   .observe(navegacao,{subtree:true,attributes:true,attributeFilter:["class"]});
 }else{
  navegacao=document.createElement("nav");navegacao.className="equipe-navegacao equipe-navegacao-"+tipo;
  navegacao.setAttribute("aria-label","Navegação principal");navegacao.hidden=true;
  const itens=tipo==="free"?[["vagas","inicio","Início"],["minhas","agenda","Minhas vagas"],["conta","conta","Conta"]]
   :[["inicio","inicio","Início"],["extrato","extrato","Extrato"],["premios","premios","Prêmios"],["conta","conta","Conta"]];
  itens.forEach(([id,icone,titulo])=>{
   const b=document.createElement("button");b.type="button";b.dataset.equipeAba=id;b.innerHTML=svg(icone);
   const label=document.createElement("span");label.textContent=titulo;b.append(label);
   if(id==="conta"){b.setAttribute("aria-haspopup","dialog");b.addEventListener("click",abrirConta);}
   else b.addEventListener("click",()=>{
    if(tipo==="free"){window.trocarAba(id);window.scrollTo({top:0,behavior:"instant"});}
    else{const destino=secaoBonus(id);destino.scrollIntoView({behavior:movimentoReduzido()?"instant":"smooth",block:"start"});}
   });
   navegacao.append(b);
  });
  corpo.append(navegacao);
  const tela=document.getElementById(tipo==="free"?"telaApp":"telaExtrato");
  const sincronizar=()=>{
   const visivel=tipo==="free"?tela.classList.contains("ativa"):!tela.classList.contains("oculto");
   navegacao.hidden=!visivel;
   if(!visivel&&conta.open)conta.close();
   if(tipo==="free"){
    const aba=document.getElementById("abaMinhas").classList.contains("ativa")?"minhas":"vagas";
    navegacao.querySelectorAll("button").forEach(b=>marcar(b,b.dataset.equipeAba===aba));
   }else if(visivel)requestAnimationFrame(atualizarBonus);
  };
  const observador=new MutationObserver(sincronizar);
  observador.observe(tela,{attributes:true,attributeFilter:["class"]});
  if(tipo==="free")observador.observe(document.getElementById("abaMinhas"),{attributes:true,attributeFilter:["class"]});
  // Aguarda a criação da folha de conta antes da primeira sincronização.
  queueMicrotask(sincronizar);
 }

 const conta=document.createElement("dialog");conta.className="equipe-conta";conta.setAttribute("aria-labelledby","equipeContaTitulo");
 conta.innerHTML='<button type="button" class="equipe-conta-fechar" aria-label="Fechar minha conta">'+svg("fechar")+'</button><div class="avatar" data-conta-avatar></div><h2 id="equipeContaTitulo"></h2><p data-conta-descricao></p><div class="equipe-conta-acoes"></div>';
 corpo.append(conta);conta.querySelector("button").addEventListener("click",()=>conta.close());
 if(tipo!=="montagem"){
  const anterior=document.getElementById(tipo==="free"?"appAvatar":"avatar");
  const botao=document.createElement("button");botao.type="button";botao.id=anterior.id;botao.className=anterior.className;
  botao.setAttribute("aria-label","Minha conta");botao.setAttribute("aria-haspopup","dialog");
  botao.replaceChildren(...anterior.childNodes);anterior.replaceWith(botao);botao.addEventListener("click",abrirConta);
 }
 conta.addEventListener("click",e=>{if(e.target===conta){const r=conta.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right)conta.close();}});
 function abrirConta(){
  const avatar=document.getElementById(tipo==="free"?"appAvatar":"avatar");
  conta.querySelector("[data-conta-avatar]").replaceChildren(...Array.from(avatar.childNodes,n=>n.cloneNode(true)));
  conta.querySelector("h2").textContent=document.getElementById(tipo==="free"?"appNome":"nome").textContent;
  conta.querySelector("[data-conta-descricao]").textContent=tipo==="free"?"Sua conta · Vagas Free":document.getElementById("cargo").textContent||"Sua conta · Meu Bônus";
  const acoes=conta.querySelector(".equipe-conta-acoes");acoes.replaceChildren();
  function acao(titulo,fn,classe="btn-claro"){
   const b=document.createElement("button");b.type="button";b.className="btn "+classe;b.textContent=titulo;
   b.addEventListener("click",()=>{conta.close();fn();});acoes.append(b);
  }
  if(tipo==="free"){
   if(document.getElementById("appNota").style.display!=="none")acao("Ver minha avaliação",()=>window.abrirNota());
   acao("Minha chave PIX",()=>window.pedirPix());
  }
  acao("Sair da conta",()=>tipo==="free"?window.perguntarSair():window.sair(),"btn-perigo");
  if(!conta.open)conta.showModal();
 }
 function movimentoReduzido(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches;}
 function secaoBonus(id){
  if(id==="inicio")return document.getElementById("telaExtrato");
  return document.getElementById(id==="extrato"?"extrato":"galeria").closest(".secao");
 }
 if(tipo==="bonus"){
  const sair=document.querySelector(".perfil .btn-sair");sair.setAttribute("aria-label","Sair da conta");sair.innerHTML=svg("sair");
  let agendado=false;
  function sincronizarRolagem(){
   agendado=false;
   if(document.getElementById("telaExtrato").classList.contains("oculto"))return;
   const limite=innerHeight*.4;
   const noFim=scrollY>0&&scrollY+innerHeight>=document.documentElement.scrollHeight-3;
   const aba=noFim||secaoBonus("premios").getBoundingClientRect().top<limite?"premios":secaoBonus("extrato").getBoundingClientRect().top<limite?"extrato":"inicio";
   navegacao.querySelectorAll("button").forEach(b=>marcar(b,b.dataset.equipeAba===aba));
  }
  atualizarBonus=sincronizarRolagem;
  window.addEventListener("scroll",()=>{if(!agendado){agendado=true;requestAnimationFrame(sincronizarRolagem);}},{passive:true});
  sincronizarRolagem();
 }

 // Usa a identidade pública do próprio Catálogo, sem alterar a autenticação de cada app.
 function carregarScript(src,pronto){
  if(pronto())return Promise.resolve();
  return new Promise((resolve,reject)=>{
   let el=Array.from(document.scripts).find(s=>s.src===src);
   const novo=!el;if(novo){el=document.createElement("script");el.src=src;}
   el.addEventListener("load",resolve,{once:true});el.addEventListener("error",reject,{once:true});
   if(novo)document.head.append(el);
  });
 }
 async function identidade(){
  try{
   // Montagem e Free inicializam o cliente durante a leitura da sessão.
   await new Promise(r=>setTimeout(r,300));
   if(!window.supabaseClient){
    await carregarScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js",()=>!!window.supabase);
    if(!window.supabase?.createClient)return;
    await carregarScript(new URL("js/core/supabase.js",raiz).href,()=>!!window.supabaseClient);
   }
   const cliente=window.supabaseClient;if(!cliente)return;
   const empresa=new URLSearchParams(location.search).get("empresa");
   await Promise.allSettled([
    cliente.rpc("catalogo_capas_publico",{}).then(({data})=>{
     const url=urlImagem(data?.portal||data?.catalogo);
     if(url)corpo.style.setProperty("--equipe-capa","url("+JSON.stringify(url)+")");
    }),
    cliente.rpc("catalogo_vitrine_login",empresa?{p_empresa_id:empresa}:{}).then(({data})=>{
     const url=urlImagem(data?.logo_url||data?.empresa?.logo_url);
     if(url)document.querySelectorAll(".equipe-logo").forEach(img=>{img.src=url;img.alt=data?.nome||data?.empresa?.nome||"Chiavari";});
    })
   ]);
  }catch(_){/* A capa é opcional; falhas de rede não impedem trabalhar. */}
 }
 function urlImagem(valor){try{const u=new URL(valor);return /^https?:$/.test(u.protocol)?u.href:"";}catch(_){return "";}}
 identidade();
})();
