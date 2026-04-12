console.log("🚛 cadastro-caminhoes.js carregado");

/* =====================================================
   INIT (SPA SAFE ✅ sem travar na 2ª vez)
===================================================== */

window.initCadastroCaminhoes = function () {

  console.log("🚀 initCadastroCaminhoes");

  // espera o DOM do módulo existir (sem depender de flag global)
  let tentativas = 0;

  const intervalo = setInterval(() => {

    const tbody = document.querySelector("#tabelaCaminhoes");

    if (!tbody) {
      tentativas++;
      if (tentativas > 200) { // 200*50ms = 10s
        clearInterval(intervalo);
        console.warn("⚠️ tabelaCaminhoes não apareceu a tempo");
      }
      return;
    }

    clearInterval(intervalo);

    // pega um "root" do módulo (ou o próprio tbody)
    const root =
      tbody.closest(".container-caminhoes") ||
      tbody.closest(".container") ||
      tbody;

    // 🔥 trava POR DOM (não por window)
    if (root.dataset.caminhoesInit === "1") {
      console.log("⚠️ caminhões já inicializado neste DOM");
      return;
    }
    root.dataset.caminhoesInit = "1";

    // ✅ inicializa sempre que voltar pra tela (DOM novo)
    inicializarEventos();
    inicializarValidacoes?.();
    carregarCaminhoes();

    // libera loader
    window.finalizarCarregamentoModulo?.();

    // destroy opcional (se seu SPA chamar)
    window.__activeModuleDestroy = function () {
      console.log("🧹 destroy cadastro caminhões");

      // destrava por DOM
      delete root.dataset.caminhoesInit;

      // remove listeners recriando elementos de filtro
      ["filtroTexto","filtroTipo","filtroStatus"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const novo = el.cloneNode(true);
        el.parentNode.replaceChild(novo, el);
      });
    };

  }, 50);

};

// (importante no seu loader SPA)
window.__moduleInit = window.initCadastroCaminhoes;
/* =====================================================
   MODAL
===================================================== */

function fecharModalCaminhao() {
  document.getElementById("modalCaminhao").classList.add("hidden");
}

/* =====================================================
   STATUS
===================================================== */

function setStatusCaminhao(status) {

  document.getElementById("statusInput").value = status;

  document.querySelectorAll(".status-btn").forEach(btn => {
    btn.classList.remove("selected");
  });

  document.querySelector(`.status-btn.${status}`)?.classList.add("selected");
}

/* =====================================================
   FILTROS
===================================================== */

function inicializarEventos() {
  ["filtroTexto", "filtroTipo", "filtroStatus"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", carregarCaminhoes);
    document.getElementById(id)?.addEventListener("change", carregarCaminhoes);
  });
}

/* =====================================================
   VALIDAÇÕES
===================================================== */

function inicializarValidacoes() {

  /* ================= PLACA ================= */

  const placaInput = document.getElementById("placaInput");

  if (placaInput && !placaInput.dataset.evento) {

    placaInput.dataset.evento = "true";

    placaInput.addEventListener("input", function () {
      this.value = this.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 7);

      this.style.borderColor = "";
    });

    placaInput.addEventListener("blur", function () {
      if (this.value && !validarPlaca(this.value)) {
        this.style.borderColor = "#dc2626";
        mostrarAlerta("Placa inválida.");
      }
    });
  }


  /* ================= CNPJ ================= */

  const cnpjInput = document.getElementById("cnpjInput");

  if (cnpjInput && !cnpjInput.dataset.evento) {

    cnpjInput.dataset.evento = "true";

    cnpjInput.addEventListener("input", function () {
      this.value = formatarCNPJ(this.value);
      this.style.borderColor = "";
    });

    cnpjInput.addEventListener("blur", async function () {

      const numeros = this.value.replace(/\D/g, "");

      if (numeros.length === 14) {

        if (!validarCNPJ(numeros)) {
          this.style.borderColor = "#dc2626";
          mostrarAlerta("CNPJ inválido.");
          return;
        }

        this.style.borderColor = "";

        // 🔥 Busca automática
        await buscarEmpresaPorCNPJ(numeros);

      }

    });
  }


  /* ================= CAPACIDADE ================= */

  ["larguraInput", "alturaInput", "comprimentoInput"].forEach(id => {

    const input = document.getElementById(id);

    if (input && !input.dataset.evento) {

      input.dataset.evento = "true";

      input.addEventListener("input", atualizarCapacidadePreview);

    }

  });

}


