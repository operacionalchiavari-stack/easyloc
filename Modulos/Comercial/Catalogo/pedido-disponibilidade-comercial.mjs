const consultas = new WeakMap();

// Somente o editor do pedido comercial chama esta consulta. O PDF usa os dados originais.
export async function sinalizarDisponibilidade(host, projeto, ctx) {
  if (!ctx.pedidoComercial) return;
  const token = {};
  consultas.set(host, token);
  const pai = window.parent;
  const campo = id => pai.document.getElementById(id)?.value;
  const inicio = campo('dataEntrega') || campo('dataEvento');
  const fim = campo('dataColeta') || campo('dataEventoFim') || campo('dataEvento');
  if (!inicio || !fim || fim < inicio) return;
  const itens = (projeto.dados?.ambientes || []).flatMap(a => a.itens || [])
    .map(i => ({ item_id: i.item_id, quantidade_solicitada: Number(i.quantidade) || 1 }));
  if (!itens.length) return;
  const aviso = document.createElement('p');
  aviso.className = 'pedido-disponibilidade-aviso';
  aviso.setAttribute('role', 'status');
  host.prepend(aviso);
  aviso.textContent = 'Conferindo disponibilidade das peças…';
  try {
    const { data, error } = await ctx.supabase.rpc('pedido_disponibilidade_comercial', {
      p_empresa: ctx.getSession().empresa_id,
      p_pedido: pai.__PEDIDO_ATUAL_ID || null,
      p_itens: itens, p_inicio: inicio, p_fim: fim
    });
    if (consultas.get(host) !== token || !aviso.isConnected) return;
    if (error) throw error;
    const alertas = data || [];
    if (!alertas.length) { aviso.remove(); return; }
    aviso.classList.add('tem-falta');
    aviso.style.setProperty('color', '#b91c1c', 'important');
    aviso.textContent = 'Estoque insuficiente no período. Confira abaixo as peças que faltam antes de salvar.';
    const numero = v => Number(v).toLocaleString('pt-BR');
    for (const row of host.querySelectorAll('[data-pa-item]')) {
      const faltas = alertas.filter(a => a.origens.includes(row.dataset.paItem));
      if (!faltas.length) continue;
      row.classList.add('pedido-item-sem-estoque');
      const texto = document.createElement('div');
      texto.className = 'pedido-item-faltas';
      texto.style.setProperty('color', '#b91c1c', 'important');
      for (const a of faltas) {
        const linha = document.createElement('p');
        linha.style.setProperty('color', '#b91c1c', 'important');
        linha.textContent = `${a.descricao}: necessário ${numero(a.necessario)}, disponível ${numero(a.disponivel)}. Faltam ${numero(a.faltante)} unidade(s).`;
        texto.append(linha);
      }
      row.querySelector('.pa-descricao')?.append(texto);
    }
  } catch (error) {
    if (consultas.get(host) !== token || !aviso.isConnected) return;
    aviso.classList.add('tem-falta');
    aviso.style.setProperty('color', '#b91c1c', 'important');
    aviso.textContent = `Não foi possível conferir o estoque: ${error.message || 'tente novamente'}`;
  }
}
