-- Produtividade independente do histórico resumido. Eventos por transação/pedido/autor.
create table public.comercial_prod_config (
 empresa_id uuid primary key references public.empresas(id), inicio timestamptz not null default now(),
 config jsonb not null default '{"participantes":[],"acessos":[],"situacoes":["Aguardando resposta","Aguardando decisão","Reunião agendada","Em negociação"],"motivos":["Reunião para decidir","Aguardando aprovação","Solicitação de ajustes"]}'
);
insert into public.comercial_prod_config(empresa_id) select id from public.empresas;
create table public.comercial_prod_eventos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null, pedido_id uuid not null,
 autor_id uuid not null, criado_em timestamptz not null default now(), transacao text not null default txid_current()::text,
 tipo text not null, detalhes jsonb not null default '[]', unique(empresa_id,pedido_id,autor_id,transacao,tipo)
);
create table public.comercial_contatos (
 id uuid primary key, empresa_id uuid not null, pedido_id uuid not null, autor_id uuid not null,
 criado_em timestamptz not null default now(), tipo text not null, situacao text not null, motivo text,
 canal text not null, observacao text not null
);
create table public.comercial_retornos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null, pedido_id uuid not null,
 contato_id uuid not null references public.comercial_contatos(id), responsavel_id uuid not null,
 prazo date not null, prazo_original date not null, revisoes jsonb not null default '[]', criado_em timestamptz not null default now(), concluido_em timestamptz,
 executor_id uuid, encerramento text check(encerramento in ('contato','pagamento','cancelamento'))
);
create unique index comercial_retorno_aberto on public.comercial_retornos(pedido_id) where concluido_em is null;
create index comercial_prod_periodo on public.comercial_prod_eventos(empresa_id,criado_em,autor_id);
create index comercial_contatos_pedido on public.comercial_contatos(empresa_id,pedido_id,criado_em desc);
do $$ declare t text; begin
 foreach t in array array['comercial_prod_config','comercial_prod_eventos','comercial_contatos','comercial_retornos'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;

create function public.comercial_prod_exigir(p_empresa uuid,p_config boolean default false) returns void
language plpgsql stable security definer set search_path=public as $$ begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
 or not operacao_pode(p_empresa,case when p_config then 'configuracoes.empresa.editar' else 'comercial.pedidos.visualizar' end)
 then raise exception 'Sem permissão' using errcode='42501'; end if;
end $$;

create function public.comercial_prod_contexto(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$ declare cfg jsonb; pessoas jsonb; begin
 perform comercial_prod_exigir(p_empresa);
 insert into comercial_prod_config(empresa_id) values(p_empresa) on conflict do nothing;
 select config||jsonb_build_object('inicio',inicio) into cfg from comercial_prod_config where empresa_id=p_empresa;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome) order by f.nome),'[]') into pessoas
 from funcionarios_acesso f where f.empresa_id=p_empresa and f.ativo is distinct from false;
 -- A matriz só é exposta a quem configura; os demais recebem apenas seus alvos autorizados.
 if not operacao_pode(p_empresa,'configuracoes.empresa.editar') then
 cfg:=cfg||jsonb_build_object('acessos',coalesce((select jsonb_agg(x) from jsonb_array_elements(cfg->'acessos') x where x->>'observador'=auth.uid()::text),'[]'));
 end if;
 return jsonb_build_object('config',cfg,'pessoas',pessoas,'usuario',auth.uid());
end $$;

