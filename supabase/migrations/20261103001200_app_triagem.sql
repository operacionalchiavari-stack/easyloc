-- App de Triagem: usa a sessão do sistema e as mesmas regras da Triagem do portal.
create table public.triagem_app_leituras (
 id uuid primary key, empresa_id uuid not null references public.empresas(id),
 pedido_id uuid not null references public.separacoes_pedidos(id), usuario_id uuid not null,
 codigo text not null, chave text not null, criado_em timestamptz not null default now()
);
alter table public.triagem_app_leituras enable row level security;
revoke all on public.triagem_app_leituras from public,anon,authenticated;

create function public.triagem_app_base(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos; itens jsonb; meus jsonb; fluxo text; bloqueio text; pagamento jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','select') then raise exception 'Sem acesso à Triagem';end if;
 if not seguranca_2fa_ok() then raise exception 'Confirme a verificação em duas etapas para continuar';end if;
 if p_etapa not in('ida','volta') then raise exception 'Etapa inválida';end if;
 fluxo:=pedido_fluxo_etapa(p);
 meus:=separacao_meus_setores(p.empresa_id);
 if p_etapa='ida' then
  if fluxo<>'triagem' then bloqueio:='Este pedido não está na etapa de separação.';end if;
  if p.modo_separacao is not null and p.modo_separacao<>'qr' then bloqueio:='Este pedido já começou em outro modo. Continue a separação na Triagem do sistema.';end if;
  pagamento:=pedido_pagamento_situacao(p.id,'triagem');
  if pagamento->>'liberada'='false' then bloqueio:=coalesce(pagamento->>'mensagem','Aguardando liberação financeira');end if;
  if not coalesce((separacao_modos_disponiveis(p.empresa_id)->>'qr')::boolean,false) then bloqueio:='A leitura QR não está liberada para este usuário. Consulte os parâmetros da Triagem.';end if;
 else
  if fluxo not in('triagem_retorno','retorno_simultaneo') and p.operacao->'retorno'->>'concluido_em' is null then bloqueio:='Aguarde a coleta e a liberação da Triagem da volta.';end if;
  if p.pedido_origem_id is not null then bloqueio:='Confira este retorno junto com o pedido principal.';end if;
 end if;
 with pecas as (
  select pc.*,i.codigo,i.referencia,i.qr_code,i.foto_url,i.setor_estoque,si.item_id item_origem,si.quantidade_separada,si.tipo_controle,
   si.componentes,coalesce(si.patrimonios_lidos,'{}') patrimonios_lidos,
   coalesce(pr.unidades,0)*coalesce(pc.por_kit,1) producao,
   coalesce(pr.prontas,0)*coalesce(pc.por_kit,1) prontas,
   coalesce(pr.confirmadas,0)*coalesce(pc.por_kit,1) confirmadas
  from operacao_conferencia_pecas(p.id,p_etapa='volta') pc
  join separacoes_itens si on si.id=pc.linha
  left join itens i on i.id=pc.item_id and i.empresa_id=p.empresa_id
  left join lateral separacao_producao_calc(pc.pedido_id) pr on pr.item_id=si.item_id
  where p_etapa='volta' or meus is null or meus ? separacao_setor_item(pc.item_id)
 ), dados as (
  select x.*,
   case when x.item_origem=x.item_id then coalesce(x.quantidade_separada,0) else coalesce((x.componentes->x.item_id::text->>'separado')::numeric,0) end separado,
   case when p_etapa='ida' then x.esperado else coalesce(
    (select (v->>'conferido')::numeric from separacoes_pedidos origem,jsonb_array_elements(coalesce(origem.operacao->'carregamento'->'itens','[]')) v where origem.id=x.pedido_id and v->>'chave'=x.chave),
    (select count(*) filter(where e.lida_carregamento_em is not null) from separacoes_etiquetas e where e.separacao_item_id=x.linha and e.item_id=x.item_id having count(*)>0),x.esperado) end total
  from pecas x
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'chave',x.chave,'linha',x.linha,'item_id',x.item_id,'pedido_id',x.pedido_id,'pedido_numero',x.pedido_numero,
  'nome',x.nome,'codigo',x.codigo,'referencia',x.referencia,'qr_code',x.qr_code,'foto',x.foto_url,'kit',x.kit_nome,'por_kit',x.por_kit,
  'controle',case when x.item_id=x.item_origem then coalesce(x.tipo_controle,'quantidade') else 'quantidade' end,
  'setor',coalesce(x.setor_estoque,'Sem setor'),'esperado',x.total,'separado',x.separado,
  'necessario',greatest(x.total-x.producao,0),'producao',x.producao,'prontas',x.prontas,'confirmadas',x.confirmadas,
  'item_origem',x.item_origem) order by x.nome,x.chave),'[]') into itens from dados x;
 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero',p.numero_pedido,'cliente',p.cliente_nome,'local',p.local_nome,
  'data',case when p_etapa='ida' then coalesce(p.data_entrega,p.data_evento) else coalesce(p.data_coleta,p.data_evento) end,
  'foto',(select catalogo_logo_url from clientes_empresas where id=p.cliente_id and empresa_id=p.empresa_id)),
  'etapa',p_etapa,'bloqueio',bloqueio,'itens',itens,
  'token',md5(p.id::text||coalesce(p.revisao,0)::text||coalesce(p.operacao,'{}')::text||itens::text),
  'concluido',case when p_etapa='ida' then p.status in('separado','separado_com_divergencia') else p.operacao->'retorno'->>'concluido_em' is not null end,
  'registro',case when p_etapa='volta' then p.operacao->'retorno' end,
  'avarias',case when p_etapa='volta' then operacao_avarias_pedido(p.id) else '[]'::jsonb end,
  'pode_editar',funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','editar') and funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar'));
