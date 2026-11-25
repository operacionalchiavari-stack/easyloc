-- Identidade do agente, preservando sua chave, histórico e configurações por empresa.
update public.ia_agentes set nome='Luísa · Logística' where chave='montagem';
notify pgrst,'reload schema';