create function public.comercial_prod_config_salvar(p_empresa uuid,p_config jsonb) returns void
language plpgsql security definer set search_path=public as $$ declare k text; begin
 perform comercial_prod_exigir(p_empresa,true);
 foreach k in array array['participantes','acessos','situacoes','motivos'] loop
 if jsonb_typeof(p_config->k) is distinct from 'array' then raise exception 'Configuração inválida: %',k; end if;
 end loop;
 if jsonb_array_length(p_config->'situacoes')=0 then raise exception 'Cadastre ao menos uma situação'; end if;
 if exists(select 1 from jsonb_array_elements((p_config->'situacoes')||(p_config->'motivos')) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 100) then raise exception 'Nomes devem ter de 1 a 100 caracteres'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_config->'participantes') v
 where not exists(select 1 from funcionarios_acesso f where f.empresa_id=p_empresa and f.id::text=v)) then raise exception 'Participante inválido'; end if;
 if exists(select 1 from jsonb_array_elements(p_config->'acessos') a where
 not exists(select 1 from funcionarios_acesso f where f.empresa_id=p_empresa and f.id::text=a->>'observador')
 or (a->>'alvo'<>'equipe' and not exists(select 1 from funcionarios_acesso f where f.empresa_id=p_empresa and f.id::text=a->>'alvo'))
 or a->>'alvo' is null) then raise exception 'Acesso inválido'; end if;
 insert into comercial_prod_config(empresa_id,config) values(p_empresa,p_config)
 on conflict(empresa_id) do update set config=excluded.config;
end $$;

create function public.comercial_prod_campos(p_dados jsonb,p_prefixo text default '') returns table(campo text,valor jsonb)
language plpgsql immutable set search_path=public as $$ declare k text; v jsonb; begin
 if jsonb_typeof(p_dados)<>'object' then return; end if;
 for k,v in select * from jsonb_each(p_dados) loop
 if v in ('null'::jsonb,'{}'::jsonb,'[]'::jsonb) or (jsonb_typeof(v)='string' and btrim(v#>>'{}')='') then continue; end if;
 if jsonb_typeof(v)='object' and v<>'{}'::jsonb then
 return query select c.campo,c.valor from comercial_prod_campos(v,p_prefixo||k||'.') c;
 else campo:=p_prefixo||k;valor:=v;return next; end if;
 end loop;
end $$;
create function public.comercial_prod_unir(p_antes jsonb,p_depois jsonb) returns jsonb
language sql immutable set search_path=public as $$
 with d as(select v,n,concat(v->>'tabela','/',v->>'registro','/',v->>'campo') chave from jsonb_array_elements(p_antes||p_depois) with ordinality x(v,n)),
 primeiro as(select distinct on(chave) chave,v from d order by chave,n),
 ultimo as(select distinct on(chave) chave,v from d order by chave,n desc)
 select coalesce(jsonb_agg(u.v||jsonb_build_object('de',p.v->'de')) filter(where p.v->'de' is distinct from u.v->'para'),'[]') from primeiro p join ultimo u using(chave)
$$;
create function public.comercial_prod_capturar() returns trigger
language plpgsql security definer set search_path=public as $$
declare r jsonb; antes jsonb; depois jsonb; pid uuid; emp uuid; dif jsonb; tp text; op text; begin
 if auth.uid() is null then return coalesce(new,old); end if;
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 emp:=(r->>'empresa_id')::uuid;
 if not exists(select 1 from comercial_prod_config c where c.empresa_id=emp and c.config->'participantes' ? auth.uid()::text) then return coalesce(new,old); end if;
 op:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-comercial-operacao',txid_current()::text);
 if length(op)>100 then raise exception 'Identificador de operação inválido'; end if;
 if tg_table_name='separacoes_pedidos' then
 pid:=(r->>'id')::uuid;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 depois:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 -- Não pontuar alterações exclusivas de separação/rotinas operacionais.
 antes:=antes-array['atualizado_em','atualizado_por','revisao','operacao','status','status_operacional','encerrado_operacional_em','reduzido_em'];
 depois:=depois-array['atualizado_em','atualizado_por','revisao','operacao','status','status_operacional','encerrado_operacional_em','reduzido_em'];
 elsif tg_table_name='fin_receber' then
 pid:=(r->>'pedido_id')::uuid;
 if pid is null or r->>'origem'<>'pedido' then return coalesce(new,old); end if;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 depois:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 select coalesce(jsonb_object_agg(k,v),'{}') into antes from jsonb_each(antes) x(k,v) where k in ('vencimento','valor','recebido','status','forma');
 select coalesce(jsonb_object_agg(k,v),'{}') into depois from jsonb_each(depois) x(k,v) where k in ('vencimento','valor','recebido','status','forma');
 elsif tg_table_name='contratos_pedidos' then
 pid:=(r->>'pedido_id')::uuid;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('conteudo_final',to_jsonb(old)->'conteudo_final') end;
 depois:=case when tg_op='DELETE' then '{}'::jsonb else jsonb_build_object('conteudo_final',r->'conteudo_final') end;
 else
 pid:=(r->>'separacao_pedido_id')::uuid;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 depois:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 antes:=antes-array['atualizado_em','atualizado_por','created_at','criado_por','quantidade_separada','patrimonios_lidos','status'];
 depois:=depois-array['atualizado_em','atualizado_por','created_at','criado_por','quantidade_separada','patrimonios_lidos','status'];
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('tabela',tg_table_name,'registro',r->>'id','campo',coalesce(a.campo,d.campo),'de',a.valor,'para',d.valor)),'[]') into dif
 from comercial_prod_campos(antes) a full join comercial_prod_campos(depois) d using(campo) where a.valor is distinct from d.valor;
 if dif='[]' then return coalesce(new,old); end if;
 tp:=case when tg_table_name='separacoes_pedidos' and tg_op='INSERT' then 'criacao' else 'alteracao' end;
 -- Itens gravados na mesma transação de criação integram a criação.
 if exists(select 1 from comercial_prod_eventos where empresa_id=emp and pedido_id=pid and autor_id=auth.uid() and transacao=op and tipo='criacao') then tp:='criacao'; end if;
 insert into comercial_prod_eventos(empresa_id,pedido_id,autor_id,transacao,tipo,detalhes) values(emp,pid,auth.uid(),op,tp,dif)
 on conflict(empresa_id,pedido_id,autor_id,transacao,tipo) do update set detalhes=comercial_prod_unir(comercial_prod_eventos.detalhes,excluded.detalhes);
 delete from comercial_prod_eventos where empresa_id=emp and pedido_id=pid and autor_id=auth.uid() and transacao=op and tipo='alteracao' and detalhes='[]';
 return coalesce(new,old);
