-- BV aprovado na Posição final (nov/2026, pedido do usuário). O Comercial continua indicando no pedido quem recebe o BV
-- e quanto (fin_bv_partes), mas a conta a pagar NÃO nasce mais na aprovação do pedido: o BV vai para a Posição final, onde
-- o Financeiro aprova (pode descontar, ex.: o valor de itens danificados) ou não. Só na aprovação nasce a conta a pagar,
-- uma por pessoa da divisão, com o desconto repartido na proporção de cada parte.
alter table public.fin_bv_comissoes
  add column if not exists aprovacao text not null default 'pendente',
  add column if not exists desconto numeric(15,2) not null default 0,
  add column if not exists valor_aprovado numeric(15,2),
  add column if not exists aprovacao_motivo text,
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_em timestamptz,
  add column if not exists legado boolean not null default false;
do $$ begin
  alter table public.fin_bv_comissoes add constraint fin_bv_comissoes_aprovacao_check check (aprovacao in ('pendente','aprovado','reprovado'));
exception when duplicate_object then null; end $$;
alter table public.fin_posicoes_finais add column if not exists bv jsonb;

-- BVs que já existiam: os que têm pagamento ou cuja Posição final já foi confirmada ficam como estão (aprovados, legado);
-- os demais saem de Contas a pagar e passam a esperar a aprovação na Posição final.
do $$ begin
  perform set_config('app.bv_sync', 'sim', true);
  update fin_bv_comissoes c set aprovacao = 'aprovado', legado = true, valor_aprovado = c.valor, aprovado_em = now()
   where c.ativo and (exists (select 1 from fin_posicoes_finais f where f.pedido_id = c.pedido_id and f.status = 'confirmado')
      or exists (select 1 from fin_bv_partes pt join fin_pagar t on t.id = pt.pagar_id where pt.pedido_id = c.pedido_id and coalesce(t.pago, 0) > 0));
  update fin_pagar t set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'BV passa a ser aprovado na Posição final'
   where t.origem = 'bv' and t.status <> 'cancelado' and coalesce(t.pago, 0) = 0
     and exists (select 1 from fin_bv_comissoes c where c.pedido_id = t.origem_id and c.aprovacao = 'pendente');
  update fin_bv_partes pt set pagar_id = null, updated_at = now()
   where exists (select 1 from fin_bv_comissoes c where c.pedido_id = pt.pedido_id and c.aprovacao = 'pendente');
  update fin_bv_comissoes set pagar_id = null where aprovacao = 'pendente';
  perform set_config('app.bv_sync', '', true);
end $$;

CREATE OR REPLACE FUNCTION public.fin_bv_sincronizar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c clientes_empresas%rowtype; b fin_bv_comissoes%rowtype; cfg jsonb; equipe uuid; tit uuid; benef uuid;
  manual boolean; pct numeric; base numeric; total numeric; categoria uuid; titulo uuid; titulo_benef uuid; elegivel boolean;
  desejadas jsonb := '[]'; item jsonb; soma numeric := 0; distribuido numeric := 0; n int; i int := 0; vparte numeric;
  r record; t fin_pagar%rowtype; obs text;
  flag_anterior text := current_setting('app.bv_sync', true);
