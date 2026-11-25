/* Câmera ao vivo (nov/2026) — o celular da equipe transmite a montagem.
   1) lista as montagens/desmontagens de ontem, hoje e amanhã (RPC camera_etapas: a pessoa escalada vê as dela;
      Supervisor de Montagem e Logística veem todas); 2) tela de permissão; 3) ao vivo.
   Cada pessoa que assiste no Painel Logístico pede uma conexão ("pedido"); o celular cria uma conexão WebRTC só para
   ela, manda a oferta e troca os candidatos ICE pelo banco (logistica_camera_sinais, Realtime + consulta a cada 3 s).
   A tela fica acesa (Wake Lock) e a câmera volta sozinha se o celular a desligar ao sair e voltar para o app. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const sb = window.supabaseClient;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const APP = "../../../app.html#inicio";
  const s = { empresa: null, etapas: [], etapa: null, cam: null, stream: null, pcs: new Map(), filas: new Map(), canal: null,
    vistos: new Set(), ultimo: 0, ping: null, poll: null, relogio: null, inicio: 0, wake: null, facing: "environment", som: false, encerrando: false };

  function tela(id) {
    ["cmLista", "cmPermissao", "cmAoVivo"].forEach((x) => ($(x).hidden = x !== id));
    document.body.classList.toggle("cm-modo-vivo", id === "cmAoVivo");
    window.AppCarregamento?.pronto();
  }
  function mensagem(t, ok) { const m = $("cmMensagem"); m.hidden = !t; m.textContent = t || ""; m.classList.toggle("ok", !!ok); }
  // o cliente do Supabase só envia quando a resposta é aguardada (then): sem isto a chamada nunca sai
  const disparar = (q) => q.then((r) => { if (r?.error) console.warn("[camera]", r.error.message); return r; });
  async function rpc(nome, args) { const r = await sb.rpc(nome, args); if (r.error) throw Error(r.error.message); return r.data; }
  const data = (v) => (v ? String(v).slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");
  function dia(v) {
    const hoje = new Date(); const d = new Date(String(v).slice(0, 10) + "T12:00:00");
    const dif = Math.round((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12)) / 864e5);
    return dif === 0 ? "Hoje" : dif === 1 ? "Amanhã" : dif === -1 ? "Ontem" : data(v);
  }
  const avatar = (nome, url) => '<span class="cm-avatar">' + esc(String(nome || "?").trim().charAt(0).toUpperCase()) +
    (/^https?:/i.test(url || "") ? '<img src="' + esc(url) + '" alt="" onerror="this.remove()">' : "") + "</span>";

  // ---------------------------------------------------------------- entrar
  async function iniciar() {
    const { data: ses } = await sb.auth.getSession();
    const user = ses?.session?.user;
    if (!user) { location.replace(APP); return; }
    if (window.EasyLoc2FA && !(await window.EasyLoc2FA.garantir({ supabase: sb }))) { location.replace(APP); return; }
    let empresa = sessionStorage.getItem("empresa_id") || localStorage.getItem("acervo_ultima_empresa");
    if (!empresa) {
      const r = await sb.from("usuarios_empresas").select("empresa_id").eq("user_id", user.id).limit(1);
      empresa = r.data?.[0]?.empresa_id;
    }
    if (!empresa) throw Error("Seu usuário não está vinculado a uma empresa.");
    s.empresa = empresa;
    await carregarEtapas();
  }

  async function carregarEtapas() {
    mensagem("");
    try { s.etapas = await rpc("camera_etapas", { p_empresa: s.empresa }); }
    catch (e) { $("cmEtapas").innerHTML = '<p class="cm-vazio">' + esc(e.message) + "</p>"; tela("cmLista"); return; }
    $("cmEtapas").innerHTML = s.etapas.length ? s.etapas.map((e, i) =>
      '<button type="button" class="cm-etapa cm-' + esc(e.tipo) + '" data-i="' + i + '">' +
      '<span class="cm-etapa-faixa"><b>' + esc(e.hora || "--:--") + "</b><small>" + esc(dia(e.data)) + "</small><small>" + esc(e.tipo === "desmontagem" ? "Desmontagem" : "Montagem") + "</small></span>" +
      '<span class="cm-etapa-corpo">' + avatar(e.cliente, e.cliente_foto) +
      '<span class="cm-etapa-texto"><b>' + esc(e.cliente || e.nome || "Montagem") + "</b><small>" + (e.numero ? "Pedido " + esc(e.numero) + " · " : "") + esc(e.local || "") + "</small>" +
      (e.ao_vivo ? '<i class="cm-selo-vivo">● No ar</i>' : e.escalado ? '<i class="cm-selo">Você está escalado</i>' : "") + "</span></span></button>").join("")
      : '<p class="cm-vazio">Nenhuma montagem ou desmontagem para ontem, hoje ou amanhã.</p>';
    tela("cmLista");
  }

  function escolher(e) {
    s.etapa = e;
    $("cmEvento").innerHTML = avatar(e.cliente, e.cliente_foto) + '<div><small>' + esc((e.tipo === "desmontagem" ? "Desmontagem" : "Montagem") + " · " + dia(e.data) + (e.hora ? " às " + e.hora : "")) +
      "</small><b>" + esc(e.cliente || e.nome || "") + "</b><span>" + (e.numero ? "Pedido " + esc(e.numero) + " · " : "") + esc(e.local || "") + "</span></div>";
    tela("cmPermissao");
    history.pushState({ cm: "permissao" }, "");
  }

  // ---------------------------------------------------------------- câmera
  async function abrirCamera() {
    const video = { facingMode: { ideal: s.facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 20 } };
    return navigator.mediaDevices.getUserMedia({ video, audio: s.som ? { echoCancellation: true, noiseSuppression: true } : false });
  }
  function erroCamera(e) {
    if (e?.name === "NotAllowedError") return "A câmera foi bloqueada. Libere em Configurações do celular › Apps › (navegador ou Acervo) › Permissões › Câmera, e tente de novo.";
    if (e?.name === "NotFoundError") return "Este celular não tem câmera disponível.";
    if (e?.name === "NotReadableError") return "A câmera está sendo usada por outro app. Feche o outro app e tente de novo.";
    if (!navigator.mediaDevices?.getUserMedia) return "Este navegador não permite usar a câmera. Abra pelo Chrome (Android) ou Safari (iPhone).";
    return e?.message || "Não foi possível abrir a câmera.";
  }

  async function comecar() {
    const btn = $("cmComecar"); btn.disabled = true; btn.textContent = "Abrindo a câmera…"; mensagem("");
    s.som = $("cmSom").checked;
    try {
      s.stream = await abrirCamera();
    } catch (e) { mensagem(erroCamera(e)); btn.disabled = false; btn.textContent = "Permitir e começar a transmitir"; return; }
    try {
      const r = await rpc("camera_iniciar", { p_empresa: s.empresa, p_etapa: s.etapa.id, p_aparelho: navigator.userAgent.slice(0, 120) });
      s.cam = r.id;
    } catch (e) { pararStream(); mensagem(e.message); btn.disabled = false; btn.textContent = "Permitir e começar a transmitir"; return; }
    btn.disabled = false; btn.textContent = "Permitir e começar a transmitir";
    $("cmVideo").srcObject = s.stream;
    $("cmInfo").innerHTML = "<b>" + esc(s.etapa.cliente || "") + "</b><span>" + (s.etapa.numero ? "Pedido " + esc(s.etapa.numero) + " · " : "") + esc(s.etapa.local || "") + "</span>";
    pintarMicro(); tela("cmAoVivo"); history.replaceState({ cm: "vivo" }, "");
    s.inicio = Date.now(); s.vistos = new Set(); s.ultimo = 0;
    clearInterval(s.relogio); s.relogio = setInterval(pintarTempo, 1000); pintarTempo();
    await manterTelaAcesa();
    ouvirSinais();
    clearInterval(s.ping); s.ping = setInterval(() => { if (s.cam) disparar(sb.rpc("camera_ping", { p_camera: s.cam })); }, 20000);
    pintarAssistindo();
  }

  function pintarTempo() {
    const seg = Math.floor((Date.now() - s.inicio) / 1000);
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), x = seg % 60;
    $("cmTempo").textContent = (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0");
  }
  function pintarAssistindo() {
    const n = [...s.pcs.values()].filter((pc) => pc.connectionState === "connected").length;
    $("cmAssistindo").textContent = n === 0 ? "Ninguém assistindo" : n === 1 ? "1 pessoa assistindo" : n + " pessoas assistindo";
    $("cmAssistindo").classList.toggle("on", n > 0);
    ajustarQualidade();
  }
  function pintarMicro() {
    const temAudio = !!s.stream?.getAudioTracks().length;
    $("cmMicro").hidden = !temAudio;
    const ligado = temAudio && s.stream.getAudioTracks()[0].enabled;
    $("cmMicro").classList.toggle("off", !ligado);
    $("cmMicroTxt").textContent = ligado ? "Som ligado" : "Som mudo";
  }

  async function manterTelaAcesa() {
    try { if ("wakeLock" in navigator) { s.wake = await navigator.wakeLock.request("screen"); } } catch (e) { /* sem suporte: avisa abaixo */ }
    $("cmAviso").hidden = !!s.wake;
    if (!s.wake) $("cmAviso").textContent = "Este celular não deixa o app manter a tela acesa. Desligue o bloqueio automático da tela nas configurações.";
  }

  // ---------------------------------------------------------------- sinalização
  function ouvirSinais() {
    if (s.canal) sb.removeChannel(s.canal);
    s.canal = sb.channel("camera-" + s.cam)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logistica_camera_sinais", filter: "camera_id=eq." + s.cam }, (p) => receber(p.new))
      .subscribe();
    clearInterval(s.poll);
    s.poll = setInterval(buscarSinais, 3000);
    buscarSinais();
  }
  async function buscarSinais() {
    if (!s.cam) return;
    const r = await sb.from("logistica_camera_sinais").select("*").eq("camera_id", s.cam).eq("para", "cam").gt("id", s.ultimo).order("id").limit(200);
    (r.data || []).forEach(receber);
  }
  function enviar(para, tipo, dados) {
    return disparar(sb.rpc("camera_sinal", { p_camera: s.cam, p_de: "cam", p_para: para, p_tipo: tipo, p_dados: dados || null }));
  }
  async function receber(sig) {
    if (!sig || sig.para !== "cam" || s.vistos.has(sig.id)) return;
    s.vistos.add(sig.id); s.ultimo = Math.max(s.ultimo, sig.id);
    if (Date.now() - new Date(sig.criado_em).getTime() > 60000 && sig.tipo === "pedido") return; // pedido velho
    const quem = sig.de;
    try {
      if (sig.tipo === "pedido") await conectar(quem);
      else if (sig.tipo === "resposta") { const pc = s.pcs.get(quem); if (pc && pc.signalingState === "have-local-offer") { await pc.setRemoteDescription(sig.dados); await soltarFila(quem); } }
      else if (sig.tipo === "ice") { const pc = s.pcs.get(quem); if (!pc) return; if (pc.remoteDescription) await pc.addIceCandidate(sig.dados); else (s.filas.get(quem) || s.filas.set(quem, []).get(quem)).push(sig.dados); }
      else if (sig.tipo === "sair") fechar(quem);
    } catch (e) { console.warn("[camera]", e); }
  }
  async function soltarFila(quem) {
    const pc = s.pcs.get(quem), fila = s.filas.get(quem) || [];
    s.filas.delete(quem);
    for (const c of fila) { try { await pc.addIceCandidate(c); } catch (e) { /* candidato velho */ } }
  }
  async function conectar(quem) {
    fechar(quem);
    const pc = new RTCPeerConnection(window.CameraICE);
    s.pcs.set(quem, pc);
    s.stream.getTracks().forEach((t) => pc.addTrack(t, s.stream));
    pc.onicecandidate = (e) => { if (e.candidate) enviar(quem, "ice", e.candidate.toJSON()); };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) fechar(quem);
      pintarAssistindo();
    };
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await enviar(quem, "oferta", { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    ajustarQualidade();
  }
  function fechar(quem) {
    const pc = s.pcs.get(quem);
    if (pc) { try { pc.close(); } catch (e) { /* já fechada */ } }
    s.pcs.delete(quem); s.filas.delete(quem);
    pintarAssistindo();
  }
  // Cada pessoa assistindo é um envio separado: com mais gente, cada envio fica mais leve para caber no 4G.
  function ajustarQualidade() {
    const n = Math.max(1, s.pcs.size);
    const max = n === 1 ? 1200000 : n === 2 ? 800000 : n <= 4 ? 500000 : 300000;
    s.pcs.forEach((pc) => pc.getSenders().forEach((snd) => {
      if (snd.track?.kind !== "video") return;
      const p = snd.getParameters(); if (!p.encodings?.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = max; snd.setParameters(p).catch(() => {});
    }));
  }

  // ---------------------------------------------------------------- trocar câmera / som / voltar ao app
  async function trocarTrilhas(novo) {
    const antigo = s.stream;
    s.stream = novo; $("cmVideo").srcObject = novo;
    s.pcs.forEach((pc) => pc.getSenders().forEach((snd) => {
      const t = novo.getTracks().find((x) => x.kind === snd.track?.kind);
      if (t) snd.replaceTrack(t).catch(() => {});
    }));
    antigo?.getTracks().forEach((t) => { if (!novo.getTracks().includes(t)) t.stop(); });
    pintarMicro(); ajustarQualidade();
  }
  async function trocarCamera() {
    s.facing = s.facing === "environment" ? "user" : "environment";
    s.stream?.getVideoTracks().forEach((t) => t.stop());
    try { await trocarTrilhas(await abrirCamera()); }
    catch (e) { s.facing = s.facing === "environment" ? "user" : "environment"; mensagem(erroCamera(e)); try { await trocarTrilhas(await abrirCamera()); } catch (x) { /* fica sem */ } }
  }
  function alternarSom() { const t = s.stream?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; pintarMicro(); } }

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !s.cam) return;
    await manterTelaAcesa();
    disparar(sb.rpc("camera_ping", { p_camera: s.cam }));
    const parada = !s.stream || s.stream.getVideoTracks().every((t) => t.readyState === "ended" || t.muted);
    if (parada) { try { await trocarTrilhas(await abrirCamera()); } catch (e) { mensagem(erroCamera(e)); } }
    $("cmAviso").hidden = false;
    $("cmAviso").textContent = "A transmissão ficou parada enquanto você esteve fora do app.";
    setTimeout(() => { if (s.wake) $("cmAviso").hidden = true; }, 6000);
  });

  function pararStream() { s.stream?.getTracks().forEach((t) => t.stop()); s.stream = null; }
  async function encerrar(semPerguntar) {
    if (!semPerguntar) {
      const d = $("cmConfirmar"); d.returnValue = "nao"; d.showModal();
      const r = await new Promise((ok) => d.addEventListener("close", () => ok(d.returnValue), { once: true }));
      if (r !== "sim") return;
    }
    s.encerrando = true;
    const id = s.cam; s.cam = null;
    clearInterval(s.ping); clearInterval(s.poll); clearInterval(s.relogio);
    if (s.canal) { sb.removeChannel(s.canal); s.canal = null; }
    [...s.pcs.keys()].forEach(fechar);
    pararStream();
    try { await s.wake?.release(); } catch (e) { /* já solto */ } s.wake = null;
    if (id) await sb.rpc("camera_encerrar", { p_camera: id });
    s.encerrando = false;
    await carregarEtapas();
    mensagem("Transmissão encerrada.", true);
  }

  // ---------------------------------------------------------------- eventos
  $("cmEtapas").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) escolher(s.etapas[+b.dataset.i]); });
  $("cmComecar").addEventListener("click", comecar);
  $("cmCancelar").addEventListener("click", () => history.back());
  $("cmTrocar").addEventListener("click", trocarCamera);
  $("cmMicro").addEventListener("click", alternarSom);
  $("cmEncerrar").addEventListener("click", () => encerrar(false));
  $("cmAtualizar").addEventListener("click", () => { if (!s.cam) carregarEtapas(); });
  $("cmVoltar").addEventListener("click", () => {
    if (s.cam) return encerrar(false);
    if (!$("cmPermissao").hidden) return history.back();
    location.href = APP;
  });
  window.addEventListener("popstate", () => {
    if (s.cam) { history.pushState({ cm: "vivo" }, ""); encerrar(false); return; } // o voltar do celular não derruba sem perguntar
    if (!$("cmPermissao").hidden) { tela("cmLista"); mensagem(""); }
  });
  window.addEventListener("pagehide", () => { if (s.cam) disparar(sb.rpc("camera_encerrar", { p_camera: s.cam })); });

  iniciar().catch((e) => { $("cmEtapas").innerHTML = '<p class="cm-vazio">' + esc(e.message) + "</p>"; tela("cmLista"); });
})();
