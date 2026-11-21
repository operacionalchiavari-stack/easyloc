-- Itens danificados vão direto para o setor de manutenção (16/11/2026).
-- Quem sinaliza o dano (Triagem da volta ou Separação) escolhe o setor; a O.S nasce na hora.
-- O setor conclui a O.S na tela de O.S; a peça vai para "inspeção" e a própria Triagem aprova ou reprova a qualidade.
-- A revisão das peças que voltaram sem dano é liberada sozinha quando a triagem da volta é concluída.
-- Faltas (em investigação) são resolvidas na aba Divergências.

-- 1) Origem nova: dano encontrado na separação (peça no galpão, sem pedido: bloqueia na hora)
alter table public.acervo_retornos drop constraint if exists acervo_retornos_origem_check;
alter table public.acervo_retornos add constraint acervo_retornos_origem_check check (origem = any (array['coleta','inventario','triagem_retorno','separacao']));
alter table public.acervo_retornos drop constraint if exists acervo_origem_valida;
alter table public.acervo_retornos add constraint acervo_origem_valida check (
 (origem in ('coleta','triagem_retorno') and pedido_id is not null and inventario_id is null)
 or (origem = 'inventario' and pedido_id is null and inventario_id is not null)
 or (origem = 'separacao' and pedido_id is null and inventario_id is null));
alter table public.acervo_retornos add column if not exists separacao_ocorrencia_id uuid;
create unique index if not exists acervo_retornos_separacao_oc on public.acervo_retornos(separacao_ocorrencia_id) where separacao_ocorrencia_id is not null;

