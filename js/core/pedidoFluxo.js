(function(){
 'use strict';
 window.PedidoFluxo={
  async fila(sb,empresa,setor){
   const pedidos=[];
   for(let de=0;;de+=500){
    const {data,error}=await sb.rpc('pedido_fluxo_fila',{p_empresa:empresa,p_setor:setor,p_de:de,p_limite:500});
    if(error)throw new Error(error.message);
    pedidos.push(...(data||[]));if(!data||data.length<500)return pedidos;
   }
  }
 };
})();