begin
  select * into b from fin_bv_comissoes where pedido_id = new.id for update;
  -- BV já decidido pelo Financeiro na Posição final (aprovado ou não): não muda mais pelo pedido.
  if coalesce(b.aprovacao, 'pendente') <> 'pendente'
     or exists (select 1 from fin_posicoes_finais f where f.pedido_id = new.id and f.status = 'confirmado') then
    return new;
  end if;
  elegivel := coalesce(new.status_comercial, '') in ('aprovado', 'enviado', 'finalizado');
  cfg := case when jsonb_typeof(new.observacoes->'bv') = 'object' then new.observacoes->'bv' else '{}' end;
  equipe := public.fin_uuid(new.observacoes->>'equipe_id');
  if equipe is not null then select titular_id into tit from clientes_equipes where id = equipe and empresa_id = new.empresa_id; end if;
  benef := coalesce(tit, new.cliente_id);
  select * into c from clientes_empresas where id = benef and empresa_id = new.empresa_id;

  if not elegivel or c.id is null then
    if b.pedido_id is not null then
      if exists (select 1 from fin_bv_partes pt join fin_pagar tt on tt.id = pt.pagar_id where pt.pedido_id = new.id and pt.ativo and coalesce(tt.pago, 0) > 0) then
        raise exception 'Estorne os pagamentos de BV antes de cancelar ou reabrir este pedido.';
      end if;
      perform set_config('app.bv_sync', 'sim', true);
      update fin_bv_comissoes set ativo = false, updated_at = now() where pedido_id = new.id;
      update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Pedido fora dos status de comissão'
        where id in (select pagar_id from fin_bv_partes where pedido_id = new.id and pagar_id is not null) and status <> 'cancelado';
      update fin_bv_partes set ativo = false, updated_at = now() where pedido_id = new.id;
      perform set_config('app.bv_sync', coalesce(flag_anterior, ''), true);
    end if;
    return new;
  end if;

  manual := coalesce(cfg->>'manual', '') = 'true';
  if manual then
    begin pct := round((cfg->>'percentual')::numeric, 4); exception when others then pct := null; end;
    if pct is null or pct < 0 or pct > 100 then raise exception 'Informe o BV negociado deste pedido (entre 0 e 100%%).'; end if;
  elsif b.pedido_id is null or b.cliente_id is distinct from benef or b.manual then
    pct := public.fin_bv_percentual_na_criacao(new.empresa_id, benef, new.criado_em);
  else
    pct := b.percentual;
  end if;
  base := fin_bv_base(new.observacoes, new.valor_total);
  if base::text in ('NaN', 'Infinity', '-Infinity') then raise exception 'Base de locação inválida para o BV.'; end if;
  total := round(base * pct / 100, 2);

  -- divisão: a do pedido, senão 100% para quem recebe por padrão
  if jsonb_typeof(cfg->'partes') = 'array' and jsonb_array_length(cfg->'partes') > 0 then
    for item in select value from jsonb_array_elements(cfg->'partes') loop
      declare cid uuid := public.fin_uuid(item->>'cliente_id'); pp numeric;
      begin
        begin pp := round((item->>'percentual')::numeric, 4); exception when others then pp := null; end;
        if cid is null or pp is null or pp < 0 then raise exception 'Divisão do BV inválida.'; end if;
        if cid is distinct from new.cliente_id and cid is distinct from benef
           and not exists (select 1 from clientes_equipe_membros m where m.equipe_id = equipe and m.cliente_id = cid) then
          raise exception 'Só quem fez o pedido e as pessoas da equipe podem receber parte do BV.';
        end if;
        if exists (select 1 from jsonb_array_elements(desejadas) d where d->>'cliente_id' = cid::text) then
          raise exception 'A mesma pessoa aparece duas vezes na divisão do BV.';
        end if;
        soma := soma + pp;
        if pp > 0 then desejadas := desejadas || jsonb_build_array(jsonb_build_object('cliente_id', cid, 'percentual', pp)); end if;
      end;
    end loop;
    if abs(soma - pct) > 0.005 then
      raise exception '%', format('A divisão do BV soma %s%%, mas o BV do pedido é %s%%. Ajuste a divisão em Financeiro e pagamentos.', round(soma, 2), round(pct, 2));
    end if;
  elsif pct > 0 then
    desejadas := jsonb_build_array(jsonb_build_object('cliente_id', benef, 'percentual', pct));
  end if;

  -- conferir o que já foi pago antes de mudar qualquer coisa
  n := jsonb_array_length(desejadas);
  for r in select pt.*, coalesce(tt.pago, 0) pago from fin_bv_partes pt left join fin_pagar tt on tt.id = pt.pagar_id where pt.pedido_id = new.id loop
    select d into item from jsonb_array_elements(desejadas) d where d->>'cliente_id' = r.cliente_id::text;
    if item is null and r.pago > 0 then
      raise exception 'Estorne os pagamentos de BV de % antes de tirá-la da divisão.', (select nome_razao from clientes_empresas where id = r.cliente_id);
    end if;
  end loop;

  perform set_config('app.bv_sync', 'sim', true);
  if n > 0 then
    insert into fin_categorias(empresa_id, nome, tipo, chave, ordem)
      values (new.empresa_id, 'Comissões de decoradores (BV)', 'saida', 'bv_decoradores', 90)
      on conflict (empresa_id, chave) where chave is not null do nothing;
    select id into categoria from fin_categorias where empresa_id = new.empresa_id and chave = 'bv_decoradores';
  end if;
  -- quem saiu da divisão: título cancelado
  for r in select * from fin_bv_partes pt where pt.pedido_id = new.id
             and not exists (select 1 from jsonb_array_elements(desejadas) d where d->>'cliente_id' = pt.cliente_id::text) loop
    update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Fora da divisão do BV'
      where id = r.pagar_id and status <> 'cancelado';
    update fin_bv_partes set ativo = false, updated_at = now() where pedido_id = r.pedido_id and cliente_id = r.cliente_id;
  end loop;
  -- quem está na divisão: um título para cada pessoa (o último leva o arredondamento)
  for item in select value from jsonb_array_elements(desejadas) loop
    i := i + 1; t := null;
    vparte := case when i = n then total - distribuido else round(base * (item->>'percentual')::numeric / 100, 2) end;
    distribuido := distribuido + vparte;
    declare cid uuid := (item->>'cliente_id')::uuid; pp numeric := (item->>'percentual')::numeric; nome text; atual fin_bv_partes%rowtype;
    begin
      select nome_razao into nome from clientes_empresas where id = cid and empresa_id = new.empresa_id;
      select * into atual from fin_bv_partes where pedido_id = new.id and cliente_id = cid;
      obs := pp || '% sobre a locação de ' || base || case when pp <> pct then ' (parte do BV de ' || pct || '%)' else '' end
        || case when manual then ' · negociado no pedido' else '' end;
      titulo := atual.pagar_id;  -- nov/2026: a conta a pagar só nasce na aprovação da Posição final
      if titulo is not null then select * into t from fin_pagar where id = titulo for update; end if;
      if vparte <= 0 and titulo is not null then
        if coalesce(t.pago, 0) > 0 then raise exception 'O BV de % já tem pagamento. Estorne antes de zerar.', nome; end if;
        update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'BV sem valor a pagar' where id = titulo and status <> 'cancelado';
        titulo := null;
      end if;
      insert into fin_bv_partes(pedido_id, empresa_id, cliente_id, percentual, valor, pagar_id, ativo)
        values (new.id, new.empresa_id, cid, pp, greatest(vparte, 0), titulo, vparte > 0)
        on conflict (pedido_id, cliente_id) do update set percentual = excluded.percentual, valor = excluded.valor,
          pagar_id = coalesce(fin_bv_partes.pagar_id, excluded.pagar_id), ativo = excluded.ativo, updated_at = now();
      if cid = benef then titulo_benef := titulo; elsif titulo_benef is null then titulo_benef := titulo; end if;
    end;
  end loop;

  insert into fin_bv_comissoes(pedido_id, empresa_id, cliente_id, percentual, base_locacao, valor, pagar_id, manual, observacao)
    values (new.id, new.empresa_id, benef, pct, base, total, titulo_benef, manual, nullif(trim(cfg->>'observacao'), ''))
    on conflict (pedido_id) do update set cliente_id = excluded.cliente_id, percentual = excluded.percentual,
      base_locacao = excluded.base_locacao, valor = excluded.valor, pagar_id = coalesce(fin_bv_comissoes.pagar_id, excluded.pagar_id), ativo = true,
      manual = excluded.manual, observacao = excluded.observacao, updated_at = now();
  if b.pedido_id is null or (b.base_locacao, b.valor, b.cliente_id, b.ativo, b.percentual, b.manual) is distinct from (base, total, benef, true, pct, manual) then
    perform fin_auditar(new.empresa_id, 'fin_bv_comissoes', new.id, 'calculo', to_jsonb(b),
      jsonb_build_object('base', base, 'percentual', pct, 'valor', total, 'cliente_id', benef, 'manual', manual, 'partes', desejadas), 'BV calculado pelo pedido');
  end if;
  perform set_config('app.bv_sync', coalesce(flag_anterior, ''), true);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fin_posicao_final_base(p_empresa uuid, p_pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare p separacoes_pedidos%rowtype; e logistica_confirmacoes%rowtype; c logistica_confirmacoes%rowtype;

 f fin_posicoes_finais%rowtype; linhas jsonb; titulos jsonb; pagamentos jsonb; credito jsonb;

 bruto numeric; fator numeric:=1; v_grupo uuid[];

begin

 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then

  raise exception 'Sem permissão para consultar a posição final' using errcode='42501'; end if;

 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;

 if not found then raise exception 'Pedido não encontrado nesta empresa'; end if;

 v_grupo:=pedido_grupo(p.id);

 select * into e from logistica_confirmacoes where pedido_id=p.id and empresa_id=p_empresa and etapa='entrega' order by versao desc limit 1;

 select * into c from logistica_confirmacoes where pedido_id=p.id and empresa_id=p_empresa and etapa='coleta' order by versao desc limit 1;

 select * into f from fin_posicoes_finais where pedido_id=p.id and empresa_id=p_empresa;

 select sum((x->>'valor_locacao')::numeric*(x->>'quantidade_solicitada')::numeric) into bruto

  from jsonb_array_elements(coalesce(p.observacoes->'itens_comerciais','[]')) x;

 if bruto>0 then

  fator:=least(1,greatest(0,coalesce((p.observacoes->'valores'->>'locacao_bv')::numeric,bruto)

   -greatest(fin_moeda(p.observacoes->'pagamento_config'->>'descontoComercial'),0))/bruto);

 end if;

 -- Não distribuir o preço de um kit entre componentes: preço ausente fica pendente.

 with comercial as (

  select x from separacoes_pedidos g, jsonb_array_elements(coalesce(g.observacoes->'itens_comerciais','[]')) x where g.id=any(v_grupo)

 ), col as (

  select x->>'item_id' item, x, coalesce((x->>'nao_coletado')::numeric,0) q from jsonb_array_elements(coalesce(c.itens,'[]')) x

 ), perdas_etapa as (

  -- Nov/2026 (teste do usuário final, item 5): perda confirmada na Gestão do acervo (descarregamento/triagem da volta).

  -- A mesma peça pode aparecer em mais de uma contagem: vale a maior quantidade por etapa, não a soma.

  select o.item_id::text item, o.etapa, sum(o.quantidade) q, string_agg(distinct m.nome, ', ') motivo

  from operacao_ocorrencias o left join logistica_motivos m on m.id=o.motivo_id

  where o.pedido_id=any(v_grupo) and o.tipo='falta' and o.resultado='continua' and o.resolvida_em is not null

    and coalesce(o.resolucao,'') not like 'Mesma peça%'

  group by o.item_id, o.etapa

 ), perdas as (

  select item, max(q) q, string_agg(distinct motivo, ', ') motivo from perdas_etapa group by item

 ), desaparecidos as (

  select case when c2.x is not null then c2.x||case when coalesce(c2.x->>'observacao','')='' and pp.motivo is not null then jsonb_build_object('observacao',pp.motivo) else '{}'::jsonb end

              else jsonb_build_object('chave','perda:'||pp.item,'item_id',pp.item,'observacao',pp.motivo,

                'nome',(select coalesce(nullif(i.descricao_total,''),i.produto) from itens i where i.id::text=pp.item)) end x,

         greatest(coalesce(c2.q,0),coalesce(pp.q,0)) q

  from col c2 full join perdas pp on pp.item=c2.item

 ), ocorrencias as (

  select x, 'credito'::text tipo, greatest(0,(x->>'previsto')::numeric-coalesce((x->>'entregue')::numeric,0)) quantidade

   from separacoes_pedidos g cross join lateral (select l.itens from logistica_confirmacoes l where l.pedido_id=g.id and l.etapa='entrega' order by l.versao desc limit 1) le,

        jsonb_array_elements(coalesce(le.itens,'[]')) x where g.id=any(v_grupo)

  union all select x,'avaria',coalesce((x->>'danificado')::numeric,0) from jsonb_array_elements(coalesce(c.itens,'[]')) x

  union all select x,'desaparecido',q from desaparecidos

 ), precos as (

  select o.*, v.locacao*fator locacao,coalesce(v.reposicao,i.valor_reposicao) reposicao,coalesce(v.foto,i.foto_url) foto from ocorrencias o

  left join lateral (

   select case when count(distinct x->>'valor_locacao')=1 then min((x->>'valor_locacao')::numeric) end locacao,

    case when count(distinct x->>'valor_reposicao')=1 then min((x->>'valor_reposicao')::numeric) end reposicao,

    min(x->>'foto_url') foto from comercial where x->>'item_id'=o.x->>'item_id'

  ) v on true left join itens i on i.id::text=o.x->>'item_id' and i.empresa_id=p_empresa where o.quantidade>0

 ) select coalesce(jsonb_agg(jsonb_build_object(

  'chave',tipo||':'||(x->>'chave'),'item_id',x->>'item_id','nome',x->>'nome','foto_url',foto,

  'tipo',tipo,'quantidade',quantidade,'unitario',case when tipo='credito' then locacao else reposicao end,

  'valor',round(quantidade*case when tipo='credito' then locacao else reposicao end,2),

  'motivo',x->>'observacao') order by tipo,x->>'nome'),'[]') into linhas from precos;

 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('pedido_numero',g.numero_pedido) order by g.criado_em,t.vencimento),'[]') into titulos from fin_receber t

  join separacoes_pedidos g on g.id=t.pedido_id where t.empresa_id=p_empresa and t.pedido_id=any(v_grupo);

 select coalesce(jsonb_agg(to_jsonb(b) order by b.data,b.created_at),'[]') into pagamentos from fin_baixas b

  join fin_receber t on t.id=b.receber_id and t.empresa_id=b.empresa_id where t.empresa_id=p_empresa and t.pedido_id=any(v_grupo);

 select to_jsonb(t) into credito from fin_pagar t where t.id=f.credito_id and t.empresa_id=p_empresa;

 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'cliente_nome',p.cliente_nome,

  'local_nome',p.local_nome,'valor_total',(select sum(coalesce(g.valor_total,0)) from separacoes_pedidos g where g.id=any(v_grupo)),'data_evento',p.data_evento,

  'extras',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'numero',g.numero_pedido,'valor_total',g.valor_total) order by g.criado_em),'[]') from separacoes_pedidos g where g.id=any(v_grupo) and g.id<>p.id)),

  'itens',linhas,'salvo',case when f.pedido_id is null then null else to_jsonb(f) end,

  'fonte',md5(coalesce(e.id::text,'')||coalesce(c.id::text,'')||coalesce(linhas::text,'')),

  'entrega_confirmada',e.id is not null,'coleta_confirmada',c.id is not null,

  'titulos',titulos,'pagamentos',pagamentos,'credito_titulo',credito,
  'bv',(select case when bc.pedido_id is null or not bc.ativo or coalesce(bc.valor,0)<=0 then null else jsonb_build_object(
     'percentual',bc.percentual,'base',bc.base_locacao,'valor',bc.valor,'manual',bc.manual,'observacao',bc.observacao,
     'aprovacao',coalesce(bc.aprovacao,'pendente'),'desconto',bc.desconto,'motivo',bc.aprovacao_motivo,'aprovado_em',bc.aprovado_em,
     'valor_aprovado',bc.valor_aprovado,'legado',bc.legado,
     'sugestao_desconto',(select coalesce(sum((l->>'valor')::numeric),0) from jsonb_array_elements(linhas) l where l->>'tipo' in ('avaria','desaparecido')),
     'partes',(select coalesce(jsonb_agg(jsonb_build_object('cliente_id',pt.cliente_id,'nome',ce.nome_razao,'foto',ce.catalogo_logo_url,
        'percentual',pt.percentual,'valor',pt.valor,'pagar_id',pt.pagar_id,'pago',coalesce(tt.pago,0)) order by pt.valor desc),'[]')
        from fin_bv_partes pt join clientes_empresas ce on ce.id=pt.cliente_id left join fin_pagar tt on tt.id=pt.pagar_id
        where pt.pedido_id=p.id and pt.ativo)) end
   from (select 1) z left join fin_bv_comissoes bc on bc.pedido_id=p.id));

