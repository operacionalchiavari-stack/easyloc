import { formatCurrency } from "./pedido.utils.mjs";

export function initServicos({ supabase, els }){

/* =====================================================
   SPA GUARD (EVITA DUPLICAÇÃO NO EASYLOC)
===================================================== */

if(window.__servicosModuleLoaded){
  console.log("⚠️ módulo Serviços já carregado");
  return;
}

window.__servicosModuleLoaded = true;

const { tbody, addServicoBtn } = els;

if(!tbody){
  console.warn("⚠️ tbody não encontrado para serviços");
  return;
}

if(!addServicoBtn){
  console.warn("⚠️ Botão de serviço não encontrado no DOM ainda");
}

/* =====================================================
   ADICIONAR SERVIÇO
===================================================== */

async function adicionarServico(){

const empresaId = window.__CONTEXT?.empresa_id;

if(!empresaId){
alert("Empresa não encontrada.");
return;
}

const { data, error } = await supabase
.from("servicos_adicionais")
.select("id,nome,valor_fixo,valor_mao_obra,valor_km,valor_volume")
.eq("empresa_id", empresaId)
.eq("ativo", true)
.order("nome");

if(error){
console.error(error);
return;
}

if(!data || !data.length){
alert("Nenhum serviço cadastrado.");
return;
}

const options = data.map(serv => {

return `
<option 
  value="${serv.id}"
  data-fixo="${Number(serv.valor_fixo || 0)}"
  data-mao="${Number(serv.valor_mao_obra || 0)}"
  data-km="${Number(serv.valor_km || 0)}"
  data-m3="${Number(serv.valor_volume || 0)}"
>
${serv.nome}
</option>
`;

}).join("");

const tr = document.createElement("tr");
tr.classList.add("item-servico");

tr.classList.add("item-row","item-servico");

tr.dataset.valorUnitario = 0;
tr.dataset.valorReposicao = 0;
tr.dataset.volume = 0;

tr.innerHTML = `

<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-item" type="button">✕</button>
  </div>
</td>

<td class="qtd" contenteditable="true">1</td>

<td></td>

<td class="td-item">

<div class="item-container">

  <div class="item-autocomplete-wrapper">

    <div class="nome-item-card">

      <select class="nome-item select-servico">

        <option value="">
          Selecionar serviço
        </option>

        ${options}

      </select>

    </div>

  </div>

</div>

</td>

<td class="valor valor-unitario">
  R$ 0,00
</td>

<td class="valor">
  <input 
    type="number"
    class="input-desconto"
    value="0"
    min="0"
    max="100"
    step="1"
  >
</td>

<td class="valor valor-total">
  R$ 0,00
</td>

<td class="valor valor-reposicao">
  R$ 0,00
</td>

`;

tbody.appendChild(tr);

/* =====================================================
   EVENTOS
===================================================== */

const qtd = tr.querySelector(".qtd");
const desconto = tr.querySelector(".input-desconto");
const select = tr.querySelector(".select-servico");

qtd.addEventListener("input", () => recalcularLinha(tr));
desconto.addEventListener("input", () => recalcularLinha(tr));

/* =====================================================
   REMOVER
===================================================== */

tr.querySelector(".btn-remover-item").addEventListener("click", () => {

tr.remove();
window.atualizarResumoGlobal?.();

});

/* =====================================================
   SELEÇÃO SERVIÇO
===================================================== */

select.addEventListener("change", function(){

const option = this.selectedOptions[0];

if(!option.value) return;

const precoFixo = Number(option.dataset.fixo || 0);
const precoMao = Number(option.dataset.mao || 0);
const precoKm = Number(option.dataset.km || 0);
const precoM3 = Number(option.dataset.m3 || 0);

tr.dataset.precoFixo = precoFixo;
tr.dataset.precoMao = precoMao;
tr.dataset.precoKm = precoKm;
tr.dataset.precoM3 = precoM3;

tr.querySelector(".valor-unitario").innerText =
formatCurrency(precoFixo);

/* =========================
   RECALCULA
========================= */

recalcularLinha(tr);

});

}

/* =====================================================
   RECALCULAR
===================================================== */

function recalcularLinha(tr){

const qtdEl = tr.querySelector(".qtd");
const descontoEl = tr.querySelector(".input-desconto");
const totalEl = tr.querySelector(".valor-total");

const qtd = parseFloat(qtdEl.innerText) || 0;
const desc = parseFloat(descontoEl.value) || 0;

const precoFixo = Number(tr.dataset.precoFixo || 0);
const precoMao = Number(tr.dataset.precoMao || 0);
const precoKm = Number(tr.dataset.precoKm || 0);
const precoM3 = Number(tr.dataset.precoM3 || 0);

const km = Number(window.kmPedido || 0);
const volume = Number(window.volumeTotalPedido || 0);
const montadores = Number(window.__QTD_MONTADORES || 1);

let subtotal = 0;

/* =========================
   FIXO
========================= */

subtotal += precoFixo;

/* =========================
   MÃO DE OBRA
========================= */

if(precoMao > 0){
subtotal += precoMao * montadores;
}

/* =========================
   KM
========================= */

if(precoKm > 0){
subtotal += precoKm * km;
}

/* =========================
   M³
========================= */

if(precoM3 > 0){
subtotal += precoM3 * volume;
}

const valorUnitarioCalculado = subtotal;

subtotal = subtotal * qtd;

const descontoValor = subtotal * (desc / 100);
const total = subtotal - descontoValor;

/* =========================
   ATUALIZA UNITÁRIO
========================= */

const unitarioEl = tr.querySelector(".valor-unitario");

if(unitarioEl){
unitarioEl.innerText = formatCurrency(valorUnitarioCalculado);
}

/* =========================
   ATUALIZA TOTAL
========================= */

totalEl.innerText = formatCurrency(total > 0 ? total : 0);

window.atualizarResumoGlobal?.();

}

/* =====================================================
   BOTÃO ADICIONAR
===================================================== */

if(addServicoBtn){
  addServicoBtn.onclick = adicionarServico;
}

/* =====================================================
   RECALCULAR SERVIÇOS GLOBAL
===================================================== */

window.recalcularServicosPedido = function(){

document
.querySelectorAll("#listaItens tr.item-servico")
.forEach(tr => recalcularLinha(tr));

};
}