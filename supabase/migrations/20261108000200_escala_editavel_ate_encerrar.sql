-- Nov/2026: o Painel Logístico mostra montagem/desmontagem em todas as etapas (29/out), mas salvar a escala
-- só era aceito na Triagem/Expedição — depois do carregamento a equipe da montagem/desmontagem não mudava mais,
-- com uma mensagem de "pré-reserva" sem sentido. Agora vale para pedido reservado até a operação ser encerrada.
create or replace function public.operacao_escala_salvar(p_etapa uuid,p_responsavel text,p_equipe text[],p_caminhoes text[],p_forcar boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; etapa text;
begin
 select ped.* into p from separacoes_pedidos ped join operacao_etapas e on e.pedido_id=ped.id where e.id=p_etapa for update of ped;
 if p.id is not null then
  etapa:=pedido_fluxo_etapa(p);
  if etapa='pre_reserva' then raise exception 'Pedido em pré-reserva: a escala é só consulta. Reserve o pedido para montar a equipe.'; end if;
  if etapa='comercial' then raise exception 'Pedido em orçamento ou em revisão no Comercial: a escala fica disponível quando ele for reservado.'; end if;
  if etapa='cancelado' then raise exception 'Pedido cancelado: a escala não pode ser alterada.'; end if;
  if p.encerrado_operacional_em is not null or etapa='posicao_final' then raise exception 'Operação deste pedido já foi encerrada: a escala não pode mais ser alterada.'; end if;
 end if;
 return operacao_escala_salvar_sem_fluxo(p_etapa,p_responsavel,p_equipe,p_caminhoes,p_forcar);
end $$;
revoke all on function public.operacao_escala_salvar(uuid,text,text[],text[],boolean) from public,anon;
grant execute on function public.operacao_escala_salvar(uuid,text,text[],text[],boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.operacao_escala_salvar_sem_fluxo(p_etapa uuid, p_responsavel text, p_equipe text[], p_caminhoes text[], p_forcar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e operacao_etapas; nome text; n int := 0; pessoa record; conflitos jsonb; cod text; k uuid;
begin
  select * into e from operacao_etapas where id = p_etapa;
 -- Nov/2026: mesma regra do embrulho (pedido reservado até a operação ser encerrada).
 if exists(select 1 from public.separacoes_pedidos p where p.id=e.pedido_id and (p.encerrado_operacional_em is not null or public.pedido_fluxo_etapa(p) in ('pre_reserva','comercial','cancelado','posicao_final'))) then
  raise exception 'Escala indisponível: o pedido não está reservado ou a operação já foi encerrada.';
 end if;

  if e.id is null then raise exception 'Etapa não encontrada. Atualize a tela.'; end if;
  if not (funcionario_pode(e.empresa_id, auth.uid(), 'logistica.planejamento.editar') or funcionario_pode(e.empresa_id, auth.uid(), 'logistica.cronograma.editar')) then
    raise exception 'Você não tem permissão para alterar a escala.';
  end if;
  delete from operacao_etapa_pessoas where etapa_id = e.id;
  delete from operacao_etapa_caminhoes where etapa_id = e.id;
  if coalesce(trim(p_responsavel), '') not in ('', '-') then
    select * into pessoa from operacao_achar_pessoa(e.empresa_id, p_responsavel);
    insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, free_id, nome, papel)
    values (e.empresa_id, e.id, pessoa.funcionario_id, pessoa.free_id, trim(p_responsavel), 'responsavel');
  end if;
  foreach nome in array coalesce(p_equipe, '{}') loop
    nome := trim(nome);
    continue when nome in ('', '-') or lower(nome) = lower(coalesce(trim(p_responsavel), ''));
    select * into pessoa from operacao_achar_pessoa(e.empresa_id, nome);
    insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, free_id, nome, papel, ordem)
    values (e.empresa_id, e.id, pessoa.funcionario_id, pessoa.free_id, nome, 'equipe', n);
    n := n + 1;
  end loop;
  foreach cod in array coalesce(p_caminhoes, '{}') loop
    select id into k from caminhoes where empresa_id = e.empresa_id and lower(coalesce(codigo, '')) = lower(trim(cod)) limit 1;
    if k is not null then insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id) values (e.id, k, e.empresa_id) on conflict do nothing; end if;
  end loop;
  update operacao_etapas set atualizado_por = auth.uid() where id = e.id;
  select coalesce(jsonb_agg(mensagem), '[]') into conflitos from operacao_conflitos(e.empresa_id, e.data, e.data) c where c.etapa_id = e.id;
  if jsonb_array_length(conflitos) > 0 and not p_forcar then
    raise exception 'CONFLITO:%', conflitos::text;  -- desfaz tudo; a tela mostra e pergunta
  end if;
  return jsonb_build_object('ok', true, 'conflitos', conflitos);
end $function$;
