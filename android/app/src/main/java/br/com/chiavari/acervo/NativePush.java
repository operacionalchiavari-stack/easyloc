package br.com.chiavari.acervo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebView;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.util.UUID;

/** Push FCM independente do serviço de GPS e com autorização separada. */
final class NativePush {
 private final Activity activity;
 private final WebView web;
 NativePush(Activity a,WebView w){activity=a;web=w;}
 static synchronized boolean initialize(Context c){
  if(!BuildConfig.FIREBASE_CONFIGURED)return false;
  if(FirebaseApp.getApps(c).isEmpty())FirebaseApp.initializeApp(c,new FirebaseOptions.Builder().setApplicationId(BuildConfig.FIREBASE_APP_ID).setApiKey(BuildConfig.FIREBASE_API_KEY).setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build());
  return true;
 }
 private void event(String type,String message,JSONObject extras){
  activity.runOnUiThread(()->{
   Uri url=Uri.parse(web.getUrl()==null?"":web.getUrl());
   if(!"https://easyloc-zeta.vercel.app".equals(url.getScheme()+"://"+url.getAuthority())||activity.isDestroyed())return;
   try{JSONObject data=extras==null?new JSONObject():extras;data.put("type",type).put("message",message);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('acervo:push',{detail:"+data+"}))",null);}catch(Exception ignored){}
  });
 }
 boolean handle(JSONObject data) throws Exception {
  String action=data.optString("action");if(!action.startsWith("push:"))return false;
  switch(action){
   case "push:status": status(); break;
   case "push:enable":
    if(!initialize(activity)){event("error","As notificações Android aguardam a conexão do Firebase.",null);break;}
    if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},11);
    else enable();
    break;
   case "push:bind":
    if(!data.optString("binding").matches("[A-Za-z0-9_-]{43}")||!allowed())throw new Exception("Autorização inválida");
    UUID.fromString(data.getString("usuario"));UUID.fromString(data.getString("empresa"));
    SecureStore.save(activity,"push",data.toString());status();break;
   case "push:disable": disable(activity);event("status","Notificações desligadas neste aparelho.",new JSONObject().put("configured",BuildConfig.FIREBASE_CONFIGURED).put("enabled",false));break;
   default: event("error","Ação de notificação desconhecida.",null);
  }
  return true;
 }
 private boolean allowed(){return activity.getSystemService(NotificationManager.class).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
 void enable(){
  if(!allowed()){event("error","Permita as notificações do Chiavari nas configurações do Android.",null);return;}
  if(!initialize(activity)){event("error","O Firebase ainda não foi configurado.",null);return;}
  FirebaseMessaging.getInstance().setAutoInitEnabled(true);
  FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{
   try{String id=activity.getSharedPreferences("push",0).getString("device",null);if(id==null){id=UUID.randomUUID().toString();activity.getSharedPreferences("push",0).edit().putString("device",id).commit();}
    event("token","Registrando avisos deste aparelho…",new JSONObject().put("token",token).put("device",id));
   }catch(Exception e){event("error","Não foi possível preparar as notificações.",null);}
  }).addOnFailureListener(e->event("error","Não foi possível conectar ao serviço de notificações. Tente novamente.",null));
 }
 private void status() throws Exception {
  String saved=SecureStore.read(activity,"push");boolean enabled=saved!=null&&allowed();
  event("status",enabled?"Notificações Android ativadas.":"Ative os avisos para receber suas escalas.",new JSONObject().put("configured",BuildConfig.FIREBASE_CONFIGURED).put("enabled",enabled).put("permission",allowed()));
  if(enabled&&initialize(activity)){
   String oldToken=new JSONObject(saved).optString("token");
   FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{if(!token.equals(oldToken))enable();});
  }
 }
 static void disable(Context context){
  final Context c=context.getApplicationContext();
  try{
   String value=SecureStore.read(c,"push");SecureStore.clear(c,"push");
   if(initialize(c)){FirebaseMessaging.getInstance().setAutoInitEnabled(false);FirebaseMessaging.getInstance().deleteToken();}
   if(value!=null)new Thread(()->{try{JSONObject payload=new JSONObject(value);TrackingApi.call("app_android_push_encerrar",new JSONObject().put("p_binding",payload.getString("binding")));}catch(Exception ignored){}},"chiavari-push-revoke").start();
  }catch(Exception ignored){}
 }
 static void rotate(Context c,String token){
  try{
   String value=SecureStore.read(c,"push");if(value==null)return;
   JSONObject data=new JSONObject(value);String binding=data.getString("binding");
   int result=TrackingApi.call("app_android_push_atualizar",new JSONObject().put("p_binding",binding).put("p_token",token));
   if(result>=200&&result<300){String current=SecureStore.read(c,"push");if(current!=null&&binding.equals(new JSONObject(current).getString("binding"))){data.put("token",token);SecureStore.save(c,"push",data.toString());}}
  }catch(Exception ignored){}
 }
}
