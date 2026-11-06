(function(){
 'use strict';
 const $=id=>document.getElementById(id),normalizar=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const filtros=()=>({termos:normalizar($('receberBusca').value).split(/\s+/).filter(Boolean)});
 $('receberBusca').oninput=()=>window.ContasReceber.filtrar(filtros());
 (async()=>{try{await window.ContasReceber.abrir($('contasReceberConteudo'),filtros());}catch(e){window.alerta?.(e.message,'Contas a receber','erro');}finally{window.finalizarCarregamentoModulo?.();}})();
})();
