(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.CargaPorVeiculo={async abrir(sb,pedido,empresa,aoSalvar){
  const rpc=async(nome,args)=>{const r=await sb.rpc(nome,args);if(r.error)throw Error(r.error.message);return r.data;};
  const [base,frota]=await Promise.all([rpc('operacao_carga_veiculo_base',{p_pedido:pedido}),rpc('operacao_frota',{p_empresa:empresa})]);
  const d=document.createElement('dialog');d.className='cf-escolha-caminhao';
  d.innerHTML='<form><h3>Carga por caminh&#227;o</h3><p>Registre as quantidades neste ve&#237;culo. Salvar mant&#233;m o carregamento aberto para o pr&#243;ximo caminh&#227;o.</p><label>Caminh&#227;o<select name="veiculo" required><option value="">Selecione</option>'+frota.map(c=>'<option value="'+esc(c.id)+'">'+esc([c.codigo,c.placa,c.modelo].filter(Boolean).join(' · '))+'</option>').join('')+'</select></label><div data-itens></div><p data-erro role="status"></p><footer><button type="button" data-fechar>Voltar</button><button type="submit" '+(base.concluido?'disabled':'')+'>Salvar carga deste caminh&#227;o</button></footer></form>';
  const f=d.querySelector('form'),box=d.querySelector('[data-itens]');
  const render=()=>{const id=f.elements.veiculo.value,atual=base.veiculos.find(c=>c.caminhao_id===id);
   box.innerHTML=base.itens.map((p,i)=>{const outros=base.veiculos.filter(c=>c.caminhao_id!==id).reduce((s,c)=>s+Number(c.itens.find(x=>x.chave===p.chave)?.quantidade||0),0),q=atual?.itens.find(x=>x.chave===p.chave)?.quantidade||0;
    return '<label style="display:block;margin:12px 0">'+esc(p.nome)+'<small style="display:block">Pedido: '+p.esperado+' · Em outros caminhões: '+outros+' · Disponível para este: '+(p.esperado-outros)+'</small><input data-i="'+i+'" type="number" min="0" max="'+(p.esperado-outros)+'" step="1" required value="'+q+'" '+(base.concluido?'disabled':'')+'></label>';
   }).join('');};
  f.elements.veiculo.onchange=render;render();
  d.querySelector('[data-fechar]').onclick=()=>d.close();d.onclose=()=>d.remove();
  f.onsubmit=async ev=>{ev.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;
   try{const nova=await rpc('operacao_carga_veiculo_salvar',{p_pedido:pedido,p_caminhao:f.elements.veiculo.value,p_token:base.token,p_itens:base.itens.map((p,i)=>({chave:p.chave,quantidade:Number(box.querySelector('[data-i="'+i+'"]').value)}))});Object.assign(base,nova);aoSalvar?.(base);render();d.querySelector('[data-erro]').textContent='Carga salva. Selecione outro caminhão para registrar o saldo. O pedido continua em carregamento.';}
   catch(e){d.querySelector('[data-erro]').textContent=e.message;}finally{b.disabled=base.concluido;}
  };
  document.body.append(d);d.showModal();
 }};
})();
