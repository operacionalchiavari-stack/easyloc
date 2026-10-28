create table public.acervo_retornos(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),pedido_id uuid not null references separacoes_pedidos(id),
 chave text not null,item_id uuid not null references itens(id),tipo text not null check(tipo in ('revisao','avaria','falta')),
 quantidade numeric not null check(quantidade>0),estado text not null check(estado in ('aguardando_retorno','triagem','limpeza','reparo','inspecao','investigacao','liberado','baixado')),
 custo numeric(15,2) not null default 0 check(custo>=0),motivo text not null default '',versao integer not null default 1,
 criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),atualizado_por uuid,
 unique(pedido_id,chave,tipo)
);
create table public.acervo_historico(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),retorno_id uuid not null references acervo_retornos(id),
 estado text not null,motivo text not null,custo numeric not null default 0,usuario_id uuid not null,criado_em timestamptz not null default now());
create table public.acervo_inventarios(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),nome text not null,
 status text not null default 'contagem' check(status in ('contagem','aprovado','cancelado')),criado_por uuid not null,criado_em timestamptz not null default now(),aprovado_por uuid,aprovado_em timestamptz);
create table public.acervo_inventario_itens(inventario_id uuid not null references acervo_inventarios(id),empresa_id uuid not null references empresas(id),item_id uuid not null references itens(id),
 saldo_base numeric not null,contado numeric check(contado>=0 and contado=trunc(contado)),motivo text not null default '',versao integer not null default 1,contado_por uuid,contado_em timestamptz,primary key(inventario_id,item_id));
