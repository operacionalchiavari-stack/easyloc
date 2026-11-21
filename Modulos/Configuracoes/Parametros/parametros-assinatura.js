/* Parâmetros > Comercial > Assinatura da empresa (15/11/2026, saiu da tela Modelos de contrato).
   Grava em contratos_assinaturas_empresa (nome de quem assina + imagem PNG/JPG reduzida em data URL), usada
   automaticamente nos contratos de todos os modelos (js/core/contracts.mjs). */
(function () {
  'use strict';
  window.carregarParametrosAssinatura = async (host, empresa) => {
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false, dis = pode ? '' : ' disabled';
    const card = document.createElement('section');
    card.className = 'pr-card pr-assinatura';
    card.innerHTML = '<h3>Assinatura da empresa</h3><p class="pr-ajuda">Salve uma imagem da assinatura para usar automaticamente nos contratos de todos os modelos.</p>' +
      '<div class="pr-ass-campos"><label>Nome de quem assina <input class="el-input" id="prAssNome" maxlength="200" placeholder="Nome do representante da empresa"' + dis + '></label>' +
      '<label>Imagem da assinatura (PNG ou JPG) <input id="prAssArquivo" type="file" accept="image/png,image/jpeg"' + dis + '></label></div>' +
      '<img id="prAssPreview" alt="Assinatura cadastrada da empresa" hidden style="max-width:320px;max-height:120px;margin:10px 0;border:1px dashed #d7dde4;border-radius:8px;padding:6px;background:#fff">' +
      '<div class="pr-acoes"><button type="button" class="btn primary" id="prAssSalvar"' + dis + '>Salvar assinatura da empresa</button> <button type="button" class="btn secondary" id="prAssRemover"' + dis + '>Remover assinatura</button></div><p id="prAssStatus" role="status"></p>';
    host.append(card);
    const $ = (id) => card.querySelector('#' + id);
    const nome = $('prAssNome'), arquivo = $('prAssArquivo'), preview = $('prAssPreview'), salvar = $('prAssSalvar'), remover = $('prAssRemover'), status = $('prAssStatus');
    let imagem = '';
    const pintar = () => { preview.hidden = !imagem; if (imagem) preview.src = imagem; else preview.removeAttribute('src'); };
    const { data, error } = await sb.from('contratos_assinaturas_empresa').select('nome_signatario,imagem').eq('empresa_id', empresa).maybeSingle();
    if (error) { status.textContent = 'Não foi possível carregar a assinatura: ' + error.message; salvar.disabled = true; remover.disabled = true; return; }
    nome.value = data?.nome_signatario || ''; imagem = data?.imagem || ''; pintar();
    arquivo.addEventListener('change', async () => {
      const file = arquivo.files[0]; if (!file) return;
      salvar.disabled = true;
      try {
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('Escolha uma imagem PNG ou JPG de até 5 MB.');
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1000 / bitmap.width, 400 / bitmap.height);
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const img = canvas.toDataURL('image/png');
        if (img.length > 400000) throw Error('A imagem é muito detalhada. Recorte apenas a assinatura e tente novamente.');
        imagem = img; pintar(); status.textContent = 'Prévia pronta. Clique em Salvar assinatura da empresa.';
      } catch (e) { status.textContent = e.message; } finally { salvar.disabled = !pode; arquivo.value = ''; }
    });
    async function gravar(removerImagem) {
      salvar.disabled = true; remover.disabled = true;
      try {
        const { error } = await sb.from('contratos_assinaturas_empresa').upsert({ empresa_id: empresa, nome_signatario: nome.value.trim(), imagem: removerImagem ? '' : imagem, atualizado_em: new Date().toISOString() }, { onConflict: 'empresa_id' });
        if (error) throw error;
        if (removerImagem) { imagem = ''; pintar(); }
        status.textContent = removerImagem ? 'Assinatura removida.' : 'Assinatura salva. Será usada nos próximos contratos gerados.';
      } catch (e) { status.textContent = 'Não foi possível salvar: ' + e.message; } finally { salvar.disabled = !pode; remover.disabled = !pode; }
    }
    salvar.addEventListener('click', () => gravar(false)); remover.addEventListener('click', () => gravar(true));
  };
})();
