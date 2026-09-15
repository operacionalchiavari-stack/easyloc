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
 * fragmento HTML dentro de <div id="main-content">) — hoje só usado pelos
 * itens ocultos, já que todo item visível já foi convertido.
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

    categorias: [
      {
        id: "cadastros",
        icone: "folder",
        rotulo: "Cadastros",
        itens: [
          { rotulo: "Créditos de IA", href: "Modulos/Comercial/CreditosIA/creditos-ia.html" },
          { rotulo: "Cadastro de Funcionários", href: "Modulos/RH/CadastroFuncionarios/cadastro-funcionarios.html" },
          { rotulo: "Cadastro de Clientes", href: "Modulos/Comercial/CadastroClientes/cadastro-clientes.html" },
          { rotulo: "Cadastro de Locais", href: "Modulos/Comercial/CadastroLocais/cadastro-locais.html" },
        ],
      },
      {
        id: "catalogo",
        icone: "book-open",
        rotulo: "Catálogo",
        href: "Modulos/Comercial/Catalogo/catalogo.html",
      },
      {
        id: "importacao",
        icone: "upload-cloud",
        rotulo: "Importar Itens",
        href: "Modulos/Importacao/ImportarItens/importar-itens.html",
      },
      {
        id: "comercial",
        icone: "briefcase",
        rotulo: "Comercial",
        oculto: true, // oculto a pedido — funcionalidades preservadas, não remover
        itens: [
          {
            rotulo: "Central de Pedidos",
            legado: {
              html: "Modulos/Comercial/Pedidos/CentralPedidos.html",
              js: "Modulos/Comercial/Pedidos/CentralPedidos.js",
              css: "Modulos/Comercial/Pedidos/CentralPedidos.css",
            },
          },
          {
            rotulo: "Cadastros",
            grupo: [
              {
                rotulo: "Cadastro de Clientes",
                legado: {
                  html: "Modulos/Comercial/CadastroClientes/cadastro-clientes.html",
                  js: "Modulos/Comercial/CadastroClientes/cadastro-clientes.js",
                  css: "Modulos/Comercial/CadastroClientes/cadastro-clientes.css",
                },
              },
              {
                rotulo: "Cadastro de Locais",
                legado: {
                  html: "Modulos/Comercial/CadastroLocais/cadastro-locais.html",
                  js: "Modulos/Comercial/CadastroLocais/cadastro-locais.js",
                  css: "Modulos/Comercial/CadastroLocais/cadastro-locais.css",
                },
              },
            ],
          },
          {
            rotulo: "Contratos",
            legado: {
              html: "Modulos/Comercial/Contratos/contratos.html",
              js: "Modulos/Comercial/Contratos/contratos.mjs",
              css: "Modulos/Comercial/Contratos/contratos.css",
            },
          },
        ],
      },
      {
        id: "estoque",
        icone: "package",
        rotulo: "Estoque",
        itens: [
          {
            rotulo: "Cadastros",
            grupo: [
              { rotulo: "Cadastro de Itens", href: "Modulos/Estoque/CadastroItens/cadastro-itens.html" },
              { rotulo: "Cadastro de Personalizações", href: "Modulos/Estoque/Personalizacoes/estoque-personalizacoes.html" },
              { rotulo: "Cadastro de Fornecedores", href: "Modulos/Estoque/CadastroFornecedores/fornecedores.html" },
              { rotulo: "Tabelas de Preço", href: "Modulos/Estoque/TabelasPreco/tabelas-preco.html" },
            ],
          },
          {
            rotulo: "Disponibilidade de Itens",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.html",
              js: "Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.js",
              css: "Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.css",
            },
          },
          {
            rotulo: "Compras",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Estoque/Compras/compras.html",
              js: "Modulos/Estoque/Compras/compras.js",
              css: "Modulos/Estoque/Compras/compras.css",
            },
          },
          { rotulo: "Ordem de Serviços", href: "Modulos/Estoque/OrdemdeServicos/ordem-servicos.html" },
          { rotulo: "Almoxarifado", href: "Modulos/Estoque/Almoxarifado/Principal/almoxarifado.html" },
          {
            rotulo: "Controle de Qualidade",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Estoque/Controledequalidade/controledequalidade.html",
              js: "Modulos/Estoque/Controledequalidade/controledequalidade.js",
              css: "Modulos/Estoque/Controledequalidade/controledequalidade.css",
            },
          },
          {
            rotulo: "Separação de Materiais",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html",
              js: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.js",
              css: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.css",
            },
          },
        ],
      },
      {
        id: "logistica",
        icone: "truck",
        rotulo: "Logística",
        itens: [
          {
            rotulo: "Cadastros",
            grupo: [
              { rotulo: "Cadastro de Caminhões", href: "Modulos/Logistica/cadastro-caminhoes.html" },
            ],
          },
          { rotulo: "Cronograma Logístico", href: "Modulos/Logistica/Cronograma/Cronograma.html" },
          {
            rotulo: "Planejamento",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Logistica/PlanejamentoLogistico/planejamento-logistico.html",
              js: "Modulos/Logistica/PlanejamentoLogistico/planejamento-logistico.js",
              css: "Modulos/Logistica/PlanejamentoLogistico/planejamento-logistico.css",
            },
          },
          {
            rotulo: "Roteirização",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Logistica/Roteirizacao/roteirizacao.html",
              js: "Modulos/Logistica/Roteirizacao/roteirizacao.js",
              css: "Modulos/Logistica/Roteirizacao/roteirizacao.css",
            },
          },
          { rotulo: "Equipe das Rotas", href: "Modulos/Logistica/EquipeRotas/equipe-rotas.html" },
          {
            rotulo: "Expedição",
            oculto: true, // oculto a pedido — não remover
            legado: {
              html: "Modulos/Logistica/Expedicao/expedicao.html",
              js: "Modulos/Logistica/Expedicao/expedicao.js",
              css: "Modulos/Logistica/Expedicao/expedicao.css",
            },
          },
          {
            rotulo: "Separação",
            oculto: true, // oculto a pedido — não remover (duplicado do item de Estoque, preservado como estava)
            legado: {
              html: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html",
              js: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.js",
              css: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.css",
            },
          },
        ],
      },
      {
        id: "financeiro",
        icone: "wallet",
        rotulo: "Financeiro",
        oculto: true, // oculto a pedido — funcionalidades preservadas, não remover
        itens: [
          {
            rotulo: "Fluxo de Caixa",
            legado: {
              html: "Modulos/Financeiro/fluxodecaixa.html",
              js: "Modulos/Financeiro/fluxodecaixa.js",
              css: "Modulos/Financeiro/fluxodecaixa.css",
            },
          },
        ],
      },
      {
        id: "rh",
        icone: "users-round",
        rotulo: "RH",
        oculto: true, // oculto a pedido — funcionalidades preservadas, não remover
        itens: [
          {
            rotulo: "Gestão de Pessoas",
            legado: {
              html: "Modulos/RH/GestaoPessoas/rh-gestao-pessoas.html",
              js: "Modulos/RH/GestaoPessoas/rh-gestao-pessoas.js",
              css: "Modulos/RH/GestaoPessoas/rh-gestao-pessoas.css",
            },
          },
        ],
      },
      {
        id: "ia",
        icone: "sparkles",
        rotulo: "Inteligência Artificial",
        oculto: true, // oculto a pedido — funcionalidades preservadas, não remover
        itens: [
          {
            rotulo: "Acervo Studio IA",
            legado: {
              html: "Modulos/IA/StudioIA/studio-ia.html",
              js: "js/studio-ia/studio-ia.mjs",
              css: "Modulos/IA/StudioIA/studio-ia.css",
            },
          },
        ],
      },
    ],
  };

  window.ACERVO_MENU = ACERVO_MENU;

  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function slugify(str) {
    return String(str)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function legadoOnclick(legado) {
    return `carregarNaMain('${legado.html}', '${legado.js}', this, '${legado.css}')`;
  }

  function renderItem(item) {
    if (item.oculto) return "";

    if (item.grupo) {
      const groupId = `${item.__categoriaId}-${item.__slug}-sub`;
      const filhos = item.grupo.map(renderItem).join("\n");
      return `
        <button class="submenu-trigger" type="button" onclick="toggleNestedSubmenu('${groupId}', this)">
          ${esc(item.rotulo)}
        </button>
        <div class="submenu-group" id="${groupId}">
          ${filhos}
        </div>`;
    }

    if (item.href) {
      return `
        <div class="submenu-item" data-module-href="${esc(item.href)}" onclick="shellNavigate('${item.href}')">
          ${esc(item.rotulo)}
        </div>`;
    }

    if (item.legado) {
      return `
        <div class="submenu-item" onclick="${legadoOnclick(item.legado)}">
          ${esc(item.rotulo)}
        </div>`;
    }

    return "";
  }

  function renderCategoria(categoria) {
    if (categoria.oculto) return "";

    // Categoria sem lista de itens, so um destino direto (ex.: Catalogo) —
    // vira um item de menu simples, sem seta de dropdown nem submenu.
    if (categoria.href) {
      return `
        <div class="menu-item" data-module-href="${esc(categoria.href)}" onclick="shellNavigate('${categoria.href}')">
          <i data-lucide="${esc(categoria.icone)}"></i>
          <span>${esc(categoria.rotulo)}</span>
        </div>`;
    }

    const subId = `${categoria.id}-sub`;
    categoria.itens.forEach((item) => {
      item.__categoriaId = categoria.id;
      item.__slug = item.grupo ? slugify(item.rotulo) : "";
    });
    const itens = categoria.itens.map(renderItem).join("\n");

    return `
      <div class="menu-item has-sub" onclick="toggleSubmenu('${subId}', this)">
        <i data-lucide="${esc(categoria.icone)}"></i>
        <span>${esc(categoria.rotulo)}</span>
      </div>
      <div class="submenu" id="${subId}">
        ${itens}
      </div>`;
  }

  function renderFavorito(fav) {
    return `
      <button type="button" class="sidebar-favorite" title="${esc(fav.titulo)}"
        data-module-href="${esc(fav.href)}" onclick="shellNavigate('${fav.href}')">
        <i data-lucide="${esc(fav.icone)}"></i>
        <span>${esc(fav.rotulo)}</span>
      </button>`;
  }

  function montar() {
    const nav = document.getElementById("appMenu");
    if (nav) nav.innerHTML = ACERVO_MENU.categorias.map(renderCategoria).join("\n");

    const favoritos = document.getElementById("appFavoritos");
    if (favoritos) favoritos.innerHTML = ACERVO_MENU.favoritos.map(renderFavorito).join("\n");

    if (window.lucide) window.lucide.createIcons();
  }

  montar();
})();
