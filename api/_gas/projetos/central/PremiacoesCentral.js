/* =========================================================
   PREMIAÇÕES — CENTRAL DE METAS

   Os meses alternam de dois em dois: jan–fev premiação,
   mar–abr saldo livre, mai–jun premiação, jul–ago saldo
   livre, set–out premiação, nov–dez saldo livre.

   Em cada mês de premiação FECHADO, cada pessoa tem como
   valor disponível o "a receber" do fechamento (o mesmo do
   painel de Pagamentos de Bônus) mais o saldo que sobrou
   da premiação anterior. Os itens comprados (descrição,
   valor e foto) ficam na aba "Premiacoes" da planilha de
   fechamentos; as fotos ficam numa pasta do Google Drive.

   Saldo = disponível − usado. O saldo (positivo ou
   negativo) passa para a próxima premiação da pessoa.

   Cadastrar/editar/remover itens exige a senha própria.
========================================================= */

const PREMIACOES_ABA =
  "Premiacoes";

const PREMIACOES_SENHA =
  "8030";

const PREMIACOES_PROPRIEDADE_PASTA =
  "PREMIACOES_PASTA_ID";

const PREMIACOES_NOME_PASTA =
  "Central de Metas — Fotos das Premiações";

/* Colunas da aba Premiacoes */
const PREMIACOES_CABECALHO = [
  "ID",
  "MÊS",
  "CHAVE",
  "NOME",
  "DESCRIÇÃO",
  "VALOR",
  "FOTO (ID NO DRIVE)",
  "LINK",
  "CRIADO EM",
  "ATUALIZADO EM",
  "DATA DA COMPRA",
  "FOTO DA ENTREGA (ID NO DRIVE)"
];


/* =========================================================
   TIPO DO MÊS
========================================================= */

function premiacoesEhMesPremiacao_(mes){

  const numero =
    Number(String(mes || "").split("-")[1]);

  return (
    numero >= 1 &&
    numero <= 12 &&
    Math.floor((numero - 1) / 2) % 2 === 0
  );

}


/* =========================================================
   CONSULTAR AS PREMIAÇÕES DE UM ANO
========================================================= */

