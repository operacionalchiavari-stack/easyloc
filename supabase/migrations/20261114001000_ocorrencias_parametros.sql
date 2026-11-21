-- (2026-11-14) Parâmetros > Ocorrências: a empresa escolhe quais tipos de ocorrência acompanhar.
-- Tipo desligado não aparece no painel; os casos continuam guardados (religar mostra de novo, sem virar "resolvido").
alter table public.operacao_ocorrencias_regras add column if not exists tipos_desligados text[] not null default '{}';

create or replace function public.ocorrencias_painel(p_empresa uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare desligados text[];
begin
 if not public.ocorrencias_painel_pode(p_empresa) then raise exception 'Sem acesso ao painel de ocorrências';end if;
 perform public.ocorrencias_sincronizar(p_empresa);
 select coalesce(r.tipos_desligados,'{}') into desligados from (select 1) a left join operacao_ocorrencias_regras r on r.empresa_id=p_empresa;
 return (select coalesce(jsonb_agg(c.dados||jsonb_build_object('id',c.id,'detectada_em',c.primeira_deteccao,'atualizado_em',c.atualizado_em) order by c.primeira_deteccao desc),'[]')
   from operacao_casos_automaticos c where c.empresa_id=p_empresa and not (coalesce(c.dados->>'tipo','') = any(coalesce(desligados,'{}'))));
end $function$;
