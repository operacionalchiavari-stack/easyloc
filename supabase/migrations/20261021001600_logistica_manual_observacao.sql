create or replace function public.validar_pedido_logistica_manual()
returns trigger language plpgsql security definer set search_path=public as $$
declare tipo text; antes jsonb; depois jsonb; ajuste jsonb;
begin
  depois := coalesce(new.observacoes->'logistica_manual', '{}'::jsonb);
  if jsonb_typeof(depois) <> 'object' then raise exception 'Ajustes de logística inválidos.'; end if;
  if tg_op='UPDATE' then antes := coalesce(old.observacoes->'logistica_manual','{}'::jsonb);
  else antes := '{}'::jsonb; end if;
  foreach tipo in array array['frete','montagem'] loop
    ajuste := depois->tipo;
    if ajuste is not null then
      if jsonb_typeof(ajuste->'valor') is distinct from 'number' then raise exception 'Informe um valor válido para %.', tipo; end if;
      if (ajuste->>'valor')::numeric < 0 or (ajuste->>'valor')::numeric > 999999999.99 then raise exception 'Valor de % fora do limite.', tipo; end if;
    end if;
    if ajuste is not null then
      if jsonb_typeof(ajuste->'observacao') is distinct from 'string'
        or btrim(ajuste->>'observacao', E' \t\n\r') = '' then
        raise exception 'Informe a observação do ajuste manual de %.', tipo;
      end if;
      if length(ajuste->>'observacao') > 1000 then
        raise exception 'A observação do ajuste de % deve ter até 1000 caracteres.', tipo;
      end if;
    end if;
    if (antes->tipo) is distinct from ajuste then
      if not public.pedido_logistica_manual_permite(new.empresa_id, tipo) then
        raise exception 'Sem permissão para ajustar manualmente %.', tipo using errcode='42501';
      end if;
    end if;
  end loop;
  return new;
end $$;
