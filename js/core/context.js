/**
 * CONTEXT MODULE — Session & Global State Initialization
 * 
 * Initializes window.__CONTEXT with:
 * - empresa_id
 * - usuario_id  
 * - usuario_nome
 * - empresa_nome
 */

(async () => {
  
  // 🔐 PROTEÇÃO 1 — veio do login?
  const veioDoLogin = sessionStorage.getItem("login_ok");

  if (!veioDoLogin) {
    try { await window.supabaseClient.auth.signOut(); } catch(e){}
    window.location.href = "index.html";
    return;
  }

  // limpa flag após uso
  sessionStorage.removeItem("login_ok");

  // 🔐 PROTEÇÃO 2 — sessão Supabase válida?
  const { data: { session } } =
    await window.supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "index.html";
    return;
  }

  // 🔄 escuta logout
  window.supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      window.location.href = "index.html";
    }
  });

  /* =====================================================
     CONTEXTO GLOBAL (VINDO DO LOGIN)
  ===================================================== */

  const empresaId = sessionStorage.getItem("empresa_id"); 
  const usuarioNome = sessionStorage.getItem("usuario_nome");

  if (!empresaId) {
    window.location.href = "index.html";
    return;
  }

  // 🔥 PEGA ID REAL DO USUÁRIO LOGADO
  const { data:{ user } } =
    await window.supabaseClient.auth.getUser();

  window.__CONTEXT = {
    empresa_id: empresaId,
    usuario_id: user.id,   // ✅ ESSENCIAL
    usuario_nome: usuarioNome || "Usuário"
  };

  // ===== UI (não depende de funções) =====
  const elEmpresa = document.getElementById("empresaNome");
  const elUsuario = document.getElementById("usuarioNome");

  if (elUsuario){
    elUsuario.childNodes[0].nodeValue =
      window.__CONTEXT.usuario_nome;
  }

  /* =========================
     BUSCAR EMPRESA
  ========================= */

  const { data: empresa } =
    await window.supabaseClient
      .from("empresas")
      .select("nome")
      .eq("id", empresaId)
      .single();

  if(empresa){
    window.__CONTEXT.empresa_nome = empresa.nome;

    if(elEmpresa){
      elEmpresa.innerText = empresa.nome;
    }
  }else{
    if(elEmpresa){
      elEmpresa.innerText = "Acervo";
    }
  }

  // ✅ Avatar: só chama quando a função existir
  if (window.EasyLocTheme?.applyForEmpresa) {
    await window.EasyLocTheme.applyForEmpresa(empresaId);
  }

  if (typeof atualizarAvatarSidebar === "function") {
    await atualizarAvatarSidebar();
  }

  window.dispatchEvent(new CustomEvent("easyloc:context-ready", {
    detail: window.__CONTEXT
  }));

  window.EasyLocPreload?.start?.(window.__CONTEXT);

})();
