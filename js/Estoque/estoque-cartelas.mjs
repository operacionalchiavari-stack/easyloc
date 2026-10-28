/* =====================================================
   ESTOQUE → PERSONALIZAÇÕES → CARTELAS (out/2026)
   Catálogos de tecidos e tintas dos fornecedores. Cada cartela tem opções (código, nome, cor, foto, preço por
   unidade e, se quiser, o material do Almoxarifado que ela consome). Na personalização, uma linha "escolhida pelo
   cliente" usa as cartelas do mesmo tipo; o cliente (catálogo) e o Comercial (pedido) escolhem a opção.
===================================================== */

const UNIDADES = ["m", "m²", "L", "lata", "galão", "kg", "un"];
const TIPOS_SUGERIDOS = ["Tecido", "Tinta"];

const C = {
  cartelas: [],
  fornecedores: [],
  materiais: [],
  atual: null,      // cartela aberta
  opcoes: [],       // opções da cartela aberta
  filtro: ""
};

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const dinheiro = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (v) => { const t = String(v ?? "").trim().replace(/\s|R\$/g, ""); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : NaN; };
const sb = () => window.supabaseClient;
const empresa = () => window.__CONTEXT?.empresa_id;

function aviso(msg, tipo = "aviso") {
  if (typeof window.alerta === "function") window.alerta(msg, tipo === "erro" ? "Erro" : "Atenção", tipo);
  else alert(msg);
}

function mensagemErro(err, padrao) {
  const m = String(err?.message || "");
  if (/row-level security|permission denied/i.test(m)) return "Você não tem permissão para alterar as cartelas (Estoque > Insumos: editar).";
  if (/duplicate key|cartela_opcoes_cartela_id_codigo_key/i.test(m)) return "Já existe uma opção com esse código nesta cartela.";
  return padrao;
}

async function iniciar() {
  const painel = document.getElementById("cartelasPainel");
  if (!painel) return;
  await window.aguardarContexto?.();
  ligarAbas();
  await Promise.all([carregarCartelas(), carregarFornecedores()]);
  pintarLista();
  painel.addEventListener("input", (e) => { if (e.target.matches("[data-cart-busca]")) { C.filtro = e.target.value; pintarCards(); } });
  painel.addEventListener("click", (e) => {
    if (e.target.closest("[data-cart-nova]")) return abrirCartela(null);
    const card = e.target.closest("[data-cart-id]");
    if (card && !e.target.closest("a")) abrirCartela(card.dataset.cartId);
  });
  const abaUrl = new URLSearchParams(location.search).get("aba");
  if (abaUrl === "cartelas") trocarAba("cartelas");
}

function ligarAbas() {
  document.querySelectorAll("[data-pers-aba]").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.persAba)));
}

function trocarAba(aba) {
  document.querySelectorAll("[data-pers-aba]").forEach((b) => {
    const ativa = b.dataset.persAba === aba;
    b.classList.toggle("is-ativa", ativa);
    b.setAttribute("aria-selected", ativa ? "true" : "false");
  });
  document.querySelectorAll("[data-pers-painel]").forEach((p) => p.classList.toggle("hidden", p.dataset.persPainel !== aba));
  const add = document.getElementById("btnAddPersonalizacao");
  if (add) add.classList.toggle("hidden", aba !== "personalizacoes");
  const h1 = document.querySelector(".personalizacoes-page .page-title h1");
  if (h1) h1.textContent = aba === "cartelas" ? "Cartelas de tecidos e tintas" : "Personalizações Cadastradas";
}

async function carregarCartelas() {
  const { data, error } = await sb().from("cartelas")
    .select("*, cartela_opcoes(id, foto_url, cor, ativo)")
    .eq("empresa_id", empresa())
    .order("tipo").order("nome");
  if (error) { console.error("erro ao carregar cartelas:", error); C.cartelas = []; return; }
  C.cartelas = data || [];
}

async function carregarFornecedores() {
  const { data } = await sb().from("fornecedores").select("id, nome_razao_social, nome_fantasia").eq("empresa_id", empresa()).order("nome_razao_social");
  C.fornecedores = (data || []).map((f) => ({ id: f.id, nome: String(f.nome_fantasia || f.nome_razao_social || "").trim() })).filter((f) => f.nome);
}

