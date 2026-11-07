package br.com.chiavari.acervo;

import android.app.*;
import android.content.*;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;

public final class ChiavariMessagingService extends FirebaseMessagingService {
 @Override public void onNewToken(String token){new Thread(()->NativePush.rotate(getApplicationContext(),token),"chiavari-push-token").start();}
 @android.annotation.SuppressLint("MissingPermission") // Permissão conferida antes de publicar.
 @Override public void onMessageReceived(RemoteMessage message){
  try{
   String stored=SecureStore.read(this,"push");if(stored==null)return;
   JSONObject current=new JSONObject(stored);
   if(!current.getString("usuario").equals(message.getData().get("user_id"))||!current.getString("empresa").equals(message.getData().get("empresa_id")))return;
   NotificationManager manager=getSystemService(NotificationManager.class);if(!manager.areNotificationsEnabled())return;
   manager.createNotificationChannel(new NotificationChannel("avisos","Avisos da Chiavari",NotificationManager.IMPORTANCE_HIGH));
   String title=message.getData().getOrDefault("titulo","Chiavari"),body=message.getData().getOrDefault("corpo","Você tem um novo aviso.");
   String tag=message.getData().getOrDefault("tag",message.getMessageId()==null?"aviso":message.getMessageId());
   Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("url",message.getData().getOrDefault("url","app.html"));
   PendingIntent pending=PendingIntent.getActivity(this,tag.hashCode(),open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
   Notification generic=new Notification.Builder(this,"avisos").setSmallIcon(R.drawable.ic_notification).setContentTitle("Chiavari").setContentText("Você recebeu um novo aviso.").build();
   Notification notification=new Notification.Builder(this,"avisos").setSmallIcon(R.drawable.ic_notification).setColor(0xFF5A5A55).setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(pending).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(generic).build();
   manager.notify(tag,23,notification);
  }catch(Exception ignored){}
 }
}
