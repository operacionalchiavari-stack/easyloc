export function getEls(){

  return {
    tbody: document.getElementById("listaItens"),
    addItemBtn: document.getElementById("addItemBtn"),
    addComponenteBtn: document.getElementById("addComponenteBtn"),
    addEspacoBtn: document.getElementById("addEspacoBtn"),
addPersonalizacaoBtn: document.getElementById("addPersonalizacaoBtn"),
addServicoBtn: document.getElementById("addServicoBtn"),
modalComponente: document.getElementById("modalConfirmarComponente"),

    clienteInput: document.getElementById("clienteInput"),
    clienteLista: document.getElementById("clienteLista"),
    clienteIdHidden: document.getElementById("clienteIdHidden"),

    responsavelInput: document.getElementById("responsavelInput"),
    telefoneInput: document.getElementById("telefoneInput"),

    localInput: document.getElementById("localInput"),
    localLista: document.getElementById("localLista"),
    localIdHidden: document.getElementById("localIdHidden"),
    localObservacoes: document.getElementById("localObservacoes"),

    entregaInput: document.getElementById("dataEntrega"),
    eventoInput: document.getElementById("dataEvento"),
    coletaInput: document.getElementById("dataColeta"),

    entregaDia: document.getElementById("diaEntrega"),
    eventoDia: document.getElementById("diaEvento"),
    coletaDia: document.getElementById("diaColeta"),
  };
}
export function parseCurrency(valor) {
  return (
    parseFloat(
      String(valor)
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim()
    ) || 0
  );
}

export function formatCurrency(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function atualizarDiaSemana(inputData, elDiaSemana){
  if(!inputData || !elDiaSemana) return;

  const valor = inputData.value;

  if(!valor){
    elDiaSemana.innerText = "—";
    return;
  }

  const data = new Date(valor + "T00:00:00");

  const dia = data.toLocaleDateString("pt-BR", {
    weekday: "long"
  });

  elDiaSemana.innerText = dia.charAt(0).toUpperCase() + dia.slice(1);
}

export function bindDiasSemana(els){

  const { entregaInput, eventoInput, coletaInput, entregaDia, eventoDia, coletaDia } = els;

  if(entregaInput){
    entregaInput.addEventListener("change", () =>
      atualizarDiaSemana(entregaInput, entregaDia)
    );
  }

  if(eventoInput){
    eventoInput.addEventListener("change", () =>
      atualizarDiaSemana(eventoInput, eventoDia)
    );
  }

  if(coletaInput){
    coletaInput.addEventListener("change", () =>
      atualizarDiaSemana(coletaInput, coletaDia)
    );
  }

  atualizarDiaSemana(entregaInput, entregaDia);
  atualizarDiaSemana(eventoInput, eventoDia);
  atualizarDiaSemana(coletaInput, coletaDia);
}

export function debounce(fn, wait){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}