function premiacoesObter(anoFiltro){

  exigirAcessoCentral_();

  const painelAno =
    pagamentosBonusCentralObter(anoFiltro);

  const ano =
    painelAno.ano;

  /*
    O saldo acumula desde a primeira premiação fechada,
    então os anos anteriores também entram na conta.
  */
  const anosAnteriores =
    (painelAno.anosDisponiveis || [])
      .filter(function(item){ return item < ano; })
      .sort();

  const paineis =
    anosAnteriores
      .map(function(item){ return pagamentosBonusCentralObter(item); })
      .concat([painelAno]);

  /* Pessoas e bônus por mês fechado */
  const pessoas = {};
  const mesesFechados = {};

  paineis.forEach(function(painel){

    painel.meses.forEach(function(item){
      mesesFechados[item.mes] = true;
    });

    painel.pessoas.forEach(function(pessoa){

      pessoas[pessoa.chave] =
        pessoas[pessoa.chave] || {
          chave: pessoa.chave,
          nome: pessoa.nome,
          setor: pessoa.setor,
          cargo: pessoa.cargo,
          grupo: pessoa.grupo,
          bonus: {}
        };

      Object.keys(pessoa.valores).forEach(function(mes){
        pessoas[pessoa.chave].bonus[mes] =
          Number(pessoa.valores[mes].devido || 0);
      });

    });

  });

  /* Itens cadastrados */
  const itensPorMesChave = {};

  premiacoesLerItens_().forEach(function(item){

    const chave =
      item.mes + "|" + item.chave;

    itensPorMesChave[chave] =
      itensPorMesChave[chave] || [];

    itensPorMesChave[chave].push(item);

    /* Pessoa com item mas fora do painel (não deveria acontecer) */
    if(!pessoas[item.chave]){
      pessoas[item.chave] = {
        chave: item.chave,
        nome: item.nome,
        setor: "",
        cargo: "",
        grupo: "OUTROS",
        bonus: {}
      };
    }

  });

  /* Premiações fechadas em ordem, acumulando o saldo */
  const premiacoesFechadas =
    Object.keys(mesesFechados)
      .filter(premiacoesEhMesPremiacao_)
      .sort();

  const saldo = {};
  const resultadoPorMes = {};

  premiacoesFechadas.forEach(function(mes){

    const linhas = [];

    Object.keys(pessoas).forEach(function(chave){

      const pessoa = pessoas[chave];
      const bonusCentavos = Math.round((pessoa.bonus[mes] || 0) * 100);
      const anteriorCentavos = saldo[chave] || 0;
      const itens = itensPorMesChave[mes + "|" + chave] || [];

      const usadoCentavos =
        itens.reduce(function(total, item){
          return total + Math.round(item.valor * 100);
        }, 0);

      const participa =
        pessoa.bonus.hasOwnProperty(mes) ||
        anteriorCentavos !== 0 ||
        itens.length > 0;

      if(!participa){
        return;
      }

      const disponivelCentavos =
        bonusCentavos + anteriorCentavos;

      const saldoCentavos =
        disponivelCentavos - usadoCentavos;

      saldo[chave] = saldoCentavos;

      linhas.push({
        chave: chave,
        nome: pessoa.nome,
        setor: pessoa.setor,
        cargo: pessoa.cargo,
        grupo: pessoa.grupo,
        bonus: bonusCentavos / 100,
        saldoAnterior: anteriorCentavos / 100,
        disponivel: disponivelCentavos / 100,
        usado: usadoCentavos / 100,
        saldo: saldoCentavos / 100,
        itens: itens
      });

    });

    const ordemGrupo = { SUPERVISOR: 0, ESTOFADOS: 1, ESTRUTURA: 2 };

    linhas.sort(function(a, b){

      const ga = ordemGrupo.hasOwnProperty(a.grupo) ? ordemGrupo[a.grupo] : 9;
      const gb = ordemGrupo.hasOwnProperty(b.grupo) ? ordemGrupo[b.grupo] : 9;

      return ga !== gb ? ga - gb : a.nome.localeCompare(b.nome);

    });

    resultadoPorMes[mes] = linhas;

  });

  /* Todos os meses de premiação do ano, fechados ou não */
  const meses = [];

  for(let numero = 1; numero <= 12; numero++){

    const mes =
      ano + "-" + String(numero).padStart(2, "0");

    if(!premiacoesEhMesPremiacao_(mes)){
      continue;
    }

    meses.push({
      mes: mes,
      fechado: !!mesesFechados[mes],
      pessoas: resultadoPorMes[mes] || []
    });

  }

  return {
    ok: true,
    ano: ano,
    anosDisponiveis: painelAno.anosDisponiveis,
    meses: meses
  };

}


/* =========================================================
   SENHA DE EDIÇÃO
========================================================= */

function premiacoesValidarSenha(senhaInformada){

  exigirAcessoCentral_();

  premiacoesConferirSenha_(senhaInformada);

  return { ok: true };

}

function premiacoesConferirSenha_(senhaInformada){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return;


  const senha =
    String(senhaInformada || "").trim();

  if(!senha){
    throw new Error("Informe a senha das premiações.");
  }

  if(senha !== PREMIACOES_SENHA){
    throw new Error("Senha incorreta.");
  }

}


/* =========================================================
   SALVAR ITEM (novo ou edição)

   item = {
     id,            // vazio para item novo
     mes, chave, nome,
     descricao, valor,
     dataCompra,    // "aaaa-mm-dd" (obrigatória)
     link,          // opcional
     foto:        { base64, tipo, nome }   // foto do item
     fotoEntrega: { base64, tipo, nome }   // foto da pessoa recebendo
   }

   As fotos são opcionais. Na edição, uma foto nova
   substitui a atual; sem foto nova, a atual é mantida.
========================================================= */

