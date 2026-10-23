// Teste de integração opt-in (RUN_COFRE_LIVE=1) do cofre de clientes e locais (CPF/CNPJ), contra o banco e a Edge
// Function cadastro-protegido reais. Cria empresa, dois usuários e registros temporários e apaga tudo no fim.
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
    const u = ok(await admin.auth.admin.createUser({ email: `teste-cofredoc-${nome}-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role }));
    const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await cli.auth.signInWithPassword({ email: u.email, password: senha }));
    return { id: u.id, cli };
  };
  const chamar = async (cli, body) => {
    const r = await cli.functions.invoke('cadastro-protegido', { body: { empresa_id: empresa, ...body } });
    if (r.error) { let e = {}; try { e = await r.error.context.json(); } catch {} return { status: r.error.context?.status, ...e }; }
    return { status: 200, ...r.data };
  };
  try {
    empresa = ok(await admin.from('empresas').insert({ nome: `TESTE COFRE DOC ${sufixo}` }).select('id').single()).id;
    chefe = await novoUsuario('chefe', 'admin');
    outro = await novoUsuario('outro', 'member');

    // 1. Proteger: devolve o valor cifrado, o índice e a máscara; a tela grava (como o próprio usuário)
    let r = await chamar(chefe.cli, { action: 'proteger', tabela: 'cliente', documento: '123.456.789-09' });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.match(r.cpf_cnpj, /^cofre:v1:/); assert.match(r.cpf_cnpj_hash, /^[0-9a-f]{64}$/); assert.equal(r.mascara, '•••.•••.•••-09');
    const cliId = crypto.randomUUID();
    ok(await chefe.cli.from('clientes_empresas').insert({ id: cliId, empresa_id: empresa, nome_razao: 'Cliente Cofre', tipo_pessoa: 'PF', status: 'Ativo',
      cpf_cnpj: r.cpf_cnpj, cpf_cnpj_hash: r.cpf_cnpj_hash, cofre_mascaras: { cpf_cnpj: r.mascara } }));
    const linha = ok(await admin.from('clientes_empresas').select('cpf_cnpj').eq('id', cliId).single());
    assert.ok(!linha.cpf_cnpj.includes('12345678909'));
    const rl = await chamar(chefe.cli, { action: 'proteger', tabela: 'local', documento: '12.345.678/0001-90' });
    assert.equal(rl.mascara, '••.•••.•••/••••-90');
    const locId = ok(await chefe.cli.from('locais_empresas').insert({ empresa_id: empresa, nome_razao: 'Local Cofre', tipo_pessoa: 'PJ', status: 'Ativo', telefone: '24999999999', email: 'local@example.invalid', endereco: 'Rua Teste', numero_endereco: '1', ponto_referencia: '-',
      cpf_cnpj: rl.cpf_cnpj, cpf_cnpj_hash: rl.cpf_cnpj_hash, cofre_mascaras: { cpf_cnpj: rl.mascara } }).select('id').single()).id;
    console.log('ok 1 - CPF/CNPJ de cliente e local gravados cifrados, com índice e máscara');

    // 2. Índice: o mesmo documento (com ou sem pontuação) acha o registro (duplicado / busca)
    const ix = await chamar(chefe.cli, { action: 'indice', tabela: 'cliente', documento: '12345678909' });
    assert.equal(ix.hash, r.cpf_cnpj_hash);
    const achados = ok(await chefe.cli.from('clientes_empresas').select('id').eq('empresa_id', empresa).eq('cpf_cnpj_hash', ix.hash));
    assert.deepEqual(achados.map((x) => x.id), [cliId]);
    const ixLoc = await chamar(chefe.cli, { action: 'indice', tabela: 'local', documento: '12345678000190' });
    assert.equal(ixLoc.hash, rl.cpf_cnpj_hash);
    console.log('ok 2 - o índice acha o cadastro pelo documento inteiro');

    // 3. Ver: com a permissão abre e registra; sem a permissão é recusado
    r = await chamar(chefe.cli, { action: 'revelar', tabela: 'cliente', id: cliId });
    assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.documento, '12345678909');
    r = await chamar(chefe.cli, { action: 'revelar', tabela: 'local', id: locId });
    assert.equal(r.documento, '12345678000190');
    r = await chamar(outro.cli, { action: 'revelar', tabela: 'cliente', id: cliId });
    assert.equal(r.status, 403);
    console.log('ok 3 - "Ver" abre só com a permissão de dados sensíveis');

    // 4. Contrato: documento completo pra quem vê pedidos, com registro; sem permissão, recusado
    r = await chamar(chefe.cli, { action: 'documento_contrato', id: cliId, pedido_id: 'p-teste' });
    assert.equal(r.documento, '12345678909');
    r = await chamar(outro.cli, { action: 'documento_contrato', id: cliId });
    assert.equal(r.status, 403);
    const ev = ok(await admin.from('seguranca_eventos').select('tipo,user_id,detalhes').eq('empresa_id', empresa));
    assert.deepEqual(ev.map((e) => e.tipo).sort(), ['dado_revelado', 'dado_revelado', 'documento_contrato']);
    assert.equal(ev.find((e) => e.tipo === 'documento_contrato').detalhes.pedido_id, 'p-teste');
    console.log('ok 4 - o contrato recebe o documento completo e o uso fica registrado');

    // 5. Recusas: documento de tamanho errado, valor já cifrado, sem permissão de salvar, cadastro inexistente
    assert.equal((await chamar(chefe.cli, { action: 'proteger', tabela: 'cliente', documento: '1234' })).status, 400);
    assert.equal((await chamar(chefe.cli, { action: 'proteger', tabela: 'cliente', documento: linha.cpf_cnpj })).status, 400);
    assert.equal((await chamar(outro.cli, { action: 'proteger', tabela: 'cliente', documento: '12345678909' })).status, 403);
    assert.equal((await chamar(chefe.cli, { action: 'revelar', tabela: 'cliente', id: crypto.randomUUID() })).status, 404);
    console.log('ok 5 - documento inválido, valor cifrado de fora e falta de permissão são recusados');
    console.log('OK - cofre de clientes e locais');
  } finally {
    if (empresa) { await admin.from('seguranca_eventos').delete().eq('empresa_id', empresa); await admin.from('clientes_empresas').delete().eq('empresa_id', empresa); await admin.from('locais_empresas').delete().eq('empresa_id', empresa); }
    for (const u of [chefe, outro]) if (u) { await admin.from('usuarios_empresas').delete().eq('user_id', u.id); await admin.from('usuarios').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id); }
    if (empresa) await admin.from('empresas').delete().eq('id', empresa);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