-- 2) Permissões
create or replace function public.acervo_os_pode(p_empresa uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and (funcionario_tabela_permitida(p_empresa,'itens','editar')
  or funcionario_pode(p_empresa,auth.uid(),'producao.ordens.executar') or funcionario_pode(p_empresa,auth.uid(),'estoque.almoxarifado.movimentar')
  or funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar'))
$$;
create or replace function public.acervo_triagem_pode(p_empresa uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and (funcionario_tabela_permitida(p_empresa,'separacoes_itens','editar') or funcionario_tabela_permitida(p_empresa,'itens','editar'))
$$;
revoke all on function public.acervo_os_pode(uuid), public.acervo_triagem_pode(uuid) from public, anon;
grant execute on function public.acervo_os_pode(uuid), public.acervo_triagem_pode(uuid) to authenticated;

-- 3) Abre a O.S (uso interno, sem conferir permissão)
create or replace function public.acervo_os_abrir_(p_empresa uuid, p_retorno uuid, p_setor text, p_motivo text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r acervo_retornos; v uuid; n bigint; quem text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where id=p_retorno and empresa_id=p_empresa for update;
 if r.tipo='falta' or r.estado not in ('triagem','limpeza','reparo') then raise exception 'Esta peça não pode ir para a manutenção agora'; end if;
 if r.os_id is not null then raise exception 'Esta peça já está com uma O.S'; end if;
 if p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados') then raise exception 'Escolha o setor da manutenção'; end if;
 if r.quantidade<>trunc(r.quantidade) then raise exception 'Quantidade inválida para a O.S'; end if;
 select coalesce(nullif(f.nome,''),nullif(auth.jwt()->'user_metadata'->>'nome',''),auth.jwt()->>'email','Equipe') into quem from (select 1) x left join funcionarios_acesso f on f.id=auth.uid();
 select greatest(coalesce(max(numero),0)+1,1) into n from acervo_os where empresa_id=p_empresa;
 insert into acervo_os(empresa_id,numero,retorno_id,item_id,quantidade,setor,fluxo,prazo,responsavel,solicitante_nome,criado_por,historico)
 values(p_empresa,n,r.id,r.item_id,r.quantidade::integer,p_setor,jsonb_build_array(p_setor),null,'',quem,auth.uid(),
  jsonb_build_array(jsonb_build_object('acao','criada','setor',p_setor,'motivo',coalesce(p_motivo,r.motivo),'usuario_id',auth.uid(),'em',now()))) returning id into v;
 update acervo_retornos set os_id=v::text,os_numero=n::text,estado='reparo',versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,r.id,'reparo','O.S #'||n||' aberta em '||p_setor,auth.uid());
 return v;
end $$;
revoke all on function public.acervo_os_abrir_(uuid,uuid,text,text) from public, anon, authenticated;

-- 4) Triagem da volta: registrar o dano já com o setor
alter function public.operacao_avaria_retorno(uuid,text,numeric,text,jsonb) rename to operacao_avaria_retorno_base;
revoke all on function public.operacao_avaria_retorno_base(uuid,text,numeric,text,jsonb) from public, anon, authenticated;
create or replace function public.operacao_avaria_retorno(p_pedido uuid, p_chave text, p_quantidade numeric, p_descricao text, p_fotos jsonb default '[]'::jsonb, p_setor text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare res jsonb; r acervo_retornos; emp uuid;
begin
 if coalesce(p_quantidade,0)>0 and (p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados')) then raise exception 'Escolha para qual setor de manutenção a peça vai'; end if;
 res:=operacao_avaria_retorno_base(p_pedido,p_chave,p_quantidade,p_descricao,p_fotos);
 if coalesce(p_quantidade,0)>0 then
  select empresa_id into emp from separacoes_pedidos where id=p_pedido;
  select * into r from acervo_retornos where pedido_id=any(pedido_grupo(p_pedido)) and chave='retorno:'||p_chave and tipo='avaria';
  if r.id is not null and r.os_id is null then perform acervo_os_abrir_(emp,r.id,p_setor,p_descricao); end if;
  res:=operacao_avarias_pedido(p_pedido);
 end if;
 return res;
end $$;
revoke all on function public.operacao_avaria_retorno(uuid,text,numeric,text,jsonb,text) from public, anon;
grant execute on function public.operacao_avaria_retorno(uuid,text,numeric,text,jsonb,text) to authenticated;

-- avarias do pedido devolvem também a O.S
create or replace function public.operacao_avarias_pedido(p_pedido uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare p separacoes_pedidos;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if p.id is null or not eh_membro_empresa(p.empresa_id) or not (funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') or funcionario_tabela_permitida(p.empresa_id,'itens','select')) then
    raise exception 'Sem acesso a este pedido'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'chave', a.chave, 'item_id', a.item_id, 'nome', coalesce(i.descricao_total, i.produto), 'quantidade', a.quantidade,
      'origem', a.origem, 'estado', a.estado, 'motivo', a.motivo, 'evidencias', a.evidencias, 'criado_em', a.criado_em, 'versao', a.versao,
      'os_numero', a.os_numero, 'setor', (select o.setor from acervo_os o where o.id::text=a.os_id),
      'pode_remover', a.origem = 'triagem_retorno' and a.estado = 'triagem' and a.os_id is null) order by a.criado_em)
    from acervo_retornos a join itens i on i.id = a.item_id
    where a.pedido_id = any(pedido_grupo(p.id)) and a.tipo = 'avaria'), '[]'::jsonb);
end $$;

-- 5) Mandar para o setor uma avaria já registrada (coleta, inventário, antiga)
create or replace function public.acervo_avaria_encaminhar(p_empresa uuid, p_retorno uuid, p_setor text, p_motivo text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
begin
 if not acervo_triagem_pode(p_empresa) then raise exception 'Sem permissão para encaminhar à manutenção'; end if;
 if not exists(select 1 from acervo_retornos where id=p_retorno and empresa_id=p_empresa and tipo='avaria') then raise exception 'Peça danificada não encontrada'; end if;
 return acervo_os_abrir_(p_empresa,p_retorno,p_setor,nullif(btrim(coalesce(p_motivo,'')),''));
end $$;
revoke all on function public.acervo_avaria_encaminhar(uuid,uuid,text,text) from public, anon;
grant execute on function public.acervo_avaria_encaminhar(uuid,uuid,text,text) to authenticated;

-- 6) Separação: peça danificada encontrada no galpão
create or replace function public.acervo_avaria_separacao(p_empresa uuid, p_ocorrencia uuid, p_setor text, p_descricao text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare o separacao_ocorrencias; r acervo_retornos; num text; ev jsonb;
begin
 if not acervo_triagem_pode(p_empresa) then raise exception 'Sem permissão para encaminhar à manutenção'; end if;
 select * into o from separacao_ocorrencias where id=p_ocorrencia and empresa_id=p_empresa;
 if o.id is null or o.item_id is null then raise exception 'Problema da separação não encontrado'; end if;
 if coalesce(o.quantidade,0)<=0 or o.quantidade<>trunc(o.quantidade) then raise exception 'Quantidade inválida'; end if;
 select * into r from acervo_retornos where separacao_ocorrencia_id=o.id;
 if r.id is not null then
  if r.os_id is not null then return r.os_id::uuid; end if;
 else
  select numero_pedido into num from separacoes_pedidos where id=o.pedido_id;
  select coalesce(jsonb_agg(jsonb_build_object('path',u,'bucket','separacao-ocorrencias','origem','separacao')),'[]'::jsonb) into ev
   from (select jsonb_array_elements_text(coalesce(o.fotos_paths,'[]'::jsonb)) u union select o.foto_path where o.foto_path is not null) x where u is not null;
  insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem,evidencias,separacao_ocorrencia_id)
  values(p_empresa,null,'separacao:'||o.id,o.item_id,'avaria',o.quantidade,'triagem',
   left(coalesce(nullif(btrim(p_descricao),''),nullif(btrim(o.observacao),''),o.motivo_nome,'Danificado na separação')||coalesce(' · separação do pedido '||num,''),500),
   auth.uid(),'separacao',ev,o.id) returning * into r;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,r.id,'triagem','Danificado na separação'||coalesce(' do pedido '||num,''),auth.uid());
 end if;
 return acervo_os_abrir_(p_empresa,r.id,p_setor,p_descricao);
