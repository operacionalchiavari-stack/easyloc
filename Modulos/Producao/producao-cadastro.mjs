export function criarEditorEtapas(tempoInput) {
  const host=document.createElement('section');host.className='producao-cadastro';
  tempoInput.closest('.form-row').after(host);
  let etapas=[];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function calcular(){
    if(etapas.length){tempoInput.value=etapas.reduce((s,e)=>s+Number(e.horas||0),0).toFixed(2);tempoInput.readOnly=true;}
    else tempoInput.readOnly=false;
    tempoInput.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function pintar(){
    host.innerHTML=`<h3>Etapas da produção</h3><p>Horas por peça. Fases menores são executadas primeiro; etapas da mesma fase podem ocorrer em paralelo. Sem etapas, o sistema usa o tipo e o tempo por unidade acima. Os materiais cadastrados são entregues na primeira etapa.</p>
    <div class="producao-etapas-editor">${etapas.map((e,i)=>`<div data-etapa="${i}"><label>Etapa<input data-campo="nome" maxlength="80" value="${esc(e.nome)}"></label><label>Setor<select data-campo="setor">${[['pintura','Pintura'],['forracao','Forração'],['personalizacao','Personalização']].map(([v,t])=>`<option value="${v}" ${v===e.setor?'selected':''}>${t}</option>`).join('')}</select></label><label>Fase<input data-campo="grupo" type="number" min="1" max="30" value="${e.grupo}"></label><label>Horas / peça<input data-campo="horas" type="number" min="0.01" step="0.01" value="${e.horas}"></label><button type="button" data-remover="${i}" aria-label="Excluir etapa">×</button></div>`).join('')}</div><button type="button" data-adicionar>+ Adicionar etapa</button>`;
  }
  host.addEventListener('click',e=>{
    if(e.target.closest('[data-adicionar]')){etapas.push({nome:'',setor:'personalizacao',grupo:etapas.at(-1)?.grupo||1,horas:etapas.length?0.5:Number(tempoInput.value)||0.5});pintar();calcular();}
    const btn=e.target.closest('[data-remover]');if(btn){etapas.splice(Number(btn.dataset.remover),1);pintar();calcular();}
  });
  host.addEventListener('input',e=>{const c=e.target.dataset.campo;const i=e.target.closest('[data-etapa]')?.dataset.etapa;if(c&&i!==undefined){etapas[i][c]=['grupo','horas'].includes(c)?Number(e.target.value):e.target.value;calcular();}});
  return {set(v){etapas=structuredClone(v||[]);pintar();if(etapas.length)calcular();else tempoInput.readOnly=false;},get(){
    if(etapas.some(e=>!e.nome.trim()||e.horas<=0||e.grupo<1))throw Error('Preencha nome, fase e horas de todas as etapas de produção.');
    return structuredClone(etapas).sort((a,b)=>a.grupo-b.grupo);
  }};
}
