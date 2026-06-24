(function () {

  // wrapper around Supabase calls for empresa modal
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

      console.log("🚚 listCategoriasCaminhao empresaId =", empresaId);

      const { data, error } = await window.supabaseClient
        .from('categorias_caminhao')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('ordem', { ascending: true });

      if (error) console.error(error);

      console.log("🚚 categorias_caminhao retorno:", data);

      return data || [];
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

      console.log("======================================");
      console.log("🧪 listCategoriasMontagem START");
      console.log("empresaId recebido:", empresaId);
      console.log("__CONTEXT empresa:", window.__CONTEXT?.empresa_id);

      const TABLE = "categorias_montagem";

      /* ---------- verificar conexão ---------- */

      console.log(
        "Supabase URL:",
        window.supabaseClient?.supabaseUrl ||
        window.supabaseClient?.rest?.url ||
        "não detectado"
      );

      console.log("Tabela usada:", TABLE);

      /* =====================================================
         TESTE 1 — SEM FILTRO
      ===================================================== */

      const r0 = await window.supabaseClient
        .from(TABLE)
        .select("id, empresa_id, combinacao, ativo, ordem")
        .limit(10);

      console.log("🧪 r0 (SEM filtro) =>", r0);

      /* =====================================================
         TESTE 2 — COM FILTRO empresa_id
      ===================================================== */

      const r1 = await window.supabaseClient
        .from(TABLE)
        .select("*")
        .eq("empresa_id", empresaId)
        .order("ordem", { ascending: true });

      console.log("🧪 r1 (COM empresa_id) =>", r1);

      /* =====================================================
         TESTE 3 — LISTAR empresa_ids EXISTENTES
      ===================================================== */

      if (!r1.error && (!r1.data || r1.data.length === 0)) {

        const r2 = await window.supabaseClient
          .from(TABLE)
          .select("empresa_id")
          .limit(50);

        console.log("🧪 r2 empresa_ids existentes:", r2);
      }

      if (r1.error) {
        console.error("❌ ERRO SELECT montagem:", r1.error);
        return [];
      }

      console.log(
        "✅ RESULTADO FINAL:",
        r1.data?.length || 0,
        "registros"
      );

      console.log("======================================");

      return r1.data || [];
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
