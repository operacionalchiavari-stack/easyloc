package br.com.chiavari.acervo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.*;
import android.net.wifi.WifiManager;
import android.os.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.*;

/**
 * Câmera ao vivo nativa (nov/2026). Serviço em primeiro plano do tipo "camera": captura (Camera2), codifica (hardware quando
 * houver) e transmite por WebRTC direto para cada pessoa que assiste em Logística › Câmeras ao vivo — independente do WebView,
 * das telas do app e da tela do celular (apagada ou bloqueada). Só começa com o app visível e depois que o funcionário
 * confirma (MainActivity). A sinalização usa as funções camera_disp_* do banco com o token do aparelho (SecureStore "camera").
 * Economia: 480p/15 fps por padrão (Parâmetros da empresa), sem áudio, qualidade reduzida sozinha com calor, bateria baixa
 * e mais gente assistindo. Reconexão com intervalo progressivo; câmera caída vira "câmera indisponível" (nunca imagem parada).
 */
public final class CameraStreamService extends Service {
 static final String START="br.com.chiavari.acervo.CAMERA_LIGAR",STOP="br.com.chiavari.acervo.CAMERA_ENCERRAR",
  PAUSE="br.com.chiavari.acervo.CAMERA_PAUSAR",RESUME="br.com.chiavari.acervo.CAMERA_RETOMAR";
 private static final String CHANNEL="camera_ao_vivo";
 private static final int NOTIF=9;

 // estado lido pela MainActivity (mesmo processo)
 static volatile CameraStreamService instancia;
 static volatile boolean running;
 static volatile long inicio;
 static volatile String estado="conectando",titulo="",detalhe="";
 static volatile int assistindo;
 interface Ouvinte{void mudou();}
 static volatile Ouvinte ouvinte;

 private final ScheduledExecutorService exec=Executors.newSingleThreadScheduledExecutor();
 private final Map<String,PeerConnection> pcs=new ConcurrentHashMap<>();
 private final Map<String,List<IceCandidate>> filas=new ConcurrentHashMap<>();
 private final Map<String,ScheduledFuture<?>> quedas=new ConcurrentHashMap<>();
 private String token;
 private JSONObject config=new JSONObject();
 private boolean som;
 private volatile boolean encerrando,pausada,cameraFalhou,semRede,pedidoFalhando;
 private long ultimoSinal;
 private int falhasSinal,falhasCamera;
 private ScheduledFuture<?> pollFuture,pingFuture,reabrirCamera;

 // WebRTC
 static volatile EglBase egl;
 static volatile VideoTrack videoTrack;
 private PeerConnectionFactory factory;
 private CameraVideoCapturer capturer;
 private SurfaceTextureHelper helper;
 private VideoSource videoSource;
 private AudioSource audioSource;
 private AudioTrack audioTrack;
 private int capW=640,capH=480,capFps=15;
 private boolean compatibilidade;
 private volatile String codecUsado="",encoderUsado="";
 private volatile int luz=-1;
 private volatile long amostrarEm;
 private volatile int frames,fpsMedido,largura,altura;
 private volatile long ultimoQuadro;
 private final VideoSink contador=f->{
  frames++;largura=f.getRotatedWidth();altura=f.getRotatedHeight();long agora=SystemClock.elapsedRealtime();ultimoQuadro=agora;
  if(agora>=amostrarEm){amostrarEm=agora+15000;luz=brilho(f);} // diagnóstico: imagem escura na origem (lente tapada, câmera com defeito)
 };
 private static int brilho(VideoFrame f){
  VideoFrame.I420Buffer b=null;
  try{
   b=f.getBuffer().toI420();if(b==null)return -1;
   java.nio.ByteBuffer y=b.getDataY();int w=b.getWidth(),h=b.getHeight(),s=b.getStrideY();long soma=0;int n=0;
   for(int r=0;r<h;r+=16)for(int c=0;c<w;c+=16){soma+=y.get(r*s+c)&0xff;n++;}
   return n==0?-1:(int)(soma/n);
  }catch(Exception e){return -1;}finally{if(b!=null)b.release();}
 }

 // energia e rede
 private PowerManager.WakeLock wake;
 private WifiManager.WifiLock wifiLock;
 private ConnectivityManager.NetworkCallback redeCb;
 private PowerManager.OnThermalStatusChangedListener termicoCb;
 private volatile int termico;
 private volatile double rttMs=-1;

