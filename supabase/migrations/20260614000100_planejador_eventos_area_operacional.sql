alter table if exists public.itens
  add column if not exists area_operacional_largura numeric(10, 2),
  add column if not exists area_operacional_profundidade numeric(10, 2);

comment on column public.itens.area_operacional_largura is
  'Largura operacional em metros usada pelo Planejador Inteligente de Eventos.';

comment on column public.itens.area_operacional_profundidade is
  'Profundidade operacional em metros usada pelo Planejador Inteligente de Eventos.';
