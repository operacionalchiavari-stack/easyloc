/* =====================================================
   CADASTRO DE ITENS – MÓDULO PRINCIPAL
   EasyLoc
===================================================== */

import { carregarItens } from "./itens.api.mjs";
import "./itens.modal.mjs";
import "./itens.tabela.mjs";
import "./itens.foto.mjs";
import "./itens.filtros.mjs";
import "./itens.print.mjs";
import "./kits.modal.mjs";

console.log("📦 cadastro-itens módulo carregado");

/* =====================================================
   ESPERA CONTEXTO EASYLOC (SPA SAFE)
===================================================== */

async function esperarContextoEasyLoc(){

  let tentativas = 0;

  while(
    (!window.supabaseClient ||
     !window.supabaseClient.auth) &&
    tentativas < 40
  ){
    await new Promise(r=>setTimeout(r,50));
    tentativas++;
  }

  if(!window.supabaseClient){
    throw new Error("Supabase não inicializado");
  }

}

/* =====================================================
   INIT
===================================================== */

window.initCadastroItens = async function(){

  if(window.__itensModuleLoaded){
    console.log("⚠️ Cadastro Itens já iniciado");
    return;
  }

  window.__itensModuleLoaded = true;

  console.log("📦 initCadastroItens iniciou");

  await esperarContextoEasyLoc();

  await carregarItens();

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      window.finalizarCarregamentoModulo?.();
    });
  });

};

/* =====================================================
   DESTROY SPA SAFE
===================================================== */

window.__activeModuleDestroy = function(){

  console.log("🧹 destroy Cadastro Itens");

  window.__itensModuleLoaded = false;

  document
    .querySelectorAll(".autocomplete-list")
    .forEach(el => el.remove());

};

/* =====================================================
   REGISTRO DO MÓDULO SPA
===================================================== */

window.__moduleInit = window.initCadastroItens;