// 15/11/2026: Parâmetros > Produção > "Personalizações": tipos de personalização (aparecem no Cadastro de Personalizações),
// custo por hora, margem e acréscimos de complexidade. Grava em operacao_cadastros_salvar (junta com as categorias de insumos).
import {carregarCadastros,ligarMoeda,numeroMoeda,moedaBR} from '../../../js/shared/custos-personalizacao.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function montar(host){
 const card=document.createElement('section');card.className='pr-card pr-personalizacoes';card.id='prCardPersonalizacoes';
 card.innerHTML='<h3>Personalizações</h3><p class="pr-ajuda">Carregando…</p>';host.append(card);
 try{
  const ctx=await window.aguardarContexto(),sb=window.supabaseClient,config=await carregarCadastros(sb,ctx.empresa_id);
  let tipos=[...(config.tipos_personalizacao||[])];
  const c=config.custos;
  card.innerHTML='<h3>Personalizações</h3><p class="pr-ajuda">Os tipos aparecem para escolher no Cadastro de Personalizações. Custo por hora, margem e acréscimos de complexidade formam o preço sugerido de cada personalização.</p>'
   +'<form><div class="pr-grade">'
   +'<label class="pr-campo">Novo tipo de personalização<span style="display:flex;gap:8px"><input name="tipo" maxlength="60" placeholder="Ex.: Pintura"><button type="button" class="btn" data-adicionar>Adicionar</button></span></label>'
   +'<div data-tipos style="display:flex;gap:8px;flex-wrap:wrap;align-items:start;grid-column:1/-1"></div>'
   +'<label class="pr-campo">Custo por hora<input name="custo_hora" required value="'+esc(moedaBR(c.custo_hora))+'"><small>Valor da hora de trabalho nas etapas da produção</small></label>'
   +'<label class="pr-campo">Margem desejada sobre o custo (%)<input name="margem" type="number" min="0" max="1000000" step="0.01" required value="'+esc(c.margem)+'"></label>'
   +[['simples','Simples'],['media','Média'],['alta','Alta']].map(([k,t])=>'<label class="pr-campo">Taxa de complexidade '+t+' (%)<input name="'+k+'" type="number" min="0" max="1000" step="0.01" required value="'+esc(c.complexidades[k])+'"></label>').join('')
   +'</div><p class="pr-ajuda">Preço sugerido = custo × (1 + margem / 100) × (1 + taxa de complexidade / 100). Pedidos já fechados mantêm o preço da época.</p>'
   +'<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span><button type="submit" class="btn primary">Salvar personalizações</button></div></form>';
  const f=card.querySelector('form'),status=f.querySelector('[role=status]');ligarMoeda(f.elements.custo_hora);
  const pintar=()=>{card.querySelector('[data-tipos]').innerHTML=tipos.map((t,i)=>'<button type="button" data-remover="'+i+'" aria-label="Remover tipo '+esc(t)+'" style="border:1px solid #ced9e6;border-radius:20px;background:#f4f7fb;padding:7px 12px;font-size:13px">'+esc(t)+' ×</button>').join('')||'<small>Nenhum tipo cadastrado.</small>';};pintar();
  const adicionar=()=>{const v=f.elements.tipo.value.trim();if(v&&!tipos.some(t=>t.toLocaleLowerCase()===v.toLocaleLowerCase()))tipos.push(v);f.elements.tipo.value='';pintar();};
  card.addEventListener('click',e=>{const b=e.target.closest('[data-remover]');if(b){tipos.splice(Number(b.dataset.remover),1);pintar();}if(e.target.closest('[data-adicionar]'))adicionar();});
  f.elements.tipo.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();adicionar();}});
  f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;status.textContent='Salvando…';
   try{if(!tipos.length)throw Error('Cadastre pelo menos um tipo de personalização.');
    const custos={custo_hora:numeroMoeda(f.elements.custo_hora.value),margem:Number(f.elements.margem.value),complexidades:Object.fromEntries(['simples','media','alta'].map(k=>[k,Number(f.elements[k].value)]))};
    const r=await sb.rpc('operacao_cadastros_salvar',{p_empresa:ctx.empresa_id,p_config:{tipos_personalizacao:tipos,custos}});if(r.error)throw r.error;status.textContent='Personalizações salvas.';}
   catch(err){status.textContent=err.message;}finally{b.disabled=false;}});
 }catch(e){card.querySelector('p').textContent='Não foi possível carregar: '+e.message;}
}
// A aba Produção é desenhada por parametros-producao.mjs (troca o conteúdo do painel): espera o formulário dela aparecer.
const host=document.getElementById('pr-painel-producao');
if(host){
 const tentar=()=>{if(document.getElementById('prCardPersonalizacoes'))return true;if(host.querySelector('#producaoParametros')||/Não foi possível/.test(host.textContent)){montar(host);return true;}return false;};
 if(!tentar()){const ob=new MutationObserver(()=>{if(tentar())ob.disconnect();});ob.observe(host,{childList:true,subtree:true});}
}
