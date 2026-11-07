-- Nov/2026 (teste do usuário final, itens 5 e 6)
-- 5: perda confirmada na divergência (Gestão do acervo) vira falta em investigação no acervo (confirmar baixa o estoque)
--    e entra na Posição final como reposição a cobrar.
-- 6: a mesma peça que faltou no descarregamento e na triagem da volta do mesmo pedido não vira duas perdas.
CREATE OR REPLACE FUNCTION public.operacao_fechar_divergencia_core(p_id uuid, p_contagem numeric, p_motivo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o public.operacao_ocorrencias; m public.logistica_motivos; rv public.acervo_retornos; falta_id uuid; e numeric; dif numeric; sit text; nome text;
  quem text:=coalesce(auth.jwt()->>'email','Equipe');
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if o.resolvida_em is not null then raise exception 'Esta divergência já foi resolvida'; end if;
  if o.tipo not in ('falta','sobra') then raise exception 'Não é uma divergência de conferência'; end if;
  if p_contagem is null or p_contagem<0 or p_contagem<>trunc(p_contagem) then raise exception 'Informe a quantidade da 2ª conferência'; end if;
  e:=coalesce(o.esperado, case when o.tipo='falta' then coalesce(o.conferido,0)+o.quantidade end);
  if e is null then raise exception 'Esta divergência não tem a quantidade esperada'; end if;
  if o.tipo='falta' and p_contagem>e then raise exception 'A 2ª conferência (%) passou do esperado (%): conte de novo', trim_scale(p_contagem), trim_scale(e); end if;
  if o.tipo='sobra' and p_contagem<e then raise exception 'A 2ª conferência (%) ficou abaixo do esperado (%): conte de novo', trim_scale(p_contagem), trim_scale(e); end if;
  sit:=case when p_contagem=e then 'bateu' else 'continua' end;
  select * into m from public.logistica_motivos
   where id=p_motivo_id and empresa_id=o.empresa_id and etapa='divergencia_'||o.tipo and ativo;
  if m.id is null then raise exception 'Escolha o motivo (cadastrado em Parâmetros > Operação)'; end if;
  if coalesce(m.situacao,sit)<>sit then
    raise exception 'O motivo "%" não combina com a 2ª conferência: %', m.nome,
      case when sit='bateu' then 'a quantidade bateu com o esperado' when o.tipo='falta' then 'ainda faltam '||trim_scale(e-p_contagem)
           else 'ainda há '||trim_scale(p_contagem-e)||' a mais' end;
  end if;
  nome:=coalesce((select nullif(btrim(f.nome),'') from public.funcionarios_acesso f where f.id=auth.uid() and f.empresa_id=o.empresa_id),
                 (select nullif(btrim(u.nome),'') from public.usuarios u where u.id=auth.uid()), quem);
  update public.operacao_ocorrencias set segunda_contagem=p_contagem, motivo_id=m.id, resolvido_por=auth.uid(), resolvido_por_nome=nome, resultado=sit
   where id=o.id;
  if sit='bateu' then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='2ª conferência bateu ('||trim_scale(p_contagem)||' de '||trim_scale(e)||') — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit);
  end if;
  if o.tipo='sobra' then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Confirmado '||trim_scale(p_contagem-e)||' a mais na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||') — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit);
  end if;
  -- Nov/2026 (teste do usuário final, item 6): a mesma peça já confirmada como perda em outra contagem deste pedido
  -- (descarregamento x triagem da volta) não gera uma segunda perda.
  if exists(select 1 from public.operacao_ocorrencias x where x.pedido_id=o.pedido_id and x.item_id=o.item_id and x.tipo='falta'
             and x.id<>o.id and x.resultado='continua' and x.resolvida_em is not null) then
    update public.operacao_ocorrencias set quantidade=e-p_contagem, resolvida_em=now(),
      resolucao='Mesma peça da perda já confirmada em outra contagem deste pedido ('||trim_scale(p_contagem)||' de '||trim_scale(e)||') — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit,'perda',0,'mesma',true);
  end if;
  dif:=e-p_contagem;
  if dif>o.quantidade then raise exception 'A 2ª conferência (%) não pode ser menor que a 1ª (%)', trim_scale(p_contagem), trim_scale(e-o.quantidade); end if;
  update public.operacao_ocorrencias set quantidade=dif where id=o.id;
  if exists(select 1 from public.acervo_retornos a where a.pedido_id=o.pedido_id and a.item_id=o.item_id) then
    -- Nov/2026 (teste do usuário final, item 5): antes só escrevia "baixa no Retorno do acervo" e nada baixava.
    -- Agora a perda sai da revisão e vira uma falta em investigação; confirmar essa falta no Painel do acervo baixa o estoque.
    select * into rv from public.acervo_retornos a where a.pedido_id=o.pedido_id and a.item_id=o.item_id and a.tipo='revisao'
      and a.estado not in ('baixado','liberado') order by a.criado_em limit 1 for update;
    if rv.id is not null and rv.quantidade>dif then
      update public.acervo_retornos set quantidade=quantidade-dif, versao=versao+1, atualizado_em=now(), atualizado_por=auth.uid() where id=rv.id;
    end if;
    insert into public.acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem)
    values(o.empresa_id,o.pedido_id,coalesce(rv.chave,o.codigo),o.item_id,'falta',dif,'investigacao',m.nome,auth.uid(),'triagem_retorno')
    on conflict(pedido_id,chave,tipo) do update set quantidade=public.acervo_retornos.quantidade+excluded.quantidade,
      estado=case when public.acervo_retornos.estado in ('baixado','liberado') then 'investigacao' else public.acervo_retornos.estado end,
      versao=public.acervo_retornos.versao+1, atualizado_em=now(), atualizado_por=auth.uid()
    returning id into falta_id;
    insert into public.acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id)
    values(o.empresa_id,falta_id,'investigacao','Perda de '||trim_scale(dif)||' confirmada na divergência — '||m.nome,auth.uid());
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Perda de '||trim_scale(dif)||' confirmada na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||'); enviada para baixa em Gestão do acervo — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif,'acervo',true);
  end if;
  perform public.operacao_resolver_ocorrencia(p_id,'perda','2ª conferência '||trim_scale(p_contagem)||' de '||trim_scale(e)||' — '||m.nome||' — '||quem);
  return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif);
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
  'titulos',titulos,'pagamentos',pagamentos,'credito_titulo',credito);
end $function$;
