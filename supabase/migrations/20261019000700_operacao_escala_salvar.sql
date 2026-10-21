-- Painel Logístico / Cronograma (out/2026): lista de pessoas da operação e gravação da escala de uma etapa
-- com checagem de conflito (mesma pessoa ou caminhão em horários que se cruzam).

create or replace function public.operacao_pessoas() returns jsonb language sql stable security definer set search_path=public as $$
  select case when eh_membro_empresa(gs_empresa_dona()) then
    coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'equipe', f.equipe_operacional, 'lider', f.lider_operacao, 'free', false) order by f.nome)
       from funcionarios_acesso f where f.empresa_id = gs_empresa_dona() and f.ativo and f.equipe_operacional is not null), '[]')
    || coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'equipe', 'free', 'lider', false, 'free', true) order by c.nome)
       from free_cadastros c where c.empresa_id = gs_empresa_dona() and c.status = 'aprovado'), '[]')
  else '[]'::jsonb end
$$;
grant execute on function public.operacao_pessoas() to authenticated;

-- acha a pessoa pelo nome (fixo da operação ou free aprovado); sem cadastro, fica só o nome
create or replace function public.operacao_achar_pessoa(p_empresa uuid, p_nome text, out funcionario_id uuid, out free_id uuid)
language plpgsql stable security definer set search_path=public as $$
declare chave text := lower(regexp_replace(translate(coalesce(p_nome, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '\s+', ' ', 'g'));
begin
  select f.id into funcionario_id from funcionarios_acesso f where f.empresa_id = p_empresa and f.ativo
     and lower(regexp_replace(translate(f.nome, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '\s+', ' ', 'g')) = trim(chave)
   order by (f.equipe_operacional is not null) desc limit 1;
  if funcionario_id is null then
    select c.id into free_id from free_cadastros c where c.empresa_id = p_empresa
       and lower(regexp_replace(translate(c.nome, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '\s+', ' ', 'g')) = trim(chave) limit 1;
  end if;
end $$;

create or replace function public.operacao_escala_salvar(p_etapa uuid, p_responsavel text, p_equipe text[], p_caminhoes text[], p_forcar boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e operacao_etapas; nome text; n int := 0; pessoa record; conflitos jsonb; cod text; k uuid;
begin
  select * into e from operacao_etapas where id = p_etapa;
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
end $$;
grant execute on function public.operacao_escala_salvar(uuid, text, text[], text[], boolean) to authenticated;
grant execute on function public.operacao_regras_escala(uuid) to authenticated;
