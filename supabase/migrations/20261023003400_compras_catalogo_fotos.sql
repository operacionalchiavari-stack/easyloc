create or replace function public.compras_catalogo_entrada(p_empresa uuid,p_destino text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','insert') then
  raise exception 'Sem permissão para registrar compras' using errcode='42501';end if;
 if p_destino='almoxarifado' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.produto,'codigo',a.codigo,'unidade',a.unidade) order by a.produto) from almox_produtos(p_empresa) a),'[]');
 elsif p_destino='locacao' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'nome',coalesce(i.descricao_total,i.produto),'codigo',i.codigo,'unidade','un','foto_url',to_jsonb(i)->>'foto_url') order by i.produto)
   from itens i where i.empresa_id=p_empresa and lower(coalesce(i.tipo,''))<>'kit'),'[]');
 end if;
 raise exception 'Destino inválido';
end $$;
notify pgrst,'reload schema';
