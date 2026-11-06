-- Ideia Premiada em duas colunas (nov/2026): toda decisão (aprovar, colocar em espera, reprovar, implementada,
-- premiada) exige a justificativa; a lista devolve o histórico das decisões (quem, quando, o quê e por quê).
create or replace function public.ideias_premiadas_listar(p_empresa uuid,p_todas boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not coalesce((public.funcionario_contexto(p_empresa)->>'ativo')::boolean,false) then raise exception 'Acesso inativo'; end if;
 if p_todas and not (public.funcionario_pode(p_empresa,auth.uid(),'rh.ideias.visualizar') or public.funcionario_pode(p_empresa,auth.uid(),'rh.ideias.avaliar')) then raise exception 'Sem permissão para consultar todas as ideias'; end if;
 return coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('historico', coalesce((
     select jsonb_agg(jsonb_build_object(
       'status', h.depois->>'status', 'retorno', h.depois->>'retorno', 'premio', h.depois->>'premio', 'em', h.created_at,
       'por', coalesce(nullif(f.nome,''), nullif(u.nome,''), a.email)) order by h.created_at desc)
     from public.ideias_premiadas_historico h
     left join auth.users a on a.id = h.ator_id
     left join public.funcionarios_acesso f on f.id = h.ator_id
     left join public.usuarios u on u.id = h.ator_id
     where h.ideia_id = i.id), '[]'::jsonb)) order by i.created_at desc)
   from public.ideias_premiadas i
   where i.empresa_id=p_empresa and (p_todas or i.autor_id=auth.uid())),'[]'::jsonb);
end $$;

create or replace function public.ideias_premiadas_avaliar(p_empresa uuid,p_id uuid,p_status text,p_retorno text,p_premio text,p_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_antes public.ideias_premiadas; v_depois public.ideias_premiadas;
begin
 if auth.uid() is null or not public.funcionario_pode(p_empresa,auth.uid(),'rh.ideias.avaliar') then raise exception 'Sem permissão para avaliar ideias'; end if;
 select * into v_antes from public.ideias_premiadas where id=p_id and empresa_id=p_empresa for update;
 if not found then raise exception 'Ideia não encontrada'; end if;
 if p_updated_at is distinct from v_antes.updated_at then raise exception 'Esta ideia foi atualizada por outra pessoa. Recarregue antes de avaliar.'; end if;
 if p_status <> 'recebida' and length(trim(coalesce(p_retorno,''))) < 10 then raise exception 'Escreva a justificativa da decisão (pelo menos 10 letras).'; end if;
 if p_status = 'premiada' and length(trim(coalesce(p_premio,''))) < 3 then raise exception 'Descreva a premiação.'; end if;
 update public.ideias_premiadas set status=p_status,retorno=trim(coalesce(p_retorno,'')),premio=trim(coalesce(p_premio,'')),avaliador_id=auth.uid(),updated_at=clock_timestamp()
 where id=p_id and empresa_id=p_empresa returning * into v_depois;
 insert into public.ideias_premiadas_historico(ideia_id,ator_id,antes,depois) values(p_id,auth.uid(),to_jsonb(v_antes),to_jsonb(v_depois));
 return to_jsonb(v_depois);
end $$;
notify pgrst, 'reload schema';