async function carregarMateriais() {
  if (C.materiais.length) return;
  const { data, error } = await sb().rpc("almox_produtos", { p_empresa_id: empresa() });
  if (error) { console.error("erro ao carregar materiais:", error); return; }
  C.materiais = (data || []).filter((i) => String(i.status || "").toLowerCase() !== "inativo")
    .map((i) => ({ id: i.id, nome: `${String(i.produto || "").trim()}${i.codigo ? ` (${i.codigo})` : ""}` }));
}

// ------------------------------------------------------------------ lista
function pintarLista() {
  const painel = document.getElementById("cartelasPainel");
  painel.innerHTML = `
    <div class="cart-topo">
      <input class="el-input cart-busca" type="search" data-cart-busca placeholder="Pesquisar cartela, tipo ou fornecedor..." autocomplete="off">
      <button type="button" class="btn primary" data-cart-nova>+ Nova cartela</button>
    </div>
    <p class="cart-ajuda">Cadastre aqui os catálogos de tecidos e tintas dos fornecedores. Na personalização, use
      <strong>Material escolhido pelo cliente</strong>: o cliente escolhe a opção no catálogo (e o Comercial no pedido), o preço
      muda conforme a opção e o pedido chega com o código.</p>
    <div class="cart-grid" data-cart-grid></div>`;
  pintarCards();
}

