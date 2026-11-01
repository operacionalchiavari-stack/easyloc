-- As respostas reutilizáveis pertencem aos cadastros. Ausência continua desconhecida.
alter table clientes_empresas add column if not exists complexidade jsonb not null default '{}';
alter table locais_empresas add column if not exists complexidade jsonb not null default '{}';
alter table itens add column if not exists complexidade jsonb not null default '{}';
create table public.complexidade_config (
 empresa_id uuid primary key references empresas(id),config jsonb not null default '{}',atualizado_em timestamptz not null default now());
create table public.complexidade_excecoes (
 pedido_id uuid primary key references separacoes_pedidos(id) on delete cascade,empresa_id uuid not null references empresas(id),
 dados jsonb not null default '{}',atualizado_por uuid,atualizado_em timestamptz not null default now());
create table public.complexidade_fechamentos (
 pedido_id uuid primary key references separacoes_pedidos(id) on delete cascade,empresa_id uuid not null references empresas(id),
 contexto jsonb not null,congelado_em timestamptz not null default now());
create table public.complexidade_historico (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),pedido_id uuid,
 usuario_id uuid,acao text not null,detalhes jsonb not null,criado_em timestamptz not null default now());
create index complexidade_historico_empresa on complexidade_historico(empresa_id,criado_em);
create function public.complexidade_config_padrao() returns jsonb language sql immutable as $$
 select jsonb_build_object('versao',1,'limite_personalizados',4,'limite_pecas',50,'limite_caminhoes',2,'distancia_manual_m',50,
 'antecedencia_horas',48,'inicio_expediente','08:00','fim_expediente','18:00','dias_expediente','[1,2,3,4,5]'::jsonb,
 'tipos_especiais','["Feira","Mídia"]'::jsonb,'grupos_volumosos','["sofa","bar","painel"]'::jsonb,
 'pesos',(select jsonb_object_agg(i::text,jsonb_build_object('sim',case when i between 5 and 10 then (array[7,4,4,3,5,7])[i-4] else (array[18,14,14,24])[(case when i<5 then i else (i-11)%4+1 end)] end,
 'nao',case when i between 5 and 10 then (array[2,5,1,1,2,2])[i-4] else (array[6,5,5,8])[(case when i<5 then i else (i-11)%4+1 end)] end)) from generate_series(1,26) i));
