-- Historico imutavel de quantidades. Nao altera saldos nem duplica retorno e conferencia.
create table public.item_historico_quantidades (
 id bigint generated always as identity primary key,
 empresa_id uuid not null references public.empresas(id), item_id uuid not null,
 tipo text not null, natureza text not null check(natureza in ('patrimonio','galpao','informacao')),
 quantidade numeric not null default 0, variacao numeric,
 saldo_antes numeric, saldo_depois numeric, esperado numeric, contado numeric, diferenca numeric,
 pedido_id uuid, pedido_numero text, origem text not null, chave text not null,
 responsavel text not null default 'Sistema', registrado_em timestamptz not null default clock_timestamp(),
 detalhes jsonb not null default '{}', unique(empresa_id,item_id,chave)
);
create index item_historico_quantidades_busca on public.item_historico_quantidades(empresa_id,item_id,registrado_em desc,id desc);
alter table public.item_historico_quantidades enable row level security;
revoke all on public.item_historico_quantidades from public,anon,authenticated;
grant select on public.item_historico_quantidades to authenticated;
create policy item_historico_quantidades_ler on public.item_historico_quantidades for select to authenticated
 using(auth.uid() is not null and eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,'itens','select'));
create policy seguranca_2fa on public.item_historico_quantidades as restrictive for all to authenticated using((select seguranca_2fa_ok()));

create table public.item_historico_fluxos(
 empresa_id uuid not null,item_id uuid not null,pedido_id uuid not null,fluxo text not null,
 quantidade numeric not null default 0, primary key(empresa_id,item_id,pedido_id,fluxo)
);
alter table public.item_historico_fluxos enable row level security;
revoke all on public.item_historico_fluxos from public,anon,authenticated;

create function public.item_historico_gravar(p_empresa uuid,p_item uuid,p_evento jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from itens where id=p_item and empresa_id=p_empresa) then return;end if;
 insert into item_historico_quantidades(empresa_id,item_id,tipo,natureza,quantidade,variacao,saldo_antes,saldo_depois,esperado,contado,diferenca,pedido_id,pedido_numero,origem,chave,responsavel,registrado_em,detalhes)
 values(p_empresa,p_item,p_evento->>'tipo',coalesce(p_evento->>'natureza','informacao'),coalesce((p_evento->>'quantidade')::numeric,0),(p_evento->>'variacao')::numeric,
 (p_evento->>'saldo_antes')::numeric,(p_evento->>'saldo_depois')::numeric,(p_evento->>'esperado')::numeric,(p_evento->>'contado')::numeric,(p_evento->>'diferenca')::numeric,
 (p_evento->>'pedido_id')::uuid,p_evento->>'pedido_numero',p_evento->>'origem',p_evento->>'chave',
 coalesce(nullif(p_evento->>'responsavel',''),nullif(auth.jwt()->'user_metadata'->>'nome',''),auth.jwt()->>'email','Sistema'),coalesce((p_evento->>'em')::timestamptz,clock_timestamp()),coalesce(p_evento->'detalhes','{}'))
 on conflict(empresa_id,item_id,chave) do nothing;
end $$;
revoke all on function public.item_historico_gravar(uuid,uuid,jsonb) from public,anon,authenticated;

