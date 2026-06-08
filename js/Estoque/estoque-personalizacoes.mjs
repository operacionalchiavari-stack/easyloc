/* =====================================================
   ESTOQUE → PERSONALIZAÇÕES (VISUAL + CÁLCULO)
   arquivo: estoque-personalizacoes.mjs
===================================================== */

let personalizacoes = [];

function avisar(mensagem, titulo = "Atenção", tipo = "aviso"){
  if(typeof window.alerta === "function"){
    window.alerta(mensagem, titulo, tipo);
    return;
  }
  alert(mensagem);
}

window.__moduleInit = function(){

  "use strict";

  if(window.__personalizacoesLoaded) return;
  window.__personalizacoesLoaded = true;

  console.log("📦 módulo Personalizações iniciado");

  initEstoquePersonalizacoes();

};

/* =====================================================
   INIT REAL DO MÓDULO
===================================================== */

async function initEstoquePersonalizacoes(){

  try{

    // ✅ espera o HTML realmente existir dentro do main
    const root = await waitForRoot(".personalizacoes-page[data-module-root]", 40);

    if(!root){
      console.error("❌ Personalizações: root do módulo NÃO apareceu no DOM.");
      safeFinishLoader();
      return;
    }

    const els = getEls(root);

    // ✅ valida elementos obrigatórios (se faltar, mostra quais)
const missing = getMissingEls(els, [
  "tbody",
  "btnAddPersonalizacao",
  // removido: btnCloseModal
  "btnCancelar",
  "btnSalvar",
  "btnRecalcular",
  "searchInput",
  "filtroTipo",
  "filtroAlvo",
  "filtroStatus",
  "modalOverlay",
  "modalTitle",
  "radioAlvo",
  "lblVinculo",
  "inpTipo",
  "inpVinculoNome",
  "listaVinculos",
  "inpObs",

  // insumos
  "insumosContainer",
  "btnAddInsumo",

  // mão de obra
  "inpTempo",
  "inpCustoHora",
  "inpComplexidade",
  "inpMargem",
  "chkManual",
  "manualWrap",
  "inpPrecoManual",

  // outputs
  "outCustoMateriais",
  "outCustoMaoObra",
  "outCustoFixo",
  "outCustoTotal",
  "outPrecoSugerido",
  "outMargemReal"
]);

    if(missing.length){
      console.error("❌ Personalizações: elementos NÃO encontrados:", missing);
      console.log("🔎 Dica: isso acontece quando o HTML não entrou no #main-content ou entrou vazio.");
      safeFinishLoader();
      return;
    }

    // ---------------------------------------------
    // MOCK (por enquanto) – depois pluga Supabase
    // ---------------------------------------------

// ---------------------------------------------
// DADOS REAIS DO BANCO
// ---------------------------------------------

let itens = [];
let componentes = [];
let insumos = [];

await carregarItensEComponentes();
await carregarInsumos();
atualizarListaInsumos();

async function carregarItensEComponentes(){

  const { data, error } = await window.supabaseClient
    .from("itens")
    .select("id, descricao_total, tipo")
    .eq("empresa_id", window.__CONTEXT.empresa_id)
    .order("descricao_total");

  if(error){
    console.error("❌ erro ao carregar itens:", error);
    return;
  }

  itens = (data || [])
    .filter(i => i.tipo === "Item")
    .map(i => ({
      id: i.id,
      nome: i.descricao_total
    }));

  componentes = (data || [])
    .filter(i => i.tipo === "Componente")
    .map(i => ({
      id: i.id,
      nome: i.descricao_total
    }));

}

async function carregarInsumos(){

  const { data, error } = await window.supabaseClient
    .from("insumos")
    .select("id, nome")
    .eq("empresa_id", window.__CONTEXT.empresa_id)
    .order("nome");

  if(error){
    console.error("❌ erro ao carregar insumos:", error);
    return;
  }

  insumos = (data || []).map(i => ({
    id: i.id,
    nome: i.nome,
    unidade: "",
    custo_unitario: 0
  }));

}
function atualizarListaInsumos(){

  let lista = document.getElementById("listaInsumos");

  if(!lista){
    lista = document.createElement("datalist");
    lista.id = "listaInsumos";
    document.body.appendChild(lista);
  }

  lista.innerHTML = "";

  insumos.forEach(i=>{
    const opt = document.createElement("option");
    opt.value = i.nome;
    opt.dataset.id = i.id;
    lista.appendChild(opt);
  });

}

    // ---------------------------------------------
    // STATE MODAL
    // ---------------------------------------------
    const modalState = {
      mode: "create",
      editingId: null,
      alvo: "ITEM",
      vinculos: itens
    };

    // ---------------------------------------------
    // INIT
    // ---------------------------------------------
bindEvents();

await carregarPersonalizacoesBanco();

renderTable();

safeFinishLoader();

    // =============================================
    // EVENTS
    // =============================================
    function bindEvents(){

      // topo/modal
      els.btnAddPersonalizacao.addEventListener("click", ()=> openModalCreate());
if (els.btnCloseModal) {
  els.btnCloseModal.addEventListener("click", closeModal);
}
      els.btnCancelar.addEventListener("click", closeModal);

      els.modalOverlay.addEventListener("click", (e)=>{
        if(e.target === els.modalOverlay) closeModal();
      });

      els.btnSalvar.addEventListener("click", salvarPersonalizacao);

      els.btnRecalcular.addEventListener("click", ()=>{
        recalcularResumo();
      });

      // filtros
      els.searchInput.addEventListener("input", renderTable);
      els.filtroTipo.addEventListener("change", renderTable);
      els.filtroAlvo.addEventListener("change", renderTable);
      els.filtroStatus.addEventListener("change", renderTable);

      // radio alvo no modal
      els.radioAlvo.addEventListener("change", ()=>{
        const checked = root.querySelector('input[name="alvo"]:checked');
        modalState.alvo = checked?.value || "ITEM";
        atualizarVinculosModal();
        recalcularResumo();
      });

      // tipo muda (pode ajustar defaults depois se quiser)
      els.inpTipo.addEventListener("change", ()=>{
        recalcularResumo();
      });

      // toggle manual
      els.chkManual.addEventListener("change", ()=>{
        els.manualWrap.style.display = els.chkManual.checked ? "block" : "none";
        recalcularResumo();
      });

      // mão de obra/margem/complexidade
      const inputsCalc = [
        els.inpTempo,
        els.inpCustoHora,
        els.inpMargem,
        els.inpComplexidade,
        els.inpPrecoManual
      ];

      inputsCalc.forEach(el=>{
        el.addEventListener("input", recalcularResumo);
        el.addEventListener("change", recalcularResumo);
      });

      // ✅ NOVO: adicionar insumo
      els.btnAddInsumo.addEventListener("click", ()=>{
        adicionarLinhaInsumo();
        recalcularResumo();
      });

      // ✅ NOVO: delegação para eventos dentro do container (remove, change, input)
      els.insumosContainer.addEventListener("click", (e)=>{
        const btn = e.target.closest("[data-action]");
        if(!btn) return;

        const action = btn.getAttribute("data-action");
        if(action === "remove-insumo"){
          const row = btn.closest(".insumo-row");
          row?.remove();
          recalcularResumo();
        }
      });

      els.insumosContainer.addEventListener("change", (e)=>{
        const row = e.target.closest(".insumo-row");
        if(!row) return;

if(e.target.matches("input[data-role='insumo-input']")){
          atualizarLinhaInsumo(row);
          recalcularResumo();
        }
      });

      els.insumosContainer.addEventListener("input", (e)=>{
        const row = e.target.closest(".insumo-row");
        if(!row) return;

        if(e.target.matches("input[data-role='insumo-qtd']")){
          atualizarLinhaInsumo(row);
          recalcularResumo();
        }
      });
// toggle status no header do modal
root.querySelectorAll(".status-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    root.querySelectorAll(".status-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });
});
    }
