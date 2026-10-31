// Equipe do pedido (out/2026): quando a pessoa que faz o pedido está em uma ou mais equipes do Cadastro de Clientes,
// o pedido guarda de qual equipe ele é (observacoes.equipe_id / equipe_nome). 0 equipes = nada; 1 = escolhida sozinha;
// mais de uma = a pessoa escolhe (obrigatório para salvar).
export function initEquipePedido({ supabase }) {
  const input = document.getElementById("clienteInput");
  const hidden = document.getElementById("clienteIdHidden");
  if (!input || !hidden) return;
  const s = { clienteId: "", equipes: [], escolhida: "", carregando: null };

  const caixa = document.createElement("div");
  caixa.className = "pedido-equipe";
  caixa.hidden = true;
  caixa.innerHTML = '<label for="pedidoEquipe">Equipe</label><select id="pedidoEquipe" class="el-select"></select><small></small>';
  (input.closest(".autocomplete-wrapper") || input).after(caixa);
  const sel = caixa.querySelector("select");
  const dica = caixa.querySelector("small");
  sel.addEventListener("change", () => { s.escolhida = sel.value; caixa.classList.remove("is-invalido"); pintar(); });

  function pintar() {
    document.dispatchEvent(new Event("pedido-equipe-mudou"));
    if (!s.equipes.length) { caixa.hidden = true; return; }
    caixa.hidden = false;
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    sel.innerHTML = (s.equipes.length > 1 ? '<option value="">Qual equipe?</option>' : "") +
      s.equipes.map((e) => `<option value="${e.id}"${e.id === s.escolhida ? " selected" : ""}>${esc(e.nome)}${e.papel ? " · " + esc(e.papel) : ""}</option>`).join("");
    if (s.equipes.length === 1) s.escolhida = s.equipes[0].id;
    sel.disabled = s.equipes.length === 1;
    if (s.equipes.length === 1) document.dispatchEvent(new Event("pedido-equipe-mudou"));
    dica.textContent = s.equipes.length > 1 ? "Esta pessoa está em mais de uma equipe: escolha de qual é este pedido." : "";
  }

  async function carregar(clienteId, preferida) {
    s.clienteId = clienteId || "";
    s.equipes = [];
    s.escolhida = preferida || "";
    if (!clienteId) { pintar(); return; }
    const empresa = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    const p = supabase.from("clientes_equipe_membros")
      .select("equipe_id, papel:clientes_equipe_papeis(nome), equipe:clientes_equipes(id,nome,ativo)")
      .eq("empresa_id", empresa).eq("cliente_id", clienteId);
    s.carregando = p;
    const { data, error } = await p;
    if (s.carregando !== p || s.clienteId !== clienteId) return;
    s.carregando = null;
    if (error) { console.warn("equipes do cliente", error); pintar(); return; }
    s.equipes = (data || []).filter((m) => m.equipe && m.equipe.ativo !== false)
      .map((m) => ({ id: m.equipe.id, nome: m.equipe.nome, papel: m.papel?.nome || "" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    // pedido antigo com uma equipe que a pessoa não está mais: mantém a escolhida para não perder o registro
    const salva = window.__PEDIDO_DADOS_ATUAL?.observacoes;
    if (preferida && !s.equipes.some((e) => e.id === preferida) && salva?.equipe_id === preferida)
      s.equipes.unshift({ id: preferida, nome: salva.equipe_nome || "Equipe", papel: "não faz mais parte" });
    if (!s.equipes.some((e) => e.id === s.escolhida)) s.escolhida = "";
    pintar();
  }

  input.addEventListener("cliente-selecionado", (e) => {
    const id = e.detail?.id || hidden.value || "";
    const salva = window.__PEDIDO_DADOS_ATUAL?.observacoes;
    const preferida = salva && (window.__PEDIDO_DADOS_ATUAL?.cliente_id || "") === id ? salva.equipe_id || "" : (id === s.clienteId ? s.escolhida : "");
    if (id && id === s.clienteId && s.equipes.length) { if (preferida) { s.escolhida = preferida; pintar(); } return; }
    carregar(id, preferida);
  });
  input.addEventListener("input", () => { if (s.clienteId) carregar("", ""); });

  // salvar: o que vai em observacoes
  window.__pedidoEquipe = () => {
    const e = s.equipes.find((x) => x.id === s.escolhida);
    return e ? { equipe_id: e.id, equipe_nome: e.nome } : { equipe_id: null, equipe_nome: null };
  };
  // salvar: com mais de uma equipe, precisa escolher
  window.__pedidoValidarEquipe = () => {
    if (s.equipes.length > 1 && !s.escolhida) { caixa.classList.add("is-invalido"); sel.focus({ preventScroll: true }); return "Escolha de qual equipe é este pedido."; }
    return "";
  };
}
