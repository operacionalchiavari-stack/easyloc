-- Parâmetros > Recursos humanos (nov/2026): itens dos checklists de admissão e desligamento, tipos e motivos
-- de desligamento passam a ser cadastráveis (rh_cadastro_opcoes, mesma tabela de setores e cargos).
alter table public.rh_cadastro_opcoes drop constraint if exists rh_cadastro_opcoes_tipo_check;
alter table public.rh_cadastro_opcoes add constraint rh_cadastro_opcoes_tipo_check
  check (tipo in ('setor','cargo','check_admissao','check_desligamento','tipo_desligamento','motivo_desligamento'));
alter table public.rh_cadastro_opcoes drop constraint if exists rh_cadastro_opcoes_nome_check;
alter table public.rh_cadastro_opcoes add constraint rh_cadastro_opcoes_nome_check check (length(trim(nome)) between 1 and 200);
alter table public.rh_cadastro_opcoes add column if not exists ordem integer not null default 0;

-- Semeia, para cada empresa, o que até hoje era fixo no código.
insert into public.rh_cadastro_opcoes(empresa_id, tipo, nome, ordem)
select e.id, v.tipo, v.nome, v.ordem from public.empresas e
cross join (values
  ('check_admissao','Exame admissional (ASO)',1),('check_admissao','Documentos pessoais recebidos (RG, CPF, comprovante de residência, foto)',2),
  ('check_admissao','Contrato de trabalho assinado',3),('check_admissao','Registro na carteira / eSocial',4),('check_admissao','Dados bancários / PIX cadastrados',5),
  ('check_admissao','Uniforme entregue',6),('check_admissao','Integração realizada',7),('check_admissao','Acesso ao sistema e senha operacional',8),('check_admissao','Inclusão nos benefícios',9),
  ('check_desligamento','Exame demissional',1),('check_desligamento','Aviso prévio / carta de desligamento',2),('check_desligamento','Devolução de uniforme e EPI',3),
  ('check_desligamento','Devolução de chaves, crachá e ferramentas',4),('check_desligamento','Acessos bloqueados (sistema, e-mail, grupos)',5),
  ('check_desligamento','Cálculo da rescisão com a contabilidade',6),('check_desligamento','Pagamento da rescisão',7),('check_desligamento','Termo de rescisão assinado',8),('check_desligamento','Baixa na carteira / eSocial',9),
  ('tipo_desligamento','Sem justa causa',1),('tipo_desligamento','Pedido de demissão',2),('tipo_desligamento','Justa causa',3),('tipo_desligamento','Fim do contrato de experiência',4),
  ('tipo_desligamento','Fim de contrato',5),('tipo_desligamento','Acordo entre as partes',6),('tipo_desligamento','Outro',7),
  ('motivo_desligamento','Desempenho abaixo do esperado',1),('motivo_desligamento','Comportamento ou disciplina',2),('motivo_desligamento','Faltas e atrasos',3),
  ('motivo_desligamento','Redução do quadro',4),('motivo_desligamento','Proposta de outra empresa',5),('motivo_desligamento','Mudança de cidade',6),
  ('motivo_desligamento','Motivos pessoais',7),('motivo_desligamento','Fim da necessidade do serviço',8),('motivo_desligamento','Outro',9)
) v(tipo, nome, ordem)
on conflict do nothing;

create or replace function public.rh_status(p_empresa uuid, p_funcionario uuid, p_status text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_itens jsonb;
begin
  if not rh_pode(p_empresa, 'rh.colaboradores.editar') then raise exception 'Sem permissão para editar colaboradores' using errcode = '42501'; end if;
  if p_status not in ('ativo','afastado','desligado') then raise exception 'Situação inválida'; end if;
  if not exists (select 1 from funcionarios_acesso where id = p_funcionario and empresa_id = p_empresa) then raise exception 'Funcionário não encontrado'; end if;
  if p_status = 'desligado' and p_funcionario = auth.uid() then raise exception 'Você não pode registrar o seu próprio desligamento'; end if;
  if p_status = 'desligado' and nullif(p_dados->>'data', '') is null then raise exception 'Informe a data do desligamento'; end if;
  insert into rh_fichas(funcionario_id, empresa_id) values (p_funcionario, p_empresa) on conflict (funcionario_id) do nothing;
  update rh_fichas set status = p_status,
    afastamento_motivo = case when p_status = 'afastado' then nullif(p_dados->>'motivo', '') when p_status = 'ativo' then null else afastamento_motivo end,
    afastamento_inicio = case when p_status = 'afastado' then nullif(p_dados->>'data', '')::date when p_status = 'ativo' then null else afastamento_inicio end,
    afastamento_fim = case when p_status = 'afastado' then nullif(p_dados->>'fim', '')::date when p_status = 'ativo' then null else afastamento_fim end,
    desligamento_data = case when p_status = 'desligado' then (p_dados->>'data')::date when p_status = 'ativo' then null else desligamento_data end,
    desligamento_tipo = case when p_status = 'desligado' then nullif(p_dados->>'tipo', '') when p_status = 'ativo' then null else desligamento_tipo end,
    desligamento_motivo = case when p_status = 'desligado' then nullif(p_dados->>'motivo', '') when p_status = 'ativo' then null else desligamento_motivo end,
    updated_at = now()
  where funcionario_id = p_funcionario;
  -- desligado não entra mais no sistema; reativar devolve o acesso
  if p_status = 'desligado' then
    update funcionarios_acesso set ativo = false, updated_at = now() where id = p_funcionario;
    -- Itens do checklist vêm de Parâmetros > Recursos humanos (nov/2026); sem nenhum cadastrado, os de sempre.
    v_itens := (select jsonb_agg(jsonb_build_object('texto', o.nome, 'feito', false) order by o.ordem, o.nome)
      from rh_cadastro_opcoes o where o.empresa_id = p_empresa and o.tipo = 'check_desligamento' and o.ativo);
    if v_itens is null then
    v_itens := (select jsonb_agg(jsonb_build_object('texto', t, 'feito', false)) from unnest(array[
      'Exame demissional','Aviso prévio / carta de desligamento','Devolução de uniforme e EPI','Devolução de chaves, crachá e ferramentas',
      'Acessos bloqueados (sistema, e-mail, grupos)','Cálculo da rescisão com a contabilidade','Pagamento da rescisão','Termo de rescisão assinado','Baixa na carteira / eSocial']) t);
    end if;
    insert into rh_checklists(empresa_id, funcionario_id, tipo, itens) values (p_empresa, p_funcionario, 'desligamento', v_itens)
      on conflict (funcionario_id, tipo) do update set concluido_em = null, itens = case when rh_checklists.concluido_em is null then rh_checklists.itens else excluded.itens end;
  elsif p_status = 'ativo' then
    update funcionarios_acesso set ativo = true, updated_at = now() where id = p_funcionario and not ativo;
  end if;
end $$;
