/* =========================================================
   Aba "Operação" da Central de Metas (out/2026)
   Bônus de Triagem, Carregamento e Montagem.
   Cálculo no servidor: api/_gas/projetos/central/OperacaoCentral.js
========================================================= */
(function(){

  const op = { dados: null, exemplo: false, carregando: false, erro: "", consulta: 0, comoFunciona: false, abertos: {} };

  const brl = function(v){
    return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };
  const pct = function(v){
    return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  };
  const esc = function(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const nomeMes = function(mes){
    if(!/^\d{4}-\d{2}$/.test(mes || "")) return mes || "";
    const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  function carregarOperacao(){
    op.carregando = true;
    op.erro = "";
    render();
    const consulta = ++op.consulta;
    const mes = document.getElementById("mes").value;
    const exec = centralRun()
      .withSuccessHandler(function(res){
        if(consulta !== op.consulta) return;
        op.carregando = false;
        op.dados = res;
        render();
      })
      .withFailureHandler(function(erro){
        if(consulta !== op.consulta) return;
        op.carregando = false;
        op.erro = String(erro && erro.message ? erro.message : erro);
        render();
      });
    if(op.exemplo) exec.operacaoCalcularExemplo();
    else exec.operacaoCalcularMes(mes);
  }

  function comoFuncionaHtml(p){
    return '<div class="op-como">' +
      '<h3>Como funciona o bônus da operação</h3>' +
      '<ol>' +
        '<li><b>Bolo do mês.</b> Para cada evento do mês na Matriz, cada equipe ganha <code>valor de locação × score de dificuldade × % da equipe</code>. ' +
          'Hoje: Triagem ' + pct(p.percentual.triagem) + ', Carregamento ' + pct(p.percentual.carregamento) + ', Montagem ' + pct(p.percentual.montagem) + '. ' +
          'Enquanto a Matriz não tiver o score da Separação e do Carregamento, usa o score padrão (' + p.scorePadrao.triagem + ' e ' + p.scorePadrao.carregamento + ').</li>' +
        '<li><b>Meta.</b> A equipe só tem direito se ficar dentro dos limites de todos os indicadores do mês (aba Indicativos): Triagem = Operações Internas, Montagem = Operações Externas, Carregamento = lista própria (Parâmetros). Passou de um limite: R$ 0.</li>' +
        '<li><b>Desconto dos danos.</b> Cada item danificado da equipe desconta <b>' + pct(p.descontoPercentual) + ' do valor de reposição</b> dele' +
          (p.tetoDescontoItem > 0 ? ' (no máximo ' + brl(p.tetoDescontoItem) + ' por item)' : '') + '. ' +
          'Dano interno vai para a Triagem; dano em evento vai para quem fez o Carregamento e a Montagem daquele pedido no Cronograma (dividido entre as duas, se as duas trabalharam). Limpeza de estofados (desgaste) e danos da produção não contam. O bolo nunca fica negativo.</li>' +
        '<li><b>Divisão.</b> A sobra é dividida pela participação: quem trabalhou em mais eventos do mês (segundo o Cronograma) recebe mais. Cada pessoa recebe no máximo ' + pct(p.tetoSalario) + ' do salário; o que passar do teto não é pago. Quando o Cronograma diz só "Equipe Galpão", todos da Triagem contam naquele evento.</li>' +
      '</ol>' +
      '<p class="op-como-nota">Só recebe quem está na lista da equipe (Parâmetros ou setor do RH). Freelancers e nomes que não estão no cadastro aparecem como "fora do cadastro" e não entram na divisão.</p>' +
    '</div>';
  }

  function equipeHtml(eq){
    const aberto = op.abertos[eq.chave] || {};
    const statusMeta = eq.metaOk
      ? '<span class="op-pill ok">Meta batida</span>'
      : '<span class="op-pill nao">Meta não batida</span>';
    const sobra = eq.metaOk
      ? '<div class="op-conta-linha op-conta-total"><span>= Sobra para a equipe</span><b>' + brl(eq.sobra) + '</b></div>'
      : '<div class="op-conta-linha op-conta-total nao"><span>Meta não batida — sem bônus</span><b>' + brl(0) + '</b></div>';

    const indicadores = eq.indicadores.length
      ? eq.indicadores.map(function(i){
          return '<tr class="' + (i.ok ? "" : "estourou") + '"><td>' + esc(i.nome) + '</td><td>' + esc(i.valor) + '</td><td>' + esc(i.meta) + '</td><td>' + (i.ok ? "✓" : "✕") + '</td></tr>';
        }).join("")
      : '<tr><td colspan="4" class="op-vazio">Nenhum indicador cadastrado.</td></tr>';

    const pessoas = eq.membros.length
      ? eq.membros.map(function(m){
          return '<tr><td>' + esc(m.nome) + (m.extra ? ' <small class="op-tag">extra</small>' : !m.noRH ? ' <small class="op-tag">fora do RH</small>' : '') + '</td>' +
            '<td>' + m.participacoes + '</td>' +
            '<td>' + brl(m.calculado) + '</td>' +
            '<td>' + (m.teto == null ? "—" : brl(m.teto)) + '</td>' +
            '<td><b>' + brl(m.recebe) + '</b>' + (m.limitadoPeloTeto ? ' <small class="op-tag">teto</small>' : '') + '</td></tr>';
        }).join("")
      : '<tr><td colspan="5" class="op-vazio">Nenhum membro na equipe.</td></tr>';

    const eventosCom = eq.eventos.filter(function(e){ return e.comissao > 0; }).length;
    const eventos = eq.eventos.map(function(e){
      return '<tr><td>' + esc(e.pedido) + '</td><td>' + esc(e.cliente) + '</td><td>' + (e.valorLocacao ? brl(e.valorLocacao) : '<span class="op-alerta">sem valor</span>') + '</td>' +
        '<td>' + esc(e.score) + (e.scorePadrao ? ' <small class="op-tag">padrão</small>' : '') + '</td><td>' + e.pessoas + '</td><td>' + brl(e.comissao) + '</td></tr>';
    }).join("");

    const danos = eq.danos.map(function(x){
      return '<tr><td>' + esc(x.data) + '</td><td>' + esc(x.item) + '</td><td>' + esc(x.quantidade) + '</td><td>' + esc(x.pedido || (x.local === "interno" ? "Galpão" : "—")) + '</td>' +
        '<td>' + brl(x.reposicaoTotal) + '</td><td>' + brl(x.desconto) + (x.dividido ? ' <small class="op-tag">÷2</small>' : '') + '</td></tr>';
    }).join("");

    return '<article class="op-equipe">' +
      '<header><h3>' + esc(eq.nome) + '</h3>' + statusMeta + '</header>' +
      '<div class="op-conta">' +
        '<div class="op-conta-linha"><span>Bolo do mês (' + eq.eventos.length + ' eventos)</span><b>' + brl(eq.bolo) + '</b></div>' +
        '<div class="op-conta-linha menos"><span>− Desconto dos danos (' + eq.danos.length + ')</span><b>' + brl(eq.desconto) + '</b></div>' +
        sobra +
        (eq.metaOk && eq.naoPago > 0 ? '<div class="op-conta-nota">' + brl(eq.naoPago) + ' não pagos (teto do salário ou sem participação).</div>' : '') +
      '</div>' +
      '<h4>Indicadores do mês</h4>' +
      '<table class="op-tabela"><thead><tr><th>Indicador</th><th>No mês</th><th>Limite</th><th></th></tr></thead><tbody>' + indicadores + '</tbody></table>' +
      '<h4>Divisão</h4>' +
      '<table class="op-tabela"><thead><tr><th>Pessoa</th><th>Eventos</th><th>Calculado</th><th>Teto</th><th>Recebe</th></tr></thead><tbody>' + pessoas + '</tbody></table>' +
      (eq.foraDoCadastro.length ? '<p class="op-fora"><b>Fora do cadastro (não entram na divisão):</b> ' + eq.foraDoCadastro.map(esc).join(", ") + '</p>' : '') +
      '<details' + (aberto.eventos ? ' open' : '') + ' data-op-det="' + eq.chave + ':eventos"><summary>Eventos do mês (' + eventosCom + ' com comissão de ' + eq.eventos.length + ')</summary>' +
        (eq.eventos.length ? '<div class="op-rolagem"><table class="op-tabela"><thead><tr><th>Pedido</th><th>Cliente</th><th>Locação</th><th>Score</th><th>Pessoas</th><th>Comissão</th></tr></thead><tbody>' + eventos + '</tbody></table></div>' : '<p class="op-vazio">Nenhum evento no mês.</p>') +
      '</details>' +
      '<details' + (aberto.danos ? ' open' : '') + ' data-op-det="' + eq.chave + ':danos"><summary>Danos descontados (' + eq.danos.length + ')</summary>' +
        (eq.danos.length ? '<div class="op-rolagem"><table class="op-tabela"><thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Pedido</th><th>Reposição</th><th>Desconto</th></tr></thead><tbody>' + danos + '</tbody></table></div>' : '<p class="op-vazio">Nenhum dano atribuído à equipe.</p>') +
      '</details>' +
    '</article>';
  }

  function render(){
    const raiz = document.getElementById("operacaoConteudo");
    if(!raiz) return;
    const d = op.dados;
    const topo = '<div class="op-topo">' +
      '<div class="op-topo-texto"><strong>Bônus da operação</strong><span>' +
        (op.exemplo ? 'Mês de exemplo, com valores inventados.' : 'Triagem, Carregamento e Montagem — ' + esc(nomeMes(document.getElementById("mes").value)) + '.') +
      '</span></div>' +
      '<div class="op-topo-acoes">' +
        '<button type="button" class="btn-toolbar btn-toolbar-contorno" data-op="como">' + (op.comoFunciona ? "Esconder como funciona" : "Como funciona") + '</button>' +
        '<button type="button" class="btn-toolbar btn-toolbar-contorno" data-op="exemplo">' + (op.exemplo ? "Voltar ao mês real" : "Ver exemplo") + '</button>' +
        '<button type="button" class="btn-toolbar" data-op="parametros">Parâmetros</button>' +
      '</div></div>';

    if(op.carregando){ raiz.innerHTML = topo + '<div class="pag-bonus-mensagem">Calculando...</div>'; return; }
    if(op.erro){ raiz.innerHTML = topo + '<div class="pag-bonus-mensagem op-erro">' + esc(op.erro) + '</div>'; return; }
    if(!d){ raiz.innerHTML = topo; return; }

    const total = d.equipes.reduce(function(s, e){ return s + (e.totalPago || 0); }, 0);
    raiz.innerHTML = topo +
      (op.comoFunciona ? comoFuncionaHtml(d.parametros) : '') +
      (op.exemplo ? '<div class="op-aviso exemplo">Exemplo: 40 eventos de R$ 15.000, score 45, salário de R$ 2.500. Nada disso é dado real.</div>' : '') +
      (d.avisos.length ? '<div class="op-aviso"><b>Atenção</b><ul>' + d.avisos.map(function(a){ return '<li>' + esc(a) + '</li>'; }).join("") + '</ul></div>' : '') +
      '<div class="op-resumo"><div><span>Eventos no mês</span><b>' + d.totalEventos + '</b></div>' +
        d.equipes.map(function(e){ return '<div><span>' + esc(e.nome) + '</span><b>' + brl(e.totalPago) + '</b></div>'; }).join("") +
        '<div class="op-resumo-total"><span>Total a pagar</span><b>' + brl(total) + '</b></div></div>' +
      '<div class="op-equipes">' + d.equipes.map(equipeHtml).join("") + '</div>';
  }

  /* ---------- Parâmetros ---------- */
  function abrirParametros(){
    let modal = document.getElementById("modalOperacaoParametros");
    if(!modal){
      modal = document.createElement("div");
      modal.id = "modalOperacaoParametros";
      modal.className = "modal-full";
      document.body.appendChild(modal);
    }
    modal.innerHTML = '<div class="modal-fechamento-central op-modal"><h2>Parâmetros do bônus da operação</h2><div class="pag-bonus-mensagem">Carregando...</div></div>';
    modal.style.display = "block";
    centralRun()
      .withSuccessHandler(function(p){ formParametros(modal, p); })
      .withFailureHandler(function(e){ modal.querySelector(".pag-bonus-mensagem").textContent = String(e && e.message || e); })
      .operacaoObterParametros();
  }

  function formParametros(modal, p){
    const equipes = [["triagem", "Triagem"], ["carregamento", "Carregamento"], ["montagem", "Montagem"]];
    const campo = function(id, rotulo, valor, ajuda){
      return '<label class="op-campo"><span>' + rotulo + '</span><input type="number" step="0.01" min="0" id="' + id + '" value="' + esc(valor) + '">' + (ajuda ? '<small>' + ajuda + '</small>' : '') + '</label>';
    };
    modal.innerHTML = '<div class="modal-fechamento-central op-modal">' +
      '<h2>Parâmetros do bônus da operação</h2>' +
      '<h4>% de cada equipe sobre (valor de locação × score)</h4><div class="op-grade">' +
        equipes.map(function(e){ return campo("opPct_" + e[0], e[1] + " (%)", p.percentual[e[0]]); }).join("") + '</div>' +
      '<h4>Score padrão (enquanto a Matriz não tiver o da equipe)</h4><div class="op-grade">' +
        equipes.map(function(e){ return campo("opScore_" + e[0], e[1], p.scorePadrao[e[0]]); }).join("") + '</div>' +
      '<h4>Danos e teto</h4><div class="op-grade">' +
        campo("opDesconto", "Desconto por item (% da reposição)", p.descontoPercentual) +
        campo("opTetoItem", "Desconto máximo por item (R$)", p.tetoDescontoItem, "0 = sem limite") +
        campo("opTetoSalario", "Teto por pessoa (% do salário)", p.tetoSalario) + '</div>' +
      '<h4>Membros de cada equipe</h4><p class="op-ajuda">Um nome por linha. Vazio = pelo setor do cadastro do RH.</p><div class="op-grade">' +
        equipes.map(function(e){ return '<label class="op-campo"><span>' + e[1] + '</span><textarea id="opMembros_' + e[0] + '" rows="6">' + esc((p.membros[e[0]] || []).join("\n")) + '</textarea></label>'; }).join("") + '</div>' +
      '<h4>Indicadores do Carregamento</h4><p class="op-ajuda">Um por linha: <code>nome ; limite</code>. Contam as ocorrências com departamento "Carregamento"; "Itens danificados" conta os danos atribuídos à equipe.</p>' +
        '<textarea id="opMetasCarreg" rows="4">' + esc((p.metasCarregamento || []).map(function(m){ return m.nome + " ; " + m.meta; }).join("\n")) + '</textarea>' +
      '<h4>Pessoas extras</h4><p class="op-ajuda">Para teste ou para quem ainda não está no RH. Um por linha: <code>nome ; salário ; equipe</code> (triagem, carregamento ou montagem). Não grava nada no cadastro do RH.</p>' +
        '<textarea id="opExtras" rows="4">' + esc((p.extras || []).map(function(x){ return x.nome + " ; " + x.salario + " ; " + x.equipe; }).join("\n")) + '</textarea>' +
      '<div class="modal-fechamento-erro" id="opErroParametros"></div>' +
      '<div class="modal-fechamento-acoes">' +
        '<button type="button" class="btn-cancelar-fechamento" data-op="fechar-parametros">Cancelar</button>' +
        '<button type="button" class="btn-confirmar-fechamento" data-op="salvar-parametros">Salvar</button>' +
      '</div></div>';
  }

  function salvarParametros(botao){
    const v = function(id){ return document.getElementById(id).value; };
    const linhas = function(id){ return v(id).split("\n").map(function(l){ return l.trim(); }).filter(Boolean); };
    const novos = { percentual: {}, scorePadrao: {}, membros: {} };
    ["triagem", "carregamento", "montagem"].forEach(function(k){
      novos.percentual[k] = v("opPct_" + k);
      novos.scorePadrao[k] = v("opScore_" + k);
      novos.membros[k] = linhas("opMembros_" + k);
    });
    novos.descontoPercentual = v("opDesconto");
    novos.tetoDescontoItem = v("opTetoItem");
    novos.tetoSalario = v("opTetoSalario");
    novos.metasCarregamento = linhas("opMetasCarreg").map(function(l){ const p = l.split(";"); return { nome: (p[0] || "").trim(), meta: (p[1] || "0").trim() }; });
    novos.extras = linhas("opExtras").map(function(l){ const p = l.split(";"); return { nome: (p[0] || "").trim(), salario: (p[1] || "0").trim(), equipe: (p[2] || "").trim().toLowerCase() }; });
    botao.disabled = true;
    botao.textContent = "Salvando...";
    centralRun()
      .withSuccessHandler(function(){
        document.getElementById("modalOperacaoParametros").style.display = "none";
        carregarOperacao();
      })
      .withFailureHandler(function(e){
        botao.disabled = false;
        botao.textContent = "Salvar";
        document.getElementById("opErroParametros").textContent = String(e && e.message || e);
      })
      .operacaoSalvarParametros(novos);
  }

  document.addEventListener("click", function(ev){
    const alvo = ev.target.closest("[data-op]");
    if(!alvo) return;
    const acao = alvo.getAttribute("data-op");
    if(acao === "como"){ op.comoFunciona = !op.comoFunciona; render(); }
    else if(acao === "exemplo"){ op.exemplo = !op.exemplo; carregarOperacao(); }
    else if(acao === "parametros"){ abrirParametros(); }
    else if(acao === "fechar-parametros"){ document.getElementById("modalOperacaoParametros").style.display = "none"; }
    else if(acao === "salvar-parametros"){ salvarParametros(alvo); }
  });

  /* Lembra quais detalhes estão abertos entre um cálculo e outro. */
  document.addEventListener("toggle", function(ev){
    const det = ev.target;
    if(!det.matches || !det.matches("[data-op-det]")) return;
    const partes = det.getAttribute("data-op-det").split(":");
    op.abertos[partes[0]] = op.abertos[partes[0]] || {};
    op.abertos[partes[0]][partes[1]] = det.open;
  }, true);

  window.carregarOperacao = carregarOperacao;
})();
