begin;
create table public.logistica_frete_conferencias (
 empresa_id uuid not null references public.empresas(id), chave text not null,
 pedido_id uuid references public.separacoes_pedidos(id), data date not null, direcao text,
 caminhao_id uuid references public.caminhoes(id), lancamento_id uuid references public.frete_lancamentos(id), viagem_id uuid references public.frete_viagens(id),
 valor_final numeric(15,2) check(valor_final>=0), motivo text not null,
 decidido_por uuid not null, decidido_nome text not null, decidido_em timestamptz not null default now(),
 contexto jsonb not null, primary key(empresa_id,chave)
);
create unique index log_frete_conferencia_lanc on public.logistica_frete_conferencias(lancamento_id) where lancamento_id is not null;
create unique index log_frete_conferencia_viagem on public.logistica_frete_conferencias(viagem_id) where viagem_id is not null;
create unique index log_frete_conferencia_cam on public.logistica_frete_conferencias(empresa_id,pedido_id,data,direcao,caminhao_id)
 where caminhao_id is not null and pedido_id is not null and coalesce(valor_final,1)>0;
alter table public.logistica_frete_conferencias enable row level security;
revoke all on public.logistica_frete_conferencias from public,anon,authenticated;
create table public.logistica_frete_conferencia_historico (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 chave text not null, antes jsonb, depois jsonb not null, criado_em timestamptz not null default now()
);
alter table public.logistica_frete_conferencia_historico enable row level security;
revoke all on public.logistica_frete_conferencia_historico from public,anon,authenticated;

create function public.logistica_frete_caminhao(p_empresa uuid,p_caminhao uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',k.id,'codigo',k.codigo,'modelo',k.modelo,'placa',k.placa,'foto',k.foto_url,
   'nome',concat_ws(' · ',nullif(k.codigo,''),nullif(k.modelo,''),nullif(k.placa,'')),
   'fornecedor_id',coalesce(k.fornecedor_id,f.fornecedor_id),'freteiro_id',k.freteiro_id,
   'transportadora',coalesce(nullif(fo.nome_fantasia,''),nullif(fo.nome_razao_social,''),nullif(k.empresa_nome,''),f.nome,'Transportadora não informada'))
 from caminhoes k left join frete_freteiros f on f.id=k.freteiro_id and f.empresa_id=p_empresa
 left join fornecedores fo on fo.id=coalesce(k.fornecedor_id,f.fornecedor_id) and fo.empresa_id=p_empresa
 where k.id=p_caminhao and k.empresa_id=p_empresa
$$;
revoke all on function public.logistica_frete_caminhao(uuid,uuid) from public,anon,authenticated;

-- Mesma régua de categoria/km usada em frete_sincronizar, inclusive antes do envio do portal.
create function public.logistica_frete_valor_sistema(p_empresa uuid,p_pedido uuid,p_caminhao uuid,p_direcao text) returns numeric
language sql stable security definer set search_path=public as $$
 select coalesce((select v.valor_sistema from frete_viagens v where v.empresa_id=p_empresa and v.pedido_id=p_pedido
   and v.caminhao_id=p_caminhao and v.direcao=p_direcao and not v.extra order by v.created_at desc limit 1),
  (select round(cc.valor_km*nullif(p.observacoes->'logistica_snapshot'->>'km','')::numeric/2,2)
   from separacoes_pedidos p join caminhoes c on c.id=p_caminhao and c.empresa_id=p_empresa
   join lateral(select cat.valor_km from categorias_caminhao cat where cat.empresa_id=p_empresa and coalesce(cat.ativo,true)
    and ((coalesce(c.capacidade_m3,0)>0 and c.capacidade_m3>coalesce(cat.volume_minimo,0) and c.capacidade_m3<=coalesce(cat.volume_maximo,0))
     or (coalesce(c.capacidade_m3,0)=0 and upper(btrim(cat.nome)) in (upper(btrim(coalesce(c.categoria,''))),upper(btrim(coalesce(c.codigo,''))))))
    order by cat.ordem nulls last,cat.volume_maximo limit 1) cc on true
   where p.id=p_pedido and p.empresa_id=p_empresa))
