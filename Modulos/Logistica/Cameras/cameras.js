/* Logística › Câmeras ao vivo (nov/2026; era uma aba do Painel Logístico): as câmeras de celular que a equipe liga pelo app
   (Modulos/Logistica/CameraApp). Tela clara, onde prevalece a imagem: só as câmeras no ar, cada uma do maior tamanho que
   cabe na tela (calculado em grade()), em Horizontal (16:9) ou Vertical (9:16), escolha lembrada no navegador.
   Cada quadro abre a sua própria conexão WebRTC: pede ("pedido") pelo banco, recebe a oferta do celular, responde e
   troca os candidatos ICE (logistica_camera_sinais; Realtime filtrado por de=cam + consulta a cada 3 s).
   Fechar a tela = desliga tudo (não gasta a internet do celular à toa). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sb = () => window.supabaseClient;
  const S = { empresa: null, host: null, cameras: [], formato: localStorage.getItem("cam_formato") === "vertical" ? "vertical" : "horizontal", foco: null,
    quadros: new Map(), canal: null, canalCam: null, vistos: new Set(), ultimo: 0, poll: null, lista: null, ativo: false, redim: null };
  const LEGENDA = 78, GAP = 16; // altura da legenda embaixo de cada imagem e espaço entre as câmeras

  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  function duracao(iso) {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + "h" + String(m).padStart(2, "0") : m + " min";
  }
  const avatar = (nome, url) => '<span class="plc-av">' + esc(String(nome || "?").trim().charAt(0).toUpperCase()) +
    (/^https?:/i.test(url || "") ? '<img src="' + esc(url) + '" alt="" onerror="this.remove()">' : "") + "</span>";
  const ICONE = {
    horizontal: '<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="18" height="11" rx="2"/></svg>',
    vertical: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2"/></svg>',
    tela: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/></svg>',
  };

  // ------------------------------------------------------------ tela
  function montar() {
    S.host.innerHTML =
      '<div class="plc">' +
      '<div class="plc-barra">' +
      '<div class="plc-resumo" id="plcResumo">Carregando câmeras…</div>' +
      '<div class="plc-acoes">' +
      '<div class="plc-formato" role="group" aria-label="Formato da imagem">' +
      '<button type="button" data-formato="horizontal">' + ICONE.horizontal + 'Horizontal</button>' +
      '<button type="button" data-formato="vertical">' + ICONE.vertical + 'Vertical</button></div>' +
      '<button type="button" class="plc-btn" id="plcQualidade" hidden>Qualidade</button>' +
      '<button type="button" class="plc-btn" id="plcTela">' + ICONE.tela + 'Tela cheia</button>' +
      "</div></div>" +
      '<div class="plc-alertas" id="plcAlertas" hidden></div>' +
      '<div class="plc-mural" id="plcMural"></div>' +
      '<div class="plc-encerradas" id="plcEncerradas" hidden></div>' +
      "</div>";
    S.host.querySelector(".plc-formato").addEventListener("click", (e) => {
      const b = e.target.closest("[data-formato]"); if (!b) return;
      S.formato = b.dataset.formato; localStorage.setItem("cam_formato", S.formato); desenhar();
    });
    $("plcQualidade").addEventListener("click", abrirQualidade);
    $("plcTela").addEventListener("click", () => { const el = S.host.querySelector(".plc"); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); });
    document.addEventListener("fullscreenchange", () => setTimeout(medir, 60));
    window.addEventListener("resize", () => { clearTimeout(S.redim); S.redim = setTimeout(medir, 80); });
    $("plcMural").addEventListener("dblclick", (e) => { const q = e.target.closest("[data-cam]"); if (q && !e.target.closest("button")) focar(q.dataset.cam); });
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
  function focar(id) { S.foco = S.foco === id ? null : id; desenhar(); }

  // Quantas colunas deixam cada imagem maior: testa de 1 até n colunas e fica com a que dá a imagem mais larga que cabe
  // na largura e na altura disponíveis (a legenda fica embaixo de cada imagem).
  function grade(n, W, H, proporcao) {
    let melhor = { cols: 1, larg: 0 };
    for (let cols = 1; cols <= Math.max(1, n); cols++) {
      const linhas = Math.ceil(n / cols);
      const pelaLargura = (W - GAP * (cols - 1)) / cols;
      const pelaAltura = ((H - GAP * (linhas - 1)) / linhas - LEGENDA) * proporcao;
      const larg = Math.floor(Math.min(pelaLargura, pelaAltura));
      if (larg > melhor.larg) melhor = { cols, larg };
    }
    return melhor;
  }
  function medir() {
    const mural = $("plcMural"); if (!mural) return;
    const n = mural.querySelectorAll("[data-cam]").length;
    if (!n) { mural.style.gridTemplateColumns = ""; return; }
    const proporcao = S.formato === "vertical" ? 9 / 16 : 16 / 9;
    const topo = mural.getBoundingClientRect().top;
    const W = mural.clientWidth, H = Math.max(320, window.innerHeight - topo - (document.fullscreenElement ? 16 : 28));
    const g = grade(n, W, H, proporcao);
    mural.style.gridTemplateColumns = "repeat(" + g.cols + ", " + Math.max(180, g.larg) + "px)";
  }

  function desenhar() {
    S.host.querySelectorAll("[data-formato]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.formato === S.formato)));
    const noAr = S.cameras.filter((c) => c.no_ar || semConexao(c));
    let lista = noAr;
    if (S.foco) { const c = noAr.find((x) => x.id === S.foco); if (c) lista = [c]; else S.foco = null; }
    pintarAlertas();
    const mural = $("plcMural");
    mural.dataset.formato = S.formato;
    const ids = new Set(lista.map((c) => c.id));
    [...S.quadros.keys()].forEach((id) => { if (!ids.has(id)) desligar(id); });
    const existentes = new Map([...mural.querySelectorAll("[data-cam]")].map((el) => [el.dataset.cam, el]));
    const frag = lista.map((c) => {
      let el = existentes.get(c.id);
      if (!el) {
        el = document.createElement("article"); el.className = "plc-quadro"; el.dataset.cam = c.id;
        el.innerHTML = '<div class="plc-img"><video autoplay muted playsinline></video><div class="plc-sobre"></div></div><div class="plc-leg"></div>';
      }
      pintarQuadro(el, c);
      return el;
    });
    if (!frag.length) {
      let v = mural.querySelector(".plc-nada");
      if (!v) {
        v = document.createElement("div"); v.className = "plc-nada";
        v.innerHTML = '<span class="plc-nada-icone">' + ICONE.camera + '</span><h2>Nenhuma câmera ligada agora</h2>' +
          '<p>Quando alguém da equipe tocar em <b>Câmera ao vivo</b> no app do celular, a imagem aparece aqui sozinha.</p>';
      }
      frag.push(v);
    }
    // só remonta se mudou (tirar um <video> da página pausa o vídeo); depois garante que todos estão tocando
    const atuais = [...mural.children];
    if (atuais.length !== frag.length || atuais.some((el, i) => el !== frag[i])) mural.replaceChildren(...frag);
    mural.querySelectorAll("video").forEach((v) => { if (v.srcObject && v.paused) v.play().catch(() => {}); });
    medir();
    if (S.ativo) lista.forEach((c) => { if (c.no_ar) ligar(c.id); });
    // as que já saíram do ar ficam só numa linha discreta embaixo
    const fora = S.cameras.filter((c) => !c.no_ar && !semConexao(c));
    $("plcEncerradas").hidden = !fora.length;
    $("plcEncerradas").innerHTML = fora.length ? "<b>Saíram do ar há pouco:</b> " + fora.slice(0, 8).map((c) =>
      esc(c.cliente || c.titulo) + " <small>(" + esc(c.status === "encerrada" ? "encerrada às " + hora(c.encerrada_em) : "sem sinal desde " + hora(c.visto_em)) + ")</small>").join(" · ") : "";
  }

  const ROTULO = { ao_vivo: "Ao vivo", conectando: "Conectando", reconectando: "Reconectando", instavel: "Conexão instável",
    camera_indisponivel: "Câmera indisponível", pausada: "Pausada para foto", sem_conexao: "Sem conexão", encerrada: "Transmissão encerrada" };
  const semConexao = (c) => !c.no_ar && c.status === "ao_vivo" && Date.now() - new Date(c.visto_em) < 30 * 60000;
  // estado mostrado: o do aparelho (app Android manda no batimento) + o desta tela (a conexão de vídeo com o celular)
  function estadoDe(c, q) {
    if (!c.no_ar) return "sem_conexao";
    const e = c.origem === "android" ? c.estado : null;
    if (["camera_indisponivel", "pausada", "reconectando", "sem_conexao"].includes(e)) return e;
    if (q?.estado === "ok") return e === "instavel" ? "instavel" : "ao_vivo";
    if (q?.estado === "falhou") return "reconectando";
    return "conectando";
  }
  function telemetria(c) {
    const t = c.telemetria || {}, p = [];
    if (c.origem === "android") {
      if (t.bateria >= 0) p.push("Bateria " + t.bateria + "%" + (t.carregando ? " carregando" : ""));
      if (t.temperatura != null) p.push(String(t.temperatura).replace(".", ",") + " °C");
      if (t.rede) p.push(({ wifi: "Wi-Fi", celular: "Rede móvel", cabo: "Cabo", sem: "Sem rede" }[t.rede] || t.rede) + (t.rede_qualidade && t.rede_qualidade !== "sem" ? " " + t.rede_qualidade : ""));
      if (t.resolucao) p.push(t.resolucao.replace("x", "×") + (t.fps ? " · " + t.fps + " fps" : ""));
      if (t.tela_ligada === false) p.push("tela apagada"); else if (t.tela_ligada) p.push("tela ligada");
      if (t.codec) p.push(t.codec + (t.compatibilidade ? " (compatibilidade)" : ""));
      if (t.luz >= 0 && t.luz < 12) p.push("imagem muito escura na câmera");
    } else p.push("Pelo navegador");
    const s = Math.max(0, Math.round((Date.now() - new Date(c.visto_em)) / 1000));
    p.push("sinal há " + (s < 60 ? s + " s" : Math.round(s / 60) + " min"));
    return p.join(" · ");
  }

  function pintarQuadro(el, c) {
    const q = S.quadros.get(c.id);
    const est = estadoDe(c, q);
    el.dataset.estado = q?.estado || "conectando";
    el.dataset.situacao = est;
    const status = est === "ao_vivo" ? '<span class="plc-vivo"><i></i>Ao vivo · ' + esc(duracao(c.iniciada_em)) + "</span>"
      : '<span class="plc-con plc-' + est + '">' + esc(ROTULO[est] || "Conectando") + "</span>";
    const motivo = (c.telemetria || {}).motivo;
    const aviso = est === "sem_conexao" ? ["Sem conexão desde " + hora(c.visto_em), "O celular parou de enviar sinal (sem internet, app fechado ou encerrado pelo Android)."]
      : est === "camera_indisponivel" ? ["Câmera indisponível", motivo || "A câmera do celular está sendo reaberta."]
      : est === "pausada" ? ["Pausada para foto", "Volta sozinha quando a foto terminar."]
      : q?.estado === "falhou" ? ["Não foi possível conectar", "A rede do celular pode estar bloqueando a conexão. Tentando de novo…"] : null;
    el.querySelector(".plc-sobre").innerHTML =
      '<div class="plc-topo">' + status +
      '<span class="plc-ferr">' +
      (q?.estado === "ok" && q?.temSom ? '<button type="button" data-acao="som" title="' + (q.ouvindo ? "Silenciar" : "Ouvir o som") + '">' + (q.ouvindo ? "🔊" : "🔇") + "</button>" : "") +
      (q?.estado === "ok" ? '<button type="button" data-acao="foto" title="Salvar uma foto">📷</button>' : "") +
      (c.no_ar && q?.estado !== "ok" ? '<button type="button" data-acao="recon" title="Tentar de novo">↻</button>' : "") +
      '<button type="button" data-acao="ampliar" title="' + (S.foco === c.id ? "Voltar para todas" : "Ampliar") + '">' + (S.foco === c.id ? "⤡" : "⤢") + "</button></span></div>" +
      (aviso ? '<div class="plc-msg"><b>' + esc(aviso[0]) + "</b><small>" + esc(aviso[1]) + "</small></div>" : "");
    el.classList.toggle("plc-coberto", !!aviso && est !== "instavel");
    el.querySelector(".plc-leg").innerHTML = avatar(c.cliente || c.usuario_nome, c.cliente_foto) +
      "<div><b>" + esc(c.cliente || c.titulo) + "</b><small>" +
      esc([c.numero ? "Pedido " + c.numero : "", c.tipo ? (c.tipo === "desmontagem" ? "Desmontagem" : "Montagem") : "", c.local, c.usuario_nome, "desde " + hora(c.iniciada_em)].filter(Boolean).join(" · ")) +
      '</small><small class="plc-tel">' + esc(telemetria(c)) + "</small></div>";
  }

  // Alertas: bateria, calor, perda de conexão e interrupção
  function pintarAlertas() {
    const a = [];
    S.cameras.forEach((c) => {
      const t = c.telemetria || {}, nome = c.cliente || c.titulo;
      if (c.no_ar && t.bateria >= 0 && !t.carregando && t.bateria < 10) a.push(["grave", nome + ": bateria em " + t.bateria + "%"]);
      else if (c.no_ar && t.bateria >= 0 && !t.carregando && t.bateria < 20) a.push(["", nome + ": bateria em " + t.bateria + "%"]);
      if (c.no_ar && (t.temperatura >= 42 || t.termico >= 3)) a.push(["grave", nome + ": celular quente" + (t.temperatura != null ? " (" + String(t.temperatura).replace(".", ",") + " °C)" : "") + ", qualidade reduzida"]);
      if (semConexao(c)) a.push(["grave", nome + ": sem conexão desde " + hora(c.visto_em)]);
      if (c.status === "encerrada" && ["android", "erro"].includes(c.motivo_fim) && Date.now() - new Date(c.encerrada_em) < 30 * 60000)
        a.push(["grave", nome + ": transmissão interrompida às " + hora(c.encerrada_em)]);
    });
    const box = $("plcAlertas");
    box.hidden = !a.length;
    box.innerHTML = a.map(([g, txt]) => '<span class="plc-alerta' + (g ? " grave" : "") + '">' + esc(txt) + "</span>").join("");
  }

  // Qualidade da transmissão (app Android): só quem edita o planejamento logístico
  async function carregarQualidade() {
    const r = await sb().rpc("camera_config", { p_empresa: S.empresa });
    if (!r.error) { S.config = r.data; $("plcQualidade").hidden = !r.data.pode_editar; }
  }
  async function abrirQualidade() {
    const c = S.config || {};
    let d = $("plcQualidadeDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "plcQualidadeDlg"; d.className = "plc-dlg"; document.body.appendChild(d); }
    const op = (v, lista) => lista.map(([k, n]) => '<option value="' + k + '"' + (String(k) === String(v) ? " selected" : "") + ">" + n + "</option>").join("");
    d.innerHTML = '<form method="dialog"><h2>Qualidade da transmissão</h2><p>Vale para o app Android, na próxima vez que a câmera for ligada. Menos qualidade gasta menos bateria e internet.</p>' +
      '<label>Resolução<select name="resolucao">' + op(c.resolucao || "480p", [["360p", "360p (econômica)"], ["480p", "480p (padrão)"], ["720p", "720p (mais nítida)"]]) + "</select></label>" +
      '<label>Quadros por segundo<select name="fps">' + op(c.fps || 15, [[10, "10"], [15, "15 (padrão)"], [20, "20"], [30, "30"]]) + "</select></label>" +
      '<label>Limite de internet por pessoa assistindo<select name="bitrate_max">' + op(c.bitrate_max || 900, [[400, "0,4 Mbps"], [600, "0,6 Mbps"], [900, "0,9 Mbps (padrão)"], [1500, "1,5 Mbps"], [2500, "2,5 Mbps"]]) + "</select></label>" +
      '<label>Codificação do vídeo<select name="codificador">' + op(c.codificador || "automatico", [["automatico", "Automática (hardware, gasta menos bateria)"], ["compatibilidade", "Compatibilidade (se a imagem chegar preta)"]]) + "</select></label>" +
      '<label class="plc-chk"><input type="checkbox" name="som_permitido"' + (c.som_permitido !== false ? " checked" : "") + "> Permitir enviar o som</label>" +
      '<p class="plc-dlg-erro" hidden></p><div class="plc-dlg-acoes"><button value="cancelar" class="plc-btn">Cancelar</button><button value="salvar" class="plc-btn plc-btn-pri">Salvar</button></div></form>';
    d.showModal();
    d.querySelector('[value="salvar"]').onclick = async (e) => {
      e.preventDefault();
      const f = d.querySelector("form");
      const r = await sb().rpc("camera_config_salvar", { p_empresa: S.empresa, p_config: { resolucao: f.resolucao.value, fps: +f.fps.value, bitrate_max: +f.bitrate_max.value, som_permitido: f.som_permitido.checked, codificador: f.codificador.value } });
      if (r.error) { const x = d.querySelector(".plc-dlg-erro"); x.hidden = false; x.textContent = r.error.message; return; }
      S.config = r.data; d.close();
    };
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
      if (st === "connected") {
        q.estado = "ok"; clearTimeout(q.timer);
        // conectou mas não chegou nenhum quadro em 8 s: refaz a conexão (nunca fica uma imagem vazia como "ao vivo")
        clearTimeout(q.semImagem);
        q.semImagem = setTimeout(() => { const v = q.el.querySelector("video"); const c = S.cameras.find((x) => x.id === camId);
          if (S.quadros.get(camId) === q && (!v || !v.videoWidth) && !["camera_indisponivel", "pausada"].includes(c?.estado)) reconectar(camId); }, 8000);
      }
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
    clearTimeout(q.timer); clearTimeout(q.retry); clearTimeout(q.semImagem);
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
      ? '<span class="plc-ponto"></span><b>' + noAr + (noAr === 1 ? " câmera ao vivo" : " câmeras ao vivo") + "</b>" 
      : "<b>Nenhuma câmera ao vivo agora</b>";
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
    carregarQualidade();
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
