begin;

insert into public.permissoes_catalogo (chave,modulo,submodulo,acao,descricao,ordem) values
 ('rh.ideias.visualizar','RH','Ideia Premiada','visualizar','Consultar todas as ideias de melhoria da empresa',930),
 ('rh.ideias.avaliar','RH','Ideia Premiada','editar','Avaliar, selecionar e premiar ideias de melhoria',931)
on conflict(chave) do nothing;

create table public.ideias_premiadas (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 autor_id uuid not null references auth.users(id),
 autor_nome text not null,
 titulo text not null check (length(trim(titulo)) between 5 and 120),
 area text not null check (length(trim(area)) between 1 and 80),
 problema text not null check (length(trim(problema)) between 10 and 3000),
 proposta text not null check (length(trim(proposta)) between 10 and 5000),
 beneficio text not null check (length(trim(beneficio)) between 10 and 3000),
 status text not null default 'recebida' check (status in ('recebida','em_analise','selecionada','implementada','premiada','nao_priorizada')),
 retorno text not null default '' check (length(retorno) <= 3000),
 premio text not null default '' check (length(premio) <= 300),
 avaliador_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.ideias_premiadas(empresa_id,created_at desc);
create index on public.ideias_premiadas(empresa_id,autor_id);
create table public.ideias_premiadas_historico (
 id uuid primary key default gen_random_uuid(),
 ideia_id uuid not null references public.ideias_premiadas(id),
 ator_id uuid not null references auth.users(id),
 antes jsonb not null,
 depois jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.ideias_premiadas enable row level security;
alter table public.ideias_premiadas_historico enable row level security;
revoke all on public.ideias_premiadas,public.ideias_premiadas_historico from anon,authenticated;

create function public.ideias_premiadas_enviar(p_empresa uuid,p_dados jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_nome text;
begin
 if auth.uid() is null or not coalesce((public.funcionario_contexto(p_empresa)->>'ativo')::boolean,false) then raise exception 'Acesso inativo'; end if;
 select coalesce(nullif(f.nome,''),nullif(u.nome,''),a.email) into v_nome
 from auth.users a left join public.funcionarios_acesso f on f.id=a.id
 left join public.usuarios u on u.id=a.id where a.id=auth.uid();
 insert into public.ideias_premiadas(empresa_id,autor_id,autor_nome,titulo,area,problema,proposta,beneficio)
 values(p_empresa,auth.uid(),v_nome,trim(p_dados->>'titulo'),trim(p_dados->>'area'),trim(p_dados->>'problema'),trim(p_dados->>'proposta'),trim(p_dados->>'beneficio')) returning id into v_id;
 return v_id;
end $$;

create function public.ideias_premiadas_listar(p_empresa uuid,p_todas boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not coalesce((public.funcionario_contexto(p_empresa)->>'ativo')::boolean,false) then raise exception 'Acesso inativo'; end if;
 if p_todas and not (public.funcionario_pode(p_empresa,auth.uid(),'rh.ideias.visualizar') or public.funcionario_pode(p_empresa,auth.uid(),'rh.ideias.avaliar')) then raise exception 'Sem permissão para consultar todas as ideias'; end if;
 return coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.ideias_premiadas i
 where i.empresa_id=p_empresa and (p_todas or i.autor_id=auth.uid())),'[]'::jsonb);
end $$;

create function public.ideias_premiadas_avaliar(p_empresa uuid,p_id uuid,p_status text,p_retorno text,p_premio text,p_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_antes public.ideias_premiadas; v_depois public.ideias_premiadas;
begin
 if auth.uid() is null or not public.funcionario_pode(p_empresa,auth.uid(),'rh.ideias.avaliar') then raise exception 'Sem permissão para avaliar ideias'; end if;
 select * into v_antes from public.ideias_premiadas where id=p_id and empresa_id=p_empresa for update;
 if not found then raise exception 'Ideia não encontrada'; end if;
 if p_updated_at is distinct from v_antes.updated_at then raise exception 'Esta ideia foi atualizada por outra pessoa. Recarregue antes de avaliar.'; end if;
 if p_status in ('nao_priorizada','premiada') and length(trim(coalesce(p_retorno,''))) < 5 then raise exception 'Registre um retorno para o autor'; end if;
 update public.ideias_premiadas set status=p_status,retorno=trim(coalesce(p_retorno,'')),premio=trim(coalesce(p_premio,'')),avaliador_id=auth.uid(),updated_at=clock_timestamp()
 where id=p_id and empresa_id=p_empresa returning * into v_depois;
 insert into public.ideias_premiadas_historico(ideia_id,ator_id,antes,depois) values(p_id,auth.uid(),to_jsonb(v_antes),to_jsonb(v_depois));
 return to_jsonb(v_depois);
end $$;
revoke all on function public.ideias_premiadas_enviar(uuid,jsonb),public.ideias_premiadas_listar(uuid,boolean),public.ideias_premiadas_avaliar(uuid,uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.ideias_premiadas_enviar(uuid,jsonb),public.ideias_premiadas_listar(uuid,boolean),public.ideias_premiadas_avaliar(uuid,uuid,text,text,text,timestamptz) to authenticated;
commit;
