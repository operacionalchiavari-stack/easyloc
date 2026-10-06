// Otimização de modelos 3D (.glb) no próprio navegador, ANTES de subir pro Storage.
//
// Bug real que motivou isto: modelos gerados por IA (Meshy etc.) chegavam com 0,3 a 1,8 milhão de triângulos e
// texturas 2048–4096 px em JPEG (até 63 MB por arquivo). Um formato com 10 cadeiras de ~1 milhão de triângulos cada
// travava o 3D Livre. Os modelos que já estavam no sistema foram otimizados de uma vez (ver CLAUDE.md); esta função
// garante que os próximos envios já entrem leves.
//
// O que faz (mesma receita usada na otimização em lote, `@gltf-transform/cli optimize`):
// - remove dados duplicados/sem uso (dedup + prune);
// - acima de LIMITE_TRIANGULOS, simplifica a malha mirando ALVO_TRIANGULOS (weld + simplify com meshoptimizer);
// - texturas: no máximo LADO_TEXTURA px no maior lado, regravadas em WebP (EXT_texture_webp — o 3D Livre e o
//   model-viewer leem nativamente). Sem Draco/Meshopt de propósito: os carregadores do sistema não têm o decodificador.
// Se qualquer coisa falhar (biblioteca não carregou, arquivo diferente do esperado, navegador sem WebP), devolve o
// arquivo ORIGINAL — otimizar nunca pode impedir o envio.

const VERSAO = "4.5.1";
const LIMITE_TRIANGULOS = 150_000;
const ALVO_TRIANGULOS = 100_000;
const LADO_TEXTURA = 2048;

let libs = null;
function carregarLibs(){
  libs ??= Promise.all([
    import(`https://esm.sh/@gltf-transform/core@${VERSAO}`),
    import(`https://esm.sh/@gltf-transform/functions@${VERSAO}?deps=@gltf-transform/core@${VERSAO}`),
    import(`https://esm.sh/@gltf-transform/extensions@${VERSAO}?deps=@gltf-transform/core@${VERSAO}`),
    import("https://esm.sh/meshoptimizer@0.22.0"),
  ]).catch((error) => { libs = null; throw error; });
  return libs;
}

function contarTriangulos(doc){
  let total = 0;
  for(const mesh of doc.getRoot().listMeshes()){
    for(const prim of mesh.listPrimitives()){
      const indices = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      total += (indices ? indices.getCount() : pos?.getCount() || 0) / 3;
    }
  }
  return Math.round(total);
}

async function reduzirTextura(textura){
  const imagem = textura.getImage();
  const tipo = textura.getMimeType();
  if(!imagem || !/^image\/(png|jpeg|webp)$/.test(tipo)) return false;
  const bitmap = await createImageBitmap(new Blob([imagem], { type: tipo }));
  const escala = Math.min(1, LADO_TEXTURA / Math.max(bitmap.width, bitmap.height));
  if(tipo === "image/webp" && escala === 1){ bitmap.close?.(); return false; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if(!blob || blob.type !== "image/webp" || blob.size >= imagem.byteLength) return false;
  textura.setImage(new Uint8Array(await blob.arrayBuffer())).setMimeType("image/webp");
  if(textura.getURI()) textura.setURI(textura.getURI().replace(/\.(png|jpe?g)$/i, ".webp"));
  return true;
}

/**
 * @param {Blob|File} arquivo .glb original
 * @param {{ onEtapa?: (texto:string)=>void }} [opcoes]
 * @returns {Promise<{ arquivo: Blob, otimizado: boolean, antes: {bytes:number, triangulos?:number}, depois?: {bytes:number, triangulos:number} }>}
 */
export async function otimizarGlb(arquivo, { onEtapa } = {}){
  const antes = { bytes: arquivo.size };
  try{
    onEtapa?.("Preparando otimização do modelo…");
    const [{ WebIO }, { dedup, prune, weld, simplify }, { ALL_EXTENSIONS, EXTTextureWebP }, { MeshoptSimplifier }] = await carregarLibs();
    await MeshoptSimplifier.ready;
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    const doc = await io.readBinary(new Uint8Array(await arquivo.arrayBuffer()));
    antes.triangulos = contarTriangulos(doc);

    onEtapa?.("Otimizando o modelo 3D…");
    await doc.transform(dedup(), prune());
    if(antes.triangulos > LIMITE_TRIANGULOS){
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: ALVO_TRIANGULOS / antes.triangulos, error: 0.0005 }));
    }

    onEtapa?.("Otimizando as texturas…");
    let webp = false;
    for(const textura of doc.getRoot().listTextures()){
      try{ if(await reduzirTextura(textura)) webp = true; }catch{ /* textura que o navegador não decodifica fica como está */ }
    }
    if(webp || doc.getRoot().listTextures().some((t) => t.getMimeType() === "image/webp")){
      doc.createExtension(EXTTextureWebP).setRequired(true);
    }

    const saida = await io.writeBinary(doc);
    const depois = { bytes: saida.byteLength, triangulos: contarTriangulos(doc) };
    if(depois.bytes >= antes.bytes && depois.triangulos >= antes.triangulos) return { arquivo, otimizado: false, antes };
    const nome = arquivo.name || "modelo.glb";
    const novo = typeof File === "function" ? new File([saida], nome, { type: "model/gltf-binary" }) : new Blob([saida], { type: "model/gltf-binary" });
    return { arquivo: novo, otimizado: true, antes, depois };
  }catch(error){
    console.warn("Otimização do GLB não foi possível; enviando o original.", error);
    return { arquivo, otimizado: false, antes };
  }
}
