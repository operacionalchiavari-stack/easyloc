alter table public.producao_pacotes add column if not exists modo_separacao text
 check (modo_separacao in ('manual','qr'));
-- Kits antigos conservam modo nulo: não havia registro do método na criação.
create or replace function public.producao_separar_modo(p_empresa uuid,p_etapa uuid,p_materiais jsonb,p_modo text) returns uuid
language plpgsql security definer set search_path=public as $$
declare pacote uuid;
begin
 if p_modo is null or p_modo not in ('manual','qr') then raise exception 'Modo de separação inválido';end if;
 pacote:=public.producao_separar(p_empresa,p_etapa,p_materiais);
 update producao_pacotes set modo_separacao=p_modo where id=pacote and empresa_id=p_empresa;
 insert into producao_historico(empresa_id,etapa_id,pedido_id,acao,usuario_id,detalhes)
 select p_empresa,p_etapa,i.pedido_id,'modo_separacao',auth.uid(),jsonb_build_object('pacote',pacote,'modo',p_modo)
 from producao_etapas e join producao_itens i on i.id=e.producao_item_id where e.id=p_etapa and e.empresa_id=p_empresa;
 return pacote;
end $$;
create or replace function public.producao_receber_manual(p_empresa uuid,p_etapa uuid,p_pacote uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare pa producao_pacotes;r jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not producao_permite(p_empresa,'executar') then raise exception 'Sem permissão para receber materiais' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('prod_stock:'||p_empresa,0));
 select * into pa from producao_pacotes where id=p_pacote and empresa_id=p_empresa and etapa_id=p_etapa for update;
 if not found then raise exception 'Kit não pertence a esta etapa';end if;
 if pa.modo_separacao='qr' then raise exception 'Kit separado por QR Code: confirme pela leitura da etiqueta';end if;
 -- Reutiliza conferências, baixa atômica, permissões e idempotência do recebimento existente.
 r:=public.producao_receber(p_empresa,pa.qr,p_etapa);
 if not coalesce((r->>'repetido')::boolean,false) then
  insert into producao_historico(empresa_id,etapa_id,pedido_id,acao,usuario_id,detalhes)
  select p_empresa,p_etapa,i.pedido_id,'receber_manual',auth.uid(),jsonb_build_object('pacote',pa.id,'modo_separacao',coalesce(pa.modo_separacao,'legado_sem_modo'))
  from producao_etapas e join producao_itens i on i.id=e.producao_item_id where e.id=p_etapa and e.empresa_id=p_empresa;
 end if;
 return r;
end $$;
revoke all on function public.producao_separar_modo(uuid,uuid,jsonb,text),public.producao_receber_manual(uuid,uuid,uuid) from public,anon;
grant execute on function public.producao_separar_modo(uuid,uuid,jsonb,text),public.producao_receber_manual(uuid,uuid,uuid) to authenticated;
