-- Ideia Premiada na Início (nov/2026): quando uma ideia é premiada, o banner da Ideia Premiada vira uma
-- celebração (qual ideia, de quem, qual o prêmio) por N dias, configuráveis em Parâmetros > Recursos humanos.
create table if not exists public.ideias_premiadas_config (
 empresa_id uuid primary key references public.empresas(id) on delete cascade,
 dias_celebracao int not null default 4 check (dias_celebracao between 0 and 60),
 updated_at timestamptz not null default now()
);
alter table public.ideias_premiadas_config enable row level security;
revoke all on public.ideias_premiadas_config from anon, authenticated;

-- Qualquer pessoa ativa da empresa lê (a Início é de todos). Só o necessário para o banner.
create or replace function public.ideias_premiadas_celebracao(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_dias int;
begin
 if auth.uid() is null or not coalesce((public.funcionario_contexto(p_empresa)->>'ativo')::boolean,false) then raise exception 'Acesso inativo'; end if;
 select coalesce((select dias_celebracao from public.ideias_premiadas_config where empresa_id=p_empresa),4) into v_dias;
 return jsonb_build_object('dias', v_dias, 'ideias', coalesce((
  select jsonb_agg(jsonb_build_object('id',x.id,'titulo',x.titulo,'area',x.area,'autor',x.autor_nome,'autor_id',x.autor_id,
    'premio',x.premio,'proposta',left(x.proposta,280),'premiada_em',x.premiada_em) order by x.premiada_em desc)
  from (
   select i.*, coalesce((select max(h.created_at) from public.ideias_premiadas_historico h
                          where h.ideia_id=i.id and h.depois->>'status'='premiada'), i.updated_at) as premiada_em
   from public.ideias_premiadas i
   where i.empresa_id=p_empresa and i.status='premiada'
  ) x
  where v_dias > 0 and x.premiada_em >= now() - make_interval(days => v_dias)
 ),'[]'::jsonb));
end $$;

create or replace function public.ideias_premiadas_config_ler(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 return jsonb_build_object('dias_celebracao', coalesce((select dias_celebracao from public.ideias_premiadas_config where empresa_id=p_empresa),4));
end $$;

create or replace function public.ideias_premiadas_config_salvar(p_empresa uuid, p_dias int) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.funcionario_pode(p_empresa,auth.uid(),'configuracoes.empresa.editar') then raise exception 'Sem permissão para alterar os parâmetros'; end if;
 if p_dias is null or p_dias < 0 or p_dias > 60 then raise exception 'Informe de 0 a 60 dias.'; end if;
 insert into public.ideias_premiadas_config(empresa_id,dias_celebracao,updated_at) values(p_empresa,p_dias,now())
 on conflict(empresa_id) do update set dias_celebracao=excluded.dias_celebracao, updated_at=now();
 return jsonb_build_object('dias_celebracao', p_dias);
end $$;

revoke all on function public.ideias_premiadas_celebracao(uuid), public.ideias_premiadas_config_ler(uuid), public.ideias_premiadas_config_salvar(uuid,int) from public, anon;
grant execute on function public.ideias_premiadas_celebracao(uuid), public.ideias_premiadas_config_ler(uuid), public.ideias_premiadas_config_salvar(uuid,int) to authenticated;
notify pgrst, 'reload schema';
