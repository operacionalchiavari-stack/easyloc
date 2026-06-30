import {
  CONTRATO_MODELO_INICIAL,
  CONTRATO_TAG_GROUPS,
  contratoMarkupParaHtml,
  escapeHtml,
} from "../../../js/core/contracts.mjs";

const state = {
  supabase: null,
  empresaId: null,
  modelos: [],
  selecionadoId: null,
  initialized: false,
};

const els = {};

function $(id){
  return document.getElementById(id);
}

function notify(message, type = "info", title = "Contratos"){
  if(typeof window.alerta === "function") return window.alerta(message, title, type);
  alert(message);
}

async function confirmAction(message, title = "Confirmar"){
  if(typeof window.confirmarGlobal === "function"){
    return await window.confirmarGlobal(message, title, { confirmarTexto: "Confirmar", tipo: "warning" });
  }
  return confirm(message);
}

function cacheEls(){
  [
    "contratoNovoModelo",
    "contratoAtualizar",
    "contratosLista",
    "contratoNomeModelo",
    "contratoModeloPadrao",
    "contratoModeloAtivo",
    "contratoConteudo",
    "contratoConteudoEditor",
    "contratoEditorToolbar",
    "contratoDuplicarModelo",
    "contratoDesativarModelo",
    "contratoExcluirModelo",
    "contratoSalvarModelo",
    "contratosTags",
  ].forEach((id) => {
    els[id] = $(id);
  });
}

