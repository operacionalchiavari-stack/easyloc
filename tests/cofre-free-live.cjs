// Teste de integração opt-in (RUN_COFRE_LIVE=1) do cofre dos Free (CPF e chave PIX), contra o banco e a Edge Function
// free-protegido reais. O app do Free é da empresa dona (Chiavari), então o teste cria nela um Free e um usuário da equipe
// temporários e apaga os dois (e as sessões e registros) no fim.
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function cpfAleatorio() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const t of [10, 11]) { let s = 0; n.forEach((d, i) => { s += d * (t - i); }); n.push((s * 10) % 11 % 10); }
  return n.join('');
}

async function main() {
  if (process.env.RUN_COFRE_LIVE !== '1') throw new Error('Defina RUN_COFRE_LIVE=1 para executar o teste de integração');
  const url = process.env.SUPABASE_URL; assert.equal(new URL(url).host, 'awemuohtvwvrdzfxwrmd.supabase.co');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  const cpf = cpfAleatorio(), pix = `free.${sufixo}@example.invalid`;
  let freeId, staff;
  const chamar = async (cli, body) => {
    const r = await cli.functions.invoke('free-protegido', { body });
    if (r.error) { let e = {}; try { e = await r.error.context.json(); } catch {} return { status: r.error.context?.status, ...e }; }
    return { status: 200, ...r.data };
  };
  try {
    // 1. Cadastro pelo app (sem login): CPF e PIX vão cifrados, com índice e máscara
    let r = await chamar(anon, { action: 'cadastrar', dados: { nome: `Free Cofre ${sufixo}`, cpf, telefone: '(24) 99999-0000', senha: 'senha123', pix } });
    assert.equal(r.status, 200, JSON.stringify(r)); assert.ok(r.token);
    const linha = ok(await admin.from('free_cadastros').select('*').eq('empresa_id', empresa).like('nome', `%${sufixo}%`).single());
    freeId = linha.id;
    assert.match(linha.cpf, /^cofre:v1:/); assert.match(linha.chave_pix, /^cofre:v1:/); assert.match(linha.cpf_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(linha).includes(cpf) && !JSON.stringify(linha).includes(pix.split('@')[0]));
    assert.equal(linha.cofre_mascaras.cpf, `•••.•••.•••-${cpf.slice(-2)}`); assert.equal(linha.cofre_mascaras.pix, 'f•••@example.invalid');
    console.log('ok 1 - o cadastro do Free grava CPF e PIX cifrados, com índice e máscara');

    // 2. CPF repetido e CPF inválido recusados
    assert.match((await chamar(anon, { action: 'cadastrar', dados: { nome: 'Outro Free Teste', cpf, telefone: '(24) 99999-0000', senha: 'senha123', pix: 'outra@chave.com' } })).error, /já está cadastrado/);
    assert.match((await chamar(anon, { action: 'cadastrar', dados: { nome: 'Outro Free Teste', cpf: '11111111111', telefone: '(24) 99999-0000', senha: 'senha123', pix: 'outra@chave.com' } })).error, /CPF inválido/);
    console.log('ok 2 - CPF repetido e CPF inválido são recusados');

    // 3. Login pelo CPF (com pontuação ou sem); senha errada recusada
    r = await chamar(anon, { action: 'login', cpf: cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'), senha: 'senha123' });
    assert.equal(r.status, 200, JSON.stringify(r)); const token = r.token;
    assert.match((await chamar(anon, { action: 'login', cpf, senha: 'errada' })).error, /CPF ou senha incorretos/);
    console.log('ok 3 - login pelo CPF funciona e senha errada é recusada');

    // 4. O próprio Free vê CPF e PIX só com a máscara; trocar o PIX grava cifrado
    let dados = ok(await anon.rpc('free_app_dados', { p_token: token }));
    assert.equal(dados.free.cpf, `•••.•••.•••-${cpf.slice(-2)}`); assert.equal(dados.free.pix, 'f•••@example.invalid');
    r = await chamar(anon, { action: 'pix', token, pix: '24988887777' });
    assert.equal(r.status, 200, JSON.stringify(r));
    const depois = ok(await admin.from('free_cadastros').select('chave_pix,cofre_mascaras').eq('id', freeId).single());
    assert.match(depois.chave_pix, /^cofre:v1:/); assert.notEqual(depois.chave_pix, linha.chave_pix); assert.equal(depois.cofre_mascaras.pix, '••••77');
    dados = ok(await anon.rpc('free_app_dados', { p_token: token }));
    assert.equal(dados.free.pix, '••••77');
    assert.equal((await chamar(anon, { action: 'pix', token: 'token-invalido', pix: '24988887777' })).status, 400);
    console.log('ok 4 - o app mostra só a máscara e a troca de PIX grava cifrado (token inválido recusado)');

    // 5. As funções antigas e as novas não ficam abertas para o app chamar direto
    for (const [fn, args] of [['free_app_cadastrar_cofre', { p_dados: {} }], ['free_app_login_cofre', { p_cpf_hash: 'x', p_senha: 'x' }], ['free_app_pix_cofre', { p_token: 'x', p_pix: 'x', p_mascara: 'x' }]]) {
      const e = await anon.rpc(fn, args);
      assert.ok(e.error, `${fn} não pode ser chamada sem o servidor`);
    }
    console.log('ok 5 - as funções que gravam o cofre só o servidor executa');

    // 6. Pagamento: CPF e PIX completos só para a equipe com permissão, com registro
    assert.equal((await chamar(anon, { action: 'revelar_rh', empresa_id: empresa, ids: [freeId] })).status, 401);
    const u = ok(await admin.auth.admin.createUser({ email: `teste-cofrefree-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user;
    staff = u.id;
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await cli.auth.signInWithPassword({ email: u.email, password: senha }));
    r = await chamar(cli, { action: 'revelar_rh', empresa_id: empresa, ids: [freeId], motivo: 'teste' });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.valores[freeId], { cpf, pix: '24988887777' });
    const ev = ok(await admin.from('seguranca_eventos').select('tipo,detalhes').eq('user_id', u.id));
    assert.equal(ev.length, 1); assert.deepEqual(ev[0].detalhes.free_ids, [freeId]);
    console.log('ok 6 - o pagamento recebe CPF e PIX completos só com login da equipe e permissão, com registro');
    console.log('OK - cofre dos Free');
  } finally {
    if (staff) { await admin.from('seguranca_eventos').delete().eq('user_id', staff); await admin.from('usuarios_empresas').delete().eq('user_id', staff); await admin.auth.admin.deleteUser(staff); }
    if (freeId) { await admin.from('app_sessoes').delete().eq('free_id', freeId); await admin.from('free_cadastros').delete().eq('id', freeId); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
