-- Acesso de VISITANTE ao catálogo (pedido do usuário): quem não é cliente exclusivo entra sem e-mail/senha e vê o mesmo
-- catálogo padrão da empresa que a equipe vê (Home, categorias, itens) e a Biblioteca — sem preços, sem edição, sem
-- Módulo 3D e sem Projetos. Sem login não existe auth.uid() nem token, então são leituras públicas (anon), cada uma
-- reaproveitando a MESMA função que a equipe usa, com o que o visitante não pode ver cortado aqui no banco:
--   * itens: catalogo_acervo() sem valor_locacao/valor_reposicao (o preço nunca chega ao navegador do visitante);
--   * capa do Portal: só a padrão da equipe (catalogo_capas_acervo já filtra cliente_id is null) — sem lista de clientes;
--   * biblioteca: só as fotos da empresa (cliente_id is null) — as exclusivas de cada decorador ficam de fora — e sem o
--     caminho interno do arquivo (path).
-- Qual empresa: o link não diz (mesma regra de catalogo_vitrine_login) — sem p_empresa_id vale a ÚNICA empresa com acesso
-- de decorador ativo ao catálogo; com mais de uma, só com ?empresa=<id> no link.

create or replace function public.catalogo_empresa_publica(p_empresa_id uuid default null)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (select e.id from public.empresas e where e.id = p_empresa_id
       and exists (select 1 from public.catalogo_acessos a where a.empresa_id = e.id and a.ativo)),
    case when p_empresa_id is null then
      (select case when count(distinct empresa_id) = 1 then min(empresa_id::text)::uuid end
         from public.catalogo_acessos where ativo)
    end
  );
$$;
revoke all on function public.catalogo_empresa_publica(uuid) from public;

create or replace function public.catalogo_publico_carregar(p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_empresa uuid := public.catalogo_empresa_publica(p_empresa_id);
begin
  if v_empresa is null then raise exception 'Catálogo indisponível'; end if;
  return jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url) from public.empresas e where e.id = v_empresa),
    'empresa_id', v_empresa,
    'decorador', null,
    'itens', (select coalesce(jsonb_agg(item - 'valor_locacao' - 'valor_reposicao'), '[]'::jsonb)
                from jsonb_array_elements(public.catalogo_acervo(v_empresa)) as item));
end;
$$;

create or replace function public.catalogo_capas_publico(p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_empresa uuid := public.catalogo_empresa_publica(p_empresa_id);
begin
  if v_empresa is null then return '{}'::jsonb; end if;
  return public.catalogo_capas_acervo(v_empresa);
end;
$$;

create or replace function public.biblioteca_publico_carregar(p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare v_empresa uuid := public.catalogo_empresa_publica(p_empresa_id);
begin
  if v_empresa is null then return jsonb_build_object('fotos', '[]'::jsonb); end if;
  return jsonb_build_object('fotos', (
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'categoria', f.categoria, 'titulo', f.titulo, 'url', f.url, 'ordem', f.ordem, 'cliente_id', null)
             order by f.categoria, f.ordem nulls last, f.criado_em), '[]'::jsonb)
      from public.biblioteca_fotos f
     where f.empresa_id = v_empresa and f.cliente_id is null));
end;
$$;

revoke all on function public.catalogo_publico_carregar(uuid) from public;
revoke all on function public.catalogo_capas_publico(uuid) from public;
revoke all on function public.biblioteca_publico_carregar(uuid) from public;
grant execute on function public.catalogo_publico_carregar(uuid) to anon, authenticated;
grant execute on function public.catalogo_capas_publico(uuid) to anon, authenticated;
grant execute on function public.biblioteca_publico_carregar(uuid) to anon, authenticated;

-- A função auxiliar só é usada pelas leituras acima (security definer): não fica exposta pro anon.
revoke execute on function public.catalogo_empresa_publica(uuid) from anon, authenticated;
