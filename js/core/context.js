/**
 * CONTEXT MODULE — Session & Global State Initialization
 *
 * Initializes window.__CONTEXT with:
 * - empresa_id
 * - usuario_id
 * - usuario_nome
 * - empresa_nome
 */

/**
 * Espera window.__CONTEXT estar pronto (ou o evento "easyloc:context-ready").
 * Cada módulo hoje é um documento próprio, então o script do módulo pode
 * começar a rodar ANTES desta IIFE terminar de resolver a sessão/empresa no
 * Supabase. Use sempre isto (em vez de ler window.__CONTEXT direto) antes de
 * qualquer consulta que dependa de empresa_id, ou a lista pode carregar vazia
 * de forma intermitente (bug real encontrado nos módulos de Clientes,
 * Fornecedores e Caminhões).
 */
window.aguardarContexto = function (timeoutMs = 10000) {
  if (window.__CONTEXT?.empresa_id) return Promise.resolve(window.__CONTEXT);

  return new Promise((resolve) => {
    let timer;
    const onReady = () => {
      clearTimeout(timer);
      window.removeEventListener("easyloc:context-ready", onReady);
      resolve(window.__CONTEXT || null);
    };
    window.addEventListener("easyloc:context-ready", onReady);
    timer = setTimeout(() => {
      window.removeEventListener("easyloc:context-ready", onReady);
      resolve(window.__CONTEXT || null);
    }, timeoutMs);
  });
};

(async () => {
  
  // 🔐 PROTEÇÃO 1 — veio do login?
  const veioDoLogin = sessionStorage.getItem("login_ok");

  if (!veioDoLogin) {
    try { await window.supabaseClient.auth.signOut(); } catch(e){}
    window.location.href = "login.html";
    return;
  }

  // 🔐 PROTEÇÃO 2 — sessão Supabase válida?
  const { data: { session } } =
    await window.supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  // 🔄 escuta logout
  window.supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      window.location.href = "login.html";
    }
  });

  /* =====================================================
     CONTEXTO GLOBAL (VINDO DO LOGIN)
  ===================================================== */

  const empresaId = sessionStorage.getItem("empresa_id"); 
  const usuarioNome = sessionStorage.getItem("usuario_nome");

  if (!empresaId) {
    window.location.href = "login.html";
    return;
  }

  // 🔥 PEGA ID REAL DO USUÁRIO LOGADO
  const { data:{ user } } =
    await window.supabaseClient.auth.getUser();

  // Validação por empresa antes de liberar qualquer módulo para a sessão.
  const { data: acessoFuncionario, error: erroAcessoFuncionario } =
    await window.supabaseClient.rpc("funcionario_contexto", { p_empresa_id: empresaId });
  if (!user || erroAcessoFuncionario || !acessoFuncionario?.ativo) {
    [...document.body.children].filter(el => !['SCRIPT', 'STYLE'].includes(el.tagName)).forEach(el => { el.hidden = true; });
    const aviso = document.createElement("p");
    aviso.textContent = erroAcessoFuncionario
      ? "Não foi possível validar seu acesso. Recarregue a página para tentar novamente."
      : "Seu acesso está inativo. Consulte o administrador.";
    aviso.style.cssText = "padding:32px;font:16px system-ui;color:#374151";
    document.body.appendChild(aviso);
    if (!erroAcessoFuncionario) await window.supabaseClient.auth.signOut();
    return;
  }

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
