/**
 * =====================================================
 * VALIDAÇÕES COMPARTILHADAS
 * =====================================================
 * Funções de validação reutilizáveis para todo o sistema
 */

// Remove tudo que não é número
export function soNumeros(v) {
  return (v || "").replace(/\D/g, "");
}

/**
 * Valida CPF com algoritmo oficial
 * @param {string} cpf - CPF para validar
 * @returns {boolean} - true se é válido
 */
export function validarCPF(cpf) {
  cpf = soNumeros(cpf);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  let resto;

  // Primeiro dígito verificador
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }

  resto = (soma * 10) % 11;
  if (resto >= 10) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;

  // Segundo dígito verificador
  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }

  resto = (soma * 10) % 11;
  if (resto >= 10) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;

  return true;
}

/**
 * Valida email com regex básico
 * @param {string} email - Email para validar
 * @returns {boolean} - true se é válido
 */
export function validarEmail(email) {
  if (!email) return false;
  email = email.trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Valida telefone brasileiro
 * @param {string} tel - Telefone para validar
 * @returns {boolean} - true se é válido
 */
export function validarTelefoneBR(tel) {
  tel = soNumeros(tel);

  if (tel.length < 10 || tel.length > 11) return false;
  if (tel[0] === "0") return false;
  if (tel.length === 11 && tel[2] !== "9") return false;

  return true;
}

/**
 * Normaliza data "última locação" (dias atrás ou YYYY-MM-DD)
 * @param {string} valor - Valor a normalizar
 * @returns {string|null} - Data em formato YYYY-MM-DD ou null
 */
export function normalizarDataUltimaLocacao(valor) {
  if (!valor) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor;
  }

  const match = valor.match(/\d+/);
  if (match) {
    const dias = parseInt(match[0], 10);
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10);
  }

  return null;
}
