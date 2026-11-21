-- 15/11/2026: (1) grupos de separação cadastrados em Parâmetros > Logística e operação > Triagem e conferência e
-- escolhidos no cadastro do item; (2) histórico de movimentação do item: responsável com id (nome e foto na tela),
-- o tipo certo de cada mudança de quantidade (implantação, compra, Gestão do acervo) e o retorno de locação com
-- divergência na contagem só movimenta depois que a Gestão do acervo resolve.

create table if not exists public.separacao_grupos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 60),
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists separacao_grupos_nome on public.separacao_grupos (empresa_id, lower(trim(nome)));
alter table public.separacao_grupos enable row level security;
drop policy if exists ler on public.separacao_grupos;
create policy ler on public.separacao_grupos for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists gravar on public.separacao_grupos;
create policy gravar on public.separacao_grupos for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'));
drop policy if exists seguranca_2fa on public.separacao_grupos;
create policy seguranca_2fa on public.separacao_grupos as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
grant select, insert, update, delete on public.separacao_grupos to authenticated;
insert into public.separacao_grupos (empresa_id, nome, ordem)
select distinct on (i.empresa_id, lower(trim(i.grupo_separacao))) i.empresa_id, trim(i.grupo_separacao), 0
from public.itens i where coalesce(trim(i.grupo_separacao),'')<>''
on conflict do nothing;

alter table public.item_historico_quantidades add column if not exists responsavel_id uuid;
-- registros antigos guardavam só o e-mail de quem fez: liga ao usuário pelo e-mail
update public.item_historico_quantidades h set responsavel_id=au.id
from auth.users au
where h.responsavel_id is null and h.responsavel like '%@%' and lower(au.email)=lower(h.responsavel)
  and exists(select 1 from public.usuarios_empresas ue where ue.user_id=au.id and ue.empresa_id=h.empresa_id);

create or replace function public.item_historico_gravar(p_empresa uuid,p_item uuid,p_evento jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from itens where id=p_item and empresa_id=p_empresa) then return;end if;
 insert into item_historico_quantidades(empresa_id,item_id,tipo,natureza,quantidade,variacao,saldo_antes,saldo_depois,esperado,contado,diferenca,pedido_id,pedido_numero,origem,chave,responsavel,responsavel_id,registrado_em,detalhes)
 values(p_empresa,p_item,p_evento->>'tipo',coalesce(p_evento->>'natureza','informacao'),coalesce((p_evento->>'quantidade')::numeric,0),(p_evento->>'variacao')::numeric,
 (p_evento->>'saldo_antes')::numeric,(p_evento->>'saldo_depois')::numeric,(p_evento->>'esperado')::numeric,(p_evento->>'contado')::numeric,(p_evento->>'diferenca')::numeric,
 (p_evento->>'pedido_id')::uuid,p_evento->>'pedido_numero',p_evento->>'origem',p_evento->>'chave',
 coalesce(nullif(p_evento->>'responsavel',''),nullif(auth.jwt()->'user_metadata'->>'nome',''),auth.jwt()->>'email','Sistema'),
 coalesce(nullif(p_evento->>'responsavel_id','')::uuid,case when nullif(p_evento->>'responsavel','') is null then auth.uid() end),
 coalesce((p_evento->>'em')::timestamptz,clock_timestamp()),coalesce(p_evento->'detalhes','{}'))
 on conflict(empresa_id,item_id,chave) do nothing;
