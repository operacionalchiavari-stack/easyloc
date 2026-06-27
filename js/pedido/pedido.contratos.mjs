import {
  renderizarContrato,
  textoParaHtml,
} from "../core/contracts.mjs";
import { parseCurrency } from "./pedido.utils.mjs";

const state = {
  supabase: null,
  empresaId: null,
  modeloPadrao: null,
  contratoPedido: null,
  conteudoFinal: "",
  conteudoEditado: false,
  conteudoCongelado: false,
  carregado: false,
  valido: false,
  editing: false,
  empresa: null,
  cliente: null,
  local: null,
  avisar: null,
};

const els = {};

const $ = (id) => document.getElementById(id);

function notify(message, title = "Contrato", type = "info"){
  if(typeof state.avisar === "function") return state.avisar(message, title, type);
  if(typeof window.alerta === "function") return window.alerta(message, title, type);
  alert(message);
}

function debounce(fn, wait = 250){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function cacheEls(){
  [
    "pedidoContratoCard",
    "pedidoContratoAviso",
    "pedidoContratoEditor",
    "pedidoContratoPreview",
    "btnEditarContratoPedido",
    "btnRestaurarContratoPadrao",
    "btnVisualizarContratoPedido",
    "btnImprimirContratoPedido",
    "btnGerarPdfContratoPedido",
    "pedidoContratoModal",
    "pedidoContratoModalTexto",
    "btnFecharContratoModal",
    "btnFecharContratoModalFooter",
    "btnImprimirContratoModal",
    "btnGerarPdfContratoModal",
  ].forEach((id) => {
    els[id] = $(id);
  });
}

function setAviso(message = "", type = "info"){
  if(!els.pedidoContratoAviso) return;
  els.pedidoContratoAviso.hidden = !message;
  els.pedidoContratoAviso.textContent = message;
  els.pedidoContratoAviso.classList.toggle("erro", type === "erro");
}

function setValid(valid){
  state.valido = Boolean(valid);
  window.__PEDIDO_CONTRATO_VALIDO = state.valido;
}

async function carregarEmpresa(){
  if(state.empresa || !state.supabase || !state.empresaId) return state.empresa;
  const { data } = await state.supabase
    .from("empresas")
    .select("*")
    .eq("id", state.empresaId)
    .maybeSingle();
  state.empresa = data || {};
  return state.empresa;
}

async function carregarCliente(){
  const clienteId = $("clienteIdHidden")?.value || "";
  if(!clienteId || state.cliente?.id === clienteId) return state.cliente || {};
  const { data } = await state.supabase
    .from("clientes_empresas")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("id", clienteId)
    .maybeSingle();
  state.cliente = data || {};
  return state.cliente;
}

async function carregarLocal(){
  const localId = $("localIdHidden")?.value || "";
  if(!localId || state.local?.id === localId) return state.local || {};
  const { data } = await state.supabase
    .from("locais_empresas")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("id", localId)
    .maybeSingle();
  state.local = data || {};
  return state.local;
}

function texto(id){
  return $(id)?.textContent?.trim() || "";
}

function valorResumo(id){
  return parseCurrency(texto(id));
}

function primeiraFormaPagamento(){
  return document.querySelector("#cronogramaParcelas .pg-metodo")?.selectedOptions?.[0]?.textContent?.trim()
    || document.querySelector("#cronogramaParcelas .pg-metodo-text")?.textContent?.trim()
    || $("pagamentoMetodo")?.selectedOptions?.[0]?.textContent?.trim()
    || $("pagamentoMetodo")?.value
    || "A combinar";
}

function coletarItens(){
  return Array.from(document.querySelectorAll("#listaItens tr.item-row")).map((row) => ({
    quantidade: Number(String(row.querySelector(".qtd")?.textContent || row.querySelector(".qtd")?.value || "1").replace(",", ".")) || 1,
    nome: row.querySelector(".nome-item")?.innerText?.trim() || "Item",
  })).filter((item) => item.nome && item.nome !== "Item");
}

function extrairCidadeEstado(local = {}){
  const cidade = local.cidade || local.municipio || "";
  const estado = local.estado || local.uf || "";
  if(cidade || estado) return { cidade, estado };
  const endereco = String(local.endereco || "");
  const match = endereco.match(/,\s*([^,-]+)\s*-\s*([A-Z]{2})/i);
  return {
    cidade: match?.[1]?.trim() || "",
    estado: match?.[2]?.trim()?.toUpperCase() || "",
  };
}

function enderecoCompletoLocal(local = {}){
  return [
    local.endereco,
    local.numero_endereco ? String(local.numero_endereco).trim() : "",
  ].filter(Boolean).join(", ");
}

async function coletarDadosContrato(){
  const [empresa, cliente, local] = await Promise.all([
    carregarEmpresa(),
    carregarCliente(),
    carregarLocal(),
  ]);
  const localCidadeEstado = extrairCidadeEstado(local);
  const valorLocacao = valorResumo("resumoLocacaoBruto");
  const valorServicos = valorResumo("resumoServicos") + valorResumo("resumoFreteBruto") + valorResumo("resumoMontagemBruto");
  const desconto = Math.abs(valorResumo("resumoLocacaoDesconto")) + Math.abs(valorResumo("resumoFreteDesconto")) + Math.abs(valorResumo("resumoMontagemDesconto"));
  const total = valorResumo("resumoTotalGeral");

  return {
    pedido: {
      numero: texto("orcamentoNumero"),
      data_evento: $("dataEvento")?.value || "",
      data_entrega: $("dataEntrega")?.value || "",
      hora_entrega: $("horaEntrega")?.value || "",
      data_recolha: $("dataColeta")?.value || "",
      hora_recolha: $("horaColeta")?.value || "",
    },
    cliente: {
      nome: $("clienteInput")?.value?.trim() || "",
      documento: cliente.cpf_cnpj || "",
      telefone: $("telefoneInput")?.value?.trim() || cliente.telefone || "",
      email: cliente.email || "",
    },
    local: {
      nome: $("localInput")?.value?.trim() || local.nome_razao || "",
      endereco: enderecoCompletoLocal(local) || $("localObservacoes")?.innerText?.trim() || "",
      cidade: localCidadeEstado.cidade,
      estado: localCidadeEstado.estado,
    },
    valores: {
      locacao: valorLocacao,
      servicos: valorServicos,
      total,
      desconto,
      final: total,
    },
    financeiro: {
      forma_pagamento: primeiraFormaPagamento(),
    },
    empresa: {
      nome: empresa.nome_fantasia || empresa.nome || empresa.razao_social || "",
      cnpj: empresa.cnpj || empresa.cpf_cnpj || "",
      endereco: empresa.endereco || "",
      telefone: empresa.telefone || "",
      email: empresa.email || "",
    },
    itens: coletarItens(),
  };
}

async function carregarModeloPadrao(){
  const { data, error } = await state.supabase
    .from("contratos_modelos")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("padrao", true)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if(error){
    console.error("Erro ao carregar modelo padrão:", error);
    setAviso("Não foi possível carregar o modelo padrão de contrato.", "erro");
    setValid(false);
    return null;
  }

  state.modeloPadrao = data || null;
  return state.modeloPadrao;
}

async function carregarContratoPedido(){
  const pedidoId = window.__PEDIDO_ATUAL_ID;
  if(!pedidoId) return null;
  const { data, error } = await state.supabase
    .from("contratos_pedidos")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("pedido_id", pedidoId)
    .maybeSingle();

  if(error){
    console.warn("Contrato do pedido indisponível:", error);
    return null;
  }

  state.contratoPedido = data || null;
  state.conteudoCongelado = false;
  const statusPedido = String(window.__PEDIDO_DADOS_ATUAL?.status_comercial || "").toLowerCase();
  const statusFinal = ["aprovado", "finalizado", "enviado"].includes(statusPedido);
  if(data && (data.conteudo_editado || statusFinal)){
    state.conteudoEditado = Boolean(data.conteudo_editado);
    state.conteudoCongelado = statusFinal && !data.conteudo_editado;
    state.conteudoFinal = data.conteudo_final || "";
  }
  return data || null;
}

async function recalcularContrato({ forceModelo = false } = {}){
  if(!state.modeloPadrao) await carregarModeloPadrao();
  if(!state.modeloPadrao && !state.conteudoEditado && !state.conteudoCongelado){
    setValid(false);
    state.conteudoFinal = "";
    setAviso("Nenhum modelo de contrato padrão cadastrado. Cadastre um modelo em Comercial > Contratos.", "erro");
    if(els.pedidoContratoPreview) els.pedidoContratoPreview.innerHTML = "";
    return;
  }

  if(forceModelo){
    state.conteudoEditado = false;
    state.conteudoFinal = "";
  }

  if(!state.conteudoEditado && !state.conteudoCongelado){
    const dados = await coletarDadosContrato();
    state.conteudoFinal = renderizarContrato(state.modeloPadrao.conteudo, dados);
  }

  setValid(Boolean(state.conteudoFinal?.trim()));
  setAviso(
    state.conteudoEditado
      ? "Este pedido possui um contrato editado manualmente. O modelo padrão não será alterado."
      : state.conteudoCongelado
        ? "Contrato final salvo para este pedido. Alterações futuras no modelo padrão não alteram este conteúdo."
        : ""
  );
  if(els.pedidoContratoPreview) els.pedidoContratoPreview.innerHTML = textoParaHtml(state.conteudoFinal);
  if(els.pedidoContratoEditor && !els.pedidoContratoEditor.hidden) els.pedidoContratoEditor.value = state.conteudoFinal;
}

async function salvarContratoPedido(pedidoId, { final = false } = {}){
  if(!pedidoId || !state.supabase || !state.empresaId) return false;
  if(!state.conteudoFinal?.trim()) await recalcularContrato();
  if(!state.conteudoFinal?.trim()) return false;
  const conteudoFinal = final
    ? renderizarContrato(state.conteudoFinal, await coletarDadosContrato())
    : state.conteudoFinal;
  state.conteudoFinal = conteudoFinal;

  const payload = {
    empresa_id: state.empresaId,
    pedido_id: pedidoId,
    modelo_id: state.modeloPadrao?.id || state.contratoPedido?.modelo_id || null,
    conteudo_final: conteudoFinal,
    conteudo_editado: Boolean(state.conteudoEditado),
  };

  const { data, error } = await state.supabase
    .from("contratos_pedidos")
    .upsert(payload, { onConflict: "empresa_id,pedido_id" })
    .select("*")
    .single();

  if(error){
    console.error("Erro ao salvar contrato do pedido:", error);
    if(final) notify("Pedido salvo, mas não foi possível salvar a cópia final do contrato.", "Contrato", "aviso");
    return false;
  }

  state.contratoPedido = data;
  if(final) state.conteudoCongelado = true;
  return true;
}

function alternarEdicao(){
  if(!els.pedidoContratoEditor || !els.btnEditarContratoPedido) return;
  if(els.pedidoContratoEditor.hidden){
    state.editing = true;
    els.pedidoContratoEditor.hidden = false;
    els.pedidoContratoEditor.value = state.conteudoFinal || "";
    els.btnEditarContratoPedido.textContent = "Salvar texto deste pedido";
    els.pedidoContratoEditor.focus();
    return;
  }

  state.conteudoFinal = els.pedidoContratoEditor.value || "";
  state.conteudoEditado = true;
  state.conteudoCongelado = false;
  state.editing = false;
  els.pedidoContratoEditor.hidden = true;
  els.btnEditarContratoPedido.textContent = "Editar texto deste pedido";
  if(els.pedidoContratoPreview) els.pedidoContratoPreview.innerHTML = textoParaHtml(state.conteudoFinal);
  setAviso("Este pedido possui um contrato editado manualmente. O modelo padrão não será alterado.");
  setValid(Boolean(state.conteudoFinal.trim()));
  const pedidoId = window.__PEDIDO_ATUAL_ID;
  if(pedidoId) salvarContratoPedido(pedidoId);
  else notify("O texto editado será salvo quando o pedido for salvo.", "Contrato", "info");
}

async function restaurarPadrao(){
  if(!state.modeloPadrao) await carregarModeloPadrao();
  if(!state.modeloPadrao){
    notify("Cadastre um modelo padrão antes de restaurar.", "Contrato", "aviso");
    return;
  }
  state.conteudoEditado = false;
  state.conteudoCongelado = false;
  state.editing = false;
  if(els.pedidoContratoEditor) els.pedidoContratoEditor.hidden = true;
  if(els.btnEditarContratoPedido) els.btnEditarContratoPedido.textContent = "Editar texto deste pedido";
  await recalcularContrato({ forceModelo: true });
  const pedidoId = window.__PEDIDO_ATUAL_ID;
  if(pedidoId) await salvarContratoPedido(pedidoId);
}

function abrirModal(){
  if(!els.pedidoContratoModal) return;
  if(els.pedidoContratoModalTexto) els.pedidoContratoModalTexto.innerHTML = textoParaHtml(state.conteudoFinal || "");
  els.pedidoContratoModal.classList.remove("hidden");
}

function fecharModal(){
  els.pedidoContratoModal?.classList.add("hidden");
}

function imprimirContrato(){
  const win = window.open("", "_blank", "width=900,height=700");
  if(!win) return;
  win.document.write(`
    <html>
      <head>
        <title>Contrato de Locação</title>
        <style>
          body{font-family:Arial,sans-serif;color:#1f2937;line-height:1.65;padding:36px;}
          h1{font-size:22px;margin-bottom:24px;}
        </style>
      </head>
      <body>
        <h1>Contrato de Locação</h1>
        <div>${textoParaHtml(state.conteudoFinal || "")}</div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function gerarPdfPlaceholder(){
  notify("A estrutura para PDF está pronta. A geração dedicada será conectada ao serviço de PDF do sistema.", "Contrato", "info");
}

async function validarStatusContrato(status){
  const statusAlvo = String(status || "").toLowerCase();
  if(!["aprovado", "finalizado", "enviado"].includes(statusAlvo)) return true;
  if(!state.carregado) await inicializarDadosContrato();
  if(!state.valido){
    notify("Cadastre um modelo padrão em Comercial > Contratos antes de aprovar ou finalizar o pedido.", "Contrato obrigatório", "aviso");
    return false;
  }
  return true;
}

async function inicializarDadosContrato(){
  await carregarModeloPadrao();
  await carregarContratoPedido();
  await recalcularContrato();
  state.carregado = true;
}

function bindEvents(){
  els.btnEditarContratoPedido?.addEventListener("click", alternarEdicao);
  els.btnRestaurarContratoPadrao?.addEventListener("click", restaurarPadrao);
  els.btnVisualizarContratoPedido?.addEventListener("click", abrirModal);
  els.btnImprimirContratoPedido?.addEventListener("click", imprimirContrato);
  els.btnGerarPdfContratoPedido?.addEventListener("click", gerarPdfPlaceholder);
  els.btnFecharContratoModal?.addEventListener("click", fecharModal);
  els.btnFecharContratoModalFooter?.addEventListener("click", fecharModal);
  els.btnImprimirContratoModal?.addEventListener("click", imprimirContrato);
  els.btnGerarPdfContratoModal?.addEventListener("click", gerarPdfPlaceholder);
  els.pedidoContratoModal?.addEventListener("click", (event) => {
    if(event.target === els.pedidoContratoModal) fecharModal();
  });

  const atualizar = debounce(() => {
    if(!state.conteudoEditado) recalcularContrato();
  }, 300);

  document.querySelector(".pedido-screen")?.addEventListener("input", (event) => {
    if(event.target.closest("#pedidoContratoEditor")) return;
    atualizar();
  });
  document.querySelector(".pedido-screen")?.addEventListener("change", atualizar);

  const observer = new MutationObserver(atualizar);
  ["listaItens", "cronogramaParcelas", "localObservacoes", "localTagsInline"].forEach((id) => {
    const node = $(id);
    if(node) observer.observe(node, { childList: true, subtree: true, characterData: true });
  });
  window.__pedidoContratoObserver = observer;
}

export async function initContratoPedido({ supabase, avisar } = {}){
  state.supabase = supabase || window.supabaseClient;
  state.empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
  state.avisar = avisar;
  cacheEls();
  if(!els.pedidoContratoCard || !state.supabase || !state.empresaId) return;
  bindEvents();
  await inicializarDadosContrato();
  window.lucide?.createIcons?.();

  window.__pedidoPodeAlterarStatus = validarStatusContrato;
  window.__pedidoContratoPodeSalvarStatus = validarStatusContrato;
  window.__pedidoContratoAtualizar = () => recalcularContrato();
  window.__pedidoContratoRecarregar = async () => {
    await carregarContratoPedido();
    await recalcularContrato();
  };
  window.__pedidoSalvarContratoFinal = async (pedidoId, status = "") => {
    const ok = await validarStatusContrato(status || "aprovado");
    if(!ok) return false;
    await recalcularContrato();
    return salvarContratoPedido(pedidoId, { final: true });
  };
}

export function destroyContratoPedido(){
  window.__pedidoContratoObserver?.disconnect?.();
  delete window.__pedidoContratoObserver;
  delete window.__pedidoPodeAlterarStatus;
  delete window.__pedidoContratoPodeSalvarStatus;
  delete window.__pedidoContratoAtualizar;
  delete window.__pedidoContratoRecarregar;
  delete window.__pedidoSalvarContratoFinal;
}