function pintarCards() {
  const grid = document.querySelector("[data-cart-grid]");
  if (!grid) return;
  const q = C.filtro.trim().toLowerCase();
  const lista = C.cartelas.filter((c) => !q || [c.nome, c.tipo, c.fornecedor_nome].some((t) => String(t || "").toLowerCase().includes(q)));
  if (!lista.length) {
    grid.innerHTML = `<div class="cart-vazio">${C.cartelas.length ? "Nenhuma cartela encontrada." : "Nenhuma cartela cadastrada ainda. Comece por <strong>+ Nova cartela</strong>."}</div>`;
    return;
  }
  grid.innerHTML = lista.map((c) => {
    const ops = (c.cartela_opcoes || []).filter((o) => o.ativo);
    const amostras = ops.slice(0, 8).map((o) => o.foto_url
      ? `<span class="cart-amostra" style="background-image:url('${esc(o.foto_url)}')"></span>`
      : `<span class="cart-amostra" style="background:${esc(o.cor || "#e3e7ec")}"></span>`).join("");
    return `<button type="button" class="cart-card${c.ativa ? "" : " is-inativa"}" data-cart-id="${c.id}">
      <span class="cart-card-topo"><span class="cart-tipo">${esc(c.tipo)}</span>${c.ativa ? "" : '<span class="cart-inativa">Inativa</span>'}</span>
      <strong class="cart-nome">${esc(c.nome)}</strong>
      <span class="cart-forn">${esc(c.fornecedor_nome || "Sem fornecedor")}</span>
      <span class="cart-amostras">${amostras || '<span class="cart-sem">Sem opções</span>'}</span>
      <span class="cart-rodape"><span>${ops.length} opç${ops.length === 1 ? "ão" : "ões"} · cobrado por ${esc(c.unidade)}</span>${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Catálogo do fornecedor ↗</a>` : ""}</span>
    </button>`;
  }).join("");
}

// ------------------------------------------------------------------ tela da cartela
async function abrirCartela(id) {
  C.atual = id ? C.cartelas.find((c) => c.id === id) || null : null;
  C.opcoes = [];
  if (C.atual) await carregarOpcoes();
  await carregarMateriais();
  document.querySelector(".personalizacao-list-view")?.classList.add("hidden");
  const tela = document.getElementById("cartelaDetalhe");
  tela.classList.remove("hidden");
  pintarDetalhe();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function fecharCartela() {
  document.getElementById("cartelaDetalhe").classList.add("hidden");
  document.querySelector(".personalizacao-list-view")?.classList.remove("hidden");
  carregarCartelas().then(pintarCards);
}

async function carregarOpcoes() {
  const { data, error } = await sb().from("cartela_opcoes").select("*").eq("cartela_id", C.atual.id).order("ordem").order("codigo");
  if (error) { console.error(error); aviso("Não foi possível carregar as opções da cartela.", "erro"); return; }
  C.opcoes = data || [];
}

function pintarDetalhe() {
  const tela = document.getElementById("cartelaDetalhe");
  const c = C.atual || { nome: "", tipo: "Tecido", fornecedor_nome: "", link: "", unidade: "m", ativa: true };
  const tipos = [...new Set([...TIPOS_SUGERIDOS, ...C.cartelas.map((x) => x.tipo)])];
  tela.innerHTML = `
    <div class="cart-det">
      <div class="cart-det-topo">
        <button type="button" class="back-btn btn-icon" data-cart-voltar title="Voltar para as cartelas">←</button>
        <h2>${C.atual ? esc(c.nome) : "Nova cartela"}</h2>
        ${C.atual ? '<button type="button" class="btn secondary cart-excluir" data-cart-excluir>Excluir cartela</button>' : ""}
        <button type="button" class="btn primary" data-cart-salvar>${C.atual ? "Salvar" : "Criar cartela"}</button>
      </div>

      <section class="cart-sec">
        <div class="cart-form">
          <label class="cart-campo cart-c-nome">Nome da cartela<input class="el-input" data-f="nome" value="${esc(c.nome)}" placeholder="Ex.: Linho Karsten 2026"></label>
          <label class="cart-campo">Tipo<input class="el-input" data-f="tipo" list="cartTipos" value="${esc(c.tipo)}" placeholder="Tecido, Tinta..."></label>
          <datalist id="cartTipos">${tipos.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
          <label class="cart-campo">Fornecedor<input class="el-input" data-f="fornecedor" list="cartFornecedores" value="${esc(c.fornecedor_nome || "")}" placeholder="Nome do fornecedor"></label>
          <datalist id="cartFornecedores">${C.fornecedores.map((f) => `<option value="${esc(f.nome)}">`).join("")}</datalist>
          <label class="cart-campo">Preço cobrado por<select class="el-select" data-f="unidade">${UNIDADES.map((u) => `<option${u === c.unidade ? " selected" : ""}>${u}</option>`).join("")}</select></label>
          <label class="cart-campo cart-c-link">Link do catálogo do fornecedor (opcional)<input class="el-input" data-f="link" value="${esc(c.link || "")}" placeholder="https://..."></label>
          <label class="cart-check"><input type="checkbox" data-f="ativa"${c.ativa ? " checked" : ""}> Cartela ativa (aparece para o cliente)</label>
        </div>
        <p class="cart-dica">O <strong>tipo</strong> liga a cartela à personalização: uma linha "Material escolhido pelo cliente" do tipo
          <em>Tecido</em> mostra todas as cartelas ativas de tipo Tecido.</p>
      </section>

      ${C.atual ? opcoesHtml() : '<p class="cart-dica">Crie a cartela para cadastrar as opções.</p>'}
    </div>`;
  ligarDetalhe(tela);
}

function opcoesHtml() {
  const u = C.atual.unidade;
  return `
    <section class="cart-sec">
      <div class="cart-sec-topo">
        <h3>Opções <span class="cart-cont">${C.opcoes.length}</span></h3>
        <div class="cart-sec-acoes">
          <button type="button" class="btn secondary" data-cart-colar>Colar da planilha</button>
          <label class="btn secondary cart-fotos-btn">Enviar fotos<input type="file" accept="image/*" multiple data-cart-fotos hidden></label>
          <button type="button" class="btn primary" data-cart-opcao-nova>+ Opção</button>
        </div>
      </div>
      <p class="cart-dica">Enviar fotos: o nome de cada arquivo precisa ser o código da opção (ex.: <em>LK-01.jpg</em>).
        O preço é por ${esc(u)}; no pedido ele é multiplicado pela quantidade da personalização e pela margem dela.</p>
      <datalist id="cartMateriais">${C.materiais.map((m) => `<option value="${esc(m.nome)}">`).join("")}</datalist>
      <div class="cart-tabela-wrap">
        <table class="data-table cart-tabela">
          <thead><tr><th style="width:70px">Foto</th><th style="width:120px">Código</th><th>Nome</th><th style="width:96px">Cor</th>
            <th style="width:140px">Preço por ${esc(u)}</th><th style="width:240px">Material do Almoxarifado</th><th style="width:70px">Ativa</th><th style="width:44px"></th></tr></thead>
          <tbody data-cart-opcoes>${C.opcoes.length ? C.opcoes.map(linhaOpcao).join("") : '<tr><td colspan="8" class="cart-vazio-linha">Nenhuma opção ainda.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
}

function linhaOpcao(o) {
  const mat = C.materiais.find((m) => m.id === o.almox_produto_id);
  return `<tr data-op="${o.id}">
    <td><label class="cart-foto" title="Trocar foto" style="${o.foto_url ? `background-image:url('${esc(o.foto_url)}')` : o.cor ? `background:${esc(o.cor)}` : ""}">${o.foto_url || o.cor ? "" : "+"}<input type="file" accept="image/*" data-op-foto hidden></label></td>
    <td><input class="el-input" data-op-f="codigo" value="${esc(o.codigo)}"></td>
    <td><input class="el-input" data-op-f="nome" value="${esc(o.nome)}"></td>
    <td class="cart-cor-cel"><input type="color" data-op-f="cor" value="${esc(o.cor || "#ffffff")}"${o.cor ? "" : ' data-vazio="1"'}>${o.cor ? '<button type="button" class="cart-limpar" data-op-sem-cor title="Sem cor">×</button>' : ""}</td>
    <td><input class="el-input" data-op-f="preco" inputmode="decimal" value="${esc(String(o.preco ?? 0).replace(".", ","))}"></td>
    <td><input class="el-input" data-op-f="material" list="cartMateriais" value="${esc(mat?.nome || o.almox_produto_id || "")}" placeholder="Não reserva estoque"></td>
    <td><input type="checkbox" data-op-f="ativo"${o.ativo ? " checked" : ""}></td>
    <td><button type="button" class="insumo-remove" data-op-excluir title="Excluir opção">✕</button></td>
  </tr>`;
}

function ligarDetalhe(tela) {
  tela.querySelector("[data-cart-voltar]").addEventListener("click", fecharCartela);
  tela.querySelector("[data-cart-salvar]").addEventListener("click", salvarCartela);
  tela.querySelector("[data-cart-excluir]")?.addEventListener("click", excluirCartela);
  tela.querySelector("[data-cart-opcao-nova]")?.addEventListener("click", novaOpcao);
  tela.querySelector("[data-cart-colar]")?.addEventListener("click", colarDaPlanilha);
  tela.querySelector("[data-cart-fotos]")?.addEventListener("change", (e) => enviarFotosEmLote([...e.target.files]));
  const corpo = tela.querySelector("[data-cart-opcoes]");
  if (!corpo) return;
  corpo.addEventListener("change", async (e) => {
    const tr = e.target.closest("tr[data-op]");
    if (!tr) return;
    if (e.target.matches("[data-op-foto]")) return trocarFoto(tr.dataset.op, e.target.files?.[0]);
    if (e.target.matches("[data-op-f]")) await salvarCampo(tr, e.target);
  });
  corpo.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-op]");
    if (!tr) return;
    if (e.target.closest("[data-op-excluir]")) return excluirOpcao(tr.dataset.op);
    if (e.target.closest("[data-op-sem-cor]")) { await atualizarOpcao(tr.dataset.op, { cor: null }); pintarDetalhe(); }
  });
}

