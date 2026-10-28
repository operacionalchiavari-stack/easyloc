create table public.acervo_qualidade_criterios(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 nome text not null check(length(btrim(nome)) between 3 and 120),ativo boolean not null default true,
 atualizado_em timestamptz not null default now(),atualizado_por uuid
);
create unique index acervo_qualidade_nome on public.acervo_qualidade_criterios(empresa_id,lower(btrim(nome)));
alter table public.acervo_qualidade_criterios enable row level security;
create policy acervo_qualidade_ler on public.acervo_qualidade_criterios for select to authenticated
 using(eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,'itens','select'));
revoke all on public.acervo_qualidade_criterios from public,anon,authenticated;
grant select on public.acervo_qualidade_criterios to authenticated;
insert into acervo_qualidade_criterios(empresa_id,nome) select e.id,n from empresas e cross join unnest(array['Capa de proteção','QR Code de identificação']) n;

create function public.acervo_qualidade_configurar(p_empresa uuid,p_id uuid,p_nome text,p_ativo boolean) returns uuid
language plpgsql security definer set search_path=public as $$
declare v uuid;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'configuracoes.empresa.editar') then raise exception 'Sem permissão para configurar a qualidade';end if;
 if p_nome is null or length(btrim(p_nome)) not between 3 and 120 or p_ativo is null then raise exception 'Informe um nome entre 3 e 120 caracteres';end if;
 if p_id is null then insert into acervo_qualidade_criterios(empresa_id,nome,ativo,atualizado_por) values(p_empresa,btrim(p_nome),p_ativo,auth.uid()) returning id into v;
 else update acervo_qualidade_criterios set nome=btrim(p_nome),ativo=p_ativo,atualizado_em=now(),atualizado_por=auth.uid() where id=p_id and empresa_id=p_empresa returning id into v;
  if v is null then raise exception 'Verificação não encontrada nesta empresa';end if;
 end if;
 return v;
end $$;

alter table public.acervo_inventarios add column qualidade_criterios jsonb not null default '[]';
alter table public.acervo_inventario_itens add column qualidade jsonb not null default '{}';
create function public.acervo_qualidade_snapshot() returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.qualidade_criterios:='[{"id":"geral","nome":"Condição geral do item"}]'::jsonb||coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome) order by nome) from acervo_qualidade_criterios where empresa_id=new.empresa_id and ativo),'[]');
 return new;
end $$;
create trigger acervo_qualidade_snapshot before insert on public.acervo_inventarios for each row execute function public.acervo_qualidade_snapshot();
update acervo_inventarios a set qualidade_criterios='[{"id":"geral","nome":"Condição geral do item"}]'::jsonb||coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome) order by nome) from acervo_qualidade_criterios where empresa_id=a.empresa_id and ativo),'[]') where status='contagem';

create table public.acervo_inventario_qualidade_historico(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),inventario_id uuid not null,item_id uuid not null,
 versao integer not null,contado numeric not null,motivo text not null,qualidade jsonb not null,conferido_por uuid,conferido_em timestamptz not null default now(),
 foreign key(inventario_id,item_id) references acervo_inventario_itens(inventario_id,item_id)
);
alter table public.acervo_inventario_qualidade_historico enable row level security;
create policy acervo_qualidade_historico_ler on public.acervo_inventario_qualidade_historico for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,'itens','select'));
revoke all on public.acervo_inventario_qualidade_historico from public,anon,authenticated;
grant select on public.acervo_inventario_qualidade_historico to authenticated;

create function public.acervo_qualidade_validar(p_criterios jsonb,p_respostas jsonb) returns void language plpgsql immutable set search_path=public as $$
declare c jsonb;r jsonb;begin
 if p_respostas is null or jsonb_typeof(p_respostas)<>'object' then raise exception 'Conclua o controle de qualidade de cada item';end if;
 if (select count(*) from jsonb_object_keys(p_respostas))<>jsonb_array_length(p_criterios) then raise exception 'Conclua todas as verificações de qualidade';end if;
 for c in select value from jsonb_array_elements(p_criterios) loop
  r:=p_respostas->(c->>'id');
  if r is null or jsonb_typeof(r)<>'object' or coalesce(r->>'resultado','') not in ('conforme','nao_conforme','nao_aplica') then raise exception 'Confira: %',c->>'nome';end if;
  if r->>'resultado'='nao_conforme' and length(btrim(coalesce(r->>'observacao','')))<5 then raise exception 'Descreva o problema em: %',c->>'nome';end if;
  if length(coalesce(r->>'observacao',''))>1000 then raise exception 'A descrição do problema deve ter até 1000 caracteres';end if;
 end loop;
end $$;

-- Uma nova contagem invalida as respostas anteriores até a conferência completa.
do $$declare f text;begin
 f:=pg_get_functiondef('public.acervo_inventario_contar(uuid,uuid,uuid,integer,numeric,text)'::regprocedure);
 if position('set contado=p_contado' in f)=0 then raise exception 'Formato da contagem alterado';end if;
 f:=replace(f,'set contado=p_contado','set qualidade=''{}''::jsonb,contado=p_contado');execute f;
 f:=pg_get_functiondef('public.acervo_inventario_aprovar(uuid,uuid)'::regprocedure);
 if position('  select estoque_total into saldo' in f)=0 then raise exception 'Formato da aprovação alterado';end if;
 f:=replace(f,'  select estoque_total into saldo','  perform acervo_qualidade_validar(i.qualidade_criterios,c.qualidade); select estoque_total into saldo');execute f;
end $$;

create function public.acervo_inventario_conferir(p_empresa uuid,p_id uuid,p_item uuid,p_versao integer,p_contado numeric,p_motivo text,p_qualidade jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare criterios jsonb;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para conferir';end if;
 select qualidade_criterios into strict criterios from acervo_inventarios where id=p_id and empresa_id=p_empresa for update;
 perform acervo_qualidade_validar(criterios,p_qualidade);
 perform acervo_inventario_contar(p_empresa,p_id,p_item,p_versao,p_contado,p_motivo);
 update acervo_inventario_itens set qualidade=p_qualidade where inventario_id=p_id and item_id=p_item and empresa_id=p_empresa;
 insert into acervo_inventario_qualidade_historico(empresa_id,inventario_id,item_id,versao,contado,motivo,qualidade,conferido_por)
 values(p_empresa,p_id,p_item,p_versao+1,p_contado,coalesce(p_motivo,''),p_qualidade,auth.uid());
end $$;
revoke all on function public.acervo_qualidade_configurar(uuid,uuid,text,boolean),public.acervo_qualidade_snapshot(),public.acervo_qualidade_validar(jsonb,jsonb),public.acervo_inventario_conferir(uuid,uuid,uuid,integer,numeric,text,jsonb) from public,anon;
grant execute on function public.acervo_qualidade_configurar(uuid,uuid,text,boolean),public.acervo_inventario_conferir(uuid,uuid,uuid,integer,numeric,text,jsonb) to authenticated;
notify pgrst,'reload schema';
