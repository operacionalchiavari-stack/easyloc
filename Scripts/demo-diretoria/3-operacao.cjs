// Etapa 3: a operação dos pedidos já criados, pelas mesmas funções das telas.
// recebimentos (Financeiro) → escala (Painel Logístico) → triagem "1 clique" (tela da Triagem) → carregamento por quantidade
// (Conferência) → montagem e desmontagem pelo App do Montador (login do montador com CPF + PIN) → entrega e coleta confirmadas →
// descarregamento → triagem da volta → posição final (Financeiro) → ligação de pós-venda.
// Uso: node Scripts/demo-diretoria/3-operacao.cjs [P1 P2 ...]
const C = require("./comum.cjs");
const { abrirNavegador } = require("./navegador.cjs");
const { chromium } = require("playwright");

const RANK = { triagem: 1, separado: 2, carregado: 3, montado: 4, coletado: 5, volta: 6, posicao: 7, fechado: 8 };
const log = (m) => console.log(m);

(async () => {
  const E = C.lerEstado();
  E.operacao ||= {};
  const so = process.argv.slice(2);
  const { client: sb, sessao } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const rpc = async (nome, args) => { const { data, error } = await sb.rpc(nome, args); if (error) throw Error(nome + ": " + error.message); return data; };
  const nav = await abrirNavegador(sessao);
  const browser = await chromium.launch({ channel: "msedge" });
  const fotoEquipe = "data:image/jpeg;base64," + (await C.fotoFicticia(browser, { tipo: "equipe", seed: "equipe" })).toString("base64");
  const fotoPapel = "data:image/jpeg;base64," + (await C.fotoFicticia(browser, { tipo: "papel", seed: "lista" })).toString("base64");
  await browser.close();
  const frota = C.check(await sb.from("caminhoes").select("id,codigo,capacidade_m3").eq("empresa_id", C.EMPRESA));
  const cam = (cod) => frota.find((c) => c.codigo === cod);
  const fin = C.check(await C.admin.from("empresa_financeiro").select("baixa_manual_receber").eq("empresa_id", C.EMPRESA).single());
  const conta = (C.check(await sb.from("fin_config").select("conta_locacao").eq("empresa_id", C.EMPRESA).maybeSingle()) || {}).conta_locacao;
  // App do Montador logado como o montador líder
  const app = await nav.abrir("Modulos/Chiavari/Cronograma/montador.html");
  await app.waitForFunction(() => window.ACERVO_LOCAL && window.ACERVO_LOCAL.MONT_login, null, { timeout: 60000 });
  const lider = E.equipe["Rodrigo Teixeira"];
  const tok = (await app.evaluate(([c, p]) => window.ACERVO_LOCAL.MONT_login(c, p), [lider.cpf, lider.pin])).token;
  await app.evaluate((t) => localStorage.setItem("montadorToken", t), tok);
  const L = (fn, ...args) => app.evaluate(([fn, args]) => window.ACERVO_LOCAL[fn](...args), [fn, args]);

  // recebimentos pela baixa do Financeiro (opção "baixa manual" ligada só durante a carga e desligada no fim)
  if (!fin.baixa_manual_receber) C.check(await C.admin.from("empresa_financeiro").update({ baixa_manual_receber: true }).eq("empresa_id", C.EMPRESA));
  try {
    const ordem = Object.entries(E.pedidos).filter(([k, p]) => (!so.length || so.includes(k)));
    for (const [k, p] of ordem) {
      const alvo = RANK[p.etapa] || 0;
      const feito = E.operacao[k] || 0;
      const ped = C.check(await C.admin.from("separacoes_pedidos").select("*").eq("id", p.id).single());
      const nome = `${k} · pedido ${ped.numero_pedido} · ${ped.cliente_nome}`;
      const marcar = (r) => { E.operacao[k] = r; C.gravarEstado({ operacao: { [k]: r } }); };
      try {
        /* recebimentos: eventos que já saíram pagos (com parcelas em aberto em alguns), futuros com o sinal */
        if (!E.operacao[k + ":pago"] && ped.status_comercial === "aprovado") {
          const titulos = C.check(await sb.from("fin_receber").select("id,componente,parcela,valor,aberto,vencimento,status").eq("pedido_id", p.id).neq("status", "cancelado").order("vencimento"));
          const ev = ped.data_evento;
          const pagar = titulos.filter((t) => {
            if (alvo >= 3) return !(k === "P3" && t.componente === "frete") && !(["P5", "P6"].includes(k) && t.componente === "montagem");
            if (alvo >= 1) return t.componente === "locacao";
            return ["P9", "P12", "P13"].includes(k) && t.componente === "locacao";
          });
          for (const [i, t] of pagar.entries()) {
            const d = new Date(Math.min(Date.now() - 3600e3 * 3, new Date(ev + "T12:00:00").getTime() - (12 - i * 4) * 864e5)).toISOString().slice(0, 10);
            await rpc("fin_baixar", { p_empresa: C.EMPRESA, p_tipo: "receber", p_id: t.id, p_data: d, p_valor: Number(t.aberto ?? t.valor), p_juros: 0, p_multa: 0, p_desconto: 0, p_tarifa: 0, p_conta: conta, p_forma: i === 0 ? "pix" : "boleto", p_obs: i === 0 ? "Sinal recebido por PIX" : "Boleto compensado" });
          }
          E.operacao[k + ":pago"] = true; C.gravarEstado({ operacao: { [k + ":pago"]: true } });
          if (pagar.length) log(`ok - ${nome}: ${pagar.length} recebimento(s)`);
        }
        if (!alvo || feito >= alvo) continue;
        const etapas = C.check(await sb.from("operacao_etapas").select("id,tipo,data,hora").eq("pedido_id", p.id));
        const et = (t) => etapas.find((e) => e.tipo === t);
        const caminhao = Number(ped.valor_total) > 8000 ? cam("G") || frota[0] : cam("M") || frota[0];

        /* escala (Painel Logístico): responsável, equipe e caminhão */
        if (feito < 1) {
          const escala = [["triagem_ida", "Camila Rocha", [], []], ["carregamento", "Thiago Moura", [], [caminhao.codigo]], ["montagem", "Rodrigo Teixeira", ["Felipe Andrade"], [caminhao.codigo]],
            ["desmontagem", "Rodrigo Teixeira", ["Felipe Andrade"], [caminhao.codigo]], ["descarregamento", "Thiago Moura", [], [caminhao.codigo]], ["triagem_volta", "Camila Rocha", [], []]];
          for (const [tipo, resp, equipe, cams] of escala) if (et(tipo)) await rpc("operacao_escala_salvar", { p_etapa: et(tipo).id, p_responsavel: resp, p_equipe: equipe, p_caminhoes: cams, p_forcar: true });
          marcar(1);
        }
        /* triagem (tela da Triagem, modo "1 clique") */
        if (alvo >= 2 && (E.operacao[k] || 0) < 2) {
          const sep = await nav.abrir("Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=" + p.id + "&etapa=ida");
          await sep.waitForSelector("#separacaoModoModal:not(.hidden)", { timeout: 60000 });
          await sep.click('[data-separacao-modo="um-clique"]');
          await sep.waitForSelector("#btnConfirmarUmCliqueSeparacao", { state: "visible", timeout: 20000 });
          await sep.click("#btnConfirmarUmCliqueSeparacao");
          let st; for (let i = 0; i < 40; i++) { await sep.waitForTimeout(500); st = C.check(await C.admin.from("separacoes_pedidos").select("status").eq("id", p.id).single()).status; if (st === "separado") break; }
          await sep.close();
          if (st !== "separado") throw Error("triagem não concluiu (" + st + ")");
          marcar(2); log(`ok - ${nome}: triagem concluída`);
        }
        /* carregamento conferido por quantidade */
        const conferir = async (etapa, grupo) => {
          await rpc("operacao_iniciar_conferencia", { p_pedido: p.id, p_etapa: etapa });
          const pecas = await rpc("operacao_conferencia_pecas", { p_pedido: p.id, p_grupo: grupo });
          const q = {}; for (const x of pecas) q[x.chave || `${x.linha_id || x.linha}|${x.item_id}`] = Number(x.esperado ?? x.quantidade ?? 0);
          if (etapa === "carregamento") await rpc("operacao_registrar_caminhoes", { p_pedido: p.id, p_caminhoes: [caminhao.id] });
          if (etapa === "retorno") return rpc("operacao_concluir_retorno_avarias", { p_pedido: p.id, p_etapa: etapa, p_aceitar_faltas: false, p_quantidades: q, p_observacoes: {}, p_primeira: null, p_danificados: {}, p_fotos: {}, p_setores: {} });
          return rpc("operacao_concluir_conferencia", { p_pedido: p.id, p_etapa: etapa, p_aceitar_faltas: false, p_quantidades: q, p_observacoes: {}, p_primeira: null });
        };
        if (alvo >= 3 && (E.operacao[k] || 0) < 3) { await conferir("carregamento", false); marcar(3); log(`ok - ${nome}: carregado no caminhão ${caminhao.codigo}`); }
        /* montagem pelo App do Montador + entrega confirmada */
        const local = C.check(await sb.from("locais_empresas").select("latitude,longitude").eq("id", ped.local_id).single());
        const fotosItens = C.check(await sb.from("itens").select("foto_url").in("id", (C.check(await sb.from("separacoes_itens").select("item_id").eq("separacao_pedido_id", p.id))).map((x) => x.item_id)).not("foto_url", "is", null)).map((x) => x.foto_url).slice(0, 3);
        const confirmar = async (etapa) => {
          const base = await rpc("logistica_confirmacao_base", { p_pedido: p.id, p_etapa: etapa });
          const itens = (base.itens || []).map((x) => etapa === "entrega" ? { chave: x.chave, entregue: Number(x.previsto), voltou_antes: 0, retirado_lista: 0, motivo_id: null, observacao: "" }
            : { chave: x.chave, coletado: Number(x.previsto), danificado: 0, retirado_lista: 0, motivo_id: null, observacao: "" });
          await rpc("logistica_confirmacao_salvar", { p_pedido: p.id, p_etapa: etapa, p_token: base.token, p_itens: itens, p_responsavel: "Rodrigo Teixeira", p_observacao: "" });
        };
        if (alvo >= 4 && (E.operacao[k] || 0) < 4) {
          const m = et("montagem");
          const ap = await L("MONT_iniciarApontamento", tok, m.id);
          await L("salvarEquipeTerceirizada", { idCronograma: m.id, foto: fotoEquipe, latitude: local.latitude, longitude: local.longitude, precisaoGPS: 12, quantidade: 2 });
          await L("salvarSacolasProtecao", { idCronograma: m.id, sacolas: [{ codigo: "SAC-" + ped.numero_pedido + "-1", foto: fotoPapel }] });
          await L("salvarPosicionamentoItens", { idCronograma: m.id, fotos: fotosItens.length ? fotosItens : [fotoEquipe], observacao: "Móveis posicionados conforme a planta da decoradora.", correto: true });
          await L("salvarListaAssinada", { idCronograma: m.id, nome: "Recebido pela cerimonialista", foto: fotoPapel });
          await L("MONT_finalizarApontamento", tok, ap.id);
          await confirmar("entrega");
          marcar(4); log(`ok - ${nome}: montado (App do Montador) e entrega confirmada`);
        }
        if (alvo >= 5 && (E.operacao[k] || 0) < 5) {
          const d = et("desmontagem");
          const ap = await L("MONT_iniciarApontamento", tok, d.id);
          await L("salvarEquipeTerceirizada", { idCronograma: d.id, foto: fotoEquipe, latitude: local.latitude, longitude: local.longitude, precisaoGPS: 15, quantidade: 2 });
          await L("salvarListaConferidaDesmontagem", { idCronograma: d.id, fotos: [fotoPapel] });
          const cont = await L("MONT_contagemItens", tok, d.id);
          const q = {}; for (const it of cont.itens || []) q[it.chave] = it.esperado;
          await L("MONT_contagemSalvar", tok, d.id, q);
          await L("concluirDesmontagem", { idCronograma: d.id });
          await L("MONT_finalizarApontamento", tok, ap.id);
          await confirmar("coleta");
          marcar(5); log(`ok - ${nome}: desmontado e coleta confirmada`);
        }
        if (alvo >= 6 && (E.operacao[k] || 0) < 6) { await conferir("descarregamento", true); marcar(6); log(`ok - ${nome}: descarregado no galpão`); }
        if (alvo >= 7 && (E.operacao[k] || 0) < 7) { await conferir("retorno", true); marcar(7); log(`ok - ${nome}: triagem da volta concluída`); }
        /* posição final (Financeiro) e ligação de pós-venda */
        if (alvo >= 8 && (E.operacao[k] || 0) < 8) {
          const b = await rpc("fin_posicao_final_base", { p_empresa: C.EMPRESA, p_pedido: p.id });
          const bv = b.bv && b.bv.aprovacao === "pendente" ? { decisao: "aprovar", desconto: 0, motivo: "" } : null;
          await rpc("fin_posicao_final_salvar", { p_empresa: C.EMPRESA, p_pedido: p.id, p_fonte: b.fonte, p_versao: b.salvo?.versao || 0, p_decisoes: [], p_confirmar: true, p_bv: bv });
          marcar(8); log(`ok - ${nome}: posição final confirmada${bv ? " (BV aprovado)" : ""}`);
        }
      } catch (e) { log(`PAROU ${nome}: ${e.message.split("\n")[0]}`); }
    }
    /* pós-venda: ligações geradas pela posição final; registra as dos 3 eventos mais antigos */
    try {
      const lista = await rpc("posvenda_lista", { p_empresa: C.EMPRESA });
      const perguntas = lista?.config?.perguntas || [];
      const demo = new Set(Object.values(E.pedidos).map((x) => x.id));
      const contatos = (lista?.contatos || lista?.ligacoes || []).filter((c) => ["pendente", "agendada", "aberta", "atrasada"].includes(c.status) || !c.status)
        .filter((c) => (c.pedidos || c.eventos || []).length && (c.pedidos || c.eventos).every((x) => demo.has(x.id || x.pedido_id)));
      for (const [i, c] of contatos.slice(0, 3).entries()) {
        const resp = {};
        for (const pg of perguntas) {
          const ops = (pg.opcoes || []).map((o) => (typeof o === "string" ? { texto: o } : o));
          const boa = ops.filter((o) => !o.ruim), ruim = ops.filter((o) => o.ruim);
          const esc = i === 1 && ruim.length && /coleta|pontual|hor/i.test(pg.texto) ? ruim[0] : boa[0] || ops[0];
          resp[pg.id] = pg.tipo === "multipla" ? [esc?.id].filter(Boolean) : esc?.id || null;
        }
        await rpc("posvenda_registrar", { p_empresa: C.EMPRESA, p_contato: c.id, p_acao: "concluir", p_respostas: resp,
          p_observacao: ["Cliente adorou as poltronas e o lounge; pediu o catálogo de Natal.", "Elogiou a equipe, mas a coleta atrasou 1 hora e o salão cobrou hora extra.", "Tudo certo. Já quer reservar para o aniversário de 15 anos em março."][i], p_motivo: null });
        log("ok - ligação de pós-venda registrada: " + (c.cliente_nome || c.cliente || c.id));
      }
    } catch (e) { log("PAROU pós-venda: " + e.message); }
  } finally {
    if (!fin.baixa_manual_receber) C.check(await C.admin.from("empresa_financeiro").update({ baixa_manual_receber: false }).eq("empresa_id", C.EMPRESA));
    if (nav.erros.length) log("Erros de tela: " + [...new Set(nav.erros)].slice(0, 8).join(" | "));
    await nav.browser.close();
  }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
