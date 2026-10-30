/* =====================================================
   CADASTRO DE FRETES — área da transportadora (out/2026)
   Login e senha cadastrados no Fornecedor (Cadastro de Fornecedores > Acesso ao Cadastro de Fretes).
   Tudo passa por funções do banco com o token da sessão (transp_*): ela só vê as viagens dos caminhões dela
   e nunca o valor que o sistema calculou.
===================================================== */
(function () {
  "use strict";
  const CHAVE = "fretes_transportadora_token";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "-");
  const S = { sb: window.supabaseClient, token: null, dados: null, aba: "informar" };
  const lerToken = () => { try { return localStorage.getItem(CHAVE); } catch (_) { return null; } };
  const gravarToken = (t) => { try { t ? localStorage.setItem(CHAVE, t) : localStorage.removeItem(CHAVE); } catch (_) {} };

  async function rpc(nome, args) {
    const { data, error } = await S.sb.rpc(nome, args);
    if (error) {
      if (/SESSAO_EXPIRADA/.test(error.message || "")) { gravarToken(null); S.token = null; mostrarLogin(); }
      throw new Error(String(error.message || error).replace(/^SESSAO_EXPIRADA:\s*/, ""));
    }
    return data;
  }

  function mostrarLogin() {
    $("fpApp").hidden = true; $("fpLogin").hidden = false;
    setTimeout(() => $("fpUsuario").focus(), 0);
  }

  async function carregarLogo() {
    try {
      const { data } = await S.sb.rpc("catalogo_vitrine_login", {});
      const url = data?.logo_url || data?.empresa?.logo_url;
      if (url) { $("fpLogo").src = url; $("fpLogo").hidden = false; }
    } catch (_) {}
    try {
      const { data } = await S.sb.auth.getSession();
      if (data?.session && window.self !== window.top) $("fpAvisoEquipe").hidden = false;
    } catch (_) {}
  }

  async function entrar(e) {
    e.preventDefault();
    const b = e.submitter || $("fpFormLogin").querySelector("button");
    b.disabled = true; $("fpErroLogin").textContent = "";
    try {
      const r = await rpc("transp_login", { p_login: $("fpUsuario").value, p_senha: $("fpSenha").value });
      if (r?.erro) throw new Error(r.erro);
      S.token = r.token; gravarToken(r.token);
      $("fpSenha").value = "";
      await abrir();
    } catch (err) { $("fpErroLogin").textContent = err.message; }
    finally { b.disabled = false; }
  }

  async function abrir() {
    S.dados = await rpc("transp_viagens", { p_token: S.token });
    $("fpLogin").hidden = true; $("fpApp").hidden = false;
    $("fpNome").textContent = S.dados.nome || "Transportadora";
    $("fpExtraCaminhao").innerHTML = '<option value="">Outro / não sei</option>' + (S.dados.caminhoes || []).map((c) => '<option value="' + c.id + '">' + esc(c.codigo) + (c.placa ? " · " + esc(c.placa) : "") + "</option>").join("");
    pintar();
  }

  function grupo(v) {
    if (v.status !== "aberto") return "fechadas";
    return v.valor_transportadora == null ? "informar" : "informadas";
  }

  function cartao(v) {
    const tipo = v.extra ? '<span class="fp-tipo extra">Viagem extra</span>' : "";
    const dir = '<span class="fp-tipo ' + v.direcao + '">' + (v.direcao === "entrega" ? "Entrega" : "Coleta") + "</span>";
    const info = "<div><strong>" + dir + tipo + (v.pedido ? "Pedido " + esc(v.pedido) : "Sem pedido") + "</strong><small>" + esc(v.cliente || "") + "</small><small>" + dataBr(v.data) + (v.caminhao ? " · Caminhão " + esc(v.caminhao) : "") + "</small></div>";
    const rota = "<div><strong>" + esc(v.origem || "-") + " → " + esc(v.destino || "-") + "</strong><small>" + (Number(v.km) ? String(v.km).replace(".", ",") + " km" : "") + (v.fora_escala ? " · Este caminhão saiu da escala da Chiavari" : "") + "</small></div>";
    let lado;
    if (v.status !== "aberto") {
      lado = '<div class="fp-fechada">Fechado pela Chiavari<b>' + brl(v.valor_transportadora) + "</b></div>";
    } else {
      lado = '<div class="fp-valor-col"><div class="fp-valor"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Valor R$" data-valor="' + v.id + '" value="' + (v.valor_transportadora ?? "") + '" aria-label="Valor do frete"><button type="button" class="fp-btn" data-salvar="' + v.id + '">Salvar</button></div>' +
        '<input class="fp-obs" placeholder="Observação (opcional)" data-obs="' + v.id + '" value="' + esc(v.transp_obs || "") + '">' +
        (v.valor_transportadora != null ? '<span class="fp-salvo">✓ Informado ' + brl(v.valor_transportadora) + "</span>" : "") +
        (v.extra ? '<button type="button" class="fp-link-apagar" data-apagar="' + v.id + '">Apagar esta viagem extra</button>' : "") + "</div>";
    }
    return '<article class="fp-viagem' + (v.valor_transportadora != null && v.status === "aberto" ? " is-informada" : "") + '">' + info + rota + lado + "</article>";
  }

  function pintar() {
    const lista = S.dados?.viagens || [];
    const n = lista.filter((v) => grupo(v) === "informar").length;
    $("fpContInformar").textContent = n ? String(n) : "";
    document.querySelectorAll("#fpAbas [data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === S.aba));
    const itens = lista.filter((v) => grupo(v) === S.aba).sort((a, b) => S.aba === "fechadas" ? String(b.data).localeCompare(String(a.data)) : String(a.data).localeCompare(String(b.data)));
    $("fpDica").hidden = S.aba !== "informar";
    $("fpLista").innerHTML = itens.length ? itens.map(cartao).join("") : '<div class="fp-vazio">' + ({ informar: "Nenhuma viagem esperando valor.", informadas: "Nenhuma viagem informada ainda.", fechadas: "Nenhuma viagem fechada nos últimos meses." })[S.aba] + "</div>";
  }

  async function salvar(id, botao) {
    const campo = document.querySelector('[data-valor="' + id + '"]');
    const valor = Number(String(campo.value).replace(",", "."));
    if (!campo.value || !(valor >= 0)) { campo.focus(); return; }
    if (botao) botao.disabled = true;
    try {
      const atualizado = await rpc("transp_informar", { p_token: S.token, p_viagem: id, p_valor: valor, p_obs: document.querySelector('[data-obs="' + id + '"]')?.value || "" });
      const i = S.dados.viagens.findIndex((v) => v.id === id);
      if (i >= 0) S.dados.viagens[i] = atualizado;
      const lista = S.dados.viagens.filter((v) => grupo(v) === S.aba);
      pintar();
      // continua digitando na próxima viagem da lista
      const proximo = document.querySelector("#fpLista [data-valor]");
      if (proximo && lista.length) proximo.focus();
    } catch (err) { alert(err.message); if (botao) botao.disabled = false; }
  }

  async function enviarExtra(e) {
    e.preventDefault();
    const f = $("fpFormExtra"), dados = Object.fromEntries(new FormData(f).entries());
    $("fpErroExtra").textContent = "";
    try {
      await rpc("transp_extra", { p_token: S.token, p_dados: dados });
      $("fpModalExtra").close(); f.reset();
      S.aba = "informadas"; await abrir();
    } catch (err) { $("fpErroExtra").textContent = err.message; }
  }

  document.addEventListener("click", async (e) => {
    const s = e.target.closest("[data-salvar]"); if (s) return salvar(s.dataset.salvar, s);
    const a = e.target.closest("[data-aba]"); if (a) { S.aba = a.dataset.aba; pintar(); return; }
    const ap = e.target.closest("[data-apagar]");
    if (ap && confirm("Apagar esta viagem extra?")) { try { await rpc("transp_extra_excluir", { p_token: S.token, p_viagem: ap.dataset.apagar }); await abrir(); } catch (err) { alert(err.message); } }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const c = e.target.closest?.("[data-valor],[data-obs]"); if (!c) return;
    e.preventDefault(); salvar(c.dataset.valor || c.dataset.obs);
  });
  $("fpFormLogin").addEventListener("submit", entrar);
  $("fpSair").addEventListener("click", async () => { try { await rpc("transp_sair", { p_token: S.token }); } catch (_) {} gravarToken(null); S.token = null; mostrarLogin(); });
  $("fpNovaExtra").addEventListener("click", () => { $("fpErroExtra").textContent = ""; $("fpModalExtra").showModal(); });
  $("fpCancelarExtra").addEventListener("click", () => $("fpModalExtra").close());
  $("fpFormExtra").addEventListener("submit", enviarExtra);

  carregarLogo();
  S.token = lerToken();
  if (S.token) abrir().catch(() => mostrarLogin()); else mostrarLogin();
})();
