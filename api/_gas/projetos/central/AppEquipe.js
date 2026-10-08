/* =========================================================
   APP DA EQUIPE — EXTRATO INDIVIDUAL DE BÔNUS

   Cada funcionário abre o link do web app com ?p=equipe,
   entra com CPF + PIN e vê só o próprio extrato:
   - bônus abastecido em cada mês fechado
     (o "a receber" do fechamento, mesmo valor do painel
     Pagamentos de Bônus);
   - valor transferido (aba "Pagamentos Bonus");
   - premiações: saldo, itens comprados e fotos.

   Foto e PIN de cada pessoa ficam na aba "App Equipe"
   da planilha de fechamentos e são definidos pela Central
   (aba "App da Equipe"). O PIN é guardado só como hash:
   a Central mostra o PIN uma única vez, quando é gerado.
========================================================= */

const APP_EQUIPE_ABA =
  "App Equipe";

const APP_EQUIPE_CABECALHO = [
  "CHAVE",
  "NOME",
  "CPF",
  "PIN (HASH)",
  "FOTO (ID NO DRIVE)",
  "ATUALIZADO EM"
];

const APP_EQUIPE_PROPRIEDADE_PASTA =
  "APP_EQUIPE_PASTA_ID";

const APP_EQUIPE_NOME_PASTA =
  "Central de Metas — Fotos da Equipe";

/* Sessão do funcionário: 6 horas (máximo do cache), renovada a cada uso */
const APP_EQUIPE_SESSAO_SEGUNDOS =
  21600;

/* Depois de 5 PINs errados para o mesmo CPF, bloqueia por 15 minutos */
const APP_EQUIPE_MAX_TENTATIVAS =
  5;

const APP_EQUIPE_BLOQUEIO_SEGUNDOS =
  900;


/* =========================================================
   ENTRADA DO FUNCIONÁRIO (chamada direto pela página)
========================================================= */

function equipeEntrar(cpfInformado, pinInformado){

  const cpf =
    appEquipeCpf_(cpfInformado);

  const pin =
    String(pinInformado || "").replace(/\D/g, "");

  if(cpf.length !== 11){
    throw new Error("Digite o CPF completo (11 números).");
  }

  if(pin.length !== 4){
    throw new Error("O PIN tem 4 números.");
  }

  const cache =
    CacheService.getScriptCache();

  const chaveTentativas =
    "equipeTentativas:" + cpf;

  const tentativas =
    Number(cache.get(chaveTentativas) || 0);

  if(tentativas >= APP_EQUIPE_MAX_TENTATIVAS){
    throw new Error("Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.");
  }

  const cadastro =
    appEquipeLerCadastro_()
      .filter(function(item){
        return item.cpf === cpf && item.pinHash;
      })[0];

  if(
    !cadastro ||
    appEquipeHashPin_(cadastro.chave, pin) !== cadastro.pinHash
  ){

    cache.put(
      chaveTentativas,
      String(tentativas + 1),
      APP_EQUIPE_BLOQUEIO_SEGUNDOS
    );

    /* Pequena espera para dificultar tentativas em sequência */
    Utilities.sleep(800);

    throw new Error(
      cadastro
        ? "PIN incorreto."
        : "CPF ou PIN incorreto. Se ainda não tem PIN, peça ao seu gestor."
    );

  }

  cache.remove(chaveTentativas);

  const token =
    Utilities.getUuid();

  cache.put(
    "acessoEquipe:" + token,
    appEquipeValorSessao_(cadastro),
    APP_EQUIPE_SESSAO_SEGUNDOS
  );

  return {
    ok: true,
    token: token
  };

}


function equipeSair(token){

  if(token){
    CacheService
      .getScriptCache()
      .remove("acessoEquipe:" + String(token));
  }

  return { ok: true };

}


/* =========================================================
   EXTRATO DO FUNCIONÁRIO (chamada direto pela página)
========================================================= */

