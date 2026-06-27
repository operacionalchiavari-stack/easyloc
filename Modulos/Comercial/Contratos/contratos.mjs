import {
  CONTRATO_MODELO_INICIAL,
  CONTRATO_TAG_GROUPS,
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
    "contratoDuplicarModelo",
    "contratoDesativarModelo",
    "contratoExcluirModelo",
    "contratoSalvarModelo",
    "contratosTags",
  ].forEach((id) => {
    els[id] = $(id);
  });
}

function modeloSelecionado(){
  return state.modelos.find((modelo) => modelo.id === state.selecionadoId) || null;
}

function limparEditor(){
  state.selecionadoId = null;
  if(els.contratoNomeModelo) els.contratoNomeModelo.value = "Contrato de Locação";
  if(els.contratoConteudo) els.contratoConteudo.value = CONTRATO_MODELO_INICIAL;
  if(els.contratoModeloPadrao) els.contratoModeloPadrao.checked = !state.modelos.length;
  if(els.contratoModeloAtivo) els.contratoModeloAtivo.checked = true;
  renderLista();
}

function preencherEditor(modelo){
  if(!modelo) return limparEditor();
  state.selecionadoId = modelo.id;
  if(els.contratoNomeModelo) els.contratoNomeModelo.value = modelo.nome_modelo || "";
  if(els.contratoConteudo) els.contratoConteudo.value = modelo.conteudo || "";
  if(els.contratoModeloPadrao) els.contratoModeloPadrao.checked = Boolean(modelo.padrao);
  if(els.contratoModeloAtivo) els.contratoModeloAtivo.checked = modelo.ativo !== false;
  renderLista();
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
            ${escapeHtml(label)}
          </button>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function inserirTag(tag){
  const textarea = els.contratoConteudo;
  if(!textarea) return;
  const inicio = textarea.selectionStart ?? textarea.value.length;
  const fim = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = `${textarea.value.slice(0, inicio)}${tag}${textarea.value.slice(fim)}`;
  const cursor = inicio + tag.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
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

  const nome = els.contratoNomeModelo?.value?.trim() || "";
  const conteudo = els.contratoConteudo?.value?.trim() || "";
  const primeiroModelo = !state.modelos.length || !state.selecionadoId && !state.modelos.length;
  const padrao = Boolean(els.contratoModeloPadrao?.checked || primeiroModelo);
  const ativo = padrao ? true : Boolean(els.contratoModeloAtivo?.checked);

  if(!nome){
    notify("Informe o nome do modelo.", "aviso");
    els.contratoNomeModelo?.focus();
    return;
  }

  if(!conteudo){
    notify("Informe o conteúdo do contrato.", "aviso");
    els.contratoConteudo?.focus();
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
  if(els.contratoNomeModelo) els.contratoNomeModelo.value = `${modelo.nome_modelo} - cópia`;
  if(els.contratoConteudo) els.contratoConteudo.value = modelo.conteudo || "";
  if(els.contratoModeloPadrao) els.contratoModeloPadrao.checked = false;
  if(els.contratoModeloAtivo) els.contratoModeloAtivo.checked = true;
  renderLista();
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
