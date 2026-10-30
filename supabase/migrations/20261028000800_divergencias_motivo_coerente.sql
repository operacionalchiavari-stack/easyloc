-- 2ª conferência que faz sentido (out/2026): o sistema compara a 2ª conferência com o esperado e o motivo tem que
-- combinar com o resultado.
--  - Bateu (2ª conferência = esperado): a divergência foi erro na 1ª contagem; só aceita motivos "quando bate".
--  - Continua diferente: a divergência se confirma; só aceita motivos "quando a diferença continua". Falta confirmada:
--    o que continua faltando vira perda. A mais confirmado: fica justificado pelo motivo.
--  - Falta que passa do esperado, ou "a mais" que fica abaixo, é recusada: conte de novo.
-- logistica_motivos.situacao ('bateu'|'continua') diz quando cada motivo de divergência pode ser usado.
begin;
alter table public.logistica_motivos add column if not exists situacao text;
alter table public.logistica_motivos drop constraint if exists logistica_motivos_situacao_check;
alter table public.logistica_motivos add constraint logistica_motivos_situacao_check
  check (situacao is null or (situacao in ('bateu','continua') and etapa like 'divergencia_%'));
update public.logistica_motivos set situacao=case
    when nome in ('Peça encontrada no galpão','Erro de contagem') then 'bateu' else 'continua' end
  where etapa like 'divergencia_%' and situacao is null;
alter table public.operacao_ocorrencias add column if not exists resultado text;

create or replace function public.operacao_fechar_divergencia(p_id uuid, p_contagem numeric, p_motivo_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare o public.operacao_ocorrencias; m public.logistica_motivos; e numeric; dif numeric; sit text; nome text;
  quem text:=coalesce(auth.jwt()->>'email','Equipe');
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if not public.eh_membro_empresa(o.empresa_id) or not public.funcionario_tabela_permitida(o.empresa_id,'separacoes_pedidos','editar') then
    raise exception 'Sem permissão para resolver divergências';
  end if;
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
  dif:=e-p_contagem;
  if dif>o.quantidade then raise exception 'A 2ª conferência (%) não pode ser menor que a 1ª (%)', trim_scale(p_contagem), trim_scale(e-o.quantidade); end if;
  update public.operacao_ocorrencias set quantidade=dif where id=o.id;
  if exists(select 1 from public.acervo_retornos a where a.pedido_id=o.pedido_id and a.item_id=o.item_id) then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Perda de '||trim_scale(dif)||' confirmada na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||'; baixa no Retorno do acervo) — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif,'acervo',true);
  end if;
  perform public.operacao_resolver_ocorrencia(p_id,'perda','2ª conferência '||trim_scale(p_contagem)||' de '||trim_scale(e)||' — '||m.nome||' — '||quem);
  return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif);
end $fn$;
revoke all on function public.operacao_fechar_divergencia(uuid,numeric,uuid) from public, anon;
grant execute on function public.operacao_fechar_divergencia(uuid,numeric,uuid) to authenticated, service_role;

-- As já resolvidas pela 2ª conferência: marca o resultado e reabre as que têm motivo que não combina (ex.: bateu, mas o
-- motivo era "Peça de outro pedido"). Perda já baixada nunca é reaberta.
update public.operacao_ocorrencias o set resultado=case when o.segunda_contagem=o.esperado then 'bateu' else 'continua' end
 where o.segunda_contagem is not null and o.esperado is not null and o.resultado is null;
update public.operacao_ocorrencias o
   set resolvida_em=null, resolucao=null, segunda_contagem=null, motivo_id=null, resolvido_por=null, resolvido_por_nome=null, resultado=null
  from public.logistica_motivos m
 where m.id=o.motivo_id and o.segunda_contagem is not null and o.resolvida_em is not null
   and coalesce(o.resolucao,'') not like 'Perda confirmada:%'
   and m.situacao is not null and m.situacao<>o.resultado;
commit;
