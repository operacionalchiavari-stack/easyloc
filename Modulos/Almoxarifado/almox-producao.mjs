// Aba "Pedidos a separar" do Almoxarifado novo (16/11/2026): materiais das ordens de produção, separados por pedido
// (mesma tela que ficava em "Materiais da produção" no almoxarifado antigo).
import {montarTriagemMateriais,contarPedidosPendentesMateriais} from '../Producao/materiais-triagem.mjs?v=20261116-modal-triagem';
let controlador,carregando;
function atualizarContador(dados){
  const el=document.getElementById('toSeparateBadge');if(!el)return;
  const n=contarPedidosPendentesMateriais(dados.itens||[]);el.textContent=String(n);el.hidden=!n;
  el.title=n===1?'1 pedido com materiais para separar':n+' pedidos com materiais para separar';
}
window.AlmoxMateriaisProducao={
  async abrirAba(){
    if(controlador)return controlador.atualizar();
    if(carregando)return carregando;
    const root=document.getElementById('toseparateTab');if(!root)return;
    carregando=(async()=>{try{
      root.innerHTML='<div class="acv-card"><p class="empty-state">Carregando materiais da produção…</p></div>';
      await window.aguardarContexto?.();
      await window.AlmoxDemo?.ready;
      const sb=window.TecnoweldAPI.getClient(),empresa=window.empresaAlmox();if(!empresa)throw Error('Empresa não identificada.');
      const sessao=await sb.auth?.getSession?.();
      root.innerHTML='<div class="acv-card acv-producao" id="almoxMateriaisProducao"></div>';
      controlador=montarTriagemMateriais(root.firstElementChild,{sb,empresa,fotosNaFila:true,usuario:sessao?.data?.session?.user?.id||'',
        aoEstoqueAlterado:()=>window.carregarDashboard?.(),aoAtualizarDados:atualizarContador});
      await controlador.atualizar();
    }catch(e){root.innerHTML='<div class="acv-card"><p class="empty-state">Não foi possível carregar os materiais: '+window.escAlmox(e.message)+'</p></div>';controlador=null;}finally{carregando=null;}})();
    return carregando;
  },
  suspender(){controlador?.pararCamera?.();}
};
// Conta os pedidos já ao abrir a tela (bolinha da aba).
window.aguardarContexto?.().then(()=>window.AlmoxMateriaisProducao.abrirAba());
