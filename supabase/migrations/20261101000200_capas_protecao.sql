-- Capas são conferidas por modelo físico, separadamente das peças e das etiquetas de envio.
create table public.capas_modelos(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 item_id uuid not null references itens(id),nome text not null,usa_capa boolean not null,
 unidades_por_capa integer not null default 1 check(unidades_por_capa between 1 and 10000),
 estoque_conferido_em timestamptz,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 unique(empresa_id,item_id));
create table public.capas_contagens(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 pedido_id uuid not null references separacoes_pedidos(id),pedido_conferencia_id uuid not null references separacoes_pedidos(id),
 item_id uuid not null references itens(id),modelo_id uuid not null references capas_modelos(id),
 etapa text not null check(etapa in ('triagem','carregamento','descarregamento','retorno')),
 capacidade integer not null check(capacidade>0),esperado integer check(esperado>=0),
 quantidade integer not null check(quantidade between 0 and 1000000),danificadas integer not null default 0 check(danificadas>=0 and danificadas<=quantidade),
 observacao text not null default '' check(length(observacao)<=500),usuario_id uuid not null,
 contado_em timestamptz not null default now(),concluida_em timestamptz,versao bigint not null default 1,unique(pedido_id,item_id,etapa));
create table public.capas_movimentos(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),modelo_id uuid not null references capas_modelos(id),
 tipo text not null check(tipo in ('fabricacao','inventario','manutencao','reparo','perda','perda_manutencao','perda_pedido')),
 quantidade integer not null check(quantidade between 0 and 1000000),delta_disponivel integer not null,delta_manutencao integer not null,
 pedido_id uuid references separacoes_pedidos(id),data date not null,observacao text not null check(length(observacao) between 3 and 500),
 usuario_id uuid not null,criado_em timestamptz not null default now(),chave uuid not null,unique(empresa_id,chave));
create table public.capas_historico(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),modelo_id uuid not null references capas_modelos(id),
 pedido_id uuid references separacoes_pedidos(id),etapa text,acao text not null,detalhes jsonb not null default '{}',
 usuario_id uuid,criado_em timestamptz not null default now());
create index capas_contagens_modelo on capas_contagens(modelo_id,etapa) where concluida_em is not null;
create index capas_historico_modelo on capas_historico(modelo_id,criado_em desc);

create function public.capas_pode(p_empresa uuid,p_editar boolean default false) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and seguranca_2fa_ok() and
 (operacao_pode(p_empresa,'configuracoes.empresa.editar') or
 funcionario_tabela_permitida(p_empresa,'itens',case when p_editar then 'editar' else 'select' end)
 or (not p_editar and (funcionario_tabela_permitida(p_empresa,'separacoes_itens','select') or funcionario_tabela_permitida(p_empresa,'separacoes_pedidos','select'))));
$$;
revoke all on function capas_pode(uuid,boolean) from public,anon;
grant execute on function capas_pode(uuid,boolean) to authenticated;
alter table capas_modelos enable row level security;
alter table capas_contagens enable row level security;
alter table capas_movimentos enable row level security;
alter table capas_historico enable row level security;
create policy capas_modelos_ler on capas_modelos for select to authenticated using(capas_pode(empresa_id));
create policy capas_contagens_ler on capas_contagens for select to authenticated using(capas_pode(empresa_id));
create policy capas_movimentos_ler on capas_movimentos for select to authenticated using(capas_pode(empresa_id));
create policy capas_historico_ler on capas_historico for select to authenticated using(capas_pode(empresa_id));
grant select on capas_modelos,capas_contagens,capas_movimentos,capas_historico to authenticated;
revoke insert,update,delete on capas_modelos,capas_contagens,capas_movimentos,capas_historico from anon,authenticated;