/* =====================================================
   CAPACIDADE
===================================================== */

function atualizarCapacidadePreview() {

  const largura = parseFloat(document.getElementById("larguraInput")?.value) || 0;
  const altura = parseFloat(document.getElementById("alturaInput")?.value) || 0;
  const comprimento = parseFloat(document.getElementById("comprimentoInput")?.value) || 0;

  const capacidade = largura * altura * comprimento;

  document.getElementById("capacidadePreview").innerText =
    capacidade.toFixed(2) + " m³";
}


/* =====================================================
   VALIDAR PLACA
===================================================== */

function validarPlaca(placa) {
  const regexAntigo = /^[A-Z]{3}[0-9]{4}$/;
  const regexMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  return regexAntigo.test(placa) || regexMercosul.test(placa);
}
/* =====================================================
   VALIDAR CNPJ
===================================================== */

function validarCNPJ(cnpj) {
  if (/^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado != digitos.charAt(0)) return false;

  tamanho++;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  return resultado == digitos.charAt(1);
}
function formatarCNPJ(valor) {

  valor = valor.replace(/\D/g, "");
  valor = valor.slice(0, 14);

  valor = valor.replace(/^(\d{2})(\d)/, "$1.$2");
  valor = valor.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
  valor = valor.replace(/\.(\d{3})(\d)/, ".$1/$2");
  valor = valor.replace(/(\d{4})(\d)/, "$1-$2");

  return valor;
}

async function buscarEmpresaPorCNPJ(cnpj) {

  try {

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    if (!response.ok) return;

    const data = await response.json();

    document.getElementById("empresaInput").value = data.razao_social || "";
    document.getElementById("telefoneInput").value = data.ddd_telefone_1 || "";

  } catch (error) {
    console.error("Erro ao buscar CNPJ:", error);
  }

}
/* =====================================================
   CARREGAR
===================================================== */

async function carregarCaminhoes() {

  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;

  if (!empresaId) return;

  const filtroTexto  = (document.getElementById("filtroTexto")?.value || "").toLowerCase();
  const filtroTipo   = document.getElementById("filtroTipo")?.value || "";
  const filtroStatus = document.getElementById("filtroStatus")?.value || "";

  let query = supabase
    .from("caminhoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false });

  if (filtroTipo)   query = query.eq("tipo", filtroTipo);
  if (filtroStatus) query = query.eq("status", filtroStatus);

  const { data, error } = await query;

  if (error) {
    console.error("❌ Erro ao carregar caminhões:", error);
    return;
  }

  const tbody = document.getElementById("tabelaCaminhoes");
  if (!tbody) {
    console.warn("⚠️ tabelaCaminhoes não existe no HTML deste módulo");
    return;
  }

  tbody.innerHTML = "";

  // ✅ GARANTE ARRAY (evita quebrar quando data vem null)
  const rows = Array.isArray(data) ? data : [];

  const filtrados = rows.filter(cam =>
    (cam.modelo || "").toLowerCase().includes(filtroTexto) ||
    (cam.placa  || "").toLowerCase().includes(filtroTexto)
  );

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;">Nenhum caminhão encontrado</td></tr>`;
    // se você estiver usando o loader “até renderizar”, pode liberar aqui também
    window.finalizarCarregamentoModulo?.();
    return;
  }

  filtrados.forEach(cam => {

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    tr.addEventListener("click", () => {
      abrirModalDetalheCaminhao(cam);
    });

    tr.innerHTML = `
      <td>${cam.modelo || "-"}</td>
      <td>${cam.placa || "-"}</td>
      <td>
        <span class="table-card vinculo ${cam.tipo || ""}">
          ${cam.tipo === "proprio" ? "Próprio" : "Terceirizado"}
        </span>
      </td>
      <td>${cam.empresa_nome || "-"}</td>
      <td>
        ${cam.categoria
          ? `<span class="table-card categoria ${String(cam.categoria).toLowerCase()}">${cam.categoria}</span>`
          : "-"}
      </td>
      <td>
        <span class="table-card capacidade">
          ${Number(cam.capacidade_m3 || 0).toFixed(2)} m³
        </span>
      </td>
      <td>
        <span class="table-card status ${cam.status || ""}">
          ${cam.status || "-"}
        </span>
      </td>
    `;

    tbody.appendChild(tr); // ✅ só uma vez
  });

  // ✅ tabela renderizada
  window.finalizarCarregamentoModulo?.();
}
/* =====================================================
   SALVAR
===================================================== */

