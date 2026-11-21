begin;
alter table public.separacao_ocorrencias add column analise_ia jsonb,add column conversa_ia jsonb not null default '[]',add column fotos_paths jsonb not null default '[]',add column chat_chave uuid;
create unique index separacao_ocorrencias_chat_chave on public.separacao_ocorrencias(empresa_id,chat_chave) where chat_chave is not null;
create or replace function public.separacao_assistente_contexto(p_empresa uuid,p_pedido uuid,p_linha uuid,p_item uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p separacoes_pedidos;l separacoes_itens;q numeric;nome text;motivos jsonb;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') then raise exception 'Sem permissao para reportar problema';end if;
 select * into strict p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;
 select * into strict l from separacoes_itens where id=p_linha and empresa_id=p_empresa and separacao_pedido_id=p.id;
 if l.item_id=p_item then q:=l.quantidade_solicitada;else select l.quantidade_solicitada*k.quantidade into q from kit_itens k where k.kit_id=l.item_id and k.item_id=p_item;end if;
 select coalesce(descricao_total,produto) into nome from itens where id=p_item and empresa_id=p_empresa;
 if q is null or nome is null then raise exception 'Item nao pertence ao pedido';end if;
 if separacao_meus_setores(p_empresa) is not null and not(separacao_meus_setores(p_empresa)?separacao_setor_item(p_item)) then raise exception 'Item de outro setor';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',m.nome) order by m.nome),'[]') into motivos from logistica_motivos m where empresa_id=p_empresa and etapa='separacao' and ativo;
 return jsonb_build_object('pedido',p.numero_pedido,'cliente',p.cliente_nome,'item',nome,'quantidade_pedido',q,'motivos',motivos);
end $$;
create or replace function public.separacao_ocorrencia_chat_criar(p_empresa uuid,p_pedido uuid,p_linha uuid,p_item uuid,p_chave uuid,p_resumo jsonb,p_mensagens jsonb,p_fotos jsonb default '[]') returns uuid
language plpgsql security definer set search_path=public as $$
declare contexto jsonb;novo uuid;f text;obs text;campo text;motivo uuid;quantidade numeric;danificado boolean;
begin
 contexto:=separacao_assistente_contexto(p_empresa,p_pedido,p_linha,p_item);
 perform 1 from separacoes_pedidos where id=p_pedido for update;
 if p_chave is null then raise exception 'Identificacao da conversa ausente';end if;
 select id into novo from separacao_ocorrencias where empresa_id=p_empresa and chat_chave=p_chave and criado_por=auth.uid() and pedido_id=p_pedido and linha_id=p_linha and item_id=p_item;
 if novo is not null then return novo;end if;
 if jsonb_typeof(p_resumo) is distinct from 'object' or jsonb_typeof(p_resumo->'quantidade') is distinct from 'number' or jsonb_typeof(p_resumo->'danificado') is distinct from 'boolean' then raise exception 'Resumo invalido';end if;
 if jsonb_typeof(p_mensagens) is distinct from 'array' or jsonb_array_length(p_mensagens)>60 or not exists(select 1 from jsonb_array_elements(p_mensagens) m where m->>'papel'='pessoa' and length(btrim(coalesce(m->>'texto','')))>0) or exists(select 1 from jsonb_array_elements(p_mensagens) m where jsonb_typeof(m) is distinct from 'object' or coalesce(m->>'papel','') not in ('ia','pessoa') or length(coalesce(m->>'texto',''))>4000) then raise exception 'Conversa invalida';end if;
 foreach campo in array array['problema','quando_identificado','porque_agora','verificacoes','solucao_sugerida','pendencias'] loop
  if jsonb_typeof(p_resumo->campo) is distinct from 'string' or length(btrim(p_resumo->>campo))<2 or length(p_resumo->>campo)>1000 then raise exception 'Complete o resumo: %',campo;end if;
 end loop;
 select id,(m.nome ~* 'danific|avaria|quebrad') into motivo,danificado from logistica_motivos m where m.empresa_id=p_empresa and m.id::text=p_resumo->>'motivo_id' and m.etapa='separacao' and m.ativo;
 if motivo is null then raise exception 'Selecione um tipo de problema ativo';end if;
 quantidade:=(p_resumo->>'quantidade')::numeric;
 if quantidade::text in ('NaN','Infinity','-Infinity') or quantidade<=0 or quantidade<>(trunc(quantidade)) or quantidade>(contexto->>'quantidade_pedido')::numeric then raise exception 'Quantidade afetada invalida';end if;
 if jsonb_typeof(p_fotos) is distinct from 'array' or jsonb_array_length(p_fotos)>12 then raise exception 'Fotos invalidas';end if;
 for f in select jsonb_array_elements_text(p_fotos) loop
  if f not like p_empresa::text||'/%' or f like '%..%' or not exists(select 1 from storage.objects where bucket_id='separacao-ocorrencias' and name=f) then raise exception 'Foto invalida ou ausente';end if;
 end loop;
 if (danificado or (p_resumo->>'danificado')::boolean) and jsonb_array_length(p_fotos)=0 and length(btrim(coalesce(p_resumo->>'sem_foto_motivo','')))<5 then raise exception 'Anexe a foto do dano ou registre por que nao foi possivel fotografar';end if;
 obs:=left('Problema: '||(p_resumo->>'problema')||E'\nIdentificado: '||(p_resumo->>'quando_identificado')||E'\nPor que identificado agora: '||(p_resumo->>'porque_agora')||E'\nVerificacoes realizadas: '||(p_resumo->>'verificacoes')||E'\nSolucao sugerida pela equipe: '||(p_resumo->>'solucao_sugerida')||E'\nPendencias: '||(p_resumo->>'pendencias')||case when jsonb_array_length(p_fotos)=0 then E'\nFoto pendente: '||coalesce(p_resumo->>'sem_foto_motivo','Nao anexada') else '' end,3000);
 novo:=separacao_ocorrencia_criar(p_empresa,p_pedido,p_linha,p_item,motivo,quantidade,obs,p_fotos->>0);
 update separacao_ocorrencias set analise_ia=p_resumo,conversa_ia=p_mensagens,fotos_paths=p_fotos,chat_chave=p_chave where id=novo;
 return novo;
end $$;
create policy separacao_chat_foto_rascunho on storage.objects for select to authenticated using(bucket_id='separacao-ocorrencias' and (storage.foldername(name))[2]=auth.uid()::text and seguranca_2fa_ok() and eh_membro_empresa(((storage.foldername(name))[1])::uuid));
create policy separacao_chat_fotos_ler on storage.objects for select to authenticated using(bucket_id='separacao-ocorrencias' and exists(select 1 from separacao_ocorrencias o where o.fotos_paths ? name));
revoke all on function public.separacao_assistente_contexto(uuid,uuid,uuid,uuid),public.separacao_ocorrencia_chat_criar(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.separacao_assistente_contexto(uuid,uuid,uuid,uuid),public.separacao_ocorrencia_chat_criar(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
