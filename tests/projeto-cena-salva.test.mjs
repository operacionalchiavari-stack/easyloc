import test from 'node:test';
import assert from 'node:assert/strict';
import {carregarCenaSalva} from '../Modulos/Comercial/Catalogo/projeto-cena-salva.mjs';
const snapshot={version:1,objects:[],roomWidth:10,roomDepth:10};
test('reabre a cena preservada mesmo se o arquivo remoto foi removido',async()=>{
 const cena={url:'https://antiga/cena.json',snapshot};
 const recuperada=await carregarCenaSalva(cena,{fetcher:()=>{throw Error('Não deve consultar a rede');}});
 assert.deepEqual(recuperada,snapshot);recuperada.objects.push({});assert.equal(snapshot.objects.length,0);
});
test('recupera falha temporária e guarda snapshot para a próxima abertura',async()=>{
 const cena={url:'https://storage/cena.json'};let chamadas=0;
 assert.deepEqual(await carregarCenaSalva(cena,{fetcher:async()=>++chamadas===1?{ok:false,status:503}:{ok:true,json:async()=>snapshot}}),snapshot);
 assert.equal(chamadas,2);assert.deepEqual(cena.snapshot,snapshot);
});
test('recupera pelo caminho do Storage quando a URL antiga não existe',async()=>{
 const cena={url:'https://antiga/cena.json',path:'empresa/cenas/1.json'};
 const supabase={storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'https://nova/cena.json'}})})}};
 assert.deepEqual(await carregarCenaSalva(cena,{supabase,fetcher:async url=>({ok:url.includes('nova'),status:404,json:async()=>snapshot})}),snapshot);
});
test('não inventa outra composição se a cena original está indisponível',async()=>{
 await assert.rejects(carregarCenaSalva({url:'https://storage/cena.json'},{fetcher:async()=>({ok:false,status:404})}),/imagem foi preservada/);
});