create function public.capas_configurar(p_empresa uuid,p_item uuid,p_usa_capa boolean,p_capacidade integer default 1,p_nome text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m capas_modelos;i itens;
begin
 if not capas_pode(p_empresa,true) then raise exception 'Sem permissão para configurar capas';end if;
 select * into i from itens where id=p_item and empresa_id=p_empresa;
 if not found then raise exception 'Item não encontrado nesta empresa';end if;
 if lower(coalesce(i.tipo,''))='kit' and exists(select 1 from kit_itens where kit_id=i.id) then
  raise exception 'Configure as capas nos componentes físicos do kit';end if;
 if p_usa_capa is null or p_capacidade is null or p_capacidade not between 1 and 10000 then raise exception 'Confira o uso e a capacidade da capa';end if;
 insert into capas_modelos(empresa_id,item_id,nome,usa_capa,unidades_por_capa)
 values(p_empresa,p_item,left(coalesce(nullif(trim(p_nome),''),'Capa · '||coalesce(i.produto,i.descricao_total,'Item')),180),p_usa_capa,p_capacidade)
 on conflict(empresa_id,item_id) do update set nome=excluded.nome,usa_capa=excluded.usa_capa,unidades_por_capa=excluded.unidades_por_capa,atualizado_em=now() returning * into m;
 insert into capas_historico(empresa_id,modelo_id,acao,detalhes,usuario_id)
 values(p_empresa,m.id,'configuracao',jsonb_build_object('usa_capa',p_usa_capa,'unidades_por_capa',p_capacidade,'nome',m.nome),auth.uid());
 return to_jsonb(m);
end $$;
revoke all on function capas_configurar(uuid,uuid,boolean,integer,text) from public,anon;
grant execute on function capas_configurar(uuid,uuid,boolean,integer,text) to authenticated;

-- Função interna: usa os componentes dos kits e agrupa linhas do mesmo item dentro do mesmo pedido.
create function public.capas_pedido_base(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;grupo boolean;fechado boolean;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 grupo:=p_etapa in ('retorno','descarregamento');
 fechado:=case when p_etapa='triagem' then p.status in ('separado','divergencia') else p.operacao->p_etapa->>'concluido_em' is not null end;
 return (with fisicas as (
  select pc.pedido_id,pc.item_id,min(pc.nome) nome,sum(pc.esperado) pecas,jsonb_agg(pc.chave) chaves
  from operacao_conferencia_pecas(p.id,grupo) pc group by pc.pedido_id,pc.item_id
 ), base as (
  select f.*,m.id cadastro_id,m.usa_capa,m.nome modelo_nome,m.unidades_por_capa,
   c.id contagem_id,c.modelo_id salvo_modelo,c.capacidade salva_capacidade,c.esperado salvo_esperado,c.quantidade,c.danificadas,c.observacao,c.concluida_em,c.versao,
   saida.modelo_id saida_modelo,saida.capacidade saida_capacidade,saida.quantidade enviadas,saida.esperado previsto_saida,saida.concluida_em saida_concluida,
   tri.modelo_id tri_modelo,tri.capacidade tri_capacidade
  from fisicas f left join capas_modelos m on m.item_id=f.item_id and m.empresa_id=p.empresa_id
  left join capas_contagens c on c.pedido_id=f.pedido_id and c.item_id=f.item_id and c.etapa=p_etapa
  left join capas_contagens saida on saida.pedido_id=f.pedido_id and saida.item_id=f.item_id and saida.etapa='carregamento'
  left join capas_contagens tri on tri.pedido_id=f.pedido_id and tri.item_id=f.item_id and tri.etapa='triagem'
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'chave',pedido_id::text||'|'||item_id::text,'pedido_id',pedido_id,'item_id',item_id,'nome',nome,'pecas',pecas,'chaves',chaves,
  'modelo_id',coalesce(salvo_modelo,case when grupo then saida_modelo when p_etapa='carregamento' then tri_modelo end,cadastro_id),
  'modelo_nome',modelo_nome,'configurado',cadastro_id is not null or salvo_modelo is not null or saida_modelo is not null,
  'usa_capa',salvo_modelo is not null or (grupo and saida_modelo is not null) or (p_etapa='carregamento' and tri_modelo is not null) or coalesce(usa_capa,false),
  'capacidade',coalesce(salva_capacidade,case when grupo then saida_capacidade when p_etapa='carregamento' then tri_capacidade end,unidades_por_capa,1),
  'esperado',case when contagem_id is not null then salvo_esperado when grupo then case when saida_concluida is not null then enviadas end
   else ceil(pecas/coalesce(case when p_etapa='carregamento' then tri_capacidade end,unidades_por_capa,1))::integer end,
  'enviadas',case when saida_concluida is not null then enviadas end,'previsto_saida',previsto_saida,'quantidade',quantidade,'danificadas',coalesce(danificadas,0),'observacao',coalesce(observacao,''),
  'concluida',fechado,'contagem_id',contagem_id,'versao',coalesce(versao,0)
 ) order by nome,pedido_id),'[]') from base);
end $$;
revoke all on function capas_pedido_base(uuid,text) from public,anon,authenticated;

