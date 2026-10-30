-- Toda divergência de uma conferência por quantidade já concluída vira pendência (out/2026): conferências da volta e do
-- descarregamento concluídas antes de 20261028000300 só tinham a falta (sem esperado/conferido) e a sobra não existia.
-- Para cada item com conferido <> esperado em operacao.<etapa>.itens, cria a falta/sobra que não existir (aberta) e
-- completa esperado/conferido das faltas antigas. Nada que já foi resolvido é reaberto.
begin;
create temp table _div_base on commit drop as
  select p.id pedido_id, p.empresa_id, e.etapa, x,
         (x->>'esperado')::numeric esp, (x->>'conferido')::numeric conf,
         case when e.etapa='retorno' then x->>'chave' else 'descarregamento:'||(x->>'chave') end codigo
    from public.separacoes_pedidos p
    cross join (values ('retorno'),('descarregamento')) e(etapa)
    cross join jsonb_array_elements(coalesce(p.operacao->e.etapa->'itens','[]')) x
   where p.operacao->e.etapa ? 'concluido_em'
     and (x->>'esperado') is not null and (x->>'conferido') is not null
     and (x->>'conferido')::numeric <> (x->>'esperado')::numeric;

update public.operacao_ocorrencias o set esperado=coalesce(o.esperado,b.esp), conferido=coalesce(o.conferido,b.conf),
       etapa=coalesce(o.etapa,b.etapa)
  from _div_base b
 where o.pedido_id=b.pedido_id and o.codigo=b.codigo and o.tipo=case when b.conf<b.esp then 'falta' else 'sobra' end;

insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao,etapa,esperado,conferido)
select b.empresa_id,b.pedido_id,nullif(b.x->>'item_id','')::uuid,b.codigo,
       case when b.conf<b.esp then 'falta' else 'sobra' end,
       abs(b.esp-b.conf),
       case when b.conf>b.esp then 'Veio a mais: '
            when b.etapa='retorno' then 'Peça não devolvida: ' else 'Peça não descarregada: ' end
         ||(b.x->>'item')||' ('||trim_scale(abs(b.esp-b.conf))||')',
       b.etapa,b.esp,b.conf
  from _div_base b
on conflict(pedido_id,codigo,tipo) do nothing;
commit;
