with numerados as (
  select
    id,
    empresa_id,
    lpad(row_number() over (
      partition by empresa_id
      order by coalesce(criado_em, data_hora, now()), id
    )::text, 3, '0') as novo_numero
  from public.separacoes_pedidos
)
update public.separacoes_pedidos p
set numero_pedido = n.novo_numero
from numerados n
where p.id = n.id
  and coalesce(p.numero_pedido, '') <> n.novo_numero;

create unique index if not exists separacoes_pedidos_empresa_numero_uidx
  on public.separacoes_pedidos (empresa_id, numero_pedido);
