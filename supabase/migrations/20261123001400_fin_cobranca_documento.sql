-- Cobranca em documento usa os mesmos fretes e a mesma conferencia do app.
alter table public.frete_relatorios add column if not exists arquivo_nome text,
  add column if not exists arquivo_url text;

-- Permite limpar somente uploads temporarios que o banco nao aceitou.
create or replace function public.fin_cobranca_arquivo_livre(p_empresa uuid,p_nome text) returns boolean
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
    or not coalesce(fin_pode(p_empresa,'financeiro.contas_pagar.editar'),false) then return false;end if;
  return left(p_nome,length(p_empresa||'/financeiro/cobrancas/'))=p_empresa||'/financeiro/cobrancas/'
    and not exists(select 1 from frete_relatorios r where r.arquivo_url='compras-documentos:'||p_nome);
end $$;
revoke all on function public.fin_cobranca_arquivo_livre(uuid,text) from public,anon;
grant execute on function public.fin_cobranca_arquivo_livre(uuid,text) to authenticated;
create policy fin_cobrancas_temporarias_remover on storage.objects for delete to authenticated
  using(bucket_id='compras-documentos' and (storage.foldername(name))[2]='financeiro' and (storage.foldername(name))[3]='cobrancas'
    and public.fin_cobranca_arquivo_livre(((storage.foldername(name))[1])::uuid,name));

-- O envio pelo app e a importacao disputam a mesma origem, sem se duplicar.
create or replace function public.frete_documento_duplicidade_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare documento boolean;
begin
  if new.anuncio_id is null and new.avulso_id is null then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('frete_origem:'||coalesce(new.anuncio_id,new.avulso_id)::text,0));
  select arquivo_nome is not null into documento from frete_relatorios where id=new.relatorio_id;
  if exists(select 1 from frete_lancamentos l left join frete_relatorios r on r.id=l.relatorio_id
    where l.empresa_id=new.empresa_id and ((new.anuncio_id is not null and l.anuncio_id=new.anuncio_id) or (new.avulso_id is not null and l.avulso_id=new.avulso_id))
      and (coalesce(documento,false) or r.arquivo_nome is not null)) then raise exception 'Este frete já foi lançado. Confira o envio existente para evitar cobrança duplicada.';end if;
  return new;
end $$;
revoke all on function public.frete_documento_duplicidade_trg() from public,anon,authenticated;
create trigger frete_documento_duplicidade before insert on public.frete_lancamentos for each row execute function public.frete_documento_duplicidade_trg();

