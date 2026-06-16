import { parseCurrency, formatCurrency } from "./pedido.utils.mjs";

export function initItens({ supabase, els }){

function avisar(mensagem, titulo = "Atenção", tipo = "aviso"){
if(typeof window.alerta === "function"){
window.alerta(mensagem, titulo, tipo);
return;
}
alert(mensagem);
}

const {
  tbody,
  addItemBtn,
  addComponenteBtn,
  addEspacoBtn,
  addPersonalizacaoBtn,
  addServicoBtn,
  modalComponente,
} = els;

/* =====================================================
   ADICIONAR COMPONENTE
===================================================== */

/* =====================================================
   ADICIONAR COMPONENTE
===================================================== */
function adicionarComponente() {

  const valorUnitarioOficial = 0;
  const valorReposicaoOficial = 0;

  const tr = document.createElement("tr");
  tr.classList.add("item-row", "item-componente");

  tr.dataset.valorUnitario = valorUnitarioOficial;
  tr.dataset.valorReposicao = valorReposicaoOficial;
  tr.dataset.volume = 0;

  tr.innerHTML = `
<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-item" type="button">✕</button>
  </div>
</td>

<td class="qtd" contenteditable="true">1</td>

<td>
  <div class="foto-item"></div>
</td>

<td>
  <div class="item-autocomplete-wrapper">
    <div class="nome-item" contenteditable="true" data-placeholder="Preencha o nome do componente"></div>
    <div class="item-autocomplete-list"></div>
  </div>
</td>

<td class="valor valor-unitario">
  ${formatCurrency(valorUnitarioOficial)}
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
  ${formatCurrency(valorReposicaoOficial)}
</td>
  `;

  tbody.appendChild(tr);

  const qtd = tr.querySelector(".qtd");
  const desconto = tr.querySelector(".input-desconto");

  qtd.addEventListener("input", () => recalcularLinha(tr));
  desconto.addEventListener("input", () => recalcularLinha(tr));

  bindAutocompleteItem(tr, "Componente");
  bindRemover(tr);
  recalcularLinha(tr);
}

/* =====================================================
   BIND COMPONENTE (SPA SAFE)
===================================================== */

setTimeout(() => {

  const btn = document.getElementById("addComponenteBtn");
  const modal = document.getElementById("modalConfirmarComponente");

  if(!btn){
    console.warn("❌ Botão componente não encontrado");
    return;
  }

  btn.onclick = function(e){
    e.preventDefault();
    e.stopPropagation();

    if(modal){
      modal.classList.remove("hidden");
      modal.classList.add("ativo");
      return;
    }

    adicionarComponente();
  };

  window.fecharModalComponente = function () {
    if(modal){
      modal.classList.remove("ativo");
      modal.classList.add("hidden");
    }
  };

  window.confirmarAdicionarComponente = function () {
    if(modal){
      modal.classList.remove("ativo");
      modal.classList.add("hidden");
    }
    adicionarComponente();
  };

}, 300);
  /* =====================================================
     RESUMO + VOLUME
===================================================== */
function atualizarResumo() {

  /* =========================
     LOCAÇÃO
  ========================= */

  let locacaoBruta = 0;
  let customizacoes = 0;
  let servicos = 0;

  document.querySelectorAll("#listaItens tr.item-row").forEach(tr => {

    const totalEl = tr.querySelector(".valor-total");
    if(!totalEl) return;

    const valor = parseCurrency(totalEl.innerText);

    if(tr.classList.contains("item-personalizacao")){

      customizacoes += valor;

    } else if(tr.classList.contains("item-servico")){

      servicos += valor;

    } else {

      locacaoBruta += valor;

    }

  });

  const descontoLocacao = 0;
  const locacaoFinal = locacaoBruta - descontoLocacao;

  /* =========================
     FRETE
  ========================= */

  const freteBruto = Number(window.__FRETE_BRUTO || 0);
  const freteDesconto = Number(window.__FRETE_DESCONTO || 0);
  const freteFinal = Number(window.__FRETE_FINAL || 0);

  /* =========================
     MONTAGEM
  ========================= */

  const montagemBruta = Number(window.__MONTAGEM_BRUTA || 0);
  const montagemDesconto = Number(window.__MONTAGEM_DESCONTO || 0);
  const montagemFinal = Number(window.__MONTAGEM_FINAL || 0);

  /* =========================
     UI
  ========================= */

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = formatCurrency(value);
  };

  set("resumoLocacaoBruto", locacaoBruta);
  set("resumoLocacaoDesconto", -descontoLocacao);

  set("resumoCustomizacoes", customizacoes);

  set("resumoFreteBruto", freteFinal);
  set("resumoFreteDesconto", -freteDesconto);
  set("logisticaDescontoCaminhao", -freteDesconto);
  set("logisticaTotalOperacao", freteFinal + montagemFinal);

  set("resumoMontagemBruto", montagemFinal);
  set("resumoMontagemDesconto", -montagemDesconto);

  set("resumoServicos", servicos);

  /* =========================
     TOTAL
  ========================= */

  const total =
    locacaoFinal +
    customizacoes +
    freteFinal +
    montagemFinal +
    servicos;

const totalFinalPedido = total > 0 ? total : 0;

set("resumoTotalGeral", totalFinalPedido);

/* 🔥 SALVA GLOBAL */
window.__TOTAL_PEDIDO = totalFinalPedido;

/* 🔥 DISPARA PAGAMENTO */
window.atualizarPagamento?.();
}

