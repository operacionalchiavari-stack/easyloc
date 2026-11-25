-- Câmera ao vivo nativa: escolha do codificador (25/11/2026). Num Galaxy A57 (Exynos) o vídeo chegava preto com o VP8 por
-- hardware. 'automatico' = H.264 por hardware (mais estável); 'compatibilidade' = VP8 pelo processador (funciona em qualquer
-- aparelho, gasta um pouco mais de bateria). Vale na próxima vez que a câmera for ligada.
alter table public.logistica_camera_config add column if not exists codificador text not null default 'automatico'
  check (codificador in ('automatico','compatibilidade'));

create or replace function public.camera_config_json(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('resolucao', coalesce(c.resolucao, '480p'), 'fps', coalesce(c.fps, 15),
    'bitrate_max', coalesce(c.bitrate_max, 900), 'som_permitido', coalesce(c.som_permitido, true),
    'codificador', coalesce(c.codificador, 'automatico'))
  from (select 1) x left join logistica_camera_config c on c.empresa_id = p_empresa
$$;

create or replace function public.camera_config_salvar(p_empresa uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.planejamento.editar'), false) then
    raise exception 'Sem permissão para mudar a qualidade das câmeras.'; end if;
  insert into logistica_camera_config(empresa_id, resolucao, fps, bitrate_max, som_permitido, codificador, atualizado_em, atualizado_por)
  values (p_empresa, coalesce(p_config->>'resolucao', '480p'), coalesce((p_config->>'fps')::int, 15),
          coalesce((p_config->>'bitrate_max')::int, 900), coalesce((p_config->>'som_permitido')::boolean, true),
          coalesce(p_config->>'codificador', 'automatico'), now(), auth.uid())
  on conflict (empresa_id) do update set resolucao = excluded.resolucao, fps = excluded.fps, bitrate_max = excluded.bitrate_max,
    som_permitido = excluded.som_permitido, codificador = excluded.codificador, atualizado_em = now(), atualizado_por = auth.uid();
  return camera_config(p_empresa);
end $$;
