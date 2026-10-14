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
        '<li><b>Desconto dos danos.</b> Cada item danificado da equipe desconta <b>' + pct(p.descontoPercentual) + ' do valor de reposição</b> dele' +
          (p.tetoDescontoItem > 0 ? ' (no máximo ' + brl(p.tetoDescontoItem) + ' por item)' : '') + '. ' +
          'Dano interno vai para a Triagem; dano em evento vai para quem fez o Carregamento e a Montagem daquele pedido no Cronograma (dividido entre as duas, se as duas trabalharam). Limpeza de estofados (desgaste) e danos da produção não contam. O total nunca fica negativo.</li>' +
        '<li><b>Divisão, igual ao Departamento de Manutenção.</b> O total é dividido em partes iguais entre todos da equipe. Só recebe quem está apto: a equipe ficou dentro dos limites dos indicadores do mês (Triagem = Operações Internas, Montagem = Operações Externas, Carregamento = lista própria) e a pessoa bateu a meta individual do RH. Cada pessoa recebe no máximo ' + pct(p.tetoSalario) + ' do salário. A parte de quem não está apto, e o que passa do teto, não é redistribuída.</li>' +
      '</ol>' +
      '<p class="op-como-nota">Quem é de cada equipe: a lista dos Parâmetros ou, se estiver vazia, o setor no cadastro do RH.</p>' +
    '</div>';
  }

  /* Card de uma equipe: mesmo HTML e as mesmas classes dos cards do
     Departamento de Manutenção (card-comissao-*), com os números da operação. */
  function equipeHtml(eq){
    const subtitulo = { triagem: "Separação e conferência", carregamento: "Carregamento dos caminhões", montagem: "Montagem e desmontagem" }[eq.chave] || "";
    const linhas = eq.membros.map(function(m){
      let classeLinha = "", classeStatus = "ok", texto = "Dentro do teto", complemento = "";
      if(!m.apto){ classeLinha = "negada"; classeStatus = "negado"; texto = m.motivo || "Não apto ao bônus"; }
      else if(m.limitadoPeloTeto){ classeLinha = "limitada"; classeStatus = "limitado"; texto = "Limitado pelo teto"; complemento = "Excedente: " + brl(m.excedente); }
      return '<div class="card-comissao-tabela-linha ' + classeLinha + '">' +
        '<div class="card-comissao-coluna-funcionario"><div class="card-comissao-coluna-funcionario-nome">' + esc(m.nome) + '</div>' +
          '<div class="card-comissao-coluna-funcionario-setor">' + esc(m.setor || "") + '</div></div>' +
        '<div class="card-comissao-coluna-valor">' + brl(m.salario) + '</div>' +
        '<div class="card-comissao-coluna-valor">' + brl(m.teto) + '</div>' +
        '<div class="card-comissao-coluna-valor">' + brl(m.calculado) + '</div>' +
        '<div class="card-comissao-coluna-receber ' + classeLinha + '">' + brl(m.recebe) + '</div>' +
        '<div class="card-comissao-coluna-status"><span class="card-comissao-status ' + classeStatus + '">' + esc(texto) + '</span>' +
          (complemento ? '<span class="card-comissao-status-complemento">' + esc(complemento) + '</span>' : '') + '</div>' +
      '</div>';
    }).join("");
    const tabela = eq.membros.length
      ? '<div class="card-comissao-tabela"><div class="card-comissao-tabela-cabecalho">' +
          '<div>Funcionário</div><div class="card-comissao-coluna-valor">Salário</div>' +
          '<div class="card-comissao-coluna-valor">Teto (' + pct(op.dados.parametros.tetoSalario) + ')</div>' +
          '<div class="card-comissao-coluna-valor">Valor calculado</div><div class="card-comissao-coluna-valor">Valor a receber</div>' +
          '<div class="card-comissao-coluna-status">Status</div></div>' + linhas + '</div>'
      : '<div class="card-comissao-sem-aptos">Nenhum funcionário nesta equipe. Ajuste em Parâmetros.</div>';
    const semAptos = eq.membros.length && !eq.aptos
      ? '<div class="card-comissao-sem-aptos">Nenhum funcionário está apto a receber o bônus neste mês. O valor não será distribuído.</div>' : '';
    return '<div class="card-comissao-departamento">' +
      '<div class="card-comissao-header"><h3>' + esc(eq.nome) + '</h3><p>' + esc(subtitulo) + '</p></div>' +
      '<div class="card-comissao-body">' +
        '<div class="card-comissao-valores">' +
          '<div class="card-comissao-valor"><span class="label">Total de eventos</span><span class="valor">' + brl(eq.bolo) + '</span></div>' +
          '<div class="card-comissao-valor"><span class="label">Desconto dos danos</span><span class="valor op-desconto">− ' + brl(eq.desconto) + '</span></div>' +
        '</div>' +
        '<div class="card-comissao-total"><span class="label">Total disponível para distribuição</span><span class="valor">' + brl(eq.sobra) + '</span></div>' +
        semAptos +
        '<div class="card-comissao-funcionarios-header"><strong>Funcionários participantes</strong><span>' +
          eq.membros.length + (eq.membros.length === 1 ? ' funcionário' : ' funcionários') + ' · ' + eq.aptos + (eq.aptos === 1 ? ' apto' : ' aptos') + '</span></div>' +
        '<div class="card-comissao-lista">' + tabela + '</div>' +
      '</div></div>';
  }

  /* "Desempenho das equipes": mesmo formato de "Desempenho dos setores". */
  function desempenhoHtml(d){
    const linhas = d.equipes.map(function(eq){
      const indicadores = eq.indicadores.length ? eq.indicadores.map(function(i){
        return '<div class="op-ind"><span>' + esc(i.nome) + '</span><b style="color:' + (i.ok ? 'var(--green)' : 'var(--red)') + '">' + esc(i.valor) + '</b><small>Limite: ' + esc(i.meta) + '</small></div>';
      }).join("") : '<span class="op-vazio">Sem indicadores</span>';
      return '<tr><td><b>' + esc(eq.nome) + '</b></td><td style="text-align:center">' + eq.eventos.length + '</td>' +
        '<td><div class="op-inds">' + indicadores + '</div></td>' +
        '<td style="text-align:center">' + eq.danos.reduce(function(s, x){ return s + x.quantidade; }, 0) + '</td>' +
        '<td class="' + (eq.metaOk ? 'ok' : 'bad') + '">' + (eq.metaOk ? 'OK' : 'Meta não atingida') + '</td></tr>';
    }).join("");
    return '<section class="card-tabela-metas"><div class="card-tabela-metas-header"><div class="card-tabela-metas-header-texto">' +
      '<h3 class="card-tabela-metas-titulo">Desempenho das equipes</h3></div></div>' +
      '<div class="card-tabela-metas-scroll"><table class="tabela-desempenho-setores"><thead><tr>' +
      '<th>Equipe</th><th>Eventos</th><th>Indicadores do mês</th><th>Itens danificados</th><th>Status</th></tr></thead><tbody>' + linhas + '</tbody></table></div></section>';
  }

  function eventosHtml(d){
    const porPedido = {};
    const ordem = [];
    d.equipes.forEach(function(eq){ eq.eventos.forEach(function(e){
      const k = e.pedido + "|" + e.data + "|" + e.cliente;
      if(!porPedido[k]){ porPedido[k] = { pedido: e.pedido, data: e.data, cliente: e.cliente, locacao: e.valorLocacao }; ordem.push(k); }
      porPedido[k][eq.chave] = e;
    }); });
    const cel = function(e){ return e ? '<td>' + esc(e.score) + (e.scorePadrao ? ' <small class="op-tag">padrão</small>' : '') + '</td><td>' + brl(e.comissao) + '</td>' : '<td>—</td><td>—</td>'; };
    const linhas = ordem.map(function(k){
      const r = porPedido[k];
      return '<tr><td>' + esc(r.data) + '</td><td>' + esc(r.pedido) + '</td><td>' + esc(r.cliente) + '</td><td>' + (r.locacao ? brl(r.locacao) : '<span class="op-alerta">sem valor</span>') + '</td>' +
        cel(r.triagem) + cel(r.carregamento) + cel(r.montagem) + '</tr>';
    }).join("");
    return '<div class="table-box"><div class="op-box-titulo">Eventos do mês</div><div class="table-scroll"><table class="tabela-eventos"><thead><tr>' +
      '<th>Data</th><th>Pedido</th><th>Cliente</th><th>Locação</th><th>Score Triagem</th><th>Valor Triagem</th><th>Score Carregamento</th><th>Valor Carregamento</th><th>Score Montagem</th><th>Valor Montagem</th>' +
      '</tr></thead><tbody>' + (linhas || '<tr><td colspan="10" class="op-vazio">Nenhum evento no mês.</td></tr>') + '</tbody></table></div></div>';
  }

  function danosHtml(d){
    const linhas = [];
    d.equipes.forEach(function(eq){ eq.danos.forEach(function(x){
      linhas.push('<tr><td>' + esc(x.data) + '</td><td>' + esc(x.os || "") + '</td><td>' + esc(x.item) + '</td><td>' + esc(x.quantidade) + '</td>' +
        '<td>' + (x.local === "interno" ? "Galpão" : "Evento") + '</td><td>' + esc(x.pedido || "—") + '</td><td><b>' + esc(eq.nome) + '</b>' + (x.dividido ? ' <small class="op-tag">÷2</small>' : '') + '</td>' +
        '<td>' + brl(x.reposicaoTotal) + '</td><td>' + brl(x.desconto) + '</td></tr>');
    }); });
    return '<div class="table-box"><div class="op-box-titulo op-box-escuro">Itens danificados descontados</div><div class="table-scroll"><table class="tabela-os"><thead><tr>' +
      '<th>Data</th><th>OS</th><th>Item</th><th>Qtd</th><th>Onde</th><th>Pedido</th><th>Equipe</th><th>Reposição</th><th>Desconto</th>' +
      '</tr></thead><tbody>' + (linhas.join("") || '<tr><td colspan="9" class="op-vazio">Nenhum item danificado descontado no mês.</td></tr>') + '</tbody></table></div></div>';
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
      desempenhoHtml(d) +
      '<section class="resumo-comissoes-central"><div class="resumo-comissoes-titulo"><div><h2>Distribuição das comissões</h2>' +
        '<p>Valores calculados de acordo com o mês selecionado · Total a pagar: <b>' + brl(total) + '</b></p></div></div>' +
        '<div class="resumo-comissoes-grid op-grade-equipes">' + d.equipes.map(equipeHtml).join("") + '</div></section>' +
      eventosHtml(d) + danosHtml(d);
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


  window.carregarOperacao = carregarOperacao;
})();
