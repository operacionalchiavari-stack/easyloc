-- Foto dos noivos no projeto (opcional). Fica dentro de projetos.dados -> 'foto_casal' = {url, path} (o mesmo jsonb dos
-- ambientes; nenhuma coluna nova). O arquivo sobe no bucket `projetos` em <empresa>/<projeto>/casal/<uuid>.jpg, que já cai
-- na política de upload existente (só vale pra projeto que existe). Só falta as duas funções que DEVOLVEM dados
-- passarem a expor a URL: o resumo (cartão da lista) e a apresentação pública (capa).
begin;

create or replace function public.projeto_resumo(r public.projetos)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', r.id, 'noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento,
    'status', r.status, 'compartilhar', r.compartilhar, 'pedido_enviado_em', r.pedido_enviado_em,
    'atualizado_em', r.updated_at,
    'foto_casal_url', r.dados->'foto_casal'->>'url',
    'ambientes', jsonb_array_length(r.dados->'ambientes'),
    'itens', coalesce((select sum(coalesce((i->>'quantidade')::int, 1)) from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) i), 0),
    'renders', coalesce((select sum(jsonb_array_length(coalesce(a->'renders','[]'::jsonb))) from jsonb_array_elements(r.dados->'ambientes') a), 0),
    'dono', coalesce((select c.nome_razao from public.clientes_empresas c where c.id = r.cliente_id), 'Equipe')
  );
$$;

create or replace function public.projeto_publico(p_slug text, p_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.projetos; itens jsonb; dec jsonb; emp jsonb;
begin
  select * into r from public.projetos where slug = p_slug and compartilhar is true;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if r.pin_bloqueado_ate is not null and r.pin_bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'bloqueado', 'ate', r.pin_bloqueado_ate);
  end if;
  if r.pin_hash is null or coalesce(p_pin, '') = '' or extensions.crypt(p_pin, r.pin_hash) <> r.pin_hash then
    update public.projetos set
      pin_tentativas = case when pin_tentativas + 1 >= 5 then 0 else pin_tentativas + 1 end,
      pin_bloqueado_ate = case when pin_tentativas + 1 >= 5 then now() + interval '15 minutes' else null end
    where id = r.id;
    return jsonb_build_object('ok', false, 'erro', 'pin');
  end if;
  update public.projetos set pin_tentativas = 0, pin_bloqueado_ate = null where id = r.id and (pin_tentativas <> 0 or pin_bloqueado_ate is not null);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', it.id, 'nome', trim(concat_ws(' ', nullif(it.produto_base,''), it.produto)), 'categoria', it.categoria,
      'material', it.material, 'cor', it.cor, 'largura', it.largura, 'altura', it.altura, 'profundidade', it.profundidade,
      'foto_url', it.foto_url)), '[]'::jsonb) into itens
  from public.itens it
  where it.empresa_id = r.empresa_id
    and it.id::text in (select i->>'item_id' from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) i);
  select jsonb_build_object('nome', c.nome_razao, 'logo_url', c.catalogo_logo_url, 'cor_primaria', c.catalogo_cor_primaria, 'cor_secundaria', c.catalogo_cor_secundaria, 'telefone', c.telefone, 'email', c.email)
    into dec from public.clientes_empresas c where c.id = r.cliente_id;
  select jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url) into emp from public.empresas e where e.id = r.empresa_id;
  return jsonb_build_object('ok', true,
    'projeto', jsonb_build_object('noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento,
                                  'foto_casal', r.dados->'foto_casal'->>'url', 'ambientes', r.dados->'ambientes'),
    'itens', itens, 'decorador', dec, 'empresa', emp);
end; $$;

commit;
