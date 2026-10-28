create table public.empresa_escala_controle(
 empresa_id uuid primary key references public.empresas(id) on delete cascade,
 automatica boolean not null default true
);
create table public.escala_restricoes_pessoas(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 pessoa_a text not null,pessoa_b text not null,motivo text not null default '',
 check(pessoa_a<pessoa_b),check(length(motivo)<=300),
 unique(empresa_id,pessoa_a,pessoa_b)
);
alter table public.empresa_escala_controle enable row level security;
alter table public.escala_restricoes_pessoas enable row level security;
grant select on public.empresa_escala_controle,public.escala_restricoes_pessoas to authenticated;
create policy escala_controle_ler on public.empresa_escala_controle for select to authenticated using(public.eh_membro_empresa(empresa_id));
create policy escala_restricoes_ler on public.escala_restricoes_pessoas for select to authenticated using(public.eh_membro_empresa(empresa_id));
create function public.escala_controle_pode(p_empresa uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and
 (funcionario_pode(p_empresa,auth.uid(),'configuracoes.empresa.editar') or funcionario_pode(p_empresa,auth.uid(),'logistica.planejamento.editar'))
$$;
create function public.escala_controle_salvar(p_empresa uuid,p_automatica boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not escala_controle_pode(p_empresa) then raise exception 'Sem permissao para alterar os parametros da escala';end if;
 if p_automatica is null then raise exception 'Informe se a escala automatica esta ativa';end if;
 insert into empresa_escala_controle values(p_empresa,p_automatica) on conflict(empresa_id) do update set automatica=excluded.automatica;
end $$;
create function public.escala_restricao_salvar(p_empresa uuid,p_a text,p_b text,p_motivo text default '') returns void language plpgsql security definer set search_path=public as $$
declare pessoa text;
begin
 if not escala_controle_pode(p_empresa) then raise exception 'Sem permissao para alterar os parametros da escala';end if;
 if p_a is null or p_b is null or p_a=p_b then raise exception 'Selecione duas pessoas diferentes';end if;
 foreach pessoa in array array[p_a,p_b] loop
  if not exists(select 1 from funcionarios_acesso f where f.empresa_id=p_empresa and 'func:'||f.id::text=pessoa and f.ativo and f.equipe_operacional is not null)
   and not exists(select 1 from free_cadastros f where f.empresa_id=p_empresa and 'free:'||f.id::text=pessoa and f.status='aprovado') then raise exception 'Pessoa indisponivel na equipe desta empresa';end if;
 end loop;
 insert into escala_restricoes_pessoas(empresa_id,pessoa_a,pessoa_b,motivo) values(p_empresa,least(p_a,p_b),greatest(p_a,p_b),coalesce(trim(p_motivo),''))
 on conflict(empresa_id,pessoa_a,pessoa_b) do update set motivo=excluded.motivo;
end $$;
create function public.escala_restricao_excluir(p_empresa uuid,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not escala_controle_pode(p_empresa) then raise exception 'Sem permissao para alterar os parametros da escala';end if;
 delete from escala_restricoes_pessoas where empresa_id=p_empresa and id=p_id;
end $$;
create function public.escala_pessoa_compativel(p_empresa uuid,p_etapa uuid,p_func uuid,p_free uuid) returns boolean language sql stable security definer set search_path=public as $$
 select not exists(select 1 from operacao_etapa_pessoas outra join escala_restricoes_pessoas r on r.empresa_id=p_empresa
 and r.pessoa_a=least(coalesce('func:'||p_func::text,'free:'||p_free::text),coalesce('func:'||outra.funcionario_id::text,'free:'||outra.free_id::text))
 and r.pessoa_b=greatest(coalesce('func:'||p_func::text,'free:'||p_free::text),coalesce('func:'||outra.funcionario_id::text,'free:'||outra.free_id::text))
 where outra.etapa_id=p_etapa)
$$;
create function public.escala_restricao_proteger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.etapa_id::text,0));
 if not escala_pessoa_compativel(new.empresa_id,new.etapa_id,new.funcionario_id,new.free_id) then
  raise exception 'Estas pessoas nao podem trabalhar juntas. Revise as restricoes nos Parametros do Painel Logistico.';
 end if;
 return new;
end $$;
create trigger escala_restricao_pessoas before insert or update on public.operacao_etapa_pessoas for each row execute function public.escala_restricao_proteger();
-- O gerador pula pessoas incompativeis e respeita a chave automatica, inclusive em chamadas internas.
do $patch$
declare fonte text;trecho text;
begin
 fonte:=pg_get_functiondef('public.operacao_escala_preencher_sem_fluxo(uuid,uuid[])'::regprocedure);
 trecho:='  if reg = ''{}''::jsonb then return 0; end if;';
 if position(trecho in fonte)=0 then raise exception 'Gerador de escala diferente do esperado';end if;
 fonte:=replace(fonte,trecho,trecho||E'\n  if not coalesce((select automatica from public.empresa_escala_controle where empresa_id=p_empresa),true) then return 0;end if;');
 trecho:='where f.empresa_id = p_empresa and f.ativo and f.lider_operacao and f.equipe_operacional = conf->>''equipe''';
 if position(trecho in fonte)=0 then raise exception 'Selecao de lider diferente da esperada';end if;
 fonte:=replace(fonte,trecho,trecho||E'\n         and public.escala_pessoa_compativel(p_empresa,et.id,f.id,null)');
 trecho:='        exit when n_eq >= precisa - (case when tem_resp then 1 else 0 end);';
 if position(trecho in fonte)=0 then raise exception 'Selecao de equipe diferente da esperada';end if;
 fonte:=replace(fonte,trecho,trecho||E'\n        continue when not public.escala_pessoa_compativel(p_empresa,et.id,pessoa.id,pessoa.free_id);');
 execute fonte;
end $patch$;
revoke all on function public.escala_controle_pode(uuid),public.escala_controle_salvar(uuid,boolean),public.escala_restricao_salvar(uuid,text,text,text),public.escala_restricao_excluir(uuid,uuid),public.escala_pessoa_compativel(uuid,uuid,uuid,uuid),public.escala_restricao_proteger() from public,anon;
grant execute on function public.escala_controle_pode(uuid),public.escala_controle_salvar(uuid,boolean),public.escala_restricao_salvar(uuid,text,text,text),public.escala_restricao_excluir(uuid,uuid) to authenticated;
