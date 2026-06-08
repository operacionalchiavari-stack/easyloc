
(function(){

  let dados = [];
  let selecionados = [];
  let fluxosSelecionados = [];
  let timeoutAtualizacao = null;
  let telaAtual = "itens";
  let intervaloPainel = null;
  let timerItens = null;
  let scrollInterval = null;
  let itensCache = [];
  let ordemServicosInicializado = false;

  function ensureSupabase(){
  if(!window.supabaseClient){
    console.error("window.supabaseClient não encontrado");
    throw new Error("window.supabaseClient não encontrado");
  }
  return window.supabaseClient;
}

function runPromise(promise, callbacks){
  promise
    .then(res => {
      if(callbacks.success) callbacks.success(res);
    })
    .catch(err => {
      if(callbacks.failure) callbacks.failure(err);
      else console.error(err);
    });
}

function avisar(mensagem, titulo = "Atenção", tipo = "aviso"){
  if(typeof window.alerta === "function"){
    window.alerta(mensagem, titulo, tipo);
    return;
  }

  alert(mensagem);
}

function createScriptRun(callbacks){
  return {
    withSuccessHandler(fn){ callbacks.success = fn; return this; },
    withFailureHandler(fn){ callbacks.failure = fn; return this; },
    buscarItensDanificados(){ runPromise(buscarItensDanificados(), callbacks); return this; },
    salvarOS(dados){ runPromise(salvarOS(dados), callbacks); return this; },
    validarSenha(setor, senha){ runPromise(validarSenha(setor, senha), callbacks); return this; },
    getCategorias(){ runPromise(getCategorias(), callbacks); return this; },
    getItensPorCategoria(categoria){ runPromise(getItensPorCategoria(categoria), callbacks); return this; },
    atualizarDataUrgencia(id, data){ runPromise(atualizarDataUrgencia(id, data), callbacks); return this; },
    darBaixaOS(ids){ runPromise(darBaixaOS(ids), callbacks); return this; },
    encaminharOS(id, setor){ runPromise(encaminharOS(id, setor), callbacks); return this; },
    getDesempenhoMensal(){ runPromise(getDesempenhoMensal(), callbacks); return this; },
    getTetoGastosMensal(){ runPromise(getTetoGastosMensal(), callbacks); return this; },
    getMetasSetoresMensal(){ runPromise(getMetasSetoresMensal(), callbacks); return this; },
    getProducaoSetoresMes(){ runPromise(getProducaoSetoresMes(), callbacks); return this; }
  };
}

const scriptRun = {
  withSuccessHandler(fn){ return createScriptRun({ success: fn, failure: null }); },
  withFailureHandler(fn){ return createScriptRun({ success: null, failure: fn }); }
};

async function buscarItensDanificados(){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("itens_danificados") // ajustar conforme banco
    .select("*");
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function salvarOS(dados){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("ordens_servico") // ajustar conforme banco
    .insert([dados]);
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function validarSenha(setor, senha){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("senhas") // ajustar conforme banco
    .select("*")
    .eq("setor", setor)
    .eq("senha", senha)
    .maybeSingle();
  if(error){
    console.error(error);
    throw error;
  }
  return { ok: Boolean(data), msg: data ? "OK" : "Senha inválida" };
}

async function getCategorias(){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("categorias") // ajustar conforme banco
    .select("nome")
    .order("nome");
  if(error){
    console.error(error);
    throw error;
  }
  return (data || []).map(item => item.nome);
}

async function getItensPorCategoria(categoria){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("itens") // ajustar conforme banco
    .select("nome, codigo")
    .eq("categoria", categoria)
    .order("nome");
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function atualizarDataUrgencia(id, dataU){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("ordens_servico") // ajustar conforme banco
    .update({ dataU })
    .eq("id", id);
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function darBaixaOS(ids){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("ordens_servico") // ajustar conforme banco
    .update({ c11: "Concluído" })
    .in("id", ids);
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function encaminharOS(id, setor){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("ordens_servico") // ajustar conforme banco
    .update({ setor })
    .eq("id", id);
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function getDesempenhoMensal(){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("desempenho_mensal") // ajustar conforme banco
    .select("*");
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function getTetoGastosMensal(){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("teto_gastos_mensal") // ajustar conforme banco
    .select("*");
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function getMetasSetoresMensal(){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("metas_setores_mensal") // ajustar conforme banco
    .select("*");
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

async function getProducaoSetoresMes(){
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("producao_setores_mes") // ajustar conforme banco
    .select("*");
  if(error){
    console.error(error);
    throw error;
  }
  return data;
}

function carregar(){

  console.log("⛔ carregar bloqueado (sem banco)");

  return;

  scriptRun
    .withSuccessHandler(function(res){
      dados = res || [];
      window.dados = dados;
      filtros();
      render();
      atualizarHorario();
    })
    .withFailureHandler(err => {
      console.error("Erro ao carregar itens danificados:", err);
      dados = [];
      window.dados = dados;
      filtros();
      render();
      atualizarHorario();
    })
    .buscarItensDanificados();

}

function render(){

  if(!Array.isArray(dados)){
    console.error("dados inválido:", dados);
    return;
  }

const tb = document.getElementById("tabela");
if(!tb){
  console.error("tabela não encontrada");
  return;
}

// 🔥 SE NÃO TEM DADOS (modo front), NÃO APAGA HTML
if(!dados || dados.length === 0){
  console.log("🟡 Modo front - mantendo dados fake");
  return;
}

tb.innerHTML = "";

  const fSetor = document.getElementById("filtroSetor")?.value || "";
  const fNome = document.getElementById("filtroNome")?.value || "";
  const fOS = document.getElementById("filtroOS")?.value || "";
  const fOnde = document.getElementById("filtroOnde")?.value || "";
  const fPedido = document.getElementById("filtroPedido")?.value || "";

  // 🔥 FILTRAR
  const filtrados = dados.filter(x => {

    if(fSetor && x.setor !== fSetor) return false;
    if(fNome && x.nome !== fNome) return false;
    if(fOS && !String(x.os).includes(fOS)) return false;
    if(fOnde && x.onde !== fOnde) return false;
    if(fPedido && !String(x.pedido).includes(fPedido)) return false;

    const todosFluxos = [
      "Solda",
      "Acabamento e Pintura",
      "Costura",
      "Forração",
      "Limpeza de Estofados",
      "Reparo"
    ];

    const filtroFluxoAtivo = 
      fluxosSelecionados.length > 0 &&
      fluxosSelecionados.length < todosFluxos.length;

    if(filtroFluxoAtivo){
      const listaFluxo = [x.c7, x.c8, x.c9, x.c10].filter(v => v);
      const ultimo = listaFluxo[listaFluxo.length - 1];

      if(!fluxosSelecionados.includes(ultimo)) return false;
    }

// 🔥 NÃO MOSTRAR CONCLUÍDOS (COLUNA L)
if(String(x.c11).toLowerCase().trim().includes("concluído")) return false;

return true;
  });

  // 🔥 AGRUPAR PELO SETOR RESPONSÁVEL (ÚLTIMO FLUXO)
  const grupos = {};

  filtrados.forEach(x => {

    const listaFluxo = [x.c7, x.c8, x.c9, x.c10].filter(v => v);
    const responsavel = listaFluxo[listaFluxo.length - 1] || "Sem setor";

    if(!grupos[responsavel]) grupos[responsavel] = [];
    grupos[responsavel].push(x);
  });

  const gruposOrdenados = Object.keys(grupos);

  // 🔥 RENDER SEM HEADER (SEM BARRA)
  gruposOrdenados.forEach(grupo => {

    const lista = grupos[grupo];

    // 🔥 ordenar por urgência
    lista.sort((a,b) => {
      const da = new Date(a.dataU || "9999-12-31");
      const db = new Date(b.dataU || "9999-12-31");
      return da - db;
    });

    lista.forEach(x => {

      const listaFluxo = [x.c7,x.c8,x.c9,x.c10].filter(v => v);
      const ultimo = listaFluxo[listaFluxo.length - 1];

      const fluxo = `
        <div class="fluxo-linha">
          ${listaFluxo.map(v => {

            const classe = v
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "");

            const ativo = v === ultimo;

            return `
              <span class="tag ${classe} ${ativo ? "ativo" : "inativo"}">
                ${v}
              </span>
            `;
          }).join("")}
        </div>
      `;

      tb.innerHTML += `
<tr onclick='toggleSelecionado(this, "${x.id || ""}")'>
          <td>${formatarDataHora(x.data)}</td>
          <td>${x.setor || ""}</td>
          <td>${x.nome || ""}</td>
          <td class="col-os">${x.os || ""}</td>
<td>${(x.item || "").replace(/"/g, "")}</td>
          <td>${x.qtd || ""}</td>
          <td>${fluxo}</td>
          <td>${x.onde || ""}</td>
          <td class="col-pedido">${x.pedido ? x.pedido : "-"}</td>
<td>${(x.detalhes || "").replace(/"/g, "")}</td>
          <td>
            <input 
              type="date"
              value="${formatarDataInput(x.dataU)}"
              data-id="${x.id}"
              class="input-data-urgencia ${classeUrgencia(x.dataU)}"
              onclick="event.stopPropagation()"
            >
          </td>
        </tr>
      `;
    });

  });

}

// 🔥 FUNÇÃO FILTROS (FORA DO RENDER)
// 🔥 FUNÇÃO FILTROS (CORRIGIDA)
function filtros(){

  if(!Array.isArray(dados)) return;

  const setores = [...new Set(dados.map(x => x.setor))];
  const nomes   = [...new Set(dados.map(x => x.nome))];

  // 🔥 FLUXOS (c7 até c10)
  const fluxos = [
    ...new Set(
      dados.flatMap(x => [x.c7, x.c8, x.c9, x.c10])
    )
  ].filter(v => v);

  // 🔥 DROPDOWN MULTI (checkbox)
  const container = document.getElementById("dropdownFluxo");

  if(container){
    container.innerHTML = fluxos.map(f => `
      <label>
        <input type="checkbox" value="${f}" checked onchange="filtrarFluxo()">
        <span>${f}</span>
      </label>
    `).join("");

    // 🔥 já inicia com todos selecionados
    fluxosSelecionados = [...fluxos];
  }

  // 🔥 FILTRO SETOR
  const elSetor = document.getElementById("filtroSetor");
  if(elSetor){
    elSetor.innerHTML =
      `<option value="">Setor (todos)</option>` +
      setores.map(s => `<option value="${s}">${s}</option>`).join("");
  }

  // 🔥 FILTRO NOME
  const elNome = document.getElementById("filtroNome");
  if(elNome){
    elNome.innerHTML =
      `<option value="">Quem enviou (todos)</option>` +
      nomes.map(n => `<option value="${n}">${n}</option>`).join("");
  }

}

function abrirModal(){
  document.getElementById("modal").style.display="flex";
}

function fecharModal(){
  document.getElementById("modal").style.display="none";
}

function salvar(){

  const dadosEnvio={
    nome: nome.value,
    setor: setor.value,
    item: item.value,
    qtd: qtd.value,
    detalhes: detalhes.value
  };

scriptRun.withSuccessHandler(()=> {
  fecharModal();
  carregar(); // 🔥 CORRETO
}).salvarOS(dadosEnvio);
}


// 🔥 DESATIVADO TEMPORARIAMENTE (SEM BANCO)
// window.addEventListener("DOMContentLoaded", carregar);
function abrirModalOS(){

  document.getElementById("modalOS").style.display = "flex";

  // 🔥 LIMPAR INPUTS
  document.querySelectorAll("#modalOS input").forEach(i => i.value = "");
  document.querySelectorAll("#modalOS textarea").forEach(i => i.value = "");
  document.querySelectorAll("#modalOS select").forEach(i => i.selectedIndex = 0);

  // 🔥 LIMPAR RADIO BUTTONS
  document.querySelectorAll("#modalOS .radio-option").forEach(btn => {
    btn.classList.remove("selected");
  });

  // 🔥 ESCONDER CAMPOS CONDICIONAIS
  const data = document.getElementById("dataContainer");
  if(data) data.style.display = "none";

  const pedido = document.getElementById("pedidoContainer");
  if(pedido) pedido.style.display = "none";

  const os = document.getElementById("osContainer");
  if(os) os.style.display = "none";

  // 🔥 LIMPAR CODIGO
  const codigo = document.getElementById("codigoItem");
  if(codigo) codigo.value = "";

  // 🔥 LIMPAR CACHE DE ITENS
  itensCache = [];

  // 🔥 RECARREGAR CATEGORIAS
  carregarCategorias();

}

function fecharModalOS(){
  document.getElementById("modalOS").style.display = "none";
}

function handleDocumentClick(e){

  // FECHAR MODAL
  if(e.target.id === "modalOS"){
    fecharModalOS();
  }

  if(e.target.id === "modal"){
    fecharModal();
  }

  // RADIO BUTTONS (SELEÇÃO)
  const botao = e.target.closest(".radio-option");

  if(botao){
    const grupo = botao.closest(".radio-group");
    if(!grupo) return;

    grupo.querySelectorAll(".radio-option").forEach(op=>{
      op.classList.remove("selected");
    });

    botao.classList.add("selected");

    // 🔥 AÇÕES ESPECÍFICAS

    // SAI SEMANA
    if(grupo.id === "saiSemana"){
      document.getElementById("dataContainer").style.display =
        botao.dataset.value === "Sim" ? "block" : "none";
    }

    // ONDE DANO
    if(grupo.id === "ondeDano"){
      document.getElementById("pedidoContainer").style.display =
        botao.dataset.value === "Evento" ? "block" : "none";
    }

    // SETOR (caso volte AL depois)
    if(grupo.id === "setor"){
      document.getElementById("osContainer").style.display =
        botao.dataset.value === "AL" ? "block" : "none";
    }

  }

}

function salvarOSModal(){

  const dados = {
    setor: document.querySelector("#setor .selected")?.dataset.value || "",
    senha: document.getElementById("senha").value || "",
    numeroOS: document.getElementById("numeroOS").value || "",
    nome: document.querySelector("#nome .selected")?.dataset.value || "",
    categoria: document.getElementById("categoria").value || "",
    item: document.getElementById("item").value || "",
    codigoItem: document.getElementById("codigoItem").value || "",
    quantidade: document.getElementById("quantidade").value || "",
    setorSolicitado: document.querySelector("#setorSolicitado .selected")?.dataset.value || "",
    saiSemana: document.querySelector("#saiSemana .selected")?.dataset.value || "",
    dataLimite: document.getElementById("dataLimite").value || "",
    ondeDano: document.querySelector("#ondeDano .selected")?.dataset.value || "",
    numeroPedido: document.getElementById("numeroPedido").value || "",
    detalhes: document.getElementById("detalhes").value || ""
  };

  // 🔥 VALIDAÇÃO (AQUI É O LUGAR CERTO)
  if(!dados.setor || !dados.nome || !dados.item || !dados.quantidade){
    avisar("Preencha os campos obrigatórios");
    return;
  }

  if(dados.ondeDano === "Evento" && !dados.numeroPedido){
    avisar("Preencha o número do pedido");
    return;
  }
if(!dados.codigoItem){
  avisar("Selecione um item válido da lista (código obrigatório)");
  return;
}
  // 🔥 ENVIO PRO GS
scriptRun
  .withSuccessHandler(res => {

    if(!res.ok){
      avisar(res.msg);
      return;
    }

    // 🔥 SE SENHA OK → SALVA
    scriptRun
.withSuccessHandler(() => {
  fecharModalOS();
  carregar(); // 🔥 CORRETO
})
      .salvarOS(dados);

  })
  .validarSenha(dados.setor, dados.senha);

}
// 🔹 CARREGAR CATEGORIAS AO ABRIR
function carregarCategorias(){

  scriptRun.withSuccessHandler(lista => {

    const select = document.getElementById("categoria");

    select.innerHTML =
      `<option value="">Selecione uma categoria...</option>` +
      lista.map(c => `<option value="${c}">${c}</option>`).join("");

  }).getCategorias();

}

// 🔹 QUANDO MUDAR CATEGORIA
function handleDocumentChange(e){
  if(e.target.id === "categoria"){

    const categoria = e.target.value;

    // 🔥 LIMPA ITEM E CODIGO SEMPRE
    document.getElementById("item").value = "";
    document.getElementById("codigoItem").value = "";
    itensCache = [];

    if(!categoria) return;

    scriptRun.withSuccessHandler(lista => {

      itensCache = lista;

      const datalist = document.getElementById("itensList");

      datalist.innerHTML = lista.map(i =>
        `<option value="${i.nome}"></option>`
      ).join("");

    }).getItensPorCategoria(categoria);

    return;
  }

  if(e.target.classList.contains("input-data-urgencia")){

    const id = e.target.dataset.id;
    const novaData = e.target.value;

    if(!id || !novaData) return;

    e.target.style.background = "#fff3cd"; // amarelo (salvando)

    scriptRun
      .withSuccessHandler(() => {
        e.target.style.background = "#d1fae5";

        setTimeout(()=> {
          e.target.style.background = "";
        }, 500);

        carregar(); // 🔥 ATUALIZA TUDO E REORDENA

      })
      .withFailureHandler(() => {
        e.target.style.background = "#fecaca"; // vermelho (erro)
      })
      .atualizarDataUrgencia(id, novaData);

  }
}

function handleDocumentInput(e){
  if(e.target.id === "item"){

    const nomeDigitado = e.target.value;

    const item = (itensCache || []).find(i => i.nome === nomeDigitado);

    if(item){
      document.getElementById("codigoItem").value = item.codigo;
    } else {
      document.getElementById("codigoItem").value = "";
    }

    return;
  }

  if([
    "filtroSetor",
    "filtroNome",
    "filtroOS",
    "filtroOnde",
    "filtroPedido",
    "filtroFluxo"
  ].includes(e.target.id)){
    render();
  }
}

function formatarDataHora(data){

  if(!data) return "";

  const d = new Date(data);

  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

}
function formatarData(data){

  if(!data) return "";

  const d = new Date(data);

  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

}

function formatarDataInput(data){

  if(!data) return "";

  const d = new Date(data);

  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function toggleSelecionado(el, id){

  const index = selecionados.indexOf(id);

  if(index > -1){
    selecionados.splice(index, 1);
    el.classList.remove("linha-selecionada");
  } else {
    selecionados.push(id);
    el.classList.add("linha-selecionada");
  }

}

function abrirBaixa(){

  if(selecionados.length === 0){
    avisar("Selecione pelo menos uma O.S");
    return;
  }

  document.getElementById("modalSenha").style.display = "flex";

}

function validarSenhaBaixa(){

  const senha = document.getElementById("senhaBaixa").value;

  scriptRun
    .withSuccessHandler(res => {

      if(!res.ok){
        avisar("Senha incorreta", "Erro", "erro");
        return;
      }

      document.getElementById("modalSenha").style.display = "none";
      document.getElementById("modalChecklist").style.display = "flex";

    })
.validarSenha("estoque", senha)

}

function confirmarBaixa(){

  const checks = [
    "chk1","chk2","chk3","chk4","chk5","chk6"
  ];

  const todosOk = checks.every(id => document.getElementById(id).checked);

  if(!todosOk){
    avisar("Complete todo o checklist antes de finalizar.");
    return;
  }

  if(!document.getElementById("chkResponsabilidade").checked){
    avisar("Confirme a responsabilidade antes de finalizar.");
    return;
  }

  scriptRun
    .withSuccessHandler(() => {
      avisar("Baixa concluída!", "Sucesso", "sucesso");
      location.reload();
    })
    .darBaixaOS(selecionados);

}
function toggleDropdown(){
  const el = document.getElementById("dropdownFluxo");
  if (!el) return;

  el.style.display = el.style.display === "block" ? "none" : "block";
}

function filtrarFluxo(){

  const checks = document.querySelectorAll("#dropdownFluxo input:checked");

  fluxosSelecionados = [...checks].map(c => c.value);

  render();
}
function classeUrgencia(dataStr){

  if(!dataStr) return "";

  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  const data = new Date(dataStr);
  data.setHours(0,0,0,0);

  const diff = (data - hoje) / (1000 * 60 * 60 * 24);

  if(diff <= 3) return "urgente";
  if(diff <= 7) return "atencao";

  return "";
}
function fecharModalSenha(){
  document.getElementById("modalSenha").style.display = "none";
}

function fecharChecklist(){
  document.getElementById("modalChecklist").style.display = "none";
}
function abrirEncaminhamento(){

  if(selecionados.length !== 1){
    avisar("Selecione apenas uma O.S");
    return;
  }

  document.getElementById("modalEncaminhar").style.display = "flex";
}

function fecharEncaminhar(){
  document.getElementById("modalEncaminhar").style.display = "none";
}

function confirmarEncaminhar(){

  const setor = document.getElementById("setorEncaminhar").value;

  if(!setor){
    avisar("Selecione um setor");
    return;
  }

  const id = selecionados[0];

  scriptRun
    .withSuccessHandler(() => {
      fecharEncaminhar();
      carregar();
    })
    .encaminharOS(id, setor);

}

function resetarTimer(){

  clearTimeout(timeoutAtualizacao);

  timeoutAtualizacao = setTimeout(() => {
    carregar();
  }, 10000); // 🔥 10s após parar

}

function handleInteractionEvent(){
  resetarTimer();
}

// 🔥 DESATIVADO TEMPORARIAMENTE
// resetarTimer();

// =========================
// 🔥 PAINEL AUTOMÁTICO
// =========================

function irParaPainel(pagina){

  // ❌ NÃO REDIRECIONA MAIS
  // 🔥 só troca tela interna

  if(pagina === "itens"){
    mostrarItens();
  } else {
    mostrarDashboard();
  }

}

// 🔥 CONTROLADO PELO MODULE LOADER
// window.onload = function(){
//   mostrarItens();
// };

function iniciarPainel(){

  document.getElementById("filtros").style.display = "none";
  document.getElementById("acoesTopo").style.display = "none";

  mostrarItens();

}

function mostrarItens(){

  telaAtual = "itens";

  document.querySelector(".table-container").style.display = "block";
  document.getElementById("telaDashboard").style.display = "none";

  window.scrollTo({ top: 0 });

  // 🔥 depois de 10s volta pro dashboard
timerItens = setTimeout(() => {
  mostrarDashboard();
}, 30000); // 30s na tela de itens

}

function mostrarDashboard(){

if(timerItens){
  clearTimeout(timerItens);
  timerItens = null;
}
  telaAtual = "dashboard";

  document.querySelector(".table-container").style.display = "none";
  const dash = document.getElementById("telaDashboard");
  dash.style.display = "block";

  // 🔥 CARREGA DADOS
if(typeof carregarDesempenho === "function"){
  carregarDesempenho();
  carregarTetoGastos();
  carregarMetasSetores();
  carregarProducao();
}

  // 🔥 GARANTE QUE COMEÇA DO TOPO
  window.scrollTo({ top: 0, behavior: "auto" });

  // 🔥 ESPERA UM POUCO PRA RENDERIZAR
  setTimeout(() => {

let pos = 0;
const alturaMax = document.body.scrollHeight - window.innerHeight;

const velocidade = 0.5;

if(scrollInterval){
  clearInterval(scrollInterval);
}

scrollInterval = setInterval(() => {

  pos += velocidade;

  window.scrollTo(0, pos);

  if(pos >= alturaMax){

    clearInterval(scrollInterval);
    scrollInterval = null;

setTimeout(() => {
  mostrarItens();
}, 10000); // 10s depois de chegar no final

  }

}, 16);


  }, 1000); // 🔥 tempo pra montar layout

}

// =========================
// 🔥 DASHBOARD
// =========================


function carregarDesempenho() {
  scriptRun
    .withSuccessHandler(renderDesempenho)
    .withFailureHandler(function(erro){
      console.error("ERRO GS:", erro);
      const container = document.querySelector(".behavior-grid");
      if (container) {
        container.innerHTML = `
          <div class="behavior-card" style="grid-column:1/-1; text-align:center; color:#b91c1c; font-weight:700;">
            Erro ao carregar desempenho: ${erro.message || erro}
          </div>
        `;
      }
    })
    .getDesempenhoMensal();
}

function estrelas(valor) {
  const nota = Math.max(0, Math.min(10, Number(valor) || 0));
  const cheio = Math.round(nota / 2);
  return "★".repeat(cheio) + "☆".repeat(5 - cheio);
}

function renderDesempenho(dados) {
  const container = document.querySelector(".behavior-grid");
  if (!container) return;

  if (!dados || dados.length === 0) {
    container.innerHTML = `
      <div class="behavior-card" style="grid-column:1/-1; text-align:center; font-weight:700;">
        Nenhum dado encontrado para o mês atual.
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  dados.forEach(s => {
    const card = document.createElement("div");
    card.className = "behavior-card";

    card.innerHTML = `
      <div class="behavior-title">${s.setor}</div>

      <div class="metric-row">
        <span>Profissionalismo</span>
        <span class="stars">${estrelas(s.profissionalismo)}</span>
        <span class="score">${Number(s.profissionalismo).toFixed(2)}</span>
      </div>

      <div class="metric-row">
        <span>Organização</span>
        <span class="stars">${estrelas(s.organizacao)}</span>
        <span class="score">${Number(s.organizacao).toFixed(2)}</span>
      </div>

      <div class="metric-row">
        <span>Pontualidade</span>
        <span class="stars">${estrelas(s.pontualidade)}</span>
        <span class="score">${Number(s.pontualidade).toFixed(2)}</span>
      </div>

      <div class="metric-row">
        <span>Segurança</span>
        <span class="stars">${estrelas(s.seguranca)}</span>
        <span class="score">${Number(s.seguranca).toFixed(2)}</span>
      </div>

      <div class="metric-row">
        <span>Reciclagem</span>
        <span class="stars">${estrelas(s.reciclagem)}</span>
        <span class="score">${Number(s.reciclagem).toFixed(2)}</span>
      </div>
    `;

    container.appendChild(card);
  });
}
function carregarTetoGastos(){
  scriptRun
    .withSuccessHandler(renderTetoGastos)
    .getTetoGastosMensal();
}

function renderTetoGastos(dados) {
  const mapa = new Map(
    (dados || []).map(x => [String(x.setor || "").trim(), x])
  );

  document.querySelectorAll(".teto-grid .circle-card").forEach(card => {
    const nome = card.dataset.setor;
    const info = mapa.get(nome);

    if (!info) {
      card.querySelector(".circle-progress").style.setProperty("--value", 0);
      card.querySelector(".circle-progress").style.setProperty("--color", "var(--green)");
      card.querySelector(".circle-value").innerText = "0%";
      card.querySelector(".circle-meta").innerText = "Sem dados no mês";
      return;
    }

    const el = card.querySelector(".circle-progress");
    const valor = Math.min(999, Number(info.percentual) || 0);

    el.style.setProperty("--value", Math.min(valor, 100));

    let cor = "var(--green)";
    if (valor > 85) cor = "var(--red)";
    else if (valor > 70) cor = "var(--yellow)";

    el.style.setProperty("--color", cor);

    card.querySelector(".circle-value").innerText = `${valor.toFixed(1)}%`;
card.querySelector(".circle-meta").innerText = "";
  });
}

function carregarMetasSetores(){
  scriptRun
    .withSuccessHandler(renderMetasSetores)
    .getMetasSetoresMensal();
}
function renderMetasSetores(dados){

function normalizar(txt){
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const mapa = new Map(
  (dados || []).map(x => [normalizar(x.setor), x])
);

  document.querySelectorAll(".card-setor").forEach(card => {

    const tituloEl = card.querySelector(".titulo-setor");
    if (!tituloEl) return;

const nome = normalizar(tituloEl.innerText);
const info = mapa.get(nome);

    // remove grid antiga, se existir
    const gridAntiga = card.querySelector(".circle-grid");
    if (gridAntiga) gridAntiga.remove();

    // cria a grade sempre
    const grid = document.createElement("div");
    grid.className = "circle-grid";

    const valor = info ? Number(info.producao || 0) : 0;

    let cor = "var(--green)";
    if (valor < 70) cor = "var(--red)";
    else if (valor < 85) cor = "var(--yellow)";

const qualidade = info ? Number(info.qualidade || 0) : 0;
const prazo = info ? Number(info.prazo || 0) : 0;
const tempo = info ? Number(info.tempo || 0) : 0;

function corMeta(v){
  if(v < 70) return "var(--red)";
  if(v < 85) return "var(--yellow)";
  return "var(--green)";
}

grid.innerHTML = `
  <div class="circle-card">
    <div class="circle-progress mini" style="--value:${valor}; --color:${corMeta(valor)};">
      <div class="circle-value">${valor.toFixed(0)}%</div>
    </div>
    <div class="circle-label">Produção</div>
  </div>

  <div class="circle-card">
    <div class="circle-progress mini" style="--value:${qualidade}; --color:${corMeta(qualidade)};">
      <div class="circle-value">${qualidade.toFixed(0)}%</div>
    </div>
    <div class="circle-label">Qualidade</div>
  </div>

  <div class="circle-card">
    <div class="circle-progress mini" style="--value:${prazo}; --color:${corMeta(prazo)};">
      <div class="circle-value">${prazo.toFixed(0)}%</div>
    </div>
    <div class="circle-label">Prazo</div>
  </div>

  <div class="circle-card">
    <div class="circle-progress mini" style="--value:${tempo}; --color:${corMeta(tempo)};">
      <div class="circle-value">${tempo.toFixed(0)}%</div>
    </div>
    <div class="circle-label">Tempo Médio</div>
  </div>
`;

    card.appendChild(grid);
  });

}
function isConcluido(valor){

  const status = String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return status.includes("concluido");

}

function carregarProducao(){

  scriptRun
    .withSuccessHandler(renderProducao)
    .withFailureHandler(err => {
      console.error("Erro produção:", err);
    })
    .getProducaoSetoresMes();

}
function renderProducao(lista){

  console.log("PRODUCAO:", lista); // 🔥 pra você ver no console

  if(!Array.isArray(lista)) return;

  lista.forEach(s => {

    const card = document.querySelector(`.circle-card[data-setor="${s.setor}"]`);
    if(!card) return;

    const perc = Math.round(s.percentual || 0);

    const circle = card.querySelector(".circle-progress");
    const value  = card.querySelector(".circle-value");
    const meta   = card.querySelector(".circle-meta");

    if(circle){
      circle.style.setProperty("--value", perc);

      let cor = "var(--green)";
      if(perc >= 100) cor = "var(--green)";
      else if(perc >= 70) cor = "var(--yellow)";
      else cor = "var(--red)";

      circle.style.setProperty("--color", cor);
    }

    if(value){
      value.innerText = perc + "%";
    }

    if(meta){
      meta.innerText = `${s.producao} / ${s.meta}`;
    }

  });

}
// 🔥 DESATIVADO TEMPORARIAMENTE (SEM BACKEND)
// setInterval(() => {

//   console.log("🔄 Atualizando painel...");

//   carregar();

//   if(telaAtual === "dashboard"){
//     if(typeof carregarDesempenho === "function"){
//       carregarDesempenho();
//       carregarTetoGastos();
//       carregarMetasSetores();
//       carregarProducao();
//     }
//   }

// }, 10000);

function atualizarHorario(){

  const el = document.getElementById("ultimaAtualizacao");
  if(!el) return;

  const agora = new Date();

  const hora = agora.toLocaleTimeString("pt-BR");

  el.innerText = `• Atualizado às ${hora}`;

}
function sairPainel(){

  // 🔥 PARA QUALQUER SCROLL AUTOMÁTICO
  if(scrollInterval){
    clearInterval(scrollInterval);
    scrollInterval = null;
  }

  // 🔥 PARA VOLTA AUTOMÁTICA
  if(timerItens){
    clearTimeout(timerItens);
    timerItens = null;
  }

  // 🔥 MOSTRA INTERFACE NORMAL
  document.getElementById("filtros").style.display = "flex";
  document.getElementById("acoesTopo").style.display = "flex";

  // 🔥 VOLTA PRA TELA INICIAL LIMPA
  document.querySelector(".table-container").style.display = "block";
  document.getElementById("telaDashboard").style.display = "none";

  // 🔥 VOLTA PRO TOPO
  window.scrollTo({ top: 0, behavior: "auto" });

}

function addModuleListeners(){
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("input", handleDocumentInput);
  document.addEventListener("mousedown", handleInteractionEvent);
  document.addEventListener("keydown", handleInteractionEvent);
  document.addEventListener("touchstart", handleInteractionEvent);
}

function removeModuleListeners(){
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("change", handleDocumentChange);
  document.removeEventListener("input", handleDocumentInput);
  document.removeEventListener("mousedown", handleInteractionEvent);
  document.removeEventListener("keydown", handleInteractionEvent);
  document.removeEventListener("touchstart", handleInteractionEvent);
}

function initOrdemServicos(){
  if(ordemServicosInicializado) return;
  ordemServicosInicializado = true;
  window.__ordemServicosLoaded = true;

  addModuleListeners();

  console.log("🚀 Modo FRONT (sem banco)");

  mostrarItens();

  // ❌ NÃO CHAMA BACKEND
  // carregar();

  window.finalizarCarregamentoModulo?.();
}
function destroyOrdemServicos(){
  removeModuleListeners();

  clearTimeout(timeoutAtualizacao);
  clearTimeout(timerItens);
  clearInterval(scrollInterval);

  ordemServicosInicializado = false;
  window.__ordemServicosLoaded = false;
}

window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.salvar = salvar;
window.abrirModalOS = abrirModalOS;
window.fecharModalOS = fecharModalOS;
window.salvarOSModal = salvarOSModal;
window.abrirBaixa = abrirBaixa;
window.validarSenhaBaixa = validarSenhaBaixa;
window.confirmarBaixa = confirmarBaixa;
window.toggleDropdown = toggleDropdown;
window.filtrarFluxo = filtrarFluxo;
window.fecharModalSenha = fecharModalSenha;
window.fecharChecklist = fecharChecklist;
window.abrirEncaminhamento = abrirEncaminhamento;
window.fecharEncaminhar = fecharEncaminhar;
window.confirmarEncaminhar = confirmarEncaminhar;
window.iniciarPainel = iniciarPainel;
window.sairPainel = sairPainel;
window.toggleSelecionado = toggleSelecionado;
window.__moduleInit = initOrdemServicos;
window.__activeModuleDestroy = destroyOrdemServicos;

})();
