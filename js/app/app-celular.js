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
    { chave: "gerencial", nome: "Gerencial", texto: "Os relatórios do sistema: eventos, vendas, pós-venda e financeiro.", href: "#gerencial",
      icone: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H3"/></svg>' },
  ];
  /* 20/11/2026: módulo "Agentes de IA" = as assistentes que já existem nas telas do sistema, abertas com ?app=1
     (faixa do app em cima, js/app/relatorio-app.js; a Helena abre no catálogo do app, ?agente=helena). Cada uma segue a
     permissão da tela onde mora (flags ag_* da RPC app_celular_modulos). */
  const AGENTES = [
    { flag: "ag_helena", inicial: "H", nome: "Helena", papel: "Comercial e catálogo", texto: "Monta pedidos, confere disponibilidade, sugere combinações e gera fotos das composições.", href: "Modulos/Comercial/Catalogo/catalogo-app.html?app=1&agente=helena" },
    { flag: "ag_clara", inicial: "C", nome: "Clara", papel: "Financeiro", texto: "Diretora financeira: caixa, contas, DRE, simulações e relatórios com provas.", href: "Modulos/Financeiro/financeiro.html?app=1&aba=clara&grupo=agentes&titulo=Clara%20%C2%B7%20Financeiro" },
    { flag: "ag_cora", inicial: "C", nome: "Cora", papel: "Estoque e acervo", texto: "Próximas saídas, divergências, peças em manutenção e inventário.", href: "Modulos/Estoque/Acervo/acervo.html?app=1&aba=cora&grupo=agentes&titulo=Cora%20%C2%B7%20Estoque" },
    { flag: "ag_carla", inicial: "C", nome: "Carla", papel: "Compras", texto: "Pede o que você precisa comprar e confere se a compra é mesmo necessária.", href: "Modulos/Geral/SolicitacoesCompra/solicitacoes.html?app=1&grupo=agentes&titulo=Carla%20%C2%B7%20Compras" },
    { flag: "ag_marcos", inicial: "M", nome: "Marcos", papel: "Manutenção", texto: "Abre a solicitação de manutenção com fotos, local e prioridade.", href: "Modulos/Geral/SolicitacoesManutencao/solicitacoes.html?app=1&grupo=agentes&titulo=Marcos%20%C2%B7%20Manuten%C3%A7%C3%A3o" },
    { flag: "ag_ideia", inicial: "I", nome: "Assistente da Ideia Premiada", papel: "Ideias de melhoria", texto: "Ajuda você a contar sua ideia e envia para o RH avaliar.", href: "Modulos/RH/IdeiaPremiada/ideia-premiada.html?app=1&grupo=agentes&titulo=Ideia%20Premiada" },
  ];
  function pintarAgentes(mods){
    $("apAgentesLista").innerHTML = AGENTES.filter((a) => mods[a.flag]).map((a, i) =>
      '<a class="ap-modulo ap-rel ap-agente" href="' + a.href + '" style="--i:' + i + '"><span class="ap-agente-avatar" aria-hidden="true">' + esc(a.inicial) + '</span>' +
      '<span class="ap-modulo-texto"><small class="ap-agente-papel">' + esc(a.papel) + '</small><b class="ap-modulo-titulo">' + esc(a.nome) + '</b><small>' + esc(a.texto) + '</small></span><span class="ap-seta" aria-hidden="true">›</span></a>').join("")
      || '<p class="ap-vazio">Seu usuário não tem acesso a nenhum agente. Fale com o administrador.</p>';
  }
  /* 20/11/2026: módulo Gerencial = os relatórios que já existem no sistema, abertos com ?app=1 (faixa do app em cima,
     js/app/relatorio-app.js). Cada um segue a permissão do sistema (flags ger_comercial / ger_financeiro da RPC). */
  const RELATORIOS = [
    { grupo: "Comercial", flag: "ger_comercial", nome: "Panorama dos Eventos", texto: "Faturamento, clientes, locais, cidades e o mapa de onde a empresa atua.", href: "Modulos/Comercial/Pedidos/gerencial.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>' },
    { grupo: "Comercial", flag: "ger_comercial", nome: "Produtividade comercial", texto: "Vendas, conversão, contatos e 3D por vendedor.", href: "Modulos/Comercial/Produtividade/produtividade.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H3"/></svg>' },
    { grupo: "Comercial", flag: "ger_comercial", nome: "Cancelamentos", texto: "Motivos, decoradores, regiões e valor perdido.", href: "Modulos/Comercial/Cancelamentos/cancelamentos.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5l7 7m0-7-7 7"/></svg>' },
    { grupo: "Comercial", flag: "ger_comercial", nome: "Pós-venda", texto: "Satisfação dos clientes, elogios e críticas à equipe.", href: "Modulos/Chiavari/Feedback/feedback.html?app=1&aba=painel",
      icone: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>' },
    { grupo: "Comercial", flag: "ger_comercial", nome: "Sublocações", texto: "O que mais alugamos de parceiros e quanto pagamos.", href: "Modulos/Comercial/Terceirizacoes/terceirizacoes.html?app=1&aba=relatorios",
      icone: '<svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3m3 13H6l3 3"/></svg>' },
    { grupo: "Financeiro", flag: "ger_financeiro", nome: "Financeiro gerencial", texto: "DRE mês a mês, ponto de equilíbrio e lucro por evento.", href: "Modulos/Financeiro/financeiro.html?app=1&aba=gerencial",
      icone: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M9 9v11"/></svg>' },
    { grupo: "Financeiro", flag: "ger_financeiro", nome: "Painel do CFO", texto: "Caixa, previsões e alertas do financeiro numa tela só.", href: "Modulos/Financeiro/painel-cfo.html?app=1",
      icone: '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8m-5 0h5v5"/></svg>' },
  ];
  function pintarRelatorios(mods, empresa){
    const grupos = {};
    RELATORIOS.filter((r) => mods[r.flag]).forEach((r) => { (grupos[r.grupo] = grupos[r.grupo] || []).push(r); });
    let i = 0;
    $("apRelatorios").innerHTML = Object.keys(grupos).map((g) => '<p class="ap-rel-grupo">' + esc(g) + '</p><div class="ap-modulos ap-rel-lista">' +
      grupos[g].map((r) => '<a class="ap-modulo ap-rel" href="' + r.href + (r.href.includes("painel-cfo") ? "&empresa=" + encodeURIComponent(empresa) : "") + '" style="--i:' + (i++) + '"><span class="ap-modulo-icone" aria-hidden="true">' + r.icone + '</span>' +
        '<span class="ap-modulo-texto"><b class="ap-modulo-titulo">' + esc(r.nome) + '</b><small>' + esc(r.texto) + '</small></span><span class="ap-seta" aria-hidden="true">›</span></a>').join("") + '</div>').join("")
      || '<p class="ap-vazio">Seu usuário não tem acesso a nenhum relatório. Fale com o administrador.</p>';
  }
  /* 20/11/2026: o app ganhou cara de aplicativo: barra de abas embaixo (Início · Agentes · Avisos · Ajustes), a caixa de
     avisos (notificações recebidas) e Ajustes com o que cada pessoa quer receber. Telas "empilhadas" (Gerencial) mostram
     a seta de voltar na faixa de cima. Endereços: #agentes, #avisos, #config (Ajustes), #gerencial. */
  const TELAS = ["apCarregando", "apLogin", "apInicio", "apConfig", "apGerencial", "apAgentes", "apAvisosTela"];
  const ABA_DA_TELA = { apInicio: "inicio", apAgentes: "agentes", apAvisosTela: "avisos", apConfig: "ajustes", apGerencial: "inicio" };
  const TELA_DA_ABA = { inicio: "apInicio", agentes: "apAgentes", avisos: "apAvisosTela", ajustes: "apConfig" };
  const HASH_DA_ABA = { inicio: "", agentes: "#agentes", avisos: "#avisos", ajustes: "#config" };
  let telaAtual = "apCarregando";
  function tela(id){
    const anterior = telaAtual; telaAtual = id;
    TELAS.forEach((x) => { $(x).hidden = x !== id; }); document.body.dataset.tela = id;
    const logado = !["apCarregando", "apLogin"].includes(id);
    $("apAbas").hidden = !logado; document.body.classList.toggle("ap-com-abas", logado);
    $("apTopoVoltar").hidden = id !== "apGerencial";
    $("apAbas").querySelectorAll("[data-aba]").forEach((b) => { const on = ABA_DA_TELA[id] === b.dataset.aba; b.classList.toggle("ativa", on); if(on){ b.setAttribute("aria-current", "page"); } else { b.removeAttribute("aria-current"); } });
    if(anterior !== id && logado){ const el = $(id); el.classList.remove("ap-entra", "ap-empilha"); void el.offsetWidth; el.classList.add(id === "apGerencial" ? "ap-empilha" : "ap-entra"); window.scrollTo(0, 0); }
    if(id === "apAvisosTela"){ carregarCaixa(); }
    if(id === "apConfig"){ carregarPreferencias(); }
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
    sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", empresa); try{ localStorage.setItem("acervo_ultima_empresa", empresa); }catch(e){}
    const nome = String(mods.nome || acesso.data.nome || "").trim(); // sem nome cadastrado: "Olá!", nunca o e-mail
    $("apOla").textContent = nome ? "Olá, " + nome.split(" ")[0] : "Olá!";
    $("apData").textContent = hojeLongo();
    const inicial = esc((nome || "?").charAt(0).toUpperCase());
    const foto = sb.storage.from("avatares").getPublicUrl(empresa + "/" + user.id + ".jpg").data.publicUrl;
    $("apAvatar").innerHTML = inicial + '<img alt="" src="' + esc(foto) + '?t=' + Date.now() + '" onerror="this.remove()">';
    const disponiveis = MODULOS.filter((m) => mods[m.chave]);
    EMPRESA = empresa; USUARIO = user;
    pintarPerfil(nome, user, foto, inicial);
    $("apAbas").querySelector('[data-aba="agentes"]').hidden = !AGENTES.some((a) => mods[a.flag]);
    $("apModulos").innerHTML = disponiveis.map((m, i) =>
      '<a class="ap-modulo" href="' + m.href + '" style="--i:' + i + '"><span class="ap-modulo-icone" aria-hidden="true">' + m.icone + '</span>' +
      '<span class="ap-modulo-texto"><b class="ap-modulo-titulo">' + m.nome + '</b><small>' + m.texto + '</small></span><span class="ap-seta" aria-hidden="true">›</span></a>').join("")
      + (!disponiveis.length ? '<p class="ap-vazio">Seu usuário ainda não tem acesso a nenhum módulo do app. Fale com o administrador.</p>' : "");
    pintarRelatorios(mods, empresa);
    pintarAgentes(mods);
    tela(telaDoEndereco());
    window.AppRastreador?.iniciar(empresa);
    window.AppAvisos?.iniciar(empresa); // Nov/2026: bloco "Avisos no celular" (notificações)
    carregarCaixa();
    clearInterval(relogioCaixa); relogioCaixa = setInterval(() => { if(!document.hidden) carregarCaixa(); }, 60000);
  }

  function telaDoEndereco(){ return { "#config": "apConfig", "#ajustes": "apConfig", "#gerencial": "apGerencial", "#agentes": "apAgentes", "#avisos": "apAvisosTela" }[location.hash] || "apInicio"; }
  // Abas: trocam de tela sem empilhar no histórico (o voltar do celular sai do app, como num aplicativo).
  $("apAbas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-aba]"); if(!b){ return; }
    history.replaceState(null, "", location.pathname + location.search + HASH_DA_ABA[b.dataset.aba]);
    tela(TELA_DA_ABA[b.dataset.aba]);
  });
  function voltarDaPilha(){ if(history.state && history.state.app){ history.back(); } else { history.replaceState(null, "", location.pathname + location.search); tela("apInicio"); } }
  $("apTopoVoltar").addEventListener("click", voltarDaPilha);
  /* Nov/2026: tocar num módulo mostra o carregamento padrão (branco, com a logo) enquanto a página do módulo abre. */
  $("apModulos").addEventListener("click", (e) => {
    const a = e.target.closest(".ap-modulo"); if(!a){ return; }
    if(a.getAttribute("href") === "#gerencial"){ e.preventDefault(); history.pushState({ app: "#gerencial" }, "", "#gerencial"); tela("apGerencial"); return; }
    window.AppCarregamento?.mostrar();
  });
  $("apNovos").addEventListener("click", (e) => { e.preventDefault(); history.replaceState(null, "", location.pathname + location.search + "#avisos"); tela("apAvisosTela"); });
  $("apRelatorios").addEventListener("click", (e) => { if(e.target.closest(".ap-rel")){ window.AppCarregamento?.mostrar(); } });
  $("apAgentesLista").addEventListener("click", (e) => { if(e.target.closest(".ap-agente")){ window.AppCarregamento?.mostrar(); } });
  window.addEventListener("popstate", () => { if(!$("apLogin").hidden || !$("apCarregando").hidden){ return; } tela(telaDoEndereco()); });

  /* ---------- Avisos (caixa de notificações) ---------- */
  let EMPRESA = null, USUARIO = null, relogioCaixa = 0, caixa = [];
  const ICONE_GRUPO = {
    "Operação": ["#e8f0fb", "#123f86", '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'],
    "Comercial": ["#f6efe2", "#8b6a45", '<path d="M4 7h16v12H4zM9 7V5h6v2"/>'],
    "Financeiro": ["#e6f4ea", "#1f7a44", '<path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.7 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3"/>'],
    "Estoque": ["#fdf3dc", "#a16207", '<path d="M3 8l9-5 9 5-9 5zM3 8v8l9 5 9-5V8"/>'],
    "Compras": ["#f1ebfb", "#6d4fc2", '<path d="M4 5h2l2 11h11l2-8H7"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>'],
    "Pessoas": ["#fdecea", "#b42318", '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 4.6a3.2 3.2 0 0 1 0 6.3M18.5 14.8c1.4.8 2.3 2.4 2.5 5.2"/>'],
    "Sistema": ["#eef1f4", "#4f4f4f", '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>'],
  };
  function quando(iso){
    const d = new Date(iso), agora = new Date(), min = Math.round((agora - d) / 6e4);
    if(min < 1){ return "agora"; } if(min < 60){ return min + " min"; }
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === agora.toDateString() ? hora : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + hora;
  }
  function rotuloDia(iso){
    const d = new Date(iso), h = new Date(), dias = Math.round((new Date(h.toDateString()) - new Date(d.toDateString())) / 864e5);
    if(dias === 0){ return "Hoje"; } if(dias === 1){ return "Ontem"; }
    const t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function pintarBadge(n){
    const b = $("apAbasBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n);
    const novos = $("apNovos"); novos.hidden = !n;
    novos.innerHTML = '<span class="ap-novos-sino" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg></span><span class="ap-linha-texto"><b>' + n + (n === 1 ? " aviso novo" : " avisos novos") + '</b><small>Toque para ver</small></span><span class="ap-seta-p" aria-hidden="true">›</span>';
    try{ if(navigator.setAppBadge){ if(n){ navigator.setAppBadge(n); } else { navigator.clearAppBadge(); } } }catch(e){}
  }
  async function carregarCaixa(){
    if(!EMPRESA){ return; }
    try{
      const { data, error } = await sb.rpc("app_notif_caixa", { p_empresa: EMPRESA, p_limite: 100 });
      if(error){ throw error; }
      caixa = data?.itens || []; pintarBadge(data?.nao_lidas || 0); pintarCaixa();
    }catch(e){ if(!caixa.length){ $("apCaixa").innerHTML = '<p class="ap-vazio">Não foi possível carregar os avisos. Verifique a internet.</p>'; } }
  }
  function pintarCaixa(){
    const host = $("apCaixa"); $("apLerTodos").hidden = !caixa.some((a) => !a.lida_em);
    if(!caixa.length){ host.innerHTML = '<div class="ap-vazio-grande"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg></span><b>Nenhum aviso por enquanto</b><p>Quando o sistema tiver algo para você, como uma escala, um pagamento ou um pedido, aparece aqui.</p></div>'; return; }
    let dia = "", html = "";
    caixa.forEach((a) => {
      const r = rotuloDia(a.criado_em);
      if(r !== dia){ if(dia){ html += "</div>"; } dia = r; html += '<p class="ap-secao">' + esc(r) + '</p><div class="ap-grupo">'; }
      const ic = ICONE_GRUPO[a.grupo] || ICONE_GRUPO.Sistema;
      const linhas = String(a.corpo || "").split("\n").filter(Boolean);
      html += '<button type="button" class="ap-aviso' + (a.lida_em ? "" : " nao-lido") + '" data-aviso="' + esc(a.id) + '">' +
        '<span class="ap-aviso-icone" style="background:' + ic[0] + ';color:' + ic[1] + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + ic[2] + '</svg></span>' +
        '<span class="ap-aviso-texto"><span class="ap-aviso-topo"><b>' + esc(a.titulo) + '</b><small>' + esc(quando(a.criado_em)) + '</small></span>' +
        (linhas.length ? '<span class="ap-aviso-corpo">' + linhas.map(esc).join("<br>") + '</span>' : "") + '</span>' +
        (a.lida_em ? "" : '<i class="ap-aviso-ponto" aria-label="Não lido"></i>') + '</button>';
    });
    host.innerHTML = html + "</div>";
  }
  $("apCaixa").addEventListener("click", (e) => {
    const b = e.target.closest("[data-aviso]"); if(!b){ return; }
    const a = caixa.find((x) => x.id === b.dataset.aviso); if(!a){ return; }
    if(!a.lida_em){
      a.lida_em = new Date().toISOString(); b.classList.remove("nao-lido"); b.querySelector(".ap-aviso-ponto")?.remove();
      pintarBadge(caixa.filter((x) => !x.lida_em).length); $("apLerTodos").hidden = !caixa.some((x) => !x.lida_em);
      sb.rpc("app_notif_ler", { p_empresa: EMPRESA, p_ids: [a.id] }).then(() => {}, () => {});
    }
    if(a.url && !/^app\.html(#avisos)?$/.test(a.url)){ window.AppCarregamento?.mostrar(); setTimeout(() => { location.href = a.url; }, 60); }
  });
  $("apLerTodos").addEventListener("click", async () => {
    caixa.forEach((a) => { a.lida_em = a.lida_em || new Date().toISOString(); }); pintarCaixa(); pintarBadge(0);
    await sb.rpc("app_notif_ler", { p_empresa: EMPRESA, p_ids: null }).then(() => {}, () => {});
  });
  document.addEventListener("visibilitychange", () => { if(!document.hidden && EMPRESA){ carregarCaixa(); } });

  /* ---------- Ajustes ---------- */
  function pintarPerfil(nome, user, foto, inicial){
    let empresaNome = ""; try{ empresaNome = localStorage.getItem("app_empresa_nome") || ""; }catch(e){}
    $("apPerfil").innerHTML = '<span class="ap-avatar ap-avatar-g">' + inicial + '<img alt="" src="' + esc(foto) + '?t=' + Date.now() + '" onerror="this.remove()"></span>' +
      '<span class="ap-perfil-texto"><b>' + esc(nome || "Sua conta") + '</b><small>' + esc(user.email || "") + '</small>' + (empresaNome ? '<small>' + esc(empresaNome) + '</small>' : "") + '</span>';
  }
  let prefs = null, salvando = 0;
  const SWITCH = (on, attrs) => '<button type="button" class="ap-switch" role="switch" aria-checked="' + !!on + '" ' + attrs + '><span></span></button>';
  async function carregarPreferencias(){
    if(!EMPRESA){ return; }
    if(!prefs){ $("apNotifTipos").innerHTML = '<div class="ap-grupo"><p class="ap-carregando-linha">Carregando…</p></div>'; }
    try{ const { data, error } = await sb.rpc("app_notif_config", { p_empresa: EMPRESA }); if(error){ throw error; } prefs = data; pintarPreferencias(); }
    catch(e){ $("apNotifTipos").innerHTML = '<div class="ap-grupo"><p class="ap-carregando-linha">Não foi possível carregar as preferências.</p></div>'; }
  }
  function pintarPreferencias(){
    const grupos = {}; (prefs.tipos || []).forEach((t) => { (grupos[t.grupo] = grupos[t.grupo] || []).push(t); });
    $("apNotifTipos").innerHTML = '<p class="ap-nota">Escolha o que o sistema avisa. Tudo também fica guardado na aba Avisos.</p>' +
      Object.keys(grupos).map((g) => '<p class="ap-secao">' + esc(g) + '</p><div class="ap-grupo">' + grupos[g].map((t) =>
        '<div class="ap-linha"><span class="ap-linha-texto"><b>' + esc(t.rotulo) + '</b><small>' + esc(t.descricao) + '</small></span>' +
        SWITCH(t.ativo, 'aria-label="' + esc(t.rotulo) + '" data-notif-tipo="' + esc(t.tipo) + '"') + '</div>').join("") + '</div>').join("");
    $("apSilencio").innerHTML = '<div class="ap-linha"><span class="ap-linha-texto"><b>Não incomodar</b><small>' + (prefs.silencio ? "Das " + esc(prefs.inicio) + " às " + esc(prefs.fim) : "Desligado") + '</small></span>' +
      SWITCH(prefs.silencio, 'aria-label="Horário de silêncio" data-silencio') + '</div>' +
      (prefs.silencio ? '<div class="ap-linha ap-linha-horas"><label>Das<input type="time" data-silencio-inicio value="' + esc(prefs.inicio) + '"></label><label>Até<input type="time" data-silencio-fim value="' + esc(prefs.fim) + '"></label></div>' : "");
  }
  function salvarPreferencias(tipos){
    clearTimeout(salvando);
    salvando = setTimeout(async () => {
      const { error } = await sb.rpc("app_notif_config_salvar", { p_empresa: EMPRESA, p_tipos: tipos || {}, p_silencio: !!prefs.silencio, p_inicio: prefs.inicio, p_fim: prefs.fim });
      if(error){ toast("Não foi possível salvar. Tente de novo.", true); carregarPreferencias(); } else { toast("Salvo"); }
    }, tipos ? 0 : 400);
  }
  $("apConfig").addEventListener("click", (e) => {
    const t = e.target.closest("[data-notif-tipo]");
    if(t){
      const on = t.getAttribute("aria-checked") !== "true"; t.setAttribute("aria-checked", String(on));
      const item = prefs.tipos.find((x) => x.tipo === t.dataset.notifTipo); if(item){ item.ativo = on; }
      salvarPreferencias({ [t.dataset.notifTipo]: on }); return;
    }
    if(e.target.closest("[data-silencio]")){ prefs.silencio = !prefs.silencio; pintarPreferencias(); salvarPreferencias(); }
  });
  $("apConfig").addEventListener("change", (e) => {
    if(e.target.matches("[data-silencio-inicio]") && e.target.value){ prefs.inicio = e.target.value; }
    else if(e.target.matches("[data-silencio-fim]") && e.target.value){ prefs.fim = e.target.value; }
    else { return; }
    pintarPreferencias(); salvarPreferencias();
  });
  // Instalar na tela do celular (Android: o convite do próprio navegador; iPhone: como fazer pelo Safari).
  let convite = null;
  const instalado = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true || !!window.AcervoAndroid;
  function pintarInstalar(){
    const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $("apInstalar").hidden = instalado() || (!convite && !iphone);
    $("apInstalarTexto").textContent = iphone && !convite ? "No Safari: Compartilhar › Adicionar à Tela de Início." : "Abra o Acervo como um aplicativo, sem o navegador.";
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e; pintarInstalar(); });
  $("apInstalar").addEventListener("click", async () => {
    if(convite){ convite.prompt(); await convite.userChoice.catch(() => {}); convite = null; pintarInstalar(); }
    else { toast("No Safari: toque em Compartilhar e depois em Adicionar à Tela de Início."); }
  });
  pintarInstalar();
  let toastTimer = 0;
  function toast(t, erro){
    let el = $("apToast");
    if(!el){ el = document.createElement("div"); el.id = "apToast"; el.className = "ap-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.classList.toggle("erro", !!erro); el.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 2200);
  }
  window.AppToast = toast;

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
    EMPRESA = null; prefs = null; caixa = []; clearInterval(relogioCaixa); pintarBadge(0);
    history.replaceState(null, "", location.pathname + location.search);
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
