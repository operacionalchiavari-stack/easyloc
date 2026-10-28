(function(){'use strict';
 async function preparar(file,chave){
  if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Escolha uma foto de até 20 MB');
  const imagem=await createImageBitmap(file),escala=Math.min(1,1600/Math.max(imagem.width,imagem.height)),c=document.createElement('canvas');c.width=Math.round(imagem.width*escala);c.height=Math.round(imagem.height*escala);c.getContext('2d').drawImage(imagem,0,0,c.width,c.height);imagem.close();
  const blob=await new Promise(ok=>c.toBlob(ok,'image/jpeg',.82));if(!blob)throw Error('Não foi possível preparar a foto');
  const foto=await new Promise((ok,falha)=>{const f=new FileReader();f.onload=()=>ok(f.result);f.onerror=()=>falha(f.error);f.readAsDataURL(blob);});
  return {id:crypto.randomUUID(),chave,foto,descricao:'Evidência registrada pela equipe no evento'};
 }
 async function carregar(sb,empresa,pedido){const {data,error}=await sb.from('logistica_evidencias').select('*').eq('empresa_id',empresa).eq('pedido_id',pedido).order('criado_em');if(error)throw Error(error.message);
  const fotos=[];for(const e of data||[]){const {data:r,error}=await sb.storage.from('evidencias-operacionais').createSignedUrl(e.path,600);if(!error)fotos.push({...e,url:r.signedUrl});}return fotos;
 }
 function render(host,existentes,novas,remover){host.replaceChildren();for(const e of [...existentes,...novas]){const wrap=document.createElement('span'),a=document.createElement('a'),img=document.createElement('img');a.href=e.url||e.foto;a.target='_blank';a.rel='noopener';img.src=e.url||e.foto;img.alt=e.descricao||'Evidência';img.style.cssText='width:64px;height:64px;object-fit:cover;border-radius:7px';a.title=e.criado_em?'Registrada em '+new Date(e.criado_em).toLocaleString('pt-BR')+' \u00b7 '+(e.criado_por_nome||'Equipe'):'Foto guardada neste dispositivo, aguardando confirmação';a.append(img);wrap.append(a);if(e.foto){const b=document.createElement('button');b.type='button';b.textContent='Remover';b.onclick=()=>remover(e.id);wrap.append(b);}host.append(wrap);}}
 window.EvidenciasOperacao={preparar,carregar,render};
})();
