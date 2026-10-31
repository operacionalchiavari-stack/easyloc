// Comissão do decorador (BV) no pedido (out/2026), em Financeiro e pagamentos.
// Regra padrão (calculada no banco, fin_bv_sincronizar): com equipe, o percentual da TITULAR e 100% para ela; sem equipe,
// o percentual de quem fez o pedido. Aqui dá para dividir o BV entre a titular e quem fez (ou outras pessoas da equipe),
// em pontos percentuais da locação que somam o BV do pedido, e negociar um BV diferente só neste pedido.
// Grava em observacoes.bv = { manual, percentual, observacao, partes:[{cliente_id, nome, percentual}] } (null = padrão).
export function initBvPedido({ supabase }) {
  const resumo = document.querySelector(".pedido-financeiro .resumo-card");
  const hidden = document.getElementById("clienteIdHidden");
  const input = document.getElementById("clienteInput");
  if (!resumo || !hidden) return;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const r2 = (v) => Math.round(v * 100) / 100;

  const card = document.createElement("section");
  card.className = "finance-card pedido-bv-card";
  card.hidden = true;
  card.setAttribute("aria-labelledby", "pedidoBvTitulo");
  // vai para a coluna do BV (pedido.entrada.mjs organiza: Resumo + Frete | BV + Montagem)
  (resumo.closest(".pedido-financeiro") || resumo.parentElement).append(card);

  // dados do servidor (regra) e o que a pessoa ajustou
  const s = { chave: "", regra: null, registrado: null, membros: [], cfg: null, carregou: false, erro: "" };

  const base = () => num(window.__PEDIDO_VALORES?.locacao_bv);
  const equipeAtual = () => (window.__pedidoEquipe ? window.__pedidoEquipe() : { equipe_id: null }).equipe_id || null;
  const pctPadrao = () => num(s.regra?.percentual);
  const pctTotal = () => (s.cfg?.manual ? num(s.cfg.percentual) : pctPadrao());
  const benefId = () => s.regra?.beneficiario_id || hidden.value || null;
  const pagoDe = (id) => num((s.registrado?.partes || []).find((p) => p.cliente_id === id && p.ativo)?.pago);
  const nomeDe = (id) => {
    if (id === s.regra?.beneficiario_id) return s.regra.beneficiario_nome || "Titular";
    const m = s.membros.find((x) => x.cliente_id === id); if (m) return m.nome;
    if (id === hidden.value) return input?.value || "Quem fez o pedido";
    return (s.cfg?.partes || []).find((p) => p.cliente_id === id)?.nome || (s.registrado?.partes || []).find((p) => p.cliente_id === id)?.nome || "Pessoa";
  };
  // quem pode receber parte: quem fez o pedido, a titular e as pessoas da equipe
  const candidatos = () => {
    const ids = [benefId(), hidden.value, ...s.membros.map((m) => m.cliente_id)].filter(Boolean);
    return [...new Set(ids)];
  };
  // divisão mostrada: a ajustada ou a padrão (titular com tudo; quem fez com 0 para facilitar dividir)
  function partesTela() {
    if (s.cfg?.partes?.length) return s.cfg.partes;
    const lista = [{ cliente_id: benefId(), percentual: pctTotal() }];
    if (hidden.value && hidden.value !== benefId()) lista.push({ cliente_id: hidden.value, percentual: 0 });
    return lista.filter((p) => p.cliente_id);
  }
  const soma = (lista) => r2(lista.reduce((t, p) => t + num(p.percentual), 0) * 100) / 100;
  const ehPadrao = () => !s.cfg || (!s.cfg.manual && !(s.cfg.partes || []).length);

  async function carregar() {
    const cliente = hidden.value || "", equipe = equipeAtual() || "";
    const pedido = window.__PEDIDO_DADOS_ATUAL?.id || null;
    const chave = [cliente, equipe, pedido].join("|");
    if (chave === s.chave) { pintar(); return; }
    const anterior = s.chave.split("|");
    s.chave = chave;
    if (!cliente) { s.regra = null; card.hidden = true; return; }
    const empresa = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    const { data, error } = await supabase.rpc("pedido_bv_regra", { p_empresa: empresa, p_pedido: pedido, p_cliente: cliente, p_equipe: equipe || null });
    if (s.chave !== chave) return;
    if (error) { console.warn("BV do pedido", error); s.erro = "Não foi possível carregar o BV."; s.regra = null; card.hidden = true; return; }
    s.erro = ""; s.regra = data?.regra || null; s.registrado = data?.registrado || null; s.membros = data?.membros || [];
    // primeira vez neste pedido: o que estava gravado; trocar cliente ou equipe volta ao padrão
    if (!s.carregou) {
      s.carregou = true;
      const salvo = window.__PEDIDO_DADOS_ATUAL?.observacoes?.bv;
      s.cfg = salvo && typeof salvo === "object" ? JSON.parse(JSON.stringify(salvo)) : null;
    } else if (anterior[0] !== cliente || anterior[1] !== equipe) {
      const ok = candidatos();
      if (s.cfg?.partes?.some((p) => !ok.includes(p.cliente_id))) s.cfg.partes = null;
    }
    pintar();
  }

  function pintar() {
    if (!s.regra || !hidden.value) { card.hidden = true; return; }
    card.hidden = false;
    const r = s.regra, total = pctTotal(), partes = partesTela(), distribuido = soma(partes), b = base();
    const pela = r.pela_titular ? `da titular <strong>${esc(r.beneficiario_nome)}</strong>${r.equipe_nome ? ` (${esc(r.equipe_nome)})` : ""}` : `do cadastro de <strong>${esc(r.beneficiario_nome || input?.value || "")}</strong>`;
    const restantes = candidatos().filter((id) => !partes.some((p) => p.cliente_id === id));
    const diferenca = r2(total - distribuido);
    card.innerHTML = `<h2 id="pedidoBvTitulo">BV do decorador</h2>
      <p class="pbv-regra">${num(r.percentual) > 0 ? `Padrão: <b>${num(r.percentual).toLocaleString("pt-BR")}%</b> ${pela}` : `Pelo cadastro, ${esc(r.beneficiario_nome || "o cliente")} não recebe BV.`}</p>
      <label class="pbv-manual"><input type="checkbox" data-pbv="manual"${s.cfg?.manual ? " checked" : ""}> BV negociado diferente neste pedido</label>
      ${s.cfg?.manual ? `<div class="pbv-neg"><label>BV do pedido<span><input type="number" min="0" max="100" step="0.01" data-pbv="pct" value="${esc(s.cfg.percentual ?? "")}"> % da locação</span></label>
        <label>Por quê<input type="text" maxlength="200" data-pbv="obs" value="${esc(s.cfg.observacao || "")}" placeholder="Ex.: negociado na reunião de 12/10"></label></div>` : ""}
      <div class="pbv-total"><span>BV deste pedido</span><strong>${total.toLocaleString("pt-BR")}% · ≈ ${brl(r2(b * total / 100))}</strong></div>
      ${total > 0 ? `<div class="pbv-div"><span class="pbv-sub">Quem recebe</span><ul>${partes.map((p, i) => {
        const pago = pagoDe(p.cliente_id);
        return `<li><span class="pbv-nome">${esc(nomeDe(p.cliente_id))}${p.cliente_id === r.beneficiario_id && r.pela_titular ? ' <small>titular</small>' : p.cliente_id === hidden.value ? " <small>fez o pedido</small>" : ""}${pago > 0 ? `<small class="pbv-pago">já pago ${brl(pago)}</small>` : ""}</span>
          <span class="pbv-pct"><input type="number" min="0" max="100" step="0.01" data-pbv-parte="${i}" value="${esc(p.percentual)}" aria-label="% da locação para ${esc(nomeDe(p.cliente_id))}">%</span>
          <span class="pbv-rs">${brl(r2(b * num(p.percentual) / 100))}</span>
          ${partes.length > 1 && pago <= 0 ? `<button type="button" class="pbv-rem" data-pbv-rem="${i}" aria-label="Tirar ${esc(nomeDe(p.cliente_id))}">×</button>` : "<span></span>"}</li>`;
      }).join("")}</ul>
      ${restantes.length ? `<select class="el-select pbv-add" data-pbv="add"><option value="">+ Dividir com…</option>${restantes.map((id) => `<option value="${id}">${esc(nomeDe(id))}</option>`).join("")}</select>` : ""}
      <p class="pbv-soma${Math.abs(diferenca) > 0.004 ? " is-erro" : ""}">${Math.abs(diferenca) > 0.004 ? (diferenca > 0 ? `Falta distribuir ${diferenca.toLocaleString("pt-BR")}%` : `Passou ${(-diferenca).toLocaleString("pt-BR")}%`) + ` (distribuído ${distribuido.toLocaleString("pt-BR")}% de ${total.toLocaleString("pt-BR")}%)` : "Divisão completa"}</p></div>` : ""}
      ${ehPadrao() ? "" : '<button type="button" class="pbv-padrao" data-pbv="padrao">Voltar ao padrão</button>'}
`;
  }

  function editar(fn) {
    if (!s.cfg) s.cfg = { manual: false, percentual: null, observacao: "", partes: null };
    if (!s.cfg.partes?.length) s.cfg.partes = partesTela().map((p) => ({ ...p }));
    fn(s.cfg);
    s.cfg.partes = s.cfg.partes.map((p) => ({ cliente_id: p.cliente_id, nome: nomeDe(p.cliente_id), percentual: num(p.percentual) }));
    // divisão igual à padrão (tudo para quem recebe por padrão) não precisa ser guardada
    const resto = s.cfg.partes.filter((p) => p.cliente_id !== benefId());
    if (resto.every((p) => !num(p.percentual) && p.cliente_id === hidden.value) && Math.abs(num(s.cfg.partes.find((p) => p.cliente_id === benefId())?.percentual) - pctTotal()) < 0.005) s.cfg.partes = null;
    if (!s.cfg.manual && !s.cfg.partes) s.cfg = null;
    window.__pedidoHouveEdicao?.();
    pintar();
  }

  card.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches('[data-pbv="manual"]')) {
      const ligar = t.checked;
      if (!s.cfg) s.cfg = { manual: false, percentual: null, observacao: "", partes: null };
      s.cfg.manual = ligar;
      if (ligar && s.cfg.percentual == null) s.cfg.percentual = pctPadrao();
      if (!ligar) { s.cfg.percentual = null; s.cfg.observacao = ""; }
      // ao mudar o total, a divisão volta para tudo com quem recebe por padrão
      s.cfg.partes = null;
      if (!s.cfg.manual) s.cfg = null;
      window.__pedidoHouveEdicao?.(); pintar();
    } else if (t.matches('[data-pbv="pct"]')) {
      s.cfg.percentual = num(t.value); s.cfg.partes = null; window.__pedidoHouveEdicao?.(); pintar();
    } else if (t.matches('[data-pbv="obs"]')) {
      s.cfg.observacao = t.value.trim(); window.__pedidoHouveEdicao?.();
    } else if (t.matches("[data-pbv-parte]")) {
      const i = +t.dataset.pbvParte; editar((c) => { c.partes[i].percentual = num(t.value); });
    } else if (t.matches('[data-pbv="add"]') && t.value) {
      const id = t.value; editar((c) => { c.partes.push({ cliente_id: id, percentual: 0 }); });
      card.querySelector(`[data-pbv-parte="${(s.cfg?.partes || partesTela()).length - 1}"]`)?.focus();
    }
  });
  card.addEventListener("click", (e) => {
    const rem = e.target.closest("[data-pbv-rem]");
    if (rem) { const i = +rem.dataset.pbvRem; editar((c) => { c.partes.splice(i, 1); }); return; }
    if (e.target.closest('[data-pbv="padrao"]')) { s.cfg = null; window.__pedidoHouveEdicao?.(); pintar(); }
  });

  // recarrega quando muda o cliente, a equipe ou o pedido aberto; o valor estimado acompanha a locação
  input?.addEventListener("cliente-selecionado", () => setTimeout(carregar, 0));
  document.addEventListener("pedido-equipe-mudou", () => carregar());
  let ultimaBase = null;
  setInterval(() => {
    if (card.hidden && !hidden.value) return;
    const b = base(), chave = [hidden.value || "", equipeAtual() || "", window.__PEDIDO_DADOS_ATUAL?.id || ""].join("|");
    if (chave !== s.chave) carregar(); else if (b !== ultimaBase && !card.contains(document.activeElement)) { ultimaBase = b; pintar(); }
  }, 1500);

  // salvar: undefined = não carregou (mantém o que estava gravado); null = padrão
  window.__pedidoBV = () => {
    if (!s.carregou) return undefined;
    if (ehPadrao()) return null;
    return { manual: !!s.cfg.manual, percentual: s.cfg.manual ? num(s.cfg.percentual) : null, observacao: s.cfg.observacao || "", partes: s.cfg.partes || null };
  };
  window.__pedidoValidarBV = () => {
    if (!s.carregou || ehPadrao()) return "";
    if (s.cfg.manual) {
      const p = num(s.cfg.percentual);
      if (s.cfg.percentual === "" || s.cfg.percentual == null || p < 0 || p > 100) return "Informe o BV negociado deste pedido (entre 0 e 100%).";
    }
    const partes = s.cfg.partes;
    if (partes?.length && Math.abs(soma(partes) - pctTotal()) > 0.004)
      return `A divisão do BV soma ${soma(partes).toLocaleString("pt-BR")}%, mas o BV do pedido é ${pctTotal().toLocaleString("pt-BR")}%.`;
    const menorQuePago = (partes || []).find((p) => pagoDe(p.cliente_id) > r2(base() * num(p.percentual) / 100) + 0.009);
    if (menorQuePago) return `O BV de ${nomeDe(menorQuePago.cliente_id)} ficaria menor do que já foi pago. Estorne o pagamento antes.`;
    return "";
  };
}
