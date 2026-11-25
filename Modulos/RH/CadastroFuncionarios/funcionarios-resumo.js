(function () {
  'use strict';
  const hoje = () => {
    const partes = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const parte = tipo => partes.find(p => p.type === tipo).value;
    return `${parte('year')}-${parte('month')}-${parte('day')}`;
  };
  const dataBr = data => data ? String(data).slice(0,10).split('-').reverse().join('/') : '—';
  const dia = data => new Date(data+'T12:00:00Z');
  const distancia = (a,b) => Math.round((dia(b)-dia(a))/86400000);
  const norm = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const ficha = p => p?.ficha || {};
  const ativo = p => p.ativo !== false && ficha(p).status !== 'desligado';
  const vinculo = p => ficha(p).tipo_contrato || 'clt';
  const vinculos = {clt:'CLT',pj:'PJ',estagio:'Estágio',aprendiz:'Aprendiz',temporario:'Temporário',freelancer:'Freelancer',terceiro:'Terceiro'};

  async function carregar(client,empresa) {
    const data = hoje();
    async function rpc(nome,args) {
      const r = await client.rpc(nome,args);
      if(r.error) throw r.error;
      return r.data;
    }
    async function todos(tabela,campos) {
      const lista=[];
      for(let inicio=0;;inicio+=1000) {
        const r=await client.from(tabela).select(campos).eq('empresa_id',empresa).range(inicio,inicio+999);
        if(r.error) throw r.error;
        if(!Array.isArray(r.data)) throw new Error('Resposta inválida');
        lista.push(...r.data);
        if(r.data.length<1000) return lista;
      }
    }
    const consultas = {
      pessoas:()=>rpc('rh_pessoas',{p_empresa:empresa}),
      escala:()=>rpc('rh_escala_contexto',{p_empresa:empresa,p_inicio:data,p_fim:data}),
      documentos:()=>todos('rh_documentos','id,funcionario_id,nome,validade,treinamento_id,emissao'),
      exames:()=>todos('rh_exames','id,funcionario_id,nome,validade,exame_cadastro_id,data_realizacao'),
      examesCad:()=>todos('rh_exames_cadastro','id,nome,ativo,validade_meses,setores_obrigatorios'),
      treinos:()=>todos('rh_treinamentos','id,nome,ativo,setores_obrigatorios'),
      ferias:()=>todos('rh_ferias','funcionario_id,inicio,fim,status')
    };
    const chaves=Object.keys(consultas), resultados=await Promise.allSettled(chaves.map(k=>consultas[k]()));
    const resumo={data};
    resultados.forEach((r,i)=>{const k=chaves[i];resumo[k]=r.status==='fulfilled'&&(k==='escala'?Array.isArray(r.value?.dias)&&Array.isArray(r.value?.regras):Array.isArray(r.value))?r.value:null;});
    return resumo;
  }

  function pessoa(e,resumo) {
    const p=resumo?.pessoas?.find(p=>p.id===e.id);
    return {...e,ficha:p?.ficha||{}};
  }
  function tempo(e,resumo) {
    if(!e.data_admissao) return '';
    const p=pessoa(e,resumo), fim=!ativo(p)?ficha(p).desligamento_data:resumo?.data||hoje();
    if(!fim) return '';
    if(e.data_admissao>fim) return 'Admissão futura';
    const inicio=dia(e.data_admissao), final=dia(fim);
    let meses=(final.getUTCFullYear()-inicio.getUTCFullYear())*12+final.getUTCMonth()-inicio.getUTCMonth();
    if(final.getUTCDate()<inicio.getUTCDate()) meses--;
    meses=Math.max(0,meses);
    const anos=Math.floor(meses/12),resto=meses%12;
    if(!meses) return 'Menos de 1 mês';
    return (anos?anos+(anos===1?' ano':' anos'):'')+(anos&&resto?' e ':'')+(resto?resto+(resto===1?' mês':' meses'):'')+(!ativo(p)?' até o desligamento':' de empresa');
  }
  function regra(e,resumo) {
    return (resumo?.escala?.regras||[]).filter(r=>r.vigencia<=resumo.data&&(r.funcionario_id===e.id||!r.funcionario_id&&r.setor===e.setor))
      .sort((a,b)=>Number(!!b.funcionario_id)-Number(!!a.funcionario_id)||b.vigencia.localeCompare(a.vigencia))[0];
  }
  function situacao(e,resumo) {
    const p=pessoa(e,resumo);
    if(!ativo(p)) return {texto:'Inativo',cor:'neutro',detalhe:ficha(p).desligamento_data?'Desde '+dataBr(ficha(p).desligamento_data):''};
    if(!resumo) return {texto:'Consultando…',cor:'neutro'};
    const registro=resumo.escala?.dias.find(d=>d.funcionario_id===e.id&&d.data===resumo.data);
    if(!registro) return {texto:'Não disponível',cor:'neutro',detalhe:'Escala não consultada'};
    if(registro.motivo) {
      const motivo=registro.motivo;
      const periodos=motivo==='Férias'?resumo.ferias:(resumo.escala.ausencias||[]).filter(a=>({folga:'Folga',atestado:'Atestado',afastamento:'Afastamento',licenca:'Licença'})[a.tipo]===motivo);
      const atual=(periodos||[]).filter(a=>a.funcionario_id===e.id&&a.status!=='cancelada'&&a.inicio<=resumo.data&&a.fim>=resumo.data).sort((a,b)=>b.fim.localeCompare(a.fim))[0];
      const fim=atual?.fim||(motivo==='Afastamento'?ficha(p).afastamento_fim:null);
      return {texto:motivo,cor:/folga/i.test(motivo)?'atencao':'ausente',detalhe:fim?'Até '+dataBr(fim):''};
    }
    return regra(e,resumo)?{texto:'Trabalho previsto',cor:'ok'}:{texto:'Sem escala definida',cor:'neutro'};
  }
  const minutos = h => {
    const valor=t=>{const [hh,mm]=String(t||'').split(':').map(Number);return hh*60+mm;};
    return ((valor(h.fim)-valor(h.inicio)+1440)%1440)-Number(h.intervalo||0);
  };
  function jornada(e,resumo) {
    if(!resumo) return {texto:'Consultando…'};
    if(!resumo.escala) return {texto:'Não disponível'};
    const r=regra(e,resumo), c=r?.configuracao;
    if(!c) return {texto:'Não configurada'};
    const ds=[...(c.dias||[])].sort((a,b)=>a-b), nomes=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const texto=c.tipo==='ciclo'?`${c.trabalho} trabalho / ${c.folga} folga`:ds.length>2&&ds.every((d,i)=>!i||d===ds[i-1]+1)?nomes[ds[0]]+' a '+nomes[ds.at(-1)]:ds.map(d=>nomes[d]).join(', ');
    const hs=(c.tipo==='ciclo'?[c.horarios?.ciclo]:ds.map(d=>c.horarios?.[d])).filter(Boolean);
    const faixas=[...new Set(hs.map(h=>h.inicio+'–'+h.fim))];
    const carga=c.tipo==='ciclo'?minutos(hs[0]||{})*Number(c.trabalho)*7/(Number(c.trabalho)+Number(c.folga))/60:hs.reduce((n,h)=>n+minutos(h),0)/60;
    const detalhe=[faixas.length===1?faixas[0]:faixas.length?'Horários variados':'',Number.isFinite(carga)?carga.toLocaleString('pt-BR',{maximumFractionDigits:2})+' h/sem'+(c.tipo==='ciclo'?' em média':''):''].filter(Boolean).join(' · ');
    return {texto,detalhe,escopo:r.funcionario_id?'Regra individual':'Regra do setor'};
  }
  function pendencias(e,resumo,podeRh) {
    const p=pessoa(e,resumo), itens=[];
    if(!ativo(p)||e.gerenciado===false) return {itens,completo:true,inativo:!ativo(p)};
    const adicionar=(texto,cor='atencao')=>itens.push({texto,cor});
    if(!e.setor) adicionar('Setor não informado');
    if(!e.cargo) adicionar('Cargo não informado');
    if(!e.data_admissao&&(!podeRh||!resumo?.pessoas||['clt','aprendiz'].includes(vinculo(p)))) adicionar('Data de admissão não informada');
    if(!e.dados_rh?.whatsapp) adicionar('WhatsApp não informado');
    if(e.tem_pin===false) adicionar('PIN pendente');
    if(!podeRh) return {itens,completo:true,cadastro:true};
    const completo=!!resumo&&['pessoas','documentos','exames','examesCad','treinos'].every(k=>Array.isArray(resumo[k]));
    if(!completo) return {itens,completo:false};
    const validade=(nome,data)=>{if(!data)return;const n=distancia(resumo.data,data);if(n<0)adicionar(nome+' vencido em '+dataBr(data),'erro');else if(n<=30)adicionar(nome+' vence em '+dataBr(data));};
    resumo.documentos.filter(d=>d.funcionario_id===e.id&&!d.treinamento_id).forEach(d=>validade(d.nome,d.validade));
    if(!['pj','freelancer','terceiro'].includes(vinculo(p))) resumo.examesCad.filter(c=>c.ativo&&c.validade_meses&&(!c.setores_obrigatorios?.length||c.setores_obrigatorios.includes(e.setor))).forEach(c=>{
      const exame=resumo.exames.filter(x=>x.funcionario_id===e.id&&(x.exame_cadastro_id===c.id||!x.exame_cadastro_id&&norm(x.nome)===norm(c.nome))).sort((a,b)=>String(b.data_realizacao||'').localeCompare(String(a.data_realizacao||'')))[0];
      if(!exame) adicionar('Exame obrigatório não realizado: '+c.nome,'erro');else validade(c.nome,exame.validade);
    });
    resumo.treinos.filter(t=>t.ativo&&t.setores_obrigatorios?.includes(e.setor)).forEach(t=>{
      const certificado=resumo.documentos.filter(d=>d.funcionario_id===e.id&&d.treinamento_id===t.id).sort((a,b)=>String(b.emissao||'').localeCompare(String(a.emissao||'')))[0];
      if(!certificado) adicionar('Treinamento obrigatório não realizado: '+t.nome,'erro');else validade(t.nome,certificado.validade);
    });
    return {itens:itens.sort((a,b)=>Number(b.cor==='erro')-Number(a.cor==='erro')),completo:true};
  }
  window.FuncionariosResumo={carregar,hoje,dataBr,tempo,pessoa,vinculo:p=>vinculos[vinculo(p)]||vinculo(p),situacao,jornada,pendencias};
})();
