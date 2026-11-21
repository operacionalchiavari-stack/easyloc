// Etapa 6: vencimentos realistas nas parcelas em aberto dos pedidos futuros, pela TELA do pedido (etapa Financeiro e
// pagamentos): locação até 15 dias antes do evento (nunca antes de amanhã), frete e montagem 2 dias antes. Parcelas já pagas
// ficam como estão (a tela trava). Salva o pedido como no dia a dia.
const C = require("./comum.cjs");
const { abrirNavegador } = require("./navegador.cjs");

(async () => {
  const E = C.lerEstado();
  E.vencimentos ||= {};
  const { sessao } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const nav = await abrirNavegador(sessao);
  const so = process.argv.slice(2);
  try {
    for (const [k, p] of Object.entries(E.pedidos)) {
      if ((so.length && !so.includes(k)) || E.vencimentos[k] || p.cancelar) continue;
      const ped = C.check(await C.admin.from("separacoes_pedidos").select("data_evento,status_comercial").eq("id", p.id).single());
      if (ped.data_evento <= C.dia(2)) continue;   // eventos desta semana e passados ficam como estão
      const amanha = C.dia(1);
      const menos = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
      const alvo = { locacao: [menos(ped.data_evento, 15), amanha].sort().pop(), frete: menos(ped.data_evento, 2), montagem: menos(ped.data_evento, 2) };
      const pg = await nav.abrir("Modulos/Comercial/Pedidos/pedido.html?pedido=" + p.id + "&modo=editar");
      try {
        await pg.waitForFunction(() => window.__PEDIDO_ATUAL_ID && document.querySelector(".comercial-trilha [data-etapa=financeiro]"), null, { timeout: 90000 });
        await pg.waitForTimeout(4000);
        await pg.click(".comercial-trilha [data-etapa=financeiro]");
        await pg.waitForSelector("#cronogramaParcelas tr.pg-linha", { timeout: 40000 });
        await pg.waitForTimeout(2500);
        const mudou = await pg.evaluate((alvo) => {
          let n = 0;
          document.querySelectorAll("#cronogramaParcelas tr.pg-linha").forEach((tr) => {
            const v = tr.querySelector(".pg-vencimento"); const c = tr.dataset.componente;
            if (!v || v.disabled || v.readOnly || !alvo[c] || v.value === alvo[c]) return;
            v.value = alvo[c]; v.dispatchEvent(new Event("input", { bubbles: true })); v.dispatchEvent(new Event("change", { bubbles: true })); n++;
          });
          return n;
        }, alvo);
        if (mudou) {
          await pg.waitForTimeout(800);
          await pg.evaluate(() => { window.__alertas = []; const o = window.alerta; window.alerta = (...a) => { window.__alertas.push(a.slice(0, 2).join(" · ")); return o?.(...a); }; });
          await pg.click(".ct-avancar");
          await pg.waitForTimeout(6000);
          const avisos = await pg.evaluate(() => (window.__alertas || []).join(" / "));
          if (/erro|não foi|Não foi|Informe/i.test(avisos)) throw Error(avisos);
        }
        E.vencimentos[k] = true; C.gravarEstado({ vencimentos: { [k]: true } });
        console.log(`ok - ${k} pedido ${p.numero}: ${mudou} parcela(s) com novo vencimento`);
      } catch (e) { console.log(`FALHOU ${k}: ${e.message.split("\n")[0]}`); }
      finally { await pg.close(); }
    }
  } finally { await nav.browser.close(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
