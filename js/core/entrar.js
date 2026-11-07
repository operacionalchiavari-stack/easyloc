/* Entrada no sistema (nov/2026): a mesma regra do login do computador (login.html) e do app de celular (app.html).
   E-mail ou login + senha → verificação em duas etapas → vínculo com empresa → acesso ativo → assinatura ativa.
   Devolve { empresaId, nome } ou lança Error com a mensagem para a pessoa. Grava sessionStorage como sempre. */
(function(){
  "use strict";
  async function entrar(email, senha, aoMudar){
    const sb = window.supabaseClient;
    const passo = typeof aoMudar === "function" ? aoMudar : function(){};
    email = String(email || "").trim();
    if(!email || !senha){ throw new Error("Preencha e-mail e senha."); }
    let data, error;
    if(email.includes("@")){
      ({ data, error } = await sb.auth.signInWithPassword({ email, password: senha }));
    } else {
      const result = await sb.functions.invoke("funcionarios-admin", { body: { action: "login", login: email, password: senha } });
      error = result.error;
      if(!error && result.data?.session){ ({ data, error } = await sb.auth.setSession(result.data.session)); }
    }
    if(error || !data?.user){ throw new Error("E-mail ou senha incorretos."); }
    const userId = data.user.id;
    // Verificação em duas etapas: com a exigência ligada, o código do WhatsApp vem antes de qualquer dado.
    // Se a função não responder, segue: quem barra de verdade é o banco (funcionario_contexto avisa abaixo).
    passo("Verificando…");
    try{
      const liberado = await window.EasyLoc2FA.garantir({ supabase: sb });
      if(!liberado){ await sb.auth.signOut(); throw new Error("Entrada cancelada."); }
    }catch(e){
      if(e && e.message === "Entrada cancelada."){ throw e; }
      console.warn("[entrar] verificação em duas etapas indisponível", e);
    }
    const { data: vinculos, error: erroVinculo } = await sb.from("usuarios_empresas").select("empresa_id").eq("user_id", userId).limit(1);
    if(erroVinculo || !vinculos || !vinculos.length){ throw new Error("Usuário não está vinculado a nenhuma empresa."); }
    const empresaId = vinculos[0].empresa_id;
    const acesso = await sb.rpc("funcionario_contexto", { p_empresa_id: empresaId });
    if(acesso.error || !acesso.data?.ativo){
      await sb.auth.signOut();
      throw new Error(acesso.data?.dois_fatores_pendente ? "Não foi possível confirmar o código do WhatsApp. Entre de novo." : "Acesso indisponível. Consulte o administrador.");
    }
    const { data: assinatura, error: erroAssinatura } = await sb.from("assinaturas").select("status,vencimento").eq("empresa_id", empresaId).single();
    if(erroAssinatura || !assinatura){ throw new Error("Nenhuma assinatura encontrada. Entre em contato com o suporte."); }
    if(assinatura.status !== "ativo" || new Date(assinatura.vencimento) < new Date()){ throw new Error("Assinatura inativa ou vencida. Entre em contato com o suporte."); }
    const { data: usuario, error: erroUsuario } = await sb.from("usuarios").select("nome").eq("id", userId).single();
    if(erroUsuario){ console.error("Erro ao buscar usuário:", erroUsuario); }
    const nome = acesso.data?.nome || usuario?.nome || "Usuário";
    sessionStorage.setItem("login_ok", "1");
    sessionStorage.setItem("empresa_id", empresaId);
    sessionStorage.setItem("usuario_nome", nome);
    return { empresaId, nome, userId };
  }
  window.EasyLocEntrar = { entrar };
})();
