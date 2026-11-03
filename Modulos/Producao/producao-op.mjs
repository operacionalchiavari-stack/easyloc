// Ordem de produção no modelo do tablet da Tecnoweld (out/2026): simplicidade e controle.
// Itens do pedido numa fila numerada; no item, uma etapa por vez com UM botão principal e, quando não dá,
// o motivo escrito. Roteiro e histórico logo abaixo, só para consulta.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const n=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
export const SETORES={pintura:'Pintura',forracao:'Forração',personalizacao:'Personalização'};
const ESTADOS={pendente:'Aguardando',execucao:'Em execução',pausada:'Pausada',conferencia:'Aguardando conferência',concluida:'Concluída',cancelada:'Cancelada'};
const MEDIDA=/\s*\((?:L|A|P)\)\s*[\d.,]+\s*m\b/gi;

export function nomeDoItem(t){
 const cheio=String(t.item_nome||t.snapshot?.personalizacao?.vinculo_nome||t.origem?.nome||'Item');
 return {nome:cheio.replace(MEDIDA,'').trim(),medidas:(cheio.match(MEDIDA)||[]).map(v=>v.trim()).join(' ')};
}
const ordenar=l=>[...l].sort((a,b)=>a.grupo-b.grupo||a.ordem-b.ordem);
export const etapasDoSetor=(t,setor)=>ordenar(t.etapas.filter(e=>['todos','almoxarifado'].includes(setor)||e.setor===setor));
export function etapaAtual(t,setor){const l=etapasDoSetor(t,setor);return l.find(e=>!['concluida','cancelada'].includes(e.estado))||null;}
const separadoNaoRecebido=(e,m)=>e.pacotes.filter(p=>p.estado==='separado').reduce((a,p)=>a+p.materiais.filter(v=>v.id===m.id).reduce((s,v)=>s+Number(v.quantidade),0),0);
export const faltaReceber=(e,m)=>Math.max(0,Number(m.necessario)-(Number(m.recebido)-Number(m.devolvido)));
export const faltaSeparar=(e,m)=>Math.max(0,faltaReceber(e,m)-separadoNaoRecebido(e,m));
export const pacotesRecebimentoManual=e=>(e.pacotes||[]).filter(p=>p.estado==='separado'&&p.modo_separacao!=='qr');

