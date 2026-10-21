(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number(v || 0).toLocaleString('pt-BR');
  // (2026-10-10) layout próprio das janelas de divergência (Compras e Recebimento do Almoxarifado): campos empilhados e alinhados
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
  // Decisoes de Compras sobre a Divergência no recebimento (o material fica bloqueado ate aqui).
  const DECISIONS = [
    ['aceitar','Aceitar como está','Libera o material bloqueado para o estoque.'],
    ['abater','Aceitar com abatimento','Libera o material e registra o desconto negociado.'],
    ['devolver_repor','Devolver — fornecedor repõe','Material volta ao fornecedor; o saldo do pedido reabre aguardando a reposição.'],
    ['devolver_cancelar','Devolver — comprar de outro','Material volta ao fornecedor; o item do pedido diminui e as necessidades das OPs voltam para Compras.'],
  ];
  const DECISION_LABEL = Object.fromEntries(DECISIONS.map(([v,l])=>[v,l]));
  const DECISION_ICON = { aceitar:'circle-check', abater:'badge-percent', devolver_repor:'rotate-ccw', devolver_cancelar:'circle-x' };
  const REASON_LABEL = { quantidade_menor:'Faltou material', quantidade_maior:'Veio material a mais', material_avariado:'Material avariado', embalagem_danificada:'Embalagem danificada', produto_diferente:'Produto diferente do pedido', produto_nao_solicitado:'Produto não solicitado', lote_divergente:'Lote diferente', validade_divergente:'Validade diferente', outro:'Outro motivo' };
  const RECEIPT_DECISION_LABEL = { aceitar_quantidade:'Dar entrada no que chegou', receber_parcialmente:'Dar entrada no que chegou bom', deixar_pendente:'Segurar a entrada por enquanto', devolver_fornecedor:'Devolver ao fornecedor', recusar_item:'Devolver ao fornecedor' };
  const money = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function ensureDecideStyle() {
    if (document.getElementById('crd-style')) return;
    const st=document.createElement('style'); st.id='crd-style';
    st.textContent=`
      .crd-dialog{width:min(820px,calc(100vw - 32px));max-height:calc(100vh - 40px);padding:0;border:0;border-radius:18px;box-shadow:0 30px 70px rgba(15,23,42,.3);overflow:hidden}
      .crd-dialog::backdrop{background:rgba(15,23,42,.5)}
      .crd-dialog form{display:flex;flex-direction:column;max-height:calc(100vh - 40px)}
      .crd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 24px 16px;border-bottom:1px solid var(--tw-line-soft,#e8ebef);background:var(--tw-surface-soft,#f8fafc)}
      .crd-eyebrow{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--tw-danger,#e30613)}
      .crd-head h2{margin:2px 0 4px;font-size:21px;color:var(--tw-text,#071326)}
      .crd-head p{margin:0;font-size:13px;color:var(--tw-muted,#6b7789)}
      .crd-head-side{display:grid;justify-items:end;gap:10px;flex:0 0 auto}
      .crd-head-side .btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;border-radius:10px;font-size:12px}
      .crd-head-side .btn svg{width:16px;height:16px}
      .crd-pill{padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800}
      .crd-pill.is-open{background:#fff4d6;color:#92600a}.crd-pill.is-done{background:#dcf7eb;color:#047857}
      .crd-body{display:grid;gap:16px;padding:18px 24px;overflow:auto}
      .crd-material{display:grid;gap:2px}
      .crd-material small{font-size:11px;font-weight:700;color:var(--tw-muted,#6b7789)}
      .crd-material b{font-size:16px;color:var(--tw-text,#071326)}
      .crd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
      .crd-kpi{display:grid;gap:2px;padding:10px 14px;border-radius:12px;border:1px solid var(--tw-line-soft,#e8ebef);background:#fff}
      .crd-kpi small{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
      .crd-kpi b{font-size:18px;color:var(--tw-text,#071326)}
      .crd-kpi.is-bad{background:#fff1f2;border-color:#fecdd3}.crd-kpi.is-bad b{color:#be123c}
      .crd-kpi.is-ok{background:#effcf6;border-color:#bbf0d6}.crd-kpi.is-ok b{color:#047857}
      .crd-section{display:grid;gap:10px}
      .crd-section h3{margin:0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#41556f}
      .crd-report{display:grid;gap:6px;padding:12px 14px;border-radius:12px;background:var(--tw-surface-soft,#f6f7f9);border-left:4px solid var(--tw-danger,#e30613)}
      .crd-report p{margin:0;font-size:14px;color:var(--tw-text,#071326)}
      .crd-report ul{margin:0;padding-left:18px;font-size:13px;color:#41556f}
      .crd-tag{justify-self:start;padding:2px 8px;border-radius:6px;background:#ffe4e6;color:#be123c;font-size:11px;font-weight:800}
      .crd-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
      .crd-photos button{padding:0;border:1px solid var(--tw-line,#d9dee6);border-radius:10px;overflow:hidden;background:#fff;cursor:zoom-in;aspect-ratio:1}
      .crd-photos img{width:100%;height:100%;object-fit:cover;display:block}
      .crd-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .crd-choice{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1.5px solid var(--tw-line,#d9dee6);border-radius:12px;cursor:pointer;background:#fff;transition:border-color .15s,box-shadow .15s,background .15s}
      .crd-choice:hover{border-color:#94a3b8}
      .crd-choice input{position:absolute;opacity:0;pointer-events:none}
      .crd-choice-ico{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--tw-surface-soft,#f1f5f9);color:#41556f;flex:0 0 auto}
      .crd-choice-ico svg{width:18px;height:18px}
      .crd-choice b{display:block;font-size:13px;color:var(--tw-text,#071326)}
      .crd-choice small{display:block;margin-top:2px;font-size:11.5px;line-height:1.35;color:var(--tw-muted,#6b7789);font-weight:500}
      .crd-choice.is-selected{border-color:var(--tw-brand-primary,#1A73FF);background:#f5f9ff;box-shadow:0 0 0 3px rgba(26,115,255,.12)}
      .crd-choice.is-selected .crd-choice-ico{background:var(--tw-brand-primary,#1A73FF);color:#fff}
      .crd-field{display:grid;gap:6px;font-size:12px;font-weight:700;color:#41556f}
      .crd-field textarea{min-height:80px;resize:vertical}
      .crd-field[hidden]{display:none}
      .crd-hint{font-weight:500;color:var(--tw-muted,#6b7789);font-size:11.5px}
      .crd-warn{margin:0;padding:10px 12px;border-radius:10px;background:#fff4d6;color:#92600a;font-size:12px;font-weight:600}
      .crd-decided{display:grid;gap:6px;padding:14px;border-radius:12px;background:#effcf6;border:1px solid #bbf0d6}
      .crd-decided header{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
      .crd-decided header span{font-size:11px;font-weight:800;text-transform:uppercase;color:#047857}
      .crd-decided header b{font-size:15px;color:#064e3b}
      .crd-decided p{margin:0;font-size:13px;color:#14532d}.crd-decided small{color:#4b7c63}
      .crd-dialog [data-error]{margin:0;color:var(--tw-danger,#e30613);font-weight:700}
      .crd-dialog [data-error]:empty{display:none}
      .crd-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 24px;border-top:1px solid var(--tw-line-soft,#e8ebef);background:#fff}
      .crd-foot .btn{display:inline-flex;align-items:center;gap:6px;min-width:120px;justify-content:center}
      .crd-foot .btn svg{width:16px;height:16px}
      .crd-viewer{padding:0;border:0;background:transparent;max-width:92vw;max-height:92vh}
      .crd-viewer::backdrop{background:rgba(15,23,42,.8)}
      .crd-viewer img{max-width:92vw;max-height:92vh;border-radius:12px;display:block;cursor:zoom-out}
      @media(max-width:640px){.crd-choices{grid-template-columns:1fr}.crd-head{flex-direction:column}.crd-head-side{justify-items:start}}`;
    document.head.append(st);
  }
  document.addEventListener('DOMContentLoaded', async () => {
    if(document.getElementById('purchaseRncList')) {
      let records=[];
      async function refresh() {
        try {
          records=(await AcervoComprasAPI.listReceivingRncs())||[];
          const badge=document.getElementById('purchaseRncBadge');
          const count=records.filter(r=>r.status==='aberta').length;badge.textContent=count;badge.hidden=!count;
          document.getElementById('purchaseRncList').innerHTML=records.length?`<div class="tw-table-scroll"><table class="pv-table"><thead><tr><th>Registro / NF</th><th>Fornecedor / Material</th><th>Bloqueado</th><th>Problema identificado</th><th>Situação</th><th></th></tr></thead><tbody>${records.map(r=>`<tr><td><strong>divergência ${esc(r.id.slice(0,8).toUpperCase())}</strong><small>NF ${esc(r.numero_nfe)}${r.pedido_numero?` · PC-${esc(String(r.pedido_numero).padStart(6,'0'))}`:''} · ${new Date(r.criado_em).toLocaleDateString('pt-BR')}</small></td><td><strong>${esc(r.fornecedor)}</strong><small>${esc(r.material_nome||r.item_descricao)}</small></td><td>${r.quantidade_bloqueada!=null?`${num(r.quantidade_bloqueada)} ${esc(r.material_unidade||'')}`:`${num(r.quantidade)} ${esc(r.unidade_xml||'')}<small>${r.recebimento_concluido?'':'recebimento em andamento'}</small>`}</td><td>${esc(r.descricao)}</td><td>${r.status==='aberta'?'<span class="pv-status-pill is-pending">Aguardando decisão</span>':`<span class="pv-status-pill is-ok">${esc(r.decisao||'Resolvida')}</span>`}</td><td><button class="btn btn-secondary" data-rnc-detail="${esc(r.id)}">${r.status==='aberta'?'Decidir':'Ver'}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="subtext">Nenhuma Divergência no recebimento.</p>';
        } catch(e) { document.getElementById('purchaseRncList').textContent='Não foi possível carregar as divergências. '+e.message; }
      }
      // (2026-10-10) janela de decisão redesenhada + relatório A4 da divergência (o mesmo do Almoxarifado)
      document.getElementById('purchaseRncList').addEventListener('click', e=>{
        const id=e.target.closest('[data-rnc-detail]')?.dataset.rncDetail,r=records.find(x=>x.id===id);if(!r)return;
        openRncDecision(r);
      });
      // (2026-10-12) link da Agenda: compras.html?tab=rnc&rnc=<id> abre a decisão direto
      const agendaRnc=new URLSearchParams(location.search).get('rnc');
      if(agendaRnc){(async()=>{for(let n=0;n<40&&!records.length;n++)await new Promise(ok=>setTimeout(ok,150));const r=records.find(x=>x.id===agendaRnc);if(r)openRncDecision(r);})();}
      function openRncDecision(r) {
        ensureDecideStyle();
        const open=r.status==='aberta';
        const unit=esc(r.material_unidade||r.unidade_xml||'');
        const photos=[...photosOf(r.anexos),...(r.nao_conformidades||[]).flatMap(n=>photosOf(n.anexos))].filter((a,i,all)=>all.findIndex(b=>b.conteudo===a.conteudo)===i);
        const blocked=r.quantidade_bloqueada!=null?r.quantidade_bloqueada:r.quantidade;
        const ncs=(r.nao_conformidades||[]).map(n=>`<li><b>${esc(n.pergunta)}</b>${n.observacao?` — ${esc(n.observacao)}`:''}</li>`).join('');
        const card=(label,value,cls='')=>`<div class="crd-kpi ${cls}"><small>${label}</small><b>${value}</b></div>`;
        const decided=!open?`<section class="crd-decided"><header><span>Decisão registrada</span><b>${esc(DECISION_LABEL[r.decisao_tipo]||r.decisao||'Resolvida')}</b></header>${r.valor_abatimento?`<p>Abatimento de <b>${money(r.valor_abatimento)}</b></p>`:''}${r.observacao_decisao?`<p>${esc(r.observacao_decisao)}</p>`:''}<small>${esc(r.decidido_por||'')}${r.resolvido_em?` · ${new Date(r.resolvido_em).toLocaleString('pt-BR')}`:''}</small></section>`:'';
        const form=open?`<section class="crd-section"><h3>Decisão de Compras</h3>
            <div class="crd-choices">${DECISIONS.map(([v,l,h])=>`<label class="crd-choice"><input type="radio" name="decisao" value="${v}" required><span class="crd-choice-ico"><i data-lucide="${DECISION_ICON[v]}"></i></span><span><b>${esc(l)}</b><small>${esc(h)}</small></span></label>`).join('')}</div>
            <label class="crd-field" data-discount hidden>Valor do abatimento (R$)<input class="tw-field" name="valor" type="number" min="0.01" step="0.01" inputmode="decimal"><small class="crd-hint">Desconta das parcelas em aberto desta nota no Contas a Pagar (a próxima a vencer primeiro). O Financeiro vê o título marcado como abatimento.</small></label>
            <label class="crd-field">O que foi combinado com o fornecedor<textarea class="tw-field" name="obs" required placeholder="Ex.: fornecedor repõe as 2 peças na próxima entrega, sem frete"></textarea></label>
            ${r.recebimento_concluido?'':'<p class="crd-warn">O almoxarifado ainda está conferindo esta nota. A decisão fica liberada quando o recebimento for concluído.</p>'}</section>`:'';
        const d=document.createElement('dialog');d.className='crd-dialog';
        d.innerHTML=`<form>
          <header class="crd-head"><div><span class="crd-eyebrow">Divergência no recebimento · ${esc(r.id.slice(0,8).toUpperCase())}</span><h2>${esc(r.fornecedor||'Fornecedor')}</h2>
            <p>NF ${esc(r.numero_nfe)}${r.serie?`/${esc(r.serie)}`:''}${r.pedido_numero?` · PC-${esc(String(r.pedido_numero).padStart(6,'0'))}`:''} · aberta ${new Date(r.criado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}${r.aberto_por?` por ${esc(r.aberto_por)}`:''}</p></div>
            <div class="crd-head-side"><span class="crd-pill ${open?'is-open':'is-done'}">${open?'Aguardando decisão':'Resolvida'}</span><button type="button" class="btn btn-secondary" data-rnc-report><i data-lucide="file-text"></i> Relatório da divergência</button></div></header>
          <div class="crd-body">
            <section class="crd-material"><small>${esc(r.codigo_interno||'Material')}</small><b>${esc(r.material_nome||r.item_descricao)}</b></section>
            <div class="crd-kpis">${r.quantidade_xml!=null?card('Na nota',`${num(r.quantidade_xml)} ${unit}`):''}${r.quantidade_recebida!=null?card('Chegou',`${num(r.quantidade_recebida)} ${unit}`):''}${card('Bloqueado pela divergência',`${num(blocked)} ${unit}`,'is-bad')}${r.quantidade_recebida!=null?card('Bom (fora da divergência)',`${num(Math.max(0,Number(r.quantidade_recebida||0)-Number(blocked||0)))} ${unit}`,'is-ok'):''}</div>
            <section class="crd-section"><h3>O que o almoxarifado informou</h3>
              <div class="crd-report">${r.divergencia_tipo?`<span class="crd-tag">${esc(REASON_LABEL[r.divergencia_tipo]||String(r.divergencia_tipo).replace(/_/g,' '))}</span>`:''}<p>${esc(r.descricao||'-')}</p>${ncs?`<ul>${ncs}</ul>`:''}</div>
              ${photos.length?`<div class="crd-photos">${photos.map((a,i)=>`<button type="button" data-photo="${i}"><img src="${esc(a.conteudo)}" alt="${esc(a.nome||'Foto')}"></button>`).join('')}</div>`:''}
            </section>
            ${decided}${form}
            <p role="alert" data-error></p>
          </div>
          <footer class="crd-foot"><button type="button" class="btn btn-secondary" data-close>Fechar</button>${open?`<button class="btn btn-primary" type="submit"${r.recebimento_concluido?'':' disabled'}><i data-lucide="check"></i> Registrar decisão</button>`:''}</footer>
        </form>`;
        document.body.append(d);
        d.addEventListener('close',()=>d.remove());
        d.querySelector('[data-close]').onclick=()=>d.close();
        d.addEventListener('click',ev=>{if(ev.target===d)d.close();});
        d.querySelector('[data-rnc-report]').onclick=()=>printRncReport(r).catch(err=>window.AcervoComprasAlert?.error?.(err.message,'divergência'));
        d.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const v=document.createElement('dialog');v.className='crd-viewer';v.innerHTML=`<img src="${esc(photos[Number(b.dataset.photo)].conteudo)}" alt="">`;document.body.append(v);v.addEventListener('click',()=>v.close());v.addEventListener('close',()=>v.remove());v.showModal();});
        d.querySelectorAll('[name=decisao]').forEach(radio=>radio.addEventListener('change',()=>{
          d.querySelectorAll('.crd-choice').forEach(c=>c.classList.toggle('is-selected',c.contains(radio)&&radio.checked));
          d.querySelector('[data-discount]').hidden=radio.value!=='abater';d.querySelector('[name=valor]').required=radio.value==='abater';
        }));
        const submit=d.querySelector('[type=submit]');
        d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(!submit)return;const f=new FormData(ev.target);submit.disabled=true;try{await AcervoComprasAPI.resolveReceivingRnc(r.id,f.get('decisao'),String(f.get('obs')||'').trim(),f.get('valor')?Number(f.get('valor')):null);d.close();await refresh();window.AcervoComprasAlert?.success?.('Decisão registrada. O almoxarifado já vê o resultado.','divergência');}catch(err){d.querySelector('[data-error]').textContent=err.message;submit.disabled=false;}};
        d.showModal();
        window.lucide?.createIcons?.();
      }
      // relatório A4: todas as divergências da mesma nota (igual ao gerado no Recebimento)
      async function printRncReport(base) {
        if(!window.AcervoComprasReport?.mount) throw new Error('Impressão indisponível nesta tela.');
        const rows=records.filter(x=>x.recebimento_id&&x.recebimento_id===base.recebimento_id);
        if(!rows.length) rows.push(base);
        const company=await AcervoComprasAPI.getCompanyProfile().catch(()=>null);
        const doc=v=>{const s=String(v||'').replace(/\D/g,'');return s.length===14?s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):s.length===11?s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'):String(v||'');};
        const dt=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'-';
        const field=(l,v,cls='')=>`<div${cls?` class="${cls}"`:''}><small>${esc(l)}</small><p>${v||'-'}</p></div>`;
        const line=x=>{const nota=Number(x.quantidade_xml||0),chegou=Number(x.quantidade_recebida||0),bloq=Number(x.quantidade_bloqueada!=null?x.quantidade_bloqueada:x.quantidade||0);return {x,nota,chegou,bloq,bom:Math.max(0,chegou-bloq),unit:x.material_unidade||x.unidade_xml||''};};
        const L=rows.map(line);
        const allOpen=rows.every(x=>x.status==='aberta'),anyOpen=rows.some(x=>x.status==='aberta');
        const photos=rows.flatMap(x=>[...photosOf(x.anexos),...(x.nao_conformidades||[]).flatMap(n=>photosOf(n.anexos))].map(a=>({src:a.conteudo,cap:x.material_nome||x.item_descricao})))
          .filter((p,i,all)=>all.findIndex(y=>y.src===p.src)===i).slice(0,9);
        const ref=`NF ${base.numero_nfe}${base.serie?`/${base.serie}`:''}`;
        const html=`<article class="rr-doc">
  <header class="rr-head">
    <div>${company?.logo_url?`<img src="${esc(company.logo_url)}" alt="Logo">`:''}<div class="rr-head-company">${esc([company?.razao_social||company?.nome_fantasia,company?.documento&&doc(company.documento)].filter(Boolean).join(' · '))}</div></div>
    <div class="rr-head-id">Relatório de divergência no recebimento<strong>divergência · ${esc(ref)}</strong>Emitido em ${esc(dt(new Date().toISOString()))}</div>
  </header>
  <div class="rr-title"><div><span>Almoxarifado · Recebimento de mercadorias</span><h1>${esc(base.fornecedor||'Fornecedor')}</h1></div><span class="rr-status ${anyOpen?'bad':'ok'}">${allOpen?'Aguardando decisão de Compras':anyOpen?'Decisão parcial de Compras':'Decidida por Compras'}</span></div>
  <section class="rr-grid">
    ${field('Fornecedor',esc(base.fornecedor),'w2')}${field('CNPJ',esc(doc(base.cnpj_fornecedor)))}
    ${field('Pedido de compra',base.pedido_numero?`PC-${esc(String(base.pedido_numero).padStart(6,'0'))}`:'-')}
    ${field('Nota fiscal',esc(`${base.numero_nfe}${base.serie?` · Série ${base.serie}`:''}`))}
    ${field('Emissão da nota',base.data_emissao?esc(new Date(base.data_emissao).toLocaleDateString('pt-BR',{timeZone:'UTC'})):'-')}
    ${field('Conferido por',esc(base.conferido_por||base.aberto_por||'-'))}${field('Data da conferência',esc(dt(base.conferido_em)))}
  </section>
  <section class="rr-kpis">
    <div><small>Itens com divergência</small><strong>${L.length}</strong></div>
    <div><small>Quantidade bloqueada</small><strong>${num(L.reduce((s,y)=>s+y.bloq,0))}</strong></div>
    <div><small>Peças faltando</small><strong>${num(L.reduce((s,y)=>s+Math.max(0,y.nota-y.chegou),0))}</strong></div>
    <div><small>Situação</small><strong>${anyOpen?'Bloqueado até Compras decidir':'Decidido'}</strong></div>
  </section>
  <section class="rr-section"><h2><b>1.</b>Itens com divergência</h2>
    <table><colgroup><col style="width:4%"><col style="width:28%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:8%"><col style="width:17%"><col style="width:18%"></colgroup>
      <thead><tr><th>#</th><th>Material</th><th class="num">Na nota</th><th class="num">Chegou</th><th class="num">Bloqueado</th><th class="num">Bom</th><th>O que aconteceu</th><th>O que fazer</th></tr></thead>
      <tbody>${L.map((y,i)=>`<tr><td>${i+1}</td><td><strong>${esc(y.x.material_nome||y.x.item_descricao)}</strong>${y.x.codigo_interno?`<small>${esc(y.x.codigo_interno)}</small>`:''}</td><td class="num">${num(y.nota)} ${esc(y.unit)}</td><td class="num">${num(y.chegou)}</td><td class="num">${num(y.bloq)}</td><td class="num">${num(y.bom)}</td><td>${esc(REASON_LABEL[y.x.divergencia_tipo]||String(y.x.divergencia_tipo||'-').replace(/_/g,' '))}</td><td>${esc(RECEIPT_DECISION_LABEL[y.x.divergencia_decisao]||'-')}<small>${num(y.bloq)} ${esc(y.unit)} bloqueada(s) pela divergência</small></td></tr>`).join('')}</tbody>
    </table>
  </section>
  <section class="rr-section"><h2><b>2.</b>Descrição da ocorrência</h2>
    ${L.map(y=>`<div class="rr-rnc"><header><span>${esc(y.x.material_nome||y.x.item_descricao)}</span><span class="rr-pill ${y.x.status==='aberta'?'bad':'ok'}">${y.x.status==='aberta'?'Aguardando Compras':esc(DECISION_LABEL[y.x.decisao_tipo]||'Decidida')}</span></header><p>${esc(y.x.descricao||'-')}</p></div>`).join('')}
  </section>
  ${photos.length?`<section class="rr-section"><h2><b>3.</b>Evidências fotográficas</h2><div class="rr-photos">${photos.map((p,i)=>`<figure><img src="${esc(p.src)}" alt="Evidência ${i+1}"><figcaption>${i+1}. ${esc(p.cap)}</figcaption></figure>`).join('')}</div></section>`:''}
  <section class="rr-section"><h2><b>${photos.length?4:3}.</b>Decisão de Compras</h2>
    ${rows.some(x=>x.status!=='aberta')?rows.filter(x=>x.status!=='aberta').map(x=>`<div class="rr-rnc"><header><span>${esc(x.material_nome||x.item_descricao)}</span><span class="rr-pill ok">${esc(DECISION_LABEL[x.decisao_tipo]||'Decidida')}</span></header><p>${esc(x.observacao_decisao||'-')}${x.valor_abatimento?` · Abatimento de ${money(x.valor_abatimento)}`:''}</p><p><small>${esc(x.decidido_por||'')}${x.resolvido_em?` · ${esc(dt(x.resolvido_em))}`:''}</small></p></div>`).join(''):''}
    ${anyOpen?'<div class="rr-note">Compras decide cada item: aceitar como está, aceitar com abatimento, devolver para o fornecedor repor ou devolver e comprar de outro. Até a decisão, a quantidade fica bloqueada no estoque.</div>':''}
  </section>
  <section class="rr-signs"><div><span></span><small>Almoxarifado · ${esc(base.conferido_por||'')}</small></div><div><span></span><small>Compras</small></div><div><span></span><small>Fornecedor (ciência)</small></div></section>
  <footer class="rr-foot"><span>${esc(company?.nome_fantasia||company?.razao_social||'')}</span><span>divergência · ${esc(ref)}</span></footer>
</article>`;
        await window.AcervoComprasReport.mount(html);
      }
      await window.AcervoComprasAuth?.ready;await refresh();window.addEventListener("acervo:compras-rnc",refresh);
      document.querySelector('[data-pv-tab="rnc"]').addEventListener('click',refresh);
      setInterval(()=>{if(!document.hidden)refresh();},30000);
    } else if(typeof renderReceiptDivergenceStep==='function') {
      // (2026-10-10) divergência fica na etapa 4 (Resolver divergências): bloco com cada item recebido e o botão Abrir divergência
      // (vale também para problema de qualidade sem diferença de quantidade).
      const original=renderReceiptDivergenceStep;
      renderReceiptDivergenceStep=function(){
        const html=original();
        const items=(activeNfeReceipt?.itens||[]).filter(i=>Number(i.quantidade_recebida)!==Number(i.quantidade_xml)||Number(i.quantidade_avariada)>0);
        if(!items.length)return html;
        const done=items.every(i=>(i.divergencias||[]).some(d=>d.tipo==='rnc'));
        const block=`<section class="receipt-rnc-block"><h3>Divergência no recebimento</h3><p>${done?'A divergência destes itens já foi registrada e está com Compras. Você pode imprimir o relatório de novo.':'Registra a divergência de <b>todos os itens com divergência</b> acima, com o que você respondeu, e gera o relatório para imprimir ou salvar em PDF. Depois é só continuar para a revisão.'}</p><div class="receipt-rnc-row"><span><strong>${items.length}</strong> ${items.length===1?'item':'itens'} com divergência</span>${done?'<span class="receipt-rnc-done">divergência gerada ✓</span><button type="button" class="btn btn-secondary" data-print-receipt-rnc>Ver relatório da divergência</button>':'<button type="button" class="btn btn-primary" data-generate-receipt-rnc>Gerar divergência</button>'}</div></section>`;
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
          +`<label>Fotos (opcional)<input name="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>`;
        const d=dialog('Abrir divergência para Compras',body);
        d.querySelector('[type=submit]').textContent='Abrir divergência';
        d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;try{
          const reason=known||String(new FormData(ev.target).get('reason')||'').trim();if(!reason)throw new Error('Diga o que está errado com o material.');
          if(!(qty>0))throw new Error('Informe na conferência a quantidade recebida antes de abrir a divergência.');
          const anexos=await receiptEvidenceFiles(d.querySelector('[name=photos]').files);
          const saved=await AcervoComprasAPI.saveNfeDivergence({recebimento_id:receiptId,item_id:id,tipo:'rnc',origem:'manual',quantidade:qty,descricao:reason,anexos,decisao:'aguardando_compras',status:'aberta'});
          (item.divergencias=item.divergencias||[]).push(saved&&saved.id?saved:{tipo:'rnc',status:'aberta',quantidade:qty});
          document.querySelectorAll(`[data-open-receipt-rnc="${id}"]`).forEach(btn=>{btn.textContent='divergência aberta ✓';btn.disabled=true;});
          d.close();window.AcervoComprasAlert?.success('divergência registrada e disponível em Compras.');
        }catch(err){d.querySelector('[data-error]').textContent=err.message;b.disabled=false;}};
      });
    }
  });
})();
