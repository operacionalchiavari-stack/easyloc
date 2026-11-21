// (2026-11-13) Compras → aba "Créditos": créditos com fornecedores (vêm das RNCs de recebimento: abatimento ou material devolvido
// de nota já paga). Quem negocia com o fornecedor escolhe a conta a pagar em que o crédito vai ser abatido: o valor da conta já
// diminui e entra um comentário automático na conta, para o Financeiro saber. Ou registra que o fornecedor devolveu por fora.
// Acervo (16/11/2026): banco compras_creditos_lista / compras_credito_usar (migration 20261116100900).
(() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const day = (v) => (v ? new Date(String(v).length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "-");
  const pc = (n) => "PC-" + String(n).padStart(6, "0");
  const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : 0; };
  const SIT = { fechamento: " · vai no fechamento do mês", cartao: " · no cartão", parcial: " · paga em parte", aberta: "" };
  let rows = [], verUsados = false;
  const el = () => document.getElementById("purchaseCreditsList");

  async function load() {
    if (!window.AcervoComprasAPI?.listSupplierCredits) return;
    try { rows = (await AcervoComprasAPI.listSupplierCredits()) || []; } catch (e) { rows = []; if (el()) el().innerHTML = '<p class="subtext">Não foi possível carregar os créditos. ' + esc(e.message || "") + "</p>"; return; }
    const abertos = rows.filter((c) => c.status === "aberto");
    const badge = document.getElementById("purchaseCreditsBadge");
    if (badge) { badge.textContent = abertos.length; badge.hidden = !abertos.length; }
    render();
  }

  function render() {
    const box = el(); if (!box) return;
    const abertos = rows.filter((c) => c.status === "aberto"), usados = rows.filter((c) => c.status !== "aberto");
    const linha = (c) => `<tr data-credito="${esc(c.id)}" ${c.status === "aberto" ? 'class="ccr-row-open" tabindex="0" role="button" aria-label="Usar crédito de '+esc(c.fornecedor || "fornecedor")+'"' : ""}>
      <td>${window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(c.fornecedor_id, c.fornecedor), `<strong>${esc(c.fornecedor || "—")}</strong>`)}</td>
      <td><span class="ccr-clamp" title="${esc(c.descricao || "")}">${esc(c.descricao || "")}</span><small>${esc([c.numero_nfe && `NF ${c.numero_nfe}`, c.pedido_numero && pc(c.pedido_numero), c.criado_por].filter(Boolean).join(" · "))}</small></td>
      <td>${day(c.created_at)}</td><td class="num">${money(c.valor)}</td><td class="num"><strong>${money(c.saldo)}</strong>${c.status !== "aberto" ? '<small class="ccr-usado">Usado</small>' : ""}</td></tr>` +
      ((c.usos || []).length ? `<tr class="ccr-usos"><td colspan="5">${c.usos.map((u) => `<span>${day(u.em)} · ${money(u.valor)} · ${u.titulo ? "abatido de " + esc(u.titulo) : "devolvido por fora"}${u.obs ? " · " + esc(u.obs) : ""}${u.por ? " · " + esc(u.por) : ""}</span>`).join("")}</td></tr>` : "");
    // (16/11/2026) sem o resumo e a explicação do topo (pedido do usuário); fica só "Ver os já usados"
    box.innerHTML = `${!abertos.length && !(verUsados && usados.length) ? '<p class="pv-empty">Nenhum crédito em aberto.</p>' : ""}<div class="ccr-topo" style="justify-content:flex-end"><div></div>
        ${usados.length ? `<button type="button" class="btn btn-secondary pv-btn-sm" data-credito-ver>${verUsados ? "Esconder" : "Ver"} os já usados (${usados.length})</button>` : ""}</div>` +
      ((abertos.length || (verUsados && usados.length)) ? `<div class="tw-table-scroll"><table class="pv-table ccr-table"><colgroup><col style="width:24%"><col style="width:38%"><col style="width:14%"><col style="width:12%"><col style="width:12%"></colgroup>
        <thead><tr><th>Fornecedor</th><th>Origem</th><th>Criado</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead><tbody>${abertos.map(linha).join("")}${verUsados ? usados.map(linha).join("") : ""}</tbody></table></div>` : "");
  }

  // Modal de uso do crédito; a movimentação só ocorre ao confirmar o formulário.
  function abrirUso(tr) {
    document.getElementById("ccrUseDialog")?.close();
    const c = rows.find((x) => x.id === tr.dataset.credito); if (!c || c.status !== "aberto") return;
    const ts = c.titulos_abertos || [];
    const ed = document.createElement("dialog"); ed.id="ccrUseDialog";ed.className="ccr-use-dialog";ed.setAttribute("aria-labelledby","ccrUseTitle");let salvando=false;
    ed.innerHTML = `<form class="ccr-use-form"><header><h3 id="ccrUseTitle">Abater crédito</h3><p>${esc(c.fornecedor || "Fornecedor")} · Saldo: <strong>${money(c.saldo)}</strong></p></header><div class="ccr-caixa">
      <label class="ccr-conta">Abater de qual conta a pagar de ${esc(c.fornecedor || "")}?
        <select data-cc-conta>${ts.map((t) => `<option value="${esc(t.id)}" data-aberto="${Number(t.em_aberto)}">${esc([t.pedido_numero ? pc(t.pedido_numero) : t.descricao, t.parcelas > 1 ? `parcela ${t.parcela}/${t.parcelas}` : "", "vence " + day(t.vencimento), "em aberto " + money(t.em_aberto)].filter(Boolean).join(" · "))}${SIT[t.situacao] || ""}</option>`).join("")}
          <option value="">O fornecedor devolveu / compensou por fora (sem abater conta)</option></select></label>
      <label>Valor<input data-cc-valor required inputmode="decimal" value="${String(Math.min(Number(c.saldo), Number(ts[0]?.em_aberto ?? c.saldo)).toFixed(2)).replace(".", ",")}"></label>
      <label class="ccr-obs">Observação <small data-cc-obs-rot>(opcional)</small><input data-cc-obs placeholder="Ex.: combinado com o vendedor João"></label>
      <p class="ccr-dica" data-cc-dica></p><p class="ccr-erro" role="alert"></p>
      <div class="ccr-acoes"><button type="button" class="btn btn-secondary pv-btn-sm" data-cc-x>Cancelar</button><button type="submit" class="btn btn-primary pv-btn-sm" data-cc-ok>Abater</button></div></div></form>`;
    document.body.append(ed);
    const sel = ed.querySelector("[data-cc-conta]"), val = ed.querySelector("[data-cc-valor]"), dica = ed.querySelector("[data-cc-dica]"), ok = ed.querySelector("[data-cc-ok]");
    const atualizar = () => {
      const por = !sel.value, ab = Number(sel.selectedOptions[0]?.dataset.aberto || 0);
      ed.querySelector("[data-cc-obs-rot]").textContent = por ? "(obrigatória: como foi devolvido)" : "(opcional)";
      ed.querySelector("[data-cc-obs]").required=por;
      ok.textContent = por ? "Registrar devolução" : "Abater";
      dica.textContent = por ? "O crédito é baixado sem mexer em conta nenhuma (ex.: o fornecedor devolveu por PIX)." :
        `O valor desta conta passa de ${money(ab)} para ${money(Math.max(0, ab - num(val.value)))}. O Financeiro vê um comentário automático na conta.`;
    };
    sel.addEventListener("change", () => { const ab = Number(sel.selectedOptions[0]?.dataset.aberto || c.saldo); val.value = String(Math.min(Number(c.saldo), sel.value ? ab : Number(c.saldo)).toFixed(2)).replace(".", ","); atualizar(); });
    val.addEventListener("input", atualizar);
    ed.querySelector("[data-cc-x]").addEventListener("click", () => ed.close());
    ed.addEventListener("cancel",e=>{if(salvando)e.preventDefault();});
    ed.addEventListener("close",()=>{ed.remove();if(tr.isConnected)tr.focus();});
    ed.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault();if(salvando)return;
      const valor=num(val.value),limite=sel.value?Math.min(Number(c.saldo),Number(sel.selectedOptions[0]?.dataset.aberto||0)):Number(c.saldo);
      if(valor<=0||valor>limite){ed.querySelector(".ccr-erro").textContent="Informe um valor maior que zero e de até "+money(limite)+".";val.focus();return;}
      const titulo=sel.value||null,obs=ed.querySelector("[data-cc-obs]").value.trim()||null;
      if(!titulo&&!obs){ed.querySelector(".ccr-erro").textContent="Informe como o fornecedor devolveu o valor.";return;}
      salvando=true;ed.querySelectorAll("input,select").forEach(n=>n.disabled=true);ok.disabled=true;ed.querySelector("[data-cc-x]").disabled=true;ed.querySelector(".ccr-erro").textContent="";
      try {
        await AcervoComprasAPI.useSupplierCredit(c.id, valor, titulo, obs);
        window.AcervoComprasAlert?.success?.(titulo ? "Crédito abatido na conta a pagar. O Financeiro vê o comentário na conta." : "Devolução registrada.");
        ed.close();await load();
      } catch (e) { salvando=false;ed.querySelectorAll("input,select").forEach(n=>n.disabled=false);ok.disabled=false;ed.querySelector("[data-cc-x]").disabled=false; ed.querySelector(".ccr-erro").textContent = e?.message || "Não foi possível usar o crédito."; }
    });
    atualizar();
    ed.showModal();sel.focus();
  }

  document.addEventListener("click", (e) => {
    if (!el()?.contains(e.target)) return;
    const tr=e.target.closest("tr.ccr-row-open");if(tr&&!e.target.closest("button,a,input")){abrirUso(tr);return;}
    if (e.target.closest("[data-credito-ver]")) { verUsados = !verUsados; render(); }
  });
  document.addEventListener("keydown",e=>{const tr=e.target.closest?.("tr.ccr-row-open");if(tr&&e.target===tr&&["Enter"," "].includes(e.key)){e.preventDefault();abrirUso(tr);}});
  const start = async () => {
    await window.AcervoComprasAuth?.ready;
    load();
    document.querySelector('[data-pv-tab="creditos"]')?.addEventListener("click", load);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
