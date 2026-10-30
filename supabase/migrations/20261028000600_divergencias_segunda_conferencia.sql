-- Divergência resolvida só com a 2ª conferência e o motivo (out/2026, sem botões): a pessoa conta de novo, digita a
-- quantidade e escolhe o motivo; a divergência fecha sozinha.
--  - Faltou: se a 2ª conferência chega ao esperado, fecha como "apareceu"; senão o que continua faltando é baixado do
--    estoque como perda (com o motivo); se a peça já está no Retorno do acervo, a baixa fica por lá.
--  - Veio a mais: fecha registrando a 2ª conferência e o motivo.
begin;
alter table public.operacao_ocorrencias add column if not exists segunda_contagem numeric;

create or replace function public.operacao_fechar_divergencia(p_id uuid, p_contagem numeric, p_motivo_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare o public.operacao_ocorrencias; mot text; e numeric; faltam numeric; quem text:=coalesce(auth.jwt()->>'email','Equipe');
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if not public.eh_membro_empresa(o.empresa_id) or not public.funcionario_tabela_permitida(o.empresa_id,'separacoes_pedidos','editar') then
    raise exception 'Sem permissão para resolver divergências';
  end if;
  if o.resolvida_em is not null then raise exception 'Esta divergência já foi resolvida'; end if;
  if o.tipo not in ('falta','sobra') then raise exception 'Não é uma divergência de conferência'; end if;
  if p_contagem is null or p_contagem<0 or p_contagem<>trunc(p_contagem) then raise exception 'Informe a quantidade da 2ª conferência'; end if;
  select nome into mot from public.logistica_motivos
   where id=p_motivo_id and empresa_id=o.empresa_id and etapa='divergencia_'||o.tipo and ativo;
  if mot is null then raise exception 'Escolha o motivo (cadastrado em Parâmetros > Operação)'; end if;
  e:=coalesce(o.esperado, case when o.tipo='falta' then coalesce(o.conferido,0)+o.quantidade end);
  update public.operacao_ocorrencias set segunda_contagem=p_contagem, motivo_id=p_motivo_id where id=o.id;
  if o.tipo='sobra' then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='2ª conferência: '||trim_scale(p_contagem)||coalesce(' de '||trim_scale(e),'')||' — '||mot||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true);
  end if;
  faltam:=e-p_contagem;
  if faltam<=0 then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Apareceu na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||') — '||mot||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'perda',0);
  end if;
  if faltam>o.quantidade then raise exception 'A 2ª conferência (%) não pode ser menor que a 1ª (%)', trim_scale(p_contagem), trim_scale(e-o.quantidade); end if;
  update public.operacao_ocorrencias set quantidade=faltam where id=o.id;
  -- Peça que já está no Retorno do acervo: a baixa é feita lá (evita baixar duas vezes); aqui só fecha a divergência.
  if exists(select 1 from public.acervo_retornos a where a.pedido_id=o.pedido_id and a.item_id=o.item_id) then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Perda de '||trim_scale(faltam)||' (2ª conferência '||trim_scale(p_contagem)||' de '||trim_scale(e)||'; baixa no Retorno do acervo) — '||mot||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'perda',faltam,'acervo',true);
  end if;
  perform public.operacao_resolver_ocorrencia(p_id,'perda','2ª conferência '||trim_scale(p_contagem)||' de '||trim_scale(e)||' — '||mot||' — '||quem);
  return jsonb_build_object('resolvida',true,'perda',faltam);
end $fn$;
revoke all on function public.operacao_fechar_divergencia(uuid,numeric,uuid) from public, anon;
grant execute on function public.operacao_fechar_divergencia(uuid,numeric,uuid) to authenticated, service_role;
commit;
