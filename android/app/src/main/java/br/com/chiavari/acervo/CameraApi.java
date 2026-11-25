package br.com.chiavari.acervo;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Chamadas do serviço da câmera ao banco. Só funções camera_disp_*, autorizadas pelo token do aparelho (vale para uma câmera). */
final class CameraApi {
 static final class Resposta { final int code; final String body; Resposta(int c,String b){code=c;body=b;} boolean ok(){return code>=200&&code<300;} }
 static Resposta call(String function,JSONObject body) throws Exception {
  HttpURLConnection c=(HttpURLConnection)new URL(TrackingApi.BASE+function).openConnection();
  try{
   c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(12000);c.setDoOutput(true);
   c.setRequestProperty("apikey",TrackingApi.PUBLIC_KEY);c.setRequestProperty("Content-Type","application/json");
   try(java.io.OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
   int code=c.getResponseCode();
   InputStream in=code>=400?c.getErrorStream():c.getInputStream();
   ByteArrayOutputStream buf=new ByteArrayOutputStream();
   if(in!=null)try(InputStream s=in){byte[] b=new byte[8192];int n;while((n=s.read(b))>0)buf.write(b,0,n);}
   return new Resposta(code,buf.toString("UTF-8"));
  }finally{c.disconnect();}
 }
 /** 4xx que diz que a autorização acabou (token expirado ou câmera encerrada pelo site). */
 static boolean autorizacaoEncerrada(Resposta r){return r.code>=400&&r.code<500&&r.body!=null&&r.body.contains("Autorização da câmera encerrada");}
}
