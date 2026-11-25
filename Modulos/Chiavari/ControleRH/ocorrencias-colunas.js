(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
  let funcionarios=[],historico=[],pessoas=[],registros=[],selecionada='todos',carregado=false;

  function organizar() {
    const mapa=new Map();
    funcionarios.forEach(f=>{
      const nome=String(f.nomeCompleto||'').trim();if(!nome)return;
      const chave=f.id?'id:'+f.id:'legado:'+JSON.stringify([norm(nome),norm(f.setor)]);
      mapa.set(chave,{chave,id:f.id,nome,setor:f.setor||'Sem setor',cargo:f.cargo||''});
    });
    registros=historico.map(o=>{
      const nome=String(o.funcionario||'').trim()||'Sem funcionário informado',setor=o.setor||'Sem setor';
      let chave=o.funcionarioId?'id:'+o.funcionarioId:null;
      if(!chave) {
        const iguais=[...mapa.values()].filter(p=>norm(p.nome)===norm(nome));
        const noSetor=iguais.filter(p=>norm(p.setor)===norm(setor));
        chave=(iguais.length===1?iguais[0]:noSetor.length===1?noSetor[0]:null)?.chave||'legado:'+JSON.stringify([norm(nome),norm(setor)]);
      }
      if(!mapa.has(chave))mapa.set(chave,{chave,id:o.funcionarioId,nome,setor,historico:true});
      return {...o,chavePessoa:chave};
    });
    pessoas=[...mapa.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.setor.localeCompare(b.setor,'pt-BR'));
    if(selecionada!=='todos'&&!mapa.has(selecionada))selecionada='todos';
  }
  function foto(p) {
    let url='';
    try {
      const emp=window.top.__CONTEXT?.empresa_id||window.__CONTEXT?.empresa_id||sessionStorage.getItem('empresa_id');
      const client=window.top.supabaseClient||window.supabaseClient;
      if(p.id&&emp)url=client?.storage?.from('avatares').getPublicUrl(emp+'/'+p.id+'.jpg')?.data?.publicUrl||'';
    } catch (_) {}
    const iniciais=p.nome.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();
    return '<span class="rh-ocor-foto">'+esc(iniciais)+(url&&/^https?:\/\//i.test(url)?'<img src="'+esc(url)+'" alt="" loading="lazy">':'')+'</span>';
  }
  function dataMes(o) {
    const data=String(o.dataOcorrencia||o.data||'');
    if(/^\d{4}-\d{2}-\d{2}/.test(data))return data.slice(0,7);
    const m=data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]:'';
  }
  function filtrar() {
    const busca=norm($('pesquisa').value),tipo=norm($('filtroTipo').value),mes=$('filtroMes').value;
    const filtrados=registros.filter(o=>(!tipo||norm(o.tipo)===tipo)&&(!mes||dataMes(o)===mes)&&(!busca||norm([o.funcionario,o.setor,o.tipo,o.observacao,o.responsavel,o.dataOcorrencia,o.data,o.horaOcorrencia].join(' ')).includes(busca)));
    const contagens=new Map();filtrados.forEach(o=>contagens.set(o.chavePessoa,(contagens.get(o.chavePessoa)||0)+1));
    const visiveis=pessoas.filter(p=>!busca||norm([p.nome,p.setor,p.cargo].join(' ')).includes(busca)||contagens.has(p.chave));
    const scroll=$('rhOcorFuncionarios').scrollTop;
    $('rhOcorFuncionarios').innerHTML='<button type="button" class="rh-ocor-pessoa rh-ocor-todos" data-ocor-pessoa="todos" aria-controls="rhOcorTabela" aria-pressed="'+(selecionada==='todos')+'"><span class="rh-ocor-pessoa-info"><strong>Todos os funcionários</strong><small>Histórico completo</small></span><span class="rh-ocor-conta">'+filtrados.length+'</span></button>'+
      visiveis.map(p=>'<button type="button" class="rh-ocor-pessoa" data-ocor-pessoa="'+esc(p.chave)+'" aria-controls="rhOcorTabela" aria-pressed="'+(selecionada===p.chave)+'">'+foto(p)+'<span class="rh-ocor-pessoa-info"><strong>'+esc(p.nome)+'</strong><small>'+esc([p.cargo,p.setor].filter(Boolean).join(' · '))+'</small>'+(p.historico?'<small>Somente no histórico</small>':'')+'</span><span class="rh-ocor-conta">'+(contagens.get(p.chave)||0)+'</span></button>').join('')+
      (!visiveis.length?'<p class="rh-ocor-vazio">'+(carregado?'Nenhum funcionário encontrado.':'Carregando funcionários…')+'</p>':'');
    $('rhOcorFuncionarios').scrollTop=scroll;
    const pessoa=pessoas.find(p=>p.chave===selecionada),lista=filtrados.filter(o=>selecionada==='todos'||o.chavePessoa===selecionada);
    $('rhOcorPessoaTitulo').textContent=pessoa?.nome||'Todas as ocorrências';
    $('rhOcorPessoaSetor').textContent=pessoa?[pessoa.cargo,pessoa.setor].filter(Boolean).join(' · '):'Selecione um funcionário para consultar seu histórico.';
    $('rhContagem').textContent=lista.length+(lista.length===1?' ocorrência':' ocorrências');
    $('tbody').innerHTML=lista.map(o=>{
      const classe=String(o.tipo||'').replace(/\s+/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return '<tr><td>'+esc(window.formatarDataExibicao(o.dataOcorrencia||o.data))+'</td><td>'+esc(o.horaOcorrencia||o.hora||'—')+'</td><td>'+esc(o.funcionario)+'</td><td>'+esc(o.setor)+'</td><td><span class="tag '+esc(classe)+'">'+esc(o.tipo)+'</span></td><td>'+esc(o.observacao)+'</td><td>'+esc(o.responsavel)+'</td></tr>';
    }).join('');
    $('rhOcorVazio').hidden=lista.length>0;
    $('rhOcorVazio').textContent=carregado?'Nenhuma ocorrência encontrada'+(pessoa?' para este funcionário':'')+(busca||tipo||mes?' com os filtros selecionados.':'.'):'Carregando ocorrências…';
  }
  $('rhOcorFuncionarios').addEventListener('click',e=>{
    const b=e.target.closest('[data-ocor-pessoa]');if(!b)return;
    selecionada=b.dataset.ocorPessoa;filtrar();
    [...$('rhOcorFuncionarios').querySelectorAll('[data-ocor-pessoa]')].find(el=>el.dataset.ocorPessoa===selecionada)?.focus({preventScroll:true});
  });
  $('rhOcorFuncionarios').addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.remove();},true);
  window.ControleRHColunas={
    filtrar,
    atualizarFuncionarios(lista){funcionarios=Array.isArray(lista)?lista:[];organizar();filtrar();},
    atualizarHistorico(lista){historico=Array.isArray(lista)?lista:[];carregado=true;organizar();filtrar();}
  };
  filtrar();
})();
