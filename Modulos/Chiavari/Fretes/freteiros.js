/* =====================================================
   FRETEIROS (out/2026)
   - Cadastros: quem se cadastrou no App do Freteiro. Só vê fretes depois de aprovado. Aprovar cria o fornecedor e o
     caminhão dele (código FRnn), e os fretes dele são cobrados pelo relatório do App do Freteiro (frete_lancamentos).
   - Fretes anunciados: entrega/coleta sem caminhão próprio livre (frete_anuncios_sincronizar). Quem aceita vira o
     caminhão programado das etapas; "Tirar o freteiro" (antes do check-in) devolve o frete ao app.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) : "-");
  const quando = (v) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const fone = (v) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7) : d.length === 10 ? "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6) : d; };
  const m3 = (v) => String(Number(v || 0)).replace(".", ",") + " m³";
  const integrado = new URLSearchParams(location.search).get("integrado");
  const S = { sb: null, emp: null, aba: "cadastros", dados: { freteiros: [], anuncios: [] }, div: { abertas: [], resolvidas: [] }, podeEditar: false };
  const SIT = { pendente: ["Em análise", "fr-st-pend"], aprovado: ["Aprovado", "fr-st-ok"], recusado: ["Recusado", "fr-st-nao"], bloqueado: ["Bloqueado", "fr-st-nao"] };

  async function rpc(nome, args) { if(window.FretesExemplos)return window.FretesExemplos.rpc(nome); const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }
  const avisar = (m, tipo = "aviso") => (window.alerta ? window.alerta(m, "Freteiros", tipo) : alert(m));

  async function carregar() {
    S.dados = await rpc("frete_adm_lista", { p_empresa: S.emp });
    if (!window.FretesExemplos && integrado !== 'anuncios') { try { S.div = (await rpc("frete_div_lista", { p_empresa: S.emp })) || { abertas: [], resolvidas: [] }; } catch (_) { S.div = { abertas: [], resolvidas: [] }; } }
    pintar();
  }

  function pintar() {
    const pend = S.dados.freteiros.filter((f) => f.status === "pendente").length;
    const abertos = S.dados.anuncios.filter((a) => a.status_anuncio === "aberto").length;
    $("frPendentes").textContent = pend || "";
    $("frAbertos").textContent = abertos ? abertos + " sem freteiro" : "";
    if ($("frDivergencias")) $("frDivergencias").textContent = S.div.abertas.length || "";
    if (integrado === "painel") window.parent.postMessage({ tipo: "freteiros-divergencias", quantidade: S.div.abertas.length }, location.origin);
    document.querySelectorAll(".fr-abas [data-aba]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === S.aba)));
    $("frConteudo").innerHTML = S.aba === "cadastros" ? cadastros() : S.aba === "divergencias" ? divergencias() : fretes();
    if (integrado) requestAnimationFrame(() => window.parent.postMessage({tipo:"fretes-cadastros-altura",altura:document.documentElement.scrollHeight},location.origin));
  }

  function cadastros() {
    const lista = integrado === "fornecedores" ? S.dados.freteiros.filter(f => f.status === "pendente") : S.dados.freteiros;
    if (!lista.length && integrado === "fornecedores") return '<div class="cf-vazio">Nenhum cadastro do app aguardando an&#225;lise.</div>';
    if (!lista.length) return '<div class="cf-vazio">Nenhum freteiro se cadastrou ainda. Passe o link do App do Freteiro para eles.</div>';
    return '<section class="cf-bloco"><div class="cf-rolar"><table class="cf-tabela fr-tabela"><thead><tr><th>Freteiro</th><th>Veículo</th><th class="num">Capacidade</th><th>Pix</th><th>Situação</th><th class="num">Fretes</th><th></th></tr></thead><tbody>' +
      lista.map((f) => {
        const st = SIT[f.status] || [f.status, ""], n = String(f.telefone || "").replace(/\D/g, "");
        const acoes = !S.podeEditar ? "" : f.status === "pendente"
          ? '<button type="button" class="btn primary" data-aprovar="' + f.id + '">Aprovar</button><button type="button" class="btn" data-recusar="' + f.id + '">Recusar</button>'
          : f.status === "aprovado" ? '<button type="button" class="btn" data-bloquear="' + f.id + '">Bloquear</button>'
          : '<button type="button" class="btn" data-aprovar="' + f.id + '">Aprovar</button>';
        return '<tr><td><strong>' + esc(f.nome) + '</strong><small>' + (n.length >= 10 ? '<a href="https://wa.me/55' + n + '" target="_blank" rel="noopener">' + esc(fone(f.telefone)) + "</a>" : esc(f.telefone)) + " · desde " + esc(quando(f.created_at)) + "</small></td>" +
          "<td>" + esc([f.veiculo_modelo, f.veiculo_tipo].filter(Boolean).join(" · ")) + "<small>" + esc(f.veiculo_placa || "") + (f.codigo ? " · caminhão " + esc(f.codigo) : "") + "</small></td>" +
          '<td class="num">' + esc(m3(f.capacidade_m3)) + "</td>" +
          "<td>" + esc(f.pix || "") + "</td>" +
          '<td><span class="fr-st ' + st[1] + '">' + esc(st[0]) + "</span>" + (f.motivo ? "<small>" + esc(f.motivo) + "</small>" : "") + (f.avaliado_por ? "<small>" + esc(f.avaliado_por) + " · " + esc(quando(f.avaliado_em)) + "</small>" : "") + "</td>" +
          '<td class="num">' + (f.fretes || 0) + "</td>" +
          '<td class="fr-acoes">' + acoes + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  function fretes() {
    const lista = S.dados.anuncios;
    if (!lista.length) return '<div class="cf-vazio">Nenhum frete anunciado. O sistema anuncia sozinho a entrega ou a coleta que ficar sem caminhão próprio livre na escala.</div>';
    return '<section class="cf-bloco"><div class="cf-rolar"><table class="cf-tabela fr-tabela"><thead><tr><th>Data</th><th>Pedido</th><th>Frete</th><th class="num">Volume</th><th class="num">Valor total</th><th>Confirmação no aplicativo</th><th></th></tr></thead><tbody>' +
      lista.map((a) => {
        const fr = a.freteiro;
        const sit = a.status_anuncio === "aberto" ? '<span class="fr-st fr-st-pend">Aguardando confirmação de um freteiro no app</span>'
          : '<strong>' + esc(fr?.nome || "-") + "</strong><small>" + esc(fr?.veiculo || "") + '</small><small>Confirmou no aplicativo' + (a.aceito_em?' em '+esc(quando(a.aceito_em)):'')+'</small>'+(a.checkout_em?'<small>Concluído '+esc(quando(a.checkout_em))+'</small>':a.checkin_em?'<small>Check-in '+esc(quando(a.checkin_em))+'</small>':'');
        const acao = S.podeEditar && a.status_anuncio === "aceito" && !a.checkin_em ? '<button type="button" class="btn" data-liberar="' + a.id + '">Tirar o freteiro</button>' : "";
        return "<tr><td>" + esc(dataBr(a.data)) + (a.hora ? "<small>" + esc(a.hora) + "</small>" : "") + "</td>" +
          "<td><strong>" + esc(a.pedido || "") + "</strong><small>" + esc(a.cliente || "") + "</small></td>" +
          '<td><span class="cf-tipo ' + (a.direcao === "coleta" ? "coleta" : "entrega") + '">' + (a.direcao === "coleta" ? "Coleta" : "Entrega") + "</span><small>" + esc(a.destino) + " · " + esc(String(Number(a.km || 0) * 2).replace(".", ",")) + " km ida e volta</small></td>" +
          '<td class="num">' + esc(m3(a.m3)) + "</td>" +
          '<td class="num"><strong>' + brl(a.valor) + "</strong></td>" +
          "<td>" + sit + "</td><td class=\"fr-acoes\">" + acao + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  /* 21/11/2026: divergências do relatório que o freteiro envia pelo App do Freteiro (lançamento às cegas).
     A Logística compara o que ele lançou com o frete do sistema, lê a explicação dele e decide: aceitar, corrigir o
     valor ou recusar, sempre com motivo. Sem divergência pendente, o relatório vai para o Financeiro sozinho. */
  const TIPO_DIV = { valor: "Valor diferente do combinado", sem_frete: "Frete não encontrado no sistema", nao_lancado: "Frete do sistema que ele não lançou" };
  function totalLanc(l) { return Number(l.total != null ? l.total : l.valor || 0); }
  function divergencias() {
    const ab = S.div.abertas || [], res = S.div.resolvidas || [];
    let h = ab.length ? '<div class="fd-lista">' + ab.map(cartaoDiv).join("") + "</div>"
      : '<div class="cf-vazio">Nenhuma divergência para resolver. Quando um freteiro enviar o relatório e algo não bater, aparece aqui.</div>';
    if (res.length) h += '<h3 class="fd-sub">Resolvidas nos últimos 30 dias</h3><section class="cf-bloco"><div class="cf-rolar"><table class="cf-tabela fr-tabela"><thead><tr><th>Freteiro</th><th>Frete</th><th>Divergência</th><th>Decisão</th><th class="num">Valor final</th></tr></thead><tbody>' +
      res.map((l) => "<tr><td><strong>" + esc(l.freteiro) + "</strong></td><td>" + esc(dataBr(l.data)) + "<small>" + esc(l.destino || "") + "</small></td><td>" + esc(TIPO_DIV[l.divergencia] || "") + "</td>" +
        "<td>" + esc(l.situacao === "aceito" ? "Aceito" : l.situacao === "corrigido" ? "Corrigido" : "Recusado") + "<small>" + esc(l.decisao_motivo || "") + "</small><small>" + esc(l.decisao_por || "") + " · " + esc(quando(l.decisao_em)) + "</small></td>" +
        '<td class="num">' + brl(l.valor_final) + "</td></tr>").join("") + "</tbody></table></div></section>";
    return h;
  }
  function cartaoDiv(l) {
    const s = l.sistema, n = String(l.telefone || "").replace(/\D/g, "");
    const lado = l.tipo === "sistema" ? '<div class="fd-col fd-vazio"><span class="fd-rot">Freteiro lançou</span><p>Não lançou este frete no relatório.</p></div>'
      : '<div class="fd-col"><span class="fd-rot">Freteiro lançou</span><strong>' + esc(dataBr(l.data)) + "</strong><p>" + esc((l.origem ? l.origem + " → " : "") + (l.destino || "")) + "</p>" +
        (l.caminhao ? "<p>Caminhão: " + esc(l.caminhao) + "</p>" : "") + ((l.extras || []).length ? "<p>Extras: " + l.extras.map((e) => esc(e.motivo) + " " + brl(e.valor)).join(" · ") + "</p>" : "") +
        (l.observacao ? '<p class="fd-obs">' + esc(l.observacao) + "</p>" : "") + '<b class="fd-valor">' + brl(totalLanc(l)) + "</b></div>";
    const sis = s ? '<div class="fd-col"><span class="fd-rot">No sistema</span><strong>' + esc(dataBr(s.data)) + (s.hora ? " · " + esc(String(s.hora).slice(0, 5)) : "") + "</strong><p>" +
        esc((s.origem ? s.origem + " → " : "") + (s.destino || "")) + "</p><p>Pedido " + esc(s.pedido || "-") + " · " + esc(s.cliente || "") + " · " + (s.direcao === "coleta" ? "coleta" : "entrega") + "</p>" +
        "<p>" + (s.checkin_em ? "Check-in " + esc(quando(s.checkin_em)) : "Sem check-in") + (s.checkout_em ? " · check-out " + esc(quando(s.checkout_em)) : "") + '</p><b class="fd-valor">' + brl(l.valor_sistema) + "</b></div>"
      : '<div class="fd-col fd-vazio"><span class="fd-rot">No sistema</span><p>Nenhum frete deste freteiro nesta data (com check-out).</p></div>';
    const acoes = !S.podeEditar ? "" : '<div class="fd-acoes"><button type="button" class="btn primary" data-div-acao="aceitar" data-id="' + l.id + '">' + (l.tipo === "sistema" ? "Aceitar (pagar o valor do sistema)" : "Aceitar o valor dele") + "</button>" +
      '<button type="button" class="btn" data-div-acao="corrigir" data-id="' + l.id + '">Corrigir valor</button><button type="button" class="btn" data-div-acao="recusar" data-id="' + l.id + '">Recusar</button></div>';
    return '<article class="fd-card"><header><span><strong>' + esc(l.freteiro) + "</strong><small>" + (n.length >= 10 ? '<a href="https://wa.me/55' + n + '" target="_blank" rel="noopener">' + esc(fone(l.telefone)) + "</a> · " : "") + "relatório " + esc(l.periodo || "") + '</small></span><span class="fr-st fr-st-nao">' + esc(TIPO_DIV[l.divergencia] || "Divergência") + "</span></header>" +
      '<div class="fd-cols">' + lado + sis + "</div>" +
      '<div class="fd-exp"><span class="fd-rot">Explicação do freteiro</span>' + (l.explicacao ? "<p>" + esc(l.explicacao) + "</p>" : '<p class="fd-sem">Ele ainda não explicou. Dá para decidir mesmo assim.</p>') + "</div>" + acoes + "</article>";
  }
  function pedirDecisao(acao, l) {
    return new Promise((ok) => {
      const d = document.createElement("dialog");
      d.className = "fr-dialog";
      const titulo = acao === "aceitar" ? "Aceitar" : acao === "corrigir" ? "Corrigir o valor" : "Recusar este frete";
      d.innerHTML = '<form method="dialog"><h3>' + titulo + "</h3>" + (acao === "corrigir" ? '<label>Valor correto (R$)<input type="text" inputmode="decimal" required></label>' : "") +
        '<label>Motivo (vai para o Financeiro e para o freteiro)<textarea rows="3" required></textarea></label><div class="fr-dialog-acoes"><button type="button" class="btn" value="cancel">Cancelar</button><button type="submit" class="btn primary">Confirmar</button></div></form>';
      document.body.appendChild(d);
      const t = d.querySelector("textarea"), v = d.querySelector("input");
      d.querySelector('[value="cancel"]').onclick = () => d.close();
      d.querySelector("form").onsubmit = (e) => {
        e.preventDefault(); const m = t.value.trim(); if (m.length < 3) { t.focus(); return; }
        const valor = v ? Number(String(v.value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) : null;
        if (v && !(valor > 0)) { v.focus(); return; }
        d.dataset.r = JSON.stringify({ motivo: m, valor }); d.close();
      };
      d.addEventListener("close", () => { ok(d.dataset.r ? JSON.parse(d.dataset.r) : null); d.remove(); });
      d.showModal(); (v || t).focus();
    });
  }
  async function decidir(acao, id) {
    const l = (S.div.abertas || []).find((x) => x.id === id); if (!l) return;
    const r = await pedirDecisao(acao, l); if (!r) return;
    try { S.div = await rpc("frete_div_resolver", { p_empresa: S.emp, p_id: id, p_acao: acao, p_valor: r.valor, p_motivo: r.motivo }); pintar(); avisar("Divergência resolvida.", "sucesso"); }
    catch (e) { avisar(e.message, "erro"); }
  }

  function pedirMotivo(titulo) {
    return new Promise((ok) => {
      const d = document.createElement("dialog");
      d.className = "fr-dialog";
      d.innerHTML = '<form method="dialog"><h3>' + esc(titulo) + '</h3><label>Motivo<textarea rows="3" required></textarea></label><div class="fr-dialog-acoes"><button type="button" class="btn" value="cancel">Cancelar</button><button type="submit" class="btn primary">Confirmar</button></div></form>';
      document.body.appendChild(d);
      const t = d.querySelector("textarea");
      d.querySelector('[value="cancel"]').onclick = () => { d.close(); };
      d.querySelector("form").onsubmit = (e) => { e.preventDefault(); const v = t.value.trim(); if (v.length < 3) { t.focus(); return; } d.dataset.valor = v; d.close(); };
      d.addEventListener("close", () => { ok(d.dataset.valor || null); d.remove(); });
      d.showModal(); t.focus();
    });
  }

  async function mudarStatus(id, status) {
    let motivo = null;
    if (status !== "aprovado") { motivo = await pedirMotivo(status === "recusado" ? "Recusar o cadastro" : "Bloquear o freteiro"); if (!motivo) return; }
    try { S.dados = await rpc("frete_freteiro_status", { p_empresa: S.emp, p_freteiro: id, p_status: status, p_motivo: motivo }); pintar(); if (integrado === "fornecedores" && status === "aprovado") window.parent.postMessage({tipo:"fretes-cadastro-aprovado"},location.origin); avisar(status === "aprovado" ? "Freteiro aprovado: ele já vê os fretes no app." : "Situação atualizada.", "sucesso"); }
    catch (e) { avisar(e.message, "erro"); }
  }

  function ligar() {
    document.addEventListener("click", async (e) => {
      const aba = e.target.closest(".fr-abas [data-aba]"); if (aba && integrado !== 'anuncios') { S.aba = aba.dataset.aba; return pintar(); }
      const dv = e.target.closest("[data-div-acao]"); if (dv) return decidir(dv.dataset.divAcao, dv.dataset.id);
      const ap = e.target.closest("[data-aprovar]"); if (ap) return mudarStatus(ap.dataset.aprovar, "aprovado");
      const re = e.target.closest("[data-recusar]"); if (re) return mudarStatus(re.dataset.recusar, "recusado");
      const bl = e.target.closest("[data-bloquear]"); if (bl) return mudarStatus(bl.dataset.bloquear, "bloqueado");
      const li = e.target.closest("[data-liberar]");
      if (li) {
        const ok = window.confirmarGlobal ? await window.confirmarGlobal("Tirar o freteiro deste frete? Ele volta a ficar disponível no app.") : confirm("Tirar o freteiro deste frete?");
        if (!ok) return;
        try { S.dados = await rpc("frete_anuncio_liberar", { p_empresa: S.emp, p_anuncio: li.dataset.liberar }); pintar(); } catch (er) { avisar(er.message, "erro"); }
      }
    });
  }

  async function iniciar() {
    if(window.FretesExemplos){S.aba="fretes";S.podeEditar=false;document.querySelectorAll(".header-list,.fr-abas,.cf-barra>a").forEach(el=>el.style.setProperty("display","none","important"));ligar();await carregar();return;}
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    try { await window.EasyLocPermissions?.load?.(); S.podeEditar = window.EasyLocPermissions?.hasPermission ? !!window.EasyLocPermissions.hasPermission("logistica.planejamento.editar") : true; } catch (_) { S.podeEditar = true; }
    { const a = new URLSearchParams(location.search).get("aba"); if (a === "fretes" || a === "divergencias") S.aba = a; }
    if(integrado === 'anuncios') S.aba = 'fretes';
    if(integrado) document.querySelector('.header-list')?.remove();
    ligar();
    try { await carregar(); } catch (e) { $("frConteudo").innerHTML = '<div class="cf-vazio">' + esc(e.message) + "</div>"; }
    if(integrado==='anuncios')setInterval(()=>{if(!document.hidden)carregar().catch(e=>console.warn('Confirmações dos fretes:',e.message));},60000);
  }
  iniciar();
})();
