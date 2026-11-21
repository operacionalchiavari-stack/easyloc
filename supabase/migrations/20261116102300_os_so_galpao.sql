-- 16/11/2026 (pedido do usuário): só a equipe do galpão abre O.S.
-- (1) Dano marcado na coleta (App do Montador / Entregas e Coletas) não abre O.S: é informação, liberado quando a
--     triagem da volta termina; a Triagem conta os danificados e escolhe o setor.
-- (2) App da Triagem: a volta manda o setor de cada item danificado (p_setores).
-- (3) Inventário: peças em revisão na segunda contagem vão direto para o setor escolhido (p_setor).
drop function if exists public.triagem_app_finalizar(uuid,text,text,jsonb,jsonb,jsonb,jsonb);
drop function if exists public.acervo_inventario_registrar_resultado(uuid,uuid,uuid,integer,jsonb);
drop function if exists public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb,integer);
CREATE OR REPLACE FUNCTION public.operacao_avaria_retorno_base(p_pedido uuid, p_chave text, p_quantidade numeric, p_descricao text, p_fotos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p separacoes_pedidos; c record; ja numeric; atual acervo_retornos; rev acervo_retornos; f text; delta numeric; nova numeric;
begin
  select * into p from separacoes_pedidos where id = p_pedido for update;
  if p.id is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para registrar avaria'; end if;
  if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada'; end if;
  if p.pedido_origem_id is not null then raise exception 'Registre a avaria no pedido principal'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'Pré-reserva e orçamento são somente consulta.'; end if;
  if not exists (select 1 from logistica_confirmacoes where pedido_id = any(pedido_grupo(p.id)) and etapa = 'coleta') then raise exception 'A avaria da volta é registrada depois da coleta.'; end if;
  select * into c from operacao_conferencia_pecas(p.id, true) x where x.chave = p_chave;
  if c.chave is null then raise exception 'Item não pertence a este pedido'; end if;
  if p_quantidade is null or p_quantidade < 0 or p_quantidade <> trunc(p_quantidade) then raise exception 'Quantidade inválida'; end if;
  if p_quantidade > 0 and length(btrim(coalesce(p_descricao,''))) < 3 then raise exception 'Descreva o dano'; end if;
  if jsonb_typeof(coalesce(p_fotos,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_fotos,'[]'::jsonb)) > 6 then raise exception 'Até 6 fotos'; end if;
  for f in select jsonb_array_elements_text(coalesce(p_fotos,'[]'::jsonb)) loop
    if f !~ ('^' || p.empresa_id::text || '/' || p.id::text || '/avaria-[0-9a-f-]{36}\.jpg$') then raise exception 'Foto inválida'; end if;
  end loop;
  -- avaria já registrada para o mesmo item (coleta) entra no limite
  select coalesce(sum(quantidade),0) into ja from acervo_retornos where pedido_id = any(pedido_grupo(p.id)) and item_id = c.item_id and tipo = 'avaria' and chave <> 'retorno:' || p_chave and estado not in ('liberado','baixado');
  if ja + p_quantidade > c.esperado then raise exception 'Danificados de % passam do que saiu (%).', c.nome, c.esperado; end if;

  select * into atual from acervo_retornos where pedido_id = c.pedido_id and chave = 'retorno:' || p_chave and tipo = 'avaria' for update;
  if atual.id is not null and (atual.estado <> 'triagem' or atual.os_id is not null) then raise exception 'Esta avaria já está em tratamento na Gestão do acervo'; end if;
  delta := p_quantidade - coalesce(atual.quantidade, 0);

  if p_quantidade = 0 then
    if atual.id is not null then delete from acervo_historico where retorno_id = atual.id; delete from acervo_retornos where id = atual.id; end if;
  elsif atual.id is null then
    insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem,evidencias)
    values (p.empresa_id, c.pedido_id, 'retorno:' || p_chave, c.item_id, 'avaria', p_quantidade, 'triagem', left(btrim(p_descricao),500), auth.uid(), 'triagem_retorno',
      coalesce((select jsonb_agg(jsonb_build_object('path', u, 'bucket', 'evidencias-operacionais', 'origem', 'triagem')) from jsonb_array_elements_text(coalesce(p_fotos,'[]'::jsonb)) u), '[]'::jsonb))
    returning * into atual;
    insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values (p.empresa_id, atual.id, 'triagem', 'Danificado na Triagem da volta', auth.uid());
  else
    update acervo_retornos set quantidade = p_quantidade, motivo = left(btrim(p_descricao),500), atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1,
      evidencias = coalesce((select jsonb_agg(jsonb_build_object('path', u, 'bucket', 'evidencias-operacionais', 'origem', 'triagem')) from jsonb_array_elements_text(coalesce(p_fotos,'[]'::jsonb)) u), '[]'::jsonb)
    where id = atual.id;
  end if;

  -- a mesma quantidade sai (ou volta) da "revisão" do item, para o total parado não dobrar
  if delta <> 0 then
    select * into rev from acervo_retornos where pedido_id = any(pedido_grupo(p.id)) and item_id = c.item_id and tipo = 'revisao' and estado in ('aguardando_retorno','triagem') and os_id is null order by criado_em limit 1 for update;
    if rev.id is null and delta < 0 then
      insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem)
      values (p.empresa_id, c.pedido_id, 'retorno-revisao:' || p_chave, c.item_id, 'revisao', -delta, 'triagem', 'Avaria desfeita na Triagem da volta', auth.uid(), 'triagem_retorno')
      on conflict (pedido_id, chave, tipo) do update set quantidade = acervo_retornos.quantidade + excluded.quantidade, versao = acervo_retornos.versao + 1, atualizado_em = now();
    elsif rev.id is not null then
      nova := rev.quantidade - delta;
      if nova <= 0 then delete from acervo_historico where retorno_id = rev.id; delete from acervo_retornos where id = rev.id;
      else update acervo_retornos set quantidade = nova, versao = versao + 1, atualizado_em = now() where id = rev.id; end if;
    end if;
  end if;
  return operacao_avarias_pedido(p.id);
