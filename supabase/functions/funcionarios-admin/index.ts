import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
import { validateEmployee } from './validation.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const checked = (result: any) => { if (result.error) throw new Error(result.error.message); return result.data; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return response({ error: 'Método não permitido' }, 405);
  try {
    if (Number(req.headers.get('content-length') || 0) > 2_000_000) return response({ error: 'Foto muito grande' }, 413);
    const body = await req.json();
    // O próprio Auth valida a senha e aplica seus limites de autenticação.
    if (body.action === 'login') {
      const login = String(body.login || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!login || login.length > 160 || !password || password.length > 256) return response({ error: 'Login ou senha inválidos' }, 401);
      let email = login;
      if (!login.includes('@')) {
        const { data } = await admin.from('funcionarios_acesso').select('email').eq('login', login).maybeSingle();
        // Executa a mesma autenticação mesmo para login inexistente, sem expor o endereço cadastrado.
        email = data?.email || 'invalid-login@invalid.local';
      }
      const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await auth.auth.signInWithPassword({ email, password });
      if (error || !data.session) return response({ error: 'Login ou senha inválidos' }, 401);
      const { data: employee, error: employeeError } = await admin.from('funcionarios_acesso').select('ativo').eq('id', data.user.id).maybeSingle();
      if (employeeError || employee?.ativo === false) {
        await auth.auth.signOut();
        return response({ error: 'Acesso indisponível. Consulte o administrador.' }, 403);
      }
      return response({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
    }

    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return response({ error: 'Sessão necessária' }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return response({ error: 'Sessão inválida' }, 401);
    const empresa = String(body.empresa_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(empresa)) return response({ error: 'Empresa inválida' }, 400);
    const can = async (key: string) => checked(await admin.rpc('funcionario_pode', { p_empresa: empresa, p_usuario: user.id, p_chave: key })) === true;
    if (body.action === 'photo-urls') {
      if (!await can('rh.funcionarios.visualizar')) return response({ error: 'Acesso negado' }, 403);
      const paths = Array.isArray(body.paths) ? body.paths : [];
      if (paths.length > 100 || paths.some((p: unknown) => typeof p !== 'string' || !p.startsWith(`${empresa}/`) || p.includes('..'))) return response({ error: 'Fotos inválidas' }, 400);
      if (!paths.length) return response({ urls: [] });
      return response({ urls: checked(await admin.storage.from('funcionarios-fotos').createSignedUrls(paths, 3600)) });
    }
    if (body.action !== 'save') return response({ error: 'Ação inválida' }, 400);
    const employee = validateEmployee(body.employee, Boolean(body.id));
    const permission = body.id ? 'rh.funcionarios.editar' : 'rh.funcionarios.criar';
    if (!await can(permission)) return response({ error: 'Sem permissão para salvar funcionário' }, 403);
    if (body.permissions != null && !await can('configuracoes.permissoes.editar')) return response({ error: 'Sem permissão para gerenciar acessos' }, 403);
    if (!Array.isArray(body.permissions) && body.permissions != null) return response({ error: 'Permissões inválidas' }, 400);
    if (body.id === user.id) return response({ error: 'Seu próprio acesso deve ser alterado por outro administrador' }, 400);
    let id = body.id;
    let created = false;
    let oldPhoto = '';
    let currentEmail = employee.email;
    if (id) {
      const links = checked(await admin.from('usuarios_empresas').select('empresa_id').eq('user_id', id));
      if (!links.length || links.some((l: any) => l.empresa_id !== empresa)) return response({ error: 'Funcionário não pertence exclusivamente a esta empresa' }, 403);
      const old = checked(await admin.from('funcionarios_acesso').select('foto_url,email').eq('id', id).maybeSingle());
      oldPhoto = old?.foto_url || '';
      const existingAuth = checked(await admin.auth.admin.getUserById(id));
      currentEmail = existingAuth.user.email.toLowerCase();
    } else {
      if (!await can('configuracoes.permissoes.editar')) return response({ error: 'Sem permissão para criar uma conta de acesso' }, 403);
      const result = checked(await admin.auth.admin.createUser({ email: employee.email, password: employee.senha, email_confirm: true, user_metadata: { nome: employee.nome } }));
      id = result.user.id;
      created = true;
    }
    let uploaded = '';
    try {
      let photo = body.employee.foto_url || '';
      if (photo && photo !== oldPhoto) {
        // Aceita apenas a foto já existente da conta ou upload novo validado abaixo.
        const oldUser = checked(await admin.from('usuarios').select('avatar_url').eq('id', id).maybeSingle());
        if (photo !== oldUser?.avatar_url) throw new Error('Foto inválida');
      }
      if (body.photo) {
        if (typeof body.photo !== 'string' || body.photo.length > 1_500_000 || !/^data:image\/jpeg;base64,/.test(body.photo)) throw new Error('Foto inválida ou maior que 1 MB');
        const bytes = Uint8Array.from(atob(body.photo.split(',')[1]), c => c.charCodeAt(0));
        if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error('Foto JPEG inválida');
        uploaded = `${empresa}/${id}/${crypto.randomUUID()}.jpg`;
        checked(await admin.storage.from('funcionarios-fotos').upload(uploaded, bytes, { contentType: 'image/jpeg', upsert: false }));
        photo = uploaded;
      }
      const { senha, pin, ...fields } = employee;
      checked(await admin.rpc('funcionario_salvar', { p_empresa: empresa, p_ator: user.id, p_id: id, p_dados: { ...fields, email: currentEmail, foto_url: photo }, p_permissoes: body.permissions ?? null, p_pin: pin || null }));
    } catch (error) {
      if (uploaded) await admin.storage.from('funcionarios-fotos').remove([uploaded]);
      if (created) await admin.auth.admin.deleteUser(id);
      throw error;
    }
    // Permissões e status já estão persistidos; falha de senha é relatada explicitamente.
    let warning = '';
    if (!created && employee.email !== currentEmail) {
      const result = await admin.auth.admin.updateUserById(id, { email: employee.email, email_confirm: true });
      if (result.error) warning = 'Cadastro salvo, mas o e-mail não foi alterado. Confira se ele já pertence a outra conta.';
      else {
        const update = await admin.from('funcionarios_acesso').update({ email: employee.email }).eq('id', id).eq('empresa_id', empresa);
        if (update.error) {
          await admin.auth.admin.updateUserById(id, { email: currentEmail, email_confirm: true });
          warning = 'Cadastro salvo, mas não foi possível concluir a alteração do e-mail. Tente novamente.';
        }
      }
    }
    if (!created && employee.senha) {
      const { error } = await admin.auth.admin.updateUserById(id, { password: employee.senha });
      if (error) warning += ' Cadastro salvo, mas a senha não foi alterada. Tente novamente.';
    }
    if (uploaded && oldPhoto.startsWith(`${empresa}/${id}/`)) await admin.storage.from('funcionarios-fotos').remove([oldPhoto]);
    return response({ id, warning });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível salvar';
    return response({ error: /duplicate key|already.*registered/i.test(message) ? 'Login ou e-mail já cadastrado.' : message }, 400);
  }
});
