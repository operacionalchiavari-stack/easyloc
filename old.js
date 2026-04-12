if (!window.__cronogramaState) {
  window.__cronogramaState = {
    semanaInicioAtual: null,
    cronogramaData: []
  };
}

let semanaInicioAtual = window.__cronogramaState.semanaInicioAtual;
let cronogramaData = window.__cronogramaState.cronogramaData;

    const DIAS_SEMANA = ["Ter", "Qua", "Qui", "Sex", "SÃ¡b", "Dom", "Seg"];

    function iniciar(){
      semanaInicioAtual = getInicioSemanaOperacional(new Date());
      atualizarCabecalhoSemana();
      carregarCronograma();

      window.__cronogramaState.semanaInicioAtual = semanaInicioAtual;
window.__cronogramaState.cronogramaData = cronogramaData;
    }

    function getInicioSemanaOperacional(dataBase){
      const d = new Date(dataBase);
      d.setHours(0,0,0,0);

      const day = d.getDay(); // 0 dom, 1 seg, 2 ter...
      let diff;

      if(day === 2){
        diff = 0;
      }else if(day > 2){
        diff = day - 2;
      }else{
        diff = day + 5;
      }

      d.setDate(d.getDate() - diff);
      return d;
    }

    function formatDateISO(date){
      const y = date.getFullYear();
      const m = String(date.getMonth()+1).padStart(2,"0");
      const d = String(date.getDate()).padStart(2,"0");
      return `${y}-${m}-${d}`;
    }

function parseDateAny(value){
  if(!value) return null;

  // jÃ¡ Ã© Date
  if(value instanceof Date){
    const d = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    return d;
  }

  if(typeof value === "string"){

    // ISO (YYYY-MM-DD) â†’ TRATAR NA MÃƒO (SEM new Date)
    if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
      const [y,m,d] = value.split("-");
      return new Date(Number(y), Number(m)-1, Number(d));
    }

    // BR
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(value)){
      const [d,m,y] = value.split("/");
      return new Date(Number(y), Number(m)-1, Number(d));
    }

    // fallback
    const d = new Date(value);
    if(!isNaN(d)){
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return null;
}

    function formatDateBR(value){
      const d = parseDateAny(value);
      if(!d) return "-";
      return d.toLocaleDateString("pt-BR");
    }

    function formatWeekRange(startDate){
      const end = new Date(startDate);
      end.setDate(end.getDate() + 6);

      return `${formatDateBR(startDate)} atÃ© ${formatDateBR(end)}`;
    }

    function atualizarCabecalhoSemana(){
      document.getElementById("weekLabel").textContent = `Semana: ${formatWeekRange(semanaInicioAtual)}`;

      for(let i=0; i<7; i++){
        const d = new Date(semanaInicioAtual);
        d.setDate(d.getDate() + i);
        document.getElementById(`th${i}`).textContent = `${DIAS_SEMANA[i]} ${d.toLocaleDateString("pt-BR")}`;
      }
    }

    function mudarSemana(qtdDias){
      semanaInicioAtual.setDate(semanaInicioAtual.getDate() + qtdDias);
      semanaInicioAtual = getInicioSemanaOperacional(semanaInicioAtual);
      atualizarCabecalhoSemana();
      carregarCronograma();
    }

    function mostrarLoading(texto = "Carregando..."){
      const box = document.getElementById("loadingBox");
      box.textContent = texto;
      box.classList.add("show");
    }

    function esconderLoading(){
      document.getElementById("loadingBox").classList.remove("show");
    }

function carregarCronograma(){
  mostrarLoading("Carregando cronograma...");

  const inicioSemanaStr = formatDateISO(semanaInicioAtual);

  if (typeof google === "undefined" || !google.script || !google.script.run) {
    // Mock local
    cronogramaData = gerarMock();
    window.agendaData = [];
    renderCronograma();
    esconderLoading();
    return;
  }

  google.script.run
.withSuccessHandler(function(res){

  console.log("CRONOGRAMA:", res); // ðŸ”¥ AQUI

  cronogramaData = Array.isArray(res) ? res : [];

  // ðŸ”¥ BUSCA AGENDA JUNTO
      google.script.run
        .withSuccessHandler(function(lista){

          window.agendaData = lista || [];

          renderCronograma();
          esconderLoading();

        })
        .withFailureHandler(function(){
          window.agendaData = [];
          renderCronograma();
          esconderLoading();
        })
        .getAgenda();

    })
    .withFailureHandler(function(err){
      console.error(err);
      document.getElementById("cronogramaBody").innerHTML = `
        <tr><td colspan="8" class="empty-state">Erro ao carregar cronograma.</td></tr>
      `;
      esconderLoading();
    })
    .getCronogramaSemana(inicioSemanaStr);
}

function getDayIndexTerSeg(value){

  if(!value) return -1;

  // forÃ§a string limpa
  const dataStr = String(value).split("T")[0].split(" ")[0];

  const d = new Date(dataStr + "T00:00:00");

  const inicioStr = formatDateISO(semanaInicioAtual);
  const inicio = new Date(inicioStr + "T00:00:00");

  const diff = Math.floor((d - inicio) / (1000 * 60 * 60 * 24));

  // ðŸ‘‡ LOG CORRETO (DENTRO DA FUNÃ‡ÃƒO)
  console.log("DATA:", dataStr, "INICIO:", inicioStr, "DIFF:", diff);

  return (diff >= 0 && diff <= 6) ? diff : -1;
}

    function slugEtapa(etapa){
      const e = (etapa || "").toLowerCase().trim();

if(e.includes("triagem")) return "separacao";
      if(e === "carregamento") return "carregamento";
      if(e === "montagem") return "montagem";
      if(e === "evento") return "evento";
      if(e === "desmontagem") return "desmontagem";

      return "separacao";
    }

    function ordenarPedidos(lista){
      return [...lista].sort((a, b) => {
        const dataA = descobrirDataPrincipal(a);
        const dataB = descobrirDataPrincipal(b);
        return dataA - dataB;
      });
    }

    function descobrirDataPrincipal(pedido){
      if(!pedido || !Array.isArray(pedido.etapas)) return new Date(2100,0,1);

      const montagem = pedido.etapas.find(e => (e.etapa || "").toLowerCase() === "montagem");

      if(montagem){
        return combinarDataHora(montagem.dataEtapa || montagem.data, montagem.horario || montagem.hora);
      }

      const evento = pedido.etapas.find(e => (e.etapa || "").toLowerCase() === "evento");
      if(evento){
        return combinarDataHora(evento.dataEtapa || evento.data, evento.horario || evento.hora);
      }

      const primeira = pedido.etapas[0];
      if(primeira){
        return combinarDataHora(primeira.dataEtapa || primeira.data, primeira.horario || primeira.hora);
      }

      return new Date(2100,0,1);
    }

    function combinarDataHora(data, hora){
      const d = parseDateAny(data) || new Date(2100,0,1);
      const horaStr = hora || "23:59";
      const [hh, mm] = horaStr.split(":");
      d.setHours(Number(hh || 0), Number(mm || 0), 0, 0);
      return d;
    }

function filtrarEtapas(etapas){
  let filtroEtapa = document.getElementById("filtroEtapa").value.trim().toLowerCase();
  const filtroResponsavel = document.getElementById("filtroResponsavel").value.trim().toLowerCase();
  const filtroCaminhao = document.getElementById("filtroCaminhao").value.trim().toLowerCase();

  // ðŸ”¥ esses dois valores controlam sÃ³ a agenda, nÃ£o a etapa
const modo = filtroEtapa;

if(
  filtroEtapa === "semagenda" ||
  filtroEtapa === "comagenda" ||
  filtroEtapa === "triagemagenda"
){
  filtroEtapa = "";
}

  return (etapas || []).filter(e => {
    const nomeEtapa = (e.etapa || "").toLowerCase();

const okEtapa =
  (modo === "triagemagenda" && nomeEtapa.includes("triagem")) ||
  (
    modo !== "triagemagenda" &&
    (
      !filtroEtapa ||
      nomeEtapa === filtroEtapa ||
      (filtroEtapa === "separaÃ§Ã£o" && nomeEtapa.includes("triagem"))
    )
  );

    const okResp = !filtroResponsavel || (e.responsavel || "").toLowerCase().includes(filtroResponsavel);
    const okCam = !filtroCaminhao || (e.caminhao || "").toLowerCase().includes(filtroCaminhao);

    return okEtapa && okResp && okCam;
  });
}

    function renderCronograma(){
      const tbody = document.getElementById("cronogramaBody");

      if(!cronogramaData.length){
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum pedido encontrado para esta semana.</td></tr>`;
        return;
      }

      const listaOrdenada = ordenarPedidos(cronogramaData);
let html = "";

const filtro = document.getElementById("filtroEtapa").value;

if(filtro === "comAgenda" || filtro === "triagemAgenda"){

html += `<tr class="linha-agenda">`;
html += `<td class="col-evento" style="text-align:center; vertical-align:middle;">
  <strong>Cronograma Interno</strong>
</td>`;

  for(let i=0; i<7; i++){

    html += `<td class="day-cell"><div class="cards">`;

    const dataDia = formatDateISO(
      new Date(
        semanaInicioAtual.getFullYear(),
        semanaInicioAtual.getMonth(),
        semanaInicioAtual.getDate() + i
      )
    );

    const eventos = (window.agendaData || []).filter(a => a.data === dataDia);

    eventos.forEach(a => {

      const tipo = (a.tipo || "").toLowerCase();

html += `
<div class="task-card agenda-card agenda-${tipo} agenda-setor-${(a.setor || "").toLowerCase().trim().replace(/\s+/g,"")}"
     onclick='abrirSenhaAgenda(this)'
     data-envio="${a.envio}"
     data-responsavel="${a.responsavel}"
     data-info='${encodeURIComponent(JSON.stringify(a).replace(/'/g, "%27"))}'
     style="cursor:pointer;">

  <div class="task-top">
    <div class="task-title">${escapeHtml(a.tipo || "AGENDA")}</div>
  </div>

<div class="task-line"><strong>Para:</strong> ${escapeHtml(a.setor || "-")}</div>
<div class="task-line"><strong>Enviado por:</strong> ${escapeHtml(a.responsavel || "-")}</div>

${a.caminhao ? `
  <div class="task-line">
    <strong>CaminhÃ£o:</strong> ${escapeHtml(a.caminhao)}
  </div>
` : ``}

