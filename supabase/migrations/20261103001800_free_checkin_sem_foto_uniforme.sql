-- Nov/2026: o free não tira mais foto do uniforme no check-in. O responsável da etapa tira uma foto da equipe
-- no App do Montador, e o RH marca quem estava uniformizado no Pagamento de Freelancer.
-- Foto enviada por um app antigo ainda é guardada (só se for da pasta do próprio free).
create or replace function public.free_app_presenca(p_token text, p_vaga uuid, p_codigo text, p_gps jsonb)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare s app_sessoes := app_sessao(p_token, 'free'); v free_vagas_v; i free_inscricoes; cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  j int := free_janela()::int; ok boolean := false; k int; fase text; lat numeric := nullif(p_gps->>'lat', '')::numeric; lng numeric := nullif(p_gps->>'lng', '')::numeric;
  via text := case when p_gps->>'via' = 'codigo' then 'Código' else 'QR code' end;
  foto text := case when coalesce(p_gps->>'foto', '') ~ ('/operacao-fotos/' || s.pasta::text || '/') then p_gps->>'foto' end;
begin
  select * into v from free_vagas_v where id = p_vaga;
  if v.id is null then raise exception 'Vaga não encontrada.'; end if;
  select * into i from free_inscricoes where vaga_id = p_vaga and free_id = s.free_id and status = 'CONFIRMADO' for update;
  if i.id is null then raise exception 'Você não está confirmado nesta vaga.'; end if;
  if length(cod) = 6 then
    for k in reverse (j + 1)..(j - 3) loop
      if free_codigo_qr(p_vaga, k) = cod then ok := true; exit; end if;
    end loop;
  end if;
  if not ok then raise exception 'Código inválido ou vencido. Leia o QR code do líder de novo.'; end if;
  fase := free_fase(v.status, v.data, v.horario, i.checkin_em, i.checkout_em);
  if i.checkin_em is null then
    if fase = 'AGUARDANDO' then raise exception 'O check-in libera 3h antes do horário de encontro (%).', v.horario; end if;
    if fase = 'CANCELADA' then raise exception 'Esta vaga foi cancelada.'; end if;
    if fase = 'FALTOU' then raise exception 'O prazo do check-in acabou. Fale com o líder.'; end if;
    update free_inscricoes set data_ciente = v.data::text, horario_ciente = v.horario, checkin_em = now(), checkin_lat = lat, checkin_lng = lng,
      checkin_distancia = app_distancia_m(v.ponto_lat, v.ponto_lng, lat, lng), checkin_via = via, foto_uniforme = foto where id = i.id;
    return 'checkin';
  elsif i.checkout_em is not null then return 'jaConcluido';
  elsif now() - i.checkin_em < interval '20 minutes' then return 'checkinRecente';
  elsif fase = 'SEM_CHECKOUT' then raise exception 'O prazo do check-out acabou. Fale com o líder.';
  else
    update free_inscricoes set checkout_em = now(), checkout_lat = lat, checkout_lng = lng, checkout_distancia = app_distancia_m(v.ponto_lat, v.ponto_lng, lat, lng) where id = i.id;
    return 'checkout';
  end if;
end $function$;
