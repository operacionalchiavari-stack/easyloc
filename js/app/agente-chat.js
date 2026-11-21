/* Conversa com os agentes de IA no app (20/11/2026). Pedido do usuário: "refaça todos os chats de todos os agentes e deixe
   todos iguais… o chat quero um chat comum mesmo; os relatórios podem ser um botão discreto".
   Uma tela só (Modulos/Gestao/AgentesApp/agente.html?ag=…) para Clara, Cora, Carla, Marcos e a assistente da Ideia
   Premiada: cada agente só muda o servidor que responde (as mesmas Edge Functions das telas do computador) e o que acontece
   no fim (Carla/Marcos/Ideia mostram o resumo e registram pela mesma RPC do sistema). A Helena tem motor próprio (catálogo,
   pedido, 3D) e usa o mesmo visual por CSS (styles/app-agente.css, body.catalogo-equipe-helena).
   Áudio: gravado no celular e transcrito pela função solicitacao-assistente (transcrever). Fotos: Carla e Marcos. */
(function(){
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sb = window.supabaseClient;
  const S = { ag: null, ctx: {}, msgs: [], ocupado: "", gravador: null, pedacos: [], inicio: 0, relogio: 0, cancelada: false };
  const brl = (v) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const curto = (v) => { const a = Math.abs(Number(v) || 0), s = v < 0 ? "−" : ""; return s + (a >= 1e6 ? (a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : a >= 1e3 ? Math.round(a / 1e3).toLocaleString("pt-BR") + " mil" : Math.round(a).toLocaleString("pt-BR")); };
  const diaBr = (v) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

  async function chamar(fn, corpo){
    const { data, error } = await sb.functions.invoke(fn, { body: { empresa_id: S.ctx.empresa, ...corpo } });
    let erro = data && data.erro || "";
    if(error && !erro){ try{ const j = await error.context?.json?.(); erro = j?.erro || j?.error || error.message; }catch(_){ erro = error.message; } }
    if(erro) throw new Error(erro);
    return data || {};
  }
  const historico = (n) => S.msgs.filter((m) => (m.papel === "pessoa" || m.papel === "ia") && !m.erro && !m.provisorio && !m.tipo && !m.relatorio).slice(-(n || 24));

  /* ---------- os agentes ---------- */
  const PRIOR = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
  const CATEG = { hidraulica: "Hidráulica", eletrica: "Elétrica", alvenaria: "Alvenaria", pintura: "Pintura", portas_janelas: "Portas e janelas", climatizacao: "Climatização", outros: "Outro serviço" };
  const solicitacao = (tipo) => async () => {
    const r = await chamar("solicitacao-assistente", { acao: "conversar", tipo, mensagens: historico().map((m) => ({ papel: m.papel, texto: m.texto || "", ...(m.fotos ? { fotos: m.fotos } : {}) })) });
    return { texto: r.resposta, resumo: r.pronto && r.resumo ? r.resumo : null };
  };
  async function ligarFotos(tipo, id, fotos){
    if(!fotos.length || !id) return;
    const { error } = await sb.rpc("solicitacao_evidencias_salvar", { p_empresa: S.ctx.empresa, p_tipo: tipo, p_id: id, p_fotos: fotos });
    if(error) console.warn("[agente] fotos não ligadas:", error.message);
  }
  const campo = (t, v, inteira) => '<div class="ag-res-campo' + (inteira ? " inteira" : "") + '"><span>' + esc(t) + '</span><p>' + v + '</p></div>';
  const AGENTES = {
    clara: { nome: "Clara", papel: "Financeiro", inicial: "C", cor: "#2a78d6",
      intro: "Sou a diretora financeira. Pergunte sobre caixa, contas a receber e a pagar, resultado, lucro dos eventos ou faça uma simulação.",
      sugestoes: ["Como está o caixa para os próximos 30 dias?", "Quem eu devo cobrar primeiro?", "O que mais pesou nas despesas este mês?", "E se eu der 10% de desconto nos próximos eventos?"],
      relatorios: [
        ["Diagnóstico financeiro do mês", "Faça um diagnóstico financeiro completo da empresa como CFO: caixa e cobertura, resultado dos últimos meses, inadimplência, prazos de recebimento e pagamento, lucro dos eventos, dependência de clientes e o que eu deveria fazer agora. Traga as provas."],
        ["Projeção de caixa 90 dias", "Analise a projeção de caixa dos próximos 90 dias (real e com as pré-reservas). Quando o caixa aperta, qual o menor saldo e o que fazer antes disso? Traga as provas."],
        ["Inadimplência e prazos", "Analise a inadimplência por idade e os prazos médios de recebimento e pagamento (ciclo de caixa). Quem devo cobrar primeiro e quanto isso libera de caixa? Traga as provas."],
        ["Lucro dos eventos", "Analise o lucro por evento (receita x custos lançados). Onde estamos perdendo margem e o que pode estar causando? Traga as provas."],
        ["Para onde vai o dinheiro", "Analise as despesas dos últimos 90 dias por categoria e as despesas fixas. O que está pesando, o que é anormal e onde dá para economizar? Traga as provas."],
        ["Dependência de clientes", "Analise a concentração de faturamento por cliente (decorador) nos últimos 12 meses. Qual o risco e como reduzir essa dependência? Traga as provas."],
      ].map(([t, p]) => ({ t, p })),
      async conversar(){
        const r = await chamar("financeiro-assistente", { action: "conversar", mensagens: historico(30).map((m) => ({ role: m.papel === "ia" ? "assistant" : "user", content: m.texto || "" })) });
        return { texto: r.resposta, evidencias: r.evidencias || [] };
      } },
    cora: { nome: "Cora", papel: "Estoque e acervo", inicial: "C", cor: "#1baf7a",
      intro: "Cuido para que todo o material esteja pronto e em condições no dia de cada evento. Pergunte sobre as próximas saídas, manutenção, contagens e proteção.",
      sugestoes: ["O que pode faltar no próximo sábado?", "Quais peças em manutenção fazem falta esta semana?", "O que a triagem deve priorizar hoje?", "Quais itens mais saem nos próximos 30 dias?"],
      relatorios: [
        { t: "Próximos 3 meses", d: 90, p: "Faça uma análise completa dos próximos 3 meses: em quais dias e com quais itens vamos ter falta ou pouca folga, o que depende de pré-reserva e o que precisa ser feito antes de cada evento." },
        { t: "Problemas das próximas 2 semanas", d: 14, p: "Quais problemas podem acontecer nas próximas 2 semanas? Organize por dia, do mais urgente para o menos urgente, com a solução de cada um." },
        { t: "Itens que mais saem", d: 90, p: "Quais itens estão saindo em maior quantidade nos próximos 90 dias (somando todos os pedidos)? Para os principais, diga se o estoque aguenta os dias de pico." },
        { t: "Manutenção que faz falta", d: 60, p: "Quais peças em manutenção, reparo ou fora do galpão fazem falta para eventos próximos? Diga o que precisa voltar até quando." },
        { t: "Contagens e divergências", d: 60, p: "Quais contagens pendentes e divergências estão travando itens que têm saída marcada? O que resolver primeiro?" },
        { t: "Capas e caixas", d: 60, p: "Para os próximos eventos, falta material de proteção (capas ou caixas)? Quais itens nem têm proteção cadastrada?" },
        { t: "Prioridades da triagem", d: 14, p: "O que a triagem deve priorizar nesta semana para todos os pedidos saírem completos e em condições?" },
      ],
      async conversar(){
        const r = await chamar("estoque-assistente", { acao: "conversar", dias: 90, mensagens: historico(20).map((m) => ({ papel: m.papel, texto: m.texto || "" })) });
        return { texto: r.resposta, itens: r.itens || [] };
      },
      async relatorio(rel){
        const r = await chamar("estoque-assistente", { acao: "relatorio", dias: rel.d, pedido: rel.p });
        return { relatorio: r.relatorio };
      } },
    carla: { nome: "Carla", papel: "Compras", inicial: "C", cor: "#eb6834", fotos: true,
      intro: "Me conta o que você está precisando e o que está acontecendo. Eu confiro se a compra é mesmo necessária e mando para Compras.",
      sugestoes: ["Preciso de material para um evento", "Uma ferramenta quebrou", "Preciso trocar meu EPI"],
      conversar: solicitacao("compra"),
      resumoHtml: (r) => '<h4>' + esc(r.descricao_item) + '</h4><div class="ag-res-grade">' +
        campo("Quantidade", esc(Number(r.quantidade).toLocaleString("pt-BR") + " " + (r.unidade || "un"))) + campo("Necessário até", esc(diaBr(r.data_necessidade) || "Sem data")) +
        campo("Para que vai usar", esc(r.motivo), true) + campo("Por que precisa comprar", esc(r.justificativa), true) +
        campo("Alternativas avaliadas", esc(r.alternativas || "Nenhuma"), true) + campo("Pedido / evento", esc(r.pedido || "Uso geral / estoque"), true) +
        (r.observacao ? campo("Observações", esc(r.observacao), true) : "") + '</div>',
      async confirmar(r, fotos){
        const obs = ["Para que: " + r.motivo, "Por que precisa: " + r.justificativa, "Alternativas avaliadas: " + (r.alternativas || "nenhuma"), "Pedido / evento: " + (r.pedido || "uso geral / estoque"), r.observacao, fotos.length ? "Fotos de evidência (" + fotos.length + "):\n" + fotos.join("\n") : "Sem foto de evidência"].filter(Boolean).join("\n");
        const { data, error } = await sb.rpc("compras_galpao", { p_empresa: S.ctx.empresa, p_acao: "criar", p_dados: { descricao_item: r.descricao_item, quantidade: r.quantidade, unidade: r.unidade || "un", data_necessidade: r.data_necessidade || "", produto_url: r.produto_url || "", observacao: obs, motivo: r.motivo || "", justificativa: r.justificativa || "", alternativas: r.alternativas || "", pedido: r.pedido || "", observacao_extra: r.observacao || "" } });
        if(error) throw new Error(error.message);
        await ligarFotos("compra", data?.id, fotos);
        return "Pronto! A solicitação " + (data?.numero ? "#" + data.numero + " " : "") + "foi enviada para Compras. Você acompanha a situação em Solicitação de compra, no sistema.";
      } },
    marcos: { nome: "Marcos", papel: "Manutenção", inicial: "M", cor: "#6250d6", fotos: true,
      intro: "Me conta o que está acontecendo e onde. Se puder, já manda uma foto. Eu abro a solicitação de manutenção com tudo certinho.",
      sugestoes: ["Tem um vazamento", "Uma tomada parou de funcionar", "A porta não fecha direito"],
      conversar: solicitacao("manutencao"),
      resumoHtml: (r) => '<h4>' + esc(r.titulo) + '</h4><div class="ag-res-grade">' +
        campo("Local", esc(r.local)) + campo("Tipo de serviço", esc(CATEG[r.categoria] || r.categoria)) +
        campo("Prioridade", '<span class="ag-selo ' + esc(r.prioridade) + '">' + esc(PRIOR[r.prioridade] || r.prioridade) + '</span>') + campo("Necessário até", esc(diaBr(r.necessario_ate) || "Sem prazo")) +
        campo("Descrição do problema", esc(r.descricao), true) + '</div>',
      async confirmar(r, fotos){
        const { data, error } = await sb.rpc("manutencao_predial_operar", { p_empresa: S.ctx.empresa, p_acao: "criar", p_dados: { titulo: r.titulo, local: r.local, categoria: r.categoria, prioridade: r.prioridade, necessario_ate: r.necessario_ate || "", descricao: r.descricao, token: crypto.randomUUID() } });
        if(error) throw new Error(error.message);
        await ligarFotos("manutencao", data?.id, fotos);
        return "Pronto! A solicitação de manutenção " + (data?.numero ? "#" + data.numero + " " : "") + "foi registrada. Você acompanha em Solicitação de manutenção, no sistema.";
      } },
    ideia: { nome: "Assistente da Ideia Premiada", curto: "Ideia Premiada", papel: "Ideias de melhoria", inicial: "I", cor: "#eda100",
      intro: "Que bom que você quer compartilhar uma ideia! Me conte o que você reparou que pode melhorar e como imagina a solução.",
      sugestoes: ["Tenho uma ideia para a montagem", "Uma ideia para economizar", "Uma ideia para o atendimento"],
      async conversar(){
        const r = await chamar("ideia-assistente", { acao: "conversar", mensagens: historico().map((m) => ({ papel: m.papel, texto: m.texto || "" })) });
        return { texto: r.resposta, resumo: r.pronto && r.resumo ? r.resumo : null };
      },
      resumoHtml: (r) => '<h4>' + esc(r.titulo) + '</h4><small class="ag-res-sub">' + esc(r.area) + '</small><div class="ag-res-grade">' +
        campo("O que pode melhorar", esc(r.problema), true) + campo("A ideia", esc(r.proposta), true) + campo("Os benefícios", esc(r.beneficio), true) + '</div>',
      textoConfirmar: "Está certo, enviar para o RH",
      async confirmar(r){
        const { error } = await sb.rpc("ideias_premiadas_enviar", { p_empresa: S.ctx.empresa, p_dados: r });
        if(error) throw new Error(error.message);
        return "Pronto! Sua ideia foi enviada para o RH. Obrigado por contribuir! Você acompanha a avaliação em Ideia Premiada, no sistema.";
      } },
  };

  /* ---------- desenho ---------- */
  function formatar(t){
    const linhas = esc(t).split(/\n/); let html = "", lista = "";
    const fecha = () => { if(lista){ html += "</" + lista + ">"; lista = ""; } };
    for(let l of linhas){
      l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\s*\(c\d+\)/g, "").replace(/\s+c\d+(?=[)\],.;:]|$)/g, "");
      let m;
      if((m = /^\s*#{1,4}\s+(.*)$/.exec(l))){ fecha(); html += "<h5>" + m[1] + "</h5>"; }
      else if((m = /^\s*[-•*]\s+(.*)$/.exec(l))){ if(lista !== "ul"){ fecha(); html += "<ul>"; lista = "ul"; } html += "<li>" + m[1] + "</li>"; }
      else if((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))){ if(lista !== "ol"){ fecha(); html += "<ol>"; lista = "ol"; } html += "<li>" + m[1] + "</li>"; }
      else if(!l.trim()){ /* linha vazia */ }
      else { fecha(); html += "<p>" + l + "</p>"; }
    }
    fecha(); return html;
  }
  const hora = (iso) => { try{ return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }catch(_){ return ""; } };
  const avatar = (grande) => '<span class="ag-avatar' + (grande ? " grande" : "") + '" aria-hidden="true" style="--ag-cor:' + S.ag.cor + '">' + esc(S.ag.inicial) + '</span>';

  // Cora: itens com foto
  const SIT = { falta: ["Falta", "ruim"], atencao: ["Atenção", "aviso"], ok: ["Em dia", "bom"] };
  const semMedida = (t) => String(t || "").split(" (L)")[0];
  function itensHtml(itens){
    if(!itens || !itens.length) return "";
    return '<div class="ag-itens">' + itens.map((i) => { const s = SIT[i.situacao] || SIT.atencao;
      return '<figure class="ag-item"><div class="ag-item-foto">' + (i.foto ? '<img src="' + esc(i.foto) + '" alt="" data-ag-zoom="' + esc(i.foto) + '">' : '<span aria-hidden="true">📦</span>') +
        '<span class="ag-pill ' + s[1] + '">' + s[0] + '</span></div><figcaption><b>' + esc(semMedida(i.nome)) + '</b>' + (i.comentario ? '<p>' + esc(i.comentario) + '</p>' : "") + '</figcaption></figure>'; }).join("") + '</div>';
  }
  // Clara: provas (números e gráficos simples, sem tabela)
  function valorU(v, u){ if(v == null || v === "") return "—"; if(u === "brl") return brl(v); if(u === "pct") return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"; if(u === "dias") return v + " dias"; if(u === "meses") return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " meses"; return typeof v === "number" ? v.toLocaleString("pt-BR") : esc(v); }
  function graficoProva(d){
    if(!d) return "";
    if(d.tipo === "kpis") return '<div class="ag-kpis">' + (d.itens || []).map((k) => '<div><small>' + esc(k.rotulo) + '</small><b>' + valorU(k.valor, k.unidade) + '</b></div>').join("") + '</div>';
    if(d.tipo === "tabela"){
      const linhas = (d.linhas || []).slice(0, 8);
      return '<ul class="ag-lista">' + linhas.map((l) => '<li><span>' + esc(l[0]) + '</span><b>' + l.slice(1).map((v, i) => { const f = (d.formatos || [])[i + 1]; return f && f !== "texto" ? valorU(v, f) : esc(v == null ? "—" : v); }).join(" · ") + '</b></li>').join("") + '</ul>';
    }
    const rot = d.rotulos || [], series = d.series || [], u = d.unidade;
    if(d.tipo === "barras_h"){
      const v = (series[0]?.valores || []).map(Number), mx = Math.max(1, ...v);
      return '<ul class="ag-rank">' + rot.slice(0, 8).map((r, i) => '<li><div><span>' + esc(r) + '</span><b>' + valorU(v[i], u) + '</b></div><i style="width:' + Math.max(2, v[i] / mx * 100) + '%"></i></li>').join("") + '</ul>';
    }
    const W = 320, H = 150, L = 38, B = 20, T = 8, todos = series.flatMap((s) => s.valores.map(Number)), max = Math.max(0, ...todos), min = Math.min(0, ...todos), faixa = (max - min) || 1, pw = W - L - 4, ph = H - B - T;
    const y = (v) => T + ph - ((Number(v) - min) / faixa) * ph, cores = ["#2a78d6", "#eb6834", "#1baf7a"];
    let s = [0, 0.5, 1].map((f) => { const t = min + f * faixa; return '<line x1="' + L + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="#ece8e1"/><text x="' + (L - 4) + '" y="' + (y(t) + 3) + '" text-anchor="end" class="ag-eixo">' + curto(t) + '</text>'; }).join("");
    const passo = Math.max(1, Math.ceil(rot.length / 6));
    if(d.tipo === "linha"){
      const x = (i) => L + (rot.length > 1 ? i / (rot.length - 1) * pw : pw / 2);
      s += series.map((se, k) => '<polyline fill="none" stroke="' + cores[k] + '" stroke-width="2" stroke-linejoin="round" points="' + se.valores.map((v, i) => x(i) + "," + y(v)).join(" ") + '"/>').join("");
      s += rot.map((r, i) => i % passo ? "" : '<text x="' + x(i) + '" y="' + (H - 5) + '" text-anchor="middle" class="ag-eixo">' + esc(r) + '</text>').join("");
    } else {
      const gw = pw / Math.max(1, rot.length), bw = Math.max(3, Math.min(18, (gw - 6) / Math.max(1, series.length) - 2));
      s += rot.map((r, i) => series.map((se, k) => { const v = Number(se.valores[i]) || 0, x0 = L + i * gw + (gw - series.length * (bw + 2)) / 2 + k * (bw + 2);
        return '<rect x="' + x0 + '" y="' + Math.min(y(0), y(v)) + '" width="' + bw + '" height="' + Math.max(1, Math.abs(y(v) - y(0))) + '" rx="3" fill="' + cores[k] + '"/>'; }).join("") +
        (i % passo ? "" : '<text x="' + (L + i * gw + gw / 2) + '" y="' + (H - 5) + '" text-anchor="middle" class="ag-eixo">' + esc(r) + '</text>')).join("");
    }
    const leg = series.length > 1 ? '<div class="ag-leg">' + series.map((se, k) => '<span><i style="background:' + cores[k] + '"></i>' + esc(se.nome) + '</span>').join("") + '</div>' : "";
    return leg + '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" class="ag-graf" role="img" aria-label="' + esc(series.map((x) => x.nome).join(", ")) + '">' + s + '</svg>';
  }
  function provasHtml(evs, i){
    if(!evs || !evs.length) return "";
    return '<details class="ag-provas"' + (S.msgs[i]?.abrirProvas ? " open" : "") + '><summary>Ver as provas (' + evs.length + ')</summary>' +
      evs.map((e) => '<article><h6>' + esc(e.titulo) + '</h6>' + (e.leitura ? '<p>' + esc(e.leitura) + '</p>' : "") + graficoProva(e.dados) + '</article>').join("") + '</details>';
  }
  function relatorioHtml(rel, i){
    if(!rel) return "";
    const itens = (rel.secoes || []).flatMap((s) => s.itens || []).slice(0, 6);
    return '<div class="ag-relatorio"><span class="ag-rel-kicker">Relatório</span><h4>' + esc(rel.titulo) + '</h4>' + (rel.resumo ? '<p>' + esc(rel.resumo) + '</p>' : "") +
      (rel.destaques?.length ? '<div class="ag-kpis">' + rel.destaques.map((x) => '<div><small>' + esc(x.rotulo) + '</small><b>' + esc(x.valor) + '</b></div>').join("") + '</div>' : "") +
      itensHtml(itens) + (rel.o_que_fazer?.length ? '<h5>O que fazer</h5><ol>' + rel.o_que_fazer.map((x) => '<li>' + esc(x) + '</li>').join("") + '</ol>' : "") +
      (window.AcervoCora?.abrirRelatorio ? '<button type="button" class="ag-btn-sec" data-ag-pdf="' + i + '">Abrir em PDF</button>' : "") + '</div>';
  }
  function bolha(m, i){
    if(m.tipo === "resumo"){
      return '<div class="ag-msg ia">' + avatar() + '<div class="ag-resumo' + (m.enviado ? " enviado" : "") + '"><span class="ag-rel-kicker">Confira antes de registrar</span>' + S.ag.resumoHtml(m.resumo) +
        (m.fotos?.length ? '<div class="ag-fotos">' + m.fotos.map((u) => '<img src="' + esc(u) + '" alt="" data-ag-zoom="' + esc(u) + '">').join("") + '</div>' : "") +
        (m.enviado ? '<p class="ag-ok">✓ Registrado</p>' : '<div class="ag-res-acoes"><button type="button" class="ag-btn-sec" data-ag-ajustar>Quero ajustar</button><button type="button" class="ag-btn" data-ag-confirmar>' + esc(S.ag.textoConfirmar || "Está certo, registrar") + '</button></div>') + '</div></div>';
    }
    if(m.tipo === "ok") return '<div class="ag-msg ia">' + avatar() + '<div class="ag-balao ag-balao-ok"><p>' + esc(m.texto) + '</p></div></div>';
    if(m.papel === "pessoa"){
      return '<div class="ag-msg eu"><div class="ag-balao">' + (m.audio ? '<span class="ag-audio">🎙 Áudio</span>' : "") +
        (m.fotos?.length ? '<div class="ag-fotos">' + m.fotos.map((u) => '<img src="' + esc(u) + '" alt="" data-ag-zoom="' + esc(u) + '">').join("") + '</div>' : "") +
        (m.rotulo ? '<p><b>Relatório:</b> ' + esc(m.rotulo) + '</p>' : m.texto ? '<p>' + esc(m.texto) + '</p>' : "") + '<time>' + hora(m.em) + '</time></div></div>';
    }
    return '<div class="ag-msg ia">' + avatar() + '<div class="ag-balao' + (m.erro ? " erro" : "") + '">' + (m.relatorio ? relatorioHtml(m.relatorio, i) : formatar(m.texto || "")) +
      itensHtml(m.itens) + provasHtml(m.evidencias, i) + '<time>' + hora(m.em) + '</time></div></div>';
  }
  function primeiroNome(){ return String(S.ctx.nome || "").trim().split(/\s+/)[0] || ""; }
  function boasVindas(){
    return '<div class="ag-boas">' + avatar(true) + '<h2>' + (primeiroNome() ? "Oi, " + esc(primeiroNome()) + "!" : "Oi!") + ' Eu sou ' + (S.ag.inicial === "M" ? "o " : "a ") + esc(S.ag.nome) + '.</h2>' +
      '<p>' + esc(S.ag.intro) + '</p><div class="ag-sugestoes">' + (S.ag.sugestoes || []).map((t) => '<button type="button" data-ag-sugestao>' + esc(t) + '</button>').join("") + '</div></div>';
  }
  function pintar(){
    const host = $("agMsgs");
    host.innerHTML = (S.msgs.length ? S.msgs.map(bolha).join("") : boasVindas()) +
      (S.ocupado ? '<div class="ag-msg ia">' + avatar() + '<div class="ag-balao ag-digitando"><i></i><i></i><i></i>' + (S.ocupado !== true ? '<small>' + esc(S.ocupado) + '</small>' : "") + '</div></div>' : "");
    requestAnimationFrame(() => { host.scrollTop = host.scrollHeight; });
    const travado = !!S.ocupado;
    $("agEnviar").disabled = travado; $("agMic").disabled = travado && !S.gravador; if($("agFoto")) $("agFoto").disabled = travado;
    $("agRelatorios") && ($("agRelatorios").disabled = travado);
    atualizarBotao();
  }
  function atualizarBotao(){ const vazio = !$("agTexto").value.trim(); $("agEnviar").hidden = vazio && !S.gravador; $("agMic").hidden = !vazio || !!S.gravador; }
  function guardar(){ try{ sessionStorage.setItem(S.chave, JSON.stringify(S.msgs.filter((m) => !m.provisorio).slice(-40))); }catch(_){ try{ sessionStorage.setItem(S.chave, JSON.stringify(S.msgs.slice(-20).map(({ evidencias, relatorio, ...m }) => m))); }catch(__){} } }

  /* ---------- conversa ---------- */
  async function enviar(texto, extra){
    texto = String(texto || "").trim();
    if((!texto && !extra?.fotos?.length) || S.ocupado) return;
    if(S.ag.resumoHtml){ S.msgs = S.msgs.filter((m) => m.tipo !== "resumo" || m.enviado); }
    S.msgs.push({ papel: "pessoa", texto, em: new Date().toISOString(), ...(extra || {}) });
    S.ocupado = true; guardar(); pintar();
    try{
      const r = await S.ag.conversar();
      S.msgs.push({ papel: "ia", texto: r.texto || "…", itens: r.itens, evidencias: r.evidencias, em: new Date().toISOString() });
      if(r.resumo) S.msgs.push({ tipo: "resumo", resumo: r.resumo, fotos: todasFotos() });
    }catch(e){ S.msgs.push({ papel: "ia", texto: "Não consegui responder agora (" + (e.message || e) + "). Pode mandar de novo?", erro: true, em: new Date().toISOString() }); }
    finally{ S.ocupado = ""; guardar(); pintar(); }
  }
  async function pedirRelatorio(rel){
    fecharSheet();
    if(S.ocupado) return;
    if(!S.ag.relatorio){ return enviar(rel.p, { rotulo: rel.t }); }
    S.msgs.push({ papel: "pessoa", texto: "Gerar o relatório: " + rel.t, em: new Date().toISOString() });
    S.ocupado = "montando o relatório…"; guardar(); pintar();
    try{ const r = await S.ag.relatorio(rel); S.msgs.push({ papel: "ia", relatorio: r.relatorio, em: new Date().toISOString() }); }
    catch(e){ S.msgs.push({ papel: "ia", texto: "Não consegui gerar o relatório agora (" + (e.message || e) + ").", erro: true, em: new Date().toISOString() }); }
    finally{ S.ocupado = ""; guardar(); pintar(); }
  }
  const todasFotos = () => S.msgs.flatMap((m) => (Array.isArray(m.fotos) && m.papel === "pessoa" ? m.fotos : [])).slice(0, 12);
  async function confirmar(){
    const m = [...S.msgs].reverse().find((x) => x.tipo === "resumo" && !x.enviado);
    if(!m || S.ocupado) return;
    S.ocupado = "registrando…"; pintar();
    try{ const ok = await S.ag.confirmar(m.resumo, todasFotos()); m.enviado = true; S.msgs.push({ tipo: "ok", texto: ok }); }
    catch(e){ S.msgs.push({ papel: "ia", texto: "Não consegui registrar agora (" + (e.message || e) + "). Tente de novo.", erro: true, em: new Date().toISOString() }); }
    finally{ S.ocupado = ""; guardar(); pintar(); }
  }
  function novaConversa(){
    if(S.ocupado) return;
    if(S.msgs.length && !confirm("Começar uma nova conversa? A conversa de agora some desta tela.")) return;
    if(S.gravador) cancelarGravacao();
    S.msgs = []; guardar(); pintar(); $("agTexto").focus();
  }

  /* ---------- áudio ---------- */
  async function gravar(){
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){ aviso("Este celular não grava áudio aqui. Escreva a mensagem."); return; }
    let stream; try{ stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }catch(_){ aviso("Permita o uso do microfone para mandar áudio."); return; }
    const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
    S.pedacos = []; S.cancelada = false; S.gravador = mr; S.inicio = Date.now();
    mr.ondataavailable = (e) => { if(e.data?.size) S.pedacos.push(e.data); };
    mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); clearInterval(S.relogio); S.gravador = null; document.body.classList.remove("ag-gravando");
      const blob = new Blob(S.pedacos, { type: mr.mimeType || "audio/webm" }); pintar(); if(!S.cancelada) transcrever(blob); };
    mr.start(1000); document.body.classList.add("ag-gravando");
    const tick = () => { const s = Math.floor((Date.now() - S.inicio) / 1000); $("agTempo").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); if(s >= 180) pararGravacao(); };
    tick(); S.relogio = setInterval(tick, 500); atualizarBotao();
  }
  function pararGravacao(){ if(S.gravador && S.gravador.state !== "inactive") S.gravador.stop(); }
  function cancelarGravacao(){ S.cancelada = true; pararGravacao(); }
  async function transcrever(blob){
    if(!blob || blob.size < 800){ aviso("O áudio ficou curto demais. Fale um pouco mais."); return; }
    S.ocupado = "ouvindo seu áudio…"; pintar();
    try{
      const url = await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = erro; fr.readAsDataURL(blob); });
      const r = await chamar("solicitacao-assistente", { acao: "transcrever", tipo: "compra", audio: String(url).replace(/^data:([^;,]+)[^,]*,/, (m, t) => "data:" + (t.startsWith("audio/") ? t : "audio/webm") + ";base64,") });
      S.ocupado = ""; await enviar(r.texto, { audio: true });
    }catch(e){ S.ocupado = ""; aviso("Não consegui entender o áudio (" + (e.message || e) + "). Pode mandar de novo ou escrever?"); }
  }
  function aviso(t){ S.msgs.push({ papel: "ia", texto: t, erro: true, em: new Date().toISOString() }); guardar(); pintar(); }

  /* ---------- fotos (Carla e Marcos): JPEG de até 1600px no bucket solicitacoes-evidencias ---------- */
  async function paraJpeg(f){
    const bmp = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("Não foi possível ler a foto."))), "image/jpeg", 0.85));
  }
  async function mandarFotos(arquivos){
    const imgs = arquivos.filter((f) => /^image\//.test(f.type)).slice(0, 4);
    if(!imgs.length || S.ocupado) return;
    if(todasFotos().length + imgs.length > 12){ aviso("Dá para mandar até 12 fotos por solicitação."); return; }
    S.ocupado = "enviando a foto…"; pintar();
    const urls = [];
    try{
      for(const f of imgs){
        const caminho = S.ctx.empresa + "/" + S.ctx.usuario + "/" + (crypto.randomUUID?.() || Date.now()) + ".jpg";
        const { error } = await sb.storage.from("solicitacoes-evidencias").upload(caminho, await paraJpeg(f), { contentType: "image/jpeg", upsert: false });
        if(error) throw error;
        urls.push(sb.storage.from("solicitacoes-evidencias").getPublicUrl(caminho).data.publicUrl);
      }
    }catch(e){ S.ocupado = ""; aviso("Não consegui enviar a foto (" + (e.message || e) + ")."); return; }
    S.ocupado = "";
    const t = $("agTexto"), legenda = t.value; t.value = ""; ajustar();
    await enviar(legenda, { fotos: urls });
  }

  /* ---------- relatórios (botão discreto) e foto ampliada ---------- */
  function abrirSheet(){
    const sh = $("agSheet");
    sh.querySelector("ul").innerHTML = S.ag.relatorios.map((r, i) => '<li><button type="button" data-ag-rel="' + i + '"><b>' + esc(r.t) + '</b><small>' + esc(r.p) + '</small></button></li>').join("");
    sh.hidden = false; requestAnimationFrame(() => sh.classList.add("on"));
  }
  function fecharSheet(){ const sh = $("agSheet"); sh.classList.remove("on"); setTimeout(() => { sh.hidden = true; }, 220); }
  function zoom(url){ const z = $("agZoom"); z.querySelector("img").src = url; z.hidden = false; }
  function ajustar(){ const t = $("agTexto"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; atualizarBotao(); }

  function ligar(){
    $("agForm").addEventListener("submit", (e) => { e.preventDefault(); const t = $("agTexto"), v = t.value; t.value = ""; ajustar(); enviar(v); });
    $("agTexto").addEventListener("input", ajustar);
    $("agTexto").addEventListener("keydown", (e) => { if(e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches){ e.preventDefault(); $("agForm").requestSubmit(); } });
    $("agMic").addEventListener("click", gravar);
    $("agGravPara").addEventListener("click", pararGravacao);
    $("agGravCancela").addEventListener("click", cancelarGravacao);
    $("agNova").addEventListener("click", novaConversa);
    $("agVoltar").addEventListener("click", () => { if(/app\.html/.test(document.referrer)) history.back(); else location.href = "../../../app.html#agentes"; });
    if(S.ag.fotos){ $("agFoto").addEventListener("click", () => $("agFotoArq").click()); $("agFotoArq").addEventListener("change", (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; mandarFotos(fs); }); }
    if(S.ag.relatorios){ $("agRelatorios").addEventListener("click", abrirSheet); }
    $("agSheet").addEventListener("click", (e) => { const b = e.target.closest("[data-ag-rel]"); if(b) return pedirRelatorio(S.ag.relatorios[+b.dataset.agRel]); if(e.target === $("agSheet") || e.target.closest("[data-ag-fechar]")) fecharSheet(); });
    $("agZoom").addEventListener("click", () => { $("agZoom").hidden = true; });
    $("agMsgs").addEventListener("click", (e) => {
      const sug = e.target.closest("[data-ag-sugestao]"); if(sug) return enviar(sug.textContent);
      if(e.target.closest("[data-ag-confirmar]")) return confirmar();
      if(e.target.closest("[data-ag-ajustar]")){ $("agTexto").focus(); $("agTexto").placeholder = "O que você quer ajustar?"; return; }
      const z = e.target.closest("[data-ag-zoom]"); if(z) return zoom(z.dataset.agZoom);
      const pdf = e.target.closest("[data-ag-pdf]"); if(pdf){ window.AcervoCora?.abrirRelatorio(S.msgs[+pdf.dataset.agPdf]?.relatorio); }
    });
    document.addEventListener("keydown", (e) => { if(e.key === "Escape"){ if(!$("agSheet").hidden) fecharSheet(); $("agZoom").hidden = true; } });
  }

  async function iniciar(){
    const id = new URLSearchParams(location.search).get("ag");
    S.ag = AGENTES[id];
    if(!S.ag){ location.replace("../../../app.html#agentes"); return; }
    document.title = S.ag.nome;
    $("agNome").textContent = S.ag.curto || S.ag.nome; $("agPapel").textContent = S.ag.papel;
    $("agCabAvatar").outerHTML = avatar();
    if(!S.ag.fotos) $("agFoto").remove();
    if(!S.ag.relatorios) $("agRelatorios").remove();
    const { data: { session } } = await sb.auth.getSession();
    if(!session){ location.replace("../../../app.html"); return; }
    let empresa = sessionStorage.getItem("empresa_id"); try{ empresa = empresa || localStorage.getItem("acervo_ultima_empresa"); }catch(_){}
    if(!empresa){ const { data } = await sb.from("usuarios_empresas").select("empresa_id").eq("user_id", session.user.id).limit(1); empresa = data?.[0]?.empresa_id; }
    if(!empresa){ location.replace("../../../app.html"); return; }
    S.ctx = { empresa, usuario: session.user.id, nome: sessionStorage.getItem("usuario_nome") || "" };
    if(!S.ctx.nome){ try{ const { data } = await sb.rpc("funcionario_contexto", { p_empresa_id: empresa }); S.ctx.nome = data?.nome || data?.funcionario_nome || ""; }catch(_){} }
    if(!S.ctx.nome){ const { data } = await sb.from("usuarios").select("nome").eq("id", session.user.id).maybeSingle(); S.ctx.nome = data?.nome || ""; }
    S.chave = "agente_chat:" + id + ":" + empresa + ":" + session.user.id;
    try{ S.msgs = JSON.parse(sessionStorage.getItem(S.chave) || "[]"); }catch(_){ S.msgs = []; }
    ligar(); pintar();
    window.AppCarregamento?.pronto();
  }
  window.AgenteChat = { iniciar, AGENTES };
  iniciar().catch((e) => { console.error(e); window.AppCarregamento?.pronto(); $("agMsgs").innerHTML = '<p class="ag-erro">Não foi possível abrir a conversa. Verifique a internet e tente de novo.</p>'; });
})();
