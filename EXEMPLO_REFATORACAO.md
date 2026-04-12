/**
 * EXEMPLO DE MÓDULO REFATORADO
 * ===========================
 * Este é um exemplo de como refatorar os módulos para usar
 * as validações compartilhadas de utils/validacoes.js
 */

// ✅ Importar funções compartilhadas (em vez de duplicar)
import {
  validarCPF,
  validarEmail,
  validarTelefoneBR,
  soNumeros,
  normalizarDataUltimaLocacao
} from '../../utils/validacoes.js';

// Se estiver usando em HTML via <script>, use:
// ou crie um bundle que expõe essas funções globalmente

/**
 * ANTES (❌ PROBLEMÁTICO):
 * - Função duplicada em múltiplos arquivos
 * - Difícil de manter (correção em um lugar não reflete em outro)
 * - Código poluído
 * 
 * function validarCPF(cpf) {
 *   cpf = soNumeros(cpf);
 *   if (cpf.length !== 11) return false;
 *   ... (muitas linhas duplicadas)
 * }
 */

/**
 * DEPOIS (✅ CORRETO):
 * - Função importada de um lugar único
 * - Fácil de manter
 * - Código limpo e DRY (Don't Repeat Yourself)
 */

class ValidadorCliente {
  constructor() {
    this.erros = [];
  }

  validar(dados) {
    this.erros = [];

    // Usar as funções compartilhadas
    if (!validarCPF(dados.cpf)) {
      this.erros.push('CPF inválido');
    }

    if (!validarEmail(dados.email)) {
      this.erros.push('Email inválido');
    }

    if (!validarTelefoneBR(dados.telefone)) {
      this.erros.push('Telefone inválido');
    }

    return this.erros.length === 0;
  }

  getErros() {
    return this.erros;
  }
}

export default ValidadorCliente;

/**
 * COMO USAR EM UM MÓDULO:
 * 
 * (function() {
 *   const validador = new ValidadorCliente();
 *   
 *   document.getElementById('btnSalvar').addEventListener('click', () => {
 *     const dados = {
 *       cpf: document.getElementById('cpfInput').value,
 *       email: document.getElementById('emailInput').value,
 *       telefone: document.getElementById('telefoneInput').value
 *     };
 *     
 *     if (validador.validar(dados)) {
 *       console.log('✅ Dados válidos!');
 *       // Salvar no banco
 *     } else {
 *       console.error('❌ Erros:', validador.getErros());
 *     }
 *   });
 * })();
 */
