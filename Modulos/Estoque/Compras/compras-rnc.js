(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  // (2026-10-10) layout próprio das janelas de RNC (Compras e Recebimento do Almoxarifado): campos empilhados e alinhados
  function ensureDialogStyle() {
    if (document.getElementById('crnc-dialog-style')) return;
    const st=document.createElement('style'); st.id='crnc-dialog-style';
    st.textContent=`
      .crnc-dialog{width:min(560px,calc(100vw - 32px));padding:0;border:0;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.28)}
      .crnc-dialog::backdrop{background:rgba(15,23,42,.45)}
      .crnc-dialog form{display:grid;gap:14px;padding:22px 24px 20px}
      .crnc-dialog h2{margin:0;font-size:20px;color:var(--tw-text,#071326)}
      .crnc-dialog p{margin:0;color:var(--tw-muted,#6b7789);font-size:13px;line-height:1.45}
      .crnc-dialog p:first-of-type{color:var(--tw-text,#071326);font-weight:700;font-size:14px}
      .crnc-dialog label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#41556f}
      .crnc-dialog label input:not([type=file]),.crnc-dialog label select,.crnc-dialog label textarea{width:100%;box-sizing:border-box}
      .crnc-dialog label textarea{min-height:90px;resize:vertical}
      .crnc-dialog label input[type=file]{padding:10px;border:1px dashed var(--tw-line,#d9dee6);border-radius:10px;background:var(--tw-surface-soft,#f6f7f9);font-size:12px}
      .crnc-dialog [data-error]{color:var(--tw-danger,#e30613);font-weight:700;min-height:0}
      .crnc-dialog [data-error]:empty{display:none}
      .crnc-dialog footer{display:flex;justify-content:flex-end;gap:10px;padding-top:6px;border-top:1px solid var(--tw-line-soft,#e8ebef)}
      .crnc-dialog footer .btn{min-width:110px}
      .crnc-summary{display:flex;gap:10px;flex-wrap:wrap}
      .crnc-summary span{display:grid;gap:2px;flex:1 1 180px;padding:10px 12px;border-radius:12px;background:var(--tw-surface-soft,#f6f7f9);border:1px solid var(--tw-line-soft,#e8ebef)}
      .crnc-summary small{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
      .crnc-summary b{font-size:15px;color:var(--tw-text,#071326)}
      .crnc-summary em{font-style:normal;font-size:11px;color:#64748b}
      .crnc-previews{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
      .crnc-previews:empty{display:none}
      .crnc-previews figure{margin:0;display:grid;gap:4px}
      .crnc-previews img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--tw-line,#d9dee6);background:#fff}
      .crnc-previews figcaption{font-size:10px;color:var(--tw-muted,#6b7789);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
    document.head.append(st);
  }
  function dialog(title, body) {
    ensureDialogStyle();
    const d=document.createElement('dialog'); d.className='dialog-card crnc-dialog';
    d.innerHTML=`<form><h2>${esc(title)}</h2>${body}<p role="alert" data-error></p><footer><button type="button" class="btn btn-secondary" data-close>Fechar</button><button class="btn btn-primary" type="submit">Salvar</button></footer></form>`;
    // prévia das fotos escolhidas (miniaturas logo abaixo do campo)
    d.querySelectorAll('input[type=file][accept*="image"]').forEach((input)=>{
      const box=document.createElement('div'); box.className='crnc-previews'; input.closest('label').after(box);
      let urls=[];
      input.addEventListener('change',()=>{
        urls.forEach((u)=>URL.revokeObjectURL(u)); urls=[];
        box.innerHTML=[...input.files].map((file)=>{const u=URL.createObjectURL(file);urls.push(u);return `<figure><img src="${u}" alt=""><figcaption title="${esc(file.name)}">${esc(file.name)}</figcaption></figure>`;}).join('');
      });
      d.addEventListener('close',()=>urls.forEach((u)=>URL.revokeObjectURL(u)));
    });
    document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d;
  }
  const photosOf = list => (list||[]).filter(a=>/^data:image\/(png|jpeg|webp|gif);base64,/i.test(a.conteudo||''));
  // Decisoes de Compras sobre a RNC de recebimento (o material fica bloqueado ate aqui).
  const DECISIONS = [
    ['aceitar','Aceitar como está','Libera o material para o estoque e avisa o almoxarifado para guardar.'],
    ['abater','Aceitar com abatimento','Libera o material; o desconto sai do Contas a Pagar e, se a nota já foi paga, vira crédito com o fornecedor no Financeiro.'],
    ['devolver_repor','Devolver — fornecedor repõe','O almoxarifado separa para o fornecedor buscar; o pedido volta a aguardar a reposição (sem nova cobrança).'],
    ['devolver_cancelar','Devolver — comprar de outro','O almoxarifado separa para o fornecedor buscar; o valor devolvido sai do Contas a Pagar (ou vira crédito) e as necessidades das OPs voltam para Compras.'],
  ];
  const DECISION_LABEL = Object.fromEntries(DECISIONS.map(([v,l])=>[v,l]));
  const DECISION_ICON = { aceitar:'circle-check', abater:'badge-percent', devolver_repor:'rotate-ccw', devolver_cancelar:'circle-x' };
  const REASON_LABEL = { quantidade_menor:'Faltou material', quantidade_maior:'Veio material a mais', material_avariado:'Material avariado', embalagem_danificada:'Embalagem danificada', produto_diferente:'Produto diferente do pedido', produto_nao_solicitado:'Produto não solicitado', lote_divergente:'Lote diferente', validade_divergente:'Validade diferente', outro:'Outro motivo' };
  const RECEIPT_DECISION_LABEL = { aceitar_quantidade:'Dar entrada no que chegou', receber_parcialmente:'Dar entrada no que chegou bom', deixar_pendente:'Segurar a entrada por enquanto', devolver_fornecedor:'Devolver ao fornecedor', recusar_item:'Devolver ao fornecedor' };
  const money = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  // (2026-11-04) RNC de recebimento em TELA INTEIRA (antes era janela): fotos, checklist do insumo no recebimento,
  // decisao escolhida da lista de Parametros -> Compras e o arquivo da decisao para enviar.
  const CHK_LABEL = { conforme:['Conforme','ok'], nao_conforme:['Não conforme','bad'], nao_se_aplica:['N/A','na'] };
  function ensureDecideStyle() {
    if (document.getElementById('crd-style')) return;
    const st=document.createElement('style'); st.id='crd-style';
    st.textContent=`
      #purchaseRncList tr[data-rnc-id]{cursor:pointer}
      #purchaseRncList table.crnc-table{table-layout:fixed!important;width:100%!important;min-width:0!important}
      #purchaseRncList table.crnc-table th,#purchaseRncList table.crnc-table td,#purchaseRncList table.crnc-table td *{white-space:normal!important}
      #purchaseRncList .tw-table-scroll{overflow-x:hidden}
      .crnc-table td{vertical-align:middle;overflow-wrap:anywhere}
      .crnc-table td small{display:block;margin-top:2px;color:var(--tw-muted,#6b7789);font-size:11.5px}
      #purchaseRncList .crnc-clamp{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35}
      .crnc-table td:nth-child(2) .crnc-clamp{font-weight:700;font-size:13px}
      .crnc-table .pv-status-pill{white-space:normal}
      .crd-3{grid-template-columns:minmax(240px,1fr) minmax(0,1.7fr) minmax(300px,1fr)!important}
      .crd-3>.pv-od-main{display:contents}
      @media(max-width:1150px){.crd-3{grid-template-columns:1fr!important}}
      .crd-hero{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
      .crd-hero button{aspect-ratio:1;padding:0;border:1px solid var(--tw-line,#d9dee6);border-radius:10px;overflow:hidden;background:#f6f7f9;cursor:zoom-in}
      .crd-hero img{display:block;width:100%;height:100%;object-fit:cover}
      .crd-nophoto{margin:0;padding:24px;border:1px dashed var(--tw-line,#d9dee6);border-radius:10px;color:var(--tw-muted,#6b7789);text-align:center;font-size:13px}
      .crd-report{display:grid;gap:6px;padding:12px 14px;border-radius:10px;background:var(--tw-surface-soft,#f6f7f9);border-left:4px solid var(--tw-danger,#e30613)}
      .crd-report p{margin:0;font-size:14px;color:var(--tw-text,#071326)}
      .crd-tag{justify-self:start;padding:2px 8px;border-radius:6px;background:#ffe4e6;color:#be123c;font-size:11px;font-weight:800}
      .crd-chk{width:100%;border-collapse:collapse;font-size:13px}
      .crd-chk th{padding:6px 8px;text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--tw-muted,#6b7789);border-bottom:1px solid var(--tw-line,#d9dee6)}
      .crd-chk td{padding:8px;border-bottom:1px solid var(--tw-line-soft,#e8ebef);vertical-align:top}
      .crd-chk tr.is-nc td{background:#fff5f5}
      .crd-chk .crd-thumbs{display:flex;gap:4px;flex-wrap:wrap}
      .crd-chk .crd-thumbs button{width:44px;height:44px;padding:0;border:1px solid var(--tw-line,#d9dee6);border-radius:6px;overflow:hidden;cursor:zoom-in;background:#fff}
      .crd-chk .crd-thumbs img{width:100%;height:100%;object-fit:cover;display:block}
      .crd-ans{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}
      .crd-ans.ok{background:#dcf7eb;color:#047857}.crd-ans.bad{background:#ffe4e6;color:#be123c}.crd-ans.na{background:#eef1f5;color:#64748b}
      .crd-choices{display:grid;gap:8px}
      .crd-choice{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border:1.5px solid var(--tw-line,#d9dee6);border-radius:10px;cursor:pointer;background:#fff;font-weight:500!important}
      .crd-choice:hover{border-color:#94a3b8}
      .crd-choice input{margin-top:3px;flex:0 0 auto}
      .crd-choice b{display:block;font-size:13px;color:var(--tw-text,#071326)}
      .crd-choice small{display:block;margin-top:2px;font-size:11.5px;line-height:1.35;color:var(--tw-muted,#6b7789);font-weight:500}
      .crd-choice.is-selected{border-color:var(--tw-brand-primary,#1A73FF);background:#f5f9ff;box-shadow:0 0 0 3px rgba(26,115,255,.12)}
      .crd-field textarea{min-height:90px;resize:vertical}
      .crd-field[hidden]{display:none!important}
      .crd-warn{margin:0;padding:10px 12px;border-radius:10px;background:#fff4d6;color:#92600a;font-size:12px;font-weight:600}
      .crd-hist-title{margin:0 0 8px;font-size:13px}.crd-hist{list-style:none;margin:0;padding:0;display:grid;gap:10px}.crd-hist li{display:flex;gap:10px;align-items:flex-start}.crd-hist li svg{flex:0 0 18px;width:18px;height:18px;color:var(--tw-muted,#6b7789);margin-top:1px}.crd-hist li b{display:block;font-size:12.5px;font-weight:600}.crd-hist li small{color:var(--tw-muted,#6b7789);font-size:11px}.crd-hist-encerrada svg{color:var(--tw-green,#047857)!important}
      .crd-decided{display:grid;gap:6px;padding:12px 14px;border-radius:10px;background:#effcf6;border:1px solid #bbf0d6}
      .crd-decided b{font-size:15px;color:#064e3b}.crd-decided p{margin:0;font-size:13px;color:#14532d}.crd-decided small{color:#4b7c63}
      .crd-err{margin:0;color:var(--tw-danger,#e30613);font-weight:700}.crd-err:empty{display:none}
      .crd-viewer{padding:0;border:0;background:transparent;max-width:92vw;max-height:92vh}
      .crd-viewer::backdrop{background:rgba(15,23,42,.8)}
      .crd-viewer img{max-width:92vw;max-height:92vh;border-radius:12px;display:block;cursor:zoom-out}`;
    document.head.append(st);
  }
  const DEFAULT_DECISIONS = DECISIONS.map(([acao,nome,descricao])=>({acao,nome,descricao}));
  async function loadDecisions() {
    try {
      const { data } = await AcervoComprasAPI.getClient().from('system_parameters').select('compras_rnc_decisoes').maybeSingle();
      const list=(data?.compras_rnc_decisoes||[]).filter(x=>x&&x.nome&&DECISION_LABEL[x.acao]);
      return list.length?list:DEFAULT_DECISIONS;
    } catch { return DEFAULT_DECISIONS; }
  }
  // (2026-11-06) o que a decisao gerou no sistema: tarefa do almoxarifado, contas a pagar e credito com o fornecedor
  function outcomes(r){
    const li=[];
    if(r.almox_acao)li.push(r.almox_status==='concluida'?(r.almox_acao==='devolver'?`Almoxarifado entregou ao fornecedor${r.devolucao_retirado_por?` (retirado por ${esc(r.devolucao_retirado_por)})`:''}${r.almox_concluido_em?` em ${new Date(r.almox_concluido_em).toLocaleDateString('pt-BR')}`:''}.`:'Almoxarifado guardou o material liberado.'):(r.almox_acao==='devolver'?'Almoxarifado: separar o material para o fornecedor buscar (pendente).':'Almoxarifado: guardar o material liberado (pendente).'));
    if(Number(r.valor_devolvido)>0)li.push(`Valor devolvido: ${money(r.valor_devolvido)}.`);
    if(Number(r.valor_descontado_pagar)>0)li.push(`${money(r.valor_descontado_pagar)} saiu do Contas a Pagar desta nota.`);
    if(Number(r.credito_valor)>0)li.push(`Crédito com o fornecedor no Financeiro: ${money(r.credito_valor)}${Number(r.credito_saldo)>0&&Number(r.credito_saldo)<Number(r.credito_valor)?` (falta usar ${money(r.credito_saldo)})`:Number(r.credito_saldo)>0?'':' (já usado)'}.`);
    return li.map(x=>`<p>${x}</p>`).join('');
  }
  const rncCode = r => r.numero?`DR-${String(r.numero).padStart(4,'0')}`:`DR ${String(r.id||'').slice(0,8).toUpperCase()}`;
  // (2026-11-09) RNC so encerra quando o almoxarifado cumpre a decisao (guardar/devolver); historico de ponta a ponta
  const rncState = r => r.status==='aberta'?['is-pending','Aguardando decisão']:r.status==='aguardando_acao'?['is-pending',r.almox_acao==='devolver'?'Aguardando devolução ao fornecedor':'Aguardando o almoxarifado guardar']:['is-ok','Encerrada'];
  const rncPill = r => {const [c,l]=rncState(r);return `<span class="pv-status-pill ${c}">${esc(l)}</span>`;};
  const occLabel = r => r.tipo_ocorrencia_nome?`${esc(r.tipo_ocorrencia_nome)} (${Number(r.tipo_ocorrencia_pontos)>0?'+':''}${num(r.tipo_ocorrencia_pontos)} pts)`:'';
  const HIST_ICON={aberta:'flag',tipo:'tag',decisao:'gavel',acao:'package-check',encerrada:'check-circle-2'};
  async function loadHistory(box,id){
    try{const ev=await AcervoComprasAPI.receivingRncHistory(id)||[];
      box.innerHTML=ev.length?ev.map(e=>`<li class="crd-hist-${esc(e.evento)}"><i data-lucide="${HIST_ICON[e.evento]||'circle'}"></i><div><b>${esc(e.descricao||e.evento)}</b><small>${new Date(e.em).toLocaleString('pt-BR')}${e.por?` · ${esc(e.por)}`:''}</small></div></li>`).join(''):'<li><div><small>Sem histórico.</small></div></li>';
      window.lucide?.createIcons?.();
    }catch(err){box.innerHTML=`<li><div><small>${esc(err.message||'Não foi possível carregar o histórico.')}</small></div></li>`;}
  }
  const pc = n => n?`PC-${String(n).padStart(6,'0')}`:'';
  function viewPhoto(src){const v=document.createElement('dialog');v.className='crd-viewer';v.innerHTML=`<img src="${esc(src)}" alt="">`;document.body.append(v);v.addEventListener('click',()=>v.close());v.addEventListener('close',()=>v.remove());v.showModal();}
  document.addEventListener('DOMContentLoaded', async () => {
    if(document.getElementById('purchaseRncList')) {
      let records=[];
      async function refresh() {
        ensureDecideStyle();
        try {
          window.__twOccTypesCompras=(await AcervoComprasAPI.supplierOccurrenceConfig?.())?.ocorrencias||[];
          records=(await AcervoComprasAPI.listReceivingRncs())||[];
          const badge=document.getElementById('purchaseRncBadge');
          const count=records.filter(r=>r.status==='aberta').length;badge.textContent=count;badge.hidden=!count;
          // (2026-11-04) tabela com colunas fixas: fornecedor e material separados, descricao em ate 2 linhas (inteira no titulo)
          document.getElementById('purchaseRncList').innerHTML=records.length?`<div class="tw-table-scroll"><table class="pv-table crnc-table"><colgroup><col style="width:15%"><col style="width:20%"><col style="width:23%"><col style="width:10%"><col style="width:17%"><col style="width:15%"></colgroup><thead><tr><th>Divergência / NF</th><th>Fornecedor</th><th>Material</th><th>Bloqueado</th><th>Não conformidade</th><th>Situação</th></tr></thead><tbody>${records.map(r=>`<tr class="pv-row-clickable" data-rnc-id="${esc(r.id)}" title="Clique para abrir a divergência"><td><strong>${esc(rncCode(r))}</strong><small>NF ${esc(r.numero_nfe)}${r.pedido_numero?` · ${esc(pc(r.pedido_numero))}`:''} · ${new Date(r.criado_em).toLocaleDateString('pt-BR')}</small></td><td>${window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(r.fornecedor_id, r.fornecedor), `<span class="crnc-clamp" title="${esc(r.fornecedor)}">${esc(r.fornecedor)}</span>`)}</td><td><span class="crnc-clamp" title="${esc(r.material_nome||r.item_descricao)}">${esc(r.material_nome||r.item_descricao)}</span>${r.codigo_interno?`<small>${esc(r.codigo_interno)}</small>`:''}</td><td>${r.quantidade_bloqueada!=null?`${num(r.quantidade_bloqueada)} ${esc(r.material_unidade||'')}`:`${num(r.quantidade)} ${esc(r.unidade_xml||'')}<small>${r.recebimento_concluido?'':'recebimento em andamento'}</small>`}</td><td><span class="crnc-clamp" title="${esc(r.descricao)}">${esc(r.descricao)}</span></td><td>${rncPill(r)}${r.status!=='aberta'&&r.decisao?`<small>${esc(r.decisao)}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="subtext">Nenhuma divergência no recebimento.</p>';
        } catch(e) { document.getElementById('purchaseRncList').textContent='Não foi possível carregar as divergências. '+e.message; }
      }
      document.getElementById('purchaseRncList').addEventListener('click', e=>{
        const id=e.target.closest('tr[data-rnc-id]')?.dataset.rncId,r=records.find(x=>x.id===id);if(!r)return;
        openRnc(r);
      });
      // (2026-10-12) link da Agenda: compras.html?tab=rnc&rnc=<id> abre a RNC direto
      const agendaRnc=new URLSearchParams(location.search).get('rnc');
      if(agendaRnc){(async()=>{for(let n=0;n<40&&!records.length;n++)await new Promise(ok=>setTimeout(ok,150));const r=records.find(x=>x.id===agendaRnc);if(r)openRnc(r);})();}

      async function openRnc(r) {
        ensureDecideStyle();
        const decisions=await loadDecisions();
        const open=r.status==='aberta';
        const unit=esc(r.material_unidade||r.unidade_xml||'');
        const checklist=r.checklist||[];
        const photos=[...photosOf(r.anexos),...checklist.filter(a=>a.resposta==='nao_conforme').flatMap(a=>photosOf(a.anexos)),...(r.nao_conformidades||[]).flatMap(n=>photosOf(n.anexos))]
          .filter((a,i,all)=>all.findIndex(b=>b.conteudo===a.conteudo)===i);
        const blocked=r.quantidade_bloqueada!=null?r.quantidade_bloqueada:r.quantidade;
        const kpi=(l,v,s='',cls='')=>`<div class="pv-od-kpi ${cls}"><small>${l}</small><strong>${v}</strong>${s?`<span>${s}</span>`:''}</div>`;
        const ncCount=checklist.filter(a=>a.resposta==='nao_conforme').length;
        const d=document.createElement('dialog');d.className='pv-dialog pv-dialog-xl pv-dialog-full pv-order-full';
        d.innerHTML=`<form class="dialog-card">
          <header class="pv-order-head">
            <button type="button" class="btn btn-secondary pv-back-btn" data-close title="Voltar para a lista de divergências"><i data-lucide="arrow-left"></i> Voltar</button>
            
            <div class="pv-order-head-meta"><div class="pv-od-headline">
              <span class="pv-tipos">${rncPill(r)}</span>
              <div class="pv-od-summary pv-od-summary-head" style="grid-template-columns:1.6fr 1fr 1fr 1fr">
                ${kpi('Fornecedor',window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(r.fornecedor_id, r.fornecedor, 34), esc(r.fornecedor||'—')),`NF ${esc(r.numero_nfe)}${r.serie?`/${esc(r.serie)}`:''}${r.pedido_numero?` · ${esc(pc(r.pedido_numero))}`:''}`,'is-main')}
                ${kpi('Material',esc(r.material_nome||r.item_descricao||'—'),esc(r.codigo_interno||''))}
                ${kpi('Bloqueado pela divergência',`${num(blocked)} ${unit}`,r.quantidade_recebida!=null?`chegou ${num(r.quantidade_recebida)} · nota ${num(r.quantidade_xml)}`:'')}
                ${kpi('Aberta em',new Date(r.criado_em).toLocaleDateString('pt-BR'),r.aberto_por?`por ${esc(r.aberto_por)}`:'')}
              </div></div></div>
          </header>
          <div class="pv-proposals-scroll"><div class="pv-od"><div class="pv-od-grid crd-3">
            <div class="pv-od-main">
              <section class="pv-od-card">
                ${photos.length?`<div class="crd-hero">${photos.map((a,i)=>`<button type="button" data-photo="${i}" title="Clique para ampliar"><img src="${esc(a.conteudo)}" alt=""></button>`).join('')}</div>`:'<p class="crd-nophoto">O almoxarifado não anexou fotos nesta divergência.</p>'}
                <div class="crd-report">${r.tipo_ocorrencia_nome?`<span class="crd-tag" title="Tipo de ocorrência (pontos na nota do fornecedor)">${occLabel(r)}</span>`:(r.status!=='resolvida'&&window.__twOccTypesCompras?.length?`<label class="crd-field">Tipo de ocorrência (o almoxarifado não informou)<select class="tw-field" data-set-occ><option value="">Escolha…</option>${window.__twOccTypesCompras.map(t=>`<option value="${esc(t.id)}">${esc(t.nome)} (${Number(t.pontos)>0?'+':''}${num(t.pontos)} pts)</option>`).join('')}</select></label>`:'')}${r.divergencia_tipo?`<span class="crd-tag">${esc(REASON_LABEL[r.divergencia_tipo]||String(r.divergencia_tipo).replace(/_/g,' '))}</span>`:''}<p>${esc(r.descricao||'-')}</p></div>
              </section>
              <section class="pv-od-card">
                ${checklist.length?`<table class="crd-chk"><thead><tr><th style="width:42%">Pergunta</th><th style="width:16%">Resposta</th><th>Observação</th><th style="width:18%">Fotos</th></tr></thead><tbody>${checklist.map(a=>{const [l,c]=CHK_LABEL[a.resposta]||[a.resposta||'-','na'];const ph=photosOf(a.anexos);return `<tr class="${a.resposta==='nao_conforme'?'is-nc':''}"><td>${esc(a.pergunta)}</td><td><span class="crd-ans ${c}">${esc(l)}</span></td><td>${esc(a.observacao||'')}</td><td><div class="crd-thumbs">${ph.map(p=>`<button type="button" data-src="${esc(p.conteudo)}"><img src="${esc(p.conteudo)}" alt=""></button>`).join('')}</div></td></tr>`;}).join('')}</tbody></table>`:'<p class="pv-od-hint">Este item não teve checklist no recebimento.</p>'}
              </section>
            </div>
            <aside class="pv-od-side">
              <section class="pv-od-card">
                ${open?`<div class="crd-choices">${decisions.map((x,i)=>`<label class="crd-choice"><input type="radio" name="decisao" value="${i}" required><span><b>${esc(x.nome)}</b>${x.descricao?`<small>${esc(x.descricao)}</small>`:''}</span></label>`).join('')}</div>
                  <label class="crd-field" data-discount hidden>Valor do abatimento (R$)<input class="tw-field" name="valor" type="number" min="0.01" step="0.01" inputmode="decimal"><small>Desconta das parcelas em aberto desta nota no Contas a Pagar. O que não couber (nota já paga) vira crédito com o fornecedor no Financeiro.</small></label>
                  <label class="crd-field">O que foi combinado<textarea class="tw-field" name="obs" required placeholder="Ex.: fornecedor repõe as 2 peças na próxima entrega, sem frete"></textarea></label>
                  ${r.recebimento_concluido?'':'<p class="crd-warn">O almoxarifado ainda está conferindo esta nota. A decisão fica liberada quando o recebimento for concluído.</p>'}
                  `
                :`<div class="crd-decided"><b>${esc(r.decisao||DECISION_LABEL[r.decisao_tipo]||'Resolvida')}</b>${r.decisao_descricao?`<p>${esc(r.decisao_descricao)}</p>`:''}${r.observacao_decisao?`<p><strong>Combinado:</strong> ${esc(r.observacao_decisao)}</p>`:''}${r.valor_abatimento?`<p>Abatimento de <b>${money(r.valor_abatimento)}</b></p>`:''}${outcomes(r)}<small>${esc(r.decidido_por||'')}${r.resolvido_em?` · ${new Date(r.resolvido_em).toLocaleString('pt-BR')}`:''}</small></div>`}
                <p class="crd-err" role="alert" data-error></p>
              </section>
              <section class="pv-od-card"><h4 class="crd-hist-title">Histórico da divergência</h4><ol class="crd-hist" data-hist><li><div><small>Carregando…</small></div></li></ol></section>
            </aside>
          </div></div></div>
          <footer>
            <button type="button" class="btn btn-secondary" data-close>Fechar</button>
            <button type="button" class="btn btn-secondary" data-rnc-file><i data-lucide="file-text"></i> Gerar relatório da divergência</button>
            ${open?`<button class="btn btn-primary" type="submit"${r.recebimento_concluido?'':' disabled'}><i data-lucide="check"></i> Registrar decisão</button>`:''}
          </footer>
        </form>`;
        document.body.append(d);
        d.addEventListener('close',()=>d.remove());
        d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
        d.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>viewPhoto(photos[Number(b.dataset.photo)].conteudo));
        d.querySelectorAll('[data-src]').forEach(b=>b.onclick=()=>viewPhoto(b.dataset.src));
        d.querySelector('[data-rnc-file]').onclick=()=>printRncReport(r).catch(err=>window.AcervoComprasAlert?.error?.(err.message,'Divergência'));
        loadHistory(d.querySelector('[data-hist]'),r.id);
        const occSel=d.querySelector('[data-set-occ]');
        if(occSel)occSel.onchange=async()=>{if(!occSel.value)return;try{await AcervoComprasAPI.setReceivingRncType(r.id,occSel.value);const t=window.__twOccTypesCompras.find(x=>x.id===occSel.value);r.tipo_ocorrencia_id=t.id;r.tipo_ocorrencia_nome=t.nome;r.tipo_ocorrencia_pontos=t.pontos;occSel.closest('label').outerHTML=`<span class="crd-tag">${occLabel(r)}</span>`;loadHistory(d.querySelector('[data-hist]'),r.id);}catch(err){window.AcervoComprasAlert?.error?.(err.message,'Divergência');}};
        d.querySelectorAll('[name=decisao]').forEach(radio=>radio.addEventListener('change',()=>{
          d.querySelectorAll('.crd-choice').forEach(c=>c.classList.toggle('is-selected',c.contains(radio)&&radio.checked));
          const ab=decisions[Number(radio.value)]?.acao==='abater';
          d.querySelector('[data-discount]').hidden=!ab;d.querySelector('[name=valor]').required=ab;
        }));
        const submit=d.querySelector('[type=submit]');
        d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(!submit)return;const f=new FormData(ev.target);const x=decisions[Number(f.get('decisao'))];if(!x)return;submit.disabled=true;
          try{
            const res=await AcervoComprasAPI.resolveReceivingRnc(r.id,x.acao,String(f.get('obs')||'').trim(),f.get('valor')?Number(f.get('valor')):null,x.nome,x.descricao||null);
            d.close();await refresh();
            const novo=records.find(y=>y.id===r.id);
            window.AcervoComprasAlert?.success?.(['Decisão registrada.',res?.almox==='devolver'?'O almoxarifado vai separar o material para o fornecedor buscar.':res?.almox==='guardar'?'O almoxarifado foi avisado para guardar o material.':'',Number(res?.descontado_pagar)>0?`${money(res.descontado_pagar)} saiu do Contas a Pagar.`:'',Number(res?.credito)>0?`${money(res.credito)} virou crédito com o fornecedor no Financeiro.`:'','O relatório da divergência reúne o histórico e pode ser gerado a qualquer momento.'].filter(Boolean).join(' '),'Divergência');
            if(novo)openRnc(novo);
          }catch(err){d.querySelector('[data-error]').textContent=err.message;submit.disabled=false;}};
        d.showModal();
        window.lucide?.createIcons?.();
      }

      // Relatório geral: consulta a situação e o histórico atuais a cada emissão.
      async function printRncReport(r) {
        if(!window.AcervoComprasReport?.mount) throw new Error('Impressão indisponível nesta tela.');
        const latest = (await AcervoComprasAPI.listReceivingRncs() || []).find(item => item.id === r.id);
        if (!latest) throw new Error('Divergência não encontrada. Atualize a lista e tente novamente.');
        r = latest;
        const history = (await AcervoComprasAPI.receivingRncHistory(r.id) || [])
          .slice().sort((a,b) => new Date(a.em) - new Date(b.em));
        const company=await AcervoComprasAPI.getCompanyProfile().catch(()=>null);
        const doc=v=>{const s=String(v||'').replace(/\D/g,'');return s.length===14?s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):s.length===11?s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'):String(v||'');};
        const dt=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'-';
        const field=(l,v,cls='')=>`<div${cls?` class="${cls}"`:''}><small>${esc(l)}</small><p>${v||'-'}</p></div>`;
        const unit=r.material_unidade||r.unidade_xml||'';
        const blocked=Number(r.quantidade_bloqueada!=null?r.quantidade_bloqueada:r.quantidade||0);
        const checklist=r.checklist||[];
        const photos=[...photosOf(r.anexos),...checklist.filter(a=>a.resposta==='nao_conforme').flatMap(a=>photosOf(a.anexos)),...(r.nao_conformidades||[]).flatMap(n=>photosOf(n.anexos))]
          .filter((a,i,all)=>all.findIndex(b=>b.conteudo===a.conteudo)===i);
        let n=0;const sec=t=>`<h2><b>${++n}.</b>${t}</h2>`;
        const html=`<article class="rr-doc">
  <header class="rr-head">
    <div>${company?.logo_url?`<img src="${esc(company.logo_url)}" alt="Logo">`:''}<div class="rr-head-company">${esc([company?.razao_social||company?.nome_fantasia,company?.documento&&doc(company.documento)].filter(Boolean).join(' · '))}</div></div>
    <div class="rr-head-id">Relatório de não conformidade<strong>${esc(rncCode(r))}</strong>Emitido em ${esc(dt(new Date().toISOString()))}</div>
  </header>
  <div class="rr-title"><div><span>Não conformidade no recebimento de material</span><h1>${esc(r.fornecedor||'Fornecedor')}</h1></div><span class="rr-status ${r.status==='resolvida'?'ok':'warn'}">${esc(rncState(r)[1])}</span></div>
  <section class="rr-grid">
    ${field('Fornecedor',esc(r.fornecedor),'w2')}${field('CNPJ',esc(doc(r.cnpj_fornecedor)))}
    ${field('Pedido de compra',esc(pc(r.pedido_numero)||'-'))}
    ${field('Nota fiscal',esc(`${r.numero_nfe}${r.serie?` · Série ${r.serie}`:''}`))}
    ${field('Emissão da nota',r.data_emissao?esc(new Date(r.data_emissao).toLocaleDateString('pt-BR',{timeZone:'UTC'})):'-')}
    ${field('Material',esc(`${r.material_nome||r.item_descricao||'-'}${r.codigo_interno?` (${r.codigo_interno})`:''}`),'w2')}
    ${field('Conferido em',esc(dt(r.conferido_em)))}
    ${field('Divergência aberta em',esc(dt(r.criado_em)))}
    ${field('Decisão registrada em',esc(dt(r.decidido_em||r.resolvido_em)))}
    ${field('Encerrada em',r.status==='resolvida'?esc(dt(r.encerrada_em)):'Em andamento')}
    ${field('Tipo de ocorrência',esc(r.tipo_ocorrencia_nome||'Não informado'))}
  </section>
  <section class="rr-kpis">
    <div><small>Na nota</small><strong>${num(r.quantidade_xml)} ${esc(unit)}</strong></div>
    <div><small>Recebido</small><strong>${num(r.quantidade_recebida)} ${esc(unit)}</strong></div>
    <div><small>Não conforme</small><strong>${num(blocked)} ${esc(unit)}</strong></div>
    <div><small>Decisão</small><strong>${esc(r.decisao||'-')}</strong></div>
  </section>
  <section class="rr-section">${sec('Descrição da não conformidade')}
    <div class="rr-rnc"><header><span>${esc(REASON_LABEL[r.divergencia_tipo]||'Não conformidade')}</span></header><p>${esc(r.descricao||'-')}</p></div>
  </section>
  ${checklist.length?`<section class="rr-section">${sec('Checklist do recebimento')}
    <table><colgroup><col style="width:45%"><col style="width:15%"><col style="width:40%"></colgroup>
      <thead><tr><th>Item verificado</th><th>Resultado</th><th>Observação</th></tr></thead>
      <tbody>${checklist.map(a=>{const [l,c]=CHK_LABEL[a.resposta]||[a.resposta||'-','na'];return `<tr><td>${esc(a.pergunta)}</td><td><span class="rr-pill ${c}">${esc(l)}</span></td><td>${esc(a.observacao||'')}</td></tr>`;}).join('')}</tbody>
    </table></section>`:''}
  ${photos.length?`<section class="rr-section">${sec('Evidências fotográficas')}<div class="rr-photos">${photos.map((p,i)=>`<figure><img src="${esc(p.conteudo)}" alt="Evidência ${i+1}"><figcaption>Foto ${i+1}</figcaption></figure>`).join('')}</div></section>`:''}
  <section class="rr-section">${sec('Histórico da divergência — da abertura à solução')}
    ${history.length?`<table><thead><tr><th>Data e hora</th><th>Responsável</th><th>O que aconteceu</th></tr></thead><tbody>${history.map(e=>`<tr><td>${esc(dt(e.em))}</td><td>${esc(e.por||'Não informado')}</td><td>${esc(e.descricao||e.evento)}</td></tr>`).join('')}</tbody></table>`:'<p>Não há eventos registrados no histórico desta divergência.</p>'}
    <p><strong>Situação na emissão:</strong> ${esc(rncState(r)[1])}.${r.status==='resolvida'?'':' O relatório apresenta os registros disponíveis até esta emissão; a divergência continua em acompanhamento.'}</p>
  </section>
  <section class="rr-section">${sec('Decisão e solução acordada')}
    <div class="rr-rnc"><header><span>${esc(r.decisao||DECISION_LABEL[r.decisao_tipo]||'Aguardando decisão')}</span><span class="rr-pill ${r.status==='aberta'?'warn':'ok'}">${esc(dt(r.decidido_em||r.resolvido_em))}</span></header>
      ${r.decisao_descricao?`<p>${esc(r.decisao_descricao)}</p>`:''}
      ${r.observacao_decisao?`<p><strong>Combinado:</strong> ${esc(r.observacao_decisao)}</p>`:''}
      ${r.valor_abatimento?`<p><strong>Abatimento:</strong> ${money(r.valor_abatimento)}</p>`:''}
      ${Number(r.valor_devolvido)>0?`<p><strong>Valor do material devolvido:</strong> ${money(r.valor_devolvido)}</p>`:''}
      ${Number(r.credito_valor)>0?`<p><strong>Crédito a nosso favor:</strong> ${money(r.credito_valor)} (a compensar no próximo pagamento ou a devolver).</p>`:''}
      <p><small>Responsável: ${esc(r.decidido_por||'-')}</small></p></div>
  </section>
  ${r.almox_acao==='devolver'?`<section class="rr-section">${sec('Devolução do material')}
    <div class="rr-rnc"><header><span>${num(blocked)} ${esc(unit)} · ${esc(r.material_nome||r.item_descricao||'')}</span><span class="rr-pill ${r.almox_status==='concluida'?'ok':'warn'}">${r.almox_status==='concluida'?'Entregue ao fornecedor':'Aguardando retirada'}</span></header>
      <p>${r.almox_status==='concluida'?'O material foi devolvido ao fornecedor.':'O almoxarifado deve separar o material e entregá-lo ao fornecedor. A retirada ainda está pendente.'}${r.decisao_tipo==='devolver_repor'?' Foi acordada reposição sem nova cobrança.':' A quantidade foi cancelada deste pedido de compra.'}</p>
      ${r.almox_status==='concluida'?`<p><strong>Retirado por:</strong> ${esc(r.devolucao_retirado_por||'-')} em ${esc(dt(r.almox_concluido_em))}</p>`:''}</div>
  </section>`:''}
  ${r.almox_acao?`<section class="rr-section">${sec('Execução pelo almoxarifado')}
    <p><strong>Ação:</strong> ${r.almox_acao==='devolver'?'Devolver ao fornecedor':'Guardar o material liberado'} · <strong>Situação:</strong> ${r.almox_status==='concluida'?'Concluída':'Pendente'}</p>
    ${r.almox_concluido_em?`<p><strong>Concluída em:</strong> ${esc(dt(r.almox_concluido_em))}</p>`:''}
    ${r.almox_obs?`<p><strong>Observações:</strong> ${esc(r.almox_obs)}</p>`:''}
  </section>`:''}
  <section class="rr-section">${sec('Efeitos financeiros e encerramento')}
    ${outcomes(r)||'<p>Sem efeitos financeiros ou movimentações registrados.</p>'}
    <p><strong>Encerramento:</strong> ${r.status==='resolvida'?`Divergência encerrada em ${esc(dt(r.encerrada_em))}.`:`${esc(rncState(r)[1])}.`}</p>
  </section>
  <section class="rr-signs"><div><span></span><small>Compras · ${esc(r.decidido_por||'')}</small></div><div><span></span><small>Ciência (${esc(r.fornecedor||'')})</small></div>${r.almox_acao==='devolver'?'<div><span></span><small>Retirado por (nome e documento)</small></div>':''}</section>
  <footer class="rr-foot"><span>${esc(company?.nome_fantasia||company?.razao_social||'')}</span><span>${esc(rncCode(r))} · NF ${esc(r.numero_nfe)}</span></footer>
</article>`;
        await window.AcervoComprasReport.mount(html);
      }
      await window.AcervoComprasAuth?.ready;await refresh();
      document.querySelector('[data-pv-tab="rnc"]').addEventListener('click',refresh);
      setInterval(()=>{if(!document.hidden)refresh();},30000);
    } else if(typeof renderReceiptDivergenceStep==='function') {
      // (2026-10-10) RNC fica na etapa 4 (Resolver divergências): bloco com cada item recebido e o botão Abrir RNC
      // (vale também para problema de qualidade sem diferença de quantidade).
      const original=renderReceiptDivergenceStep;
      renderReceiptDivergenceStep=function(){
        const html=original();
        const items=(activeNfeReceipt?.itens||[]).filter(i=>Number(i.quantidade_recebida)!==Number(i.quantidade_xml)||Number(i.quantidade_avariada)>0);
        if(!items.length)return html;
        const done=items.every(i=>(i.divergencias||[]).some(d=>d.tipo==='rnc'));
        const block=`<section class="receipt-rnc-block"><h3>Divergência no recebimento</h3><p>${done?'A divergência destes itens já foi registrada e está com Compras. Você pode imprimir o relatório de novo.':'Registra a divergência de <b>todos os itens com divergência</b> acima, com o que você respondeu, e gera o relatório para imprimir ou salvar em PDF. Depois é só continuar para a revisão.'}</p><div class="receipt-rnc-row"><span><strong>${items.length}</strong> ${items.length===1?'item':'itens'} com divergência</span>${!done&&window.rncOccTypeSelect&&window.__twOccTypes?.length?`<div class="receipt-rnc-occ">${items.filter(i=>!(i.divergencias||[]).some(d=>d.tipo==='rnc'&&d.status==='aberta')).map(i=>`<label><span>${esc(i.descricao_xml)}</span>${window.rncOccTypeSelect(`data-rnc-occ="${i.id}"`,'')}</label>`).join('')}</div>`:''}${done?'<span class="receipt-rnc-done">Divergência registrada ✓</span><button type="button" class="btn btn-secondary" data-print-receipt-rnc>Ver relatório da divergência</button>':'<button type="button" class="btn btn-primary" data-generate-receipt-rnc>Abrir divergência</button>'}</div></section>`;
        const end=html.lastIndexOf('</section>');
        return end<0?html+block:html.slice(0,end)+block+html.slice(end);
      };
      document.addEventListener('click',e=>{
        const id=e.target.closest('[data-open-receipt-rnc]')?.dataset.openReceiptRnc;if(!id)return;
        const receiptId=activeNfeReceipt.id,item=activeNfeReceipt.itens.find(i=>i.id===id);if(!item)return;
        // (2026-10-10) quantidade e motivo vêm do que já foi informado na etapa (não pergunta de novo):
        // quantidade = avariado informado na conferência (ou todo o recebido, se não houve avaria);
        // motivo = "O que aconteceu?" + observação do cartão da divergência. Só pergunta o motivo se o item não teve divergência.
        const unit=esc(item.unidade_interna||item.unidade_xml||'');
        const chegou=Number(item.quantidade_recebida||0),avariado=Number(item.quantidade_avariada||0);
        const qty=avariado>0?avariado:chegou;
        const typeSel=document.querySelector(`select[data-divergence-type="${id}"]`);
        const note=(document.querySelector(`textarea[data-divergence-note="${id}"]`)?.value||'').trim();
        const known=typeSel?[typeSel.selectedOptions[0]?.text,note].filter(Boolean).join(' — '):'';
        const body=`<p>${esc(item.descricao_xml)}</p><p class="subtext">Essa quantidade entra no estoque bloqueada (fora do saldo) até Compras decidir.</p>`
          +`<div class="crnc-summary"><span><small>Quantidade</small><b>${qty.toLocaleString('pt-BR')} ${unit}</b><em>${avariado>0?'avariado informado na conferência':'todo o recebido'}</em></span>`
          +(known?`<span><small>Motivo</small><b>${esc(known)}</b><em>informado acima</em></span>`:'')+`</div>`
          +(known?'':`<label>O que está errado com o material?<textarea class="tw-field" name="reason" required placeholder="Ex.: fora da especificação, medida errada, oxidado..."></textarea></label>`)
          +(window.rncOccTypeSelect&&window.__twOccTypes?.length?`<label>Tipo de ocorrência (conta na nota do fornecedor)${window.rncOccTypeSelect('name="ocorrencia"','')}</label>`:'')
          +`<label>Fotos (opcional)<input name="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>`;
        const d=dialog('Abrir divergência para Compras',body);
        d.querySelector('[type=submit]').textContent='Abrir divergência';
        d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;try{
          const reason=known||String(new FormData(ev.target).get('reason')||'').trim();if(!reason)throw new Error('Diga o que está errado com o material.');
          if(!(qty>0))throw new Error('Informe na conferência a quantidade recebida antes de abrir a divergência.');
          const anexos=await receiptEvidenceFiles(d.querySelector('[name=photos]').files);
          const occ=String(new FormData(ev.target).get('ocorrencia')||'');if(window.__twOccTypes?.length&&!occ)throw new Error('Escolha o tipo de ocorrência.');
          const saved=await AcervoComprasAPI.saveNfeDivergence({recebimento_id:receiptId,item_id:id,tipo:'rnc',origem:'manual',quantidade:qty,descricao:reason,anexos,decisao:'aguardando_compras',status:'aberta',tipo_ocorrencia_id:occ||null});
          (item.divergencias=item.divergencias||[]).push(saved&&saved.id?saved:{tipo:'rnc',status:'aberta',quantidade:qty});
          document.querySelectorAll(`[data-open-receipt-rnc="${id}"]`).forEach(btn=>{btn.textContent='Divergência aberta ✓';btn.disabled=true;});
          d.close();window.AcervoComprasAlert?.success('Divergência registrada e disponível em Compras.');
        }catch(err){d.querySelector('[data-error]').textContent=err.message;b.disabled=false;}};
      });
    }
  });
})();
