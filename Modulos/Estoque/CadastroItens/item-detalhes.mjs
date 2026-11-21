import { getEmpresaAtualId, valorMoeda } from "./itens.api.mjs?v=20261115-qr-protegido";
import "./itens.modal.mjs?v=20261115-qr-protegido";
import { criarHistoricoQuantidades } from "./item-historico.mjs?v=20261115-movimentos3";
import { criarEditorComponentes } from "./kit-componentes.mjs?v=20261103-unificado";
import "./itens.foto.mjs?v=20261008-banco";
import "./itens.3d.mjs?v=20261005-otimizar";
import { initPatrimonios } from "./itens.patrimonios.mjs?v=20261115-somente-ver";

const supabase = window.supabaseClient;
let editorComponentes;
let salvandoDetalhes=false;
const urlParams = new URLSearchParams(window.location.search);
const itemIdFromUrl = urlParams.get("id");

const state = {
  itemId: window.__ITEM_DETALHE_ID || itemIdFromUrl || null,
  modo: window.__ITEM_DETALHE_MODO || (window.__ITEM_DETALHE_ID || itemIdFromUrl ? "editar" : "novo"),
  kit: urlParams.get("tipo") === "Kit",
  empresaId: null,
  item: null,
  loadedTabs: new Set(["dados"]),
};

const historicoQuantidades=criarHistoricoQuantidades({sb:supabase,contexto:()=>({empresaId:state.empresaId,itemId:state.itemId})});

function $(id){
  return document.getElementById(id);
}

function money(value){
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* 15/11/2026: custo, locação e reposição sempre em moeda; ao clicar vira número simples para digitar. */
const CAMPOS_MOEDA=["itensCusto","itensValorLocacao","itensValorReposicao"];
function moedaCampo(v){const n=valorMoeda(v);return String(v??"").trim()===""&&!n?"":money(n);}
function definirMoeda(id,valor){const el=$(id);if(el)el.value=valor==null||valor===""?"":money(valor);}
document.addEventListener("focusin",e=>{if(!CAMPOS_MOEDA.includes(e.target?.id))return;const el=e.target;const n=valorMoeda(el.value);el.value=el.value.trim()?n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}):"";requestAnimationFrame(()=>el.select?.());});
document.addEventListener("focusout",e=>{if(!CAMPOS_MOEDA.includes(e.target?.id))return;e.target.value=moedaCampo(e.target.value);});

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
  window.location.href = "cadastro-itens.html";
}

function configurarKit(ativo){
  state.kit=ativo;
  document.querySelector('[data-item-tab="componentes"]').hidden=!ativo;
  document.querySelector('[data-item-tab="kits"]').hidden=ativo;
  document.querySelectorAll('.item-tipo-toggle-row .tipo-btn').forEach(btn=>{
    const kit=btn.id==='itemTipoKit';btn.hidden=ativo?!kit:kit;
    btn.classList.toggle('active',ativo?kit:(!kit&&btn.textContent.trim()===(state.item?.tipo||'Item')));
  });
}
async function carregarComponentes(){
  if(!state.kit)return;
  editorComponentes=criarEditorComponentes({sb:supabase,empresaId:state.empresaId,kitId:state.itemId,onAlterar:totais=>{
    for(const [campo,valor] of [['itensCusto',totais.custo],['itensValorLocacao',totais.valor_locacao],['itensValorReposicao',totais.valor_reposicao]])definirMoeda(campo,valor);
    atualizarResumo();
  }});
  await editorComponentes.carregar();
}

function statusDoItem(item = state.item){
  const inativo = item?.status === "Inativo" || item?.ativo === false;
  return inativo ? "Inativo" : "Ativo";
}

function resetarFormularioNovo(){
  window.CXCadastro?.preencher('item',{});
  window.CapasCadastro?.mostrar(null);
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

  carregarTabelasPreco(null);
  atualizarResumo();
}

