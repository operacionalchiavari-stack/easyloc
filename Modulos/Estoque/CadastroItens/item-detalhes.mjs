import { getEmpresaAtualId } from "./itens.api.mjs";
import "./itens.modal.mjs";
import "./itens.foto.mjs";
import "./itens.3d.mjs";

const supabase = window.supabaseClient;
const urlParams = new URLSearchParams(window.location.search);
const itemIdFromUrl = urlParams.get("id");

const state = {
  itemId: window.__ITEM_DETALHE_ID || itemIdFromUrl || null,
  modo: window.__ITEM_DETALHE_MODO || (window.__ITEM_DETALHE_ID || itemIdFromUrl ? "editar" : "novo"),
  empresaId: null,
  item: null,
  loadedTabs: new Set(["dados"]),
};

function $(id){
  return document.getElementById(id);
}

function money(value){
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function text(value, fallback = "-"){
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}

function notify(message, type = "info", title = "Itens"){
  if(typeof window.alerta === "function") return window.alerta(message, title, type);
  alert(message);
}

function voltarParaItens(){
  window.__ITEM_DETALHE_ID = null;
  window.__ITEM_DETALHE_MODO = null;

  if(typeof window.carregarNaMain === "function"){
    window.carregarNaMain(
      "Modulos/Estoque/CadastroItens/cadastro-itens.html",
      "Modulos/Estoque/CadastroItens/cadastro-itens.mjs",
      null,
      "Modulos/Estoque/CadastroItens/cadastro-itens.css"
    );
    return;
  }

  window.history.back();
}

function statusDoItem(item = state.item){
  const inativo = item?.status === "Inativo" || item?.ativo === false;
  return inativo ? "Inativo" : "Ativo";
}

function resetarFormularioNovo(){
  window.itemAtualId = null;
  window.itemAtualQrCode = null;

  document.querySelectorAll(".item-detail-page input").forEach((el) => {
    if(el.type !== "file") el.value = "";
  });
  document.querySelectorAll(".item-detail-page select").forEach((el) => {
    el.selectedIndex = 0;
  });

  if($("itensCodigo")){
    $("itensCodigo").value = "";
    $("itensCodigo").placeholder = "Gerado automaticamente";
  }

  window.itens_resetarFoto?.();
  window.itens_resetarFotosAdicionais?.();
  window.itens_3d_reset?.();
  window.itens_setQrVisual?.(null);

  document.querySelectorAll(".item-tipo-toggle-row .tipo-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelector(".item-tipo-toggle-row .tipo-btn")?.classList.add("active");
  document.querySelectorAll(".item-status-toggle-row .status-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelector(".status-btn.ativo")?.classList.add("active");

  atualizarResumo();
}

function preencherFormulario(item){
  if(!item) return resetarFormularioNovo();

  window.itemAtualId = item.id;
  window.itemAtualQrCode = item.qr_code || null;

  $("itensId").value = item.id || "";
  $("itensCodigo").value = item.codigo || "";
  $("itensProduto").value = item.produto || "";
  $("itensMaterial").value = item.material || "";
  $("itensCor").value = item.cor || "";
  $("itensDescricaoComplementar").value = item.descricao_complementar || "";
  $("itensDescricaoTotal").value = item.descricao_total || "";
  $("itensLargura").value = item.largura != null ? Number(item.largura).toFixed(2) : "";
  $("itensAltura").value = item.altura != null ? Number(item.altura).toFixed(2) : "";
  $("itensProfundidade").value = item.profundidade != null ? Number(item.profundidade).toFixed(2) : "";
  $("itensVolumeCubico").value = item.volume_cubico || "";
  $("itensFamilia").value = item.familia || "";
  $("itensCategoria").value = item.categoria || "";
  $("itensSetor").value = item.setor_estoque || "";
  $("itensExibirSite").value = item.exibir_no_site ? "true" : "false";
  $("itensCusto").value = item.custo || "";
  $("itensValorLocacao").value = item.valor_locacao || "";
  $("itensValorReposicao").value = item.valor_reposicao || "";

  if(item.foto_url) window.itens_carregarFotoExistente?.(item.foto_url);
  else window.itens_resetarFoto?.();

  window.itens_carregarFotosAdicionais?.(item.id);
  window.itens_3d_init?.({ itemId: item.id, empresaId: state.empresaId });

  document.querySelectorAll(".item-tipo-toggle-row .tipo-btn").forEach((btn) => btn.classList.remove("active"));
  const tipoIndex = item.tipo === "Componente" ? 1 : 0;
  document.querySelectorAll(".item-tipo-toggle-row .tipo-btn")[tipoIndex]?.classList.add("active");

  document.querySelectorAll(".item-status-toggle-row .status-btn").forEach((btn) => btn.classList.remove("active"));
  document.querySelector(statusDoItem(item) === "Inativo" ? ".status-btn.inativo" : ".status-btn.ativo")?.classList.add("active");

  window.itens_setQrVisual?.(item.qr_code || null);
  atualizarResumo();
}

function getValor(id){
  return $(id)?.value?.trim() || "";
}

function atualizarResumo(){
  const nome = getValor("itensDescricaoTotal") || [
    getValor("itensProduto"),
    getValor("itensMaterial"),
    getValor("itensCor"),
    getValor("itensDescricaoComplementar"),
  ].filter(Boolean).join(" ") || "Item sem nome";

  const codigo = getValor("itensCodigo") || "Novo item";
  const statusAtivo = document.querySelector(".status-btn.ativo")?.classList.contains("active");
  const status = statusAtivo ? "Ativo" : "Inativo";
  const dims = [getValor("itensLargura"), getValor("itensAltura"), getValor("itensProfundidade")]
    .filter(Boolean)
    .join(" x ");

  setText("itemDetailTitle", nome);
  setText("itemDetailSummaryName", nome);
  setText("itemDetailCode", codigo);
  setText("itemDetailStatus", status);
  $("itemDetailStatus")?.classList.toggle("ativo", status === "Ativo");
  $("itemDetailStatus")?.classList.toggle("inativo", status === "Inativo");

  setText("itemResumoCodigo", codigo);
  setText("itemResumoCategoria", text(getValor("itensCategoria")));
  setText("itemResumoFamilia", text(getValor("itensFamilia")));
  setText("itemResumoSetor", text(getValor("itensSetor")));
  setText("itemResumoMaterial", text(getValor("itensMaterial")));
  setText("itemResumoCor", text(getValor("itensCor")));
  setText("itemResumoDimensoes", dims ? `${dims} m` : "-");
  setText("itemResumoVolume", getValor("itensVolumeCubico") ? `${getValor("itensVolumeCubico")} m3` : "-");
  setText("itemResumoCusto", money(getValor("itensCusto").replace(",", ".")));
  setText("itemResumoLocacao", money(getValor("itensValorLocacao").replace(",", ".")));
  setText("itemResumoReposicao", money(getValor("itensValorReposicao").replace(",", ".")));
}

async function carregarItem(){
  state.empresaId = await getEmpresaAtualId();

  if(!state.itemId){
    state.modo = "novo";
    resetarFormularioNovo();
    window.finalizarCarregamentoModulo?.();
    return;
  }

  const { data, error } = await supabase
    .from("itens")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("id", state.itemId)
    .single();

  if(error){
    console.error("Erro ao carregar item:", error);
    notify("Nao foi possivel carregar este item.", "erro");
    voltarParaItens();
    return;
  }

  state.item = data;
  preencherFormulario(data);
  window.finalizarCarregamentoModulo?.();
}

function abrirAba(tab){
  document.querySelectorAll(".item-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.itemTab === tab);
  });
  document.querySelectorAll(".item-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.itemPanel === tab);
  });

  if(!state.loadedTabs.has(tab)){
    state.loadedTabs.add(tab);
    carregarAbaSobDemanda(tab).catch((error) => console.error("Erro ao carregar aba:", tab, error));
  }

  if(tab === "qrcode"){
    window.itens_setQrVisual?.(window.itemAtualQrCode || null);
  }

  window.lucide?.createIcons?.();
}

async function carregarAbaSobDemanda(tab){
  if(tab === "kits") return carregarKits();
  return Promise.resolve();
}

async function carregarKits(){
  const body = $("itemDetalheKitsBody");
  if(!body) return;
  body.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;

  if(!state.itemId){
    body.innerHTML = `<tr><td colspan="4">Salve o item antes de consultar kits vinculados.</td></tr>`;
    return;
  }

  const { data: vinculos, error } = await supabase
    .from("kit_itens")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("item_id", state.itemId);

  if(error){
    body.innerHTML = `<tr><td colspan="4">Nenhum vinculo de kit encontrado.</td></tr>`;
    return;
  }

  if(!vinculos?.length){
    body.innerHTML = `<tr><td colspan="4">Este item ainda nao esta vinculado a kits.</td></tr>`;
    return;
  }

  const kitIds = vinculos.map((row) => row.kit_id).filter(Boolean);
  const { data: kits } = await supabase
    .from("itens")
    .select("id, descricao_total, produto, valor_locacao, valor_reposicao")
    .in("id", kitIds);

  body.innerHTML = vinculos.map((vinculo) => {
    const kit = kits?.find((row) => row.id === vinculo.kit_id) || {};
    return `
      <tr>
        <td>${text(kit.descricao_total || kit.produto, "Kit")}</td>
        <td>${Number(vinculo.quantidade || 0)}</td>
        <td>${money(kit.valor_locacao)}</td>
        <td>${money(kit.valor_reposicao)}</td>
      </tr>
    `;
  }).join("");
}

async function salvarDetalhes(){
  const result = await window.itens_salvar?.();
  if(result === false) return;

  atualizarResumo();
  notify("Item salvo com sucesso.", "sucesso");

  if(state.modo === "novo"){
    voltarParaItens();
  }
}

function bindEvents(){
  $("btnVoltarItens")?.addEventListener("click", voltarParaItens);
  $("btnSalvarItemDetalhes")?.addEventListener("click", salvarDetalhes);

  document.querySelectorAll(".item-tab").forEach((button) => {
    button.addEventListener("click", () => abrirAba(button.dataset.itemTab));
  });

  document.querySelector(".item-detail-page")?.addEventListener("input", (event) => {
    const ids = [
      "itensProduto",
      "itensMaterial",
      "itensCor",
      "itensDescricaoComplementar",
      "itensLargura",
      "itensAltura",
      "itensProfundidade",
      "itensFamilia",
      "itensCategoria",
      "itensSetor",
      "itensExibirSite",
      "itensCusto",
      "itensValorLocacao",
      "itensValorReposicao",
    ];
    if(ids.includes(event.target.id)){
      requestAnimationFrame(atualizarResumo);
    }
  });

  document.querySelector(".item-detail-page")?.addEventListener("change", (event) => {
    if(["itensSetor", "itensExibirSite"].includes(event.target.id)){
      requestAnimationFrame(atualizarResumo);
    }
  });

  document.querySelector(".item-detail-page")?.addEventListener("click", (event) => {
    if(event.target.closest(".status-btn") || event.target.closest(".tipo-btn")){
      requestAnimationFrame(atualizarResumo);
    }
  });
}

export async function initItemDetalhes(){
  bindEvents();
  await carregarItem();
  window.lucide?.createIcons?.();
}

export function destroyItemDetalhes(){
  window.itens_3d_destroy?.();
  window.__ITEM_DETALHE_ID = null;
  window.__ITEM_DETALHE_MODO = null;
}

window.__activeModuleDestroy = destroyItemDetalhes;
window.__moduleInit = initItemDetalhes;
