// Adaptador de leitura: abas antigas de funcionários são projeções do RH.
// Nenhum consumidor volta a ler gs_linhas para obter pessoas ou PINs.
const RH_PLANILHA = '1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo';
const ALMOX_PLANILHA = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI';
function linhasFuncionarios(planilha, pessoas) {
  if (planilha === ALMOX_PLANILHA) return [['Funcionário'], ...pessoas.filter(f => f.ativo).map(f => [f.nome])];
  return [['Nome', 'Sobrenome', 'CPF', 'Setor', 'Cargo', 'Salário Bruto', 'Data de Admissão', 'Status'],
    ...pessoas.map(f => {
      const partes = f.nome.trim().split(/\s+/);
      return [partes.shift(), partes.join(' '), f.cpf || '', f.setor, f.cargo || '', Number(f.salario_bruto || 0),
        f.data_admissao ? { $d: `${f.data_admissao}T12:00:00Z` } : '', f.ativo ? 'Ativo' : 'Inativo'];
    })];
}
function fonteFuncionarios(planilha, aba) {
  return [RH_PLANILHA, ALMOX_PLANILHA].includes(planilha) && aba.toLowerCase() === 'funcionarios';
}
module.exports = { linhasFuncionarios, fonteFuncionarios };
