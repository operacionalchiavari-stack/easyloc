/* =====================================================
   FRETEIROS (out/2026)
   - Cadastros: quem se cadastrou no App do Freteiro. Só vê fretes depois de aprovado. Aprovar cria o fornecedor e o
     caminhão dele (código FRnn), então a viagem entra sozinha na Conciliação de Fretes (frete_freteiro_status).
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
  const S = { sb: null, emp: null, aba: "cadastros", dados: { freteiros: [], anuncios: [] }, podeEditar: false };
  const SIT = { pendente: ["Em análise", "fr-st-pend"], aprovado: ["Aprovado", "fr-st-ok"], recusado: ["Recusado", "fr-st-nao"], bloqueado: ["Bloqueado", "fr-st-nao"] };

  async function rpc(nome, args) { if(window.FretesExemplos)return window.FretesExemplos.rpc(nome); const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }
  const avisar = (m, tipo = "aviso") => (window.alerta ? window.alerta(m, "Freteiros", tipo) : alert(m));

  async function carregar() { S.dados = await rpc("frete_adm_lista", { p_empresa: S.emp }); pintar(); }

  function pintar() {
    const pend = S.dados.freteiros.filter((f) => f.status === "pendente").length;
    const abertos = S.dados.anuncios.filter((a) => a.status_anuncio === "aberto").length;
    $("frPendentes").textContent = pend || "";
    $("frAbertos").textContent = abertos ? abertos + " sem freteiro" : "";
    document.querySelectorAll(".fr-abas [data-aba]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === S.aba)));
    $("frConteudo").innerHTML = S.aba === "cadastros" ? cadastros() : fretes();
    if (integrado === "fornecedores") requestAnimationFrame(() => window.parent.postMessage({tipo:"fretes-cadastros-altura",altura:document.documentElement.scrollHeight},location.origin));
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
    return '<section class="cf-bloco"><div class="cf-rolar"><table class="cf-tabela fr-tabela"><thead><tr><th>Data</th><th>Pedido</th><th>Frete</th><th class="num">Volume</th><th class="num">Valor total</th><th>Freteiro</th><th></th></tr></thead><tbody>' +
      lista.map((a) => {
        const fr = a.freteiro;
        const sit = a.status_anuncio === "aberto" ? '<span class="fr-st fr-st-pend">Aguardando um freteiro no app</span>'
          : '<strong>' + esc(fr?.nome || "-") + "</strong><small>" + esc(fr?.veiculo || "") + "</small><small>" + (a.checkout_em ? "Concluído " + esc(quando(a.checkout_em)) : a.checkin_em ? "Check-in " + esc(quando(a.checkin_em)) : "Aceito " + esc(quando(a.aceito_em))) + "</small>";
        const acao = S.podeEditar && a.status_anuncio === "aceito" && !a.checkin_em ? '<button type="button" class="btn" data-liberar="' + a.id + '">Tirar o freteiro</button>' : "";
        return "<tr><td>" + esc(dataBr(a.data)) + (a.hora ? "<small>" + esc(a.hora) + "</small>" : "") + "</td>" +
          "<td><strong>" + esc(a.pedido || "") + "</strong><small>" + esc(a.cliente || "") + "</small></td>" +
          '<td><span class="cf-tipo ' + (a.direcao === "coleta" ? "coleta" : "entrega") + '">' + (a.direcao === "coleta" ? "Coleta" : "Entrega") + "</span><small>" + esc(a.destino) + " · " + esc(String(Number(a.km || 0) * 2).replace(".", ",")) + " km ida e volta</small></td>" +
          '<td class="num">' + esc(m3(a.m3)) + "</td>" +
          '<td class="num"><strong>' + brl(a.valor) + "</strong></td>" +
          "<td>" + sit + "</td><td class=\"fr-acoes\">" + acao + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
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
      const aba = e.target.closest(".fr-abas [data-aba]"); if (aba) { S.aba = aba.dataset.aba; return pintar(); }
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
    if (new URLSearchParams(location.search).get("aba") === "fretes") S.aba = "fretes";
    if(integrado){
      document.documentElement.classList.add('fr-integrado');
      document.querySelectorAll('.header-list,.fr-abas,.cf-barra>a').forEach(el=>el.style.setProperty('display','none','important'));
      const style=document.createElement('style');style.textContent='.fr-integrado .header-list,.fr-integrado .fr-abas,.fr-integrado .cf-barra>a{display:none!important}.fr-integrado .cf-page{padding:8px 12px!important}.fr-integrado .cf-barra{margin-bottom:6px}.fr-integrado .cf-vazio{padding:16px}.fr-integrado body{min-height:0!important}';document.head.append(style);
    }
    ligar();
    try { await carregar(); } catch (e) { $("frConteudo").innerHTML = '<div class="cf-vazio">' + esc(e.message) + "</div>"; }
  }
  iniciar();
})();