// O que a etapa pede agora: {tom, titulo, texto, principal:[acao,rotulo], extra:[[acao,rotulo]]}
export function situacao(t,e,dados){
 const pre=!['aprovado','enviado','finalizado'].includes(t.pedido.status);
 const lider=Boolean(dados.responsavel?.[e.setor]);const exec=Boolean(dados.executar);const almox=Boolean(dados.almox);
 const anterior=t.etapas.find(x=>x.grupo<e.grupo&&!['concluida','cancelada'].includes(x.estado));
 const materiais=e.materiais||[];
 const semVinculo=materiais.filter(m=>!m.produto_id);
 const aSeparar=materiais.filter(m=>m.produto_id&&faltaSeparar(e,m)>0);
 const aReceber=e.pacotes.filter(p=>p.estado==='separado');
 const faltaMaterial=materiais.some(m=>faltaReceber(e,m)>0)&&!dados.config?.material_incompleto;
 const prazo=!e.prazo_autorizado&&e.inicio_previsto&&new Date(e.inicio_previsto)<new Date();
 const r={tom:'ok',titulo:'',texto:'',principal:null,extra:[]};
 const bloqueio=(titulo,texto,principal=null)=>Object.assign(r,{tom:'bloqueio',titulo,texto,principal});
 if(t.cancelado)return bloqueio('Ordem encerrada','O histórico fica guardado. Sobras de material podem ser devolvidas pelo Almoxarifado.');
 if(t.pagamento?.liberada===false && ['pendente','pausada'].includes(e.estado))return bloqueio('Aguardando Financeiro',t.pagamento.mensagem||'O pagamento minimo para iniciar a producao ainda nao foi confirmado. Avise o supervisor.');
 if(t.revisao)return Object.assign(r,{tom:'bloqueio',titulo:'O Comercial alterou esta ordem',texto:'Nada pode ser executado até o responsável da área revisar.',principal:lider?['revisar','Revisar alteração']:null,extra:lider?[['cancelar_revisao','Encerrar ordem anterior']]:[]});
 if(pre)return bloqueio('Pré-reserva','O pedido ainda não foi confirmado pelo Comercial. A produção começa depois da confirmação.');
 if(e.estado==='execucao')return Object.assign(r,{tom:'execucao',titulo:'Em execução',texto:e.iniciada_em?`Iniciada em ${quando(e.iniciada_em)}`:'',principal:exec?['concluir','Concluir etapa']:null,extra:exec?[['pausar','Pausar']]:[]});
 if(e.estado==='conferencia')return lider?Object.assign(r,{tom:'conferencia',titulo:'Pronta para conferência',texto:'Confira a peça antes de liberar para a próxima etapa.',principal:['conferir','Conferir e liberar']})
  :bloqueio('Aguardando conferência','O responsável da área precisa conferir para liberar.');
 if(anterior)return bloqueio('Aguardando a etapa anterior',`${anterior.nome} (${SETORES[anterior.setor]||anterior.setor}) ainda não foi concluída.`);
 if(Number(e.horas)<=0)return bloqueio('Sem tempo de execução','Informe o tempo por peça no cadastro da personalização.');
 if(semVinculo.length&&faltaMaterial)return bloqueio('Material sem vínculo',`${semVinculo.map(m=>m.nome).join(', ')} precisa ser ligado a um material do Almoxarifado no cadastro da personalização.`);
 if(faltaMaterial){
  if(pacotesRecebimentoManual(e).length)return exec?Object.assign(r,{tom:'material',titulo:'Material separado',texto:'Confira o kit e confirme o recebimento dos materiais. A leitura de etiqueta não é obrigatória neste kit.',principal:['receber_manual','Confirmar recebimento dos materiais']})
   :bloqueio('Material separado','Aguardando a produção confirmar o recebimento dos materiais.');
  if(aReceber.length)return exec?Object.assign(r,{tom:'material',titulo:'Material separado',texto:'Leia o QR da etiqueta do pacote para receber o material.',principal:['receber','Receber material (ler QR)']})
   :bloqueio('Material separado','Aguardando a produção receber o pacote pelo QR.');
  if(aSeparar.length)return almox?Object.assign(r,{tom:'material',titulo:'Aguardando material',texto:'Separe o material e imprima a etiqueta do pacote.',principal:['separar','Separar materiais']})
   :bloqueio('Aguardando material','O Almoxarifado ainda não separou o material desta etapa.');
 }
 const outra=!dados.config?.material_incompleto&&t.etapas.find(x=>x.id!==e.id&&x.estado!=='cancelada'&&(x.materiais||[]).some(m=>faltaReceber(x,m)>0));
 if(outra)return bloqueio('Falta material de outra etapa',`A etapa ${outra.nome} ainda não recebeu todo o material. A ordem só começa com tudo recebido.`);
 if(prazo)return bloqueio('Prazo insuficiente','O horário previsto para começar já passou. O responsável da área precisa autorizar.',lider?['autorizar_prazo','Autorizar prazo']:null);
 if(!exec)return bloqueio(e.estado==='pausada'?'Pausada':'Pronta para começar','Você não tem permissão para executar a produção.');
 if(e.estado==='pausada')return Object.assign(r,{tom:'pausada',titulo:'Pausada',texto:e.motivo?`Motivo: ${e.motivo}`:'',principal:['retomar','Retomar']});
 return Object.assign(r,{tom:'pronta',titulo:'Pronta para começar',texto:'Material recebido e prazo dentro do previsto.',principal:['iniciar','Iniciar etapa']});
}

// Selo curto da etapa atual, usado na fila de itens
export function selo(t,setor,dados){
 const e=etapaAtual(t,setor);
 if(t.cancelado)return ['cancelada','Encerrada'];
 if(!e)return ['concluida','Concluída'];
 const s=situacao(t,e,dados);
 if(e.estado==='execucao')return ['execucao','Em execução'];
 if(e.estado==='pausada')return ['pausada','Pausada'];
 if(e.estado==='conferencia')return ['conferencia','Conferência'];
 if(s.tom==='material')return ['material','Aguardando material'];
 if(s.tom==='bloqueio')return ['bloqueio',s.titulo];
 return ['pronta','Pronta'];
}

export function linhaItem(t,i,ativo,setor,dados,miniatura){
 const {nome}=nomeDoItem(t);const [cls,txt]=selo(t,setor,dados);const e=etapaAtual(t,setor);
 const ref=Object.values(t.origem.personalizacao_escolhas||{}).map(c=>c?.codigo).filter(Boolean).join(' · ');
 return `<button type="button" class="opq-row is-${cls}${ativo?' is-ativo':''}" data-op-item="${esc(t.id)}" aria-pressed="${ativo}">
  <span class="opq-pos">${i+1}</span>${miniatura?`<img src="${esc(miniatura)}" alt="" loading="lazy">`:'<span class="opq-semfoto"></span>'}
  <span class="opq-main"><b>${esc(nome)}</b><small>${esc([`${n(t.origem.quantidade)} peça(s)`,ref,e?e.nome:''].filter(Boolean).join(' · '))}</small></span>
  <em class="opq-tag">${esc(txt)}</em>${t.urgente?'<i class="opq-urgente">Urgente</i>':''}</button>`;
}

function materiaisHtml(e,dados){
 if(!e.materiais.length)return '';
 return `<ul class="opc-materiais">${e.materiais.map(m=>{const falta=faltaReceber(e,m);const ok=falta<=0;
  return `<li class="${ok?'is-ok':'is-falta'}"><span class="opc-check" aria-hidden="true">${ok?'✓':''}</span><span>${esc(m.nome)}${!m.produto_id?' <i class="opc-alerta">sem vínculo</i>':''}</span><b>${n(Number(m.recebido)-Number(m.devolvido))} / ${n(m.necessario)} ${esc(m.unidade||'')}</b>${dados.almox&&Number(m.recebido)>Number(m.devolvido)?`<button type="button" class="opc-link" data-acao="devolver" data-etapa="${e.id}" data-material="${m.id}">Devolver sobra</button>`:''}</li>`;}).join('')}</ul>`;
}

