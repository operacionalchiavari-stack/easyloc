begin;

-- Um carregamento pertence a uma única linha: programado, substituição ou extra.
create function public.logistica_fretes_separar_caminhoes(p_empresa uuid,p_servicos jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare registros jsonb; cargas jsonb; alocados jsonb:='{}'; ocupados jsonb:='{}'; resultado jsonb:='[]';
 cobrancas_por_linha jsonb:='{}'; donos_cobrancas jsonb:='{}';
 r jsonb; s jsonb; l jsonb; c jsonb; item jsonb; conf jsonb; cobranca jsonb; opcoes jsonb;
 grupo text; v_chave text; recurso text; preferido text; passagem int; usados uuid[]:='{}';
begin
 select coalesce(jsonb_agg(jsonb_build_object('servico',sv,'linha',ln,'grupo',concat_ws(':',sv->>'pedido_id',sv->>'data',sv->>'direcao'))
   order by si,li),'[]') into registros
 from jsonb_array_elements(p_servicos) with ordinality a(sv,si),lateral jsonb_array_elements(sv->'linhas') with ordinality b(ln,li);
 select coalesce(jsonb_agg(z.j order by z.j->>'grupo',z.j->'caminhao'->>'em',z.j->'caminhao'->>'id'),'[]') into cargas from (
  select distinct on(rr->>'grupo',cc->>'id') jsonb_build_object('grupo',rr->>'grupo','caminhao',cc,'servico',rr->'servico') j
  from jsonb_array_elements(registros) rr,lateral jsonb_array_elements(rr->'linha'->'carregamentos') cc
  where rr->'servico'->>'direcao'='entrega' and rr->'servico'->>'avulso_id' is null and cc->>'id' is not null
  order by rr->>'grupo',cc->>'id',cc->>'em',rr->'linha'->>'chave'
 ) z;
 -- Uma cobrança que chegou depois completa a linha extra existente.
 select coalesce(jsonb_agg(rr),'[]') into registros from jsonb_array_elements(registros) rr
 where not(rr->'linha'->'programado'->>'id' is null and rr->'linha'->'conferencia'->>'chave' is null
  and rr->'linha'->'cobranca'->>'id' is not null and exists(select 1 from logistica_frete_conferencias dc
   where dc.empresa_id=p_empresa and dc.chave like 'carga:%' and dc.pedido_id::text=rr->'servico'->>'pedido_id'
    and dc.data::text=rr->'servico'->>'data' and dc.caminhao_id::text=rr->'linha'->'cobranca'->>'caminhao_id'));
 -- Extras já conferidos mantêm a própria identidade, mesmo sem uma cobrança enviada.
 for item in select value from jsonb_array_elements(cargas) loop
  s:=item->'servico';c:=item->'caminhao';grupo:=item->>'grupo';
  v_chave:='carga:'||(s->>'pedido_id')||':'||(s->>'data')||':'||(c->>'id');
  if exists(select 1 from logistica_frete_conferencias dc where dc.empresa_id=p_empresa and dc.chave=v_chave) then
   ocupados:=ocupados||jsonb_build_object(grupo||':'||(c->>'id'),v_chave);
  end if;
 end loop;
 -- Primeiro decisões salvas; depois correspondência exata; só então substituições.
 for passagem in 1..4 loop
  for r in select value from jsonb_array_elements(registros) order by value->'linha'->>'chave' loop
   s:=r->'servico';l:=r->'linha';grupo:=r->>'grupo';v_chave:=l->>'chave';
   if s->>'direcao'<>'entrega' or s->>'avulso_id' is not null or alocados?v_chave then continue;end if;
   preferido:=case passagem when 1 then l->'conferencia'->>'caminhao_id' when 2 then l->'programado'->>'id'
     when 4 then case when l->'programado'->>'id' is null then l->'cobranca'->>'caminhao_id' end end;
   if passagem>1 and l->'conferencia'->>'caminhao_id' is not null then continue;end if;
   if passagem=3 and l->'programado'->>'id' is null then continue;end if;
   if passagem<>3 and preferido is null then continue;end if;
   select p->'caminhao' into c from jsonb_array_elements(cargas) p
    where p->>'grupo'=grupo and not(ocupados?(grupo||':'||(p->'caminhao'->>'id')))
      and (passagem=3 or p->'caminhao'->>'id'=preferido)
    order by p->'caminhao'->>'em',p->'caminhao'->>'id' limit 1;
   if c is not null then
    alocados:=alocados||jsonb_build_object(v_chave,c);
    ocupados:=ocupados||jsonb_build_object(grupo||':'||(c->>'id'),v_chave);
   end if;
  end loop;
 end loop;
 -- A cobrança do substituto acompanha sua linha, em vez de gerar uma duplicata vazia.
 for r in select value from jsonb_array_elements(registros) loop
  l:=r->'linha';v_chave:=l->>'chave';c:=alocados->v_chave;
  if c is null or l->'cobranca'->>'id' is not null then continue;end if;
  select rr->'linha'->'cobranca' into cobranca from jsonb_array_elements(registros) rr
   where rr->>'grupo'=r->>'grupo' and rr->'linha'->'programado'->>'id' is null
    and rr->'linha'->'conferencia'->>'chave' is null and rr->'linha'->'cobranca'->>'caminhao_id'=c->>'id'
    and rr->'linha'->'cobranca'->>'pagar_id' is null and rr->'linha'->'cobranca'->>'decisao_em' is null
   order by rr->'linha'->'cobranca'->>'id' limit 1;
  if cobranca is not null then
   cobrancas_por_linha:=cobrancas_por_linha||jsonb_build_object(v_chave,cobranca);
   donos_cobrancas:=donos_cobrancas||jsonb_build_object(cobranca->>'id',v_chave);
  end if;
 end loop;
 for r in select value from jsonb_array_elements(registros) loop
  s:=r->'servico';l:=r->'linha';grupo:=r->>'grupo';v_chave:=l->>'chave';c:=alocados->v_chave;
  if donos_cobrancas?(l->'cobranca'->>'id') and donos_cobrancas->>(l->'cobranca'->>'id')<>v_chave then continue;end if;
  if cobrancas_por_linha?v_chave then l:=l||jsonb_build_object('cobranca',cobrancas_por_linha->v_chave);end if;
  if s->>'direcao'='entrega' and s->>'avulso_id' is null then
   -- As opções ficam no formulário; a célula de carregamento recebe no máximo um caminhão.
   opcoes:=coalesce(l->'carregamentos','[]');
   l:=l||jsonb_build_object('carregamentos_opcoes',opcoes,'carregamentos',case when c is null then '[]'::jsonb else jsonb_build_array(c) end,
    'tipo_linha',case when l->'programado'->>'id' is null then 'extra' when c is not null and c->>'id' is distinct from l->'programado'->>'id' then 'substituicao' else 'programado' end);
  end if;
  if l->'cobranca'->>'id' is not null then usados:=array_append(usados,(l->'cobranca'->>'id')::uuid);end if;
  l:=l||jsonb_build_object('versao',md5(l::text));
  resultado:=resultado||jsonb_build_array(s||jsonb_build_object('quantidade',1,'linhas',jsonb_build_array(l)));
 end loop;
 -- Tudo que excede a programação ganha uma linha extra independente.
 for item in select value from jsonb_array_elements(cargas) loop
  s:=item->'servico';c:=item->'caminhao';grupo:=item->>'grupo';recurso:=grupo||':'||(c->>'id');
  v_chave:='carga:'||(s->>'pedido_id')||':'||(s->>'data')||':'||(c->>'id');
  if ocupados?recurso and ocupados->>recurso<>v_chave then continue;end if;
  select to_jsonb(dc)-'contexto'||jsonb_build_object('caminhao',coalesce(dc.contexto->'caminhao_escolhido',c)) into conf
   from logistica_frete_conferencias dc where dc.empresa_id=p_empresa and dc.chave=v_chave;
  opcoes:=logistica_frete_cobrancas(p_empresa,(s->>'pedido_id')::uuid,null,(s->>'data')::date,'entrega');
  select cb into cobranca from jsonb_array_elements(opcoes) cb where not((cb->>'id')::uuid=any(usados)) and
   case when coalesce(conf->>'lancamento_id',conf->>'viagem_id') is not null then cb->>'id'=coalesce(conf->>'lancamento_id',conf->>'viagem_id')
    else cb->>'caminhao_id'=c->>'id' end order by (cb->>'enviado')::boolean desc,cb->>'atualizado_em' desc limit 1;
  if cobranca is not null then usados:=array_append(usados,(cobranca->>'id')::uuid);end if;
  l:=jsonb_build_object('chave',v_chave,'tipo_linha','extra','programado',null,'nome','Frete extra','detalhe','Não previsto na programação',
   'confirmado',false,'situacao','extra','carregamentos',jsonb_build_array(c),'carregamentos_opcoes',jsonb_build_array(c),
   'cobrancas',coalesce((select jsonb_agg(cb) from jsonb_array_elements(opcoes) cb where cb->>'caminhao_id'=c->>'id'),'[]'),
   'cobranca',cobranca,'conferencia',conf,'valor_sistema',logistica_frete_valor_sistema(p_empresa,(s->>'pedido_id')::uuid,(c->>'id')::uuid,'entrega'));
  l:=l||jsonb_build_object('versao',md5(l::text));
  resultado:=resultado||jsonb_build_array(s||jsonb_build_object('id',null,'ativo',false,'etapa','Entrega · extra','valor',null,'quantidade',1,'linhas',jsonb_build_array(l)));
 end loop;
 -- Preserva anúncios ainda sem um freteiro confirmado.
 for s in select value from jsonb_array_elements(p_servicos) where jsonb_array_length(value->'linhas')=0 loop
  resultado:=resultado||jsonb_build_array(s);
 end loop;
 return coalesce((select jsonb_agg(j order by j->>'data',j->>'hora',
   case when j->'linhas'->0->>'tipo_linha'='extra' then 1 else 0 end,j->'linhas'->0->>'chave') from jsonb_array_elements(resultado) j),'[]');
end $$;
revoke all on function public.logistica_fretes_separar_caminhoes(uuid,jsonb) from public,anon,authenticated;

create or replace function public.logistica_fretes_anunciados_base(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
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
revoke all on function public.logistica_fretes_anunciados_base(uuid,date,date) from public,anon,authenticated;
create or replace function public.logistica_frete_conferir(p_empresa uuid,p_chave text,p_data date,p_versao text,p_caminhao uuid,p_lancamento uuid,p_valor numeric,p_motivo text) returns void
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
  select c into cam from jsonb_array_elements(coalesce(linha->'carregamentos_opcoes',linha->'carregamentos','[]')||
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

create or replace function public.logistica_fretes_anunciados(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 perform logistica_servicos_autorizar(p_empresa);
 return logistica_fretes_separar_caminhoes(p_empresa,logistica_fretes_anunciados_base(p_empresa,p_inicio,p_fim));
end $$;
notify pgrst,'reload schema';
commit;
