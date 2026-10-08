// =====================================================================
// Download das planilhas que os sistemas geram (ex.: exportação de
// pagamento da RH, que no Google virava uma planilha nova no Drive).
// GET /api/gs-planilha?id=gerada-<uuid>  → arquivo .csv (abre no Excel)
// Só planilhas "geradas" (id aleatório); as de dados nunca saem por aqui.
// =====================================================================
const { Execucao } = require("./_gas/motor");
const { configuracao } = require("./gs");

const celula = v => {
  const s = v instanceof Date ? v.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : typeof v === "number" ? String(v).replace(".", ",") : String(v == null ? "" : v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

module.exports = async (req, res) => {
  const id = String(req.query.id || "");
  if (!/^gerada-[0-9a-f-]{36}$/.test(id)) { res.status(404).send("Não encontrado."); return; }
  try {
    const ex = new Execucao(configuracao(req), { chave: "download", planilhaAtiva: id, urlApp: () => "" });
    const planilha = ex.abrirPlanilha(id);
    const partes = planilha.getSheets().map(aba => {
      const valores = aba.getLastRow() ? aba.getDataRange().getValues() : [];
      return (planilha.getSheets().length > 1 ? aba.getName() + "\n" : "") + valores.map(l => l.map(celula).join(";")).join("\n");
    });
    const nome = planilha.getName().replace(/[^\w\-—. à-úÀ-Ú]+/g, " ").trim() || "planilha";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(nome + ".csv"));
    res.status(200).send("﻿" + partes.join("\n\n"));
  } catch (e) {
    res.status(404).send("Não encontrado.");
  }
};
