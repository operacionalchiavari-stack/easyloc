-- Etapa nova criada à mão no cronograma (sem ninguém escolhido) recebe a escala automática,
-- igual às geradas pelo pedido. Só preenche o que está vazio.
create or replace function public.operacao_escala_preencher_etapas(p_etapas uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from operacao_etapas where id = any(p_etapas) limit 1;
  if v_empresa is null then return 0; end if;
  if not (funcionario_pode(v_empresa, auth.uid(), 'logistica.planejamento.editar') or funcionario_pode(v_empresa, auth.uid(), 'logistica.cronograma.editar')) then
    raise exception 'Você não tem permissão para alterar a escala.';
  end if;
  return operacao_escala_preencher(v_empresa, array(select id from operacao_etapas where id = any(p_etapas) and empresa_id = v_empresa));
end $$;
revoke all on function public.operacao_escala_preencher_etapas(uuid[]) from public, anon;
grant execute on function public.operacao_escala_preencher_etapas(uuid[]) to authenticated;
