/* Solicitações com assistente (nov/2026): "+ Nova solicitação" abre uma conversa com a especialista (compras ou
   manutenção, Edge Function solicitacao-assistente). Ela pergunta até entender, mostra o resumo, a pessoa confirma e a
   tela grava pela mesma RPC do formulário antigo (que continua como alternativa: "Preencher o formulário").
   Uso: EasyLocAssistenteSolicitacao.abrir({ tipo, titulo, assistente, saudacao(nome), resumoHtml(r, esc), confirmar(r),
   formulario() }). A conversa fica na aba do navegador (sessionStorage) até ser enviada ou recomeçada. */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fotosAgentes = document.currentScript?.src ? new URL("../../assets/agentes/", document.currentScript.src) : new URL("/assets/agentes/", location.href);
  const fotoAgente = () => { const id = ({compra:"carla",manutencao:"marcos",separacao:"miguel",montagem:"montagem",ideia:"ideia"})[S.cfg.tipo]; return id ? '<img data-ia-foto width="512" height="512" loading="eager" src="' + new URL(id + ".jpg", fotosAgentes).href + '" alt="" decoding="sync">' : esc(S.cfg.icone || "✦"); };
  const ICONE = {
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    clipe: '<svg viewBox="0 0 24 24"><path d="M21 12.5 12.6 21a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>',
    enviar: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  };
  const S = { cfg: null, ctx: null, msgs: [], resumo: null, enviando: false, gravador: null, pedacos: [], inicio: 0, relogio: 0, cancelada: false, dlg: null };
  const $ = (sel) => S.dlg.querySelector(sel);
  const chave = () => "solic_chat:" + S.cfg.tipo + ":" + (S.ctx?.empresa_id || "") + ":" + (S.ctx?.usuario_id || "") + (S.cfg.chave ? ":" + S.cfg.chave : "");
  const primeiroNome = () => String(S.ctx?.usuario_nome || "").trim().split(/\s+/)[0] || "";

  function guardar() { if(S.cfg.persistir===false)return;try { sessionStorage.setItem(chave(), JSON.stringify({ msgs: S.msgs.filter(m=>!m.provisorio), resumo: S.resumo })); } catch (_) {} }
  function recuperar() {
    try { const d = JSON.parse(sessionStorage.getItem(chave()) || "null"); if (d && Array.isArray(d.msgs) && d.msgs.length) { S.msgs = d.msgs; S.resumo = d.resumo || null; return true; } } catch (_) {}
    return false;
  }

  function montar(host) {
    if (!host) S.dlg?.remove();
    const d = document.createElement(host ? "section" : "dialog");
    d.className = host ? "as-dialog as-inline" : "as-dialog";
    d.setAttribute("aria-label", S.cfg.titulo);
    d.innerHTML =
      '<header class="as-topo ia-topo"><span class="as-avatar ia-topo-foto" aria-hidden="true">' + fotoAgente() + '</span><div class="ia-topo-texto"><strong>' + esc(S.cfg.assistente) + '</strong><small><i class="ia-topo-dot" aria-hidden="true"></i><span>' + esc(S.cfg.titulo) + '</span></small></div>' +
      '<div class="as-topo-acoes ia-topo-acoes"><button type="button" class="as-link ia-topo-btn" data-as="recomecar" title="Começar de novo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg><span>Começar de novo</span></button>' + (host ? "" : '<button type="button" class="as-fechar ia-topo-btn is-icone" data-as="fechar" aria-label="Fechar">×</button>') + '</div></header>' +
      '<div class="as-msgs" aria-live="polite"></div>' +
      '<div class="as-gravando" hidden><span class="as-rec"></span>Gravando <b data-as="tempo">0:00</b><button type="button" class="as-link" data-as="cancelar-rec">Cancelar</button></div>' +
      '<form class="as-campo"><button type="button" class="as-icone" data-as="clipe" title="Enviar um arquivo de áudio" aria-label="Enviar um arquivo de áudio">' + ICONE.clipe + '</button>' +
      '<input type="file" accept="audio/*" hidden data-as="arquivo">' +
      '<button type="button" class="as-icone" data-as="foto" title="Enviar foto" aria-label="Enviar foto">' + ICONE.camera + '</button>' +
      '<input type="file" accept="image/*" multiple hidden data-as="arquivo-foto">' +
      '<textarea rows="1" placeholder="Escreva aqui ou grave um áudio…" aria-label="Sua mensagem"></textarea>' +
      '<button type="button" class="as-icone" data-as="mic" title="Gravar áudio" aria-label="Gravar áudio">' + ICONE.mic + '</button>' +
      '<button type="submit" class="as-enviar" aria-label="Enviar">' + ICONE.enviar + '</button></form>' +
      (S.cfg.formulario ? '<p class="as-rodape"><button type="button" class="as-link" data-as="formulario">Prefiro preencher o formulário</button></p>' : "");
    if (host) { host.innerHTML = ""; host.appendChild(d); } else document.body.appendChild(d);
    S.dlg = d;
    if(S.cfg.recomecar===false)$('[data-as="recomecar"]').hidden=true;
    if(S.cfg.acoesHtml){const barra=document.createElement('div');barra.className='as-contexto';barra.innerHTML=S.cfg.acoesHtml;$('.as-msgs').before(barra);barra.addEventListener('click',e=>S.cfg.acao?.(e,d));barra.addEventListener('change',e=>S.cfg.acao?.(e,d));}
    if(S.cfg.anexos===false)$('[data-as="foto"]').hidden=true;
    const texto = $("textarea");
    $("form").addEventListener("submit", (e) => { e.preventDefault(); const v = texto.value; if(!v.trim()||S.enviando||S.gravador||S.cfg.somenteLeitura)return;texto.value = ""; texto.style.height = ""; enviarTexto(v); });
    texto.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); } });
    texto.addEventListener("input", () => { texto.style.height = "auto"; texto.style.height = Math.min(texto.scrollHeight, 150) + "px"; });
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-as]"); const a = b?.dataset.as;
      if(S.enviando && ["recomecar","nova","fechar"].includes(a))return;
      if (a === "fechar") fechar();
      else if (a === "recomecar") recomecar();
      else if (a === "mic") (S.gravador ? parar() : gravar());
      else if (a === "cancelar-rec") { S.cancelada = true; parar(); }
      else if (a === "clipe") $('[data-as="arquivo"]').click();
      else if (a === "foto") $('[data-as="arquivo-foto"]').click();
      else if (a === "formulario") { fechar(); S.cfg.formulario(); }
      else if (a === "nova") recomecar();
      else if (a === "ver-lista") S.cfg.verLista?.();
      else if (a === "aprovar") aprovar();
      else if (a === "ajustar") { texto.placeholder = "Diga o que quer mudar no resumo…"; texto.focus(); }
    });
    $('[data-as="arquivo"]').addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) transcrever(f); });
    $('[data-as="arquivo-foto"]').addEventListener("change", (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) enviarFotos(fs); });
    d.addEventListener("cancel", (e) => { if(S.enviando)e.preventDefault(); if (S.gravador) { e.preventDefault(); S.cancelada = true; parar(); } });
    d.addEventListener("close", () => { if (S.dlg===d&&S.gravador) { S.cancelada = true; parar(); } });
    const aoFechar=S.cfg.aoFechar;d.addEventListener('close',()=>aoFechar?.(),{once:true});
    if(!host)d.addEventListener('close',()=>d.remove(),{once:true});
  }

  function bolha(m) {
    if (m.tipo === "resumo") {
      return '<div class="as-resumo' + (m.enviado ? " enviado" : "") + '"><span class="as-eyebrow">Confira o resumo</span>' + S.cfg.resumoHtml(m.resumo, esc) +
        fotosHtml(todasFotos(), "Fotos anexadas") +
        (m.enviado ? '<p class="as-ok">✓ Registrada</p>' : '<footer><button type="button" class="as-link" data-as="ajustar">Quero ajustar</button><button type="button" class="btn btn-primary" data-as="aprovar">'+esc(S.cfg.rotuloConfirmacao||'Está certo, registrar')+'</button></footer>') + "</div>";
    }
    if (m.tipo === "ok") return '<div class="as-msg ia as-msg-ok"><p>' + esc(m.texto) + '</p><div class="as-ok-acoes">' + (S.cfg.verLista ? '<button type="button" class="as-link" data-as="ver-lista">Ver minhas solicitações</button>' : "") + '<button type="button" class="as-link" data-as="nova">'+esc(S.cfg.rotuloNova||'Fazer outra solicitação')+'</button></div></div>';
    return '<div class="as-msg ' + (m.papel === "ia" ? "ia" : "pessoa") + (m.erro ? " erro" : "") + '">' + (m.autor?'<small class="as-autor">'+esc(m.autor)+'</small>':'') + (m.audio ? '<span class="as-audio">🎙 Áudio</span>' : "") + fotosHtml(m.fotos) + (m.texto ? "<p>" + esc(m.texto) + "</p>" : "") + (m.autor&&m.em?'<small class="as-data">'+esc(new Date(m.em).toLocaleString('pt-BR'))+'</small>':'') + "</div>";
  }
  function pintar(digitando) {
    const host = $(".as-msgs");
    host.innerHTML = S.msgs.map(bolha).join("") + (digitando ? '<div class="as-msg ia as-digitando" aria-label="A assistente está escrevendo"><span></span><span></span><span></span></div>' : "");
    host.scrollTop = host.scrollHeight;
    const ocupado = S.enviando || !!S.gravador || S.cfg.somenteLeitura;
    $(".as-enviar").disabled = ocupado; $('[data-as="mic"]').disabled = S.enviando; $('[data-as="clipe"]').disabled = ocupado; $('[data-as="foto"]').disabled = ocupado;
    if(S.cfg.somenteLeitura){$('textarea').disabled=true;$('[data-as="mic"]').disabled=true;}
  }

  async function chamar(corpo) {
    const { data, error } = await window.supabaseClient.functions.invoke(S.cfg.funcao || "solicitacao-assistente", { body: { empresa_id: S.ctx.empresa_id, tipo: S.cfg.tipo, ...(S.cfg.dados||{}), ...corpo } });
    if (error) {
      let msg = "";
      try { msg = (await error.context?.json?.())?.erro || ""; } catch (_) {}
      throw new Error(msg || "A assistente não respondeu. Tente de novo em instantes.");
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  async function enviarTexto(texto, audio, fotos) {
    texto = String(texto || "").trim();
    if ((!texto && !fotos?.length) || S.enviando || S.cfg.somenteLeitura) return;
    const dlg=S.dlg;
    if(["separacao","montagem"].includes(S.cfg.tipo)){S.resumo=null;S.msgs=S.msgs.filter(m=>m.tipo!=="resumo"||m.enviado);}
    S.msgs.push({ papel: "pessoa", em:new Date().toISOString(), texto, audio: !!audio, ...(fotos?.length ? { fotos } : {}) });
    S.enviando = true; guardar(); pintar(true);
    try {
      if(S.cfg.enviarMensagem){const msgs=await S.cfg.enviarMensagem(texto);if(S.dlg===dlg&&msgs)S.msgs=msgs;return;}
      const historico = S.msgs.filter((m) => !m.tipo && !m.erro && !m.provisorio).map((m) => ({ papel: m.papel, texto: m.texto, ...(m.fotos ? { fotos: m.fotos } : {}) }));
      const r = await chamar({ acao: "conversar", mensagens: historico });
      if(S.dlg!==dlg)return;
      S.msgs.push({ papel: "ia", em:new Date().toISOString(), texto: r.resposta });
      if (r.pronto && r.resumo) { S.resumo = r.resumo; S.msgs.push({ tipo: "resumo", resumo: r.resumo }); }
    } catch (e) {
      if(S.dlg!==dlg)return;
      if(S.cfg.enviarMensagem){S.msgs.pop();$('textarea').value=texto;aviso('Não foi possível enviar a mensagem: '+e.message);return;}
      S.msgs.push({ papel: "ia", texto: "Não consegui responder agora (" + e.message + "). Pode mandar de novo?", erro: true });
    } finally { if(S.dlg===dlg){S.enviando = false; guardar(); pintar(false);if($("textarea").getClientRects().length)$("textarea").focus();} }
  }

  async function aprovar() {
    if (!S.resumo || S.enviando) return;
    const dlg=S.dlg;
    S.enviando = true; pintar(false);
    const botao = S.dlg.querySelector('[data-as="aprovar"]'); if (botao) { botao.disabled = true; botao.textContent = "Registrando…"; }
    try {
      const msg = await S.cfg.confirmar(S.resumo, todasFotos(), {mensagens:S.msgs.filter(m=>!m.tipo&&!m.erro&&!m.provisorio).map(m=>({papel:m.papel,texto:m.texto||"",em:m.em||null}))});
      if(S.dlg!==dlg)return;
      const ultimo = [...S.msgs].reverse().find((m) => m.tipo === "resumo"); if (ultimo) ultimo.enviado = true;
      S.msgs.push({ tipo: "ok", texto: msg || "Pronto! Sua solicitação foi registrada." });
      S.resumo = null;
      try { sessionStorage.removeItem(chave()); } catch (_) {}
      S.enviando = false; pintar(false);
      return;
    } catch (e) {
      if(S.dlg!==dlg)return;
      S.msgs.push({ papel: "ia", texto: "Não consegui registrar agora (" + (e.message || e) + "). Tente de novo.", erro: true });
    }
    S.enviando = false; guardar(); pintar(false);
  }

  function recomecar() {
    if (S.gravador) { S.cancelada = true; parar(); }
    S.cfg.aoRecomecar?.();
    S.msgs = [{ papel: "ia", texto: S.cfg.saudacao(primeiroNome()) }]; S.resumo = null; guardar(); pintar(false);
    const t = $("textarea"); t.value = ""; t.placeholder = "Escreva aqui ou grave um áudio…"; t.focus();
  }

  /* ---------- áudio ---------- */
  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { aviso("Este navegador não grava áudio. Grave no celular e use o clipe para enviar o arquivo."); return; }
    const dlg=S.dlg;let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { if(S.dlg===dlg)aviso("Permita o uso do microfone para gravar."); return; }
    if(S.dlg!==dlg){stream.getTracks().forEach(t=>t.stop());return;}
    const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 });
    S.pedacos = []; S.cancelada = false; S.gravador = mr; S.inicio = Date.now();
    const pedacos=S.pedacos;
    mr.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if(S.dlg!==dlg)return;
      clearInterval(S.relogio); S.gravador = null;
      if (S.dlg) { $(".as-gravando").hidden = true; $('[data-as="mic"]').classList.remove("gravando"); pintar(false); }
      const blob = new Blob(pedacos, { type: mr.mimeType || "audio/webm" });
      if (!S.cancelada) transcrever(blob);
    };
    mr.start(1000);
    $(".as-gravando").hidden = false; $('[data-as="mic"]').classList.add("gravando");
    const tic = () => { const s = Math.floor((Date.now() - S.inicio) / 1000); $('[data-as="tempo"]').textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); if (s >= 180) parar(); };
    tic(); S.relogio = setInterval(tic, 500); pintar(false);
  }
  function parar() { if (S.gravador && S.gravador.state !== "inactive") S.gravador.stop(); }

  async function transcrever(blob) {
    const dlg=S.dlg;
    if (!blob || blob.size < 800) { aviso("O áudio ficou curto demais. Fale um pouco mais."); return; }
    if (blob.size > 12 * 1024 * 1024) { aviso("O áudio é grande demais. Mande em partes de até 3 minutos."); return; }
    S.enviando = true; S.msgs.push({ papel: "pessoa", texto: "…", audio: true, provisorio: true }); pintar(true);
    try {
      const dataUrl = await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = erro; fr.readAsDataURL(blob); });
      if(S.dlg!==dlg)return;
      const r = await chamar({ acao: "transcrever", audio: String(dataUrl).replace(/^data:([^;,]+)[^,]*,/, (m, t) => "data:" + (t.startsWith("audio/") ? t : "audio/webm") + ";base64,") });
      if(S.dlg!==dlg)return;
      S.msgs = S.msgs.filter((m) => !m.provisorio); S.enviando = false;
      await enviarTexto(r.texto, true);
    } catch (e) {
      if(S.dlg!==dlg)return;
      S.msgs = S.msgs.filter((m) => !m.provisorio); S.enviando = false;
      aviso("Não consegui entender o áudio (" + e.message + "). Pode mandar de novo ou escrever?");
    }
  }
  /* ---------- fotos de evidência: JPEG de até 1600px no bucket solicitacoes-evidencias/<empresa>/<usuário>/ ---------- */
  function todasFotos() { return S.msgs.flatMap((m) => (Array.isArray(m.fotos) ? m.fotos : [])).slice(0, 12); }
  function fotosHtml(lista, titulo) {
    if (!lista || !lista.length) return "";
    return (titulo ? '<span class="as-fotos-titulo">' + esc(titulo) + "</span>" : "") + '<div class="as-fotos">' +
      lista.map((u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Foto enviada" loading="lazy"></a>').join("") + "</div>";
  }
  async function paraJpeg(arquivo) {
    const bmp = await createImageBitmap(arquivo);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("Não foi possível ler a foto."))), "image/jpeg", 0.85));
  }
  async function enviarFotos(arquivos) {
    if (S.enviando) return;
    const dlg=S.dlg;
    if (todasFotos().length + arquivos.length > 12) { aviso("Dá para mandar até 12 fotos por solicitação."); return; }
    const imagens = arquivos.filter((f) => /^image\//.test(f.type));
    if (!imagens.length) { aviso("Envie uma foto (JPG, PNG ou WebP)."); return; }
    S.enviando = true; S.msgs.push({ papel: "pessoa", texto: "Enviando foto…", provisorio: true }); pintar(false);
    const sb = window.supabaseClient; const urls = [];
    try {
      let uid = S.ctx.usuario_id;
      if (!uid) { const r = await sb.auth.getUser(); uid = r?.data?.user?.id; }
      if(S.dlg!==dlg)return;
      for (const f of imagens.slice(0, 4)) {
        const blob = await paraJpeg(f);
        if(S.dlg!==dlg)return;
        const caminho = S.ctx.empresa_id + "/" + uid + "/" + (crypto.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2)) + ".jpg";
        if(S.cfg.enviarFoto){urls.push(await S.cfg.enviarFoto(blob,caminho));continue;}
        const { error } = await sb.storage.from("solicitacoes-evidencias").upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        urls.push(sb.storage.from("solicitacoes-evidencias").getPublicUrl(caminho).data.publicUrl);
      }
    } catch (e) {
      if(S.dlg!==dlg)return;
      S.msgs = S.msgs.filter((m) => !m.provisorio); S.enviando = false;
      aviso("Não consegui enviar a foto (" + (e.message || e) + "). Tente de novo."); return;
    }
    if(S.dlg!==dlg)return;
    S.msgs = S.msgs.filter((m) => !m.provisorio); S.enviando = false;
    const t = $("textarea"); const legenda = t.value; t.value = ""; t.style.height = "";
    await enviarTexto(legenda, false, urls);
  }
  function aviso(t) { S.msgs.push({ papel: "ia", texto: t, erro: true }); guardar(); pintar(false); }

  function fechar() { if (S.dlg?.open) S.dlg.close(); }

  function desmontar(host){
    if(!S.dlg||(host&&!host.contains(S.dlg)))return;
    guardar();
    if(S.gravador){S.cancelada=true;parar();}
    S.gravador=null;
    clearInterval(S.relogio);
    const antigo=S.dlg;S.dlg=null;antigo.remove();
  }

  async function abrir(cfg, host) {
    if(S.dlg?.open)S.dlg.close();
    S.cfg = cfg; S.ctx=null; S.resumo=null; S.msgs=[]; S.enviando=false;
    try { S.ctx = cfg.ctx || await window.aguardarContexto(); } catch (_) {}
    if (!S.ctx?.empresa_id) { window.alerta?.("Não foi possível identificar a empresa.", cfg.titulo, "erro"); return; }
    montar(host);
    if(cfg.mensagens)S.msgs=cfg.mensagens;
    else if (!recuperar()) S.msgs = cfg.mensagensIniciais?.length ? cfg.mensagensIniciais : [{ papel: "ia", texto: cfg.saudacao(primeiroNome()) }];
    if(cfg.placeholder)$("textarea").placeholder=cfg.placeholder;
    pintar(false);
    if (!host) { S.dlg.showModal(); $("textarea").focus(); }
    return S.dlg;
  }
  /* Nov/2026: na tela (duas colunas, como a Ideia Premiada) a conversa fica sempre aberta dentro de `host`. */
  const montarNaTela = (host, cfg) => abrir(cfg, host);
  window.EasyLocAssistenteSolicitacao = { abrir, montarNaTela, fechar, desmontar, atualizarMensagens:(dlg,msgs,somenteLeitura)=>{if(S.dlg!==dlg||S.enviando||S.gravador)return;const log=$('.as-msgs'),fim=log.scrollHeight-log.scrollTop-log.clientHeight<60,scroll=log.scrollTop;S.msgs=msgs;S.cfg.somenteLeitura=somenteLeitura;pintar(false);if(!fim)log.scrollTop=scroll;}, focar: () => S.dlg?.querySelector("textarea")?.focus() };
})();
