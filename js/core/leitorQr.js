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

  function ler(texto) {
    const t = String(texto || "").trim();
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

  function criar({ video, aoLer, aoMudar }) {
    const c = { stream: null, timer: null, detector: null, canvas: null, ultimo: "", ultimoEm: 0, ocupado: false };

    async function quadro() {
      if (!c.stream || video.readyState < 2) return "";
      if (c.detector) return (await c.detector.detect(video).catch(() => []))[0]?.rawValue || "";
      if (!window.jsQR || !video.videoWidth) return "";
      c.canvas ||= document.createElement("canvas");
      const k = Math.min(1, 640 / video.videoWidth);
      c.canvas.width = Math.round(video.videoWidth * k); c.canvas.height = Math.round(video.videoHeight * k);
      const ctx = c.canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, c.canvas.width, c.canvas.height);
      const img = ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
      return window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || "";
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
          if (codigo && (codigo !== c.ultimo || agora - c.ultimoEm > 2000)) {
            c.ultimo = codigo; c.ultimoEm = agora;
            navigator.vibrate?.(60);
            await aoLer(codigo);
          }
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

  window.EasyLocLeitor = { criar, teclado, ler };
})();
