/* App de celular do sistema (nov/2026). Login = o mesmo do sistema (js/core/entrar.js); depois, a tela Início com os
   módulos que a pessoa pode abrir (RPC app_celular_modulos): Triagem e Montagem. Cada módulo é o app que já existia,
   aberto na página inteira com ?app=1 (eles usam esta mesma sessão e têm o botão "Início" para voltar para cá).
   No login, os móveis do acervo flutuam e se revezam (mesma RPC pública do login do sistema). */
(function(){
  "use strict";
  const sb = window.supabaseClient;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MODULOS = [
    { chave: "triagem", nome: "Triagem", texto: "Separar os pedidos na ida e conferir na volta.", href: "Modulos/Estoque/TriagemApp/triagem.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6M7 7h3v3H7zm7 0h3v3h-3zM7 14h3v3H7zm7 0h3v3h-3z"/></svg>' },
    { chave: "expedicao", nome: "Expedição", texto: "Conferir o carregamento e o descarregamento com o QR.", href: "Modulos/Logistica/ExpedicaoApp/expedicao.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>' },
    { chave: "montagem", nome: "Montagem", texto: "Suas montagens e desmontagens do dia.", href: "Modulos/Chiavari/Cronograma/montador.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>' },
    { chave: "catalogo", nome: "Catálogo", texto: "O acervo completo, com fotos, medidas e disponibilidade.", href: "Modulos/Comercial/Catalogo/catalogo-app.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/><path d="M7 8h1.5M7 11h1.5M16 8h-1M16 11h-1"/></svg>' },
    { chave: "bonus", nome: "Meu bônus", texto: "Seu bônus, extrato e prêmios.", href: "Modulos/Chiavari/Cronograma/montador.html?app=1&tela=bonus",
      icone: '<svg viewBox="0 0 24 24"><path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/></svg>' },
  ];
  function tela(id){ ["apCarregando", "apLogin", "apInicio"].forEach((x) => { $(x).hidden = x !== id; }); document.body.dataset.tela = id;
    // Nov/2026: ao abrir o app (inclusive pelo ícone na tela do celular) entra a animação padrão até a tela ficar pronta.
    if(window.AppCarregamento){ id === "apCarregando" ? AppCarregamento.mostrar() : AppCarregamento.pronto(); }
    if(id === "apLogin"){ iniciarVitrine(); try{ const aviso = sessionStorage.getItem("app_aviso"); if(aviso){ sessionStorage.removeItem("app_aviso"); mensagem(aviso); } }catch(e){} } }
  function mensagem(t){ $("apMsg").textContent = t || ""; }
  const empresaQuery = () => new URLSearchParams(location.search).get("empresa");

  /* ---------- Logo da empresa e vitrine de móveis ---------- */
  let dadosVitrine = null;
  async function carregarVitrine(){
    if(dadosVitrine){ return dadosVitrine; }
    try{
      const e = empresaQuery();
      const { data } = await sb.rpc("catalogo_vitrine_login", e ? { p_empresa_id: e } : {});
      dadosVitrine = data || {};
    }catch(err){ dadosVitrine = {}; }
    const empresa = dadosVitrine.empresa || {};
    if(empresa.logo_url){
      const img = new Image(); img.alt = empresa.nome || "Logo"; img.className = "ap-logo";
      img.onload = () => { if(img.naturalWidth / img.naturalHeight < 1.6){ img.classList.add("is-quadrada"); } $("apMarca").replaceChildren(img); };
      // Nov/2026: o carregamento padrão dos módulos (js/app/carregamento-app.js) usa esta logo.
      try{ localStorage.setItem("app_logo_url", empresa.logo_url); if(empresa.nome) localStorage.setItem("app_empresa_nome", empresa.nome); }catch(e){}
      img.src = empresa.logo_url;
    }else if(empresa.nome){ $("apMarca").innerHTML = "<span>" + esc(empresa.nome) + "</span>"; }
    return dadosVitrine;
  }
  function otimizar(url, w){
    if(!url || !String(url).includes("/storage/v1/object/public/")){ return url || ""; }
    const u = String(url).replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
    return u + (u.includes("?") ? "&" : "?") + "width=" + w + "&quality=78&resize=contain";
  }
  // Posições pensadas para a tela do celular (em % da área da vitrine): três nítidas e duas ao fundo, desfocadas.
  // Nov/2026: o formulário fica no meio da tela; os móveis numa faixa em cima e outra embaixo (pedido: "o login precisa ser centralizado").
  const SLOTS = [
    { l: 4, t: 3, w: 32, nitida: true }, { l: 38, t: 1, w: 22, nitida: false }, { r: 4, t: 5, w: 30, nitida: true },
    { l: 6, t: 77, w: 30, nitida: false }, { r: 6, t: 75, w: 34, nitida: true },
  ];
  let vitrineTimer = null;
  async function iniciarVitrine(){
    if(vitrineTimer){ return; }
    const dados = await carregarVitrine();
    const fotos = (dados.fotos || []).map((f) => f.url).filter(Boolean).sort(() => Math.random() - .5);
    const palco = $("apVitrine");
    if(!fotos.length || !palco){ return; }
    const naTela = new Set();
    const pecas = SLOTS.map((slot, i) => {
      const el = document.createElement("div");
      el.className = "ap-peca" + (slot.nitida ? "" : " is-fundo");
      Object.assign(el.style, { left: slot.l != null ? slot.l + "%" : "auto", right: slot.r != null ? slot.r + "%" : "auto", top: slot.t + "%", width: slot.w + "%" });
      el.style.setProperty("--flutua", (9 + (i % 3) * 2.5) + "s"); el.style.setProperty("--atraso", (i * 180) + "ms");
      const url = fotos[i % fotos.length]; naTela.add(url);
      const img = new Image(); img.alt = ""; img.decoding = "async"; img.onload = () => el.classList.add("is-visivel"); img.src = otimizar(url, 420);
      el.appendChild(img); el.dataset.url = url; palco.appendChild(el); return el;
    });
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches || fotos.length <= pecas.length){ vitrineTimer = 1; return; }
    let vez = 0;
    vitrineTimer = setInterval(() => {
      if(document.hidden || $("apLogin").hidden){ return; }
      const el = pecas[vez++ % pecas.length];
      const livre = fotos.find((u) => !naTela.has(u)); if(!livre){ return; }
      el.classList.remove("is-visivel");
      setTimeout(() => {
        const img = new Image(); img.alt = ""; img.onload = () => { el.replaceChildren(img); el.classList.add("is-visivel"); };
        naTela.delete(el.dataset.url); naTela.add(livre); el.dataset.url = livre; img.src = otimizar(livre, 420);
      }, 1400);
    }, 3200);
  }

  /* ---------- Início ---------- */
  function hojeLongo(){ const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); }
  async function empresaDoUsuario(userId){
    const salva = sessionStorage.getItem("empresa_id");
    const { data } = await sb.from("usuarios_empresas").select("empresa_id").eq("user_id", userId);
    const lista = (data || []).map((v) => v.empresa_id);
    return lista.includes(salva) ? salva : lista[0] || null;
  }
  async function mostrarInicio(user){
    const empresa = await empresaDoUsuario(user.id);
    if(!empresa){ throw new Error("Usuário não está vinculado a nenhuma empresa."); }
    const acesso = await sb.rpc("funcionario_contexto", { p_empresa_id: empresa });
    if(acesso.error || !acesso.data?.ativo || acesso.data?.dois_fatores_pendente){ throw new Error("Entre de novo para continuar."); }
    const { data: mods, error } = await sb.rpc("app_celular_modulos", { p_empresa: empresa });
    if(error){ throw new Error(error.message); }
    sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", empresa);
    const nome = String(mods.nome || acesso.data.nome || "").trim(); // sem nome cadastrado: "Olá!", nunca o e-mail
    $("apOla").textContent = nome ? "Olá, " + nome.split(" ")[0] : "Olá!";
    $("apData").textContent = hojeLongo();
    const inicial = esc((nome || "?").charAt(0).toUpperCase());
    const foto = sb.storage.from("avatares").getPublicUrl(empresa + "/" + user.id + ".jpg").data.publicUrl;
    $("apAvatar").innerHTML = inicial + '<img alt="" src="' + esc(foto) + '?t=' + Date.now() + '" onerror="this.remove()">';
    const disponiveis = MODULOS.filter((m) => mods[m.chave]);
    $("apModulos").innerHTML = disponiveis.length ? disponiveis.map((m, i) =>
      '<a class="ap-modulo" href="' + m.href + '" style="--i:' + i + '"><span class="ap-modulo-icone" aria-hidden="true">' + m.icone + '</span>' +
      '<span class="ap-modulo-texto"><b class="ap-modulo-titulo">' + m.nome + '</b><small>' + m.texto + '</small></span><span class="ap-seta" aria-hidden="true">›</span></a>').join("")
      : '<p class="ap-vazio">Seu usuário ainda não tem acesso a nenhum módulo do app. Fale com o administrador.</p>';
    tela("apInicio");
    window.AppRastreador?.iniciar(empresa);
    window.AppAvisos?.iniciar(empresa); // Nov/2026: bloco "Avisos no celular" (notificações)
  }

  /* Nov/2026: tocar num módulo mostra o carregamento padrão (branco, com a logo) enquanto a página do módulo abre. */
  $("apModulos").addEventListener("click", (e) => { if(e.target.closest(".ap-modulo")) window.AppCarregamento?.mostrar(); });

  /* ---------- Entrar e sair ---------- */
  $("apForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const botao = $("apEntrar"), original = botao.innerHTML;
    botao.disabled = true; botao.textContent = "Entrando…"; mensagem("");
    try{
      await window.EasyLocEntrar.entrar($("apEmail").value, $("apSenha").value, (t) => { botao.textContent = t; });
      const { data } = await sb.auth.getUser();
      $("apSenha").value = "";
      await mostrarInicio(data.user);
    }catch(e){ mensagem(e.message || "Não foi possível entrar."); }
    finally{ botao.disabled = false; botao.innerHTML = original; }
  });
  $("apSair").addEventListener("click", async () => {
    ["montadorToken", "montadorBonusToken"].forEach((k) => { try{ const t = localStorage.getItem(k); if(t){ sb.rpc("app_sair", { p_token: t }).catch(() => {}); } localStorage.removeItem(k); localStorage.removeItem(k + "Conta"); }catch(e){} });
    try{ localStorage.removeItem("montadorPasta"); }catch(e){}
    ["login_ok", "empresa_id", "usuario_nome"].forEach((k) => sessionStorage.removeItem(k));
    await sb.auth.signOut().catch(() => {});
    tela("apLogin");
  });
  $("apCompleta").addEventListener("click", () => window.EasyLocCelular.abrirVersaoCompleta());

  /* ---------- Abrir ---------- */
  carregarVitrine();
  (async () => {
    try{
      const { data } = await sb.auth.getUser();
      if(data?.user){ await mostrarInicio(data.user); return; }
    }catch(e){ console.warn("[app] sessão:", e); }
    tela("apLogin");
  })();
})();