end $$;

create function public.triagem_app_ler(p_pedido uuid,p_etapa text,p_codigo text,p_chave text default null,p_operacao uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;b jsonb;cod text:=btrim(p_codigo);tipo text:='';en separacoes_etiquetas;
 pat itens_patrimonios;achados jsonb;c jsonb;i separacoes_itens;comp jsonb;reg jsonb;q numeric;nova numeric;
 dados jsonb;patr text[];id_etiqueta uuid;anterior triagem_app_leituras;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 b:=triagem_app_base(p.id,p_etapa);
 if not coalesce((b->>'pode_editar')::boolean,false) then raise exception 'Sem permissão para conferir materiais';end if;
 if b->>'bloqueio' is not null then raise exception '%',b->>'bloqueio';end if;
 if coalesce((b->>'concluido')::boolean,false) then raise exception 'Esta conferência já foi concluída';end if;
 if cod is null or length(cod) not between 1 and 200 then raise exception 'Leia ou digite um código válido';end if;
 if p_etapa='ida' and p_operacao is not null then
  select * into anterior from triagem_app_leituras where id=p_operacao;
  if anterior.id is not null then
   if anterior.usuario_id<>auth.uid() or anterior.pedido_id<>p.id or anterior.codigo<>p_codigo or anterior.chave<>coalesce(p_chave,anterior.chave) then raise exception 'Identificador de leitura já utilizado';end if;
   return jsonb_build_object('base',b,'repetida',true);
  end if;
 end if;
 if cod ~* '^ACERVO:(ITEM|ENV|PAT):' then tipo:=upper(split_part(cod,':',2));cod:=regexp_replace(cod,'^ACERVO:(ITEM|ENV|PAT):','','i');end if;
 if tipo in('','ENV') then
  select * into en from separacoes_etiquetas where empresa_id=p.empresa_id and upper(codigo)=upper(cod) limit 1;
 end if;
 if en.id is not null then
  tipo:='ENV';
  cod:=en.codigo;
  if en.separacao_pedido_id<>all(case when p_etapa='volta' then pedido_grupo(p.id) else array[p.id] end) then raise exception 'Esta etiqueta pertence a outro pedido';end if;
  select coalesce(jsonb_agg(x),'[]') into achados from jsonb_array_elements(b->'itens') x where x->>'linha'=en.separacao_item_id::text and x->>'item_id'=en.item_id::text;
 elsif tipo='ENV' then raise exception 'Etiqueta de envio não encontrada';
 else
  if tipo in('','PAT') then select * into pat from itens_patrimonios where empresa_id=p.empresa_id and upper(codigo_patrimonio)=upper(cod) limit 1;end if;
  if pat.id is not null then tipo:='PAT';
   cod:=pat.codigo_patrimonio;
   select coalesce(jsonb_agg(x),'[]') into achados from jsonb_array_elements(b->'itens') x where x->>'item_id'=pat.item_id::text;
  elsif tipo='PAT' then raise exception 'Patrimônio não encontrado';
  else tipo:='ITEM';select coalesce(jsonb_agg(x),'[]') into achados from jsonb_array_elements(b->'itens') x where upper(coalesce(x->>'codigo',''))=upper(cod) or upper(coalesce(x->>'referencia',''))=upper(cod) or upper(coalesce(x->>'qr_code',''))=upper(cod) or lower(x->>'item_id')=lower(cod);end if;
 end if;
 if jsonb_array_length(achados)=0 then raise exception 'O item não pertence a este pedido ou ao seu setor';end if;
 if p_chave is null and jsonb_array_length(achados)>1 then return jsonb_build_object('escolher',achados,'tipo',tipo,'codigo',cod);end if;
 select x into c from jsonb_array_elements(achados) x where p_chave is null or x->>'chave'=p_chave limit 1;
 if c is null then raise exception 'Escolha uma linha válida para este código';end if;
 if p_etapa='volta' then return jsonb_build_object('chave',c->>'chave','tipo',tipo,'codigo',cod,'unico',tipo in('ENV','PAT'));end if;
 if p_operacao is null then raise exception 'Informe o identificador da leitura';end if;
 if c->>'controle'='patrimonio' and tipo='ITEM' then raise exception 'Este material exige o QR individual do patrimônio';end if;
 perform separacao_definir_modo(p.id,'qr');
 select * into strict i from separacoes_itens where id=(c->>'linha')::uuid for update;
 if tipo='ENV' then
  if en.lida_separacao_em is not null then raise exception 'Esta etiqueta já foi conferida';end if;
  id_etiqueta:=en.id;
 end if;
 nova:=(c->>'separado')::numeric+1;
 if nova>(c->>'necessario')::numeric then raise exception 'A quantidade deste item já está completa';end if;
 dados:=jsonb_build_object('modo_separacao','qr');
 if i.item_id=(c->>'item_id')::uuid then
  patr:=coalesce(i.patrimonios_lidos,'{}');
  if tipo='PAT' then
   if pat.codigo_patrimonio=any(patr) then raise exception 'Este patrimônio já foi conferido';end if;
   dados:=dados||jsonb_build_object('patrimonios_lidos',to_jsonb(array_append(patr,pat.codigo_patrimonio)));
  end if;
  dados:=dados||jsonb_build_object('quantidade_separada',nova,'status',case when nova>=(c->>'necessario')::numeric then 'concluido' else 'em_andamento' end);
 else
  comp:=coalesce(i.componentes,'{}');reg:=coalesce(comp->(c->>'item_id'),'{}');
  if tipo='PAT' then
   if coalesce(reg->'patrimonios','[]') ? pat.codigo_patrimonio then raise exception 'Este patrimônio já foi conferido';end if;
   reg:=reg||jsonb_build_object('patrimonios',coalesce(reg->'patrimonios','[]')||to_jsonb(pat.codigo_patrimonio));
  end if;
  comp:=jsonb_set(comp,array[c->>'item_id'],reg||jsonb_build_object('separado',nova));
  select coalesce(min(floor(coalesce((comp->k.item_id::text->>'separado')::numeric,0)/nullif(k.quantidade,0))),0) into q from kit_itens k where k.kit_id=i.item_id and k.empresa_id=p.empresa_id;
  dados:=dados||jsonb_build_object('componentes',comp,'quantidade_separada',q,'status',case when q>=i.quantidade_solicitada then 'concluido' else 'em_andamento' end);
 end if;
 insert into triagem_app_leituras(id,empresa_id,pedido_id,usuario_id,codigo,chave) values(p_operacao,p.empresa_id,p.id,auth.uid(),p_codigo,c->>'chave');
 perform operacao_atualizar_separacao(i.id,dados,i.quantidade_separada,coalesce(i.componentes,'{}'),id_etiqueta);
 insert into separacoes_leituras(empresa_id,separacao_pedido_id,separacao_item_id,item_id,codigo_lido,tipo_controle,usuario_id,usuario_nome,status_leitura,observacao,item_nome)
 values(p.empresa_id,p.id,i.id,(c->>'item_id')::uuid,cod,case tipo when 'PAT' then 'patrimonio' when 'ENV' then 'etiqueta' else 'quantidade' end,auth.uid(),coalesce(auth.jwt()->>'email','Equipe'),'sucesso','App da Triagem',c->>'nome');
 return jsonb_build_object('base',triagem_app_base(p.id,'ida'),'chave',c->>'chave','tipo',tipo,'codigo',cod);
end $$;

create function public.triagem_app_finalizar(p_pedido uuid,p_etapa text,p_token text,p_quantidades jsonb default '{}',p_primeira jsonb default null,p_danificados jsonb default '{}',p_fotos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
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
  registro:=operacao_concluir_retorno_avarias(p.id,'retorno',true,p_quantidades,'{}',p_primeira,p_danificados,p_fotos);
 end if;
 return triagem_app_base(p.id,p_etapa);
end $$;
revoke all on function public.triagem_app_base(uuid,text),public.triagem_app_ler(uuid,text,text,text,uuid),public.triagem_app_finalizar(uuid,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.triagem_app_base(uuid,text),public.triagem_app_ler(uuid,text,text,text,uuid),public.triagem_app_finalizar(uuid,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