async function salvarCaminhao() {

  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;

  if (!empresaId) {
    mostrarAlerta("Erro de contexto da empresa.");
    return;
  }

  /* ================= CAMPOS ================= */

  const modelo = document.getElementById("modeloInput").value.trim();
  const placa = document.getElementById("placaInput").value.trim().toUpperCase();
  const tipo = document.getElementById("tipoInput").value;
  const status = document.getElementById("statusInput").value;

  const empresaNome = document.getElementById("empresaInput").value.trim();
  const telefone = document.getElementById("telefoneInput").value.trim();
  const categoria = document.getElementById("categoriaInput").value;

  const cnpjRaw = document.getElementById("cnpjInput")?.value || "";
  const cnpj = cnpjRaw.replace(/\D/g, "");

  const largura = parseFloat(document.getElementById("larguraInput").value) || 0;
  const altura = parseFloat(document.getElementById("alturaInput").value) || 0;
  const comprimento = parseFloat(document.getElementById("comprimentoInput").value) || 0;

  const comprimentoTotal = parseFloat(document.getElementById("comprimentoTotalInput").value) || null;
  const larguraTotal = parseFloat(document.getElementById("larguraTotalInput").value) || null;
  const alturaTotal = parseFloat(document.getElementById("alturaTotalInput").value) || null;

  /* ================= VALIDAÇÕES ================= */

  if (!modelo || !placa || !tipo) {
    mostrarAlerta("Preencha os campos obrigatórios.");
    return;
  }

  if (!validarPlaca(placa)) {
    mostrarAlerta("Placa inválida.");
    document.getElementById("placaInput").focus();
    return;
  }

  if (cnpj && !validarCNPJ(cnpj)) {
    mostrarAlerta("CNPJ inválido.");
    document.getElementById("cnpjInput").focus();
    return;
  }

  if (largura <= 0 || altura <= 0 || comprimento <= 0) {
    mostrarAlerta("Informe dimensões internas válidas.");
    return;
  }

  const capacidade = largura * altura * comprimento;

  /* ================= INSERT ================= */

  const { error } = await supabase
    .from("caminhoes")
    .insert([{
      empresa_id: empresaId,
      modelo,
      placa,
      tipo,
      categoria,
      empresa_nome: empresaNome || null,
      telefone: telefone || null,
      cnpj: cnpj || null,
      largura_bau: largura,
      altura_bau: altura,
      comprimento_bau: comprimento,
      comprimento_total: comprimentoTotal,
      largura_total: larguraTotal,
      altura_total: alturaTotal,
      capacidade_m3: capacidade,
      status
    }]);

  if (error) {
    console.error(error);
    mostrarAlerta("Erro ao salvar o caminhão.");
    return;
  }

  fecharModalCaminhao();
  carregarCaminhoes();
}
/* =====================================================
   IMPRIMIR
===================================================== */

function imprimirCaminhoes() {
  window.print();
}/* =====================================================
   MODAL ALERTA EASYLOC
===================================================== */

function mostrarAlerta(texto, titulo = "Atenção") {

  document.getElementById("modalAlertaTitulo").innerText = titulo;
  document.getElementById("modalAlertaTexto").innerText = texto;

  document.getElementById("modalAlerta").classList.remove("hidden");

}

function fecharAlerta() {
  document.getElementById("modalAlerta").classList.add("hidden");
}
/* =====================================================
   MODAL DETALHE / VISUALIZAÇÃO CAMINHÃO
===================================================== */

window.caminhaoSelecionado =
  window.caminhaoSelecionado ?? null;

window.modoCaminhao =
  window.modoCaminhao ?? "novo";

