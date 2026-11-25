// Teste opt-in (RUN_CAMERAS_LIVE=1): protocolo da câmera do app Android nativo, com banco e Realtime reais.
// Uma página faz o papel do serviço nativo (CameraStreamService): só o token do aparelho e as funções camera_disp_*
// (sinais, batimento com telemetria, encerrar), com a câmera simulada do Edge. A central (Logística › Câmeras ao vivo)
// assiste e mostra estado, telemetria e alertas. Também confere a tela do celular e a barra com a ponte do Android simulada.
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
const PORTA = 5624, BASE = `http://localhost:${PORTA}/`, ANON = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
const saida = path.join(root, 'outputs', 'cameras'); fs.mkdirSync(saida, { recursive: true });

(async () => {
  if (process.env.RUN_CAMERAS_LIVE !== '1') throw new Error('Defina RUN_CAMERAS_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let usuario, browser;
  await new Promise((r) => srv.listen(PORTA, r));
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-camnat-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Montador Teste' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const cli = createClient(url, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const sessao = ok(await cli.auth.signInWithPassword({ email: u.email, password: senha })).session;
    const anon = createClient(url, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

    // segurança: sem login não se cria câmera; token errado não abre nada
    assert.ok((await anon.rpc('camera_dispositivo_iniciar', { p_empresa: empresa })).error, 'sem login não liga câmera');
    assert.ok((await anon.rpc('camera_disp_sinais', { p_token: 'x'.repeat(43), p_depois: 0 })).error, 'token falso recusado');
    const cam = ok(await cli.rpc('camera_dispositivo_iniciar', { p_empresa: empresa, p_aparelho: 'Teste' }));
    assert.match(cam.token, /^[A-Za-z0-9_-]{43}$/, 'token no formato que o Android aceita');
    assert.equal(cam.config.resolucao, '480p'); assert.equal(cam.config.fps, 15);
    console.log('ok 1 - token do aparelho: só com login, formato certo, qualidade padrão 480p/15 fps');

    browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
    const erros = [];

    // ---- "serviço nativo" (mesmo protocolo do CameraStreamService.java)
    const nat = await (await browser.newContext({ permissions: ['camera'] })).newPage();
    nat.on('pageerror', (e) => erros.push('nativo: ' + e.message));
    await nat.goto(BASE + 'js/core/camera-ice.js'); // qualquer página do localhost (contexto seguro para a câmera)
    await nat.evaluate(async ([url, anonKey, token]) => {
      const rpc = (f, b) => fetch(url + '/rest/v1/rpc/' + f, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => { const t = await r.text(); if (!r.ok) throw Error(t); return t ? JSON.parse(t) : null; });
      // fonte de vídeo do "celular": um canvas desenhado a cada 66 ms (a câmera simulada do Edge sem janela é instável)
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; document.body.appendChild(cv);
      const g = cv.getContext('2d'); let n = 0;
      setInterval(() => { g.fillStyle = 'hsl(' + (n * 3 % 360) + ',60%,55%)'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.fillText('Montagem ' + (n++), 60, 260); }, 66);
      const stream = cv.captureStream(15);
      const pcs = new Map(), filas = new Map(); let ultimo = 0; window.__pcs = pcs;
      window.__tel = { bateria: 15, carregando: false, temperatura: 43.5, rede: 'wifi', rede_qualidade: 'boa', resolucao: '640x480', fps: 15, tela_ligada: false, termico: 3 };
      window.__estado = 'ao_vivo';
      window.__ping = () => rpc('camera_disp_ping', { p_token: token, p_estado: window.__estado, p_telemetria: window.__tel });
      const enviar = (para, tipo, dados) => rpc('camera_disp_sinal', { p_token: token, p_para: para, p_tipo: tipo, p_dados: dados });
      async function loop() {
        try {
          const l = await rpc('camera_disp_sinais', { p_token: token, p_depois: ultimo });
          for (const s of l) {
            ultimo = Math.max(ultimo, s.id);
            if (s.tipo === 'pedido') {
              const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); pcs.set(s.de, pc);
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));
              pc.onicecandidate = (e) => { if (e.candidate) enviar(s.de, 'ice', e.candidate.toJSON()); };
              const o = await pc.createOffer(); await pc.setLocalDescription(o);
              await enviar(s.de, 'oferta', { type: 'offer', sdp: pc.localDescription.sdp });
            } else if (s.tipo === 'resposta') { const pc = pcs.get(s.de); if (pc) { await pc.setRemoteDescription(s.dados); for (const c of (filas.get(s.de) || [])) await pc.addIceCandidate(c).catch(() => {}); filas.delete(s.de); } }
            else if (s.tipo === 'ice') { const pc = pcs.get(s.de); if (!pc) continue; if (pc.remoteDescription) await pc.addIceCandidate(s.dados).catch(() => {}); else (filas.get(s.de) || filas.set(s.de, []).get(s.de)).push(s.dados); } // como o Java: guarda até a resposta
          }
        } catch (e) { window.__erro = e.message; }
        if (!window.__parar) setTimeout(loop, 1000);
      }
      await window.__ping(); loop();
      window.__pinger = setInterval(window.__ping, 5000);
      window.__encerrar = () => { window.__parar = true; clearInterval(window.__pinger); return rpc('camera_disp_encerrar', { p_token: token, p_motivo: 'funcionario' }); };
    }, [url, ANON, cam.token]);

    // ---- central
    const ctxPc = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await ctxPc.addInitScript(([s, e]) => { localStorage.setItem('easyloc-auth', JSON.stringify(s)); localStorage.setItem('acervo_ultima_empresa', e); sessionStorage.setItem('empresa_id', e); sessionStorage.setItem('login_ok', '1'); }, [sessao, empresa]);
    const pc = await ctxPc.newPage(); pc.on('pageerror', (e) => erros.push('central: ' + e.message));
    await pc.goto(BASE + 'Modulos/Logistica/Cameras/cameras.html');
    const quadro = `.plc-quadro[data-cam="${cam.id}"]`;
    await pc.waitForSelector(quadro, { timeout: 40000 });
    await pc.waitForFunction((q) => { const v = document.querySelector(q + ' video'); return v && v.videoWidth > 0 && !v.paused; }, quadro, { timeout: 45000 }).catch(async (e) => {
      console.log('DEBUG nativo', await nat.evaluate(async () => { const out = [window.__erro, document.visibilityState]; for (const pc of window.__pcs.values()) { out.push(pc.connectionState); const st = await pc.getStats(); st.forEach((r) => { if (r.type === 'outbound-rtp') out.push(r.kind + ' sent=' + r.bytesSent + ' frames=' + r.framesEncoded + ' lim=' + r.qualityLimitationReason); if (r.type === 'media-source') out.push('src ' + r.width + 'x' + r.height + ' fps=' + r.framesPerSecond); }); } return out; }));
      const sg = await admin.from('logistica_camera_sinais').select('id,de,para,tipo').eq('camera_id', cam.id).order('id'); console.log('DEBUG sinais', JSON.stringify(sg.data?.map((x) => [x.id, x.de.slice(0, 6), x.para.slice(0, 6), x.tipo])));
      console.log('DEBUG quadro', await pc.$eval(quadro, (q) => { const v = q.querySelector('video'); return q.dataset.estado + ' ' + JSON.stringify({ src: !!v.srcObject, tr: v.srcObject?.getTracks().map((x) => x.kind + ':' + x.readyState + ':' + x.muted), rs: v.readyState, p: v.paused, w: v.videoWidth, n: document.querySelectorAll('.plc-quadro video').length }); })); await pc.screenshot({ path: path.join(saida, 'debug-nativo.png') }); throw e; });
    await pc.waitForTimeout(15000);
    const pedidos = (await admin.from('logistica_camera_sinais').select('id').eq('camera_id', cam.id).eq('tipo', 'pedido')).data.length;
    if (pedidos > 2) console.log('DEBUG envio', JSON.stringify(await nat.evaluate(async () => { const out = []; for (const [k, pc] of window.__pcs) { const o = [k.slice(0, 6), pc.connectionState]; (await pc.getStats()).forEach((r) => { if (r.type === 'outbound-rtp') o.push('sent=' + r.bytesSent + ' frames=' + r.framesEncoded + ' lim=' + r.qualityLimitationReason); if (r.type === 'media-source') o.push('src fps=' + r.framesPerSecond); }); out.push(o); } return out; })));
    assert.ok(pedidos <= 2, 'a central não fica reconectando à toa: ' + pedidos + ' pedidos');
    assert.ok(await pc.$eval(quadro + ' video', (v) => v.videoWidth > 0), 'vídeo continua chegando 15 s depois');
    console.log('ok 2b - conexão estável: ' + pedidos + ' pedido(s) de conexão em 15 s');
    const leg = await pc.textContent(quadro + ' .plc-tel');
    assert.match(leg, /Bateria 15%/); assert.match(leg, /43,5 °C/); assert.match(leg, /Wi-Fi boa/); assert.match(leg, /640×480 · 15 fps/); assert.match(leg, /tela apagada/);
    const alertas = await pc.textContent('#plcAlertas');
    assert.match(alertas, /bateria em 15%/); assert.match(alertas, /celular quente/);
    await pc.screenshot({ path: path.join(saida, '10-nativo-central.png') });
    console.log('ok 2 - central recebe o vídeo do "serviço nativo" e mostra:', leg.trim());
    console.log('ok 3 - alertas:', alertas.trim());
    assert.ok(await nat.evaluate(() => !window.__erro), 'nativo sem erro de sinal');

    // câmera indisponível: a central cobre a imagem (nunca imagem parada como ao vivo)
    await nat.evaluate(() => { window.__estado = 'camera_indisponivel'; window.__tel.motivo = 'Outro app usou a câmera'; return window.__ping(); });
    await pc.waitForFunction((q) => document.querySelector(q)?.dataset.situacao === 'camera_indisponivel', quadro, { timeout: 25000 });
    assert.match(await pc.textContent(quadro + ' .plc-msg'), /Outro app usou a câmera/);
    await pc.screenshot({ path: path.join(saida, '11-nativo-indisponivel.png') });
    const ev = ok(await admin.from('logistica_camera_eventos').select('tipo').eq('camera_id', cam.id));
    assert.ok(ev.some((e) => e.tipo === 'inicio') && ev.some((e) => e.tipo === 'camera_indisponivel'), 'eventos registrados: ' + ev.map((e) => e.tipo));
    const ac = ok(await admin.from('logistica_camera_acessos').select('usuario_id').eq('camera_id', cam.id));
    assert.ok(ac.length >= 1, 'acesso da central registrado');
    console.log('ok 4 - câmera indisponível cobre a imagem; eventos e acessos registrados');

    // qualidade (quem edita o planejamento)
    await pc.click('#plcQualidade'); await pc.selectOption('#plcQualidadeDlg [name="resolucao"]', '360p'); await pc.click('#plcQualidadeDlg [value="salvar"]');
    await pc.waitForFunction(() => !document.getElementById('plcQualidadeDlg').open);
    const novo = await nat.evaluate(() => window.__ping());
    assert.equal(novo.config.resolucao, '360p', 'o aparelho recebe a qualidade nova no batimento');
    await admin.from('logistica_camera_config').delete().eq('empresa_id', empresa);
    console.log('ok 5 - qualidade ajustada na central chega ao aparelho no batimento');

    // encerrar pelo aparelho
    await nat.evaluate(() => window.__encerrar());
    await pc.waitForFunction((id) => !document.querySelector('.plc-quadro[data-cam="' + id + '"]'), cam.id, { timeout: 30000 });
    assert.ok((await anon.rpc('camera_disp_ping', { p_token: cam.token })).error, 'depois de encerrar o token não vale mais');
    console.log('ok 6 - encerrar tira do ar e invalida o token do aparelho');

    // ---- tela do celular com a ponte do Android simulada
    const ctxCel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctxCel.addInitScript(([s, e]) => {
      localStorage.setItem('easyloc-auth', JSON.stringify(s)); localStorage.setItem('acervo_ultima_empresa', e); sessionStorage.setItem('empresa_id', e);
      window.__enviados = [];
      window.AcervoAndroid = { postMessage: (m) => { const d = JSON.parse(m); window.__enviados.push(d);
        const ev = (x) => setTimeout(() => window.dispatchEvent(new CustomEvent('acervo:camera', { detail: x })), 50);
        if (d.action === 'camera:status') ev(sessionStorage.getItem('__ativo') ? { nativo: true, ativo: true, estado: 'ao_vivo', rotulo: 'Ao vivo', inicio: Date.now() - 65000, assistindo: 2, detalhe: '', titulo: 'Câmera de Montador' } : { nativo: true, ativo: false, estado: 'parada', interrompida: false });
        if (d.action === 'camera:start') { sessionStorage.setItem('__ativo', '1'); ev({ nativo: true, ativo: true, estado: 'ao_vivo', rotulo: 'Ao vivo', inicio: Date.now(), assistindo: 0, detalhe: '', titulo: d.titulo }); }
        if (d.action === 'camera:stop') { sessionStorage.removeItem('__ativo'); ev({ nativo: true, ativo: false, estado: 'parada' }); }
      } };
    }, [sessao, empresa]);
    const cel = await ctxCel.newPage(); cel.on('pageerror', (e) => erros.push('celular: ' + e.message));
    await cel.goto(BASE + 'Modulos/Logistica/CameraApp/camera.html?app=1');
    await cel.waitForSelector('#cmPermissao:not([hidden])', { timeout: 30000 });
    assert.match(await cel.textContent('#cmPermissao'), /Pode apagar a tela/);
    await cel.click('#cmComecar');
    await cel.waitForSelector('#cmNativo:not([hidden]) .cm-nativo-tempo', { timeout: 20000 });
    const inicio = await cel.evaluate(() => window.__enviados.find((d) => d.action === 'camera:start'));
    assert.match(inicio.token, /^[A-Za-z0-9_-]{43}$/); assert.equal(inicio.config.resolucao, '480p');
    assert.equal(await cel.isVisible('#cmPermissao'), false, 'com o nativo ligado, a tela de ligar some');
    assert.equal(await cel.$$eval('video', (l) => l.filter((v) => v.srcObject).length), 0, 'no app Android a página não abre a câmera');
    await cel.screenshot({ path: path.join(saida, '12-app-android-transmitindo.png') });
    await cel.click('#cmNativoEncerrar'); await cel.click('#cmConfirmar button[value="sim"]');
    await cel.waitForSelector('#cmPermissao:not([hidden])', { timeout: 10000 });
    console.log('ok 7 - tela do celular no app Android: liga pelo serviço nativo, mostra o estado e encerra');

    // barra nas outras telas do app
    await cel.evaluate(() => { sessionStorage.setItem('__ativo', '1'); });
    await cel.goto(BASE + 'app.html');
    await cel.waitForSelector('.cam-barra:not([hidden])', { timeout: 30000 });
    assert.match(await cel.textContent('.cam-barra'), /Ao vivo · 2 vendo/);
    await cel.screenshot({ path: path.join(saida, '13-app-barra.png') });
    console.log('ok 8 - barra da transmissão aparece nas telas do app:', (await cel.textContent('.cam-barra')).trim());

    // Android pelo navegador (sem o app): convite para baixar o aplicativo
    const ctxAnd = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' });
    await ctxAnd.addInitScript(([s, e]) => { localStorage.setItem('easyloc-auth', JSON.stringify(s)); localStorage.setItem('acervo_ultima_empresa', e); sessionStorage.setItem('empresa_id', e); sessionStorage.setItem('versao_app', '1'); }, [sessao, empresa]);
    const and = await ctxAnd.newPage(); and.on('pageerror', (e) => erros.push('android: ' + e.message));
    await and.goto(BASE + 'Modulos/Logistica/CameraApp/camera.html?app=1');
    await and.waitForSelector('#cmBaixarApp:not([hidden])', { timeout: 30000 });
    assert.match(await and.getAttribute('#cmBaixarApp', 'href'), /instalar\.html$/);
    await and.click('#cmBaixarApp');
    await and.waitForSelector('#baixar:not([hidden])', { timeout: 15000 });
    assert.match(await and.getAttribute('#baixar', 'href'), /downloads\/chiavari\.apk$/);
    assert.match(await and.textContent('#versao'), /1\.1\.0/);
    await and.screenshot({ path: path.join(saida, '14-instalar.png') });
    const apk = await (await fetch(BASE + 'downloads/chiavari.apk')).arrayBuffer();
    assert.ok(apk.byteLength > 5e6 && Buffer.from(apk).subarray(0, 2).toString() === 'PK', 'o APK é servido');
    await and.goto(BASE + 'app.html#config');
    await and.waitForSelector('#apBaixarAndroid:not([hidden])', { timeout: 30000 });
    await and.screenshot({ path: path.join(saida, '15-ajustes-baixar.png') });
    assert.equal(await cel.$('#apBaixarAndroid:not([hidden])'), null, 'dentro do app o convite não aparece');
    console.log('ok 9 - Android pelo navegador: link para baixar o app na Câmera ao vivo e em Ajustes; página de instalação com o APK');

    // limpa a câmera criada pela tela do celular
    await admin.from('logistica_cameras').delete().eq('usuario_id', usuario);
    assert.deepEqual(erros, [], 'sem erros de JavaScript: ' + erros.join(' | '));
    console.log('ok - tudo certo');
  } finally {
    if (browser) await browser.close();
    srv.close();
    if (usuario) {
      await admin.from('logistica_cameras').delete().eq('usuario_id', usuario);
      await admin.from('usuarios_empresas').delete().eq('user_id', usuario);
      await admin.from('usuarios').delete().eq('id', usuario);
      await admin.auth.admin.deleteUser(usuario);
    }
  }
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
