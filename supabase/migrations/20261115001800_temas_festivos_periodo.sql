alter table public.configuracoes_empresa
  add column if not exists tema_festivo_inicio date,
  add column if not exists tema_festivo_fim date;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'configuracoes_empresa_tema_periodo_check'
      and conrelid = 'public.configuracoes_empresa'::regclass
  ) then
    alter table public.configuracoes_empresa
      add constraint configuracoes_empresa_tema_periodo_check check (
        (tema_festivo_inicio is null and tema_festivo_fim is null)
        or (tema_festivo_inicio is not null and tema_festivo_fim is not null
          and isfinite(tema_festivo_inicio) and isfinite(tema_festivo_fim)
          and tema_festivo_inicio <= tema_festivo_fim)
      );
  end if;
end $$;

comment on column public.configuracoes_empresa.tema_festivo_inicio is 'Primeiro dia de exibição do tema, inclusive, no fuso America/Sao_Paulo.';
comment on column public.configuracoes_empresa.tema_festivo_fim is 'Último dia de exibição do tema, inclusive. Fora do período vale a identidade original.';
notify pgrst, 'reload schema';
