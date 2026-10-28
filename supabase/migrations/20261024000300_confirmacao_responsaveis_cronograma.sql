begin;
create function public.logistica_confirmacao_responsaveis(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos; resultado jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso ao pedido';end if;
 if p_etapa is null or p_etapa not in ('entrega','coleta') then raise exception 'Etapa inválida';end if;
 with candidatos as (
  select e.id,e.nome etapa,e.data,e.hora,r.nome,r.funcionario_id,
   coalesce(nullif(f.foto_url,''),nullif(c.foto_url,''),'') foto_url,
   case when e.tipo=case when p_etapa='entrega' then 'montagem' else 'desmontagem' end then 0 else 1 end prioridade
  from operacao_etapas e join operacao_etapa_pessoas r on r.etapa_id=e.id and r.empresa_id=p.empresa_id and r.papel='responsavel'
  left join funcionarios_acesso f on f.id=r.funcionario_id and f.empresa_id=p.empresa_id
  left join free_cadastros c on c.id=r.free_id and c.empresa_id=p.empresa_id
  where e.pedido_id=p.id and e.empresa_id=p.empresa_id
   and e.tipo=any(case when p_etapa='entrega' then array['montagem','carregamento'] else array['desmontagem','descarregamento'] end)
 ) select coalesce(jsonb_agg(to_jsonb(c)-'prioridade' order by c.data,c.hora,c.nome),'[]') into resultado
 from candidatos c where prioridade=(select min(prioridade) from candidatos);
 return resultado;
end $$;
revoke all on function public.logistica_confirmacao_responsaveis(uuid,text) from public,anon;
grant execute on function public.logistica_confirmacao_responsaveis(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