function preencherFormulario(item){
  if(!item) return resetarFormularioNovo();
  window.CXCadastro?.preencher('item',item.complexidade);

  window.itemAtualId = item.id;
  window.CapasCadastro?.mostrar(item);
  window.itemAtualQrCode = item.qr_code || null;

  $("itensId").value = item.id || "";
  $("itensCodigo").value = item.codigo || "";
  $("itensProdutoBase").value = item.produto_base || "";
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
  definirMoeda("itensCusto", item.custo);
  definirMoeda("itensValorLocacao", item.valor_locacao);
  definirMoeda("itensValorReposicao", item.valor_reposicao);

  $("itensReferencia").value = item.referencia || "";
  $("itensMarcaModelo").value = item.marca_modelo || "";
  $("itensSubcategoria").value = item.subcategoria || "";
  { const g = $("itensGrupoSeparacao"), v = item.grupo_separacao || "";
    if(v && ![...g.options].some(o => o.value === v)) g.add(new Option(v + " (fora da lista)", v));
    g.value = v; }
  $("itensEstilo").value = item.estilo || "";
  $("itensEstoqueTotal").value = item.estoque_total ?? "";
  $("itensFornecedor").value = item.fornecedor_id || "";
  $("itensCapaCategoria").value = item.capa_categoria ? "true" : "false";
  $("itensLocarSomenteKit").value = item.locar_somente_kit ? "true" : "false";
  $("itensExclusivo").value = item.exclusivo ? "true" : "false";

  carregarTabelasPreco(item.id);

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
    getValor("itensProdutoBase"),
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

  // 15/11/2026: no topo, o nome numa linha e as medidas "(L) … (A) … (P) …" na linha de baixo
  { const t = $("itemDetailTitle");
    if(t){
      const m = nome.match(/\s*(\(L\)[\s\S]*)$/);
      const so = m ? nome.slice(0, m.index).trim() : nome;
      const sig = ["L","A","P"].map((l,i)=>{ const v=[getValor("itensLargura"),getValor("itensAltura"),getValor("itensProfundidade")][i]; return v ? `(${l}) ${v} m` : ""; }).filter(Boolean).join(" ");
      const med = m ? m[1].trim() : sig;
      t.replaceChildren(document.createTextNode(so || nome));
      if(med){ const sp=document.createElement("span"); sp.className="item-detail-medidas"; sp.textContent=med; t.append(sp); }
      t.setAttribute("title", nome);
    } }
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
  setText("itemResumoCusto", money(valorMoeda(getValor("itensCusto"))));
  setText("itemResumoLocacao", money(valorMoeda(getValor("itensValorLocacao"))));
  setText("itemResumoReposicao", money(valorMoeda(getValor("itensValorReposicao"))));
}

async function carregarFornecedoresParaSelect(){
  const select = $("itensFornecedor");
  if(!select) return;

  const { data, error } = await supabase
    .from("fornecedores")
    .select("id,nome_razao_social,nome_fantasia")
    .eq("empresa_id", state.empresaId)
    .order("nome_razao_social", { ascending: true });

  if(error){
    console.error("Erro ao carregar fornecedores:", error);
    return;
  }

  const valorAtual = select.value;
  select.innerHTML = '<option value="">Selecione</option>' + (data || [])
    .map((f) => `<option value="${f.id}">${(f.nome_fantasia || f.nome_razao_social || "").replace(/[&<>"']/g, "")}</option>`)
    .join("");
  if(valorAtual) select.value = valorAtual;
}

/* 15/11/2026: grupos de separação vêm do cadastro em Parâmetros > Logística e operação > Triagem e conferência. */
async function carregarGruposSeparacao(){
  const select = $("itensGrupoSeparacao");
  if(!select) return;
  const { data, error } = await supabase.from("separacao_grupos").select("nome,ativo").eq("empresa_id", state.empresaId).order("ordem").order("nome");
  if(error){ console.error("Erro ao carregar grupos de separação:", error); return; }
  const valorAtual = select.value || state.item?.grupo_separacao || "";
  const esc = v => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nomes = (data || []).filter(g => g.ativo).map(g => g.nome);
  if(valorAtual && !nomes.some(n => n.toLowerCase() === valorAtual.toLowerCase())) nomes.push(valorAtual);
  select.innerHTML = '<option value="">Selecione</option>' + nomes.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
    + (nomes.length ? "" : '<option value="" disabled>Cadastre os grupos em Parâmetros &gt; Triagem e conferência</option>');
  if(valorAtual) select.value = nomes.find(n => n.toLowerCase() === valorAtual.toLowerCase()) || "";
}

