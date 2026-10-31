/* Dados sintéticos identificados por lote; conexão temporária do CLI, sem credenciais em disco. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{Client}=require('pg');
const raiz=path.resolve(__dirname,'..');
const empresa='bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
async function conectar(){
 let script;try{script=execFileSync(process.execPath,[path.join(raiz,'node_modules/supabase/dist/supabase.js'),'db','dump','--linked','--dry-run','--workdir',raiz],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true,timeout:45000});}catch{throw Error('Não foi possível obter a conexão temporária do Supabase.');}
 const pg={};for(const m of script.matchAll(/^export (PG\w+)="([^"\r\n]*)"/gm))pg[m[1]]=m[2];
 if(!pg.PGHOST||!pg.PGPASSWORD)throw Error('Conexão temporária indisponível.');
 const db=new Client({host:pg.PGHOST,port:Number(pg.PGPORT),user:pg.PGUSER,password:pg.PGPASSWORD,database:pg.PGDATABASE,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(raiz,'Scripts/supabase-root.crt'),'utf8')},connectionTimeoutMillis:20000});
 await db.connect();await db.query('set role postgres');return db;
}
async function inventario(db){
 const colunas=(await db.query("select table_name,column_name,data_type,udt_name,is_nullable,column_default,is_generated from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
 const regras=(await db.query("select c.relname tabela,conname nome,pg_get_constraintdef(con.oid) regra from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname")).rows;
 const gatilhos=(await db.query("select c.relname tabela,t.tgname nome,pg_get_triggerdef(t.oid) definicao,p.proname funcao,pg_get_functiondef(p.oid) corpo from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal")).rows;
 fs.mkdirSync(path.join(raiz,'.tmp'),{recursive:true});fs.writeFileSync(path.join(raiz,'.tmp/demo-inventario.json'),JSON.stringify({colunas,regras,gatilhos},null,2));
 console.log([...new Set(colunas.map(c=>c.table_name))].join('\n'));
}
const lote='DEMO-SISTEMA-20261031';
const ident=nome=>'"'+nome.replace(/"/g,'""')+'"';
const uid=chave=>{const h=crypto.createHash('sha256').update(lote+':'+chave).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
async function semear(db,aplicar){
 const manifesto=[],contagem={};
 const colunas=(await db.query("select table_name,column_name,udt_name from information_schema.columns where table_schema='public'")).rows;
 const hoje=(await db.query("select (now() at time zone 'America/Sao_Paulo')::date::text dia")).rows[0].dia;
 const dia=n=>new Date(Date.parse(hoje+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const instante=n=>dia(n)+'T14:00:00-03:00';
 const jsoncol=(t,k)=>colunas.some(c=>c.table_name===t&&c.column_name===k&&['json','jsonb'].includes(c.udt_name));
 async function inserir(t,v,chave='id'){
   if(t==='operacao_etapa_caminhoes')chave='etapa_id';
   if(chave==='id'&&!v.id)v.id=uid(t+':'+(contagem[t]||0));
   const ks=Object.keys(v),vs=ks.map(k=>jsoncol(t,k)?JSON.stringify(v[k]):v[k]);
   try{const r=(await db.query(`insert into public.${ident(t)}(${ks.map(ident).join(',')}) values(${ks.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,vs)).rows[0];
   manifesto.push({tabela:t,chave,valor:r[chave]});contagem[t]=(contagem[t]||0)+1;return r;
   }catch(e){throw new Error(t+': '+e.message);}
 }
 async function numero(t,tipo){return Number((await db.query(`select coalesce(max(numero),0)+1 n from ${ident(t)} where empresa_id=$1`+(tipo?' and tipo=$2':''),tipo?[empresa,tipo]:[empresa])).rows[0].n);}
 await db.query('begin');
 try{
 await db.query("set local lock_timeout='8s';set local statement_timeout='120s'");
 await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[lote]);
 await db.query(`create table if not exists public.sistema_demo_lotes(id text primary key,empresa_id uuid not null references empresas(id),criado_em timestamptz not null default now(),manifesto jsonb not null);
 alter table public.sistema_demo_lotes enable row level security;revoke all on public.sistema_demo_lotes from anon,authenticated;`);
 if((await db.query('select 1 from sistema_demo_lotes where id=$1',[lote])).rowCount){await db.query('rollback');console.log('Este lote já foi inserido; nenhum registro duplicado.');return;}
 if(!(await db.query('select 1 from empresas where id=$1',[empresa])).rowCount)throw Error('Empresa de destino não encontrada.');
 const dono=(await db.query('select user_id from usuarios_empresas where empresa_id=$1 order by user_id limit 1',[empresa])).rows[0]?.user_id;
 if(!dono)throw Error('Empresa sem usuário associado.');
 const tag='DEMO · ',obs='DEMO: cenário fictício para explorar o sistema. Não executar atendimento, entrega ou cobrança.';
 const equipe=[];
 for(const [i,nome] of ['Ana Comercial','Beatriz Comercial','Carla Comercial','Daniel Triagem','Eduardo Logística','Fernanda Produção','Gabriel Montagem','Helena RH'].entries()){
   const f=await inserir('funcionarios_acesso',{empresa_id:empresa,nome:tag+nome,setor:i<3?'Comercial':i===3?'Triagem':i===4?'Logística':i===5?'Produção':i===6?'Montagem':'RH',cargo:i<3?'Assistente comercial':'Colaborador DEMO',acesso_sistema:false,ativo:true,data_admissao:dia(-240-i*20),equipe_operacional:i===3?'triagem':i===4?'carregamento':i===5?'producao':i===6?'montagem':null,dados_rh:{observacoes:obs,demo_lote:lote}});
   equipe.push(f);
   await inserir('rh_fichas',{funcionario_id:f.id,empresa_id:empresa,matricula:'DEMO-'+(i+1),tipo_contrato:i===6?'temporario':'clt',jornada:'DEMO · Segunda a sexta, 08h às 17h',observacoes:obs,tamanho_camisa:['P','M','G'][i%3]},'funcionario_id');
   await inserir('rh_exames',{empresa_id:empresa,funcionario_id:f.id,nome:tag+'Exame periódico',tipo:'periodico',data_realizacao:dia(-90-i),validade:dia(i<2?-3:90),resultado:'apto',observacao:obs});
   if(i<4)await inserir('rh_ferias',{empresa_id:empresa,funcionario_id:f.id,periodo_inicio:dia(-365),inicio:dia(20+i*15),fim:dia(34+i*15),dias:15,observacao:obs});
   await inserir('rh_solicitacoes',{empresa_id:empresa,colaborador_id:f.id,colaborador_nome:f.nome,tipo:['Uniforme','Declaração','Ajuste de ponto'][i%3],descricao:obs,status:i%2?'Em andamento':'Pendente'});
 }
 const treinamento=await inserir('rh_treinamentos',{empresa_id:empresa,nome:tag+'Boas práticas no atendimento e operação',carga_horaria:4,validade_meses:12,descricao:obs});
 await inserir('rh_turmas',{empresa_id:empresa,treinamento_id:treinamento.id,data:dia(7),instrutor:tag+'Instrutor',local:tag+'Sala de treinamento',carga_horaria:4,observacao:obs});
 const beneficio=await inserir('rh_beneficios',{empresa_id:empresa,nome:tag+'Auxílio alimentação',valor:350,adesao:'quem_aderir',descricao:obs});
 for(const f of equipe.slice(0,4))await inserir('rh_beneficio_adesoes',{empresa_id:empresa,funcionario_id:f.id,beneficio_id:beneficio.id,desde:dia(-30)});
 const fornecedores=[];
 for(const [i,nome] of ['Tecidos Aurora','Tintas Horizonte','Transportes Caminho','Marcenaria Forma','Ferragens Base','Limpeza Brilho'].entries())fornecedores.push(await inserir('fornecedores',{empresa_id:empresa,nome_razao_social:tag+nome,nome_fantasia:tag+nome,documento:'DEMO-'+String(i+1).padStart(4,'0'),tipo:i===2?'servicos':'ambos',observacoes:obs,portal_ativo:false}));
 const clientes=[],locais=[];
 for(let i=0;i<16;i++)clientes.push(await inserir('clientes_empresas',{empresa_id:empresa,nome_razao:tag+['Ateliê Aurora','Studio Jardim','Eventos Horizonte','Casa Celebra','Cenários de Festa','Luz e Flores','Vila Decor','Encanto Produções'][i%8]+' '+(i+1),tipo_pessoa:'PJ',cpf_cnpj:'',email:'demo-cliente-'+(i+1)+'@example.invalid',status:i===15?'Morno':'Ativo'}));
 for(let i=0;i<8;i++)locais.push(await inserir('locais_empresas',{empresa_id:empresa,tipo_pessoa:'PJ',nome_razao:tag+['Espaço Jardim','Salão Horizonte','Fazenda Aurora','Terraço Central','Casa das Flores','Villa Bosque','Centro de Eventos','Lounge Lago'][i],cpf_cnpj:'',telefone:'',email:'',endereco:'Local fictício de demonstração',numero_endereco:'S/N',ponto_referencia:obs,distancia_galpao_km:12+i*7,distancia_galpao_texto:(12+i*7)+' km'}));
 for(let i=0;i<4;i++)await inserir('clientes_equipes',{empresa_id:empresa,nome:tag+'Equipe '+(i+1),titular_id:clientes[i].id,observacao:obs});
 const itens=[],nomesItens=['Sofá modular','Poltrona arredondada','Puff quadrado','Mesa de centro','Mesa lateral','Bar ripado','Aparador clássico','Estante decorativa','Cadeira de madeira','Painel de fundo','Banco estofado','Mesa de jantar','Vaso decorativo','Tapete de composição','Balcão de apoio','Biombo'];
 for(let i=0;i<nomesItens.length;i++)itens.push(await inserir('itens',{empresa_id:empresa,tipo:'Item',codigo:'DEMO-'+String(i+1).padStart(3,'0'),produto:tag+nomesItens[i],descricao_total:tag+nomesItens[i],categoria:i<3?'Estofados':i<9?'Mobiliário':'Decoração',material:i<3?'Madeira e tecido':'Madeira',cor:['Natural','Bege','Branco','Preto'][i%4],largura:1.2,altura:0.8,profundidade:0.6,volume_cubico:0.576,valor_locacao:80+i*35,valor_reposicao:600+i*180,estoque_total:60,estoque_manutencao:0,estoque_indisponivel:0,exibir_no_site:false,fornecedor_id:fornecedores[i%6].id}));
 const cabecalhos=(await db.query("select p.id,p.nome planilha,l.aba,l.valores from gs_linhas l join gs_planilhas p on p.id=l.planilha_id where l.linha=1")).rows;
 async function planilha(nome,aba,dados){
   const cab=cabecalhos.find(c=>c.planilha===nome&&c.aba===aba);if(!cab)throw Error('Cabeçalho não encontrado: '+nome+'/'+aba);
   const linha=Number((await db.query('select coalesce(max(linha),1)+1 n from gs_linhas where planilha_id=$1 and aba=$2',[cab.id,aba])).rows[0].n);
   await db.query('insert into gs_linhas(planilha_id,aba,linha,valores) values($1,$2,$3,$4)',[cab.id,aba,linha,JSON.stringify(cab.valores.map((k,i)=>dados[String(k)]??dados['#'+i]??''))]);
   manifesto.push({tabela:'gs_linhas',chave:{planilha_id:cab.id,aba,linha}});contagem['planilha:'+nome+'/'+aba]=(contagem['planilha:'+nome+'/'+aba]||0)+1;
 }
 const materiais=[];
 for(const [i,nome] of ['Tinta bege','Tinta branca','Tecido linho','Tecido veludo','Lixa fina','Cola de contato','Parafuso','Luva de proteção','Pincel','Fita de proteção','Espuma','Ferramenta de apoio'].entries()){
   const un=i<2?'LT':i<4?'M':'UN',saldo=i%4===0?3:40+i*5,produtoId=lote+'-MAT-'+(i+1);
   const m=await inserir('insumos',{empresa_id:empresa,codigo:'DMINS'+(i+1),nome:tag+nome,categoria:i<4?'Personalização':'Materiais',unidade:un,estoque_atual:saldo,estoque_minimo:10,valor_medio:12+i*3});
   materiais.push({...m,produtoId});
   await inserir('almoxarifado_materiais',{empresa_id:empresa,codigo:'DEMO-MAT-'+(i+1),nome:tag+nome,categoria:m.categoria,tipo_item:i===7?'epi':i===11?'retornavel':'consumivel',unidade:un,estoque_atual:saldo,estoque_minimo:10,estoque_maximo:100,valor_medio:12+i*3,insumo_id:m.id});
   await planilha('Almoxarifado','Produtos',{ID:produtoId,Codigo:'DEMO-MAT-'+(i+1),Produto:tag+nome,Categoria:m.categoria,Setor:'DEMO · Produção',Unidade:un,EstoqueAtual:saldo,EstoqueMinimo:10,EstoqueIdeal:100,ValorCusto:12+i*3,ValorReposicao:20+i*4,Status:'ATIVO',Observacoes:obs,CriadoEm:instante(-10),AtualizadoEm:instante(0)});
   await planilha('Almoxarifado','Movimentacoes',{ID:produtoId+'-ENT',DataHora:instante(-10),Tipo:'ENTRADA',ProdutoID:produtoId,Codigo:'DEMO-MAT-'+(i+1),Produto:tag+nome,Categoria:m.categoria,Setor:'DEMO · Produção',Unidade:un,Quantidade:saldo,Responsavel:equipe[3].nome,Fornecedor:fornecedores[i%6].nome_razao_social,EstoqueAnterior:0,EstoqueAtual:saldo,OrigemRegistro:'DEMO',Observacoes:obs,Valor:(12+i*3)*saldo});
 }
 const personalizacoes=[];
 for(let i=0;i<6;i++){
   const setor=['pintura','forracao','personalizacao'][i%3];
   const p=await inserir('personalizacoes',{empresa_id:empresa,tipo:tag+['Pintura fosca','Forração em linho','Acabamento decorativo'][i%3]+' '+(i+1),alvo:'ITEM',vinculo_id:itens[i].id,vinculo_nome:itens[i].produto,observacoes:obs,tempo:1.5,custo_hora:40,preco_sugerido:150,status:'ATIVO',producao_etapas:[{nome:'DEMO · Preparar peça',setor,horas:0.5,grupo:1},{nome:'DEMO · Aplicar acabamento',setor,horas:0.75,grupo:2},{nome:'DEMO · Conferir acabamento',setor,horas:0.25,grupo:3}]});
   personalizacoes.push(p);await inserir('personalizacoes_insumos',{empresa_id:empresa,personalizacao_id:p.id,insumo_id:materiais[i].id,almox_produto_id:materiais[i].produtoId,material_nome:materiais[i].nome,unidade:materiais[i].unidade,quantidade:0.5});
 }
 const conta=await inserir('fin_contas',{empresa_id:empresa,nome:tag+'Caixa de demonstração',tipo:'caixa',saldo_inicial:20000,saldo_inicial_data:dia(-30),observacoes:obs});
 const pedidos=[];
 for(let i=0;i<40;i++){
   const status=i<12?'orcamento':i<20?'pre_reserva':i<35?'aprovado':'cancelado';
   const passado=i>=28&&i<35,evento=dia(passado?-12+(i-28):3+i%20),entrega=new Date(Date.parse(evento+'T12:00:00Z')-86400000).toISOString().slice(0,10),coleta=new Date(Date.parse(evento+'T12:00:00Z')+86400000).toISOString().slice(0,10);
   const cli=clientes[i%16],local=locais[i%8],autor=equipe[i%3],pecas=[itens[i%16],itens[(i+3)%16],itens[(i+7)%16]],pers=personalizacoes[i%6];
   const itensProjeto=pecas.map((p,k)=>({id:uid('linha:'+i+':'+k),item_id:p.id,nome:p.produto,quantidade:2+k,quantidade_solicitada:2+k,valor_locacao:Number(p.valor_locacao),valor_reposicao:Number(p.valor_reposicao),...(k===0&&i%2===0?{personalizacao_id:pers.id,personalizacao_nome:pers.tipo,personalizacao_valor:150}: {})}));
   const locacao=itensProjeto.reduce((s,p)=>s+p.quantidade*p.valor_locacao,0),frete=180+(i%4)*60,montagem=150,total=locacao+frete+montagem;
   const parcelas=[{numero:'1',tipo:'Entrada',componente:'locacao',valor:total*0.5,vencimento:dia(i<30?-3: -15),metodo:'Dinheiro',status:'Programado'},{numero:'2',tipo:'Saldo',componente:'locacao',valor:total*0.5,vencimento:evento,metodo:'Dinheiro',status:'Programado'}];
   const observacoes={demo_lote:lote,descricao:obs,horario_entrega:'09:00',horario_coleta:'17:00',observacoes_entrega:obs,observacoes_coleta:obs,observacoes_separacao:obs,valores:{locacao,frete,montagem,total},parcelas_financeiras:parcelas,itens_comerciais:itensProjeto,projeto_comercial:{id:uid('projeto-pedido:'+i),noivos:tag+'Evento '+(i+1),data_evento:evento,dados:{ambientes:[{id:'demo-amb-'+i,nome:'DEMO · Salão principal',itens:itensProjeto}]}},...(status==='cancelado'?{cancelamento:{motivo:['Cliente desistiu','Evento remarcado','Concorrência mais barata','Sem retorno','Outro motivo'][i-35],observacao:obs,em:instante(-(i%5)),por:'DEMO · Equipe de demonstração'}}:{})};
   const p=await inserir('separacoes_pedidos',{empresa_id:empresa,numero_pedido:'DEMO-20261031-'+String(i+1).padStart(3,'0'),cliente_id:cli.id,cliente_nome:cli.nome_razao,local_id:local.id,local_nome:local.nome_razao,tipo_evento:tag+['Casamento','Corporativo','Aniversário','Feira'][i%4],data_evento:evento,data_entrega:entrega,data_coleta:coleta,data_hora:evento+'T18:00:00-03:00',status_comercial:status,pre_reserva_ate:status==='pre_reserva'?dia(i%4===0?-1:3+i%5):null,valor_total:total,observacoes,criado_por:autor.id,criado_em:instante(-Math.max(1,30-i%25))});
   pedidos.push(p);
   if(status==='aprovado'||status==='pre_reserva')for(const it of itensProjeto)await inserir('separacoes_itens',{empresa_id:empresa,separacao_pedido_id:p.id,item_id:it.item_id,item_nome:it.nome,codigo_item:pecas.find(x=>x.id===it.item_id).codigo,quantidade_solicitada:it.quantidade});
   if(status==='aprovado')await inserir('contratos_pedidos',{empresa_id:empresa,pedido_id:p.id,conteudo_final:'<h1>DEMO · Contrato de demonstração</h1><p>'+obs+'</p><p>Pedido '+p.numero_pedido+' · '+cli.nome_razao+'</p>',conteudo_editado:true});
   await inserir('comercial_prod_eventos',{empresa_id:empresa,pedido_id:p.id,autor_id:autor.id,criado_em:instante(-i%12),transacao:lote+'-'+i,tipo:'criacao',detalhes:[{campo:'demonstração',para:'DEMO · Pedido cadastrado para visualização'}]});
   for(let k=0;k<1+i%5;k++)await inserir('comercial_prod_eventos',{empresa_id:empresa,pedido_id:p.id,autor_id:equipe[(i+k)%3].id,criado_em:instante(-k),transacao:lote+'-'+i+'-'+k,tipo:'alteracao',detalhes:[{campo:'observacoes.horario_entrega',de:'08:00',para:'09:00',demo_lote:lote},{campo:'observacoes.descricao',de:'DEMO · Em montagem',para:'DEMO · Informações revisadas'}]});
   if(i<20){
     for(let k=0;k<2;k++){
       const c=await inserir('comercial_contatos',{empresa_id:empresa,pedido_id:p.id,autor_id:equipe[(i+k)%3].id,criado_em:instante(-3+k),tipo:k?'Resposta do cliente':'Orçamento enviado',situacao:['Aguardando resposta','Aguardando decisão','Reunião agendada','Em negociação'][i%4],motivo:i%2?'Reunião para decidir':'Aguardando aprovação',canal:i%3?'WhatsApp':'E-mail',observacao:tag+['Cliente vai fazer reunião para decidir.','Aguardando confirmação da data.','Cliente pediu ajuste no orçamento.','Retornar após aprovação da família.'][i%4]});
       await inserir('comercial_retornos',{empresa_id:empresa,pedido_id:p.id,contato_id:c.id,responsavel_id:equipe[i%3].id,prazo:dia(k===0?-2:i%3===0?-1:i%3===1?0:3),prazo_original:dia(k===0?-2:i%3===0?-1:i%3===1?0:3),...(k===0?{concluido_em:instante(-2),executor_id:equipe[(i+1)%3].id,encerramento:'contato'}:{})});
     }
   }
   if(status==='aprovado'){
     const titulos=(await db.query("select * from fin_receber where pedido_id=$1 and status<>'cancelado' order by parcela,componente",[p.id])).rows;
     for(const t of titulos){
       await db.query('update fin_receber set conta_id=$1,conta_manual=true,observacoes=$2 where id=$3',[conta.id,obs,t.id]);
       if((i<30&&t.parcela===1)||passado){
         const recebido=i===22?Number(t.valor)/2:Number(t.valor),dt=dia(passado?-14:-1);
         const baixa=await inserir('fin_baixas',{empresa_id:empresa,tipo:'receber',receber_id:t.id,data:dt,valor:recebido,liquido:recebido,conta_id:conta.id,forma:'Dinheiro',observacoes:obs});
         await db.query("update fin_receber set recebido=$1,status=case when $1>=valor then 'recebido' else 'parcial' end where id=$2",[recebido,t.id]);
         await inserir('fin_movimentos',{empresa_id:empresa,tipo:'baixa',direcao:'entrada',data:dt,descricao:tag+'Recebimento '+p.numero_pedido,valor:recebido,conta_id:conta.id,baixa_id:baixa.id});
       }
     }
   }
 }
 console.log('Cadastros, estoque, pedidos e recebimentos preparados.');
 // Cenários em etapas diferentes, somente sobre os pedidos DEMO recém-criados.
 for(let i=20;i<35;i++){
   const p=pedidos[i];
   if(i<23){await db.query("update separacoes_pedidos set status='em_separacao' where id=$1",[p.id]);continue;}
   await db.query('update separacoes_itens set quantidade_separada=quantidade_solicitada where separacao_pedido_id=$1',[p.id]);
   await db.query("update separacoes_pedidos set status='separado',finalizado_em=now() where id=$1",[p.id]);
   if(i<26)continue;
   const op={carregamento:{iniciado_em:instante(-10),concluido_em:instante(-10),responsavel:'DEMO · Equipe',total:9,lidas:9,demo_lote:lote}};
   if(i>=30)op.descarregamento={iniciado_em:instante(-4),concluido_em:instante(-4),demo_lote:lote};
   if(i>=31)op.retorno={iniciado_em:instante(-3),concluido_em:instante(-3),demo_lote:lote};
   await db.query("update separacoes_pedidos set status_operacional=$1,operacao=$2,encerrado_operacional_em=$3 where id=$4",[i>=31?'retornado':i>=30?'descarregado':'carregado',JSON.stringify(op),i>=32?instante(-3):null,p.id]);
   if(i>=28){
     const linhas=(await db.query('select item_id,item_nome,quantidade_solicitada from separacoes_itens where separacao_pedido_id=$1',[p.id])).rows;
     for(const etapa of i>=29?['entrega','coleta']:['entrega'])await inserir('logistica_confirmacoes',{empresa_id:empresa,pedido_id:p.id,etapa,versao:1,criado_por:dono,responsavel:'DEMO · Equipe',observacao:obs,itens:linhas.map(it=>({chave:it.item_id,item_id:it.item_id,nome:it.item_nome,previsto:Number(it.quantidade_solicitada),entregue:Number(it.quantidade_solicitada),coletado:Number(it.quantidade_solicitada),danificado:0,retirado_lista:0}))});
   }
   if(i>=32)await inserir('fin_posicoes_finais',{pedido_id:p.id,empresa_id:empresa,status:'confirmado',fonte:'DEMO',itens:[],credito:0,cobranca:0,atualizado_por:dono,confirmado_em:instante(-2)},'pedido_id');
 }
 await db.query("update producao_etapas e set estado=case when p.data_evento<current_date then 'concluida' when e.ordem=1 then 'execucao' else 'pendente' end,iniciada_em=case when p.data_evento<current_date or e.ordem=1 then now()-interval '1 day' end,concluida_em=case when p.data_evento<current_date then now()-interval '12 hours' end from producao_itens i join separacoes_pedidos p on p.id=i.pedido_id where e.producao_item_id=i.id and p.observacoes->>'demo_lote'=$1",[lote]);
 // Configuração apenas aditiva para os participantes fictícios; preserva opções e acessos atuais.
 const antes=(await db.query('select config from comercial_prod_config where empresa_id=$1 for update',[empresa])).rows[0]?.config;
 const cfg=antes?JSON.parse(JSON.stringify(antes)):{participantes:[],acessos:[],situacoes:['Aguardando resposta','Aguardando decisão','Reunião agendada','Em negociação'],motivos:['Reunião para decidir','Aguardando aprovação']};
 const idsDemo=equipe.slice(0,3).map(f=>f.id);
 cfg.participantes=[...new Set([...cfg.participantes,...idsDemo])];
 for(const alvo of [...idsDemo,'equipe'])if(!cfg.acessos.some(a=>a.observador===dono&&a.alvo===alvo))cfg.acessos.push({observador:dono,alvo});
 await db.query('insert into comercial_prod_config(empresa_id,config) values($1,$2) on conflict(empresa_id) do update set config=excluded.config',[empresa,JSON.stringify(cfg)]);
 // A implantação começa hoje: exemplos de atividade ficam após o marco sem alterar métricas reais.
 await db.query("update comercial_prod_eventos e set criado_em=greatest(c.inicio,now()-make_interval(mins=>abs(hashtext(e.id::text)%90))) from comercial_prod_config c where c.empresa_id=e.empresa_id and e.empresa_id=$1 and e.autor_id=any($2::uuid[])",[empresa,idsDemo]);
 await db.query("with ordenados as(select id,row_number() over(partition by pedido_id order by criado_em,id)::int n from comercial_contatos where empresa_id=$1 and autor_id=any($2::uuid[])) update comercial_contatos x set criado_em=greatest(c.inicio,now()-make_interval(mins=>90-30*o.n)) from comercial_prod_config c,ordenados o where c.empresa_id=x.empresa_id and o.id=x.id",[empresa,idsDemo]);
 await db.query("update comercial_retornos r set concluido_em=greatest(c.inicio,now()-interval '30 minutes'),prazo=(now() at time zone 'America/Sao_Paulo')::date-(abs(hashtext(r.id::text)%2)),prazo_original=(now() at time zone 'America/Sao_Paulo')::date-(abs(hashtext(r.id::text)%2)) from comercial_prod_config c where c.empresa_id=r.empresa_id and r.empresa_id=$1 and r.executor_id=any($2::uuid[]) and r.encerramento='contato'",[empresa,idsDemo]);
 const caminhoes=[];
 for(let i=0;i<3;i++)caminhoes.push(await inserir('caminhoes',{empresa_id:empresa,modelo:tag+['Baú pequeno','Baú médio','Baú grande'][i],codigo:'DEMO-CAM-'+(i+1),placa:'DEMO'+(100+i),tipo:i===2?'terceirizado':'proprio',largura_bau:2.3,altura_bau:2.5,comprimento_bau:4+i*2,capacidade_m3:23+i*12,fornecedor_id:i===2?fornecedores[2].id:null}));
 const etapas=(await db.query('select e.* from operacao_etapas e join separacoes_pedidos p on p.id=e.pedido_id where p.observacoes->>\'demo_lote\'=$1 order by e.data,e.tipo',[lote])).rows;
 // A escala automática pode ter preenchido estas novas etapas: usar só recursos DEMO.
 await db.query('delete from operacao_etapa_pessoas where etapa_id=any($1::uuid[])',[etapas.map(e=>e.id)]);
 await db.query('delete from operacao_etapa_caminhoes where etapa_id=any($1::uuid[])',[etapas.map(e=>e.id)]);
 for(const [i,e] of etapas.entries()){
   if(['carregamento','montagem','desmontagem'].includes(e.tipo)){
     await inserir('operacao_etapa_pessoas',{empresa_id:empresa,etapa_id:e.id,funcionario_id:equipe[4].id,nome:equipe[4].nome,papel:'responsavel'});
     await inserir('operacao_etapa_pessoas',{empresa_id:empresa,etapa_id:e.id,funcionario_id:equipe[6].id,nome:equipe[6].nome,papel:'equipe'});
     await inserir('operacao_etapa_caminhoes',{empresa_id:empresa,etapa_id:e.id,caminhao_id:caminhoes[i%3].id});
   }
 }
 for(let i=0;i<8;i++){
   const p=pedidos[20+i];await inserir('frete_viagens',{empresa_id:empresa,pedido_id:p.id,pedido_numero:p.numero_pedido,cliente_nome:p.cliente_nome,caminhao_id:caminhoes[i%3].id,caminhao_codigo:caminhoes[i%3].codigo,fornecedor_id:fornecedores[2].id,fornecedor_nome:fornecedores[2].nome_razao_social,direcao:i%2?'coleta':'entrega',data:p.data_entrega,origem:'DEMO · Galpão',destino:p.local_nome,km:20+i*7,valor_sistema:250+i*40,valor_transportadora:i%2?280+i*40:null,obs});
 }
 const montagem=etapas.filter(e=>e.tipo==='montagem').slice(0,5);
 const senha=(await db.query("select extensions.crypt($1,extensions.gen_salt('bf',8)) h",[crypto.randomBytes(32).toString('hex')])).rows[0].h;
 for(let i=0;i<3;i++){
   const motorista=await inserir('uber_motoristas',{empresa_id:empresa,nome:tag+'Motorista '+(i+1),telefone:'00000000'+String(i+1).padStart(3,'0'),senha_hash:senha,carro_modelo:tag+'Veículo de apoio',carro_placa:'DEMO'+(200+i)});
   const e=montagem[i];if(e){const v=await inserir('uber_vagas',{empresa_id:empresa,etapa_id:e.id,pedido_id:e.pedido_id,ponto_encontro:'DEMO · Galpão',destino:'DEMO · Local do evento',data:e.data,hora:'08:00',km:18+i*5,valor:70+i*10,obs});await inserir('uber_corridas',{empresa_id:empresa,vaga_id:v.id,motorista_id:motorista.id,status:i===0?'concluida':'confirmada',valor:70+i*10,...(i===0?{checkout_em:instante(-1)}:{})});}
 }
 for(const [i,e] of montagem.entries())await inserir('free_vagas',{empresa_id:empresa,etapa_id:e.id,horario:'08:00',ponto_encontro:'DEMO · Galpão',lider:equipe[6].nome,quantidade:2+i%3,observacao:obs,valor:180,modo:'TODOS',criado_por:'DEMO'});
 const necessidades=[];
 for(let i=0;i<12;i++){
   const m=materiais[i%12],n=await numero('compras_registros','necessidade');
   necessidades.push(await inserir('compras_registros',{empresa_id:empresa,tipo:'necessidade',numero:n,status:i%3===0?'aguardando_aprovacao':'pendente',dados:{demo_lote:lote,descricao_item:m.nome,material_nome:m.nome,material_id:m.produtoId,codigo_material:'DEMO-MAT-'+(i+1),unidade:m.unidade,quantidade:20+i,quantidade_faltante:20+i,quantidade_comprada:0,origem:'solicitacao',solicitante_nome:equipe[5].nome,setor:'DEMO · Produção',observacao:obs,pcp_status:'published'}}));
 }
 const pedidosCompra=[];
 for(let i=0;i<4;i++){
   const m=materiais[i],necessidade=necessidades[i],f=fornecedores[i],qtd=20+i,preco=12+i*3;
   const item={id:uid('cotacao-item:'+i),material_id:m.produtoId,material_nome:m.nome,descricao_item:m.nome,unidade:m.unidade,quantidade_cotada:qtd,need_allocations:[{purchase_request_id:necessidade.id,quantidade_alocada:qtd}],respostas:i?[{supplier_id:f.id,supplier_nome:f.nome_razao_social,valor_unitario:preco,valor_total:qtd*preco,atende_pcp:true,header:{frete:0,desconto:0,data_prevista_entrega:dia(5+i)}}]:[]};
   const cot=await inserir('compras_registros',{empresa_id:empresa,tipo:'cotacao',numero:await numero('compras_registros','cotacao'),status:i>1?'encerrada':'aberta',dados:{demo_lote:lote,observacao:obs,items:[{...item,comprado:i>1}],suppliers:[{supplier_id:f.id,nome:f.nome_razao_social,status:i?'respondido':'aguardando',header:{frete:0,desconto:0}}],itens_count:1,fornecedores_count:1,respostas_count:i?1:0}});
   if(i>1){
     const pedido=await inserir('compras_registros',{empresa_id:empresa,tipo:'pedido',numero:await numero('compras_registros','pedido'),status:i===2?'aguardando_recebimento':'parcialmente_recebido',dados:{demo_lote:lote,quotation_id:cot.id,fornecedor_id:f.id,fornecedor_nome:f.nome_razao_social,fornecedor:{id:f.id,nome:f.nome_razao_social,documento:f.documento},items:[{...item,id:uid('compra-item:'+i),quotation_item_id:item.id,quantidade:qtd,quantidade_recebida:i===2?0:5,valor_unitario:preco,valor_total:qtd*preco,allocations:item.need_allocations}],valor_total:qtd*preco,frete:0,desconto:0,prazo_acordado:dia(5+i),comprador_nome:'DEMO · Compras',itens_count:1,percentual_recebido:i===2?0:22,xml_percent:0,nfe_receipts:[],observacao:obs}});pedidosCompra.push(pedido);
   }
   await db.query("update compras_registros set status=$1 where id=$2",[i>1?'comprada':'em_cotacao',necessidade.id]);
 }
 for(let i=0;i<2;i++)await inserir('compras_registros',{empresa_id:empresa,tipo:'rnc',numero:await numero('compras_registros','rnc'),status:i?'em_tratativa':'aberta',dados:{demo_lote:lote,purchase_order_id:pedidosCompra[i].id,pedido_numero:pedidosCompra[i].numero,fornecedor_nome:fornecedores[i+2].nome_razao_social,descricao:tag+'Divergência na entrega de material',motivo:'DEMO · Quantidade ou acabamento divergente',observacao:obs,quantidade:1}});
 for(let i=0;i<5;i++)await inserir('ideias_premiadas',{empresa_id:empresa,autor_id:dono,autor_nome:'DEMO · Equipe de demonstração',titulo:tag+['Organização por etiquetas','Checklist de carregamento','Retorno comercial organizado','Redução de desperdício','Treinamento de integração'][i],area:['Estoque','Logística','Comercial','Produção','RH'][i],problema:'DEMO · Exemplo fictício de uma dificuldade na rotina da equipe.',proposta:'DEMO · Criar um processo simples de acompanhamento e conferência.',beneficio:'DEMO · Melhorar a organização, o tempo e a comunicação entre os setores.',status:['recebida','em_analise','selecionada','implementada','nao_priorizada'][i],retorno:obs});
 for(let i=0;i<6;i++){
   await inserir('almoxarifado_solicitacoes',{empresa_id:empresa,titulo:tag+'Materiais para acabamento '+(i+1),setor:'Produção',solicitante:equipe[5].nome,status:['solicitado','separando','pronto'][i%3],itens:[{id:materiais[i].id,nome:materiais[i].nome,quantidade:2}],observacao:obs});
   const f=fornecedores[i%6],valor=350+i*125;
   const pagar=await inserir('fin_pagar',{empresa_id:empresa,origem:'manual',fornecedor_id:f.id,fornecedor_nome:f.nome_razao_social,descricao:tag+'Compra de materiais '+(i+1),documento:'DEMO-DOC-'+(i+1),vencimento:dia(i%3===0?-5:5+i),valor,conta_id:conta.id,forma:'Dinheiro',observacoes:obs});
   if(i%2){const b=await inserir('fin_baixas',{empresa_id:empresa,tipo:'pagar',pagar_id:pagar.id,data:dia(-1),valor,liquido:valor,conta_id:conta.id,forma:'Dinheiro',observacoes:obs});await db.query("update fin_pagar set pago=valor,status='pago' where id=$1",[pagar.id]);await inserir('fin_movimentos',{empresa_id:empresa,tipo:'baixa',direcao:'saida',data:dia(-1),descricao:pagar.descricao,valor,conta_id:conta.id,baixa_id:b.id});}
 }
 for(let i=0;i<6;i++)await inserir('manutencao_predial_solicitacoes',{empresa_id:empresa,numero:await numero('manutencao_predial_solicitacoes'),token:uid('manut-token:'+i),titulo:tag+['Revisar iluminação','Pintar área de apoio','Revisar torneira','Ajustar porta','Limpar climatização','Revisar cobertura'][i],local:'DEMO · Área '+(i+1),descricao:obs,categoria:['eletrica','pintura','hidraulica','portas_janelas','climatizacao','outros'][i],prioridade:i===0?'alta':'normal',status:['aberta','analise','agendada'][i%3],necessario_ate:dia(7+i),criado_por:dono,solicitante_nome:'DEMO · Solicitação fictícia'});
 for(let i=0;i<5;i++){
   const p=pedidos[30+i],item=itens[i];
   const ret=await inserir('acervo_retornos',{empresa_id:empresa,pedido_id:p.id,chave:lote+'-RET-'+i,item_id:item.id,tipo:i===4?'falta':'avaria',quantidade:1,estado:i===4?'investigacao':['triagem','limpeza','reparo','inspecao'][i],motivo:obs});
   await inserir('acervo_historico',{empresa_id:empresa,retorno_id:ret.id,estado:ret.estado,motivo:obs,usuario_id:dono});
   if(i<3)await inserir('acervo_os',{empresa_id:empresa,numero:await numero('acervo_os'),retorno_id:ret.id,item_id:item.id,quantidade:1,setor:['Marcenaria','Acabamento e Pintura','Forração'][i],fluxo:[['Marcenaria','Acabamento e Pintura','Forração'][i]],prazo:dia(2+i),responsavel:equipe[5].nome,solicitante_nome:'DEMO · Equipe de demonstração',criado_por:dono});
   await inserir('operacao_ocorrencias',{empresa_id:empresa,pedido_id:p.id,item_id:item.id,codigo:'DEMO-OC-'+i,tipo:i===4?'falta':'avaria',quantidade:1,descricao:obs,etapa:'coleta'});
   const contato=await inserir('posvenda_contatos',{empresa_id:empresa,cliente_chave:'id:'+p.cliente_id,cliente_id:p.cliente_id,cliente_nome:p.cliente_nome,disponivel_em:dia(-3+i),prazo:dia(-1+i),status:i<3?'pendente':'concluido',observacao:obs,atencao:i===4,...(i>=3?{respostas:[{pergunta:'DEMO · Como foi o atendimento?',respostas:[i===4?'Precisa melhorar':'Ótimo'],ruim:i===4}],feito_por_nome:'DEMO · Equipe',concluido_em:instante(-1)}:{})});
   await inserir('posvenda_contato_pedidos',{contato_id:contato.id,pedido_id:p.id},'pedido_id');
   await inserir('qualidade_inspecoes',{empresa_id:empresa,item_id:item.id,dados:{demo_lote:lote,status:i%2?'Aprovado':'Reprovado',observacao:obs,origem:'DEMO'}});
 }
 for(let i=0;i<8;i++)await inserir('projetos',{empresa_id:empresa,cliente_id:clientes[i].id,noivos:tag+'Projeto de evento '+(i+1),data_evento:dia(10+i),local_evento:locais[i].nome_razao,status:i%3===0?'pedido_enviado':'rascunho',dados:{demo_lote:lote,ambientes:[{id:'demo-estudio-'+i,nome:'DEMO · Lounge',itens:[{item_id:itens[i].id,quantidade:3}]}]},compartilhar:false});
 for(let i=0;i<8;i++){
   await planilha('Controle RH','OcorrenciasRH',{ID:lote+'-RH-'+i,'Data Ocorrencia':dia(-i),'Hora Ocorrencia':'08:15',Nome:equipe[i].nome,Sobrenome:'DEMO',Setor:equipe[i].setor,Tipo:i%2?'Atraso':'Sem Uniforme',Observacao:obs,Responsavel:'DEMO · RH','Data Registro':hoje,'Hora Registro':'14:00'});
   await inserir('rh_ocorrencias',{empresa_id:empresa,colaborador_id:equipe[i].id,colaborador_nome:equipe[i].nome,setor:equipe[i].setor,tipo:i%2?'Atraso':'Orientação',data_ocorrencia:dia(-i),descricao:obs});
   if(i<6)await planilha('Bonus - Operações','Ocorrências',{'#0':lote+'-OP-'+i,Data:dia(-i),'N do Pedido':pedidos[20+i].numero_pedido,Departamento:'DEMO · Logística',Supervisor:equipe[4].nome,'Ocorrência':'DEMO · Ajuste no carregamento',Status:i%2?'Pendente':'Resolvido','Observação':obs,Categoria:'DEMO',Item:itens[i].produto,Quantidade:1});
   if(i<6)await planilha('Matriz - Costura e Forração','Matriz',{ID:lote+'-MATRIZ-'+i,Data:dia(i),Pedido:pedidos[20+i].numero_pedido,Cliente:pedidos[20+i].cliente_nome,Local:pedidos[20+i].local_nome,'Valor de locação':2000+i*300,'Valor de Montagem':150,'Valor de Frete':250,'Sofá personalizado?':i%2?'Sim':'Não','É um cliente novo?':'Sim',Score:2+i,Comissão:'2%', 'Valor Comissão':40+i*10});
 }
 for(const t of ['fin_receber','operacao_etapas','producao_itens','producao_etapas','producao_materiais','comercial_historico']){
   const consulta=t==='fin_receber'||t==='operacao_etapas'||t==='producao_itens'||t==='comercial_historico'?`select x.id from ${ident(t)} x join separacoes_pedidos p on p.id=x.pedido_id where p.observacoes->>'demo_lote'=$1`:t==='producao_etapas'?`select e.id from producao_etapas e join producao_itens i on i.id=e.producao_item_id join separacoes_pedidos p on p.id=i.pedido_id where p.observacoes->>'demo_lote'=$1`:`select m.id from producao_materiais m join producao_etapas e on e.id=m.etapa_id join producao_itens i on i.id=e.producao_item_id join separacoes_pedidos p on p.id=i.pedido_id where p.observacoes->>'demo_lote'=$1`;
   const gerados=(await db.query(consulta,[lote])).rows;contagem['gerado:'+t]=gerados.length;for(const x of gerados)manifesto.push({tabela:t,chave:'id',valor:x.id});
 }
 const divergentes=(await db.query("select p.numero_pedido from separacoes_pedidos p left join fin_receber r on r.pedido_id=p.id and r.status<>'cancelado' where p.observacoes->>'demo_lote'=$1 and p.status_comercial='aprovado' group by p.id having abs(coalesce(sum(r.valor),0)-p.valor_total)>.01",[lote])).rows;
 if(divergentes.length)throw Error('Títulos não fecham com os pedidos DEMO: '+divergentes.map(p=>p.numero_pedido).join(','));
 const inconsistentes=(await db.query("select r.id from fin_receber r where r.pedido_id=any($1::uuid[]) and abs(r.recebido-coalesce((select sum(b.valor) from fin_baixas b where b.receber_id=r.id and b.estornado_em is null),0))>.01",[pedidos.map(p=>p.id)])).rows;
 if(inconsistentes.length)throw Error('Recebimentos DEMO sem baixas correspondentes.');
 const fluxos=(await db.query("select pedido_fluxo_etapa(p) etapa,count(*) quantidade from separacoes_pedidos p where p.observacoes->>'demo_lote'=$1 group by 1 order by 1",[lote])).rows;
 const resumo={lote,empresa,data_base:hoje,contagem,registros:manifesto,config_anterior:antes||null,participantes_demo:idsDemo,conta_demo:conta.id,fluxos};
 await db.query('insert into sistema_demo_lotes(id,empresa_id,manifesto) values($1,$2,$3)',[lote,empresa,JSON.stringify(resumo)]);
 if(aplicar){await db.query('commit');fs.mkdirSync(path.join(raiz,'outputs'),{recursive:true});fs.writeFileSync(path.join(raiz,'outputs/demo-sistema-manifesto.json'),JSON.stringify(resumo,null,2));}
 else await db.query('rollback');
 console.log(JSON.stringify({resultado:aplicar?'APLICADO':'SIMULAÇÃO REVERTIDA',lote,contagem,fluxos,total_manifesto:manifesto.length},null,2));
 }catch(e){await db.query('rollback');throw e;}
}
async function verificar(db){
 const r=(await db.query('select manifesto from sistema_demo_lotes where id=$1 and empresa_id=$2',[lote,empresa])).rows[0];
 if(!r)throw Error('Lote ainda não aplicado.');
 const m=r.manifesto,grupos=new Map();
 for(const reg of m.registros){if(typeof reg.chave!=='string')continue;const k=reg.tabela+'/'+reg.chave;if(!grupos.has(k))grupos.set(k,{tabela:reg.tabela,chave:reg.chave,ids:[]});grupos.get(k).ids.push(reg.valor);}
 const faltantes=[];
 for(const g of grupos.values()){
   const ids=[...new Set(g.ids)],n=Number((await db.query(`select count(*) n from ${ident(g.tabela)} where ${ident(g.chave)}::text=any($1::text[])`,[ids])).rows[0].n);
   if(n!==ids.length)faltantes.push({tabela:g.tabela,esperados:ids.length,encontrados:n});
 }
 const sql="select pedido_fluxo_etapa(p) etapa,count(*) quantidade from separacoes_pedidos p where p.empresa_id=$1 and p.observacoes->>'demo_lote'=$2 group by 1 order by 1";
 const fluxos=(await db.query(sql,[empresa,lote])).rows;
 const atividade=(await db.query('select f.nome,count(*) acoes from comercial_prod_eventos e join funcionarios_acesso f on f.id=e.autor_id where e.empresa_id=$1 and e.autor_id=any($2::uuid[]) group by f.nome order by f.nome',[empresa,m.participantes_demo])).rows;
 console.log(JSON.stringify({lote,verificacao:faltantes.length?'DIVERGÊNCIAS':'OK',grupos:grupos.size,registros_manifesto:m.registros.length,faltantes,fluxos,atividade},null,2));
 if(faltantes.length)throw Error('Há registros ausentes no lote.');
}
async function main(){const db=await conectar();try{if(process.argv.includes('--inventario'))await inventario(db);else if(process.argv.includes('--verificar'))await verificar(db);else await semear(db,process.argv.includes('--aplicar'));}finally{await db.end();}}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={conectar,empresa};
