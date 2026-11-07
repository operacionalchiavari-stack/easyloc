type AvisoAndroid = { titulo: string; corpo: string; url?: string | null; tag?: string; user_id: string; empresa_id: string };
let cached: { email: string; token: string; expires: number } | null = null;
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encoded = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
const limit = (value: string, bytes: number) => new TextDecoder().decode(new TextEncoder().encode(value).slice(0, bytes));

async function accessToken(config: { client_email: string; private_key: string }) {
 if (cached?.email === config.client_email && cached.expires > Date.now()) return cached.token;
 const now = Math.floor(Date.now() / 1000);
 const unsigned = encoded({ alg: 'RS256', typ: 'JWT' }) + '.' + encoded({ iss: config.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
 const pem = config.private_key.replace(/-----[^-]+-----|\s/g, '');
 const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
 const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
 const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + base64url(signature) }), signal: AbortSignal.timeout(15000) });
 const result = await response.json();
 if (!response.ok || !result.access_token) throw Error('Falha na autorização do Firebase.');
 cached = { email: config.client_email, token: result.access_token, expires: Date.now() + Math.max(0, Number(result.expires_in || 3600) - 60) * 1000 };
 return cached.token;
}

export async function enviarFcm(token: string, aviso: AvisoAndroid) {
 try {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return { ok: false, invalid: false, erro: 'Firebase ainda não configurado no servidor.' };
  const config = JSON.parse(raw);
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(config.project_id || '') || !config.client_email || !config.private_key) throw Error('Configuração do Firebase inválida.');
  const access = await accessToken(config);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${config.project_id}/messages:send`, {
   method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
   body: JSON.stringify({ message: { token, data: { titulo: limit(aviso.titulo,160), corpo: limit(aviso.corpo,2200), url: limit(aviso.url || 'app.html',700), tag: limit(aviso.tag || 'aviso',96), user_id: aviso.user_id, empresa_id: aviso.empresa_id }, android: { priority: 'high', ttl: '86400s', restricted_package_name: 'br.com.chiavari.acervo' } } }), signal: AbortSignal.timeout(15000),
  });
  if (response.ok) return { ok: true, invalid: false, erro: '' };
  const body = await response.json();
  const invalid = body?.error?.details?.some((d: { errorCode?: string }) => d.errorCode === 'UNREGISTERED') === true;
  return { ok: false, invalid, erro: 'FCM: ' + String(body?.error?.status || response.status).slice(0, 80) };
 } catch (_) { return { ok: false, invalid: false, erro: 'Não foi possível conectar ao Firebase. Verifique a configuração do servidor.' }; }
}