create function public.capas_pedido(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare emp uuid;
begin
 select empresa_id into emp from separacoes_pedidos where id=p_pedido;
 if p_etapa not in ('triagem','carregamento','descarregamento','retorno') or not capas_pode(emp) then raise exception 'Sem acesso à conferência de capas';end if;
 return capas_pedido_base(p_pedido,p_etapa);
end $$;
revoke all on function capas_pedido(uuid,text) from public,anon;
grant execute on function capas_pedido(uuid,text) to authenticated;

create function public.capas_contagem_salvar(p_pedido uuid,p_etapa text,p_contagens jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;b jsonb;x jsonb;r jsonb;antes capas_contagens;q integer;d integer;mid uuid;meus jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not seguranca_2fa_ok()
  or not funcionario_tabela_permitida(p.empresa_id,case when p_etapa='triagem' then 'separacoes_itens' else 'separacoes_pedidos' end,'editar') then raise exception 'Sem permissão para conferir capas';end if;
 if p_etapa not in ('triagem','carregamento','descarregamento','retorno') then raise exception 'Etapa inválida';end if;
 if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada';end if;
 if p_etapa<>'triagem' then perform operacao_validar_etapa(p,p_etapa);end if;
 if jsonb_typeof(p_contagens) is distinct from 'array' or jsonb_array_length(p_contagens)>2000 then raise exception 'Contagens inválidas';end if;
 b:=capas_pedido_base(p_pedido,p_etapa);
 for x in select * from jsonb_array_elements(p_contagens) loop
  r:=null;select value into r from jsonb_array_elements(b) where value->>'chave'=x->>'chave';
  if r is null or not (r->>'usa_capa')::boolean then raise exception 'Item sem capa configurada ou fora deste pedido';end if;
  if p_etapa='triagem' then
   meus:=separacao_meus_setores(p.empresa_id);
   if meus is not null and not (meus ? separacao_setor_item((r->>'item_id')::uuid)) then raise exception 'Este item pertence a outro setor de estoque';end if;
  end if;
  if (r->>'concluida')::boolean then raise exception 'Etapa já concluída; reabra a etapa para corrigir a contagem';end if;
  if coalesce(x->>'quantidade','')!~'^\d{1,7}$' or coalesce(x->>'danificadas','0')!~'^\d{1,7}$' then raise exception 'Informe quantidades inteiras de capas';end if;
  q:=(x->>'quantidade')::integer;d:=coalesce((x->>'danificadas')::integer,0);
  if q>1000000 or d>q then raise exception 'A quantidade danificada não pode ultrapassar o total contado';end if;
  mid:=(r->>'modelo_id')::uuid;
  select * into antes from capas_contagens where pedido_id=(r->>'pedido_id')::uuid and item_id=(r->>'item_id')::uuid and etapa=p_etapa for update;
  if coalesce((x->>'versao')::bigint,0)<>coalesce(antes.versao,0) then raise exception 'A contagem de capas foi alterada por outra pessoa. Atualize antes de conferir novamente';end if;
  insert into capas_contagens(empresa_id,pedido_id,pedido_conferencia_id,item_id,modelo_id,etapa,capacidade,esperado,quantidade,danificadas,observacao,usuario_id)
  values(p.empresa_id,(r->>'pedido_id')::uuid,p.id,(r->>'item_id')::uuid,mid,p_etapa,(r->>'capacidade')::integer,(r->>'esperado')::integer,q,d,left(coalesce(x->>'observacao',''),500),auth.uid())
  on conflict(pedido_id,item_id,etapa) do update set quantidade=excluded.quantidade,danificadas=excluded.danificadas,observacao=excluded.observacao,usuario_id=excluded.usuario_id,contado_em=now(),versao=capas_contagens.versao+1;
  if antes.id is null or (antes.quantidade,antes.danificadas,antes.observacao) is distinct from (q,d,left(coalesce(x->>'observacao',''),500)) then
   insert into capas_historico(empresa_id,modelo_id,pedido_id,etapa,acao,detalhes,usuario_id)
   values(p.empresa_id,mid,(r->>'pedido_id')::uuid,p_etapa,'contagem',jsonb_build_object('antes',case when antes.id is not null then to_jsonb(antes) end,'quantidade',q,'danificadas',d,'esperado',r->'esperado','observacao',left(coalesce(x->>'observacao',''),500)),auth.uid());
  end if;
 end loop;
 return capas_pedido_base(p_pedido,p_etapa);
end $$;
revoke all on function capas_contagem_salvar(uuid,text,jsonb) from public,anon;
grant execute on function capas_contagem_salvar(uuid,text,jsonb) to authenticated;

-- A contagem só movimenta o saldo quando a etapa principal é concluída, na mesma transação.
-- Descarregamento e Triagem da volta são independentes; somente a Triagem da volta devolve saldo disponível.
create function public.capas_conclusao() returns trigger language plpgsql security definer set search_path=public as $$
declare v_etapa text;terminou boolean;reabriu boolean;r jsonb;b jsonb;
begin
 foreach v_etapa in array array['triagem','carregamento','descarregamento','retorno'] loop
  terminou:=case when v_etapa='triagem' then new.status in ('separado','divergencia') and old.status not in ('separado','divergencia')
   else new.operacao->v_etapa->>'concluido_em' is not null and (new.operacao->v_etapa->>'concluido_em') is distinct from (old.operacao->v_etapa->>'concluido_em') end;
  reabriu:=case when v_etapa='triagem' then old.status in ('separado','divergencia') and new.status not in ('separado','divergencia')
   else old.operacao->v_etapa->>'concluido_em' is not null and new.operacao->v_etapa->>'concluido_em' is null end;
  if terminou then
   b:=capas_pedido_base(new.id,v_etapa);
   for r in select * from jsonb_array_elements(b) where (value->>'usa_capa')::boolean loop
    if r->>'quantidade' is null then raise exception 'Informe a contagem de capas de proteção de todos os modelos (0 quando não houver)';end if;
   end loop;
   insert into capas_historico(empresa_id,modelo_id,pedido_id,etapa,acao,detalhes,usuario_id)
    select c.empresa_id,c.modelo_id,c.pedido_id,v_etapa,'conclusao',jsonb_build_object('quantidade',c.quantidade,'danificadas',c.danificadas,'esperado',c.esperado),auth.uid()
    from capas_contagens c where c.etapa=v_etapa and c.pedido_id=any(case when v_etapa in ('descarregamento','retorno') then pedido_grupo(new.id) else array[new.id] end) and c.concluida_em is null;
   update capas_contagens c set concluida_em=now() where c.etapa=v_etapa and c.pedido_id=any(case when v_etapa in ('descarregamento','retorno') then pedido_grupo(new.id) else array[new.id] end);
  elsif reabriu then
   insert into capas_historico(empresa_id,modelo_id,pedido_id,etapa,acao,detalhes,usuario_id)
    select c.empresa_id,c.modelo_id,c.pedido_id,v_etapa,'reabertura','{}',auth.uid() from capas_contagens c where c.pedido_id=any(case when v_etapa in ('descarregamento','retorno') then pedido_grupo(new.id) else array[new.id] end) and c.etapa=v_etapa and c.concluida_em is not null;
   update capas_contagens c set concluida_em=null where c.pedido_id=any(case when v_etapa in ('descarregamento','retorno') then pedido_grupo(new.id) else array[new.id] end) and c.etapa=v_etapa;
  end if;
 end loop;
 return new;
end $$;
revoke all on function capas_conclusao() from public,anon,authenticated;
create trigger capas_concluir before update of status,operacao on separacoes_pedidos for each row execute function capas_conclusao();

create function public.capas_saldo(p_modelo uuid) returns jsonb language sql security definer set search_path=public as $$
 with mov as(select coalesce(sum(delta_disponivel),0) disponivel,coalesce(sum(delta_manutencao),0) manutencao,
  coalesce(sum(quantidade) filter(where tipo='perda_pedido'),0) perdas_pedido,max(data) filter(where tipo='fabricacao') ultima_fabricacao from capas_movimentos where modelo_id=p_modelo),
 cont as(select coalesce(sum(quantidade) filter(where etapa='carregamento'),0) enviadas,
 coalesce(sum(quantidade) filter(where etapa='retorno'),0) retornadas,coalesce(sum(danificadas) filter(where etapa='retorno'),0) danificadas
 from capas_contagens where modelo_id=p_modelo and concluida_em is not null)
 select jsonb_build_object('disponivel',mov.disponivel-cont.enviadas+cont.retornadas-cont.danificadas,
 'manutencao',mov.manutencao+cont.danificadas,'em_pedidos',greatest(0,cont.enviadas-cont.retornadas-mov.perdas_pedido),'ultima_fabricacao',mov.ultima_fabricacao) from mov,cont;
$$;
revoke all on function capas_saldo(uuid) from public,anon,authenticated;

create function public.capas_estoque(p_empresa uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not capas_pode(p_empresa) then raise exception 'Sem acesso às capas de proteção';end if;
 return (select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('item_nome',coalesce(i.descricao_total,i.produto),'foto_url',i.foto_url,'saldo',capas_saldo(m.id)) order by m.nome),'[]') from capas_modelos m join itens i on i.id=m.item_id and i.empresa_id=m.empresa_id where m.empresa_id=p_empresa);
end $$;
revoke all on function capas_estoque(uuid) from public,anon;
grant execute on function capas_estoque(uuid) to authenticated;

create function public.capas_movimentar(p_empresa uuid,p_modelo uuid,p_tipo text,p_quantidade integer,p_data date,p_observacao text,p_chave uuid,p_pedido uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m capas_modelos;s jsonb;dd integer:=0;dm integer:=0;fora integer;
begin
 if not capas_pode(p_empresa,true) then raise exception 'Sem permissão para movimentar capas';end if;
 select * into m from capas_modelos where id=p_modelo and empresa_id=p_empresa for update;
 if not found then raise exception 'Modelo de capa não encontrado';end if;
 if not m.usa_capa and p_tipo='fabricacao' then raise exception 'Ative o uso de capa neste modelo antes de registrar fabricação';end if;
 if p_quantidade is null or p_quantidade not between 0 and 1000000 or p_chave is null or p_data is null or p_data>current_date or length(trim(coalesce(p_observacao,''))) not between 3 and 500 then raise exception 'Confira quantidade, data e descrição da movimentação';end if;
 if exists(select 1 from capas_movimentos where empresa_id=p_empresa and chave=p_chave) then return capas_saldo(m.id);end if;
 s:=capas_saldo(m.id);
 case p_tipo
 when 'fabricacao' then dd:=p_quantidade;
 when 'inventario' then dd:=p_quantidade-(s->>'disponivel')::integer;
 when 'manutencao' then dd:=-p_quantidade;dm:=p_quantidade;
 when 'reparo' then dd:=p_quantidade;dm:=-p_quantidade;
 when 'perda' then dd:=-p_quantidade;
 when 'perda_manutencao' then dm:=-p_quantidade;
 when 'perda_pedido' then
  if not exists(select 1 from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa) then raise exception 'Pedido inválido';end if;
  select coalesce(sum(case when etapa='carregamento' then quantidade when etapa='retorno' then -quantidade else 0 end),0) into fora from capas_contagens where modelo_id=m.id and pedido_id=p_pedido and concluida_em is not null;
  fora:=fora-coalesce((select sum(quantidade) from capas_movimentos where modelo_id=m.id and pedido_id=p_pedido and tipo='perda_pedido'),0);
  if p_quantidade>fora then raise exception 'A perda excede as capas não devolvidas deste pedido';end if;
 else raise exception 'Tipo de movimentação inválido';end case;
 if p_tipo<>'inventario' and p_quantidade=0 then raise exception 'Informe uma quantidade maior que zero';end if;
 if p_tipo in ('manutencao','perda') and (s->>'disponivel')::integer<p_quantidade then raise exception 'Saldo disponível insuficiente; confira o estoque antes de movimentar';end if;
 if p_tipo in ('reparo','perda_manutencao') and (s->>'manutencao')::integer<p_quantidade then raise exception 'Saldo em manutenção insuficiente';end if;
 insert into capas_movimentos(empresa_id,modelo_id,tipo,quantidade,delta_disponivel,delta_manutencao,pedido_id,data,observacao,usuario_id,chave)
 values(p_empresa,m.id,p_tipo,p_quantidade,dd,dm,p_pedido,p_data,trim(p_observacao),auth.uid(),p_chave);
 if p_tipo='inventario' then update capas_modelos set estoque_conferido_em=now() where id=m.id;end if;
 return capas_saldo(m.id);
end $$;
revoke all on function capas_movimentar(uuid,uuid,text,integer,date,text,uuid,uuid) from public,anon;
grant execute on function capas_movimentar(uuid,uuid,text,integer,date,text,uuid,uuid) to authenticated;

create function public.capas_historico_listar(p_empresa uuid,p_modelo uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not capas_pode(p_empresa) or not exists(select 1 from capas_modelos where id=p_modelo and empresa_id=p_empresa) then raise exception 'Sem acesso ao histórico de capas';end if;
 return jsonb_build_object('movimentos',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from capas_movimentos where empresa_id=p_empresa and modelo_id=p_modelo order by criado_em desc limit 200)x),
 'conferencias',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('pedido_numero',p.numero_pedido)),'[]') from capas_contagens c join separacoes_pedidos p on p.id=c.pedido_id where c.empresa_id=p_empresa and c.modelo_id=p_modelo),
 'alteracoes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from capas_historico where empresa_id=p_empresa and modelo_id=p_modelo order by criado_em desc limit 300)x));
end $$;
revoke all on function capas_historico_listar(uuid,uuid) from public,anon;
grant execute on function capas_historico_listar(uuid,uuid) to authenticated;
