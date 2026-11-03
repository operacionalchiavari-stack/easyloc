(function () {
  "use strict";
  const fotos = new Map();
  window.pintarFotosDecoradores = function ({ sb, empresa, pedidos }) {
    const porId = new Map(pedidos.map(p => [String(p.id), p]));
    document.querySelectorAll('.separacao-order-card').forEach(card => {
      const pedido = porId.get(card.dataset.pedidoId || card.dataset.pedido);
      const linha = card.querySelector('.separacao-card-mainline');
      if (!pedido || !linha || linha.querySelector('.decorador-card-foto')) return;
      const nome = pedido.cliente_nome || 'Decorador';
      const avatar = document.createElement('span');
      avatar.className = 'decorador-card-foto';
      avatar.textContent = nome.trim().charAt(0).toUpperCase() || '?';
      const texto = document.createElement('div');
      texto.className = 'decorador-card-texto';
      texto.append(...linha.childNodes);
      linha.classList.add('com-foto-decorador');
      linha.append(avatar, texto);
      if (card.closest('.triagem-compacta')) {
        const progresso = card.querySelector('.separacao-card-progress');
        if (progresso) card.querySelector('.separacao-card-top')?.append(progresso);
        const liberar = card.querySelector('[data-separacao-action="liberar-retirada"], [data-separacao-action="reabrir-triagem"], .exp-reabrir');
        const nomeCliente = texto.querySelector('strong');
        if (liberar && nomeCliente) {
          const linhaNome = document.createElement('div');
          linhaNome.className = 'triagem-cliente-acao';
          nomeCliente.before(linhaNome);
          linhaNome.append(nomeCliente, liberar);
        }
      }

      const chave = JSON.stringify([empresa, pedido.cliente_id || null, pedido.cliente_id ? null : nome]);
      if (!fotos.has(chave)) fotos.set(chave, (async () => {
        let q = sb.from('clientes_empresas').select('catalogo_logo_url').eq('empresa_id', empresa);
        q = pedido.cliente_id ? q.eq('id', pedido.cliente_id) : q.eq('nome_razao', nome);
        const { data, error } = await q.limit(1);
        if (error) throw error;
        const url = data?.[0]?.catalogo_logo_url || '';
        return /^https?:\/\//i.test(url) ? url : '';
      })().catch(() => ''));
      fotos.get(chave).then(url => {
        if (!url || !avatar.isConnected) return;
        const img = document.createElement('img');
        img.alt = 'Foto de ' + nome;
        img.loading = 'lazy';
        img.onerror = () => img.remove();
        img.src = url;
        avatar.append(img);
      });
    });
  };
})();
