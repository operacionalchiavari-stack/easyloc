/* Item de sublocação (nov/2026): página no formato do item do Cadastro de Itens.
   ?id=<item>  abre um item; ?novo=1&empresa=<fornecedor> começa um novo.
   Dados em terceirizacao_itens (RLS: ler comercial.pedidos.visualizar, gravar comercial.pedidos.editar).
   Fotos (principal + fotos.detalhe_01/02 + fotos.galeria_01/02/03) e o GLB vão para o bucket itens, em
   <empresa>/terceirizados/<item>/. Nada é gravado antes de "Salvar". */
import { otimizarGlb } from "../../Estoque/CadastroItens/glb-otimizar.mjs?v=20261005";

const SEM_FOTO = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgMjQwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2YxZjJmNCIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2M3Y2JkMSIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjYwIiB5PSI2OCIgd2lkdGg9IjEyMCIgaGVpZ2h0PSI5MCIgcng9IjgiLz48Y2lyY2xlIGN4PSI5MCIgY3k9Ijk2IiByPSIxMCIvPjxwYXRoIGQ9Ik02MCAxNDMgTDEwMCAxMTMgTDEzMCAxMzggTDE1NSAxMTYgTDE4MCAxNDMiLz48L2c+PHRleHQgeD0iMTIwIiB5PSIxODIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOWFhMGE4Ij5TZW0gZm90bzwvdGV4dD48L3N2Zz4=";
const SLOTS = { principal: "Foto principal", detalhe_01: "Detalhe 01", detalhe_02: "Detalhe 02", galeria_01: "Galeria 01", galeria_02: "Galeria 02", galeria_03: "Galeria 03" };
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => { const t = String(v ?? "").trim(); if (!t) return 0; return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0; };
const vg = (n) => (n == null || n === "" ? "" : String(n).replace(".", ","));
const dinheiro = (n) => (Number(n) ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const params = new URLSearchParams(location.search);
const S = { sb: null, emp: null, id: params.get("id") || null, item: null, pode: false, ativo: true,
  // por slot: { url (atual no banco), path, arquivo (novo), remover }
  fotos: {}, modelo: { url: null, path: null, nome: null, tamanho: null, arquivo: null, remover: false }, girando: true, salvando: false };

function avisar(msg, tipo = "aviso") { window.alerta ? window.alerta(msg, "Sublocações", tipo) : alert(msg); }
function campo(n) { return document.querySelector('[name="' + n + '"]'); }
function voltar() {
  const emp = campo("fornecedor_id")?.value || S.item?.fornecedor_id || params.get("empresa") || "";
  location.href = "terceirizacoes.html" + (emp ? "?empresa=" + encodeURIComponent(emp) : "");
}

/* ---------- fotos ---------- */
function urlSlot(slot) { const f = S.fotos[slot] || {}; return f.arquivo ? (f.preview ||= URL.createObjectURL(f.arquivo)) : (f.remover ? null : f.url); }
function cartaoGaleria(slot) {
  return '<section class="item-photo-card item-gallery-photo-card"><div class="item-photo-card-title">' + SLOTS[slot] + '</div>' +
    '<div class="item-detail-photo-frame item-gallery-photo-frame"><img data-slot-img="' + slot + '" alt="' + SLOTS[slot] + '">' +
    '<input type="file" accept="image/*" data-slot-input="' + slot + '" hidden></div>' +
    '<div class="item-photo-actions"><button class="btn-foto-action" type="button" data-slot-escolher="' + slot + '">Adicionar</button>' +
    '<button class="btn-foto-action danger" type="button" data-slot-remover="' + slot + '">Remover</button></div></section>';
}
function pintarFotos() {
  for (const slot of Object.keys(SLOTS)) {
    const img = slot === "principal" ? $("subFotoPrincipal") : document.querySelector('[data-slot-img="' + slot + '"]');
    if (!img) continue;
    const url = urlSlot(slot);
    img.src = url || SEM_FOTO;
    img.classList.toggle("is-vazia", !url);
    const add = document.querySelector('[data-slot-escolher="' + slot + '"]');
    if (add) add.textContent = url ? "Alterar" : "Adicionar";
    const rem = document.querySelector('[data-slot-remover="' + slot + '"]');
    if (rem) rem.hidden = !url;
  }
}

/* ---------- 3D ---------- */
function pintar3D() {
  const host = $("sub3DHost");
  const m = S.modelo;
  const url = m.arquivo ? (m.preview ||= URL.createObjectURL(m.arquivo)) : (m.remover ? null : m.url);
  let viewer = host.querySelector("model-viewer");
  if (!url) { viewer?.remove(); }
  else {
    if (!viewer) {
      viewer = document.createElement("model-viewer");
      viewer.setAttribute("camera-controls", ""); viewer.setAttribute("shadow-intensity", "0.6"); viewer.setAttribute("interaction-prompt", "none");
      viewer.className = "subloc-viewer";
      viewer.addEventListener("load", () => { $("sub3DCarregando").hidden = true; });
      viewer.addEventListener("error", () => { $("sub3DCarregando").hidden = true; $("sub3DStatus").textContent = "Não abriu"; });
      host.appendChild(viewer);
    }
    if (viewer.getAttribute("src") !== url) { $("sub3DCarregando").hidden = false; viewer.setAttribute("src", url); }
    if (S.girando) viewer.setAttribute("auto-rotate", ""); else viewer.removeAttribute("auto-rotate");
  }
  $("sub3DVazio").hidden = !!url;
  const st = $("sub3DStatus");
  st.textContent = m.arquivo ? "Novo (salve para gravar)" : url ? "Modelo enviado" : "Sem modelo";
  st.classList.toggle("sem-modelo", !url);
  const tam = m.arquivo ? m.arquivo.size : m.tamanho;
  $("sub3DNome").textContent = url ? (m.arquivo?.name || m.nome || "modelo.glb") + (tam ? " · " + (tam / 1048576).toFixed(1).replace(".", ",") + " MB" : "") : "-";
  $("sub3DGirar").classList.toggle("is-on", S.girando);
}

/* ---------- formulário ---------- */
function calcular() {
  const l = num(campo("largura").value), a = num(campo("altura").value), p = num(campo("profundidade").value);
  $("subVolume").value = l && a && p ? (l * a * p).toFixed(3).replace(".", ",") : "";
  const custo = num(campo("custo").value), valor = num(campo("valor_locacao").value);
  $("subMargem").textContent = valor > 0 ? Math.round(((valor - custo) / valor) * 100) + "%" : "—";
}
function setStatus(ativo) {
  S.ativo = ativo;
  document.querySelectorAll(".status-btn").forEach((b) => b.classList.toggle("active", (b.dataset.ativo === "true") === ativo));
}
function preencher(i, empresas) {
  campo("fornecedor_id").innerHTML = empresas.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.nome) + "</option>").join("");
  campo("fornecedor_id").value = i.fornecedor_id || params.get("empresa") || empresas[0]?.id || "";
  for (const n of ["produto_base", "produto", "codigo", "marca_modelo", "material", "cor", "descricao", "categoria", "subcategoria", "familia", "estilo", "observacoes"]) campo(n).value = i[n] || "";
  for (const n of ["largura", "altura", "profundidade"]) campo(n).value = vg(i[n]);
  for (const n of ["custo", "valor_locacao", "valor_reposicao"]) campo(n).value = dinheiro(i[n]);
  campo("quantidade").value = Number(i.quantidade) || 0;
  campo("exibir_site").value = String(!!i.exibir_site);
  campo("destaque_site").value = String(!!i.destaque_site);
  setStatus(i.ativo !== false);
  S.fotos = { principal: { url: i.foto_url || null, path: i.foto_path || null } };
  for (const slot of Object.keys(SLOTS)) if (slot !== "principal") S.fotos[slot] = { url: i.fotos?.[slot]?.url || null, path: i.fotos?.[slot]?.path || null };
  S.modelo = { url: i.modelo_3d_url || null, path: i.modelo_3d_path || null, nome: i.modelo_3d_nome || null, tamanho: i.modelo_3d_tamanho || null, arquivo: null, remover: false };
  $("itemDetailTitle").textContent = i.produto || "Novo item de sublocação";
  document.title = "Acervo - " + (i.produto || "Novo item de sublocação");
  calcular(); pintarFotos(); pintar3D();
}

