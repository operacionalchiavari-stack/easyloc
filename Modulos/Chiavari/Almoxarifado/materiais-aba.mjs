import {montarTriagemMateriais,contarPedidosPendentesMateriais} from '../../Producao/materiais-triagem.mjs?v=20261103-recebimento-manual';
let controlador,carregando;
const root=document.getElementById('almoxMateriaisProducao');
function atualizarContador(dados){const el=document.getElementById('badgeMateriaisProducao');if(!el)return;const n=contarPedidosPendentesMateriais(dados.itens||[]);el.textContent=n?String(n):'';el.setAttribute('aria-label',n+' pedido(s) com materiais para separar');el.title=n===1?'1 pedido com materiais para separar':n+' pedidos com materiais para separar';}
window.AlmoxMateriaisProducao={
 async abrirAba(){
  if(controlador)return controlador.atualizar();
  if(carregando)return carregando;
  carregando=(async()=>{try{
   root.textContent='Carregando materiais da produção…';
   const sb=await window.almoxBanco(),empresa=window.empresaAlmox();if(!empresa)throw Error('Empresa não identificada.');
   const sessao=await sb.auth?.getSession?.();
   controlador=montarTriagemMateriais(root,{sb,empresa,usuario:sessao?.data?.session?.user?.id||'',aoEstoqueAlterado:()=>window.carregarDashboard?.(),aoAtualizarDados:atualizarContador});
   await controlador.atualizar();
  }catch(e){root.textContent='Não foi possível carregar os materiais: '+e.message;controlador=null;}finally{carregando=null;}})();
  return carregando;
 },
 suspender(){controlador?.pararCamera();}
};
window.AlmoxMateriaisProducao.abrirAba();
