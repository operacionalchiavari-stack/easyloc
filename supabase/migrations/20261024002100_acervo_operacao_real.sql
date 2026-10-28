-- Ocorrências de inventário e ordens nativas não dependem de planilhas.
alter table public.acervo_retornos alter column pedido_id drop not null;
alter table public.acervo_retornos add column origem text not null default 'coleta' check(origem in ('coleta','inventario')),
 add column inventario_id uuid references acervo_inventarios(id);
alter table public.acervo_retornos add constraint acervo_origem_valida check((origem='coleta' and pedido_id is not null and inventario_id is null) or (origem='inventario' and pedido_id is null and inventario_id is not null));
create unique index acervo_inventario_ocorrencia on acervo_retornos(inventario_id,item_id) where inventario_id is not null;
create table public.acervo_os(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),numero bigint not null,
 retorno_id uuid not null unique references acervo_retornos(id),item_id uuid not null references itens(id),quantidade numeric not null check(quantidade>0 and quantidade=trunc(quantidade)),
 setor text not null check(setor in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados')),
 fluxo jsonb not null,status text not null default 'aberta' check(status in ('aberta','concluida')),
 prazo date,responsavel text not null default '',solicitante_nome text not null,criado_por uuid not null,criado_em timestamptz not null default now(),
 concluido_em timestamptz,concluido_por uuid,versao integer not null default 1,historico jsonb not null default '[]',unique(empresa_id,numero)
);
alter table public.acervo_os enable row level security;
create policy acervo_os_ler on public.acervo_os for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,'itens','select'));
revoke all on public.acervo_os from public,anon,authenticated;grant select on public.acervo_os to authenticated;

alter function public.acervo_ordens(uuid) rename to acervo_ordens_legado;
revoke all on function public.acervo_ordens_legado(uuid) from public,anon,authenticated;
create function public.acervo_ordens(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare n jsonb;l jsonb;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') then raise exception 'Sem permissão para consultar o acervo';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id::text,'numero',o.numero::text,'item_id',o.item_id,'codigo',to_jsonb(i)->>'codigo',
 'item',coalesce(nullif(to_jsonb(i)->>'descricao_total',''),i.produto),'descricao_complementar',to_jsonb(i)->>'descricao_complementar','foto_url',i.foto_url,
 'quantidade',o.quantidade,'setor',o.setor,'fluxo',o.fluxo,'concluida',o.status='concluida','prazo',o.prazo,'motivo',r.motivo,
 'onde',case when r.origem='inventario' then 'Inventário' else 'Retorno do evento' end,'pedido',p.numero_pedido,'data',o.criado_em,'data_conclusao',o.concluido_em,
 'solicitante',o.solicitante_nome,'responsavel',o.responsavel,'versao',o.versao,'retorno_id',r.id,'fonte','sistema','historico',o.historico) order by o.criado_em desc),'[]') into n
 from acervo_os o join itens i on i.id=o.item_id and i.empresa_id=p_empresa join acervo_retornos r on r.id=o.retorno_id and r.empresa_id=p_empresa left join separacoes_pedidos p on p.id=r.pedido_id and p.empresa_id=p_empresa where o.empresa_id=p_empresa;
 select coalesce(jsonb_agg(x||jsonb_build_object('fonte','legado')),'[]') into l from jsonb_array_elements(acervo_ordens_legado(p_empresa)) x;
 return n||l;
end $$;

