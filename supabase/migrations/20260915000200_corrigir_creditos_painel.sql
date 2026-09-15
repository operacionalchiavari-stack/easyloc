begin;
-- Avoid collision between the loop record and the clients query alias.
create or replace function public.creditos_painel(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare carteira_cliente record;
begin
 if not public.funcionario_pode(p_empresa,auth.uid(),'comercial.creditos.visualizar') then raise exception 'Sem permissão para consultar créditos'; end if;
 for carteira_cliente in select cliente_id from catalogo_creditos_carteiras where empresa_id=p_empresa loop perform creditos_liberar_expirados(p_empresa,carteira_cliente.cliente_id); end loop;
 return jsonb_build_object('clientes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome_razao,'logo_url',c.catalogo_logo_url,'saldo',coalesce(w.saldo,0)) order by c.nome_razao)
 from clientes_empresas c join catalogo_acessos a on a.cliente_id=c.id and a.empresa_id=c.empresa_id left join catalogo_creditos_carteiras w on w.cliente_id=c.id and w.empresa_id=c.empresa_id where c.empresa_id=p_empresa),'[]'::jsonb),
 'custos',(select jsonb_object_agg(r.recurso,coalesce(p.custo,1)) from unnest(array['tecido','render','planta','layout']) r(recurso) left join catalogo_creditos_precos p on p.recurso=r.recurso and p.empresa_id=p_empresa),
 'historico',coalesce((select jsonb_agg(m order by created_at desc) from (select m.id,m.cliente_id,c.nome_razao as nome,m.recurso,m.quantidade,m.tipo,m.status,m.nota,m.created_at from catalogo_creditos_movimentos m join clientes_empresas c on c.id=m.cliente_id where m.empresa_id=p_empresa order by m.created_at desc limit 100) m),'[]'::jsonb));
end; $$;

commit;