end $$;
create trigger produtividade_pedido after insert or update or delete on public.separacoes_pedidos for each row execute function public.comercial_prod_capturar();
create trigger produtividade_itens after insert or update or delete on public.separacoes_itens for each row execute function public.comercial_prod_capturar();
create trigger produtividade_contrato after insert or update of conteudo_final on public.contratos_pedidos for each row execute function public.comercial_prod_capturar();
create trigger produtividade_recebimento after insert or update on public.fin_receber for each row execute function public.comercial_prod_capturar();

-- Entrada: primeira parcela da locação integralmente recebida, não um recebimento qualquer.
create function public.comercial_entrada_confirmada(p_pedido uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from fin_receber where pedido_id=p_pedido and origem='pedido' and componente='locacao'
 and parcela=1 and status<>'cancelado' and valor>0 and recebido>=valor-0.005)
$$;
create function public.comercial_retornos_encerrar() returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; motivo text; begin
 if tg_table_name='separacoes_pedidos' then
 pid:=new.id; if new.status_comercial='cancelado' then motivo:='cancelamento'; end if;
 else pid:=new.pedido_id; if comercial_entrada_confirmada(pid) then motivo:='pagamento'; end if; end if;
 if motivo is not null then
 perform 1 from separacoes_pedidos where id=pid for update;
 update comercial_retornos set concluido_em=now(),encerramento=motivo where pedido_id=pid and concluido_em is null;
 end if;
 return new;
end $$;
create trigger comercial_retorno_cancelado after update of status_comercial on public.separacoes_pedidos for each row execute function public.comercial_retornos_encerrar();
create trigger comercial_retorno_pago after insert or update of recebido,status on public.fin_receber for each row execute function public.comercial_retornos_encerrar();

