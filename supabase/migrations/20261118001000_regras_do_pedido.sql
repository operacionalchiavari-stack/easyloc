-- Regras do pedido (18/11/2026): texto fixo (um "contrato resumido") que vai no fim de todo pedido.
-- Editado em Comercial > Contratos > aba "Regras do pedido"; sai junto com os avisos do documento (comercial_avisos_pedido_textos),
-- então o pedido do Comercial, a Central e o link do cliente recebem sem chamada nova.
alter table public.comercial_avisos_pedido add column if not exists regras_pedido text;

create or replace function public.comercial_avisos_pedido_textos(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orcamento', coalesce(nullif(btrim(a.orcamento), ''), 'Este documento é um orçamento. Os móveis ainda não estão reservados: a disponibilidade só fica garantida quando o pedido for confirmado.'),
    'pre_reserva', coalesce(nullif(btrim(a.pre_reserva), ''), 'Pré-reserva: os móveis estão reservados para você até {data}. Depois dessa data, se o pedido não for confirmado, a reserva é liberada.'),
    'regras', coalesce(nullif(btrim(a.regras_pedido), ''), ''))
  from (select 1) x left join comercial_avisos_pedido a on a.empresa_id = p_empresa
$$;
revoke all on function public.comercial_avisos_pedido_textos(uuid) from public, anon, authenticated;

create or replace function public.comercial_regras_pedido_salvar(p_empresa uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not (operacao_pode(p_empresa, 'comercial.contratos.editar') or operacao_pode(p_empresa, 'configuracoes.empresa.editar')) then
    raise exception 'Sem permissão para editar as regras do pedido' using errcode = '42501';
  end if;
  if length(coalesce(p_texto, '')) > 20000 then raise exception 'O texto pode ter até 20.000 caracteres'; end if;
  insert into comercial_avisos_pedido(empresa_id, regras_pedido, atualizado_em) values (p_empresa, nullif(btrim(p_texto), ''), now())
  on conflict (empresa_id) do update set regras_pedido = excluded.regras_pedido, atualizado_em = now();
end $$;
revoke all on function public.comercial_regras_pedido_salvar(uuid, text) from public, anon;
grant execute on function public.comercial_regras_pedido_salvar(uuid, text) to authenticated;
notify pgrst, 'reload schema';