end $$;
revoke all on function public.acervo_avaria_separacao(uuid,uuid,text,text) from public, anon;
grant execute on function public.acervo_avaria_separacao(uuid,uuid,text,text) to authenticated;

-- 7) Setor conclui / encaminha a O.S; concluir manda a peça para a inspeção da Triagem
create or replace function public.acervo_os_atualizar(p_empresa uuid, p_os uuid, p_versao integer, p_acao text, p_setor text, p_prazo date, p_responsavel text, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare o acervo_os;begin
 if not acervo_os_pode(p_empresa) then raise exception 'Sem permissão para gerenciar a O.S';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict o from acervo_os where id=p_os and empresa_id=p_empresa for update;
 if o.versao is distinct from p_versao then raise exception 'Outro usuário atualizou esta O.S';end if;
 if o.status<>'aberta' or p_acao is null or p_acao not in ('encaminhar','concluir') then raise exception 'O.S encerrada ou ação inválida';end if;
 if length(btrim(coalesce(p_motivo,'')))<5 or length(p_motivo)>1000 or length(coalesce(p_responsavel,''))>120 then raise exception 'Escreva o que foi feito (pelo menos 5 letras)';end if;
 if p_acao='encaminhar' and (p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados')) then raise exception 'Selecione o setor';end if;
 update acervo_os set setor=case when p_acao='encaminhar' then p_setor else setor end,
 fluxo=case when p_acao='encaminhar' and p_setor<>setor then fluxo||jsonb_build_array(p_setor) else fluxo end,
 prazo=case when p_acao='encaminhar' then coalesce(p_prazo,prazo) else prazo end,responsavel=case when p_acao='encaminhar' then btrim(coalesce(p_responsavel,responsavel,'')) else responsavel end,
 status=case when p_acao='concluir' then 'concluida' else status end,concluido_em=case when p_acao='concluir' then now() else concluido_em end,
 concluido_por=case when p_acao='concluir' then auth.uid() else concluido_por end,versao=versao+1,
 historico=historico||jsonb_build_array(jsonb_build_object('acao',p_acao,'setor',case when p_acao='encaminhar' then p_setor else setor end,'motivo',p_motivo,'usuario_id',auth.uid(),'em',now())) where id=o.id;
 if p_acao='concluir' then
  update acervo_retornos set estado='inspecao',versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=o.retorno_id and estado in ('triagem','limpeza','reparo');
 end if;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select p_empresa,id,estado,'O.S #'||o.numero||': '||case when p_acao='concluir' then 'serviço concluído' else 'encaminhada' end||' — '||p_motivo,auth.uid() from acervo_retornos where id=o.retorno_id;
end $$;

-- 8) Controle de qualidade (Triagem)
create or replace function public.acervo_qualidade_lista(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
 if not acervo_triagem_pode(p_empresa) and not (eh_membro_empresa(p_empresa) and funcionario_tabela_permitida(p_empresa,'separacoes_itens','select')) then raise exception 'Sem permissão para o controle de qualidade'; end if;
 return jsonb_build_object(
  'inspecao', coalesce((select jsonb_agg(x order by x->>'concluida_em' desc) from (
    select jsonb_build_object('id',a.id,'versao',a.versao,'item_id',a.item_id,'nome',coalesce(nullif(i.descricao_total,''),i.produto),'foto',i.foto_url,'quantidade',a.quantidade,
     'origem',a.origem,'motivo',a.motivo,'evidencias',a.evidencias,'os_numero',o.numero,'setor',o.setor,'fluxo',o.fluxo,'concluida_em',o.concluido_em,
     'concluida_por',coalesce(f.nome,u.nome,''),'resultado',(select h->>'motivo' from jsonb_array_elements(o.historico) h where h->>'acao'='concluir' order by h->>'em' desc limit 1),
     'reprovacoes',(select count(*) from jsonb_array_elements(o.historico) h where h->>'acao'='reprovada'),
     'pedido',p.numero_pedido,'cliente',p.cliente_nome,'criado_em',a.criado_em) x
    from acervo_retornos a join itens i on i.id=a.item_id join acervo_os o on o.id::text=a.os_id
    left join separacoes_pedidos p on p.id=a.pedido_id left join funcionarios_acesso f on f.id=o.concluido_por left join usuarios u on u.id=o.concluido_por
    where a.empresa_id=p_empresa and a.estado='inspecao') y),'[]'::jsonb),
  'sem_setor', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'versao',a.versao,'nome',coalesce(nullif(i.descricao_total,''),i.produto),'foto',i.foto_url,'quantidade',a.quantidade,
     'origem',a.origem,'motivo',a.motivo,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'criado_em',a.criado_em) order by a.criado_em)
    from acervo_retornos a join itens i on i.id=a.item_id left join separacoes_pedidos p on p.id=a.pedido_id
    where a.empresa_id=p_empresa and a.tipo='avaria' and a.os_id is null and a.estado in ('triagem','limpeza','reparo')),'[]'::jsonb),
  'em_manutencao', (select count(*) from acervo_retornos a where a.empresa_id=p_empresa and a.os_id is not null and a.estado in ('triagem','limpeza','reparo')));
