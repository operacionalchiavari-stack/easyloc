package br.com.chiavari.acervo;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.ImageFormat;
import android.hardware.camera2.*;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Range;
import android.util.Size;
import java.nio.ByteBuffer;
import java.util.Collections;
import org.webrtc.*;

/**
 * Captura da câmera direto em memória (Camera2 + ImageReader YUV), sem passar pela placa de vídeo.
 * Motivo: no Galaxy A57 (Android 17) a conversão textura → memória do WebRTC devolvia quadros pretos
 * (o "Ver a câmera" desenhava a textura direto e mostrava a imagem; a transmissão saía preta).
 */
final class CameraMemoria implements VideoCapturer {
 interface Eventos { void erro(String motivo); void primeiroQuadro(); }

 private final Context ctx;
 private final Eventos eventos;
 private CapturerObserver observer;
 private HandlerThread linha;
 private Handler handler;
 private CameraDevice camera;
 private CameraCaptureSession sessao;
 private ImageReader leitor;
 private int rotacao;
 private volatile boolean rodando, primeiro;

 CameraMemoria(Context ctx, Eventos eventos) { this.ctx = ctx.getApplicationContext(); this.eventos = eventos; }

 @Override public void initialize(SurfaceTextureHelper helper, Context c, CapturerObserver obs) { observer = obs; }

