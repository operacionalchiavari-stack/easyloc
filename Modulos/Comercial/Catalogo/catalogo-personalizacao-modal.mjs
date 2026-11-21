export const chaveEscolha = escolha => JSON.stringify([escolha?.persId || '',Object.entries(escolha?.escolhas || {}).map(([tipo,o])=>[tipo,o?.opcao_id]).sort(([a],[b])=>a.localeCompare(b))]);

export function escolherPersonalizacaoComFotos({item,opcoes,atual,abrirModal,carregarCartela,carregarRenders,
  confirmar,aoIA,infoIA,escapeHtml,escapeAttr,dinheiroBR,textoEscolhas}){
  const estado={persId:opcoes.some(o=>o.id===String(atual.personalizacao_id))?String(atual.personalizacao_id):opcoes[0].id,
    escolhas:structuredClone(atual.personalizacao_escolhas || {}),dados:null,aba:'renderizadas',busca:{},fotos:[],carregando:true,erro:''};
  const cache=new Map();
  const conferir=()=>{
    if(!estado.dados)throw Error('Aguarde carregar as opções.');
    const faltando=(estado.dados.variaveis || []).filter(v=>!(v.cartelas || []).some(c=>(c.opcoes || []).some(o=>o.id===estado.escolhas[v.tipo]?.opcao_id))).map(v=>v.tipo.toLowerCase());
    if(faltando.length)throw Error(`Escolha o ${faltando.join(' e o ')}.`);
    return{persId:estado.persId,nome:opcoes.find(o=>o.id===estado.persId)?.nome || estado.dados.tipo || 'Personalização',
      escolhas:Object.fromEntries((estado.dados.variaveis || []).map(v=>[v.tipo,estado.escolhas[v.tipo]]))};
  };
  const fotoPara=escolhas=>estado.fotos.find(f=>chaveEscolha(f.personalizacao?.escolha)===chaveEscolha({persId:estado.persId,escolhas}));
  const fotoValida=f=>{
    const escolha=f.personalizacao?.escolha,d=estado.dados;
    return escolha?.persId===estado.persId && d && (d.variaveis || []).every(v=>(v.cartelas || []).some(c=>(c.opcoes || []).some(o=>o.id===escolha.escolhas?.[v.tipo]?.opcao_id)))
      && Object.keys(escolha.escolhas || {}).length===(d.variaveis || []).length;
  };
  const valorAtual=()=>{
    const d=estado.dados;
    if(d?.preco_base===null || d?.preco_base===undefined)return null;
    let total=Number(d.preco_base)||0;
    for(const v of d.variaveis || []){
      const op=(v.cartelas || []).flatMap(c=>c.opcoes || []).find(o=>o.id===estado.escolhas[v.tipo]?.opcao_id);
      if(!op)return null;total+=Number(op.acrescimo)||0;
    }
    return Math.round(total*100)/100;
  };
  const comResultado=()=>{
    const escolha={...conferir(),valor:valorAtual()},foto=fotoPara(escolha.escolhas);
    if(foto && fotoValida(foto))escolha.resultado={...foto,personalizacao:{...foto.personalizacao,escolha:{...escolha}}};
    return escolha;
  };
  return abrirModal({titulo:'Personalizar',sub:item?.name || 'Item',largo:true,confirmar,
    extra:aoIA?'<span class="cpj-pers-ia-info" data-pers-ia-info hidden></span><button type="button" class="cpj-btn cpj-btn-ghost cpj-pers-ia" data-pers-ia hidden>✦ Ver como fica com IA</button>':'',
    corpo:'<div class="cpj-pers" data-pers-corpo><p class="cpj-pers-carregando">Carregando versões renderizadas…</p></div>',
    onMount(api){
      api.dialog.classList.add('cpj-pers-dialog');
      const corpo=api.dialog.querySelector('[data-pers-corpo]'),botaoIA=api.dialog.querySelector('[data-pers-ia]'),info=api.dialog.querySelector('[data-pers-ia-info]');
      let consultouCusto=false;
      const consultarCusto=()=>{
        if(!aoIA || consultouCusto)return;consultouCusto=true;
        Promise.resolve(infoIA?.()).then(txt=>{if(info)info.textContent=txt || '';}).catch(()=>{});
      };
      const pintar=()=>{
        const d=estado.dados,foto=fotoPara(estado.escolhas),comFoto=Boolean(foto && fotoValida(foto));
        const material=d?.variaveis?.every(v=>/tint|pint|laca|verniz|esmalt/i.test(v.tipo))?'Tintas':d?.variaveis?.every(v=>/tecido|forra|estof/i.test(v.tipo))?'Tecidos':'Opções';
        const tipos=opcoes.length>1?`<div class="cpj-pers-tipos" role="radiogroup" aria-label="Tipo de personalização">${opcoes.map(o=>`<button type="button" role="radio" aria-checked="${o.id===estado.persId}" class="${o.id===estado.persId?'is-ativa':''}" data-pers-tipo="${escapeAttr(o.id)}">${escapeHtml(o.nome)}</button>`).join('')}</div>`:'';
        const tabs=`<div class="cpj-pers-abas" role="tablist" aria-label="Versões da personalização"><button type="button" role="tab" aria-selected="${estado.aba==='renderizadas'}" data-pers-aba="renderizadas">Já renderizadas <span>${estado.fotos.filter(fotoValida).length}</span></button><button type="button" role="tab" aria-selected="${estado.aba==='novas'}" data-pers-aba="novas">${material} sem renderização</button></div>`;
        if(botaoIA){botaoIA.hidden=estado.aba!=='novas' || comFoto;botaoIA.disabled=estado.carregando || Boolean(estado.erro) || !d;}
        if(info)info.hidden=estado.aba!=='novas' || comFoto;
        const submit=api.dialog.querySelector('button[type="submit"]');
        submit.disabled=!d || estado.carregando || (estado.aba==='renderizadas' && !comFoto);
        let conteudo='';
        if(!d || estado.carregando)conteudo='<p class="cpj-pers-carregando">Carregando versões renderizadas…</p>';
        else if(estado.erro)conteudo=`<p class="cpj-pers-vazio">${escapeHtml(estado.erro)} <button type="button" class="cpj-btn cpj-btn-ghost" data-pers-recarregar>Tentar novamente</button></p>`;
        else if(estado.aba==='renderizadas'){
          const fotos=estado.fotos.filter(fotoValida);
          conteudo='<p class="cpj-pers-dica">Escolha uma foto pronta para reutilizar. Sem usar créditos de IA.</p>'+(fotos.length?`<div class="cpj-pers-render-grid">${fotos.map(f=>`<button type="button" class="cpj-pers-render${f.id===foto?.id?' is-sel':''}" data-pers-render="${escapeAttr(f.id)}" aria-pressed="${f.id===foto?.id}"><img src="${escapeAttr(f.url)}" alt="${escapeAttr(f.titulo || textoEscolhas(f.personalizacao.escolha.escolhas))}" loading="lazy"><span class="cpj-pers-cod">${escapeHtml(textoEscolhas(f.personalizacao.escolha.escolhas))}</span><span class="cpj-pers-reuso">Pronta para usar</span></button>`).join('')}</div>`:`<p class="cpj-pers-vazio">Este item ainda não tem versões renderizadas para esta personalização. Abra “${material} sem renderização” para escolher uma nova combinação.</p>`);
        }else{
          conteudo=(d.variaveis || []).map(v=>{
            const busca=String(estado.busca[v.tipo] || '').trim().toLowerCase();
            const cartelas=(v.cartelas || []).map(c=>{
              const ops=(c.opcoes || []).filter(o=>(!busca || `${o.codigo} ${o.nome}`.toLowerCase().includes(busca)) && !fotoPara({...estado.escolhas,[v.tipo]:{opcao_id:o.id}}));
              if(!ops.length)return '';
              return `<div class="cpj-pers-cartela"><div class="cpj-pers-cartela-topo"><strong>${escapeHtml(c.nome)}</strong>${c.fornecedor?`<span>${escapeHtml(c.fornecedor)}</span>`:''}${c.link?`<a href="${escapeAttr(c.link)}" target="_blank" rel="noopener">Catálogo do fornecedor ↗</a>`:''}</div><div class="cpj-pers-opcoes">${ops.map(o=>{
                const sel=estado.escolhas[v.tipo]?.opcao_id===o.id;
                const amostra=o.foto_url?`style="background-image:url('${escapeAttr(o.foto_url)}')"`:o.cor?`style="background:${escapeAttr(o.cor)}"`:'';
                return `<button type="button" class="cpj-pers-opcao${sel?' is-sel':''}" aria-pressed="${sel}" data-pers-opcao="${escapeAttr(o.id)}" data-pers-var="${escapeAttr(v.tipo)}" data-pers-cartela="${escapeAttr(c.id)}"><span class="cpj-pers-amostra" ${amostra}></span><span class="cpj-pers-cod">${escapeHtml(o.codigo)}</span><span class="cpj-pers-nome">${escapeHtml(o.nome)}</span>${o.acrescimo!==null && o.acrescimo!==undefined?`<span class="cpj-pers-preco">+ ${dinheiroBR.format(o.acrescimo)}</span>`:''}</button>`;
              }).join('')}</div></div>`;
            }).join('');
            return `<section class="cpj-pers-var"><div class="cpj-pers-var-topo"><h4>${escapeHtml(v.tipo)}</h4><span>${Number(v.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:2})} ${escapeHtml(v.unidade || '')} por unidade do item</span><input type="search" class="cpj-input cpj-pers-busca" data-pers-busca="${escapeAttr(v.tipo)}" value="${escapeAttr(estado.busca[v.tipo] || '')}" placeholder="Código ou nome" autocomplete="off"></div>${cartelas || '<p class="cpj-pers-vazio">Nenhuma opção sem renderização para esta escolha. Confira as versões já renderizadas ou altere as outras opções da combinação.</p>'}</section>`;
          }).join('') || '<p class="cpj-pers-vazio">Esta personalização não tem opções para escolher.</p>';
        }
        const valor=valorAtual(),total=d?.preco_base===null || d?.preco_base===undefined?'':`<p class="cpj-pers-total">Personalização por unidade: <b>${valor===null?'escolha as opções':dinheiroBR.format(valor)}</b></p>`;
        corpo.innerHTML=tipos+tabs+conteudo+total;
      };
      const carregar=async()=>{
        const id=estado.persId;estado.dados=cache.get(id) || null;pintar();
        if(estado.dados)return;
        try{const dados=await carregarCartela(id);cache.set(id,dados);if(estado.persId!==id)return;estado.dados=dados;
          const validos=new Set((dados.variaveis || []).map(v=>v.tipo));for(const t of Object.keys(estado.escolhas))if(!validos.has(t))delete estado.escolhas[t];
        }catch(error){api.erro(error.message || 'Não foi possível carregar as opções.');}
        pintar();
      };
      const carregarFotos=async()=>{
        estado.carregando=true;estado.erro='';pintar();
        try{estado.fotos=await carregarRenders();}
        catch{estado.erro='Não foi possível verificar as versões já renderizadas. Tente novamente antes de usar a IA.';}
        finally{estado.carregando=false;pintar();}
      };
      corpo.addEventListener('click',async event=>{
        const aba=event.target.closest('[data-pers-aba]');
        if(aba){estado.aba=aba.dataset.persAba;api.erro('');if(estado.aba==='novas')consultarCusto();pintar();corpo.querySelector(`[data-pers-aba="${estado.aba}"]`)?.focus();return;}
        if(event.target.closest('[data-pers-recarregar]')){carregarFotos();return;}
        const tipo=event.target.closest('[data-pers-tipo]');
        if(tipo){if(tipo.dataset.persTipo!==estado.persId){estado.persId=tipo.dataset.persTipo;estado.escolhas={};estado.aba='renderizadas';await carregar();}return;}
        const render=event.target.closest('[data-pers-render]');
        if(render){
          const foto=estado.fotos.find(f=>String(f.id)===render.dataset.persRender);if(!foto || !fotoValida(foto))return;
          estado.escolhas={};
          for(const v of estado.dados.variaveis || []){
            const id=foto.personalizacao.escolha.escolhas[v.tipo].opcao_id;
            const c=(v.cartelas || []).find(c=>(c.opcoes || []).some(o=>o.id===id)),o=c?.opcoes.find(o=>o.id===id);
            if(o)estado.escolhas[v.tipo]={opcao_id:o.id,codigo:o.codigo,nome:o.nome,cartela:c.nome,fornecedor:c.fornecedor || null,cor:o.cor || null,foto_url:o.foto_url || null};
          }
          api.erro('');pintar();return;
        }
        const op=event.target.closest('[data-pers-opcao]');if(!op)return;
        const v=estado.dados?.variaveis?.find(v=>v.tipo===op.dataset.persVar),c=v?.cartelas?.find(c=>c.id===op.dataset.persCartela),o=c?.opcoes?.find(o=>o.id===op.dataset.persOpcao);if(!o)return;
        estado.escolhas[v.tipo]={opcao_id:o.id,codigo:o.codigo,nome:o.nome,cartela:c.nome,fornecedor:c.fornecedor || null,cor:o.cor || null,foto_url:o.foto_url || null};
        if(fotoPara(estado.escolhas))estado.aba='renderizadas';api.erro('');pintar();
      });
      corpo.addEventListener('input',event=>{
        const input=event.target.closest('[data-pers-busca]');if(!input)return;
        estado.busca[input.dataset.persBusca]=input.value;const pos=input.selectionStart;pintar();
        const novo=corpo.querySelector(`[data-pers-busca="${CSS.escape(input.dataset.persBusca)}"]`);novo?.focus();try{novo?.setSelectionRange(pos,pos);}catch{}
      });
      corpo.addEventListener('keydown',event=>{
        const tab=event.target.closest('[data-pers-aba]');if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const aba=event.key==='Home'?'renderizadas':event.key==='End'?'novas':tab.dataset.persAba==='novas'?'renderizadas':'novas';
        corpo.querySelector(`[data-pers-aba="${aba}"]`)?.click();
      });
      botaoIA?.addEventListener('click',()=>{
        try{if(estado.carregando || estado.erro)throw Error('Aguarde a consulta das versões já renderizadas.');const escolha=comResultado();api.fechar({acao:escolha.resultado?'aplicar':'ia',...escolha});}
        catch(error){api.erro(error.message);}
      });
      api.escolhaAtual=()=>{
        const escolha=comResultado();if(estado.aba==='renderizadas' && !escolha.resultado)throw Error('Selecione uma versão já renderizada.');return escolha;
      };
      carregar();carregarFotos();
    },
    onSubmit:api=>({acao:'aplicar',...api.escolhaAtual()}),
  });
}
