/* Painel de Complexidade sem o servidor antigo (nov/2026): a lista vem do banco (complexidade_contextos_tela) e a nota
   é calculada aqui com js/shared/complexidade.js. A planilha "Matriz" só tinha o cabeçalho (nenhuma avaliação manual)
   e a aba "Comissão" estava vazia, então nada se perde. As avaliações são sempre automáticas: não há mais lançamento à mão. */
(function () {
  "use strict";
  let empresa = null;
  async function empresaAtual() {
    if (empresa) return empresa;
    try { empresa = window.parent.__CONTEXT?.empresa_id || window.__CONTEXT?.empresa_id; } catch (_) {}
    empresa = empresa || sessionStorage.getItem("empresa_id");
    if (!empresa) {
      const { data: s } = await supabaseClient.auth.getSession();
      if (!s.session) throw new Error("Entre no sistema para ver a complexidade.");
      const { data, error } = await supabaseClient.from("usuarios_empresas").select("empresa_id").eq("user_id", s.session.user.id).limit(1).single();
      if (error) throw error;
      empresa = data.empresa_id;
    }
    return empresa;
  }
  async function listarPedidos() {
    const emp = await empresaAtual();
    const { data, error } = await supabaseClient.rpc("complexidade_contextos_tela", { p_empresa: emp });
    if (error) throw error;
    return (data || []).map(c => {
      const p = { ...CXRegras.paraPainel(c), empresa_id: emp, planejamento: c.excecoes || {}, contexto: c };
      for (const suf of ["", "Pintura", "Montagem", "Triagem", "Carregamento"]) { p["comissao" + suf] = 0; p["valorComissao" + suf] = 0; }
      return p;
    });
  }
  const automatico = async () => { throw new Error("As avaliações de complexidade são automáticas: não há lançamento manual."); };
  window.ACERVO_LOCAL = Object.assign(window.ACERVO_LOCAL || {}, {
    listarPedidos, validarSenhaPlanilha: async () => true, salvarLotePedidos: automatico, atualizarPedido: automatico
  });
})();
