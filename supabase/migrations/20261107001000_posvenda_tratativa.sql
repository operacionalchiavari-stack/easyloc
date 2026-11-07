-- Pós-venda (nov/2026, teste de usuário item 25): quem cuida de um feedback que precisa de atenção
-- (resposta ruim ou pedido de retorno) e quando foi resolvido.
alter table public.posvenda_contatos
  add column if not exists tratativa_responsavel text,
  add column if not exists tratativa_obs text,
  add column if not exists tratativa_concluida_em timestamptz,
  add column if not exists tratativa_por_nome text;

create or replace function public.posvenda_tratativa(p_empresa uuid, p_contato uuid, p_responsavel text, p_obs text, p_concluir boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c posvenda_contatos; quem text;
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.editar') then raise exception 'Sem permissão.'; end if;
  select * into c from posvenda_contatos where id = p_contato and empresa_id = p_empresa for update;
  if c.id is null then raise exception 'Ligação não encontrada.'; end if;
  if not c.atencao then raise exception 'Este feedback não precisa de atenção.'; end if;
  if length(btrim(coalesce(p_responsavel, ''))) < 2 then raise exception 'Informe quem vai cuidar do retorno.'; end if;
  if p_concluir and length(btrim(coalesce(p_obs, ''))) < 5 then raise exception 'Conte o que foi feito (pelo menos 5 letras).'; end if;
  quem := coalesce((select nullif(btrim(f.nome), '') from funcionarios_acesso f where f.id = auth.uid() and f.empresa_id = p_empresa),
                   (select nullif(btrim(u.nome), '') from usuarios u where u.id = auth.uid()), auth.jwt()->>'email', 'Equipe');
  update posvenda_contatos set tratativa_responsavel = btrim(p_responsavel),
    tratativa_obs = coalesce(nullif(btrim(coalesce(p_obs, '')), ''), tratativa_obs),
    tratativa_concluida_em = case when p_concluir then now() else null end,
    tratativa_por_nome = quem
   where id = c.id returning * into c;
  return posvenda_contato_json(c);
end $$;
revoke all on function public.posvenda_tratativa(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.posvenda_tratativa(uuid, uuid, text, text, boolean) to authenticated;
