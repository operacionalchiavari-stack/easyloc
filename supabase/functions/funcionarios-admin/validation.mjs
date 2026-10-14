export const LEVELS = ['Administrador', 'Recursos Humanos', 'Gestor', 'Financeiro', 'Líder de setor', 'Operador', 'Qualidade', 'Almoxarifado', 'Visualizador'];
export function validateEmployee(input, editing = false) {
  if (!input || typeof input !== 'object') throw new Error('Cadastro inválido');
  const text = (key, max, required = false) => {
    const value = String(input[key] ?? '').trim();
    if (value.length > max || (required && !value)) throw new Error(`Campo inválido: ${key}`);
    return value;
  };
  const nome = text('nome', 160, true), setor = text('setor', 100, true);
  const acesso_sistema = input.acesso_sistema !== false;
  const login = acesso_sistema ? text('login', 160, true).toLowerCase() : '';
  const email = text('email', 160, acesso_sistema).toLowerCase();
  if (acesso_sistema && !/^[a-z0-9._@+-]{3,160}$/.test(login)) throw new Error('Login deve ter ao menos 3 caracteres, sem espaços ou acentos');
  if ((acesso_sistema || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido');
  if (acesso_sistema && login.includes('@') && login !== email) throw new Error('Use seu e-mail ou um login sem @');
  const senha = String(input.senha || '');
  if (acesso_sistema && (!editing || senha) && (senha.length < 8 || senha.length > 256)) throw new Error('Senha deve ter entre 8 e 256 caracteres');
  const pin = String(input.pin || '');
  if ((!editing || pin) && !/^\d{4}$/.test(pin)) throw new Error('Senha operacional deve ter 4 dígitos');
  if (!LEVELS.includes(input.nivel_acesso)) throw new Error('Nível de acesso inválido');
  if (typeof input.ativo !== 'boolean') throw new Error('Status inválido');
  const cpf = text('cpf', 20).replace(/\D/g, '');
  if (cpf && !/^\d{11}$/.test(cpf)) throw new Error('CPF deve ter 11 dígitos');
  const salario_bruto = Number(input.salario_bruto ?? 0);
  if (!Number.isFinite(salario_bruto) || salario_bruto < 0 || salario_bruto > 999999999) throw new Error('Salário inválido');
  const equipe_operacional = text('equipe_operacional', 30);
  if (equipe_operacional && !['triagem','carregamento','montagem','producao'].includes(equipe_operacional)) throw new Error('Equipe operacional inválida');
  const data_admissao = text('data_admissao', 10);
  if (data_admissao && (!/^\d{4}-\d{2}-\d{2}$/.test(data_admissao) || Number.isNaN(Date.parse(data_admissao)))) throw new Error('Data de admissão inválida');
  const dados_rh = {};
  for (const key of ['rg','data_nascimento','whatsapp','endereco','observacoes']) {
    const value = String(input.dados_rh?.[key] ?? '').trim();
    if (value.length > (key==='observacoes'?2000:300)) throw new Error(`Campo inválido: ${key}`);
    dados_rh[key] = value;
  }
  if (dados_rh.data_nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(dados_rh.data_nascimento)) throw new Error('Data de nascimento inválida');
  return { nome, setor, login, email, senha, pin, cargo: text('cargo', 160), telefone: text('telefone', 40), nivel_acesso: input.nivel_acesso, ativo: input.ativo, acesso_sistema, cpf, salario_bruto, data_admissao, equipe_operacional, dados_rh };
}