function equipeExtrato(token){

  const cadastro =
    appEquipeValidarSessao_(token);

  /* As consultas abaixo são da Central; a sessão já foi conferida */
  liberarAcessoInterno_();

  const chave =
    cadastro.chave;

  const painelAtual =
    pagamentosBonusCentralObter("");

  const anos =
    (painelAtual.anosDisponiveis || []).slice().sort();

  const pessoa = {
    nome: cadastro.nome,
    setor: "",
    cargo: "",
    grupo: ""
  };

  const meses = {};
  const idsFechamento = {};

  anos.forEach(function(ano){

    const painel =
      ano === painelAtual.ano
        ? painelAtual
        : pagamentosBonusCentralObter(ano);

    painel.meses.forEach(function(item){
      idsFechamento[item.idFechamento] = item.mes;
    });

    const encontrada =
      painel.pessoas.filter(function(item){
        return item.chave === chave;
      })[0];

    if(!encontrada){
      return;
    }

    pessoa.nome = encontrada.nome || pessoa.nome;
    pessoa.setor = encontrada.setor;
    pessoa.cargo = encontrada.cargo;
    pessoa.grupo = encontrada.grupo;

    Object.keys(encontrada.valores).forEach(function(mes){

      const valor =
        encontrada.valores[mes];

      meses[mes] = {
        mes: mes,
        premiacao: premiacoesEhMesPremiacao_(mes),
        abastecido: Number(valor.devido || 0),
        pago: valor.pago === null || valor.pago === undefined
          ? null
          : Number(valor.pago),
        setorAtingiuMeta: null,
        rhAtingiuMeta: null,
        motivo: "",
        itensPremiacao: null
      };

    });

  });

  appEquipeCompletarMetas_(chave, idsFechamento, meses);

  /* Premiações: saldo acumulado e itens (com fotos) de cada mês */
  let saldoPremiacao = null;

  anos.forEach(function(ano){

    premiacoesObter(ano).meses.forEach(function(mesPremiacao){

      const linha =
        mesPremiacao.pessoas.filter(function(item){
          return item.chave === chave;
        })[0];

      if(!linha){
        return;
      }

      if(!meses[mesPremiacao.mes]){
        meses[mesPremiacao.mes] = {
          mes: mesPremiacao.mes,
          premiacao: true,
          abastecido: 0,
          pago: null,
          setorAtingiuMeta: null,
          rhAtingiuMeta: null,
          motivo: "",
          itensPremiacao: null
        };
      }

      meses[mesPremiacao.mes].itensPremiacao = {
        saldoAnterior: linha.saldoAnterior,
        disponivel: linha.disponivel,
        usado: linha.usado,
        saldo: linha.saldo,
        itens: linha.itens.map(function(item){
          return {
            descricao: item.descricao,
            valor: item.valor,
            dataCompra: item.dataCompra,
            fotoId: item.fotoId,
            fotoEntregaId: item.fotoEntregaId
          };
        })
      };

      saldoPremiacao = linha.saldo;

    });

  });

  const lista =
    Object.keys(meses)
      .sort()
      .map(function(mes){ return meses[mes]; });

  return {
    ok: true,
    pessoa: {
      nome: pessoa.nome,
      setor: pessoa.setor,
      cargo: pessoa.cargo,
      grupo: pessoa.grupo,
      fotoId: cadastro.fotoId
    },
    saldoPremiacao: saldoPremiacao,
    meses: lista,
    atualizadoEm: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "dd/MM/yyyy HH:mm"
    )
  };

}


/* Metas do setor e do RH, e o motivo, gravados no fechamento */
function appEquipeCompletarMetas_(chave, idsFechamento, meses){

  if(chave.indexOf("SUP:") === 0){
    return;
  }

  const aba =
    fechamentoCentralGarantirAbas_().abaFuncionarios;

  if(aba.getLastRow() < 2){
    return;
  }

  aba
    .getRange(2, 1, aba.getLastRow() - 1, 20)
    .getValues()
    .forEach(function(linha){

      const mes =
        idsFechamento[String(linha[0] || "")];

      if(!mes || !meses[mes]){
        return;
      }

      if(pagamentosBonusChaveFuncionario_(linha[4], linha[5]) !== chave){
        return;
      }

      meses[mes].setorAtingiuMeta = fechamentoCentralBooleano_(linha[15]);
      meses[mes].rhAtingiuMeta = fechamentoCentralBooleano_(linha[16]);
      meses[mes].motivo = String(linha[18] || "").trim();

    });

}


/* =========================================================
   GESTÃO PELA CENTRAL (passa por centralChamar)
========================================================= */

