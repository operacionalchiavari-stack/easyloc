package br.com.chiavari.acervo;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Guarda somente a autorização de localização; não armazena senha ou refresh token. */
final class SecureStore {
 private static final String KEY="acervo-localizacao-v1";
 private static SecretKey key() throws Exception {
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
  if(!ks.containsAlias(KEY)){
   KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   generator.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();
  }
  return (SecretKey)ks.getKey(KEY,null);
 }
 static synchronized void save(Context c,String token) throws Exception { save(c,"token",token); }
 static synchronized void save(Context c,String name,String token) throws Exception {
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
  String encoded=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);
  if(!c.getSharedPreferences(KEY,0).edit().putString(name,encoded).commit())throw new Exception("Falha ao guardar autorização");
 }
 static synchronized String read(Context c) throws Exception { return read(c,"token"); }
 static synchronized String read(Context c,String name) throws Exception {
  String value=c.getSharedPreferences(KEY,0).getString(name,null);if(value==null)return null;
  String[] parts=value.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
  cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
  return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8);
 }
 static synchronized void clear(Context c){clear(c,"token");}
 static synchronized void clear(Context c,String name){c.getSharedPreferences(KEY,0).edit().remove(name).commit();}
}