function formatarVigencia(tabela){
  if(!tabela.vigencia_inicio && !tabela.vigencia_fim) return "-";
  // Monta a data a partir das partes (YYYY-MM-DD) em vez de `new Date(d)`,
  // que interpretaria a data como meia-noite UTC e poderia exibir o dia
  // anterior dependendo do fuso horário de quem está vendo a tela.
  const fmt = (d) => { if (!d) return "?"; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  return `${fmt(tabela.vigencia_inicio)} a ${fmt(tabela.vigencia_fim)}`;
}

async function carregarTabelasPreco(itemId){
  const corpo = $("itensTabelasPrecoBody");
  if(!corpo) return;

  if(!itemId){
    corpo.innerHTML = '<tr><td colspan="5">Salve o item para ver os preços por tabela.</td></tr>';
    return;
  }

  const { data, error } = await supabase
    .from("itens_precos")
    .select("valor_locacao, tabelas_preco:tabela_preco_id ( nome, ano_referencia, vigencia_inicio, vigencia_fim, ativa )")
    .eq("item_id", itemId)
    .order("tabela_preco_id", { ascending: false });

  if(error){
    console.error("Erro ao carregar tabelas de preco do item:", error);
    corpo.innerHTML = '<tr><td colspan="5">Não foi possível carregar os preços.</td></tr>';
    return;
  }

  if(!data || !data.length){
    corpo.innerHTML = '<tr><td colspan="5">Este item ainda não tem preço em nenhuma tabela.</td></tr>';
    return;
  }

  corpo.innerHTML = data.map((linha) => {
    const tabela = linha.tabelas_preco || {};
    return `<tr>
      <td>${(tabela.nome || "-").replace(/[&<>"']/g, "")}</td>
      <td>${tabela.ano_referencia ?? "-"}</td>
      <td>${formatarVigencia(tabela)}</td>
      <td>${tabela.ativa ? '<span class="item-tabela-preco-ativa">Ativa</span>' : "Inativa"}</td>
      <td>${money(linha.valor_locacao)}</td>
    </tr>`;
  }).join("");
}

async function carregarItem(){
  state.empresaId = await getEmpresaAtualId();
  await Promise.all([carregarFornecedoresParaSelect(), carregarGruposSeparacao()]);

  if(!state.itemId){
    state.modo = "novo";
    resetarFormularioNovo();
    configurarKit(state.kit);
    if(state.kit)$("itensSetor").value="Kits";
    await carregarComponentes();
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
    notify("Não foi possível carregar este item.", "erro");
    voltarParaItens();
    return;
  }

  state.item = data;
  preencherFormulario(data);
  configurarKit(data.tipo === "Kit");
  await carregarComponentes();
  window.finalizarCarregamentoModulo?.();
}

function abrirAba(tab){
  document.querySelectorAll(".item-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.itemTab === tab);
  });
  document.querySelectorAll(".item-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.itemPanel === tab);
  });

  if(tab === "historico")historicoQuantidades.carregar().catch(error=>notify(error.message,"erro"));
  if(tab !== "historico" && !state.loadedTabs.has(tab)){
    state.loadedTabs.add(tab);
    carregarAbaSobDemanda(tab).catch((error) => console.error("Erro ao carregar aba:", tab, error));
  }

  if(tab === "qrcode"){
    window.itens_setQrVisual?.(window.itemAtualQrCode || null);
  }

  window.lucide?.createIcons?.();
}