create table public.logistica_evidencias(id uuid primary key,empresa_id uuid not null references empresas(id),pedido_id uuid not null references separacoes_pedidos(id),
 etapa text not null check(etapa in ('entrega','coleta')),chave text not null,path text not null unique,descricao text not null default '',criado_por uuid not null,criado_por_nome text not null,criado_em timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['acervo_retornos','acervo_historico','acervo_inventarios','acervo_inventario_itens','logistica_evidencias'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t='logistica_evidencias' then
  execute format('create policy ler on public.%I for select to authenticated using(eh_membro_empresa(empresa_id) and (funcionario_tabela_permitida(empresa_id,''separacoes_pedidos'',''select'') or funcionario_tabela_permitida(empresa_id,''itens'',''select'') or fin_pode(empresa_id,''financeiro.fluxo.visualizar'')))',t);
 else execute format('create policy ler on public.%I for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,''itens'',''select''))',t); end if;
end loop;end $$;
create index acervo_retornos_empresa_estado on acervo_retornos(empresa_id,estado);
create index logistica_evidencias_pedido on logistica_evidencias(empresa_id,pedido_id);

create function public.acervo_sincronizar_coleta() returns trigger language plpgsql security definer set search_path=public as $$
declare x jsonb;t text;q numeric;r uuid;begin
 if new.etapa<>'coleta' then return new;end if;
 for x in select * from jsonb_array_elements(new.itens) loop
  foreach t in array array['revisao','avaria','falta'] loop
   q:=case t when 'revisao' then coalesce((x->>'coletado')::numeric,0)-coalesce((x->>'danificado')::numeric,0) when 'avaria' then coalesce((x->>'danificado')::numeric,0) else coalesce((x->>'nao_coletado')::numeric,0) end;
   if q>0 then
    insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por)
    values(new.empresa_id,new.pedido_id,x->>'chave',(x->>'item_id')::uuid,t,q,case when t='falta' then 'investigacao' else 'aguardando_retorno' end,coalesce(x->>'observacao',''),new.criado_por)
    on conflict(pedido_id,chave,tipo) do nothing returning id into r;
    if r is not null then insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select empresa_id,id,estado,'Registro da coleta',new.criado_por from acervo_retornos where id=r;end if;
   end if;
  end loop;
 end loop;return new;
end $$;
create trigger acervo_coleta after insert on logistica_confirmacoes for each row execute function acervo_sincronizar_coleta();
create function public.acervo_receber_retorno() returns trigger language plpgsql security definer set search_path=public as $$
declare r record;begin
 if new.operacao->'retorno'->>'concluido_em' is not null and old.operacao->'retorno'->>'concluido_em' is null then
  for r in update acervo_retornos set estado='triagem',versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where pedido_id=new.id and estado='aguardando_retorno' returning * loop
   insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(r.empresa_id,r.id,'triagem','Recebimento na Triagem de retorno',auth.uid());
  end loop;
 end if;return new;
end $$;
create trigger acervo_retorno after update of operacao on separacoes_pedidos for each row execute function acervo_receber_retorno();

-- Uma perda vinculada a coleta e baixada somente pela rotina do acervo.
alter function public.operacao_resolver_ocorrencia(uuid,text,text) rename to operacao_resolver_ocorrencia_sem_acervo;
revoke all on function public.operacao_resolver_ocorrencia_sem_acervo(uuid,text,text) from public,anon,authenticated;
create function public.operacao_resolver_ocorrencia(p_id uuid,p_destino text,p_motivo text) returns void language plpgsql security definer set search_path=public as $$
declare o operacao_ocorrencias;begin
 select * into strict o from operacao_ocorrencias where id=p_id;
 if not eh_membro_empresa(o.empresa_id) or not funcionario_tabela_permitida(o.empresa_id,'itens','editar') then raise exception 'Sem permissao para resolver ocorrencias';end if;
 perform pg_advisory_xact_lock(hashtextextended(o.empresa_id::text,0));
 if p_destino='perda' and exists(select 1 from acervo_retornos a where a.pedido_id=o.pedido_id and a.item_id=o.item_id) then raise exception 'Registre a baixa no Retorno do acervo para evitar duplicidade';end if;
 perform operacao_resolver_ocorrencia_sem_acervo(p_id,p_destino,p_motivo);
end $$;
revoke all on function public.operacao_resolver_ocorrencia(uuid,text,text) from public,anon;
grant execute on function public.operacao_resolver_ocorrencia(uuid,text,text) to authenticated;

create function public.acervo_movimentar(p_empresa uuid,p_id uuid,p_versao integer,p_destino text,p_motivo text,p_custo numeric default 0) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;saldo numeric;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para movimentar o acervo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where id=p_id and empresa_id=p_empresa for update;
 if r.versao is distinct from p_versao then raise exception 'Outro usuário atualizou esta ocorrência';end if;
 if length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo ou resultado da inspeção';end if;
 if p_custo is null or p_custo<0 or p_custo::text in ('NaN','Infinity','-Infinity') then raise exception 'Custo inválido';end if;
 if not ((r.estado='triagem' and p_destino in ('limpeza','reparo','inspecao')) or(r.estado in ('limpeza','reparo') and p_destino='inspecao')
  or(r.estado='inspecao' and p_destino in ('liberado','reparo','baixado')) or(r.estado='investigacao' and p_destino in ('triagem','baixado'))) then raise exception 'Transição de acervo inválida';end if;
 if p_destino='baixado' then
  select estoque_total into saldo from itens where id=r.item_id and empresa_id=p_empresa for update;
  if saldo<r.quantidade then raise exception 'Saldo insuficiente para confirmar a baixa';end if;
  update itens set estoque_total=estoque_total-r.quantidade where id=r.item_id and empresa_id=p_empresa;
 elsif p_destino='liberado' then
  insert into qualidade_inspecoes(empresa_id,item_id,criado_por,dados) values(p_empresa,r.item_id,auth.uid(),jsonb_build_object('status','Aprovado','origem','retorno','retorno_id',r.id,'quantidade',r.quantidade,'observacao',p_motivo,'data',now()));
 end if;
 update acervo_retornos set estado=p_destino,motivo=p_motivo,custo=custo+round(p_custo,2),versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id returning * into r;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,custo,usuario_id) values(p_empresa,r.id,p_destino,p_motivo,p_custo,auth.uid());
 return to_jsonb(r);
end $$;

-- Por pedido, considera o maior bloqueio físico: etiquetas em trânsito OU peças em tratamento.
create or replace function public.operacao_indisponiveis(p_empresa uuid,p_data date) returns table(item_id uuid,quantidade numeric)
language sql stable security definer set search_path=public as $$
 with transito as(select e.item_id,p.id pedido_id,greatest(count(*)::numeric-coalesce((select sum(a.quantidade) from acervo_retornos a where a.pedido_id=p.id and a.item_id=e.item_id and a.estado='baixado'),0),0) qtd from separacoes_etiquetas e join separacoes_pedidos p on p.id=e.separacao_pedido_id
  where p.empresa_id=p_empresa and eh_membro_empresa(p_empresa) and e.lida_carregamento_em is not null and e.lida_retorno_em is null
  and coalesce(p.data_coleta,p.data_evento)<p_data
  and not exists(select 1 from operacao_ocorrencias o where o.pedido_id=p.id and o.codigo=e.codigo and o.resolucao like 'Perda confirmada:%')
  group by e.item_id,p.id),
 tratamento as(select a.item_id,a.pedido_id,sum(a.quantidade) qtd from acervo_retornos a where a.empresa_id=p_empresa and eh_membro_empresa(p_empresa) and a.estado not in ('liberado','baixado') group by a.item_id,a.pedido_id),
 fisico as(select coalesce(t.item_id,a.item_id) item_id,greatest(coalesce(t.qtd,0),coalesce(a.qtd,0)) qtd from transito t full join tratamento a on a.item_id=t.item_id and a.pedido_id=t.pedido_id),
 tudo as(select * from fisico union all select o.item_id,o.quantidade from operacao_ocorrencias o where o.empresa_id=p_empresa and eh_membro_empresa(p_empresa) and o.resolvida_em is null and o.tipo in ('avaria','limpeza','manutencao'))
 select item_id,sum(qtd) from tudo group by item_id;