 @Override public void onCreate(){
  super.onCreate();instancia=this;
  getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Câmera ao vivo",NotificationManager.IMPORTANCE_LOW));
 }

 // ------------------------------------------------------------ ciclo de vida
 @Override public int onStartCommand(Intent intent,int flags,int id){
  String acao=intent==null?null:intent.getAction();
  if(STOP.equals(acao)){exec.execute(()->encerrar("funcionario",true));return START_NOT_STICKY;}
  if(PAUSE.equals(acao)){exec.execute(()->pausar(true));return START_NOT_STICKY;}
  if(RESUME.equals(acao)){exec.execute(()->pausar(false));return START_NOT_STICKY;}
  if(running)return START_NOT_STICKY; // nunca cria uma segunda transmissão
  try{
   token=SecureStore.read(this,"camera");
   if(token==null||checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY;}
   config=new JSONObject(intent==null||intent.getStringExtra("config")==null?"{}":intent.getStringExtra("config"));
   titulo=intent==null||intent.getStringExtra("titulo")==null?"Câmera ao vivo":intent.getStringExtra("titulo");
   som=intent!=null&&intent.getBooleanExtra("som",false)&&config.optBoolean("som_permitido",true)&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
   if(Build.VERSION.SDK_INT>=30)startForeground(NOTIF,notificacao(),ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA|(som?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:0));
   else startForeground(NOTIF,notificacao());
   running=true;inicio=System.currentTimeMillis();estado="conectando";detalhe="";assistindo=0;
   getSharedPreferences("camera",0).edit().putBoolean("ativo",true).putLong("inicio",inicio).putString("titulo",titulo).commit();
   avisar();
   exec.execute(this::iniciar);
   return START_NOT_STICKY; // o Android não deixa religar a câmera em segundo plano: o app avisa para retomar
  }catch(Exception e){stopSelf();return START_NOT_STICKY;}
 }

