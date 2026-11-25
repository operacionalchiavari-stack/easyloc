/* Logística › Câmeras ao vivo (nov/2026; era uma aba do Painel Logístico): central de câmeras das montagens, no jeito de um sistema de segurança.
   Mosaico 1/4/9/16; cada quadro é uma câmera de celular transmitindo pelo app (Modulos/Logistica/CameraApp).
   Cada quadro abre a sua própria conexão WebRTC: pede ("pedido") pelo banco, recebe a oferta do celular, responde e
   troca os candidatos ICE (logistica_camera_sinais; Realtime filtrado por de=cam + consulta a cada 3 s).
   Sai da aba = desliga tudo (não gasta a internet do celular à toa). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sb = () => window.supabaseClient;
  const S = { empresa: null, host: null, cameras: [], layout: Number(localStorage.getItem("pl_cam_layout") || 4), pagina: 0, foco: null,
    quadros: new Map(), canal: null, canalCam: null, vistos: new Set(), ultimo: 0, poll: null, lista: null, ativo: false, pronto: false };

  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  function duracao(iso) {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + "h" + String(m).padStart(2, "0") : m + " min";
  }
  const avatar = (nome, url) => '<span class="plc-av">' + esc(String(nome || "?").trim().charAt(0).toUpperCase()) +
    (/^https?:/i.test(url || "") ? '<img src="' + esc(url) + '" alt="" onerror="this.remove()">' : "") + "</span>";

  // ------------------------------------------------------------ tela
  function montar() {
    S.host.innerHTML =
      '<div class="plc">' +
      '<div class="plc-barra">' +
      '<div class="plc-resumo" id="plcResumo">Carregando câmeras…</div>' +
      '<div class="plc-acoes">' +
      '<div class="plc-layouts" role="group" aria-label="Quantidade de câmeras na tela">' +
      [1, 4, 9, 16].map((n) => '<button type="button" data-layout="' + n + '" aria-label="' + n + (n === 1 ? " câmera" : " câmeras") + '">' + iconeLayout(n) + "</button>").join("") +
      "</div>" +
      '<div class="plc-pag" id="plcPag" hidden><button type="button" data-pag="-1" aria-label="Página anterior">‹</button><span id="plcPagTxt"></span><button type="button" data-pag="1" aria-label="Próxima página">›</button></div>' +
      '<button type="button" class="plc-btn" id="plcTela" aria-label="Tela cheia"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>Tela cheia</button>' +
      "</div></div>" +
      '<div class="plc-mural" id="plcMural"></div>' +
      '<p class="plc-dica">Clique duas vezes numa câmera para ampliar. A equipe liga a câmera pelo app do celular › <b>Câmera ao vivo</b>.</p>' +
      "</div>";
    S.host.querySelector(".plc-layouts").addEventListener("click", (e) => { const b = e.target.closest("[data-layout]"); if (b) { S.foco = null; S.layout = +b.dataset.layout; S.pagina = 0; localStorage.setItem("pl_cam_layout", S.layout); desenhar(); } });
    $("plcPag").addEventListener("click", (e) => { const b = e.target.closest("[data-pag]"); if (b) { S.pagina += +b.dataset.pag; desenhar(); } });
    $("plcTela").addEventListener("click", () => { const el = S.host.querySelector(".plc"); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); });
    $("plcMural").addEventListener("dblclick", (e) => { const q = e.target.closest("[data-cam]"); if (q) focar(q.dataset.cam); });
    $("plcMural").addEventListener("click", (e) => {
      const b = e.target.closest("[data-acao]"); if (!b) return;
      const id = b.closest("[data-cam]")?.dataset.cam;
      if (b.dataset.acao === "ampliar") focar(id);
      else if (b.dataset.acao === "som") alternarSom(id, b);
      else if (b.dataset.acao === "foto") foto(id);
      else if (b.dataset.acao === "recon") reconectar(id);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.foco && S.ativo && !document.fullscreenElement) { S.foco = null; desenhar(); } });
  }
  function iconeLayout(n) {
    const k = Math.sqrt(n), t = 18 / k, r = [];
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) r.push('<rect x="' + (3 + j * t + .8) + '" y="' + (3 + i * t + .8) + '" width="' + (t - 1.6) + '" height="' + (t - 1.6) + '" rx=".8"/>');
    return '<svg viewBox="0 0 24 24">' + r.join("") + "</svg>";
  }
  function focar(id) { S.foco = S.foco === id ? null : id; desenhar(); }

  function visiveis() {
    if (S.foco) { const c = S.cameras.find((x) => x.id === S.foco); if (c) return { lista: [c], vagas: 1 }; S.foco = null; }
    const n = S.layout, total = Math.max(1, Math.ceil(S.cameras.length / n));
    S.pagina = Math.min(Math.max(0, S.pagina), total - 1);
    $("plcPag").hidden = total <= 1;
    $("plcPagTxt").textContent = (S.pagina + 1) + " de " + total;
    return { lista: S.cameras.slice(S.pagina * n, S.pagina * n + n), vagas: n };
  }

  function desenhar() {
    S.host.querySelectorAll("[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(!S.foco && +b.dataset.layout === S.layout)));
    const { lista, vagas } = visiveis();
    const mural = $("plcMural");
    mural.style.setProperty("--plc-col", Math.sqrt(vagas));
    // quadros que saíram da tela: desconecta
    const ids = new Set(lista.filter((c) => c.no_ar).map((c) => c.id));
    [...S.quadros.keys()].forEach((id) => { if (!ids.has(id)) desligar(id); });
    // reaproveita os <video> já conectados
    const existentes = new Map([...mural.querySelectorAll("[data-cam]")].map((el) => [el.dataset.cam, el]));
    const frag = [];
    for (let i = 0; i < vagas; i++) {
      const c = lista[i];
      if (!c) { frag.push(vazio()); continue; }
      let el = existentes.get(c.id);
      if (!el) { el = document.createElement("div"); el.className = "plc-quadro"; el.dataset.cam = c.id; el.innerHTML = '<video autoplay muted playsinline></video><div class="plc-sobre"></div>'; }
      pintarQuadro(el, c);
      frag.push(el);
    }
    // só remonta se mudou (tirar um <video> da página pausa o vídeo); depois garante que todos estão tocando
    const atuais = [...mural.children];
    if (atuais.length !== frag.length || atuais.some((el, i) => el !== frag[i])) mural.replaceChildren(...frag);
    mural.querySelectorAll("video").forEach((v) => { if (v.srcObject && v.paused) v.play().catch(() => {}); });
    lista.forEach((c) => { if (c.no_ar && S.ativo) ligar(c.id); });
  }
  function vazio() { const d = document.createElement("div"); d.className = "plc-quadro plc-vazio"; d.innerHTML = '<span>Sem câmera</span>'; return d; }

  function pintarQuadro(el, c) {
    const q = S.quadros.get(c.id);
    const est = !c.no_ar ? "off" : q?.estado || "conectando";
    el.dataset.estado = est;
    const status = est === "ok" ? '<span class="plc-vivo"><i></i>AO VIVO</span>'
      : est === "off" ? '<span class="plc-off">' + (c.status === "encerrada" ? "Encerrada " + hora(c.encerrada_em) : "Sem sinal desde " + hora(c.visto_em)) + "</span>"
      : '<span class="plc-con">Conectando…</span>';
    el.querySelector(".plc-sobre").innerHTML =
      '<div class="plc-topo">' + status + '<span class="plc-rel">' + (c.no_ar ? esc(duracao(c.iniciada_em)) : "") + "</span>" +
      '<span class="plc-ferr">' +
      (est === "ok" && q?.temSom ? '<button type="button" data-acao="som" aria-label="Ouvir o som" title="Ouvir o som">' + (q.ouvindo ? "🔊" : "🔇") + "</button>" : "") +
      (est === "ok" ? '<button type="button" data-acao="foto" aria-label="Salvar foto" title="Salvar uma foto">📷</button>' : "") +
      (c.no_ar && est !== "ok" ? '<button type="button" data-acao="recon" aria-label="Tentar de novo" title="Tentar de novo">↻</button>' : "") +
      '<button type="button" data-acao="ampliar" aria-label="Ampliar" title="Ampliar">' + (S.foco === c.id ? "⤡" : "⤢") + "</button></span></div>" +
      (est === "falhou" ? '<div class="plc-msg">Não foi possível conectar com este celular.<small>A rede do celular pode estar bloqueando a conexão direta. Tentando de novo…</small></div>' : "") +
      (est === "off" ? '<div class="plc-msg"><b>' + (c.status === "encerrada" ? "Transmissão encerrada" : "Sem sinal") + '</b><small>' + (c.status === "encerrada" ? "" : "O celular parou de transmitir (saiu do app, bloqueou a tela ou ficou sem internet).") + "</small></div>" : "") +
      '<div class="plc-base">' + avatar(c.cliente, c.cliente_foto) +
      '<div><b>' + esc(c.cliente || c.titulo) + '</b><small>' + esc([c.numero ? "Pedido " + c.numero : "", c.tipo ? (c.tipo === "desmontagem" ? "Desmontagem" : "Montagem") : "", c.local].filter(Boolean).join(" · ") || "Câmera da equipe") +
      "</small><small>Filmando: " + esc(c.usuario_nome) + "</small></div></div>";
  }

  // ------------------------------------------------------------ conexão (um quadro = uma conexão)
  function ligar(camId) {
    let q = S.quadros.get(camId);
    if (q && ["conectando", "ok"].includes(q.estado)) return;
    if (q) desligar(camId, true);
    const el = $("plcMural").querySelector('[data-cam="' + camId + '"]'); if (!el) return;
    const me = crypto.randomUUID();
    const pc = new RTCPeerConnection(window.CameraICE);
    q = { me, pc, el, estado: "conectando", fila: [], temSom: false, ouvindo: false, timer: null };
    S.quadros.set(camId, q);
    pc.ontrack = (e) => {
      const v = el.querySelector("video");
      if (v.srcObject !== e.streams[0]) v.srcObject = e.streams[0];
      q.temSom = e.streams[0].getAudioTracks().length > 0;
      v.play().catch(() => {});
    };
    pc.onicecandidate = (e) => { if (e.candidate) sinal(camId, me, "ice", e.candidate.toJSON()); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") { q.estado = "ok"; clearTimeout(q.timer); }
      else if (st === "failed") { q.estado = "falhou"; agendar(camId, 6000); }
      else if (st === "disconnected") { agendar(camId, 8000); }
      atualizar(camId);
    };
    q.timer = setTimeout(() => { if (q.estado !== "ok") { q.estado = "falhou"; atualizar(camId); agendar(camId, 5000); } }, 15000);
    sinal(camId, me, "pedido", null);
    atualizar(camId);
  }
  function agendar(camId, ms) {
    const q = S.quadros.get(camId); if (!q) return;
    clearTimeout(q.retry);
    q.retry = setTimeout(() => { const c = S.cameras.find((x) => x.id === camId); if (S.ativo && c?.no_ar && S.quadros.get(camId) === q && q.pc.connectionState !== "connected") reconectar(camId); }, ms);
  }
  function reconectar(camId) { desligar(camId, true); ligar(camId); }
  function desligar(camId, manterQuadro) {
    const q = S.quadros.get(camId); if (!q) return;
    clearTimeout(q.timer); clearTimeout(q.retry);
    sinal(camId, q.me, "sair", null);
    try { q.pc.close(); } catch (e) { /* já fechada */ }
    const v = q.el?.querySelector("video"); if (v && !manterQuadro) v.srcObject = null;
    S.quadros.delete(camId);
  }
  function atualizar(camId) { const c = S.cameras.find((x) => x.id === camId), el = $("plcMural")?.querySelector('[data-cam="' + camId + '"]'); if (c && el) pintarQuadro(el, c); }
  // o cliente do Supabase só envia quando a resposta é aguardada (then): sem isto a chamada nunca sai
  function sinal(camId, me, tipo, dados) { return sb().rpc("camera_sinal", { p_camera: camId, p_de: me, p_para: "cam", p_tipo: tipo, p_dados: dados }).then((r) => { if (r.error) console.warn("[cameras]", r.error.message); return r; }); }

  async function receber(sig) {
    if (!sig || sig.de !== "cam" || S.vistos.has(sig.id)) return;
    S.vistos.add(sig.id); S.ultimo = Math.max(S.ultimo, sig.id);
    const q = S.quadros.get(sig.camera_id);
    if (!q || q.me !== sig.para) return;
    try {
      if (sig.tipo === "oferta") {
        if (q.pc.signalingState !== "stable") return;
        await q.pc.setRemoteDescription(sig.dados);
        const r = await q.pc.createAnswer(); await q.pc.setLocalDescription(r);
        await sinal(sig.camera_id, q.me, "resposta", { type: q.pc.localDescription.type, sdp: q.pc.localDescription.sdp });
        for (const c of q.fila.splice(0)) { try { await q.pc.addIceCandidate(c); } catch (e) { /* velho */ } }
      } else if (sig.tipo === "ice") {
        if (q.pc.remoteDescription) await q.pc.addIceCandidate(sig.dados); else q.fila.push(sig.dados);
      }
    } catch (e) { console.warn("[cameras]", e); }
  }
  async function buscarSinais() {
    const meus = [...S.quadros.values()].map((q) => q.me);
    if (!meus.length) return;
    const r = await sb().from("logistica_camera_sinais").select("*").eq("de", "cam").in("para", meus).gt("id", S.ultimo).order("id").limit(300);
    (r.data || []).forEach(receber);
  }

  function alternarSom(id) {
    const q = S.quadros.get(id); if (!q) return;
    const v = q.el.querySelector("video"); v.muted = !v.muted; q.ouvindo = !v.muted; atualizar(id);
  }
  function foto(id) {
    const q = S.quadros.get(id), c = S.cameras.find((x) => x.id === id); if (!q) return;
    const v = q.el.querySelector("video"); if (!v.videoWidth) return;
    const cv = document.createElement("canvas"); cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext("2d").drawImage(v, 0, 0);
    const a = document.createElement("a");
    a.download = "camera-pedido-" + (c?.numero || "") + "-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".jpg";
    a.href = cv.toDataURL("image/jpeg", .9); a.click();
  }

  // ------------------------------------------------------------ lista de câmeras
  async function carregar() {
    const r = await sb().rpc("camera_painel", { p_empresa: S.empresa });
    if (r.error) { $("plcResumo").textContent = r.error.message; return; }
    S.cameras = r.data || [];
    const noAr = S.cameras.filter((c) => c.no_ar).length;
    marcarAba(noAr);
    if (!S.host) return;
    $("plcResumo").innerHTML = noAr
      ? '<span class="plc-ponto"></span><b>' + noAr + (noAr === 1 ? " câmera ao vivo" : " câmeras ao vivo") + "</b>" + (S.cameras.length > noAr ? '<small>' + (S.cameras.length - noAr) + " encerrada(s) nas últimas horas</small>" : "")
      : "<b>Nenhuma câmera ao vivo agora</b><small>Quando a equipe ligar a câmera no app, ela aparece aqui sozinha.</small>";
    if (S.ativo) desenhar();
  }
  function marcarAba(n) { document.title = (n ? "(" + n + ") " : "") + "Câmeras ao vivo · Logística"; }

  // ------------------------------------------------------------ ciclo da aba
  async function abrir() {
    const ctx = await window.aguardarContexto();
    S.empresa = ctx.empresa_id;
    if (!S.host) { S.host = $("camHost"); montar(); }
    S.ativo = true;
    if (!S.canal) {
      S.canal = sb().channel("painel-cameras-sinais")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "logistica_camera_sinais", filter: "de=eq.cam" }, (p) => receber(p.new))
        .subscribe();
    }
    clearInterval(S.poll); S.poll = setInterval(buscarSinais, 3000);
    await carregar();
  }
  function pausar() {
    S.ativo = false;
    clearInterval(S.poll); S.poll = null;
    [...S.quadros.keys()].forEach((id) => desligar(id));
    if (S.canal) { sb().removeChannel(S.canal); S.canal = null; }
  }
  // a lista (e a bolinha da aba) atualiza sempre que alguém liga ou desliga uma câmera
  async function vigiar() {
    const ctx = await window.aguardarContexto(); S.empresa = ctx.empresa_id;
    if (S.canalCam) return;
    S.canalCam = sb().channel("painel-cameras-lista")
      .on("postgres_changes", { event: "*", schema: "public", table: "logistica_cameras", filter: "empresa_id=eq." + S.empresa }, () => carregar())
      .subscribe();
    clearInterval(S.lista); S.lista = setInterval(() => { if (!document.hidden) carregar(); }, 15000);
    carregar();
  }
  window.addEventListener("pagehide", pausar);
  window.PainelCameras = { abrir, pausar, vigiar };
  (async () => {
    try { await window.EasyLocPermissions?.load(); await abrir(); await vigiar(); }
    catch (e) { $("camHost").innerHTML = '<p class="plc-erro">' + esc(e.message || "Não foi possível abrir as câmeras.") + "</p>"; }
  })();
})();
