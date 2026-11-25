package br.com.chiavari.acervo;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.webrtc.*;

/** "Ver a câmera": mostra a imagem que está sendo transmitida, sem abrir outra sessão da câmera (usa a do serviço). */
public final class CameraPreviewActivity extends Activity {
 private SurfaceViewRenderer tela;
 private VideoTrack ligada;
 private TextView estado;
 private final Handler h=new Handler(Looper.getMainLooper());
 private final Runnable relogio=new Runnable(){@Override public void run(){pintar();h.postDelayed(this,1000);}};
 @Override protected void onCreate(Bundle b){
  super.onCreate(b);
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  FrameLayout raiz=new FrameLayout(this);raiz.setBackgroundColor(Color.BLACK);
  tela=new SurfaceViewRenderer(this);raiz.addView(tela,new FrameLayout.LayoutParams(-1,-1));
  estado=new TextView(this);estado.setTextColor(Color.WHITE);estado.setTextSize(15);estado.setPadding(36,48,36,24);estado.setBackgroundColor(0x66000000);
  raiz.addView(estado,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
  LinearLayout botoes=new LinearLayout(this);botoes.setOrientation(LinearLayout.HORIZONTAL);botoes.setGravity(Gravity.CENTER);botoes.setPadding(24,24,24,64);
  Button voltar=new Button(this);voltar.setText("Voltar ao app");voltar.setOnClickListener(v->{startActivity(new Intent(this,MainActivity.class));finish();});
  Button encerrar=new Button(this);encerrar.setText("Encerrar transmissão");encerrar.setTextColor(Color.WHITE);encerrar.setBackgroundColor(0xFFD92D20);
  encerrar.setOnClickListener(v->new android.app.AlertDialog.Builder(this).setTitle("Encerrar a transmissão?").setMessage("A Logística deixa de ver a câmera.")
   .setPositiveButton("Encerrar",(d,w)->{startService(new Intent(this,CameraStreamService.class).setAction(CameraStreamService.STOP));finish();})
   .setNegativeButton("Continuar",null).show());
  LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.setMargins(12,0,12,0);
  botoes.addView(voltar,lp);botoes.addView(encerrar,lp);
  raiz.addView(botoes,new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM));
  setContentView(raiz);
 }
 @Override protected void onStart(){
  super.onStart();
  EglBase egl=CameraStreamService.egl;VideoTrack t=CameraStreamService.videoTrack;
  if(!CameraStreamService.running||egl==null||t==null){Toast.makeText(this,"A câmera não está transmitindo.",Toast.LENGTH_LONG).show();finish();return;}
  tela.init(egl.getEglBaseContext(),null);tela.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT);tela.setEnableHardwareScaler(true);
  try{t.addSink(tela);ligada=t;}catch(Exception e){finish();return;}
  h.post(relogio);
 }
 private void pintar(){
  if(!CameraStreamService.running){finish();return;}
  long s=(System.currentTimeMillis()-CameraStreamService.inicio)/1000;
  int n=CameraStreamService.assistindo;
  estado.setText("● "+CameraStreamService.rotuloEstado()+"  ·  "+String.format(java.util.Locale.getDefault(),"%02d:%02d:%02d",s/3600,(s%3600)/60,s%60)+
   (n>0?"  ·  "+n+(n==1?" pessoa assistindo":" pessoas assistindo"):"")+(CameraStreamService.detalhe.isEmpty()?"":"\n"+CameraStreamService.detalhe));
 }
 @Override protected void onStop(){
  h.removeCallbacks(relogio);
  try{if(ligada!=null)ligada.removeSink(tela);}catch(Exception ignored){}
  ligada=null;tela.release();
  super.onStop();
 }
}
