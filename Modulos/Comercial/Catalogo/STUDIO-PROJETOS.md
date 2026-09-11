# Projetos e planejamento do Studio 3D

No catálogo, abra o editor 3D. O painel Projetos permite dar nome, salvar, abrir, criar outro projeto e importar/exportar um backup JSON. O salvamento automático acontece a cada cinco segundos enquanto existe uma cena e ao ocultar a página. Aguarde a mensagem de salvamento antes de fechar.

Os projetos ficam em IndexedDB, separados por empresa e usuário/decorador, neste navegador. Não há sincronização em nuvem; limpar os dados do navegador apaga os projetos locais. O backup incorpora fotos das paredes e planta, além dos identificadores dos móveis. Os GLBs continuam sendo carregados do catálogo: modelos removidos ou indisponíveis são informados na abertura, preservando o projeto original salvo.

Na vista superior, arraste o centro de uma parede desenhada para movê-la ou uma ponta para alterar seu comprimento e direção. As pontas ficam dentro dos limites do piso e o comprimento mínimo é 20 cm.

Em Decoradora IA, selecione os modelos, quantidade por modelo, afastamento das paredes, espaço entre móveis, espaço entre mesas e largura do corredor central. Valores são em metros, medidos nas bordas das caixas dos modelos. O algoritmo preserva móveis existentes, verifica paredes internas inclusive diagonais e relata itens que não couberam. É conservador: caixas retangulares podem deixar espaços adicionais em móveis curvos. Cadeiras e sua ocupação devem fazer parte dos modelos selecionados; não são inferidas ao selecionar somente uma mesa.

O briefing textual é enviado à ação plan_layout de studio-ai-engine. Nesta versão, a IA escolhe a zona preferencial de cada modelo (frente, fundo, esquerda, direita ou livre); o motor local calcula as posições. Não é treinamento de modelo nem interpretação irrestrita de todas as instruções de decoração. Em falhas da IA, a interface identifica a distribuição alternativa por medidas, sem interpretação do texto.

A função mantém a autenticação por empresa e sessão de catálogo e usa OPENAI_API_KEY e STUDIO_OPENAI_VISION_MODEL já existentes. A ação foi publicada no projeto Supabase vinculado em 05/09/2026. A chamada real ao provedor com sessão de cliente não foi exercitada nos testes.

A resposta estruturada segue a documentação oficial OpenAI: https://developers.openai.com/api/docs/guides/structured-outputs

Verificações:
- npm test
- node --test tests/studio-layout.test.mjs
- node --check Modulos/Comercial/Catalogo/catalogo-studio3d.mjs
- node --check Modulos/Comercial/Catalogo/catalogo.mjs
- PLAYWRIGHT_MODULE apontando para Playwright instalado, execute node tests/studio-browser.cjs. Usa Edge headless, servidor temporário na porta 5519 e catálogo de teste isolado. Verifica persistência após recarga, arraste de parede, montagem de três GLBs e reabertura. Não usa conta nem modifica dados de produção. Captura em outputs/studio-projects-test.png.