async function subir(caminho, arquivo) {
  const up = await S.sb.storage.from("itens").upload(caminho, arquivo, { upsert: true, contentType: arquivo.type || "application/octet-stream" });
  if (up.error) throw up.error;
  return S.sb.storage.from("itens").getPublicUrl(caminho).data.publicUrl;
}
const extensao = (f, padrao) => ((f.name || "").split(".").pop() || padrao).toLowerCase().replace(/[^a-z0-9]/g, "") || padrao;

async function salvar() {
  if (S.salvando || !S.pode) return;
  const v = (n) => campo(n).value.trim();
  const dados = {
    empresa_id: S.emp, fornecedor_id: v("fornecedor_id"), produto: v("produto"), produto_base: v("produto_base") || null,
    codigo: v("codigo") || null, marca_modelo: v("marca_modelo") || null, material: v("material") || null, cor: v("cor") || null, descricao: v("descricao") || null,
    categoria: v("categoria") || null, subcategoria: v("subcategoria") || null, familia: v("familia") || null, estilo: v("estilo") || null,
    largura: v("largura") ? num(v("largura")) : null, altura: v("altura") ? num(v("altura")) : null, profundidade: v("profundidade") ? num(v("profundidade")) : null,
    custo: Math.max(0, num(v("custo"))), valor_locacao: Math.max(0, num(v("valor_locacao"))), valor_reposicao: Math.max(0, num(v("valor_reposicao"))),
    quantidade: Math.max(0, Math.round(num(v("quantidade")))), exibir_site: v("exibir_site") === "true", destaque_site: v("destaque_site") === "true",
    observacoes: v("observacoes") || null, ativo: S.ativo,
  };
  if (!dados.produto) { avisar("Informe a especificação (nome do item)."); campo("produto").focus(); return; }
  if (!dados.fornecedor_id) { avisar("Escolha a empresa."); return; }
  S.salvando = true; $("btnSalvarItemDetalhes").disabled = true;
  const apagar = [];
  try {
    let id = S.id;
    if (id) { const { error } = await S.sb.from("terceirizacao_itens").update(dados).eq("id", id).eq("empresa_id", S.emp); if (error) throw error; }
    else { const { data, error } = await S.sb.from("terceirizacao_itens").insert(dados).select("id").single(); if (error) throw error; id = data.id; }
    const pasta = S.emp + "/terceirizados/" + id + "/";
    const extra = {}, fotos = {};
    for (const [slot, f] of Object.entries(S.fotos)) {
      let url = f.url, path = f.path;
      if (f.arquivo) { const novo = pasta + slot + "-" + Date.now() + "." + extensao(f.arquivo, "jpg"); url = await subir(novo, f.arquivo); if (path) apagar.push(path); path = novo; }
      else if (f.remover) { if (path) apagar.push(path); url = null; path = null; }
      if (slot === "principal") { extra.foto_url = url; extra.foto_path = path; }
      else if (url) fotos[slot] = { url, path };
    }
    extra.fotos = fotos;
    const m = S.modelo;
    if (m.arquivo) {
      $("sub3DStatus").textContent = "Otimizando o modelo…";
      let arquivo = m.arquivo;
      try { const r = await otimizarGlb(m.arquivo, { onEtapa: (t) => { $("sub3DStatus").textContent = t; } }); if (r?.arquivo) arquivo = r.arquivo; } catch (_) {}
      const novo = pasta + "modelo-" + Date.now() + ".glb";
      const url = await subir(novo, new File([arquivo], m.arquivo.name || "modelo.glb", { type: "model/gltf-binary" }));
      if (m.path) apagar.push(m.path);
      Object.assign(extra, { modelo_3d_url: url, modelo_3d_path: novo, modelo_3d_nome: m.arquivo.name || "modelo.glb", modelo_3d_tamanho: arquivo.size });
    } else if (m.remover) {
      if (m.path) apagar.push(m.path);
      Object.assign(extra, { modelo_3d_url: null, modelo_3d_path: null, modelo_3d_nome: null, modelo_3d_tamanho: null });
    }
    const { error } = await S.sb.from("terceirizacao_itens").update(extra).eq("id", id).eq("empresa_id", S.emp);
    if (error) throw error;
    if (apagar.length) S.sb.storage.from("itens").remove(apagar).catch(() => {});
    const novoItem = !S.id;
    S.id = id;
    if (novoItem) history.replaceState(null, "", "sublocacao-item.html?id=" + encodeURIComponent(id));
    await carregar();
    avisar("Item salvo.", "sucesso");
  } catch (err) {
    avisar("Não foi possível salvar: " + (err.message || err), "erro");
    pintar3D();
  } finally { S.salvando = false; $("btnSalvarItemDetalhes").disabled = !S.pode; }
}

