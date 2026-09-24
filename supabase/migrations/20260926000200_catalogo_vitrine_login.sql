-- Vitrine da tela de login do catálogo (pedido do usuário: o fundo do login mostra peças do PRÓPRIO acervo, aparecendo e
-- sumindo). Roda ANTES do login (anon), então devolve só o que já é público de fato: logo e nome da empresa e as fotos de
-- alguns itens do catálogo (as mesmas URLs públicas do bucket "itens" que o catálogo já exibe). Nada de preço, medidas,
-- códigos ou qualquer outro dado.
--
-- Qual empresa: o link do catálogo não diz de qual empresa é (quem define é o login do decorador). Sem p_empresa_id, vale a
-- ÚNICA empresa com acesso de decorador ativo ao catálogo; se houver mais de uma, não devolve nada (a tela funciona sem a
-- vitrine) — aí o link precisa levar ?empresa=<id>.
create or replace function public.catalogo_vitrine_login(p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_empresa uuid := p_empresa_id;
  v_resultado jsonb;
begin
  if v_empresa is null then
    select case when count(distinct empresa_id) = 1 then min(empresa_id::text)::uuid end
      into v_empresa
      from public.catalogo_acessos
     where ativo;
  end if;
  if v_empresa is null then return null; end if;

  select jsonb_build_object(
    'empresa', jsonb_build_object('nome', coalesce(e.nome, ''), 'logo_url', e.logo_url),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('url', f.foto_url, 'categoria', f.categoria))
        from (
          select foto_url, categoria
            from (
              select i.foto_url, i.categoria,
                     row_number() over (partition by i.categoria order by random()) as n
                from public.itens i
               where i.empresa_id = v_empresa and i.ativo and i.exibir_no_site
                 and i.tipo in ('Item', 'Kit') and coalesce(i.foto_url, '') <> ''
            ) por_categoria
           where n <= 3
           order by random()
           limit 24
        ) f
    ), '[]'::jsonb)
  )
    into v_resultado
    from public.empresas e
   where e.id = v_empresa;

  return v_resultado;
end;
$$;

revoke all on function public.catalogo_vitrine_login(uuid) from public;
grant execute on function public.catalogo_vitrine_login(uuid) to anon, authenticated;
