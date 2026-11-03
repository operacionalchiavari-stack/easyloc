(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let estado=null;
 window.RetornoColunas={
  async montar({caixa,lista,sb,empresa,pedido,feito}){
   const resposta=await sb.rpc('operacao_avarias_pedido',{p_pedido:pedido.id});
   if(resposta.error)throw Error(resposta.error.message);
   const avarias=resposta.data||[];
   const anterior=estado?.pedido===pedido.id?estado:null;
   estado={pedido:pedido.id,lista,sb,empresa,novas:anterior?.novas||new Map(),avarias};
   const tabela=caixa.querySelector('.cf-qtd-tabela');tabela.classList.add('cf-retorno-colunas');
   const cab=tabela.querySelector('.cf-qtd-cabeca');
   const primeira=feito?.primeira_contagem||{};
   if(feito){
    cab.children[3].textContent='2ª contagem';
    const th=document.createElement('span');th.textContent='1ª contagem';cab.insertBefore(th,cab.children[3]);
   }else{cab.children[2].textContent='1ª contagem';cab.children[3].textContent='2ª contagem';}
   const thD=document.createElement('span');thD.textContent='Danificados';cab.insertBefore(thD,cab.lastElementChild);
   const regs=new Map((feito?.itens||[]).map(r=>[r.chave,r]));
   tabela.querySelectorAll('.cf-qtd-linha:not(.cf-qtd-cabeca)').forEach((linha,i)=>{
    const p=lista[i],chave=p.chave;
    if(feito){const c=document.createElement('span');c.className='cf-primeira-valor';c.textContent=primeira[chave]??regs.get(chave)?.conferido??'—';linha.insertBefore(c,linha.children[3]);linha.querySelector('.cf-qtd-primeira')?.remove();const segunda=linha.querySelector('.cf-qtd-valor');if(segunda&&(!(chave in primeira)||Number(primeira[chave])===Number(regs.get(chave)?.esperado??p.esperado)))segunda.firstChild.textContent='—';}
    else{
     const inp=linha.querySelector('.cf-qtd-input'),coluna=linha.children[2],segunda=inp.parentElement;
     coluna.classList.add('cf-primeira-celula');coluna.replaceChildren(inp);segunda.classList.add('cf-segunda-celula');
     const espera=document.createElement('span');espera.className='cf-segunda-espera';espera.textContent='—';segunda.append(espera);
    }
    const qtd=avarias.filter(a=>a.chave===chave||a.chave==='retorno:'+chave).reduce((n,a)=>n+Number(a.quantidade||0),0);
    const d=document.createElement('div');d.className='cf-danos-celula';
    d.innerHTML=feito?'<strong>'+esc(feito.danificados?.[chave]??qtd)+'</strong>':'<input type="number" min="0" step="1" inputmode="numeric" value="'+qtd+'" data-danificado="'+esc(chave)+'" aria-label="Danificados: '+esc(p.nome)+'"><label class="cf-foto-dano">+ Foto opcional<input type="file" accept="image/*" capture="environment" data-foto-dano="'+esc(chave)+'"></label><small data-dano-fotos></small>';
    linha.insertBefore(d,linha.lastElementChild);
    [...linha.children].forEach((celula,j)=>celula.dataset.coluna=cab.children[j]?.textContent||'');
    const foto=d.querySelector('[data-foto-dano]');if(foto)foto.onchange=async()=>{
     try{const file=foto.files[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Escolha uma foto de até 20 MB');
      const fotos=estado.novas.get(chave)||[];if(fotos.length>=6)throw Error('Até seis fotos por item');
      const imagem=await createImageBitmap(file),c=document.createElement('canvas'),f=Math.min(1,1600/Math.max(imagem.width,imagem.height));c.width=Math.round(imagem.width*f);c.height=Math.round(imagem.height*f);c.getContext('2d').drawImage(imagem,0,0,c.width,c.height);imagem.close();
      const blob=await new Promise(ok=>c.toBlob(ok,'image/jpeg',.82));if(!blob)throw Error('Não foi possível preparar a foto');
      fotos.push({id:crypto.randomUUID(),blob});estado.novas.set(chave,fotos);d.querySelector('[data-dano-fotos]').textContent=fotos.length+' foto(s) adicionada(s)';
     }catch(e){window.alerta?window.alerta(e.message,'Foto','aviso'):alert(e.message);}finally{foto.value='';}
    };
   });
  },
  segunda(quantidades){
   document.querySelectorAll('.cf-retorno-colunas .cf-qtd-linha:not(.cf-qtd-cabeca)').forEach(linha=>{
    const inp=linha.querySelector('.cf-qtd-input');if(!inp)return;
    const primeira=linha.querySelector('.cf-primeira-celula'),segunda=linha.querySelector('.cf-segunda-celula');
    const valor=document.createElement('span');valor.textContent=quantidades[inp.dataset.chave]??'—';
    primeira.replaceChildren(valor);segunda.querySelector('.cf-segunda-espera')?.remove();segunda.append(inp);
   });
  },
  async payload(caixa,quantidades){
   const danos={},fotos={};
   for(const inp of caixa.querySelectorAll('[data-danificado]')){
    const chave=inp.dataset.danificado,q=Number(inp.value);
    if(inp.value===''||!Number.isInteger(q)||q<0||q>Number(quantidades[chave]||0))throw Error('Danificados devem estar entre zero e a quantidade que voltou.');
    if(q===0&&(estado.novas.get(chave)||[]).length)throw Error('Informe a quantidade danificada do item que recebeu a foto.');
    danos[chave]=q;
    const antigas=estado.avarias.filter(a=>a.chave==='retorno:'+chave).flatMap(a=>(a.evidencias||[]).map(e=>e.path).filter(Boolean));
    const paths=[...antigas];
    for(const f of estado.novas.get(chave)||[]){if(!f.path){const caminho=estado.empresa+'/'+estado.pedido+'/avaria-'+f.id+'.jpg';const up=await estado.sb.storage.from('evidencias-operacionais').upload(caminho,f.blob,{contentType:'image/jpeg',upsert:false});if(up.error&&!['409','Duplicate'].includes(String(up.error.statusCode||up.error.error)))throw Error(up.error.message);f.path=caminho;}paths.push(f.path);}
    fotos[chave]=paths.slice(0,6);
   }
   return {p_danificados:danos,p_fotos:fotos};
  }
 };
})();