async function carregar() {
  const { data: emps, error: e1 } = await S.sb.rpc("terceirizacao_empresas", { p_empresa: S.emp });
  if (e1) throw e1;
  let item = { ativo: true, quantidade: 0 };
  if (S.id) {
    const { data, error } = await S.sb.from("terceirizacao_itens").select("*").eq("id", S.id).eq("empresa_id", S.emp).single();
    if (error || !data) throw new Error("Item não encontrado.");
    item = data;
  }
  // Empresas de sublocação + a do próprio item (mesmo que tenha saído das sublocações).
  const atual = item.fornecedor_id || params.get("empresa");
  const empresas = (emps || []).filter((e) => e.terceirizacao || e.id === atual);
  S.item = S.id ? item : null;
  preencher(item, empresas);
}

function ligar() {
  $("btnVoltarItens").addEventListener("click", voltar);
  $("btnSalvarItemDetalhes").addEventListener("click", salvar);
  document.querySelectorAll(".item-tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".item-tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".item-tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.itemPanel === b.dataset.itemTab));
  }));
  document.querySelectorAll(".status-btn").forEach((b) => b.addEventListener("click", () => setStatus(b.dataset.ativo === "true")));
  ["largura", "altura", "profundidade", "custo", "valor_locacao"].forEach((n) => campo(n).addEventListener("input", calcular));
  campo("produto").addEventListener("input", () => { $("itemDetailTitle").textContent = campo("produto").value.trim() || "Novo item de sublocação"; });
  document.addEventListener("click", (e) => {
    const esc_ = e.target.closest("[data-slot-escolher]");
    if (esc_) { document.querySelector('[data-slot-input="' + esc_.dataset.slotEscolher + '"]')?.click(); return; }
    const rem = e.target.closest("[data-slot-remover]");
    if (rem) { const f = S.fotos[rem.dataset.slotRemover] ||= {}; f.arquivo = null; f.preview = null; f.remover = true; pintarFotos(); }
  });
  document.addEventListener("change", (e) => {
    const inp = e.target.closest("[data-slot-input]"); if (!inp) return;
    const arq = inp.files?.[0]; inp.value = ""; if (!arq) return;
    if (!/^image\//.test(arq.type) || arq.size > 15 * 1024 * 1024) { avisar("Escolha uma imagem de até 15 MB."); return; }
    const f = S.fotos[inp.dataset.slotInput] ||= {}; f.arquivo = arq; f.preview = null; f.remover = false; pintarFotos();
  });
  $("sub3DEnviar").addEventListener("click", () => $("sub3DInput").click());
  $("sub3DInput").addEventListener("change", (e) => {
    const arq = e.target.files?.[0]; e.target.value = ""; if (!arq) return;
    if (!/\.glb$/i.test(arq.name)) { avisar("Envie um arquivo .glb."); return; }
    if (arq.size > 100 * 1024 * 1024) { avisar("O modelo precisa ter até 100 MB."); return; }
    S.modelo.arquivo = arq; S.modelo.preview = null; S.modelo.remover = false; pintar3D();
  });
  $("sub3DGirar").addEventListener("click", () => { S.girando = !S.girando; pintar3D(); });
  $("sub3DResetar").addEventListener("click", () => { const v = $("sub3DHost").querySelector("model-viewer"); if (v) { v.cameraOrbit = "auto auto auto"; v.fieldOfView = "auto"; v.jumpCameraToGoal?.(); } });
  $("sub3DTelaCheia").addEventListener("click", () => { const h = $("sub3DHost"); if (document.fullscreenElement) document.exitFullscreen(); else h.requestFullscreen?.(); });
  $("sub3DRemover").addEventListener("click", () => { S.modelo.arquivo = null; S.modelo.preview = null; S.modelo.remover = true; pintar3D(); });
}

async function iniciar() {
  S.sb = window.supabaseClient;
  const ctx = await window.aguardarContexto?.();
  S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
  try { await window.EasyLocPermissions?.load?.(); } catch (_) {}
  S.pode = window.EasyLocPermissions?.hasPermission?.("comercial.pedidos.editar") !== false;
  document.querySelectorAll("[data-galeria]").forEach((g) => { g.innerHTML = g.dataset.galeria.split(",").map(cartaoGaleria).join(""); });
  ligar();
  window.lucide?.createIcons?.();
  if (!S.pode) { $("btnSalvarItemDetalhes").disabled = true; document.querySelectorAll("#subItemPage input, #subItemPage select, #subItemPage textarea").forEach((el) => (el.disabled = true)); }
  try { await carregar(); } catch (err) { avisar(err.message || String(err), "erro"); }
}
iniciar();