/* 15/11/2026: "3D com IA" é uma aba: a tela de criação abre aqui dentro (iframe), na área das outras abas. */
function carregarIa3d(){
  const host = $("itemIa3dHost");
  if(!host) return;
  const itemId = state.itemId || window.itemAtualId;
  if(!itemId){ host.innerHTML = '<p class="item-ia3d-aviso">Salve o item antes de criar o modelo 3D com IA.</p>'; state.loadedTabs.delete("ia3d"); return; }
  if(host.querySelector("iframe")) return;
  const frame = document.createElement("iframe");
  frame.className = "item-ia3d-frame";
  frame.title = "Criar modelo 3D com IA";
  frame.src = `item-modelo-3d.html?id=${encodeURIComponent(itemId)}&embutido=1`;
  frame.addEventListener("load", () => {
    try{
      const doc = frame.contentDocument;
      const ajustar = () => { frame.style.height = Math.max(640, doc.documentElement.scrollHeight) + "px"; };
      ajustar(); new ResizeObserver(ajustar).observe(doc.body);
    }catch(_){}
  });
  host.replaceChildren(frame);
}
window.addEventListener("message", (e) => {
  if(e.origin !== window.location.origin || e.data?.origem !== "ia3d") return;
  if(e.data.tipo === "salvo") window.itens_3d_init?.({ itemId: state.itemId || window.itemAtualId, empresaId: state.empresaId });
  if(e.data.tipo === "voltar") abrirAba("dados");
});

async function carregarAbaSobDemanda(tab){
  if(tab === "ia3d") return carregarIa3d();
  if(tab === "historico") return historicoQuantidades.carregar();
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
    body.innerHTML = `<tr><td colspan="4">Este item ainda não está vinculado a kits.</td></tr>`;
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
  if(salvandoDetalhes)return;
  salvandoDetalhes=true;const botao=$("btnSalvarItemDetalhes");botao.disabled=true;
  try{
    if(state.kit)editorComponentes?.validar();
    if(state.kit&&!editorComponentes)throw Error('Aguarde o carregamento dos componentes.');
    const result=await window.itens_salvar?.();if(result===false)return;
    if(state.kit)await editorComponentes.salvar(window.itemAtualId);
    // aba 3D com IA: o Salvar do topo também grava o modelo gerado/ajustado que ainda não foi salvo
    const ia3d=document.querySelector("#itemIa3dHost iframe")?.contentWindow;
    if(ia3d?.ia3dSalvarPendente){ const ok=await ia3d.ia3dSalvarPendente(); if(ok===false) throw Error("O item foi salvo, mas o modelo 3D não. Confira a aba 3D com IA."); }
    atualizarResumo();notify(state.kit?'Kit salvo com sucesso.':'Item salvo com sucesso.',"sucesso");
    if(state.modo==="novo")voltarParaItens();
  }catch(error){notify(error.message,'erro');}
  finally{salvandoDetalhes=false;botao.disabled=false;}
}

function bindEvents(){
  window.itens_3d_criarComIA = () => abrirAba("ia3d");
  $("btnVoltarItens")?.addEventListener("click", voltarParaItens);
  $("btnSalvarItemDetalhes")?.addEventListener("click", salvarDetalhes);

  document.querySelectorAll(".item-tab").forEach((button) => {
    button.addEventListener("click", () => abrirAba(button.dataset.itemTab));
  });

  document.querySelector(".item-detail-page")?.addEventListener("input", (event) => {
    const ids = [
      "itensProdutoBase",
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
  try{await carregarItem();}
  catch(error){notify('Não foi possível carregar o cadastro: '+error.message,'erro');window.finalizarCarregamentoModulo?.();}
  initPatrimonios();
  window.lucide?.createIcons?.();
}

export function destroyItemDetalhes(){
  window.itens_3d_destroy?.();
  window.__ITEM_DETALHE_ID = null;
  window.__ITEM_DETALHE_MODO = null;
}

window.__activeModuleDestroy = destroyItemDetalhes;
requestAnimationFrame(() => requestAnimationFrame(initItemDetalhes));