$$;

create function public.acervo_inventario_criar(p_empresa uuid,p_nome text,p_itens uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para inventariar';end if;
 if length(btrim(coalesce(p_nome,'')))<3 or coalesce(cardinality(p_itens),0)=0 then raise exception 'Informe o nome e os itens da contagem';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 if exists(select 1 from unnest(p_itens) x where not exists(select 1 from itens where id=x and empresa_id=p_empresa)) then raise exception 'Item fora da empresa';end if;
 if exists(select 1 from itens i where id=any(p_itens) and lower(to_jsonb(i)->>'tipo')='kit') then raise exception 'Conte os componentes fisicos do kit individualmente';end if;
 if exists(select 1 from acervo_inventario_itens c join acervo_inventarios i on i.id=c.inventario_id where c.empresa_id=p_empresa and c.item_id=any(p_itens) and i.status='contagem') then raise exception 'Há itens em outro inventário aberto';end if;
 insert into acervo_inventarios(empresa_id,nome,criado_por) values(p_empresa,p_nome,auth.uid()) returning id into v;
 insert into acervo_inventario_itens(inventario_id,empresa_id,item_id,saldo_base) select v,p_empresa,id,coalesce(estoque_total,0) from itens where empresa_id=p_empresa and id=any(p_itens);
 return v;
end $$;
create function public.acervo_inventario_contar(p_empresa uuid,p_id uuid,p_item uuid,p_versao integer,p_contado numeric,p_motivo text) returns void language plpgsql security definer set search_path=public as $$
declare i acervo_inventarios;c acervo_inventario_itens;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para contar';end if;
 select * into strict i from acervo_inventarios where id=p_id and empresa_id=p_empresa for update;
 if i.status<>'contagem' then raise exception 'Inventário encerrado';end if;
 select * into strict c from acervo_inventario_itens where inventario_id=p_id and item_id=p_item for update;
 if c.versao is distinct from p_versao then raise exception 'Contagem alterada por outro usuário';end if;
 if p_contado is null or p_contado<0 or p_contado<>trunc(p_contado) or p_contado::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida';end if;
 if p_contado<>c.saldo_base and length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Justifique a diferença de contagem';end if;
 update acervo_inventario_itens set contado=p_contado,motivo=coalesce(p_motivo,''),contado_por=auth.uid(),contado_em=now(),versao=versao+1 where inventario_id=p_id and item_id=p_item;
end $$;
create function public.acervo_inventario_aprovar(p_empresa uuid,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare i acervo_inventarios;c record;saldo numeric;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'estoque.itens.editar') then raise exception 'Sem permissão para aprovar ajustes de estoque';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict i from acervo_inventarios where id=p_id and empresa_id=p_empresa for update;
 if i.status<>'contagem' then raise exception 'Inventário já encerrado';end if;
 if exists(select 1 from acervo_inventario_itens where inventario_id=p_id and contado is null) then raise exception 'Conclua todas as contagens';end if;
 for c in select * from acervo_inventario_itens where inventario_id=p_id order by item_id loop
  select estoque_total into saldo from itens where id=c.item_id and empresa_id=p_empresa for update;
  if saldo is distinct from c.saldo_base then raise exception 'O estoque mudou durante a contagem. Reabra o inventário com um saldo atualizado';end if;
  if c.contado<coalesce((select quantidade from operacao_indisponiveis(p_empresa,current_date) where item_id=c.item_id),0) then raise exception 'A contagem nao pode ficar abaixo das pecas bloqueadas ou em tratamento';end if;
  if exists(select 1 from separacoes_itens s join separacoes_pedidos p on p.id=s.separacao_pedido_id where s.item_id=c.item_id and p.empresa_id=p_empresa and p.encerrado_operacional_em is null and p.status_comercial in ('aprovado','enviado','finalizado') and p.operacao->'retorno'->>'concluido_em' is null and p.status<>'cancelado') and c.contado<c.saldo_base then raise exception 'Há reservas ou peças em circulação. Resolva a diferença antes de reduzir o estoque';end if;
  update itens set estoque_total=c.contado where id=c.item_id and empresa_id=p_empresa;
 end loop;
 update acervo_inventarios set status='aprovado',aprovado_por=auth.uid(),aprovado_em=now() where id=p_id;
end $$;

create function public.logistica_evidencia_registrar(p_id uuid,p_empresa uuid,p_pedido uuid,p_etapa text,p_chave text,p_path text,p_descricao text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;v logistica_evidencias;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'separacoes_pedidos','editar') then raise exception 'Sem permissão para anexar evidências';end if;
 select * into strict p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 select * into v from logistica_evidencias where id=p_id;
 if found then if v.empresa_id<>p_empresa or v.pedido_id<>p_pedido or v.criado_por<>auth.uid() or v.etapa is distinct from p_etapa or v.chave is distinct from p_chave or v.path is distinct from p_path then raise exception 'Evidência já utilizada';end if;return v.id;end if;
 if pedido_fluxo_etapa(p)<>p_etapa then raise exception 'A etapa do pedido mudou. Revise a evidência antes de anexar';end if;
 if p_path<>p_empresa::text||'/'||p_pedido::text||'/'||p_id::text||'.jpg' then raise exception 'Caminho de evidência inválido';end if;
 if not exists(select 1 from jsonb_array_elements(logistica_confirmacao_base(p.id,p_etapa)->'itens') x where x->>'chave'=p_chave) then raise exception 'Item não pertence à conferência';end if;
 if not exists(select 1 from storage.objects where bucket_id='evidencias-operacionais' and name=p_path) then raise exception 'Envie a foto antes de registrar';end if;
 insert into logistica_evidencias values(p_id,p_empresa,p_pedido,p_etapa,p_chave,p_path,left(coalesce(p_descricao,''),500),auth.uid(),coalesce(auth.jwt()->'user_metadata'->>'nome',auth.jwt()->>'email',auth.uid()::text),now());return p_id;
end $$;
create function public.logistica_evidencia_acesso(p_path text,p_editar boolean) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from separacoes_pedidos p where p.empresa_id::text=split_part(p_path,'/',1) and p.id::text=split_part(p_path,'/',2) and eh_membro_empresa(p.empresa_id) and auth.uid() is not null and
 case when p_editar then funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') else funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') or funcionario_tabela_permitida(p.empresa_id,'itens','select') or fin_pode(p.empresa_id,'financeiro.fluxo.visualizar') end);
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidencias-operacionais','evidencias-operacionais',false,8388608,array['image/jpeg']) on conflict(id) do nothing;
create policy evidencias_enviar on storage.objects for insert to authenticated with check(bucket_id='evidencias-operacionais' and logistica_evidencia_acesso(name,true));
create policy evidencias_ler on storage.objects for select to authenticated using(bucket_id='evidencias-operacionais' and logistica_evidencia_acesso(name,false));
revoke all on function logistica_evidencia_acesso(text,boolean) from public,anon;grant execute on function logistica_evidencia_acesso(text,boolean) to authenticated;
revoke all on function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric),public.acervo_inventario_criar(uuid,text,uuid[]),public.acervo_inventario_contar(uuid,uuid,uuid,integer,numeric,text),public.acervo_inventario_aprovar(uuid,uuid),public.logistica_evidencia_registrar(uuid,uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric),public.acervo_inventario_criar(uuid,text,uuid[]),public.acervo_inventario_contar(uuid,uuid,uuid,integer,numeric,text),public.acervo_inventario_aprovar(uuid,uuid),public.logistica_evidencia_registrar(uuid,uuid,uuid,text,text,text,text) to authenticated;
notify pgrst,'reload schema';

-- A consulta comercial usa o mesmo bloqueio fisico que valida a reserva.
do $patch$ declare f text;begin
 if to_regprocedure('public.pedido_estoque_detalhes(uuid,uuid,date)') is not null then
  f:=pg_get_functiondef('public.pedido_estoque_detalhes(uuid,uuid,date)'::regprocedure);
  f:=replace(f,'coalesce((select sum(b.quantidade) from bloqueios b where b.item_id=c.item_id),0) bloqueado','coalesce((select b.quantidade from operacao_indisponiveis(p_empresa_id,p_data) b where b.item_id=c.item_id),0) bloqueado');
  f:=replace(f,'), disponibilidade as (',$inject$
    union all
    select a.item_id,a.pedido_id,p.numero_pedido::text,'Acervo: '||a.estado,a.quantidade from acervo_retornos a join separacoes_pedidos p on p.id=a.pedido_id
    where a.empresa_id=p_empresa_id and a.estado not in ('liberado','baixado')
  ), disponibilidade as ($inject$);
  execute f;
 end if;
end $patch$;