end $$;
revoke all on function public.acervo_qualidade_lista(uuid) from public, anon;
grant execute on function public.acervo_qualidade_lista(uuid) to authenticated;

create or replace function public.acervo_qualidade_decidir(p_empresa uuid, p_retorno uuid, p_versao integer, p_aprovar boolean, p_motivo text, p_setor text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r acervo_retornos; o acervo_os;
begin
 if not acervo_triagem_pode(p_empresa) then raise exception 'Sem permissão para o controle de qualidade'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into r from acervo_retornos where id=p_retorno and empresa_id=p_empresa for update;
 if r.id is null or r.estado<>'inspecao' then raise exception 'Esta peça não está aguardando a aprovação'; end if;
 if r.versao is distinct from p_versao then raise exception 'Outra pessoa já mexeu nesta peça. Atualize a tela'; end if;
 if not p_aprovar and length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Escreva o motivo da reprovação (pelo menos 5 letras)'; end if;
 if p_aprovar then
  insert into qualidade_inspecoes(empresa_id,item_id,criado_por,dados) values(p_empresa,r.item_id,auth.uid(),jsonb_build_object('status','Aprovado','origem','retorno','retorno_id',r.id,'quantidade',r.quantidade,'observacao',coalesce(nullif(btrim(p_motivo),''),'Aprovado na Triagem'),'data',now()));
  update acervo_retornos set estado='liberado',motivo=coalesce(nullif(btrim(p_motivo),''),'Qualidade aprovada'),versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,r.id,'liberado','Qualidade aprovada na Triagem'||coalesce(' — '||nullif(btrim(p_motivo),''),''),auth.uid());
 else
  if p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados') then raise exception 'Escolha para qual setor a peça volta'; end if;
  select * into o from acervo_os where id::text=r.os_id for update;
  if o.id is null then raise exception 'O.S da peça não encontrada'; end if;
  insert into qualidade_inspecoes(empresa_id,item_id,criado_por,dados) values(p_empresa,r.item_id,auth.uid(),jsonb_build_object('status','Reprovado','origem','retorno','retorno_id',r.id,'quantidade',r.quantidade,'observacao',btrim(p_motivo),'data',now()));
  update acervo_os set status='aberta',setor=p_setor,fluxo=case when p_setor<>setor then fluxo||jsonb_build_array(p_setor) else fluxo end,concluido_em=null,concluido_por=null,versao=versao+1,
   historico=historico||jsonb_build_array(jsonb_build_object('acao','reprovada','setor',p_setor,'motivo',btrim(p_motivo),'usuario_id',auth.uid(),'em',now())) where id=o.id;
  update acervo_retornos set estado='reparo',versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,r.id,'reparo','Qualidade reprovada — volta para '||p_setor||': '||btrim(p_motivo),auth.uid());
 end if;
end $$;
revoke all on function public.acervo_qualidade_decidir(uuid,uuid,integer,boolean,text,text) from public, anon;
grant execute on function public.acervo_qualidade_decidir(uuid,uuid,integer,boolean,text,text) to authenticated;

