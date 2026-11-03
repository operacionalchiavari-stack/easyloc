import {carregarCadastros,ligarMoeda,numeroMoeda,moedaBR} from '../../../js/shared/custos-personalizacao.mjs';
const campo=id=>document.getElementById(id);
async function init(){
 const custo=campo('prodValorCusto'),reposicao=campo('prodValorReposicao'),percentual=campo('prodReposicaoPercentual');
 ligarMoeda(custo);reposicao.readOnly=true;
 const calcular=()=>{reposicao.value=moedaBR(numeroMoeda(custo.value)*(1+Number(percentual.value||0)/100));};
 custo.addEventListener('input',calcular);percentual.addEventListener('input',calcular);calcular();
 try{
  const sb=await window.almoxBanco(),empresa=window.empresaAlmox();
  if(!empresa)throw Error('Empresa não identificada.');
  const config=await carregarCadastros(sb,empresa);
  window.__almoxCadastros=config;
  const busca=campo('filtroProduto');
  if(busca){const filtro=document.createElement('select');filtro.id='filtroSetorArmazenamento';filtro.setAttribute('aria-label','Filtrar insumos pelo setor de armazenamento');filtro.append(new Option('Todos os locais de estoque',''),...config.setores.map(v=>new Option(v,v)));(busca.closest('.filtro-box')||busca).after(filtro);filtro.addEventListener('change',()=>window.renderTabelaProdutos());}
  for(const [id,valores] of [['cadCategoria',config.categorias],['prodSetor',config.setores]]){
   const el=campo(id);el.replaceChildren(new Option('Selecione',''),...valores.map(v=>new Option(v,v)));
   el.disabled=false;
  }
 }catch(e){window.alertar?.('Não foi possível carregar categorias e setores: '+e.message);}
}
init();