$$;
create function public.complexidade_validar_cadastro() returns trigger language plpgsql set search_path=public as $$
declare k text;v jsonb;
begin
 if jsonb_typeof(new.complexidade) is distinct from 'object' or length(new.complexidade::text)>3000 then raise exception 'Condições de complexidade inválidas';end if;
 for k,v in select * from jsonb_each(new.complexidade) loop
  if k=any(array['reclamacao','exclusivo','baldeacao','escada','fragil','volumoso','sob_medida']) and jsonb_typeof(v) not in ('boolean','null') then raise exception 'Informe Sim, Não ou Não informado';end if;
  if k='distancia_manual_m' and jsonb_typeof(v)<>'null' and (jsonb_typeof(v)<>'number' or (v::text)::numeric not between 0 and 100000) then raise exception 'Distância inválida';end if;
  if k='grupo' and jsonb_typeof(v)<>'null' and (v#>>'{}') not in ('sofa','cadeira_puff','bar','mesa','aparador_estante','painel','outro') then raise exception 'Grupo de complexidade inválido';end if;
 end loop;return new;
end $$;
create trigger cx_validar_cliente before insert or update of complexidade on clientes_empresas for each row execute function complexidade_validar_cadastro();
create trigger cx_validar_local before insert or update of complexidade on locais_empresas for each row execute function complexidade_validar_cadastro();
create trigger cx_validar_item before insert or update of complexidade on itens for each row execute function complexidade_validar_cadastro();

create function public.complexidade_pode(p_empresa uuid,p_editar boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and seguranca_2fa_ok()
 and (operacao_pode(p_empresa,'configuracoes.empresa.editar') or operacao_pode(p_empresa,'estoque.insumos.'||case when p_editar then 'editar' else 'visualizar' end));
$$;
alter table complexidade_config enable row level security;
alter table complexidade_excecoes enable row level security;
alter table complexidade_fechamentos enable row level security;
alter table complexidade_historico enable row level security;
create policy cx_config_ler on complexidade_config for select to authenticated using(complexidade_pode(empresa_id));
create policy cx_excecoes_ler on complexidade_excecoes for select to authenticated using(complexidade_pode(empresa_id));
create policy cx_fechamentos_ler on complexidade_fechamentos for select to authenticated using(complexidade_pode(empresa_id));
create policy cx_historico_ler on complexidade_historico for select to authenticated using(complexidade_pode(empresa_id));
grant select on complexidade_config,complexidade_excecoes,complexidade_fechamentos,complexidade_historico to authenticated;

create function public.complexidade_contexto(p_empresa uuid,p_pedido uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; r jsonb;
begin
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;
 if p.id is null then raise exception 'Pedido não encontrado nesta empresa';end if;
 select contexto||jsonb_build_object('congelado_em',congelado_em) into r from complexidade_fechamentos where pedido_id=p.id and empresa_id=p_empresa;
 if r is not null then return r;end if;
 return jsonb_build_object(
 'id',p.id,'empresa_id',p.empresa_id,'numero',p.numero_pedido,'cliente_nome',p.cliente_nome,'local_nome',p.local_nome,'data_evento',p.data_evento,
 'tipo_evento',p.tipo_evento,'status',p.status_comercial,'valor_locacao',coalesce(p.observacoes->'valores'->'locacao_bv','0'),
 'valor_montagem',coalesce(p.observacoes->'valores'->'montagem','0'),'valor_frete',coalesce(p.observacoes->'valores'->'frete','0'),
 'config',complexidade_config_padrao()||coalesce((select config from complexidade_config where empresa_id=p_empresa),'{}'),
 'excecoes',coalesce((select dados from complexidade_excecoes where pedido_id=p.id and empresa_id=p_empresa),'{}'),
 'local',(select jsonb_build_object('complexidade',complexidade,'tags',tags) from locais_empresas where id=p.local_id and empresa_id=p_empresa),
 'cliente',(select jsonb_build_object('complexidade',complexidade) from clientes_empresas where id=p.cliente_id and empresa_id=p_empresa),
 'pedidos_anteriores',case when p.cliente_id is null then null else
  (select count(*) from separacoes_pedidos a where a.empresa_id=p_empresa and a.cliente_id=p.cliente_id and a.id<>p.id
   and a.pedido_origem_id is null and a.status_comercial in ('aprovado','enviado','finalizado') and a.criado_em<p.criado_em) end,
 'confirmado_em',(select min(b.created_at) from fin_baixas b join fin_receber t on t.id=b.receber_id and t.empresa_id=b.empresa_id
  where t.empresa_id=p_empresa and t.pedido_id=p.id and b.estornado_em is null and b.valor>0),
 'carregamento',(select jsonb_build_object('data',data,'hora',hora) from operacao_etapas where empresa_id=p_empresa and pedido_id=p.id and tipo='carregamento' order by data,hora limit 1),
 'montagem',(select jsonb_build_object('data',data,'hora',hora) from operacao_etapas where empresa_id=p_empresa and pedido_id=p.id and tipo='montagem' order by data,hora limit 1),
 'caminhoes',(select count(distinct c.caminhao_id) from operacao_etapa_caminhoes c join operacao_etapas e on e.id=c.etapa_id
  where e.empresa_id=p_empresa and c.empresa_id=p_empresa and e.pedido_id=p.id and e.tipo='carregamento'),
 'itens',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'familia',i.familia,'categoria',i.categoria,'produto_base',i.produto_base,
   'complexidade',i.complexidade,'quantidade',s.quantidade_solicitada)) from separacoes_itens s join itens i on i.id=s.item_id and i.empresa_id=p_empresa where s.separacao_pedido_id=p.id),'[]'),
 'pecas',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'quantidade',c.esperado,'material',i.material,'complexidade',i.complexidade))
   from operacao_conferencia_pecas(p.id,false) c join itens i on i.id=c.item_id and i.empresa_id=p_empresa),'[]'),
 'servicos',coalesce((select jsonb_agg(jsonb_build_object('item_id',x->>'item_id','quantidade',x->'quantidade','tipo',pers.tipo,
   'item',jsonb_build_object('familia',i.familia,'categoria',i.categoria,'produto_base',i.produto_base,'complexidade',i.complexidade),
   'etapas',coalesce((select jsonb_agg(jsonb_build_object('setor',pe.setor,'revisao',pi.revisao))
    from producao_itens pi join producao_etapas pe on pe.producao_item_id=pi.id and pe.empresa_id=p_empresa and pe.estado<>'cancelada'
    where pi.pedido_id=p.id and pi.empresa_id=p_empresa and not pi.cancelado and pi.origem->>'personalizacao_id'=x->>'personalizacao_id'
     and pi.origem->>'item_id'=x->>'item_id' and pi.origem->>'ambiente_id'=a->>'id'),pers.producao_etapas)))
   from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) a
   cross join lateral jsonb_array_elements(coalesce(a->'itens','[]')) x
   left join personalizacoes pers on pers.id::text=x->>'personalizacao_id' and pers.empresa_id=p_empresa
   left join itens i on i.id::text=x->>'item_id' and i.empresa_id=p_empresa
   where nullif(x->>'personalizacao_id','') is not null),'[]')
 );
