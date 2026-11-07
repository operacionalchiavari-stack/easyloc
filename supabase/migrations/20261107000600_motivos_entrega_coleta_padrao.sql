-- Nov/2026 (teste do usuário final, item 4): os motivos de entrega e de coleta foram apagados na limpeza de 26/10,
-- e sem eles ninguém consegue confirmar uma entrega ou coleta com falta, avaria ou desistência.
-- Recria motivos padrão para toda empresa que não tem nenhum motivo ativo daquela etapa. Editáveis em Parâmetros.
insert into public.logistica_motivos(empresa_id, etapa, nome)
select e.id, v.etapa, v.nome
from public.empresas e
cross join (values
  ('entrega', 'Item não entregue'),
  ('entrega', 'Cliente dispensou o item'),
  ('entrega', 'Avaria identificada na entrega'),
  ('entrega', 'Item não coube no local'),
  ('coleta', 'Item não encontrado no local'),
  ('coleta', 'Avaria identificada no local'),
  ('coleta', 'Peça ficou com o cliente'),
  ('coleta', 'Peça quebrada no evento')
) v(etapa, nome)
where not exists (
  select 1 from public.logistica_motivos m
  where m.empresa_id = e.id and m.etapa = v.etapa and m.ativo
)
and not exists (
  select 1 from public.logistica_motivos m
  where m.empresa_id = e.id and m.etapa = v.etapa and lower(trim(m.nome)) = lower(trim(v.nome))
);
