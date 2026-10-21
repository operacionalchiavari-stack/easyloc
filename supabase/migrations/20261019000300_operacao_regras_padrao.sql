-- Escala automática usa os valores padrão quando a empresa ainda não salvou os Parâmetros.
create or replace function public.operacao_regras_escala(p_empresa uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select escala from empresa_logistica_regras where empresa_id = p_empresa), '{
    "deslocamento_h": 1, "volume_padrao_m3": 10, "usar_free": true,
    "etapas": {
      "triagem":         {"equipe": "triagem",      "caminhao": false, "m3_por_pessoa": 20, "minimo": 1, "maximo": 3, "duracao_h": 3},
      "carregamento":    {"equipe": "carregamento", "caminhao": true,  "m3_por_pessoa": 20, "minimo": 2, "maximo": 4, "duracao_h": 2},
      "descarregamento": {"equipe": "carregamento", "caminhao": true,  "m3_por_pessoa": 20, "minimo": 2, "maximo": 4, "duracao_h": 2},
      "montagem":        {"equipe": "montagem",     "caminhao": true,  "m3_por_pessoa": 8,  "minimo": 2, "maximo": 8, "duracao_h": 5},
      "desmontagem":     {"equipe": "montagem",     "caminhao": true,  "m3_por_pessoa": 10, "minimo": 2, "maximo": 8, "duracao_h": 4}
    }
  }'::jsonb)
$$;
