-- Todo frete tem pedido; a excecao e a solicitacao interna criada na Logistica.
-- Registros historicos nao sao convertidos nem vinculados por suposicao.
create or replace function public.frete_vinculo_validar(p_empresa uuid,p_freteiro uuid,p_pedido uuid,p_avulso uuid,p_anuncio uuid default null)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from frete_freteiros f where f.id=p_freteiro and f.empresa_id=p_empresa) then
    raise exception 'Freteiro não pertence à empresa.';
  end if;
  if (p_pedido is null)=(p_avulso is null) then
    raise exception 'Vincule o frete a um pedido ou a uma solicitação interna cadastrada pelo supervisor na Logística.';
  end if;
  if p_pedido is not null and not exists(select 1 from separacoes_pedidos p where p.id=p_pedido and p.empresa_id=p_empresa) then
    raise exception 'Pedido do frete não encontrado nesta empresa.';
  end if;
  if p_avulso is not null then
    if p_anuncio is not null or not exists(select 1 from frete_avulsos a where a.id=p_avulso and a.empresa_id=p_empresa and a.freteiro_id=p_freteiro and a.cancelado_em is null) then
      raise exception 'Solicitação interna não autorizada para este freteiro ou cancelada. Solicite o cadastro ao supervisor na Logística.';
    end if;
  end if;
  if p_anuncio is not null and not exists(select 1 from frete_anuncios a where a.id=p_anuncio and a.empresa_id=p_empresa and a.freteiro_id=p_freteiro and a.pedido_id=p_pedido) then
    raise exception 'O anúncio do frete não corresponde ao pedido e ao freteiro.';
  end if;
