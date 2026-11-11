/* =====================================================
   LEITOR DE QR (out/2026) — câmera do celular + leitor USB/bluetooth
   EasyLocLeitor.criar({ video, aoLer(codigo), aoMudar(ligada) }) → { ligar(), desligar(), ligada }
   - Câmera: BarcodeDetector do navegador; onde não existe (iPhone), carrega jsQR.
   - O mesmo código seguido só vale de novo depois de 2 s (a câmera vê o QR várias vezes por segundo).
   EasyLocLeitor.teclado(input, aoLer): leitor USB/bluetooth (digita e dá Enter) ou digitação.
   EasyLocLeitor.ler(texto) → { tipo: "PAT"|"ENV"|"ITEM"|"", codigo }
===================================================== */
(function () {
  if (window.EasyLocLeitor) return;

  // Leitor USB/bluetooth configurado com teclado americano num Windows com teclado brasileiro (ABNT2): os dois
  // pontos ":" chegam como "Ç"/"ç" (mesma tecla) e às vezes como ";". Aceita esses separadores e devolve o texto
  // no formato certo "ACERVO:TIPO:código" (ex.: "acervoçenvç12-003" → "ACERVO:ENV:12-003").
  const ETIQUETA = /^ACERVO\s*[:;çÇ]\s*(PAT|ITEM|ENV)\s*[:;çÇ]\s*(.+)$/i;
  function normalizar(texto) {
    const t = String(texto || "").trim();
    const m = ETIQUETA.exec(t);
    return m ? "ACERVO:" + m[1].toUpperCase() + ":" + m[2].trim() : t;
  }

  function ler(texto) {
    const t = normalizar(texto);
    const m = /^ACERVO:(PAT|ITEM|ENV):(.+)$/i.exec(t);
    return m ? { tipo: m[1].toUpperCase(), codigo: m[2].trim() } : { tipo: "", codigo: t };
  }

  function carregarJsQr() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, erro) => {
      const tag = document.createElement("script");
      tag.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      tag.onload = () => ok();
      tag.onerror = () => erro(new Error("Leitor de QR indisponível."));
      document.head.appendChild(tag);
    });
  }

  function criar({ video, aoLer, aoMudar, aoDetectar, leituraContinua = false }) {
    const c = { stream: null, timer: null, detector: null, canvas: null, ultimo: "", ultimoEm: 0, ocupado: false, ausenteEm: 0 };

    async function quadro() {
      if (!c.stream || video.readyState < 2) { aoDetectar?.(null); return ""; }
      if (c.detector) {
        const qr = (await c.detector.detect(video).catch(() => []))[0];
        aoDetectar?.(qr ? { codigo:qr.rawValue, pontos:qr.cornerPoints || [], largura:video.videoWidth, altura:video.videoHeight } : null);
        return qr?.rawValue || "";
      }
      if (!window.jsQR || !video.videoWidth) return "";
      c.canvas ||= document.createElement("canvas");
      const k = Math.min(1, 640 / video.videoWidth);
      c.canvas.width = Math.round(video.videoWidth * k); c.canvas.height = Math.round(video.videoHeight * k);
      const ctx = c.canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, c.canvas.width, c.canvas.height);
      const img = ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
      const qr = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      const l = qr?.location;
      aoDetectar?.(qr ? { codigo:qr.data, pontos:l ? [l.topLeftCorner,l.topRightCorner,l.bottomRightCorner,l.bottomLeftCorner] : [], largura:img.width, altura:img.height } : null);
      return qr?.data || "";
    }

    async function ligar() {
      if (c.stream) return true;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este aparelho não permite usar a câmera aqui. Use o leitor ou digite o código.");
      if ("BarcodeDetector" in window && !c.detector) {
        const formatos = (await window.BarcodeDetector.getSupportedFormats?.().catch(() => [])) || [];
        if (formatos.includes("qr_code")) c.detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"].filter((f) => formatos.includes(f)) });
      }
      if (!c.detector) await carregarJsQr();
      try {
        c.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        throw new Error(e?.name === "NotAllowedError" ? "Permita o uso da câmera para ler os QR codes." : "Não foi possível abrir a câmera.");
      }
      video.srcObject = c.stream;
      video.play?.().catch(() => {});
      c.timer = setInterval(async () => {
        if (c.ocupado) return;
        c.ocupado = true;
        try {
          const codigo = String(await quadro() || "").trim();
          const agora = Date.now();
          // Na leitura cont?nua, o mesmo QR precisa sair do enquadramento
          // antes de contar outra pe?a; c?digos diferentes seguem imediatamente.
          if (!codigo) {
            if (!c.ausenteEm) c.ausenteEm = agora;
          }
          const novaPeca = codigo !== c.ultimo || (c.ausenteEm && agora - c.ausenteEm >= 500);
          if (codigo && (leituraContinua ? novaPeca : codigo !== c.ultimo || agora - c.ultimoEm > 2000)) {
            c.ultimo = codigo; c.ultimoEm = agora;
            navigator.vibrate?.(60);
            await aoLer(codigo);
          }
          if (codigo) c.ausenteEm = 0;
        } finally { c.ocupado = false; }
      }, 250);
      aoMudar?.(true);
      return true;
    }

    function desligar() {
      clearInterval(c.timer); c.timer = null;
      c.stream?.getTracks().forEach((t) => t.stop());
      c.stream = null;
      video.srcObject = null;
      aoDetectar?.(null);
      aoMudar?.(false);
    }

    return { ligar, desligar, get ligada() { return Boolean(c.stream); } };
  }

  function teclado(input, aoLer) {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = input.value.trim();
      input.value = "";
      if (v) aoLer(v);
    });
  }

  // Leitor USB/bluetooth sem precisar tocar na caixa do código (nov/2026): enquanto a caixa existe na tela, o que o leitor
  // "digitar" em qualquer lugar da página vai para ela; a caixa fica sempre marcada, com inputmode="none" para o
  // teclado do celular não abrir (tocar nela abre o teclado para digitar à mão). Leituras seguidas entram numa fila e
  // são conferidas uma depois da outra (bipar rápido não perde código enquanto a anterior ainda está sendo gravada).
  function manterFoco(pegarCampo, aoLer) {
    let buffer = "", ultimaTecla = 0, fila = Promise.resolve();
    const editavel = (el) => el && el !== document.body && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const visivel = (el) => el && el.isConnected && !el.disabled && el.offsetParent !== null;
    const janelaAberta = () => [...document.querySelectorAll("dialog[open]")].some((d) => !d.contains(pegarCampo()));
    function enfileirar(v) {
      v = String(v || "").trim();
      if (!v) return;
      fila = fila.then(() => aoLer(v)).catch(() => {}).then(() => focar());
    }
    function preparar(campo) {
      if (!campo || campo.dataset.leitorFoco) return;
      campo.dataset.leitorFoco = "1";
      campo.setAttribute("inputmode", "none");
      campo.addEventListener("pointerdown", () => campo.setAttribute("inputmode", "text"));
      campo.addEventListener("blur", () => campo.setAttribute("inputmode", "none"));
    }
    function focar() {
      const campo = pegarCampo();
      if (!visivel(campo) || janelaAberta() || document.hidden) return;
      preparar(campo);
      const ativo = document.activeElement;
      if (ativo === campo || editavel(ativo) || Date.now() - ultimaTecla < 600) return;
      campo.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", (e) => {
      const campo = pegarCampo();
      if (!campo || !campo.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target === campo) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const v = (Date.now() - ultimaTecla < 1500 ? buffer : "") + campo.value;
        buffer = "";
        campo.value = "";
        enfileirar(v);
        return;
      }
      if (editavel(e.target) || janelaAberta()) return;
      const agora = Date.now();
      if (agora - ultimaTecla > 1500) buffer = "";
      ultimaTecla = agora;
      if (e.key === "Enter") {
        if (!buffer) return;
        e.preventDefault();
        const v = buffer;
        buffer = "";
        enfileirar(v);
      } else if (e.key.length === 1) {
        e.preventDefault();
        buffer += e.key;
      }
    }, true);
    setInterval(focar, 400);
    document.addEventListener("visibilitychange", focar);
    return { focar };
  }

  window.EasyLocLeitor = { criar, teclado, ler, normalizar, manterFoco };
})();
