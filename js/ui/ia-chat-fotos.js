// Fotos em cada mensagem dos chats de IA (21/11/2026). Pedido do usuário: "em cada mensagem enviada por mim e por ela
// precisa da nossa foto". Um ajudante só para todos os chats (menos a Helena do catálogo): observa as áreas de mensagens
// e põe, ao lado de cada balão, a foto da IA (a mesma do cabeçalho .ia-topo) ou a foto de quem está usando
// (foto da conta: avatares/<empresa>/<usuário>.jpg; sem foto, as iniciais). Os chats continuam redesenhando as mensagens
// do jeito deles; este arquivo só acrescenta as fotos depois.
(function () {
  'use strict';
  if (window.__iaChatFotos) return; window.__iaChatFotos = true;
  // Chats em que o balão é a própria mensagem: o balão é envolvido por uma linha com a foto.
  const ENVOLVER = '.ch-coluna > .ch-msg, .as-msgs > .as-msg, .as-msgs > .as-resumo, .ideia-chat-msgs > .ideia-msg, .ideia-chat-msgs > .ideia-resumo';
  // Chats que já têm a foto da IA dentro da mensagem: só falta a foto de quem pergunta.
  const SO_EU = '.cora-msg.eu, .ag-msg.eu';
  const ehEu = el => el.matches('.is-eu, .pessoa, .eu');
  let eu = null; // { foto, iniciais }
  const iniciais = n => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'EU';
  function carregar(url) { return new Promise(ok => { if (!url) return ok(false); const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = url; }); }
  async function quemSouEu() {
    if (eu) return eu;
    const nome = window.__CONTEXT?.usuario_nome || sessionStorage.getItem('usuario_nome') || '';
    eu = { foto: '', iniciais: iniciais(nome) };
    try {
      const sb = window.supabaseClient; if (!sb) return eu;
      const { data } = await sb.auth.getSession(); const uid = data?.session?.user?.id;
      const emp = window.__CONTEXT?.empresa_id || sessionStorage.getItem('empresa_id') || localStorage.getItem('acervo_ultima_empresa');
      if (uid && emp) {
        const url = sb.storage.from('avatares').getPublicUrl(emp + '/' + uid + '.jpg').data?.publicUrl;
        if (await carregar(url)) eu.foto = url;
      }
      if (!nome) { const n = data?.session?.user?.user_metadata?.nome || data?.session?.user?.email || ''; eu.iniciais = iniciais(String(n).split('@')[0]); }
    } catch (_) {}
    document.querySelectorAll('.ia-msg-foto.is-eu').forEach(pintarEu);
    return eu;
  }
  function pintarEu(span) {
    if (!eu) return;
    span.innerHTML = eu.foto ? '<img src="' + eu.foto + '" alt="">' : '<b>' + eu.iniciais + '</b>';
  }
  function fotoIa(el) {
    const raiz = el.closest('.ch-tela, .cora-chat, .as-dialog, .ideia-chat, body') || document;
    return raiz.querySelector('.ia-topo-foto img')?.getAttribute('src') || '';
  }
  function criarFoto(el, souEu) {
    const span = document.createElement('span');
    span.className = 'ia-msg-foto ' + (souEu ? 'is-eu' : 'is-ia');
    span.setAttribute('aria-hidden', 'true');
    if (souEu) pintarEu(span); else { const src = fotoIa(el); span.innerHTML = src ? '<img data-ia-foto src="' + src + '" alt="">' : ''; }
    return span;
  }
  function tratar(el) {
    if (el.dataset.iaFoto) return; el.dataset.iaFoto = '1';
    const souEu = ehEu(el);
    if (el.matches(SO_EU)) { el.append(criarFoto(el, true)); return; }
    const linha = document.createElement('div');
    linha.className = 'ia-linha ' + (souEu ? 'is-eu' : 'is-ia');
    el.before(linha); linha.append(criarFoto(el, souEu), el);
  }
  function varrer(raiz) {
    if (!(raiz instanceof Element)) return;
    if (raiz.matches(ENVOLVER + ',' + SO_EU)) tratar(raiz);
    raiz.querySelectorAll(ENVOLVER + ',' + SO_EU).forEach(tratar);
  }
  new MutationObserver(lista => { for (const m of lista) m.addedNodes.forEach(varrer); }).observe(document.documentElement, { childList: true, subtree: true });
  const comecar = () => { varrer(document.body); quemSouEu(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comecar); else comecar();
})();
