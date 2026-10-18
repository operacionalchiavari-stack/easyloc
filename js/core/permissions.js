(function () {
  const cache = {
    loaded: false,
    loading: null,
    empresaId: null,
    usuarioId: null,
    permissions: new Map(),
    strict: true,
    legacyAdmin: false,
    active: false
  };

  function getClient() {
    return window.supabaseClient || window.supabase;
  }

  function contextReady() {
    return Boolean(window.__CONTEXT?.empresa_id && window.__CONTEXT?.usuario_id);
  }

  // 20 s (era 6 s): em internet lenta o contexto (sessão + vínculo) passava disso e o acesso era negado na abertura.
  function waitForContext(timeout = 20000) {
    if (contextReady()) return Promise.resolve(window.__CONTEXT);

    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (contextReady() || Date.now() - started > timeout) {
          clearInterval(timer);
          resolve(window.__CONTEXT || null);
        }
      }, 120);
    });
  }

  /* Busca as permissões no banco. Devolve { ativo, admin, permissoes } ou lança erro em falha PASSAGEIRA
     (rede, sessão sendo renovada, banco ocupado). "Inativo" só vale quando o banco responde que é inativo.
     Out/2026, bug real ("às vezes aparece 'não possui acesso', o menu some, os ícones, tudo"): antes, qualquer falha
     passageira, inclusive na revalidação de 30 s, zerava as permissões; a tela era escondida, o menu redesenhado
     vazio, e nada voltava sem recarregar a página. */
  async function buscar(supabase) {
    // Garante um token válido antes da consulta (getSession renova o token vencido).
    try { await supabase.auth?.getSession?.(); } catch (_) {}
    const access = await supabase.rpc("funcionario_contexto", { p_empresa_id: cache.empresaId });
    if (access.error) throw access.error;
    if (access.data?.ativo !== true) return { ativo: false, admin: false, permissoes: new Map() };
    const { data, error } = await supabase.rpc("get_permissoes_usuario_resolvidas", {
      p_empresa_id: cache.empresaId,
      p_usuario_id: cache.usuarioId
    });
    if (error) throw error;
    const permissoes = new Map();
    (data || []).forEach((item) => permissoes.set(item.chave, Boolean(item.permitido)));
    return { ativo: true, admin: access.data?.administrador_legado === true, permissoes };
  }

  function aplicar(resultado) {
    cache.active = resultado.ativo;
    cache.legacyAdmin = resultado.admin;
    cache.permissions = resultado.permissoes;
    cache.strict = true;
    cache.loaded = true;
  }

  // Primeira carga: tenta até 4 vezes (0, 1, 2 e 4 s) antes de negar; depois a revalidação continua tentando.
  async function load() {
    if (cache.loaded) return cache;
    if (cache.loading) return cache.loading;

    cache.loading = (async () => {
      const ctx = await waitForContext();
      const supabase = getClient();
      cache.empresaId = ctx?.empresa_id || null;
      cache.usuarioId = ctx?.usuario_id || null;

      if (!supabase || !cache.empresaId || !cache.usuarioId) {
        aplicar({ ativo: false, admin: false, permissoes: new Map() });
        cache.falhaPassageira = true; // contexto ainda não chegou: a revalidação tenta de novo
        return cache;
      }

      for (const espera of [0, 1000, 2000, 4000]) {
        if (espera) await new Promise((ok) => setTimeout(ok, espera));
        try {
          aplicar(await buscar(supabase));
          cache.falhaPassageira = false;
          return cache;
        } catch (error) {
          console.warn("[EasyLoc Permissions] Falha ao validar o acesso (tentando de novo).", error);
        }
      }
      aplicar({ ativo: false, admin: false, permissoes: new Map() });
      cache.falhaPassageira = true;
      return cache;
    })().finally(() => { cache.loading = null; });

    return cache.loading;
  }

  // Revalidação: só troca o estado quando o banco responde. Em falha passageira mantém o acesso que já valia
  // (não esvazia o menu nem esconde a tela) e nunca passa por um instante "sem permissões carregadas".
  async function revalidar() {
    const ctx = window.__CONTEXT;
    const supabase = getClient();
    if (ctx?.empresa_id && ctx?.usuario_id) { cache.empresaId = ctx.empresa_id; cache.usuarioId = ctx.usuario_id; }
    if (!supabase || !cache.empresaId || !cache.usuarioId) return false;
    try {
      aplicar(await buscar(supabase));
      cache.falhaPassageira = false;
      return true;
    } catch (error) {
      console.warn("[EasyLoc Permissions] Revalidação falhou; mantendo o acesso anterior.", error);
      return false;
    }
  }

  function hasPermission(chave, fallback = true) {
    if (!chave) return true;
    if (!cache.loaded || !cache.active) return false;
    if (cache.legacyAdmin) return true;
    return cache.permissions.get(chave) === true;
  }

  function canView(chave) {
    return hasPermission(chave);
  }

  function canEdit(chave) {
    return hasPermission(chave);
  }

  function requirePermission(chave, mensagem) {
    if (hasPermission(chave)) return true;

    const msg = mensagem || "Você não possui permissão para executar esta ação.";
    if (typeof window.alerta === "function") window.alerta(msg, "Permissão necessária", "aviso");
    else alert(msg);

    return false;
  }

  function applyVisibility(root = document) {
    root.querySelectorAll("[data-permission]").forEach((el) => {
      const permission = el.getAttribute("data-permission");
      const allowed = hasPermission(permission);
      el.hidden = !allowed;
      el.classList.toggle("permission-hidden", !allowed);
    });
    root.querySelectorAll("[data-module-href]").forEach((el) => {
      el.hidden = !canNavigate(el.getAttribute("data-module-href"));
    });
    // Menu do dashboard: redesenha só com o que a pessoa pode abrir (js/ui/sidebarMenu.js)
    if (root === document && typeof window.portalRedesenharMenu === "function") window.portalRedesenharMenu();
  }

  const routes = [
    // Sistemas da Chiavari vindos do Apps Script (Modulos/Chiavari/...).
    // Cada um continua com o próprio controle de acesso (PIN/login) dentro
    // da tela; aqui só decide quem vê o item no menu.
    [/Chiavari\/CentralMetas\/itens-danificados/i, 'estoque.almoxarifado.visualizar'],
    [/Chiavari\/CentralMetas/i, 'rh.colaboradores.visualizar'],
    [/Chiavari\/ControleRH/i, 'rh.colaboradores.visualizar'],
    [/Cronograma\/equipe-free/i, 'rh.colaboradores.visualizar'], // Equipe Free saiu do Cronograma e fica no RH
    [/Chiavari\/(Fretes|Uber)/i, 'logistica.planejamento.visualizar'],
    [/Chiavari\/Ocorrencias/i, 'logistica.expedicao.visualizar'],
    [/Chiavari\/Costura/i, 'estoque.insumos.visualizar'],
    [/Chiavari\/Feedback/i, 'comercial.pedidos.visualizar'],
    [/Chiavari\/Portal/i, 'rh.colaboradores.visualizar'], // Mural do Portal (editar o mural) — fica no RH
    [/CadastroFuncionarios/i, 'rh.funcionarios.visualizar'],
    [/CadastroClientes/i, 'comercial.clientes.visualizar'],
    [/CadastroLocais/i, 'comercial.locais.visualizar'],
    [/CreditosIA/i, 'comercial.creditos.visualizar'],
    [/Catalogo/i, 'comercial.catalogo.visualizar'],
    [/Pedidos/i, 'comercial.pedidos.visualizar'],
    [/Contratos/i, 'comercial.contratos.visualizar'],
    [/ImportarItens/i, 'estoque.importacao.executar'],
    [/CadastroItens|DisponibilidadeItens/i, 'estoque.itens.visualizar'],
    [/Personalizacoes/i, 'estoque.insumos.visualizar'],
    [/CadastroFornecedores/i, 'estoque.fornecedores.visualizar'],
    [/TabelasPreco/i, 'estoque.tabelas_preco.visualizar'],
    [/Almoxarifado|OrdemdeServicos|Controledequalidade/i, 'estoque.almoxarifado.visualizar'],
    [/Compras/i, 'estoque.compras.visualizar'],
    [/SeparacaoMateriais/i, 'logistica.separacao.visualizar'],
    [/Cronograma/i, 'logistica.cronograma.visualizar'],
    [/Expedicao/i, 'logistica.expedicao.visualizar'],
    [/Planejamento|Roteirizacao|EquipeRotas|cadastro-caminhoes/i, 'logistica.planejamento.visualizar'],
    [/Financeiro|fluxodecaixa/i, 'financeiro.fluxo.visualizar'],
    [/GestaoPessoas|RH\/Pessoas/i, 'rh.colaboradores.visualizar'],
    [/Permissoes/i, 'configuracoes.permissoes.visualizar'],
    [/WhatsApp/i, 'configuracoes.integracoes.whatsapp.visualizar'],
    [/GatewaysPagamento/i, 'configuracoes.integracoes.gateways_pagamento.visualizar'],
    [/Parametros/i, 'configuracoes.empresa.visualizar'],
    [/Conferencia/i, 'logistica.separacao.visualizar'],
    [/empresa/i, 'configuracoes.empresa.visualizar']
  ];
  function canNavigate(href) {
    if (!cache.loaded || !cache.active) return false;
    let path;
    try { const url = new URL(href, location.href); if (url.origin !== location.origin) return false; path = decodeURIComponent(url.pathname); } catch (_) { return false; }
    // Todos os membros ativos podem enviar e acompanhar suas próprias ideias.
    // A consulta geral e a avaliação são controladas nas RPCs por permissões do RH.
    if (/\/Modulos\/RH\/IdeiaPremiada\/ideia-premiada\.html$/i.test(path)) return true;
    if (cache.legacyAdmin) return true;
    const match = routes.find(([pattern]) => pattern.test(path));
    return match ? hasPermission(match[1]) : /\/(dashboard|usuario)\.html$/i.test(path);
  }
  let escondidosPeloBloqueio = [];
  function guardPage() {
    const aviso = document.getElementById('permissionDeniedNotice');
    if (canNavigate(location.href)) {
      // O acesso voltou (ex.: a 1ª verificação falhou por instabilidade): mostra a tela de novo.
      if (aviso) {
        aviso.remove();
        escondidosPeloBloqueio.forEach((el) => { el.hidden = false; });
        escondidosPeloBloqueio = [];
      }
      return;
    }
    {
      if (aviso) return;
      escondidosPeloBloqueio = [...document.body.children].filter(el => !['SCRIPT', 'STYLE'].includes(el.tagName) && !el.hidden);
      escondidosPeloBloqueio.forEach(el => { el.hidden = true; });
      const notice = document.createElement('p');
      notice.id = 'permissionDeniedNotice';
      notice.setAttribute('role', 'alert');
      notice.style.cssText = 'padding:32px;color:#374151;background:#fff;font:16px system-ui';
      notice.textContent = 'Você não possui acesso a esta parte do sistema. Consulte o administrador.';
      document.body.appendChild(notice);
    }
  }

  window.EasyLocPermissions = {
    load,
    hasPermission,
    canView,
    canEdit,
    requirePermission,
    applyVisibility,
    canNavigate,
    _cache: cache
  };

  window.hasPermission = hasPermission;
  window.canView = canView;
  window.canEdit = canEdit;
  window.requirePermission = requirePermission;

  // Revalida abas abertas para aplicar bloqueios e mudanças de permissão sem novo login.
  // A cada 30 s e ao voltar para a aba. Se a última tentativa falhou, tenta a cada 10 s até conseguir.
  async function revalidarEAplicar() {
    if (!cache.loaded || cache.loading || document.hidden) return;
    if (await revalidar()) { applyVisibility(); guardPage(); }
  }
  setInterval(revalidarEAplicar, 30000);
  setInterval(() => { if (cache.falhaPassageira) revalidarEAplicar(); }, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) revalidarEAplicar(); });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => load().then(() => { applyVisibility(); guardPage(); }));
  } else {
    load().then(() => { applyVisibility(); guardPage(); });
  }
})();
