-- Grava só o projeto do pedido comercial (ambientes, renderizações, cenas) dentro de observacoes.projeto_comercial,
-- sem passar pelo salvamento completo do pedido (out/2026). Usado quando uma renderização com IA (ou a troca de móveis
-- no editor de cena) termina: o resultado fica no pedido na hora, sem depender de clicar em "Salvar pedido" de novo.
-- security invoker: valem as regras (RLS) de quem chama — só quem pode editar o pedido grava.
create or replace function public.pedido_salvar_projeto_comercial(p_empresa_id uuid, p_pedido_id uuid, p_projeto jsonb)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_projeto is null or jsonb_typeof(p_projeto) <> 'object' or jsonb_typeof(p_projeto->'dados') <> 'object' then
    raise exception 'Projeto do pedido inválido';
  end if;
  update public.separacoes_pedidos
     set observacoes = jsonb_set(coalesce(observacoes, '{}'::jsonb), '{projeto_comercial}', p_projeto, true)
   where id = p_pedido_id and empresa_id = p_empresa_id
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.pedido_salvar_projeto_comercial(uuid, uuid, jsonb) from public, anon;
grant execute on function public.pedido_salvar_projeto_comercial(uuid, uuid, jsonb) to authenticated;
