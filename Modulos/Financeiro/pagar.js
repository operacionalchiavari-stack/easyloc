// Pedido digital (out/2026): página pública do link do pedido. O cliente entra com o código de 6 números e vê o MESMO
// documento do PDF do pedido (pedidoPreviewHtml, layout em pé); no lugar da "Programação de pagamento" ficam os pagamentos
// ("Pagamento 1, 2…", sem dizer conta nem banco), com o PIX de cada um. O PIX é uma cobrança do
// gateway da conta certa (valor travado); a confirmação dá baixa sozinha no Financeiro.
(function () {
  const $ = (id) => document.getElementById(id);
  const sb = window.supabaseClient;
  const slug = new URLSearchParams(location.search).get("p") || "";
  // Simulação (?simular=1): para a equipe logada ver o QR sem gateway conectado. Só na tela: não chama o gateway, não grava
  // nada e o código do QR não é um PIX. Cliente sem login nunca entra nesse modo.
  const pedeSimular = new URLSearchParams(location.search).get("simular") === "1";
  const SIM_CODIGO = "SIMULACAO-ACERVO-ESTE-CODIGO-NAO-E-UM-PIX";
  const simPagos = new Set();
  let simulando = false, simQr = "";
  async function prepararSimulacao() {
    if (!pedeSimular || simulando) return;
    const { data } = await sb.auth.getSession();
    if (!data?.session) return;
    simulando = true;
    const aviso = document.createElement("div");
    aviso.className = "pg-sim"; aviso.setAttribute("role", "status");
    aviso.textContent = "Simulação: nenhum PIX é gerado e nada é gravado. O cliente não vê este modo.";
    document.body.prepend(aviso);
    await new Promise((ok) => { const t = document.createElement("script"); t.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"; t.onload = ok; t.onerror = ok; document.head.appendChild(t); });
    if (window.QRCode) {
      const caixa = document.createElement("div");
      new window.QRCode(caixa, { text: SIM_CODIGO, width: 320, height: 320 });
      simQr = (caixa.querySelector("canvas")?.toDataURL("image/png") || "").split(",")[1] || "";
    }
  }
  function aplicarSimulacao() {
    if (!simulando) return;
    (dados.pagamentos || []).forEach((p) => {
      if (simPagos.has(p.id)) { p.situacao = "pago"; p.aberto = 0; }
      else if (p.situacao !== "pago") p.pagavel = true;
    });
  }
  const chavePin = "pagar_pin:" + slug;
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBr = (iso) => iso ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4) : "";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let pin = "", dados = null, aberto = null, timerPix = null, timerRelogio = null;

  function lerPin() {
    const m = location.hash.match(/c=(\d{6})/);
    if (m) { history.replaceState(null, "", location.pathname + location.search); return m[1]; } // o código não fica no endereço
    try { return sessionStorage.getItem(chavePin) || ""; } catch (_) { return ""; }
  }
  function guardarPin(v) { try { v ? sessionStorage.setItem(chavePin, v) : sessionStorage.removeItem(chavePin); } catch (_) { /* sem armazenamento */ } }

  function mostrarEntrar(erro) {
    $("pgCarregando").hidden = true; $("pgLista").hidden = true; $("pgEntrar").hidden = false;
    $("pgErro").hidden = !erro; $("pgErro").textContent = erro || "";
    $("pgCodigo").value = ""; $("pgCodigo").focus();
  }

  async function abrir(codigo, silencioso) {
    $("pgCarregando").hidden = !!silencioso && !!dados;
    const { data, error } = await sb.rpc("pagamento_link_abrir", { p_slug: slug, p_pin: codigo });
    if (error || !data) { mostrarEntrar("Não foi possível abrir agora. Tente de novo."); return; }
    if (data.erro) { guardarPin(""); mostrarEntrar(data.erro); return; }
    const jaAberto = !!dados && !!$("pagamento");
    pin = codigo; guardarPin(codigo); dados = data;
    await prepararSimulacao(); aplicarSimulacao();
    if (silencioso && jaAberto) pintarPagamentos();
    else await pintar().catch((e) => { console.error(e); mostrarEntrar("Não foi possível abrir o pedido agora. Tente de novo."); });
  }

  const SITUACAO = { pago: ["Pago", "ok"], vencido: ["Vencido", "venc"], parcial: ["Pago em parte", "parc"], aberto: ["Em aberto", "aberto"] };
  const MODULO = "../Comercial/Catalogo/projeto-apresentacao.mjs?v=20261107-lista-sublocacao";
  let docMod = null;

  function marca() {
    const e = dados?.empresa || {};
    if (e.nome) document.title = "Seu pedido · " + e.nome;
  }

  // mesmo cadastro → item que a Central de Pedidos usa para montar o documento
  function achadorDeItem(cadastro) {
    const mapa = new Map((cadastro || []).map((r) => [String(r.id), r]));
    const numero = (v) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
    return (id) => {
      const r = mapa.get(String(id));
      if (!r) return null;
      const nome = r.produto_base ? (r.produto_base + " " + (r.produto || "")).trim() : (r.produto || "Item");
      const dims = [r.largura, r.altura, r.profundidade].map((v) => (numero(v) === null ? null : Math.round(numero(v) * 100)));
      return { name: nome, fullName: String(r.descricao_total || "").trim() || nome, photo: r.foto_url || "", referencia: r.referencia || r.codigo || "", catLabel: r.categoria || "",
        dims: dims.every((v) => v === null) ? "" : dims.map((v) => v ?? "–").join(" × ") + " cm", rentalPrice: numero(r.valor_locacao), replacementPrice: numero(r.valor_reposicao) };
    };
  }

  // O documento é o mesmo do PDF (pedidoPreviewHtml, layout em pé). A única troca: no lugar da "Programação de pagamento"
  // entra a lista de pagamentos com o QR, porque é ali que o cliente paga.
  async function pintar() {
    marca();
    docMod ||= await import(MODULO);
    const d = dados.detalhe || {};
    const model = docMod.dadosApresentacao({ noivos: d.nome || "Pedido", data_evento: d.data_evento || "", data_evento_fim: d.data_evento_fim || "", local_evento: d.local || "",
      dados: { ambientes: d.ambientes || [], servicos: d.servicos || [], terceirizados: d.terceirizados || [] } }, achadorDeItem(d.cadastro));
    const fin = docMod.financeiroPedidoSalvo({ valor_total: d.valor_total, observacoes: { valores: d.valores } });
    model.financeiro = fin ? { ...fin, parcelas: [] } : null;
    model.pagamentosSlot = '<section class="cpj-order-financeiro-parcelas pg-slot" id="pagamento"></section>';
    model.semAviso = true;
    model.numero = d.numero || "";
    model.statusPedido = { chave: d.status || "orcamento", ate: d.pre_reserva_ate || "" };
    docMod.definirAvisosStatus?.(d.avisos);
    model.localEndereco = d.endereco || "";
    model.evento = { ...(model.evento || {}), data_entrega: d.data_entrega || "", hora_entrega: d.hora_entrega || "", data_coleta: d.data_coleta || "", hora_coleta: d.hora_coleta || "" };
    model.plantas = Array.isArray(d.plantas) ? d.plantas : [];
    $("pgEntrar").hidden = true; $("pgCarregando").hidden = true; $("pgLista").hidden = false;
    document.body.classList.add("com-pedido");
    $("pgLista").innerHTML = docMod.pedidoPreviewHtml(model, { decorador: d.nome ? { nome: d.nome, logo_url: d.cliente_foto || "" } : null, empresa: dados.empresa, layout: "final" }) +
      '<div class="pd-barra" id="pdBarra" hidden></div>';
    $("pgLista").querySelectorAll(".cpj-order-render-group img").forEach((img) => { img.dataset.foto = img.src; });
    ajustarPlantas();
    pintarPagamentos();
    const pag = $("pagamento"), barra = $("pdBarra");
    if (pag && barra && "IntersectionObserver" in window) new IntersectionObserver(([e]) => barra.classList.toggle("oculta", e.isIntersecting), { threshold: 0.05 }).observe(pag);
  }

  // A planta tem o tamanho da folha A4: na tela, encolhe até caber na largura do papel (no celular, principalmente)
  function ajustarPlantas() {
    const papel = document.querySelector("#pgLista .cpj-order-paper");
    if (!papel) return;
    const cs = getComputedStyle(papel), livre = papel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    papel.querySelectorAll(".cpj-order-planta-folha").forEach((f) => {
      const largura = parseFloat(f.style.width) * 96 / 25.4; // mm → px
      if (largura > 0) f.style.zoom = String(Math.min(Number(f.style.getPropertyValue("--zt")) || 1, livre / largura));
    });
  }
  window.addEventListener("resize", ajustarPlantas);

  function pintarPagamentos() {
    const lista = dados.pagamentos || [], alvo = $("pagamento");
    if (!alvo) return;
    const emAberto = lista.filter((p) => p.situacao !== "pago");
    const total = emAberto.reduce((s, p) => s + Number(p.aberto || 0), 0);
    alvo.innerHTML = "<h2>Pagamento</h2>" + (!lista.length ? '<p class="pg-vazio">Os pagamentos aparecem aqui quando o pedido for reservado.</p>'
      : '<table class="cpj-order-pagamentos pg-tabela" id="pgPagamentos"><thead><tr><th scope="col">Pagamento</th><th scope="col">Vencimento</th><th scope="col" class="cpj-order-valor-col">Valor</th><th scope="col"><span class="pa-sr">Pagar</span></th></tr></thead><tbody>' +
        lista.map((p) => {
          const [rot, cls] = SITUACAO[p.situacao] || SITUACAO.aberto;
          const pago = p.situacao === "pago";
          return '<tr class="pg-item is-' + cls + '"><td>Pagamento ' + p.numero + '<span class="pg-chip ' + cls + '">' + rot + "</span></td><td>" + esc(dataBr(p.vencimento)) + '</td><td class="cpj-order-valor-col">' + brl(pago ? p.valor : p.aberto) + '</td><td class="pg-acao">' +
            (pago ? '<span class="pg-pago">Pago ✓</span>' : p.pagavel ? '<button type="button" class="pg-btn" data-pagar="' + p.id + '">' + (p.pix ? "Ver QR Code" : "Gerar QR Code") + "</button>" : '<span class="pg-equipe">Fale com a nossa equipe</span>') + "</td></tr>";
        }).join("") + "</tbody></table>" +
        '<p class="pg-total-linha">' + (emAberto.length ? "Total em aberto <b>" + brl(total) + "</b>" : '<b class="pg-quitado">Tudo pago ✓</b>') + "</p>");
    const barra = $("pdBarra");
    if (barra) {
      barra.hidden = !emAberto.length;
      barra.innerHTML = "<div><small>Em aberto</small><b>" + brl(total) + '</b></div><a class="pg-btn" href="#pagamento">Ir para o pagamento</a>';
    }
  }

  function pararPix() { clearInterval(timerPix); clearInterval(timerRelogio); timerPix = timerRelogio = null; }

  async function chamar(action, receberId) {
    if (simulando) {
      const sp = (dados.pagamentos || []).find((x) => x.id === receberId);
      return action === "gerar" ? { ok: true, qr_code: SIM_CODIGO, qr_code_base64: simQr, expira_em: new Date(Date.now() + 1800000).toISOString(), valor: sp?.aberto, pago: false } : { ok: true, pago: simPagos.has(receberId) };
    }
    const { data, error } = await sb.functions.invoke("pagamento-link", { body: { action, slug, pin, receber_id: receberId } });
    if (error) {
      let msg = "Não foi possível gerar o pagamento agora.";
      try { const j = await error.context?.json?.(); if (j?.erro) msg = j.erro; } catch (_) { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  function pintarPix(p, r) {
    const corpo = $("pgPixCorpo");
    if (r.pago) {
      pararPix();
      corpo.innerHTML = '<div class="pg-pix-ok"><span>✓</span><h3>Pagamento confirmado</h3><p>Pagamento ' + p.numero + " · " + brl(r.valor || p.aberto) + '</p><button type="button" class="pg-btn" data-fechar>Fechar</button></div>';
      if (simulando) { simPagos.add(p.id); aplicarSimulacao(); pintarPagamentos(); return; }
      abrir(pin, true);
      return;
    }
    corpo.innerHTML =
      '<p class="pg-pix-sub">Pagamento ' + p.numero + " · vence " + esc(dataBr(p.vencimento)) + "</p>" +
      '<p class="pg-pix-valor">' + brl(r.valor) + "</p>" +
      (r.qr_code_base64 ? '<img class="pg-pix-qr" alt="QR Code PIX" src="data:image/png;base64,' + r.qr_code_base64 + '">' : "") +
      '<p class="pg-pix-dica">Abra o app do seu banco, escolha <b>PIX › Ler QR Code</b> e confirme. Ou copie o código:</p>' +
      '<div class="pg-copia"><input readonly value="' + esc(r.qr_code || "") + '" aria-label="PIX copia e cola"><button type="button" class="pg-btn" data-copiar>Copiar</button></div>' +
      '<p class="pg-pix-espera"><span class="pg-ponto"></span>Aguardando o pagamento… <span id="pgRelogio"></span></p>' +
      (simulando ? '<button type="button" class="pg-btn pg-sim-btn" data-sim-pagar>Simular pagamento recebido</button>' : "");
    corpo.querySelector("[data-copiar]").onclick = async (e) => {
      try { await navigator.clipboard.writeText(r.qr_code); } catch (_) { const i = corpo.querySelector(".pg-copia input"); i.select(); document.execCommand("copy"); }
      e.currentTarget.textContent = "Copiado ✓";
    };
    corpo.querySelector("[data-sim-pagar]")?.addEventListener("click", () => pintarPix(p, { pago: true, valor: r.valor }));
    pararPix();
    const fim = r.expira_em ? new Date(r.expira_em).getTime() : 0;
    const relogio = () => {
      const el = $("pgRelogio"); if (!el || !fim) return;
      const s = Math.max(0, Math.round((fim - Date.now()) / 1000));
      el.textContent = s ? "· vale por " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : "· expirou, gere de novo";
      if (!s) pararPix();
    };
    relogio(); timerRelogio = setInterval(relogio, 1000);
    timerPix = setInterval(async () => {
      if (document.hidden) return;
      try { const c = await chamar("consultar", p.id); if (c.pago) pintarPix(p, c); } catch (_) { /* tenta de novo */ }
    }, 6000);
  }

  async function pagar(id) {
    const p = (dados.pagamentos || []).find((x) => x.id === id); if (!p) return;
    aberto = p;
    $("pgPixCorpo").innerHTML = '<p class="pg-carregando">Gerando o PIX…</p>';
    $("pgPix").showModal();
    try { pintarPix(p, await chamar("gerar", id)); }
    catch (e) {
      $("pgPixCorpo").innerHTML = '<p class="pg-erro">' + esc(e.message) + "</p>";
      if (/código|Código|tentativas/.test(e.message)) { $("pgPix").close(); guardarPin(""); mostrarEntrar(e.message); }
    }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pagar]"); if (b) { pagar(b.dataset.pagar); return; }
    const f = e.target.closest("[data-foto]"); if (f) { $("pgFotoImg").src = f.dataset.foto; $("pgFoto").showModal(); return; }
    if (e.target === $("pgFoto") || e.target.closest("[data-fechar-foto]")) { $("pgFoto").close(); return; }
    if (e.target.closest("[data-fechar]") || e.target === $("pgPix")) $("pgPix").close();
  });
  $("pgPix").addEventListener("close", () => { pararPix(); aberto = null; });
  $("pgForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("pgCodigo").value.replace(/\D/g, ""); if (v.length === 6) abrir(v); });
  $("pgCodigo").addEventListener("input", (e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = v; if (v.length === 6) abrir(v); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && pin && !aberto) abrir(pin, true); });

  if (!slug) { $("pgCarregando").textContent = "Link de pagamento inválido."; return; }
  const inicial = lerPin();
  if (inicial) abrir(inicial); else mostrarEntrar();
})();
