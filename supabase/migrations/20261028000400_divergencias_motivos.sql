-- Divergências da volta resolvidas com motivo cadastrado (out/2026): Parâmetros > Operação, "Motivos de carregamento,
-- entrega e coleta" ganhou dois tipos — "Divergência: faltou" e "Divergência: veio a mais". Resolver uma divergência
-- passa a exigir um desses motivos (ativo, da empresa e do tipo certo) em vez de texto livre.
begin;
alter table public.logistica_motivos drop constraint if exists logistica_motivos_etapa_check;
alter table public.logistica_motivos add constraint logistica_motivos_etapa_check
  check (etapa in ('entrega','coleta','carregamento','divergencia_falta','divergencia_sobra'));
insert into public.logistica_motivos(empresa_id,etapa,nome)
  select e.id,v.etapa,v.nome from public.empresas e cross join (values
    ('divergencia_falta','Peça encontrada no galpão'),('divergencia_falta','Peça ficou no local do evento'),
    ('divergencia_falta','Peça extraviada'),('divergencia_falta','Peça quebrada no evento'),('divergencia_falta','Erro de contagem'),
    ('divergencia_sobra','Peça de outro pedido'),('divergencia_sobra','Erro de contagem'),('divergencia_sobra','Peça do cliente')
  ) v(etapa,nome)
on conflict do nothing;

alter table public.operacao_ocorrencias add column if not exists motivo_id uuid references public.logistica_motivos(id);

drop function if exists public.operacao_resolver_divergencia(uuid,text,numeric,text);
create function public.operacao_resolver_divergencia(p_id uuid, p_acao text, p_motivo_id uuid, p_quantidade numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare o public.operacao_ocorrencias; q numeric; mot text; quem text:=coalesce(auth.jwt()->>'email','Equipe');
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if not public.eh_membro_empresa(o.empresa_id) or not public.funcionario_tabela_permitida(o.empresa_id,'separacoes_pedidos','editar') then
    raise exception 'Sem permissão para resolver divergências';
  end if;
  if o.resolvida_em is not null then raise exception 'Esta divergência já foi resolvida'; end if;
  if o.tipo not in ('falta','sobra') then raise exception 'Não é uma divergência de conferência'; end if;
  select nome into mot from public.logistica_motivos
   where id=p_motivo_id and empresa_id=o.empresa_id and etapa='divergencia_'||o.tipo and ativo;
  if mot is null then raise exception 'Escolha o motivo (cadastrado em Parâmetros > Operação)'; end if;
  if o.tipo='falta' and p_acao='apareceu' then
    q:=coalesce(p_quantidade,o.quantidade);
    if q is null or q<=0 or q>o.quantidade or q<>trunc(q) then raise exception 'Informe quantas peças apareceram (de 1 a %)', trim_scale(o.quantidade); end if;
    if q<o.quantidade then
      update public.operacao_ocorrencias set quantidade=quantidade-q,
        descricao=descricao||' · '||trim_scale(q)||' apareceram em '||to_char(now() at time zone 'America/Sao_Paulo','DD/MM HH24:MI')||' ('||mot||' — '||quem||')'
        where id=o.id;
      return jsonb_build_object('resolvida',false,'restam',o.quantidade-q);
    end if;
    update public.operacao_ocorrencias set resolvida_em=now(),motivo_id=p_motivo_id,resolucao='Apareceu ('||trim_scale(q)||'): '||mot||' — '||quem where id=o.id;
  elsif o.tipo='falta' and p_acao='perda' then
    perform public.operacao_resolver_ocorrencia(p_id,'perda',mot||' — '||quem);
    update public.operacao_ocorrencias set motivo_id=p_motivo_id where id=o.id;
  elsif o.tipo='sobra' and p_acao='conferido' then
    update public.operacao_ocorrencias set resolvida_em=now(),motivo_id=p_motivo_id,resolucao='Conferido: '||mot||' — '||quem where id=o.id;
  else
    raise exception 'Ação inválida para esta divergência';
  end if;
  return jsonb_build_object('resolvida',true);
end $fn$;
revoke all on function public.operacao_resolver_divergencia(uuid,text,uuid,numeric) from public, anon;
grant execute on function public.operacao_resolver_divergencia(uuid,text,uuid,numeric) to authenticated, service_role;
commit;
