// Teste de integração opt-in (RUN_COFRE_LIVE=1) do cofre das contas do Financeiro, contra o banco e a Edge Function
// financeiro-protegido reais. Cria empresa e dois usuários temporários e apaga tudo no fim.
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

async function main() {
  if (process.env.RUN_COFRE_LIVE !== '1') throw new Error('Defina RUN_COFRE_LIVE=1 para executar o teste de integração');
  const url = process.env.SUPABASE_URL; assert.equal(new URL(url).host, 'awemuohtvwvrdzfxwrmd.supabase.co');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let empresa, chefe, outro;
  const novoUsuario = async (nome, role) => {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-cofrefin-${nome}-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role }));
    const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await cli.auth.signInWithPassword({ email: u.email, password: senha }));
    return { id: u.id, cli };
  };
  const chamar = async (cli, body) => {
    const r = await cli.functions.invoke('financeiro-protegido', { body: { empresa_id: empresa, ...body } });
    if (r.error) { let e = {}; try { e = await r.error.context.json(); } catch {} return { status: r.error.context?.status, ...e }; }
    return { status: 200, ...r.data };
  };
  try {
    empresa = ok(await admin.from('empresas').insert({ nome: `TESTE COFRE FIN ${sufixo}` }).select('id').single()).id;
    chefe = await novoUsuario('chefe', 'admin');
    outro = await novoUsuario('outro', 'member');

    // 1. Nova conta: agência, conta, CNPJ e PIX gravados cifrados, com máscara; nome e banco legíveis
    let r = await chamar(chefe.cli, { action: 'salvar_conta', conta: { nome: 'Locação Itaú', tipo: 'corrente', banco: 'Itaú', agencia: '1234', conta: '56789-0', titular_documento: '12.345.678/0001-90', pix_tipo: 'email', pix_chave: 'financeiro@chiavari.com', saldo_inicial: 100, ativo: true } });
    assert.equal(r.status, 200, JSON.stringify(r));
    const id = r.id;
    const c1 = ok(await admin.from('fin_contas').select('*').eq('id', id).single());
    for (const k of ['agencia', 'conta', 'titular_documento', 'pix_chave']) assert.match(c1[k], /^cofre:v1:/, k);
    assert.ok(!['1234', '56789', '12.345.678', 'financeiro@'].some((t) => [c1.agencia, c1.conta, c1.titular_documento, c1.pix_chave].join('|').includes(t)), 'nenhum valor aberto nos campos');
    assert.equal(c1.nome, 'Locação Itaú'); assert.equal(c1.banco, 'Itaú'); assert.equal(c1.empresa_id, empresa);
    assert.equal(c1.cofre_mascaras.pix_chave, 'f•••@chiavari.com'); assert.equal(c1.cofre_mascaras.titular_documento, '••••90');
    console.log('ok 1 - a conta grava agência, conta, CNPJ e PIX cifrados, com máscara');

    // 2. Editar sem mandar os campos protegidos mantém o que estava
    r = await chamar(chefe.cli, { action: 'salvar_conta', conta_id: id, conta: { nome: 'Locação Itaú (principal)', banco: 'Itaú' } });
    assert.equal(r.status, 200, JSON.stringify(r));
    const c2 = ok(await admin.from('fin_contas').select('*').eq('id', id).single());
    assert.equal(c2.nome, 'Locação Itaú (principal)'); assert.equal(c2.agencia, c1.agencia); assert.equal(c2.pix_chave, c1.pix_chave);
    assert.equal(c2.cofre_mascaras.pix_chave, 'f•••@chiavari.com');
    console.log('ok 2 - editar sem mexer nos campos protegidos mantém o valor');

    // 3. "Ver": com permissão abre e registra; sem permissão é recusado
    r = await chamar(chefe.cli, { action: 'revelar', conta_id: id, campos: ['agencia', 'pix_chave'] });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.valores, { agencia: '1234', pix_chave: 'financeiro@chiavari.com' });
    const ev = ok(await admin.from('seguranca_eventos').select('user_id,detalhes').eq('empresa_id', empresa).eq('tipo', 'dado_revelado'));
    assert.equal(ev.length, 1); assert.equal(ev[0].user_id, chefe.id); assert.equal(ev[0].detalhes.conta_id, id);
    r = await chamar(outro.cli, { action: 'revelar', conta_id: id, campos: ['agencia'] });
    assert.equal(r.status, 403);
    console.log('ok 3 - "Ver" abre só com permissão, e fica registrado quem viu');

    // 4. Sem permissão de editar o Financeiro, não salva; valor já cifrado vindo de fora é recusado; trava no banco
    r = await chamar(outro.cli, { action: 'salvar_conta', conta_id: id, conta: { nome: 'invadido' } });
    assert.notEqual(r.status, 200);
    assert.equal(ok(await admin.from('fin_contas').select('nome').eq('id', id).single()).nome, 'Locação Itaú (principal)');
    r = await chamar(chefe.cli, { action: 'salvar_conta', conta_id: id, conta: { pix_chave: c1.agencia } });
    assert.equal(r.status, 400);
    const aberto = await admin.from('fin_contas').update({ pix_chave: 'texto@aberto.com' }).eq('id', id);
    assert.match(aberto.error?.message || '', /check constraint/);
    console.log('ok 4 - sem permissão não salva; cifra de fora é recusada; a trava recusa texto aberto');

    // 5. Apagar um campo protegido (mandar vazio) grava vazio
    r = await chamar(chefe.cli, { action: 'salvar_conta', conta_id: id, conta: { conta: '' } });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(ok(await admin.from('fin_contas').select('conta').eq('id', id).single()).conta, null);
    console.log('ok 5 - campo protegido enviado em branco é apagado');
    console.log('OK - cofre do Financeiro');
  } finally {
    if (empresa) { await admin.from('seguranca_eventos').delete().eq('empresa_id', empresa); await admin.from('fin_contas').delete().eq('empresa_id', empresa); }
    for (const u of [chefe, outro]) if (u) { await admin.from('usuarios_empresas').delete().eq('user_id', u.id); await admin.from('usuarios').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
    if (empresa) { await admin.from('fin_auditoria').delete().eq('empresa_id', empresa); await admin.from('fin_categorias').delete().eq('empresa_id', empresa); await admin.from('fin_config').delete().eq('empresa_id', empresa); await admin.from('empresas').delete().eq('id', empresa); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
