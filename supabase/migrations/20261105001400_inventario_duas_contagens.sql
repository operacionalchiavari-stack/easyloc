alter table public.acervo_inventario_itens
 add column primeira_contagens jsonb not null default '{}',add column segunda_contagens jsonb not null default '{}',
 add column primeira_contado_por uuid,add column primeira_contado_em timestamptz,
 add column segunda_contado_por uuid,add column segunda_contado_em timestamptz;
-- Preserva contagens já registradas como primeira rodada.
update public.acervo_inventario_itens set primeira_contagens=contagens,primeira_contado_por=contado_por,primeira_contado_em=contado_em
 where contagens<>'{}'::jsonb;

alter function public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb) rename to acervo_inventario_registrar_resultado;
revoke all on function public.acervo_inventario_registrar_resultado(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
create function public.acervo_inventario_contar_cegas(p_empresa uuid,p_id uuid,p_item uuid,p_versao integer,p_quantidades jsonb,p_rodada integer default 1) returns void
language plpgsql security definer set search_path=public as $$
declare inv acervo_inventarios;linha acervo_inventario_itens;coluna jsonb;valor numeric;primeira_completa boolean;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para contar';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into inv from acervo_inventarios where id=p_id and empresa_id=p_empresa for update;
 if not found or inv.status<>'contagem' then raise exception 'Inventário indisponível para contagem';end if;
 select * into linha from acervo_inventario_itens where inventario_id=p_id and empresa_id=p_empresa and item_id=p_item for update;
 if not found then raise exception 'Item fora do inventário';end if;
 if linha.versao is distinct from p_versao then raise exception 'Outro usuário atualizou esta contagem. Atualize a tela';end if;
 if inv.colunas_contagem='[]'::jsonb or jsonb_typeof(p_quantidades) is distinct from 'object' then raise exception 'Preencha as quantidades';end if;
 if (select count(*) from jsonb_object_keys(p_quantidades))<>(select count(*) from jsonb_array_elements(inv.colunas_contagem) c where (c->>'ativa')::boolean) then raise exception 'Preencha todas as colunas da contagem';end if;
 for coluna in select * from jsonb_array_elements(inv.colunas_contagem) c where (c->>'ativa')::boolean loop
  if jsonb_typeof(p_quantidades->(coluna->>'chave')) is distinct from 'number' then raise exception 'Informe a quantidade: %',coluna->>'nome';end if;
  valor:=(p_quantidades->>(coluna->>'chave'))::numeric;
  if valor<0 or valor<>trunc(valor) or valor::text in('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida: %',coluna->>'nome';end if;
 end loop;
 if coalesce((p_quantidades->>'revisao')::numeric,0)>(p_quantidades->>'qtd')::numeric or coalesce((p_quantidades->>'fazer_capa')::numeric,0)>(p_quantidades->>'qtd')::numeric then raise exception 'As quantidades de revisão e de fazer capa não podem superar a quantidade contada';end if;
 select not exists(select 1 from acervo_inventario_itens i cross join jsonb_array_elements(inv.colunas_contagem) c
  where i.inventario_id=p_id and (c->>'ativa')::boolean and jsonb_typeof(i.primeira_contagens->(c->>'chave')) is distinct from 'number') into primeira_completa;
 if p_rodada=1 then
  if primeira_completa then raise exception 'A primeira contagem já foi concluída. Atualize para iniciar a segunda contagem';end if;
  update acervo_inventario_itens set primeira_contagens=p_quantidades,primeira_contado_por=auth.uid(),primeira_contado_em=now(),versao=versao+1 where inventario_id=p_id and item_id=p_item;
 elsif p_rodada=2 then
  if not primeira_completa then raise exception 'Conclua a primeira contagem de todos os itens antes da segunda';end if;
  if linha.segunda_contagens<>'{}'::jsonb then raise exception 'A segunda contagem deste item já foi registrada';end if;
  perform acervo_inventario_registrar_resultado(p_empresa,p_id,p_item,p_versao,p_quantidades);
  update acervo_inventario_itens set segunda_contagens=p_quantidades,segunda_contado_por=auth.uid(),segunda_contado_em=now() where inventario_id=p_id and item_id=p_item;
 else raise exception 'Rodada de contagem inválida';end if;
end $$;
revoke all on function public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb,integer) from public,anon;
grant execute on function public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb,integer) to authenticated;

create function public.acervo_inventario_exigir_segunda_contagem() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='aprovado' and old.status is distinct from new.status and new.colunas_contagem<>'[]'::jsonb and exists(
  select 1 from acervo_inventario_itens i cross join jsonb_array_elements(new.colunas_contagem) c
  where i.inventario_id=new.id and (c->>'ativa')::boolean and jsonb_typeof(i.segunda_contagens->(c->>'chave')) is distinct from 'number'
 ) then raise exception 'Conclua a segunda contagem de todos os itens antes de finalizar';end if;
 return new;
end $$;
create trigger acervo_inventario_exigir_segunda_contagem before update of status on public.acervo_inventarios for each row execute function public.acervo_inventario_exigir_segunda_contagem();
notify pgrst,'reload schema';
