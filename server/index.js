const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();
const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ORIGIN = process.env.APP_ORIGIN || true;

app.use(cors({ origin: APP_ORIGIN }));
app.use(express.json());

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// endpoint que entrega apenas a config pública necessária ao frontend
app.get('/api/supabase-config', (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'config missing' });
  }
  return res.json({ SUPABASE_URL, SUPABASE_ANON_KEY });
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
