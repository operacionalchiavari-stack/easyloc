/* =====================================================
   CADASTRO DE ITENS – MÓDULO PRINCIPAL
   EasyLoc
===================================================== */

import { carregarItens } from "./itens.api.mjs?v=20260920-paginacao";
import "./itens.modal.mjs";
import "./itens.tabela.mjs?v=20261023-lista-dispon";
import "./itens.foto.mjs?v=20261008-banco";
// itens.3d.mjs antes só era carregado em item-detalhes.html (Item/Componente).
// Kit precisa do mesmo upload direto de GLB (ver kits.modal.mjs) — o módulo é
// genérico por atributo/id de DOM, não amarrado a nenhuma tela específica.
import "./itens.3d.mjs?v=20261005-otimizar";
import "./itens.filtros.mjs";
import "./itens.print.mjs?v=20261026-acentos";
import "./kits.modal.mjs?v=20261020-kit-sem-duplicar";

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

/* =====================================================
   RESUMO (Total / Itens / Componentes / Kits) num ícone:
   clicar abre/fecha; Esc ou clique fora fecha.
===================================================== */
(function ligarResumoItens(){
  const btn = document.getElementById("itensResumoBtn");
  const pop = document.getElementById("itensResumoPop");
  if(!btn || !pop) return;
  const abrir = (sim) => { pop.hidden = !sim; btn.setAttribute("aria-expanded", String(sim)); };
  btn.addEventListener("click", (ev) => { ev.stopPropagation(); abrir(pop.hidden); });
  document.addEventListener("click", (ev) => { if(!pop.hidden && !ev.target.closest(".itens-resumo")) abrir(false); });
  document.addEventListener("keydown", (ev) => { if(ev.key === "Escape" && !pop.hidden){ abrir(false); btn.focus(); } });
})();
