/* Link de pagamento do pedido (out/2026).
   A equipe pega o link + código de 6 números do pedido e envia ao cliente; o cliente abre
   Modulos/Financeiro/pagar.html, vê os pagamentos (nome neutro "Pagamento 1, 2…") e gera o PIX de cada um,
   que cai sozinho na conta certa (gateway de cada conta do Financeiro). Ver CLAUDE.md "Link de pagamento".
   window.EasyLocLinkPagamento:
     abrir({ empresaId, pedidoId, numero, cliente, telefone })  janela da equipe (copiar, WhatsApp, QR, código novo)
     paraDocumento({ empresaId, pedidoId })                      { url, urlCurta, pin, qr } para o QR do pedido/PDF
     url(slug, pin?)                                            endereço da página pública
     qrDataUrl(texto)                                           QR em imagem (data URL) */
(function () {
  if (window.EasyLocLinkPagamento) return;
  let libQr = null;

  const sb = () => window.supabaseClient;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // a página pública fica em Modulos/Financeiro/pagar.html, no mesmo site (funciona no subcaminho do GitHub Pages)
  function base() {
    const href = location.href.split(/[?#]/)[0];
    const i = href.indexOf("/Modulos/");
    return i >= 0 ? href.slice(0, i + 1) : href.replace(/[^/]*$/, "");
  }
  function url(slug, pin) { return base() + "Modulos/Financeiro/pagar.html?p=" + encodeURIComponent(slug) + (pin ? "#c=" + pin : ""); }

  function carregarQr() {
    if (window.QRCode) return Promise.resolve();
    if (!libQr) libQr = new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
      s.onload = ok; s.onerror = () => { libQr = null; erro(new Error("QR indisponível")); };
      document.head.appendChild(s);
    });
    return libQr;
  }
  async function qrDataUrl(texto, tamanho = 360) {
    await carregarQr();
    const caixa = document.createElement("div");
    new window.QRCode(caixa, { text: texto, width: tamanho, height: tamanho, correctLevel: window.QRCode.CorrectLevel.M });
    const canvas = caixa.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : (caixa.querySelector("img")?.src || "");
  }

  async function obter(empresaId, pedidoId, novo) {
    const { data, error } = await sb().rpc("pagamento_link_obter", { p_empresa: empresaId, p_pedido: pedidoId, p_novo_codigo: !!novo });
    if (error) throw error;
    return data;
  }

  async function paraDocumento({ empresaId, pedidoId }) {
    if (!empresaId || !pedidoId) return null;
    try {
      const l = await obter(empresaId, pedidoId);
      if (!l?.slug) return null;
      const comCodigo = url(l.slug, l.pin);
      return { url: comCodigo, urlCurta: url(l.slug), pin: l.pin, qr: await qrDataUrl(comCodigo) };
    } catch (e) { console.warn("Link de pagamento:", e); return null; }
  }

  function estilos() {
    if (document.getElementById("elpEstilos")) return;
    const st = document.createElement("style");
    st.id = "elpEstilos";
    st.textContent = `
      .elp-dialog{width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:0;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.28);font-family:Inter,system-ui,sans-serif;color:#1f2020}
      .elp-dialog::backdrop{background:rgba(15,23,42,.45)}
      .elp-topo{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid #e3e7ec}
      .elp-topo h2{margin:0;font-size:19px;font-weight:600}
      .elp-x{width:34px;height:34px;border:1px solid #d6dce5;border-radius:999px;background:#fff;font-size:18px;cursor:pointer;color:#3f3f3f}
      .elp-corpo{display:grid;grid-template-columns:200px minmax(0,1fr);gap:22px;padding:22px}
      .elp-qr{display:flex;flex-direction:column;align-items:center;gap:8px}
      .elp-qr img{width:200px;height:200px;border:1px solid #e3e7ec;border-radius:12px;padding:8px;background:#fff}
      .elp-qr small{color:#6b6b6b;font-size:12px;text-align:center}
      .elp-info{display:flex;flex-direction:column;gap:14px;min-width:0}
      .elp-info p{margin:0;color:#4f4f4f;font-size:14px;line-height:1.5}
      .elp-campo label{display:block;margin-bottom:6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b}
      .elp-linha{display:flex;gap:8px;align-items:center}
      .elp-linha input{flex:1;min-width:0;height:40px;padding:0 12px;border:1px solid #cfd6df;border-radius:10px;font-size:13px;background:#f7f9fb;color:#1f2020}
      .elp-codigo{font-size:28px;font-weight:700;letter-spacing:.25em;color:#123f86;font-variant-numeric:tabular-nums}
      .elp-btn{height:40px;padding:0 14px;border:1px solid #cfd6df;border-radius:10px;background:#fff;color:#1f2020;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
      .elp-btn:hover{border-color:#123f86;color:#123f86}
      .elp-btn.primario{background:#123f86;border-color:#123f86;color:#fff}
      .elp-btn.primario:hover{background:#0d2f66;color:#fff}
      .elp-btn.whats{background:#1f7a44;border-color:#1f7a44;color:#fff}
      .elp-aviso{padding:10px 12px;border:1px solid #ecd99a;border-left:3px solid #c9a24f;border-radius:10px;background:#fdf6dd;color:#5c4300;font-size:13px;line-height:1.45}
      .elp-rodape{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid #e3e7ec}
      @media(max-width:620px){.elp-corpo{grid-template-columns:1fr}.elp-qr img{width:180px;height:180px}}`;
    document.head.appendChild(st);
  }

  async function copiar(texto, botao) {
    try { await navigator.clipboard.writeText(texto); } catch (_) {
      const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    if (botao) { const o = botao.textContent; botao.textContent = "Copiado ✓"; setTimeout(() => (botao.textContent = o), 1500); }
  }

  async function abrir({ empresaId, pedidoId, numero, cliente, telefone } = {}) {
    if (!empresaId || !pedidoId) { window.alerta?.("Salve o pedido antes de gerar o link de pagamento.", "Link de pagamento", "aviso"); return; }
    estilos();
    const dlg = document.createElement("dialog");
    dlg.className = "elp-dialog";
    dlg.innerHTML = '<div class="elp-topo"><h2>Link do pedido' + (numero ? " · Pedido " + esc(numero) : "") + '</h2><button type="button" class="elp-x" data-elp-fechar aria-label="Fechar">×</button></div><div class="elp-corpo"><p>Carregando…</p></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => { if (e.target.closest("[data-elp-fechar]") || e.target === dlg) dlg.close(); });
    dlg.showModal();

    const pintar = async (l) => {
      const link = url(l.slug), comCodigo = url(l.slug, l.pin);
      const qr = await qrDataUrl(comCodigo).catch(() => "");
      const semGateway = (l.contas_sem_gateway || []).filter(Boolean);
      const msg = "Olá" + (cliente ? ", " + cliente : "") + "! Segue o link do seu pedido" + (numero ? " " + numero : "") +
        ":\n" + link + "\nCódigo de acesso: " + l.pin + "\n\nNele você confere o pedido completo e, no final, faz os pagamentos pelo PIX.";
      const fone = String(telefone || "").replace(/\D/g, "");
      dlg.querySelector(".elp-corpo").outerHTML =
        '<div class="elp-corpo"><div class="elp-qr">' + (qr ? '<img src="' + qr + '" alt="QR Code do link de pagamento">' : "") + "<small>O cliente aponta a câmera e já entra (o código vai junto no QR).</small></div>" +
        '<div class="elp-info">' +
          (!l.pagamentos ? '<div class="elp-aviso">O cliente já pode ver o pedido por este link. Os pagamentos aparecem quando o pedido fica <b>Reservado</b> com a programação de pagamento preenchida.</div>' : "") +
          (semGateway.length ? '<div class="elp-aviso">Sem gateway conectado: <b>' + semGateway.map(esc).join(", ") + "</b>. Os pagamentos dessas contas aparecem para o cliente como \"Fale com a nossa equipe\". Conecte em Financeiro › Gateways.</div>" : "") +
          '<div class="elp-campo"><label>Link</label><div class="elp-linha"><input readonly value="' + esc(link) + '" aria-label="Link de pagamento"><button type="button" class="elp-btn" data-elp-copiar-link>Copiar</button></div></div>' +
          '<div class="elp-campo"><label>Código de acesso</label><div class="elp-linha"><span class="elp-codigo">' + esc(l.pin) + '</span><span style="flex:1"></span><button type="button" class="elp-btn" data-elp-novo>Gerar código novo</button></div></div>' +
          "<p>O cliente vê o pedido completo e, no final, os pagamentos, sem banco nem chave PIX. Cada QR já vai para a conta certa e o pagamento entra sozinho no Financeiro.</p>" +
        "</div></div>";
      let rod = dlg.querySelector(".elp-rodape");
      if (!rod) { rod = document.createElement("div"); rod.className = "elp-rodape"; dlg.appendChild(rod); }
      rod.innerHTML = '<button type="button" class="elp-btn" data-elp-copiar-tudo>Copiar mensagem</button>' +
        '<a class="elp-btn whats" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/' + (fone ? (fone.length <= 11 ? "55" + fone : fone) : "") + "?text=" + encodeURIComponent(msg) + '">Enviar pelo WhatsApp</a>' +
        '<a class="elp-btn primario" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="' + esc(comCodigo) + '">Abrir a página</a>';
      dlg.querySelector("[data-elp-copiar-link]").onclick = (e) => copiar(link, e.currentTarget);
      rod.querySelector("[data-elp-copiar-tudo]").onclick = (e) => copiar(msg, e.currentTarget);
      dlg.querySelector("[data-elp-novo]").onclick = async (e) => {
        const ok = typeof window.confirmarGlobal === "function"
          ? await window.confirmarGlobal("O código atual deixa de funcionar. Gerar um código novo?", "Link de pagamento", { confirmarTexto: "Gerar código novo" })
          : confirm("O código atual deixa de funcionar. Gerar um código novo?");
        if (!ok) return;
        e.currentTarget.disabled = true;
        try { await pintar(await obter(empresaId, pedidoId, true)); } catch (err) { window.alerta?.(err.message, "Link de pagamento", "erro"); }
      };
    };
    try { await pintar(await obter(empresaId, pedidoId)); }
    catch (e) { dlg.querySelector(".elp-corpo").innerHTML = "<p>Não foi possível gerar o link: " + esc(e.message || e) + "</p>"; }
  }

  window.EasyLocLinkPagamento = { abrir, paraDocumento, url, qrDataUrl };
})();