end $$;
revoke all on function public.item_historico_gravar(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.item_historico_sincronizar_pedido(p jsonb,p_importado boolean default false) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid:=(p->>'empresa_id')::uuid;pedido uuid:=(p->>'id')::uuid;op jsonb:=coalesce(p->'operacao','{}');
 v_fluxo text;etapa text;r record;anterior numeric;atual numeric;delta numeric;registro jsonb;em timestamptz;autor text;resp text;resp_div text;resp_id uuid;liberado boolean;perda numeric;saiu numeric;
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
   atual:=r.quantidade;resp:=autor;resp_id:=null;liberado:=false;perda:=null;
   if v_fluxo='retorno' and not p_importado then
    -- nov/2026: com divergência na contagem da volta, o retorno só movimenta depois da Gestão do acervo resolver
    if exists(select 1 from operacao_ocorrencias o where o.empresa_id=empresa and o.pedido_id=pedido and o.item_id=r.item_id and o.tipo in ('falta','sobra')
      and o.etapa in ('retorno','descarregamento') and o.resolvida_em is null) then continue;end if;
    select o.resolvido_por_nome,o.resolvido_por into resp_div,resp_id from operacao_ocorrencias o where o.empresa_id=empresa and o.pedido_id=pedido and o.item_id=r.item_id
     and o.tipo in ('falta','sobra') and o.etapa in ('retorno','descarregamento') and o.resolvida_em is not null order by o.resolvida_em desc limit 1;
    if found then
     select coalesce(max(greatest(o.esperado-coalesce(o.segunda_contagem,o.conferido,o.esperado),0)),0) into perda from operacao_ocorrencias o
      where o.empresa_id=empresa and o.pedido_id=pedido and o.item_id=r.item_id and o.tipo='falta' and o.etapa in ('retorno','descarregamento') and o.resultado='continua';
     select coalesce(max(f.quantidade),0) into saiu from item_historico_fluxos f where f.empresa_id=empresa and f.item_id=r.item_id and f.pedido_id=pedido and f.fluxo='saida';
     atual:=greatest(saiu-perda,0);resp:=coalesce(resp_div,autor);liberado:=true;
    else resp_id:=null;
    end if;
   end if;
   insert into item_historico_fluxos values(empresa,r.item_id,pedido,v_fluxo,0) on conflict do nothing;
   select quantidade into anterior from item_historico_fluxos f where f.empresa_id=empresa and f.item_id=r.item_id and f.pedido_id=pedido and f.fluxo=v_fluxo for update;
   delta:=atual-anterior;
   if delta<>0 then
    perform item_historico_gravar(empresa,r.item_id,jsonb_build_object('tipo',case when v_fluxo='saida' then case when anterior=0 and delta>0 then 'saida_evento' else 'correcao_saida' end else case when anterior=0 and delta>0 then 'retorno_evento' else 'correcao_retorno' end end,
     'natureza','galpao','quantidade',abs(delta),'variacao',case when v_fluxo='saida' then -delta else delta end,'pedido_id',pedido,'pedido_numero',p->>'numero_pedido','origem',case when liberado then 'gestao_acervo' else etapa end,'responsavel',resp,'responsavel_id',resp_id,'em',em,
     'chave','fluxo:'||pedido||':'||v_fluxo||':'||gen_random_uuid(),
     'detalhes',jsonb_build_object('contagem_anterior',anterior,'contagem_atual',atual,'importado',p_importado,'conferido_gestao_acervo',liberado,'perda',perda)));
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

create or replace function public.item_historico_processar(p_tabela text,p_n jsonb,p_a jsonb default '{}',p_operacao text default 'INSERT') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb:=p_n;a jsonb:=p_a;ctx text;tp text;og text;ped jsonb;
 empresa uuid:=(n->>'empresa_id')::uuid;item uuid;ev jsonb;antes numeric;depois numeric;x jsonb;registro jsonb;titulo text;ret jsonb;
begin
 if p_tabela='itens' then
  item:=(n->>'id')::uuid;antes:=coalesce((a->>'estoque_total')::numeric,0);depois:=coalesce((n->>'estoque_total')::numeric,0);
  if (p_operacao='INSERT' and depois<>0) or (p_operacao<>'INSERT' and n->'estoque_total' is distinct from a->'estoque_total') then
   -- quem mudou a quantidade (nov/2026): a pilha de chamadas diz se foi implantação, compra ou Gestão do acervo
   get diagnostics ctx = pg_context;
   if p_operacao='INSERT' or ctx ~* 'itens_estoque_implantacao' then tp:='implantacao';og:='implantacao';
   elsif ctx ~* 'compras_' then tp:=case when depois>antes then 'entrada_compra' else 'correcao_compra' end;og:='compras';
   elsif ctx ~* 'acervo_inventario_aprovar' then tp:='ajuste_inventario';og:='gestao_acervo';
   elsif ctx ~* 'operacao_resolver_ocorrencia' then tp:=case when depois<antes then 'perda_confirmada' else 'entrada_acervo' end;og:='gestao_acervo';
   elsif ctx ~* 'acervo_' then tp:=case when depois<antes then 'baixa_acervo' else 'entrada_acervo' end;og:='gestao_acervo';
   else tp:=case when depois>antes then 'entrada_estoque' else 'baixa_estoque' end;og:='cadastro_estoque';end if;
   perform item_historico_gravar(empresa,item,jsonb_build_object('tipo',tp,'natureza','patrimonio','quantidade',abs(depois-antes),'variacao',depois-antes,
    'saldo_antes',antes,'saldo_depois',depois,'origem',og,'chave','estoque:'||gen_random_uuid()));
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
  -- divergência da volta resolvida pela Gestão do acervo: libera o retorno de locação que estava esperando
  if n->>'tipo' in ('falta','sobra') and n->>'etapa' in ('retorno','descarregamento') and n->'resolvida_em' is distinct from a->'resolvida_em' and not coalesce((n->>'_historico_importado')::boolean,false) then
   select to_jsonb(s) into ped from separacoes_pedidos s where s.id=(n->>'pedido_id')::uuid and s.empresa_id=empresa;
   if ped is not null then perform item_historico_sincronizar_pedido(ped);end if;
  end if;
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

-- Só movimentações de verdade (pedido do usuário): implantação, compra, saída e retorno de locação e Gestão do acervo.
-- Conferências, contagens, divergências em aberto e composição do kit continuam gravadas, mas não aparecem.
create or replace function public.item_historico_e_movimento(p_tipo text) returns boolean language sql immutable as $$
 select p_tipo in ('saldo_referencia','cadastro_estoque','implantacao','entrada_estoque','baixa_estoque','entrada_compra','correcao_compra',
  'saida_evento','correcao_saida','retorno_evento','correcao_retorno','bloqueio_manutencao','liberacao_manutencao',
  'ajuste_inventario','perda_confirmada','baixa_acervo','entrada_acervo')
  -- Gestão do acervo: manutenção, reparo, limpeza, baixa... (aguardando retorno e triagem são etapas de toda devolução)
  or (p_tipo like 'acervo\_%' and p_tipo not in ('acervo_aguardando_retorno','acervo_triagem'))
$$;

create or replace function public.item_historico_quantidades_ler(p_empresa uuid,p_item uuid,p_antes bigint default null,p_limite integer default 50) returns jsonb
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
  select h.*,coalesce(nullif(to_jsonb(i)->>'descricao_total',''),i.produto) item_nome,
   coalesce(h.responsavel_id,fe.id) responsavel_usuario,
   coalesce(fi.nome,u.nome,fe.nome,case when h.responsavel like '%@%' then split_part(h.responsavel,'@',1) else h.responsavel end) responsavel_nome,
   s.cliente_nome pedido_cliente
  from item_historico_quantidades h
  left join itens i on i.id=h.item_id and i.empresa_id=h.empresa_id
  left join funcionarios_acesso fi on fi.id=h.responsavel_id and fi.empresa_id=h.empresa_id
  left join lateral (select x.id,x.nome from (
    select f.id,f.nome from funcionarios_acesso f where f.empresa_id=h.empresa_id and (lower(f.nome)=lower(h.responsavel) or lower(coalesce(f.email,''))=lower(h.responsavel))
    union all select us.id,us.nome from usuarios us join usuarios_empresas ue on ue.user_id=us.id and ue.empresa_id=h.empresa_id where lower(us.nome)=lower(h.responsavel)) x
   where h.responsavel_id is null limit 1) fe on true
  left join usuarios u on u.id=h.responsavel_id
  left join separacoes_pedidos s on s.id=h.pedido_id and s.empresa_id=h.empresa_id
  where h.empresa_id=p_empresa and h.item_id=any(ids) and item_historico_e_movimento(h.tipo)
   and (p_antes is null or (h.registrado_em,h.id)<(cursor_em,p_antes))
  order by h.registrado_em desc,h.id desc limit greatest(1,least(coalesce(p_limite,50),100))) r;
 ultimo:=(registros->-1->>'id')::bigint;
 select exists(select 1 from item_historico_quantidades h where h.empresa_id=p_empresa and h.item_id=any(ids) and item_historico_e_movimento(h.tipo)
  and (h.registrado_em,h.id)<((registros->-1->>'registrado_em')::timestamptz,ultimo)) into mais;
 return jsonb_build_object('item',jsonb_build_object('id',item.id,'tipo',item.tipo,'estoque_total',item.estoque_total,'estoque_manutencao',item.estoque_manutencao),
  'inclui_componentes',item.tipo='Kit','registros',registros,'proximo',ultimo,'tem_mais',mais);
end $$;
revoke all on function public.item_historico_quantidades_ler(uuid,uuid,bigint,integer) from public,anon;
grant execute on function public.item_historico_quantidades_ler(uuid,uuid,bigint,integer) to authenticated;
notify pgrst,'reload schema';