// =============================================
// RENDER TABLE
// =============================================
function renderTable(){

  const q = (els.searchInput.value || "").trim().toLowerCase();
  const ftipo = els.filtroTipo.value;
  const falvo = els.filtroAlvo.value;
  const fstatus = els.filtroStatus.value;

  let rows = [...personalizacoes];

  // recalcula custo/preço mock a cada render (pra tabela refletir)
  rows.forEach(p=>{
    const custoMat = calcCustoMateriaisFromObj(p.insumos_usados || []);
    const custoMO  = calcCustoMaoObraFromObj(p);
    const custoFixo = 0;
    const custoTotal = custoMat + custoMO + custoFixo;

    const margem = toNum(p.margem || 0);
    const comp = toNum(p.complexidade || 1) || 1;

    const precoBase = custoTotal * (1 + (margem/100));
    const precoFinal = precoBase * comp;

    p.custo_total = custoTotal;
    p.preco_sugerido = precoFinal;
  });

  if(ftipo) rows = rows.filter(r => r.tipo === ftipo);
  if(falvo) rows = rows.filter(r => r.alvo === falvo);
  if(fstatus) rows = rows.filter(r => r.status === fstatus);

  if(q){
    rows = rows.filter(r=>{
      const matLabel = getComplexidadeLabel(r.complexidade);
      return (
        (r.tipo || "").toLowerCase().includes(q) ||
        (r.vinculo_nome || "").toLowerCase().includes(q) ||
        (matLabel || "").toLowerCase().includes(q)
      );
    });
  }

  els.tbody.innerHTML = "";

  if(rows.length === 0){
    els.tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding:26px 16px;color:#6b7b8b;">
          Nenhuma personalização encontrada.
        </td>
      </tr>
    `;
    return;
  }

  rows.forEach(r=>{

    const statusBadge = r.status === "ATIVO"
      ? `<span class="badge green">Ativo</span>`
      : `<span class="badge red">Inativo</span>`;

    const tipoBadge = `
      <span class="badge tipo">
        ${escapeHtml(r.tipo || "-")}
      </span>
    `;

    const complexidadeLabel = getComplexidadeLabel(r.complexidade);

    let complexClass = "complexidade-simples";

    if(complexidadeLabel.toLowerCase() === "média"){
      complexClass = "complexidade-media";
    }

    if(complexidadeLabel.toLowerCase() === "alta"){
      complexClass = "complexidade-alta";
    }

    const complexBadge = `
      <span class="badge ${complexClass}">
        ${complexidadeLabel}
      </span>
    `;

    const custo = formatCurrency(r.custo_total || 0);
    const preco = formatCurrency(r.preco_sugerido || 0);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${tipoBadge}
      </td>

      <td>
        <strong>${escapeHtml(r.vinculo_nome || "-")}</strong>
        <span class="mini-muted">${r.alvo === "ITEM" ? "Item" : "Componente"}</span>
      </td>

      <td>
        ${complexBadge}
      </td>

      <td>
        ${custo}
      </td>

      <td>
        ${preco}
      </td>

      <td>
        ${statusBadge}
      </td>
    `;

    tr.style.cursor = "pointer";

    tr.addEventListener("click", () => {
      openModalEdit(r.id);
    });

    els.tbody.appendChild(tr);

  });

}

