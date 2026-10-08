/* =========================================================
   ITENS DANIFICADOS — DADOS DA PÁGINA (?p=painel)

   Funções leves feitas para a página não travar:
   - itensDanificadosAbertas(): só as O.S em aberto, só
     as colunas usadas, datas já formatadas.
   - itensDanificadosIndicadores(): teto de gastos, metas
     dos setores e ocorrências de RH numa chamada só, com
     cache curto (o painel da TV pede isso o tempo todo).
========================================================= */

const ITENS_DANIFICADOS_CACHE_INDICADORES =
  "itensDanificadosIndicadores";

const ITENS_DANIFICADOS_CACHE_SEGUNDOS =
  60;


/* =========================================================
   O.S EM ABERTO
========================================================= */

function itensDanificadosAbertas(){

  const sh =
    getSheet();

  const ultimaLinha =
    sh.getLastRow();

  const fuso =
    Session.getScriptTimeZone();

  const lista = [];

  if(ultimaLinha >= 2){

    /* A até Q: ID … data de urgência */
    const dados =
      sh.getRange(2, 1, ultimaLinha - 1, 17).getValues();

    dados.forEach(function(l){

      /* Linha vazia */
      if(!l[0] && !l[5]){
        return;
      }

      if(itensDanificadosConcluido_(l[11])){
        return;
      }

      const fluxo =
        [l[7], l[8], l[9], l[10]]
          .map(function(v){ return String(v || "").trim(); })
          .filter(function(v){ return v; });

      lista.push({
        id: String(l[0]),
        data: itensDanificadosFormatar_(l[1], fuso, "dd/MM/yyyy HH:mm"),
        dataOrdem: itensDanificadosFormatar_(l[1], fuso, "yyyy-MM-dd'T'HH:mm"),
        setor: String(l[2] || "").trim(),
        nome: String(l[3] || "").trim(),
        os: String(l[4] === "" || l[4] === null ? "" : l[4]).trim(),
        item: String(l[5] || "").replace(/"/g, "").trim(),
        qtd: l[6] === "" ? "" : l[6],
        fluxo: fluxo,
        onde: String(l[12] || "").trim(),
        pedido: String(l[13] || "").trim(),
        detalhes: String(l[14] || "").replace(/"/g, "").trim(),
        dataU: itensDanificadosFormatar_(l[16], fuso, "yyyy-MM-dd")
      });

    });

  }

  return {
    ok: true,
    lista: lista,
    atualizadoEm: Utilities.formatDate(new Date(), fuso, "HH:mm:ss")
  };

}


/* =========================================================
   INDICADORES DO PAINEL (TV)
========================================================= */

function itensDanificadosIndicadores(forcar){

  const cache =
    CacheService.getScriptCache();

  if(!forcar){

    const guardado =
      cache.get(ITENS_DANIFICADOS_CACHE_INDICADORES);

    if(guardado){
      return JSON.parse(guardado);
    }

  }

  const resultado = {
    ok: true,
    teto: itensDanificadosTentar_(function(){ return getTetoGastosMensal(); }),
    metas: itensDanificadosTentar_(function(){ return getMetasSetoresMensal(); }),
    rh: itensDanificadosTentar_(function(){ return itensDanificadosRHPorSetor_(); }),
    mes: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM")
  };

  const texto =
    JSON.stringify(resultado);

  /* Cache aceita até 100 KB por chave */
  if(texto.length < 95000){
    try{
      cache.put(ITENS_DANIFICADOS_CACHE_INDICADORES, texto, ITENS_DANIFICADOS_CACHE_SEGUNDOS);
    } catch(erro){}
  }

  return JSON.parse(texto);

}

/* Ocorrências de RH somadas por setor */
function itensDanificadosRHPorSetor_(){

  const lista =
    getAvaliacaoIndividualRH();

  const campos = [
    ["atraso", "metaAtraso", "Atrasos"],
    ["semUniforme", "metaSemUniforme", "Sem uniforme"],
    ["semEpi", "metaSemEpi", "Sem EPI"],
    ["usoCelular", "metaUsoCelular", "Uso de celular"],
    ["falta", "metaFalta", "Faltas"],
    ["advertencia", "metaAdvertencia", "Advertências"],
    ["ausenciaJornada", "metaAusenciaJornada", "Ausência de jornada"]
  ];

  const porSetor = {};

  (Array.isArray(lista) ? lista : []).forEach(function(funcionario){

    const setor =
      String(funcionario.setor || "").trim();

    if(!setor){
      return;
    }

    if(!porSetor[setor]){
      porSetor[setor] = {
        setor: setor,
        ocorrencias: campos.map(function(campo){
          return { tipo: campo[2], qtd: 0, meta: 0 };
        })
      };
    }

    campos.forEach(function(campo, i){
      porSetor[setor].ocorrencias[i].qtd += Number(funcionario[campo[0]] || 0);
      porSetor[setor].ocorrencias[i].meta += Number(funcionario[campo[1]] || 0);
    });

  });

  return Object.keys(porSetor).map(function(setor){
    return porSetor[setor];
  });

}


/* =========================================================
   APOIO
========================================================= */

function itensDanificadosTentar_(funcao){

  try{
    return { ok: true, dados: funcao() };
  } catch(erro){
    return { ok: false, erro: String(erro && erro.message || erro) };
  }

}

function itensDanificadosConcluido_(valor){

  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .indexOf("concluido") >= 0;

}

function itensDanificadosFormatar_(valor, fuso, formato){

  if(valor instanceof Date && !isNaN(valor.getTime())){
    return Utilities.formatDate(valor, fuso, formato);
  }

  const texto =
    String(valor || "").trim();

  if(!texto){
    return "";
  }

  /* "aaaa-mm-dd" gravado como texto */
  if(/^\d{4}-\d{2}-\d{2}/.test(texto) && formato === "yyyy-MM-dd"){
    return texto.slice(0, 10);
  }

  /* "dd/mm/aaaa" gravado como texto */
  const br =
    texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if(br && formato === "yyyy-MM-dd"){
    return br[3] + "-" + br[2] + "-" + br[1];
  }

  return formato === "yyyy-MM-dd" ? "" : texto;

}


/* =========================================================
   CATÁLOGO DE ITENS (categorias + itens numa chamada só)
========================================================= */

function itensDanificadosCatalogo(){

  const sh =
    SpreadsheetApp.openById(ID_ITENS).getSheetByName(ABA_ITENS);

  const ultimaLinha =
    sh.getLastRow();

  const itens = [];
  const categorias = {};

  if(ultimaLinha >= 2){

    sh.getRange(2, 1, ultimaLinha - 1, 3).getValues().forEach(function(l){

      const categoria = String(l[0] || "").trim();
      const nome = String(l[1] || "").trim();
      const codigo = String(l[2] || "").trim();

      if(!categoria || !nome){
        return;
      }

      categorias[categoria] = true;

      itens.push({
        categoria: categoria,
        nome: nome,
        codigo: codigo
      });

    });

  }

  return {
    ok: true,
    categorias: Object.keys(categorias).sort(function(a, b){
      return a.localeCompare(b, "pt-BR");
    }),
    itens: itens
  };

}
