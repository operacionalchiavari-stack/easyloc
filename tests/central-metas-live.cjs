// Teste de integração opt-in (RUN_CENTRAL_LIVE=1) da Central de Metas no Supabase (Edge Function central-metas).
// Cria empresa, usuário e funcionários temporários, uma O.S concluída e ocorrências do RH; fecha o mês, lança
// pagamento e premiação e confere o Meu Bônus pelo token. Apaga tudo no fim.
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
if (!process.env.ACERVO_COFRE_CHAVE) {
  try { process.env.ACERVO_COFRE_CHAVE = fs.readFileSync('C:/Users/jonat/acervo-cofre-chave.txt', 'utf8').match(/ACERVO_COFRE_CHAVE=(\S+)/)[1]; } catch (_) {}
}
// Mesmo formato do cofre (supabase/functions/_shared/cofre.ts): o salário fica cifrado no banco.
function cifrar(valor, contexto) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', Buffer.from(process.env.ACERVO_COFRE_CHAVE, 'base64'), iv);
  c.setAAD(Buffer.from(contexto));
  const corpo = Buffer.concat([c.update(String(valor), 'utf8'), c.final(), c.getAuthTag()]);
  return `cofre:v1:${iv.toString('base64')}:${corpo.toString('base64')}`;
}

