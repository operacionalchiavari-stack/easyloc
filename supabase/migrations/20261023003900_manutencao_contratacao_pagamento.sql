begin;
alter table manutencao_predial_solicitacoes
 add column execucao_tipo text check(execucao_tipo in ('interna','externa')),
 add column fornecedor_id uuid references fornecedores(id),
 add column valor numeric(15,2) not null default 0 check(valor>=0),
 add column forma_pagamento text,
 add column condicao_pagamento text,
 add column parcelas jsonb not null default '[]',
 add column confirmado_em timestamptz,
 add column confirmado_por uuid;
alter table fin_pagar add column manutencao_confirmada boolean;

-- A função original continua responsável por autorização, escopo da empresa e concorrência.
alter function public.manutencao_predial_operar(uuid,text,jsonb) rename to manutencao_predial_operar_base;
revoke all on function public.manutencao_predial_operar_base(uuid,text,jsonb) from public,anon,authenticated;
create function public.manutencao_predial_operar(p_empresa uuid,p_acao text,p_dados jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r manutencao_predial_solicitacoes;antes manutencao_predial_solicitacoes;resultado jsonb;tipo text;f uuid;nome text;total numeric;soma numeric;ps jsonb;forma text;condicao text;it jsonb;k int:=0;grupo_id uuid:=gen_random_uuid();mudou boolean;
begin
 if p_acao not in ('atualizar','confirmar') then return manutencao_predial_operar_base(p_empresa,p_acao,p_dados);end if;
 -- Consultar também verifica membro, permissões e isolamento antes de qualquer alteração.
 resultado:=manutencao_predial_operar_base(p_empresa,'consultar',p_dados);
 if not coalesce((resultado->>'gerenciar')::boolean,false) then raise exception 'Sem permissão para gerenciar manutenção';end if;
 select * into r from manutencao_predial_solicitacoes where id=(p_dados->>'id')::uuid and empresa_id=p_empresa for update;
 if nullif(p_dados->>'updated_at','')::timestamptz is distinct from r.updated_at then raise exception 'Esta solicitação foi alterada. Atualize a tela e tente novamente';end if;
 antes:=r;
 if p_acao='confirmar' then
  if not funcionario_tabela_permitida(p_empresa,'almoxarifado_compras','update') then raise exception 'Confirme o serviço em Compras → Serviços';end if;
  if r.status='cancelada' then raise exception 'Solicitação cancelada';end if;
  if r.execucao_tipo is null then raise exception 'Defina quem executará o serviço antes de confirmar';end if;
  if r.confirmado_em is not null then return to_jsonb(r);end if;
  update manutencao_predial_solicitacoes set confirmado_em=clock_timestamp(),confirmado_por=auth.uid(),status='concluida',updated_at=clock_timestamp() where id=r.id returning * into r;
  update fin_pagar set manutencao_confirmada=true,observacoes='Serviço confirmado em Compras. Pagamento liberado após confirmação.' where empresa_id=p_empresa and origem='manutencao_predial' and origem_id=r.id and status<>'cancelado';
  insert into manutencao_predial_historico(solicitacao_id,empresa_id,usuario_id,usuario_nome,acao) values(r.id,p_empresa,auth.uid(),almox_nome_usuario(p_empresa),'Serviço confirmado · pagamento liberado');
  return to_jsonb(r);
 end if;
 if p_dados->>'status'='concluida' and r.confirmado_em is null then raise exception 'Use Confirmar serviço em Compras → Serviços para concluir e liberar o pagamento';end if;
 if r.confirmado_em is not null then raise exception 'Serviço já confirmado. O atendimento não pode mais ser alterado';end if;
 tipo:=coalesce(nullif(p_dados->>'execucao_tipo',''),r.execucao_tipo);
 if tipo is not null then
  if tipo not in ('interna','externa') then raise exception 'Escolha equipe interna ou fornecedor';end if;
  if tipo='interna' then
   if nullif(trim(coalesce(p_dados->>'responsavel',r.responsavel)),'') is null then raise exception 'Informe quem da equipe interna fará o serviço';end if;
   f:=null;total:=0;ps:='[]';forma:=null;condicao:=null;
  else
   f:=case when p_dados ? 'fornecedor_id' then nullif(p_dados->>'fornecedor_id','')::uuid else r.fornecedor_id end;
   select coalesce(nullif(nome_fantasia,''),nome_razao_social) into nome from fornecedores where id=f and empresa_id=p_empresa;
   if not found then raise exception 'Selecione um fornecedor cadastrado nesta empresa';end if;
   total:=round(coalesce((p_dados->>'valor')::numeric,r.valor),2);ps:=coalesce(p_dados->'parcelas',r.parcelas);forma:=coalesce(p_dados->>'forma_pagamento',r.forma_pagamento);condicao:=coalesce(p_dados->>'condicao_pagamento',r.condicao_pagamento);
   if total is null or total<=0 then raise exception 'Informe o valor do serviço';end if;
   if forma is null or forma not in ('boleto','pix','transferencia','cartao','dinheiro') then raise exception 'Escolha a forma de pagamento';end if;
   if nullif(trim(condicao),'') is null or length(condicao)>500 then raise exception 'Informe a condição de pagamento';end if;
   if jsonb_typeof(ps)<>'array' or jsonb_array_length(ps) not between 1 and 48 then raise exception 'Informe de 1 a 48 parcelas';end if;
   select coalesce(sum(round((x->>'valor')::numeric,2)),0) into soma from jsonb_array_elements(ps) x;
   if abs(soma-total)>.005 or exists(select 1 from jsonb_array_elements(ps) x where nullif(x->>'vencimento','') is null or coalesce((x->>'valor')::numeric,0)<=0) then raise exception 'Confira os vencimentos e a soma das parcelas';end if;
  end if;
  mudou:=r.execucao_tipo is distinct from tipo or r.fornecedor_id is distinct from f or r.valor is distinct from total or r.parcelas is distinct from ps or r.forma_pagamento is distinct from forma or r.condicao_pagamento is distinct from condicao or (r.status='cancelada' and coalesce(p_dados->>'status',r.status)<>'cancelada');
  if mudou and exists(select 1 from fin_pagar where empresa_id=p_empresa and origem='manutencao_predial' and origem_id=r.id and pago>0 and status<>'cancelado') then raise exception 'Serviço já tem pagamento registrado; ajuste no Financeiro';end if;
 end if;
 resultado:=manutencao_predial_operar_base(p_empresa,'atualizar',p_dados);
 if tipo is not null then
  update manutencao_predial_solicitacoes set execucao_tipo=tipo,fornecedor_id=f,valor=total,parcelas=ps,forma_pagamento=forma,condicao_pagamento=condicao where id=r.id returning * into r;
 end if;
 if mudou or p_dados->>'status'='cancelada' then
  update fin_pagar set status='cancelado',cancelado_em=now(),cancelado_por=auth.uid(),cancelamento_motivo='Atendimento de manutenção alterado ou cancelado' where empresa_id=p_empresa and origem='manutencao_predial' and origem_id=r.id and status<>'cancelado';
  if tipo='externa' and r.status<>'cancelada' then
   for it in select x from jsonb_array_elements(ps) x loop
    k:=k+1;
    insert into fin_pagar(empresa_id,origem,origem_id,grupo,fornecedor_id,fornecedor_nome,documento,descricao,emissao,competencia,vencimento,valor,parcela,parcelas,forma,observacoes,criado_por,manutencao_confirmada)
    values(p_empresa,'manutencao_predial',r.id,grupo_id,f,nome,'MAN-'||r.numero,'Manutenção #'||r.numero||' · '||r.titulo,current_date,current_date,(it->>'vencimento')::date,round((it->>'valor')::numeric,2),k,jsonb_array_length(ps),forma,
     'PAGAR SOMENTE APÓS CONFIRMAÇÃO DO SERVIÇO em Compras → Serviços. Condição: '||condicao,auth.uid(),false);
   end loop;
  end if;
 end if;
 return (select to_jsonb(s) from manutencao_predial_solicitacoes s where id=antes.id);
end $$;
revoke all on function manutencao_predial_operar(uuid,text,jsonb) from public,anon;
grant execute on function manutencao_predial_operar(uuid,text,jsonb) to authenticated;

-- Bloqueio no banco, inclusive para conciliação ou outros caminhos de baixa.
create function public.manutencao_predial_proteger_pagamento() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare confirmado timestamptz;estado text;
begin
 if new.origem='manutencao_predial' then
  select confirmado_em,status into confirmado,estado from manutencao_predial_solicitacoes where id=new.origem_id and empresa_id=new.empresa_id for update;
  if not found then raise exception 'Solicitação de manutenção não encontrada';end if;
  new.manutencao_confirmada:=confirmado is not null and estado='concluida';
  if new.pago>coalesce(case when tg_op='UPDATE' then old.pago else 0 end,0) and not new.manutencao_confirmada then raise exception 'Pagamento bloqueado: confirme o serviço em Compras → Serviços';end if;
 end if;
 return new;
end $$;
create trigger manutencao_predial_proteger_pagamento before insert or update on fin_pagar for each row execute function manutencao_predial_proteger_pagamento();
create function public.manutencao_predial_proteger_baixa() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from fin_pagar p join manutencao_predial_solicitacoes s on s.id=p.origem_id and s.empresa_id=p.empresa_id where p.id=new.pagar_id and p.origem='manutencao_predial' and (s.confirmado_em is null or s.status<>'concluida')) then raise exception 'Pagamento bloqueado: confirme o serviço em Compras → Serviços';end if;
 return new;
end $$;
create trigger manutencao_predial_proteger_baixa before insert on fin_baixas for each row execute function manutencao_predial_proteger_baixa();
notify pgrst,'reload schema';
commit;
