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

  window.__EMPRESA_LOGO_URL = data.logo_url;

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
  const text = (selector, fallback = "-") => {
    const el = document.querySelector(selector);
    const value = (el?.innerText || el?.textContent || "").trim();
    return value || fallback;
  };

  const value = (selector, fallback = "-") => {
    const el = document.querySelector(selector);
    if(!el) return fallback;
    if(el.tagName === "SELECT"){
      return (el.selectedOptions?.[0]?.textContent || el.value || "").trim() || fallback;
    }
    return (el.value || el.innerText || "").trim() || fallback;
  };

  const escapeHtml = (raw = "") => String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const dateBR = (raw) => {
    if(!raw || raw === "-") return "-";
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR");
  };

  const logoUrl =
    window.__EMPRESA_LOGO_URL ||
    document.getElementById("logoEmpresa")?.src ||
    "logo.png";

  const numero = text("#orcamentoNumero", "Novo");
  const status = text("#pedidoStatus", "Orcamento");
  const cliente = value("#clienteInput", "Cliente nao informado");
  const contato = value("#telefoneInput", "Contato nao informado");
  const evento = value("#tipoEventoSelect", "Evento nao informado");
  const local = value("#localInput", "Local nao informado");
  const dataEntrega = dateBR(value("#dataEntrega", ""));
  const dataEvento = dateBR(value("#dataEvento", ""));
  const dataColeta = dateBR(value("#dataColeta", ""));
  const endereco = text("#localObservacoes", "Endereco e referencia nao informados");
  const observacaoFinanceira = value("#pagamentoObservacaoFinanceira", "");
  const tags = Array.from(document.querySelectorAll("#localTagsInline *"))
    .map((el) => (el.innerText || el.textContent || "").trim())
    .filter(Boolean);

  const itens = Array.from(document.querySelectorAll("#listaItens tr"))
    .map((tr) => {
      if(tr.classList.contains("linha-espaco")){
        return {
          tipo: "espaco",
          nome: (tr.querySelector(".nome-espaco-input")?.innerText || "Espaco").trim()
        };
      }

      if(!tr.classList.contains("item-row")) return null;

      const selectNome = tr.querySelector(".nome-item select, select.nome-item");
      const nome =
        selectNome?.selectedOptions?.[0]?.textContent?.trim() ||
        tr.querySelector(".nome-item")?.innerText?.trim() ||
        tr.querySelector(".item-nome-titulo")?.innerText?.trim() ||
        "Item sem nome";

      const detalhes = [
        tr.querySelector(".item-nome-medidas")?.innerText?.trim(),
        tr.querySelector(".detalhe-personalizacao")?.innerText?.trim()
      ].filter(Boolean).join(" | ");

      return {
        tipo: "item",
        qtd: tr.querySelector(".qtd")?.innerText?.trim() || "1",
        foto: tr.querySelector(".foto-item img")?.src || "",
        nome,
        detalhes,
        locacao: tr.querySelector(".valor-unitario")?.innerText?.trim() || "R$ 0,00",
        desconto: tr.querySelector(".input-desconto")?.value ? `${tr.querySelector(".input-desconto").value}%` : "0%",
        total: tr.querySelector(".valor-total")?.innerText?.trim() || "R$ 0,00",
        reposicao: tr.querySelector(".valor-reposicao")?.innerText?.trim() || "R$ 0,00"
      };
    })
    .filter(Boolean);

  const parcelas = Array.from(document.querySelectorAll("#cronogramaParcelas tr"))
    .map((tr) => {
      return {
        numero: tr.querySelector(".pg-numero")?.textContent?.trim() || "-",
        tipo: tr.querySelector(".pg-parcela-label")?.textContent?.trim() || "-",
        vencimento: dateBR(tr.querySelector(".pg-vencimento")?.value || ""),
        valor: tr.querySelector(".pg-valor")?.innerText?.trim() || "-",
        metodo: tr.querySelector(".pg-metodo")?.value || tr.querySelector(".pg-metodo-text")?.textContent?.trim() || "-",
        status: tr.querySelector(".pg-status")?.value || tr.querySelector(".pg-status-badge")?.textContent?.trim() || "-"
      };
    });

  const resumo = [
    ["Valor de locacao", text("#resumoLocacaoBruto", "R$ 0,00")],
    ["Customizacoes", text("#resumoCustomizacoes", "R$ 0,00")],
    ["Frete", text("#resumoFreteBruto", "R$ 0,00")],
    ["Montagem", text("#resumoMontagemBruto", "R$ 0,00")],
    ["Total do pedido", text("#resumoTotalGeral", "R$ 0,00")]
  ];

  const pagamento = [
    ["Forma de pagamento", value("#pagamentoMetodo", "-")],
    ["Entrada", value("#pagamentoEntradaPercent", "0")],
    ["Qtd. parcelas", value("#pagamentoParcelas", "0")],
    ["Vencimento entrada", dateBR(value("#pagamentoDataBase", ""))],
    ["Dia fixo", value("#pagamentoDiaFixo", "-")],
    ["Desconto comercial", value("#pagamentoDescontoComercial", "0")],
    ["Credito do cliente", value("#pagamentoCreditoCliente", "0")]
  ];

  const itemRows = itens.length ? itens.map((item) => {
    if(item.tipo === "espaco"){
      return `<tr class="print-space-row"><td colspan="7"><span>${escapeHtml(item.nome)}</span></td></tr>`;
    }

    return `
      <tr>
        <td class="print-qtd">${escapeHtml(item.qtd)}</td>
        <td class="print-photo">${item.foto ? `<img src="${escapeHtml(item.foto)}" alt="">` : ""}</td>
        <td class="print-item"><strong>${escapeHtml(item.nome)}</strong>${item.detalhes ? `<small>${escapeHtml(item.detalhes)}</small>` : ""}</td>
        <td>${escapeHtml(item.locacao)}</td>
        <td>${escapeHtml(item.desconto)}</td>
        <td><strong>${escapeHtml(item.total)}</strong></td>
        <td>${escapeHtml(item.reposicao)}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7" class="print-empty">Nenhum item adicionado ao pedido.</td></tr>`;

  const parcelaRows = parcelas.length ? parcelas.map((parcela) => `
    <tr>
      <td>${escapeHtml(parcela.numero)}</td>
      <td>${escapeHtml(parcela.tipo)}</td>
      <td>${escapeHtml(parcela.vencimento)}</td>
      <td><strong>${escapeHtml(parcela.valor)}</strong></td>
      <td>${escapeHtml(parcela.metodo)}</td>
      <td><span class="status-badge">${escapeHtml(parcela.status)}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="print-empty">Programacao de pagamento nao informada.</td></tr>`;

  const janela = window.open("", "", "width=980,height=760");
  if(!janela) return;

  const printTheme = window.__COMPANY_THEME || {};
  const printPrimary = printTheme.cor_sidebar || "#0B1F44";
  const printAccent = printTheme.cor_destaque || "#F59E0B";

  janela.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Pedido #${escapeHtml(numero)}</title>
        <style>
          :root {
            --print-primary: ${escapeHtml(printPrimary)};
            --print-accent: ${escapeHtml(printAccent)};
          }
          @page { size: A4; margin: 10mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: #111827;
            font-family: Inter, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 10mm;
            background: #fff;
          }
          .print-hero {
            display: grid;
            grid-template-columns: 178px minmax(0, 1fr) 128px;
            align-items: center;
            gap: 16px;
            min-height: 86px;
            padding: 0 0 14px;
            border-bottom: 1px solid #E5E7EB;
            color: #111827;
            page-break-inside: avoid;
          }
          .brand { display: contents; }
          .brand-logo {
            width: 168px;
            height: 72px;
            padding: 0 16px 0 0;
            border-right: 1px solid #D1D5DB;
            object-fit: contain;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
          }
          .brand-copy {
            min-width: 0;
          }
          .brand h1 { margin: 0; color: var(--print-primary); font-size: 30px; line-height: 1; font-weight: 600; letter-spacing: -0.02em; }
          .brand p { max-width: 430px; margin: 8px 0 0; color: #475569; font-size: 13px; }
          .doc-badge {
            min-width: 126px;
            padding: 10px 11px;
            border: 1px solid #E5E7EB;
            border-radius: 12px;
            color: #111827;
            text-align: right;
            background: #fff;
            box-shadow: none;
          }
          .doc-badge span:first-child { color: #6B7280; font-size: 9px; font-weight: 600; text-transform: uppercase; }
          .doc-badge strong { display: block; margin: 3px 0 8px; color: var(--print-primary); font-size: 25px; line-height: 1; font-weight: 650; letter-spacing: -0.02em; }
          .doc-status {
            display: inline-flex;
            padding: 5px 9px;
            border-radius: 999px;
            color: #92400e;
            background: #fef3c7;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .section {
            margin-top: 10px;
            border: 1px solid #E5E7EB;
            border-radius: 13px;
            overflow: hidden;
            background: #fff;
            box-shadow: none;
            page-break-inside: avoid;
          }
          .section-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            padding: 10px 14px;
            border-bottom: 1px solid #E5E7EB;
            background: #F8FAFC;
          }
          .section-title h2 {
            display: flex;
            align-items: center;
            gap: 0;
            margin: 0;
            color: var(--print-primary);
            font-size: 16px;
            font-weight: 600;
            letter-spacing: .01em;
            text-transform: uppercase;
          }
          .section-icon { display: none; }
          .section-title strong,
          .section-title span { color: #6B7280; font-size: 10.5px; font-weight: 400; }
          .info-grid {
            display: grid;
            grid-template-columns: 1.05fr .8fr .8fr .9fr;
            gap: 0;
            padding: 0;
            background: #fff;
          }
          .info-card {
            min-height: auto;
            padding: 11px 14px;
            border: 0;
            border-right: 1px solid #EEF2F7;
            border-bottom: 1px solid #EEF2F7;
            border-radius: 0;
            background: #fff;
            box-shadow: none;
            page-break-inside: avoid;
          }
          .info-card:nth-child(4),
          .info-card:nth-child(7) { border-right: 0; }
          .info-card.wide { grid-column: span 2; }
          .label {
            display: block;
            margin-bottom: 3px;
            color: #6B7280;
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .label:before {
            content: "";
            display: inline-block;
            width: 18px;
            height: 18px;
            flex: 0 0 18px;
            border: 0;
            border-radius: 0;
            background: var(--print-accent);
            -webkit-mask: var(--info-icon) center / contain no-repeat;
            mask: var(--info-icon) center / contain no-repeat;
          }
          .icon-client { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21a8 8 0 0 0-16 0'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E"); }
          .icon-phone { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.6 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.17a2 2 0 0 1 2.11-.45c.84.28 1.71.48 2.61.6A2 2 0 0 1 22 16.92z'/%3E%3C/svg%3E"); }
          .icon-event { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2v4'/%3E%3Cpath d='M5 9a7 7 0 1 0 14 0'/%3E%3Cpath d='M5 9h14'/%3E%3Cpath d='M8 3h8'/%3E%3C/svg%3E"); }
          .icon-calendar { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M16 2v4'/%3E%3Cpath d='M8 2v4'/%3E%3Cpath d='M3 10h18'/%3E%3C/svg%3E"); }
          .icon-delivery { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 17h4V5H2v12h3'/%3E%3Cpath d='M14 8h4l4 4v5h-3'/%3E%3Ccircle cx='7.5' cy='17.5' r='2.5'/%3E%3Ccircle cx='16.5' cy='17.5' r='2.5'/%3E%3C/svg%3E"); }
          .icon-pin { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z'/%3E%3Ccircle cx='12' cy='10' r='3'/%3E%3C/svg%3E"); }
          .icon-address { --info-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z'/%3E%3Cpath d='M9 3v15'/%3E%3Cpath d='M15 6v15'/%3E%3C/svg%3E"); }
          .value { color: #111827; font-size: 13px; font-weight: 600; white-space: pre-line; }
          .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 10px 14px 12px;
            border-top: 1px solid #EEF2F7;
          }
          .tags span {
            display: inline-flex;
            align-items: center;
            gap: 0;
            height: 30px;
            padding: 0 13px;
            border: 1px solid #f7c37a;
            border-radius: 999px;
            color: #92400e;
            background: #fff;
            font-size: 11px;
            font-weight: 600;
          }
          .tags b { display: none; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; }
          th {
            padding: 10px 12px;
            background: var(--print-primary);
            color: #fff;
            text-align: left;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .04em;
          }
          th:first-child { border-top-left-radius: 0; }
          th:last-child { border-top-right-radius: 0; }
          td {
            padding: 12px 12px;
            border-bottom: 1px solid #EEF2F7;
            color: #111827;
            vertical-align: middle;
            background: #fff;
          }
          tr { page-break-inside: avoid; }
          .print-photo { width: 80px; }
          .print-photo img {
            width: 60px;
            height: 60px;
            object-fit: contain;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
          }
          .print-qtd {
            width: 44px;
            color: var(--print-primary);
            font-size: 15px;
            font-weight: 600;
            text-align: center;
          }
          .print-item strong { display: block; color: #111827; font-size: 13.5px; line-height: 1.25; font-weight: 650; }
          .print-item small { display: block; margin-top: 5px; color: #64748B; font-size: 11px; font-weight: 400; }
          td strong { color: var(--print-primary); font-weight: 600; }
          .print-space-row td {
            padding: 16px 14px 10px;
            border-bottom: none;
            background: #fff;
            text-align: center;
          }
          .print-space-row span {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 12px;
            color: var(--print-primary);
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .print-space-row span:before,
          .print-space-row span:after {
            content: "";
            height: 1px;
            background: #E5E7EB;
          }
          .print-empty { padding: 26px; color: #6B7280; text-align: center; }
          .totals-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(260px, .92fr);
            gap: 16px;
            padding: 14px;
          }
          .commercial-card,
          .summary-card {
            border: 1px solid #E5E7EB;
            border-radius: 14px;
            overflow: hidden;
            background: #fff;
            box-shadow: none;
            page-break-inside: avoid;
          }
          .card-title {
            padding: 10px 14px;
            border-bottom: 1px solid #E5E7EB;
            color: var(--print-primary);
            background: #F8FAFC;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .payment-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; }
          .payment-row,
          .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 12px;
            border-bottom: 1px solid #EEF2F7;
          }
          .payment-row:nth-child(odd) { border-right: 1px solid #EEF2F7; }
          .payment-row span,
          .summary-row span { color: #6B7280; font-weight: 400; }
          .payment-row strong,
          .summary-row strong { color: #111827; font-weight: 600; text-align: right; }
          .summary-row.total {
            display: block;
            margin: 10px 12px 12px;
            min-height: 70px;
            padding: 12px 16px;
            border: 0;
            border-radius: 18px;
            color: #fff;
            text-align: center;
            background: linear-gradient(135deg, var(--print-primary), color-mix(in srgb, var(--print-primary) 84%, #ffffff));
          }
          .summary-row.total span {
            display: block;
            color: rgba(255,255,255,.78);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .summary-row.total strong {
            display: block;
            margin-top: 5px;
            color: #fff;
            font-size: 32px;
            line-height: 1.05;
            text-align: center;
          }
          .note {
            margin: 12px 14px 14px;
            padding: 12px 14px;
            border: 1px solid #f7c37a;
            border-radius: 14px;
            background: #fffbeb;
            color: #92400e;
            font-weight: 400;
          }
          .status-badge {
            display: inline-flex;
            padding: 5px 9px;
            border-radius: 999px;
            color: #047857;
            background: #d1fae5;
            font-size: 10px;
            font-weight: 600;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            margin-top: 18px;
            padding-top: 12px;
            border-top: 1px solid #E5E7EB;
            color: #6B7280;
            font-size: 10px;
            page-break-inside: avoid;
          }
          @media print {
            body { background: #fff; }
            .print-page { width: auto; min-height: auto; margin: 0; padding: 0; }
            .print-hero, .section, .commercial-card, .summary-card { box-shadow: none; }
            .section { break-inside: avoid; }
            tr, .info-card, .commercial-card, .summary-card { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <main class="print-page">
          <header class="print-hero">
            <div class="brand">
              <img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="Logo da empresa">
              <div class="brand-copy">
                <h1>Proposta comercial</h1>
                <p>Locacao de mobiliario e decoracao de eventos.</p>
              </div>
            </div>
            <div class="doc-badge"><span>Pedido</span><strong>#${escapeHtml(numero)}</strong><span class="doc-status">${escapeHtml(status)}</span></div>
          </header>

          <section class="section">
            <div class="section-title"><h2>Dados do evento</h2><strong>${new Date().toLocaleDateString("pt-BR")}</strong></div>
            <div class="info-grid">
              <div class="info-card icon-client"><span class="label">Cliente</span><div class="value">${escapeHtml(cliente)}</div></div>
              <div class="info-card icon-phone"><span class="label">Contato</span><div class="value">${escapeHtml(contato)}</div></div>
              <div class="info-card icon-event"><span class="label">Evento</span><div class="value">${escapeHtml(evento)}</div></div>
              <div class="info-card icon-calendar"><span class="label">Data do evento</span><div class="value">${escapeHtml(dataEvento)}</div></div>
              <div class="info-card icon-delivery"><span class="label">Entrega / Coleta</span><div class="value">${escapeHtml(dataEntrega)} / ${escapeHtml(dataColeta)}</div></div>
              <div class="info-card icon-pin"><span class="label">Local</span><div class="value">${escapeHtml(local)}</div></div>
              <div class="info-card wide icon-address"><span class="label">Endereco e referencia</span><div class="value">${escapeHtml(endereco)}</div></div>
            </div>
            ${tags.length ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </section>

          <section class="section">
            <div class="section-title"><h2>Itens do pedido</h2><span>${itens.filter((item) => item.tipo === "item").length} item(ns)</span></div>
            <table><thead><tr><th>Qtd</th><th>Foto</th><th>Item</th><th>Locacao</th><th>Desc.</th><th>Total</th><th>Reposicao</th></tr></thead><tbody>${itemRows}</tbody></table>
          </section>

          <section class="section">
            <div class="section-title"><h2>Resumo e condicoes comerciais</h2></div>
            <div class="totals-layout">
              <div class="commercial-card">
                <div class="card-title">Condicoes de pagamento</div>
                <div class="payment-list">${pagamento.map(([label, val]) => `<div class="payment-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(val)}</strong></div>`).join("")}</div>
                ${observacaoFinanceira ? `<div class="note"><strong>Observacao financeira:</strong><br>${escapeHtml(observacaoFinanceira)}</div>` : ""}
              </div>
              <div class="summary-card">
                <div class="card-title">Resumo financeiro</div>
                <div class="summary-list">${resumo.map(([label, val], index) => `<div class="summary-row ${index === resumo.length - 1 ? "total" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(val)}</strong></div>`).join("")}</div>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="section-title"><h2>Programacao de pagamento</h2></div>
            <table><thead><tr><th>#</th><th>Tipo</th><th>Vencimento</th><th>Valor</th><th>Metodo</th><th>Status</th></tr></thead><tbody>${parcelaRows}</tbody></table>
          </section>

          <footer class="footer"><span>Este documento foi gerado pelo EasyLoc com base nas informacoes do pedido.</span><span>Pedido #${escapeHtml(numero)}</span></footer>
        </main>
      </body>
    </html>
  `);

  janela.document.close();

  let impresso = false;
  const dispararPrint = () => {
    if(impresso) return;
    impresso = true;
    janela.focus();
    janela.print();
    janela.close();
  };

  janela.addEventListener("load", () => {
    setTimeout(dispararPrint, 250);
  }, { once: true });

  setTimeout(dispararPrint, 1200);
}

function imprimirPedidoAntigo() {

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
  overlay.style.background = "rgba(15,23,42,.42)";
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
      <button id="btnFecharAvisoFrete" class="btn danger btn-fechar" type="button">
        Fechar
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
