/* Mapa e rota no próprio app. Usa a integração Maps já existente no sistema. */
(function(){
  let carregamento=null,versao=0,mapa=null,rota=null,watch=null,posicao=null;
  const $=id=>document.getElementById(id);
  function parar(){
    versao++;
    if(watch!==null && navigator.geolocation)navigator.geolocation.clearWatch(watch);
    watch=null;posicao=null;
    if(rota)rota.setMap(null);
    rota=null;mapa=null;
  }
  function carregar(){
    if(window.google && google.maps && google.maps.Map)return Promise.resolve();
    if(carregamento)return carregamento;
    carregamento=new Promise(function(resolve,reject){
      const script=document.createElement('script');
      const timer=setTimeout(()=>{carregamento=null;script.remove();reject(Error('O mapa demorou para carregar.'));},15000);
      window.MONT_mapsPronto=function(){clearTimeout(timer);resolve();};
      script.onerror=function(){clearTimeout(timer);carregamento=null;reject(Error('Não foi possível carregar o mapa.'));};
      script.src=window.MONT_MAPS_SDK;
      script.async=true;document.head.appendChild(script);
    });
    return carregamento;
  }
  function texto(html){const el=document.createElement('div');el.innerHTML=String(html||'');return el.textContent||'';}
  function abrir(e){
    parar();
    abrirFolha('<div class="mapa-app"><div class="mapa-app-cabecalho"><div><h3>Mapa do evento</h3><p>'+esc(e.local||e.cliente||'Destino do evento')+'</p></div><button class="icone-btn" type="button" onclick="fecharFolha()" aria-label="Fechar mapa">✕</button></div><div id="mapaEvento" class="mapa-evento" aria-label="Mapa do local do evento"></div><p id="mapaStatus" role="status">Carregando mapa…</p><div class="mapa-app-acoes"><button class="btn" id="mapaRota" type="button" disabled>Traçar rota da minha localização</button><button class="btn btn-claro" id="mapaPosicao" type="button" hidden>Minha posição</button></div><div id="mapaResumo"></div><div id="mapaPassos"></div></div>');
    const atual=++versao;
    const valido=()=>atual===versao && $('mapaEvento');
    const destinoMapa=destino(e);
    carregar().then(function(){
      if(!valido())return;
      const coordenadas=Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)) && String(e.lat||'')!=='' && String(e.lng||'')!=='' && !(Number(e.lat)===0 && Number(e.lng)===0);
      mapa=new google.maps.Map($('mapaEvento'),{center:coordenadas?{lat:Number(e.lat),lng:Number(e.lng)}:{lat:-23.55,lng:-46.63},zoom:16,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'greedy'});
      rota=new google.maps.DirectionsRenderer({map:mapa,polylineOptions:{strokeColor:'#366348',strokeWeight:6}});
      if(coordenadas)new google.maps.Marker({map:mapa,position:{lat:Number(e.lat),lng:Number(e.lng)},title:e.local||'Evento'});
      else new google.maps.Geocoder().geocode({address:destinoMapa,region:'br'},function(r,status){
        if(!valido())return;
        if(status==='OK'&&r[0]){mapa.setCenter(r[0].geometry.location);new google.maps.Marker({map:mapa,position:r[0].geometry.location,title:e.local||'Evento'});}
        else $('mapaStatus').textContent='O endereço não foi localizado. Confira o local cadastrado no cronograma.';
      });
      $('mapaStatus').textContent='Veja o local ou trace a rota sem sair do app.';
      $('mapaRota').disabled=false;
      let marcadorUsuario=null;
      function atualizarPosicao(p){
        if(!valido())return;
        posicao={lat:p.coords.latitude,lng:p.coords.longitude};
        if(!marcadorUsuario)marcadorUsuario=new google.maps.Marker({map:mapa,position:posicao,title:'Sua localização',icon:{path:google.maps.SymbolPath.CIRCLE,scale:8,fillColor:'#366348',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});
        else marcadorUsuario.setPosition(posicao);
        $('mapaPosicao').hidden=false;
      }
      $('mapaPosicao').onclick=function(){if(mapa&&posicao){mapa.panTo(posicao);mapa.setZoom(17);}};
      $('mapaRota').onclick=function(){
        if(!navigator.geolocation){$('mapaStatus').textContent='Este aparelho não disponibilizou localização. O mapa do evento continua disponível.';return;}
        const btn=$('mapaRota');btn.disabled=true;$('mapaStatus').textContent='Obtendo sua localização…';
        navigator.geolocation.getCurrentPosition(function(p){
          if(!valido())return;
          atualizarPosicao(p);$('mapaStatus').textContent='Calculando rota…';
          new google.maps.DirectionsService().route({origin:posicao,destination:destinoMapa,travelMode:'DRIVING',region:'br'},function(r,status){
            if(!valido())return;
            btn.disabled=false;
            if(status!=='OK'||!r.routes[0]||!r.routes[0].legs[0]){$('mapaStatus').textContent='Não foi possível calcular a rota. Confira o endereço ou tente novamente.';return;}
            rota.setDirections(r);
            const leg=r.routes[0].legs[0];
            $('mapaResumo').innerHTML='<div class="mapa-resumo"><strong>'+esc(leg.duration.text)+'</strong><span>'+esc(leg.distance.text)+' até o evento</span></div>';
            $('mapaPassos').innerHTML='<details class="mapa-instrucoes"><summary>Ver o caminho passo a passo</summary><ol>'+leg.steps.map(function(s){return '<li><strong>'+esc(texto(s.instructions))+'</strong><small>'+esc(s.distance.text)+'</small></li>';}).join('')+'</ol></details>';
            $('mapaStatus').textContent='Rota exibida no app. Sua posição será atualizada enquanto este mapa estiver aberto.';
            btn.textContent='Atualizar rota';
            if(watch===null)watch=navigator.geolocation.watchPosition(atualizarPosicao,function(){if(valido())$('mapaStatus').textContent='Sinal de GPS indisponível. A última rota permanece no mapa.';},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
          });
        },function(err){if(!valido())return;btn.disabled=false;$('mapaStatus').textContent=err.code===1?'Permita a localização para traçar a rota. Você pode continuar vendo o local no mapa.':'Não foi possível obter o GPS. Tente novamente em uma área aberta.';},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
      };
    }).catch(function(){
      if(!valido())return;
      $('mapaEvento').innerHTML='<iframe title="Local do evento" class="mapa-fallback" src="https://maps.google.com/maps?q='+encodeURIComponent(destinoMapa)+'&z=16&hl=pt-BR&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
      $('mapaStatus').textContent='Mapa em modo de consulta. Reabra para tentar carregar a rota.';
    });
  }
  window.MontadorMapa={abrir:abrir,parar:parar};
})();