end $function$;
CREATE OR REPLACE FUNCTION public.operacao_concluir_retorno_avarias(p_pedido uuid, p_etapa text, p_aceitar_faltas boolean DEFAULT false, p_quantidades jsonb DEFAULT NULL::jsonb, p_observacoes jsonb DEFAULT NULL::jsonb, p_primeira jsonb DEFAULT NULL::jsonb, p_danificados jsonb DEFAULT '{}'::jsonb, p_fotos jsonb DEFAULT '{}'::jsonb, p_setores jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p separacoes_pedidos;r jsonb;c record;k text;q numeric;conhecida numeric;adicional numeric;atual numeric;f jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao para confirmar';end if;
 if p_etapa<>'retorno' then raise exception 'Esta confirmacao e exclusiva da triagem de volta';end if;
 if p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'Triagem ja confirmada. Atualize a tela.';end if;
 if jsonb_typeof(p_danificados) is distinct from 'object' then raise exception 'Quantidades de danos invalidas';end if;
 for k in select jsonb_object_keys(p_danificados) loop
  if not exists(select 1 from operacao_conferencia_pecas(p.id,true) pc where pc.chave=k) then raise exception 'Item danificado nao pertence ao pedido';end if;
  q:=(p_danificados->>k)::numeric;
  if q is null or q<0 or q<>trunc(q) or q>coalesce((p_quantidades->>k)::numeric,0) then raise exception 'Danificados devem fazer parte da quantidade que voltou';end if;
 end loop;
 r:=operacao_concluir_conferencia(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes,p_primeira);
 for c in select * from operacao_conferencia_pecas(p.id,true) loop
  if not(p_danificados ? c.chave) then continue;end if;
  q:=(p_danificados->>c.chave)::numeric;
  select coalesce(sum(quantidade),0) into conhecida from acervo_retornos where pedido_id=any(pedido_grupo(p.id)) and item_id=c.item_id and tipo='avaria' and chave<>'retorno:'||c.chave;
  adicional:=q; -- 16/11/2026: a Triagem decide; o dano marcado na coleta é só informação (liberado na conclusão)
  select quantidade into atual from acervo_retornos where pedido_id=c.pedido_id and chave='retorno:'||c.chave and tipo='avaria';
  f:=coalesce(p_fotos->c.chave,'[]'::jsonb);
  if adicional<>coalesce(atual,0) or jsonb_array_length(f)>0 then
   if adicional>0 and nullif(coalesce(p_setores,'{}'::jsonb)->>c.chave,'') is not null then
    perform operacao_avaria_retorno(p.id,c.chave,adicional,coalesce(nullif(p_observacoes->>c.chave,''),'Danificado identificado na triagem da volta'),f,p_setores->>c.chave);
   else
    perform operacao_avaria_retorno_base(p.id,c.chave,adicional,coalesce(nullif(p_observacoes->>c.chave,''),'Danificado identificado na triagem da volta'),f);
   end if;
  end if;
 end loop;
 r:=r||jsonb_build_object('danificados',p_danificados);
 update separacoes_pedidos set operacao=jsonb_set(operacao,'{retorno}',r) where id=p.id;
 return r;
end $function$;
CREATE OR REPLACE FUNCTION public.triagem_app_finalizar(p_pedido uuid, p_etapa text, p_token text, p_quantidades jsonb DEFAULT '{}'::jsonb, p_primeira jsonb DEFAULT NULL::jsonb, p_danificados jsonb DEFAULT '{}'::jsonb, p_fotos jsonb DEFAULT '{}'::jsonb, p_setores jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p separacoes_pedidos;b jsonb;registro jsonb;x jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 b:=triagem_app_base(p.id,p_etapa);
 if not coalesce((b->>'pode_editar')::boolean,false) then raise exception 'Sem permissão para concluir';end if;
 if b->>'bloqueio' is not null then raise exception '%',b->>'bloqueio';end if;
 if b->>'token' is distinct from p_token then raise exception 'O pedido foi atualizado em outro aparelho. Abra o pedido novamente e revise a conferência.';end if;
 if p_etapa='ida' then
  if not exists(select 1 from jsonb_array_elements(b->'itens')) then raise exception 'Este pedido não possui materiais liberados para seu setor';end if;
  update separacoes_pedidos set status='separado',atualizado_por=auth.uid(),atualizado_em=now() where id=p.id;
 else
  -- A volta só conclui com todos os itens, inclusive quando há restrição de setor.
  for x in select to_jsonb(pc) from operacao_conferencia_pecas(p.id,true) pc loop
   if not(p_quantidades ? (x->>'chave')) then raise exception 'Preencha todos os materiais da volta';end if;
   if jsonb_typeof(p_quantidades->(x->>'chave')) is distinct from 'number' or (p_quantidades->>(x->>'chave'))::numeric<0 or trunc((p_quantidades->>(x->>'chave'))::numeric)<>(p_quantidades->>(x->>'chave'))::numeric then raise exception 'Informe quantidades inteiras e não negativas';end if;
   if p_primeira is not null and (jsonb_typeof(p_primeira->(x->>'chave')) is distinct from 'number' or (p_primeira->>(x->>'chave'))::numeric<0 or trunc((p_primeira->>(x->>'chave'))::numeric)<>(p_primeira->>(x->>'chave'))::numeric) then raise exception 'Primeira contagem incompleta';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(b->'itens') z where (p_quantidades->>(z->>'chave'))::numeric is distinct from (z->>'esperado')::numeric) and p_primeira is null then raise exception 'Realize a segunda contagem dos itens divergentes';end if;
  registro:=operacao_concluir_retorno_avarias(p.id,'retorno',true,p_quantidades,'{}',p_primeira,p_danificados,p_fotos,coalesce(p_setores,'{}'::jsonb));
 end if;
 return triagem_app_base(p.id,p_etapa);
end $function$;
CREATE OR REPLACE FUNCTION public.acervo_inventario_conferir(p_empresa uuid, p_id uuid, p_item uuid, p_versao integer, p_contado numeric, p_motivo text, p_qualidade jsonb, p_tratamento jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare problemas boolean;r acervo_retornos;q numeric;destino text;motivo text;bloqueado numeric;manutencao numeric;ocorrencia uuid;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para conferir';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 -- Conferência, validação e bloqueio pertencem à mesma transação.
 perform acervo_inventario_conferir_sem_tratamento(p_empresa,p_id,p_item,p_versao,p_contado,p_motivo,p_qualidade);
 select exists(select 1 from jsonb_each(p_qualidade) x where x.value->>'resultado'='nao_conforme') into problemas;
 select * into r from acervo_retornos where inventario_id=p_id and item_id=p_item and empresa_id=p_empresa for update;
 if not problemas then
  if r.id is not null and r.estado not in ('liberado','baixado') then raise exception 'Existe tratamento em andamento. Conclua a inspeção antes de retirar os problemas';end if;
  return;
 end if;
 if p_tratamento is null or jsonb_typeof(p_tratamento)<>'object' then raise exception 'Informe a quantidade afetada e o destino para tratamento';end if;
 q:=(p_tratamento->>'quantidade')::numeric;destino:=p_tratamento->>'destino';
 if q is null or q::text in ('NaN','Infinity','-Infinity') or q<=0 or q<>trunc(q) or q>p_contado then raise exception 'Quantidade afetada inválida';end if;
 if nullif(p_tratamento->>'setor','') is not null then destino:='triagem';
 elsif destino is null or destino not in ('limpeza','reparo','inspecao') then raise exception 'Selecione o destino das peças afetadas';end if;
 select string_agg(c->>'nome'||': '||(p_qualidade->(c->>'id')->>'observacao'),'; ') into motivo from acervo_inventarios a cross join jsonb_array_elements(a.qualidade_criterios) c where a.id=p_id and a.empresa_id=p_empresa and p_qualidade->(c->>'id')->>'resultado'='nao_conforme';
 if r.id is not null then
  if r.estado in ('liberado','baixado') or r.quantidade<>q then raise exception 'A ocorrência já foi encaminhada. Confira o tratamento sem substituir suas quantidades';end if;
  return;
 end if;
 select coalesce(sum(o.quantidade),0) into bloqueado from operacao_indisponiveis(p_empresa,current_date) o where o.item_id=p_item;
 select coalesce((to_jsonb(i)->>'estoque_manutencao')::numeric,0) into manutencao from itens i where id=p_item and empresa_id=p_empresa for update;
 if q+bloqueado+manutencao>p_contado then raise exception 'A quantidade afetada excede as peças livres; confira os bloqueios existentes';end if;
 insert into acervo_retornos(empresa_id,pedido_id,inventario_id,origem,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por)
 values(p_empresa,null,p_id,'inventario','inventario:'||p_id||':'||p_item,p_item,'avaria',q,destino,motivo,auth.uid()) returning id into ocorrencia;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,ocorrencia,destino,'Problema identificado no inventário — '||motivo,auth.uid());
 if nullif(p_tratamento->>'setor','') is not null then perform acervo_os_abrir_(p_empresa,ocorrencia,p_tratamento->>'setor',motivo); end if;
end $function$;
CREATE OR REPLACE FUNCTION public.acervo_inventario_registrar_resultado(p_empresa uuid, p_id uuid, p_item uuid, p_versao integer, p_quantidades jsonb, p_setor text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare inv acervo_inventarios;coluna jsonb;valor numeric;total numeric;revisao numeric;fazer numeric;respostas jsonb:='{}';crit jsonb;problema boolean;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para contar';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into inv from acervo_inventarios where id=p_id and empresa_id=p_empresa for update;
 if not found or inv.status<>'contagem' then raise exception 'Inventário indisponível para contagem';end if;
 if inv.colunas_contagem='[]'::jsonb then raise exception 'Reabra o inventário para carregar as colunas';end if;
 if jsonb_typeof(p_quantidades) is distinct from 'object' then raise exception 'Preencha as quantidades';end if;
 if (select count(*) from jsonb_object_keys(p_quantidades))<>(select count(*) from jsonb_array_elements(inv.colunas_contagem) c where (c->>'ativa')::boolean) then raise exception 'Preencha todas as colunas da contagem';end if;
 for coluna in select * from jsonb_array_elements(inv.colunas_contagem) c where (c->>'ativa')::boolean loop
  if jsonb_typeof(p_quantidades->(coluna->>'chave')) is distinct from 'number' then raise exception 'Informe a quantidade: %',coluna->>'nome';end if;
  valor:=(p_quantidades->>(coluna->>'chave'))::numeric;
  if valor<0 or valor<>trunc(valor) or valor::text in('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida: %',coluna->>'nome';end if;
 end loop;
 total:=(p_quantidades->>'qtd')::numeric;revisao:=coalesce((p_quantidades->>'revisao')::numeric,0);fazer:=coalesce((p_quantidades->>'fazer_capa')::numeric,0);
 if revisao>0 and nullif(p_setor,'') is null then raise exception 'Escolha para qual setor de manutenção vão as peças em revisão';end if;
 if total is null or revisao>total or fazer>total then raise exception 'As quantidades de revisão e de fazer capa não podem superar a quantidade contada';end if;
 for crit in select * from jsonb_array_elements(inv.qualidade_criterios) loop
  problema:=case when crit->>'id'='geral' then revisao>0 when lower(crit->>'nome') like '%capa%' then fazer>0 else false end;
  respostas:=respostas||jsonb_build_object(crit->>'id',jsonb_build_object('resultado',case when problema then 'nao_conforme' when crit->>'id'='geral' or lower(crit->>'nome') like '%capa%' then 'conforme' else 'nao_aplica' end,'observacao',case when problema then 'Contagem: '||revisao||' para revisão; '||fazer||' para fazer capa de proteção' else '' end));
 end loop;
 perform acervo_inventario_conferir(p_empresa,p_id,p_item,p_versao,total,'Contagem cega do inventário',respostas,
  case when greatest(revisao,fazer)>0 then jsonb_build_object('quantidade',greatest(revisao,fazer),'destino','reparo','setor',case when revisao>0 then p_setor end) else null end);
 update acervo_inventario_itens set contagens=p_quantidades where inventario_id=p_id and empresa_id=p_empresa and item_id=p_item;
end $function$;
CREATE OR REPLACE FUNCTION public.acervo_inventario_contar_cegas(p_empresa uuid, p_id uuid, p_item uuid, p_versao integer, p_quantidades jsonb, p_rodada integer DEFAULT 1, p_setor text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform acervo_inventario_registrar_resultado(p_empresa,p_id,p_item,p_versao,p_quantidades,p_setor);
  update acervo_inventario_itens set segunda_contagens=p_quantidades,segunda_contado_por=auth.uid(),segunda_contado_em=now() where inventario_id=p_id and item_id=p_item;
 else raise exception 'Rodada de contagem inválida';end if;
end $function$;
create or replace function public.acervo_liberar_revisao_pedido(p_pedido uuid) returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer:=0; r record; u uuid; txt text;
begin
 select coalesce(auth.uid(), nullif(operacao->'retorno'->>'usuario_id','')::uuid, atualizado_por) into u from separacoes_pedidos where id=p_pedido;
 for r in select a.* from acervo_retornos a where a.pedido_id=any(pedido_grupo(p_pedido)) and a.os_id is null
   and ((a.tipo='revisao' and a.estado in ('aguardando_retorno','triagem'))
     or (a.tipo='falta' and a.origem='coleta' and a.estado='investigacao')
     or (a.tipo='avaria' and a.origem='coleta' and a.estado in ('aguardando_retorno','triagem'))) for update loop
  txt:=case when r.tipo='falta' then 'Falta da coleta conferida na triagem da volta (a divergência decide se é perda)'
            when r.tipo='avaria' then 'Dano marcado na coleta conferido na triagem da volta (a Triagem decide se vai para a manutenção)'
            else 'Voltou sem dano: liberado na triagem da volta' end;
  update acervo_retornos set estado='liberado',motivo=txt,versao=versao+1,atualizado_em=now() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select r.empresa_id,r.id,'liberado',txt,coalesce(u,r.atualizado_por) where coalesce(u,r.atualizado_por) is not null;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.acervo_liberar_revisao_pedido(uuid) from public, anon, authenticated;

revoke all on function public.triagem_app_finalizar(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.triagem_app_finalizar(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.acervo_inventario_registrar_resultado(uuid,uuid,uuid,integer,jsonb,text) from public, anon;
grant execute on function public.acervo_inventario_registrar_resultado(uuid,uuid,uuid,integer,jsonb,text) to authenticated;
revoke all on function public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb,integer,text) from public, anon;
grant execute on function public.acervo_inventario_contar_cegas(uuid,uuid,uuid,integer,jsonb,integer,text) to authenticated;
do $$ declare p record; begin
 for p in select distinct s.id from separacoes_pedidos s join acervo_retornos a on a.pedido_id=s.id
   where (s.operacao->'retorno'->>'concluido_em') is not null and a.tipo='avaria' and a.origem='coleta' and a.os_id is null and a.estado in ('aguardando_retorno','triagem') loop
  perform acervo_liberar_revisao_pedido(p.id);
 end loop;
end $$;
