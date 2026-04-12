const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    // Validar payload
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { empresa_id, pergunta } = req.body;
    if (!empresa_id || !pergunta) {
      return res.status(400).json({ error: 'Missing empresa_id or pergunta' });
    }

    const payload = req.body;
    const { data, error } = await supabaseServer.functions.invoke('rag-buscar-conhecimento', { body: payload });
    if (error) {
      return res.status(500).json({ error: error.message || error });
    }
    return res.json(data);
  } catch (err) {
    console.error('Erro em /api/search:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));