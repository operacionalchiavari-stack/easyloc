create extension if not exists pgcrypto;

alter table if exists public.itens
  add column if not exists qr_code text;

alter table if exists public.componentes
  add column if not exists qr_code text;

alter table if exists public.insumos
  add column if not exists qr_code text;

do $$
begin
  if to_regclass('public.itens') is not null then
    update public.itens
    set qr_code = gen_random_uuid()::text
    where qr_code is null;

    create unique index if not exists itens_qr_code_uidx
      on public.itens(qr_code)
      where qr_code is not null;
  end if;

  if to_regclass('public.componentes') is not null then
    update public.componentes
    set qr_code = gen_random_uuid()::text
    where qr_code is null;

    create unique index if not exists componentes_qr_code_uidx
      on public.componentes(qr_code)
      where qr_code is not null;
  end if;

  if to_regclass('public.insumos') is not null then
    update public.insumos
    set qr_code = gen_random_uuid()::text
    where qr_code is null;

    create unique index if not exists insumos_qr_code_uidx
      on public.insumos(qr_code)
      where qr_code is not null;
  end if;
end $$;
