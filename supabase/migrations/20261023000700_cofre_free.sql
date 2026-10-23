-- Cofre, etapa 4b: CPF e chave PIX dos Free cifrados (a chave fica fora do banco, nas Edge Functions).
-- O app do Free não tem login do Acervo: cadastro, login e troca de PIX passam pela Edge Function free-protegido, que
-- cifra e calcula o índice do CPF e chama as funções abaixo (só o servidor executa). O app lê os próprios dados só com a máscara.
alter table public.free_cadastros add column if not exists cpf_hash text;
alter table public.free_cadastros add column if not exists cofre_mascaras jsonb not null default '{}'::jsonb;
create unique index if not exists free_cadastros_cpf_hash_uq on public.free_cadastros (empresa_id, cpf_hash) where cpf_hash is not null;

-- O que a tela pode mostrar: a máscara (dado no cofre) ou o valor antigo (anterior ao cofre)
create or replace function public.free_visivel(p_valor text, p_mascara text) returns text language sql immutable set search_path=public as $$
  select case when coalesce(p_valor, '') = '' then '' when p_valor like 'cofre:v1:%' then coalesce(nullif(p_mascara, ''), '••••') else p_valor end
$$;

create or replace function public.free_app_cadastrar_cofre(p_dados jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare c free_cadastros; emp uuid := gs_empresa_dona(); v_hash text := coalesce(p_dados->>'cpf_hash', '');
begin
  if array_length(regexp_split_to_array(trim(coalesce(p_dados->>'nome', '')), '\s+'), 1) < 2 then raise exception 'Informe o nome completo.'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' or coalesce(p_dados->>'cpf', '') not like 'cofre:v1:%' then raise exception 'CPF inválido. Confira os números.'; end if;
  if length(regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g')) < 10 then raise exception 'Informe um telefone com DDD.'; end if;
  if length(coalesce(p_dados->>'senha', '')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  if coalesce(p_dados->>'pix', '') not like 'cofre:v1:%' then raise exception 'Informe sua chave PIX para receber os pagamentos.'; end if;
  if exists (select 1 from free_cadastros f where f.empresa_id = emp and f.cpf_hash = v_hash) then raise exception 'Este CPF já está cadastrado. Faça login.'; end if;
  insert into free_cadastros (empresa_id, nome, cpf, cpf_hash, telefone, senha_hash, chave_pix, cofre_mascaras, status)
  values (emp, left(trim(p_dados->>'nome'), 120), p_dados->>'cpf', v_hash, left(trim(p_dados->>'telefone'), 30),
          extensions.crypt(p_dados->>'senha', extensions.gen_salt('bf')), p_dados->>'pix', coalesce(p_dados->'mascaras', '{}'::jsonb), 'pendente')
  returning * into c;
  return free_nova_sessao(c);
end $$;

create or replace function public.free_app_login_cofre(p_cpf_hash text, p_senha text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c free_cadastros;
begin
  select * into c from free_cadastros where empresa_id = gs_empresa_dona() and cpf_hash = p_cpf_hash;
  if c.id is null or c.senha_hash is null or c.senha_hash <> extensions.crypt(coalesce(p_senha, ''), c.senha_hash) then raise exception 'CPF ou senha incorretos.'; end if;
  if c.status = 'bloqueado' then raise exception 'Seu cadastro está bloqueado. Fale com a empresa.'; end if;
  return free_nova_sessao(c);
end $$;

create or replace function public.free_app_pix_cofre(p_token text, p_pix text, p_mascara text) returns boolean language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free');
begin
  if coalesce(p_pix, '') not like 'cofre:v1:%' then raise exception 'Informe uma chave PIX válida.'; end if;
  update free_cadastros set chave_pix = p_pix, cofre_mascaras = cofre_mascaras || jsonb_build_object('pix', coalesce(p_mascara, '')) where id = s.free_id;
  return true;
end $$;

revoke all on function public.free_app_cadastrar_cofre(jsonb) from public, anon, authenticated;
revoke all on function public.free_app_login_cofre(text, text) from public, anon, authenticated;
revoke all on function public.free_app_pix_cofre(text, text, text) from public, anon, authenticated;
grant execute on function public.free_app_cadastrar_cofre(jsonb) to service_role;
grant execute on function public.free_app_login_cofre(text, text) to service_role;
grant execute on function public.free_app_pix_cofre(text, text, text) to service_role;

-- O próprio Free vê o CPF e o PIX só com a máscara
create or replace function public.free_app_dados(p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); c free_cadastros;
begin
  select * into c from free_cadastros where id = s.free_id;
  return jsonb_build_object(
    'free', jsonb_build_object('id', c.id, 'nome', c.nome, 'cpf', public.free_visivel(c.cpf, c.cofre_mascaras->>'cpf'), 'telefone', c.telefone, 'pix', public.free_visivel(c.chave_pix, c.cofre_mascaras->>'pix'), 'status', upper(c.status), 'miniatura', coalesce(c.foto_url, ''), 'pasta', s.pasta),
    'vagas', case when c.status <> 'aprovado' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'idVaga', v.id, 'idEtapa', v.etapa_id, 'etapa', v.etapa, 'dataISO', v.data, 'horario', v.horario, 'pontoEncontro', v.ponto_encontro,
        'pontoLat', v.ponto_lat, 'pontoLng', v.ponto_lng, 'lider', v.lider, 'observacao', v.observacao, 'quantidade', v.quantidade,
        'status', v.status, 'valor', v.valor, 'modo', v.modo, 'preferidos', to_jsonb(v.preferidos), 'liberarEm', v.liber_em_txt,
        'inscricoes', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'idFree', i.free_id, 'nome', i.nome, 'status', i.status,
             'confirmadoEm', i.confirmado_em, 'cimaDaHora', i.cima_da_hora, 'dataCiente', i.data_ciente, 'horarioCiente', i.horario_ciente,
             'checkinEm', i.checkin_em, 'checkoutEm', i.checkout_em, 'presencaPor', i.presenca_por,
             'uniforme', (select avaliacao from free_rh_uniforme u where u.inscricao_id = i.id and i.free_id = c.id)))
           from free_inscricoes i where i.vaga_id = v.id), '[]')))
      from (select vv.*, to_char(vv.liberar_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') liber_em_txt from free_vagas_v vv) v
     where v.empresa_id = c.empresa_id and (v.status <> 'CANCELADA' or exists (select 1 from free_inscricoes i where i.vaga_id = v.id and i.free_id = c.id))
       and (v.data >= current_date - 15 or exists (select 1 from free_inscricoes i where i.vaga_id = v.id and i.free_id = c.id))), '[]') end);
end $$;
grant execute on function public.free_app_dados(text) to anon, authenticated;

-- As telas internas leem a máscara (o índice do CPF continua fora do alcance delas, como a senha).
grant select (cofre_mascaras) on public.free_cadastros to authenticated;
