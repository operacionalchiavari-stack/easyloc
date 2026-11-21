-- Tipos de item e categorias iniciais do Almoxarifado novo, pensados para a Chiavari (16/11/2026).
-- O código do material sai do tipo (TEC-001-01). Editáveis em Gestão > Parâmetros > Almoxarifado.
do $$
declare e uuid; t record; c text;
begin
  for e in select id from public.empresas loop
    for t in select * from (values ('Tecido','TEC','M'),('Espuma','ESP','UN'),('Tinta e verniz','TIN','L'),('Cola e adesivo','COL','UN'),
        ('Ferragem','FER','UN'),('Linha e aviamento','AVI','UN'),('Madeira e chapa','MAD','UN'),('Material de proteção','PRO','UN'),
        ('EPI','EPI','UN'),('Limpeza','LIM','UN'),('Embalagem','EMB','UN'),('Consumível','CON','UN'),('Ferramenta','FRM','UN')) v(nome, sigla, un) loop
      insert into public.warehouse_material_types(empresa_id, nome, sigla, unidade) values (e, t.nome, t.sigla, t.un) on conflict (empresa_id, sigla) do nothing;
    end loop;
    foreach c in array array['Matéria-prima','Consumível','EPI','Ferramenta','Limpeza','Escritório','Manutenção','Embalagem','Pintura'] loop
      insert into public.warehouse_material_categories(empresa_id, nome, ordem) values (e, c, array_position(array['Matéria-prima','Consumível','EPI','Ferramenta','Limpeza','Escritório','Manutenção','Embalagem','Pintura'], c))
      on conflict (empresa_id, nome) do nothing;
    end loop;
  end loop;
end $$;

-- Empresa nova também ganha os mesmos tipos e categorias.
create or replace function public.almox_semear_empresa() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare t record; c text; i int := 0;
begin
  for t in select * from (values ('Tecido','TEC','M'),('Espuma','ESP','UN'),('Tinta e verniz','TIN','L'),('Cola e adesivo','COL','UN'),
      ('Ferragem','FER','UN'),('Linha e aviamento','AVI','UN'),('Madeira e chapa','MAD','UN'),('Material de proteção','PRO','UN'),
      ('EPI','EPI','UN'),('Limpeza','LIM','UN'),('Embalagem','EMB','UN'),('Consumível','CON','UN'),('Ferramenta','FRM','UN')) v(nome, sigla, un) loop
    insert into public.warehouse_material_types(empresa_id, nome, sigla, unidade) values (new.id, t.nome, t.sigla, t.un) on conflict do nothing;
  end loop;
  foreach c in array array['Matéria-prima','Consumível','EPI','Ferramenta','Limpeza','Escritório','Manutenção','Embalagem','Pintura'] loop
    i := i + 1; insert into public.warehouse_material_categories(empresa_id, nome, ordem) values (new.id, c, i) on conflict do nothing;
  end loop;
  return null;
exception when others then raise warning 'almox semear: %', sqlerrm; return null;
end $$;
create trigger almox_semear_empresa after insert on public.empresas for each row execute function public.almox_semear_empresa();

-- Categorias: salvar, renomear, apagar (Parâmetros > Almoxarifado).
create or replace function public.almox_categorias_salvar(p_lista text[]) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare e uuid := public.almox_empresa(); i int := 0; c text;
begin
  if not public.operacao_pode(e, 'configuracoes.empresa.editar') and not public.almox_tw_pode('Ajustar saldo') then
    raise exception 'Sem permissão para alterar os parâmetros.' using errcode = '42501'; end if;
  if coalesce(array_length(p_lista, 1), 0) = 0 then raise exception 'Cadastre pelo menos uma categoria.'; end if;
  delete from public.warehouse_material_categories w where w.empresa_id = e and not (w.nome = any(p_lista))
    and not exists (select 1 from public.warehouse_materials m where m.empresa_id = e and m.categoria = w.nome);
  foreach c in array p_lista loop
    i := i + 1;
    if nullif(trim(c), '') is null then continue; end if;
    insert into public.warehouse_material_categories(empresa_id, nome, ordem) values (e, trim(c), i)
    on conflict (empresa_id, nome) do update set ordem = excluded.ordem;
  end loop;
  return (select jsonb_agg(nome order by ordem) from public.warehouse_material_categories where empresa_id = e);
end $$;
