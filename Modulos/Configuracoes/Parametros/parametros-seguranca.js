// Parâmetros > Segurança (out/2026): verificação em duas etapas por WhatsApp.
// Mostra quem tem login e se tem WhatsApp cadastrado, o registro de segurança e liga/desliga a exigência
// (RPC seguranca_2fa_config_salvar: só liga depois de quem liga confirmar um código pelo WhatsApp nesta sessão
// e com todo mundo com WhatsApp cadastrado, para ninguém ficar trancado do lado de fora).
(function () {
  "use strict";
  const painel = document.getElementById("pr-painel-seguranca");
  if (!painel) return;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const quando = (v) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
  const EVENTOS = {
    codigo_enviado: "Código enviado", verificado: "Entrou com o código", codigo_errado: "Código errado",
    envio_falhou: "Envio pelo WhatsApp falhou", envio_bloqueado: "Muitos pedidos de código", recuperacao_errada: "Código de recuperação errado",
    recuperacao_gerada: "Novos códigos de recuperação", exigencia_ligada: "Exigência ligada", exigencia_desligada: "Exigência desligada",
  };
  let empresaId = null, carregado = false;

  async function carregar() {
    const ctx = await window.aguardarContexto?.();
    empresaId = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    const { data, error } = await window.supabaseClient.rpc("seguranca_2fa_painel", { p_empresa: empresaId });
    if (error) { painel.innerHTML = `<section class="pr-card"><p>${esc(/permiss/i.test(error.message) ? "Sem permissão para ver a segurança da empresa." : "Não foi possível carregar: " + error.message)}</p></section>`; return; }
    pintar(data);
  }

  function pintar(d) {
    const semZap = (d.usuarios || []).filter((u) => !u.tem_whatsapp);
    const falhou = (d.eventos || []).find((e) => e.tipo === "envio_falhou" || e.tipo === "codigo_enviado");
    painel.innerHTML = `
      <section class="pr-card ps-topo">
        <div class="ps-cabeca">
          <div><h3>Verificação em duas etapas</h3>
          <p class="pr-ajuda">Depois da senha, o sistema manda um código de 6 números para o WhatsApp da pessoa (o número do Cadastro de Funcionários). Sem o código, a senha sozinha não abre nada — nem dados, nem arquivos. Cada aparelho confirma uma vez e fica liberado por até 30 dias ou até sair do sistema.</p></div>
          <span class="ps-selo ${d.obrigatorio ? "is-on" : ""}">${d.obrigatorio ? "Ligada" : "Desligada"}</span>
        </div>
        ${falhou?.tipo === "envio_falhou" ? `<p class="ps-alerta">O último envio pelo WhatsApp falhou: ${esc(falhou.detalhes?.motivo || "")} Ajuste em Gestão › Integrações › WhatsApp e teste de novo.</p>` : ""}
        ${semZap.length ? `<p class="ps-alerta">Sem WhatsApp cadastrado: <b>${semZap.map((u) => esc(u.nome)).join(", ")}</b>. Cadastre no Cadastro de Funcionários antes de ligar.</p>` : ""}
        <div class="ps-acoes">
          <button type="button" class="btn" data-ps="testar">${d.sessao_verificada ? "✓ Você confirmou nesta sessão" : "Testar agora (receber um código)"}</button>
          ${d.obrigatorio ? '<button type="button" class="btn" data-ps="desligar">Desligar exigência</button>'
            : `<button type="button" class="btn primary" data-ps="ligar" ${d.sessao_verificada && !semZap.length ? "" : "disabled"}>Ligar para todos</button>`}
          <button type="button" class="btn" data-ps="codigos" ${d.sessao_verificada ? "" : "disabled"}>Gerar meus códigos de recuperação</button>
        </div>
        ${!d.obrigatorio && !d.sessao_verificada ? '<p class="pr-ajuda">Para ligar, primeiro use "Testar agora": assim fica provado que o WhatsApp está entregando os códigos.</p>' : ""}
      </section>
      <section class="pr-card">
        <h3>Pessoas com acesso ao sistema</h3>
        <div class="pr-tabela-wrap"><table class="pr-tabela"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Última confirmação</th></tr></thead><tbody>
        ${(d.usuarios || []).map((u) => `<tr><td>${esc(u.nome)}${u.eu ? " <small>(você)</small>" : ""}</td><td>${u.tem_whatsapp ? esc(u.whatsapp) : '<span class="ps-falta">Sem WhatsApp</span>'}</td><td>${quando(u.ultima_verificacao)}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="pr-card">
        <h3>Registro de segurança</h3>
        ${(d.eventos || []).length ? `<div class="pr-tabela-wrap"><table class="pr-tabela"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr></thead><tbody>
        ${d.eventos.map((e) => `<tr><td>${quando(e.criado_em)}</td><td>${esc(e.nome || "—")}</td><td>${esc(EVENTOS[e.tipo] || e.tipo)}${e.detalhes?.metodo === "recuperacao" ? " (código de recuperação)" : ""}</td></tr>`).join("")}
        </tbody></table></div>` : '<p class="pr-ajuda">Nada registrado ainda.</p>'}
      </section>`;
    window.carregarStatusBackups?.(painel,empresaId);
  }

  async function ligarDesligar(valor) {
    const { error } = await window.supabaseClient.rpc("seguranca_2fa_config_salvar", { p_empresa: empresaId, p_obrigatorio: valor });
    if (error) { window.alerta ? window.alerta(error.message, "Segurança", "erro") : alert(error.message); return; }
    await carregar();
  }

  painel.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-ps]");
    if (!b || b.disabled) return;
    const acao = b.dataset.ps;
    if (acao === "testar") {
      try { await window.EasyLoc2FA.garantir({ forcar: true }); } catch (e) { window.alerta?.(e.message, "Segurança", "erro"); }
      return carregar();
    }
    if (acao === "ligar") {
      if (!confirm("Ligar a verificação em duas etapas para todos? A partir do próximo login, todos vão precisar do código do WhatsApp.")) return;
      return ligarDesligar(true);
    }
    if (acao === "desligar") {
      if (!confirm("Desligar a verificação em duas etapas? A senha volta a ser suficiente para entrar.")) return;
      return ligarDesligar(false);
    }
    if (acao === "codigos") {
      if (!confirm("Gerar novos códigos de recuperação? Os anteriores param de funcionar.")) return;
      const r = await window.EasyLoc2FA.chamar({ action: "novos_codigos" });
      if (r.erro) return window.alerta?.(r.erro, "Segurança", "erro");
      const caixa = document.createElement("section");
      caixa.className = "pr-card ps-codigos";
      caixa.innerHTML = `<h3>Seus códigos de recuperação</h3><p class="pr-ajuda">Cada um libera uma entrada se você perder o celular. Eles aparecem só agora: anote ou guarde num lugar seguro.</p><div class="ps-lista">${r.recuperacao.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`;
      painel.prepend(caixa);
    }
  });

  // carrega quando a aba é aberta pela primeira vez
  new MutationObserver(() => { if (!painel.hidden && !carregado) { carregado = true; carregar(); } }).observe(painel, { attributes: true, attributeFilter: ["hidden"] });
  if (!painel.hidden) { carregado = true; carregar(); }
})();
