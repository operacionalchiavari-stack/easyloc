package br.com.chiavari.acervo;

import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class TrackingApi {
 static final String BASE="https://awemuohtvwvrdzfxwrmd.supabase.co/rest/v1/rpc/";
 // Chave pública do projeto; a autorização é o token de dispositivo limitado ao envio.
 static final String PUBLIC_KEY="sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ";
 static int call(String function,JSONObject body) throws Exception {
  HttpURLConnection c=(HttpURLConnection)new URL(BASE+function).openConnection();
  try{
   c.setRequestMethod("POST");c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setDoOutput(true);
   c.setRequestProperty("apikey",PUBLIC_KEY);c.setRequestProperty("Content-Type","application/json");
   try(java.io.OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
   return c.getResponseCode();
  }finally{c.disconnect();}
 }
}
