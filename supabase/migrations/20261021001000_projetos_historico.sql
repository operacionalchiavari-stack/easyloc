-- Out/2026: histórico de TODAS as alterações de cada projeto (pedido do usuário: "cada projeto de fato tenha um
-- histórico de todas as alterações que foram efetuadas neles, todas mesmo").
-- Feito no banco, por gatilho: cada vez que o projeto é gravado (tela do computador, app do celular, Helena, equipe,
-- envio do pedido, status), o gatilho compara a versão anterior com a nova e anota cada mudança, com quem fez e quando.
-- O salvamento automático grava várias vezes por minuto; mudanças seguidas do mesmo item/campo pela mesma pessoa em até
-- 10 minutos viram UMA linha (ex.: clicar "+" cinco vezes = "Mudou X: 2 → 7"), e se voltar ao valor inicial a linha some.

create table if not exists public.projetos_historico (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  empresa_id uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  autor text,
  autor_tipo text not null default 'sistema' check (autor_tipo in ('equipe','decorador','sistema')),
  tipo text not null,
  chave text,
  descricao text not null,
  detalhe jsonb not null default '{}'::jsonb
);
create index if not exists projetos_historico_projeto_idx on public.projetos_historico(projeto_id, criado_em desc);
alter table public.projetos_historico enable row level security;
-- Ninguém lê/grava direto: leitura pela função projeto_historico (mesma regra de acesso do projeto); escrita só o gatilho.
revoke all on public.projetos_historico from anon, authenticated;

-- Nome curto de um item do catálogo para o texto do histórico.
create or replace function public.projeto_hist_item_nome(p_item uuid)
returns text language sql stable security definer set search_path=public as $$
  -- sem as medidas "(L) 0.55 m (A) ..." do fim do nome
  select coalesce(nullif(btrim(regexp_replace(i.descricao_total, '\s*\(L\).*$', '')), ''), nullif(btrim(concat_ws(' ', i.produto_base, i.produto)), ''), 'Item')
    from public.itens i where i.id = p_item
$$;

-- Grava uma linha; com p_chave, junta com a última linha igual (mesma pessoa, até 10 min).
-- p_de/p_para: valores para juntar (o "de" fica o da primeira linha); se o resultado volta ao "de", a linha some.
create or replace function public.projeto_hist_gravar(p_proj public.projetos, p_autor text, p_autor_tipo text, p_tipo text,
  p_chave text, p_descricao text, p_detalhe jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare ult public.projetos_historico; det jsonb;
begin
  if p_chave is not null then
    select * into ult from public.projetos_historico
     where projeto_id = p_proj.id and chave = p_chave and coalesce(autor,'') = coalesce(p_autor,'')
       and atualizado_em > now() - interval '10 minutes'
     order by atualizado_em desc limit 1;
    if found then
      det := ult.detalhe || p_detalhe;
      if ult.detalhe ? 'de' then det := jsonb_set(det, '{de}', ult.detalhe->'de'); end if;
      if det ? 'de' and det ? 'para' and det->'de' = det->'para' then
        delete from public.projetos_historico where id = ult.id;
        return;
      end if;
      update public.projetos_historico set atualizado_em = now(), detalhe = det,
        descricao = public.projeto_hist_texto(p_tipo, det, p_descricao)
       where id = ult.id;
      return;
    end if;
  end if;
  insert into public.projetos_historico(projeto_id, empresa_id, autor, autor_tipo, tipo, chave, descricao, detalhe)
  values (p_proj.id, p_proj.empresa_id, p_autor, p_autor_tipo, p_tipo, p_chave,
          public.projeto_hist_texto(p_tipo, p_detalhe, p_descricao), p_detalhe);
end $$;

-- Texto das linhas que juntam valores (o "de" pode ter vindo de uma linha anterior).
create or replace function public.projeto_hist_texto(p_tipo text, d jsonb, p_padrao text)
returns text language plpgsql immutable as $$
declare de numeric; para numeric;
begin
  if p_tipo = 'item' then
    de := coalesce((d->>'de')::numeric, 0); para := coalesce((d->>'para')::numeric, 0);
    if de = 0 then return 'Adicionou ' || para || '× ' || (d->>'item') || ' em ' || (d->>'ambiente'); end if;
    if para = 0 then return 'Tirou ' || (d->>'item') || ' de ' || (d->>'ambiente') || ' (eram ' || de || ')'; end if;
    return 'Mudou a quantidade de ' || (d->>'item') || ' em ' || (d->>'ambiente') || ': ' || de || ' → ' || para;
  end if;
  if p_tipo = 'campo' then
    return 'Alterou ' || (d->>'campo') || ': ' || coalesce(nullif(d->>'de',''), '(vazio)') || ' → ' || coalesce(nullif(d->>'para',''), '(vazio)');
  end if;
  if p_tipo = 'ambiente_nome' then
    return 'Renomeou o ambiente ' || coalesce(d->>'de','') || ' para ' || coalesce(d->>'para','');
  end if;
  return p_padrao;
end $$;

create or replace function public.projeto_hist_gatilho()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  autor text; autor_tipo text;
  a_old jsonb; a_new jsonb; amb_nome text;
  r record; x record;
  campos text[][]; k text; v_de text; v_para text;
  evento_rotulos jsonb := '{"tipo":"o tipo de evento","data_entrega":"a data de entrega","hora_entrega":"o horário de entrega","data_fim":"o último dia do evento","data_coleta":"a data de coleta","hora_coleta":"o horário de coleta","endereco":"o endereço","obs_entrega":"a observação de entrega","obs_coleta":"a observação de coleta","obs_separacao":"a observação de separação"}';
begin
  -- Quem fez: login da equipe (nome do Cadastro de Funcionários), senão o decorador dono do projeto (token do catálogo).
  if auth.uid() is not null then
    autor_tipo := 'equipe';
    select nome into autor from public.funcionarios_acesso where id = auth.uid() and empresa_id = new.empresa_id;
    if autor is null then select nullif(btrim(u.nome), '') into autor from public.usuarios u where u.id = auth.uid(); end if;
    autor := coalesce(autor, auth.jwt()->>'email', 'Equipe');
  elsif new.cliente_id is not null then
    autor_tipo := 'decorador';
    select nome_razao into autor from public.clientes_empresas where id = new.cliente_id;
    autor := coalesce(autor, 'Decorador');
  else
    autor_tipo := 'sistema'; autor := 'Sistema';
  end if;

  if tg_op = 'INSERT' then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'projeto', null, 'Criou o projeto ' || coalesce(new.noivos, ''), '{}');
    return new;
  end if;

  -- Dados do evento (colunas)
  if public.comercial_hist_mudou(old.noivos, new.noivos) then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'campo', 'campo:noivos', null, jsonb_build_object('campo','o nome do projeto','de',old.noivos,'para',new.noivos)); end if;
  if new.data_evento is distinct from old.data_evento then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'campo', 'campo:data_evento', null, jsonb_build_object('campo','a data do evento','de',to_char(old.data_evento,'DD/MM/YYYY'),'para',to_char(new.data_evento,'DD/MM/YYYY'))); end if;
  if public.comercial_hist_mudou(old.local_evento, new.local_evento) then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'campo', 'campo:local', null, jsonb_build_object('campo','o local','de',old.local_evento,'para',new.local_evento)); end if;
  for k in select jsonb_object_keys(evento_rotulos) loop
    v_de := old.dados->'evento'->>k; v_para := new.dados->'evento'->>k;
    if public.comercial_hist_mudou(v_de, v_para) then
      perform public.projeto_hist_gravar(new, autor, autor_tipo, 'campo', 'campo:evento.' || k, null, jsonb_build_object('campo', evento_rotulos->>k, 'de', v_de, 'para', v_para));
    end if;
  end loop;
  if (old.dados->'foto_casal'->>'url') is distinct from (new.dados->'foto_casal'->>'url') then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'foto', null,
      case when new.dados->'foto_casal'->>'url' is null then 'Removeu a foto dos noivos' when old.dados->'foto_casal'->>'url' is null then 'Adicionou a foto dos noivos' else 'Trocou a foto dos noivos' end, '{}');
  end if;

  -- Pedido, status, compartilhamento, layout
  if new.pedido_enviado_em is distinct from old.pedido_enviado_em and new.pedido_enviado_em is not null then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'pedido', null,
      case when old.pedido_enviado_em is null then 'Enviou o pedido' else 'Reenviou o pedido' end || coalesce(' — "' || nullif(btrim(new.pedido_observacao),'') || '"', ''), '{}');
  end if;
  if new.status is distinct from old.status then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'status', null, 'Mudou o status: ' ||
      coalesce((jsonb_build_object('rascunho','Rascunho','pedido_enviado','Pedido enviado','em_analise','Em análise','convertido','Convertido em pedido')->>old.status), old.status, '') || ' → ' ||
      coalesce((jsonb_build_object('rascunho','Rascunho','pedido_enviado','Pedido enviado','em_analise','Em análise','convertido','Convertido em pedido')->>new.status), new.status, ''), '{}');
  end if;
  if new.compartilhar is distinct from old.compartilhar then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'link', null, case when new.compartilhar then 'Ativou o link da apresentação' else 'Desativou o link da apresentação' end, '{}'); end if;
  if new.pin_hash is distinct from old.pin_hash and new.pin_hash is not null and old.pin_hash is not null then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'link', null, 'Gerou uma nova senha para o link', '{}'); end if;
  if new.layout_id is distinct from old.layout_id then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'layout', null, 'Trocou o layout da apresentação', '{}'); end if;

  -- Ambientes
  if new.dados->'ambientes' is distinct from old.dados->'ambientes' then
    for r in
      select coalesce(n.id, o.id) id, o.amb o_amb, n.amb n_amb
        from (select a->>'id' id, a amb from jsonb_array_elements(coalesce(old.dados->'ambientes','[]')) a) o
        full join (select a->>'id' id, a amb from jsonb_array_elements(coalesce(new.dados->'ambientes','[]')) a) n on n.id = o.id
    loop
      a_old := r.o_amb; a_new := r.n_amb;
      amb_nome := coalesce(a_new->>'nome', a_old->>'nome', 'ambiente');
      if a_old is null then
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'ambiente', null, 'Criou o ambiente ' || amb_nome, '{}');
      elsif a_new is null then
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'ambiente', null, 'Excluiu o ambiente ' || amb_nome ||
          case when jsonb_array_length(coalesce(a_old->'itens','[]')) > 0 then ' (com ' || jsonb_array_length(a_old->'itens') || ' item(ns))' else '' end, '{}');
        continue;
      elsif (a_old->>'nome') is distinct from (a_new->>'nome') then
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'ambiente_nome', 'nome:' || r.id, null, jsonb_build_object('de', a_old->>'nome', 'para', a_new->>'nome'));
      end if;
      -- Itens (quantidade por item; mesma peça em duas linhas soma)
      for x in
        select coalesce(n.item_id, o.item_id) item_id, coalesce(o.q, 0) de, coalesce(n.q, 0) para
          from (select i->>'item_id' item_id, sum(coalesce((i->>'quantidade')::numeric, 0)) q from jsonb_array_elements(coalesce(a_old->'itens','[]')) i group by 1) o
          full join (select i->>'item_id' item_id, sum(coalesce((i->>'quantidade')::numeric, 0)) q from jsonb_array_elements(coalesce(a_new->'itens','[]')) i group by 1) n on n.item_id = o.item_id
         where coalesce(o.q, 0) <> coalesce(n.q, 0)
      loop
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'item', 'item:' || r.id || ':' || x.item_id, null,
          jsonb_build_object('item', public.projeto_hist_item_nome(x.item_id::uuid), 'item_id', x.item_id, 'ambiente', amb_nome, 'de', x.de, 'para', x.para));
      end loop;
      -- Ordem dos itens (mesmos itens, outra ordem)
      if a_old is not null and (select array_agg(i->>'item_id' order by o) from jsonb_array_elements(coalesce(a_old->'itens','[]')) with ordinality t(i,o))
           is distinct from (select array_agg(i->>'item_id' order by o) from jsonb_array_elements(coalesce(a_new->'itens','[]')) with ordinality t(i,o))
         and (select array_agg(i->>'item_id' order by i->>'item_id') from jsonb_array_elements(coalesce(a_old->'itens','[]')) i)
           is not distinct from (select array_agg(i->>'item_id' order by i->>'item_id') from jsonb_array_elements(coalesce(a_new->'itens','[]')) i) then
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'ordem', 'ordem:' || r.id, 'Mudou a ordem dos itens em ' || amb_nome, '{}');
      end if;
      -- Imagens (renderizações e prints)
      for x in
        select n.rid, n.rnd from (select rr->>'id' rid, rr rnd from jsonb_array_elements(coalesce(a_new->'renders','[]')) rr) n
         where not exists (select 1 from jsonb_array_elements(coalesce(a_old->'renders','[]')) o where o->>'id' = n.rid)
      loop
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'imagem', null, 'Adicionou uma imagem em ' || amb_nome || coalesce(' (' || nullif(x.rnd->>'origem','') || ')', ''), '{}');
      end loop;
      for x in
        select o.rid, o.rnd from (select rr->>'id' rid, rr rnd from jsonb_array_elements(coalesce(a_old->'renders','[]')) rr) o
         where not exists (select 1 from jsonb_array_elements(coalesce(a_new->'renders','[]')) n where n->>'id' = o.rid)
      loop
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'imagem', null, 'Removeu uma imagem de ' || amb_nome, '{}');
      end loop;
      for x in
        select n.rid from (select rr->>'id' rid, rr rnd from jsonb_array_elements(coalesce(a_new->'renders','[]')) rr) n
          join (select rr->>'id' rid, rr rnd from jsonb_array_elements(coalesce(a_old->'renders','[]')) rr) o on o.rid = n.rid
         where coalesce(o.rnd->>'url','') <> coalesce(n.rnd->>'url','')
      loop
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'imagem', 'imagem:' || x.rid, 'Atualizou uma imagem de ' || amb_nome || ' (móveis trocados no 3D)', '{}');
      end loop;
      -- Observações do ambiente
      if a_old is not null and coalesce(a_old->>'notas','') <> coalesce(a_new->>'notas','') then
        perform public.projeto_hist_gravar(new, autor, autor_tipo, 'notas', 'notas:' || r.id, 'Alterou as observações de ' || amb_nome, jsonb_build_object('texto', a_new->>'notas'));
      end if;
    end loop;
  end if;

  -- Plantas e o que mais estiver em dados
  if (old.dados->'plantas') is distinct from (new.dados->'plantas') then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'planta', 'planta', 'Alterou as plantas do evento', '{}'); end if;
  if (old.dados - 'ambientes' - 'plantas' - 'evento' - 'foto_casal') is distinct from (new.dados - 'ambientes' - 'plantas' - 'evento' - 'foto_casal') then
    perform public.projeto_hist_gravar(new, autor, autor_tipo, 'outros', 'outros', 'Alterou outras informações do projeto', '{}'); end if;
  return new;
