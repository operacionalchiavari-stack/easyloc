package br.com.chiavari.acervo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import org.json.JSONObject;

public final class MainActivity extends Activity {
 private static final String ORIGIN="https://easyloc-zeta.vercel.app";
 private WebView web;
 private String pendingToken;
 private boolean visible;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);web=new WebView(this);setContentView(web);
  getWindow().getDecorView().setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
    Uri u=req.getUrl();if(ORIGIN.equals(u.getScheme()+"://"+u.getAuthority()))return false;
    if(req.isForMainFrame()&&("https".equals(u.getScheme())||"mailto".equals(u.getScheme())||"tel".equals(u.getScheme())))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){callback.invoke(origin,false,false);}});
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
   new AlertDialog.Builder(this).setMessage("Atualize o Android System WebView e abra o app novamente.").setPositiveButton("Fechar",(d,w)->finish()).show();return;
  }
  WebViewCompat.addWebMessageListener(web,"AcervoAndroid",Collections.singleton(ORIGIN),(view,message,source,isMainFrame,reply)->{
   if(!isMainFrame||!ORIGIN.equals(source.getScheme()+"://"+source.getAuthority()))return;
   try{
    JSONObject data=new JSONObject(message.getData());String action=data.optString("action");
    if("status".equals(action)){sendStatus();return;}
    if("stop".equals(action)){startService(new Intent(this,TrackingService.class).setAction(TrackingService.STOP));send("stopped","Compartilhamento pausado.");return;}
    if(!"start".equals(action)||!visible)return;
    String token=data.getString("token");if(!token.matches("[A-Za-z0-9_-]{43}"))return;
    pendingToken=token;
    new AlertDialog.Builder(this).setTitle("Compartilhar localização com a Logística?").setMessage("O Acervo enviará sua localização enquanto o rastreamento estiver ativo, inclusive ao sair do app ou apagar a tela. Uma notificação permanecerá visível. Você pode pausar pelo app ou pela notificação.")
     .setPositiveButton("Ativar",(d,w)->permissions()).setNegativeButton("Cancelar",(d,w)->{pendingToken=null;send("error","Compartilhamento cancelado.");}).setOnCancelListener(d->{pendingToken=null;send("error","Compartilhamento cancelado.");}).show();
   }catch(Exception e){send("error","Não foi possível iniciar. Tente novamente.");}
  });
  web.loadUrl(ORIGIN+"/app.html");
 }
 private void permissions(){
  java.util.ArrayList<String> required=new java.util.ArrayList<>();
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){required.add(Manifest.permission.ACCESS_FINE_LOCATION);required.add(Manifest.permission.ACCESS_COARSE_LOCATION);}
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)required.add(Manifest.permission.POST_NOTIFICATIONS);
  if(required.isEmpty())startTracking();else requestPermissions(required.toArray(new String[0]),7);
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==7)startTracking();}
 private void startTracking(){
  boolean location=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
  boolean notifications=Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
  if(!visible||pendingToken==null||!location||!notifications){pendingToken=null;send("error","Permita localização e notificações nas configurações do Android para ativar.");return;}
  try{
   SecureStore.save(this,pendingToken);getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",true).commit();
   startForegroundService(new Intent(this,TrackingService.class));pendingToken=null;send("started","Rastreamento Android ativo, inclusive ao sair do app. Consulte a notificação para conferir o envio.");
  }catch(Exception e){getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",false).commit();send("error","Não foi possível iniciar o serviço do Android.");}
 }
 private void sendStatus(){send(TrackingService.running&&getSharedPreferences("rastreamento",0).getBoolean("ativo",false)?"started":"stopped","Consulte a notificação do Acervo para acompanhar o envio em segundo plano.");}
 private void send(String type,String text){
  if(web==null||!ORIGIN.equals(Uri.parse(web.getUrl()==null?"":web.getUrl()).getScheme()+"://"+Uri.parse(web.getUrl()==null?"":web.getUrl()).getAuthority()))return;
  try{JSONObject detail=new JSONObject().put("type",type).put("message",text);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('acervo:android',{detail:"+detail+"}))",null);}catch(Exception ignored){}
 }
 @Override public void onResume(){super.onResume();visible=true;if(web!=null)web.onResume();}
 @Override public void onPause(){visible=false;if(web!=null)web.onPause();super.onPause();}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else moveTaskToBack(true);}
 @Override public void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