function toggleStatus(id){
  const idx = personalizacoes.findIndex(p=>p.id===id);
  if(idx<0) return;
  personalizacoes[idx].status = personalizacoes[idx].status === "ATIVO" ? "INATIVO" : "ATIVO";
  renderTable();
}

    // =============================================
    // MODAL OPEN/CLOSE
    // =============================================
async function openModalCreate(){

  await carregarItensEComponentes();
  await carregarInsumos();

  modalState.mode = "create";
  modalState.editingId = null;

      els.modalTitle.textContent = "Adicionar Personalização";
      resetModalFields();

      modalState.alvo = "ITEM";
      const radioItem = root.querySelector('input[name="alvo"][value="ITEM"]');
      if(radioItem) radioItem.checked = true;

      atualizarVinculosModal();

      // começa com 1 linha de insumo por padrão
      adicionarLinhaInsumo();

      recalcularResumo();

      els.modalOverlay.classList.remove("hidden");
    }

async function openModalEdit(id){

  await carregarItensEComponentes();
  await carregarInsumos();
      const p = personalizacoes.find(x=>x.id===id);
      if(!p) return;

      modalState.mode = "edit";
      modalState.editingId = id;

      els.modalTitle.textContent = "Editar Personalização";
      resetModalFields();

      modalState.alvo = p.alvo || "ITEM";
      const radio = root.querySelector(`input[name="alvo"][value="${modalState.alvo}"]`);
      if(radio) radio.checked = true;

      atualizarVinculosModal();

      els.inpTipo.value = p.tipo || "";
      els.inpVinculoNome.value = p.vinculo_nome || "";
      els.inpObs.value = p.obs || "";

      // carrega insumos usados
      els.insumosContainer.innerHTML = "";
      const usados = Array.isArray(p.insumos_usados) ? p.insumos_usados : [];
      if(usados.length === 0){
        adicionarLinhaInsumo();
      }else{
        usados.forEach(u=>{
          adicionarLinhaInsumo(u.insumo_id, u.qtd);
        });
      }

      // carrega mão de obra / margem / complexidade se existirem
      if(p.tempo != null) els.inpTempo.value = String(p.tempo);
      if(p.custo_hora != null) els.inpCustoHora.value = String(p.custo_hora);
      if(p.complexidade != null) els.inpComplexidade.value = String(p.complexidade);
      if(p.margem != null) els.inpMargem.value = String(p.margem);

      // preço manual
      els.chkManual.checked = !!p.preco_manual_ativo;
      els.manualWrap.style.display = els.chkManual.checked ? "block" : "none";
      if(p.preco_manual != null) els.inpPrecoManual.value = String(p.preco_manual);

      recalcularResumo();

      els.modalOverlay.classList.remove("hidden");
    }

    function closeModal(){
      els.modalOverlay.classList.add("hidden");
    }

