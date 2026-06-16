/* =====================================================
   EASYLOC QR CODE GLOBAL
===================================================== */
(function () {
  if (window.EasyLocQR) return;

  let libPromise = null;

  function gerarQrCode() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function toast(mensagem, titulo = "QR Code", tipo = "sucesso") {
    if (typeof window.alerta === "function") {
      window.alerta(mensagem, titulo, tipo);
      return;
    }

    if (tipo === "erro") {
      alert(mensagem);
    }
  }

  function ensureStyles() {
    if (document.getElementById("easylocQrStyles")) return;

    const style = document.createElement("style");
    style.id = "easylocQrStyles";
    style.textContent = `
      .qr-action-btn{
        width:38px;
        height:38px;
        border-radius:10px;
        border:1px solid #e5e7eb;
        background:#fff;
        color:#0f2a44;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
        font-weight:700;
        transition:.18s ease;
      }
      .qr-action-btn:hover{
        border-color:#ff6a00;
        color:#ff6a00;
        background:#fff7ed;
      }
      .qr-global-modal{
        position:fixed;
        inset:0;
        z-index:9999;
        display:none;
        align-items:center;
        justify-content:center;
        padding:24px;
        background:rgba(15, 23, 42, .48);
        backdrop-filter:blur(4px);
      }
      .qr-global-modal.is-open{display:flex;}
      .qr-global-box{
        width:min(420px, 94vw);
        background:#fff;
        border:1px solid #e5e7eb;
        border-radius:18px;
        box-shadow:0 24px 70px rgba(15, 23, 42, .24);
        padding:24px;
        color:#0f172a;
      }
      .qr-global-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:16px;
        margin-bottom:18px;
      }
      .qr-global-head h3{
        margin:0;
        color:#0f2a44;
        font-size:22px;
        font-weight:700;
      }
      .qr-global-close{
        width:36px;
        height:36px;
        border-radius:10px;
        border:1px solid #e5e7eb;
        background:#fff;
        cursor:pointer;
        font-weight:800;
      }
      .qr-global-code{
        display:flex;
        justify-content:center;
        padding:18px;
        background:#f8fafc;
        border:1px dashed #cbd5e1;
        border-radius:16px;
        margin-bottom:16px;
      }
      .qr-global-info{
        display:grid;
        gap:6px;
        margin-bottom:18px;
      }
      .qr-global-info span{
        color:#64748b;
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:.04em;
        font-weight:700;
      }
      .qr-global-info strong{
        color:#0f172a;
        font-size:15px;
        word-break:break-word;
      }
      .qr-global-actions{
        display:flex;
        gap:10px;
        justify-content:flex-end;
      }
      .qr-global-actions .btn{
        min-height:42px;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureLib() {
    if (window.QRCode) return Promise.resolve();
    if (libPromise) return libPromise;

    libPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Nao foi possivel carregar qrcodejs."));
      document.head.appendChild(script);
    });

    return libPromise;
  }

  async function render(container, value, size = 132) {
    if (!container || !value) return;

    await ensureLib();

    container.innerHTML = "";
    new window.QRCode(container, {
      text: String(value),
      width: size,
      height: size,
      correctLevel: window.QRCode.CorrectLevel?.M
    });
  }

  function sanitizeFileName(value) {
    return String(value || "QR-CODE")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase()
      .slice(0, 90) || "QR-CODE";
  }

  async function copy(value) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(String(value));
      toast("Codigo copiado.");
    } catch (error) {
      console.error("Erro ao copiar QR Code:", error);
      toast("Nao foi possivel copiar o codigo.", "QR Code", "erro");
    }
  }

  function downloadFromContainer(container, fileNameBase) {
    if (!container) return;

    const canvas = container.querySelector("canvas");
    const img = container.querySelector("img");
    let dataUrl = "";

    if (canvas) {
      dataUrl = canvas.toDataURL("image/png");
    } else if (img?.src) {
      dataUrl = img.src;
    }

    if (!dataUrl) {
      toast("QR Code ainda nao foi renderizado.", "QR Code", "erro");
      return;
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `QR-${sanitizeFileName(fileNameBase)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function ensureQuickModal() {
    ensureStyles();

    let modal = document.getElementById("qrQuickModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "qrQuickModal";
    modal.className = "qr-global-modal";
    modal.innerHTML = `
      <div class="qr-global-box" role="dialog" aria-modal="true" aria-labelledby="qrQuickTitle">
        <div class="qr-global-head">
          <div>
            <h3 id="qrQuickTitle">QR Code</h3>
          </div>
          <button type="button" class="qr-global-close" id="qrQuickClose">X</button>
        </div>
        <div class="qr-global-code" id="qrQuickCanvas"></div>
        <div class="qr-global-info">
          <span>Codigo</span>
          <strong id="qrQuickCodigo"></strong>
        </div>
        <div class="qr-global-info">
          <span>Nome</span>
          <strong id="qrQuickNome"></strong>
        </div>
        <div class="qr-global-actions">
          <button type="button" class="btn secondary" id="qrQuickCopy">Copiar Codigo</button>
          <button type="button" class="btn primary" id="qrQuickDownload">Baixar QR</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector("#qrQuickClose").addEventListener("click", () => modal.classList.remove("is-open"));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("is-open");
    });

    return modal;
  }

  async function openQuickModal(data) {
    if (!data?.qr_code) {
      toast("Este cadastro ainda nao possui QR Code.", "QR Code", "erro");
      return;
    }

    const modal = ensureQuickModal();
    const canvas = modal.querySelector("#qrQuickCanvas");
    const codigo = modal.querySelector("#qrQuickCodigo");
    const nome = modal.querySelector("#qrQuickNome");
    const copyBtn = modal.querySelector("#qrQuickCopy");
    const downloadBtn = modal.querySelector("#qrQuickDownload");
    const fileNameBase = data.codigo || data.nome || data.qr_code;

    codigo.textContent = data.qr_code;
    nome.textContent = data.nome || data.descricao_total || data.produto || data.codigo || "-";
    copyBtn.onclick = () => copy(data.qr_code);
    downloadBtn.onclick = () => downloadFromContainer(canvas, fileNameBase);

    modal.classList.add("is-open");
    await render(canvas, data.qr_code, 180);
  }

  async function buscarPorQRCode(qrCode) {
    const valor = String(qrCode || "").trim();
    const supabase = window.supabaseClient || window.supabase;

    if (!valor || !supabase?.from) return null;

    const buscas = [
      {
        tipo: "item",
        tabela: "itens",
        select: "id,codigo,produto,descricao_total,qr_code,tipo"
      },
      {
        tipo: "componente",
        tabela: "componentes",
        select: "id,codigo,nome,produto,descricao_total,qr_code"
      },
      {
        tipo: "insumo",
        tabela: "insumos",
        select: "id,codigo,nome,descricao,qr_code"
      }
    ];

    for (const busca of buscas) {
      try {
        const { data, error } = await supabase
          .from(busca.tabela)
          .select(busca.select)
          .eq("qr_code", valor)
          .maybeSingle();

        if (error) continue;
        if (!data) continue;

        return {
          tipo: busca.tabela === "itens" && data.tipo === "Componente" ? "componente" : busca.tipo,
          id: data.id,
          codigo: data.codigo || "",
          nome: data.descricao_total || data.nome || data.produto || data.descricao || "",
          qr_code: data.qr_code
        };
      } catch (error) {
        console.warn("Busca por QR ignorou uma tabela:", busca.tabela, error);
      }
    }

    return null;
  }

  window.EasyLocQR = {
    copy,
    downloadFromContainer,
    ensureLib,
    ensureStyles,
    generateValue: gerarQrCode,
    openQuickModal,
    render,
    sanitizeFileName
  };

  window.buscarPorQRCode = buscarPorQRCode;
})();
