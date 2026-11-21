-- =====================================================================
-- Renderizações (ex-"Personalizações IA", 21/11/2026)
--
-- Pedido: a tela Comercial › Personalizações IA passa a se chamar "Renderizações" e recebe também as renderizações
-- feitas pelo Módulo 3D (3D Livre, imagens da Helena montadas no 3D). Mesma tabela, tipo novo 'render3d': a Edge
-- Function studio-ai-engine grava cada renderização do 3D logo depois de gerar (personalizacao-acervo.mjs,
-- guardarRender3d), no bucket público personalizacoes-ia, pasta <empresa>/_renders3d/.
-- =====================================================================

alter table public.comercial_personalizacoes_ia drop constraint if exists comercial_personalizacoes_ia_tipo_check;
alter table public.comercial_personalizacoes_ia add constraint comercial_personalizacoes_ia_tipo_check
  check (tipo in ('tecido', 'tinta', 'render3d'));

create or replace function public.comercial_render3d_salvar(
  p_empresa uuid, p_cliente uuid, p_usuario uuid, p_dados jsonb,
  p_path text, p_url text, p_mime text, p_tamanho bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v comercial_personalizacoes_ia; moveis text;
begin
  if p_cliente is not null and not exists (select 1 from clientes_empresas where id = p_cliente and empresa_id = p_empresa)
    then raise exception 'Cliente não pertence à empresa'; end if;
  if p_path is null or p_path not like p_empresa::text || '/_renders3d/%' or p_url is null then raise exception 'Arquivo inválido'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 30000 then raise exception 'Dados inválidos'; end if;
  moveis := nullif(left(coalesce((select string_agg(distinct x, ', ') from jsonb_array_elements_text(coalesce(p_dados->'moveis', '[]')) x), ''), 300), '');
  insert into comercial_personalizacoes_ia (empresa_id, cliente_id, item_id, item_nome, item_codigo, categoria, titulo, tipo,
    path, url, mime_type, tamanho_bytes, criado_por, personalizacao, storage_bucket)
  values (p_empresa, p_cliente, null, 'Composição 3D', null, 'Módulo 3D', coalesce(moveis, 'Renderização do Módulo 3D'), 'render3d',
    p_path, p_url, p_mime, p_tamanho, p_usuario, p_dados, 'personalizacoes-ia')
  returning * into v;
  return to_jsonb(v);
end $$;
revoke all on function public.comercial_render3d_salvar(uuid, uuid, uuid, jsonb, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.comercial_render3d_salvar(uuid, uuid, uuid, jsonb, text, text, text, bigint) to service_role;

-- Quem cadastrou: o nome sai junto (a tela mostra "por <nome>").
create or replace function public.comercial_personalizacoes_ia_carregar(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.seguranca_2fa_ok()
    or not public.funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão para acessar Renderizações' using errcode = '42501';
  end if;
  return jsonb_build_object('fotos', (select coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('cliente_nome', c.nome_razao,
      'criado_por_nome', coalesce(fa.nome, us.nome))
    order by f.criado_em desc, f.id), '[]'::jsonb) from comercial_personalizacoes_ia f
    left join clientes_empresas c on c.id = f.cliente_id and c.empresa_id = f.empresa_id
    left join funcionarios_acesso fa on fa.id = f.criado_por
    left join usuarios us on us.id = f.criado_por
    where f.empresa_id = p_empresa_id));
end $$;
