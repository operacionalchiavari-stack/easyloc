(function(){
 'use strict';
 const dentro=(p,r)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
 function atravessa(a,b,r){
  if(a.x===b.x)return a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h;
  if(a.y===b.y)return a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w;
  throw Error('Conexão não ortogonal.');
 }
 const inflar=(r,m)=>({x:r.x-m,y:r.y-m,w:r.w+2*m,h:r.h+2*m});
 function simplificar(pontos){
  const r=[];for(const p of pontos){const fim=r.at(-1);if(fim&&fim.x===p.x&&fim.y===p.y)continue;
   if(r.length>1){const a=r.at(-2),b=r.at(-1);if(a.x===b.x&&b.x===p.x||a.y===b.y&&b.y===p.y)r.pop();}r.push(p);
  }return r;
 }
 class Fila{
  constructor(){this.a=[];}
  push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){const pai=(i-1)>>1;if(a[pai].f<=v.f)break;a[i]=a[pai];i=pai;}a[i]=v;}
  pop(){const a=this.a,primeiro=a[0],ultimo=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=ultimo.f)break;a[i]=a[j];i=j;}a[i]=ultimo;}return primeiro;}
 }
 function planejarFase(id,nos){
  const porId=new Map(nos.map(n=>[n.id,n])),locais=nos.filter(n=>n.fase===id).map(n=>({...n}));
  const pistas=[...new Set(locais.map(n=>n.setor))],portais=new Map(),maior=Math.max(...locais.map(n=>n.col));
  for(const n of locais)for(const s of n.saidas){const alvo=porId.get(s.destino);if(alvo.fase!==id&&!portais.has(alvo.id))portais.set(alvo.id,{...alvo,portal:true,col:maior+2,setor:n.setor});}
  // Correções ficam abaixo da pergunta, liberando a linha principal para o Sim.
  const desvios=new Map();
  for(const n of locais.filter(n=>n.tipo==='decisao')){
    const destino=n.saidas.find(s=>s.rotulo==='Não')?.destino,alvo=locais.find(a=>a.id===destino);
    if(alvo?.tipo==='passo' && /^(Corrigir|Resolver|Completar|Ajustar|Reconhecer|Programar|Registrar divergência|Conferir saldo)/i.test(alvo.titulo))desvios.set(alvo.id,{col:n.col,linha:pistas.indexOf(n.setor)*2+1});
  }
  const todos=[...locais,...portais.values()],ocupados=new Set();
  for(const n of todos){const desvio=desvios.get(n.id),linha=desvio?.linha??pistas.indexOf(n.setor)*2;let col=desvio?.col??n.col;while(ocupados.has(linha+':'+col))col++;ocupados.add(linha+':'+col);n._fx={x:100+col*360,y:100+linha*180,w:200,h:100};}
  // Encurta os intervalos vazios mantendo corredores para as conexões.
  const colunas=[...new Set(todos.map(n=>n._fx.x))].sort((a,b)=>a-b);
  const posicoes=new Map();let reduzido=0;
  for(let i=0;i<colunas.length;i++){
   if(i)reduzido+=Math.max(0,colunas[i]-colunas[i-1]-360)/2;
   posicoes.set(colunas[i],colunas[i]-reduzido);
  }
  for(const n of todos)n._fx.x=posicoes.get(n._fx.x);
  const largura=Math.max(...todos.map(n=>n._fx.x+n._fx.w))+100,altura=pistas.length*360+100;
  const roteiros=[];
  for(const n of locais)for(const s of n.saidas){
   const a=n._fx,b=todos.find(t=>t.id===s.destino)._fx,nao=n.tipo==='decisao'&&s.rotulo==='Não';
   const retorno=n.tipo!=='decisao'&&(b.x<a.x||b.x===a.x&&b.y<a.y);
   const inicio=nao?{x:a.x+100,y:a.y+100}:{x:a.x+(retorno?0:200),y:a.y+50};
   const partida=nao?{x:inicio.x,y:inicio.y+48}:{x:inicio.x+(retorno?-48:48),y:inicio.y};
   const vertical=b.x===a.x&&b.y>a.y;
   const chegada=vertical?{x:b.x+100,y:b.y-48}:{x:b.x-48,y:b.y+50},fim=vertical?{x:b.x+100,y:b.y}:{x:b.x,y:b.y+50};
   const label=s.rotulo==='Segue'?null:nao?{x:inicio.x+12,y:inicio.y+30}:{x:inicio.x+12,y:inicio.y-12};
   roteiros.push({origem:n.id,destino:s.destino,rotulo:s.rotulo,inicio,partida,chegada,fim,label});
  }
  const portas=new Map(todos.map(n=>[n.id,roteiros.filter(r=>r.origem===n.id).map(r=>r.inicio)]));
  const rotulosReservados=roteiros.filter(r=>r.label).map(r=>inflar({x:r.label.x-5,y:r.label.y-17,w:42,h:24},3));
  for(const alvo of todos){
   const entradas=roteiros.filter(r=>r.destino===alvo.id),b=alvo._fx;
   const grupos=new Map();
   for(const r of entradas){
    const a=todos.find(n=>n.id===r.origem)._fx;
    let lado=a.x<b.x?'esquerda':a.x>b.x?'direita':a.y<b.y?'cima':'baixo';
    if((grupos.get(lado)?.length||0)>=3)lado=['cima','baixo','esquerda','direita'].find(l=>(grupos.get(l)?.length||0)<3)||lado;
    if(!grupos.has(lado))grupos.set(lado,[]);grupos.get(lado).push(r);
   }
   for(const [lado,grupo] of grupos){
    grupo.sort((r,s)=>todos.find(n=>n.id===r.origem)._fx.y-todos.find(n=>n.id===s.origem)._fx.y);
    for(let i=0;i<grupo.length;i++){
     const r=grupo[i],diamante=alvo.tipo==='decisao'&&!alvo.portal;let escolha;
     for(const face of [lado,...['esquerda','direita','cima','baixo'].filter(x=>x!==lado)]){
      const limite=face==='cima'||face==='baixo'?200:100;
      for(const valor of [limite*(i+1)/(grupo.length+1),...Array.from({length:9},(_,j)=>limite*(j+1)/10)]){
       const t=Math.round(valor);
       const p=face==='esquerda'?{x:b.x+(diamante?Math.abs(t-50)*2:0),y:b.y+t}:face==='direita'?{x:b.x+b.w-(diamante?Math.abs(t-50)*2:0),y:b.y+t}:face==='cima'?{x:b.x+t,y:b.y+(diamante?Math.abs(t-100)/2:0)}:{x:b.x+t,y:b.y+b.h-(diamante?Math.abs(t-100)/2:0)};
       if(portas.get(alvo.id).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<16))continue;
       const chegada={...p};if(face==='esquerda')chegada.x=b.x-48;if(face==='direita')chegada.x=b.x+b.w+48;if(face==='cima')chegada.y=b.y-48;if(face==='baixo')chegada.y=b.y+b.h+48;
       if(rotulosReservados.some(o=>dentro(chegada,o)||atravessa(p,chegada,o)))continue;
       if(todos.some(n=>n!==alvo&&(dentro(chegada,inflar(n._fx,22))||atravessa(p,chegada,n._fx))))continue;
       escolha={p,chegada};break;
      }if(escolha)break;
     }
     if(!escolha)throw Error('Card sem porta livre: '+alvo.id);
     r.fim=escolha.p;r.chegada=escolha.chegada;portas.get(alvo.id).push(r.fim);
    }
   }
  }
  const obstaculos=[...todos.map(n=>inflar(n._fx,22)),...roteiros.filter(r=>r.label).map(r=>({x:r.label.x-5,y:r.label.y-17,w:42,h:24}))];
  const xs=new Set([20,largura-20]),ys=new Set([20,altura-20]);
  for(const n of todos){const r=n._fx;for(const m of [24,48,72]){xs.add(r.x-m);xs.add(r.x+r.w+m);ys.add(r.y-m);ys.add(r.y+r.h+m);}}
  for(const r of roteiros){for(const p of [r.partida,r.chegada]){xs.add(p.x);ys.add(p.y);}if(r.label){xs.add(r.label.x-12);xs.add(r.label.x+48);ys.add(r.label.y-24);ys.add(r.label.y+14);}}
  const X=[...xs].filter(x=>x>=12&&x<=largura-12).sort((a,b)=>a-b),Y=[...ys].filter(y=>y>=12&&y<=altura-12).sort((a,b)=>a-b),nx=X.length;
  const indice=p=>Y.indexOf(p.y)*nx+X.indexOf(p.x),ponto=i=>({x:X[i%nx],y:Y[Math.floor(i/nx)]});
  const bloqueados=new Map(),segmentos=new Map(),usados=roteiros.flatMap(r=>[[r.inicio,r.partida,r],[r.chegada,r.fim,r]]);
  const bloqueado=i=>{if(!bloqueados.has(i))bloqueados.set(i,obstaculos.some(r=>dentro(ponto(i),r)));return bloqueados.get(i);};
  const livre=(a,b)=>{const chave=Math.min(a,b)+':'+Math.max(a,b);if(!segmentos.has(chave))segmentos.set(chave,!obstaculos.some(r=>atravessa(ponto(a),ponto(b),r)));return segmentos.get(chave);};
  // Nov/2026: as linhas já traçadas ficam separadas em verticais e horizontais (sem as da própria rota) e o custo de cada
  // trecho é guardado durante a busca — antes cada passo comparava com todas as linhas, e a tela travava ~30 s.
  // segV: verticais ordenadas por x; segH: horizontais ordenadas por y (busca binária para olhar só as próximas).
  let segV=[],segH=[],memo=new Map();
  const primeiro=(arr,k,v)=>{let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;if(arr[m][k]<v)lo=m+1;else hi=m;}return lo;};
  function prepararCusto(rota){segV=[];segH=[];memo=new Map();
   for(const s of usados){if(s[2]===rota)continue;const [p,q]=s;
    if(p.x===q.x)segV.push({x:p.x,y0:Math.min(p.y,q.y),y1:Math.max(p.y,q.y)});else segH.push({y:p.y,x0:Math.min(p.x,q.x),x1:Math.max(p.x,q.x)});}
   segV.sort((m,n)=>m.x-n.x);segH.sort((m,n)=>m.y-n.y);}
  function custoExtraRapido(a,b,va,vb){
   const chave=va<vb?va*1e6+vb:vb*1e6+va;let c=memo.get(chave);if(c!==undefined)return c;c=0;
   if(a.x===b.x){
    const y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
    for(let k=primeiro(segV,'x',a.x-11.999);k<segV.length&&segV[k].x<a.x+12;k++){const t=segV[k];if(Math.min(y1,t.y1)>Math.max(y0,t.y0)){c=Infinity;break;}}
    if(c!==Infinity)for(let k=primeiro(segH,'y',y0);k<segH.length&&segH[k].y<y1;k++){const t=segH[k];if(t.y>y0&&a.x>t.x0&&a.x<t.x1)c+=100;}
   }else{
    const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x);
    for(let k=primeiro(segH,'y',a.y-11.999);k<segH.length&&segH[k].y<a.y+12;k++){const t=segH[k];if(Math.min(x1,t.x1)>Math.max(x0,t.x0)){c=Infinity;break;}}
    if(c!==Infinity)for(let k=primeiro(segV,'x',x0);k<segV.length&&segV[k].x<x1;k++){const t=segV[k];if(t.x>x0&&a.y>t.y0&&a.y<t.y1)c+=100;}
   }
   memo.set(chave,c);return c;
  }
  function custoExtra(a,b,rota){let custo=0;for(const [c,d,dono] of usados){
   if(dono===rota)continue;
   if(a.x===b.x&&c.x===d.x&&Math.abs(a.x-c.x)<12){if(Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))>Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)))return Infinity;}
   else if(a.y===b.y&&c.y===d.y&&Math.abs(a.y-c.y)<12){if(Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))>Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)))return Infinity;}
   else if(a.x===b.x&&c.y===d.y&&a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y))custo+=100;
   else if(a.y===b.y&&c.x===d.x&&c.x>Math.min(a.x,b.x)&&c.x<Math.max(a.x,b.x)&&a.y>Math.min(c.y,d.y)&&a.y<Math.max(c.y,d.y))custo+=100;
  }return custo;}
  for(const r of roteiros){
   const ini=indice(r.partida),fim=indice(r.chegada),fila=new Fila(),dist=new Map(),pais=new Map(),inicial=ini*3+2;
   prepararCusto(r);dist.set(inicial,0);fila.push({id:inicial,g:0,f:0});let encontrado=null;
   while(fila.a.length){
    const atual=fila.pop();if(atual.g!==dist.get(atual.id))continue;const vertice=Math.floor(atual.id/3),direcao=atual.id%3;
    if(vertice===fim){encontrado=atual.id;break;}
    const x=vertice%nx,y=Math.floor(vertice/nx),vizinhos=[];
    if(x>0)vizinhos.push([vertice-1,0]);if(x+1<nx)vizinhos.push([vertice+1,0]);if(y>0)vizinhos.push([vertice-nx,1]);if(y+1<Y.length)vizinhos.push([vertice+nx,1]);
    for(const [v,dir] of vizinhos){if(bloqueado(v)||!livre(vertice,v))continue;const a=ponto(vertice),b=ponto(v),id=v*3+dir;
     const g=atual.g+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(direcao!==2&&direcao!==dir?36:0)+custoExtraRapido(a,b,vertice,v);
     if(g>=(dist.get(id)??Infinity))continue;dist.set(id,g);pais.set(id,atual.id);fila.push({id,g,f:g+Math.abs(b.x-r.chegada.x)+Math.abs(b.y-r.chegada.y)});
    }
   }
   if(encontrado===null)throw Error('Não foi possível traçar uma conexão livre: '+r.origem+' → '+r.destino);
   const pontos=[];for(let k=encontrado;k!==undefined;k=pais.get(k))pontos.push(ponto(Math.floor(k/3)));pontos.reverse();
   r.pontos=simplificar([r.inicio,...pontos,r.fim]);
   for(let i=1;i<r.pontos.length;i++)usados.push([r.pontos[i-1],r.pontos[i],r]);
   r.d=r.pontos.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
  }
  // Pontes geom?tricas: ambas as linhas permanecem cont?nuas, sem m?scara branca.
  for(const r of roteiros){
   r.pontes=[];let d='M'+r.pontos[0].x+','+r.pontos[0].y;
   for(let i=1;i<r.pontos.length;i++){
    const a=r.pontos[i-1],b=r.pontos[i];
    if(a.y===b.y){
     const cruzamentos=new Set();
     for(const outra of roteiros){if(outra===r)continue;
      for(let j=1;j<outra.pontos.length;j++){
       const c=outra.pontos[j-1],e=outra.pontos[j];
       if(c.x===e.x&&c.x>Math.min(a.x,b.x)&&c.x<Math.max(a.x,b.x)&&a.y>=Math.min(c.y,e.y)&&a.y<=Math.max(c.y,e.y))cruzamentos.add(c.x);
      }
     }
     const sentido=Math.sign(b.x-a.x),xs=[...cruzamentos].sort((x,y)=>(x-y)*sentido);
     for(let k=0;k<xs.length;k++){
      const x=xs[k],raio=Math.min(6,Math.abs(x-(xs[k-1]??a.x))/3,Math.abs((xs[k+1]??b.x)-x)/3);
      d+=' L'+(x-sentido*raio)+','+a.y+' Q'+(x-sentido*raio)+','+(a.y-2*raio)+' '+x+','+(a.y-2*raio)+' Q'+(x+sentido*raio)+','+(a.y-2*raio)+' '+(x+sentido*raio)+','+a.y;
      r.pontes.push({x,y:a.y,raio});
     }
    }
    d+=' L'+b.x+','+b.y;
   }r.d=d;
  }
  return {nos:todos,rotas:roteiros,largura,altura};
 }
 function planejarCompleto(nos){
  const fases=[...new Set(nos.map(n=>n.fase))],colunas=new Map();let coluna=0;
  for(const fase of fases){colunas.set(fase,coluna);coluna+=Math.max(...nos.filter(n=>n.fase===fase).map(n=>n.col))+2;}
  return planejarFase('unificado',nos.map(n=>({...n,col:n.col+colunas.get(n.fase),fase:'unificado'})));
 }
 const api={planejarFase,planejarCompleto,atravessa};
 if(typeof module!=='undefined')module.exports=api;else window.AcervoFluxoRotas=api;
})();
