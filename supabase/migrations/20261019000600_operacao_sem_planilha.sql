-- Operação no Supabase, parte 3 (out/2026): as regras que ainda olhavam a planilha do Cronograma
-- passam a olhar as tabelas novas; histórico de alterações com os campos que a tela mostra.

alter table public.operacao_alteracoes add column if not exists movimento uuid;
alter table public.operacao_alteracoes add column if not exists perfil text;
alter table public.operacao_alteracoes add column if not exists etapa_nome text;
alter table public.operacao_alteracoes add column if not exists cliente text;
alter table public.operacao_alteracoes add column if not exists pedido_numero text;

create or replace function public.operacao_tocar() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists operacao_etapas_tocar on public.operacao_etapas;
create trigger operacao_etapas_tocar before update on public.operacao_etapas for each row execute function public.operacao_tocar();

-- descarregamento: desmontagem programada e concluída no app do montador
create or replace function public.operacao_validar_etapa(p public.separacoes_pedidos, p_etapa text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'O pedido precisa estar aprovado'; end if;
  if p.reducao_liberada_em is not null then raise exception 'A triagem está aguardando a revisão do comercial'; end if;
  if p_etapa = 'carregamento' then
    if p.status not in ('separado','separado_com_divergencia') then raise exception 'Finalize a separação antes do carregamento'; end if;
    if p.operacao->'descarregamento'->>'concluido_em' is not null or p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'O pedido já avançou para o retorno'; end if;
  elsif p_etapa = 'descarregamento' then
    if p.operacao->'carregamento'->>'concluido_em' is null then raise exception 'Conclua o carregamento primeiro'; end if;
    if p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'A triagem de retorno já foi concluída'; end if;
    if not exists (select 1 from operacao_etapas where pedido_id = p.id and tipo = 'desmontagem') then raise exception 'Programe a desmontagem no cronograma antes de descarregar'; end if;
    if exists (select 1 from operacao_etapas e where e.pedido_id = p.id and e.tipo = 'desmontagem'
                and not exists (select 1 from operacao_registros r where r.etapa_id = e.id and r.tipo = 'desmontagem_concluida')) then
      raise exception 'Conclua todas as desmontagens antes do descarregamento';
    end if;
  elsif p_etapa = 'retorno' then
    if p.operacao->'descarregamento'->>'concluido_em' is null then raise exception 'Conclua o descarregamento antes da triagem de retorno'; end if;
  else raise exception 'Etapa inválida'; end if;
end $$;

-- nome antigo (usado pelo motor) apontando para a regra nova
create or replace function public.operacao_validar_campo(p_id_etapa text) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_id_etapa !~ '^[0-9a-f-]{36}$' then return; end if;
  perform operacao_validar_etapa_campo(p_id_etapa::uuid);
end $$;

-- O Cronograma recarrega só quando algo muda (agora pelas tabelas da operação)
create or replace function public.cronograma_assinatura() returns text language plpgsql stable security definer set search_path = public as $$
declare v_empresa uuid := public.gs_empresa_dona();
begin
  if not public.eh_membro_empresa(v_empresa) then return null; end if;
  return md5(concat_ws('|',
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from operacao_etapas where empresa_id = v_empresa),
    (select md5(coalesce(string_agg(etapa_id::text || coalesce(funcionario_id::text, free_id::text, nome) || papel, ',' order by etapa_id, papel, nome), '')) from operacao_etapa_pessoas where empresa_id = v_empresa),
    (select md5(coalesce(string_agg(etapa_id::text || caminhao_id::text, ',' order by etapa_id, caminhao_id), '')) from operacao_etapa_caminhoes where empresa_id = v_empresa),
    (select count(*) || ':' || coalesce(max(created_at)::text, '') || md5(coalesce(string_agg(id::text || data || coalesce(descricao, ''), ',' order by id), '')) from operacao_agenda where empresa_id = v_empresa),
    (select count(*) || ':' || coalesce(max(atualizado_em)::text, '') from operacao_registros where empresa_id = v_empresa),
    (select count(*) || ':' || md5(coalesce(string_agg(id::text || status, ',' order by id), '')) from operacao_trocas where empresa_id = v_empresa),
    (select count(*) || ':' || md5(coalesce(string_agg(id::text || status, ',' order by id), '')) from operacao_alertas_motorista where empresa_id = v_empresa),
    (select count(*) || ':' || coalesce(max(atualizado_em)::text, '') from free_vagas where empresa_id = v_empresa),
    (select md5(coalesce(string_agg(id::text || status || coalesce(checkin_em::text, '') || coalesce(checkout_em::text, ''), ',' order by id), '')) from free_inscricoes where empresa_id = v_empresa),
    (select count(*) || ':' || coalesce(max(em)::text, '') from operacao_alteracoes where empresa_id = v_empresa),
    (select md5(coalesce(string_agg(id::text || coalesce(status, '') || coalesce(status_comercial, '') || coalesce(status_operacional, '') || coalesce(operacao::text, '') || coalesce(atualizado_em::text, ''), ',' order by id), '')) from separacoes_pedidos where empresa_id = v_empresa),
    (select count(*) || '-' || coalesce(sum(quantidade_separada), 0) || '-' || coalesce(max(atualizado_em)::text, '') from separacoes_itens where empresa_id = v_empresa),
    (select count(*) || '-' || count(lida_separacao_em) || '-' || count(lida_carregamento_em) || '-' || count(lida_retorno_em) || '-' || count(lida_descarregamento_em) from separacoes_etiquetas where empresa_id = v_empresa)
  ));
end $$;
revoke all on function public.cronograma_assinatura() from public, anon;
grant execute on function public.cronograma_assinatura() to authenticated;

-- empresa da equipe logada (para as telas internas)
create or replace function public.operacao_empresa() returns uuid language sql stable security definer set search_path=public as $$
  select case when eh_membro_empresa(gs_empresa_dona()) then gs_empresa_dona() end
$$;
grant execute on function public.operacao_empresa() to authenticated;

-- permissões da pessoa logada nas chaves da operação (uma ida ao banco)
create or replace function public.operacao_minhas_permissoes() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_object_agg(k, funcionario_pode(gs_empresa_dona(), auth.uid(), k))
    from unnest(array['logistica.cronograma.visualizar','logistica.cronograma.editar','logistica.cronograma.montagem','logistica.cronograma.internas',
                      'logistica.cronograma.expedicao','logistica.cronograma.motorista','logistica.cronograma.agenda','logistica.planejamento.visualizar',
                      'logistica.planejamento.editar','rh.colaboradores.visualizar','rh.colaboradores.editar']) k
$$;
grant execute on function public.operacao_minhas_permissoes() to authenticated;

-- staff lê a vaga com segredo? nunca; mas precisa da chave do líder para o link do QR (já liberada por coluna)
