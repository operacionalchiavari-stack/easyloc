// Servidor de mentira das RPCs do catálogo (projeto_*, layout_*, catalogo_*) + Storage, pra os testes de Projetos e Layouts.
// Roda DENTRO da página (addInitScript) e guarda tudo em sessionStorage — variável de JS não sobrevive a navegação/recarregar.
// opts: { token, staff, decoradorCores }
function installMock(opts){
  const KEY='mockdb';
  const db=JSON.parse(sessionStorage.getItem(KEY)||'null')||{projetos:[],calls:[],uploads:[],removed:[],seq:1};
  if(!db.layouts) db.layouts=[];
  if(!db.lseq) db.lseq=1;
  const persist=()=>sessionStorage.setItem(KEY,JSON.stringify(db));
  window.mockdb=db;
  if(opts.token) sessionStorage.setItem('catalogo_token','test');
  if(opts.staff) sessionStorage.setItem('login_ok','1');
  const ITENS=[
    {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/storage/v1/object/public/itens/sofa1.png',largura:2.2,altura:.8,profundidade:.9,capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    {id:'2',tipo:'Item',produto:'Sofá Dois',categoria:'Sofás',foto_url:'https://fixture/storage/v1/object/public/itens/sofa2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    {id:'3',tipo:'Item',produto:'Mesa Um',categoria:'Mesas',foto_url:'https://fixture/storage/v1/object/public/itens/mesa1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  ];
  const dono=()=>opts.staff?null:'client';
  const resumo=(p)=>({id:p.id,noivos:p.noivos,data_evento:p.data_evento,local_evento:p.local_evento,status:p.status,compartilhar:p.compartilhar,pedido_enviado_em:p.pedido_enviado_em,atualizado_em:p.atualizado_em,layout_id:p.layout_id||null,foto_casal_url:(p.dados.foto_casal&&p.dados.foto_casal.url)||null,
    ambientes:p.dados.ambientes.length,itens:p.dados.ambientes.reduce((s,a)=>s+a.itens.reduce((t,i)=>t+(i.quantidade||1),0),0),renders:p.dados.ambientes.reduce((s,a)=>s+a.renders.length,0),dono:p.cliente_id==='client'?'Kelly Decor':'Equipe'});
  const visiveis=()=>db.projetos.filter(p=>opts.staff||p.cliente_id==='client');
  const achar=(id)=>{const p=visiveis().find(x=>x.id===id);if(!p) throw new Error('Projeto não encontrado');return p;};
  const ok=(data)=>({data,error:null});
  const fail=(message)=>({data:null,error:{message}});
  const layoutJson=(l)=>({id:l.id,nome:l.nome,config:l.config,padrao:l.padrao,atualizado_em:l.atualizado_em||null});
  const layoutResolvido=(r)=>{const l=db.layouts.find(x=>x.id===r.layout_id)||db.layouts.find(x=>x.cliente_id===r.cliente_id&&x.padrao);return l?l.config:null;};
  const apresentacao=(r)=>({ok:true,
    projeto:{noivos:r.noivos,data_evento:r.data_evento,local_evento:r.local_evento,foto_casal:(r.dados.foto_casal&&r.dados.foto_casal.url)||null,ambientes:r.dados.ambientes},
    itens:ITENS.filter(i=>r.dados.ambientes.some(a=>a.itens.some(x=>String(x.item_id)===i.id))).map(i=>({id:i.id,nome:i.produto,categoria:i.categoria,material:i.material||null,cor:i.cor||null,largura:i.largura??null,altura:i.altura??null,profundidade:i.profundidade??null,foto_url:i.foto_url})),
    decorador:opts.staff?null:{nome:'Kelly Decor',logo_url:null,cor_primaria:(opts.decoradorCores||{}).cor_primaria||null,cor_secundaria:(opts.decoradorCores||{}).cor_secundaria||null,telefone:'(11) 99999-0000',email:'kelly@decor.com'},
    empresa:{nome:'Chiavari',logo_url:null},layout:layoutResolvido(r)});
  const handlers={
    catalogo_validar_sessao:()=>ok({valido:true,empresa_id:'company',cliente_id:'client'}),
    funcionario_contexto:()=>ok({ativo:true,administrador_legado:true}),
    catalogo_carregar:()=>ok({empresa:{nome:'Chiavari'},decorador:{nome:'Kelly Decor',...(opts.decoradorCores||{})},itens:ITENS}),
    catalogo_carregar_interno:()=>ok({empresa:{nome:'Chiavari'},decorador:null,itens:ITENS}),
    catalogo_capas_carregar:()=>ok({portal:'https://fixture/capa.png'}),
    catalogo_capas_carregar_interno:()=>ok({portal:'https://fixture/capa.png'}),
    biblioteca_carregar:()=>ok({fotos:[]}),
    projeto_listar:()=>ok(visiveis().map(resumo)),
    projeto_obter:(p)=>{const r=achar(p.p_id);return ok({...resumo(r),dados:r.dados,slug:r.slug,pin_definido:Boolean(r.pin),pedido_observacao:r.pedido_observacao,pedido_snapshot:r.pedido_snapshot});},
    projeto_criar:(p)=>{
      if(!String(p.p_noivos||'').trim()) return fail('Informe o nome dos noivos');
      if(!p.p_data_evento) return fail('Informe a data do evento');
      if(!String(p.p_local_evento||'').trim()) return fail('Informe o local do evento');
      const r={id:'proj-'+(db.seq++),cliente_id:opts.staff?null:'client',noivos:p.p_noivos.trim(),data_evento:p.p_data_evento,local_evento:p.p_local_evento.trim(),status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:new Date().toISOString(),
        dados:{ambientes:(p.p_ambientes||[]).filter(n=>n.trim()).map((n,i)=>({id:'amb'+db.seq+'x'+i,nome:n.trim(),itens:[],renders:[],notas:''}))}};
      db.projetos.push(r);return ok({...resumo(r),dados:r.dados,slug:null,pin_definido:false});
    },
    projeto_salvar:(p)=>{const r=achar(p.p_id);r.noivos=p.p_noivos;r.data_evento=p.p_data_evento;r.local_evento=p.p_local_evento;r.dados=p.p_dados;r.atualizado_em=new Date().toISOString();return ok(resumo(r));},
    projeto_excluir:(p)=>{achar(p.p_id);db.projetos=db.projetos.filter(x=>x.id!==p.p_id);return ok({ok:true});},
    projeto_compartilhar:(p)=>{const r=achar(p.p_id);if(p.p_ativo===false){r.compartilhar=false;return ok({compartilhar:false,slug:r.slug,pin_definido:Boolean(r.pin)});}
      if(p.p_pin&&!/^[0-9]{6}$/.test(p.p_pin)) return fail('O PIN precisa ter 6 números');
      if(!p.p_pin&&!r.pin) return fail('Defina um PIN de 6 números');
      r.compartilhar=true;r.slug=r.slug||'slug-'+r.id;if(p.p_pin) r.pin=p.p_pin;return ok({compartilhar:true,slug:r.slug,pin_definido:true});},
    projeto_enviar_pedido:(p)=>{const r=achar(p.p_id);const total=r.dados.ambientes.reduce((s,a)=>s+a.itens.reduce((t,i)=>t+(i.quantidade||1),0),0);
      if(!total) return fail('Adicione ao menos um item ao projeto antes de enviar o pedido');
      r.status='pedido_enviado';r.pedido_enviado_em=new Date().toISOString();r.pedido_observacao=p.p_observacao||null;
      r.pedido_snapshot={total_itens:total,enviado_em:r.pedido_enviado_em,ambientes:r.dados.ambientes.map(a=>({ambiente:a.nome,itens:a.itens.map(i=>({item_id:i.item_id,quantidade:i.quantidade,nome:'Item '+i.item_id,referencia:'REF'+i.item_id}))}))};
      r.atualizado_em=r.pedido_enviado_em;return ok(resumo(r));},
    layout_listar:(p)=>{const dono=p.p_projeto_id?achar(p.p_projeto_id).cliente_id:(opts.staff?null:'client');
      return ok(db.layouts.filter(l=>l.cliente_id===dono).sort((a,b)=>Number(b.padrao)-Number(a.padrao)||a.nome.localeCompare(b.nome,'pt-BR')).map(layoutJson));},
    layout_salvar:(p)=>{const dono=opts.staff?null:'client';
      if(!String(p.p_nome||'').trim()) return fail('Dê um nome ao layout');
      if(!p.p_config||Array.isArray(p.p_config)||typeof p.p_config!=='object') return fail('Configuração do layout inválida');
      let l;
      if(p.p_id){l=db.layouts.find(x=>x.id===p.p_id&&x.cliente_id===dono);if(!l) return fail('Layout não encontrado');l.nome=p.p_nome.trim();l.config=p.p_config;}
      else{if(db.layouts.filter(x=>x.cliente_id===dono).length>=20) return fail('Limite de 20 layouts atingido');l={id:'lay-'+(db.lseq++),cliente_id:dono,nome:p.p_nome.trim(),config:p.p_config,padrao:false};db.layouts.push(l);}
      if(p.p_padrao===true){db.layouts.forEach(x=>{if(x.cliente_id===dono) x.padrao=(x.id===l.id);});}
      else if(p.p_padrao===false) l.padrao=false;
      l.atualizado_em=new Date().toISOString();return ok(layoutJson(l));},
    layout_excluir:(p)=>{const dono=opts.staff?null:'client';const l=db.layouts.find(x=>x.id===p.p_id&&x.cliente_id===dono);if(!l) return fail('Layout não encontrado');
      db.layouts=db.layouts.filter(x=>x.id!==l.id);db.projetos.forEach(pr=>{if(pr.layout_id===l.id) pr.layout_id=null;});return ok({ok:true});},
    projeto_definir_layout:(p)=>{const r=achar(p.p_id);
      if(p.p_layout_id&&!db.layouts.some(l=>l.id===p.p_layout_id&&l.cliente_id===r.cliente_id)) return fail('Layout não encontrado');
      r.layout_id=p.p_layout_id||null;return ok(resumo(r));},
    projeto_previa:(p)=>{const r=achar(p.p_id);return ok({...apresentacao(r),layouts:db.layouts.filter(l=>l.cliente_id===r.cliente_id).map(layoutJson),layout_id:r.layout_id||null,projeto_id:r.id});},
    projeto_atualizar_status:(p)=>{if(!opts.staff) return fail('Sem permissão para acessar os projetos');const r=achar(p.p_id);r.status=p.p_status;return ok(resumo(r));},
  };
  function builder(value){return new Proxy({},{get(_t,prop){if(prop==='then') return (resolve)=>resolve(value);return ()=>builder(value);}});}
  window.supabaseClient={
    auth:{getSession:async()=>({data:{session:opts.staff?{user:{id:'user-1'}}:null},error:null}),getUser:async()=>({data:{user:opts.staff?{id:'user-1'}:null},error:null})},
    from(table){if(table==='usuarios_empresas') return builder({data:{empresa_id:'company'},error:null});return builder({data:[],error:null});},
    rpc:async(name,params)=>{
      db.calls.push({name,params});
      let out;try{out=handlers[name]?handlers[name](params||{}):ok(null);}catch(e){out=fail(e.message);}
      persist();return out;
    },
    storage:{from(bucket){return{
      upload:async(p,blob,o)=>{db.uploads.push({bucket,path:p,type:o&&o.contentType,size:blob.size});persist();return{data:{path:p},error:null};},
      getPublicUrl:(p)=>({data:{publicUrl:'https://fixture/storage/v1/object/public/'+bucket+'/'+p}}),
      remove:async(paths)=>{db.removed.push(...paths);persist();return{data:[],error:null};},
      list:async()=>({data:[],error:null}),
    };}},
  };
}

module.exports = { installMock };
