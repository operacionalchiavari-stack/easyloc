/* Voz para reuniões (nov/2026). Grava uma amostra curta da voz da pessoa (3 a 9 s lendo uma frase) para a IA das
   Reuniões reconhecer quem fala pelo nome. Guardada no bucket privado "reunioes" em <empresa>/vozes/<funcionário>-<data>.
   Quem pode: a própria pessoa e quem edita funcionários (conferido no banco: reuniao_voz_salvar).
   Uso: EasyLocVoz.montar(elemento, { client, empresaId, funcionarioId, nome, onChange }) */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 9, MIN = 3;
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  let estilo = false;
  function css() {
    if (estilo) return; estilo = true;
    const s = document.createElement('style');
    s.textContent = `
.vz{border:1px solid #e3e7ec;border-radius:16px;background:linear-gradient(135deg,#fff,#f7f9fb);padding:16px 18px;display:grid;gap:12px;font-family:Inter,system-ui,sans-serif;color:#1f2020}
.vz-topo{display:flex;align-items:center;gap:12px}
.vz-ic{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#eaf0fa;color:#123f86;flex:none}
.vz-ic svg{width:21px;height:21px}.vz.ok .vz-ic{background:#e6f4ea;color:#1f7a44}
.vz-tit{display:grid;gap:2px;flex:1;min-width:0}.vz-tit strong{font-size:14.5px;font-weight:600}.vz-tit small{font-size:12.5px;color:#6b6b6b;line-height:1.4}
.vz-acoes{display:flex;flex-wrap:wrap;gap:8px}
.vz button{font:inherit;font-size:13px;border-radius:999px;padding:7px 14px;cursor:pointer;border:1px solid #123f86;background:#fff;color:#1f2020}
.vz button.vz-pri{background:#123f86;color:#fff}.vz button.vz-perigo{border-color:#d8b4b4;color:#9b2c2c}
.vz button:disabled{opacity:.55;cursor:default}
.vz-frase{background:#fff;border:1px dashed #c9d4e5;border-radius:12px;padding:12px 14px;font-size:15px;line-height:1.55;color:#2b3240}
.vz-frase em{font-style:normal;color:#123f86;font-weight:600}
.vz-grav{display:flex;align-items:center;gap:12px}
.vz-barras{display:flex;align-items:center;gap:3px;height:34px;flex:1}
.vz-barras i{flex:1;max-width:6px;border-radius:3px;background:#123f86;height:4px;transition:height .08s}
.vz-tempo{font-variant-numeric:tabular-nums;font-size:13px;color:#6b6b6b;min-width:64px;text-align:right}
.vz-ponto{width:10px;height:10px;border-radius:50%;background:#d93636;animation:vzp 1s infinite}
@keyframes vzp{50%{opacity:.25}}
.vz audio{width:100%;height:36px}
.vz-msg{font-size:12.5px;color:#9b2c2c}.vz-msg.ok{color:#1f7a44}`;
    document.head.appendChild(s);
  }
  function quando(d) { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return ''; } }

  function montar(el, o) {
    css();
    const st = { info: null, rec: null };
    const primeiro = String(o.nome || '').trim().split(/\s+/)[0] || 'eu';
    async function rpc(n, a) { const { data, error } = await o.client.rpc(n, a); if (error) throw error; return data; }
    async function carregar() {
      try { st.info = await rpc('reuniao_voz_obter', { p_empresa: o.empresaId, p_funcionario: o.funcionarioId }); }
      catch (e) { st.info = { erro: e.message }; }
      pintar();
    }
    function pintar(msg = '', ok = false) {
      const i = st.info || {};
      if (i.erro) { el.innerHTML = `<div class="vz"><div class="vz-msg">${esc(i.erro)}</div></div>`; return; }
      const pode = i.pode_editar;
      el.innerHTML = `<div class="vz ${i.tem_voz ? 'ok' : ''}">
        <div class="vz-topo"><span class="vz-ic">${ICONE}</span><span class="vz-tit"><strong>${i.tem_voz ? 'Voz cadastrada' : 'Voz para as reuniões'}</strong>
        <small>${i.tem_voz ? `Gravada em ${quando(i.atualizado_em)}. Nas reuniões, a ata mostra o que ${esc(primeiro)} falou pelo nome.` : 'Grave alguns segundos da voz para a IA reconhecer quem fala nas reuniões e colocar o nome certo na ata.'}</small></span></div>
        ${pode ? `<div class="vz-acoes">${i.tem_voz ? '<button type="button" data-vz="ouvir">Ouvir</button><button type="button" data-vz="gravar">Gravar de novo</button><button type="button" class="vz-perigo" data-vz="remover">Remover</button>' : '<button type="button" class="vz-pri" data-vz="gravar">Cadastrar a voz</button>'}</div>` : ''}
        <div data-vz-area></div>${msg ? `<div class="vz-msg ${ok ? 'ok' : ''}">${esc(msg)}</div>` : ''}</div>`;
    }
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-vz]'); if (!b) return;
      const acao = b.dataset.vz;
      if (acao === 'gravar') return telaGravar();
      if (acao === 'ouvir') {
        const { data } = await o.client.storage.from('reunioes').createSignedUrl(st.info.path, 300);
        el.querySelector('[data-vz-area]').innerHTML = data?.signedUrl ? `<audio controls autoplay src="${esc(data.signedUrl)}"></audio>` : '<div class="vz-msg">Não foi possível abrir a gravação.</div>';
        return;
      }
      if (acao === 'remover') {
        const sim = window.confirmarGlobal ? await window.confirmarGlobal('Remover a voz cadastrada? As próximas atas não vão reconhecer esta pessoa pelo nome.') : confirm('Remover a voz cadastrada?');
        if (!sim) return;
        try { const antigo = await rpc('reuniao_voz_excluir', { p_empresa: o.empresaId, p_funcionario: o.funcionarioId }); if (antigo) await o.client.storage.from('reunioes').remove([antigo]); await carregar(); o.onChange?.(false); }
        catch (err) { pintar(err.message); }
      }
    });

    function telaGravar() {
      const area = el.querySelector('[data-vz-area]');
      area.innerHTML = `<div class="vz-frase">Leia em voz alta, no seu tom normal:<br><em>“Olá, eu sou ${esc(primeiro)}. Estou cadastrando a minha voz para o sistema me reconhecer nas reuniões da equipe.”</em></div>
        <div class="vz-acoes"><button type="button" class="vz-pri" data-g="comecar">Começar a gravar</button><button type="button" data-g="cancelar">Cancelar</button></div>`;
      area.querySelector('[data-g="cancelar"]').onclick = () => { parar(false); pintar(); };
      area.querySelector('[data-g="comecar"]').onclick = comecar;
    }

    async function comecar() {
      const area = el.querySelector('[data-vz-area]');
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { area.insertAdjacentHTML('beforeend', '<div class="vz-msg">Este navegador não grava áudio.</div>'); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch { area.insertAdjacentHTML('beforeend', '<div class="vz-msg">Permita o uso do microfone para gravar.</div>'); return; }
      const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, tipo ? { mimeType: tipo } : {});
      const pedacos = []; const t0 = Date.now();
      mr.ondataavailable = (ev) => ev.data.size && pedacos.push(ev.data);
      const frase = area.querySelector('.vz-frase')?.outerHTML || '';
      area.innerHTML = `${frase}<div class="vz-grav"><span class="vz-ponto"></span><span class="vz-barras">${'<i></i>'.repeat(28)}</span><span class="vz-tempo">0,0 s</span></div>
        <div class="vz-acoes"><button type="button" class="vz-pri" data-g="concluir" disabled>Concluir</button><button type="button" data-g="cancelar">Cancelar</button></div>`;
      let ac, an, raf;
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume?.(); an = ac.createAnalyser(); an.fftSize = 64; ac.createMediaStreamSource(stream).connect(an); } catch { an = null; }
      const barras = [...area.querySelectorAll('.vz-barras i')]; const buf = an ? new Uint8Array(an.frequencyBinCount) : null;
      const loop = () => {
        const s = (Date.now() - t0) / 1000;
        const tempo = area.querySelector('.vz-tempo'); if (tempo) tempo.textContent = `${s.toFixed(1).replace('.', ',')} s`;
        const bt = area.querySelector('[data-g="concluir"]'); if (bt) bt.disabled = s < MIN;
        if (an) { an.getByteFrequencyData(buf); barras.forEach((b, i) => { b.style.height = `${4 + (buf[i % buf.length] / 255) * 30}px`; }); }
        if (s >= MAX) return parar(true);
        raf = requestAnimationFrame(loop);
      };
      st.rec = { mr, stream, pedacos, t0, ac, raf: () => cancelAnimationFrame(raf) };
      mr.start(500); loop();
      area.querySelector('[data-g="concluir"]').onclick = () => parar(true);
      area.querySelector('[data-g="cancelar"]').onclick = () => { parar(false); pintar(); };
    }

    function parar(usar) {
      const r = st.rec; if (!r) return; st.rec = null;
      r.raf(); try { r.ac?.close(); } catch {}
      const seg = (Date.now() - r.t0) / 1000;
      r.mr.onstop = () => {
        r.stream.getTracks().forEach((t) => t.stop());
        if (!usar) return;
        const blob = new Blob(r.pedacos, { type: r.mr.mimeType || 'audio/webm' });
        revisar(blob, Math.min(seg, MAX));
      };
      r.mr.stop();
    }

    function revisar(blob, seg) {
      const area = el.querySelector('[data-vz-area]');
      const url = URL.createObjectURL(blob);
      area.innerHTML = `<audio controls src="${url}"></audio><div class="vz-acoes"><button type="button" class="vz-pri" data-g="salvar">Salvar a voz</button><button type="button" data-g="denovo">Gravar de novo</button></div>`;
      area.querySelector('[data-g="denovo"]').onclick = telaGravar;
      area.querySelector('[data-g="salvar"]').onclick = async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Salvando…';
        try {
          const tipo = (blob.type || 'audio/webm').split(';')[0];
          const ext = tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : 'webm';
          const path = `${o.empresaId}/vozes/${o.funcionarioId}-${Date.now()}.${ext}`;
          const up = await o.client.storage.from('reunioes').upload(path, blob, { contentType: tipo, upsert: true });
          if (up.error) throw up.error;
          const antigo = await rpc('reuniao_voz_salvar', { p_empresa: o.empresaId, p_funcionario: o.funcionarioId, p_path: path, p_tipo: tipo, p_segundos: Math.round(seg * 10) / 10 });
          if (antigo) o.client.storage.from('reunioes').remove([antigo]);
          URL.revokeObjectURL(url);
          await carregar(); pintar('Voz salva. A partir de agora ela é reconhecida nas reuniões.', true); o.onChange?.(true);
        } catch (err) { b.disabled = false; b.textContent = 'Salvar a voz'; area.insertAdjacentHTML('beforeend', `<div class="vz-msg">${esc(err.message || err)}</div>`); }
      };
    }

    carregar();
    return { atualizar: carregar };
  }
  window.EasyLocVoz = { montar };
})();