function appEquipeListar(){

  exigirAcessoCentral_();

  const painelAtual =
    pagamentosBonusCentralObter("");

  const pessoas = {};

  (painelAtual.anosDisponiveis || []).slice().sort().forEach(function(ano){

    const painel =
      ano === painelAtual.ano
        ? painelAtual
        : pagamentosBonusCentralObter(ano);

    /* Anos em ordem: os dados do ano mais recente prevalecem */
    painel.pessoas.forEach(function(pessoa){
      pessoas[pessoa.chave] = {
        chave: pessoa.chave,
        nome: pessoa.nome,
        setor: pessoa.setor,
        cargo: pessoa.cargo,
        grupo: pessoa.grupo
      };
    });

  });

  const cadastros = {};

  appEquipeLerCadastro_().forEach(function(item){
    cadastros[item.chave] = item;
  });

  const ordemGrupo = { SUPERVISOR: 0, ESTOFADOS: 1, ESTRUTURA: 2 };

  const lista =
    Object.keys(pessoas)
      .map(function(chave){

        const pessoa = pessoas[chave];
        const cadastro = cadastros[chave] || {};

        pessoa.cpf =
          cadastro.cpf || appEquipeCpfDaChave_(chave);

        pessoa.precisaCpf =
          chave.indexOf("CPF:") !== 0;

        pessoa.temPin =
          !!cadastro.pinHash;

        pessoa.fotoId =
          cadastro.fotoId || "";

        return pessoa;

      })
      .sort(function(a, b){

        const ga = ordemGrupo.hasOwnProperty(a.grupo) ? ordemGrupo[a.grupo] : 9;
        const gb = ordemGrupo.hasOwnProperty(b.grupo) ? ordemGrupo[b.grupo] : 9;

        return ga !== gb ? ga - gb : a.nome.localeCompare(b.nome);

      });

  let link = "";

  try{
    link = ScriptApp.getService().getUrl() + "?p=equipe";
  } catch(erro){}

  return {
    ok: true,
    link: link,
    pessoas: lista
  };

}