end $$;
revoke all on function public.frete_vinculo_validar(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.frete_lanc_vinculo_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare ped uuid; dir text;
begin
  -- Permite registrar explicacoes e recusar um legado; aprovar, enviar ou gerar
  -- uma nova conta exige o vinculo valido, mesmo quando o legado ja foi aceito.
  if tg_op='UPDATE' then
    if row(new.empresa_id,new.freteiro_id,new.pedido_id,new.avulso_id,new.anuncio_id,new.relatorio_id,new.pagar_id)
      is not distinct from row(old.empresa_id,old.freteiro_id,old.pedido_id,old.avulso_id,old.anuncio_id,old.relatorio_id,old.pagar_id)
      and (new.situacao is not distinct from old.situacao or new.situacao not in ('ok','aceito','corrigido')) then return new; end if;
  end if;
  if new.anuncio_id is not null then
    select a.pedido_id,a.direcao into ped,dir from frete_anuncios a
      where a.id=new.anuncio_id and a.empresa_id=new.empresa_id and a.freteiro_id=new.freteiro_id;
    if ped is null then raise exception 'O anúncio precisa estar vinculado a um pedido válido.'; end if;
    if new.pedido_id is null then new.pedido_id:=ped; end if;
    if new.direcao is null then new.direcao:=dir; end if;
  end if;
  perform frete_vinculo_validar(new.empresa_id,new.freteiro_id,new.pedido_id,new.avulso_id,new.anuncio_id);
  return new;
end $$;
revoke all on function public.frete_lanc_vinculo_trg() from public,anon,authenticated;
drop trigger if exists frete_lanc_vinculo on public.frete_lancamentos;
create trigger frete_lanc_vinculo before insert or update on public.frete_lancamentos
for each row execute function public.frete_lanc_vinculo_trg();

create or replace function public.frete_pedido_obrigatorio_trg() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.pedido_id is null or not exists(select 1 from separacoes_pedidos p where p.id=new.pedido_id and p.empresa_id=new.empresa_id) then
    raise exception 'O frete precisa de um pedido válido. Para frete sem pedido, o supervisor deve criar uma solicitação interna na Logística.';
  end if;
  return new;
end $$;
revoke all on function public.frete_pedido_obrigatorio_trg() from public,anon,authenticated;
drop trigger if exists frete_anuncio_pedido_obrigatorio on public.frete_anuncios;
create trigger frete_anuncio_pedido_obrigatorio before insert or update of empresa_id,pedido_id on public.frete_anuncios
for each row execute function public.frete_pedido_obrigatorio_trg();
drop trigger if exists frete_viagem_pedido_obrigatorio on public.frete_viagens;
create trigger frete_viagem_pedido_obrigatorio before insert or update of empresa_id,pedido_id,valor_final,fechamento_id on public.frete_viagens
for each row execute function public.frete_pedido_obrigatorio_trg();

create or replace function public.fin_frete_vinculo_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare l frete_lancamentos;
begin
  if new.origem is distinct from 'frete' then return new; end if;
  select * into l from frete_lancamentos where id=new.origem_id and empresa_id=new.empresa_id;
  if l.id is not null then
    perform frete_vinculo_validar(l.empresa_id,l.freteiro_id,
      coalesce(l.pedido_id,(select a.pedido_id from frete_anuncios a where a.id=l.anuncio_id and a.empresa_id=l.empresa_id and a.freteiro_id=l.freteiro_id)),l.avulso_id,l.anuncio_id);
  elsif exists(select 1 from logistica_fechamentos f where f.id=new.origem_id and f.empresa_id=new.empresa_id and f.tipo='frete')
    and exists(select 1 from frete_viagens v where v.fechamento_id=new.origem_id and v.empresa_id=new.empresa_id)
    and not exists(select 1 from frete_viagens v left join separacoes_pedidos p on p.id=v.pedido_id and p.empresa_id=v.empresa_id
      where v.fechamento_id=new.origem_id and v.empresa_id=new.empresa_id and p.id is null) then
    null;
  else
    raise exception 'Não é possível criar uma conta de frete sem pedido ou solicitação interna autorizada na Logística.';
  end if;
  return new;
end $$;
revoke all on function public.fin_frete_vinculo_trg() from public,anon,authenticated;
drop trigger if exists fin_frete_vinculo on public.fin_pagar;
create trigger fin_frete_vinculo before insert or update of empresa_id,origem,origem_id on public.fin_pagar
for each row execute function public.fin_frete_vinculo_trg();

create or replace function public.frete_fechar(p_empresa uuid, p_viagens uuid[], p_vencimento date, p_obs text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; nforn int; forn uuid; fnome text; total numeric; fech logistica_fechamentos; pg uuid; num int; r record; doc text;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão para fechar fretes.'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento do pagamento.'; end if;
  if coalesce(array_length(p_viagens, 1), 0) = 0 then raise exception 'Selecione as viagens para fechar.'; end if;
  perform 1 from frete_viagens where id = any(p_viagens) and empresa_id = p_empresa for update;
  select count(*), count(distinct fornecedor_id), min(fornecedor_id::text)::uuid, coalesce(sum(valor_final), 0)
    into n, nforn, forn, total from frete_viagens where id = any(p_viagens) and empresa_id = p_empresa;
  if n <> array_length(p_viagens, 1) then raise exception 'Alguma viagem não foi encontrada.'; end if;
  if exists (select 1 from frete_viagens where id = any(p_viagens) and status <> 'aberto') then raise exception 'Alguma viagem já foi fechada. Atualize a tela.'; end if;
  if nforn <> 1 or forn is null then raise exception 'Feche uma transportadora por vez.'; end if;
  if exists (select 1 from frete_viagens where id = any(p_viagens) and valor_final is null) then raise exception 'Defina o valor final de todas as viagens selecionadas.'; end if;
  if total <= 0 then raise exception 'O total do fechamento precisa ser maior que zero.'; end if;
  select coalesce(nome_fantasia, nome_razao_social) into fnome from fornecedores where id = forn;
  perform pg_advisory_xact_lock(hashtextextended('logistica_fech:' || p_empresa::text, 0));
  select coalesce(max(numero), 0) + 1 into num from logistica_fechamentos where empresa_id = p_empresa and tipo = 'frete';
  doc := 'FR-' || lpad(num::text, 4, '0');
  insert into logistica_fechamentos (empresa_id, tipo, numero, fornecedor_id, beneficiario, total, vencimento, obs, criado_por_nome)
  values (p_empresa, 'frete', num, forn, coalesce(fnome, 'Transportadora'), round(total, 2), p_vencimento, nullif(btrim(coalesce(p_obs, '')), ''), logistica_nome_usuario(p_empresa))
  returning * into fech;
  -- Vincula e valida as viagens antes de criar o titulo financeiro.
  update frete_viagens set fechamento_id=fech.id where id=any(p_viagens) and empresa_id=p_empresa;
  perform fin_semear(p_empresa);
  insert into fin_pagar (empresa_id, origem, origem_id, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento,
                         valor, parcela, parcelas, categoria_id, observacoes, criado_por)
  values (p_empresa, 'frete', fech.id, forn, fnome, doc, 'Fretes ' || doc || ' · ' || coalesce(fnome, 'Transportadora') || ' · ' || n || ' viagem(ns)',
          current_date, current_date, p_vencimento, round(total, 2), 1, 1, fin_categoria(p_empresa, 'fretes'),
          concat_ws(E'\n', 'Fechamento da Conciliação de Fretes (' || doc || ').', nullif(btrim(coalesce(p_obs, '')), '')), auth.uid())
  returning id into pg;
  update logistica_fechamentos set pagar_id = pg where id = fech.id;
  for r in select pedido_id, max(pedido_numero) numero, sum(valor_final) valor,
                  string_agg(distinct direcao || ' ' || coalesce(caminhao_codigo, ''), ', ') detalhe
             from frete_viagens where id = any(p_viagens) and pedido_id is not null group by pedido_id loop
    if r.valor > 0 then
      insert into fin_custos_evento (empresa_id, pedido_id, categoria, descricao, valor, pagar_id, fechamento_id, criado_por)
      values (p_empresa, r.pedido_id, 'frete', 'Frete ' || doc || ' · ' || coalesce(fnome, 'Transportadora') || ' · ' || r.detalhe, round(r.valor, 2), pg, fech.id, auth.uid());
      delete from fin_resultados_revisados where pedido_id = r.pedido_id;
    end if;
  end loop;
  update frete_viagens set status = 'fechado', fechamento_id = fech.id, updated_at = now() where id = any(p_viagens);
  return jsonb_build_object('ok', true, 'id', fech.id, 'documento', doc, 'total', round(total, 2), 'pagar_id', pg);
end $$;

notify pgrst,'reload schema';