function premiacoesSalvarItem(item, senhaInformada){

  exigirAcessoCentral_();

  premiacoesConferirSenha_(senhaInformada);

  const dados =
    item || {};

  const mes =
    String(dados.mes || "").trim();

  if(!/^\d{4}-\d{2}$/.test(mes) || !premiacoesEhMesPremiacao_(mes)){
    throw new Error("Escolha um mês de premiação.");
  }

  if(!fechamentoCentralLocalizarMes_(fechamentoCentralGarantirAbas_().abaMeses, mes)){
    throw new Error("Este mês ainda não foi fechado.");
  }

  const chave =
    String(dados.chave || "").trim();

  if(!chave){
    throw new Error("Pessoa não informada.");
  }

  const descricao =
    String(dados.descricao || "").trim();

  if(!descricao){
    throw new Error("Descreva o que foi comprado.");
  }

  const valor =
    Number(dados.valor);

  if(!isFinite(valor) || valor < 0){
    throw new Error("Valor inválido.");
  }

  const link =
    String(dados.link || "").trim();

  const dataCompraTexto =
    String(dados.dataCompra || "").trim();

  if(!/^\d{4}-\d{2}-\d{2}$/.test(dataCompraTexto)){
    throw new Error("Informe a data da compra.");
  }

  const partesData =
    dataCompraTexto.split("-").map(Number);

  const dataCompra =
    new Date(partesData[0], partesData[1] - 1, partesData[2]);

  if(isNaN(dataCompra.getTime())){
    throw new Error("Data da compra inválida.");
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try{

    const aba =
      premiacoesGarantirAba_();

    const agora =
      new Date();

    let numeroLinha = -1;
    let fotoAtual = "";
    let fotoEntregaAtual = "";
    let criadoEm = agora;

    if(dados.id){

      const ids =
        aba.getLastRow() >= 2
          ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues()
          : [];

      for(let i = 0; i < ids.length; i++){
        if(String(ids[i][0]) === String(dados.id)){
          numeroLinha = i + 2;
          break;
        }
      }

      if(numeroLinha < 0){
        throw new Error("Item não encontrado. Recarregue a página.");
      }

      const atual =
        aba.getRange(numeroLinha, 1, 1, PREMIACOES_CABECALHO.length).getValues()[0];

      fotoAtual = String(atual[6] || "");
      fotoEntregaAtual = String(atual[11] || "");
      criadoEm = atual[8] || agora;

    }

    const novaFotoItem =
      !!(dados.foto && dados.foto.base64);

    const novaFotoEntrega =
      !!(dados.fotoEntrega && dados.fotoEntrega.base64);

    let fotoId = fotoAtual;
    let fotoEntregaId = fotoEntregaAtual;

    if(novaFotoItem){
      fotoId = premiacoesSalvarFoto_(dados.foto, mes, dados.nome, "item - " + descricao);
    }

    if(novaFotoEntrega){
      fotoEntregaId = premiacoesSalvarFoto_(dados.fotoEntrega, mes, dados.nome, "entrega - " + descricao);
    }

    /* Fotos antigas substituídas vão para a lixeira */
    [[fotoAtual, fotoId], [fotoEntregaAtual, fotoEntregaId]].forEach(function(par){
      if(par[0] && par[0] !== par[1]){
        try{ DriveApp.getFileById(par[0]).setTrashed(true); } catch(erro){}
      }
    });

    const id =
      dados.id || ("PR-" + Utilities.getUuid().slice(0, 8).toUpperCase());

    const linha = [[
      id,
      mes,
      chave,
      String(dados.nome || "").trim(),
      descricao,
      Number(valor.toFixed(2)),
      fotoId,
      link,
      criadoEm,
      agora,
      dataCompra,
      fotoEntregaId
    ]];

    if(numeroLinha > 0){
      aba.getRange(numeroLinha, 1, 1, linha[0].length).setValues(linha);
    } else {
      aba.getRange(aba.getLastRow() + 1, 1, 1, linha[0].length).setValues(linha);
    }

    SpreadsheetApp.flush();

    return { ok: true, id: id };

  } finally {

    lock.releaseLock();

  }

}


/* =========================================================
   EXCLUIR ITEM
========================================================= */

function premiacoesExcluirItem(id, senhaInformada){

  exigirAcessoCentral_();

  premiacoesConferirSenha_(senhaInformada);

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try{

    const aba =
      premiacoesGarantirAba_();

    if(aba.getLastRow() < 2){
      throw new Error("Item não encontrado.");
    }

    const dados =
      aba.getRange(2, 1, aba.getLastRow() - 1, PREMIACOES_CABECALHO.length).getValues();

    for(let i = 0; i < dados.length; i++){

      if(String(dados[i][0]) === String(id)){

        [String(dados[i][6] || ""), String(dados[i][11] || "")].forEach(function(fotoId){
          if(fotoId){
            try{ DriveApp.getFileById(fotoId).setTrashed(true); } catch(erro){}
          }
        });

        aba.deleteRow(i + 2);
        SpreadsheetApp.flush();

        return { ok: true };

      }

    }

    throw new Error("Item não encontrado. Recarregue a página.");

  } finally {

    lock.releaseLock();

  }

}


/* =========================================================
   APOIO
========================================================= */

function premiacoesGarantirAba_(){

  const ss =
    SpreadsheetApp.openById(FECHAMENTO_CENTRAL_PLANILHA_ID);

  let aba =
    ss.getSheetByName(PREMIACOES_ABA);

  if(!aba){

    aba = ss.insertSheet(PREMIACOES_ABA);

    aba
      .getRange(1, 1, 1, PREMIACOES_CABECALHO.length)
      .setValues([PREMIACOES_CABECALHO]);

    fechamentoCentralFormatarCabecalho_(aba, PREMIACOES_CABECALHO.length);

    aba.getRange("B:B").setNumberFormat("@");
    aba.getRange("F:F").setNumberFormat('R$ #,##0.00');
    aba.getRange("I:J").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    aba.getRange("K:K").setNumberFormat("dd/MM/yyyy");

  }

  /* Aba criada antes das colunas novas: completa o cabeçalho */
  if(aba.getLastColumn() < PREMIACOES_CABECALHO.length){

    aba
      .getRange(1, 1, 1, PREMIACOES_CABECALHO.length)
      .setValues([PREMIACOES_CABECALHO]);

    fechamentoCentralFormatarCabecalho_(aba, PREMIACOES_CABECALHO.length);

    aba.getRange("K:K").setNumberFormat("dd/MM/yyyy");

  }

  return aba;

}

function premiacoesLerItens_(){

  const aba =
    premiacoesGarantirAba_();

  if(aba.getLastRow() < 2){
    return [];
  }

  return aba
    .getRange(2, 1, aba.getLastRow() - 1, PREMIACOES_CABECALHO.length)
    .getValues()
    .filter(function(linha){
      return linha[0] && linha[1] && linha[2];
    })
    .map(function(linha){

      return {
        id: String(linha[0]),
        mes: pagamentosBonusMesTexto_(linha[1]),
        chave: String(linha[2]).trim(),
        nome: String(linha[3] || "").trim(),
        descricao: String(linha[4] || ""),
        valor: fechamentoCentralNumero_(linha[5]),
        fotoId: String(linha[6] || ""),
        link: String(linha[7] || ""),
        dataCompra:
          linha[10] instanceof Date && !isNaN(linha[10].getTime())
            ? Utilities.formatDate(linha[10], Session.getScriptTimeZone(), "yyyy-MM-dd")
            : "",
        fotoEntregaId: String(linha[11] || "")
      };

    });

}

function premiacoesPasta_(){

  const propriedades =
    PropertiesService.getScriptProperties();

  const id =
    propriedades.getProperty(PREMIACOES_PROPRIEDADE_PASTA);

  if(id){
    try{
      const pasta = DriveApp.getFolderById(id);
      if(!pasta.isTrashed()){
        return pasta;
      }
    } catch(erro){}
  }

  const nova =
    DriveApp.createFolder(PREMIACOES_NOME_PASTA);

  propriedades.setProperty(PREMIACOES_PROPRIEDADE_PASTA, nova.getId());

  return nova;

}

function premiacoesSalvarFoto_(foto, mes, nome, descricao){

  const tipo =
    String(foto.tipo || "image/jpeg");

  if(tipo.indexOf("image/") !== 0){
    throw new Error("O arquivo precisa ser uma imagem.");
  }

  const bytes =
    Utilities.base64Decode(String(foto.base64));

  if(bytes.length > 10 * 1024 * 1024){
    throw new Error("A foto passou de 10 MB. Envie uma imagem menor.");
  }

  const extensao =
    tipo === "image/png" ? ".png" : ".jpg";

  const nomeArquivo =
    (mes + " - " + (nome || "") + " - " + (descricao || ""))
      .replace(/[\\/:*?"<>|]/g, " ")
      .slice(0, 120) + extensao;

  const arquivo =
    premiacoesPasta_().createFile(
      Utilities.newBlob(bytes, tipo, nomeArquivo)
    );

  /* Qualquer pessoa com o link pode ver, para a miniatura aparecer na página */
  try{
    arquivo.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch(erro){}

  return arquivo.getId();

}

/*
  Rode UMA VEZ pelo editor para autorizar o acesso ao
  Google Drive (necessário para salvar as fotos).
*/
function premiacoesAutorizarDrive(){

  const pasta =
    premiacoesPasta_();

  premiacoesGarantirAba_();

  Logger.log("Drive autorizado. Pasta das fotos: " + pasta.getUrl());

}
