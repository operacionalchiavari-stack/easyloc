// /api/gs só aceita a sessão depois da verificação em duas etapas (quando a empresa exige). Banco simulado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const EMPRESA = 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';

function simular(status) {
  global.fetch = async (url) => {
    const u = String(url);
    const resp = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
    if (u.endsWith('/auth/v1/user')) return resp({ id: 'u1', email: 'a@b.c' });
    if (u.includes('usuarios_empresas')) return resp([{ empresa_id: EMPRESA, role: 'admin' }]);
    if (u.includes('funcionarios_acesso')) return resp([]);
    if (u.includes('/usuarios?')) return resp([{ nome: 'Pessoa' }]);
    if (u.includes('seguranca_2fa_status')) return status === 'erro' ? resp(null, false) : resp(status);
    return resp([]);
  };
}
const carregar = () => { delete require.cache[require.resolve('../api/gs.js')]; return require('../api/gs.js'); };
const cfg = { url: 'https://x.supabase.co', chave: 'k' };

test('sem exigência entra normalmente', async () => {
  simular({ obrigatorio: false, verificado: false });
  const u = await carregar().usuarioDaSessao(cfg, 't1');
  assert.equal(u?.id, 'u1');
});
test('exigência ligada e código não confirmado: barra', async () => {
  simular({ obrigatorio: true, verificado: false });
  assert.equal(await carregar().usuarioDaSessao(cfg, 't2'), null);
});
test('exigência ligada e código confirmado: entra', async () => {
  simular({ obrigatorio: true, verificado: true });
  assert.equal((await carregar().usuarioDaSessao(cfg, 't3'))?.id, 'u1');
});
test('banco sem resposta: barra (falha fechada)', async () => {
  simular('erro');
  assert.equal(await carregar().usuarioDaSessao(cfg, 't4'), null);
});
