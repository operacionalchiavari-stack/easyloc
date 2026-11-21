/* Controle RH sem o servidor antigo (nov/2026): as funções que a tela chamava no Google (google.script.run)
   rodam aqui, direto no Supabase (tabela controle_rh_ocorrencias e Cadastro de Funcionários).
   Respostas no MESMO formato de antes, então o rh.html não muda. Compartilhado com a Gestão de Pessoas
   (window.ControleRHDados.historico). */
(function () {
  "use strict";
  const sb = () => {
    try { if (window.top && window.top !== window && window.top.supabaseClient) return window.top.supabaseClient; } catch (_) {}
    return window.supabaseClient;
  };
  let empresa = null;
  async function empresaAtual() {
    if (empresa) return empresa;
    try { empresa = window.top.__CONTEXT?.empresa_id || window.__CONTEXT?.empresa_id; } catch (_) {}
    empresa = empresa || sessionStorage.getItem("empresa_id");
    if (!empresa) {
      const { data: s } = await sb().auth.getSession();
      if (!s.session) throw new Error("Entre no sistema para usar esta tela.");
      const { data, error } = await sb().from("usuarios_empresas").select("empresa_id").eq("user_id", s.session.user.id).limit(1).single();
      if (error) throw error;
      empresa = data.empresa_id;
    }
    return empresa;
  }
  const br = d => { const [a, m, dd] = String(d || "").slice(0, 10).split("-"); return a ? dd + "/" + m + "/" + a : ""; };
  const iso = v => { const t = String(v || "").trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
  const horaSP = ts => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(ts));
  const dataSP = ts => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ts));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  async function funcionarios() {
    const { data, error } = await sb().from("funcionarios_acesso").select("id,nome,setor,cargo,ativo").eq("empresa_id", await empresaAtual()).order("nome");
    if (error) throw error;
    return (data || []).filter(f => f.ativo !== false && f.nome);
  }

  async function historico() {
    const { data, error } = await sb().from("controle_rh_ocorrencias")
      .select("id,data_ocorrencia,hora_ocorrencia,funcionario_id,funcionario_nome,setor,tipo,observacao,responsavel,registrado_em")
      .eq("empresa_id", await empresaAtual())
      .order("data_ocorrencia", { ascending: false }).order("registrado_em", { ascending: false }).limit(5000);
    if (error) throw error;
    return (data || []).map(o => {
      const d = br(o.data_ocorrencia), h = String(o.hora_ocorrencia || "").slice(0, 5);
      return { id: o.id, data: d, hora: h, dataOcorrencia: d, horaOcorrencia: h, funcionario: o.funcionario_nome, funcionarioId: o.funcionario_id,
        setor: o.setor || "", tipo: o.tipo || "", observacao: o.observacao || "", responsavel: o.responsavel || "",
        dataRegistro: dataSP(o.registrado_em), horaRegistro: horaSP(o.registrado_em) };
    });
  }

  async function salvarLote(lote) {
    if (!Array.isArray(lote) || !lote.length) throw new Error("Nenhuma ocorrência foi enviada.");
    const emp = await empresaAtual(), pessoas = await funcionarios();
    const porNome = new Map(pessoas.map(f => [norm(f.nome), f.id]));
    const linhas = lote.map(item => {
      const nome = String(item.funcionario || "").trim(), data = iso(item.dataOcorrencia);
      if (!nome) throw new Error("Existe uma ocorrência sem funcionário informado.");
      if (!data) throw new Error("Informe a data em que a ocorrência aconteceu.");
      const hora = String(item.horaOcorrencia || "").trim().slice(0, 5);
      return { empresa_id: emp, data_ocorrencia: data, hora_ocorrencia: /^\d{2}:\d{2}$/.test(hora) ? hora : null,
        funcionario_id: porNome.get(norm(nome)) || null, funcionario_nome: nome, setor: String(item.setor || "").trim() || null,
        tipo: String(item.tipo || "").trim() || "Ocorrência", observacao: String(item.observacao || "").trim() || null,
        responsavel: String(item.responsavel || "").trim() || null };
    });
    const { error } = await sb().from("controle_rh_ocorrencias").insert(linhas);
    if (error) throw error;
    return true;
  }

  window.ControleRHDados = { historico, funcionarios };
  window.ACERVO_LOCAL = Object.assign(window.ACERVO_LOCAL || {}, {
    iniciarSistemaRH: async () => true,
    validarSenhaRH: async () => true,
    getFuncionarios: async () => (await funcionarios()).map(f => ({ nomeCompleto: f.nome.trim(), cpf: "", setor: f.setor || "", cargo: f.cargo || "" })),
    salvarLoteRH: salvarLote,
    getHistoricoRH: historico
  });
})();
