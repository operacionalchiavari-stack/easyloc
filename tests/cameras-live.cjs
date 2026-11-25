// Teste opt-in (RUN_CAMERAS_LIVE=1): câmera ao vivo, com banco e Realtime reais. Usuário administrador temporário e uma
// montagem temporária (apagados no fim). Um navegador faz o celular (câmera simulada do Edge) e outro o Painel
// Logístico › Câmeras; confere que o vídeo chega ao painel, que o celular conta quem assiste e que encerrar tira do ar.
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
const PORTA = 5623, BASE = `http://localhost:${PORTA}/`;
const saida = path.join(root, 'outputs', 'cameras'); fs.mkdirSync(saida, { recursive: true });

(async () => {
  if (process.env.RUN_CAMERAS_LIVE !== '1') throw new Error('Defina RUN_CAMERAS_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let usuario, etapa, browser;
  await new Promise((r) => srv.listen(PORTA, r));
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-camera-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Supervisor Teste' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const pedido = ok(await admin.from('separacoes_pedidos').select('id').eq('empresa_id', empresa).neq('status', 'cancelado').limit(1).single());
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    etapa = ok(await admin.from('operacao_etapas').insert({ empresa_id: empresa, pedido_id: pedido.id, nome: 'Montagem teste câmera', tipo: 'montagem', data: hoje, hora: '10:00', origem: 'manual' }).select('id').single()).id;
    const cli = createClient(url, 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', { auth: { persistSession: false, autoRefreshToken: false } });
    const sessao = ok(await cli.auth.signInWithPassword({ email: u.email, password: senha })).session;

    browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
    const prep = async (ctx) => ctx.addInitScript(([s, e]) => { try { localStorage.setItem('easyloc-auth', JSON.stringify(s)); localStorage.setItem('acervo_ultima_empresa', e); sessionStorage.setItem('empresa_id', e); sessionStorage.setItem('login_ok', '1'); } catch (x) {} }, [sessao, empresa]);
    const erros = [];

    // ---- celular
    const ctxCel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
    await prep(ctxCel);
    const cel = await ctxCel.newPage(); cel.on('pageerror', (e) => erros.push('celular: ' + e.message));
    await cel.goto(BASE + 'Modulos/Logistica/CameraApp/camera.html?app=1');
    await cel.waitForSelector('#cmPermissao:not([hidden])');
    await cel.screenshot({ path: path.join(saida, '02-permissao.png') });
    await cel.click('#cmComecar');
    await cel.waitForSelector('#cmAoVivo:not([hidden])', { timeout: 20000 });
    console.log('ok 1 - celular: abriu, ligou a câmera (sem escolher montagem) e está ao vivo');

    // ---- painel
    const ctxPc = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    await prep(ctxPc);
    const pc = await ctxPc.newPage(); pc.on('pageerror', (e) => erros.push('painel: ' + e.message));
    await pc.goto(BASE + 'Modulos/Logistica/Cameras/cameras.html');
    await pc.waitForSelector('#camHost .plc-quadro[data-cam]', { timeout: 40000 });
    await pc.waitForFunction(() => [...document.querySelectorAll('.plc-quadro video')].some((v) => v.videoWidth > 0 && !v.paused), null, { timeout: 45000 }).catch(async (e) => { await pc.screenshot({ path: path.join(saida, 'debug-painel.png') }); console.log('DEBUG estados', await pc.$$eval('.plc-quadro', (l) => l.map((q) => q.dataset.estado + ' ' + q.innerText.slice(0, 120)))); const sg = await admin.from('logistica_camera_sinais').select('id,de,para,tipo,criado_em').eq('empresa_id', empresa).order('id'); console.log('DEBUG sinais', JSON.stringify(sg.data?.map((x) => [x.id, x.de.slice(0, 6), x.para.slice(0, 6), x.tipo]))); console.log('DEBUG rpc', JSON.stringify(await pc.evaluate(async () => { const id = document.querySelector('.plc-quadro[data-cam]').dataset.cam; const r = await window.supabaseClient.rpc('camera_sinal', { p_camera: id, p_de: 'x1', p_para: 'cam', p_tipo: 'pedido', p_dados: null }); return [id, r.error]; }))); console.log('DEBUG video', JSON.stringify(await pc.$$eval('.plc-quadro video', (l) => l.map((v) => ({ src: !!v.srcObject, tracks: v.srcObject?.getTracks().map((x) => x.kind + ':' + x.readyState + ':' + x.muted), rs: v.readyState, paused: v.paused, w: v.videoWidth, conectado: document.contains(v) }))))); console.log('DEBUG erros', erros, await cel.textContent('#cmAssistindo')); throw e; });
    await pc.waitForTimeout(1500);
    await pc.screenshot({ path: path.join(saida, '03-painel.png') });
    console.log('ok 2 - painel recebe o vídeo do celular ao vivo');
    await cel.waitForFunction(() => /assistindo/.test(document.getElementById('cmAssistindo').textContent) && document.getElementById('cmAssistindo').classList.contains('on'), null, { timeout: 15000 });
    await cel.screenshot({ path: path.join(saida, '04-celular-ao-vivo.png') });
    console.log('ok 3 - celular mostra:', await cel.textContent('#cmAssistindo'));
    assert.ok((await pc.title()).startsWith('(1)'), 'título mostra quantas câmeras estão no ar');

    // vertical / horizontal: a imagem muda de formato e continua grande
    const tamanho = () => pc.$eval('.plc-quadro[data-cam] .plc-img', (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    const hz = await tamanho(); assert.ok(hz.w > hz.h && hz.w > 700, 'horizontal grande: ' + JSON.stringify(hz));
    await pc.click('[data-formato="vertical"]'); await pc.waitForTimeout(500);
    const vt = await tamanho(); assert.ok(vt.h > vt.w && vt.h > 500, 'vertical grande: ' + JSON.stringify(vt));
    assert.ok(await pc.$$eval('.plc-quadro video', (l) => l.some((v) => v.videoWidth > 0 && !v.paused)), 'vídeo continua depois de trocar o formato');
    await pc.screenshot({ path: path.join(saida, '05-vertical.png') });
    await pc.click('[data-formato="horizontal"]'); await pc.waitForTimeout(300);
    console.log('ok 4 - horizontal', hz, 'e vertical', vt);
    // encerra no celular
    await cel.click('#cmEncerrar'); await cel.click('#cmConfirmar button[value="sim"]');
    await cel.waitForSelector('#cmPermissao:not([hidden])', { timeout: 15000 });
    await pc.waitForSelector('#plcEncerradas:not([hidden])', { timeout: 30000 });
    await pc.screenshot({ path: path.join(saida, '06-encerrada.png') });
    console.log('ok 5 - encerrar no celular tira a câmera do ar no painel');

    assert.deepEqual(erros, [], 'sem erros de JavaScript: ' + erros.join(' | '));
    console.log('ok - tudo certo');
  } finally {
    if (browser) await browser.close();
    srv.close();
    if (etapa) { await admin.from('logistica_cameras').delete().eq('etapa_id', etapa); await admin.from('operacao_etapas').delete().eq('id', etapa); }
    if (usuario) {
      await admin.from('logistica_cameras').delete().eq('usuario_id', usuario);
      await admin.from('usuarios_empresas').delete().eq('user_id', usuario);
      await admin.from('usuarios').delete().eq('id', usuario);
      await admin.auth.admin.deleteUser(usuario);
    }
  }
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