$$;
revoke all on function public.logistica_frete_valor_sistema(uuid,uuid,uuid,text) from public,anon,authenticated;

create function public.logistica_frete_cobrancas_portal(p_empresa uuid,p_pedido uuid,p_data date,p_direcao text) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('tipo','viagem','id',v.id,'fornecedor_id',v.fornecedor_id,
  'fornecedor',coalesce(nullif(f.nome_fantasia,''),f.nome_razao_social,v.fornecedor_nome),
  'valor',v.valor_transportadora,'valor_final',v.valor_final,'enviado',true,'situacao',v.status,
  'pagar_id',v.fechamento_id,'caminhao_id',v.caminhao_id,'caminhao',coalesce(logistica_frete_caminhao(p_empresa,v.caminhao_id)->>'nome',v.caminhao_codigo),
  'origem_lanc','freteiro','observacao',v.transp_obs,'decisao_motivo',v.obs,'atualizado_em',v.updated_at) order by v.created_at,v.id),'[]')
 from frete_viagens v left join fornecedores f on f.id=v.fornecedor_id and f.empresa_id=p_empresa
 where v.empresa_id=p_empresa and v.pedido_id=p_pedido and v.data=p_data and v.direcao=p_direcao and v.transp_enviado_em is not null
$$;
revoke all on function public.logistica_frete_cobrancas_portal(uuid,uuid,date,text) from public,anon,authenticated;

create function public.logistica_frete_cobrancas(p_empresa uuid,p_pedido uuid,p_avulso uuid,p_data date,p_direcao text) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('tipo','lancamento','id',l.id,'freteiro_id',l.freteiro_id,'fornecedor_id',f.fornecedor_id,
   'fornecedor',coalesce(nullif(fo.nome_fantasia,''),fo.nome_razao_social,f.nome),'anuncio_id',l.anuncio_id,
   'valor',case when l.origem_lanc='freteiro' then frete_lanc_total(l) end,'valor_final',l.valor_final,
   'enviado',l.relatorio_id is not null,'situacao',l.situacao,'pagar_id',l.pagar_id,
   'explicacao',l.explicacao,'observacao',l.observacao,'decisao_motivo',l.decisao_motivo,'decisao_em',l.decisao_em,
   'caminhao',l.caminhao,'placa',v.placa,'origem_lanc',l.origem_lanc,'atualizado_em',l.updated_at,
   'caminhao_id',coalesce((select k.id from caminhoes k where k.empresa_id=p_empresa and k.freteiro_id=f.id
      and nullif(regexp_replace(upper(k.placa),'[^A-Z0-9]','','g'),'')=nullif(regexp_replace(upper(v.placa),'[^A-Z0-9]','','g'),'') limit 1),
      case when l.veiculo_id is null then f.caminhao_id end)) order by l.created_at,l.id),'[]')
   ||case when p_avulso is null then logistica_frete_cobrancas_portal(p_empresa,p_pedido,p_data,p_direcao) else '[]' end
 from frete_lancamentos l join frete_freteiros f on f.id=l.freteiro_id and f.empresa_id=p_empresa
 left join fornecedores fo on fo.id=f.fornecedor_id and fo.empresa_id=p_empresa
 left join frete_veiculos v on v.id=l.veiculo_id and v.freteiro_id=f.id and v.empresa_id=p_empresa
 where l.empresa_id=p_empresa and l.data=p_data
   and ((p_avulso is not null and l.avulso_id=p_avulso) or
     (p_avulso is null and l.avulso_id is null and l.pedido_id is not distinct from p_pedido and l.direcao is not distinct from p_direcao))
$$;
revoke all on function public.logistica_frete_cobrancas(uuid,uuid,uuid,date,text) from public,anon,authenticated;