${a.equipe ? `
  <div class="task-line">
    <strong>Equipe:</strong> ${escapeHtml(a.equipe)}
  </div>
` : ``}

${a.descricao ? `
  <div class="task-line" style="color:#dc2626;">
    <strong>Obs:</strong> ${escapeHtml(a.descricao)}
  </div>
` : ``}

</div>
`;
    });

    html += `</div></td>`;
  }

  html += `</tr>`;
}

// ðŸ”¥ CONTINUA O LOOP NORMAL (MANTIDO)
listaOrdenada.forEach(pedido => {
        const etapasFiltradas = filtrarEtapas(pedido.etapas || []);

        const dias = [[],[],[],[],[],[],[]];

        etapasFiltradas.forEach(etapa => {
          const idx = getDayIndexTerSeg(etapa.dataEtapa || etapa.data);
          if(idx >= 0){
            dias[idx].push(etapa);
          }
        });

        dias.forEach(arr => {
          arr.sort((a, b) => {
            const ta = combinarDataHora(a.dataEtapa || a.data, a.horario || a.hora);
            const tb = combinarDataHora(b.dataEtapa || b.data, b.horario || b.hora);
            return ta - tb;
          });
        });

        html += `<tr>`;
        html += `
<td class="col-evento" onclick="editarPedido('${pedido.pedido}')">
            <div class="evento-box">
              <span class="pedido-tag">Pedido #${escapeHtml(pedido.pedido || "-")}</span>
              <div class="evento-cliente">${escapeHtml(pedido.cliente || "-")}</div>
              <div class="evento-meta">
                <span>ðŸ“ ${escapeHtml(pedido.local || "-")}</span>
                <span>ðŸ“… ${formatDateBR(pedido.dataEvento)}</span>
              </div>
            </div>
          </td>
        `;

        for(let i=0; i<7; i++){
          html += `<td class="day-cell"><div class="cards">`;

// ðŸ”¥ EVENTO VISUAL (SEM SALVAR)
const dataDia = formatDateISO(new Date(semanaInicioAtual.getFullYear(), semanaInicioAtual.getMonth(), semanaInicioAtual.getDate() + i));
let dataEvento = pedido.dataEvento || "";

if(dataEvento.includes("/")){
  const [d,m,y] = dataEvento.split("/");
  dataEvento = `${y}-${m}-${d}`;
}else{
  dataEvento = dataEvento.split(" ")[0];
}

if(dataEvento === dataDia){
  html += `
    <div class="task-card task-evento">
      <div class="task-top">
        <div class="task-title">EVENTO</div>
        <div class="task-time"></div>
      </div>
    </div>
  `;
}

if(dias[i].length){
  dias[i].forEach(etapa => {
    const etapaClasse = slugEtapa(etapa.etapa);
    html += `
<div class="task-card task-${etapaClasse}" style="position:relative;">
  ${etapaTemPendencia(etapa) ? `<div class="pendencia-dot"></div>` : ""}
      <div class="task-top">
        <div class="task-title">${escapeHtml(etapa.etapa || "-")}</div>
        <div class="task-time">${escapeHtml(etapa.horario || etapa.hora || "-")}</div>
      </div>

${(etapa.etapa || "").toLowerCase().includes("triagem") ? "" : `
<div class="task-line"><strong>CaminhÃ£o:</strong> ${escapeHtml(formatarCaminhao(etapa.caminhao))}</div>
`}
      <div class="task-line"><strong>Resp:</strong> ${escapeHtml(etapa.responsavel || "-")}</div>
      <div class="task-line"><strong>Equipe:</strong> ${escapeHtml(etapa.equipe || "-")}</div>
${etapa.observacao || etapa.obs ? `<div class="task-line" style="color:#dc2626;"><strong>Obs:</strong> ${escapeHtml(etapa.observacao || etapa.obs)}</div>` : ``}
    </div>
  `;
  });
}

          html += `</div></td>`;
        }

        html += `</tr>`;
      });

tbody.innerHTML = html || `<tr><td colspan="8" class="empty-state">Nenhum pedido encontrado para esta semana.</td></tr>`;

// ðŸ”¥ ANALISAR CRONOGRAMA AUTOMATICAMENTE
const analise = analisarCronograma();

window.analiseAtual = analise;

// ðŸ”¥ CONTADORES
const conflitosCaminhao = analise.conflitos.filter(c => c.tipo === "caminhao").length;
const conflitosResp = analise.conflitos.filter(c => c.tipo === "responsavel").length;
const pendencias = analise.pendencias.length;

let htmlAlerta = "";

// ðŸš› CAMINHÃƒO
if(conflitosCaminhao > 0){
  htmlAlerta += `ðŸš› ${conflitosCaminhao} conflito(s) de caminhÃ£o &nbsp;&nbsp;`;
}

// ðŸ‘¤ RESPONSÃVEL
if(conflitosResp > 0){
  htmlAlerta += `ðŸ‘¤ ${conflitosResp} responsÃ¡vel duplicado &nbsp;&nbsp;`;
}

// ðŸŸ¡ PENDÃŠNCIAS
if(pendencias > 0){
  htmlAlerta += `ðŸŸ¡ ${pendencias} pendÃªncia(s)`;
}

// âœ… OK
if(!htmlAlerta){
  htmlAlerta = "âœ”ï¸ Nenhum problema no cronograma";
}

// ðŸ”¥ ATUALIZA NA TELA
const painel = document.getElementById("painelAlertas");
if(painel){
  painel.innerHTML = htmlAlerta;
}

// DEBUG
console.log("ðŸ”´ Conflitos:", analise.conflitos);
console.log("ðŸŸ¡ PendÃªncias:", analise.pendencias);
    }

function abrirModalNovoPedido(){
  document.getElementById("modalNovoPedido").classList.add("show");
  resetarFormularioPedido();

const dataEvento = document.getElementById("pedidoDataEvento");
dataEvento.value = "";

  adicionarEtapa("Carregamento");
  adicionarEtapa("Montagem");
  adicionarEtapa("Desmontagem");

  setTimeout(() => {
    iniciarAutocompleteEndereco();
  }, 300);
  
  carregarCadastrosParaSelect();
}

    function fecharModalNovoPedido(){
      document.getElementById("modalNovoPedido").classList.remove("show");
    }

    function resetarFormularioPedido(){
      document.getElementById("pedidoNumero").value = "";
      document.getElementById("pedidoCliente").value = "";
      document.getElementById("pedidoLocal").value = "";
      document.getElementById("pedidoDataEvento").value = "";
      document.getElementById("etapasList").innerHTML = "";
    }

function adicionarEtapa(tipoPreenchido = ""){
  const list = document.getElementById("etapasList");
  const index = list.children.length;

  const wrapper = document.createElement("div");
  wrapper.className = "etapa-item";
  wrapper.dataset.index = index;
  wrapper.dataset.id = "";

  wrapper.innerHTML = `
    <div class="etapa-item-top">
      <div class="etapa-badge">Etapa operacional</div>
      <button type="button" class="btn btn-light" onclick="removerEtapa(this)">Remover</button>
    </div>

    <div class="mini-grid">

      <div class="field">
        <label>Etapa</label>
<select class="etapa-tipo" onchange="atualizarCorEtapa(this); controlarCampoCaminhao(this)">
  <option value="">Selecione</option>
  <option value="Triagem (SeparaÃ§Ã£o)" disabled ${tipoPreenchido === "Triagem (SeparaÃ§Ã£o)" ? "selected" : ""}>Triagem (SeparaÃ§Ã£o)</option>
  <option value="Triagem (ConferÃªncia)" disabled ${tipoPreenchido === "Triagem (ConferÃªncia)" ? "selected" : ""}>Triagem (ConferÃªncia)</option>
  <option value="Carregamento" ${tipoPreenchido === "Carregamento" ? "selected" : ""}>Carregamento</option>
  <option value="Montagem" ${tipoPreenchido === "Montagem" ? "selected" : ""}>Montagem</option>
  <option value="Desmontagem" ${tipoPreenchido === "Desmontagem" ? "selected" : ""}>Desmontagem</option>
</select>
      </div>

      <div class="field">
        <label>Data da etapa</label>
        <input type="date" class="etapa-data" />
      </div>

      <div class="field">
        <label>HorÃ¡rio</label>
        <input type="time" class="etapa-horario" />
      </div>

<div class="field caminhao-field">
  <label>CaminhÃ£o</label>
  <div class="multi-select" data-type="caminhao"></div>
</div>

<div class="field responsavel-field">
  <label>ResponsÃ¡vel</label>
  <select class="etapa-responsavel"></select>
</div>

<div class="field equipe-field span-2">
  <label>Equipe</label>

  <div class="multi-select" data-type="equipe"></div>

  <!-- ðŸ”¥ NOVO -->
<input 
  type="number" 
  class="etapa-qtd-equipe" 
  placeholder="Qtd ajudantes"
  min="1"
  style="margin-top:6px; display:none;"
/>

