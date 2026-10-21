// As imagens do projeto ja sao reduzidas no upload. Usa o arquivo salvo,
// sem depender do servico opcional de transformacao de imagens.
export function imagemOriginalProjeto(url){
  if(typeof url !== 'string' || !url.includes('/storage/v1/render/image/public/projetos/')) return url;
  try{
    const original=new URL(url);
    original.pathname=original.pathname.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
    for(const chave of ['width','height','quality','resize','format'])original.searchParams.delete(chave);
    return original.href;
  }catch{return url;}
}

export function configurarImagensRender(root, { recuperar } = {}){
  const tentar=img=>{
    const url=new URL(img.dataset.cpjImagemOriginal,document.baseURI);
    url.searchParams.set('_tentativa',String(Date.now()));
    img.dataset.cpjImagemTentativa='1';
    img.src=url.href;
  };
  root.addEventListener('error',event=>{
    const img=event.target;
    if(img.tagName!=='IMG' || !img.dataset.cpjImagemOriginal)return;
    if(!img.dataset.cpjImagemTentativa){tentar(img);return;}
    const figura=img.closest('.cpj-render');
    if(!figura || figura.querySelector('.cpj-render-erro'))return;
    img.style.visibility='hidden';
    const aviso=document.createElement('div');aviso.className='cpj-render-erro';
    aviso.setAttribute('role','status');
    const texto=document.createElement('span');texto.textContent='Nao foi possivel carregar a imagem.';
    const botao=document.createElement('button');botao.type='button';botao.textContent='Tentar novamente';
    botao.addEventListener('click',event=>{event.stopPropagation();tentar(img);});
    aviso.append(texto,botao);
    if(recuperar && img.dataset.cpjImagemCena){
      const recriar=document.createElement('button');recriar.type='button';recriar.textContent='Recuperar foto do 3D';
      recriar.addEventListener('click',async event=>{
        event.stopPropagation();recriar.disabled=true;recriar.textContent='Recuperando imagem...';
        try{await recuperar(figura.dataset.cpjRender);}
        catch(error){texto.textContent=error.message;recriar.disabled=false;recriar.textContent='Recuperar foto do 3D';}
      });
      aviso.appendChild(recriar);
    }
    figura.appendChild(aviso);
  },true);
  root.addEventListener('load',event=>{
    const img=event.target;
    if(img.tagName!=='IMG' || !img.dataset.cpjImagemOriginal)return;
    img.style.visibility='';img.closest('.cpj-render')?.querySelector('.cpj-render-erro')?.remove();
  },true);
}
