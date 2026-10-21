-- Descarregamento é uma conferência independente da triagem de retorno.
alter table public.separacoes_etiquetas
  add column if not exists lida_descarregamento_em timestamptz;
