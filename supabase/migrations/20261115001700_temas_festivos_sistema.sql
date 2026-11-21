-- A paleta original permanece em cor_sidebar / cor_destaque para os documentos.
alter table public.configuracoes_empresa
  add column if not exists tema_festivo text not null default ''
  constraint configuracoes_empresa_tema_festivo_check
  check (tema_festivo in ('', 'carnaval', 'natal', 'pascoa', 'ano_novo'));

comment on column public.configuracoes_empresa.tema_festivo is
  'Tema festivo somente da interface e do destaque de boas-vindas. Não altera impressões.';

notify pgrst, 'reload schema';
