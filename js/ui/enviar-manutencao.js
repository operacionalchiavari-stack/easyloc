/* Peça danificada achada no depósito, sem pedido: conversa com o Marcos da manutenção (22/11/2026).
   A pessoa manda a foto (obrigatória: é ela que aparece na O.S), o Marcos descreve o dano, descobre o item, a quantidade,
   onde estava e o setor (Edge Function avaria-setor, modo "avulsa"), mostra o resumo e, com o "Está certo", a tela grava
   pela RPC acervo_avaria_avulsa: a peça sai do disponível e a O.S abre no setor.
   EasyLocEnviarManutencao.abrir({ sb, empresa, ctx? }) -> abre a conversa (usa EasyLocAssistenteSolicitacao). */
(function () {
  "use strict";
  function separarNome(t) {
    const s = String(t || ""), i = s.search(/\((?:L|A|P)\)\s*\d/i);
    return i < 0 ? [s, ""] : [s.slice(0, i).trim(), s.slice(i).trim()];
  }

  async function abrir(cfg) {
    const chat = window.EasyLocAssistenteSolicitacao;
    if (!chat) { window.alerta?.("A conversa com o Marcos não carregou. Recarregue a página.", "Manutenção", "erro"); return; }
    const sb = cfg.sb || window.supabaseClient, empresa = cfg.empresa;
    let ctx = cfg.ctx;
    if (!ctx) {
      try { ctx = await window.aguardarContexto?.(); } catch (_) { ctx = null; }
      if (!ctx?.empresa_id) {
        const u = (await sb.auth.getUser()).data?.user;
        ctx = { empresa_id: empresa, usuario_id: u?.id, usuario_nome: u?.user_metadata?.nome || "" };
      }
    }
    ctx = { ...ctx, empresa_id: empresa || ctx.empresa_id };
    return chat.abrir({
      tipo: "manutencao",
      chave: "peca-deposito",
      funcao: "avaria-setor",
      dados: { modo: "avulsa" },
      ctx,
      titulo: "Peça danificada no depósito",
      assistente: "Marcos",
      placeholder: "Tire a foto da peça ou escreva aqui…",
      rotuloConfirmacao: "Está certo, mandar para o setor",
      rotuloNova: "Enviar outra peça",
      saudacao: (nome) => (nome ? "Oi, " + nome + "! " : "Oi! ") +
        "Achou uma peça danificada? Me manda uma foto dela mostrando o dano, de perto (toque na câmera aqui embaixo). Eu vejo o que aconteceu e mando para o setor certo.",
      resumoHtml: (r, esc) => {
        const [nome, med] = separarNome(r.item_nome);
        const q = Number(r.quantidade) || 1;
        return '<div class="emc">' +
          '<div class="emc-item">' + (/^https?:/.test(r.item_foto || "") ? '<img src="' + esc(r.item_foto) + '" alt="">' : '<span class="emc-sem"></span>') +
          '<div><b>' + esc(nome) + '</b><small>' + esc([med, r.item_codigo].filter(Boolean).join(" · ")) + '</small></div></div>' +
          '<div class="emc-dano"><span>O que o Marcos viu</span><p>' + esc(r.dano) + '</p></div>' +
          '<div class="emc-chips"><span><i>Quantidade</i>' + q + ' peça' + (q === 1 ? '' : 's') + '</span>' +
          '<span><i>Onde estava</i>' + esc(r.local || "Não informado") + '</span></div>' +
          '<div class="emc-destino"><span class="emc-seta" aria-hidden="true">→</span><div><i>Vai para</i><b>' + esc(r.setor) + '</b>' +
          (r.justificativa ? '<p>' + esc(r.justificativa) + '</p>' : '') + '</div></div></div>';
      },
      confirmar: async (r, fotos) => {
        if (!fotos.length) throw new Error("Mande pelo menos uma foto da peça danificada");
        const { data, error } = await sb.rpc("acervo_avaria_avulsa", {
          p_empresa: ctx.empresa_id, p_item: r.item_id, p_quantidade: r.quantidade, p_descricao: r.dano,
          p_setor: r.setor, p_fotos: fotos, p_local: r.local || null,
        });
        if (error) throw new Error(error.message);
        cfg.aoEnviar?.(data);
        return "Pronto! Abri a O.S " + data.os_numero + " em " + data.setor + " com a foto. A peça já saiu do disponível.";
      },
    });
  }
  window.EasyLocEnviarManutencao = { abrir };
})();
