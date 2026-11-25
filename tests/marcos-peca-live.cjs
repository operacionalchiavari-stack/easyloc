// Teste opt-in (RUN_MARCOS_LIVE=1): conversa de verdade com o Marcos (Edge Function avaria-setor, modo avulsa) para uma peça
// danificada achada no depósito. Usuário admin temporário na empresa dona; a foto é a de um item do acervo.
// Sem foto ele não fecha; com foto e respostas, monta o resumo com item, quantidade, dano e setor; a RPC
// acervo_avaria_avulsa recusa sem foto e abre a O.S com foto. Tudo o que foi criado é apagado no fim.
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto'), assert = require('assert');

(async () => {
  if (process.env.RUN_MARCOS_LIVE !== '1') throw new Error('Defina RUN_MARCOS_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let usuario, caminho, retorno;
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-marcos-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Paulo Teste' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const cli = createClient(url, 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await cli.auth.signInWithPassword({ email: u.email, password: senha }));

    const item = ok(await admin.from('itens').select('id,produto,descricao_total,foto_url,estoque_total').eq('empresa_id', empresa)
      .ilike('descricao_total', '%poltrona%').neq('tipo', 'Kit').gt('estoque_total', 2).not('foto_url', 'is', null).limit(1))[0];
    assert(item, 'achei uma poltrona com foto');
    const img = Buffer.from(await (await fetch(item.foto_url)).arrayBuffer());
    caminho = `${empresa}/${u.id}/${crypto.randomUUID()}.jpg`;
    ok(await cli.storage.from('solicitacoes-evidencias').upload(caminho, img, { contentType: 'image/jpeg' }));
    const foto = cli.storage.from('solicitacoes-evidencias').getPublicUrl(caminho).data.publicUrl;
    console.log('item:', item.descricao_total);

    const msgs = [];
    const falar = async (texto, fotos) => {
      msgs.push({ papel: 'pessoa', texto, ...(fotos ? { fotos } : {}) });
      const { data, error } = await cli.functions.invoke('avaria-setor', { body: { empresa_id: empresa, modo: 'avulsa', acao: 'conversar', mensagens: msgs } });
      let erro = data?.erro || (error && error.message);
      if (error?.context?.json) { try { erro = (await error.context.json()).erro || erro; } catch {} }
      if (erro) throw new Error(erro);
      msgs.push({ papel: 'ia', texto: data.resposta });
      console.log('  você:', texto || '(foto)', '\n  Marcos:', data.resposta, data.pronto ? '[PRONTO]' : '');
      return data;
    };
    let r = await falar('Achei uma poltrona com o tecido rasgado no braço');
    assert(!r.pronto, 'sem foto não fecha');
    console.log('ok 1 - sem foto ele pede a foto');
    r = await falar('', [foto]);
    const respostas = [
      'Sim, o tecido do braço esquerdo está rasgado uns 5 cm',
      item.descricao_total, 'É essa mesma', '1 peça', 'Estava no galpão B, prateleira 2', 'Isso, pode mandar',
    ];
    for (const t of respostas) { if (r.pronto) break; r = await falar(t); }
    assert(r.pronto && r.resumo, 'Marcos montou o resumo');
    assert(r.resumo.item_id === item.id, 'item certo: ' + r.resumo.item_nome);
    assert(['Costura', 'Forração'].includes(r.resumo.setor), 'setor de tecido: ' + r.resumo.setor);
    console.log('ok 2 - resumo:', JSON.stringify(r.resumo));

    const semFoto = await cli.rpc('acervo_avaria_avulsa', { p_empresa: empresa, p_item: item.id, p_quantidade: 1, p_descricao: r.resumo.dano, p_setor: r.resumo.setor, p_fotos: [], p_local: null });
    assert(semFoto.error && /foto/i.test(semFoto.error.message), 'RPC recusa sem foto');
    const os = ok(await cli.rpc('acervo_avaria_avulsa', { p_empresa: empresa, p_item: item.id, p_quantidade: r.resumo.quantidade, p_descricao: r.resumo.dano, p_setor: r.resumo.setor, p_fotos: [foto], p_local: r.resumo.local || null }));
    retorno = os.retorno_id;
    const ordens = ok(await cli.rpc('acervo_ordens', { p_empresa: empresa }));
    const minha = ordens.find((o) => o.id === os.os_id);
    assert(minha && minha.foto_dano === foto && minha.onde === 'Depósito', 'O.S com a foto do dano e origem Depósito');
    console.log('ok 3 - O.S', os.os_numero, 'em', os.setor, 'com a foto');
  } finally {
    if (retorno) {
      await admin.from('acervo_historico').delete().eq('retorno_id', retorno);
      await admin.from('acervo_os').delete().eq('retorno_id', retorno);
      await admin.from('acervo_retornos').delete().eq('id', retorno);
    }
    if (caminho) await admin.storage.from('solicitacoes-evidencias').remove([caminho]);
    if (usuario) {
      await admin.from('ia_uso').delete().eq('usuario_id', usuario).then(() => {}, () => {});
      await admin.from('usuarios_empresas').delete().eq('user_id', usuario);
      await admin.from('usuarios').delete().eq('id', usuario);
      await admin.auth.admin.deleteUser(usuario);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
