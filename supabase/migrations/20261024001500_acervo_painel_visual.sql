alter table public.acervo_retornos add column os_id text,add column os_numero text;
create index acervo_retornos_os on public.acervo_retornos(empresa_id,os_id) where os_id is not null;

create function public.acervo_ordens(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissao para consultar o acervo';end if;
 if not gs_eh_da_equipe() then return '[]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v->>0,'numero',v->>4,'item',v->>5,'quantidade',v->>6,'codigo',v->>17,
 'setor',coalesce(nullif(v->>10,''),nullif(v->>9,''),nullif(v->>8,''),nullif(v->>7,''),'Sem setor'),
 'concluida',translate(lower(coalesce(v->>11,'')),'í','i') like '%concluido%',
 'prazo',coalesce(v->16->>'$d',nullif(v->>16,'')),'motivo',v->>14)),'[]') into r
 from (select valores v from gs_linhas where planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE' and aba='Itens Danificados' and linha>1 and coalesce(valores->>0,'')<>'') x;
 return r;
end $$;

create function public.acervo_os_vincular(p_empresa uuid,p_id uuid,p_versao integer,p_os text) returns void language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;o jsonb;codigo_item text;alocado numeric;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissao para encaminhar o acervo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where empresa_id=p_empresa and id=p_id for update;
 if r.versao<>p_versao then raise exception 'O card mudou. Abra novamente';end if;
 if r.estado not in ('triagem','limpeza','reparo') or r.tipo='falta' then raise exception 'Confira o recebimento da peca antes de encaminhar';end if;
 select x into o from jsonb_array_elements(acervo_ordens(p_empresa)) x where x->>'id'=p_os;
 select to_jsonb(i)->>'codigo' into codigo_item from itens i where id=r.item_id and empresa_id=p_empresa;
 if o is null or (o->>'concluida')::boolean or nullif(btrim(codigo_item),'') is null or btrim(o->>'codigo') is distinct from btrim(codigo_item) then raise exception 'Escolha uma O.S aberta para este mesmo item';end if;
 select coalesce(sum(quantidade),0) into alocado from acervo_retornos where empresa_id=p_empresa and os_id=p_os and id<>p_id;
 if alocado+r.quantidade>(o->>'quantidade')::numeric then raise exception 'A quantidade da O.S ja esta alocada. Confira as pecas antes de vincular';end if;
 update acervo_retornos set os_id=p_os,os_numero=o->>'numero',estado=case when estado='triagem' then 'reparo' else estado end,versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=p_id;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select p_empresa,p_id,estado,'Encaminhado para O.S #'||(o->>'numero'),auth.uid() from acervo_retornos where id=p_id;
end $$;

create function public.acervo_eventos(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare resultado jsonb;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissao para consultar eventos do acervo';end if;
 with ordens as (
 select o->>'codigo' codigo,sum(case when o->>'quantidade' ~ '^[0-9]+([.][0-9]+)?$' then (o->>'quantidade')::numeric else 0 end) quantidade
 from jsonb_array_elements(acervo_ordens(p_empresa)) o where not (o->>'concluida')::boolean group by o->>'codigo'
 ), pedidos as (
 select p.id,p.numero_pedido,p.cliente_nome,p.local_nome,coalesce(p.data_entrega,p.data_evento) inicio,coalesce(p.data_coleta,p.data_evento_fim,p.data_evento) fim
 from separacoes_pedidos p where p.empresa_id=p_empresa and p.status_comercial in ('aprovado','enviado','finalizado') and p.status<>'cancelado' and p.encerrado_operacional_em is null
 and coalesce(p.data_entrega,p.data_evento)<=current_date+90 and coalesce(p.data_coleta,p.data_evento_fim,p.data_evento)>=current_date
 ), demandas as (
 select p.id pedido_id,s.item_id,sum(s.quantidade_solicitada)::numeric quantidade from pedidos p join separacoes_itens s on s.separacao_pedido_id=p.id join itens i on i.id=s.item_id
 where coalesce(lower(to_jsonb(i)->>'tipo'),'')<>'kit' group by p.id,s.item_id
 union all select p.id,k.item_id,sum(s.quantidade_solicitada*k.quantidade)::numeric from pedidos p join separacoes_itens s on s.separacao_pedido_id=p.id join itens i on i.id=s.item_id and lower(to_jsonb(i)->>'tipo')='kit' join kit_itens k on k.kit_id=i.id group by p.id,k.item_id
 ), totais as(select pedido_id,item_id,sum(quantidade) quantidade from demandas group by pedido_id,item_id),
 pecas as(select i.id,i.produto,i.foto_url,coalesce(i.estoque_total,0) total,coalesce((to_jsonb(i)->>'estoque_manutencao')::numeric,0) manutencao,
 greatest(coalesce((select quantidade from operacao_indisponiveis(p_empresa,current_date) q where q.item_id=i.id),0),coalesce((select quantidade from ordens o where o.codigo=to_jsonb(i)->>'codigo'),0)-coalesce((to_jsonb(i)->>'estoque_manutencao')::numeric,0)) bloqueado
 from itens i where i.empresa_id=p_empresa and (coalesce((to_jsonb(i)->>'estoque_manutencao')::numeric,0)>0 or exists(select 1 from ordens o where o.codigo=to_jsonb(i)->>'codigo') or exists(select 1 from acervo_retornos a where a.item_id=i.id and a.empresa_id=p_empresa and a.estado not in ('liberado','baixado')))),
 uso as(select p.*,d.item_id,d.quantidade,i.produto,i.foto_url,i.manutencao+i.bloqueado indisponivel,greatest(0,i.total-i.manutencao-i.bloqueado) disponivel,
 greatest(0,coalesce((select max(qtd) from (select sum(t.quantidade) qtd from generate_series(p.inicio::timestamp,p.fim::timestamp,interval '1 day') dia join pedidos p2 on dia::date between p2.inicio and p2.fim join totais t on t.pedido_id=p2.id and t.item_id=d.item_id group by dia) sobreposicoes),d.quantidade)+i.manutencao+i.bloqueado-i.total) faltante
 from pedidos p join totais d on d.pedido_id=p.id join pecas i on i.id=d.item_id)
 select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio,x.numero_pedido),'[]') into resultado from(
 select id,numero_pedido,cliente_nome,local_nome,inicio,max(faltante)>0 risco,
 jsonb_agg(jsonb_build_object('item_id',item_id,'nome',produto,'foto_url',foto_url,'quantidade',quantidade,'indisponivel',indisponivel,'disponivel',disponivel,'faltante',faltante)) itens
 from uso where inicio>=current_date group by id,numero_pedido,cliente_nome,local_nome,inicio)x;
 return resultado;
