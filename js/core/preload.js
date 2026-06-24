(function () {
  "use strict";

  const state = {
    started: false,
    ready: false,
    data: {}
  };

  function firstImageUrl(row) {
    return row?.foto_url || row?.imagem_url || row?.url_imagem || row?.foto || "";
  }

  function warmImages(rows) {
    rows
      .map(firstImageUrl)
      .filter(Boolean)
      .slice(0, 24)
      .forEach(src => {
        const img = new Image();
        img.decoding = "async";
        img.loading = "eager";
        img.src = src;
      });
  }

  async function safeQuery(key, queryBuilder) {
    try {
      const { data, error } = await queryBuilder();
      if (error) throw error;
      state.data[key] = data || [];
      return state.data[key];
    } catch (error) {
      console.warn(`[EasyLoc Preload] ${key} ignorado:`, error);
      state.data[key] = [];
      return [];
    }
  }

  async function start(context) {
    if (state.started || !context?.empresa_id || !window.supabaseClient) return state;
    state.started = true;

    const empresaId = context.empresa_id;
    const client = window.supabaseClient;

    const [clientes, locais, itens] = await Promise.all([
      safeQuery("clientes", () =>
        client
          .from("clientes_empresas")
          .select("id,nome,telefone,email,empresa_id")
          .eq("empresa_id", empresaId)
          .limit(20)
      ),
      safeQuery("locais", () =>
        client
          .from("locais")
          .select("id,nome,endereco,referencia,empresa_id")
          .eq("empresa_id", empresaId)
          .limit(20)
      ),
      safeQuery("itens", () =>
        client
          .from("itens")
          .select("id,nome,codigo,foto_url,imagem_url,url_imagem,empresa_id")
          .eq("empresa_id", empresaId)
          .limit(24)
      )
    ]);

    warmImages(itens);
    window.EasyLocCache = { ...(window.EasyLocCache || {}), clientes, locais, itens };
    state.ready = true;
    window.dispatchEvent(new CustomEvent("easyloc:preload-ready", { detail: state.data }));

    return state;
  }

  window.EasyLocPreload = { start, state };
})();
