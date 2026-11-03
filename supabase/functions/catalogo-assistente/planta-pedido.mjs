export const INSTRUCOES_PLANTA_AUTONOMA = `
MODO MONTAR PEDIDO PELA PLANTA — autorização explícita para escolher e montar.
Estas regras substituem o roteiro de perguntas/aprovações e a regra de não escolher peças.
Não faça perguntas nem peça confirmação de estilo, modelo, área, quantidade ou aprovação por ambiente.
Use o estilo informado; se faltar, use o perfil, depois a opção mais coerente disponível.
Leia a planta em alta resolução: identifique TODAS as áreas mobiliadas e conte os símbolos em cada uma.
Para cerimônia conte fileiras e assentos de cada lado separadamente, descontando corredores e espaços vazios.
Para mesas de convidados conte mesas e cadeiras desenhadas por mesa. Não transforme estoque em número de convidados.
Para lounges conte sofás, poltronas, pufes, mesas de centro e laterais. Inclua bolo, bar, buffet e exterior quando visíveis.
Não inclua pista, paredes, paisagismo ou estruturas que não sejam móveis do acervo. Não invente medidas.
Indique em evidencia como contou (ex.: 10 fileiras de 8 assentos = 80). Marque estimada quando a leitura não for exata.
Se a planta for ilegível, não fabrique uma lista: explique a limitação sem perguntas.
Busque os tipos necessários no acervo, podendo pesquisar várias categorias em paralelo. Use nomes e IDs reais.
Selecione alternativas próximas quando faltar estoque/estilo; explique substituições e faltas em observacoes, sem perguntar.
Confira a disponibilidade somando o mesmo móvel em TODOS os ambientes. Nunca use peças com disponibilidade desconhecida.
Depois das buscas, chame montar_pedido_planta UMA VEZ com a lista completa de ambientes e itens, não apenas uma proposta.
Não chame enviar_pedido e não reserve/aprove o pedido: monte a lista para revisão.
Não diga que o pedido está pronto sem a ferramenta retornar ok. A resposta final é o resumo das alterações realmente preparadas.
`;

export const FERRAMENTA_MONTAR_PLANTA = {type:'function',function:{
 name:'montar_pedido_planta',description:'Monta toda a lista da planta em um lote validado. Não pede aprovações por ambiente.',
 parameters:{type:'object',properties:{observacoes:{type:'string'},ambientes:{type:'array',minItems:1,maxItems:40,items:{type:'object',properties:{nome:{type:'string'},itens:{type:'array',minItems:1,maxItems:100,items:{type:'object',properties:{item_id:{type:'string'},quantidade:{type:'integer',minimum:1,maximum:999},evidencia:{type:'string'},estimada:{type:'boolean'}},required:['item_id','quantidade','evidencia','estimada']}}},required:['nome','itens']}}},required:['ambientes','observacoes']}
}};

export const FERRAMENTA_PLANTA_ILEGIVEL={type:'function',function:{name:'planta_ilegivel',description:'Encerra a leitura sem alterar itens quando não é possível distinguir os móveis da planta.',parameters:{type:'object',properties:{motivo:{type:'string'}},required:['motivo']}}};

export function validarMontagemPlanta(plano,{projeto,acharItem,disponibilidade,areasEsperadas=/** @type {string[]} */([])}){
 if(!projeto)throw Error('Abra um pedido ou projeto antes de montar pela planta.');
 if(!Array.isArray(plano?.ambientes)||!plano.ambientes.length||plano.ambientes.length>40)throw Error('A planta precisa ter de 1 a 40 ambientes identificados.');
 const normalizar=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const ambientes=[],vistos=new Set(),totais=new Map(),alvos=new Set();
 for(const area of plano.ambientes){
  const nome=String(area.nome||'').trim().slice(0,60),chave=normalizar(nome);
  if(!nome||vistos.has(chave)||!Array.isArray(area.itens)||!area.itens.length||area.itens.length>100)throw Error('Ambiente vazio, repetido ou com itens inválidos.');
  vistos.add(chave);const itens=[],ids=new Set();
  for(const linha of area.itens){
   const item=acharItem(linha.item_id),quantidade=Number(linha.quantidade);
   if(!item||!Number.isInteger(quantidade)||quantidade<1||quantidade>999||ids.has(item.id))throw Error('A lista contém peça inexistente, repetida ou quantidade inválida.');
   if(!String(linha.evidencia||'').trim())throw Error('Informe a evidência de contagem de cada item.');
   ids.add(item.id);alvos.add(chave+'\0'+item.id);totais.set(item.id,(totais.get(item.id)||0)+quantidade);
   itens.push({item_id:item.id,nome:item.nome,quantidade,evidencia:String(linha.evidencia).slice(0,400),estimada:linha.estimada===true});
  }
  ambientes.push({nome,itens});
 }
 if(areasEsperadas.length){
  const esperadas=new Set(areasEsperadas.map(normalizar));
  if(vistos.size!==esperadas.size||[...esperadas].some(nome=>!vistos.has(nome)))throw Error('Inclua todos os ambientes demarcados, usando os nomes fornecidos, sem acrescentar áreas não selecionadas.');
 }
 for(const amb of projeto.ambientes||[])for(const linha of amb.itens||[]){
  if(!alvos.has(normalizar(amb.nome)+'\0'+linha.item_id))totais.set(linha.item_id,(totais.get(linha.item_id)||0)+Number(linha.quantidade||0));
 }
 for(const [id,total] of totais){
  const d=disponibilidade?.get(id);
  if(!d||!Number.isFinite(d.livre)||total>d.livre)throw Error(`Estoque insuficiente ou não confirmado: ${acharItem(id)?.nome||id}; necessário ${total}, livre ${d?.livre??'não confirmado'}. Escolha alternativas disponíveis sem pedir confirmação.`);
 }
 return {tipo:'montar_planta',ambientes,observacoes:String(plano.observacoes||'').slice(0,3000)};
}

export function resumoMontagemPlanta(acao){
 return 'Lista montada a partir da planta, por ambiente:\n\n'+acao.ambientes.map(a=>'**'+a.nome+'**\n'+a.itens.map(i=>'- '+i.quantidade+'× '+i.nome+(i.estimada?' (estimativa)':'')+' — '+i.evidencia).join('\n')).join('\n\n')+(acao.observacoes?'\n\n'+acao.observacoes:'');
}
