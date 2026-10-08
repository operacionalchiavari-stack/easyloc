/**
 * Busca TODAS as linhas de uma consulta do Supabase, em páginas.
 *
 * A API do projeto devolve no máximo 1000 linhas por requisição e corta o
 * resto em silêncio (sem erro). Com 1173 itens, ~1335 kit_itens e ~4500
 * itens_precos, qualquer `.select()` da tabela inteira perdia linhas — já
 * causou item "sumido" no Cadastro de Itens e preços faltando em Tabelas de
 * Preço. Use sempre isto para listas que podem passar de 1000 linhas.
 *
 * Uso:
 *   const { data, error } = await buscarTodos(() =>
 *     supabase.from("itens").select("id,referencia").eq("empresa_id", id).order("id"));
 *
 * `montarConsulta` precisa devolver uma consulta NOVA a cada chamada (o
 * `.range()` é aplicado nela) e de preferência com `.order(...)` estável,
 * senão o banco pode repetir/pular linhas entre as páginas.
 */
export async function buscarTodos(montarConsulta, tamanhoPagina = 1000) {
  let todos = [];
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await montarConsulta().range(inicio, inicio + tamanhoPagina - 1);
    if (error) return { data: null, error };
    todos = todos.concat(data || []);
    if (!data || data.length < tamanhoPagina) return { data: todos, error: null };
  }
}