function calcularVolumeTotalPedido(){

  let volumeTotal = 0;

  document.querySelectorAll("#listaItens tr.item-row").forEach(tr => {

    /* SERVIÇOS NÃO GERAM VOLUME */

    if(tr.classList.contains("item-servico")) return;

    const qtdEl = tr.querySelector(".qtd");
    const volumeUnit = parseFloat(tr.dataset.volume) || 0;
    const qtd = parseFloat(qtdEl?.innerText) || 0;

    volumeTotal += qtd * volumeUnit;

  });

  volumeTotal = parseFloat(volumeTotal.toFixed(2));

  const volumeEl = document.getElementById("freteVolumeTotal");

  if(volumeEl){
    volumeEl.innerText = volumeTotal + " m³";
  }

  /* =====================================================
     SALVA VOLUME GLOBAL
  ===================================================== */

  window.volumeTotalPedido = volumeTotal;

  /* =====================================================
     RECALCULA FRETE
  ===================================================== */

  if (window.kmPedido != null) {
    window.calcularFreteInteligente?.();
  }

  /* =====================================================
     RECALCULA SERVIÇOS
  ===================================================== */

  window.recalcularServicosPedido?.();

}

  function recalcularLinha(tr){
    const qtdEl = tr.querySelector(".qtd");
    const descontoEl = tr.querySelector(".input-desconto");
    const totalEl = tr.querySelector(".valor-total");

    if(!qtdEl || !totalEl) return;

    const quantidade = parseFloat(qtdEl.innerText) || 0;
    const valorUnit = parseFloat(tr.dataset.valorUnitario) || 0;
    const descontoPercent = descontoEl ? (parseFloat(descontoEl.value) || 0) : 0;

    const subtotal = quantidade * valorUnit;
    const valorDesconto = subtotal * (descontoPercent / 100);
    const totalFinal = subtotal - valorDesconto;

    totalEl.innerText = formatCurrency(totalFinal > 0 ? totalFinal : 0);

    atualizarResumo();
    calcularVolumeTotalPedido();
  }

  function bindRemover(tr) {
    const btn = tr.querySelector(".btn-remover-item");
    if (!btn) return;

    btn.addEventListener("click", function () {
      tr.remove();
      atualizarResumo();
      calcularVolumeTotalPedido();
    });
  }

  /* =====================================================
     AUTOCOMPLETE ITENS
  ===================================================== */
  function limparListaItens(listEl){
    if(!listEl) return;
    listEl.innerHTML = "";
    listEl.style.display = "none";
  }

  function formatarDescricao(texto){
    if(!texto) return "";

    const index = texto.indexOf("(L)");
    if(index === -1) return texto;

    const titulo = texto.substring(0, index).trim();
    const medidas = texto.substring(index).trim();

    return `
      <div class="item-nome-titulo">${titulo}</div>
      <div class="item-nome-medidas">${medidas}</div>
    `;
  }

  function renderizarListaItens(listEl, itens, onPick){
    if(!listEl) return;

    if(!itens || !itens.length){
      listEl.innerHTML = `
        <div class="item-autocomplete-empty">
          Nenhum item encontrado
        </div>
      `;
      listEl.style.display = "block";
      return;
    }

    listEl.innerHTML = "";

    itens.forEach(it => {
      const div = document.createElement("div");
      div.className = "item-autocomplete-item";
      div.innerHTML = `
        <div style="font-weight:600;">
          ${formatarDescricao(it.descricao_total || it.produto || "-")}
        </div>
        <div style="font-size:12px;color:#64748b;">
          ${it.codigo ? `Cód: ${it.codigo}` : ""}
        </div>
      `;

      div.addEventListener("click", () => onPick(it));
      listEl.appendChild(div);
    });

    listEl.style.display = "block";
  }

  function aplicarItemNaLinha(tr, it){
    if(!tr || !it) return;

    tr.dataset.itemId = it.id;
    tr.dataset.codigoItem = it.codigo || "";
    tr.dataset.valorUnitario = Number(it.valor_locacao || 0);
    tr.dataset.valorReposicao = Number(it.valor_reposicao || 0);
    tr.dataset.volume = Number(it.volume_cubico || 0);

    const nomeEl = tr.querySelector(".nome-item");
    if(nomeEl){
      nomeEl.innerHTML = formatarDescricao(
        it.descricao_total || it.produto || ""
      );
    }

    const unitEl = tr.querySelector(".valor-unitario");
    if(unitEl) unitEl.innerText = formatCurrency(tr.dataset.valorUnitario);

    const repEl = tr.querySelector(".valor-reposicao");
    if(repEl) repEl.innerText = formatCurrency(tr.dataset.valorReposicao);

    const fotoBox = tr.querySelector(".foto-item");
    if(fotoBox){
      if(it.foto_url){
        fotoBox.innerHTML = `<img src="${it.foto_url}" alt="">`;
      } else {
        fotoBox.innerHTML = "";
      }
    }

    recalcularLinha(tr);

    const listEl = tr.querySelector(".item-autocomplete-list");
    limparListaItens(listEl);
  }

  let timeoutBuscaItem;

  function bindAutocompleteItem(tr, tipoFiltro){
    const nomeEl = tr.querySelector(".nome-item");
    const listEl = tr.querySelector(".item-autocomplete-list");
    if(!nomeEl || !listEl) return;

    nomeEl.addEventListener("input", () => {
      const termo = (nomeEl.innerText || "").trim();

      clearTimeout(timeoutBuscaItem);

      if(termo.length < 2){
        limparListaItens(listEl);
        return;
      }

      timeoutBuscaItem = setTimeout(async () => {

        const empresaId = window.__CONTEXT?.empresa_id;
        if(!empresaId){
          console.warn("empresa_id não encontrado no contexto.");
          return;
        }

        const { data, error } = await supabase
          .from("itens")
          .select("id, codigo, produto, descricao_total, valor_locacao, valor_reposicao, volume_cubico, foto_url")
          .eq("empresa_id", empresaId)
          .eq("ativo", true)
          .eq("tipo", tipoFiltro)
          .or(`produto.ilike.%${termo}%,codigo.ilike.%${termo}%`)
          .limit(12);

        if(error){
          console.error("Erro ao buscar itens:", error);
          return;
        }

        renderizarListaItens(listEl, data, (it) => aplicarItemNaLinha(tr, it));

      }, 250);
    });

    document.addEventListener("click", (e) => {
      if(!e.target.closest(".item-autocomplete-wrapper")){
        limparListaItens(listEl);
      }
    });
  }

  /* =====================================================
     ADICIONAR ITEM
  ===================================================== */
  addItemBtn.addEventListener("click", function () {

    const valorUnitarioOficial = 0;
    const valorReposicaoOficial = 0;

    const tr = document.createElement("tr");
    tr.classList.add("item-row");

    tr.dataset.valorUnitario = valorUnitarioOficial;
    tr.dataset.valorReposicao = valorReposicaoOficial;
    tr.dataset.volume = 0;

    tr.innerHTML = `
<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-item" type="button">✕</button>
</td>

<td class="qtd" contenteditable="true">1</td>

<td>
  <div class="foto-item"></div>
</td>

<td>
  <div class="item-autocomplete-wrapper">
    <div class="nome-item" contenteditable="true" data-placeholder="Preencha o nome do item"></div>
    <div class="item-autocomplete-list"></div>
  </div>
</td>

<td class="valor valor-unitario">
  ${formatCurrency(valorUnitarioOficial)}
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
  ${formatCurrency(valorReposicaoOficial)}
</td>
    `;

    tbody.appendChild(tr);

    const qtd = tr.querySelector(".qtd");
    const desconto = tr.querySelector(".input-desconto");

    qtd.addEventListener("input", () => recalcularLinha(tr));
    desconto.addEventListener("input", () => recalcularLinha(tr));

    bindAutocompleteItem(tr, "Item");
    bindRemover(tr);
    recalcularLinha(tr);

  });

  window.__restaurarItensPedido = function restaurarItensPedido(itens = []) {
    tbody.innerHTML = "";

    itens.forEach((item) => {
      addItemBtn.click();
      const tr = Array.from(tbody.querySelectorAll("tr.item-row")).at(-1);
      if(!tr) return;

      aplicarItemNaLinha(tr, {
        id: item.item_id || item.id,
        codigo: item.codigo_item || item.codigo || "",
        produto: item.item_nome || item.produto || "Item",
        descricao_total: item.item_nome || item.descricao_total || item.produto || "Item",
        foto_url: item.foto_url || "",
        valor_locacao: Number(item.valor_locacao || 0),
        valor_reposicao: Number(item.valor_reposicao || 0),
        volume_cubico: Number(item.volume_cubico || 0)
      });

      const qtdEl = tr.querySelector(".qtd");
      if(qtdEl) qtdEl.innerText = String(Number(item.quantidade_solicitada || item.quantidade || 1));
      recalcularLinha(tr);
    });

    atualizarResumo();
    calcularVolumeTotalPedido();
  };
  /* =====================================================
     ADICIONAR ESPAÇO
  ===================================================== */
  function adicionarEspaco() {

    const tr = document.createElement("tr");
    tr.classList.add("linha-espaco");

    tr.innerHTML = `
<td class="acao-col">
  <div class="acoes-linha">
    <span class="drag-handle">≡</span>
    <button class="btn-remover-espaco" type="button">✕</button>
  </div>
</td>

<td colspan="7">
  <div class="espaco-wrapper">
    <div class="nome-espaco-input" contenteditable="true">
      NOVO ESPAÇO
    </div>
  </div>
</td>
    `;

    tbody.appendChild(tr);

    tr.querySelector(".btn-remover-espaco")
      ?.addEventListener("click", () => {
        tr.remove();
        atualizarResumo();
        calcularVolumeTotalPedido();
      });
  }

  if (addEspacoBtn) {
    addEspacoBtn.addEventListener("click", adicionarEspaco);
  }

  if(addPersonalizacaoBtn){
  addPersonalizacaoBtn.addEventListener("click", adicionarPersonalizacao);
}
/* =====================================================
   ADICIONAR PERSONALIZAÇÃO
===================================================== */