-- Prefere as contagens confirmadas. O fallback QR cobre pedidos anteriores sem o array de itens.
create function public.item_historico_pecas(p_empresa uuid,p_pedido uuid,p_operacao jsonb,p_etapa text)
returns table(item_id uuid,quantidade numeric,esperado numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 with dados as(select case when jsonb_typeof(p_operacao->p_etapa->'itens')='array' then p_operacao->p_etapa->'itens' else '[]'::jsonb end lista),
 linhas as(select coalesce(nullif(x->>'item_id',''),nullif(split_part(x->>'chave','|',2),'')) id,
 coalesce((x->>'conferido')::numeric,0) q,coalesce((x->>'esperado')::numeric,0) e from dados,jsonb_array_elements(lista) x),
 qr as(select t.item_id,count(*) filter(where case p_etapa when 'carregamento' then t.lida_carregamento_em is not null when 'retorno' then t.lida_retorno_em is not null else t.lida_descarregamento_em is not null end)::numeric q,
 count(*) filter(where p_etapa='carregamento' or t.lida_carregamento_em is not null)::numeric e
 from separacoes_etiquetas t where t.empresa_id=p_empresa and t.separacao_pedido_id=p_pedido group by t.item_id)
 select id::uuid,sum(q),sum(e) from linhas where id~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' group by id
 union all select qr.item_id,qr.q,qr.e from qr,dados where jsonb_array_length(lista)=0
$$;
revoke all on function public.item_historico_pecas(uuid,uuid,jsonb,text) from public,anon,authenticated;

create function public.item_historico_sincronizar_pedido(p jsonb,p_importado boolean default false) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid:=(p->>'empresa_id')::uuid;pedido uuid:=(p->>'id')::uuid;op jsonb:=coalesce(p->'operacao','{}');
 v_fluxo text;etapa text;r record;anterior numeric;atual numeric;delta numeric;registro jsonb;em timestamptz;autor text;
begin
 foreach v_fluxo in array array['saida','retorno'] loop
  etapa:=case when v_fluxo='saida' then 'carregamento' when op->'retorno'->>'concluido_em' is not null then 'retorno' else 'descarregamento' end;
  registro:=coalesce(op->etapa,'{}');autor:=coalesce(registro->>'por',case when p_importado then 'Responsavel nao informado' end);
  em:=case when p_importado then coalesce((registro->>'concluido_em')::timestamptz,clock_timestamp()) else clock_timestamp() end;
  for r in
   with atuais as(select * from item_historico_pecas(empresa,pedido,op,etapa) where registro->>'concluido_em' is not null)
   select coalesce(a.item_id,s.item_id) item_id,coalesce(a.quantidade,0) quantidade,coalesce(a.esperado,0) esperado
   from atuais a full join (select * from item_historico_fluxos f where f.empresa_id=empresa and f.pedido_id=pedido and f.fluxo=v_fluxo) s on s.item_id=a.item_id
  loop
   insert into item_historico_fluxos values(empresa,r.item_id,pedido,v_fluxo,0) on conflict do nothing;
   select quantidade into anterior from item_historico_fluxos f where f.empresa_id=empresa and f.item_id=r.item_id and f.pedido_id=pedido and f.fluxo=v_fluxo for update;
   atual:=r.quantidade;delta:=atual-anterior;
   if delta<>0 then
    perform item_historico_gravar(empresa,r.item_id,jsonb_build_object('tipo',case when v_fluxo='saida' then case when anterior=0 and delta>0 then 'saida_evento' else 'correcao_saida' end else case when anterior=0 and delta>0 then 'retorno_evento' else 'correcao_retorno' end end,
     'natureza','galpao','quantidade',abs(delta),'variacao',case when v_fluxo='saida' then -delta else delta end,'pedido_id',pedido,'pedido_numero',p->>'numero_pedido','origem',etapa,'responsavel',autor,'em',em,
     'chave','fluxo:'||pedido||':'||v_fluxo||':'||gen_random_uuid(),
     'detalhes',jsonb_build_object('contagem_anterior',anterior,'contagem_atual',atual,'importado',p_importado)));
    update item_historico_fluxos f set quantidade=atual where f.empresa_id=empresa and f.item_id=r.item_id and f.pedido_id=pedido and f.fluxo=v_fluxo;
   end if;
  end loop;
 end loop;
 foreach etapa in array array['descarregamento','retorno'] loop
  registro:=op->etapa;if registro->>'concluido_em' is null then continue;end if;
  for r in select * from item_historico_pecas(empresa,pedido,op,etapa) loop
   perform item_historico_gravar(empresa,r.item_id,jsonb_build_object('tipo',case when etapa='retorno' then 'conferencia_retorno' else 'conferencia_descarregamento' end,
    'quantidade',r.quantidade,'esperado',r.esperado,'contado',r.quantidade,'diferenca',r.quantidade-r.esperado,'pedido_id',pedido,'pedido_numero',p->>'numero_pedido','origem',etapa,
    'em',case when p_importado then registro->>'concluido_em' else clock_timestamp()::text end,'responsavel',coalesce(registro->>'por',case when p_importado then 'Responsavel nao informado' end),'chave','conferencia:'||pedido||':'||etapa||':'||md5(registro::text),
    'detalhes',jsonb_build_object('primeira_contagem',registro->'primeira_contagem','importado',p_importado)));
  end loop;
 end loop;
end $$;
revoke all on function public.item_historico_sincronizar_pedido(jsonb,boolean) from public,anon,authenticated;

-- Um gatilho por fonte, na mesma transacao da gravacao original.
create function public.item_historico_processar(p_tabela text,p_n jsonb,p_a jsonb default '{}',p_operacao text default 'INSERT') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb:=p_n;a jsonb:=p_a;
 empresa uuid:=(n->>'empresa_id')::uuid;item uuid;ev jsonb;antes numeric;depois numeric;x jsonb;registro jsonb;titulo text;ret jsonb;
begin
 if p_tabela='itens' then
  item:=(n->>'id')::uuid;antes:=coalesce((a->>'estoque_total')::numeric,0);depois:=coalesce((n->>'estoque_total')::numeric,0);
  if p_operacao='INSERT' or n->'estoque_total' is distinct from a->'estoque_total' then
   perform item_historico_gravar(empresa,item,jsonb_build_object('tipo',case when p_operacao='INSERT' then 'cadastro_estoque' when depois>antes then 'entrada_estoque' else 'baixa_estoque' end,'natureza','patrimonio','quantidade',abs(depois-antes),'variacao',depois-antes,
    'saldo_antes',antes,'saldo_depois',depois,'origem','cadastro_estoque','chave','estoque:'||gen_random_uuid()));
  end if;
  if n->'estoque_manutencao' is distinct from a->'estoque_manutencao' then
   antes:=coalesce((a->>'estoque_manutencao')::numeric,0);depois:=coalesce((n->>'estoque_manutencao')::numeric,0);
   if antes<>depois then perform item_historico_gravar(empresa,item,jsonb_build_object('tipo',case when depois>antes then 'bloqueio_manutencao' else 'liberacao_manutencao' end,'quantidade',abs(depois-antes),'origem','manutencao','chave','manutencao:'||gen_random_uuid()));end if;
  end if;
 elsif p_tabela='separacoes_pedidos' then
  if n->'operacao' is distinct from a->'operacao' then perform item_historico_sincronizar_pedido(n);end if;
 elsif p_tabela='logistica_confirmacoes' then
  select numero_pedido into titulo from separacoes_pedidos where id=(n->>'pedido_id')::uuid and empresa_id=empresa;
  for x in select * from jsonb_array_elements(coalesce(n->'itens','[]')) loop
   item:=nullif(coalesce(x->>'item_id',nullif(split_part(x->>'chave','|',2),'')),'')::uuid;if item is null then continue;end if;
   depois:=coalesce((x->>case when n->>'etapa'='entrega' then 'entregue' else 'coletado' end)::numeric,0);antes:=coalesce((x->>'previsto')::numeric,0);
   perform item_historico_gravar(empresa,item,jsonb_build_object('tipo','conferencia_'||(n->>'etapa'),'quantidade',depois,'esperado',antes,'contado',depois,'diferenca',depois-antes,
    'pedido_id',n->>'pedido_id','pedido_numero',titulo,'origem','logistica','responsavel',n->>'responsavel','em',n->>'criado_em','chave','logistica:'||(n->>'id')||':'||(x->>'chave'),
    'detalhes',jsonb_build_object('danificados',x->'danificado','desistencia',x->'desistencia','versao',n->'versao','motivo',x->>'observacao')));
  end loop;
 elsif p_tabela='operacao_ocorrencias' then
  if n->'quantidade' is not distinct from a->'quantidade' and n->'resolvida_em' is not distinct from a->'resolvida_em' and p_operacao='UPDATE' then return;end if;
  item:=nullif(n->>'item_id','')::uuid;if item is null then return;end if;
  select numero_pedido into titulo from separacoes_pedidos where id=(n->>'pedido_id')::uuid and empresa_id=empresa;
  perform item_historico_gravar(empresa,item,jsonb_build_object('tipo',case when n->>'resolvida_em' is not null then 'divergencia_resolvida' else 'divergencia_'||(n->>'tipo') end,'quantidade',n->'quantidade','pedido_id',n->>'pedido_id','pedido_numero',titulo,'origem','divergencias',
   'em',coalesce(n->>'resolvida_em',n->>'criado_em'),'chave','ocorrencia:'||(n->>'id')||':'||md5(n::text),'detalhes',jsonb_build_object('motivo',coalesce(n->>'resolucao',n->>'descricao'),'etapa',n->>'etapa','aberta',n->>'resolvida_em' is null)));
 elsif p_tabela='acervo_contagens_gerais' or p_tabela='acervo_inventario_itens' then
  if n->>'contado' is null then return;end if;
  if p_operacao='UPDATE' and n->'contado' is not distinct from a->'contado' and n->'status' is not distinct from a->'status' and n->'contado_em' is not distinct from a->'contado_em' then return;end if;
  item:=(n->>'item_id')::uuid;antes:=coalesce((n->>'esperado')::numeric,(n->>'saldo_base')::numeric,0);depois:=(n->>'contado')::numeric;
  perform item_historico_gravar(empresa,item,jsonb_build_object('tipo',case when p_tabela='acervo_contagens_gerais' then 'contagem_geral' else 'contagem_inventario' end,'quantidade',depois,'esperado',antes,'contado',depois,'diferenca',depois-antes,'origem','inventario',
   'em',n->>'contado_em','responsavel',coalesce(n->>'contado_por_nome',case when (n->>'_historico_importado')::boolean then 'Responsavel nao informado' end),'chave',p_tabela||':'||coalesce(n->>'id',n->>'inventario_id')||':'||md5(n::text),'detalhes',jsonb_build_object('status',n->>'status','motivo',n->>'motivo','inventario_id',n->>'inventario_id')));
 elsif p_tabela='acervo_inventarios' then
  if n->>'status' is distinct from 'aprovado' or a->>'status'='aprovado' then return;end if;
  for registro in select to_jsonb(c) from acervo_inventario_itens c where inventario_id=(n->>'id')::uuid and empresa_id=empresa loop
   perform item_historico_gravar(empresa,(registro->>'item_id')::uuid,jsonb_build_object('tipo','inventario_aprovado','quantidade',registro->'contado','esperado',registro->'saldo_base','contado',registro->'contado','diferenca',(registro->>'contado')::numeric-(registro->>'saldo_base')::numeric,
    'origem','inventario','em',n->>'aprovado_em','chave','inventario_aprovado:'||(n->>'id'),'detalhes',jsonb_build_object('nome',n->>'nome','motivo',registro->>'motivo')));
  end loop;
 elsif p_tabela='kit_itens' then
  item:=(n->>'kit_id')::uuid;antes:=coalesce((a->>'quantidade')::numeric,0);depois:=case when p_operacao='DELETE' then 0 else coalesce((n->>'quantidade')::numeric,0) end;
  if antes<>depois then perform item_historico_gravar(empresa,item,jsonb_build_object('tipo',case when (n->>'_historico_importado')::boolean then 'composicao_referencia' else 'composicao_kit' end,'quantidade',depois,'esperado',antes,'contado',depois,'diferenca',depois-antes,
   'origem','componentes_kit','responsavel',case when (n->>'_historico_importado')::boolean then 'Registro anterior' end,'chave','composicao:'||gen_random_uuid(),'detalhes',jsonb_build_object('componente_id',n->>'item_id','acao',p_operacao)));end if;
 elsif p_tabela='acervo_historico' then
  select to_jsonb(r) into ret from acervo_retornos r where id=(n->>'retorno_id')::uuid and empresa_id=empresa;
  if ret is null then return;end if;
  select numero_pedido into titulo from separacoes_pedidos where id=(ret->>'pedido_id')::uuid and empresa_id=empresa;
  perform item_historico_gravar(empresa,(ret->>'item_id')::uuid,jsonb_build_object('tipo','acervo_'||(n->>'estado'),'quantidade',ret->'quantidade','origem','gestao_acervo','pedido_id',ret->>'pedido_id','pedido_numero',titulo,'em',n->>'criado_em',
   'chave','acervo_historico:'||(n->>'id'),'detalhes',jsonb_build_object('motivo',n->>'motivo','tipo',ret->>'tipo')));
 end if;
 return;
end $$;
revoke all on function public.item_historico_processar(text,jsonb,jsonb,text) from public,anon,authenticated;

create function public.item_historico_capturar() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform item_historico_processar(tg_table_name,case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end,case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end,tg_op);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.item_historico_capturar() from public,anon,authenticated;

create trigger item_historico_composicao after insert or update or delete on public.kit_itens for each row execute function public.item_historico_capturar();
create trigger item_historico_saldo after insert or update of estoque_total,estoque_manutencao on public.itens for each row execute function public.item_historico_capturar();
create trigger item_historico_pedido after insert or update of operacao on public.separacoes_pedidos for each row execute function public.item_historico_capturar();
create trigger item_historico_logistica after insert or update of itens on public.logistica_confirmacoes for each row execute function public.item_historico_capturar();
create trigger item_historico_ocorrencias after insert or update on public.operacao_ocorrencias for each row execute function public.item_historico_capturar();
create trigger item_historico_contagem_geral after insert or update on public.acervo_contagens_gerais for each row execute function public.item_historico_capturar();
create trigger item_historico_contagem_inventario after insert or update on public.acervo_inventario_itens for each row execute function public.item_historico_capturar();
create trigger item_historico_inventario_aprovado after update of status on public.acervo_inventarios for each row execute function public.item_historico_capturar();
create trigger item_historico_acervo after insert on public.acervo_historico for each row execute function public.item_historico_capturar();

-- Registros antigos recuperaveis. Saldo atual e identificado como referencia, nao como entrada nova.
do $$declare i record;p record;begin
 for i in select id,empresa_id,estoque_total from itens loop
  perform item_historico_gravar(i.empresa_id,i.id,jsonb_build_object('tipo','saldo_referencia','quantidade',coalesce(i.estoque_total,0),'saldo_depois',i.estoque_total,'origem','implantacao_historico','chave','saldo_referencia','detalhes',jsonb_build_object('observacao','Saldo atual na implantacao. Alteracoes antigas sem registro nao podem ser reconstituidas.')));
 end loop;
 for p in select to_jsonb(s) dados from separacoes_pedidos s where s.operacao is not null loop perform item_historico_sincronizar_pedido(p.dados,true);end loop;
 for p in select 'logistica_confirmacoes' fonte,to_jsonb(t) dados from logistica_confirmacoes t
 union all select 'operacao_ocorrencias',to_jsonb(t) from operacao_ocorrencias t
 union all select 'acervo_contagens_gerais',to_jsonb(t) from acervo_contagens_gerais t
 union all select 'acervo_inventario_itens',to_jsonb(t) from acervo_inventario_itens t
 union all select 'acervo_inventarios',to_jsonb(t) from acervo_inventarios t where status='aprovado'
 union all select 'acervo_historico',to_jsonb(t) from acervo_historico t
 union all select 'kit_itens',to_jsonb(t) from kit_itens t
 loop perform item_historico_processar(p.fonte,p.dados||jsonb_build_object('_historico_importado',true));end loop;

end $$;
-- Compras recebidas antes da implantacao possuem suas quantidades recuperadas dos documentos originais.
insert into item_historico_quantidades(empresa_id,item_id,tipo,natureza,quantidade,variacao,pedido_id,pedido_numero,origem,chave,responsavel,registrado_em,detalhes)
select c.empresa_id,(x->>'item_id')::uuid,'entrada_compra','patrimonio',coalesce((x->>'quantidade_recebida')::numeric,0),coalesce((x->>'quantidade_recebida')::numeric,0),null,'PC-'||c.numero,'compras',
 'compra_legada:'||c.id||':'||coalesce(nullif(x->>'id',''),x->>'item_id'),coalesce(c.dados->>'comprador_nome','Equipe'),coalesce((c.dados->>'recebido_em')::timestamptz,(to_jsonb(c)->>'created_at')::timestamptz,now()),jsonb_build_object('importado',true,'observacao',c.dados->>'observacao')
from compras_registros c cross join lateral jsonb_array_elements(coalesce(c.dados->'items','[]')) x
join itens i on i.id=case when x->>'item_id'~*'^[0-9a-f-]{36}$' then (x->>'item_id')::uuid end and i.empresa_id=c.empresa_id
where c.tipo='pedido' and c.dados->>'destino'='locacao' and coalesce((x->>'quantidade_recebida')::numeric,0)>0
on conflict(empresa_id,item_id,chave) do nothing;

create function public.item_historico_quantidades_ler(p_empresa uuid,p_item uuid,p_antes bigint default null,p_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item itens;ids uuid[];registros jsonb;ultimo bigint;mais boolean;cursor_em timestamptz;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') or not seguranca_2fa_ok() then raise exception 'Sem permissao para consultar o historico';end if;
 select * into item from itens where id=p_item and empresa_id=p_empresa;if not found then raise exception 'Item nao encontrado';end if;
 ids:=array[p_item];if item.tipo='Kit' then
 select ids||coalesce(array_agg(distinct componente),'{}'::uuid[]) into ids from (
  select item_id componente from kit_itens where kit_id=p_item and empresa_id=p_empresa
  union select (detalhes->>'componente_id')::uuid from item_historico_quantidades where empresa_id=p_empresa and item_id=p_item and detalhes->>'componente_id'~*'^[0-9a-f-]{36}$'
 ) c;end if;
 if p_antes is not null then select registrado_em into cursor_em from item_historico_quantidades where empresa_id=p_empresa and item_id=any(ids) and id=p_antes;if not found then raise exception 'Cursor de historico invalido';end if;end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.registrado_em desc,r.id desc),'[]') into registros from (
  select h.*,coalesce(nullif(to_jsonb(i)->>'descricao_total',''),i.produto) item_nome from item_historico_quantidades h left join itens i on i.id=h.item_id and i.empresa_id=h.empresa_id
  where h.empresa_id=p_empresa and h.item_id=any(ids) and (p_antes is null or (h.registrado_em,h.id)<(cursor_em,p_antes)) order by h.registrado_em desc,h.id desc limit greatest(1,least(coalesce(p_limite,50),100))) r;
 ultimo:=(registros->-1->>'id')::bigint;
 select exists(select 1 from item_historico_quantidades h where h.empresa_id=p_empresa and h.item_id=any(ids) and (h.registrado_em,h.id)<((registros->-1->>'registrado_em')::timestamptz,ultimo)) into mais;
 return jsonb_build_object('item',jsonb_build_object('id',item.id,'tipo',item.tipo,'estoque_total',item.estoque_total),'inclui_componentes',item.tipo='Kit','registros',registros,'proximo',ultimo,'tem_mais',mais);
end $$;
revoke all on function public.item_historico_quantidades_ler(uuid,uuid,bigint,integer) from public,anon;
grant execute on function public.item_historico_quantidades_ler(uuid,uuid,bigint,integer) to authenticated;
notify pgrst,'reload schema';
