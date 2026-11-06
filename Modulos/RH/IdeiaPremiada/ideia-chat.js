/* Ideia Premiada — conversa com a assistente (nov/2026).
   A pessoa conta a ideia por texto ou áudio; a Edge Function ideia-assistente faz perguntas até entender e devolve um
   resumo (titulo, area, problema, proposta, beneficio). A pessoa aprova e a ideia vai para o RH pela mesma RPC do
   formulário (ideias_premiadas_enviar), caindo em Recebidas na Gestão de Pessoas. A conversa fica na aba do navegador
   (sessionStorage) para não se perder ao recarregar. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const S = { ctx: null, msgs: [], resumo: null, enviando: false, gravador: null, pedacos: [], inicioGravacao: 0, relogio: 0, cancelada: false };
  const chave = () => "ideia_chat:" + (S.ctx?.empresa_id || "") + ":" + (S.ctx?.usuario_id || "");

  function primeiroNome() { return String(S.ctx?.usuario_nome || "").trim().split(/\s+/)[0] || ""; }
  function saudacao() {
    return (primeiroNome() ? "Oi, " + primeiroNome() + "! " : "Oi! ") +
      "Que bom que você quer compartilhar uma ideia. Me conte o que você reparou que pode melhorar e como imagina a solução. Pode escrever ou mandar um áudio.";
  }
  function guardar() { try { sessionStorage.setItem(chave(), JSON.stringify({ msgs: S.msgs, resumo: S.resumo })); } catch (_) {} }
  function recuperar() {
    try { const d = JSON.parse(sessionStorage.getItem(chave()) || "null"); if (d && Array.isArray(d.msgs) && d.msgs.length) { S.msgs = d.msgs; S.resumo = d.resumo || null; return true; } } catch (_) {}
    return false;
  }

  function bolha(m) {
    if (m.tipo === "resumo") return resumoHtml(m.resumo, m.enviado);
    if (m.tipo === "enviado") return '<div class="ideia-msg ia ideia-msg-ok"><p>' + esc(m.texto) + '</p><button type="button" class="ideia-chat-link" data-ver-minhas>Ver em Minhas ideias</button></div>';
    return '<div class="ideia-msg ' + (m.papel === "ia" ? "ia" : "pessoa") + '">' + (m.audio ? '<span class="ideia-msg-audio">🎙 Áudio</span>' : "") + "<p>" + esc(m.texto) + "</p></div>";
  }
  function resumoHtml(r, enviado) {
    if (!r) return "";
    const campo = (t, v) => '<div class="ideia-resumo-campo"><span>' + t + "</span><p>" + esc(v) + "</p></div>";
    return '<div class="ideia-resumo' + (enviado ? " enviado" : "") + '"><header><span class="eyebrow">Resumo da sua ideia</span><h3>' + esc(r.titulo) + '</h3><small>' + esc(r.area) + "</small></header>" +
      campo("O que pode melhorar", r.problema) + campo("A ideia", r.proposta) + campo("Os benefícios", r.beneficio) +
      (enviado ? '<p class="ideia-resumo-ok">✓ Enviada para o RH</p>' : '<footer><button type="button" class="ideia-chat-link" data-ajustar>Quero ajustar</button><button type="button" class="btn primary" data-aprovar>Está certo, enviar para o RH</button></footer>') + "</div>";
  }
  function pintar(digitando) {
    const host = $("ideiaMsgs");
    host.innerHTML = S.msgs.map(bolha).join("") + (digitando ? '<div class="ideia-msg ia ideia-digitando" aria-label="A assistente está escrevendo"><span></span><span></span><span></span></div>' : "");
    host.scrollTop = host.scrollHeight;
    const ocupado = S.enviando || !!S.gravador;
    $("ideiaChatEnviar").disabled = ocupado; $("ideiaMicrofone").disabled = S.enviando; $("ideiaAnexarAudio").disabled = ocupado;
  }

  async function chamar(corpo) {
    const sb = window.supabaseClient;
    const { data, error } = await sb.functions.invoke("ideia-assistente", { body: { empresa_id: S.ctx.empresa_id, ...corpo } });
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
      const historico = S.msgs.filter((m) => !m.tipo).map((m) => ({ papel: m.papel, texto: m.texto }));
      const r = await chamar({ acao: "conversar", mensagens: historico });
      S.msgs.push({ papel: "ia", texto: r.resposta });
      if (r.pronto && r.resumo) { S.resumo = r.resumo; S.msgs.push({ tipo: "resumo", resumo: r.resumo }); }
    } catch (e) {
      S.msgs.push({ papel: "ia", texto: "Não consegui responder agora (" + e.message + "). Pode mandar de novo?", erro: true });
    } finally { S.enviando = false; guardar(); pintar(false); $("ideiaChatTexto").focus(); }
  }

  async function aprovar() {
    if (!S.resumo || S.enviando) return;
    S.enviando = true; pintar(false);
    const botao = document.querySelector("[data-aprovar]"); if (botao) { botao.disabled = true; botao.textContent = "Enviando…"; }
    try {
      const { error } = await window.supabaseClient.rpc("ideias_premiadas_enviar", { p_empresa: S.ctx.empresa_id, p_dados: S.resumo });
      if (error) throw error;
      const ultimo = [...S.msgs].reverse().find((m) => m.tipo === "resumo"); if (ultimo) ultimo.enviado = true;
      S.msgs.push({ tipo: "enviado", texto: "Pronto! Sua ideia foi enviada para o RH. Obrigado por contribuir. Você acompanha a avaliação em Minhas ideias." });
      S.resumo = null;
    } catch (e) {
      S.msgs.push({ papel: "ia", texto: "Não consegui enviar agora (" + (e.message || e) + "). Tente de novo.", erro: true });
    } finally { S.enviando = false; guardar(); pintar(false); }
  }

  function recomecar() {
    if (S.gravador) cancelarGravacao();
    S.msgs = [{ papel: "ia", texto: saudacao() }]; S.resumo = null; guardar(); pintar(false); $("ideiaChatTexto").value = ""; $("ideiaChatTexto").focus();
  }

  /* ---------- áudio (mesmo jeito de gravar da Tecnoweld: opus/webm, ou mp4 no iPhone, arquivo leve) ---------- */
  async function iniciarGravacao() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { aviso("Este navegador não grava áudio. Grave no celular e use o clipe para enviar o arquivo."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { aviso("Permita o uso do microfone para gravar."); return; }
    const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
    S.pedacos = []; S.cancelada = false; S.gravador = mr; S.inicioGravacao = Date.now();
    mr.ondataavailable = (e) => { if (e.data?.size) S.pedacos.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(S.relogio); S.gravador = null; $("ideiaGravando").hidden = true; $("ideiaMicrofone").classList.remove("gravando");
      const blob = new Blob(S.pedacos, { type: mr.mimeType || "audio/webm" });
      pintar(false);
      if (!S.cancelada) transcrever(blob);
    };
    mr.start(1000);
    $("ideiaGravando").hidden = false; $("ideiaMicrofone").classList.add("gravando"); $("ideiaMicrofone").title = "Parar e enviar";
    const atualizar = () => { const s = Math.floor((Date.now() - S.inicioGravacao) / 1000); $("ideiaRecTempo").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); if (s >= 180) pararGravacao(); };
    atualizar(); S.relogio = setInterval(atualizar, 500); pintar(false);
  }
  function pararGravacao() { if (S.gravador && S.gravador.state !== "inactive") S.gravador.stop(); $("ideiaMicrofone").title = "Gravar áudio"; }
  function cancelarGravacao() { S.cancelada = true; pararGravacao(); }

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
      S.msgs.push({ papel: "ia", texto: "Não consegui entender o áudio (" + e.message + "). Pode mandar de novo ou escrever?", erro: true });
      guardar(); pintar(false);
    }
  }
  function aviso(t) { S.msgs.push({ papel: "ia", texto: t, erro: true }); guardar(); pintar(false); }

  function ligar() {
    $("ideiaChatForm").addEventListener("submit", (e) => { e.preventDefault(); const t = $("ideiaChatTexto"); const v = t.value; t.value = ""; t.style.height = ""; enviarTexto(v); });
    $("ideiaChatTexto").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("ideiaChatForm").requestSubmit(); } });
    $("ideiaChatTexto").addEventListener("input", (e) => { const t = e.target; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; });
    $("ideiaMicrofone").addEventListener("click", () => (S.gravador ? pararGravacao() : iniciarGravacao()));
    $("ideiaRecCancelar").addEventListener("click", cancelarGravacao);
    $("ideiaAnexarAudio").addEventListener("click", () => $("ideiaAudioArquivo").click());
    $("ideiaAudioArquivo").addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) transcrever(f); });
    $("ideiaRecomecar").addEventListener("click", recomecar);
    $("ideiaMsgs").addEventListener("click", (e) => {
      if (e.target.closest("[data-aprovar]")) aprovar();
      else if (e.target.closest("[data-ajustar]")) { const t = $("ideiaChatTexto"); t.placeholder = "Diga o que quer mudar no resumo…"; t.focus(); }
      else if (e.target.closest("[data-ver-minhas]")) $("tabMinhas")?.click();
    });
    $("ideiaUsarFormulario").addEventListener("click", () => { $("ideiaChat").hidden = true; $("formIdeia").hidden = false; });
    $("ideiaVoltarChat")?.addEventListener("click", () => { $("formIdeia").hidden = true; $("ideiaChat").hidden = false; });
  }

  async function iniciar() {
    if (document.documentElement.classList.contains("ideia-embutida")) return; // na Gestão de Pessoas não há envio
    ligar();
    try { S.ctx = await window.aguardarContexto(); } catch (_) {}
    if (!S.ctx?.empresa_id) return;
    if (!recuperar()) S.msgs = [{ papel: "ia", texto: saudacao() }];
    pintar(false);
  }
  window.IdeiaChat = { recomecar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