</div>

      <div class="field span-2">
        <label>ObservaÃ§Ã£o da etapa</label>
        <input type="text" class="etapa-obs" placeholder="Detalhes da etapa" />
      </div>

    </div>
  `;

  list.appendChild(wrapper);

  // ðŸ”¥ COR DA ETAPA
  const select = wrapper.querySelector(".etapa-tipo");
  if(select.value){
    atualizarCorEtapa(select);
  }

  controlarCampoCaminhao(select);

  // ðŸ”¥ DATA AUTOMÃTICA
  const dataEvento = document.getElementById("pedidoDataEvento").value;
  if(dataEvento){
    wrapper.querySelector(".etapa-data").value = dataEvento;
  }

// ðŸ”¥ ATUALIZA SOMENTE A ETAPA ATUAL AO MUDAR DATA
wrapper.querySelector(".etapa-data").addEventListener("change", () => {
  preencherSelectsEtapa(wrapper);
});

// ðŸ”¥ CARREGA SOMENTE A ETAPA NOVA
// ðŸ”¥ CARREGA SOMENTE A ETAPA NOVA
preencherSelectsEtapa(wrapper);

} // ðŸ‘ˆ FECHA adicionarEtapa CORRETAMENTE

function removerEtapa(btn){
      const item = btn.closest(".etapa-item");
      if(item) item.remove();
    }

function coletarPayloadPedido(){
  const pedido = document.getElementById("pedidoNumero")?.value.trim() || "";
  const cliente = document.getElementById("pedidoCliente")?.value.trim() || "";
  const local = document.getElementById("pedidoLocal")?.value.trim() || "";
  const dataEvento = document.getElementById("pedidoDataEvento")?.value || "";

  const etapasEls = [...document.querySelectorAll(".etapa-item")];

let etapas = etapasEls.map(item => {

  const tipo = item.querySelector(".etapa-tipo")?.value.trim() || "";
  const tipoLower = tipo.toLowerCase();

let caminhao = [...item.querySelectorAll('[data-type="caminhao"] .selected')]
  .map(e => (e.dataset.value || "").trim())
  .filter(v => v)
  .join("|");

  let responsavel = item.querySelector(".etapa-responsavel")?.value || "";

const selecionadosEquipe = [...item.querySelectorAll('[data-type="equipe"] .selected')];

let listaEquipe = [];
let listaQtd = [];

const inputQtd = item.querySelector(".etapa-qtd-equipe");
const qtdInput = Number(inputQtd?.value || 0);

selecionadosEquipe.forEach(opt => {

  const nome = (opt.dataset.value || "").trim();
  if(!nome) return;

  const tipoEquipe = (opt.querySelector("span")?.innerText || "").toLowerCase();

  if(tipoEquipe.includes("terceirizada")){
    listaEquipe.push(nome);
    listaQtd.push(qtdInput || 0);
  }else{
    listaEquipe.push(nome);
    listaQtd.push(1);
  }

});

let equipe = listaEquipe.join("|");
let equipeQtd = listaQtd.join("|");

  // ðŸ”¥ REGRA DA TRIAGEM (manual ou futura)
  if(tipoLower.includes("triagem")){
    caminhao = "";
    responsavel = "Matheus Martins";
    equipe = "Equipe GalpÃ£o";
  }

return {
  id: item.dataset.id || "",
  etapa: tipo,
  dataEtapa: item.querySelector(".etapa-data")?.value || "",
  horario: item.querySelector(".etapa-horario")?.value || "",
  caminhao,
  responsavel,
  equipe,
  equipeQtd, // ðŸ”¥ AGORA VAI PRO GS
  observacao: item.querySelector(".etapa-obs")?.value.trim() || ""
};

});

// ================================
// ðŸ”¥ TRIAGENS AUTOMÃTICAS (CORRIGIDO)
// ================================
let novasTriagens = [];

let jaTemSeparacao = false;
let jaTemConferencia = false;

etapas.forEach(e => {

  const tipo = (e.etapa || "").toLowerCase();

  if(tipo.includes("triagem (separaÃ§Ã£o)")) jaTemSeparacao = true;
  if(tipo.includes("triagem (conferÃªncia)")) jaTemConferencia = true;

});

// ðŸ”¥ GERA BASEADO NAS ETAPAS PRINCIPAIS
etapas.forEach(e => {

  const tipo = (e.etapa || "").toLowerCase();

  // ðŸ‘‰ TRIAGEM SEPARAÃ‡ÃƒO
  if(tipo.includes("carregamento") && e.dataEtapa && !jaTemSeparacao){

    const dataBase = parseDateAny(e.dataEtapa); // âœ… CORREÃ‡ÃƒO FUSO
    if(dataBase){
      dataBase.setDate(dataBase.getDate() - 1);

      novasTriagens.push({
        id: "",
        etapa: "Triagem (SeparaÃ§Ã£o)",
        dataEtapa: formatDateISO(dataBase),
        horario: "",
        caminhao: "",
        responsavel: "Matheus Martins",
        equipe: "Equipe GalpÃ£o",
        observacao: "Gerado automaticamente"
      });

      jaTemSeparacao = true; // ðŸ”¥ trava duplicaÃ§Ã£o
    }
  }

  // ðŸ‘‰ TRIAGEM CONFERÃŠNCIA
  if(tipo.includes("desmontagem") && e.dataEtapa && !jaTemConferencia){

    novasTriagens.push({
      id: "",
      etapa: "Triagem (ConferÃªncia)",
      dataEtapa: e.dataEtapa,
      horario: "",
      caminhao: "",
      responsavel: "Matheus Martins",
      equipe: "Equipe GalpÃ£o",
      observacao: "Gerado automaticamente"
    });

    jaTemConferencia = true; // ðŸ”¥ trava duplicaÃ§Ã£o
  }

});

// ðŸ”¥ JUNTA
etapas = [...etapas, ...novasTriagens];

return {
  pedido,
  cliente,
  local,
  dataEvento,
  etapas
};

} // âœ… FECHA A FUNÃ‡ÃƒO CORRETAMENTE

function validarPayload(payload){
  if(!payload.pedido){
    mostrarAlerta("Preencha o nÃºmero do pedido.");
    return false;
  }

  if(!payload.cliente){
    mostrarAlerta("Preencha o cliente.");
    return false;
  }

  if(!payload.local){
    mostrarAlerta("Preencha o local do evento.");
    return false;
  }

  if(!payload.dataEvento){
    mostrarAlerta("Preencha a data do evento.");
    return false;
  }

  if(!payload.etapas.length){
    mostrarAlerta("Adicione pelo menos uma etapa.");
    return false;
  }

  for(let i = 0; i < payload.etapas.length; i++){
    const e = payload.etapas[i];
    const n = i + 1;

    if(!e.etapa){
      mostrarAlerta(`Selecione a etapa no bloco ${n}.`);
      return false;
    }

    if(!e.dataEtapa){
      mostrarAlerta(`Preencha a data da etapa no bloco ${n}.`);
      return false;
    }

    // ðŸ”“ CAMPOS OPCIONAIS
    // horÃ¡rio, caminhÃ£o, responsÃ¡vel e equipe podem ficar vazios
  }

  return true;
}

function salvarPedido(){
  const payload = coletarPayloadPedido();

  if(!validarPayload(payload)) return;

  mostrarLoading("Salvando pedido...");

  if (typeof google === "undefined" || !google.script || !google.script.run) {
    console.log("Payload enviado:", payload);
    mostrarAlerta("Preview no navegador comum: o pedido foi validado e montado corretamente. No Apps Script, conecte a funÃ§Ã£o salvarPedidoCompleto(payload).");
    esconderLoading();
    fecharModalNovoPedido();
    return;
  }

  google.script.run
    .withSuccessHandler(function(res){
      esconderLoading();
      fecharModalNovoPedido();
      carregarCronograma();
      mostrarAlerta("Pedido salvo com sucesso.");
    })
    .withFailureHandler(function(err){
      console.error(err);
      esconderLoading();
      mostrarAlerta("Erro ao salvar pedido.");
    })
    .salvarPedidoCompleto(payload);
}
    let lotePedidos = [];

function adicionarAoLote(){

  const payload = coletarPayloadPedido();

  if(!validarPayload(payload)) return;

  lotePedidos.push(payload);

  renderListaLote();

  limparFormularioPedido();

  mostrarAlerta("Pedido adicionado ao lote.", "Lote");

}

function renderListaLote(){

  const container = document.getElementById("listaLote");

  if(!lotePedidos.length){
    container.innerHTML = "<div style='font-size:12px; color:#64748b;'>Nenhum pedido no lote</div>";
    return;
  }

  let html = "";

  lotePedidos.forEach((p, i) => {

    html += `
      <div style="
        background:#f8fafc;
        border:1px solid #e5e7eb;
        border-radius:10px;
        padding:8px 10px;
        margin-bottom:6px;
        display:flex;
        justify-content:space-between;
        align-items:center;
        font-size:12px;
      ">
        <div>
          <strong>#${p.pedido}</strong> - ${p.cliente}
        </div>
        <button class="btn btn-light" style="padding:4px 8px; font-size:11px;" onclick="removerDoLote(${i})">
          Remover
        </button>
      </div>
    `;

  });

  container.innerHTML = html;

}

function removerDoLote(index){
  lotePedidos.splice(index, 1);
  renderListaLote();
}

function limparFormularioPedido(){

  document.getElementById("pedidoNumero").value = "";
  document.getElementById("pedidoCliente").value = "";
  document.getElementById("pedidoLocal").value = "";
  document.getElementById("pedidoDataEvento").value = "";

  document.getElementById("etapasList").innerHTML = "";

  adicionarEtapa();

}

function enviarLote(){

  if(!lotePedidos.length){
    mostrarAlerta("Nenhum pedido no lote.");
    return;
  }

  confirmarAcao(
    "Deseja enviar todos os pedidos do lote?",
    (ok) => {

      if(!ok) return;

      mostrarLoading("Enviando lote...");

      google.script.run
        .withSuccessHandler(() => {

          esconderLoading();

          mostrarAlerta("Lote enviado com sucesso!", "Sucesso");

          lotePedidos = [];
          renderListaLote();

          fecharModalNovoPedido();
          carregarCronograma();

        })
        .withFailureHandler(() => {

          esconderLoading();
          mostrarAlerta("Erro ao enviar lote.");

        })
        .salvarPedidosEmLote(lotePedidos);

    }
  );

}

    function escapeHtml(str){
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    // Mock para testar fora do Apps Script
    function gerarMock(){
      const inicio = new Date(semanaInicioAtual);

      function somaDias(date, days){
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return formatDateISO(d);
      }

      return [
        {
          pedido: "2451",
          cliente: "Erika",
          local: "Barra da Tijuca",
          dataEvento: somaDias(inicio, 4),
          etapas: [
            {
              etapa: "Carregamento",
              dataEtapa: somaDias(inicio, 2),
              horario: "08:00",
              caminhao: "CaminhÃ£o M",
              responsavel: "JoÃ£o",
              equipe: "Equipe 02",
              observacao: "SaÃ­da pontual"
            },
            {
              etapa: "Montagem",
              dataEtapa: somaDias(inicio, 3),
              horario: "10:00",
              caminhao: "CaminhÃ£o M",
              responsavel: "JoÃ£o",
              equipe: "Equipe 02",
              observacao: "Acesso lateral"
            },
            {
              etapa: "Evento",
              dataEtapa: somaDias(inicio, 4),
              horario: "18:00",
              caminhao: "-",
              responsavel: "Carlos",
              equipe: "ProduÃ§Ã£o",
              observacao: ""
            },
            {
              etapa: "Desmontagem",
              dataEtapa: somaDias(inicio, 5),
              horario: "02:00",
              caminhao: "CaminhÃ£o M",
              responsavel: "JoÃ£o",
              equipe: "Equipe 02",
              observacao: "Retorno imediato"
            }
          ]
        },
        {
          pedido: "2458",
          cliente: "RL Cassano",
          local: "Casa das Canoas",
          dataEvento: somaDias(inicio, 5),
          etapas: [
            {
              etapa: "SeparaÃ§Ã£o",
              dataEtapa: somaDias(inicio, 1),
              horario: "14:00",
              caminhao: "Interno",
              responsavel: "Marcos",
              equipe: "Almoxarifado",
              observacao: ""
            },
            {
              etapa: "Carregamento",
              dataEtapa: somaDias(inicio, 3),
              horario: "07:00",
              caminhao: "CaminhÃ£o G",
              responsavel: "Pedro",
              equipe: "Terceirizada ABC",
              observacao: "Volume alto"
            },
            {
              etapa: "Montagem",
              dataEtapa: somaDias(inicio, 4),
              horario: "09:30",
              caminhao: "CaminhÃ£o G",
              responsavel: "Pedro",
              equipe: "Terceirizada ABC",
              observacao: ""
            },
            {
              etapa: "Evento",
              dataEtapa: somaDias(inicio, 5),
              horario: "20:00",
              caminhao: "-",
              responsavel: "Pedro",
              equipe: "Terceirizada ABC",
              observacao: ""
            }
          ]
        }
      ];
    }

    document.getElementById("pedidoDataEvento").addEventListener("change", function(){
      const data = this.value;
      if(!data) return;

      document.querySelectorAll(".etapa-data").forEach(input => {
        if(!input.value) input.value = data;
      });
    });
function atualizarCorEtapa(select){

  const item = select.closest(".etapa-item");

  item.classList.remove(
    "etapa-carregamento",
    "etapa-montagem",
    "etapa-desmontagem",
    "etapa-triagem"
  );

  const valor = (select.value || "").toLowerCase();

  if(valor.includes("triagem")){
    item.classList.add("etapa-triagem");
  }

  if(valor === "carregamento"){
    item.classList.add("etapa-carregamento");
  }

  if(valor === "montagem"){
    item.classList.add("etapa-montagem");
  }

  if(valor === "desmontagem"){
    item.classList.add("etapa-desmontagem");
  }
}
iniciar();

window.addEventListener("load", function(){
  iniciarAutocompleteEndereco();
});

    function iniciarAutocompleteEndereco(){

  const input = document.getElementById("pedidoLocal");
  if(!input) return;

  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "br" }
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    // se quiser no futuro:
    // const lat = place.geometry.location.lat();
    // const lng = place.geometry.location.lng();

    console.log("EndereÃ§o selecionado:", place.formatted_address);
  });
}async function editarPedido(numeroPedido){

  const ok = await pedirSenha("Acesso");

  if(!ok){
    mostrarAlerta("Acesso negado.");
    return;
  }

  const pedido = cronogramaData.find(p => p.pedido == numeroPedido);
  if(!pedido) return;

  abrirModalNovoPedido();

  document.getElementById("pedidoNumero").value = pedido.pedido || "";
  document.getElementById("pedidoCliente").value = pedido.cliente || "";
  document.getElementById("pedidoLocal").value = pedido.local || "";

  if(pedido.dataEvento){
    const [d,m,y] = pedido.dataEvento.split("/");
    document.getElementById("pedidoDataEvento").value = `${y}-${m}-${d}`;
  }

  document.getElementById("etapasList").innerHTML = "";

  (pedido.etapas || []).forEach(e => {

    adicionarEtapa(e.etapa);

    const ultima = document.querySelector("#etapasList .etapa-item:last-child");

    ultima.dataset.id = e.id || "";

    let tipo = e.etapa || "";

    if(tipo.toLowerCase() === "triagem"){
      const obs = (e.observacao || "").toLowerCase();
      tipo = obs.includes("confer") ? "Triagem (ConferÃªncia)" : "Triagem (SeparaÃ§Ã£o)";
    }

    const select = ultima.querySelector(".etapa-tipo");

    select.querySelectorAll("option").forEach(opt => {
      opt.disabled = false;
    });

    select.value = tipo;

    if(e.dataEtapa){
      let dataFormatada = "";

      if(e.dataEtapa.includes("/")){
        const partes = e.dataEtapa.split("/");
        dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
      }

      if(e.dataEtapa.includes("-")){
        dataFormatada = e.dataEtapa;
      }

      ultima.querySelector(".etapa-data").value = dataFormatada;
    }

    ultima.querySelector(".etapa-horario").value = e.horario || "";
    ultima.querySelector(".etapa-obs").value = e.observacao || "";

    atualizarCorEtapa(select);
    controlarCampoCaminhao(select);

    // ===== RESPONSÃVEL =====
    const esperarResponsavel = (container, callback) => {

      const interval = setInterval(() => {

        const select = container.querySelector(".etapa-responsavel");

        if(select && select.options.length > 1){
          clearInterval(interval);
          callback(select);
        }

      }, 50);

    };

    esperarResponsavel(ultima, (select) => {
      select.value = e.responsavel || "";
    });

    // ===== MULTISELECT =====
    const esperarMultiSelect = (container, callback) => {

      const interval = setInterval(() => {

        const pronto =
          container.querySelector('[data-type="caminhao"] .multi-option') &&
          container.querySelector('[data-type="equipe"] .multi-option');

        if(pronto){
          clearInterval(interval);
          callback();
        }

      }, 50);

    };

    esperarMultiSelect(ultima, () => {

      // ===== CAMINHÃƒO =====
      const containerCam = ultima.querySelector('[data-type="caminhao"]');

      if(containerCam){

        const listaCam = (e.caminhao || "").split("|").map(v => v.trim());

        containerCam.querySelectorAll(".multi-option").forEach(opt => {

          const nome = (opt.dataset.value || "").trim();

          aplicarVisualSelecaoMulti(opt, listaCam.includes(nome));

        });

      }

      // ===== EQUIPE =====
      const containerEq = ultima.querySelector('[data-type="equipe"]');

      if(containerEq){

        const listaEq = (e.equipe || "").split("|").map(v => v.trim());

        const listaQtd = (e.equipeQtd || "").split("|").map(v => Number(v) || 0);

        containerEq.querySelectorAll(".multi-option").forEach((opt, index) => {

          const nome = (opt.dataset.value || "").trim();

          aplicarVisualSelecaoMulti(opt, listaEq.includes(nome));

        });

        // ===== QTD =====
        const inputQtd = ultima.querySelector(".etapa-qtd-equipe");

        if(inputQtd){

          const selecionados = [...containerEq.querySelectorAll(".selected")];

          const indexTerceirizada = selecionados.findIndex(opt => {
            const tipo = opt.querySelector("span")?.innerText.toLowerCase() || "";
            return tipo.includes("terceirizada");
          });

          if(indexTerceirizada >= 0){

            inputQtd.style.display = "";
            inputQtd.value = listaQtd[indexTerceirizada] || "";

          }else{

            inputQtd.style.display = "none";
            inputQtd.value = "";

          }

        }

      }

    });

  });

  // ðŸ”¥ PERMISSÃ•ES
  setTimeout(() => {

    document.querySelectorAll(".etapa-item").forEach(item => {

      const tipo = item.querySelector(".etapa-tipo")?.value;

      aplicarPermissaoEtapa(item, tipo);

    });

  }, 200);

}
function controlarCampoCaminhao(select){

  const item = select.closest(".etapa-item");

  const caminhao = item.querySelector(".caminhao-field");
  const responsavel = item.querySelector(".responsavel-field");
  const equipe = item.querySelector(".equipe-field");

  const valor = (select.value || "").toLowerCase();

  if(valor.includes("triagem")){

    // ðŸ”’ ESCONDE CAMPOS
    if(caminhao) caminhao.style.display = "none";
    if(responsavel) responsavel.style.display = "none";
    if(equipe) equipe.style.display = "none";

    // ðŸ”¥ FORÃ‡A VALORES FIXOS
    const respSelect = item.querySelector(".etapa-responsavel");
    if(respSelect){
      respSelect.value = "Matheus Martins";
    }

    // ðŸ”¥ DEFINE EQUIPE FIXA
    const equipeContainer = item.querySelector('[data-type="equipe"]');
    if(equipeContainer){
      equipeContainer.innerHTML = `
        <div class="multi-option selected">Equipe GalpÃ£o</div>
      `;
    }

  }else{

    // ðŸ”“ MOSTRA CAMPOS NOVAMENTE
    if(caminhao) caminhao.style.display = "";
    if(responsavel) responsavel.style.display = "";
    if(equipe) equipe.style.display = "";

  }
}

function pedirSenha(setor){

  setorAtualSenha = setor;

  return new Promise((resolve) => {

    resolverSenha = resolve;

    document.getElementById("inputSenha").value = "";
    document.getElementById("erroSenha").style.display = "none";

    document.getElementById("modalSenha").classList.add("show");

    setTimeout(() => {
      document.getElementById("inputSenha").focus();
    }, 200);

  });
}

function fecharModalSenha(){
  document.getElementById("modalSenha").classList.remove("show");

  if(resolverSenha){
    resolverSenha(false);
  }
}

function confirmarSenha(){

  const senha = document.getElementById("inputSenha").value;

  if(!senha) return;

  google.script.run
    .withSuccessHandler(function(valido){

      if(valido){

        // ðŸ‘‡ guarda o perfil retornado (montagem / internas)
        window.perfilAcesso = valido;

        document.getElementById("modalSenha").classList.remove("show");

        if(resolverSenha){
          resolverSenha(true);
        }

      }else{
        document.getElementById("erroSenha").style.display = "block";
      }

    })
    .validarSenhaPerfil(senha);
}
async function abrirNovoPedidoProtegido(){

const ok = await pedirSenha("Acesso");

if(!ok || window.perfilAcesso !== "montagem"){
  mostrarAlerta("Acesso permitido apenas para Supervisor de Montagem.");
  return;
}

  if(!ok){
    mostrarAlerta("Senha invÃ¡lida.");
    return;
  }

  abrirModalNovoPedido();
}
function aplicarPermissaoEtapa(item, tipo){

  const perfil = window.perfilAcesso;

  const isTriagem = (tipo || "").toLowerCase().includes("triagem");

  const bloquearTriagem = perfil === "montagem" && isTriagem;
  const bloquearMontagem = perfil === "internas" && !isTriagem;

  const bloquear = bloquearTriagem || bloquearMontagem;

  const inputs = item.querySelectorAll("input, select");
  const multiOptions = item.querySelectorAll(".multi-option");
  const btnRemover = item.querySelector("button");

  // ðŸ”’ INPUTS E SELECTS (INCLUI ETAPA)
  inputs.forEach(i => {

    if(bloquear){
      i.disabled = true;
      i.style.opacity = "0.6";
      i.style.cursor = "not-allowed";
    }else{
      i.disabled = false;
      i.style.opacity = "1";
      i.style.cursor = "auto";
    }

  });

  // ðŸ”’ MULTI SELECT (caminhÃ£o/equipe)
  multiOptions.forEach(opt => {

    if(bloquear){
      opt.style.pointerEvents = "none";
      opt.style.opacity = "0.5";
    }else{
      opt.style.pointerEvents = "auto";
      opt.style.opacity = "1";
    }

  });

  // ðŸ”’ BOTÃƒO REMOVER
  if(btnRemover){

    if(bloquear){
      btnRemover.disabled = true;
      btnRemover.style.opacity = "0.5";
      btnRemover.style.cursor = "not-allowed";
      btnRemover.title = "VocÃª nÃ£o tem permissÃ£o para remover esta etapa";
    }else{
      btnRemover.disabled = false;
      btnRemover.style.opacity = "1";
      btnRemover.style.cursor = "pointer";
      btnRemover.title = "";
    }

  }

  // ðŸ’¡ VISUAL EXTRA (OPCIONAL MAS RECOMENDADO)
  if(bloquear){
    item.style.border = "1px dashed #f59e0b";
  }else{
    item.style.border = "";
  }

}
function abrirModalCadastros(){

  document.getElementById("modalCadastros").classList.add("show");

  carregarCaminhoes();
  carregarResponsaveis();
  carregarEquipes();

}

function fecharModalCadastros(){
  document.getElementById("modalCadastros").classList.remove("show");
}

function trocarAbaCadastro(nome, el){

  document.querySelectorAll(".aba-cadastro").forEach(a => a.style.display = "none");
  document.querySelectorAll(".tab-cadastro").forEach(t => {
    t.classList.remove("btn-primary");
    t.classList.add("btn-light");
  });

  document.getElementById("aba-" + nome).style.display = "block";

  el.classList.remove("btn-light");
  el.classList.add("btn-primary");
}
function salvarResponsavel(){

  const nome = document.getElementById("cadResponsavelNome").value;

  if(!nome){
    mostrarAlerta("Digite o nome");
    return;
  }

  google.script.run
.withSuccessHandler(() => {
  mostrarAlerta("ResponsÃ¡vel salvo!");
  document.getElementById("cadResponsavelNome").value = "";
  carregarResponsaveis();
})
    .salvarResponsavel(nome);
}
function salvarEquipe(){

  const nome = document.getElementById("cadEquipeNome").value;

  if(!nome){
    mostrarAlerta("Digite o nome");
    return;
  }

  google.script.run
.withSuccessHandler(() => {
  mostrarAlerta("Equipe salva!");
  document.getElementById("cadEquipeNome").value = "";
  carregarEquipes();
})
    .salvarEquipe(nome);
}
function salvarCaminhao(){

  const nome = document.getElementById("cadCaminhaoNome").value;
  const tipo = document.getElementById("cadCaminhaoTipo").value;
  const empresa = document.getElementById("cadCaminhaoEmpresa").value;
  const vinculo = document.getElementById("cadCaminhaoVinculo").value;

  if(!nome){
    mostrarAlerta("Digite o nome do caminhÃ£o");
    return;
  }

  if(!empresa){
    mostrarAlerta("Digite a empresa");
    return;
  }

  google.script.run
.withSuccessHandler(() => {
mostrarAlerta("CaminhÃ£o salvo!");
  carregarCaminhoes(); // ðŸ‘ˆ atualiza lista
      document.getElementById("cadCaminhaoNome").value = "";
      document.getElementById("cadCaminhaoEmpresa").value = "";
    })
    .salvarCaminhao(nome, tipo, empresa, vinculo);
}
function carregarCaminhoes(){

  google.script.run
    .withSuccessHandler(function(lista){

      const div = document.getElementById("listaCaminhoes");

      if(!lista.length){
        div.innerHTML = "<p style='color:#64748b;'>Nenhum caminhÃ£o cadastrado</p>";
        return;
      }

      let html = "";

      lista.forEach(c => {

        html += `
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:10px;
            border-bottom:1px solid #e5e7eb;
            font-size:13px;
          ">

            <div>
              <strong>${c.nome}</strong> (${c.tipo})<br>
              <span style="color:#64748b;">
                ${c.empresa} â€¢ ${c.vinculo}
              </span>
            </div>

          </div>
        `;

      });

      div.innerHTML = html;

    })
    .listarCaminhoes();
}
function carregarResponsaveis(){

  google.script.run
    .withSuccessHandler(function(lista){

      const div = document.getElementById("listaResponsaveis");

      if(!lista.length){
        div.innerHTML = "<p style='color:#64748b;'>Nenhum responsÃ¡vel cadastrado</p>";
        return;
      }

      let html = "";

      lista.forEach(r => {

        html += `
          <div style="
            display:flex;
            justify-content:space-between;
            padding:10px;
            border-bottom:1px solid #e5e7eb;
            font-size:13px;
          ">
            <strong>${r.nome}</strong>
          </div>
        `;

      });

      div.innerHTML = html;

    })
    .listarResponsaveis();
}
function carregarEquipes(){

  google.script.run
    .withSuccessHandler(function(lista){

      const div = document.getElementById("listaEquipes");

      if(!lista || !lista.length){
        div.innerHTML = "<p style='color:#64748b;'>Nenhuma equipe cadastrada</p>";
        return;
      }

      let html = "";

      lista.forEach(e => {

        html += `
          <div style="
            display:flex;
            justify-content:space-between;
            padding:10px;
            border-bottom:1px solid #e5e7eb;
            font-size:13px;
          ">
            <div>
              <strong>${e.nome}</strong><br>
              <span style="color:#64748b;">${e.tipo || ""}</span>
            </div>
          </div>
        `;

      });

      div.innerHTML = html;

    })
    .listarEquipes();
}
let CACHE = {
  caminhoes: [],
  responsaveis: [],
  equipes: []
};

function carregarCadastrosParaSelect(){

  google.script.run.withSuccessHandler(c => {
    CACHE.caminhoes = c;
    preencherSelects();
  }).listarCaminhoes();

  google.script.run.withSuccessHandler(r => {
    CACHE.responsaveis = r;
    preencherSelects();
  }).listarResponsaveis();

  google.script.run.withSuccessHandler(e => {
    CACHE.equipes = e;
    preencherSelects();
  }).listarEquipes();

}

function renderMultiSelectEtapa(container, lista = [], tipo, data){

  // ðŸ”¥ seguranÃ§a (evita quebrar sem dados)
  if(!Array.isArray(lista)) lista = [];

  const selecionadosAtuais = [...container.querySelectorAll(".multi-option.selected")]
    .map(el => el.dataset.value);

  container.innerHTML = "";

  lista.forEach(obj => {

    let htmlInterno = "";
    let valor = "";

    // ðŸš› CAMINHÃƒO
    if(tipo === "caminhao"){

const codigo = (obj.tipo || obj.nome || "").trim();
const nome = obj.empresa || obj.vinculo || "";

valor = codigo;

      htmlInterno = `
        <div style="display:flex; flex-direction:column;">
          <strong>${codigo || "-"}</strong>
          <span style="font-size:11px; color:#64748b;">
            ${nome || "-"}
          </span>
        </div>
      `;

    }

    // ðŸ‘· EQUIPE
    if(tipo === "equipe"){

      const codigo = (obj.nome || "").trim();

      valor = codigo;

      htmlInterno = `
        <div style="display:flex; flex-direction:column;">
          <strong>${codigo || "-"}</strong>
          <span style="font-size:11px; color:#64748b;">
            ${obj.tipo || "-"}
          </span>
        </div>
      `;

    }

    const disponivel = tipo === "caminhao"
      ? verificarDisponibilidade("caminhao", valor, data)
      : true;

    const el = document.createElement("div");
    el.className = "multi-option";
    el.dataset.value = valor;
    el.innerHTML = htmlInterno;

    // ðŸ”¥ re-seleÃ§Ã£o automÃ¡tica
    if(selecionadosAtuais.includes(valor)){
      aplicarVisualSelecaoMulti(el, true);
    }

    if(!disponivel){
      el.style.opacity = "0.5";
    }

    el.onclick = (e) => {

      e.stopPropagation();

      const alternar = () => {

        const ativo = !el.classList.contains("selected");
        aplicarVisualSelecaoMulti(el, ativo);

        // ðŸ”¥ NOVO â€” CONTROLE GLOBAL (agenda + pedido)
        controlarQtdEquipeGlobal();

      };

      if(!disponivel){

        confirmarAcao(
          "Esse caminhÃ£o jÃ¡ estÃ¡ em outro evento nessa data.\n\nDeseja continuar mesmo assim?",
          (ok) => {
            if(!ok) return;
            alternar();
          }
        );

        return;
      }

      alternar();
    };

    container.appendChild(el);

  });

}
function controlarQtdEquipeGlobal(){

  const containers = document.querySelectorAll('[data-type="equipe"]');

  containers.forEach(container => {

    const wrapper = container.closest(".etapa-item") || document;

    const inputQtd =
      wrapper.querySelector(".etapa-qtd-equipe") ||
      document.querySelector(".agenda-qtd-equipe");

    if(!inputQtd) return;

    const selecionados = [...container.querySelectorAll(".selected")];

    const temTerceirizada = selecionados.some(opt => {
      const tipo = opt.querySelector("span")?.innerText.toLowerCase() || "";
      return tipo.includes("terceirizada");
    });

    if(temTerceirizada){
      inputQtd.style.display = "";
    }else{
      inputQtd.style.display = "none";
      inputQtd.value = "";
    }

  });

}
function preencherSelects(){
  document.querySelectorAll(".etapa-item").forEach(item => {
    preencherSelectsEtapa(item);
  });
}
function verificarDisponibilidade(tipo, nome, data){

  if(!data) return true;

  return !cronogramaData.some(pedido =>
    (pedido.etapas || []).some(e => {

      const mesmaData = (e.dataEtapa || e.data) === data;

      if(!mesmaData) return false;

      if(tipo === "caminhao"){
        return (e.caminhao || "").includes(nome);
      }

      if(tipo === "responsavel"){
        return (e.responsavel || "") === nome;
      }

      return false;

    })
  );

}
function mostrarAlerta(msg, titulo = "Aviso"){

  document.getElementById("alertaTitulo").innerText = titulo;

  // ðŸ”¥ CORREÃ‡ÃƒO PRINCIPAL
  document.getElementById("alertaMensagem").innerHTML = msg;

  document.getElementById("alertaCancelar").style.display = "none";

  const modal = document.getElementById("modalAlerta");
  modal.classList.add("show");

  document.getElementById("alertaOk").onclick = () => {
    modal.classList.remove("show");
  };

}

// ðŸ”¥ CONFIRMAÃ‡ÃƒO (substitui confirm)
function confirmarAcao(msg, callback){

  document.getElementById("alertaTitulo").innerText = "ConfirmaÃ§Ã£o";
  document.getElementById("alertaMensagem").innerText = msg;

  const modal = document.getElementById("modalAlerta");
  modal.classList.add("show");

  const btnOk = document.getElementById("alertaOk");
  const btnCancelar = document.getElementById("alertaCancelar");

  btnCancelar.style.display = "inline-block";

  btnOk.onclick = () => {
    modal.classList.remove("show");
    callback(true);
  };

  btnCancelar.onclick = () => {
    modal.classList.remove("show");
    callback(false);
  };

}
async function abrirCadastrosProtegido(){

  const ok = await pedirSenha("Cadastros");

  if(!ok){
    mostrarAlerta("Senha invÃ¡lida.", "Acesso negado");
    return;
  }

  // ðŸ”’ valida perfil
  if(window.perfilAcesso !== "montagem"){
    mostrarAlerta("Acesso permitido apenas para Supervisor de Montagem.", "Acesso negado");
    return;
  }

  abrirModalCadastros();

}
function etapaTemPendencia(e){

  const tipo = (e.etapa || "").toLowerCase();

  // Triagem nunca gera pendÃªncia
  if(tipo.includes("triagem")){
    return false;
  }

  // Se faltar qualquer coisa â†’ pendÃªncia
  return (
    !e.caminhao ||
    !e.responsavel ||
    !e.equipe
  );

}function preencherSelectsEtapa(item){

  if(!item) return;

  const multiCam = item.querySelector('[data-type="caminhao"]');
  const multiEqp = item.querySelector('[data-type="equipe"]');
  const selResp = item.querySelector(".etapa-responsavel");

  const data = item.querySelector(".etapa-data")?.value;

  // guarda valor atual do responsÃ¡vel
  const responsavelAtual = selResp ? selResp.value : "";

  // ðŸŸ¢ CAMINHÃ•ES
  if(multiCam){
    renderMultiSelectEtapa(multiCam, CACHE.caminhoes, "caminhao", data);
  }

  // ðŸ”µ EQUIPES
  if(multiEqp){
    renderMultiSelectEtapa(multiEqp, CACHE.equipes, "equipe", data);
  }

  // ðŸŸ¡ RESPONSÃVEL
  if(selResp){

    selResp.innerHTML = `<option value="">Selecione</option>`;

    CACHE.responsaveis.forEach(r => {

      const disponivel = verificarDisponibilidade("responsavel", r.nome, data);

      selResp.innerHTML += `
        <option value="${r.nome}" ${!disponivel ? "style='color:#9ca3af;'" : ""}>
          ${r.nome}${!disponivel ? " (ocupado)" : ""}
        </option>
      `;

    });

    // reaplica o valor anterior, se ainda existir
    const existeOpcao = [...selResp.options].some(opt => opt.value === responsavelAtual);
    selResp.value = existeOpcao ? responsavelAtual : "";

    selResp.onchange = function(){

      const nome = this.value;
      const disponivel = verificarDisponibilidade("responsavel", nome, data);

      if(!disponivel){

        confirmarAcao(
          "Esse responsÃ¡vel jÃ¡ estÃ¡ em outro evento nessa data.\n\nDeseja continuar mesmo assim?",
          (ok) => {
            if(!ok){
              this.value = "";
            }
          }
        );

        return;
      }

    };

  }

  const tipo = item.querySelector(".etapa-tipo")?.value;
  aplicarPermissaoEtapa(item, tipo);
}

function reaplicarMultiSelect(item, e){

  const esperar = setInterval(() => {

    const camPronto = item.querySelector('[data-type="caminhao"] .multi-option');
    const eqpPronto = item.querySelector('[data-type="equipe"] .multi-option');

    if(!camPronto || !eqpPronto) return;

    clearInterval(esperar);

    // ðŸš› CAMINHÃƒO
    const selecionadosCam = (e.caminhao || "")
      .split(",")
      .map(v => v.trim());

    item.querySelectorAll('[data-type="caminhao"] .multi-option').forEach(opt => {

      const valor = (opt.dataset.value || opt.textContent).trim();

      if(selecionadosCam.includes(valor)){
        opt.classList.add("selected");
      }

    });

    // ðŸ‘· EQUIPE
    const selecionadosEqp = (e.equipe || "")
      .split(",")
      .map(v => v.trim());

    item.querySelectorAll('[data-type="equipe"] .multi-option').forEach(opt => {

      const valor = (opt.dataset.value || opt.textContent).trim();

      if(selecionadosEqp.includes(valor)){
        opt.classList.add("selected");
      }

    });

  }, 50);

}
function analisarCronograma(){

  const conflitos = [];
  const pendencias = [];

  const mapaCaminhao = {};
  const mapaResponsavel = {};

  cronogramaData.forEach(pedido => {

    (pedido.etapas || []).forEach(etapa => {

      const tipo = (etapa.etapa || "").toLowerCase();
      const isTriagem = tipo.includes("triagem");

      const data = etapa.dataEtapa || etapa.data;
      if(!data) return;

      let dataNormalizada = data;

      if(data.includes("/")){
        const [d,m,y] = data.split("/");
        dataNormalizada = `${y}-${m}-${d}`;
      }

      const chaveDia = dataNormalizada;

      // ðŸš› CAMINHÃƒO (IGNORA TRIAGEM)
      if(!isTriagem){

        if(etapa.caminhao){

          const lista = etapa.caminhao.split(",");

          lista.forEach(cam => {

            const nome = cam.trim();
            const chave = `${chaveDia}|${nome}`;

            if(!mapaCaminhao[chave]){
              mapaCaminhao[chave] = [];
            }

mapaCaminhao[chave].push({
  pedido: pedido.pedido,
  cliente: pedido.cliente,
  etapa: etapa.etapa,
  data: dataNormalizada
});

          });

        }else{
          pendencias.push({
            tipo: "pendencia",
            pedido: pedido.pedido,
            etapa: etapa.etapa,
            problema: "Sem caminhÃ£o"
          });
        }

      }
// ðŸ‘¤ RESPONSÃVEL (IGNORA TRIAGEM + EXPEDIÃ‡ÃƒO)
if(etapa.responsavel){

  const resp = etapa.responsavel
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const ignorar =
    resp.includes("matheus") ||     // triagem
    resp.includes("expedicao");     // Fabio(ExpediÃ§Ã£o)

  if(!ignorar){

    const chave = `${chaveDia}|${etapa.responsavel}`;

    if(!mapaResponsavel[chave]){
      mapaResponsavel[chave] = [];
    }

    mapaResponsavel[chave].push({
      pedido: pedido.pedido,
      cliente: pedido.cliente,
      etapa: etapa.etapa,
      data: dataNormalizada
    });

  }

} else if(!isTriagem){

  pendencias.push({
    tipo: "pendencia",
    pedido: pedido.pedido,
    etapa: etapa.etapa,
    problema: "Sem responsÃ¡vel"
  });

}

// ðŸ‘· EQUIPE (IGNORA TRIAGEM)
if(!etapa.equipe && !isTriagem){
  pendencias.push({
    tipo: "pendencia",
    pedido: pedido.pedido,
    etapa: etapa.etapa,
    problema: "Sem equipe"
  });
}

    }); // ðŸ‘ˆ FECHA forEach etapa
  });   // ðŸ‘ˆ FECHA forEach pedido

  // ðŸ”¥ MONTA CONFLITOS DE CAMINHÃƒO
  Object.entries(mapaCaminhao).forEach(([chave, lista]) => {
    if(lista.length > 1){
      lista.forEach(item => {
        conflitos.push({
          tipo: "caminhao",
          item: chave.split("|")[1],
          data: chave.split("|")[0],
          ...item
        });
      });
    }
  });

  // ðŸ”¥ MONTA CONFLITOS DE RESPONSÃVEL
  Object.entries(mapaResponsavel).forEach(([chave, lista]) => {
    if(lista.length > 1){
      lista.forEach(item => {
        conflitos.push({
          tipo: "responsavel",
          item: chave.split("|")[1],
          data: chave.split("|")[0],
          ...item
        });
      });
    }
  });

  return { conflitos, pendencias };

} // ðŸ‘ˆ FECHA FUNÃ‡ÃƒO analisarCronograma

function fecharModalAlertas(){
  document.getElementById("modalAlertas").style.display = "none";
}
function abrirDetalhesAlertas(){

  const analise = window.analiseAtual;

  if(!analise){
    mostrarAlerta("Nenhuma anÃ¡lise disponÃ­vel.");
    return;
  }

  // ðŸ”¥ AUMENTA O MODAL SÃ“ AQUI
  const modalBox = document.querySelector("#modalAlerta .modal-box");
  if(modalBox){
    modalBox.style.width = "900px";
    modalBox.style.maxWidth = "95vw";
    modalBox.style.maxHeight = "85vh";
    modalBox.style.overflowY = "auto";
  }

  let html = `<div style="text-align:left">`;

  // =========================
  // ðŸš› CAMINHÃƒO
  // =========================
  const conflitosCam = analise.conflitos.filter(c => c.tipo === "caminhao");

  if(conflitosCam.length){

    html += `<h3 style="margin-bottom:10px;">ðŸš› Conflitos de caminhÃ£o</h3>`;

    const grupos = {};

    conflitosCam.forEach(c => {
      const chave = `${c.data}|${c.item}`;
      if(!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(c);
    });

    Object.values(grupos).forEach(lista => {

      if(lista.length < 2) return;

      html += `
        <div style="
          margin-bottom:16px;
          padding:12px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          background:#fff;
        ">
          <strong>${lista[0].item}</strong><br>
          <small>${formatarDataBR(lista[0].data)}</small>

          <div style="display:flex;gap:10px;margin-top:10px;">
      `;

      lista.forEach(c => {
        html += `
          <div style="
            flex:1;
            background:#f8fafc;
            padding:10px;
            border-radius:8px;
            border:1px dashed #cbd5f5;
          ">
            <strong>${c.etapa || "-"}</strong><br>
             ${formatarDataBR(c.data)}<br>
             Pedido: #${c.pedido || "-"}<br>
             ${c.cliente || "-"}
          </div>
        `;
      });

      html += `</div></div>`;
    });
  }

  // =========================
  // ðŸ‘¤ RESPONSÃVEL
  // =========================
  const conflitosResp = analise.conflitos.filter(c => c.tipo === "responsavel");

  if(conflitosResp.length){

    html += `<h3 style="margin:20px 0 10px;">ðŸ‘¤ ResponsÃ¡veis duplicados</h3>`;

    const grupos = {};

    conflitosResp.forEach(c => {
      const chave = `${c.data}|${c.item}`;
      if(!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(c);
    });

    Object.values(grupos).forEach(lista => {

      if(lista.length < 2) return;

      html += `
        <div style="
          margin-bottom:16px;
          padding:12px;
          border:1px solid #e2e8f0;
          border-radius:10px;
          background:#fff;
        ">
          <strong>${lista[0].item}</strong><br>
          <small>${formatarDataBR(lista[0].data)}</small>

          <div style="display:flex;gap:10px;margin-top:10px;">
      `;

      lista.forEach(c => {
        html += `
          <div style="
            flex:1;
            background:#f1f5f9;
            padding:10px;
            border-radius:8px;
            border:1px dashed #94a3b8;
          ">
            <strong>${c.etapa || "-"}</strong><br>
             ${formatarDataBR(c.data)}<br>
             Pedido: #${c.pedido || "-"}<br>
             ${c.cliente || "-"}
          </div>
        `;
      });

      html += `</div></div>`;
    });
  }

  html += `</div>`;

abrirModalConflitos(html);
}
function formatarDataBR(data){

  if(!data) return "-";

  // jÃ¡ estÃ¡ em formato YYYY-MM-DD
  if(data.includes("-")){
    const [y,m,d] = data.split("-");
    return `${d}/${m}/${y}`;
  }

  return data; // fallback
}
function abrirModalConflitos(html){

  const modal = document.getElementById("modalConflitos");

  document.getElementById("conteudoConflitos").innerHTML = html;

  modal.style.display = "flex"; // ðŸ”¥ ESSENCIAL
}
function fecharModalConflitos(){
  document.getElementById("modalConflitos").style.display = "none";
}
function formatarCaminhao(valor){

  if(!valor) return "-";

  return String(valor).split(",").map(v => {

    v = v.trim();
    if(!v) return "";

    // ðŸ”¥ PADRONIZA QUALQUER SEPARADOR
    v = v.replaceAll("â€¢", "-");

    const partes = v.split(" - ");

    if(partes.length >= 2){

      const empresa = partes[partes.length - 1].trim();

      const antesEmpresa = partes.slice(0, -1).join(" ").trim();

      const palavras = antesEmpresa.split(/\s+/);
      const tipo = palavras[palavras.length - 1];

      return `${tipo}${empresa ? "(" + empresa + ")" : ""}`;
    }

    return v;

  }).filter(Boolean).join(", ");

}
function abrirModalAgenda(){

  // ðŸ”¥ NOVO ITEM
  window.agendaSelecionada = null;
  window.modoEdicaoAgenda = false;
  window.envioEdicaoAgenda = null;

  // ðŸ”¥ RESTAURA VISUAL
  document.getElementById("tituloModalAgenda").innerText = "Novo item da agenda";
  document.getElementById("blocoAgendaResponsavel").style.display = "";
  document.getElementById("blocoAgendaSenha").style.display = "";
  document.getElementById("btnExcluirAgenda").style.display = "none";

  // ðŸ”¥ LIMPA CAMPOS
  document.getElementById("agendaResponsavel").value = "";
  document.getElementById("agendaSenha").value = "";
  document.getElementById("agendaData").value = "";
  document.getElementById("agendaSetor").value = "";
  document.getElementById("agendaTipo").value = "";
  document.getElementById("agendaDescricao").value = "";

  // ðŸ”¥ ESCONDE MULTI SELECTS INICIALMENTE
  document.getElementById("blocoAgendaCaminhao").style.display = "none";
  document.getElementById("blocoAgendaEquipe").style.display = "none";

  // ðŸ”¥ ABRE MODAL
  document.getElementById("modalAgenda").classList.add("show");

  // ðŸ”¥ CONTROLA TUDO (carrega caminhÃ£o + equipe)
  controlarTipoAgenda();

}
function fecharModalAgenda(){
  document.getElementById("modalAgenda").classList.remove("show");
}

function salvarAgenda(){

  const data = document.getElementById("agendaData").value;
  const setor = document.getElementById("agendaSetor").value;
  const tipo = document.getElementById("agendaTipo").value;
  const descricao = document.getElementById("agendaDescricao").value;

  // ðŸš› CAMINHÃƒO
const modal = document.getElementById("modalAgenda");

const caminhao = [...modal.querySelectorAll('[data-type="caminhao"] .multi-option.selected')]
  .map(el => (el.dataset.value || "").trim())
  .filter(Boolean)
  .join("|");

  // ðŸ‘· EQUIPE + QTD
const selecionadosEquipe = [...modal.querySelectorAll('[data-type="equipe"] .multi-option.selected')];

  let listaEquipe = [];
  let listaQtd = [];

  const inputQtd = document.querySelector(".agenda-qtd-equipe");
  const qtdInput = Number(inputQtd?.value || 0);

  selecionadosEquipe.forEach(opt => {

    const nome = (opt.dataset.value || "").trim();
    if(!nome) return;

    const tipoEquipe = (opt.querySelector("span")?.innerText || "").toLowerCase();

    if(tipoEquipe.includes("terceirizada")){
      listaEquipe.push(nome);
      listaQtd.push(qtdInput || 0);
    }else{
      listaEquipe.push(nome);
      listaQtd.push(1);
    }

  });

  const equipe = listaEquipe.join("|");
  const equipeQtd = listaQtd.join("|");

  // ðŸ”´ VALIDAÃ‡Ã•ES
  if(!data){
    mostrarAlerta("Preencha a data.");
    return;
  }

  if(!setor){
    mostrarAlerta("Selecione o setor responsÃ¡vel.");
    return;
  }

  if(!tipo){
    mostrarAlerta("Selecione o tipo.");
    return;
  }

  // âœï¸ EDIÃ‡ÃƒO
  if(window.modoEdicaoAgenda){

    google.script.run
      .withSuccessHandler(function(ok){

        if(ok){
          fecharModalAgenda();
          carregarCronograma();

          window.modoEdicaoAgenda = false;
          window.envioEdicaoAgenda = null;

          mostrarAlerta("Item atualizado com sucesso.");
        }else{
          mostrarAlerta("NÃ£o foi possÃ­vel atualizar o item.");
        }

      })
      .withFailureHandler(function(err){
        console.error("Erro ao atualizar agenda:", err);
        mostrarAlerta("Erro ao atualizar.");
      })
      .atualizarAgendaPorEnvio({
        envio: window.envioEdicaoAgenda,
        dados: {
          data,
          setor,
          tipo,
          descricao,
          caminhao,
          equipe,
          equipeQtd // ðŸ”¥ NOVO
        }
      });

    return;
  }

  // ðŸ†• NOVO
  const responsavel = document.getElementById("agendaResponsavel").value;
  const senha = document.getElementById("agendaSenha").value;

  if(!responsavel){
    mostrarAlerta("Selecione quem estÃ¡ enviando.");
    return;
  }

  if(!senha){
    mostrarAlerta("Digite a senha.");
    return;
  }

  google.script.run
    .withSuccessHandler(function(ok){

      if(!ok){
        mostrarAlerta("Senha incorreta.");
        return;
      }

      google.script.run
        .withSuccessHandler(function(){
          fecharModalAgenda();
          carregarCronograma();
          mostrarAlerta("Item salvo com sucesso.");
        })
        .withFailureHandler(function(err){
          console.error("Erro ao salvar agenda:", err);
          mostrarAlerta("Erro ao salvar.");
        })
        .salvarAgenda({
          responsavel,
          data,
          setor,
          tipo,
          descricao,
          caminhao,
          equipe,
          equipeQtd // ðŸ”¥ NOVO
        });

    })
    .withFailureHandler(function(err){
      console.error("Erro ao validar senha agenda:", err);
      mostrarAlerta("Erro ao validar senha.");
    })
    .validarSenhaAgenda(responsavel, senha);
}
function carregarAgenda(){

  google.script.run
    .withSuccessHandler(function(lista){
      window.agendaData = lista || [];
      renderCronograma();
    })
    .getAgenda();

}

function abrirSenhaAgenda(el){

  const envio = el.dataset.envio;
  const responsavel = el.dataset.responsavel;
  const dados = JSON.parse(decodeURIComponent(el.dataset.info));

  window._agendaTemp = {
    envio,
    responsavel,
    dados
  };

  document.getElementById("inputSenhaAgenda").value = "";
  document.getElementById("erroSenhaAgenda").style.display = "none";

  document.getElementById("modalSenhaAgenda").classList.add("show");

  setTimeout(() => {
    document.getElementById("inputSenhaAgenda").focus();
  }, 100);
}

function fecharSenhaAgenda(){
  document.getElementById("modalSenhaAgenda").classList.remove("show");
}

function confirmarSenhaAgenda(){

  const senha = document.getElementById("inputSenhaAgenda").value;
  const { envio, responsavel, dados } = window._agendaTemp || {};

  if(!senha) return;

  google.script.run
    .withSuccessHandler(function(ok){

      if(!ok){
        document.getElementById("erroSenhaAgenda").style.display = "block";
        return;
      }

      fecharSenhaAgenda();

      abrirEdicaoAgenda(dados, envio);

    })
.validarSenhaAgenda(responsavel, senha)
}

function abrirEdicaoAgenda(dados, envio){

  window.modoEdicaoAgenda = true;
  window.envioEdicaoAgenda = envio;

  // ðŸ”¥ VISUAL EDIÃ‡ÃƒO
  document.getElementById("tituloModalAgenda").innerText = "Editar item da agenda";
  document.getElementById("blocoAgendaResponsavel").style.display = "none";
  document.getElementById("blocoAgendaSenha").style.display = "none";
  document.getElementById("btnExcluirAgenda").style.display = "inline-block";

  // ðŸ”¥ LIMPA
  document.getElementById("agendaResponsavel").value = "";
  document.getElementById("agendaSenha").value = "";
  document.getElementById("agendaData").value = dados.data || "";
  document.getElementById("agendaSetor").value = dados.setor || "";
  document.getElementById("agendaTipo").value = dados.tipo || "";
  document.getElementById("agendaDescricao").value = dados.descricao || "";

  // ðŸ”¥ ABRE MODAL
  document.getElementById("modalAgenda").classList.add("show");

  controlarTipoAgenda();

  const camContainer = document.querySelector('[data-type="caminhao"]');
  const eqpContainer = document.querySelector('[data-type="equipe"]');

  function esperarRender(container, callback){
    const interval = setInterval(() => {
      if(container.querySelectorAll(".multi-option").length){
        clearInterval(interval);
        callback();
      }
    }, 50);
  }

  // ðŸš› CAMINHÃƒO (SEM CACHE)
  if(camContainer){
renderMultiSelectEtapa(camContainer, CACHE.caminhoes, "caminhao");

esperarRender(camContainer, () => {

  const listaCam = (dados.caminhao || "").split("|").map(v => v.trim());

  camContainer.querySelectorAll(".multi-option").forEach(opt => {
    const val = (opt.dataset.value || "").trim();
    aplicarVisualSelecaoMulti(opt, listaCam.includes(val));
  });

});
  }

  // ðŸ‘· EQUIPE (SEM CACHE)
  if(eqpContainer){
    google.script.run.withSuccessHandler(lista => {

      renderMultiSelectEtapa(eqpContainer, lista, "equipe");

      esperarRender(eqpContainer, () => {

        const listaEq = (dados.equipe || "").split("|").map(v => v.trim());
        const listaQtd = (dados.equipeQtd || "").split("|").map(v => Number(v) || 0);

        eqpContainer.querySelectorAll(".multi-option").forEach(opt => {
          const val = (opt.dataset.value || "").trim();
          aplicarVisualSelecaoMulti(opt, listaEq.includes(val));
        });

        const inputQtd = document.querySelector(".agenda-qtd-equipe");

        if(inputQtd){

          const selecionados = [...eqpContainer.querySelectorAll(".selected")];

          const indexTerceirizada = selecionados.findIndex(opt => {
            const tipo = opt.querySelector("span")?.innerText.toLowerCase() || "";
            return tipo.includes("terceirizada");
          });

          if(indexTerceirizada >= 0){
            inputQtd.style.display = "";
            inputQtd.value = listaQtd[indexTerceirizada] || "";
          }else{
            inputQtd.style.display = "none";
            inputQtd.value = "";
          }

        }

      });

    }).getEquipes(); // ðŸ”¥ precisa existir no GS
  }

}
function excluirAgenda(){

  const envio = window.envioEdicaoAgenda;

  if(!envio) return;

  confirmarAcao("Deseja excluir este item?", (ok) => {

    if(!ok) return;

    google.script.run
      .withSuccessHandler(function(){

        fecharModalAgenda();
        carregarCronograma();

        window.modoEdicaoAgenda = false;
        window.envioEdicaoAgenda = null;

        mostrarAlerta("Item excluÃ­do com sucesso.");

      })
      .withFailureHandler(function(){
        mostrarAlerta("Erro ao excluir.");
      })
      .excluirAgendaPorEnvio(envio);

  });

}

document.addEventListener("click", function(e){

  const card = e.target.closest(".task-card");
  const overlay = document.getElementById("zoomOverlay");

  // ðŸ‘‰ BLOQUEIA ZOOM PARA AGENDA
  if(card && !card.classList.contains("agenda-card")){

    document.querySelectorAll(".task-card.zoomed").forEach(c => {
      c.classList.remove("zoomed");
    });

    card.classList.add("zoomed");
    overlay.classList.add("show");
  }

  // ðŸ‘‰ FECHAR OVERLAY
  if(e.target.id === "zoomOverlay"){
    document.querySelectorAll(".task-card.zoomed").forEach(c => {
      c.classList.remove("zoomed");
    });
    overlay.classList.remove("show");
  }

});
function aplicarVisualSelecaoMulti(el, ativo){

  if(ativo){
    el.classList.add("selected");
    el.style.background = "#123A6F";
    el.style.color = "#fff";

    el.querySelectorAll("strong, span, div").forEach(node => {
      node.style.color = "#fff";
    });

  }else{
    el.classList.remove("selected");
    el.style.background = "";
    el.style.color = "";

    el.querySelectorAll("strong, span, div").forEach(node => {
      node.style.color = "";
    });
  }

  // ðŸ”¥ NOVO â€” atualiza campo de quantidade automaticamente
  if(typeof controlarQtdEquipeAgenda === "function"){
    controlarQtdEquipeAgenda();
  }

}
function abrirAgendaNova(){

  // ðŸ”¥ RESET ESTADO
  window.modoEdicaoAgenda = false;
  window.envioEdicaoAgenda = null;

  // ðŸ”¥ VISUAL
  document.getElementById("tituloModalAgenda").innerText = "Novo item da agenda";
  document.getElementById("blocoAgendaResponsavel").style.display = "";
  document.getElementById("blocoAgendaSenha").style.display = "";
  document.getElementById("btnExcluirAgenda").style.display = "none";

  // ðŸ”¥ LIMPA CAMPOS
  const set = (id, val = "") => {
    const el = document.getElementById(id);
    if(el) el.value = val;
  };

  set("agendaResponsavel");
  set("agendaSenha");
  set("agendaData");
  set("agendaSetor");
  set("agendaTipo");
  set("agendaDescricao");

  // ðŸ”¥ ESCONDE CAMPOS
  document.getElementById("blocoAgendaCaminhao").style.display = "none";
  document.getElementById("blocoAgendaEquipe").style.display = "none";

  // ðŸ”¥ LIMPA MULTISELECT
  const limparMulti = (type) => {
    const container = document.querySelector(`[data-type="${type}"]`);
    if(container) container.innerHTML = "";
  };

  limparMulti("caminhao");
  limparMulti("equipe");

  // ðŸ”¥ LIMPA QTD
  const inputQtd = document.querySelector(".agenda-qtd-equipe");
  if(inputQtd){
    inputQtd.value = "";
    inputQtd.style.display = "none";
  }

  // ðŸ”¥ ABRE MODAL
  document.getElementById("modalAgenda").classList.add("show");

  // ðŸ”¥ ATIVA TIPO (SEM CACHE)
  controlarTipoAgenda();

}
function controlarTipoAgenda(select){

  const sel = select || document.getElementById("agendaTipo");
  if(!sel) return;

  const tipo = (sel.value || "").toLowerCase();

  const blocoCam = document.getElementById("blocoAgendaCaminhao");
  const blocoEqp = document.getElementById("blocoAgendaEquipe");

  if(!blocoCam || !blocoEqp) return;

  const containerCam = blocoCam.querySelector('[data-type="caminhao"]');
  const containerEqp = blocoEqp.querySelector('[data-type="equipe"]');

  if(containerCam) containerCam.innerHTML = "";
  if(containerEqp) containerEqp.innerHTML = "";

  if(tipo.includes("externa")){

    blocoCam.style.display = "";
    blocoEqp.style.display = "";

    // ðŸš› CAMINHÃƒO (CORRIGIDO)
    if(containerCam){
      google.script.run.withSuccessHandler(lista => {
        renderMultiSelectEtapa(containerCam, lista, "caminhao");
      }).getCaminhoes();
    }

    // ðŸ‘· EQUIPE (jÃ¡ estava certo)
    if(containerEqp){
      google.script.run.withSuccessHandler(lista => {
        renderMultiSelectEtapa(containerEqp, lista, "equipe");
        controlarQtdEquipeGlobal();
      }).getEquipes();
    }

  }else if(tipo.includes("interna")){

    blocoCam.style.display = "none";
    blocoEqp.style.display = "";

    if(containerEqp){
      google.script.run.withSuccessHandler(lista => {
        renderMultiSelectEtapa(containerEqp, lista, "equipe");
        controlarQtdEquipeGlobal();
      }).getEquipes();
    }

  }else{

    blocoCam.style.display = "none";
    blocoEqp.style.display = "none";

    controlarQtdEquipeGlobal();

  }

}
function controlarQtdEquipeAgenda(){

  const containerEqp = document.querySelector('[data-type="equipe"]');
  const inputQtd = document.querySelector(".agenda-qtd-equipe");

  if(!containerEqp || !inputQtd) return;

  const selecionados = [...containerEqp.querySelectorAll(".multi-option.selected")];

  const temTerceirizada = selecionados.some(opt => {
    const tipo = opt.querySelector("span")?.innerText.toLowerCase() || "";
    return tipo.includes("terceirizada");
  });

  if(temTerceirizada){
    inputQtd.style.display = "";
  }else{
    inputQtd.style.display = "none";
    inputQtd.value = "";
  }

}
function esperarRender(container, callback){
  const intervalo = setInterval(() => {
    const itens = container.querySelectorAll(".multi-option");

    if(itens.length){
      clearInterval(intervalo);
      callback();
    }
  }, 50);
}
window.initCronograma = function(){

  console.log("ðŸš€ initCronograma");

  let tentativas = 0;

  const intervalo = setInterval(() => {

    const root = document.querySelector("#cronogramaBody");

    if (!root) {
      tentativas++;
      if (tentativas > 200) {
        clearInterval(intervalo);
        console.warn("âš ï¸ cronograma nÃ£o apareceu");
      }
      return;
    }

    clearInterval(intervalo);

    // ðŸ”¥ SEM BLOQUEIO
    root.dataset.cronogramaInit = "1";

    iniciar();

    window.finalizarCarregamentoModulo?.();

    window.__activeModuleDestroy = function () {
      console.log("ðŸ§¹ destroy cronograma");
      delete root.dataset.cronogramaInit;
    };

  }, 50);

};

window.__moduleInit = window.initCronograma;
