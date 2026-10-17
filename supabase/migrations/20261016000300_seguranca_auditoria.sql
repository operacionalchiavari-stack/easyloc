-- (out/2026) Auditoria de segurança
-- 1) Planilhas dos sistemas da Chiavari (gs_*): gs_eh_da_equipe() aceitava usuário de QUALQUER empresa
--    (a EMPRESATESTE lia tudo). Agora só quem é da empresa dona dos sistemas (gs_empresa_dona()).
-- 2) Views sem security_invoker (rodavam como dono, sem filtro de empresa): o visitante sem login lia
--    plano/status/vencimento da assinatura de todas as empresas em vw_assinaturas_com_empresa.
-- 3) ia_buscar_dados_teste (sem uso) deixa de ser executável sem login.

create or replace function public.gs_empresa_dona() returns uuid
language sql immutable set search_path = public as $$
  select 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b'::uuid
$$;
revoke all on function public.gs_empresa_dona() from public, anon;
grant execute on function public.gs_empresa_dona() to authenticated, service_role;

create or replace function public.gs_eh_da_equipe()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select auth.uid() is not null
     and exists (select 1 from public.usuarios_empresas ue
                 where ue.user_id = auth.uid() and ue.empresa_id = public.gs_empresa_dona())
     and not exists (select 1 from public.funcionarios_acesso f where f.id = auth.uid() and f.ativo = false)
$function$;

alter view public.vw_assinaturas_com_empresa set (security_invoker = true);
alter view public.v_almoxarifado_dashboard set (security_invoker = true);
revoke select on public.vw_assinaturas_com_empresa from anon;
revoke select on public.v_almoxarifado_dashboard from anon;
revoke select on public.rh_funcionarios_lista from anon;

revoke execute on function public.ia_buscar_dados_teste(uuid, text, integer) from public, anon;
