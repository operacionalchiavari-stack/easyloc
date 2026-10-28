-- Produção exclusiva dos pedidos. Materiais e movimentos usam o Almoxarifado integrado.
insert into permissoes_catalogo(chave,modulo,submodulo,acao,descricao,ordem) values
 ('producao.ordens.visualizar','producao','ordens','visualizar','Consultar ordens de produção',10),
 ('producao.ordens.executar','producao','ordens','executar','Executar etapas e receber materiais',20),
 ('producao.ordens.autorizar','producao','ordens','autorizar','Responsável de produção: autorizar, conferir e revisar',30)
on conflict(chave) do nothing;
alter table personalizacoes add column producao_etapas jsonb not null default '[]';

create table producao_parametros(
 empresa_id uuid primary key references empresas(id),config jsonb not null default '{}',updated_at timestamptz not null default now());
create table producao_itens(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 pedido_id uuid not null references separacoes_pedidos(id),chave text not null,
 origem jsonb not null,snapshot jsonb not null,pendente jsonb,revisao boolean not null default false,
 cancelado boolean not null default false,urgente boolean not null default false,urgencia_motivo text,
 prazo_autorizado boolean not null default false,inicio_previsto timestamptz,fim_previsto timestamptz,
 created_at timestamptz not null default now(),unique(pedido_id,chave));
create table producao_etapas(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 producao_item_id uuid not null references producao_itens(id),ordem int not null,grupo int not null,nome text not null,
 setor text not null check(setor in ('pintura','forracao','personalizacao')),horas numeric not null check(horas>=0),
 inicio_previsto timestamptz,fim_previsto timestamptz,
 estado text not null default 'pendente' check(estado in ('pendente','execucao','pausada','conferencia','concluida','cancelada')),
 responsavel uuid,iniciada_em timestamptz,concluida_em timestamptz,motivo text,prazo_autorizado boolean not null default false,unique(producao_item_id,ordem));
create table producao_materiais(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 etapa_id uuid not null references producao_etapas(id),chave text not null,produto_id text,nome text not null,unidade text,
 necessario numeric not null check(necessario>=0),recebido numeric not null default 0,devolvido numeric not null default 0,
 check(recebido>=0 and devolvido>=0 and devolvido<=recebido),unique(etapa_id,chave));
create table producao_pacotes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 etapa_id uuid not null references producao_etapas(id),qr text not null unique default ('PROD:MAT:'||gen_random_uuid()::text),
 materiais jsonb not null,estado text not null default 'separado' check(estado in ('separado','recebido','cancelado')),
 separado_por uuid not null,recebido_por uuid,created_at timestamptz not null default now(),recebido_em timestamptz);
create table producao_historico(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),pedido_id uuid not null,
 etapa_id uuid,acao text not null,usuario_id uuid,detalhes jsonb not null default '{}',created_at timestamptz not null default now());
create index producao_fila on producao_itens(empresa_id,inicio_previsto) where not cancelado;
create index producao_pacotes_etapa on producao_pacotes(etapa_id,estado);
create index producao_historico_pedido on producao_historico(pedido_id,created_at);
create function producao_cadastro_snapshot(p public.personalizacoes) returns jsonb language sql immutable as $$
 select to_jsonb(p)-array['custo_hora','complexidade','margem','preco_manual_ativo','preco_manual','custo_total','preco_sugerido'];
$$;