function resetModalFields(){
  els.inpTipo.value = "";
  els.inpVinculoNome.value = "";
  els.inpObs.value = "";

  // limpa insumos
  els.insumosContainer.innerHTML = "";

  // mão de obra
  els.inpTempo.value = "";
  els.inpCustoHora.value = "";
  els.inpComplexidade.value = "1";
  els.inpMargem.value = "";

  // manual
  els.chkManual.checked = false;
  els.manualWrap.style.display = "none";
  els.inpPrecoManual.value = "";

  setOut(0,0,0,0,0,0);
}

    function atualizarVinculosModal(){
      const alvo = modalState.alvo;

      if(alvo === "ITEM"){
        els.lblVinculo.textContent = "Selecionar item";
        modalState.vinculos = itens;
        els.inpVinculoNome.placeholder = "Digite para buscar item...";
      }else{
        els.lblVinculo.textContent = "Selecionar componente";
        modalState.vinculos = componentes;
        els.inpVinculoNome.placeholder = "Digite para buscar componente...";
      }

      els.listaVinculos.innerHTML = "";
      modalState.vinculos.forEach(v=>{
        const opt = document.createElement("option");
        opt.value = `${v.nome}`;
        opt.setAttribute("data-id", v.id);
        els.listaVinculos.appendChild(opt);
      });
    }

    // =============================================
    // INSUMOS (UI)
    // =============================================
    function adicionarLinhaInsumo(insumoIdPreselect = "", qtdPreselect = ""){

      const row = document.createElement("div");
      row.className = "insumo-row";

const selectHtml = `
  <input 
    type="text"
    data-role="insumo-input"
    list="listaInsumos"
    placeholder="Digite para buscar insumo..."
    autocomplete="off"
  />
`;

row.innerHTML = `
  ${selectHtml}
  <input type="number" data-role="insumo-qtd" step="0.01" min="0" placeholder="Qtd" />
  <div class="insumo-total" data-role="insumo-total">R$ 0,00</div>
  <button type="button" class="insumo-remove" data-action="remove-insumo" title="Remover">✕</button>
`;

      els.insumosContainer.appendChild(row);

const sel = row.querySelector("input[data-role='insumo-input']");
      const qtd = row.querySelector("input[data-role='insumo-qtd']");

if(insumoIdPreselect){

  const ins = insumos.find(i => i.id === insumoIdPreselect);

  if(ins){
    sel.value = ins.nome;
  }

}
      if(qtdPreselect !== "" && qtdPreselect != null){
        qtd.value = String(qtdPreselect);
      }

      atualizarLinhaInsumo(row);
    }

    function atualizarLinhaInsumo(row){
const sel = row.querySelector("input[data-role='insumo-input']");
      const qtdEl = row.querySelector("input[data-role='insumo-qtd']");
      const out = row.querySelector("[data-role='insumo-total']");

const nome = sel?.value || "";
const qtd = toNum(qtdEl?.value);

const ins = insumos.find(i => i.nome === nome);
      if(!ins || qtd <= 0){
        if(out) out.textContent = formatCurrency(0);
        return;
      }

      const total = qtd * toNum(ins.custo_unitario);
      if(out) out.textContent = formatCurrency(total);
    }