exception when others then
  -- O histórico nunca impede salvar o projeto.
  raise warning 'projeto_hist_gatilho: %', sqlerrm;
  return new;
end $$;

drop trigger if exists projetos_historico_gatilho on public.projetos;
create trigger projetos_historico_gatilho after insert or update on public.projetos
for each row execute function public.projeto_hist_gatilho();

-- Leitura: mesma regra de quem pode abrir o projeto (decorador dono pelo token; equipe da empresa).
create or replace function public.projeto_historico(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'quando', h.atualizado_em, 'inicio', h.criado_em,
      'autor', h.autor, 'autor_tipo', h.autor_tipo, 'tipo', h.tipo, 'descricao', h.descricao) order by h.atualizado_em desc)
    from (select * from public.projetos_historico where projeto_id = r.id order by atualizado_em desc limit 2000) h), '[]'::jsonb);
end $$;

revoke all on function public.projeto_hist_item_nome(uuid), public.projeto_hist_gravar(public.projetos,text,text,text,text,text,jsonb),
  public.projeto_hist_texto(text,jsonb,text), public.projeto_hist_gatilho() from public, anon, authenticated;
revoke all on function public.projeto_historico(text,uuid,uuid) from public;
grant execute on function public.projeto_historico(text,uuid,uuid) to anon, authenticated;
