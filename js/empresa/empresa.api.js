(function () {

  // Acesso aos dados e configurações da empresa em Parâmetros.
  const api = {

    /* =====================================================
       EMPRESA
    ===================================================== */

    getEmpresa: async (id) => {
      const { data, error } = await window.supabaseClient
        .from('empresas')
        .select('*')
        .eq('id', id)
        .single();

      if (error) console.error(error);
      return data;
    },

    getConfig: async (id) => {
      const { data, error } = await window.supabaseClient
        .from('empresas_configuracoes')
        .select('*')
        .eq('empresa_id', id)
        .single();

      if (error) console.error(error);
      return data;
    },

    saveEmpresa: (id, payload) => {
      return window.supabaseClient
        .from('empresas')
        .update(payload)
        .eq('id', id);
    },

    saveConfig: (payload) => {
      return window.supabaseClient
        .from('empresas_configuracoes')
        .upsert(payload, { onConflict: 'empresa_id' });
    },

    getIdentidadeVisual: async (empresaId) => {
      const { data, error } = await window.supabaseClient
        .from('configuracoes_empresa')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) console.error("getIdentidadeVisual error:", error);
      return data;
    },

    saveIdentidadeVisual: (payload) => {
      return window.supabaseClient
        .from('configuracoes_empresa')
        .upsert(payload, { onConflict: 'empresa_id' })
        .select()
        .maybeSingle();
    },

    getLogisticaRegras: async (empresaId) => {
      const { data, error } = await window.supabaseClient
        .from('empresa_logistica_regras')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) console.error("getLogisticaRegras error:", error);
      return data;
    },

    saveLogisticaRegras: (payload) => {
      return window.supabaseClient
        .from('empresa_logistica_regras')
        .upsert(payload, { onConflict: 'empresa_id' });
    },

    /* =====================================================
   FINANCEIRO
===================================================== */

    getFinanceiro: async (id) => {
      const { data, error } = await window.supabaseClient
        .from('empresa_financeiro')
        .select('*')
        .eq('empresa_id', id)
        .maybeSingle();

      if (error) console.error(error);
      return data;
    },

    saveFinanceiro: (payload) => {
      return window.supabaseClient
        .from('empresa_financeiro')
        .upsert(payload, { onConflict: 'empresa_id' });
    },
    /* =====================================================
       CAMINHÕES
    ===================================================== */

    listCategoriasCaminhao: async (empresaId) => {
      const {data,error}=await window.supabaseClient.from('categorias_caminhao').select('*').eq('empresa_id',empresaId).order('ordem',{ascending:true});
      if(error)throw error;
      return data||[];
    },

    insertCategoriaCaminhao: (payload) => {
      return window.supabaseClient
        .from('categorias_caminhao')
        .insert([payload]);
    },

    updateCategoriaCaminhao: (id, payload) => {
      return window.supabaseClient
        .from('categorias_caminhao')
        .update(payload)
        .eq('id', id);
    },

    /* =====================================================
       🔥 MONTAGEM — DEBUG PROFUNDO
    ===================================================== */

    listCategoriasMontagem: async (empresaId) => {
      const {data,error}=await window.supabaseClient.from('categorias_montagem').select('*').eq('empresa_id',empresaId).order('ordem',{ascending:true});
      if(error)throw error;
      return data||[];
    },

    insertCategoriaMontagem: (payload) => {

      console.log("🟢 INSERT montagem payload:", payload);

      return window.supabaseClient
        .from('categorias_montagem')
        .insert([payload]);
    },

    updateCategoriaMontagem: (id, payload) => {

      console.log("🟡 UPDATE montagem:", id, payload);

      return window.supabaseClient
        .from('categorias_montagem')
        .update(payload)
        .eq('id', id);
    },

    /* =====================================================
   FINANCEIRO
===================================================== */

    getFinanceiro: async (empresaId) => {
      const { data, error } = await window.supabaseClient
        .from('empresa_financeiro')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) console.error("getFinanceiro error:", error);
      return data;
    },

    saveFinanceiro: (payload) => {
      return window.supabaseClient
        .from('empresa_financeiro')
        .upsert(payload, { onConflict: 'empresa_id' });
    },
    /* =====================================================
       DASHBOARD
    ===================================================== */

    getDashboardEmpresa: async (empresaId) => {
      const { data, error } = await window.supabaseClient
        .rpc('get_dashboard_empresa', { p_empresa: empresaId });

      if (error) console.error(error);
      return data;
    }

  };

  window.empresa = window.empresa || {};
  window.empresa.api = api;

})();
