/* Parâmetros > Recursos humanos > "Central de Metas" (nov/2026). Antes estes números ficavam nas planilhas do Google
   (abas Comissão, Comissão O.S e Metas do RH); agora ficam em central_config, lidos e gravados pela Edge Function
   central-metas (a mesma que calcula o bônus). Metas por setor continuam no botão "Editar metas" da Central. */
(function () {
  "use strict";
  var URL_FN = "https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/central-metas";
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var RH = [["atraso", "Atrasos"], ["semUniforme", "Sem uniforme"], ["semEpi", "Sem EPI"], ["usoCelular", "Uso de celular"], ["falta", "Faltas"], ["advertencia", "Advertências"], ["ausenciaJornada", "Ausência de jornada"]];
  async function chamar(fn, args) {
    var ctx = await window.aguardarContexto();
    var s = await window.supabaseClient.auth.getSession();
    var r = await fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: "sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ",
      Authorization: "Bearer " + (s.data.session ? s.data.session.access_token : "") }, body: JSON.stringify({ fn: fn, args: args || [], empresa_id: ctx.empresa_id }) });
    var j = await r.json().catch(function () { return { error: "Falha de conexão." }; });
    if (j.error) throw new Error(j.error);
    return j.resultado;
  }
  var campo = function (nome, rotulo, valor, ajuda) {
    return '<label class="pr-campo">' + esc(rotulo) + '<input name="' + esc(nome) + '" type="number" min="0" step="0.01" value="' + esc(valor) + '">' + (ajuda ? "<small>" + esc(ajuda) + "</small>" : "") + "</label>";
  };
  async function montar(host) {
    var card = document.createElement("section");
    card.className = "pr-card"; card.id = "prCardCentralMetas";
    card.innerHTML = "<h3>Central de Metas</h3><p class=\"pr-ajuda\">Carregando…</p>";
    host.append(card);
    try {
      var c = await chamar("centralConfigObter");
      card.innerHTML = "<h3>Central de Metas</h3>"
        + '<p class="pr-ajuda">Percentuais usados no bônus do Departamento de Manutenção, metas individuais do RH (quantas ocorrências no mês a pessoa pode ter) e as metas do almoxarifado. As metas de produção, qualidade, prazo e tempo de cada setor ficam em "Editar metas", na própria Central.</p>'
        + '<form><h4 class="pr-sub">Comissão dos eventos (% sobre a locação × nota de complexidade)</h4><div class="pr-grade">'
        + campo("estofados", "Estofados (%)", c.comissoes.estofados) + campo("pintura", "Pintura / estrutura (%)", c.comissoes.pintura)
        + campo("supervisao", "Supervisor de manutenção (% sobre o bônus pago à equipe)", c.comissoes.supervisao) + "</div>"
        + '<h4 class="pr-sub">Comissão das O.S concluídas (% sobre o valor de reposição)</h4><div class="pr-grade">'
        + c.setores.map(function (s) { return campo("os:" + s, s + " (%)", (c.comissoes.os || {})[s] || 0); }).join("") + "</div>"
        + '<h4 class="pr-sub">Metas individuais do RH (máximo de ocorrências no mês)</h4><div class="pr-grade">'
        + RH.map(function (t) { return campo("rh:" + t[0], t[1], c.metasRH[t[0]] || 0); }).join("") + "</div>"
        + '<h4 class="pr-sub">Almoxarifado</h4><div class="pr-grade">'
        + campo("metaContagem", "Contagem mensal mínima (% dos materiais)", c.almoxarifado.metaContagem)
        + campo("metaAssertividade", "Assertividade mínima da contagem (%)", c.almoxarifado.metaAssertividade)
        + campo("percentualBonus", "Bônus do almoxarifado (% da economia no teto de gastos)", c.almoxarifado.percentualBonus) + "</div>"
        + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span><button type="submit" class="btn primary">Salvar Central de Metas</button></div></form>';
      var f = card.querySelector("form"), status = f.querySelector("[role=status]");
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        var b = f.querySelector("[type=submit]"); b.disabled = true; status.textContent = "Salvando…";
        var v = function (n) { return f.elements[n].value; };
        try {
          var os = {}; c.setores.forEach(function (s) { os[s] = v("os:" + s); });
          var metasRH = {}; RH.forEach(function (t) { metasRH[t[0]] = v("rh:" + t[0]); });
          await chamar("centralConfigSalvar", [{ comissoes: { estofados: v("estofados"), pintura: v("pintura"), supervisao: v("supervisao"), os: os }, metasRH: metasRH,
            almoxarifado: { metaContagem: v("metaContagem"), metaAssertividade: v("metaAssertividade"), percentualBonus: v("percentualBonus") } }]);
          status.textContent = "Central de Metas salva.";
        } catch (err) { status.textContent = err.message; } finally { b.disabled = false; }
      });
    } catch (e) { card.querySelector("p").textContent = "Não foi possível carregar: " + e.message; }
  }
  var host = document.getElementById("pr-painel-rh");
  if (!host) return;
  var tentar = function () {
    if (document.getElementById("prCardCentralMetas")) return true;
    if (host.querySelector(".pr-card, form")) { montar(host); return true; }
    return false;
  };
  // O painel do RH pode ser redesenhado (parametros-rh.js troca o conteúdo): o observador continua e põe o card de volta.
  tentar(); new MutationObserver(tentar).observe(host, { childList: true });
})();
