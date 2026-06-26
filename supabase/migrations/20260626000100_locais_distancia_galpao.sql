alter table public.locais_empresas
add column if not exists latitude numeric,
add column if not exists longitude numeric,
add column if not exists distancia_galpao_km numeric,
add column if not exists distancia_galpao_texto text,
add column if not exists distancia_calculada_em timestamptz,
add column if not exists google_place_id text;

