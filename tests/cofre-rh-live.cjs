// Teste de integração opt-in (RUN_COFRE_LIVE=1) do cofre do RH, contra o banco e a Edge Function rh-protegido reais.
// Cria empresa, dois usuários e um funcionário temporários e apaga tudo no fim. Precisa da chave do cofre em
// ACERVO_COFRE_CHAVE (ou no arquivo de cópia) para conferir que o servidor da Vercel (api/_gas/cofre.js) abre o mesmo dado.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (!process.env.ACERVO_COFRE_CHAVE) {
  try { process.env.ACERVO_COFRE_CHAVE = fs.readFileSync('C:/Users/jonat/acervo-cofre-chave.txt', 'utf8').match(/ACERVO_COFRE_CHAVE=(\S+)/)[1]; } catch (_) {}
}
const cofreVercel = require('../api/_gas/cofre.js');

async function main() {
  if (process.env.RUN_COFRE_LIVE !== '1') throw new Error('Defina RUN_COFRE_LIVE=1 para executar o teste de integração');
  const url = process.env.SUPABASE_URL; assert.equal(new URL(url).host, 'awemuohtvwvrdzfxwrmd.supabase.co');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let empresa, chefe, outro; const pessoa = crypto.randomUUID();
  const novoUsuario = async (nome, role) => {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-cofre-${nome}-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role }));
    const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await cli.auth.signInWithPassword({ email: u.email, password: senha }));
    return { id: u.id, cli };
  };
  const chamar = async (cli, body) => {
    const r = await cli.functions.invoke('rh-protegido', { body: { empresa_id: empresa, funcionario_id: pessoa, ...body } });
    if (r.error) { let e = {}; try { e = await r.error.context.json(); } catch {} return { status: r.error.context?.status, ...e }; }
    return { status: 200, ...r.data };
  };
  try {
    empresa = ok(await admin.from('empresas').insert({ nome: `TESTE COFRE ${sufixo}` }).select('id').single()).id;
    chefe = await novoUsuario('chefe', 'admin');
    outro = await novoUsuario('outro', 'member');
    ok(await admin.from('funcionarios_acesso').insert({ id: pessoa, empresa_id: empresa, nome: 'Pessoa Teste Cofre', setor: 'Montagem', acesso_sistema: false, nivel_acesso: 'Visualizador', ativo: true }));

    // 1. A ficha grava cifrado: CPF, PIS e PIX viram "cofre:v1", banco fica legível; máscara e índice do CPF junto
    let r = await chamar(chefe.cli, { action: 'salvar_ficha', dados: { cpf: '123.456.789-09', pis: '12345678901', pix: 'fulano@gmail.com', banco: 'Itaú' } });
    assert.equal(r.status, 200, JSON.stringify(r));
    const f1 = ok(await admin.from('funcionarios_acesso').select('cpf,cpf_hash,cofre_mascaras').eq('id', pessoa).single());
    const r1 = ok(await admin.from('rh_fichas').select('pis,pix,banco,cofre_mascaras').eq('funcionario_id', pessoa).single());
    assert.match(f1.cpf, /^cofre:v1:/); assert.ok(!f1.cpf.includes('123456789'));
    assert.match(f1.cpf_hash, /^[0-9a-f]{64}$/);
    assert.match(r1.pis, /^cofre:v1:/); assert.match(r1.pix, /^cofre:v1:/); assert.equal(r1.banco, 'Itaú');
    assert.equal(f1.cofre_mascaras.cpf, '•••.•••.•••-09'); assert.equal(r1.cofre_mascaras.pix, 'f•••@gmail.com');
    console.log('ok 1 - o banco só guarda o dado cifrado (CPF, PIS, PIX), com máscara e índice');

    // 2. A tela recebe só a máscara
    const lista = ok(await chefe.cli.rpc('rh_pessoas', { p_empresa: empresa }));
    const p = lista.find((x) => x.id === pessoa);
    assert.equal(p.cpf, '•••.•••.•••-09'); assert.equal(p.ficha.pis, '••••01'); assert.equal(p.ficha.banco, 'Itaú');
    assert.deepEqual([...p.protegidos].sort(), ['cpf', 'pis', 'pix']); assert.equal(p.pode_revelar, true);
    console.log('ok 2 - a Gestão de Pessoas recebe só a máscara');

    // 3. Salvar sem mandar o CPF não mexe nele
    r = await chamar(chefe.cli, { action: 'salvar_ficha', dados: { banco: 'Bradesco' } });
    assert.equal(r.status, 200);
    assert.equal(ok(await admin.from('funcionarios_acesso').select('cpf').eq('id', pessoa).single()).cpf, f1.cpf);
    console.log('ok 3 - campo protegido que não veio fica como estava');

    // 4. "Ver": com permissão abre e registra; sem permissão é recusado
    r = await chamar(chefe.cli, { action: 'revelar', campos: ['cpf', 'pis', 'pix'] });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.valores, { cpf: '12345678909', pis: '12345678901', pix: 'fulano@gmail.com' });
    const ev = ok(await admin.from('seguranca_eventos').select('user_id,tipo,detalhes').eq('empresa_id', empresa).eq('tipo', 'dado_revelado'));
    assert.equal(ev.length, 1); assert.equal(ev[0].user_id, chefe.id); assert.deepEqual(ev[0].detalhes.campos, ['cpf', 'pis', 'pix']);
    r = await chamar(outro.cli, { action: 'revelar', campos: ['cpf'] });
    assert.equal(r.status, 403); assert.match(r.error, /permissão/);
    console.log('ok 4 - "Ver" abre só com permissão, e fica registrado quem viu');

    // 5. Não aceita gravar valor já "cifrado" vindo de fora (ex.: copiado de outra pessoa)
    r = await chamar(chefe.cli, { action: 'salvar_ficha', dados: { cpf: f1.cpf } });
    assert.equal(r.status, 400);
    console.log('ok 5 - valor cifrado vindo de fora é recusado');

    // 6. O servidor da Vercel abre o mesmo dado e acha a pessoa pelo CPF (login do Meu Bônus)
    assert.equal(cofreVercel.decifrar(f1.cpf, `rh:${empresa}:cpf`), '12345678909');
    assert.equal(cofreVercel.indice('12345678909', 'cpf'), f1.cpf_hash);
    ok(await admin.from('funcionarios_acesso').update({ pin_hash: 'x' }).eq('id', pessoa));
    const achada = ok(await admin.rpc('rh_equipe_cadastro', { p_cpf: cofreVercel.indice('12345678909', 'cpf') }));
    assert.equal(achada.id, pessoa);
    assert.equal(ok(await admin.rpc('rh_equipe_cadastro', { p_cpf: '12345678909' })), null, 'pelo número aberto não acha mais');
    const ops = cofreVercel.abrirFuncionarios(ok(await admin.rpc('rh_funcionarios_operacionais', { p_empresa: empresa })), empresa);
    assert.equal(ops.find((x) => x.id === pessoa).cpf, '12345678909');
    console.log('ok 6 - o servidor da Vercel abre o CPF e acha a pessoa pelo índice');
    console.log('OK - cofre do RH');
  } finally {
    if (empresa) {
      await admin.from('seguranca_eventos').delete().eq('empresa_id', empresa);
      await admin.from('rh_fichas').delete().eq('empresa_id', empresa);
      await admin.from('funcionarios_acesso').delete().eq('id', pessoa);
    }
    for (const u of [chefe, outro]) if (u) { await admin.from('usuarios_empresas').delete().eq('user_id', u.id); await admin.from('usuarios').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
    if (empresa) await admin.from('empresas').delete().eq('id', empresa);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