async function adicionarPersonalizacao(){

  const empresaId = window.__CONTEXT?.empresa_id;

  if(!empresaId){
    avisar("Empresa não encontrada.", "Erro", "erro");
    return;
  }

  const { data, error } = await supabase
    .from("personalizacoes")
    .select("id, tipo, vinculo_nome, preco_sugerido")
    .eq("empresa_id", empresaId)
    .eq("status","ATIVO")
    .order("tipo");

  if(error){
    console.error(error);
    return;
  }

  if(!data || !data.length){
    avisar("Nenhuma personalização cadastrada.");
    return;
  }

const options = data.map(p => {

  const nomeSemMedida = (p.vinculo_nome || "").split("(L)")[0].trim();

  return `
    <option value="${p.id}" data-preco="${p.preco_sugerido}">
      ${p.tipo} — ${nomeSemMedida}
    </option>
  `;

}).join("");

  const tr = document.createElement("tr");
  tr.classList.add("item-row","item-personalizacao");

  tr.dataset.valorUnitario = 0;
  tr.dataset.valorReposicao = 0;
  tr.dataset.volume = 0;

  function atualizarDescricao(){

  const tecido = tr.querySelector(".input-tecido")?.value || "";
  const cor = tr.querySelector(".input-cor")?.value || "";
  const obs = tr.querySelector(".input-obs")?.value || "";

  let texto = "";

  if(tecido) texto += `Tecido: ${tecido}`;

  if(cor) texto += (texto ? " • " : "") + `Cor: ${cor}`;

  if(obs) texto += (texto ? " • " : "") + obs;

const detalhe = tr.querySelector(".detalhe-personalizacao");

if(detalhe){
  detalhe.innerText = texto;
}

}

tbody.appendChild(tr);

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

      <select class="nome-item select-personalizacao" required>

        <option value="" selected disabled>
          Selecionar personalização
        </option>

        ${options}

      </select>

      <div class="detalhe-personalizacao"></div>

    </div>

  </div>

  <div class="campos-personalizacao hidden">

    <input type="text" class="input-tecido" placeholder="Tecido">

    <input type="text" class="input-cor" placeholder="Cor">

    <input type="text" class="input-obs" placeholder="Observação">

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

tr.addEventListener("input", function(e){

  if(
    e.target.classList.contains("input-tecido") ||
    e.target.classList.contains("input-cor") ||
    e.target.classList.contains("input-obs")
  ){
    atualizarDescricao();
  }

});
  tbody.appendChild(tr);
bindRemover(tr);
  tr.addEventListener("click", function(e){

  if(e.target.closest(".campos-personalizacao")) return;

  document.querySelectorAll(".campos-personalizacao")
    .forEach(el => el.classList.add("hidden"));

  const campos = tr.querySelector(".campos-personalizacao");

  campos.classList.remove("hidden");

});

  const select = tr.querySelector(".select-personalizacao");

select.addEventListener("change", function(){

  const option = this.selectedOptions[0];
  if(!option.value) return;

  const preco = Number(option.dataset.preco || 0);

  tr.dataset.valorUnitario = preco;

  tr.querySelector(".valor-unitario").innerText =
    formatCurrency(preco);

  const campos = tr.querySelector(".campos-personalizacao");
  const tecidoCampo = tr.querySelector(".campo-tecido");

  const texto = option.text.toLowerCase();

  campos.classList.remove("hidden");

  if(tecidoCampo){
    tecidoCampo.style.display = "none";

    if(texto.includes("forração")){
      tecidoCampo.style.display = "block";
    }
  }

  /* =========================
     RECALCULA LINHA
  ========================= */

  recalcularLinha(tr);

});

}

  /* =====================================================
     SORTABLE
  ===================================================== */
  if (window.Sortable && tbody) {
    new Sortable(tbody, {
      animation: 150,
      handle: ".drag-handle",
      ghostClass: "drag-ghost",
      chosenClass: "drag-chosen",
      onStart: function () {
        window.__pedidoOrdenacaoManual = true;
      },
      onEnd: function () {
        window.__pedidoOrdenacaoManual = true;
        atualizarResumo();
        calcularVolumeTotalPedido();
        window.__salvarOrdemPedido?.();
      }
    });
  }

/* =====================================================
   START
===================================================== */

window.atualizarResumoGlobal = atualizarResumo;

atualizarResumo();
calcularVolumeTotalPedido();
}document.addEventListener("click", function(e){

  if(!e.target.closest(".item-personalizacao")){

    document.querySelectorAll(".campos-personalizacao")
      .forEach(el => el.classList.add("hidden"));

  }

});
if(!window.__orcamentoToggleLoaded){

  document.addEventListener("click", function(e){

    const header = e.target.closest(".orcamento-header");
    if(!header) return;

    const container = header.parentElement;
    const content = container.querySelector('.orcamento');
    const btn = header.querySelector('.btn-minimizar');

    if(!content) return;

    content.classList.toggle('hidden');

    btn.textContent = content.classList.contains('hidden') ? '+' : '—';

  });

  window.__orcamentoToggleLoaded = true;
}
