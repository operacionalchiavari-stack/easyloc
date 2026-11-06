/* Solicitações com assistente (nov/2026): "+ Nova solicitação" abre uma conversa com a especialista (compras ou
   manutenção, Edge Function solicitacao-assistente). Ela pergunta até entender, mostra o resumo, a pessoa confirma e a
   tela grava pela mesma RPC do formulário antigo (que continua como alternativa: "Preencher o formulário").
   Uso: EasyLocAssistenteSolicitacao.abrir({ tipo, titulo, assistente, saudacao(nome), resumoHtml(r, esc), confirmar(r),
   formulario() }). A conversa fica na aba do navegador (sessionStorage) até ser enviada ou recomeçada. */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ICONE = {
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    clipe: '<svg viewBox="0 0 24 24"><path d="M21 12.5 12.6 21a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>',
    enviar: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  const S = { cfg: null, ctx: null, msgs: [], resumo: null, enviando: false, gravador: null, pedacos: [], inicio: 0, relogio: 0, cancelada: false, dlg: null };
  const $ = (sel) => S.dlg.querySelector(sel);
  const chave = () => "solic_chat:" + S.cfg.tipo + ":" + (S.ctx?.empresa_id || "") + ":" + (S.ctx?.usuario_id || "");
  const primeiroNome = () => String(S.ctx?.usuario_nome || "").trim().split(/\s+/)[0] || "";

  function guardar() { try { sessionStorage.setItem(chave(), JSON.stringify({ msgs: S.msgs, resumo: S.resumo })); } catch (_) {} }
  function recuperar() {
    try { const d = JSON.parse(sessionStorage.getItem(chave()) || "null"); if (d && Array.isArray(d.msgs) && d.msgs.length) { S.msgs = d.msgs; S.resumo = d.resumo || null; return true; } } catch (_) {}
    return false;
  }

  function montar() {
    S.dlg?.remove();
    const d = document.createElement("dialog");
    d.className = "as-dialog";
    d.setAttribute("aria-label", S.cfg.titulo);
    d.innerHTML =
      '<div class="as-topo"><span class="as-avatar" aria-hidden="true">' + esc(S.cfg.icone || "✦") + '</span><div><strong>' + esc(S.cfg.assistente) + '</strong><small>' + esc(S.cfg.titulo) + '</small></div>' +
      '<div class="as-topo-acoes"><button type="button" class="as-link" data-as="recomecar">Começar de novo</button><button type="button" class="as-fechar" data-as="fechar" aria-label="Fechar">×</button></div></div>' +
      '<div class="as-msgs" aria-live="polite"></div>' +
      '<div class="as-gravando" hidden><span class="as-rec"></span>Gravando <b data-as="tempo">0:00</b><button type="button" class="as-link" data-as="cancelar-rec">Cancelar</button></div>' +
      '<form class="as-campo"><button type="button" class="as-icone" data-as="clipe" title="Enviar um arquivo de áudio" aria-label="Enviar um arquivo de áudio">' + ICONE.clipe + '</button>' +
      '<input type="file" accept="audio/*" hidden data-as="arquivo">' +
      '<textarea rows="1" placeholder="Escreva aqui ou grave um áudio…" aria-label="Sua mensagem"></textarea>' +
      '<button type="button" class="as-icone" data-as="mic" title="Gravar áudio" aria-label="Gravar áudio">' + ICONE.mic + '</button>' +
      '<button type="submit" class="as-enviar" aria-label="Enviar">' + ICONE.enviar + '</button></form>' +
      (S.cfg.formulario ? '<p class="as-rodape"><button type="button" class="as-link" data-as="formulario">Prefiro preencher o formulário</button></p>' : "");
    document.body.appendChild(d);
    S.dlg = d;
    const texto = $("textarea");
    $("form").addEventListener("submit", (e) => { e.preventDefault(); const v = texto.value; texto.value = ""; texto.style.height = ""; enviarTexto(v); });
    texto.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); } });
    texto.addEventListener("input", () => { texto.style.height = "auto"; texto.style.height = Math.min(texto.scrollHeight, 150) + "px"; });
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-as]"); const a = b?.dataset.as;
      if (a === "fechar") fechar();
      else if (a === "recomecar") recomecar();
      else if (a === "mic") (S.gravador ? parar() : gravar());
      else if (a === "cancelar-rec") { S.cancelada = true; parar(); }
      else if (a === "clipe") $('[data-as="arquivo"]').click();
      else if (a === "formulario") { fechar(); S.cfg.formulario(); }
      else if (a === "aprovar") aprovar();
      else if (a === "ajustar") { texto.placeholder = "Diga o que quer mudar no resumo…"; texto.focus(); }
    });
    $('[data-as="arquivo"]').addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) transcrever(f); });
    d.addEventListener("cancel", (e) => { if (S.gravador) { e.preventDefault(); S.cancelada = true; parar(); } });
    d.addEventListener("close", () => { if (S.gravador) { S.cancelada = true; parar(); } });
  }

  function bolha(m) {
    if (m.tipo === "resumo") {
      return '<div class="as-resumo' + (m.enviado ? " enviado" : "") + '"><span class="as-eyebrow">Confira o resumo</span>' + S.cfg.resumoHtml(m.resumo, esc) +
        (m.enviado ? '<p class="as-ok">✓ Registrada</p>' : '<footer><button type="button" class="as-link" data-as="ajustar">Quero ajustar</button><button type="button" class="btn btn-primary" data-as="aprovar">Está certo, registrar</button></footer>') + "</div>";
    }
    if (m.tipo === "ok") return '<div class="as-msg ia as-msg-ok"><p>' + esc(m.texto) + "</p></div>";
    return '<div class="as-msg ' + (m.papel === "ia" ? "ia" : "pessoa") + (m.erro ? " erro" : "") + '">' + (m.audio ? '<span class="as-audio">🎙 Áudio</span>' : "") + "<p>" + esc(m.texto) + "</p></div>";
  }
  function pintar(digitando) {
    const host = $(".as-msgs");
    host.innerHTML = S.msgs.map(bolha).join("") + (digitando ? '<div class="as-msg ia as-digitando" aria-label="A assistente está escrevendo"><span></span><span></span><span></span></div>' : "");
    host.scrollTop = host.scrollHeight;
    const ocupado = S.enviando || !!S.gravador;
    $(".as-enviar").disabled = ocupado; $('[data-as="mic"]').disabled = S.enviando; $('[data-as="clipe"]').disabled = ocupado;
  }

  async function chamar(corpo) {
    const { data, error } = await window.supabaseClient.functions.invoke("solicitacao-assistente", { body: { empresa_id: S.ctx.empresa_id, tipo: S.cfg.tipo, ...corpo } });
    if (error) {
      let msg = "";
      try { msg = (await error.context?.json?.())?.erro || ""; } catch (_) {}
      throw new Error(msg || "A assistente não respondeu. Tente de novo em instantes.");
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  async function enviarTexto(texto, audio) {
    texto = String(texto || "").trim();
    if (!texto || S.enviando) return;
    S.msgs.push({ papel: "pessoa", texto, audio: !!audio });
    S.enviando = true; guardar(); pintar(true);
    try {
      const historico = S.msgs.filter((m) => !m.tipo && !m.erro).map((m) => ({ papel: m.papel, texto: m.texto }));
      const r = await chamar({ acao: "conversar", mensagens: historico });
      S.msgs.push({ papel: "ia", texto: r.resposta });
      if (r.pronto && r.resumo) { S.resumo = r.resumo; S.msgs.push({ tipo: "resumo", resumo: r.resumo }); }
    } catch (e) {
      S.msgs.push({ papel: "ia", texto: "Não consegui responder agora (" + e.message + "). Pode mandar de novo?", erro: true });
    } finally { S.enviando = false; guardar(); pintar(false); $("textarea").focus(); }
  }

  async function aprovar() {
    if (!S.resumo || S.enviando) return;
    S.enviando = true; pintar(false);
    const botao = S.dlg.querySelector('[data-as="aprovar"]'); if (botao) { botao.disabled = true; botao.textContent = "Registrando…"; }
    try {
      const msg = await S.cfg.confirmar(S.resumo);
      const ultimo = [...S.msgs].reverse().find((m) => m.tipo === "resumo"); if (ultimo) ultimo.enviado = true;
      S.msgs.push({ tipo: "ok", texto: msg || "Pronto! Sua solicitação foi registrada." });
      S.resumo = null;
      try { sessionStorage.removeItem(chave()); } catch (_) {}
      S.enviando = false; pintar(false);
      return;
    } catch (e) {
      S.msgs.push({ papel: "ia", texto: "Não consegui registrar agora (" + (e.message || e) + "). Tente de novo.", erro: true });
    }
    S.enviando = false; guardar(); pintar(false);
  }

  function recomecar() {
    if (S.gravador) { S.cancelada = true; parar(); }
    S.msgs = [{ papel: "ia", texto: S.cfg.saudacao(primeiroNome()) }]; S.resumo = null; guardar(); pintar(false);
    const t = $("textarea"); t.value = ""; t.placeholder = "Escreva aqui ou grave um áudio…"; t.focus();
  }

  /* ---------- áudio ---------- */
  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { aviso("Este navegador não grava áudio. Grave no celular e use o clipe para enviar o arquivo."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { aviso("Permita o uso do microfone para gravar."); return; }
    const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
    S.pedacos = []; S.cancelada = false; S.gravador = mr; S.inicio = Date.now();
    mr.ondataavailable = (e) => { if (e.data?.size) S.pedacos.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(S.relogio); S.gravador = null;
      if (S.dlg) { $(".as-gravando").hidden = true; $('[data-as="mic"]').classList.remove("gravando"); pintar(false); }
      const blob = new Blob(S.pedacos, { type: mr.mimeType || "audio/webm" });
      if (!S.cancelada) transcrever(blob);
    };
    mr.start(1000);
    $(".as-gravando").hidden = false; $('[data-as="mic"]').classList.add("gravando");
    const tic = () => { const s = Math.floor((Date.now() - S.inicio) / 1000); $('[data-as="tempo"]').textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); if (s >= 180) parar(); };
    tic(); S.relogio = setInterval(tic, 500); pintar(false);
  }
  function parar() { if (S.gravador && S.gravador.state !== "inactive") S.gravador.stop(); }

  async function transcrever(blob) {
    if (!blob || blob.size < 800) { aviso("O áudio ficou curto demais. Fale um pouco mais."); return; }
    if (blob.size > 12 * 1024 * 1024) { aviso("O áudio é grande demais. Mande em partes de até 3 minutos."); return; }
    S.enviando = true; S.msgs.push({ papel: "pessoa", texto: "…", audio: true, provisorio: true }); pintar(true);
    try {
      const dataUrl = await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = erro; fr.readAsDataURL(blob); });
      const r = await chamar({ acao: "transcrever", audio: String(dataUrl).replace(/^data:([^;,]+)[^,]*,/, (m, t) => "data:" + (t.startsWith("audio/") ? t : "audio/webm") + ";base64,") });
      S.msgs = S.msgs.filter((m) => !m.provisorio); S.enviando = false;
      await enviarTexto(r.texto, true);
    } catch (e) {
      S.msgs = S.msgs.filter((m) => !m.provisorio); S.enviando = false;
      aviso("Não consegui entender o áudio (" + e.message + "). Pode mandar de novo ou escrever?");
    }
  }
  function aviso(t) { S.msgs.push({ papel: "ia", texto: t, erro: true }); guardar(); pintar(false); }

  function fechar() { if (S.dlg?.open) S.dlg.close(); }

  async function abrir(cfg) {
    S.cfg = cfg;
    try { S.ctx = await window.aguardarContexto(); } catch (_) {}
    if (!S.ctx?.empresa_id) { window.alerta?.("Não foi possível identificar a empresa.", cfg.titulo, "erro"); return; }
    montar();
    if (!recuperar()) S.msgs = [{ papel: "ia", texto: cfg.saudacao(primeiroNome()) }];
    pintar(false);
    S.dlg.showModal();
    $("textarea").focus();
  }
  window.EasyLocAssistenteSolicitacao = { abrir, fechar };
})();
