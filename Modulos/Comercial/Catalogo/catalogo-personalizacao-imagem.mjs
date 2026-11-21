async function imagemJpeg(src){
  const resposta=await fetch(new URL(src,document.baseURI).href,{mode:'cors'});
  if(!resposta.ok)throw Error('Foto indisponível');
  const url=URL.createObjectURL(await resposta.blob()),img=new Image();
  try{
    img.src=url;await img.decode();
    if(!img.naturalWidth||!img.naturalHeight)throw Error('Foto inválida');
    const escala=Math.min(1,1536/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*escala));canvas.height=Math.max(1,Math.round(img.naturalHeight*escala));
    const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.94);
  }finally{URL.revokeObjectURL(url);}
}

// A IA precisa da imagem do móvel; o ícone de foto ausente nunca é uma referência válida.
export async function prepararImagemPersonalizacao(item,{fotoPlaceholder,capturar3D}={}){
  const fotos=[item.photo,item.customizedPhoto,...(item.details||[]).map(d=>d.img)].filter(src=>src&&src!==fotoPlaceholder);
  for(const src of new Set(fotos)){
    try{return await imagemJpeg(src);}catch{/* Tenta a próxima foto ou o próprio modelo 3D. */}
  }
  if(item.glb&&capturar3D){
    const src=await capturar3D(item.id);
    if(src)return imagemJpeg(src);
  }
  throw Error('Este móvel está sem foto e sem modelo 3D disponível para personalizar. Cadastre uma foto ou um modelo 3D e tente novamente.');
}