async function salvarCartela() {
  const tela = document.getElementById("cartelaDetalhe");
  const v = (f) => tela.querySelector(`[data-f="${f}"]`);
  const nome = v("nome").value.trim(), tipo = v("tipo").value.trim();
  if (!nome) return aviso("Informe o nome da cartela.");
  if (!tipo) return aviso("Informe o tipo (Tecido, Tinta...).");
  const fornNome = v("fornecedor").value.trim();
  const forn = C.fornecedores.find((f) => f.nome.toLowerCase() === fornNome.toLowerCase());
  const dados = {
    empresa_id: empresa(), nome, tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1),
    fornecedor_id: forn?.id || null, fornecedor_nome: fornNome || null,
    link: v("link").value.trim() || null, unidade: v("unidade").value, ativa: v("ativa").checked,
    updated_at: new Date().toISOString()
  };
  if (dados.link && !/^https?:\/\//i.test(dados.link)) dados.link = "https://" + dados.link;
  const q = C.atual ? sb().from("cartelas").update(dados).eq("id", C.atual.id) : sb().from("cartelas").insert(dados);
  const { data, error } = await q.select("*, cartela_opcoes(id, foto_url, cor, ativo)").single();
  if (error) { console.error(error); return aviso(mensagemErro(error, "Não foi possível salvar a cartela."), "erro"); }
  const nova = !C.atual;
  C.atual = data;
  const i = C.cartelas.findIndex((c) => c.id === data.id);
  if (i >= 0) C.cartelas[i] = data; else C.cartelas.push(data);
  if (nova) C.opcoes = [];
  pintarDetalhe();
  if (nova) aviso("Cartela criada. Agora cadastre as opções.", "sucesso");
}