export function etapaControleHtml(t,e,dados){
 if(!e)return `<section class="opc opc-concluida"><span class="opc-fase">✓</span><div><h3>Produção concluída</h3><p>Todas as etapas deste item foram concluídas.</p></div></section>`;
 const s=situacao(t,e,dados);const lider=dados.responsavel?.[e.setor];
 const extras=[...s.extra];
 for(const p of e.pacotes.filter(p=>p.estado!=='cancelado'))extras.push(['etiqueta',`Etiqueta do pacote ${p.id.slice(0,6)}`,p.id]);
 if(lider&&!t.cancelado)extras.push(['urgencia',t.urgente?'Retirar urgência':'Marcar urgência']);
 if(lider&&!t.cancelado&&s.tom!=='bloqueio'&&!e.prazo_autorizado&&e.inicio_previsto&&new Date(e.inicio_previsto)<new Date())extras.push(['autorizar_prazo','Autorizar prazo']);
 const b=([a,txt,pacote],cls)=>`<button type="button" class="${cls}" data-acao="${a}" data-etapa="${e.id}"${pacote?` data-pacote="${pacote}"`:''}>${esc(txt)}</button>`;
 return `<section class="opc opc-${s.tom}">
  <header class="opc-topo"><span class="opc-fase">${e.grupo}</span><div><small>Etapa atual · ${esc(SETORES[e.setor]||e.setor)}</small><h3>${esc(e.nome)}</h3></div><span class="opc-estado estado-${e.estado}">${ESTADOS[e.estado]}</span></header>
  <dl class="opc-prazo"><div><dt>Começar até</dt><dd>${quando(e.inicio_previsto)}</dd></div><div><dt>Concluir até</dt><dd>${quando(e.fim_previsto)}</dd></div><div><dt>Tempo previsto</dt><dd>${n(e.horas)} h</dd></div></dl>
  ${materiaisHtml(e,dados)}
  ${s.titulo&&s.titulo!==ESTADOS[e.estado]||s.texto?`<div class="opc-status">${s.titulo!==ESTADOS[e.estado]?`<strong>${esc(s.titulo)}</strong>`:''}${s.texto?`<p>${esc(s.texto)}</p>`:''}</div>`:''}
  ${s.principal&&!['iniciar','retomar','concluir'].includes(s.principal[0])?`<div class="opc-acao">${b(s.principal,'opc-principal')}</div>`:''}
  ${extras.length?`<div class="opc-extras">${extras.map(x=>b(x,x[0]==='pausar'?'opc-pausar':'opc-link')).join('')}</div>`:''}
 </section>`;
}

export function roteiroHtml(t,setor){
 const todas=ordenar(t.etapas);
 return `<nav class="op-timeline" aria-label="Roteiro de produção"><ol>${todas.map(e=>`<li class="op-timeline-${e.estado}"><strong>${esc(SETORES[e.setor]||e.setor)}</strong><small>${esc(e.nome)}</small></li>`).join('')}</ol></nav>`;
}

const ACOES={quantidade:'Registrou quantidade feita',iniciar:'Iniciou',retomar:'Retomou',pausar:'Pausou',concluir:'Concluiu',conferir:'Conferiu e liberou',autorizar_prazo:'Autorizou o prazo',urgencia:'Mudou a urgência',revisar:'Revisou a alteração',cancelar_revisao:'Encerrou a ordem anterior',separar:'Separou material',receber:'Recebeu material',receber_manual:'Confirmou recebimento manual',modo_separacao:'Registrou o modo de separacao',devolver:'Devolveu sobra',alteracao_comercial:'Comercial alterou o pedido'};
export function historicoHtml(lista,t,nomes){
 const ids=new Set(t.etapas.map(e=>e.id));
 const meus=lista.filter(h=>h.etapa_id?ids.has(h.etapa_id):h.detalhes?.item===t.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const etapa=id=>t.etapas.find(e=>e.id===id)?.nome||'';
 return `<details class="oph"${meus.length?'':' hidden'}><summary>Histórico <b>${meus.length}</b></summary><ul>${meus.map(h=>{const d=h.detalhes||{};
  const extra=d.motivo||(d.quantidade?`${n(d.quantidade)} · ${d.motivo||''}`:'');
  return `<li><time>${quando(h.created_at)}</time><span><b>${esc(ACOES[h.acao]||h.acao)}</b>${etapa(h.etapa_id)?` · ${esc(etapa(h.etapa_id))}`:''}${extra?`<small>${esc(extra)}</small>`:''}</span><em>${esc(nomes.get(h.usuario_id)||'')}</em></li>`;}).join('')}</ul></details>`;
}