end $$;

alter function public.acervo_painel(uuid) rename to acervo_painel_antes_visual;
revoke all on function public.acervo_painel_antes_visual(uuid) from public,anon,authenticated;
create function public.acervo_painel(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b jsonb;r jsonb;begin
 b:=acervo_painel_antes_visual(p_empresa);
 select coalesce(jsonb_agg(x||jsonb_build_object('codigo',to_jsonb(i)->>'codigo')),'[]') into r from jsonb_array_elements(b->'retornos') x join itens i on i.id::text=x->>'item_id' and i.empresa_id=p_empresa;
 return b||jsonb_build_object('retornos',r,'ordens',acervo_ordens(p_empresa),'eventos',acervo_eventos(p_empresa));
end $$;
revoke all on function public.acervo_painel(uuid),public.acervo_ordens(uuid),public.acervo_eventos(uuid),public.acervo_os_vincular(uuid,uuid,integer,text) from public,anon;
grant execute on function public.acervo_painel(uuid),public.acervo_ordens(uuid),public.acervo_eventos(uuid),public.acervo_os_vincular(uuid,uuid,integer,text) to authenticated;
alter function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) rename to acervo_movimentar_antes_os;
revoke all on function public.acervo_movimentar_antes_os(uuid,uuid,integer,text,text,numeric) from public,anon,authenticated;
create function public.acervo_movimentar(p_empresa uuid,p_id uuid,p_versao integer,p_destino text,p_motivo text,p_custo numeric default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissao para movimentar o acervo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where empresa_id=p_empresa and id=p_id;
 if r.os_id is not null and p_destino in ('inspecao','liberado','baixado') and not exists(select 1 from jsonb_array_elements(acervo_ordens(p_empresa)) o where o->>'id'=r.os_id and (o->>'concluida')::boolean) then raise exception 'Conclua a O.S vinculada antes de inspecionar ou liberar o item';end if;
 return acervo_movimentar_antes_os(p_empresa,p_id,p_versao,p_destino,p_motivo,p_custo);
end $$;
revoke all on function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) from public,anon;
grant execute on function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) to authenticated;
notify pgrst,'reload schema';
