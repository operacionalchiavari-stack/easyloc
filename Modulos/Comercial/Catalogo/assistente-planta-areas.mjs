import { renderPdfPage } from './catalogo-pdf.mjs';

const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function retanguloNormalizado(inicio,fim){
  const limitar=v=>Math.max(0,Math.min(1,v));
  const x=Math.min(limitar(inicio.x),limitar(fim.x)),y=Math.min(limitar(inicio.y),limitar(fim.y));
  return {x,y,w:Math.abs(limitar(fim.x)-limitar(inicio.x)),h:Math.abs(limitar(fim.y)-limitar(inicio.y))};
}

export async function demarcarAreasPlanta(arquivo){
  const origem=arquivo.type==='application/pdf'?await renderPdfPage(arquivo):arquivo;
  if(!origem)return null;
  const url=URL.createObjectURL(origem),imagem=new Image();imagem.src=url;
  try{
    await imagem.decode();
    return await new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='cas-planta-editor';
      dialog.setAttribute('aria-label','Demarcar ambientes da planta');
      dialog.innerHTML=`<header><div><h2>Marque os ambientes da planta</h2><p>Escolha um nome e arraste sobre a área. Cada recorte será enviado ampliado para a Helena.</p></div><button type="button" data-pa-cancelar aria-label="Fechar demarcação">×</button></header>
        <div class="cas-planta-editor-corpo"><div class="cas-planta-editor-principal"><label class="cas-planta-zoom">Zoom <input type="range" min="100" max="300" step="25" value="100" data-pa-zoom><output data-pa-zoom-valor>100%</output></label><div class="cas-planta-rolagem"><div class="cas-planta-palco" data-pa-palco><img src="${esc(url)}" alt="Planta para selecionar os ambientes" draggable="false"><div data-pa-caixas></div></div></div></div>
        <aside><label>Nome da próxima área<input type="text" maxlength="60" value="Cerimônia" list="cas-planta-tipos" data-pa-nome></label><datalist id="cas-planta-tipos"><option>Cerimônia</option><option>Lounge 1</option><option>Lounge 2</option><option>Mesas dos convidados</option><option>Bar</option><option>Buffet</option><option>Mesa do bolo</option><option>Área externa</option></datalist><p>Você pode marcar até 12 áreas. Arraste novamente para incluir outra; edite os nomes na lista.</p><div data-pa-lista></div></aside></div>
        <footer><p role="status" data-pa-status>Nenhuma área marcada.</p><button type="button" data-pa-cancelar>Cancelar</button><button type="button" class="cas-planta-confirmar" data-pa-concluir disabled>Usar áreas marcadas</button></footer>`;
      document.body.append(dialog);
      const $=s=>dialog.querySelector(s),areas=[];let inicio=null,rascunho=null,ocupado=false;
      const sair=resultado=>{dialog.close();dialog.remove();resolve(resultado);};
      const pintar=()=>{
        $('[data-pa-caixas]').innerHTML=[...areas,...(rascunho?[rascunho]:[])].map((a,i)=>`<div class="cas-planta-caixa" style="left:${a.x*100}%;top:${a.y*100}%;width:${a.w*100}%;height:${a.h*100}%"><span>${i+1}. ${esc(a.nome||'Nova área')}</span></div>`).join('');
        $('[data-pa-lista]').innerHTML=areas.map((a,i)=>`<div class="cas-planta-area"><b>${i+1}</b><input aria-label="Nome da área ${i+1}" maxlength="60" value="${esc(a.nome)}" data-pa-renomear="${i}"><button type="button" data-pa-remover="${i}" aria-label="Remover área ${i+1}">×</button></div>`).join('');
        $('[data-pa-concluir]').disabled=!areas.length||ocupado;
        $('[data-pa-status]').textContent=areas.length?`${areas.length} área(s) marcada(s).`:'Nenhuma área marcada.';
      };
      const palco=$('[data-pa-palco]');
      const ponto=event=>{const r=palco.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};};
      palco.addEventListener('pointerdown',event=>{
        if(ocupado||event.button!==0)return;
        if(areas.length>=12){$('[data-pa-status]').textContent='Limite de 12 áreas por planta.';return;}
        inicio=ponto(event);palco.setPointerCapture(event.pointerId);event.preventDefault();
      });
      palco.addEventListener('pointermove',event=>{
        if(!inicio)return;rascunho={...retanguloNormalizado(inicio,ponto(event)),nome:$('[data-pa-nome]').value.trim()};pintar();
      });
      palco.addEventListener('pointerup',event=>{
        if(!inicio)return;
        const r=retanguloNormalizado(inicio,ponto(event));inicio=null;rascunho=null;
        if(r.w*imagem.naturalWidth>=16&&r.h*imagem.naturalHeight>=16)areas.push({...r,nome:$('[data-pa-nome]').value.trim()||`Área ${areas.length+1}`});
        pintar();
      });
      palco.addEventListener('pointercancel',()=>{inicio=null;rascunho=null;pintar();});
      $('[data-pa-zoom]').addEventListener('input',event=>{palco.style.width=event.target.value+'%';$('[data-pa-zoom-valor]').textContent=event.target.value+'%';});
      $('[data-pa-lista]').addEventListener('input',event=>{
        const i=event.target.dataset.paRenomear;if(i===undefined)return;areas[Number(i)].nome=event.target.value;
        const label=$('[data-pa-caixas]').children[Number(i)]?.querySelector('span');if(label)label.textContent=`${Number(i)+1}. ${event.target.value}`;
      });
      $('[data-pa-lista]').addEventListener('click',event=>{const i=event.target.closest('[data-pa-remover]')?.dataset.paRemover;if(i!==undefined){areas.splice(Number(i),1);pintar();}});
      dialog.querySelectorAll('[data-pa-cancelar]').forEach(b=>b.addEventListener('click',()=>{if(!ocupado)sair(null);}));
      dialog.addEventListener('cancel',event=>{event.preventDefault();if(!ocupado)sair(null);});
      $('[data-pa-concluir]').addEventListener('click',async()=>{
        const nomes=areas.map(a=>a.nome.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
        if(nomes.some(n=>!n)||new Set(nomes).size!==nomes.length){$('[data-pa-status]').textContent='Use nomes diferentes para cada área, como Lounge 1 e Lounge 2.';return;}
        ocupado=true;pintar();$('[data-pa-status]').textContent='Preparando recortes em alta resolução…';
        try{
          const recortes=[];
          for(const [i,area] of areas.entries()){
            const sx=Math.round(area.x*imagem.naturalWidth),sy=Math.round(area.y*imagem.naturalHeight);
            const sw=Math.min(imagem.naturalWidth-sx,Math.round(area.w*imagem.naturalWidth)),sh=Math.min(imagem.naturalHeight-sy,Math.round(area.h*imagem.naturalHeight));
            const scale=Math.min(1,3200/Math.max(sw,sh)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
            const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(imagem,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
            const blob=await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('Não foi possível preparar o recorte.')),'image/jpeg',.96));
            recortes.push({file:new File([blob],`Área ${i+1} - ${area.nome.trim()}.jpg`,{type:'image/jpeg'}),area:area.nome.trim(),recorte:{x:area.x,y:area.y,w:area.w,h:area.h},origem:origem.name});
          }
          sair(recortes);
        }catch(error){ocupado=false;pintar();$('[data-pa-status]').textContent=error.message;}
      });
      dialog.showModal();
    });
  }finally{URL.revokeObjectURL(url);}
}
