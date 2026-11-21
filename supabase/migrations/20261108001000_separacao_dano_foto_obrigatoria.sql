begin;
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
 if danificado or (p_resumo->>'danificado')::boolean then
  if jsonb_array_length(p_fotos)=0 then raise exception 'A foto do dano e obrigatoria para enviar ao Acervo';end if;
  if p_resumo->'fotos_dano_claras' is distinct from 'true'::jsonb or jsonb_typeof(p_resumo->'analise_fotos') is distinct from 'string' or length(btrim(p_resumo->>'analise_fotos'))<10 then raise exception 'Esclareca o dano com a assistente a partir das fotos antes de enviar';end if;
 end if;
 obs:=left('Problema: '||(p_resumo->>'problema')||E'\nIdentificado: '||(p_resumo->>'quando_identificado')||E'\nPor que identificado agora: '||(p_resumo->>'porque_agora')||E'\nVerificacoes realizadas: '||(p_resumo->>'verificacoes')||E'\nSolucao sugerida pela equipe: '||(p_resumo->>'solucao_sugerida')||E'\nPendencias: '||(p_resumo->>'pendencias')||case when jsonb_array_length(p_fotos)=0 then E'\nFoto pendente: '||coalesce(p_resumo->>'sem_foto_motivo','Nao anexada') else '' end,3000);
 novo:=separacao_ocorrencia_criar(p_empresa,p_pedido,p_linha,p_item,motivo,quantidade,obs,p_fotos->>0);
 update separacao_ocorrencias set analise_ia=p_resumo,conversa_ia=p_mensagens,fotos_paths=p_fotos,chat_chave=p_chave where id=novo;
 return novo;
end $$;
notify pgrst,'reload schema';
commit;