create or replace function public.logistica_fretes_anunciados(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare servicos jsonb; resultado jsonb:='[]'; s jsonb; l jsonb; linhas jsonb; cargas jsonb; cobrancas jsonb;
 cam uuid; dir text; fr uuid; v_chave text; programado jsonb; conf jsonb; cobranca jsonb; usados uuid[]:='{}'; x record; av uuid;
begin
 perform logistica_servicos_autorizar(p_empresa);
 if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido';end if;
 servicos:=logistica_anunciados(p_empresa,'frete',p_inicio,p_fim)||logistica_anunciados_transportadoras(p_empresa,p_inicio,p_fim);
 -- Solicitações internas usam a mesma conferência e os mesmos três valores.
 for x in select a.*,f.nome,f.caminhao_id from frete_avulsos a join frete_freteiros f on f.id=a.freteiro_id and f.empresa_id=p_empresa
   where a.empresa_id=p_empresa and a.data between p_inicio and p_fim and a.cancelado_em is null loop
  servicos:=servicos||jsonb_build_array(jsonb_build_object('id',null,'avulso_id',x.id,'pedido_id',null,'solicitacao_interna',true,
    'solicitacao_motivo',x.motivo,'cliente',x.motivo,'local',x.destino,'ponto',x.origem,'data',x.data,'etapa','Solicitação interna','direcao','avulso',
    'quantidade',1,'valor',x.valor,'linhas',jsonb_build_array(jsonb_build_object('nome',x.nome,'confirmado',true,'situacao','escalado',
      'caminhao_id',x.caminhao_id,'freteiro_id',x.freteiro_id))));
 end loop;
 for s in select value from jsonb_array_elements(servicos) loop
  cam:=null;fr:=null;av:=(s->>'avulso_id')::uuid;
  if av is not null then dir:='avulso';
  elsif coalesce((s->>'transportadora')::boolean,false) then dir:=case when s->>'etapa' like 'Coleta%' then 'coleta' else 'entrega' end;
  else
   select f.caminhao_id,a.direcao,f.id into cam,dir,fr from frete_anuncios a
    left join frete_freteiros f on f.id=a.freteiro_id and f.empresa_id=p_empresa where a.id=(s->>'id')::uuid and a.empresa_id=p_empresa;
  end if;
  cargas:='[]';
  if dir='entrega' then
   select coalesce(jsonb_agg(logistica_frete_caminhao(p_empresa,k.id)||jsonb_build_object('em',c->>'em',
    'expedidor',coalesce((select fa.nome from funcionarios_acesso fa where fa.empresa_id=p_empresa and fa.id::text=c->>'por' limit 1),(select u.nome from usuarios u where u.id::text=c->>'por'),'Equipe')) order by c->>'em',k.id),'[]') into cargas
   from separacoes_pedidos p cross join lateral jsonb_array_elements(coalesce(p.operacao->'carga_por_veiculo','[]')) c
   join caminhoes k on k.id::text=c->>'caminhao_id' and k.empresa_id=p_empresa
   where p.id=(s->>'pedido_id')::uuid and p.empresa_id=p_empresa;
  end if;
  cobrancas:=logistica_frete_cobrancas(p_empresa,(s->>'pedido_id')::uuid,av,(s->>'data')::date,dir);
  linhas:='[]';
  for l in select value from jsonb_array_elements(s->'linhas') loop
   programado:=logistica_frete_caminhao(p_empresa,coalesce((l->>'caminhao_id')::uuid,cam));
   v_chave:=case when av is not null then 'avulso:'||av when s->>'id' is not null then 'anuncio:'||(s->>'id')
    else 'escala:'||(s->>'pedido_id')||':'||dir||':'||(l->>'caminhao_id') end;
   select to_jsonb(c)-'contexto'||jsonb_build_object('caminhao',coalesce(c.contexto->'caminhao_escolhido',logistica_frete_caminhao(p_empresa,c.caminhao_id))) into conf from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave=v_chave;
   select c into cobranca from jsonb_array_elements(cobrancas) c where not((c->>'id')::uuid=any(usados))
    and not exists(select 1 from logistica_frete_conferencias dc where dc.empresa_id=p_empresa and dc.chave<>v_chave
      and coalesce(dc.lancamento_id,dc.viagem_id)=(c->>'id')::uuid)
    and case
      when coalesce(conf->>'lancamento_id',conf->>'viagem_id') is not null then c->>'id'=coalesce(conf->>'lancamento_id',conf->>'viagem_id')
      when conf->>'caminhao_id' is not null then c->>'caminhao_id'=conf->>'caminhao_id'
      else c->>'anuncio_id'=s->>'id' or
        (c->>'tipo'='viagem' and c->>'caminhao_id'=programado->>'id') or
        (c->>'freteiro_id'=coalesce(l->>'freteiro_id',fr::text) and (c->>'caminhao_id'=programado->>'id' or c->>'caminhao_id' is null))
    end
    order by (c->>'id'=coalesce(conf->>'lancamento_id',conf->>'viagem_id')) desc nulls last,(c->>'enviado')::boolean desc,c->>'atualizado_em' desc limit 1;
   if cobranca is not null then usados:=array_append(usados,(cobranca->>'id')::uuid);end if;
   l:=l||jsonb_build_object('chave',v_chave,'programado',programado,'carregamentos',cargas,'cobrancas',cobrancas,'cobranca',cobranca,
     'nome',coalesce(programado->>'transportadora',l->>'nome'),'foto',coalesce(programado->>'foto',l->>'foto'),
     'detalhe',coalesce(programado->>'nome',l->>'detalhe'),
     'valor_sistema',coalesce((s->>'valor')::numeric,logistica_frete_valor_sistema(p_empresa,(s->>'pedido_id')::uuid,(programado->>'id')::uuid,dir)));
   l:=l||jsonb_build_object('versao',md5(l::text||coalesce(conf::text,'')),'conferencia',conf);
   linhas:=linhas||jsonb_build_array(l);
  end loop;
  resultado:=resultado||jsonb_build_array(s||jsonb_build_object('direcao',dir,'linhas',linhas));
 end loop;
 -- Cobranças extras não desaparecem ao retirar fretes da aba de divergências.
 for x in select l.*,p.numero_pedido,p.cliente_nome,p.local_nome from frete_lancamentos l
   left join separacoes_pedidos p on p.id=l.pedido_id and p.empresa_id=p_empresa
   where l.empresa_id=p_empresa and l.data between p_inicio and p_fim and not(l.id=any(usados)) loop
  v_chave:='lancamento:'||x.id;
  cobrancas:=logistica_frete_cobrancas(p_empresa,x.pedido_id,x.avulso_id,x.data,x.direcao);
  select c into cobranca from jsonb_array_elements(cobrancas) c where c->>'id'=x.id::text;
  if cobranca is null then continue;end if;
  cargas:='[]';
  if x.direcao='entrega' then
   select coalesce(jsonb_agg(logistica_frete_caminhao(p_empresa,k.id)||jsonb_build_object('em',c->>'em')),'[]') into cargas
   from separacoes_pedidos p cross join lateral jsonb_array_elements(coalesce(p.operacao->'carga_por_veiculo','[]')) c
   join caminhoes k on k.id::text=c->>'caminhao_id' and k.empresa_id=p_empresa where p.id=x.pedido_id and p.empresa_id=p_empresa;
  end if;
  select to_jsonb(c)-'contexto'||jsonb_build_object('caminhao',coalesce(c.contexto->'caminhao_escolhido',logistica_frete_caminhao(p_empresa,c.caminhao_id))) into conf from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave=v_chave;
  l:=jsonb_build_object('chave',v_chave,'nome',cobranca->>'fornecedor','detalhe',x.caminhao,'confirmado',true,'situacao','cobrado',
    'programado',null,'carregamentos',cargas,'cobrancas',jsonb_build_array(cobranca),'cobranca',cobranca);
  l:=l||jsonb_build_object('versao',md5(l::text||coalesce(conf::text,'')),'conferencia',conf);
  resultado:=resultado||jsonb_build_array(jsonb_build_object('id',null,'pedido_id',x.pedido_id,'pedido',x.numero_pedido,
   'cliente',x.cliente_nome,'local',coalesce(x.local_nome,x.destino),'data',x.data,'direcao',x.direcao,'etapa','Cobrança · '||coalesce(x.direcao,'Legado'),
   'quantidade',1,'valor',x.valor_sistema,'avulso_id',x.avulso_id,'solicitacao_interna',x.avulso_id is not null,'linhas',jsonb_build_array(l)));
 end loop;
 for x in select v.*,p.numero_pedido,p.cliente_nome,p.local_nome from frete_viagens v
   left join separacoes_pedidos p on p.id=v.pedido_id and p.empresa_id=p_empresa
   where v.empresa_id=p_empresa and v.data between p_inicio and p_fim and v.transp_enviado_em is not null and not(v.id=any(usados)) loop
  v_chave:='viagem:'||x.id;
  cobrancas:=logistica_frete_cobrancas_portal(p_empresa,x.pedido_id,x.data,x.direcao);
  select c into cobranca from jsonb_array_elements(cobrancas) c where c->>'id'=x.id::text;
  cargas:='[]';
  if x.direcao='entrega' then
   select coalesce(jsonb_agg(logistica_frete_caminhao(p_empresa,k.id)||jsonb_build_object('em',c->>'em')),'[]') into cargas
   from separacoes_pedidos p cross join lateral jsonb_array_elements(coalesce(p.operacao->'carga_por_veiculo','[]')) c
   join caminhoes k on k.id::text=c->>'caminhao_id' and k.empresa_id=p_empresa where p.id=x.pedido_id and p.empresa_id=p_empresa;
  end if;
  select to_jsonb(c)-'contexto'||jsonb_build_object('caminhao',coalesce(c.contexto->'caminhao_escolhido',logistica_frete_caminhao(p_empresa,c.caminhao_id))) into conf from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave=v_chave;
  l:=jsonb_build_object('chave',v_chave,'nome',cobranca->>'fornecedor','detalhe',cobranca->>'caminhao','confirmado',true,'situacao','cobrado',
   'programado',null,'carregamentos',cargas,'cobrancas',jsonb_build_array(cobranca),'cobranca',cobranca,'valor_sistema',x.valor_sistema);
  l:=l||jsonb_build_object('versao',md5(l::text||coalesce(conf::text,'')),'conferencia',conf);
  resultado:=resultado||jsonb_build_array(jsonb_build_object('id',null,'pedido_id',x.pedido_id,'pedido',x.numero_pedido,
   'cliente',x.cliente_nome,'local',coalesce(x.local_nome,x.destino),'data',x.data,'direcao',x.direcao,'etapa','Cobrança · '||x.direcao,
   'quantidade',1,'valor',x.valor_sistema,'linhas',jsonb_build_array(l)));
 end loop;
 return coalesce((select jsonb_agg(rj order by rj->>'data',rj->>'hora') from jsonb_array_elements(resultado) rj),'[]');
end $$;

create function public.logistica_frete_conferir(p_empresa uuid,p_chave text,p_data date,p_versao text,p_caminhao uuid,p_lancamento uuid,p_valor numeric,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare s jsonb; linha jsonb; cam jsonb; cob jsonb; anterior jsonb; salvo jsonb; l frete_lancamentos; viagem frete_viagens; v_valor numeric;
begin
 perform logistica_servicos_autorizar(p_empresa,true);
 if length(btrim(coalesce(p_motivo,''))) not between 3 and 2000 then raise exception 'Informe o motivo da decisão (3 a 2000 caracteres)';end if;
 -- Serializa decisões do mesmo evento, inclusive de usuários diferentes.
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 perform 1 from frete_lancamentos where id=p_lancamento and empresa_id=p_empresa for update;
 perform 1 from frete_viagens where id=p_lancamento and empresa_id=p_empresa for update;
 select serv,lin into s,linha from jsonb_array_elements(logistica_fretes_anunciados(p_empresa,p_data,p_data)) serv,
  lateral jsonb_array_elements(serv->'linhas') lin where lin->>'chave'=p_chave;
 perform 1 from separacoes_pedidos where id=(s->>'pedido_id')::uuid and empresa_id=p_empresa for share;
 select serv,lin into s,linha from jsonb_array_elements(logistica_fretes_anunciados(p_empresa,p_data,p_data)) serv,
  lateral jsonb_array_elements(serv->'linhas') lin where lin->>'chave'=p_chave;
 if linha is null or linha->>'versao' is distinct from p_versao then raise exception 'Os dados mudaram. Atualize a tela antes de decidir';end if;
 select to_jsonb(c) into anterior from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave=p_chave for update;
 if p_valor is not null and (p_valor::text in ('NaN','Infinity','-Infinity') or p_valor<0 or p_valor>9999999999999.99) then raise exception 'Valor final inválido';end if;
 v_valor:=round(p_valor,2);
 if p_caminhao is not null then
  select c into cam from jsonb_array_elements(coalesce(linha->'carregamentos','[]')||
    case when linha->'programado' is not null and linha->'programado'<>'null' then jsonb_build_array(linha->'programado') else '[]' end) c where c->>'id'=p_caminhao::text limit 1;
  if cam is null then raise exception 'Escolha o caminhão programado ou um caminhão registrado pela Expedição';end if;
 elsif coalesce(v_valor,1)>0 and s->>'avulso_id' is null then raise exception 'Escolha qual caminhão vale para este frete';end if;
 if p_lancamento is not null then
  select c into cob from jsonb_array_elements(linha->'cobrancas') c where c->>'id'=p_lancamento::text;
  if cob is null then raise exception 'Cobrança não pertence a este frete';end if;
  if cob->>'tipo'='viagem' then
   select * into viagem from frete_viagens where id=p_lancamento and empresa_id=p_empresa for update;
   if viagem.transp_enviado_em is null then raise exception 'Aguarde o fornecedor enviar o relatório';end if;
   if viagem.status='fechado' or viagem.fechamento_id is not null then raise exception 'Este frete já foi enviado ao Financeiro';end if;
  else
   select * into l from frete_lancamentos where id=p_lancamento and empresa_id=p_empresa for update;
   if l.relatorio_id is null then raise exception 'Aguarde o fornecedor enviar o relatório';end if;
   if l.pagar_id is not null or exists(select 1 from frete_relatorios r where r.id=l.relatorio_id and r.status='no_financeiro') then raise exception 'Este frete já foi enviado ao Financeiro';end if;
  end if;
  if coalesce(v_valor,1)>0 and cam is not null and (cam->>'fornecedor_id' is null or cam->>'fornecedor_id' is distinct from cob->>'fornecedor_id') then
    raise exception 'A cobrança deve ser do fornecedor do caminhão escolhido';end if;
  if coalesce(v_valor,1)>0 and p_caminhao is not null and cob->>'caminhao_id' is not null and cob->>'caminhao_id' is distinct from p_caminhao::text then
    raise exception 'A cobrança foi enviada para outro caminhão';end if;
 elsif v_valor is not null then raise exception 'Escolha uma cobrança enviada antes de definir o valor final';end if;
 if coalesce(anterior->>'lancamento_id',anterior->>'viagem_id') is not null and coalesce(anterior->>'lancamento_id',anterior->>'viagem_id') is distinct from p_lancamento::text then raise exception 'Esta decisão já está vinculada a uma cobrança';end if;
 if exists(select 1 from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave<>p_chave and (c.lancamento_id=p_lancamento or c.viagem_id=p_lancamento)) then raise exception 'Esta cobrança já foi conferida em outra linha';end if;
 if coalesce(v_valor,1)>0 and exists(select 1 from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave<>p_chave
   and c.pedido_id=(s->>'pedido_id')::uuid and c.data=p_data and c.direcao=s->>'direcao' and c.caminhao_id=p_caminhao and coalesce(c.valor_final,1)>0) then
   raise exception 'Este caminhão já foi escolhido em outra linha deste frete';end if;
 insert into logistica_frete_conferencias(empresa_id,chave,pedido_id,data,direcao,caminhao_id,lancamento_id,viagem_id,valor_final,motivo,decidido_por,decidido_nome,contexto)
 values(p_empresa,p_chave,(s->>'pedido_id')::uuid,p_data,s->>'direcao',p_caminhao,l.id,viagem.id,v_valor,btrim(p_motivo),auth.uid(),logistica_nome_usuario(p_empresa),(linha-'conferencia')||jsonb_build_object('caminhao_escolhido',cam))
 on conflict(empresa_id,chave) do update set caminhao_id=excluded.caminhao_id,lancamento_id=excluded.lancamento_id,viagem_id=excluded.viagem_id,valor_final=excluded.valor_final,
 motivo=excluded.motivo,decidido_por=excluded.decidido_por,decidido_nome=excluded.decidido_nome,decidido_em=now(),contexto=excluded.contexto;
 select to_jsonb(c) into salvo from logistica_frete_conferencias c where c.empresa_id=p_empresa and c.chave=p_chave;
 insert into logistica_frete_conferencia_historico(empresa_id,chave,antes,depois) values(p_empresa,p_chave,anterior,salvo);
 if l.id is not null and v_valor is not null then
  update frete_lancamentos set valor_final=v_valor,situacao=case when v_valor=0 then 'recusado' else 'corrigido' end,
   decisao_motivo=btrim(p_motivo),decisao_por=logistica_nome_usuario(p_empresa),decisao_em=now(),updated_at=now() where id=l.id;
  perform frete_relatorio_finalizar(l.relatorio_id);
 end if;
 if viagem.id is not null and v_valor is not null then
  update frete_viagens set valor_final=v_valor,obs=btrim(p_motivo),updated_at=now() where id=viagem.id;
 end if;
end $$;
revoke all on function public.logistica_frete_conferir(uuid,text,date,text,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.logistica_frete_conferir(uuid,text,date,text,uuid,uuid,numeric,text) to authenticated;
create or replace function public.frete_relatorio_finalizar_conferido(p_rel uuid) returns void language plpgsql security definer set search_path = public as $$
declare r frete_relatorios; f frete_freteiros; forn fornecedores; l record; v_pagar uuid; v_fech uuid; v_cat uuid; ped record; v_user uuid; v_ord int := 0; v_inf numeric;
  ref text; v_desc text;
begin
  select * into r from frete_relatorios where id = p_rel for update;
  if r.id is null or r.status <> 'enviado' then return; end if;
  if exists (select 1 from frete_lancamentos where relatorio_id = r.id and situacao = 'divergente') then return; end if;
  select * into f from frete_freteiros where id = r.freteiro_id;
  select * into forn from fornecedores where id = f.fornecedor_id;
  if forn.id is null then raise exception 'O freteiro não tem fornecedor ligado (aprove o cadastro de novo).'; end if;
  perform frete_fornecedor_fechamento(r.empresa_id, forn.id);
  v_cat := fin_categoria(r.empresa_id, 'fretes');
  v_user := coalesce(auth.uid(), (select user_id from usuarios_empresas where empresa_id = r.empresa_id order by created_at limit 1));
  ref := 'Fretes ' || to_char(r.periodo_ini, 'DD/MM') || ' a ' || to_char(r.periodo_fim, 'DD/MM/YYYY');
  select id into v_fech from fin_fechamentos where fornecedor_id = forn.id and empresa_id = r.empresa_id and status = 'em_conferencia' limit 1;
  if v_fech is null then
    insert into fin_fechamentos (empresa_id, fornecedor_id, referencia, arquivo_nome, valor_cobrado, observacoes)
    values (r.empresa_id, forn.id, ref, coalesce(r.arquivo_nome,'Relatório enviado pelo App do Freteiro'), r.total_informado, 'Conferido pelo sistema e pela Logística.')
    returning id into v_fech;
  else
    update fin_fechamentos set valor_cobrado = coalesce(valor_cobrado, 0) + r.total_informado, updated_at = now() where id = v_fech;
  end if;
  select coalesce(max(ordem), 0) into v_ord from fin_fechamento_linhas where fechamento_id = v_fech;
  for l in select q.*, frete_lanc_total(q) as informado from frete_lancamentos q where q.relatorio_id = r.id order by q.data, q.created_at loop
    v_ord := v_ord + 1; v_pagar := null; v_inf := case when l.origem_lanc = 'sistema' then 0 else l.informado end;
    select p.id, p.numero_pedido into ped from separacoes_pedidos p where p.id = coalesce((select x.pedido_id from frete_anuncios x where x.id = l.anuncio_id), l.pedido_id);
    v_desc := 'Frete ' || to_char(l.data, 'DD/MM') || ' · ' || coalesce(nullif(l.origem, '') || ' → ', '') || l.destino || coalesce(' · Pedido ' || ped.numero_pedido, '') || coalesce(' · Avulso: ' || (select av.motivo from frete_avulsos av where av.id = l.avulso_id), '');
    if l.situacao in ('ok','aceito','corrigido') and coalesce(l.valor_final, 0) > 0 then
      insert into fin_pagar (empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento,
                             valor, parcela, parcelas, categoria_id, forma, observacoes, criado_por)
      values (r.empresa_id, 'frete', l.id, gen_random_uuid(), forn.id, coalesce(nullif(forn.nome_fantasia, ''), forn.nome_razao_social), 'FT-' || to_char(l.data, 'DDMM'),
              v_desc, current_date, l.data, r.periodo_fim + 7, l.valor_final, 1, 1, v_cat, 'pix',
              case when l.situacao = 'ok' then 'Conferido pelo sistema.' else 'Divergência resolvida pela Logística: ' || coalesce(l.decisao_motivo, '') || coalesce(' (' || l.decisao_por || ')', '') end,
              v_user)
      returning id into v_pagar;
      update frete_lancamentos set pagar_id = v_pagar where id = l.id;
      if ped.id is not null and v_user is not null then
        insert into fin_custos_evento (empresa_id, pedido_id, categoria, descricao, valor, pagar_id, criado_por)
        values (r.empresa_id, ped.id, 'frete', v_desc || ' · ' || f.nome, l.valor_final, v_pagar, v_user);
      end if;
    end if;
    insert into fin_fechamento_linhas (empresa_id, fechamento_id, ordem, data, documento, descricao, valor, titulo_id, situacao, valor_anterior, motivo)
    values (r.empresa_id, v_fech, v_ord, l.data, 'FT-' || to_char(l.data, 'DDMM'),
            v_desc || case when l.origem_lanc = 'sistema' then ' (não lançado pelo freteiro)' else '' end,
            coalesce(case when v_pagar is not null then l.valor_final else v_inf end, 0), v_pagar,
            case when v_pagar is null then 'ignorada' when l.situacao = 'ok' or v_inf = l.valor_final then 'conferida' else 'ajustada' end,
            case when v_pagar is not null and l.situacao <> 'ok' and v_inf <> l.valor_final then v_inf end,
            case when l.situacao = 'ok' then null
                 else 'Divergência (' || case l.divergencia when 'valor' then 'valor diferente do combinado' when 'sem_frete' then 'frete não encontrado no sistema' else 'frete não lançado pelo freteiro' end
                      || '). Freteiro: ' || coalesce(l.explicacao, 'sem explicação') || ' · Logística ' ||
                      case l.situacao when 'aceito' then 'aceitou' when 'corrigido' then 'corrigiu para R$ ' || to_char(l.valor_final, 'FM999999990.00') else 'recusou' end ||
                      ': ' || coalesce(l.decisao_motivo, '') || coalesce(' (' || l.decisao_por || ')', '') end);
  end loop;
  update frete_relatorios set status = 'no_financeiro', fechamento_id = v_fech, no_financeiro_em = now() where id = r.id;
end $$;
revoke all on function public.frete_relatorio_finalizar_conferido(uuid) from public,anon,authenticated;
create or replace function public.frete_relatorio_finalizar(p_rel uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 -- Nenhuma conta nova avanca antes da decisao de caminhao e valor nesta tela.
 if exists(select 1 from frete_lancamentos l where l.relatorio_id=p_rel and l.situacao<>'recusado'
   and not exists(select 1 from logistica_frete_conferencias c where c.empresa_id=l.empresa_id and c.lancamento_id=l.id and c.valor_final is not null)) then return;end if;
 perform frete_relatorio_finalizar_conferido(p_rel);
end $$;
-- A aba geral de divergências passa a atender somente Free e Uber.
create or replace function public.logistica_divergencias_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d jsonb;
begin
 perform logistica_servicos_autorizar(p_empresa);
 d:=logistica_divergencias_dados(p_empresa);
 return jsonb_build_object('abertas',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'abertas') x where x->>'origem'<>'frete'),'[]'),
  'resolvidas',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'resolvidas') x where x->>'origem'<>'frete'),'[]'));
end $$;
notify pgrst,'reload schema';
commit;
