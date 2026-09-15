export const LEVELS = ['Administrador', 'Gestor', 'Financeiro', 'Líder de setor', 'Operador', 'Qualidade', 'Almoxarifado', 'Visualizador'];
export function validateEmployee(input, editing = false) {
  if (!input || typeof input !== 'object') throw new Error('Cadastro inválido');
  const text = (key, max, required = false) => {
    const value = String(input[key] ?? '').trim();
    if (value.length > max || (required && !value)) throw new Error(`Campo inválido: ${key}`);
    return value;
  };
  const nome = text('nome', 160, true), setor = text('setor', 100, true);
  const login = text('login', 160, true).toLowerCase();
  const email = text('email', 160, true).toLowerCase();
  if (!/^[a-z0-9._@+-]{3,160}$/.test(login)) throw new Error('Login deve ter ao menos 3 caracteres, sem espaços ou acentos');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido');
  if (login.includes('@') && login !== email) throw new Error('Use seu e-mail ou um login sem @');
  const senha = String(input.senha || '');
  if ((!editing || senha) && (senha.length < 8 || senha.length > 256)) throw new Error('Senha deve ter entre 8 e 256 caracteres');
  const pin = String(input.pin || '');
  if ((!editing || pin) && !/^\d{4}$/.test(pin)) throw new Error('Senha operacional deve ter 4 dígitos');
  if (!LEVELS.includes(input.nivel_acesso)) throw new Error('Nível de acesso inválido');
  if (typeof input.ativo !== 'boolean') throw new Error('Status inválido');
  return { nome, setor, login, email, senha, pin, cargo: text('cargo', 160), telefone: text('telefone', 40), nivel_acesso: input.nivel_acesso, ativo: input.ativo };
}
