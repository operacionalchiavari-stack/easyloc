/* =========================================================
   APP DA EQUIPE — EXTRATO INDIVIDUAL DE BÔNUS

   Cada funcionário abre o link do web app com ?p=equipe,
   entra com CPF + PIN e vê só o próprio extrato:
   - bônus abastecido em cada mês fechado
     (o "a receber" do fechamento, mesmo valor do painel
     Pagamentos de Bônus);
   - valor transferido (aba "Pagamentos Bonus");
   - premiações: saldo, itens comprados e fotos.

   Foto, CPF e PIN vêm exclusivamente do Cadastro de Funcionários do RH.
========================================================= */

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

  const rh=Acervo.equipeCadastro(cpf);const cadastro=rh?{id:rh.id,empresaId:rh.empresa_id,chave:'CPF:'+rh.cpf,nome:rh.nome,cpf:rh.cpf,pinHash:String(rh.pin_version),fotoId:'',fotoUrl:rh.fotoUrl}:null;

  if(
    !cadastro ||
    !Acervo.equipePinConferir(cadastro.empresaId,cadastro.id,pin)
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
      fotoId: cadastro.fotoId, fotoUrl: cadastro.fotoUrl
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
 const pessoas=Acervo.funcionarios().filter(function(f){return f.ativo;}).map(function(f){
  const setor=operacaoTexto_(f.setor);
  const grupo=f.equipe_operacional?'OPERACOES':/costura|forracao|estofados/.test(setor)?'ESTOFADOS':'ESTRUTURA';
  return {id:f.id,chave:f.cpf?'CPF:'+f.cpf:'RH:'+f.id,nome:f.nome,setor:f.setor,cargo:f.cargo,grupo:grupo,cpf:f.cpf||'',precisaCpf:!f.cpf,temPin:f.tem_pin,fotoId:'',fotoUrl:f.fotoUrl};
 });
 return {ok:true,link:ScriptApp.getService().getUrl()+'?p=equipe',pessoas:pessoas};
}

function appEquipeGerarPin(){throw new Error('O PIN individual é cadastrado e redefinido exclusivamente no RH.');}

function appEquipeSalvarFoto(){throw new Error('A foto é alterada exclusivamente no Cadastro de Funcionários do RH.');}

function appEquipeValidarSessao_(token){const cache=CacheService.getScriptCache();const k='acessoEquipe:'+String(token||'');const valor=token?cache.get(k):null;if(!valor)throw new Error('SESSAO_EXPIRADA');const atual=Acervo.equipeCadastro(valor.split('|')[0]);const cadastro=atual?{id:atual.id,empresaId:atual.empresa_id,chave:'CPF:'+atual.cpf,nome:atual.nome,cpf:atual.cpf,pinHash:String(atual.pin_version),fotoId:'',fotoUrl:atual.fotoUrl}:null;if(!cadastro || appEquipeValorSessao_(cadastro)!==valor){cache.remove(k);throw new Error('SESSAO_EXPIRADA');}cache.put(k,valor,APP_EQUIPE_SESSAO_SEGUNDOS);return cadastro;}

function appEquipeValorSessao_(cadastro){return cadastro.cpf+'|'+cadastro.pinHash;}

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
