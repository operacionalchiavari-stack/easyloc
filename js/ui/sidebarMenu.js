/**
 * MENU LATERAL — dado + renderização
 *
 * Antes, o menu do dashboard.html era ~325 linhas de HTML escrito à mão,
 * com módulos "escondidos a pedido" preservados dentro de comentários HTML
 * (<!-- ... -->) e dois jeitos diferentes de abrir tela (carregarNaMain /
 * shellNavigate) misturados item a item. Achar ou mudar um item exigia ler
 * esse bloco inteiro.
 *
 * Agora existe UM lugar só: a lista ACERVO_MENU abaixo. Cada item marcado
 * "oculto: true" continua com o caminho salvo (não é removido, só não é
 * desenhado no menu) — reativar é trocar oculto para false.
 *
 * `href` = tela já convertida para o modelo novo (abre via shellNavigate,
 * dentro do <iframe id="appModuleFrame">).
 * `legado` = tela ainda no modelo antigo (abre via carregarNaMain, cola um
 * fragmento HTML dentro de <div id="main-content">). Desde out/2026 todos os
 * módulos existentes estão visíveis (pedido do usuário), então os módulos
 * antigos Contratos, Compras etc. abrem por esse caminho.
 */
(function () {
  "use strict";

  const ACERVO_MENU = {
    favoritos: [
      {
        titulo: "Central de Pedidos",
        rotulo: "Pedidos",
        icone: "clipboard-list",
        href: "Modulos/Comercial/Pedidos/CentralPedidos.html",
      },
      {
        titulo: "Separação de Materiais",
        rotulo: "Separação",
        icone: "package-check",
        href: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html",
      },
    ],

    // Quando um sistema da Chiavari (Modulos/Chiavari, vindo do Apps Script)
    // faz a mesma coisa que um módulo do Acervo, vale o da Chiavari e o do
    // Acervo sai do menu (pedido do usuário, out/2026). Saíram: Almoxarifado,
    // Cronograma Logístico, Equipe das Rotas, Ordem de Serviços, Controle de
    // Qualidade e Gestão de Pessoas — os arquivos continuam no repositório.
    categorias: [
      {
        // Primeiro item do menu (logo abaixo do Início), a pedido do usuário.
        id: "cronograma",
        icone: "calendar",
        rotulo: "Cronograma",
        href: "Modulos/Chiavari/Cronograma/cronograma.html",
      },
      {
        id: "geral",
        icone: "layout-grid",
        rotulo: "Geral",
        itens: [
          { rotulo: "Catálogo", href: "Modulos/Comercial/Catalogo/catalogo.html" },
          { rotulo: "Painel de Complexidade", href: "Modulos/Chiavari/Costura/costura.html" },
        ],
      },
      {
        id: "comercial",
        icone: "handshake",
        rotulo: "Comercial",
        itens: [
          { rotulo: "Cadastro de Clientes", href: "Modulos/Comercial/CadastroClientes/cadastro-clientes.html" },
          { rotulo: "Cadastro de Locais", href: "Modulos/Comercial/CadastroLocais/cadastro-locais.html" },
          { rotulo: "Central de Pedidos", href: "Modulos/Comercial/Pedidos/CentralPedidos.html" },
          {
            rotulo: "Contratos",
            legado: {
              html: "Modulos/Comercial/Contratos/contratos.html",
              js: "Modulos/Comercial/Contratos/contratos.mjs",
              css: "Modulos/Comercial/Contratos/contratos.css",
            },
          },
          { rotulo: "Feedback Pós-Evento", href: "Modulos/Chiavari/Feedback/feedback.html" },
          {
            rotulo: "Disponibilidade de Itens",
            legado: {
              html: "Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.html",
              js: "Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.js",
              css: "Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.css",
            },
          },
        ],
      },
      {
        id: "estoque",
        icone: "warehouse",
        rotulo: "Estoque",
        itens: [
          {
            // flyout: abre como extensão do menu para a direita (js/ui/portalNav.js)
            rotulo: "Cadastros",
            flyout: true,
            grupo: [
              { rotulo: "Cadastro de Itens", href: "Modulos/Estoque/CadastroItens/cadastro-itens.html" },
              { rotulo: "Cadastro de Personalizações", href: "Modulos/Estoque/Personalizacoes/estoque-personalizacoes.html" },
              { rotulo: "Cadastro de Fornecedores", href: "Modulos/Estoque/CadastroFornecedores/fornecedores.html" },
            ],
          },
          { rotulo: "Almoxarifado", href: "Modulos/Chiavari/Almoxarifado/almoxarifado.html" },
          { rotulo: "Manutenção", href: "Modulos/Chiavari/CentralMetas/itens-danificados.html" },
          {
            rotulo: "Compras",
            legado: {
              html: "Modulos/Estoque/Compras/compras.html",
              js: "Modulos/Estoque/Compras/compras.js",
              css: "Modulos/Estoque/Compras/compras.css",
            },
          },
        ],
      },
      {
        id: "triagem",
        icone: "package-check",
        rotulo: "Triagem",
        itens: [
          { rotulo: "Separação de Materiais", href: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html" },
        ],
      },
      {
        id: "logistica",
        icone: "truck",
        rotulo: "Logística",
        itens: [
          {
            // subcategoria: abre para a direita, igual Estoque > Cadastros
            rotulo: "Fretes",
            flyout: true,
            grupo: [
              { rotulo: "Cadastro de Fretes", href: "Modulos/Chiavari/Fretes/fretes.html" },
              { rotulo: "Conciliação de Fretes", href: "Modulos/Chiavari/Fretes/conciliacao.html" },
              { rotulo: "Cadastro de Caminhões", href: "Modulos/Logistica/cadastro-caminhoes.html" },
            ],
          },
          { rotulo: "Corridas Uber", href: "Modulos/Chiavari/Uber/index.html" },
          {
            rotulo: "Planejamento",
            legado: {
              html: "Modulos/Logistica/PlanejamentoLogistico/planejamento-logistico.html",
              js: "Modulos/Logistica/PlanejamentoLogistico/planejamento-logistico.js",
              css: "Modulos/Logistica/PlanejamentoLogistico/planejamento-logistico.css",
            },
          },
          {
            rotulo: "Roteirização",
            legado: {
              html: "Modulos/Logistica/Roteirizacao/roteirizacao.html",
              js: "Modulos/Logistica/Roteirizacao/roteirizacao.js",
              css: "Modulos/Logistica/Roteirizacao/roteirizacao.css",
            },
          },
          {
            rotulo: "Expedição",
            legado: {
              html: "Modulos/Logistica/Expedicao/expedicao.html",
              js: "Modulos/Logistica/Expedicao/expedicao.js",
              css: "Modulos/Logistica/Expedicao/expedicao.css",
            },
          },
          { rotulo: "Registro de Ocorrências", href: "Modulos/Chiavari/Ocorrencias/OcorrenciasOperacionais.html" },
          { rotulo: "Indicadores Operacionais", href: "Modulos/Chiavari/Ocorrencias/PainelQualidade.html" },
        ],
      },
      {
        id: "rh",
        icone: "users",
        rotulo: "Recursos Humanos",
        itens: [
          { rotulo: "Ideia Premiada", href: "Modulos/RH/IdeiaPremiada/ideia-premiada.html?aba=recebidas" },
          { rotulo: "Cadastro de Funcionários", href: "Modulos/RH/CadastroFuncionarios/cadastro-funcionarios.html" },
          { rotulo: "Controle RH", href: "Modulos/Chiavari/ControleRH/rh.html" },
          { rotulo: "RH da Equipe Free", href: "Modulos/Chiavari/Cronograma/rh.html" },
          { rotulo: "Mural do Portal (avisos e destaques)", href: "Modulos/Chiavari/Portal/mural-admin.html" },
        ],
      },
      {
        id: "financeiro",
        icone: "wallet",
        rotulo: "Financeiro",
        itens: [
          { rotulo: "Fluxo de Caixa", href: "Modulos/Financeiro/fluxodecaixa.html" },
          { rotulo: "Controle Financeiro do Almoxarifado", href: "Modulos/Chiavari/Almoxarifado/financeiro.html" },
        ],
      },
      {
        id: "gestao",
        icone: "clipboard-list",
        rotulo: "Gestão",
        itens: [
          { rotulo: "Central de Metas", href: "Modulos/Chiavari/CentralMetas/central.html" },
          {
            // Fora do menu (out/2026, pedido do usuário): as permissões ficam num lugar só,
            // no Cadastro de Funcionários (Recursos Humanos), que já tem os bloqueios de acesso.
            rotulo: "Permissões",
            oculto: true,
            legado: {
              html: "Modulos/Configuracoes/Permissoes/permissoes.html",
              js: "Modulos/Configuracoes/Permissoes/permissoes.js",
              css: "Modulos/Configuracoes/Permissoes/permissoes.css",
            },
          },
          {
            rotulo: "Integrações",
            grupo: [
              {
                rotulo: "WhatsApp",
                legado: {
                  html: "Modulos/Configuracoes/Integracoes/WhatsApp/whatsapp.html",
                  js: "Modulos/Configuracoes/Integracoes/WhatsApp/whatsapp.js",
                  css: "Modulos/Configuracoes/Integracoes/WhatsApp/whatsapp.css",
                },
              },
              {
                rotulo: "Gateways de Pagamento",
                legado: {
                  html: "Modulos/Configuracoes/Integracoes/GatewaysPagamento/gateways.html",
                  js: "Modulos/Configuracoes/Integracoes/GatewaysPagamento/gateways.js",
                  css: "Modulos/Configuracoes/Integracoes/GatewaysPagamento/gateways.css",
                },
              },
            ],
          },
        ],
      },
      {
        // Apps de celular usados no campo (montadores, freelancers, motoristas, equipe).
        id: "apps",
        icone: "smartphone",
        rotulo: "Apps",
        itens: [
          { rotulo: "App do Montador", href: "Modulos/Chiavari/Cronograma/montador.html" },
          { rotulo: "Vagas Free", href: "Modulos/Chiavari/Cronograma/free.html" },
          { rotulo: "App do Motorista", href: "Modulos/Chiavari/Uber/motorista.html" },
          { rotulo: "Meu Bônus", href: "Modulos/Chiavari/CentralMetas/equipe.html" },
        ],
      },
      {
        // Fora dos módulos, a pedido do usuário: link direto, sem submenu.
        id: "importacao",
        icone: "upload-cloud",
        rotulo: "Importar Itens",
        href: "Modulos/Importacao/ImportarItens/importar-itens.html",
      },
    ],
  };

  window.ACERVO_MENU = ACERVO_MENU;

  /* -------------------------------------------------------------------
     Desenho no formato do menu do Portal Interno da Chiavari
     (o antigo Modulos/Chiavari/Portal/portal.html): trilho escuro à esquerda que
     abre ao passar o mouse, "Início" no topo, uma linha por categoria
     com ícone, e as categorias com vários destinos abrem os sub-itens
     logo abaixo (um grupo aberto por vez). Estilo em
     styles/portal-shell.css; abrir/fechar em js/ui/portalNav.js.
  ------------------------------------------------------------------- */
  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function legadoOnclick(legado) {
    return `carregarNaMain('${legado.html}', '${legado.js}', this, '${legado.css}')`;
  }

  let contadorFlyout = 0;
  function slugify(str) {
    return String(str).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  /* Só entra no menu o que a pessoa pode abrir (out/2026, pedido do usuário: "o que a pessoa
     não tiver acesso eu nem quero que apareça no menu... se todos os html daquele módulo ela não
     tiver acesso, nem o módulo aparece"). Quem decide é EasyLocPermissions.canNavigate — a mesma
     regra que já barra a tela ao abrir (routes em js/core/permissions.js). Grupo ou categoria
     sem nenhum item visível some junto. */
  function podeVer(alvo) {
    const P = window.EasyLocPermissions;
    return !!(alvo && P && P.canNavigate && P.canNavigate(alvo));
  }

  function renderItem(item, filho) {
    if (item.oculto) return "";
    if (item.href && !podeVer(item.href)) return "";
    if (item.legado && !podeVer(item.legado.html)) return "";
    const classe = "sub-item" + (filho ? " sub-filho" : "");

    if (item.grupo) {
      // Todo grupo abre como extensão para fora (painel à direita do painel da
      // categoria). No celular abre logo abaixo. Pedido do usuário: "essas extensões
      // sempre devem abrir pra fora do menu, igual cadastro dentro de estoque".
      const filhos = item.grupo.map((f) => renderItem(f, false)).join("");
      if (!filhos) return "";
      const id = "flyout-" + slugify(item.rotulo) + "-" + (++contadorFlyout);
      return `<div class="flyout" id="${id}"><button class="sub-item sub-flyout" type="button" aria-expanded="false" onclick="portalAlternarFlyout('${id}')">${esc(item.rotulo)}<i class="seta" data-lucide="chevron-right"></i></button><div class="flyout-painel" role="menu" aria-label="${esc(item.rotulo)}"><div class="flyout-titulo">${esc(item.rotulo)}</div>${filhos}</div></div>`;
    }

    if (item.href) {
      return `<button class="${classe}" type="button" data-module-href="${esc(item.href)}" onclick="shellNavigate('${item.href}')">${esc(item.rotulo)}</button>`;
    }

    if (item.legado) {
      return `<button class="${classe}" type="button" data-legado-href="${esc(item.legado.html)}" onclick="${legadoOnclick(item.legado)}">${esc(item.rotulo)}</button>`;
    }

    return "";
  }

  function renderCategoria(categoria) {
    if (categoria.oculto) return "";
    const icone = `<i data-lucide="${esc(categoria.icone)}"></i>`;

    // Categoria com um destino só (ex.: Catálogo) — linha simples, sem seta.
    if (categoria.href) {
      if (!podeVer(categoria.href)) return "";
      return `<button class="menu-item" type="button" data-module-href="${esc(categoria.href)}" onclick="shellNavigate('${categoria.href}')">${icone}<span class="rotulo">${esc(categoria.rotulo)}</span></button>`;
    }

    const itens = categoria.itens.map((item) => renderItem(item, false)).join("");
    if (!itens) return "";
    // A categoria abre um painel para fora do menu, à direita (js/ui/portalNav.js).
    const id = "grupo-" + esc(categoria.id);
    return `
      <div class="flyout flyout-categoria" id="${id}">
        <button class="menu-item" type="button" aria-expanded="false" onclick="portalAlternarFlyout('${id}')">${icone}<span class="rotulo">${esc(categoria.rotulo)}</span><i class="seta" data-lucide="chevron-right"></i></button>
        <div class="flyout-painel" role="menu" aria-label="${esc(categoria.rotulo)}"><div class="flyout-titulo">${esc(categoria.rotulo)}</div>${itens}</div>
      </div>`;
  }

  let ultimoMenu = null;
  function montar() {
    const lista = document.getElementById("appMenu");
    if (!lista) return;
    contadorFlyout = 0;
    const html = ACERVO_MENU.categorias.map(renderCategoria).join("");
    if (html === ultimoMenu) return; // nada mudou: não redesenha (não fecha o que estiver aberto)
    ultimoMenu = html;
    lista.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  // Chamado de novo por js/core/permissions.js quando as permissões são revalidadas.
  window.portalRedesenharMenu = montar;

  /* O menu só é desenhado depois que as permissões carregam (permissions.js vem
     depois deste arquivo no dashboard): antes disso ninguém vê item nenhum. */
  (async function () {
    for (let i = 0; i < 200 && !window.EasyLocPermissions; i++) {
      await new Promise((ok) => setTimeout(ok, 25));
    }
    try { await window.EasyLocPermissions?.load(); } catch (e) { /* sem permissões: menu vazio */ }
    montar();
  })();
})();