end $$;
revoke all on function complexidade_contexto(uuid,uuid) from public,anon,authenticated;

create function public.complexidade_contextos(p_empresa uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(complexidade_contexto(p_empresa,p.id) order by p.data_evento desc nulls last,p.id),'[]')
 from separacoes_pedidos p where p.empresa_id=p_empresa and p.status_comercial<>'cancelado'
 and ((p.encerrado_operacional_em is null and p.status_comercial<>'finalizado') or exists(select 1 from complexidade_fechamentos f where f.pedido_id=p.id and f.empresa_id=p_empresa));
$$;
revoke all on function complexidade_contextos(uuid) from public,anon,authenticated;
grant execute on function complexidade_contextos(uuid) to service_role;

create function public.complexidade_congelar_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.encerrado_operacional_em is not null and old.encerrado_operacional_em is null)
 or (new.status_comercial='finalizado' and old.status_comercial is distinct from 'finalizado') then
  insert into complexidade_fechamentos(pedido_id,empresa_id,contexto)
  values(new.id,new.empresa_id,complexidade_contexto(new.empresa_id,new.id)) on conflict(pedido_id) do nothing;
 end if;return new;
end $$;
revoke all on function complexidade_congelar_trigger() from public,anon,authenticated;
create trigger complexidade_congelar after update of encerrado_operacional_em,status_comercial on separacoes_pedidos
 for each row execute function complexidade_congelar_trigger();

create function public.complexidade_salvar_excecoes(p_empresa uuid,p_pedido uuid,p_dados jsonb,p_motivo text)
returns void language plpgsql security definer set search_path=public as $$
declare k text;v jsonb;normalizado jsonb:='{}';antes jsonb;confirmado timestamptz;
begin
 if not complexidade_pode(p_empresa,true) then raise exception 'Sem permissão para ajustar a complexidade';end if;
 perform 1 from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not found then raise exception 'Pedido não encontrado';end if;
 if exists(select 1 from complexidade_fechamentos where pedido_id=p_pedido) then raise exception 'Avaliação encerrada: o histórico está preservado';end if;
 if jsonb_typeof(p_dados) is distinct from 'object' or length(p_dados::text)>20000 or length(btrim(coalesce(p_motivo,'')))<5 or length(p_motivo)>1000 then raise exception 'Descreva o motivo do ajuste (5 a 1000 caracteres)';end if;
 for k,v in select * from jsonb_each(coalesce(p_dados->'respostas','{}')) loop
  if k!~'^[0-9]+$' or k::int not between 1 and 26 or jsonb_typeof(v)<>'boolean' then raise exception 'Resposta inválida';end if;
  normalizado:=normalizado||jsonb_build_object(k,jsonb_build_object('valor',v,'motivo',btrim(p_motivo),'por',auth.uid(),'em',now()));
 end loop;
 if p_dados->>'viagens' is not null and ((p_dados->>'viagens')!~'^[0-9]+$' or (p_dados->>'viagens')::int not between 1 and 100) then raise exception 'Informe de 1 a 100 viagens';end if;
 confirmado:=nullif(p_dados->>'confirmado_em','')::timestamptz;
 if confirmado>now() then raise exception 'A confirmação não pode estar no futuro';end if;
 if p_dados ? 'montagem_aplica' and jsonb_typeof(p_dados->'montagem_aplica') not in ('boolean','null') then raise exception 'Informe se há montagem';end if;
 select dados into antes from complexidade_excecoes where pedido_id=p_pedido;
 insert into complexidade_excecoes(pedido_id,empresa_id,dados,atualizado_por) values(p_pedido,p_empresa,
  jsonb_build_object('respostas',normalizado,'viagens',p_dados->'viagens','confirmado_em',confirmado,'montagem_aplica',p_dados->'montagem_aplica'),auth.uid())
 on conflict(pedido_id) do update set dados=excluded.dados,atualizado_por=auth.uid(),atualizado_em=now();
 insert into complexidade_historico(empresa_id,pedido_id,usuario_id,acao,detalhes)
 values(p_empresa,p_pedido,auth.uid(),'excecoes',jsonb_build_object('antes',antes,'depois',p_dados,'motivo',p_motivo));
