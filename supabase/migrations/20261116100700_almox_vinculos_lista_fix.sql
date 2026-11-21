-- Vínculos de fornecedores: lista sem coluna ambígua (fornecedor_nome).
create or replace function public.warehouse_supplier_links_list(p_search text default '', p_offset integer default 0, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb;
begin
  if not public.almox_tw_pode('Acessar almoxarifado') then raise exception 'Sem permissão para consultar vínculos.' using errcode = '42501'; end if;
  with links as (
    select l.id, l.empresa_id, l.cnpj_fornecedor, l.codigo_fornecedor, l.gtin, l.material_id, l.fator_conversao, l.criado_por, l.criado_em,
      l.atualizado_em, l.descricao_fornecedor, l.unidade_fornecedor, l.unidade_interna,
      m.nome as material_nome, m.codigo as material_codigo, m.unidade as material_unidade, m.status as material_status,
      coalesce(nullif(l.fornecedor_nome, ''), l.cnpj_fornecedor) as fornecedor_nome
      from public.supplier_product_links l
      join public.warehouse_materials m on m.id = l.material_id and m.empresa_id = l.empresa_id
     where l.empresa_id = public.almox_empresa()
  ), filtered as (
    select * from links where nullif(trim(p_search), '') is null
      or concat_ws(' ', links.fornecedor_nome, cnpj_fornecedor, codigo_fornecedor, gtin, descricao_fornecedor, material_nome, material_codigo) ilike '%' || trim(p_search) || '%'
  ), page as (
    select * from filtered order by fornecedor_nome, cnpj_fornecedor, codigo_fornecedor, id
     offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
    'total', (select count(*) from filtered), 'can_edit', public.almox_tw_pode('Registrar entrada')) into result;
  return result;
end $$;
