create table public.acervo_inventario_colunas(
 empresa_id uuid not null references empresas(id),chave text not null check(chave in('qtd','revisao','capa','fazer_capa')),
 nome text not null check(length(btrim(nome)) between 3 and 120),ativa boolean not null default true,ordem integer not null,
 primary key(empresa_id,chave),check(chave<>'qtd' or ativa)
);
alter table public.acervo_inventario_colunas enable row level security;
create policy ler on public.acervo_inventario_colunas for select to authenticated using(eh_membro_empresa(empresa_id));
revoke all on public.acervo_inventario_colunas from public,anon,authenticated;
grant select on public.acervo_inventario_colunas to authenticated;

create function public.acervo_inventario_colunas_listar(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso';end if;
 return (select jsonb_agg(jsonb_build_object('chave',d.chave,'nome',coalesce(c.nome,d.nome),'ativa',coalesce(c.ativa,true),'ordem',coalesce(c.ordem,d.ordem)) order by coalesce(c.ordem,d.ordem),d.chave)
 from (values('qtd','Qtd.',1),('revisao','Qtd. revisão',2),('capa','Qtd. capa de proteção',3),('fazer_capa','Qtd. fazer capa de proteção',4)) d(chave,nome,ordem)
 left join acervo_inventario_colunas c on c.empresa_id=p_empresa and c.chave=d.chave);
end $$;
create function public.acervo_inventario_coluna_configurar(p_empresa uuid,p_chave text,p_nome text,p_ativa boolean,p_ordem integer) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'configuracoes.empresa.editar') then raise exception 'Sem permissão para configurar as colunas';end if;
 if p_chave not in('qtd','revisao','capa','fazer_capa') or p_chave is null or p_nome is null or length(btrim(p_nome)) not between 3 and 120 or p_ativa is null or p_ordem is null or p_ordem not between 1 and 99 then raise exception 'Confira o nome, a ordem e a coluna';end if;
 if p_chave='qtd' and not p_ativa then raise exception 'A coluna de quantidade total é obrigatória';end if;
 insert into acervo_inventario_colunas(empresa_id,chave,nome,ativa,ordem) values(p_empresa,p_chave,btrim(p_nome),p_ativa,p_ordem)
 on conflict(empresa_id,chave) do update set nome=excluded.nome,ativa=excluded.ativa,ordem=excluded.ordem;
end $$;
alter table public.acervo_inventarios add column colunas_contagem jsonb not null default '[]';
alter table public.acervo_inventario_itens add column contagens jsonb not null default '{}';
do $patch$ declare fonte text;begin
 select pg_get_functiondef('public.acervo_inventario_geral(uuid)'::regprocedure) into fonte;
 execute replace(fonte,'return v;','update acervo_inventarios set colunas_contagem=acervo_inventario_colunas_listar(p_empresa) where id=v and colunas_contagem=''[]''::jsonb; return v;');
end $patch$;

create function public.acervo_inventario_contar_cegas(p_empresa uuid,p_id uuid,p_item uuid,p_versao integer,p_quantidades jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare inv acervo_inventarios;coluna jsonb;valor numeric;total numeric;revisao numeric;fazer numeric;respostas jsonb:='{}';crit jsonb;problema boolean;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para contar';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into inv from acervo_inventarios where id=p_id and empresa_id=p_empresa for update;
 if not found or inv.status<>'contagem' then raise exception 'Inventário indisponível para contagem';end if;
 if inv.colunas_contagem='[]'::jsonb then raise exception 'Reabra o inventário para carregar as colunas';end if;
 if jsonb_typeof(p_quantidades) is distinct from 'object' then raise exception 'Preencha as quantidades';end if;
 if (select count(*) from jsonb_object_keys(p_quantidades))<>(select count(*) from jsonb_array_elements(inv.colunas_contagem) c where (c->>'ativa')::boolean) then raise exception 'Preencha todas as colunas da contagem';end if;
 for coluna in select * from jsonb_array_elements(inv.colunas_contagem) c where (c->>'ativa')::boolean loop
  if jsonb_typeof(p_quantidades->(coluna->>'chave')) is distinct from 'number' then raise exception 'Informe a quantidade: %',coluna->>'nome';end if;
  valor:=(p_quantidades->>(coluna->>'chave'))::numeric;
  if valor<0 or valor<>trunc(valor) or valor::text in('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida: %',coluna->>'nome';end if;
 end loop;
 total:=(p_quantidades->>'qtd')::numeric;revisao:=coalesce((p_quantidades->>'revisao')::numeric,0);fazer:=coalesce((p_quantidades->>'fazer_capa')::numeric,0);
 if total is null or revisao>total or fazer>total then raise exception 'As quantidades de revisão e de fazer capa não podem superar a quantidade contada';end if;
 for crit in select * from jsonb_array_elements(inv.qualidade_criterios) loop
  problema:=case when crit->>'id'='geral' then revisao>0 when lower(crit->>'nome') like '%capa%' then fazer>0 else false end;
  respostas:=respostas||jsonb_build_object(crit->>'id',jsonb_build_object('resultado',case when problema then 'nao_conforme' when crit->>'id'='geral' or lower(crit->>'nome') like '%capa%' then 'conforme' else 'nao_aplica' end,'observacao',case when problema then 'Contagem: '||revisao||' para revisão; '||fazer||' para fazer capa de proteção' else '' end));
 end loop;
 perform acervo_inventario_conferir(p_empresa,p_id,p_item,p_versao,total,'Contagem cega do inventário',respostas,
  case when greatest(revisao,fazer)>0 then jsonb_build_object('quantidade',greatest(revisao,fazer),'destino','reparo') else null end);
 update acervo_inventario_itens set contagens=p_quantidades where inventario_id=p_id and empresa_id=p_empresa and item_id=p_item;
end $$;
revoke all on function public.acervo_inventario_colunas_listar(uuid),public.acervo_inventario_coluna_configurar(uuid,text,text,boolean,integer),public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.acervo_inventario_colunas_listar(uuid),public.acervo_inventario_coluna_configurar(uuid,text,text,boolean,integer),public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb) to authenticated;
create function public.acervo_inventario_exigir_colunas() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='aprovado' and old.status is distinct from new.status and new.colunas_contagem<>'[]'::jsonb and exists(
  select 1 from acervo_inventario_itens i cross join jsonb_array_elements(new.colunas_contagem) c
  where i.inventario_id=new.id and (c->>'ativa')::boolean and jsonb_typeof(i.contagens->(c->>'chave')) is distinct from 'number'
 ) then raise exception 'Preencha todas as colunas de todos os itens antes de finalizar o inventário';end if;
 return new;
end $$;
create trigger acervo_inventario_exigir_colunas before update of status on public.acervo_inventarios for each row execute function public.acervo_inventario_exigir_colunas();
notify pgrst,'reload schema';