create function public.acervo_os_criar(p_empresa uuid,p_retorno uuid,p_versao integer,p_setor text,p_prazo date,p_responsavel text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;v uuid;n bigint;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para encaminhar o acervo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where id=p_retorno and empresa_id=p_empresa for update;
 if r.versao is distinct from p_versao then raise exception 'Outro usuário atualizou esta ocorrência';end if;
 if r.estado not in ('triagem','limpeza','reparo') or r.tipo='falta' then raise exception 'Confira o recebimento da peça antes de abrir a O.S';end if;
 if r.os_id is not null then raise exception 'A ocorrência já tem uma O.S vinculada';end if;
 if p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados') or length(coalesce(p_responsavel,''))>120 then raise exception 'Confira o setor e o responsável';end if;
 select greatest(coalesce(max(numero),0)+1,1) into n from acervo_os where empresa_id=p_empresa;
 insert into acervo_os(empresa_id,numero,retorno_id,item_id,quantidade,setor,fluxo,prazo,responsavel,solicitante_nome,criado_por,historico)
 values(p_empresa,n,r.id,r.item_id,r.quantidade,p_setor,jsonb_build_array(p_setor),p_prazo,btrim(coalesce(p_responsavel,'')),coalesce(nullif(auth.jwt()->'user_metadata'->>'nome',''),auth.jwt()->>'email','Equipe'),auth.uid(),jsonb_build_array(jsonb_build_object('acao','criada','setor',p_setor,'usuario_id',auth.uid(),'em',now()))) returning id into v;
 update acervo_retornos set os_id=v::text,os_numero=n::text,estado=case when estado='triagem' then 'reparo' else estado end,versao=versao+1,atualizado_em=now(),atualizado_por=auth.uid() where id=r.id;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select p_empresa,id,estado,'O.S #'||n||' aberta em '||p_setor,auth.uid() from acervo_retornos where id=r.id;
 return v;
end $$;

create function public.acervo_os_atualizar(p_empresa uuid,p_os uuid,p_versao integer,p_acao text,p_setor text,p_prazo date,p_responsavel text,p_motivo text) returns void language plpgsql security definer set search_path=public as $$
declare o acervo_os;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para gerenciar a O.S';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict o from acervo_os where id=p_os and empresa_id=p_empresa for update;
 if o.versao is distinct from p_versao then raise exception 'Outro usuário atualizou esta O.S';end if;
 if o.status<>'aberta' or p_acao is null or p_acao not in ('encaminhar','concluir') then raise exception 'O.S encerrada ou ação inválida';end if;
 if length(btrim(coalesce(p_motivo,'')))<5 or length(p_motivo)>1000 or length(coalesce(p_responsavel,''))>120 then raise exception 'Informe o resultado ou motivo da alteração';end if;
 if p_acao='encaminhar' and (p_setor is null or p_setor not in ('Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados')) then raise exception 'Selecione o setor';end if;
 update acervo_os set setor=case when p_acao='encaminhar' then p_setor else setor end,
 fluxo=case when p_acao='encaminhar' and p_setor<>setor then fluxo||jsonb_build_array(p_setor) else fluxo end,
 prazo=case when p_acao='encaminhar' then p_prazo else prazo end,responsavel=case when p_acao='encaminhar' then btrim(coalesce(p_responsavel,'')) else responsavel end,
 status=case when p_acao='concluir' then 'concluida' else status end,concluido_em=case when p_acao='concluir' then now() else concluido_em end,
 concluido_por=case when p_acao='concluir' then auth.uid() else concluido_por end,versao=versao+1,
 historico=historico||jsonb_build_array(jsonb_build_object('acao',p_acao,'setor',case when p_acao='encaminhar' then p_setor else setor end,'motivo',p_motivo,'usuario_id',auth.uid(),'em',now())) where id=o.id;
 insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select p_empresa,id,estado,'O.S #'||o.numero||': '||p_acao||' — '||p_motivo,auth.uid() from acervo_retornos where id=o.retorno_id;
end $$;

-- Os registros sem pedido também precisam aparecer no painel.
do $$declare f text;begin
 f:=pg_get_functiondef('public.acervo_painel_antes_visual(uuid)'::regprocedure);
 if position('join separacoes_pedidos p on p.id=a.pedido_id' in f)=0 then raise exception 'Consulta do painel alterada';end if;
 f:=replace(f,'join separacoes_pedidos p on p.id=a.pedido_id','left join separacoes_pedidos p on p.id=a.pedido_id');execute f;
end $$;

alter function public.acervo_inventario_conferir(uuid,uuid,uuid,integer,numeric,text,jsonb) rename to acervo_inventario_conferir_sem_tratamento;
revoke all on function public.acervo_inventario_conferir_sem_tratamento(uuid,uuid,uuid,integer,numeric,text,jsonb) from public,anon,authenticated;
create function public.acervo_inventario_conferir(p_empresa uuid,p_id uuid,p_item uuid,p_versao integer,p_contado numeric,p_motivo text,p_qualidade jsonb,p_tratamento jsonb default null) returns void language plpgsql security definer set search_path=public as $$
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
 if destino is null or destino not in ('limpeza','reparo','inspecao') then raise exception 'Selecione o destino das peças afetadas';end if;
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
end $$;
do $$declare f text;begin
 f:=pg_get_functiondef('public.acervo_inventario_aprovar(uuid,uuid)'::regprocedure);
 f:=replace(f,'  perform acervo_qualidade_validar(i.qualidade_criterios,c.qualidade);', $guard$
  perform acervo_qualidade_validar(i.qualidade_criterios,c.qualidade);
  if exists(select 1 from jsonb_each(c.qualidade) q where q.value->>'resultado'='nao_conforme') and not exists(select 1 from acervo_retornos r where r.empresa_id=p_empresa and r.inventario_id=p_id and r.item_id=c.item_id) then raise exception 'Encaminhe as peças com problema antes de aprovar';end if;
 $guard$);execute f;
end $$;

alter function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) rename to acervo_movimentar_coleta;
revoke all on function public.acervo_movimentar_coleta(uuid,uuid,integer,text,text,numeric) from public,anon,authenticated;
create function public.acervo_movimentar(p_empresa uuid,p_id uuid,p_versao integer,p_destino text,p_motivo text,p_custo numeric default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para movimentar o acervo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where id=p_id and empresa_id=p_empresa for update;
 if r.origem<>'inventario' then return acervo_movimentar_coleta(p_empresa,p_id,p_versao,p_destino,p_motivo,p_custo);end if;
 if p_custo is null or p_custo<>round(p_custo,2) then raise exception 'Confira o custo com até duas casas decimais';end if;
 if r.os_id is not null and p_destino in ('inspecao','liberado','baixado') and not exists(select 1 from acervo_os where id::text=r.os_id and empresa_id=p_empresa and status='concluida') then raise exception 'Conclua a O.S antes da inspeção';end if;
 return acervo_movimentar_antes_recebimento(p_empresa,p_id,p_versao,p_destino,p_motivo,p_custo);
end $$;
revoke all on function public.acervo_ordens(uuid),public.acervo_os_criar(uuid,uuid,integer,text,date,text),public.acervo_os_atualizar(uuid,uuid,integer,text,text,date,text,text),public.acervo_inventario_conferir(uuid,uuid,uuid,integer,numeric,text,jsonb,jsonb),public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) from public,anon;
grant execute on function public.acervo_ordens(uuid),public.acervo_os_criar(uuid,uuid,integer,text,date,text),public.acervo_os_atualizar(uuid,uuid,integer,text,text,date,text,text),public.acervo_inventario_conferir(uuid,uuid,uuid,integer,numeric,text,jsonb,jsonb),public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) to authenticated;
notify pgrst,'reload schema';