create function public.comercial_acompanhamento_salvar(p_empresa uuid,p_pedido uuid,p_id uuid,p_tipo text,p_situacao text,p_motivo text,p_canal text,p_observacao text,p_proximo date,p_responsavel uuid) returns void
language plpgsql security definer set search_path=public as $$ declare cfg jsonb; begin
 perform comercial_prod_exigir(p_empresa);
 -- Serializa contatos e cancelamento do mesmo pedido; repetição do ID é idempotente.
 perform 1 from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa and status_comercial in ('orcamento','pre_reserva') for update;
 if not found then raise exception 'Acompanhamento disponível apenas para orçamento ou pré-reserva'; end if;
 if exists(select 1 from comercial_contatos where id=p_id and empresa_id=p_empresa and pedido_id=p_pedido and autor_id=auth.uid()) then return; end if;
 if comercial_entrada_confirmada(p_pedido) then raise exception 'Entrada já confirmada; negociação encerrada'; end if;
 select config into cfg from comercial_prod_config where empresa_id=p_empresa;
 if not coalesce(cfg->'situacoes' ? p_situacao,false) or (nullif(p_motivo,'') is not null and not coalesce(cfg->'motivos' ? p_motivo,false)) then raise exception 'Situação ou motivo inválido'; end if;
 if p_tipo is null or p_canal is null or p_tipo not in ('Orçamento enviado','Tentativa sem resposta','Resposta do cliente','Negociação','Retorno realizado') or p_canal not in ('WhatsApp','E-mail','Telefone','Outro') then raise exception 'Tipo ou canal inválido'; end if;
 if p_proximo is null or p_proximo<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma próxima data a partir de hoje'; end if;
 if not exists(select 1 from funcionarios_acesso where empresa_id=p_empresa and id=p_responsavel and ativo is distinct from false) then raise exception 'Responsável inválido'; end if;
 if length(coalesce(p_observacao,''))>4000 then raise exception 'Observação muito longa'; end if;
 insert into comercial_contatos(id,empresa_id,pedido_id,autor_id,tipo,situacao,motivo,canal,observacao)
 values(p_id,p_empresa,p_pedido,auth.uid(),p_tipo,p_situacao,nullif(p_motivo,''),p_canal,coalesce(p_observacao,''));
 update comercial_retornos set concluido_em=now(),executor_id=auth.uid(),encerramento='contato' where pedido_id=p_pedido and concluido_em is null;
 insert into comercial_retornos(empresa_id,pedido_id,contato_id,responsavel_id,prazo,prazo_original) values(p_empresa,p_pedido,p_id,p_responsavel,p_proximo,p_proximo);
end $$;