/*
  Gera um PIN novo de 4 números e devolve para a Central
  mostrar uma única vez. O PIN anterior deixa de valer e
  quem estava conectado com ele precisa entrar de novo.
  cpf só é usado para quem não tem CPF na chave (supervisor).
*/
function appEquipeGerarPin(chave, nome, cpfInformado){

  exigirAcessoCentral_();

  const chaveSegura =
    String(chave || "").trim();

  if(!chaveSegura){
    throw new Error("Pessoa não informada.");
  }

  const cpf =
    appEquipeCpfDaChave_(chaveSegura) ||
    appEquipeCpf_(cpfInformado);

  if(cpf.length !== 11){
    throw new Error("Informe o CPF da pessoa (11 números) para ela conseguir entrar.");
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try{

    const outro =
      appEquipeLerCadastro_().filter(function(item){
        return item.cpf === cpf && item.chave !== chaveSegura;
      })[0];

    if(outro){
      throw new Error("Este CPF já está cadastrado para " + outro.nome + ".");
    }

    const pin =
      String(Math.floor(Math.random() * 10000)).padStart(4, "0");

    appEquipeGravar_(chaveSegura, {
      nome: nome,
      cpf: cpf,
      pinHash: appEquipeHashPin_(chaveSegura, pin)
    });

    return {
      ok: true,
      pin: pin,
      cpf: cpf
    };

  } finally {

    lock.releaseLock();

  }

}


/* foto = { base64, tipo, nome } (já reduzida pela página) */
function appEquipeSalvarFoto(chave, nome, foto){

  exigirAcessoCentral_();

  const chaveSegura =
    String(chave || "").trim();

  if(!chaveSegura){
    throw new Error("Pessoa não informada.");
  }

  if(!foto || !foto.base64){
    throw new Error("Escolha uma foto.");
  }

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

  const nomeArquivo =
    String(nome || chaveSegura)
      .replace(/[\\/:*?"<>|]/g, " ")
      .slice(0, 120) +
    (tipo === "image/png" ? ".png" : ".jpg");

  const arquivo =
    appEquipePasta_().createFile(
      Utilities.newBlob(bytes, tipo, nomeArquivo)
    );

  /* Qualquer pessoa com o link pode ver, para a foto aparecer no app */
  try{
    arquivo.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch(erro){}

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try{

    const anterior =
      appEquipeLerCadastro_().filter(function(item){
        return item.chave === chaveSegura;
      })[0];

    appEquipeGravar_(chaveSegura, {
      nome: nome,
      fotoId: arquivo.getId()
    });

    /* Foto antiga vai para a lixeira */
    if(anterior && anterior.fotoId){
      try{ DriveApp.getFileById(anterior.fotoId).setTrashed(true); } catch(erro){}
    }

  } finally {

    lock.releaseLock();

  }

  return {
    ok: true,
    fotoId: arquivo.getId()
  };

}


/* =========================================================
   APOIO
========================================================= */

function appEquipeValidarSessao_(token){

  const cache =
    CacheService.getScriptCache();

  const chaveCache =
    "acessoEquipe:" + String(token || "");

  const valor =
    token ? cache.get(chaveCache) : null;

  if(!valor){
    throw new Error("SESSAO_EXPIRADA");
  }

  const chave =
    valor.split("|")[0];

  const cadastro =
    appEquipeLerCadastro_().filter(function(item){
      return item.chave === chave;
    })[0];

  /* PIN trocado pela Central: a sessão antiga deixa de valer */
  if(!cadastro || appEquipeValorSessao_(cadastro) !== valor){
    cache.remove(chaveCache);
    throw new Error("SESSAO_EXPIRADA");
  }

  cache.put(chaveCache, valor, APP_EQUIPE_SESSAO_SEGUNDOS);

  return cadastro;

}

function appEquipeValorSessao_(cadastro){

  return cadastro.chave + "|" + cadastro.pinHash.slice(0, 16);

}

function appEquipeHashPin_(chave, pin){

  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      "appEquipe|" + chave + "|" + pin,
      Utilities.Charset.UTF_8
    );

  return bytes
    .map(function(byte){
      return ((byte + 256) % 256).toString(16).padStart(2, "0");
    })
    .join("");

}

/* CPF só com números e com os zeros à esquerda */
function appEquipeCpf_(valor){

  const numeros =
    normalizarCPFComissaoCentral_(valor);

  return numeros && numeros.length <= 11
    ? numeros.padStart(11, "0")
    : numeros;

}

function appEquipeCpfDaChave_(chave){

  return String(chave || "").indexOf("CPF:") === 0
    ? appEquipeCpf_(String(chave).slice(4))
    : "";

}

function appEquipeGarantirAba_(){

  const ss =
    SpreadsheetApp.openById(FECHAMENTO_CENTRAL_PLANILHA_ID);

  let aba =
    ss.getSheetByName(APP_EQUIPE_ABA);

  if(aba){
    return aba;
  }

  aba = ss.insertSheet(APP_EQUIPE_ABA);

  aba
    .getRange(1, 1, 1, APP_EQUIPE_CABECALHO.length)
    .setValues([APP_EQUIPE_CABECALHO]);

  fechamentoCentralFormatarCabecalho_(aba, APP_EQUIPE_CABECALHO.length);

  aba.getRange("A:C").setNumberFormat("@");
  aba.getRange("F:F").setNumberFormat("dd/MM/yyyy HH:mm:ss");

  return aba;

}

function appEquipeLerCadastro_(){

  const aba =
    appEquipeGarantirAba_();

  if(aba.getLastRow() < 2){
    return [];
  }

  return aba
    .getRange(2, 1, aba.getLastRow() - 1, APP_EQUIPE_CABECALHO.length)
    .getValues()
    .map(function(linha, indice){
      return {
        linha: indice + 2,
        chave: String(linha[0] || "").trim(),
        nome: String(linha[1] || "").trim(),
        cpf: appEquipeCpf_(linha[2]),
        pinHash: String(linha[3] || "").trim(),
        fotoId: String(linha[4] || "").trim()
      };
    })
    .filter(function(item){
      return item.chave;
    });

}

/* Cria ou atualiza a linha da pessoa; campos ausentes ficam como estão */
function appEquipeGravar_(chave, campos){

  const aba =
    appEquipeGarantirAba_();

  const atual =
    appEquipeLerCadastro_().filter(function(item){
      return item.chave === chave;
    })[0] || {};

  const linha = [[
    chave,
    String(campos.nome || atual.nome || "").trim(),
    campos.cpf !== undefined ? campos.cpf : (atual.cpf || ""),
    campos.pinHash !== undefined ? campos.pinHash : (atual.pinHash || ""),
    campos.fotoId !== undefined ? campos.fotoId : (atual.fotoId || ""),
    new Date()
  ]];

  const numeroLinha =
    atual.linha || aba.getLastRow() + 1;

  aba
    .getRange(numeroLinha, 1, 1, linha[0].length)
    .setValues(linha);

  SpreadsheetApp.flush();

}

function appEquipePasta_(){

  const propriedades =
    PropertiesService.getScriptProperties();

  const id =
    propriedades.getProperty(APP_EQUIPE_PROPRIEDADE_PASTA);

  if(id){
    try{
      const pasta = DriveApp.getFolderById(id);
      if(!pasta.isTrashed()){
        return pasta;
      }
    } catch(erro){}
  }

  const nova =
    DriveApp.createFolder(APP_EQUIPE_NOME_PASTA);

  propriedades.setProperty(APP_EQUIPE_PROPRIEDADE_PASTA, nova.getId());

  return nova;

}


/* =========================================================
   TESTE MANUAL — RODAR PELO EDITOR

   Mostra no log quem já tem PIN e foto.
========================================================= */

function testarAppEquipe(){

  liberarAcessoInterno_();

  const retorno =
    appEquipeListar();

  Logger.log("Link do app: " + retorno.link);

  retorno.pessoas.forEach(function(pessoa){
    Logger.log(
      pessoa.nome +
      " | PIN: " + (pessoa.temPin ? "sim" : "não") +
      " | foto: " + (pessoa.fotoId ? "sim" : "não")
    );
  });

}
