console.log("🔥 pedido.misc.mjs REAL carregado");
export async function carregarLogoEmpresa() {

  let tentativas = 0;

  while (
    (!window.supabaseClient || !window.__CONTEXT?.empresa_id)
    && tentativas < 30
  ) {
    await new Promise(r => setTimeout(r, 100));
    tentativas++;
  }

  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;

  if (!supabase || !empresaId) {
    console.warn("Contexto não pronto para carregar logo");
    return;
  }

  const { data, error } = await supabase
    .from("empresas")
    .select("logo_url")
    .eq("id", empresaId)
    .single();

  if (error) {
    console.error("Erro ao buscar logo:", error);
    return;
  }

  if (!data?.logo_url) {
    console.warn("Empresa não possui logo cadastrada");
    return;
  }

  const img = document.getElementById("logoEmpresa");

  if (img) {
    img.onerror = function () {
      console.warn("Erro ao carregar imagem:", data.logo_url);
      img.style.display = "none";
    };

    img.onload = function () {
      img.style.display = "block";
    };

    img.src = data.logo_url + "?t=" + Date.now();
  }
}

export function imprimirPedido() {

  const conteudo = document.getElementById("orcamentoLayout")?.cloneNode(true);
  if (!conteudo) return;

  conteudo.querySelectorAll(
    ".acoes-itens, .btn-primary, .btn-secondary, .btn-espaco, .drag-handle, .btn-remover-item, .btn-remover-espaco"
  ).forEach(el => el.remove());

  const janela = window.open("", "", "width=900,height=700");

  janela.document.write(`
    <html>
      <head>
        <title>Orçamento</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: #fff; }
          .orcamento { max-width: 100%; margin: 0 auto; }
          .tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
          .tabela th, .tabela td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
          .tabela th { background: #f5f5f5; }
          .tabela tr { page-break-inside: avoid; }
          .resumo-box, .contrato { margin-top: 30px; }
        </style>
      </head>
      <body>
        ${conteudo.outerHTML}
      </body>
    </html>
  `);

  janela.document.close();
  janela.focus();
  janela.print();
  janela.close();
}

export function abrirModalAvisoFrete(mensagem) {

  const root = document.getElementById("modal-root");
  if (!root) return;

  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,.55)";
  overlay.style.backdropFilter = "blur(6px)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "999999";

  const modal = document.createElement("div");
  modal.style.width = "420px";
  modal.style.maxWidth = "90%";
  modal.style.background = "#ffffff";
  modal.style.borderRadius = "16px";
  modal.style.padding = "28px";
  modal.style.boxShadow = "0 30px 80px rgba(0,0,0,.25)";
  modal.style.fontFamily = "Inter, sans-serif";

  modal.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#0f2a44;margin-bottom:12px;">
      Atenção
    </div>

    <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:20px;">
      ${mensagem}
    </div>

    <div style="text-align:right;">
      <button id="btnFecharAvisoFrete"
        style="
          background:#ff6a00;
          color:#fff;
          border:none;
          padding:10px 18px;
          border-radius:10px;
          font-weight:600;
          cursor:pointer;
        ">
        Entendi
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  root.appendChild(overlay);

  document.getElementById("btnFecharAvisoFrete")
    .addEventListener("click", () => root.innerHTML = "");

  window.finalizarCarregamentoModulo?.();
}
export async function carregarFinanceiroEmpresaPedido() {

  let tentativas = 0;

  while (
    (!window.supabaseClient || !window.__CONTEXT?.empresa_id)
    && tentativas < 30
  ) {
    await new Promise(r => setTimeout(r, 100));
    tentativas++;
  }

  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;

  if (!supabase || !empresaId) {
    console.warn("Contexto não pronto para carregar financeiro");
    window.__FINANCEIRO = { absorcao_frete_percent: 0, absorcao_montagem_percent: 0 };
    return window.__FINANCEIRO;
  }

  const { data, error } = await supabase
    .from("empresa_financeiro")
    .select("absorcao_frete_percent, absorcao_montagem_percent")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar financeiro:", error);
    window.__FINANCEIRO = { absorcao_frete_percent: 0, absorcao_montagem_percent: 0 };
    return window.__FINANCEIRO;
  }

  window.__FINANCEIRO = {
    absorcao_frete_percent: Number(data?.absorcao_frete_percent ?? 0),
    absorcao_montagem_percent: Number(data?.absorcao_montagem_percent ?? 0)
  };

  return window.__FINANCEIRO;
}