create function public.comercial_retorno_reagendar(p_empresa uuid,p_pedido uuid,p_proximo date,p_responsavel uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$ declare r comercial_retornos; begin
 perform comercial_prod_exigir(p_empresa);
 perform 1 from separacoes_pedidos where empresa_id=p_empresa and id=p_pedido and status_comercial in ('orcamento','pre_reserva') for update;
 if not found or comercial_entrada_confirmada(p_pedido) then raise exception 'Negociação encerrada'; end if;
 select * into r from comercial_retornos where empresa_id=p_empresa and pedido_id=p_pedido and concluido_em is null for update;
 if not found then raise exception 'Não há retorno aberto para reagendar'; end if;
 if p_proximo is null or p_proximo<(now() at time zone 'America/Sao_Paulo')::date or length(btrim(coalesce(p_motivo,''))) not between 3 and 4000 then raise exception 'Informe data futura e motivo do reagendamento'; end if;
 if not exists(select 1 from funcionarios_acesso where empresa_id=p_empresa and id=p_responsavel and ativo is distinct from false) then raise exception 'Responsável inválido'; end if;
 if r.prazo=p_proximo and r.responsavel_id=p_responsavel then return; end if;
 update comercial_retornos set prazo=p_proximo,responsavel_id=p_responsavel,revisoes=revisoes||jsonb_build_array(jsonb_build_object('autor_id',auth.uid(),'em',now(),'prazo_anterior',r.prazo,'responsavel_anterior',r.responsavel_id,'prazo',p_proximo,'responsavel_id',p_responsavel,'motivo',p_motivo)) where id=r.id;
end $$;

create function public.comercial_acompanhamentos(p_empresa uuid,p_pedido uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$ declare res jsonb; begin
 perform comercial_prod_exigir(p_empresa);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into res from (
 select c.*,f.nome autor, r.prazo,r.prazo_original,r.revisoes,r.responsavel_id,rf.nome responsavel,r.concluido_em,r.encerramento,
 (r.encerramento='pagamento' and not comercial_entrada_confirmada(c.pedido_id)) precisa_revisao,
 p.numero_pedido,p.cliente_nome
 from comercial_contatos c join separacoes_pedidos p on p.id=c.pedido_id and p.empresa_id=c.empresa_id
 left join funcionarios_acesso f on f.id=c.autor_id and f.empresa_id=c.empresa_id
 left join comercial_retornos r on r.contato_id=c.id
 left join funcionarios_acesso rf on rf.id=r.responsavel_id and rf.empresa_id=c.empresa_id
 where c.empresa_id=p_empresa and (p_pedido is null or c.pedido_id=p_pedido)
 and (p_pedido is not null or c.id=(select cc.id from comercial_contatos cc where cc.pedido_id=c.pedido_id order by cc.criado_em desc,cc.id desc limit 1))
 order by c.criado_em desc,c.id desc) x;
 return res;
end $$;

create function public.comercial_prod_painel(p_empresa uuid,p_de date,p_ate date,p_autor uuid default null,p_equipe boolean default false) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare cfg jsonb; marco timestamptz; alvos uuid[]; res jsonb; begin
 perform comercial_prod_exigir(p_empresa);
 if p_de is null or p_ate is null or p_ate<p_de or p_ate-p_de>366 then raise exception 'Selecione um período de até 366 dias'; end if;
 if p_equipe and p_autor is not null then raise exception 'O acesso ao total da equipe não permite filtrar uma pessoa' using errcode='42501'; end if;
 select config,inicio into cfg,marco from comercial_prod_config where empresa_id=p_empresa;
 if p_equipe and not exists(select 1 from jsonb_array_elements(cfg->'acessos') a where a->>'observador'=auth.uid()::text and a->>'alvo'='equipe') then raise exception 'Sem acesso ao total da equipe' using errcode='42501'; end if;
 select coalesce(array_agg(f.id),'{}') into alvos from funcionarios_acesso f where f.empresa_id=p_empresa and cfg->'participantes' ? f.id::text and (p_equipe or f.id=auth.uid() or exists(select 1 from jsonb_array_elements(cfg->'acessos') a where a->>'observador'=auth.uid()::text and a->>'alvo'=f.id::text)) and (p_autor is null or f.id=p_autor);
 if p_autor is not null and not p_autor=any(alvos) then raise exception 'Sem acesso a esta pessoa' using errcode='42501'; end if;
 with eventos as (
 select e.id,e.pedido_id,e.autor_id,e.criado_em,e.tipo,e.detalhes from comercial_prod_eventos e where e.empresa_id=p_empresa and e.autor_id=any(alvos) and e.criado_em>=marco
 union all select c.id,c.pedido_id,c.autor_id,c.criado_em,'acompanhamento',jsonb_build_array(jsonb_build_object('tipo',c.tipo,'situacao',c.situacao,'motivo',c.motivo,'observacao',c.observacao)) from comercial_contatos c where c.empresa_id=p_empresa and c.autor_id=any(alvos) and c.criado_em>=marco
 ), periodo as (select * from eventos where (criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
 pessoas as (select f.id,f.nome,
 (select count(*) from periodo e where e.autor_id=f.id and tipo='criacao') criados,
 (select count(distinct pedido_id) from periodo e where e.autor_id=f.id) pedidos,
 (select count(*) from periodo e where e.autor_id=f.id and tipo='alteracao') alteracoes,
 (select coalesce(sum(jsonb_array_length(detalhes)),0) from periodo e where e.autor_id=f.id and tipo='alteracao') detalhes,
 (select count(*) from periodo e where e.autor_id=f.id and tipo='acompanhamento') acompanhamentos,
 (select count(*) from comercial_retornos r where r.empresa_id=p_empresa and r.executor_id=f.id and r.encerramento='contato' and (r.concluido_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) retornos_concluidos,
 (select count(*) from comercial_retornos r where r.empresa_id=p_empresa and r.executor_id=f.id and r.encerramento='contato' and (r.concluido_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate and (r.concluido_em at time zone 'America/Sao_Paulo')::date<=r.prazo_original) no_prazo,
 (select count(*) from comercial_retornos r where r.empresa_id=p_empresa and r.responsavel_id=f.id and r.concluido_em is null and r.prazo<(now() at time zone 'America/Sao_Paulo')::date) atrasados
 from funcionarios_acesso f where f.empresa_id=p_empresa and f.id=any(alvos))
 select jsonb_build_object('inicio',marco,'escopo',case when p_equipe then 'Equipe completa' else 'Pessoas autorizadas' end,
 'pedidos', (select count(distinct pedido_id) from periodo),
 'pessoas',case when p_equipe then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x)) from pessoas x),'[]') end,
 'totais',(select jsonb_build_object('criados',coalesce(sum(criados),0),'alteracoes',coalesce(sum(alteracoes),0),'detalhes',coalesce(sum(detalhes),0),'acompanhamentos',coalesce(sum(acompanhamentos),0),'retornos_concluidos',coalesce(sum(retornos_concluidos),0),'no_prazo',coalesce(sum(no_prazo),0),'atrasados',coalesce(sum(atrasados),0)) from pessoas),
 'anterior',(select jsonb_build_object('de',p_de-(p_ate-p_de+1),'ate',p_de-1,'acoes',count(*),'pedidos',count(distinct pedido_id)) from eventos where (criado_em at time zone 'America/Sao_Paulo')::date between p_de-(p_ate-p_de+1) and p_de-1),
 'dias',(select coalesce(jsonb_agg(to_jsonb(d) order by dia),'[]') from (select (criado_em at time zone 'America/Sao_Paulo')::date dia,count(*) acoes from periodo group by 1) d),
 'eventos',case when p_equipe then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(v) order by criado_em desc),'[]') from (select e.*,f.nome autor,p.numero_pedido from periodo e left join funcionarios_acesso f on f.id=e.autor_id and f.empresa_id=p_empresa left join separacoes_pedidos p on p.id=e.pedido_id order by e.criado_em desc limit 500) v) end) into res;
 return res;
end $$;

revoke all on function public.comercial_prod_exigir(uuid,boolean),public.comercial_prod_campos(jsonb,text),public.comercial_prod_unir(jsonb,jsonb),public.comercial_prod_capturar(),public.comercial_entrada_confirmada(uuid),public.comercial_retornos_encerrar() from public,anon,authenticated;
revoke all on function public.comercial_prod_contexto(uuid),public.comercial_prod_config_salvar(uuid,jsonb),public.comercial_acompanhamento_salvar(uuid,uuid,uuid,text,text,text,text,text,date,uuid),public.comercial_acompanhamentos(uuid,uuid),public.comercial_prod_painel(uuid,date,date,uuid,boolean) from public,anon;
revoke all on function public.comercial_retorno_reagendar(uuid,uuid,date,uuid,text) from public,anon;
grant execute on function public.comercial_retorno_reagendar(uuid,uuid,date,uuid,text) to authenticated;
grant execute on function public.comercial_prod_contexto(uuid),public.comercial_prod_config_salvar(uuid,jsonb),public.comercial_acompanhamento_salvar(uuid,uuid,uuid,text,text,text,text,text,date,uuid),public.comercial_acompanhamentos(uuid,uuid),public.comercial_prod_painel(uuid,date,date,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