async function excluirCartela() {
  if (!confirm(`Excluir a cartela "${C.atual.nome}" e as ${C.opcoes.length} opções dela? Pedidos já feitos continuam com o código escolhido.`)) return;
  const paths = C.opcoes.map((o) => o.foto_path).filter(Boolean);
  const { error } = await sb().from("cartelas").delete().eq("id", C.atual.id);
  if (error) return aviso(mensagemErro(error, "Não foi possível excluir a cartela."), "erro");
  if (paths.length) await sb().storage.from("cartelas").remove(paths);
  C.cartelas = C.cartelas.filter((c) => c.id !== C.atual.id);
  fecharCartela();
}

async function novaOpcao() {
  const prox = C.opcoes.length + 1;
  let codigo = `OP-${String(prox).padStart(2, "0")}`;
  while (C.opcoes.some((o) => o.codigo.toLowerCase() === codigo.toLowerCase())) codigo += "-1";
  const { data, error } = await sb().from("cartela_opcoes")
    .insert({ cartela_id: C.atual.id, empresa_id: empresa(), codigo, nome: "Nova opção", preco: 0, ordem: prox })
    .select("*").single();
  if (error) return aviso(mensagemErro(error, "Não foi possível criar a opção."), "erro");
  C.opcoes.push(data);
  pintarDetalhe();
  const tr = document.querySelector(`tr[data-op="${data.id}"] [data-op-f="codigo"]`);
  tr?.focus(); tr?.select();
}

async function atualizarOpcao(id, dados) {
  const { data, error } = await sb().from("cartela_opcoes").update(dados).eq("id", id).select("*").single();
  if (error) { aviso(mensagemErro(error, "Não foi possível salvar a opção."), "erro"); return null; }
  const i = C.opcoes.findIndex((o) => o.id === id);
  if (i >= 0) C.opcoes[i] = data;
  return data;
}

async function salvarCampo(tr, el) {
  const id = tr.dataset.op, campo = el.dataset.opF;
  const atual = C.opcoes.find((o) => o.id === id);
  let dados = {};
  if (campo === "codigo" || campo === "nome") {
    const v = el.value.trim();
    if (!v) { el.value = atual[campo]; return aviso(campo === "codigo" ? "O código não pode ficar vazio." : "O nome não pode ficar vazio."); }
    dados[campo] = v;
  } else if (campo === "preco") {
    const n = numero(el.value);
    if (!Number.isFinite(n) || n < 0) { el.value = String(atual.preco).replace(".", ","); return aviso("Preço inválido."); }
    dados.preco = Math.round(n * 100) / 100;
  } else if (campo === "cor") {
    dados.cor = el.value.toLowerCase();
  } else if (campo === "ativo") {
    dados.ativo = el.checked;
  } else if (campo === "material") {
    const v = el.value.trim();
    const m = C.materiais.find((x) => x.nome === v || x.id === v);
    if (v && !m) { el.value = ""; return aviso("Escolha um material da lista do Almoxarifado (ou deixe vazio para não reservar estoque)."); }
    dados.almox_produto_id = m?.id || null;
  }
  const r = await atualizarOpcao(id, dados);
  if (!r) { pintarDetalhe(); return; }
  if (campo === "preco") el.value = String(r.preco).replace(".", ",");
  if (campo === "cor") pintarDetalhe();
  tr.classList.add("is-salvo"); setTimeout(() => tr.classList.remove("is-salvo"), 900);
}

async function excluirOpcao(id) {
  const o = C.opcoes.find((x) => x.id === id);
  if (!confirm(`Excluir a opção ${o.codigo} — ${o.nome}?`)) return;
  const { error } = await sb().from("cartela_opcoes").delete().eq("id", id);
  if (error) return aviso(mensagemErro(error, "Não foi possível excluir a opção."), "erro");
  if (o.foto_path) await sb().storage.from("cartelas").remove([o.foto_path]);
  C.opcoes = C.opcoes.filter((x) => x.id !== id);
  pintarDetalhe();
}

// foto reduzida a JPEG de até 900px (amostra de tecido/tinta)
function reduzirFoto(file, max = 900) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * r); cv.height = Math.round(img.naturalHeight * r);
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      cv.toBlob((b) => (b ? ok(b) : falha(new Error("foto"))), "image/jpeg", 0.86);
    };
    img.onerror = () => falha(new Error("Não foi possível ler a imagem."));
    img.src = URL.createObjectURL(file);
  });
}