function coletarInsumosDoModal(){

  const rows = Array.from(els.insumosContainer.querySelectorAll(".insumo-row"));
  const usados = [];

  rows.forEach(row=>{

    const sel = row.querySelector("input[data-role='insumo-input']");
    const qtdEl = row.querySelector("input[data-role='insumo-qtd']");

    const nome = sel?.value || "";
    const qtd = toNum(qtdEl?.value);

    const ins = insumos.find(i => i.nome === nome);
    const insumo_id = ins?.id || "";

    if(insumo_id && qtd > 0){
      usados.push({ insumo_id, qtd });
    }

  });

  return usados;
}

function getComplexidadeLabel(valor){

  const v = Number(valor || 1);

  if(v === 1) return "Simples";
  if(v === 1.15) return "Média";
  if(v === 1.30) return "Alta";

  return "Simples";
}

    // =============================================
    // CALC
    // =============================================
    function recalcularResumo(){

      const custoMat = calcCustoMateriaisFromUI();
      const custoMO = calcCustoMaoObra();
      const custoFixo = 0; // você removeu o campo — por enquanto fica 0
      const custoTotal = custoMat + custoMO + custoFixo;

      if(els.chkManual.checked){
        const precoManual = toNum(els.inpPrecoManual.value);

        const margemReal = precoManual > 0
          ? ((precoManual - custoTotal) / precoManual) * 100
          : 0;

        setOut(custoMat, custoMO, custoFixo, custoTotal, precoManual, margemReal);
        return;
      }

      const margem = toNum(els.inpMargem.value);
      const comp = toNum(els.inpComplexidade.value) || 1;

      const precoBase = custoTotal * (1 + (margem/100));
      const precoFinal = precoBase * comp;

      const margemReal = precoFinal > 0
        ? ((precoFinal - custoTotal) / precoFinal) * 100
        : 0;

      setOut(custoMat, custoMO, custoFixo, custoTotal, precoFinal, margemReal);
    }

function calcCustoMateriaisFromUI(){

  const rows = Array.from(els.insumosContainer.querySelectorAll(".insumo-row"));
  let total = 0;

  rows.forEach(row=>{

    const sel = row.querySelector("input[data-role='insumo-input']");
    const qtdEl = row.querySelector("input[data-role='insumo-qtd']");

    const nome = sel?.value || "";
    const qtd = toNum(qtdEl?.value);

    const ins = insumos.find(i => i.nome === nome);

    if(ins && qtd > 0){
      total += qtd * toNum(ins.custo_unitario);
    }

  });

  return total;
}

    function calcCustoMateriaisFromObj(usados){
      if(!Array.isArray(usados)) return 0;
      let total = 0;

      usados.forEach(u=>{
        const ins = insumos.find(i => i.id === u.insumo_id);
        const qtd = toNum(u.qtd);
        if(ins && qtd > 0){
          total += qtd * toNum(ins.custo_unitario);
        }
      });

      return total;
    }

    function calcCustoMaoObra(){
      const tempo = toNum(els.inpTempo.value);
      const custoHora = toNum(els.inpCustoHora.value);
      return tempo * custoHora;
    }

    function calcCustoMaoObraFromObj(p){
      const tempo = toNum(p.tempo);
      const custoHora = toNum(p.custo_hora);
      return tempo * custoHora;
    }

    function setOut(custoMat, custoMO, custoFixo, custoTotal, preco, margemReal){
      els.outCustoMateriais.textContent = formatCurrency(custoMat);
      els.outCustoMaoObra.textContent = formatCurrency(custoMO);
      els.outCustoFixo.textContent = formatCurrency(custoFixo);
      els.outCustoTotal.textContent = formatCurrency(custoTotal);
      els.outPrecoSugerido.textContent = formatCurrency(preco);
      els.outMargemReal.textContent = `Margem real: ${Math.max(0, margemReal).toFixed(1)}%`;
    }

    // =============================================
    // SAVE (mock)
    // =============================================
