// Arquivos dos buckets "projetos" e "lounge-formatos", com a mesma cara do supabase.storage.from(bucket)
// (upload / remove / list / getPublicUrl) para os chamadores não mudarem.
//
// Equipe (logada no Acervo): vai direto no Storage, com as políticas `authenticated` da empresa.
// Decorador (sem login, só com o token do catálogo): passa pela função catalogo-arquivos, que confere o token e se
// o projeto/formato é dele. O Storage sozinho não consegue conferir o token, por isso o `anon` não escreve mais lá
// (out/2026 — ver supabase/functions/catalogo-arquivos/index.ts).

export function arquivosDoBucket(supabase, bucket, getSessao){
  const direto = () => supabase.storage.from(bucket);
  const sessao = () => getSessao?.() || {};
  const chamar = async (acao, extra) => {
    const s = sessao();
    const { data, error } = await supabase.functions.invoke("catalogo-arquivos", {
      body: { acao, bucket, empresa_id: s.empresa_id, catalog_token: s.token, ...extra },
    });
    if(error){
      let mensagem = error.message;
      try{ const corpo = await error.context?.json?.(); if(corpo?.erro) mensagem = corpo.erro; }catch{}
      return { data: null, error: new Error(mensagem) };
    }
    if(data?.erro) return { data: null, error: new Error(data.erro) };
    return { data, error: null };
  };

  return {
    getPublicUrl: (path) => direto().getPublicUrl(path),
    async upload(path, corpo, opcoes = {}){
      if(!sessao().token) return direto().upload(path, corpo, opcoes);
      const r = await chamar("upload", { path, upsert: opcoes.upsert === true });
      if(r.error) return r;
      return direto().uploadToSignedUrl(r.data.path, r.data.token, corpo, { contentType: opcoes.contentType });
    },
    async remove(paths){
      if(!sessao().token) return direto().remove(paths);
      const r = await chamar("remover", { paths });
      return r.error ? r : { data: r.data.removidos, error: null };
    },
    async list(pasta, opcoes = {}){
      if(!sessao().token) return direto().list(pasta, opcoes);
      const r = await chamar("listar", { pasta, limit: opcoes.limit });
      return r.error ? r : { data: r.data.arquivos, error: null };
    },
  };
}
