import { layoutDoModelo, mesclarLayout, normalizarLayout } from './projeto-layout.mjs?v=20260922-designer';

export function layoutDaProposta(design) {
  return normalizarLayout(mesclarLayout(layoutDoModelo(design.modelo), {
    fonte: design.fonte,
    cores: { usarDoDecorador: false, principal: design.principal, destaque: design.destaque, fundoPagina: design.fundo, tomSuave: design.suave, fundoCartoes: design.fundo },
    capa: { estilo: design.capa, textoAbertura: design.abertura, subtitulo: design.subtitulo },
    pagina: { fluxo: 'ambientes', navegacao: 'fixa', movimento: design.movimento, espaco: design.espaco },
    pdf: { orientacao: design.pdf_orientacao },
    ambientes: { renders: design.renders },
    conteudo: { titulo: design.titulo, introducao: design.introducao },
    rodape: { mensagem: design.encerramento },
  }));
}

export const designerMarkup = () => `<section class="lay-designer" aria-label="Designer de apresentações com IA">
  <div class="lay-designer-heading"><span class="lay-designer-badge">ESTÚDIO CRIATIVO · IA</span><h2>Vamos criar a atmosfera<br>do seu evento?</h2><p>Conte sua ideia. Sua designer prepara a direção visual e os textos da landing page e do PDF para você revisar.</p></div>
  <div class="lay-designer-brief">
    <label>Qual é a sua visão?<textarea data-design-brief maxlength="3000" rows="4" placeholder="Ex.: casamento ao ar livre, sofisticado e acolhedor. Quero tons de verde e areia, fotos grandes e uma navegação leve entre cerimônia, lounge e jantar."></textarea></label>
    <label>Direção de estilo<select data-design-style><option value="livre">Deixar a designer propor</option><option value="classico">Clássico</option><option value="romantico">Romântico</option><option value="vibrante">Vibrante</option><option value="moderno">Moderno</option><option value="editorial">Editorial</option><option value="minimalista">Minimalista</option><option value="noturno">Noturno</option></select></label>
    <button type="button" class="cpj-btn" data-design-generate>Criar proposta com IA ↗</button>
    <p class="lay-designer-status" data-design-status role="status" aria-live="polite">Você revisa a proposta antes de salvar. Nada é enviado ao cliente.</p>
  </div>
  <div class="lay-designer-result" data-design-result hidden>
    <span class="lay-designer-badge">PROPOSTA PARA REVISÃO</span><h3 data-design-name></h3><p data-design-concept></p>
    <div class="lay-designer-actions"><button type="button" class="cpj-btn" data-design-apply>Salvar como novo layout</button><button type="button" class="cpj-btn cpj-btn-outline" data-design-pdf>Revisar PDF</button><button type="button" class="cpj-btn cpj-btn-outline" data-design-discard>Descartar proposta</button></div>
    <p>Confira o resultado na prévia. Salve a proposta para fazer ajustes manuais, ou altere o briefing para gerar outra versão.</p>
  </div>
</section>`;

export function ligarDesigner(root, helpers) {
  const panel = root.querySelector('.lay-designer');
  if (!panel) return;
  const status = panel.querySelector('[data-design-status]');
  const generate = panel.querySelector('[data-design-generate]');
  const result = panel.querySelector('[data-design-result]');
  const apply = panel.querySelector('[data-design-apply]');
  let proposal = null, saving = false;
  panel.querySelector('[data-design-pdf]').addEventListener('click', () => { if(proposal) helpers.pdf(); });
  const contextId = helpers.contextId();
  const current = () => panel.isConnected && contextId === helpers.contextId();
  generate.addEventListener('click', async () => {
    const briefing = panel.querySelector('[data-design-brief]').value.trim();
    if (briefing.length < 12) { status.textContent = 'Conte um pouco mais sobre a sua ideia (ao menos 12 caracteres).'; return; }
    generate.disabled = true;
    apply.disabled = true;
    status.textContent = 'A designer está preparando a direção visual e os textos…';
    try {
      const payload = await helpers.payload();
      if (!current()) return;
      const { data, error } = await helpers.generate({
        prompt: briefing,
        scene: { estilo: panel.querySelector('[data-design-style]').value, evento: payload.projeto?.noivos,
          local: payload.projeto?.local_evento, ambientes: (payload.projeto?.ambientes || []).map(a => ({ nome: a.nome, notas: a.notas, fotos: a.renders?.length || 0 })) },
      });
      if (!current()) return;
      if (error || !data?.ok || !data.design) throw new Error(data?.erro || data?.details || error?.message || 'Não foi possível gerar a proposta. Tente novamente.');
      proposal = { design: data.design, config: layoutDaProposta(data.design) };
      panel.querySelector('[data-design-name]').textContent = proposal.design.nome;
      panel.querySelector('[data-design-concept]').textContent = proposal.design.conceito;
      result.hidden = false;
      helpers.preview(proposal.config);
      status.textContent = 'Proposta pronta. Explore os ambientes na prévia antes de salvar.';
    } catch (error) {
      if (current()) status.textContent = error.message;
    } finally {
      if (current()) { generate.disabled = false; apply.disabled = false; }
    }
  });
  panel.querySelector('[data-design-discard]').addEventListener('click', () => {
    if (saving || generate.disabled) return;
    proposal = null; result.hidden = true; helpers.preview(null);
    status.textContent = 'Proposta descartada. Seu layout anterior foi mantido.';
  });
  apply.addEventListener('click', async () => {
    if (!proposal || saving || !current()) return;
    saving = true; apply.disabled = true; generate.disabled = true;
    status.textContent = 'Salvando uma nova versão para você…';
    try { await helpers.apply(proposal); }
    catch (error) { if (current()) status.textContent = error.message; }
    finally { saving = false; if (current()) { apply.disabled = false; generate.disabled = false; } }
  });
}