 @SuppressLint("MissingPermission")
 @Override public void startCapture(int w, int h, int fps) {
  if (rodando) return;
  rodando = true; primeiro = false;
  linha = new HandlerThread("camera-memoria"); linha.start(); handler = new Handler(linha.getLooper());
  handler.post(() -> {
   try {
    CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
    String id = null;
    for (String c : cm.getCameraIdList()) {
     Integer face = cm.getCameraCharacteristics(c).get(CameraCharacteristics.LENS_FACING);
     if (face != null && face == CameraCharacteristics.LENS_FACING_BACK) { id = c; break; }
    }
    if (id == null && cm.getCameraIdList().length > 0) id = cm.getCameraIdList()[0];
    if (id == null) { falhou("Este celular não tem câmera disponível."); return; }
    CameraCharacteristics ch = cm.getCameraCharacteristics(id);
    Integer o = ch.get(CameraCharacteristics.SENSOR_ORIENTATION); rotacao = o == null ? 90 : o;
    Size tam = escolherTamanho(ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP), w, h);
    Range<Integer> faixa = escolherFaixa(ch.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES), fps);
    leitor = ImageReader.newInstance(tam.getWidth(), tam.getHeight(), ImageFormat.YUV_420_888, 3);
    leitor.setOnImageAvailableListener(this::quadro, handler);
    cm.openCamera(id, new CameraDevice.StateCallback() {
     @Override public void onOpened(CameraDevice d) {
      if (!rodando) { d.close(); return; }
      camera = d;
      try {
       d.createCaptureSession(Collections.singletonList(leitor.getSurface()), new CameraCaptureSession.StateCallback() {
        @Override public void onConfigured(CameraCaptureSession s) {
         if (!rodando) { s.close(); return; }
         sessao = s;
         try {
          CaptureRequest.Builder r = d.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
          r.addTarget(leitor.getSurface());
          if (faixa != null) r.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, faixa);
          r.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
          r.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);
          s.setRepeatingRequest(r.build(), null, handler);
          if (observer != null) observer.onCapturerStarted(true);
         } catch (Exception e) { falhou("Erro na câmera"); }
        }
        @Override public void onConfigureFailed(CameraCaptureSession s) { falhou("Erro na câmera"); }
       }, handler);
      } catch (Exception e) { falhou("Erro na câmera"); }
     }
     @Override public void onDisconnected(CameraDevice d) { d.close(); camera = null; falhou("Outro app usou a câmera"); }
     @Override public void onError(CameraDevice d, int erro) { d.close(); camera = null; falhou("Erro na câmera"); }
    }, handler);
   } catch (Exception e) { falhou("Não foi possível abrir a câmera."); }
  });
 }

 private void falhou(String motivo) { if (rodando) eventos.erro(motivo); }

 private void quadro(ImageReader r) {
  Image img = null;
  try {
   img = r.acquireLatestImage();
   if (img == null || !rodando || observer == null) return;
   int w = img.getWidth(), h = img.getHeight();
   JavaI420Buffer b = JavaI420Buffer.allocate(w, h);
   Image.Plane[] p = img.getPlanes();
   copiar(p[0], w, h, b.getDataY(), b.getStrideY());
   copiar(p[1], (w + 1) / 2, (h + 1) / 2, b.getDataU(), b.getStrideU());
   copiar(p[2], (w + 1) / 2, (h + 1) / 2, b.getDataV(), b.getStrideV());
   // Gira aqui (imagem já em pé) em vez de mandar o aviso de rotação: em alguns navegadores com placa de vídeo
   // (Edge no notebook) o vídeo com esse aviso aparecia preto, enquanto o do navegador do celular (já em pé) aparecia.
   VideoFrame.I420Buffer saida = b; int rot = rotacao;
   if (rotacao != 0) {
    try {
     boolean deitada = rotacao == 90 || rotacao == 270;
     JavaI420Buffer girada = JavaI420Buffer.allocate(deitada ? h : w, deitada ? w : h);
     YuvHelper.I420Rotate(b.getDataY(), b.getStrideY(), b.getDataU(), b.getStrideU(), b.getDataV(), b.getStrideV(),
      girada.getDataY(), girada.getStrideY(), girada.getDataU(), girada.getStrideU(), girada.getDataV(), girada.getStrideV(), w, h, rotacao);
     b.release(); saida = girada; rot = 0;
    } catch (Throwable e) { saida = b; rot = rotacao; }
   }
   VideoFrame f = new VideoFrame(saida, rot, System.nanoTime());
   try { observer.onFrameCaptured(f); } finally { f.release(); }
   if (!primeiro) { primeiro = true; eventos.primeiroQuadro(); }
  } catch (Exception ignored) {
  } finally { if (img != null) img.close(); }
 }

 private static void copiar(Image.Plane pl, int w, int h, ByteBuffer dst, int dstStride) {
  ByteBuffer src = pl.getBuffer(); int rs = pl.getRowStride(), ps = pl.getPixelStride();
  byte[] linha = new byte[rs];
  for (int y = 0; y < h; y++) {
   int ini = y * rs; if (ini >= src.capacity()) break;
   int len = Math.min(rs, src.capacity() - ini);
   src.position(ini); src.get(linha, 0, len);
   dst.position(y * dstStride);
   if (ps == 1) dst.put(linha, 0, Math.min(w, len));
   else for (int x = 0; x < w && x * ps < len; x++) dst.put(linha[x * ps]);
  }
  dst.rewind();
 }

 private static Size escolherTamanho(StreamConfigurationMap m, int w, int h) {
  Size melhor = new Size(640, 480);
  if (m == null) return melhor;
  Size[] ts = m.getOutputSizes(ImageFormat.YUV_420_888); if (ts == null || ts.length == 0) return melhor;
  int alvoMaior = Math.max(w, h), alvoMenor = Math.min(w, h); long dif = Long.MAX_VALUE;
  for (Size s : ts) {
   int maior = Math.max(s.getWidth(), s.getHeight()), menor = Math.min(s.getWidth(), s.getHeight());
   if (maior < alvoMaior || menor < alvoMenor) continue;
   long d = (long) maior * menor - (long) alvoMaior * alvoMenor;
   if (d < dif) { dif = d; melhor = s; }
  }
  return melhor;
 }

 private static Range<Integer> escolherFaixa(Range<Integer>[] fs, int fps) {
  if (fs == null) return null;
  Range<Integer> melhor = null;
  for (Range<Integer> f : fs) {
   if (f.getLower() > fps || f.getUpper() < fps) continue;
   if (melhor == null || f.getUpper() - f.getLower() < melhor.getUpper() - melhor.getLower()) melhor = f;
  }
  return melhor;
 }

 @Override public void stopCapture() {
  rodando = false;
  try { if (sessao != null) sessao.close(); } catch (Exception ignored) {}
  try { if (camera != null) camera.close(); } catch (Exception ignored) {}
  try { if (leitor != null) leitor.close(); } catch (Exception ignored) {}
  sessao = null; camera = null; leitor = null;
  if (linha != null) { linha.quitSafely(); linha = null; }
  if (observer != null) observer.onCapturerStopped();
 }

 @Override public void changeCaptureFormat(int w, int h, int fps) { stopCapture(); startCapture(w, h, fps); }
 @Override public void dispose() { if (rodando) stopCapture(); }
 @Override public boolean isScreencast() { return false; }
}
