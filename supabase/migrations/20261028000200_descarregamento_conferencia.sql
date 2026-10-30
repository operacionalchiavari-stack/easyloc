-- Conferência do descarregamento (Expedição): com quantidade (mostra o esperado, como hoje) ou às cegas (como a volta:
-- quem confere não vê quanto devia chegar; o sistema compara com o carregamento ao concluir). Escolha em Parâmetros > Operação.
alter table public.empresa_logistica_regras
  add column if not exists descarregamento_conferencia text not null default 'quantidade';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresa_logistica_regras_descarregamento_conferencia_check') then
    alter table public.empresa_logistica_regras add constraint empresa_logistica_regras_descarregamento_conferencia_check
      check (descarregamento_conferencia in ('quantidade','cegas'));
  end if;
end $$;
