// Aba "Gateways" do Financeiro (out/2026): a tela de Gateways de Pagamento (antes em Gestão > Integrações)
// aberta dentro do Financeiro. Reaproveita gateways.js/.css do módulo antigo sem mudar a lógica: só desenha
// a mesma estrutura (ids pgBtnRefresh, pgGatewayList, pgConfigPanel) e chama o init dele.
(function () {
  const BASE = "../Configuracoes/Integracoes/GatewaysPagamento/";
  const V = "?v=20261030-por-conta";
  let carregado = null, initGw = null, destroyGw = null;

  function carregar() {
    if (carregado) return carregado;
    if (!document.querySelector('link[data-fin-gw]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = BASE + "gateways.css" + V; l.dataset.finGw = "1";
      document.head.appendChild(l);
    }
    carregado = new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = BASE + "gateways.js" + V;
      s.onload = () => { initGw = window.__moduleInit; destroyGw = window.__activeModuleDestroy; ok(); };
      s.onerror = () => { carregado = null; erro(new Error("Não foi possível carregar os gateways.")); };
      document.body.appendChild(s);
    });
    return carregado;
  }

  // contas que recebem do pedido (cada uma com o seu gateway: é para ela que vai o PIX do link de pagamento)
  async function contas() {
    const emp = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    const { data } = await window.supabaseClient.from("fin_contas").select("id,nome,tipo,logo_url").eq("empresa_id", emp).eq("ativo", true).order("nome");
    return (data || []).filter((c) => !["caixa", "gateway"].includes(c.tipo));
  }
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function render() {
    const raiz = document.getElementById("finConteudo");
    const lista = await contas().catch(() => []);
    if (window.__pgContaId === undefined || (window.__pgContaId && !lista.some((c) => c.id === window.__pgContaId))) window.__pgContaId = lista[0]?.id || null;
    raiz.innerHTML =
      '<div class="payment-gateways-page fin-gateways" data-module-root>' +
        '<div class="pg-header fin-gw-topo"><h2>Gateways de Pagamento</h2>' +
          '<button type="button" class="fin-btn claro pg-refresh-btn" id="pgBtnRefresh">Atualizar</button></div>' +
        '<div class="fin-gw-contas" role="tablist" aria-label="Conta do gateway"><span>Gateway da conta</span>' +
          lista.map((c) => '<button type="button" role="tab" data-gw-conta="' + c.id + '" aria-selected="' + (c.id === window.__pgContaId) + '" class="' + (c.id === window.__pgContaId ? "ativa" : "") + '">' + esc(c.nome) + "</button>").join("") +
          '<button type="button" role="tab" data-gw-conta="" aria-selected="' + !window.__pgContaId + '" class="' + (!window.__pgContaId ? "ativa" : "") + '" title="Conexão usada pelo PIX das telas antigas (Central de Pedidos)">Geral</button></div>' +
          '<p class="fin-gw-dica">O PIX do link de pagamento de cada parcela é gerado no gateway da conta dela e o dinheiro cai na conta "Mercado Pago · nome da conta" do Financeiro.</p>' +
        '<section class="pg-layout">' +
          '<aside class="pg-card pg-left"><div class="pg-card-head"><div><strong>Integrações</strong></div></div>' +
            '<div class="pg-gateway-list" id="pgGatewayList"><div class="pg-empty">Carregando gateways...</div></div></aside>' +
          '<main class="pg-card pg-right" id="pgConfigPanel"><div class="pg-empty pg-empty-large">Selecione um gateway para configurar.</div></main>' +
        "</section></div>";
    raiz.querySelectorAll("[data-gw-conta]").forEach((b) => b.addEventListener("click", () => { window.__pgContaId = b.dataset.gwConta || null; render(); }));
    try {
      await carregar();
      destroyGw?.();
      initGw?.();
    } catch (e) {
      raiz.innerHTML = '<div class="fin-vazio">' + (e.message || "Não foi possível abrir os gateways.") + "</div>";
    }
  }

  window.FinanceiroGateways = { render };
})();