 private void iniciar(){
  try{
   manterAcordado(true);
   ouvirRede();ouvirCalor();
   if(egl==null)egl=EglBase.create();
   PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(getApplicationContext()).createInitializationOptions());
   // Galaxy A57 (Exynos): VP8 por hardware mandava imagem preta. Automático = hardware com H.264 na frente (preferirCodec);
   // compatibilidade (Parâmetros › Qualidade) = VP8 pelo processador, funciona em qualquer aparelho.
   // Exynos (Samsung): o codificador do chip manda imagem preta tanto em VP8 quanto em H.264 (Galaxy A57, 25/11/2026);
   // nesses aparelhos o modo automático já usa o processador.
   compatibilidade="compatibilidade".equals(config.optString("codificador","automatico"))||codificadorExynos();
   VideoEncoderFactory codificador=compatibilidade?new SoftwareVideoEncoderFactory():new DefaultVideoEncoderFactory(egl.getEglBaseContext(),false,false);
   PeerConnectionFactory.Builder b=PeerConnectionFactory.builder()
    .setVideoEncoderFactory(codificador)
    .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()));
   if(som)b.setAudioDeviceModule(org.webrtc.audio.JavaAudioDeviceModule.builder(getApplicationContext()).createAudioDeviceModule());
   factory=b.createPeerConnectionFactory();
   String res=config.optString("resolucao","480p");
   if("720p".equals(res)){capW=1280;capH=720;}else if("360p".equals(res)){capW=480;capH=360;}else{capW=640;capH=480;}
   capFps=Math.max(5,Math.min(30,config.optInt("fps",15)));
   videoSource=factory.createVideoSource(false);
   helper=SurfaceTextureHelper.create("camera-ao-vivo",egl.getEglBaseContext());
   abrirCamera();
   videoTrack=factory.createVideoTrack("v0",videoSource);videoTrack.addSink(contador);
   if(som){audioSource=factory.createAudioSource(new MediaConstraints());audioTrack=factory.createAudioTrack("a0",audioSource);}
   aplicarQualidade();
   ultimoSinal=0;
   pollFuture=exec.schedule(this::buscarSinais,200,TimeUnit.MILLISECONDS);
   pingFuture=exec.scheduleWithFixedDelay(this::ping,1,15,TimeUnit.SECONDS);
  }catch(Exception e){detalhe="Não foi possível iniciar a câmera.";encerrar("erro",true);}
 }

 private void abrirCamera(){
  try{
   if(capturer!=null){try{capturer.stopCapture();}catch(Exception ignored){}capturer.dispose();capturer=null;}
   // Galaxy A57 (Android 17): a cópia da textura da câmera para a memória vinha preta (preview funcionava, a transmissão não).
   // Camera1 com captureToTexture=false entrega os quadros já em memória (NV21), sem essa cópia.
   Camera1Enumerator en=new Camera1Enumerator(false);
   String escolhida=null;for(String n:en.getDeviceNames())if(en.isBackFacing(n)){escolhida=n;break;}
   if(escolhida==null&&en.getDeviceNames().length>0)escolhida=en.getDeviceNames()[0];
   if(escolhida==null){cameraIndisponivel("Este celular não tem câmera disponível.");return;}
   capturer=en.createCapturer(escolhida,new CameraVideoCapturer.CameraEventsHandler(){
    @Override public void onCameraError(String e){exec.execute(()->cameraIndisponivel("Erro na câmera"));}
    @Override public void onCameraDisconnected(){exec.execute(()->cameraIndisponivel("Outro app usou a câmera"));}
    @Override public void onCameraFreezed(String e){exec.execute(()->cameraIndisponivel("A câmera travou"));}
    @Override public void onCameraOpening(String n){}
    @Override public void onFirstFrameAvailable(){exec.execute(()->{cameraFalhou=false;falhasCamera=0;atualizarEstado();});}
    @Override public void onCameraClosed(){}
   });
   capturer.initialize(helper,getApplicationContext(),videoSource.getCapturerObserver());
   if(!pausada)capturer.startCapture(capW,capH,capFps);
  }catch(Exception e){cameraIndisponivel("Não foi possível abrir a câmera.");}
 }

 // Câmera caída: a imagem vira preta (nunca congelada) e tenta reabrir com intervalo progressivo
 private void cameraIndisponivel(String motivo){
  if(encerrando||pausada)return;
  cameraFalhou=true;detalhe=motivo;if(videoTrack!=null)videoTrack.setEnabled(false);
  atualizarEstado();ping();
  if(reabrirCamera!=null)reabrirCamera.cancel(false);
  long espera=Math.min(60,2L<<Math.min(falhasCamera++,5));
  reabrirCamera=exec.schedule(()->{if(encerrando||pausada)return;abrirCamera();if(videoTrack!=null)videoTrack.setEnabled(true);},espera,TimeUnit.SECONDS);
 }

 /** Pausa controlada para outra parte do app usar a câmera (foto pelo app de câmera do Android). */
 private void pausar(boolean sim){
  if(!running||encerrando||pausada==sim)return;
  pausada=sim;
  try{
   if(sim){if(capturer!=null)capturer.stopCapture();if(videoTrack!=null)videoTrack.setEnabled(false);detalhe="Pausada para tirar foto";}
   else{detalhe="";if(capturer!=null)capturer.startCapture(capW,capH,capFps);else abrirCamera();if(videoTrack!=null)videoTrack.setEnabled(true);}
  }catch(Exception e){if(!sim)cameraIndisponivel("Não foi possível retomar a câmera.");}
  atualizarEstado();ping();
 }

 // ------------------------------------------------------------ qualidade (calor, bateria, quantas pessoas assistem)
 private void aplicarQualidade(){
  if(videoSource==null)return;
  int w=capW,h=capH,fps=capFps,teto=Math.max(150,config.optInt("bitrate_max",900))*1000;
  int bat=bateria();boolean carregando=carregando();
  if(Build.VERSION.SDK_INT>=29&&termico>=PowerManager.THERMAL_STATUS_SEVERE){w=Math.min(w,320);h=Math.min(h,240);fps=Math.min(fps,8);teto=Math.min(teto,250000);detalhe="Qualidade reduzida: celular quente";}
  else if(Build.VERSION.SDK_INT>=29&&termico>=PowerManager.THERMAL_STATUS_MODERATE){w=Math.min(w,480);h=Math.min(h,360);fps=Math.min(fps,12);teto=Math.min(teto,500000);}
  if(!carregando&&bat>=0&&bat<15){fps=Math.min(fps,10);teto=Math.min(teto,400000);}
  videoSource.adaptOutputFormat(w,h,fps);
  int n=Math.max(1,pcs.size());
  int porPessoa=Math.min(teto,n==1?teto:n==2?teto*7/10:n<=4?teto/2:teto/3);
  for(PeerConnection pc:pcs.values())for(RtpSender s:pc.getSenders()){
   if(s.track()==null||!"video".equals(s.track().kind()))continue;
   RtpParameters p=s.getParameters();if(p.encodings.isEmpty())continue;
   p.encodings.get(0).maxBitrateBps=porPessoa;p.encodings.get(0).maxFramerate=fps;
   s.setParameters(p);
  }
 }

 // ------------------------------------------------------------ sinalização (banco)
 private void buscarSinais(){
  if(encerrando)return;
  long proxima=1500;
  try{
   CameraApi.Resposta r=CameraApi.call("camera_disp_sinais",new JSONObject().put("p_token",token).put("p_depois",ultimoSinal));
   if(CameraApi.autorizacaoEncerrada(r)){encerrar("central",false);return;}
   if(!r.ok())throw new Exception("HTTP "+r.code);
   JSONArray l=new JSONArray(r.body);
   for(int i=0;i<l.length();i++){JSONObject s=l.getJSONObject(i);ultimoSinal=Math.max(ultimoSinal,s.getLong("id"));receber(s);}
   if(falhasSinal>0||pedidoFalhando){falhasSinal=0;pedidoFalhando=false;atualizarEstado();}
  }catch(Exception e){
   falhasSinal++;pedidoFalhando=true;
   proxima=Math.min(30000,1500L<<Math.min(falhasSinal,5)); // 3 s, 6 s, 12 s… até 30 s
   atualizarEstado();
  }
  if(!encerrando)pollFuture=exec.schedule(this::buscarSinais,proxima,TimeUnit.MILLISECONDS);
 }
 private void enviar(String para,String tipo,JSONObject dados){
  exec.execute(()->{try{CameraApi.call("camera_disp_sinal",new JSONObject().put("p_token",token).put("p_para",para).put("p_tipo",tipo).put("p_dados",dados==null?JSONObject.NULL:dados));}catch(Exception ignored){}});
 }
 private void receber(JSONObject s) throws Exception {
  String quem=s.getString("de"),tipo=s.getString("tipo");JSONObject d=s.optJSONObject("dados");
  if("pedido".equals(tipo))conectar(quem);
  else if("resposta".equals(tipo)&&d!=null){
   PeerConnection pc=pcs.get(quem);if(pc==null)return;
   pc.setRemoteDescription(new Sdp(){@Override public void onSetSuccess(){exec.execute(()->soltarFila(quem));}},new SessionDescription(SessionDescription.Type.ANSWER,d.getString("sdp")));
  }else if("ice".equals(tipo)&&d!=null){
   IceCandidate c=new IceCandidate(d.optString("sdpMid","0"),d.optInt("sdpMLineIndex",0),d.getString("candidate"));
   PeerConnection pc=pcs.get(quem);if(pc==null)return;
   if(pc.getRemoteDescription()!=null)pc.addIceCandidate(c);else filas.computeIfAbsent(quem,k->new ArrayList<>()).add(c);
  }else if("sair".equals(tipo))fechar(quem);
 }
 private void soltarFila(String quem){PeerConnection pc=pcs.get(quem);List<IceCandidate> f=filas.remove(quem);if(pc!=null&&f!=null)for(IceCandidate c:f)pc.addIceCandidate(c);}

 private void conectar(String quem){
  fechar(quem);
  List<PeerConnection.IceServer> ice=new ArrayList<>();
  for(String u:new String[]{"stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302","stun:stun.cloudflare.com:3478"})ice.add(PeerConnection.IceServer.builder(u).createIceServer());
  PeerConnection.RTCConfiguration cfg=new PeerConnection.RTCConfiguration(ice);
  cfg.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;cfg.continualGatheringPolicy=PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY;
  PeerConnection pc=factory.createPeerConnection(cfg,new Observador(){
   @Override public void onIceCandidate(IceCandidate c){
    try{enviar(quem,"ice",new JSONObject().put("candidate",c.sdp).put("sdpMid",c.sdpMid).put("sdpMLineIndex",c.sdpMLineIndex));}catch(Exception ignored){}
   }
   @Override public void onConnectionChange(PeerConnection.PeerConnectionState st){exec.execute(()->mudouConexao(quem,st));}
  });
  if(pc==null)return;
  pcs.put(quem,pc);
  pc.addTrack(videoTrack,Collections.singletonList("s0"));
  if(audioTrack!=null)pc.addTrack(audioTrack,Collections.singletonList("s0"));
  pc.createOffer(new Sdp(){
   @Override public void onCreateSuccess(SessionDescription original){
    SessionDescription sdp=new SessionDescription(original.type,preferirCodec(original.description,compatibilidade?"VP8":"H264"));
    pc.setLocalDescription(new Sdp(){
     @Override public void onSetSuccess(){try{enviar(quem,"oferta",new JSONObject().put("type","offer").put("sdp",sdp.description));}catch(Exception ignored){}}
     @Override public void onSetFailure(String e){
      // se o aparelho recusar a oferta reordenada, manda a original
      pc.setLocalDescription(new Sdp(){@Override public void onSetSuccess(){try{enviar(quem,"oferta",new JSONObject().put("type","offer").put("sdp",original.description));}catch(Exception ignored){}}},original);
     }
    },sdp);
   }
  },new MediaConstraints());
  aplicarQualidade();
 }
 static boolean codificadorExynos(){
  try{
   for(android.media.MediaCodecInfo i:new android.media.MediaCodecList(android.media.MediaCodecList.REGULAR_CODECS).getCodecInfos()){
    if(!i.isEncoder())continue;
    for(String tipo:i.getSupportedTypes())
     if(("video/avc".equalsIgnoreCase(tipo)||"video/x-vnd.on2.vp8".equalsIgnoreCase(tipo))&&i.getName().toLowerCase(Locale.ROOT).contains("exynos"))return true;
   }
  }catch(Exception ignored){}
  return false;
 }
 /** Põe os formatos do codec escolhido (e os rtx deles) no começo da linha m=video: quem assiste usa o primeiro que entende. */
 static String preferirCodec(String sdp,String codec){
  try{
   String[] l=sdp.split("\r\n");List<String> pts=new ArrayList<>();
   for(String x:l)if(x.startsWith("a=rtpmap:")&&x.toUpperCase(Locale.ROOT).contains(" "+codec+"/90000"))pts.add(x.substring(9,x.indexOf(' ')));
   if(pts.isEmpty())return sdp;
   List<String> rtx=new ArrayList<>();
   for(String x:l)if(x.startsWith("a=fmtp:")&&x.contains("apt=")){String pt=x.substring(7,x.indexOf(' '));String apt=x.substring(x.indexOf("apt=")+4).split(";")[0].trim();if(pts.contains(apt))rtx.add(pt);}
   StringBuilder out=new StringBuilder();
   for(int i=0;i<l.length;i++){
    String x=l[i];
    if(x.startsWith("m=video ")){
     String[] p=x.split(" ");List<String> cab=new ArrayList<>(Arrays.asList(p).subList(0,3));List<String> resto=new ArrayList<>(Arrays.asList(p).subList(3,p.length));
     List<String> nova=new ArrayList<>();for(String pt:pts)if(resto.remove(pt))nova.add(pt);for(String pt:rtx)if(resto.remove(pt))nova.add(pt);nova.addAll(resto);
     cab.addAll(nova);x=String.join(" ",cab);
    }
    out.append(x);if(i<l.length-1||sdp.endsWith("\r\n"))out.append("\r\n");
   }
   return out.toString();
  }catch(Exception e){return sdp;}
 }
 private void mudouConexao(String quem,PeerConnection.PeerConnectionState st){
  ScheduledFuture<?> q=quedas.remove(quem);if(q!=null)q.cancel(false);
  if(st==PeerConnection.PeerConnectionState.FAILED||st==PeerConnection.PeerConnectionState.CLOSED)fechar(quem);
  else if(st==PeerConnection.PeerConnectionState.DISCONNECTED)quedas.put(quem,exec.schedule(()->fechar(quem),10,TimeUnit.SECONDS));
  contar();
 }
 private void fechar(String quem){
  PeerConnection pc=pcs.remove(quem);filas.remove(quem);
  if(pc!=null){try{pc.dispose();}catch(Exception ignored){}}
  contar();aplicarQualidade();
 }
 private void contar(){
  int n=0;for(PeerConnection pc:pcs.values())if(pc.connectionState()==PeerConnection.PeerConnectionState.CONNECTED)n++;
  if(n!=assistindo){assistindo=n;atualizarEstado();}
 }

 // ------------------------------------------------------------ batimento e telemetria
 private void ping(){
  if(encerrando||token==null)return;
  exec.execute(()->{
   try{
    medirFps();medirRtt();
    JSONObject t=new JSONObject().put("bateria",bateria()).put("carregando",carregando()).put("temperatura",temperatura())
     .put("rede",tipoRede()).put("rede_qualidade",qualidadeRede()).put("rtt_ms",rttMs<0?JSONObject.NULL:Math.round(rttMs))
     .put("resolucao",largura>0?largura+"x"+altura:null).put("fps",fpsMedido).put("tela_ligada",telaLigada())
     .put("termico",termico).put("assistindo",assistindo).put("luz",luz).put("codec",codecUsado).put("codificador",encoderUsado).put("compatibilidade",compatibilidade).put("som",som).put("motivo",detalhe).put("app",BuildConfig.VERSION_NAME)
     .put("android",Build.VERSION.RELEASE).put("aparelho",Build.MANUFACTURER+" "+Build.MODEL);
    CameraApi.Resposta r=CameraApi.call("camera_disp_ping",new JSONObject().put("p_token",token).put("p_estado",estado).put("p_telemetria",t));
    if(CameraApi.autorizacaoEncerrada(r)){encerrar("central",false);return;}
    if(r.ok()){
     JSONObject o=new JSONObject(r.body);
     if(o.optBoolean("encerrada")){encerrar(o.optString("motivo","central"),false);return;}
     JSONObject nova=o.optJSONObject("config");if(nova!=null&&!nova.toString().equals(config.toString())){config=nova;aplicarQualidade();}
    }
   }catch(Exception ignored){}
   aplicarQualidade();
   atualizarNotificacao();
  });
 }
 private void medirFps(){
  // quadros contados desde o último ping (15 s); sem quadro há 6 s = câmera parada (não mostra imagem congelada como ao vivo)
  fpsMedido=Math.round(frames/15f);frames=0;
  if(!pausada&&!cameraFalhou&&ultimoQuadro>0&&SystemClock.elapsedRealtime()-ultimoQuadro>6000)cameraIndisponivel("A câmera parou de enviar imagem");
 }
 private void medirRtt(){
  PeerConnection pc=null;for(PeerConnection p:pcs.values())if(p.connectionState()==PeerConnection.PeerConnectionState.CONNECTED){pc=p;break;}
  if(pc==null){rttMs=-1;return;}
  CountDownLatch l=new CountDownLatch(1);
  pc.getStats(rep->{
   for(RTCStats s:rep.getStatsMap().values()){
    if("outbound-rtp".equals(s.getType())&&"video".equals(String.valueOf(s.getMembers().get("kind")))){
     Object e=s.getMembers().get("encoderImplementation");if(e!=null)encoderUsado=String.valueOf(e);
     Object cid=s.getMembers().get("codecId");RTCStats c=cid==null?null:rep.getStatsMap().get(String.valueOf(cid));
     if(c!=null){Object m=c.getMembers().get("mimeType");if(m!=null)codecUsado=String.valueOf(m).replace("video/","");}
    }
   }
   for(RTCStats s:rep.getStatsMap().values())if("candidate-pair".equals(s.getType())&&"succeeded".equals(String.valueOf(s.getMembers().get("state")))&&Boolean.TRUE.equals(s.getMembers().get("nominated"))){
    Object v=s.getMembers().get("currentRoundTripTime");if(v instanceof Number)rttMs=((Number)v).doubleValue()*1000;
   }
   l.countDown();
  });
  try{l.await(2,TimeUnit.SECONDS);}catch(InterruptedException ignored){}
 }
 private void atualizarEstado(){
  String e;
  if(pausada)e="pausada";
  else if(cameraFalhou)e="camera_indisponivel";
  else if(semRede)e="sem_conexao";
  else if(pedidoFalhando)e="reconectando";
  else if(rttMs>700)e="instavel";
  else if(ultimoQuadro==0)e="conectando";
  else e="ao_vivo";
  if(!e.equals(estado)){estado=e;atualizarNotificacao();}
  avisar();
 }
 private int bateria(){BatteryManager bm=getSystemService(BatteryManager.class);return bm==null?-1:bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);}
 private boolean carregando(){BatteryManager bm=getSystemService(BatteryManager.class);return bm!=null&&bm.isCharging();}
 private Object temperatura(){
  Intent i=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
  int t=i==null?Integer.MIN_VALUE:i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,Integer.MIN_VALUE);
  return t==Integer.MIN_VALUE?JSONObject.NULL:(Object)(t/10.0);
 }
 private boolean telaLigada(){PowerManager pm=getSystemService(PowerManager.class);return pm!=null&&pm.isInteractive();}
 private String tipoRede(){
  ConnectivityManager cm=getSystemService(ConnectivityManager.class);if(cm==null)return "desconhecida";
  NetworkCapabilities c=cm.getNetworkCapabilities(cm.getActiveNetwork());if(c==null)return "sem";
  if(c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return "wifi";
  if(c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))return "celular";
  if(c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))return "cabo";
  return "outra";
 }
 private String qualidadeRede(){
  if(semRede)return "sem";
  if(rttMs>=0)return rttMs<180?"boa":rttMs<450?"regular":"ruim";
  ConnectivityManager cm=getSystemService(ConnectivityManager.class);NetworkCapabilities c=cm==null?null:cm.getNetworkCapabilities(cm.getActiveNetwork());
  if(c==null)return "sem";int up=c.getLinkUpstreamBandwidthKbps();
  return up>=2000?"boa":up>=700?"regular":"ruim";
 }

 // ------------------------------------------------------------ rede, calor e energia
 private void ouvirRede(){
  ConnectivityManager cm=getSystemService(ConnectivityManager.class);if(cm==null)return;
  redeCb=new ConnectivityManager.NetworkCallback(){
   @Override public void onAvailable(Network n){exec.execute(()->{boolean voltou=semRede;semRede=false;falhasSinal=0;atualizarEstado();
    if(voltou){if(pollFuture!=null)pollFuture.cancel(false);pollFuture=exec.schedule(CameraStreamService.this::buscarSinais,300,TimeUnit.MILLISECONDS);ping();}});}
   @Override public void onLost(Network n){exec.execute(()->{ConnectivityManager c=getSystemService(ConnectivityManager.class);semRede=c==null||c.getActiveNetwork()==null;atualizarEstado();});}
  };
  try{cm.registerDefaultNetworkCallback(redeCb);}catch(Exception ignored){}
 }
 private void ouvirCalor(){
  PowerManager pm=getSystemService(PowerManager.class);if(pm==null||Build.VERSION.SDK_INT<29)return;
  termico=pm.getCurrentThermalStatus();
  termicoCb=s->exec.execute(()->{termico=s;aplicarQualidade();ping();});
  pm.addThermalStatusListener(termicoCb);
 }
 private void manterAcordado(boolean sim){
  try{
   if(sim){
    PowerManager pm=getSystemService(PowerManager.class);
    // sem isto o processador dorme com a tela apagada e a transmissão para; solto ao encerrar
    wake=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Chiavari:CameraAoVivo");wake.setReferenceCounted(false);wake.acquire(16*60*60*1000L);
    WifiManager wm=getApplicationContext().getSystemService(WifiManager.class);
    if(wm!=null){wifiLock=wm.createWifiLock(Build.VERSION.SDK_INT>=29?WifiManager.WIFI_MODE_FULL_LOW_LATENCY:WifiManager.WIFI_MODE_FULL_HIGH_PERF,"Chiavari:CameraAoVivo");wifiLock.setReferenceCounted(false);wifiLock.acquire();}
   }else{
    if(wake!=null&&wake.isHeld())wake.release();
    if(wifiLock!=null&&wifiLock.isHeld())wifiLock.release();
   }
  }catch(Exception ignored){}
 }

 // ------------------------------------------------------------ encerrar
 private void encerrar(String motivo,boolean avisarServidor){
  if(encerrando)return;encerrando=true;
  final String t=token;
  if(pollFuture!=null)pollFuture.cancel(false);if(pingFuture!=null)pingFuture.cancel(false);if(reabrirCamera!=null)reabrirCamera.cancel(false);
  for(String k:new ArrayList<>(pcs.keySet())){PeerConnection pc=pcs.remove(k);if(pc!=null)try{pc.dispose();}catch(Exception ignored){}}
  try{if(capturer!=null){capturer.stopCapture();capturer.dispose();}}catch(Exception ignored){}
  try{if(videoTrack!=null){videoTrack.removeSink(contador);videoTrack.dispose();}}catch(Exception ignored){}
  try{if(audioTrack!=null)audioTrack.dispose();if(audioSource!=null)audioSource.dispose();}catch(Exception ignored){}
  try{if(videoSource!=null)videoSource.dispose();if(helper!=null)helper.dispose();if(factory!=null)factory.dispose();}catch(Exception ignored){}
  capturer=null;videoTrack=null;videoSource=null;helper=null;factory=null;
  if(avisarServidor&&t!=null){try{CameraApi.call("camera_disp_encerrar",new JSONObject().put("p_token",t).put("p_motivo",motivo));}catch(Exception ignored){}}
  SecureStore.clear(this,"camera");
  getSharedPreferences("camera",0).edit().putBoolean("ativo",false).commit();
  try{ConnectivityManager cm=getSystemService(ConnectivityManager.class);if(cm!=null&&redeCb!=null)cm.unregisterNetworkCallback(redeCb);}catch(Exception ignored){}
  try{PowerManager pm=getSystemService(PowerManager.class);if(pm!=null&&termicoCb!=null&&Build.VERSION.SDK_INT>=29)pm.removeThermalStatusListener(termicoCb);}catch(Exception ignored){}
  manterAcordado(false);
  running=false;estado="encerrada";detalhe="central".equals(motivo)?"Encerrada pela central ou autorização expirada":"";assistindo=0;
  avisar();
  stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
 }
 @Override public void onDestroy(){
  // o Android encerrou o serviço sem passar por encerrar(): o app avisa ao reabrir (prefs "ativo" continua true)
  if(!encerrando){running=false;estado="interrompida";avisar();}
  instancia=null;exec.shutdown();super.onDestroy();
 }
 @Override public IBinder onBind(Intent intent){return null;}

 // ------------------------------------------------------------ notificação e app
 private static String rotulo(String e){
  switch(e){case "ao_vivo":return "Ao vivo";case "conectando":return "Conectando";case "reconectando":return "Reconectando";
   case "instavel":return "Conexão instável";case "camera_indisponivel":return "Câmera indisponível";case "sem_conexao":return "Sem conexão";
   case "pausada":return "Pausada";default:return "Encerrada";}
 }
 static String rotuloEstado(){return rotulo(estado);}
 private Notification notificacao(){
  PendingIntent abrir=PendingIntent.getActivity(this,20,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  PendingIntent ver=PendingIntent.getActivity(this,21,new Intent(this,CameraPreviewActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  PendingIntent parar=PendingIntent.getService(this,22,new Intent(this,CameraStreamService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  String texto=rotulo(estado)+(assistindo>0?" · "+assistindo+(assistindo==1?" pessoa assistindo":" pessoas assistindo"):"")+(detalhe.isEmpty()?"":" · "+detalhe);
  return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("Câmera transmitindo para a Logística")
   .setContentText(texto).setContentIntent(abrir).setOngoing(true).setOnlyAlertOnce(true).setUsesChronometer(true).setWhen(inicio==0?System.currentTimeMillis():inicio)
   .addAction(new Notification.Action.Builder(null,"Abrir o app",abrir).build())
   .addAction(new Notification.Action.Builder(null,"Ver câmera",ver).build())
   .addAction(new Notification.Action.Builder(null,"Encerrar",parar).build()).build();
 }
 private void atualizarNotificacao(){if(running&&!encerrando)getSystemService(NotificationManager.class).notify(NOTIF,notificacao());}
 private static void avisar(){Ouvinte o=ouvinte;if(o!=null)o.mudou();}

 // ------------------------------------------------------------ adaptadores WebRTC
 static class Sdp implements SdpObserver {
  @Override public void onCreateSuccess(SessionDescription s){}
  @Override public void onSetSuccess(){}
  @Override public void onCreateFailure(String e){}
  @Override public void onSetFailure(String e){}
 }
 static class Observador implements PeerConnection.Observer {
  @Override public void onSignalingChange(PeerConnection.SignalingState s){}
  @Override public void onIceConnectionChange(PeerConnection.IceConnectionState s){}
  @Override public void onIceConnectionReceivingChange(boolean b){}
  @Override public void onIceGatheringChange(PeerConnection.IceGatheringState s){}
  @Override public void onIceCandidate(IceCandidate c){}
  @Override public void onIceCandidatesRemoved(IceCandidate[] c){}
  @Override public void onAddStream(MediaStream m){}
  @Override public void onRemoveStream(MediaStream m){}
  @Override public void onDataChannel(DataChannel d){}
  @Override public void onRenegotiationNeeded(){}
 }
}
