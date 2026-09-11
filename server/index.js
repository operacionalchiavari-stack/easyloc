const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();
const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_IMAGE_EDIT_MODEL = process.env.OPENAI_IMAGE_EDIT_MODEL || 'gpt-image-1.5';
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:5500,http://localhost:5500';
const allowedOrigins = APP_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '12mb' }));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase server configuration missing');
}

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getAuthorizedUser(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing user authorization');
    error.status = 401;
    throw error;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await authClient.auth.getUser();

  if (error || !user) {
    const authError = new Error('Invalid user session');
    authError.status = 401;
    throw authError;
  }

  return { user, authHeader };
}

async function assertCompanyAccess(userId, empresaId) {
  if (!empresaId) return;

  const { data: vinculo, error } = await supabaseServer
    .from('usuarios_empresas')
    .select('empresa_id')
    .eq('user_id', userId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error || !vinculo) {
    const accessError = new Error('User has no access to this company');
    accessError.status = 403;
    throw accessError;
  }
}

// endpoint que entrega apenas a config pública necessária ao frontend
app.get('/api/supabase-config', (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'config missing' });
  }
  return res.json({ SUPABASE_URL, SUPABASE_ANON_KEY });
});

app.post('/api/images/remove-background', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(501).json({ error: 'OPENAI_API_KEY not configured' });
    }

    const { user } = await getAuthorizedUser(req);
    const { empresa_id, image_base64, mime_type, filename } = req.body || {};

    await assertCompanyAccess(user.id, empresa_id);

    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'Missing image_base64' });
    }

    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const safeMime = allowedMimes.has(mime_type) ? mime_type : 'image/png';
    const cleanBase64 = image_base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image must be up to 5MB' });
    }

    const form = new FormData();
    form.append('model', OPENAI_IMAGE_EDIT_MODEL);
    form.append('image', new Blob([buffer], { type: safeMime }), filename || 'item.png');
    form.append('prompt', [
      'Remova totalmente o fundo desta foto de produto.',
      'Mantenha apenas o móvel ou item principal do acervo.',
      'Preserve textura, proporções, bordas, pés, braços e detalhes do material.',
      'Entregue o item centralizado com fundo transparente, sem sombra falsa e sem adicionar objetos.'
    ].join(' '));
    form.append('background', 'transparent');
    form.append('output_format', 'png');
    form.append('quality', 'medium');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'OpenAI image edit failed',
        code: data?.error?.code || null,
      });
    }

    const editedBase64 = data?.data?.[0]?.b64_json;
    if (!editedBase64) {
      return res.status(502).json({ error: 'OpenAI response did not include image data' });
    }

    return res.json({
      mime_type: 'image/png',
      image_base64: editedBase64,
      data_url: `data:image/png;base64,${editedBase64}`,
    });
  } catch (err) {
    console.error('Erro em /api/images/remove-background:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// proxy seguro para chamadas sensíveis (ex.: rag-buscar-conhecimento)
app.post('/api/search', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing user authorization' });
    }

    // Validar payload
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { empresa_id, pergunta } = req.body;
    if (!empresa_id || !pergunta) {
      return res.status(400).json({ error: 'Missing empresa_id or pergunta' });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid user session' });
    }

    const { data: vinculo, error: vinculoError } = await supabaseServer
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('user_id', user.id)
      .eq('empresa_id', empresa_id)
      .maybeSingle();

    if (vinculoError || !vinculo) {
      return res.status(403).json({ error: 'User has no access to this company' });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/rag-buscar-conhecimento`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: authHeader,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro em /api/search:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