async function main() {
  if (process.env.RUN_CENTRAL_LIVE !== '1') throw new Error('Defina RUN_CENTRAL_LIVE=1 para executar');
  const url = process.env.SUPABASE_URL; assert.equal(new URL(url).host, 'awemuohtvwvrdzfxwrmd.supabase.co');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  let empresa, usuario; const ids = { f1: crypto.randomUUID(), f2: crypto.randomUUID(), sup: crypto.randomUUID() };
  const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const chamar = async (fn, ...args) => {
    const r = await cli.functions.invoke('central-metas', { body: { fn, args, empresa_id: empresa } });
    if (r.error) { let e = {}; try { e = await r.error.context.json(); } catch {} throw new Error(fn + ': ' + (e.error || r.error.message)); }
    return r.data.resultado;
  };
  try {
    empresa = ok(await admin.from('empresas').insert({ nome: `TESTE CENTRAL ${sufixo}` }).select('id').single()).id;
    const u = ok(await admin.auth.admin.createUser({ email: `teste-central-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user;
    usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Gestor Teste' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    ok(await cli.auth.signInWithPassword({ email: u.email, password: senha }));
    const base = { empresa_id: empresa, acesso_sistema: false, nivel_acesso: 'Visualizador', ativo: true };
    ok(await admin.from('funcionarios_acesso').insert([
      { ...base, id: ids.f1, nome: 'Ana Costura', setor: 'Costura', cargo: 'Costureira', salario_cifrado: cifrar('2000', `rh:${empresa}:salario`) },
      { ...base, id: ids.f2, nome: 'Beto Solda', setor: 'Solda', cargo: 'Soldador', salario_cifrado: cifrar('3000', `rh:${empresa}:salario`) },
      { ...base, id: ids.sup, nome: 'Carla Supervisora', setor: 'Manutenção', cargo: 'Supervisor Departamento de Manutenção', salario_cifrado: cifrar('5000', `rh:${empresa}:salario`) },
    ]));
    // Item e O.S concluída na Costura (R$ 1.000 de reposição × 10% de comissão = R$ 100).
    const item = ok(await admin.from('itens').insert({ empresa_id: empresa, produto: 'Sofá Teste', descricao_total: 'Sofá Teste Central', categoria: 'Sofás', valor_reposicao: 1000, tipo: 'Item' }).select('id').single()).id;
    const ret = ok(await admin.from('acervo_retornos').insert({ empresa_id: empresa, chave: 'teste-' + sufixo, item_id: item, tipo: 'avaria', quantidade: 1, estado: 'reparo', origem: 'separacao', motivo: 'Rasgo no assento' }).select('id').single()).id;
    ok(await admin.from('acervo_os').insert({ empresa_id: empresa, numero: 1, retorno_id: ret, item_id: item, solicitante_nome: 'Teste', criado_por: usuario, quantidade: 1, setor: 'Costura', fluxo: ['Costura'], status: 'concluida',
      criado_em: new Date(Date.now() - 2 * 86400000).toISOString(), concluido_em: new Date().toISOString(), historico: [{ acao: 'criada', motivo: 'Rasgo no assento' }] }));
    ok(await admin.from('controle_rh_ocorrencias').insert({ empresa_id: empresa, data_ocorrencia: mes + '-02', funcionario_id: ids.f2, funcionario_nome: 'Beto Solda', setor: 'Solda', tipo: 'Atraso' }));
    ok(await admin.from('central_config').insert({ empresa_id: empresa, config: { comissoes: { os: { Costura: 10 }, supervisao: 10 } } }));

    const cfg = await chamar('centralConfigSalvar', { comissoes: { estofados: 2, pintura: 1, supervisao: 10, os: { Costura: 10 } }, metasRH: {}, almoxarifado: {} });
    assert.equal(cfg.comissoes.os.Costura, 10); assert.equal((await chamar('centralConfigObter')).comissoes.estofados, 2);
    await assert.rejects(chamar('centralConfigSalvar', { comissoes: { estofados: 150 } }), /entre 0 e 100/);
    const metas = await chamar('getMetasConfiguradas', mes);
    assert.equal(metas.length, 6);
    await chamar('salvarMetasEmLote', mes, [{ setor: 'Costura', producao: 1, tempo: '', qualidade: '', prazo: '', atraso: 0 }]);
    const status = await chamar('calcularStatusSetores', mes);
    const costura = status.find((s) => s.setor === 'Costura');
    assert.equal(costura.producao, 1); assert.equal(costura.status, true);
    const rh = await chamar('getAvaliacaoIndividualRH', mes, []);
    assert.equal(rh.find((r) => r.nome === 'Beto Solda').apto, false, 'atraso acima da meta 0');
    const os = await chamar('listarOSMes', mes);
    assert.equal(os.length, 1); assert.equal(os[0].total, 100); assert.equal(os[0].setor, 'Costura');
    const dist = await chamar('listarFuncionariosDistribuicaoCentral', mes);
    assert.equal(dist.estofados[0].nome, 'Ana Costura'); assert.equal(dist.estofados[0].aptoBonus, true);
    assert.equal(dist.estrutura[0].aptoBonus, false);
    const sup = await chamar('getPercentualSupervisorComissaoCentral');
    assert.equal(sup.nomeSupervisor, 'Carla Supervisora'); assert.equal(sup.tetoSupervisor, 1500);
    assert.ok(Array.isArray(await chamar('listarEventosMes', mes)));
    const almox = await chamar('getMetasAlmoxarifadoCentral', mes); assert.ok(almox.atual && almox.bonusAlmoxarifado);
    const op = await chamar('operacaoCalcularMes', mes); assert.equal(op.equipes.length, 3);
    const ex = await chamar('operacaoCalcularExemplo'); assert.equal(ex.totalEventos, 40);
    const params = await chamar('operacaoSalvarParametros', { descontoPercentual: 7 }); assert.equal(params.descontoPercentual, 7);
    assert.equal((await chamar('appEquipeListar')).pessoas.length, 3);

    assert.equal((await chamar('fechamentoCentralObter', mes)).fechado, false);
    const fech = await chamar('fechamentoCentralSalvar', mes);
    assert.equal(fech.fechado, true); assert.equal(fech.osEstofados, 100);
    assert.equal(fech.funcionariosEstofados[0].valorPagoFechado, 100);
    assert.equal(fech.valorPagoSupervisor, 10, '10% de R$ 100');
    await assert.rejects(chamar('fechamentoCentralSalvar', mes), /já foi fechado/);
    let pag = await chamar('pagamentosBonusCentralObter', mes.slice(0, 4));
    const ana = pag.pessoas.find((p) => p.nome === 'Ana Costura');
    assert.equal(ana.valores[mes].devido, 100);
    pag = await chamar('pagamentosBonusCentralSalvar', [{ mes, chave: ana.chave, valorPago: 100 }], '', mes.slice(0, 4));
    assert.equal(pag.pessoas.find((p) => p.chave === ana.chave).valores[mes].pago, 100);

    const premiacao = (await chamar('premiacoesObter', mes.slice(0, 4))).meses.find((m) => m.mes === mes);
    if (premiacao) {
      assert.equal(premiacao.fechado, true);
      const salvo = await chamar('premiacoesSalvarItem', { mes, chave: ana.chave, nome: 'Ana Costura', descricao: 'Fone', valor: 40, dataCompra: mes + '-05' });
      const p2 = (await chamar('premiacoesObter', mes.slice(0, 4))).meses.find((m) => m.mes === mes).pessoas.find((p) => p.chave === ana.chave);
      assert.equal(p2.usado, 40); assert.equal(p2.saldo, 60);
      await chamar('premiacoesExcluirItem', salvo.id);
    }
    // Meu Bônus pelo token da sessão (CPF + PIN gera essa mesma sessão).
    const s = ok(await admin.rpc('central_equipe_sessao', { p_empresa: empresa, p_funcionario: ids.f1 }));
    const r = await cli.functions.invoke('central-metas', { body: { fn: 'equipeExtrato', args: [s.token] } });
    assert.ifError(r.error);
    const ext = r.data.resultado;
    assert.equal(ext.pessoa.nome, 'Ana Costura');
    assert.equal(ext.meses.find((m) => m.mes === mes).abastecido, 100);
    assert.equal(ext.meses.find((m) => m.mes === mes).pago, 100);
    console.log('ok central-metas: metas, status, RH, O.S, distribuição, supervisor, operação, fechamento, pagamentos, premiações e Meu Bônus');
  } finally {
    if (empresa) {
      for (const t of ['central_premiacoes', 'central_pagamentos', 'central_fechamentos', 'central_metas', 'central_config', 'controle_rh_ocorrencias', 'acervo_os', 'acervo_retornos', 'itens']) await admin.from(t).delete().eq('empresa_id', empresa);
      await admin.from('app_sessoes').delete().eq('empresa_id', empresa);
      await admin.from('funcionarios_acesso').delete().eq('empresa_id', empresa);
      await admin.from('usuarios_empresas').delete().eq('empresa_id', empresa);
      if (usuario) { await admin.from('usuarios').delete().eq('id', usuario); await admin.auth.admin.deleteUser(usuario); }
      const { error } = await admin.from('empresas').delete().eq('id', empresa);
      if (error) console.error('limpeza da empresa:', error.message);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
