-- Acervo rebranding: nova paleta padrao do sistema.

alter table if exists public.configuracoes_empresa
  alter column cor_sidebar set default '#2E1F1F',
  alter column cor_destaque set default '#2E1F1F',
  alter column cor_fundo set default '#FFFFFF';

update public.configuracoes_empresa
set
  cor_sidebar = '#2E1F1F',
  cor_destaque = '#2E1F1F',
  cor_fundo = '#FFFFFF',
  updated_at = now()
where
  cor_sidebar is distinct from '#2E1F1F'
  or cor_destaque is distinct from '#2E1F1F'
  or cor_fundo is distinct from '#FFFFFF';