create or replace function public.fin_frete_cobranca_opcoes(p_empresa uuid,p_fornecedor uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare opcoes jsonb; transporte boolean;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
    or not coalesce(fin_pode(p_empresa,'financeiro.contas_pagar.editar'),false) then raise exception 'Sem permissão' using errcode='42501';end if;
  if not exists(select 1 from fornecedores where id=p_fornecedor and empresa_id=p_empresa) then raise exception 'Parceiro não encontrado.';end if;
  select exists(select 1 from frete_freteiros where fornecedor_id=p_fornecedor and empresa_id=p_empresa)
    or exists(select 1 from caminhoes where fornecedor_id=p_fornecedor and empresa_id=p_empresa) into transporte;
  select coalesce(jsonb_agg(j order by j->>'data',j->>'pedido'),'[]'::jsonb) into opcoes from (
    select jsonb_build_object('chave','anuncio:'||a.id,'anuncio_id',a.id,'freteiro_id',f.id,'freteiro',f.nome,
      'pedido_id',p.id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'data',a.data,'direcao',a.direcao,
      'origem',a.ponto_encontro,'destino',a.destino,'valor',a.valor) j
    from frete_anuncios a join frete_freteiros f on f.id=a.freteiro_id and f.empresa_id=p_empresa and f.fornecedor_id=p_fornecedor and f.status='aprovado'
    join separacoes_pedidos p on p.id=a.pedido_id and p.empresa_id=p_empresa
    where a.empresa_id=p_empresa and a.status='aceito' and a.data<=(now() at time zone 'America/Sao_Paulo')::date
      and not exists(select 1 from frete_lancamentos l where l.anuncio_id=a.id)
    union all
    select jsonb_build_object('chave','avulso:'||a.id,'avulso_id',a.id,'freteiro_id',f.id,'freteiro',f.nome,
      'solicitacao_interna',true,'motivo',a.motivo,'data',a.data,'direcao','avulso','origem',a.origem,'destino',a.destino,'valor',a.valor)
    from frete_avulsos a join frete_freteiros f on f.id=a.freteiro_id and f.empresa_id=p_empresa and f.fornecedor_id=p_fornecedor and f.status='aprovado'
    where a.empresa_id=p_empresa and a.cancelado_em is null and a.data<=(now() at time zone 'America/Sao_Paulo')::date
      and not exists(select 1 from frete_lancamentos l where l.avulso_id=a.id)
  ) x;
  return jsonb_build_object('frete',transporte,'opcoes',opcoes);
end $$;
revoke all on function public.fin_frete_cobranca_opcoes(uuid,uuid) from public,anon;
grant execute on function public.fin_frete_cobranca_opcoes(uuid,uuid) to authenticated;

create or replace function public.fin_frete_cobranca_importar(p_empresa uuid,p_fornecedor uuid,p_linhas jsonb,p_arquivo text,p_arquivo_url text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare opcoes jsonb; linha jsonb; opcao jsonb; rel uuid; grupo record; rels uuid[]:='{}';n int:=0;usadas text[]:='{}';total numeric;escolhidas jsonb:='[]';
begin
  -- A mesma trava serializa importacoes deste parceiro; nada e gravado antes da conferencia.
  perform pg_advisory_xact_lock(hashtextextended('cobranca_frete:'||p_empresa||':'||p_fornecedor,0));
  opcoes:=fin_frete_cobranca_opcoes(p_empresa,p_fornecedor)->'opcoes';
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 500 then raise exception 'Envie entre 1 e 500 linhas.';end if;
  if p_arquivo_url is not null and left(p_arquivo_url,length('compras-documentos:'||p_empresa||'/financeiro/cobrancas/'))<>'compras-documentos:'||p_empresa||'/financeiro/cobrancas/' then raise exception 'Arquivo de cobrança inválido.';end if;
  for linha in select * from jsonb_array_elements(p_linhas) loop
    select x into opcao from jsonb_array_elements(opcoes) x where x->>'chave'=linha->>'chave';
    if opcao is null then raise exception 'Um frete não está disponível: escolha um pedido ou solicitação interna deste parceiro que ainda não foi enviada.';end if;
    if opcao->>'chave'=any(usadas) then raise exception 'O mesmo frete foi escolhido em mais de uma linha.';end if;
    usadas:=array_append(usadas,opcao->>'chave');
    if nullif(linha->>'data','')::date is distinct from (opcao->>'data')::date then raise exception 'A data do documento não corresponde ao frete selecionado.';end if;
    if coalesce(round((linha->>'valor')::numeric,2),0)<=0 then raise exception 'Informe um valor positivo em todas as linhas.';end if;
    perform frete_vinculo_validar(p_empresa,(opcao->>'freteiro_id')::uuid,(opcao->>'pedido_id')::uuid,(opcao->>'avulso_id')::uuid,(opcao->>'anuncio_id')::uuid);
    escolhidas:=escolhidas||jsonb_build_array(opcao||jsonb_build_object('cobrado',round((linha->>'valor')::numeric,2),'descricao',left(linha->>'descricao',1000),'explicacao',left(linha->>'explicacao',2000)));
  end loop;
  for grupo in select x->>'freteiro_id' freteiro,min((x->>'data')::date) ini,max((x->>'data')::date) fim,sum((x->>'cobrado')::numeric) total from jsonb_array_elements(escolhidas) x group by x->>'freteiro_id' loop
    if exists(select 1 from frete_relatorios where freteiro_id=grupo.freteiro::uuid and periodo_ini=grupo.ini) then raise exception 'Já existe relatório deste freteiro começando nesta data. Confira o envio existente para evitar cobrança duplicada.';end if;
    insert into frete_relatorios(empresa_id,freteiro_id,periodo_ini,periodo_fim,total_informado,arquivo_nome,arquivo_url)
      values(p_empresa,grupo.freteiro::uuid,grupo.ini,grupo.fim,grupo.total,left(p_arquivo,200),p_arquivo_url) returning id into rel;
    rels:=array_append(rels,rel);
    for opcao in select x from jsonb_array_elements(escolhidas) x where x->>'freteiro_id'=grupo.freteiro loop
      insert into frete_lancamentos(empresa_id,freteiro_id,relatorio_id,pedido_id,avulso_id,anuncio_id,direcao,data,origem,destino,valor,valor_sistema,valor_final,situacao,divergencia,observacao,explicacao,explicacao_em)
      values(p_empresa,grupo.freteiro::uuid,rel,(opcao->>'pedido_id')::uuid,(opcao->>'avulso_id')::uuid,(opcao->>'anuncio_id')::uuid,opcao->>'direcao',(opcao->>'data')::date,
        coalesce(opcao->>'origem',''),coalesce(opcao->>'destino',''),(opcao->>'cobrado')::numeric,(opcao->>'valor')::numeric,
        case when abs((opcao->>'cobrado')::numeric-coalesce((opcao->>'valor')::numeric,0))<=0.009 then (opcao->>'cobrado')::numeric end,
        case when abs((opcao->>'cobrado')::numeric-coalesce((opcao->>'valor')::numeric,0))<=0.009 then 'ok' else 'divergente' end,
        case when abs((opcao->>'cobrado')::numeric-coalesce((opcao->>'valor')::numeric,0))>0.009 then 'valor' end,
        'Cobrança importada: '||coalesce(p_arquivo,'documento')||coalesce(E'\n'||(opcao->>'descricao'),''),nullif(btrim(opcao->>'explicacao'),''),case when nullif(btrim(opcao->>'explicacao'),'') is not null then now() end);
      n:=n+1;
    end loop;
    perform frete_relatorio_finalizar(rel);
  end loop;
  return jsonb_build_object('linhas',n,'relatorios',to_jsonb(rels));
end $$;
revoke all on function public.fin_frete_cobranca_importar(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.fin_frete_cobranca_importar(uuid,uuid,jsonb,text,text) to authenticated;

-- Cria o fechamento apenas quando a pessoa salva a nota ou confirma o parcelamento.
create or replace function public.fin_fechamento_preparar(p_empresa uuid,p_fornecedor uuid,p_referencia text) returns uuid
language plpgsql security definer set search_path=public as $$
declare fech uuid; titulo record;ordem int;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
    or not coalesce(fin_pode(p_empresa,'financeiro.contas_pagar.editar'),false) then raise exception 'Sem permissão' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('cobranca_frete:'||p_empresa||':'||p_fornecedor,0));
  fech:=fin_fechamento_criar(p_empresa,p_fornecedor,p_referencia);
  select coalesce(max(l.ordem),0) into ordem from fin_fechamento_linhas l where l.fechamento_id=fech;
  for titulo in select a.* from fin_pagar a where a.empresa_id=p_empresa and a.fornecedor_id=p_fornecedor
    and a.aguardando_fechamento and a.fechamento_id is null and a.status<>'cancelado' and coalesce(a.pago,0)=0 and not a.fechamento_copia
    and not exists(select 1 from fin_fechamento_linhas l join fin_fechamentos f on f.id=l.fechamento_id where l.titulo_id=a.id and f.status<>'cancelado') for update loop
    -- Os gatilhos de origem verificam tambem fretes legados antes de preparar o pagamento.
    update fin_pagar set origem=origem where id=titulo.id;
    ordem:=ordem+1;
    insert into fin_fechamento_linhas(empresa_id,fechamento_id,ordem,data,documento,descricao,valor,titulo_id,situacao)
      values(p_empresa,fech,ordem,coalesce(titulo.competencia,titulo.emissao,titulo.vencimento),titulo.documento,titulo.descricao,titulo.valor,titulo.id,'conferida');
  end loop;
  return fech;
end $$;
revoke all on function public.fin_fechamento_preparar(uuid,uuid,text) from public,anon;
grant execute on function public.fin_fechamento_preparar(uuid,uuid,text) to authenticated;
create or replace function public.frete_relatorio_finalizar(p_rel uuid) returns void language plpgsql security definer set search_path = public as $$
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
notify pgrst,'reload schema';