function escapeRegex(value){
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contarTag(conteudo, tag){
  const match = String(conteudo || "").match(new RegExp(escapeRegex(tag), "g"));
  return match ? match.length : 0;
}

function syncEditorScroll(){
  posicionarToolbarEditor();
}

function atualizarEditorHighlight(){
  if(!els.contratoConteudo || !els.contratoConteudoEditor) return;
  els.contratoConteudoEditor.innerHTML = contratoMarkupParaHtml(
    els.contratoConteudo.value || "",
    { highlightTags: true }
  ) || " ";
}

function atualizarContadoresTags(){
  if(!els.contratoConteudo || !els.contratosTags) return;
  const conteudo = els.contratoConteudo.value || "";
  els.contratosTags.querySelectorAll(".contrato-tag-btn[data-tag]").forEach((button) => {
    const count = contarTag(conteudo, button.dataset.tag);
    const badge = button.querySelector(".contrato-tag-count");
    if(!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle("is-zero", count === 0);
  });
}

function atualizarEditorVisual(){
  atualizarEditorHighlight();
  atualizarContadoresTags();
}

function sincronizarEditorParaCampo(){
  if(!els.contratoConteudo || !els.contratoConteudoEditor) return;
  els.contratoConteudo.value = contratoMarkupParaHtml(els.contratoConteudoEditor.innerHTML || "");
  atualizarContadoresTags();
}

function ocultarToolbarEditor(){
  if(!els.contratoEditorToolbar) return;
  els.contratoEditorToolbar.hidden = true;
}

function getEditorSelection(){
  const editor = els.contratoConteudoEditor;
  const selection = window.getSelection?.();
  if(!editor || !selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if(range.collapsed || !editor.contains(range.commonAncestorContainer)) return null;
  return { selection, range };
}

function posicionarToolbarEditor(){
  const editor = els.contratoConteudoEditor;
  const toolbar = els.contratoEditorToolbar;
  if(!editor || !toolbar) return;

  const selected = getEditorSelection();
  if(!selected){
    ocultarToolbarEditor();
    return;
  }

  toolbar.hidden = false;
  const selectionRect = selected.range.getBoundingClientRect();
  const wrap = editor.closest(".contratos-editor-highlight-wrap");
  const wrapRect = wrap?.getBoundingClientRect();
  if(!wrapRect) return;

  const wrapWidth = wrap.clientWidth || editor.clientWidth;
  const toolbarWidth = toolbar.offsetWidth || 220;
  const left = Math.max(8, Math.min(selectionRect.left - wrapRect.left, wrapWidth - toolbarWidth - 8));
  const top = Math.max(8, selectionRect.top - wrapRect.top - toolbar.offsetHeight - 10);

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function inserirNodeNoEditor(node){
  const editor = els.contratoConteudoEditor;
  if(!editor) return;
  const selection = window.getSelection?.();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null;

  if(!range || !editor.contains(range.commonAncestorContainer)){
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();
  sincronizarEditorParaCampo();
}

function aplicarMarcacao(tagName, style = {}){
  const selected = getEditorSelection();
  if(!selected){
    els.contratoConteudoEditor?.focus();
    posicionarToolbarEditor();
    return;
  }

  const wrapper = document.createElement(tagName);
  Object.entries(style).forEach(([key, value]) => {
    wrapper.style[key] = value;
  });

  wrapper.appendChild(selected.range.extractContents());
  selected.range.insertNode(wrapper);
  selected.selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(wrapper);
  selected.selection.addRange(range);
  sincronizarEditorParaCampo();
  posicionarToolbarEditor();
}

function aplicarFormatoContrato(action){
  if(action === "bold") aplicarMarcacao("strong");
  if(action === "italic") aplicarMarcacao("em");
}

function aplicarCorContrato(color){
  if(!/^#[0-9a-f]{6}$/i.test(color || "")) return;
  aplicarMarcacao("span", { color: color.toLowerCase() });
}

function modeloSelecionado(){
  return state.modelos.find((modelo) => modelo.id === state.selecionadoId) || null;
}

function limparEditor(){
  state.selecionadoId = null;
  ocultarToolbarEditor();
  if(els.contratoNomeModelo) els.contratoNomeModelo.value = "Contrato de Locação";
  if(els.contratoConteudo) els.contratoConteudo.value = CONTRATO_MODELO_INICIAL;
  if(els.contratoModeloPadrao) els.contratoModeloPadrao.checked = !state.modelos.length;
  if(els.contratoModeloAtivo) els.contratoModeloAtivo.checked = true;
  renderLista();
  atualizarEditorVisual();
}

function preencherEditor(modelo){
  if(!modelo) return limparEditor();
  state.selecionadoId = modelo.id;
  ocultarToolbarEditor();
  if(els.contratoNomeModelo) els.contratoNomeModelo.value = modelo.nome_modelo || "";
  if(els.contratoConteudo) els.contratoConteudo.value = modelo.conteudo || "";
  if(els.contratoModeloPadrao) els.contratoModeloPadrao.checked = Boolean(modelo.padrao);
  if(els.contratoModeloAtivo) els.contratoModeloAtivo.checked = modelo.ativo !== false;
  renderLista();
  atualizarEditorVisual();
}

function renderLista(){
  if(!els.contratosLista) return;
  if(!state.modelos.length){
    els.contratosLista.innerHTML = `
      <div class="contratos-empty">
        Nenhum modelo cadastrado. Crie o primeiro modelo para liberar contratos nos pedidos.
      </div>
    `;
    return;
  }

  els.contratosLista.innerHTML = state.modelos.map((modelo) => {
    const active = modelo.id === state.selecionadoId ? " active" : "";
    const badges = [
      modelo.padrao ? `<span class="contrato-badge default">Padrão</span>` : "",
      modelo.ativo ? `<span class="contrato-badge">Ativo</span>` : `<span class="contrato-badge inactive">Inativo</span>`,
    ].join("");

    return `
      <button type="button" class="contrato-list-item${active}" data-contrato-id="${escapeHtml(modelo.id)}">
        <strong>${escapeHtml(modelo.nome_modelo)}</strong>
        <span class="contrato-list-badges">${badges}</span>
      </button>
    `;
  }).join("");
}

function renderTags(){
  if(!els.contratosTags) return;
  els.contratosTags.innerHTML = CONTRATO_TAG_GROUPS.map((group) => `
    <section class="contrato-tag-group">
      <strong>${escapeHtml(group.titulo)}</strong>
      <div class="contrato-tag-list">
        ${group.tags.map(([tag, label]) => `
          <button type="button" class="contrato-tag-btn" data-tag="${escapeHtml(tag)}" title="${escapeHtml(tag)}">
            <span class="contrato-tag-label">${escapeHtml(label)}</span>
            <span class="contrato-tag-count is-zero">0</span>
          </button>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function inserirTag(tag){
  const span = document.createElement("span");
  span.className = "tag-contrato";
  span.textContent = tag;
  inserirNodeNoEditor(span);
  inserirNodeNoEditor(document.createTextNode(" "));
  sincronizarEditorParaCampo();
}

async function carregarModelos(){
  if(!state.supabase || !state.empresaId) return;
  const { data, error } = await state.supabase
    .from("contratos_modelos")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .order("padrao", { ascending: false })
    .order("atualizado_em", { ascending: false });

  if(error){
    console.error("Erro ao carregar modelos de contrato:", error);
    notify("Não foi possível carregar os modelos de contrato. Verifique se a migration foi aplicada no Supabase.", "erro");
    return;
  }

  state.modelos = data || [];
  const atualExiste = state.modelos.some((modelo) => modelo.id === state.selecionadoId);
  const proximo = atualExiste
    ? modeloSelecionado()
    : state.modelos.find((modelo) => modelo.padrao && modelo.ativo) || state.modelos[0];

  if(proximo) preencherEditor(proximo);
  else limparEditor();
}

async function salvarModelo(){
  if(!state.supabase || !state.empresaId){
    notify("Empresa não encontrada no contexto.", "erro");
    return;
  }

  sincronizarEditorParaCampo();
  const nome = els.contratoNomeModelo?.value?.trim() || "";
  const conteudo = els.contratoConteudo?.value?.trim() || "";
  const conteudoTexto = els.contratoConteudoEditor?.innerText?.trim() || "";
  const primeiroModelo = !state.modelos.length || !state.selecionadoId && !state.modelos.length;
  const padrao = Boolean(els.contratoModeloPadrao?.checked || primeiroModelo);
  const ativo = padrao ? true : Boolean(els.contratoModeloAtivo?.checked);

  if(!nome){
    notify("Informe o nome do modelo.", "aviso");
    els.contratoNomeModelo?.focus();
    return;
  }

  if(!conteudoTexto){
    notify("Informe o conteúdo do contrato.", "aviso");
    els.contratoConteudoEditor?.focus();
    return;
  }

  const payload = {
    empresa_id: state.empresaId,
    nome_modelo: nome,
    conteudo,
    padrao,
    ativo,
  };

  let result;
  if(state.selecionadoId){
    result = await state.supabase
      .from("contratos_modelos")
      .update(payload)
      .eq("empresa_id", state.empresaId)
      .eq("id", state.selecionadoId)
      .select("*")
      .single();
  }else{
    result = await state.supabase
      .from("contratos_modelos")
      .insert(payload)
      .select("*")
      .single();
  }

  if(result.error){
    console.error("Erro ao salvar modelo:", result.error);
    notify("Não foi possível salvar o modelo de contrato.", "erro");
    return;
  }

  state.selecionadoId = result.data.id;
  notify("Modelo salvo com sucesso.", "sucesso");
  await carregarModelos();
}

async function duplicarModelo(){
  const modelo = modeloSelecionado();
  if(!modelo){
    notify("Selecione um modelo para duplicar.", "aviso");
    return;
  }
  state.selecionadoId = null;
  ocultarToolbarEditor();
  if(els.contratoNomeModelo) els.contratoNomeModelo.value = `${modelo.nome_modelo} - cópia`;
  if(els.contratoConteudo) els.contratoConteudo.value = modelo.conteudo || "";
  if(els.contratoModeloPadrao) els.contratoModeloPadrao.checked = false;
  if(els.contratoModeloAtivo) els.contratoModeloAtivo.checked = true;
  renderLista();
  atualizarEditorVisual();
}

async function alternarAtivo(){
  const modelo = modeloSelecionado();
  if(!modelo){
    notify("Selecione um modelo para ativar ou desativar.", "aviso");
    return;
  }

  if(modelo.padrao && modelo.ativo){
    notify("O modelo padrão ativo não pode ser desativado antes de definir outro padrão.", "aviso");
    return;
  }

  const { error } = await state.supabase
    .from("contratos_modelos")
    .update({ ativo: !modelo.ativo, padrao: modelo.padrao && !modelo.ativo ? modelo.padrao : false })
    .eq("empresa_id", state.empresaId)
    .eq("id", modelo.id);

  if(error){
    notify("Não foi possível alterar o status do modelo.", "erro");
    return;
  }

  await carregarModelos();
}

async function excluirModelo(){
  const modelo = modeloSelecionado();
  if(!modelo){
    notify("Selecione um modelo para excluir.", "aviso");
    return;
  }

  const ok = await confirmAction(`Excluir o modelo "${modelo.nome_modelo}"?`, "Excluir modelo");
  if(!ok) return;

  const { error } = await state.supabase
    .from("contratos_modelos")
    .delete()
    .eq("empresa_id", state.empresaId)
    .eq("id", modelo.id);

  if(error){
    notify("Não foi possível excluir o modelo.", "erro");
    return;
  }

  state.selecionadoId = null;
  await carregarModelos();
}

function bindEvents(){
  els.contratoNovoModelo?.addEventListener("click", limparEditor);
  els.contratoAtualizar?.addEventListener("click", carregarModelos);
  els.contratoSalvarModelo?.addEventListener("click", salvarModelo);
  els.contratoDuplicarModelo?.addEventListener("click", duplicarModelo);
  els.contratoDesativarModelo?.addEventListener("click", alternarAtivo);
  els.contratoExcluirModelo?.addEventListener("click", excluirModelo);
  els.contratoConteudoEditor?.addEventListener("input", sincronizarEditorParaCampo);
  els.contratoConteudoEditor?.addEventListener("scroll", syncEditorScroll);
  els.contratoConteudoEditor?.addEventListener("mouseup", posicionarToolbarEditor);
  els.contratoConteudoEditor?.addEventListener("keyup", posicionarToolbarEditor);
  els.contratoConteudoEditor?.addEventListener("focus", posicionarToolbarEditor);
  els.contratoConteudoEditor?.addEventListener("blur", () => {
    setTimeout(() => {
      if(!els.contratoEditorToolbar?.contains(document.activeElement)) ocultarToolbarEditor();
    }, 120);
  });

  els.contratoEditorToolbar?.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  els.contratoEditorToolbar?.addEventListener("click", (event) => {
    const formatButton = event.target.closest("[data-contrato-format]");
    if(formatButton){
      aplicarFormatoContrato(formatButton.dataset.contratoFormat);
      return;
    }

    const colorButton = event.target.closest("[data-contrato-color]");
    if(colorButton) aplicarCorContrato(colorButton.dataset.contratoColor);
  });

  els.contratosLista?.addEventListener("click", (event) => {
    const item = event.target.closest("[data-contrato-id]");
    if(!item) return;
    const modelo = state.modelos.find((row) => row.id === item.dataset.contratoId);
    preencherEditor(modelo);
  });

  els.contratosTags?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag]");
    if(button) inserirTag(button.dataset.tag);
  });

  els.contratoModeloPadrao?.addEventListener("change", () => {
    if(els.contratoModeloPadrao.checked && els.contratoModeloAtivo){
      els.contratoModeloAtivo.checked = true;
    }
  });
}

export async function initContratos(){
  if(state.initialized) return;
  state.initialized = true;
  state.supabase = window.supabaseClient;
  state.empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
  cacheEls();
  renderTags();
  bindEvents();
  atualizarEditorVisual();

  if(!state.supabase || !state.empresaId){
    notify("Supabase ou empresa não encontrados.", "erro");
    window.finalizarCarregamentoModulo?.();
    return;
  }

  await carregarModelos();
  window.lucide?.createIcons?.();
  window.finalizarCarregamentoModulo?.();
}

export function destroyContratos(){
  state.initialized = false;
}

window.__activeModuleDestroy = destroyContratos;
window.__moduleInit = initContratos;
