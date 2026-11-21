-- 16/11/2026: faltas não ficam mais "em investigação" esperando alguém (bloco "Peças que não voltaram" saiu de Divergências).
-- (1) Perda confirmada na divergência (2ª contagem/contagem geral) já baixa o estoque.
-- (2) Falta registrada na coleta é liberada quando a triagem da volta termina: a contagem da volta e a divergência decidem.
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
    -- 16/11/2026: a perda confirmada na divergência já baixa o estoque (não fica mais "em investigação")
    update public.itens set estoque_total=greatest(0,coalesce(estoque_total,0)-dif) where id=o.item_id and empresa_id=o.empresa_id;
    update public.acervo_retornos set estado='baixado',motivo='Perda confirmada na divergência — '||m.nome where id=falta_id;
    insert into public.acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id)
    values(o.empresa_id,falta_id,'baixado','Perda de '||trim_scale(dif)||' confirmada na divergência e baixada do estoque — '||m.nome,auth.uid());
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Perda de '||trim_scale(dif)||' confirmada na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||'); baixada do estoque — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif,'acervo',true);
  end if;
  perform public.operacao_resolver_ocorrencia(p_id,'perda','2ª conferência '||trim_scale(p_contagem)||' de '||trim_scale(e)||' — '||m.nome||' — '||quem);
  return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif);
end $function$;

create or replace function public.acervo_liberar_revisao_pedido(p_pedido uuid) returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer:=0; r record; u uuid;
begin
 select coalesce(auth.uid(), nullif(operacao->'retorno'->>'usuario_id','')::uuid, atualizado_por) into u from separacoes_pedidos where id=p_pedido;
 for r in select a.* from acervo_retornos a where a.pedido_id=any(pedido_grupo(p_pedido)) and a.os_id is null
   and ((a.tipo='revisao' and a.estado in ('aguardando_retorno','triagem')) or (a.tipo='falta' and a.origem='coleta' and a.estado='investigacao')) for update loop
  update acervo_retornos set estado='liberado',motivo=case when r.tipo='falta' then 'Falta da coleta conferida na triagem da volta' else 'Voltou sem dano: liberado na triagem da volta' end,versao=versao+1,atualizado_em=now() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select r.empresa_id,r.id,'liberado',case when r.tipo='falta' then 'Falta da coleta conferida na triagem da volta (a divergência decide se é perda)' else 'Voltou sem dano: liberado na triagem da volta' end,coalesce(u,r.atualizado_por) where coalesce(u,r.atualizado_por) is not null;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.acervo_liberar_revisao_pedido(uuid) from public, anon, authenticated;

do $$ declare p record; begin
 for p in select distinct s.id from separacoes_pedidos s join acervo_retornos a on a.pedido_id=s.id
   where (s.operacao->'retorno'->>'concluido_em') is not null and a.tipo='falta' and a.origem='coleta' and a.estado='investigacao' loop
  perform acervo_liberar_revisao_pedido(p.id);
 end loop;
end $$;