-- 9) Revisão liberada sozinha quando a triagem da volta termina
create or replace function public.acervo_liberar_revisao_pedido(p_pedido uuid) returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer:=0; r record; u uuid;
begin
 select coalesce(auth.uid(), nullif(operacao->'retorno'->>'usuario_id','')::uuid, atualizado_por) into u from separacoes_pedidos where id=p_pedido;
 for r in select a.* from acervo_retornos a where a.pedido_id=any(pedido_grupo(p_pedido)) and a.tipo='revisao' and a.estado in ('aguardando_retorno','triagem') and a.os_id is null for update loop
  update acervo_retornos set estado='liberado',motivo='Voltou sem dano: liberado na triagem da volta',versao=versao+1,atualizado_em=now() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select r.empresa_id,r.id,'liberado','Voltou sem dano: liberado na triagem da volta',coalesce(u,r.atualizado_por) where coalesce(u,r.atualizado_por) is not null;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.acervo_liberar_revisao_pedido(uuid) from public, anon, authenticated;

create or replace function public.acervo_liberar_revisao_gatilho() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
 if (new.operacao->'retorno'->>'concluido_em') is not null and (old.operacao->'retorno'->>'concluido_em') is null then
  begin perform acervo_liberar_revisao_pedido(new.id); exception when others then raise warning 'Liberar revisão do pedido %: %', new.id, sqlerrm; end;
 end if;
 return null;
end $$;
drop trigger if exists acervo_liberar_revisao on public.separacoes_pedidos;
create trigger acervo_liberar_revisao after update of operacao on public.separacoes_pedidos for each row execute function public.acervo_liberar_revisao_gatilho();

-- pedidos cuja volta já foi conferida
do $$ declare p record; begin
 for p in select s.id from separacoes_pedidos s where (s.operacao->'retorno'->>'concluido_em') is not null
   and exists(select 1 from acervo_retornos a where a.pedido_id=s.id and a.tipo='revisao' and a.estado in ('aguardando_retorno','triagem') and a.os_id is null) loop
  perform acervo_liberar_revisao_pedido(p.id);
 end loop;
end $$;

-- 10) Faltas (em investigação) na aba Divergências
create or replace function public.acervo_faltas_lista(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissão para consultar o acervo'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'versao',a.versao,'item_id',a.item_id,'nome',coalesce(nullif(i.descricao_total,''),i.produto),'codigo',i.codigo,'foto',i.foto_url,
   'quantidade',a.quantidade,'motivo',a.motivo,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'local',p.local_nome,'criado_em',a.criado_em) order by a.criado_em)
  from acervo_retornos a join itens i on i.id=a.item_id left join separacoes_pedidos p on p.id=a.pedido_id
  where a.empresa_id=p_empresa and a.tipo='falta' and a.estado='investigacao'),'[]'::jsonb);
end $$;
revoke all on function public.acervo_faltas_lista(uuid) from public, anon;
grant execute on function public.acervo_faltas_lista(uuid) to authenticated;

create or replace function public.acervo_falta_resolver(p_empresa uuid, p_id uuid, p_versao integer, p_acao text, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r acervo_retornos; saldo numeric;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para resolver a falta'; end if;
 if length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Escreva o que aconteceu (pelo menos 5 letras)'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into r from acervo_retornos where id=p_id and empresa_id=p_empresa and tipo='falta' for update;
 if r.id is null or r.estado<>'investigacao' then raise exception 'Esta falta já foi resolvida'; end if;
 if r.versao is distinct from p_versao then raise exception 'Outra pessoa já mexeu nesta falta. Atualize a tela'; end if;
 if p_acao='encontrada' then
  update acervo_retornos set estado='liberado',motivo='Encontrada: '||btrim(p_motivo),versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,r.id,'liberado','Peça encontrada — '||btrim(p_motivo),auth.uid());
 elsif p_acao='perda' then
  select estoque_total into saldo from itens where id=r.item_id and empresa_id=p_empresa for update;
  if coalesce(saldo,0)<r.quantidade then raise exception 'Saldo insuficiente para confirmar a perda'; end if;
  update itens set estoque_total=estoque_total-r.quantidade where id=r.item_id and empresa_id=p_empresa;
  update acervo_retornos set estado='baixado',motivo='Perda confirmada: '||btrim(p_motivo),versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id;
  insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p_empresa,r.id,'baixado','Perda confirmada — '||btrim(p_motivo),auth.uid());
 else raise exception 'Ação inválida'; end if;
end $$;
revoke all on function public.acervo_falta_resolver(uuid,uuid,integer,text,text) from public, anon;
grant execute on function public.acervo_falta_resolver(uuid,uuid,integer,text,text) to authenticated;
