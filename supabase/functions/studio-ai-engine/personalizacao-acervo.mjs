// A consulta ocorre antes da reserva de créditos e da chamada ao provedor.
export async function prepararPersonalizacao(client, input) {
  const dados = input.scene?.personalizacao;
  if(input.scene?.referencePolicy !== 'fabric_customization' || !dados?.item_id)return null;
  if(!dados.escolha?.persId && input.scene.fabricReference){
    const bytes = new TextEncoder().encode(input.scene.fabricReference);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    input.scene.personalizacao = {...dados, amostra_hash: Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('')};
  }
  const job = crypto.randomUUID();
  const {data,error} = await client.rpc('personalizacao_ia_preparar',{
    p_empresa:input.empresa_id,p_item:dados.item_id,p_dados:input.scene.personalizacao,p_job:job,
  });
  if(error)throw error;
  return {...data,liberar:async()=>{
    if(!data?.nova || !data.chave)return;
    const {error}=await client.rpc('personalizacao_ia_liberar',{p_empresa:input.empresa_id,p_item:dados.item_id,p_chave:data.chave,p_job:job});
    if(error)console.error('Não foi possível liberar a geração da personalização',error);
  }};
}

// Persiste no servidor antes de devolver a geração ao navegador.
export async function guardarPersonalizacao(client, input, image, { clienteId = null, usuarioId = null } = {}) {
  const personalizacao = input.scene?.personalizacao;
  if (input.scene?.referencePolicy !== 'fabric_customization' || !personalizacao?.item_id) return null;
  const dataUrl = image.base64 && (image.base64.startsWith('data:') ? image.base64 : `data:image/png;base64,${image.base64}`);
  const response = await fetch(dataUrl || image.url);
  if (!response.ok) throw Error('Não foi possível ler a imagem gerada.');
  const blob = await response.blob();
  const mime = blob.type || 'image/png';
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const path = `${input.empresa_id}/_personalizacoes/${crypto.randomUUID()}.${ext}`;
  const bucket = client.storage.from('personalizacoes-ia');
  const { error: uploadError } = await bucket.upload(path, blob, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const { data, error } = await client.rpc('comercial_personalizacao_ia_salvar', {
    p_empresa: input.empresa_id, p_cliente: clienteId, p_usuario: usuarioId,
    p_item: personalizacao.item_id, p_dados: personalizacao,
    p_path: path, p_url: url, p_mime: mime, p_tamanho: blob.size,
  });
  if (error) {
    await bucket.remove([path]);
    throw error;
  }
  if(data?.path && data.path !== path)await bucket.remove([path]);
  return data;
}

// Renderizações do Módulo 3D (21/11/2026): toda imagem gerada a partir de uma cena 3D (3D Livre, composições da Helena)
// fica guardada em Comercial › Renderizações, pasta "Módulo 3D". Nunca impede a resposta: se falhar, só vira aviso.
export async function guardarRender3d(client, input, image, { clienteId = null, usuarioId = null } = {}) {
  if (input.scene?.referencePolicy === 'fabric_customization') return null;
  const dataUrl = image.base64 && (image.base64.startsWith('data:') ? image.base64 : `data:image/png;base64,${image.base64}`);
  const response = await fetch(dataUrl || image.url);
  if (!response.ok) throw Error('Não foi possível ler a imagem gerada.');
  const blob = await response.blob();
  const mime = blob.type || 'image/png';
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const path = `${input.empresa_id}/_renders3d/${crypto.randomUUID()}.${ext}`;
  const bucket = client.storage.from('personalizacoes-ia');
  const { error: uploadError } = await bucket.upload(path, blob, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const objetos = Array.isArray(input.scene?.objects) ? input.scene.objects : [];
  const moveis = objetos.map((o) => String(o?.itemName || o?.name || '').trim()).filter(Boolean).slice(0, 60);
  const dados = { moveis, politica: input.scene?.referencePolicy || null, quantidade: objetos.length };
  const { data, error } = await client.rpc('comercial_render3d_salvar', {
    p_empresa: input.empresa_id, p_cliente: clienteId, p_usuario: usuarioId, p_dados: dados,
    p_path: path, p_url: url, p_mime: mime, p_tamanho: blob.size,
  });
  if (error) { await bucket.remove([path]); throw error; }
  return data;
}
