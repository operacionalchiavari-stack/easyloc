/* =====================================================
   Ajudantes dos relatórios do Comercial (out/2026): Cancelamentos e Contas a receber.
   Mesmo formato de planilha do Financeiro > Gerencial (styles/planilha.css): números 1.234,56, negativos entre
   parênteses, zero vira traço; exportar para Excel (.xlsx, SheetJS 0.18.5 pelo CDN).
===================================================== */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const fmt = (n) => {
    const v = r2(n); if (Math.abs(v) < 0.005) return "–";
    const t = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? "(" + t + ")" : t;
  };
  const pct = (n, base) => (base && Math.abs(base) > 0.005 ? (n / base) * 100 : null);
  const fmtPct = (p) => (p == null || !isFinite(p) ? "–" : (Math.abs(p) < 0.05 ? 0 : p).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
  const dataBr = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "–");
  const hoje = () => new Date().toLocaleDateString("sv-SE");
  const somaDias = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toLocaleDateString("sv-SE"); };
  const dias = (de, ate) => Math.round((new Date(String(ate).slice(0, 10) + "T12:00:00") - new Date(String(de).slice(0, 10) + "T12:00:00")) / 864e5);
  const avisar = (msg, titulo = "Comercial", tipo = "aviso") => (window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg));

  async function contexto() {
    await window.aguardarContexto?.();
    const sb = window.supabaseClient;
    const empresa = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    if (!sb || !empresa) throw new Error("Sem empresa no contexto. Entre no sistema de novo.");
    return { sb, empresa };
  }
  // todas as linhas (a API devolve no máximo 1000 por chamada)
  async function todos(sb, tabela, colunas, ajustar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      let q = sb.from(tabela).select(colunas).range(de, de + 999);
      if (ajustar) q = ajustar(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  // Cidade e bairro a partir do endereço do Google ("Rua X, 123 - Bairro, Cidade - UF, 00000-000, Brasil")
  function regiao(endereco) {
    const t = String(endereco || "");
    const m = /(?:^|,)\s*([^,]+?)\s*-\s*([A-Z]{2})\s*(?:,|$)/.exec(t);
    if (!m) return { cidade: "", bairro: "" };
    const antes = t.slice(0, m.index), b = /-\s*([^,-]+?)\s*$/.exec(antes);
    return { cidade: m[1].trim() + "/" + m[2], bairro: b ? b[1].trim() : "" };
  }
  function faixaDistancia(km) {
    const v = Number(km);
    if (!isFinite(v) || v <= 0) return "Sem distância calculada";
    if (v <= 20) return "Até 20 km";
    if (v <= 50) return "De 20 a 50 km";
    if (v <= 100) return "De 50 a 100 km";
    return "Mais de 100 km";
  }

  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = () => (window.XLSX ? ok(window.XLSX) : erro(new Error("Não foi possível carregar o Excel.")));
      s.onerror = () => erro(new Error("Não foi possível carregar o Excel. Confira a internet."));
      document.head.appendChild(s);
    });
  }
  // abas = [{ nome, linhas: [[...]], larguras? }]; datas como Date, números como número
  async function exportar(abas, nomeArquivo) {
    try {
      const X = await carregarXlsx();
      const wb = X.utils.book_new();
      abas.forEach((a) => {
        const ws = X.utils.aoa_to_sheet(a.linhas, { cellDates: true });
        Object.keys(ws).forEach((k) => { if (k[0] === "!") return; const c = ws[k]; if (c.t === "n" && !Number.isInteger(c.v)) c.z = "#,##0.00;[Red](#,##0.00)"; if (c.t === "d") c.z = "dd/mm/yyyy"; });
        if (a.larguras) ws["!cols"] = a.larguras.map((w) => ({ wch: w }));
        X.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
      });
      X.writeFile(wb, nomeArquivo.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120) + ".xlsx");
    } catch (e) { console.error(e); avisar(e.message || "Não foi possível exportar.", "Exportar", "erro"); }
  }
  const dataPlan = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00") : "");

  window.ComercialRelatorios = { esc, r2, fmt, pct, fmtPct, dataBr, hoje, somaDias, dias, avisar, contexto, todos, regiao, faixaDistancia, exportar, dataPlan };
})();
