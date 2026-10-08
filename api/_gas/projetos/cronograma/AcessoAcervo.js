/****************************************************
 * ACESSO PELO LOGIN DO ACERVO (out/2026)
 *
 * A tela do Cronograma (cronograma.html) deixou de pedir a senha
 * de cada setor: quem decide o que a pessoa pode fazer é o login
 * do Acervo + as permissões marcadas para ela (tela Permissões).
 * Acervo.usuario()/Acervo.pode() vêm do motor (api/_gas/motor.js);
 * o administrador da empresa pode tudo.
 *
 * O resto do sistema continua igual: a sessão gerada aqui é a
 * mesma "chave de auditoria" de antes (AUD_criarTokenSessao_), com
 * o NOME de quem está logado e o perfil (montagem, internas,
 * expedicao, frete) — então os registros de auditoria, as trocas,
 * a Equipe Free e o carregamento conferem exatamente como antes.
 *
 * validarSenhaPerfil / validarSenhaResponsavel NÃO mudaram: o App
 * do Montador e o Painel RH Free (apps de campo, sem conta no
 * Acervo) ainda entram com elas.
 ****************************************************/

const CRON_PERFIS_ACERVO = [
  { perfil: "montagem",  chave: "logistica.cronograma.montagem" },
  { perfil: "internas",  chave: "logistica.cronograma.internas" },
  { perfil: "expedicao", chave: "logistica.cronograma.expedicao" },
  { perfil: "frete",     chave: "logistica.cronograma.motorista" }
];

function CRON_normalizar_(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Perfis que o usuário logado tem (admin: todos) */
function CRON_perfisDoUsuario_() {
  return CRON_PERFIS_ACERVO
    .filter(function (p) { return Acervo.pode(p.chave); })
    .map(function (p) { return p.perfil; });
}

/* Qual perfil usar em cada ação da tela (o 1º que a pessoa tiver).
   Expedição só conclui carregamento com o perfil da Expedição;
   trocas aceitam Montagem ou Operações Internas; o resto prefere
   Montagem (quem pode mais) — admin cai sempre no perfil certo. */
function CRON_preferencia_(contexto) {
  const c = CRON_normalizar_(contexto);
  if (c.indexOf("expedi") >= 0) { return ["expedicao"]; }
  if (c.indexOf("troca") >= 0) { return ["montagem", "internas"]; }
  return ["montagem", "internas", "expedicao", "frete"];
}

/* Substitui "digite a senha" na tela do Cronograma.
   Devolve o mesmo formato de validarSenhaPerfil: { valido, perfil, usuario, token }
   ou null quando o usuário não tem permissão para aquela ação. */
function CRON_entrarComLogin(contexto) {
  const usuario = Acervo.usuario();
  if (!usuario) { return null; }
  const tem = CRON_perfisDoUsuario_();
  const perfil = CRON_preferencia_(contexto).find(function (p) { return tem.indexOf(p) >= 0; });
  if (!perfil) { return null; }
  return {
    valido: true,
    perfil: perfil,
    usuario: usuario.nome,
    token: AUD_criarTokenSessao_(usuario.nome, perfil),
    duracaoSegundos: AUD_DURACAO_TOKEN_SEGUNDOS
  };
}

/* O responsável de uma etapa é uma pessoa: pode executar quem é
   Supervisor de Montagem (ou admin) ou a própria pessoa, quando o nome
   dela no Acervo é o mesmo do responsável. */
function CRON_mesmoNome_(a, b) {
  const x = CRON_normalizar_(a).replace(/\(.*?\)/g, "").trim();
  const y = CRON_normalizar_(b).replace(/\(.*?\)/g, "").trim();
  return !!x && x === y;
}

function CRON_acessoEtapa_(responsavel) {
  if (Acervo.pode("logistica.cronograma.montagem")) {
    return { valido: true, tipo: "SUPERVISOR" };
  }
  const usuario = Acervo.usuario();
  if (usuario && CRON_mesmoNome_(usuario.nome, responsavel)) {
    return { valido: true, tipo: "RESPONSAVEL" };
  }
  return { valido: false, tipo: "" };
}

/* Agenda: criar/editar itens precisa da permissão da Agenda */
function CRON_exigirAgenda_() {
  if (!Acervo.pode("logistica.cronograma.agenda")) {
    throw new Error("Seu usuário não tem permissão para mexer na agenda.");
  }
}
