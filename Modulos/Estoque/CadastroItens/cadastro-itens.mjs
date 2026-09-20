/* =====================================================
   CADASTRO DE ITENS – MÓDULO PRINCIPAL
   EasyLoc
===================================================== */

import { carregarItens } from "./itens.api.mjs";
import "./itens.modal.mjs";
import "./itens.tabela.mjs";
import "./itens.foto.mjs?v=20260919-imgotimizada";
import "./itens.filtros.mjs";
import "./itens.print.mjs";
import "./kits.modal.mjs?v=20260913a";

function abrirPaginaDetalhesItem(itemId = null, modo = "editar"){
  window.__ITEM_DETALHE_ID = itemId || null;
  window.__ITEM_DETALHE_MODO = modo;

  const suffix = itemId ? `?id=${encodeURIComponent(itemId)}` : "?novo=1";
  window.location.href = `item-detalhes.html${suffix}`;
}

window.itens_abrirNovoItem = function(){
  abrirPaginaDetalhesItem(null, "novo");
};

window.itens_abrirPaginaDetalhes = function(itemId){
  abrirPaginaDetalhesItem(itemId, "editar");
};

window.abrirDetalhesItem = function(item){
  if(item?.id) abrirPaginaDetalhesItem(item.id, "editar");
};

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

requestAnimationFrame(() => requestAnimationFrame(window.initCadastroItens));
