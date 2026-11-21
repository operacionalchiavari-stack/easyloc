-- Atualizar imagens não altera os itens já enviados para a operação.
-- Mantém RLS e a trava geral; a exceção só vale para renders/plantas do projeto.
begin;
create or replace function public.pedido_salvar_projeto_comercial(p_empresa_id uuid, p_pedido_id uuid, p_projeto jsonb)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  p separacoes_pedidos;
  anterior jsonb;
  projeto jsonb := p_projeto;
  ambientes jsonb;
  travado boolean;
  salvo boolean;
  fluxo_anterior text := coalesce(current_setting('app.fluxo_transferencia', true), '');
begin
  if p_projeto is null or jsonb_typeof(p_projeto) <> 'object'
     or coalesce(jsonb_typeof(p_projeto->'dados'), '') <> 'object'
     or coalesce(jsonb_typeof(p_projeto->'dados'->'ambientes'), '') <> 'array' then
    raise exception 'Projeto do pedido inválido';
  end if;
  select * into p from separacoes_pedidos
    where id = p_pedido_id and empresa_id = p_empresa_id for update;
  if not found then return false; end if;
  if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not seguranca_2fa_ok() then
    raise exception 'Sem acesso ao pedido' using errcode = '42501';
  end if;
  anterior := p.observacoes->'projeto_comercial';
  -- Consultar um link já atualizado não precisa escrever no pedido.
  if anterior = projeto then return true; end if;
  if not operacao_pode(p.empresa_id, 'comercial.pedidos.editar') then
    raise exception 'Sem permissão para editar o projeto do pedido' using errcode = '42501';
  end if;
  travado := p.encerrado_operacional_em is not null
    or p.operacao->'carregamento'->>'iniciado_em' is not null
    or coalesce(p.status_operacional, '') <> ''
    or (p.status <> 'pendente' and p.reducao_liberada_em is null);
  if travado then
    -- Não aceita ambientes novos/removidos nem alterações nos itens ou quantidades.
    if coalesce(jsonb_typeof(anterior->'dados'->'ambientes'), '') <> 'array'
       or exists (
         select 1 from jsonb_array_elements(projeto->'dados'->'ambientes') a
         group by a->>'id' having a->>'id' is null or count(*) <> 1
       ) or exists (
         select 1
         from jsonb_array_elements(anterior->'dados'->'ambientes') a
         full join jsonb_array_elements(projeto->'dados'->'ambientes') b on a->>'id' = b->>'id'
         where a is null or b is null
           or coalesce(a->'itens', '[]'::jsonb) is distinct from coalesce(b->'itens', '[]'::jsonb)
       ) then
      raise exception 'Os itens deste pedido estão com o operacional. Atualize apenas as imagens ou solicite a liberação pela Triagem';
    end if;
    if coalesce(jsonb_typeof(projeto->'dados'->'plantas'), 'array') <> 'array'
       or exists (select 1 from jsonb_array_elements(projeto->'dados'->'ambientes') a
                  where coalesce(jsonb_typeof(a->'renders'), 'array') <> 'array') then
      raise exception 'Imagens do projeto inválidas';
    end if;
    select coalesce(jsonb_agg(jsonb_set(a, '{renders}', coalesce(b->'renders', '[]'::jsonb), true) order by ordem), '[]'::jsonb)
      into ambientes
      from jsonb_array_elements(anterior->'dados'->'ambientes') with ordinality original(a, ordem)
      join jsonb_array_elements(projeto->'dados'->'ambientes') b on a->>'id' = b->>'id';
    -- Mescla apenas os campos visuais. Todo o restante vem da versão atual do banco.
    projeto := jsonb_set(jsonb_set(anterior, '{dados,ambientes}', ambientes),
      '{dados,plantas}', coalesce(projeto->'dados'->'plantas', '[]'::jsonb), true);
  end if;
  if anterior = projeto then return true; end if;
  if travado then perform set_config('app.fluxo_transferencia', 'sim', true); end if;
  update separacoes_pedidos
    set observacoes = jsonb_set(coalesce(observacoes, '{}'::jsonb), '{projeto_comercial}', projeto, true)
    where id = p.id returning true into salvo;
  if travado then perform set_config('app.fluxo_transferencia', fluxo_anterior, true); end if;
  return coalesce(salvo, false);
end;
$$;
revoke all on function public.pedido_salvar_projeto_comercial(uuid, uuid, jsonb) from public, anon;
grant execute on function public.pedido_salvar_projeto_comercial(uuid, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
