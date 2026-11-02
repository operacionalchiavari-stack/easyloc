/* Fluxo do sistema (Gestão > Fluxo do sistema).
   Tudo é dado: FASES -> nós. Tipos de nó:
     passo    { setor, titulo, tela, faz[], auto[], trava[], param[] }
     duplo    { itens:[passo, passo], juntar:"texto" }   duas origens que se juntam
     decisao  { pergunta, ramos:[{rotulo, texto, cor}] }
     auto     { titulo, gera:[{setor, texto, tela}] }     o que o sistema dispara sozinho
   Ao mudar uma regra do sistema, atualize o texto aqui. */
(function () {
  const SETORES = {
    comercial: { nome: "Comercial", cor: "#123f86" },
    financeiro: { nome: "Financeiro", cor: "#1f7a44" },
    logistica: { nome: "Logística", cor: "#c2670f" },
    campo: { nome: "Equipe de campo", cor: "#6d4fc2" },
    estoque: { nome: "Estoque e acervo", cor: "#0f7a83" },
    producao: { nome: "Produção", cor: "#8a5a2b" },
    sistema: { nome: "Automático", cor: "#5a5a55" },
  };

  const T = {
    catalogo: "Modulos/Comercial/Catalogo/catalogo.html",
    central: "Modulos/Comercial/Pedidos/CentralPedidos.html",
    painel: "Modulos/Logistica/PainelLogistico/painel-logistico.html",
    cronograma: "Modulos/Chiavari/Cronograma/cronograma.html",
    producao: "Modulos/Producao/ordens.html",
    triagem: "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html",
    expedicao: "Modulos/Logistica/Expedicao/expedicao.html",
    montador: "Modulos/Chiavari/Cronograma/montador.html",
    freteiros: "Modulos/Chiavari/Fretes/freteiros.html",
    concFretes: "Modulos/Chiavari/Fretes/conciliacao.html",
    uber: "Modulos/Chiavari/Uber/index.html",
    free: "Modulos/Chiavari/Cronograma/equipe-free.html",
    acervo: "Modulos/Estoque/Acervo/acervo.html",
    os: "Modulos/Chiavari/CentralMetas/itens-danificados.html",
    capas: "Modulos/Estoque/CapasProtecao/capas.html",
    ocorrencias: "Modulos/Chiavari/Ocorrencias/OcorrenciasOperacionais.html",
    financeiro: "Modulos/Financeiro/financeiro.html",
    receber: "Modulos/Financeiro/financeiro.html?aba=receber",
    bancos: "Modulos/Financeiro/financeiro.html?aba=bancos",
    posicao: "Modulos/Financeiro/financeiro.html?aba=posicao",
    gerencial: "Modulos/Financeiro/financeiro.html?aba=gerencial",
    posvenda: "Modulos/Chiavari/Feedback/feedback.html",
    almox: "Modulos/Chiavari/Almoxarifado/almoxarifado.html",
    compras: "Modulos/Estoque/Compras/compras.html",
    funcionarios: "Modulos/RH/CadastroFuncionarios/cadastro-funcionarios.html",
    parametros: "Modulos/Configuracoes/Parametros/parametros.html",
  };

  const FASES = [
    {
      id: "comercial", numero: 1, titulo: "Venda", resumo: "O pedido nasce, é montado e fechado.",
      nos: [
        { tipo: "duplo", juntar: "Os dois caminhos chegam no mesmo pedido", itens: [
          { setor: "comercial", titulo: "Decorador monta pelo catálogo", tela: T.catalogo,
            faz: ["Escolhe o projeto (ou cria um) e vai pondo os móveis nos ambientes", "Pode usar o 3D Livre e a assistente Helena", "Envia o pedido para a equipe"],
            auto: ["Aparece na Central de Pedidos com o selo \"Veio do catálogo\""] },
          { setor: "comercial", titulo: "Equipe abre na Central de Pedidos", tela: T.central,
            faz: ["Novo pedido, ou abre o que veio do catálogo", "Usa o mesmo catálogo, 3D e plantas dentro do pedido"] },
        ] },
        { tipo: "passo", setor: "comercial", titulo: "Pedido preenchido", tela: T.central,
          faz: ["Dados do evento, cliente, local, entrega e coleta", "Ambientes e lista de móveis, serviços e componentes", "Financeiro: parcelas separadas em Locação, Frete e Montagem", "Contrato (opcional) e documento do pedido em PDF"],
          trava: ["Só salva com todos os dados (só as observações são opcionais)", "Só salva com o financeiro 100% distribuído", "Não deixa pôr mais peças do que há disponível no período"] },
        { tipo: "decisao", pergunta: "Qual a situação do pedido?", ramos: [
          { rotulo: "Orçamento", texto: "Não reserva estoque. Fica só no Comercial.", cor: "#77716a" },
          { rotulo: "Pré-reserva", texto: "Reserva o estoque até a data de validade (obrigatória) e já entra na operação, sem o financeiro.", cor: "#b7791f", segue: true },
          { rotulo: "Reservado", texto: "Pedido fechado: entra na operação e no financeiro.", cor: "#1f7a44", segue: true },
          { rotulo: "Cancelado", texto: "Libera o estoque. Motivo obrigatório (relatório de Cancelamentos).", cor: "#b42318" },
        ] },
        { tipo: "auto", titulo: "Pré-reserva ou reservado: o sistema faz sozinho", gera: [
          { setor: "financeiro", texto: "Só quando Reservado: contas a receber de cada parcela, cada uma na sua conta (Locação, Frete, Montagem)", tela: T.receber },
          { setor: "financeiro", texto: "Só quando Reservado: link do pedido com QR do PIX para o cliente pagar", tela: T.receber },
          { setor: "financeiro", texto: "Só quando Reservado: BV do decorador no Contas a Pagar", tela: T.financeiro },
          { setor: "logistica", texto: "Etapas no cronograma: triagem, carregamento, montagem, desmontagem, descarregamento e triagem da volta (+ serviços com data)", tela: T.cronograma },
          { setor: "logistica", texto: "Escala automática: responsável, equipe e caminhão", tela: T.painel },
          { setor: "producao", texto: "Ordem de produção dos itens personalizados", tela: T.producao },
          { setor: "estoque", texto: "Materiais do almoxarifado separados para as personalizações (pré-reserva aparece à parte)", tela: T.almox },
        ] },
        { tipo: "passo", setor: "comercial", titulo: "Pedido extra (se o cliente pedir mais)", tela: T.central, lateral: true,
          faz: ["Botão \"+ Pedido extra\" no pedido principal (ex.: 4/2)", "Tem entrega própria; da coleta em diante anda junto com o principal"],
          trava: ["Só até a coleta começar"] },
      ],
    },
    {
      id: "planejamento", numero: 2, titulo: "Planejamento", resumo: "Equipe, caminhões e produção ficam prontos antes do evento.",
      nos: [
        { tipo: "passo", setor: "logistica", titulo: "Painel Logístico", tela: T.painel,
          faz: ["Confere e ajusta a escala que o sistema montou (pessoas e caminhões)", "Avisa quando alguém ou um caminhão está em dois lugares ao mesmo tempo", "Pede Uber para a equipe e vagas para a Equipe Free"],
          auto: ["Entrega ou coleta sem caminhão próprio vira frete anunciado no App do Freteiro"],
          param: ["Regras da escala (pessoas por m³, duração, deslocamento)", "Valores do Uber por km"] },
        { tipo: "passo", setor: "producao", titulo: "Produção", tela: T.producao,
          faz: ["Cada item personalizado passa pelas etapas dos setores (separar material, executar, conferir)", "Quando termina, fica pronto para a Triagem receber"] },
      ],
    },
    {
      id: "ida", numero: 3, titulo: "Ida", resumo: "Separar, carregar, entregar e montar.",
      nos: [
        { tipo: "passo", setor: "estoque", titulo: "Triagem (separação)", tela: T.triagem,
          faz: ["Escolhe o modo: manual, QR (com etiquetas de envio) ou 1 clique", "Cada pessoa vê só os itens do seu setor", "Confirma o recebimento do que veio da Produção", "Conta as capas e caixas de proteção"],
          trava: ["Só separa pedido Reservado (pré-reserva aparece só para consulta)", "Liberada só alguns dias antes do evento", "O modo escolhido não muda até o fim", "Só termina com tudo separado"],
          param: ["Dias antes do evento", "Pagamento mínimo (se a trava for na Triagem)", "Separar por setor"] },
        { tipo: "decisao", pergunta: "O cliente já pagou o mínimo?", nota: "Só quando a trava de pagamento está ligada", ramos: [
          { rotulo: "Sim", texto: "Segue normalmente.", cor: "#1f7a44", segue: true },
          { rotulo: "Não", texto: "O cartão fica \"Aguardando Financeiro\" e não abre.", cor: "#b42318" },
        ] },
        { tipo: "passo", setor: "logistica", titulo: "Expedição (carregamento)", tela: T.expedicao,
          faz: ["Mostra os caminhões programados", "Confere cada peça: bipando a etiqueta (modo QR) ou digitando a quantidade (manual/1 clique)", "No fim, marca em qual caminhão o pedido foi"],
          trava: ["Só começa com caminhão programado", "Pagamento mínimo, se a trava for no Carregamento"],
          param: ["Carregamento sem caminhão programado", "Onde travar o pagamento e a porcentagem"] },
        { tipo: "passo", setor: "campo", titulo: "Entrega e montagem", tela: T.montador,
          faz: ["Montador entra no App com CPF e PIN", "Registra a chegada da equipe, sacolas, posicionamento e a lista assinada", "Motorista do Uber e freteiro fazem check-in pelo QR do responsável", "Logística confirma a entrega no Painel Logístico"] },
      ],
    },
    {
      id: "volta", numero: 4, titulo: "Volta", resumo: "Recolher, conferir e resolver o que faltou.",
      nos: [
        { tipo: "passo", setor: "campo", titulo: "Coleta e desmontagem", tela: T.montador,
          faz: ["No App: lista conferida, contagem de cada item e foto", "Logística confirma a coleta; avaria ou peça que ficou vão com motivo"],
          trava: ["O App só deixa concluir na ordem certa e com a contagem feita"] },
        { tipo: "passo", setor: "logistica", titulo: "Descarregamento no galpão", tela: T.expedicao,
          faz: ["Conta o que chegou no caminhão", "Se não bater, pede uma segunda contagem"],
          param: ["Com quantidade à vista ou às cegas"] },
        { tipo: "passo", setor: "estoque", titulo: "Triagem da volta", tela: T.triagem,
          faz: ["Sempre às cegas: quem confere não vê quanto devia voltar", "Se não bater, segunda contagem", "No fim o sistema compara com o que saiu"] },
        { tipo: "decisao", pergunta: "Voltou tudo?", ramos: [
          { rotulo: "Sim", texto: "As peças voltam a ficar disponíveis.", cor: "#1f7a44", segue: true },
          { rotulo: "Faltou ou veio a mais", texto: "Vira divergência na Gestão do acervo: contagem geral do item no galpão e decisão (encontrada, perda com baixa do estoque, ou a mais justificada).", cor: "#b42318", tela: T.acervo },
          { rotulo: "Avaria", texto: "A peça vai para Ordens de serviço (manutenção) e fica indisponível até voltar.", cor: "#b7791f", tela: T.os },
        ] },
        { tipo: "passo", setor: "estoque", titulo: "Encerramento da operação", tela: T.expedicao,
          faz: ["Fecha a parte operacional do pedido"],
          trava: ["Só encerra com as faltas resolvidas"],
          auto: ["As ocorrências operacionais são registradas sozinhas durante todo o fluxo"] },
      ],
    },
    {
      id: "fechamento", numero: 5, titulo: "Fechamento", resumo: "Pagar fornecedores, fechar a conta e ouvir o cliente.",
      nos: [
        { tipo: "duplo", juntar: "Os dois viram contas a pagar e custo do evento", itens: [
          { setor: "logistica", titulo: "Fretes", tela: T.concFretes,
            faz: ["Transportadora informa o valor no Cadastro de Fretes", "Logística concilia sistema × transportadora e fecha"] },
          { setor: "logistica", titulo: "Corridas de Uber", tela: T.uber,
            faz: ["Depois do check-out a logística confere o valor", "Fecha as corridas de cada motorista"] },
        ] },
        { tipo: "passo", setor: "financeiro", titulo: "Posição final", tela: T.posicao,
          faz: ["Junta o pedido e os extras: o que foi cobrado, recebido e créditos", "Confirma o fechamento financeiro do evento"] },
        { tipo: "passo", setor: "comercial", titulo: "Pós-venda", tela: T.posvenda,
          auto: ["Depois da posição final, o sistema agenda a ligação para o cliente"],
          faz: ["Equipe liga e registra as respostas", "Resposta ruim vai para \"Precisam de atenção\""],
          param: ["Prazo, intervalo entre ligações e perguntas do formulário"] },
        { tipo: "fim", titulo: "Pedido finalizado", texto: "Posição final confirmada + pós-venda feito + nada pendente no financeiro." },
      ],
    },
  ];

  const PARALELOS = [
    { titulo: "Dinheiro entrando", setor: "financeiro", itens: [
      { texto: "Cliente paga pelo PIX do link do pedido: a parcela é baixada sozinha", tela: T.receber },
      { texto: "Extrato do banco na Conciliação (com a Clara): cada linha reconhecida dá baixa", tela: T.bancos },
      { texto: "Dinheiro em espécie: lançado no Caixa físico", tela: T.bancos },
      { texto: "Não existe baixa manual de parcela, só por esses três caminhos" },
      { texto: "DRE, Gerencial e lucro por evento saem desses lançamentos", tela: T.gerencial },
    ] },
    { titulo: "Materiais e compras", setor: "estoque", itens: [
      { texto: "Material chegou no estoque mínimo: o sistema abre a solicitação de compra (se ligado em Parâmetros)", tela: T.almox },
      { texto: "Compras cota e emite o pedido de compra", tela: T.compras },
      { texto: "Almoxarifado recebe a mercadoria (com ou sem XML): entra no estoque e vai para o Contas a Pagar", tela: T.almox },
    ] },
    { titulo: "Pessoas e acesso", setor: "comercial", itens: [
      { texto: "Cada pessoa é cadastrada em Cadastro de Funcionários: login, permissões, equipe, líder e PIN do App", tela: T.funcionarios },
      { texto: "O menu mostra só o que a pessoa tem permissão de abrir" },
      { texto: "Freelancers entram pela Equipe Free; motoristas e freteiros se cadastram nos apps deles", tela: T.free },
    ] },
  ];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function podeAbrir(href) {
    const P = window.EasyLocPermissions;
    try { return !P?.canNavigate || !P._cache?.loaded || P.canNavigate("../../../" + href); } catch (_) { return true; }
  }
  function abrir(href) {
    try { if (window.parent && window.parent !== window && typeof window.parent.shellNavigate === "function") { window.parent.shellNavigate(href); return; } } catch (_) {}
    location.href = "../../../" + href;
  }

  const chip = (setor) => { const s = SETORES[setor] || SETORES.sistema; return '<span class="fx-chip" style="--c:' + s.cor + '">' + esc(s.nome) + "</span>"; };
  const lista = (cls, ico, arr) => arr && arr.length ? '<ul class="fx-lista ' + cls + '">' + arr.map((t) => "<li>" + (ico ? '<span class="fx-ico">' + ico + "</span>" : "") + esc(t) + "</li>").join("") + "</ul>" : "";
  const botao = (tela) => tela ? '<button type="button" class="fx-abrir" data-tela="' + esc(tela) + '"' + (podeAbrir(tela) ? "" : ' disabled title="Você não tem acesso a esta tela"') + ">Abrir tela →</button>" : "";

  function caixa(n) {
    const s = SETORES[n.setor] || SETORES.sistema;
    return '<article class="fx-caixa' + (n.lateral ? " is-lateral" : "") + '" style="--c:' + s.cor + '">' +
      '<header>' + chip(n.setor) + "<h3>" + esc(n.titulo) + "</h3></header>" +
      lista("fx-faz", "", n.faz) + lista("fx-auto", "⚡", n.auto) + lista("fx-trava", "🔒", n.trava) + lista("fx-param", "⚙", n.param) +
      botao(n.tela) + "</article>";
  }

  function no(n) {
    if (n.tipo === "passo") return '<div class="fx-no">' + caixa(n) + "</div>";
    if (n.tipo === "duplo") return '<div class="fx-no fx-duplo"><div class="fx-duplo-itens">' + n.itens.map(caixa).join("") + '</div><p class="fx-juntar">' + esc(n.juntar) + "</p></div>";
    if (n.tipo === "decisao") return '<div class="fx-no fx-decisao"><div class="fx-losango"><span>' + esc(n.pergunta) + "</span></div>" +
      (n.nota ? '<p class="fx-nota">' + esc(n.nota) + "</p>" : "") +
      '<div class="fx-ramos" style="--n:' + n.ramos.length + '">' + n.ramos.map((r) =>
        '<div class="fx-ramo' + (r.segue ? " is-segue" : "") + '" style="--c:' + r.cor + '"><b>' + esc(r.rotulo) + "</b><p>" + esc(r.texto) + "</p>" + botao(r.tela) + (r.segue ? '<span class="fx-segue">continua ↓</span>' : "") + "</div>").join("") + "</div></div>";
    if (n.tipo === "auto") return '<div class="fx-no fx-auto-bloco"><div class="fx-auto-centro"><span class="fx-ico">⚡</span> ' + esc(n.titulo) + '</div><div class="fx-auto-gera">' +
      n.gera.map((g) => { const s = SETORES[g.setor]; return '<button type="button" class="fx-gera" style="--c:' + s.cor + '" data-tela="' + esc(g.tela) + '"' + (podeAbrir(g.tela) ? "" : " disabled") + ">" + chip(g.setor) + "<span>" + esc(g.texto) + "</span></button>"; }).join("") + "</div></div>";
    if (n.tipo === "fim") return '<div class="fx-no fx-fim"><div class="fx-fim-caixa"><span class="fx-fim-ok">✓</span><div><h3>' + esc(n.titulo) + "</h3><p>" + esc(n.texto) + "</p></div></div></div>";
    return "";
  }

  function render() {
    $("fxSetores").innerHTML = Object.values(SETORES).map((s) => '<li><span class="fx-ponto" style="background:' + s.cor + '"></span>' + esc(s.nome) + "</li>").join("");
    $("fxFases").innerHTML = FASES.map((f) => '<a href="#fase-' + f.id + '" data-fase="' + f.id + '"><b>' + f.numero + "</b>" + esc(f.titulo) + "</a>").join('<span class="fx-seta-fase">›</span>') +
      '<span class="fx-seta-fase">·</span><a href="#paralelos" data-fase="paralelos"><b>+</b>O tempo todo</a>';
    $("fxConteudo").innerHTML = FASES.map((f) =>
      '<section class="fx-fase" id="fase-' + f.id + '"><div class="fx-fase-titulo"><span class="fx-fase-num">' + f.numero + "</span><div><h2>" + esc(f.titulo) + "</h2><p>" + esc(f.resumo) + "</p></div></div>" +
      '<div class="fx-trilho">' + f.nos.map(no).join("") + "</div></section>").join("") +
      '<section class="fx-fase" id="paralelos"><div class="fx-fase-titulo"><span class="fx-fase-num">+</span><div><h2>Acontece o tempo todo</h2><p>Em paralelo ao pedido.</p></div></div><div class="fx-paralelos">' +
      PARALELOS.map((p) => { const s = SETORES[p.setor]; return '<article class="fx-caixa" style="--c:' + s.cor + '"><header><h3>' + esc(p.titulo) + "</h3></header><ul class=\"fx-lista fx-faz\">" +
        p.itens.map((i) => "<li>" + esc(i.texto) + (i.tela ? ' <button type="button" class="fx-link" data-tela="' + esc(i.tela) + '"' + (podeAbrir(i.tela) ? "" : " disabled") + ">abrir</button>" : "") + "</li>").join("") + "</ul></article>"; }).join("") + "</div></section>";
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tela]");
    if (b && !b.disabled && b.dataset.tela) { e.preventDefault(); abrir(b.dataset.tela); return; }
    const a = e.target.closest("[data-fase]");
    if (a) { e.preventDefault(); document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });

  // marca a fase visível no topo
  function vigiarFases() {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return;
      document.querySelectorAll("#fxFases a").forEach((a) => a.classList.toggle("is-ativa", a.getAttribute("href") === "#" + en.target.id));
    }), { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".fx-fase").forEach((s) => io.observe(s));
  }

  async function iniciar() {
    render(); vigiarFases();
    try { await window.EasyLocPermissions?.load?.(); render(); vigiarFases(); } catch (_) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.AcervoFluxo = { FASES, PARALELOS, SETORES };
})();
