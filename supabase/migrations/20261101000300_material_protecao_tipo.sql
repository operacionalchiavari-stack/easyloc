-- Preserva os IDs, contagens e movimentos existentes ao ampliar capas para caixas.
alter table public.capas_modelos add column tipo_material text not null default 'capa'
 check (tipo_material in ('capa','caixa'));

create function public.material_protecao_nome() returns trigger
language plpgsql set search_path=public as $$
begin
 select (case when new.tipo_material='caixa' then 'Caixa ' else 'Capa ' end)
  ||coalesce(nullif(trim(i.descricao_total),''),i.produto,'Item') into new.nome
 from public.itens i where i.id=new.item_id and i.empresa_id=new.empresa_id;
 return new;
end $$;
create trigger material_protecao_nome before insert or update on public.capas_modelos
 for each row execute function public.material_protecao_nome();
update public.capas_modelos set nome=nome;

create function public.material_protecao_configurar(p_empresa uuid,p_item uuid,p_tipo text,p_capacidade integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare resultado jsonb;
begin
 if p_tipo is null or p_tipo not in ('nenhum','capa','caixa') then raise exception 'Selecione Capa, Caixa ou Não utiliza'; end if;
 -- Reutiliza as validações de empresa, permissão, kits e capacidade.
 resultado:=public.capas_configurar(p_empresa,p_item,p_tipo<>'nenhum',p_capacidade,null);
 update public.capas_modelos set tipo_material=case when p_tipo='nenhum' then tipo_material else p_tipo end
 where empresa_id=p_empresa and item_id=p_item returning to_jsonb(capas_modelos) into resultado;
 update public.capas_historico set detalhes=detalhes||jsonb_build_object('tipo_material',resultado->>'tipo_material','nome',resultado->>'nome')
 where id=(select id from public.capas_historico where modelo_id=(resultado->>'id')::uuid and acao='configuracao' order by criado_em desc,id desc limit 1);
 return resultado;
end $$;
revoke all on function public.material_protecao_configurar(uuid,uuid,text,integer) from public,anon;
grant execute on function public.material_protecao_configurar(uuid,uuid,text,integer) to authenticated;

-- Mantém o nome fixo também quando o nome do item muda.
create function public.material_protecao_item_nome() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 update public.capas_modelos set nome=nome where item_id=new.id and empresa_id=new.empresa_id;
 return new;
end $$;
create trigger material_protecao_item_nome after update of descricao_total,produto on public.itens
 for each row execute function public.material_protecao_item_nome();

create or replace function public.capas_estoque(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not capas_pode(p_empresa) then raise exception 'Sem acesso ao material de proteção';end if;
 return (select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object(
  'item_nome',coalesce(i.descricao_total,i.produto),
  'foto_url',coalesce(nullif(i.foto_url,''),(select nullif(f.url,'') from public.itens_fotos f
   where f.item_id=i.id and f.cliente_id is null and nullif(f.url,'') is not null
   order by f.ordem nulls last,f.slot limit 1)),
  'saldo',capas_saldo(m.id)) order by m.nome),'[]')
 from capas_modelos m join itens i on i.id=m.item_id and i.empresa_id=m.empresa_id where m.empresa_id=p_empresa);
end $$;

notify pgrst,'reload schema';
