import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmployee } from '../supabase/functions/funcionarios-admin/validation.mjs';
const employee = { nome: 'Ana Silva', setor: 'Comercial', login: 'ana.silva', email: 'ana@example.com', senha: 'LongPassword!', pin: '0123', nivel_acesso: 'Visualizador', ativo: true };
test('valida cadastro e mantém zeros do PIN', () => {
  const result = validateEmployee(employee);
  assert.equal(result.pin, '0123'); assert.equal(result.login, 'ana.silva');
});
test('credenciais obrigatórias na criação e opcionais na edição', () => {
  assert.throws(() => validateEmployee({ ...employee, senha: '' }));
  assert.throws(() => validateEmployee({ ...employee, pin: '' }));
  assert.doesNotThrow(() => validateEmployee({ ...employee, senha: '', pin: '' }, true));
});
test('rejeita permissões implícitas, status inválido e identidades conflitantes', () => {
  for (const change of [{ nivel_acesso: 'SuperAdmin' }, { ativo: 'true' }, { login: 'outra@example.com' }, { pin: '12ab' }, { nome: '' }, { senha: '123' }, { email: 'invalid' }]) {
    assert.throws(() => validateEmployee({ ...employee, ...change }));
  }
});
test('RH pode cadastrar uma pessoa com PIN sem credenciais de login',()=>{
 const r=validateEmployee({...employee,acesso_sistema:false,login:'',email:'',senha:'',nivel_acesso:'Recursos Humanos',equipe_operacional:'triagem',salario_bruto:2500});
 assert.equal(r.acesso_sistema,false);assert.equal(r.pin,'0123');assert.equal(r.salario_bruto,2500);
});
