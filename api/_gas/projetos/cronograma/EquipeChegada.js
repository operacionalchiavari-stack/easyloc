/* Registro de chegada: horário recebido pelo servidor e GPS no envio da foto. */
function MONT_prepararChegada_(dados, linhas, agora) {
  const etapa = linhas.slice(1).filter(function(l){ return String(l[0]).trim() === String(dados.idCronograma).trim(); })[0];
  if(!etapa) throw new Error('Etapa não encontrada no cronograma.');
  if(!/^(montagem|desmontagem)$/.test(MONT_normalizar_(etapa[5]))) throw new Error('Esta etapa não é de montagem ou desmontagem.');
  const sessao = dados.token ? MONT_autenticar_(dados.token) : null;
  if(!sessao || (sessao.perfil !== MONT_PERFIL_SUPERVISOR && !MONT_ehResponsavel_(etapa[9], sessao.nome))) {
    throw new Error('Entre no app como responsável por esta etapa para enviar a equipe.');
  }
  if(!dados.foto) throw new Error('Tire uma foto da equipe completa antes de enviar.');
  function coordenada(v, limite) {
    if(v === '' || v === null || v === undefined) return null;
    const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= limite ? n : null;
  }
  const lat = coordenada(dados.latitude,90), lng = coordenada(dados.longitude,180);
  const precisao = Number(dados.precisaoGPS);
  if(lat === null || lng === null || !Number.isFinite(precisao) || precisao <= 0) throw new Error('Ative a localização e tente enviar novamente.');
  if(precisao > 100) throw new Error('O sinal de localização está impreciso. Vá para uma área aberta e tente novamente.');
  const latEvento = coordenada(etapa[13],90), lngEvento = coordenada(etapa[14],180);
  const distancia = latEvento === null || lngEvento === null || (latEvento === 0 && lngEvento === 0) ? null : calcularDistanciaMetros(latEvento,lngEvento,lat,lng);
  let data = etapa[6];
  if(data instanceof Date) data = Utilities.formatDate(data,Session.getScriptTimeZone(),'yyyy-MM-dd');
  data = String(data || '').trim();
  const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(br) data = br[3]+'-'+br[2]+'-'+br[1];
  let hora = etapa[7];
  if(hora instanceof Date) hora = Utilities.formatDate(hora,Session.getScriptTimeZone(),'HH:mm');
  const hm = String(hora || '').match(/^(\d{1,2}):(\d{2})/);
  const previsto = /^\d{4}-\d{2}-\d{2}$/.test(data) && hm && Number(hm[1])<24 && Number(hm[2])<60
    ? new Date(data+'T'+('0'+hm[1]).slice(-2)+':'+hm[2]+':00-03:00') : null;
  return {
    latitude:lat,longitude:lng,precisao:precisao,distancia:distancia === null ? '' : Math.round(distancia),
    previsto:previsto && Number.isFinite(previsto.getTime()) ? previsto.toISOString() : '',
    atraso:previsto && Number.isFinite(previsto.getTime()) ? Math.max(0,Math.ceil((agora.getTime()-previsto.getTime())/60000)) : '',
    localStatus:distancia === null ? 'SEM_COORDENADAS_EVENTO' : distancia <= 300 ? 'NO_LOCAL' : 'FORA_DO_LOCAL',
    autor:sessao.nome
  };
}