create function producao_config(p_empresa uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select '{"dias":[1,2,3,4,5],"inicio":"08:00","fim":"18:00","pausa_inicio":"12:00","pausa_fim":"13:00","feriados":[],"antecedencia_horas":8,"material_incompleto":false,"exige_conferencia":true,"responsaveis":{"pintura":[],"forracao":[],"personalizacao":[]}}'::jsonb
 ||coalesce((select config from producao_parametros where empresa_id=p_empresa),'{}');
$$;
create function producao_permite(p_empresa uuid,p_acao text,p_setor text default null) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and
 case when p_acao='autorizar' then
   operacao_pode(p_empresa,'configuracoes.empresa.editar') or
   (operacao_pode(p_empresa,'producao.ordens.autorizar') and
    (coalesce(jsonb_array_length(producao_config(p_empresa)->'responsaveis'->p_setor),0)=0 or
     producao_config(p_empresa)->'responsaveis'->p_setor ? auth.uid()::text))
 else operacao_pode(p_empresa,'producao.ordens.'||p_acao) end;
$$;
-- Contagem regressiva em horas úteis; sábados/domingos/feriados e intervalo não consomem tempo.
create function producao_recuar(p_fim timestamptz,p_horas numeric,p_config jsonb) returns timestamptz
language plpgsql immutable set search_path=public as $$
declare t timestamp:=p_fim at time zone 'America/Sao_Paulo';dia date;ini timestamp;fim timestamp;
 restante numeric:=greatest(coalesce(p_horas,0),0)*3600; trecho numeric; janela record; tentativas int:=0;
begin
 if restante=0 then return p_fim; end if;
 loop
  tentativas:=tentativas+1;if tentativas>36600 then raise exception 'Calendário sem horas úteis suficientes';end if;
  dia:=t::date;
  if (p_config->'dias') @> jsonb_build_array(extract(dow from dia)::int)
    and not coalesce(p_config->'feriados','[]') ? dia::text then
   for janela in select * from (values
    (coalesce(nullif(p_config->>'pausa_fim',''),p_config->>'fim'),p_config->>'fim'),
    (p_config->>'inicio',coalesce(nullif(p_config->>'pausa_inicio',''),p_config->>'fim'))) j(a,b)
   loop
    ini:=dia+janela.a::time;fim:=least(t,dia+janela.b::time);
    if fim>ini then
     trecho:=extract(epoch from fim-ini);
     if trecho>=restante then return (fim-make_interval(secs=>restante::double precision)) at time zone 'America/Sao_Paulo';end if;
     restante:=restante-trecho;
    end if;
   end loop;
  end if;
  t:=dia::timestamp-interval '1 microsecond';
 end loop;
end $$;

create function producao_montar(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare t producao_itens;p separacoes_pedidos;pers personalizacoes;cfg jsonb;et jsonb;passo jsonb;mat record;
 eid uuid;num int:=0;g int;fim timestamptz;horas numeric;total numeric;primeira uuid;
begin
 select * into t from producao_itens where id=p_id for update;
 select * into p from separacoes_pedidos where id=t.pedido_id;
 select * into pers from personalizacoes where id=(t.origem->>'personalizacao_id')::uuid and empresa_id=t.empresa_id;
 if not found then raise exception 'Personalização não pertence à empresa';end if;
 cfg:=producao_config(t.empresa_id);et:=pers.producao_etapas;
 if jsonb_array_length(et)=0 then
  et:=jsonb_build_array(jsonb_build_object('nome',pers.tipo,'setor',case when lower(pers.tipo) like '%pint%' then 'pintura'
   when lower(pers.tipo) like '%forr%' then 'forracao' else 'personalizacao' end,'horas',coalesce(pers.tempo,0),'grupo',1));
 end if;
 fim:=producao_recuar((p.data_entrega+operacao_hora_texto(p.observacoes->>'horario_entrega','08:00'::time)) at time zone 'America/Sao_Paulo',
  (cfg->>'antecedencia_horas')::numeric,cfg);
 update producao_itens set fim_previsto=fim,prazo_autorizado=false where id=p_id;
 -- Cada grupo é uma fase; etapas do mesmo grupo podem ocorrer em paralelo.
 for g in select distinct coalesce((v->>'grupo')::int,1) from jsonb_array_elements(et) v order by 1 desc loop
  total:=0;
  for passo in select v||jsonb_build_object('_ordem',o) from jsonb_array_elements(et) with ordinality j(v,o)
   where coalesce((v->>'grupo')::int,1)=g order by o loop
   num:=(passo->>'_ordem')::int;
   horas:=coalesce((passo->>'horas')::numeric,0)*(t.origem->>'quantidade')::numeric;
   total:=greatest(total,horas);
   insert into producao_etapas(empresa_id,producao_item_id,ordem,grupo,nome,setor,horas,inicio_previsto,fim_previsto)
   values(t.empresa_id,p_id,num,g,passo->>'nome',passo->>'setor',horas,producao_recuar(fim,horas,cfg),fim)
   on conflict(producao_item_id,ordem) do update set grupo=excluded.grupo,nome=excluded.nome,setor=excluded.setor,
    horas=excluded.horas,inicio_previsto=excluded.inicio_previsto,fim_previsto=excluded.fim_previsto,estado='pendente'
   returning id into eid;
  end loop;
  fim:=producao_recuar(fim,total,cfg);
 end loop;
 update producao_itens set inicio_previsto=fim,snapshot=jsonb_build_object('personalizacao',producao_cadastro_snapshot(pers),'etapas',et,
   'origem',t.origem,'entrega',p.data_entrega,'hora',p.observacoes->>'horario_entrega','config',cfg,
   'materiais',(select coalesce(jsonb_agg(to_jsonb(pi) order by pi.id),'[]') from personalizacoes_insumos pi where pi.personalizacao_id=pers.id)),revisao=false,pendente=null where id=p_id;
 select id into primeira from producao_etapas where producao_item_id=p_id order by grupo,ordem limit 1;
 -- Materiais fixos e materiais escolhidos em cartelas chegam com a especificação do Comercial.
 for mat in select pi.id::text chave,coalesce(pi.almox_produto_id,op.almox_produto_id) produto,
  coalesce(op.nome,pi.material_nome,pi.cartela_tipo,'Material sem vínculo') nome,pi.unidade,
  pi.quantidade*(t.origem->>'quantidade')::numeric qtd
  from personalizacoes_insumos pi left join cartela_opcoes op on op.id::text=t.origem->'personalizacao_escolhas'->pi.cartela_tipo->>'opcao_id'
   and op.empresa_id=t.empresa_id
  where pi.personalizacao_id=pers.id and pi.empresa_id=t.empresa_id
 loop
  insert into producao_materiais(empresa_id,etapa_id,chave,produto_id,nome,unidade,necessario)
   values(t.empresa_id,primeira,mat.chave,mat.produto,mat.nome,mat.unidade,mat.qtd);
 end loop;
end $$;

create function producao_sincronizar(p_pedido uuid) returns void language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;a jsonb;i jsonb;k text;v jsonb;actual producao_itens;pers personalizacoes;
 vistos text[]:='{}';pid uuid;mudou boolean;iniciou boolean;
begin
 select * into p from separacoes_pedidos where id=p_pedido for update;
 if not found then return;end if;
 if p.status_comercial not in ('pre_reserva','aprovado','enviado','finalizado') or p.encerrado_operacional_em is not null then
  for actual in select * from producao_itens where pedido_id=p.id and not cancelado loop
   update producao_itens set revisao=true,pendente='{"removido":true}' where id=actual.id;
   if not exists(select 1 from producao_etapas where producao_item_id=actual.id and iniciada_em is not null)
     and not exists(select 1 from producao_materiais m join producao_etapas e on e.id=m.etapa_id where e.producao_item_id=actual.id and m.recebido>0) then
    update producao_itens set cancelado=true,revisao=false where id=actual.id;
    update producao_etapas set estado='cancelada' where producao_item_id=actual.id;
    update producao_pacotes set estado='cancelado' where etapa_id in(select id from producao_etapas where producao_item_id=actual.id) and estado='separado';
   end if;
  end loop;return;
 end if;
 if p.data_entrega is null then return;end if;
 for a in select x from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) x loop
  for i in select x from jsonb_array_elements(coalesce(a->'itens','[]')) x where nullif(x->>'personalizacao_id','') is not null loop
   select * into pers from personalizacoes where id=(i->>'personalizacao_id')::uuid and empresa_id=p.empresa_id;
   if not found then raise exception 'Personalização inválida no pedido';end if;
   k:=coalesce(a->>'id',a->>'nome')||':'||coalesce(i->>'id',i->>'item_id')||':'||pers.id::text;vistos:=array_append(vistos,k);
   v:=i||jsonb_build_object('ambiente',a->>'nome','ambiente_id',a->>'id');
   select * into actual from producao_itens where pedido_id=p.id and chave=k for update;
   if not found then
    insert into producao_itens(empresa_id,pedido_id,chave,origem,snapshot) values(p.empresa_id,p.id,k,v,'{}') returning id into pid;
    perform producao_montar(pid);
   else
    mudou:=actual.origem is distinct from v or actual.snapshot->'personalizacao' is distinct from producao_cadastro_snapshot(pers)
     or actual.snapshot->>'entrega' is distinct from p.data_entrega::text
     or actual.snapshot->>'hora' is distinct from p.observacoes->>'horario_entrega' or actual.cancelado;
    mudou:=mudou or ((actual.snapshot->'config')-array['material_incompleto','exige_conferencia','responsaveis']) is distinct from (producao_config(p.empresa_id)-array['material_incompleto','exige_conferencia','responsaveis'])
      or actual.snapshot->'materiais' is distinct from (select coalesce(jsonb_agg(to_jsonb(pi) order by pi.id),'[]') from personalizacoes_insumos pi where pi.personalizacao_id=pers.id);
    if mudou then
     select exists(select 1 from producao_etapas where producao_item_id=actual.id and iniciada_em is not null)
      or exists(select 1 from producao_materiais m join producao_etapas e on e.id=m.etapa_id where e.producao_item_id=actual.id and m.recebido>0) into iniciou;
     if iniciou then update producao_itens set revisao=true,pendente=v where id=actual.id;
     else
      update producao_pacotes set estado='cancelado' where etapa_id in(select id from producao_etapas where producao_item_id=actual.id) and estado='separado';
      delete from producao_materiais where etapa_id in(select id from producao_etapas where producao_item_id=actual.id);
      -- Etapas antigas são preservadas se já possuem etiquetas emitidas.
      update producao_etapas set estado='cancelada' where producao_item_id=actual.id;
      update producao_itens set origem=v,cancelado=false where id=actual.id;
      perform producao_montar(actual.id);
     end if;
     insert into producao_historico(empresa_id,pedido_id,acao,usuario_id,detalhes) values(p.empresa_id,p.id,'alteracao_comercial',auth.uid(),jsonb_build_object('item',actual.id,'revisao',iniciou));
    end if;
   end if;
  end loop;
 end loop;
 for actual in select * from producao_itens where pedido_id=p.id and not(chave=any(vistos)) and not cancelado loop
  update producao_itens set revisao=true,pendente='{"removido":true}' where id=actual.id;
 end loop;
end $$;
create function producao_pedido_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin perform producao_sincronizar(new.id);return new;end $$;
create trigger producao_pedido after insert or update of observacoes,status_comercial,data_entrega,encerrado_operacional_em
 on separacoes_pedidos for each row execute function producao_pedido_trigger();

-- Somente RPCs alteram execução e estoque; leituras sempre isoladas por empresa.
do $$declare t text;begin foreach t in array array['producao_parametros','producao_itens','producao_etapas','producao_materiais','producao_pacotes','producao_historico'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy ler on %I for select to authenticated using(eh_membro_empresa(empresa_id) and (operacao_pode(empresa_id,''producao.ordens.visualizar'') or operacao_pode(empresa_id,''estoque.almoxarifado.visualizar'') or operacao_pode(empresa_id,''configuracoes.empresa.editar'')))',t);
 execute format('grant select on %I to authenticated',t);
end loop;end $$;
revoke all on function producao_config(uuid),producao_permite(uuid,text,text),producao_recuar(timestamptz,numeric,jsonb),producao_montar(uuid),producao_sincronizar(uuid),producao_pedido_trigger(),producao_cadastro_snapshot(public.personalizacoes) from public,anon,authenticated;