end $function$;

drop function if exists public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean);
drop function if exists public.fin_posicao_final_salvar_antes_fluxo(uuid,uuid,text,integer,jsonb,boolean);

CREATE OR REPLACE FUNCTION public.fin_posicao_final_salvar_antes_fluxo(p_empresa uuid, p_pedido uuid, p_fonte text, p_versao integer, p_decisoes jsonb, p_confirmar boolean DEFAULT false, p_bv jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p separacoes_pedidos%rowtype; f fin_posicoes_finais%rowtype; b jsonb; x jsonb; d jsonb;
 itens jsonb:='[]'; cre numeric:=0; cob numeric:=0; decisao text; motivo text; credito_id uuid; receber_id uuid; desconto numeric; valor_liquido numeric; motivo_desconto text; motivo_id uuid; motivo_salvo jsonb;
 bvd text; bv_desc numeric:=0; bv_motivo text; bc fin_bv_comissoes%rowtype; bv_aprov numeric; bv_cat uuid; bv_n int; bv_i int:=0; bv_dist numeric:=0; bv_parte numeric; pt record; bv_tit uuid; bv_salvo jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.contas_receber.editar')
  or not fin_pode(p_empresa,'financeiro.contas_pagar.editar') then
  raise exception 'Sem permissão para salvar a posição final' using errcode='42501'; end if;
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not found then raise exception 'Pedido não encontrado nesta empresa'; end if;
 select * into f from fin_posicoes_finais where pedido_id=p.id for update;
 if f.status='confirmado' then raise exception 'Esta posição final já foi confirmada'; end if;
 if coalesce(f.versao,0) is distinct from p_versao then raise exception 'A posição final mudou. Abra o pedido novamente'; end if;
 b:=fin_posicao_final_base(p_empresa,p.id);
 if p_fonte is distinct from b->>'fonte' then raise exception 'Entrega, coleta ou preços mudaram. Abra o pedido novamente'; end if;
 if jsonb_typeof(p_decisoes) is distinct from 'array' then raise exception 'Decisões inválidas'; end if;
 if exists(select 1 from jsonb_array_elements(p_decisoes) v group by v->>'chave' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_decisoes) v where not exists(select 1 from jsonb_array_elements(b->'itens') i where i->>'chave'=v->>'chave')) then
  raise exception 'Ocorrências inválidas'; end if;
 for x in select * from jsonb_array_elements(b->'itens') loop
  select v into d from jsonb_array_elements(p_decisoes) v where v->>'chave'=x->>'chave';
  decisao:=case when x->>'tipo'='credito' then 'credito' else coalesce(d->>'decisao','pendente') end;
  motivo:=btrim(coalesce(d->>'justificativa',''));motivo_id:=null;

  if decisao='dispensar' then

   select v into motivo_salvo from jsonb_array_elements(coalesce(f.itens,'[]')) v where v->>'chave'=x->>'chave' and v->>'decisao'='dispensar';

   if motivo_salvo is not null and motivo_salvo->>'justificativa'=motivo and coalesce(motivo_salvo->>'justificativa_id','')=coalesce(d->>'justificativa_id','') then

    motivo_id:=nullif(motivo_salvo->>'justificativa_id','')::uuid;

   else

    select id,nome into motivo_id,motivo from fin_posicao_motivos where empresa_id=p_empresa and id::text=d->>'justificativa_id' and ativo;

    if motivo_id is null then raise exception 'Selecione um motivo cadastrado em Parametros > Financeiro para nao cobrar';end if;

   end if;

  else motivo:='';end if;


  if decisao not in ('credito','pendente','cobrar','dispensar') or (x->>'tipo'<>'credito' and decisao='credito') then raise exception 'Decisão inválida'; end if;
  if p_confirmar and decisao='pendente' then raise exception 'Decida se cada ocorrência será cobrada'; end if;
  if decisao='dispensar' and motivo='' then raise exception 'Informe o motivo para não cobrar'; end if;
  if p_confirmar and decisao in ('credito','cobrar') and ((x->>'unitario') is null or (x->>'unitario')::numeric<0 or x->>'unitario' in ('NaN','Infinity','-Infinity')) then
   raise exception 'Há item sem preço válido no pedido. Confira os valores de locação e reposição'; end if;
  if decisao='credito' then cre:=cre+coalesce((x->>'valor')::numeric,0); end if;
  if d ? 'desconto' and jsonb_typeof(d->'desconto') is distinct from 'number' then raise exception 'Desconto invalido';end if;

  desconto:=coalesce((d->>'desconto')::numeric,0);motivo_desconto:=btrim(coalesce(d->>'motivo_desconto',''));

  if desconto::text in ('NaN','Infinity','-Infinity') or desconto<0 or desconto<>round(desconto,2) or desconto>coalesce((x->>'valor')::numeric,0) then raise exception 'Desconto deve estar entre zero e o valor da ocorrencia';end if;

  if desconto>0 and decisao<>'cobrar' then raise exception 'Desconto permitido apenas nas ocorrencias a cobrar';end if;

  if desconto>0 and motivo_desconto='' then raise exception 'Informe o motivo do desconto';end if;

  valor_liquido:=case when decisao='cobrar' then coalesce((x->>'valor')::numeric,0)-desconto else 0 end;

  if decisao='cobrar' then cob:=cob+valor_liquido;end if;


  itens:=itens||jsonb_build_array(x||jsonb_build_object('decisao',decisao,'justificativa',motivo,'justificativa_id',motivo_id,'desconto',desconto,'motivo_desconto',motivo_desconto,'valor_cobrar',valor_liquido));
 end loop;
 -- BV (nov/2026): o Comercial indica quem recebe e quanto; aqui o Financeiro aprova (com desconto, ex.: avarias) ou não.
 select * into bc from fin_bv_comissoes where pedido_id=p.id for update;
 bvd:=nullif(btrim(coalesce(p_bv->>'decisao','')),'');
 if bvd is not null and bvd not in ('aprovar','reprovar') then raise exception 'Decisão do BV inválida'; end if;
 if p_bv ? 'desconto' and jsonb_typeof(p_bv->'desconto') is distinct from 'number' then raise exception 'Desconto do BV inválido'; end if;
 bv_desc:=coalesce((p_bv->>'desconto')::numeric,0); bv_motivo:=btrim(coalesce(p_bv->>'motivo',''));
 if bc.pedido_id is not null and bc.ativo and coalesce(bc.valor,0)>0 and coalesce(bc.aprovacao,'pendente')='pendente' then
  if bv_desc::text in ('NaN','Infinity','-Infinity') or bv_desc<0 or bv_desc<>round(bv_desc,2) or bv_desc>bc.valor then raise exception 'O desconto do BV deve ficar entre zero e o valor do BV'; end if;
  if p_confirmar and bvd is null then raise exception 'Decida se o BV deste pedido será aprovado'; end if;
  if p_confirmar and bvd='aprovar' and bv_desc>0 and bv_motivo='' then raise exception 'Informe o motivo do desconto no BV'; end if;
  if p_confirmar and bvd='reprovar' and bv_motivo='' then raise exception 'Informe o motivo para não aprovar o BV'; end if;
 end if;
 bv_salvo:=jsonb_build_object('decisao',bvd,'desconto',bv_desc,'motivo',bv_motivo);
 if p_confirmar then
  if not (b->>'entrega_confirmada')::boolean or not (b->>'coleta_confirmada')::boolean then raise exception 'Confirme a entrega e a coleta antes de finalizar'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') or p.status='cancelado' then raise exception 'O pedido precisa estar aprovado'; end if;
  if cre>0 then
   credito_id:=fin_cliente_registrar_credito(p_empresa,p.cliente_id,'ajuste',cre,(now() at time zone 'America/Sao_Paulo')::date,
    'Posição final do pedido #'||p.numero_pedido||': locação dos itens não entregues.');
  end if;
  if cob>0 then
   insert into fin_receber(empresa_id,origem,pedido_id,pedido_numero,cliente_id,cliente_nome,componente,descricao,vencimento,competencia,valor,observacoes,criado_por)
    values(p_empresa,'manual',p.id,p.numero_pedido,p.cliente_id,p.cliente_nome,'outro','Avarias e desaparecimentos — pedido #'||p.numero_pedido,
     (now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,cob,'Posição final: ocorrências confirmadas no evento.',auth.uid()) returning id into receber_id;
  end if;
 end if;
 if p_confirmar and bc.pedido_id is not null and bc.ativo and coalesce(bc.valor,0)>0 and coalesce(bc.aprovacao,'pendente')='pendente' then
  if bvd='aprovar' then
   bv_aprov:=round(bc.valor-bv_desc,2);
   insert into fin_categorias(empresa_id, nome, tipo, chave, ordem) values (p_empresa, 'Comissões de decoradores (BV)', 'saida', 'bv_decoradores', 90)
     on conflict (empresa_id, chave) where chave is not null do nothing;
   select id into bv_cat from fin_categorias where empresa_id=p_empresa and chave='bv_decoradores';
   select count(*) into bv_n from fin_bv_partes where pedido_id=p.id and ativo and valor>0;
   for pt in select x.*, ce.nome_razao nome from fin_bv_partes x join clientes_empresas ce on ce.id=x.cliente_id
              where x.pedido_id=p.id and x.ativo and x.valor>0 order by x.valor, x.cliente_id loop
    bv_i:=bv_i+1;
    bv_parte:=case when bv_i=bv_n then bv_aprov-bv_dist else round(pt.valor*bv_aprov/bc.valor,2) end;
    bv_dist:=bv_dist+bv_parte; bv_tit:=null;
    if bv_parte>0 then
     insert into fin_pagar(empresa_id, origem, origem_id, fornecedor_id, fornecedor_nome, descricao, documento, emissao, competencia, vencimento, valor, categoria_id, observacoes)
     values (p_empresa, 'bv', p.id, pt.cliente_id, pt.nome, 'BV · Pedido '||p.numero_pedido, p.numero_pedido,
       (now() at time zone 'America/Sao_Paulo')::date, p.data_evento, (now() at time zone 'America/Sao_Paulo')::date, bv_parte, bv_cat,
       pt.percentual||'% sobre a locação · aprovado na Posição final'||case when bv_desc>0 then ' (desconto de '||fin_brl_txt(bv_desc)||' no BV: '||bv_motivo||')' else '' end)
     returning id into bv_tit;
    end if;
    update fin_bv_partes set pagar_id=bv_tit, updated_at=now() where pedido_id=p.id and cliente_id=pt.cliente_id;
   end loop;
   update fin_bv_comissoes set aprovacao='aprovado', desconto=bv_desc, valor_aprovado=bv_aprov, aprovacao_motivo=nullif(bv_motivo,''),
     aprovado_por=auth.uid(), aprovado_em=now(), pagar_id=(select pagar_id from fin_bv_partes where pedido_id=p.id and cliente_id=bc.cliente_id), updated_at=now()
    where pedido_id=p.id;
  else
   update fin_bv_comissoes set aprovacao='reprovado', desconto=0, valor_aprovado=0, aprovacao_motivo=bv_motivo, aprovado_por=auth.uid(), aprovado_em=now(), updated_at=now() where pedido_id=p.id;
  end if;
  perform fin_auditar(p_empresa,'fin_bv_comissoes',p.id,'posicao_final',to_jsonb(bc),bv_salvo,'BV decidido na Posição final');
 end if;
 insert into fin_posicoes_finais(pedido_id,empresa_id,versao,status,fonte,itens,credito,cobranca,credito_id,receber_id,atualizado_por,confirmado_em,bv)
 values(p.id,p_empresa,coalesce(f.versao,0)+1,case when p_confirmar then 'confirmado' else 'rascunho' end,p_fonte,itens,cre,cob,credito_id,receber_id,auth.uid(),case when p_confirmar then now() end,bv_salvo)
 on conflict(pedido_id) do update set versao=excluded.versao,status=excluded.status,fonte=excluded.fonte,itens=excluded.itens,credito=excluded.credito,cobranca=excluded.cobranca,
  credito_id=excluded.credito_id,receber_id=excluded.receber_id,atualizado_em=now(),atualizado_por=auth.uid(),confirmado_em=excluded.confirmado_em,bv=excluded.bv;
 perform fin_auditar(p_empresa,'fin_posicoes_finais',p.id,case when p_confirmar then 'confirmar' else 'rascunho' end,to_jsonb(f),
  jsonb_build_object('itens',itens,'credito',cre,'cobranca',cob,'credito_id',credito_id,'receber_id',receber_id),'Posição final do pedido');
 return fin_posicao_final_base(p_empresa,p.id);
end $function$;

CREATE OR REPLACE FUNCTION public.fin_posicao_final_salvar(p_empresa uuid, p_pedido uuid, p_fonte text, p_versao integer, p_decisoes jsonb, p_confirmar boolean DEFAULT false, p_bv jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p separacoes_pedidos;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso ao pedido'; end if;
 if pedido_fluxo_etapa(p)<>'posicao_final' then raise exception 'Conclua a coleta, o descarregamento e a Triagem de retorno antes da Posição final'; end if;
 return fin_posicao_final_salvar_antes_fluxo(p_empresa,p_pedido,p_fonte,p_versao,p_decisoes,p_confirmar,p_bv);
end $function$;

revoke all on function public.fin_posicao_final_salvar_antes_fluxo(uuid,uuid,text,integer,jsonb,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean,jsonb) from public, anon;
grant execute on function public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean,jsonb) to authenticated;
