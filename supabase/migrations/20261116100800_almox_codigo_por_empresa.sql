-- Código sem tipo (INS-0001) numerado por empresa, não pela sequência global.
create or replace function public.set_warehouse_material_codigo() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_n int;
begin
  if tg_op = 'INSERT' then
    if new.type_id is not null then
      new := public.warehouse_material_assign_code(new);
    elsif new.codigo is null or trim(new.codigo) = '' then
      perform pg_advisory_xact_lock(hashtextextended('almox_codigo:' || new.empresa_id::text, 0));
      select coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::int), 0) + 1 into v_n
        from public.warehouse_materials where empresa_id = new.empresa_id and codigo ~ '^INS-[0-9]+$';
      new.codigo := 'INS-' || lpad(v_n::text, 4, '0');
    end if;
    if new.qr_code is null or new.qr_code = '' then new.qr_code := new.codigo; end if;
    return new;
  end if;
  if old.type_id is not null and new.type_id is distinct from old.type_id then
    raise exception 'O tipo do item não pode ser trocado (o código % é ligado a ele). Inative o item e cadastre outro.', old.codigo using errcode = '23514';
  end if;
  if old.type_id is null and new.type_id is not null then
    new := public.warehouse_material_assign_code(new);
    if old.qr_code is null or old.qr_code = old.codigo then new.qr_code := new.codigo; end if;
  end if;
  return new;
end $$;
