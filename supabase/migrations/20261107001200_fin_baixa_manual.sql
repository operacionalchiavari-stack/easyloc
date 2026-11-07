-- Baixa manual (nov/2026, pedido do usuário): marcar uma conta a receber/pagar como recebida/paga sem a conciliação
-- bancária, se Parâmetros > Financeiro permitir. Desligado por padrão (o caminho normal continua sendo Bancos).
alter table public.empresa_financeiro
  add column if not exists baixa_manual_receber boolean not null default false,
  add column if not exists baixa_manual_pagar boolean not null default false;

create or replace function public.fin_baixar(p_empresa uuid, p_tipo text, p_id uuid, p_data date, p_valor numeric, p_juros numeric,
  p_multa numeric, p_desconto numeric, p_tarifa numeric, p_conta uuid, p_forma text, p_obs text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_pode boolean;
begin
  if p_tipo not in ('receber', 'pagar') then raise exception 'Tipo inválido'; end if;
  if not eh_membro_empresa(p_empresa) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select case when p_tipo = 'receber' then baixa_manual_receber else baixa_manual_pagar end into v_pode
    from empresa_financeiro where empresa_id = p_empresa;
  if not coalesce(v_pode, false) then
    raise exception 'Recebimentos e pagamentos são reconhecidos em Financeiro > Bancos: pela conciliação do extrato ou, se foi em dinheiro, lançando no caixa. A baixa manual pode ser liberada em Parâmetros > Financeiro.';
  end if;
  if not fin_pode(p_empresa, case when p_tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then
    raise exception 'Sem permissão para registrar % manualmente', case when p_tipo = 'receber' then 'recebimentos' else 'pagamentos' end using errcode = '42501';
  end if;
  if p_data is not null and p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data não pode ser no futuro'; end if;
  return fin_baixar_(p_empresa, p_tipo, p_id, p_data, p_valor, p_juros, p_multa, p_desconto, p_tarifa, p_conta, p_forma, p_obs, 'manual', null);
end $$;
revoke all on function public.fin_baixar(uuid,text,uuid,date,numeric,numeric,numeric,numeric,numeric,uuid,text,text) from public, anon;
grant execute on function public.fin_baixar(uuid,text,uuid,date,numeric,numeric,numeric,numeric,numeric,uuid,text,text) to authenticated;
