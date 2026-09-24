// Servidor de mentira das RPCs do catálogo (projeto_*, catalogo_*) + Storage, pra os testes de Projetos.
// Roda DENTRO da página (addInitScript) e guarda tudo em sessionStorage — variável de JS não sobrevive a navegação/recarregar.
// opts: { token, staff, decoradorCores, empresaLogo, modelos }
// Handlers de layout_*/projeto_compartilhar/projeto_previa removidos (pedido explícito do usuário: "remova o link
// do projeto, remova os layout do projeto também") — nenhum teste mais chama essas RPCs.
function installMock(opts){
  const KEY='mockdb';
  const db=JSON.parse(sessionStorage.getItem(KEY)||'null')||{projetos:[],calls:[],uploads:[],removed:[],seq:1};
  const persist=()=>sessionStorage.setItem(KEY,JSON.stringify(db));
  window.mockdb=db;
  if(opts.token) sessionStorage.setItem('catalogo_token','test');
  if(opts.staff) sessionStorage.setItem('login_ok','1');
  const ITENS=[
    {id:'1',tipo:'Item',produto:'Sofá Um',descricao_total:'Sofá Um Linho Off (L) 2.20 m (A) 0.80 m (P) 0.90 m',valor_locacao:350,valor_reposicao:4200,categoria:'Sofás',foto_url:'https://fixture/storage/v1/object/public/itens/sofa1.png',largura:2.2,altura:.8,profundidade:.9,capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    {id:'2',tipo:'Item',produto:'Sofá Dois',categoria:'Sofás',foto_url:'https://fixture/storage/v1/object/public/itens/sofa2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    {id:'3',tipo:'Item',produto:'Mesa Um',valor_locacao:120.5,valor_reposicao:980,categoria:'Mesas',foto_url:'https://fixture/storage/v1/object/public/itens/mesa1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  ];
  // opts.modelos: os 3 itens ganham modelo 3D (editor de cena / 3D Livre).
  if(opts.modelos) ITENS.forEach(i=>{i.itens_modelos_3d=[{url:'https://fixture/modelos/m'+i.id+'.glb',status:'ativo'}];});
  const resumo=(p)=>({id:p.id,noivos:p.noivos,data_evento:p.data_evento,local_evento:p.local_evento,status:p.status,pedido_enviado_em:p.pedido_enviado_em,atualizado_em:p.atualizado_em,foto_casal_url:(p.dados.foto_casal&&p.dados.foto_casal.url)||null,
    ambientes:p.dados.ambientes.length,itens:p.dados.ambientes.reduce((s,a)=>s+a.itens.reduce((t,i)=>t+(i.quantidade||1),0),0),renders:p.dados.ambientes.reduce((s,a)=>s+a.renders.length,0),dono:p.cliente_id==='client'?'Kelly Decor':'Equipe'});
  const visiveis=()=>db.projetos.filter(p=>opts.staff||p.cliente_id==='client');
  const achar=(id)=>{const p=visiveis().find(x=>x.id===id);if(!p) throw new Error('Projeto não encontrado');return p;};
  const ok=(data)=>({data,error:null});
  const fail=(message)=>({data:null,error:{message}});
  const handlers={
    catalogo_validar_sessao:()=>ok({valido:true,empresa_id:'company',cliente_id:'client'}),
    funcionario_contexto:()=>ok({ativo:true,administrador_legado:true}),
    catalogo_carregar:()=>ok({empresa:{nome:'Chiavari',...(opts.empresaLogo?{logo_url:opts.empresaLogo}:{})},decorador:{nome:'Kelly Decor',...(opts.decoradorCores||{})},itens:ITENS}),
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
    projeto_enviar_pedido:(p)=>{const r=achar(p.p_id);const total=r.dados.ambientes.reduce((s,a)=>s+a.itens.reduce((t,i)=>t+(i.quantidade||1),0),0);
      if(!total) return fail('Adicione ao menos um item ao projeto antes de enviar o pedido');
      r.status='pedido_enviado';r.pedido_enviado_em=new Date().toISOString();r.pedido_observacao=p.p_observacao||null;
      r.pedido_snapshot={total_itens:total,enviado_em:r.pedido_enviado_em,ambientes:r.dados.ambientes.map(a=>({ambiente:a.nome,itens:a.itens.map(i=>({item_id:i.item_id,quantidade:i.quantidade,nome:'Item '+i.item_id,referencia:'REF'+i.item_id}))}))};
      r.atualizado_em=r.pedido_enviado_em;return ok(resumo(r));},
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