async function salvarPersonalizacao(){

  const tipo = els.inpTipo.value;
  const alvo = modalState.alvo;
  const vinculoNome = (els.inpVinculoNome.value || "").trim();

  const statusBtn = root.querySelector(".status-btn.active");
  const status = statusBtn ? statusBtn.dataset.status : "ATIVO";

  const insumosUsados = coletarInsumosDoModal();

  if(!tipo){
    avisar("Selecione o tipo de personalização.");
    return;
  }

  if(!vinculoNome){
    avisar("Selecione um item ou componente para vincular.");
    return;
  }

  if(insumosUsados.length === 0){
    avisar("Adicione pelo menos 1 insumo.");
    return;
  }

  const ref = modalState.vinculos.find(v =>
    (v.nome || "").toLowerCase() === vinculoNome.toLowerCase()
  );

  if(!ref){
    avisar("Selecione um item válido da lista.");
    return;
  }

  const custoTotal = parseCurrency(els.outCustoTotal.textContent);
  const precoFinal = parseCurrency(els.outPrecoSugerido.textContent);

  const payload = {
    empresa_id: window.__CONTEXT.empresa_id,
    tipo,
    alvo,
    vinculo_id: ref.id,
    vinculo_nome: ref.nome,
    observacoes: (els.inpObs.value || "").trim(),

    tempo: toNum(els.inpTempo.value),
    custo_hora: toNum(els.inpCustoHora.value),
    complexidade: toNum(els.inpComplexidade.value) || 1,
    margem: toNum(els.inpMargem.value),

    preco_manual_ativo: !!els.chkManual.checked,
    preco_manual: toNum(els.inpPrecoManual.value),

    custo_total: custoTotal,
    preco_sugerido: precoFinal,

    status
  };

  try{

    /* =====================================
       INSERT PERSONALIZAÇÃO
    ===================================== */

let data = null;
let error = null;

if(modalState.mode === "edit"){

  const res = await window.supabaseClient
    .from("personalizacoes")
    .update(payload)
    .eq("id", modalState.editingId)
    .select()
    .single();

  data = res.data;
  error = res.error;

}else{

  const res = await window.supabaseClient
    .from("personalizacoes")
    .insert(payload)
    .select()
    .single();

  data = res.data;
  error = res.error;

}

if(error) throw error;

    if(error) throw error;
    

const personalizacaoId = data.id;

/* =====================================
   LIMPA INSUMOS ANTIGOS SE FOR EDIÇÃO
===================================== */

if(modalState.mode === "edit"){

  const { error: delErr } = await window.supabaseClient
    .from("personalizacoes_insumos")
    .delete()
    .eq("personalizacao_id", personalizacaoId);

  if(delErr) throw delErr;

}

/* =====================================
   INSERT INSUMOS
===================================== */

const rows = insumosUsados.map(i => ({
  empresa_id: window.__CONTEXT.empresa_id,
  personalizacao_id: personalizacaoId,
  insumo_id: i.insumo_id,
  quantidade: i.qtd
}));

const { error: insErr } = await window.supabaseClient
  .from("personalizacoes_insumos")
  .insert(rows);

if(insErr) throw insErr;

    closeModal();

    await carregarPersonalizacoesBanco();

    renderTable();

  }catch(err){
    console.error("Erro ao salvar personalização:", err);
    avisar("Erro ao salvar personalização.", "Erro", "erro");
  }

}

    // =============================================
    // HELPERS
    // =============================================
    function toNum(v){
      const n = Number(String(v || "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }

    function formatCurrency(v){
      const n = Number(v || 0);
      return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
    }

    function parseCurrency(str){
      const s = String(str || "").replace(/[R$\s.]/g, "").replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }

    function escapeHtml(s){
      return String(s || "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

  }catch(e){
    console.error("❌ Personalizações: erro no init:", e);
    safeFinishLoader();
  }

}
/* =====================================================
   CARREGAR PERSONALIZAÇÕES DO BANCO
===================================================== */

async function carregarPersonalizacoesBanco(){

  const { data, error } = await window.supabaseClient
    .from("personalizacoes")
    .select(`
      *,
      personalizacoes_insumos (
        insumo_id,
        quantidade
      )
    `)
    .eq("empresa_id", window.__CONTEXT.empresa_id)
    .order("created_at", { ascending:false });

  if(error){
    console.error("erro ao carregar personalizações:", error);
    return;
  }

  personalizacoes = (data || []).map(p => ({
    ...p,
    insumos_usados: (p.personalizacoes_insumos || []).map(i => ({
      insumo_id: i.insumo_id,
      qtd: i.quantidade
    }))
  }));

}
/* =====================================================
   GET ELS (scoped no root do módulo)
===================================================== */

function getEls(root){
  return {
    tbody: root.querySelector("#tbodyPersonalizacoes"),
    btnAddPersonalizacao: root.querySelector("#btnAddPersonalizacao"),
    btnCloseModal: root.querySelector("#btnCloseModal"),
    btnCancelar: root.querySelector("#btnCancelar"),
    btnSalvar: root.querySelector("#btnSalvar"),
    btnRecalcular: root.querySelector("#btnRecalcular"),
    btnPrint: root.querySelector("#btnPrint"),
    btnHelp: root.querySelector("#btnHelp"),

    searchInput: root.querySelector("#searchInput"),
    filtroTipo: root.querySelector("#filtroTipo"),
    filtroAlvo: root.querySelector("#filtroAlvo"),
    filtroStatus: root.querySelector("#filtroStatus"),

    modalOverlay: root.querySelector("#modalOverlay"),
    modalTitle: root.querySelector("#modalTitle"),
    radioAlvo: root.querySelector("#radioAlvo"),
    lblVinculo: root.querySelector("#lblVinculo"),
    inpTipo: root.querySelector("#inpTipo"),
    inpVinculoNome: root.querySelector("#inpVinculoNome"),
    listaVinculos: root.querySelector("#listaVinculos"),
    inpObs: root.querySelector("#inpObs"),

    // ✅ NOVO: insumos
    insumosContainer: root.querySelector("#insumosContainer"),
    btnAddInsumo: root.querySelector("#btnAddInsumo"),

    // mão de obra
    inpTempo: root.querySelector("#inpTempo"),
    inpCustoHora: root.querySelector("#inpCustoHora"),
    inpComplexidade: root.querySelector("#inpComplexidade"),

    // margem/manual
    inpMargem: root.querySelector("#inpMargem"),
    chkManual: root.querySelector("#chkManual"),
    manualWrap: root.querySelector("#manualWrap"),
    inpPrecoManual: root.querySelector("#inpPrecoManual"),

    // outputs
    outCustoMateriais: root.querySelector("#outCustoMateriais"),
    outCustoMaoObra: root.querySelector("#outCustoMaoObra"),
    outCustoFixo: root.querySelector("#outCustoFixo"),
    outCustoTotal: root.querySelector("#outCustoTotal"),
    outPrecoSugerido: root.querySelector("#outPrecoSugerido"),
    outMargemReal: root.querySelector("#outMargemReal")
  };
}

function getMissingEls(els, keys){
  const miss = [];
  keys.forEach(k=>{
    if(!els[k]) miss.push(k);
  });
  return miss;
}

/* =====================================================
   WAIT ROOT
===================================================== */

function waitForRoot(selector, tries){
  return new Promise(resolve=>{
    let count = 0;

    function tick(){
      const el = document.querySelector(selector);
      if(el) return resolve(el);

      count++;
      if(count >= tries) return resolve(null);

      requestAnimationFrame(tick);
    }

    tick();
  });
}

function safeFinishLoader(){
  try{
    if(typeof window.finalizarCarregamentoModulo === "function"){
      window.finalizarCarregamentoModulo();
    }else{
      document.getElementById("global-loader")?.classList.add("hidden");
    }
  }catch(_){}
}

/* =====================================================
   DESTROY (quando trocar de módulo)
===================================================== */

window.__activeModuleDestroy = function(){
  console.log("🧹 destruindo módulo Personalizações");
  window.__personalizacoesLoaded = false;
};