async function subirFoto(opcao, file) {
  const blob = await reduzirFoto(file);
  const path = `${empresa()}/${C.atual.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb().storage.from("cartelas").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const url = sb().storage.from("cartelas").getPublicUrl(path).data.publicUrl;
  const antigo = opcao.foto_path;
  const r = await atualizarOpcao(opcao.id, { foto_url: url, foto_path: path });
  if (!r) { await sb().storage.from("cartelas").remove([path]); throw new Error("salvar"); }
  if (antigo) await sb().storage.from("cartelas").remove([antigo]);
  return r;
}

async function trocarFoto(id, file) {
  if (!file) return;
  const o = C.opcoes.find((x) => x.id === id);
  try { await subirFoto(o, file); pintarDetalhe(); }
  catch (err) { console.error(err); aviso(mensagemErro(err, "Não foi possível enviar a foto."), "erro"); }
}

async function enviarFotosEmLote(files) {
  if (!files.length) return;
  const semCodigo = [];
  let enviadas = 0;
  for (const f of files) {
    const base = f.name.replace(/\.[^.]+$/, "").trim().toLowerCase();
    const o = C.opcoes.find((x) => x.codigo.toLowerCase() === base);
    if (!o) { semCodigo.push(f.name); continue; }
    try { await subirFoto(o, f); enviadas++; } catch (err) { console.error(err); semCodigo.push(f.name); }
  }
  pintarDetalhe();
  aviso(`${enviadas} foto(s) enviada(s).${semCodigo.length ? `\nSem opção com esse código (ou com erro): ${semCodigo.join(", ")}` : ""}`, semCodigo.length ? "aviso" : "sucesso");
}

// "Colar da planilha": uma opção por linha — código, nome, preço e (opcional) cor em hexadecimal
function colarDaPlanilha() {
  const dlg = document.createElement("dialog");
  dlg.className = "cart-colar";
  dlg.innerHTML = `<form method="dialog">
    <h3>Colar opções da planilha</h3>
    <p>Copie as colunas <strong>Código</strong>, <strong>Nome</strong> e <strong>Preço por ${esc(C.atual.unidade)}</strong>
      (e, se quiser, <strong>Cor</strong> como #aabbcc) e cole abaixo, uma opção por linha. Código que já existe é atualizado.</p>
    <textarea rows="12" placeholder="LK-01&#9;Linho Azul&#9;20,00&#10;LK-02&#9;Linho Branco&#9;80,00"></textarea>
    <p class="cart-colar-prev" data-prev></p>
    <div class="cart-colar-acoes"><button value="cancelar" class="btn secondary">Cancelar</button><button value="ok" class="btn primary" data-ok disabled>Importar</button></div>
  </form>`;
  document.body.appendChild(dlg);
  const ta = dlg.querySelector("textarea"), prev = dlg.querySelector("[data-prev]"), ok = dlg.querySelector("[data-ok]");
  let linhas = [];
  ta.addEventListener("input", () => {
    linhas = []; const erros = [];
    ta.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l, i) => {
      const cols = l.split(/\t|;/).map((x) => x.trim());
      const [codigo, nome, preco, cor] = cols;
      const n = numero(preco);
      if (!codigo || !nome || !Number.isFinite(n) || n < 0) { erros.push(i + 1); return; }
      linhas.push({ codigo, nome, preco: Math.round(n * 100) / 100, cor: /^#[0-9a-f]{6}$/i.test(cor || "") ? cor.toLowerCase() : null });
    });
    prev.textContent = linhas.length || erros.length ? `${linhas.length} opção(ões) prontas${erros.length ? ` · linhas com problema: ${erros.join(", ")}` : ""}` : "";
    ok.disabled = !linhas.length;
  });
  dlg.addEventListener("close", async () => {
    dlg.remove();
    if (dlg.returnValue !== "ok" || !linhas.length) return;
    const base = C.opcoes.length;
    const rows = linhas.map((l, k) => {
      const existe = C.opcoes.find((o) => o.codigo.toLowerCase() === l.codigo.toLowerCase());
      return { cartela_id: C.atual.id, empresa_id: empresa(), codigo: existe?.codigo || l.codigo, nome: l.nome, preco: l.preco,
        ...(l.cor ? { cor: l.cor } : {}), ordem: existe?.ordem ?? base + k + 1 };
    });
    const { error } = await sb().from("cartela_opcoes").upsert(rows, { onConflict: "cartela_id,codigo" });
    if (error) { console.error(error); return aviso(mensagemErro(error, "Não foi possível importar as opções."), "erro"); }
    await carregarOpcoes();
    pintarDetalhe();
    aviso(`${rows.length} opção(ões) importada(s).`, "sucesso");
  });
  dlg.showModal();
  ta.focus();
}

iniciar();
