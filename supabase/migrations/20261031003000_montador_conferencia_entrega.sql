-- Conferência visual da entrega no App do Montador, vinculada à etapa e ao apontamento.
alter table public.operacao_registros drop constraint if exists operacao_registros_tipo_check;
alter table public.operacao_registros add constraint operacao_registros_tipo_check
 check (tipo in ('equipe','sacolas','posicionamento','observacoes','lista_assinada','lista_conferida',
 'desmontagem_concluida','uniformizacao','contagem_itens','conferencia_entrega'));

create or replace function public.mont_entrega_itens(p_token text,p_etapa uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; r operacao_registros; base jsonb;
begin
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null or e.empresa_id<>s.empresa_id or not mont_pode_ver(s,p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
 if e.tipo<>'montagem' then raise exception 'A conferência de entrega é da montagem.'; end if;
 base:=mont_contagem_itens(p_token,p_etapa);
 select * into r from operacao_registros where etapa_id=p_etapa and tipo='conferencia_entrega';
 return jsonb_build_object('itens',case when r.id is null then base->'itens' else r.dados->'lista' end,
  'enviado',r.id is not null,'conferencia',coalesce(r.dados->'itens','{}'), 'autor',r.autor,'em',r.dados->'em');
end $$;
revoke all on function public.mont_entrega_itens(text,uuid) from public;
grant execute on function public.mont_entrega_itens(text,uuid) to anon,authenticated;

create or replace function public.mont_entrega_salvar(p_token text,p_etapa uuid,p_itens jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'montador'); e operacao_etapas; a operacao_apontamentos;
 base jsonb; it jsonb; v jsonb; entrega numeric; dano numeric; esperado numeric; normalizado jsonb:='{}';
begin
 select * into e from operacao_etapas where id=p_etapa for update;
 if e.id is null or e.empresa_id<>s.empresa_id or not mont_pode_ver(s,p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
 if e.tipo<>'montagem' then raise exception 'A conferência de entrega é da montagem.'; end if;
 select * into a from operacao_apontamentos where id=(mont_apontamento_ativo(s)->>'id')::uuid for update;
 if a.id is null or a.etapa_id<>p_etapa or a.status<>'ATIVO' then raise exception 'Inicie este evento antes de salvar a conferência.'; end if;
 perform operacao_validar_etapa_campo(p_etapa);
 base:=mont_entrega_itens(p_token,p_etapa);
 if (base->>'enviado')::boolean then return base; end if;
 if jsonb_typeof(p_itens) is distinct from 'object' then raise exception 'Confira todos os itens antes de enviar.'; end if;
 if (select count(*) from jsonb_object_keys(p_itens))<>jsonb_array_length(base->'itens') then raise exception 'A lista de itens mudou. Atualize e confira novamente.'; end if;
 for it in select value from jsonb_array_elements(base->'itens') loop
  v:=p_itens->(it->>'chave'); esperado:=(it->>'esperado')::numeric;
  if jsonb_typeof(v->'entregue') is distinct from 'number' or jsonb_typeof(v->'danificados') is distinct from 'number' then raise exception 'Informe a entrega e os danos de: %.',it->>'nome'; end if;
  entrega:=(v->>'entregue')::numeric; dano:=(v->>'danificados')::numeric;
  if entrega<0 or entrega>esperado or entrega<>trunc(entrega) then raise exception 'Quantidade entregue inválida para: %.',it->>'nome'; end if;
  if dano<0 or dano>entrega or dano<>trunc(dano) then raise exception 'Quantidade danificada inválida para: %.',it->>'nome'; end if;
  if dano>0 and length(btrim(coalesce(v->>'observacao','')))=0 then raise exception 'Descreva o dano de: %.',it->>'nome'; end if;
  if length(coalesce(v->>'observacao',''))>1000 or length(coalesce(v->>'foto',''))>2048 then raise exception 'Registro muito longo para: %.',it->>'nome'; end if;
  if coalesce(v->>'foto','')<>'' and (v->>'foto')!~'^https://' then raise exception 'Foto inválida para: %.',it->>'nome'; end if;
  normalizado:=normalizado||jsonb_build_object(it->>'chave',jsonb_build_object('entregue',entrega,'danificados',dano,
   'observacao',btrim(coalesce(v->>'observacao','')),'foto',coalesce(v->>'foto','')));
 end loop;
 insert into operacao_registros(empresa_id,etapa_id,tipo,dados,autor) values(e.empresa_id,p_etapa,'conferencia_entrega',
  jsonb_build_object('itens',normalizado,'lista',base->'itens','em',now(),'apontamentoId',a.id),s.nome);
 return mont_entrega_itens(p_token,p_etapa);
end $$;
revoke all on function public.mont_entrega_salvar(text,uuid,jsonb) from public;
grant execute on function public.mont_entrega_salvar(text,uuid,jsonb) to anon,authenticated;

-- A conferência substitui o antigo posicionamento. Montagens já registradas continuam válidas.
create or replace function public.operacao_validar_etapa_campo(p_etapa uuid)
returns void language plpgsql security definer set search_path=public as $$
declare e operacao_etapas; p separacoes_pedidos; m record;
begin
 select * into e from operacao_etapas where id=p_etapa;
 if e.id is null then raise exception 'Etapa não encontrada'; end if;
 if e.pedido_id is null then return; end if;
 select * into p from separacoes_pedidos where id=e.pedido_id;
 if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') or p.encerrado_operacional_em is not null then raise exception 'Pedido não está liberado para execução'; end if;
 if p.operacao->'carregamento'->>'concluido_em' is null then raise exception 'Conclua o carregamento antes de iniciar a montagem ou desmontagem'; end if;
 if e.tipo='desmontagem' then
  for m in select id from operacao_etapas where pedido_id=p.id and tipo='montagem' loop
   if (select count(*) from operacao_registros r where r.etapa_id=m.id and r.tipo in ('equipe','sacolas','lista_assinada'))<3
    or not exists(select 1 from operacao_registros r where r.etapa_id=m.id and r.tipo in ('posicionamento','conferencia_entrega')) then
    raise exception 'Finalize os registros obrigatórios da montagem antes da desmontagem';
   end if;
  end loop;
 end if;
end $$;