function abrirModalDetalheCaminhao(cam){

  caminhaoSelecionado = cam;
  modoCaminhao = "detalhe";

  document.querySelector(".modal-header-caminhao h2").innerText = "Detalhes do Caminhão";

  preencherFormularioCaminhao(cam);

  bloquearFormularioCaminhao(true);

  mostrarBotaoEditarCaminhao(true);

  document.getElementById("modalCaminhao").classList.remove("hidden");
}
function preencherFormularioCaminhao(cam) {

  document.getElementById("modeloInput").value = cam.modelo || "";
  document.getElementById("placaInput").value = cam.placa || "";
  document.getElementById("tipoInput").value = cam.tipo || "proprio";
  document.getElementById("categoriaInput").value = cam.categoria || "vuc";
  document.getElementById("empresaInput").value = cam.empresa_nome || "";
  document.getElementById("telefoneInput").value = cam.telefone || "";
  document.getElementById("cnpjInput").value = cam.cnpj || "";

  document.getElementById("larguraInput").value = cam.largura_bau || "";
  document.getElementById("alturaInput").value = cam.altura_bau || "";
  document.getElementById("comprimentoInput").value = cam.comprimento_bau || "";

  document.getElementById("comprimentoTotalInput").value = cam.comprimento_total || "";
  document.getElementById("larguraTotalInput").value = cam.largura_total || "";
  document.getElementById("alturaTotalInput").value = cam.altura_total || "";

  document.getElementById("statusInput").value = cam.status || "ativo";

  atualizarCapacidadePreview();
}
function bloquearFormularioCaminhao(bloquear) {

  const campos = document.querySelectorAll("#modalCaminhao input, #modalCaminhao select");

  campos.forEach(campo => {
    campo.disabled = bloquear;
  });

  document.getElementById("btnSalvarCaminhao").style.display =
    bloquear ? "none" : "inline-block";
}
function abrirModalCaminhao(){

  modoCaminhao = "novo";
  caminhaoSelecionado = null;

  const modal = document.getElementById("modalCaminhao");

  // 🔥 LIMPA TODOS OS INPUTS E SELECTS
  modal.querySelectorAll("input, select").forEach(campo => {

    if(campo.type === "hidden") return;

    if(campo.tagName === "SELECT"){
      campo.selectedIndex = 0;
    } else {
      campo.value = "";
    }

  });

  // 🔥 ZERA CAPACIDADE CALCULADA
  const capacidadeEl = document.getElementById("capacidadePreview");
  if(capacidadeEl){
    capacidadeEl.innerText = "0.00 m³";
  }

  // 🔥 Resetar status para ativo
  setStatusCaminhao("ativo");

  // 🔥 Atualiza título
  document.querySelector(".modal-header-caminhao h2").innerText = "Cadastrar Caminhão";

  // 🔥 Desbloqueia formulário
  bloquearFormularioCaminhao(false);

  // 🔥 Esconde botão editar
  mostrarBotaoEditarCaminhao(false);

  // 🔥 Mostra modal
  modal.classList.remove("hidden");

  inicializarValidacoes();
}
/* =====================================================
   BOTÃO EDITAR — CAMINHÃO
===================================================== */

function mostrarBotaoEditarCaminhao(mostrar){
  const btn = document.getElementById("btnEditarCaminhao");
  if(!btn) return;
  btn.classList.toggle("hidden", !mostrar);
}

function prepararEdicaoCaminhao(){

  if(!caminhaoSelecionado){
    // se por algum motivo não tiver selecionado, só libera edição
    bloquearFormularioCaminhao(false);
    mostrarBotaoEditarCaminhao(false);
    document.querySelector(".modal-header-caminhao h2").innerText = "Editar Caminhão";
    return;
  }

  modoCaminhao = "editar";

  document.querySelector(".modal-header-caminhao h2").innerText = "Editar Caminhão";

  preencherFormularioCaminhao(caminhaoSelecionado);

  bloquearFormularioCaminhao(false);

  mostrarBotaoEditarCaminhao(false);

  // mantém o modal aberto
  document.getElementById("modalCaminhao").classList.remove("hidden");

  // garante que preview atualize
  setTimeout(atualizarCapacidadePreview, 50);
}
function limparFormularioCaminhao(){

  const form = document.querySelector("#modalCaminhao");

  form.querySelectorAll("input, select").forEach(campo => {

    if(campo.type === "hidden") return;

    if(campo.tagName === "SELECT"){
      campo.selectedIndex = 0;
    } else {
      campo.value = "";
    }

  });

  // reset status
  setStatusCaminhao("ativo");

}
window.__moduleInit = window.initCadastroCaminhoes;