end $$;
revoke all on function complexidade_salvar_excecoes(uuid,uuid,jsonb,text) from public,anon;
grant execute on function complexidade_salvar_excecoes(uuid,uuid,jsonb,text) to authenticated;

create function public.complexidade_config_salvar(p_empresa uuid,p_config jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare k text;v jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'configuracoes.empresa.editar') or not seguranca_2fa_ok() then raise exception 'Sem permissão para configurar';end if;
 if jsonb_typeof(p_config) is distinct from 'object' or length(p_config::text)>15000 then raise exception 'Configuração inválida';end if;
 if p_config ? 'pesos' and jsonb_typeof(p_config->'pesos') is distinct from 'object' then raise exception 'Pesos inválidos';end if;
 p_config:=complexidade_config_padrao()||p_config||jsonb_build_object('pesos',(complexidade_config_padrao()->'pesos')||coalesce(p_config->'pesos','{}'));
 for k,v in select * from jsonb_each(p_config->'pesos') loop
  if k!~'^[0-9]+$' or k::int not between 1 and 26 or jsonb_typeof(v)<>'object'
   or jsonb_typeof(v->'sim') is distinct from 'number' or jsonb_typeof(v->'nao') is distinct from 'number'
   or (v->>'sim')::numeric not between 0 and 1000 or (v->>'nao')::numeric not between 0 and 1000 then raise exception 'Pesos inválidos';end if;
 end loop;
 for v in select value from jsonb_array_elements('[[1,2,3,4],[11,12,13,14],[15,16,17,18],[19,20,21,22],[23,24,25,26]]'::jsonb) loop
  if (select sum(greatest((p_config->'pesos'->i->>'sim')::numeric,(p_config->'pesos'->i->>'nao')::numeric)) from jsonb_array_elements_text(v||'[5,6,7,8,9,10]'::jsonb) i)<=0 then raise exception 'Defina pesos positivos para cada setor';end if;
 end loop;
 for k in select unnest(array['limite_personalizados','limite_pecas','limite_caminhoes','distancia_manual_m','antecedencia_horas']) loop
  if p_config ? k and (jsonb_typeof(p_config->k)<>'number' or (p_config->>k)::numeric not between 1 and 100000) then raise exception 'Limite inválido: %',k;end if;
 end loop;
 if p_config->>'inicio_expediente' is null or p_config->>'fim_expediente' is null or p_config->>'inicio_expediente'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_config->>'fim_expediente'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or p_config->>'inicio_expediente'>=p_config->>'fim_expediente' then raise exception 'Confira o expediente';end if;
 if jsonb_typeof(p_config->'dias_expediente') is distinct from 'array' or jsonb_array_length(p_config->'dias_expediente')=0
 or exists(select 1 from jsonb_array_elements(p_config->'dias_expediente') d where d::text!~'^[0-6]$') then raise exception 'Confira os dias de trabalho';end if;
 if jsonb_typeof(p_config->'tipos_especiais') is distinct from 'array' or jsonb_typeof(p_config->'grupos_volumosos') is distinct from 'array' then raise exception 'Confira os tipos e grupos';end if;
 if exists(select 1 from jsonb_array_elements((p_config->'tipos_especiais')||(p_config->'grupos_volumosos')) x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>120) then raise exception 'Tipos e grupos devem ser nomes válidos';end if;
 insert into complexidade_config(empresa_id,config) values(p_empresa,p_config) on conflict(empresa_id) do update set config=excluded.config,atualizado_em=now();
 insert into complexidade_historico(empresa_id,usuario_id,acao,detalhes) values(p_empresa,auth.uid(),'configuracao',p_config);
end $$;
revoke all on function complexidade_config_salvar(uuid,jsonb) from public,anon;
grant execute on function complexidade_config_salvar(uuid,jsonb) to authenticated;
