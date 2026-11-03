// A URL pública pode mudar ou falhar; o snapshot preserva a composição exata.
export async function carregarCenaSalva(cena, { supabase, fetcher = fetch } = {}){
  const valida = valor => valor && typeof valor === 'object' && !Array.isArray(valor) && valor.version === 1;
  if(valida(cena?.snapshot)) return structuredClone(cena.snapshot);
  const urls = [...new Set([cena?.url, cena?.path && supabase?.storage.from('projetos').getPublicUrl(cena.path).data.publicUrl].filter(Boolean))];
  let ultimo;
  for(let tentativa=0;tentativa<2;tentativa++) for(const url of urls){
    try{
      const resposta=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!resposta.ok)throw Error(`Falha ao carregar a cena (${resposta.status}).`);
      const snapshot=await resposta.json();
      if(!valida(snapshot))throw Error('O arquivo recebido não contém uma cena 3D válida.');
      cena.snapshot=structuredClone(snapshot);
      return snapshot;
    }catch(error){ultimo=error;}
  }
  if(cena?.path && supabase?.storage.from('projetos').download){
    try{
      const {data,error}=await supabase.storage.from('projetos').download(cena.path);
      if(error)throw error;
      const snapshot=JSON.parse(await data.text());
      if(!valida(snapshot))throw Error('Cena inválida.');
      cena.snapshot=structuredClone(snapshot);return snapshot;
    }catch(error){ultimo=error;}
  }
  throw Error('Não foi possível recuperar a cena 3D salva. A imagem foi preservada. '+(ultimo?.message || 'O arquivo original não está disponível.'));
}
