-- Cofre (out/2026): os segredos do WhatsApp (Z-API) só podem ser gravados cifrados.
-- Quem cifra são as Edge Functions (supabase/functions/_shared/cofre.ts, chave ACERVO_COFRE_CHAVE nos segredos
-- das funções, fora do banco). O banco só recusa valor em texto puro, assim um erro futuro não volta a gravar aberto.
alter table public.zapi_credenciais drop constraint if exists zapi_credenciais_cofre;
alter table public.zapi_credenciais add constraint zapi_credenciais_cofre check (
  instance_token like 'cofre:v1:%'
  and (client_token = '' or client_token like 'cofre:v1:%')
  and webhook_secret like 'cofre:v1:%'
);
-- O valor padrão antigo do webhook_secret (md5 em texto puro) violaria a trava: a função sempre manda o valor.
alter table public.zapi_credenciais alter column webhook_secret drop default;
comment on table public.zapi_credenciais is 'Segredos cifrados (cofre:v1). Abrir só pelas Edge Functions com ACERVO_COFRE_CHAVE.';
