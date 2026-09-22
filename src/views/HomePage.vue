<template>
  <ion-page class="camera-page">
    <ion-content :fullscreen="true" class="camera-content" :scroll-y="false">
      <!-- Visor de Cámara en Vivo (Al entrar ya se ve la cámara) -->
      <div class="camera-container" @click="handleTouchFocus">
        <video
          ref="videoElement"
          class="camera-preview"
          :class="{ mirrored: facingMode === 'user' }"
          autoplay
          playsinline
          muted
        ></video>

        <!-- Cuadrícula opcional de composición de fotografía -->
        <div class="camera-grid" v-if="showGrid">
          <div class="grid-line horizontal h1"></div>
          <div class="grid-line horizontal h2"></div>
          <div class="grid-line vertical v1"></div>
          <div class="grid-line vertical v2"></div>
        </div>

        <!-- Indicador de Enfoque Animado al Tocar la Pantalla -->
        <div
          v-if="focusBox.show"
          class="focus-indicator"
          :style="{ left: focusBox.x + 'px', top: focusBox.y + 'px' }"
        >
          <div class="focus-reticle"></div>
        </div>

        <!-- Efecto Flash al tomar la foto -->
        <div class="shutter-flash" :class="{ active: isFlashing }"></div>

        <!-- Estado de carga o error de permisos si la cámara no se puede abrir -->
        <div v-if="cameraError" class="camera-fallback">
          <ion-icon :icon="alertCircleOutline" class="fallback-icon"></ion-icon>
          <h3>No se pudo acceder a la cámara</h3>
          <p>{{ cameraErrorMessage }}</p>
          <ion-button color="light" shape="round" @click="initCamera">
            Reintentar Acceso
          </ion-button>
          <ion-button color="primary" fill="outline" shape="round" @click="openDeviceFiles">
            <ion-icon :icon="folderOpenOutline" slot="start"></ion-icon>
            Abrir desde Archivos
          </ion-button>
        </div>

        <!-- Barra Superior de Control / HUD -->
        <div class="camera-hud-top">
          <!-- Toggle Flash -->
          <button class="hud-btn" @click.stop="toggleFlash">
            <ion-icon :icon="flashEnabled ? flashOutline : flashOffOutline"></ion-icon>
          </button>

          <!-- Toggle Cuadrícula -->
          <button class="hud-btn" :class="{ active: showGrid }" @click.stop="showGrid = !showGrid">
            <ion-icon :icon="gridOutline"></ion-icon>
          </button>

          <!-- Badge de Calidad -->
          <div class="hud-badge">HD 4:3</div>

          <!-- Botón de Configuración con la Firma de Nicolas Nieto -->
          <button class="hud-btn" @click.stop="showSignature">
            <ion-icon :icon="settingsOutline"></ion-icon>
          </button>
        </div>

        <!-- Barra Inferior de Control Tipo Cámara Real -->
        <div class="camera-hud-bottom">
          <!-- LADO IZQUIERDO: Selector / Visor de Archivos (Miniatura de última foto) -->
          <div class="gallery-slot">
            <button class="gallery-thumbnail-btn" @click.stop="openGalleryModal">
              <img
                v-if="latestPhoto"
                :src="latestPhoto.webviewPath"
                alt="Miniatura"
                class="thumb-img"
              />
              <div v-else class="thumb-placeholder">
                <ion-icon :icon="imagesOutline"></ion-icon>
              </div>
              <span v-if="photos.length > 0" class="gallery-count-badge">{{ photos.length }}</span>
            </button>
            <span class="slot-label">Galería</span>
          </div>

          <!-- CENTRO: Gran Botón Obturador de Disparo -->
          <div class="shutter-slot">
            <button
              class="shutter-button"
              :class="{ pressed: isShutterPressed }"
              @touchstart="isShutterPressed = true"
              @touchend="isShutterPressed = false"
              @mousedown="isShutterPressed = true"
              @mouseup="isShutterPressed = false"
              @click="takePicture"
              :disabled="!isStreaming"
            >
              <div class="shutter-inner"></div>
            </button>
          </div>

          <!-- LADO DERECHO: Botón de Voltear Cámara (Frontal / Trasera) -->
          <div class="flip-slot">
            <button
              class="flip-button"
              :class="{ rotating: isFlipping }"
              @click.stop="switchCamera"
            >
              <ion-icon :icon="cameraReverseOutline"></ion-icon>
            </button>
            <span class="slot-label">Girar</span>
          </div>
        </div>
      </div>

      <!-- Input de archivo oculto para acceder a los archivos del dispositivo -->
      <input
        type="file"
        ref="fileInputRef"
        accept="image/*"
        style="display: none"
        @change="onFileSelected"
      />

      <!-- MODAL DEL VISOR Y GESTOR DE ARCHIVOS / GALERÍA -->
      <ion-modal :is-open="isGalleryOpen" @didDismiss="isGalleryOpen = false">
        <div class="gallery-modal-content">
          <!-- Cabecera del visor -->
          <div class="gallery-header">
            <button class="modal-close-btn" @click="isGalleryOpen = false">
              <ion-icon :icon="closeOutline"></ion-icon>
            </button>
            <h2>Mis Fotos y Archivos</h2>
            <button class="modal-upload-btn" @click="openDeviceFiles">
              <ion-icon :icon="folderOpenOutline"></ion-icon>
              <span>Subir</span>
            </button>
          </div>

          <!-- Vista Principal de la foto seleccionada -->
          <div class="preview-stage" v-if="activePhoto">
            <img :src="activePhoto.webviewPath" alt="Foto seleccionada" class="stage-image" />
            <div class="stage-actions">
              <button class="action-btn delete-btn" @click="confirmDeletePhoto(activePhoto)">
                <ion-icon :icon="trashOutline"></ion-icon>
                <span>Eliminar</span>
              </button>
              <button class="action-btn download-btn" @click="downloadCurrentPhoto">
                <ion-icon :icon="checkmarkCircleOutline"></ion-icon>
                <span>Guardar</span>
              </button>
            </div>
          </div>

          <!-- Si no hay fotos todavía -->
          <div v-else class="empty-gallery">
            <ion-icon :icon="imagesOutline" class="empty-icon"></ion-icon>
            <h3>Aún no tienes fotos guardadas</h3>
            <p>Toma una foto con la cámara o selecciona un archivo de tu dispositivo.</p>
            <ion-button color="primary" shape="round" @click="openDeviceFiles">
              <ion-icon :icon="folderOpenOutline" slot="start"></ion-icon>
              Elegir de mis archivos
            </ion-button>
          </div>

          <!-- Carrusel / Tira de miniaturas inferior del visor -->
          <div class="gallery-filmstrip" v-if="photos.length > 0">
            <div
              v-for="photo in photos"
              :key="photo.filepath"
              class="filmstrip-item"
              :class="{ active: activePhoto && activePhoto.filepath === photo.filepath }"
              @click="activePhoto = photo"
            >
              <img :src="photo.webviewPath" alt="Miniatura" />
            </div>
          </div>

          <!-- Pie del visor con la firma de Nicolas Nieto -->
          <div class="gallery-footer">
            <p class="signature-text">Hecho por Nicolas Nieto</p>
          </div>
        </div>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  IonPage,
  IonContent,
  IonIcon,
  IonModal,
  IonButton,
  alertController,
  toastController
} from '@ionic/vue';
import {
  cameraReverseOutline,
  imagesOutline,
  settingsOutline,
  trashOutline,
  closeOutline,
  flashOutline,
  flashOffOutline,
  folderOpenOutline,
  gridOutline,
  checkmarkCircleOutline,
  alertCircleOutline
} from 'ionicons/icons';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Camera } from '@capacitor/camera';
import { usePhotoGallery, UserPhoto } from '../composables/usePhotoGallery';

const { photos, saveBase64Image, pickFromGallery, deletePhoto } = usePhotoGallery();

// Referencias de cámara y elementos DOM
const videoElement = ref<HTMLVideoElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Estados de la cámara
const isStreaming = ref(false);
const cameraError = ref(false);
const cameraErrorMessage = ref('');
const facingMode = ref<'environment' | 'user'>('environment');
const isFlipping = ref(false);
const showGrid = ref(false);
const flashEnabled = ref(false);
const isFlashing = ref(false);
const isShutterPressed = ref(false);

// Estado de enfoque táctil
const focusBox = ref({
  show: false,
  x: 0,
  y: 0
});

// Estados del visor / modal
const isGalleryOpen = ref(false);
const activePhoto = ref<UserPhoto | null>(null);

// Foto más reciente para la miniatura del HUD inferior
const latestPhoto = computed(() => {
  return photos.value.length > 0 ? photos.value[0] : null;
});

// Inicializar la cámara en vivo apenas entra a la aplicación
const initCamera = async () => {
  cameraError.value = false;
  cameraErrorMessage.value = '';

  // 1. Solicitar permisos de cámara en Android nativo si es necesario
  try {
    if (Camera && typeof Camera.requestPermissions === 'function') {
      await Camera.requestPermissions();
    }
  } catch (err) {
    console.log('Permisos nativos ya concedidos o en entorno web:', err);
  }

  // 2. Detener stream previo si existe
  stopCamera();

  // 3. Obtener el stream de video de la cámara
  try {
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: facingMode.value,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoElement.value) {
      videoElement.value.srcObject = stream;
      await videoElement.value.play();
      isStreaming.value = true;
    }
  } catch (err: any) {
    console.error('Error al inicializar stream de cámara:', err);
    cameraError.value = true;
    cameraErrorMessage.value =
      err.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Por favor, habilítalo en los ajustes.'
        : 'No se pudo iniciar la cámara en este dispositivo.';
  }
};

// Detener el stream para ahorrar batería y recursos
const stopCamera = () => {
  if (videoElement.value && videoElement.value.srcObject) {
    const stream = videoElement.value.srcObject as MediaStream;
    stream.getTracks().forEach((track) => track.stop());
    videoElement.value.srcObject = null;
  }
  isStreaming.value = false;
};

// Alternar entre cámara trasera y delantera
const switchCamera = async () => {
  isFlipping.value = true;
  facingMode.value = facingMode.value === 'environment' ? 'user' : 'environment';
  await initCamera();
  setTimeout(() => {
    isFlipping.value = false;
  }, 400);
};

// Alternar linterna/flash
const toggleFlash = async () => {
  flashEnabled.value = !flashEnabled.value;
  try {
    if (videoElement.value && videoElement.value.srcObject) {
      const stream = videoElement.value.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: flashEnabled.value } as any]
        });
      }
    }
  } catch (e) {
    console.log('Torch no disponible en este dispositivo/navegador');
  }
};

// Disparar foto (Capturar fotograma de alta calidad desde la cámara en vivo)
const takePicture = async () => {
  if (!videoElement.value || !isStreaming.value) return;

  // Efecto Flash en pantalla
  isFlashing.value = true;
  setTimeout(() => {
    isFlashing.value = false;
  }, 180);

  // Respuesta Háptica (Vibración de cámara)
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (e) {
    // Ignorar en navegadores web sin soporte háptico
  }

  // Dibujar el fotograma actual de video en un canvas offscreen
  const video = videoElement.value;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Si es cámara frontal, corregir orientación de espejo
    if (facingMode.value === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.95);

    // Guardar en el sistema de archivos local y almacenamiento persistente
    const saved = await saveBase64Image(base64Data);
    activePhoto.value = saved;
    showToast('Foto guardada correctamente 📸');
  }
};

// Enfoque táctil interactivo (muestra el recuadro de enfoque donde toca el usuario)
const handleTouchFocus = (e: MouseEvent | TouchEvent) => {
  let clientX = 0;
  let clientY = 0;
  if ('touches' in e && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if ('clientX' in e) {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  focusBox.value = {
    show: true,
    x: clientX,
    y: clientY
  };

  setTimeout(() => {
    focusBox.value.show = false;
  }, 1000);
};

// Abrir el visor / galería modal
const openGalleryModal = () => {
  if (photos.value.length > 0) {
    activePhoto.value = photos.value[0];
  } else {
    activePhoto.value = null;
  }
  isGalleryOpen.value = true;
};

// Abrir explorador de archivos nativo
const openDeviceFiles = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
};

// Procesar archivo seleccionado desde el explorador del celular
const onFileSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        const saved = await saveBase64Image(base64);
        activePhoto.value = saved;
        isGalleryOpen.value = true;
        showToast('Archivo importado exitosamente 📂');
      }
    };
    reader.readAsDataURL(file);
    target.value = '';
  }
};

// Confirmar eliminación de foto
const confirmDeletePhoto = async (photo: UserPhoto) => {
  const alert = await alertController.create({
    header: 'Eliminar Foto',
    message: '¿Estás seguro de que deseas eliminar esta fotografía?',
    buttons: [
      {
        text: 'Cancelar',
        role: 'cancel'
      },
      {
        text: 'Eliminar',
        role: 'destructive',
        handler: async () => {
          await deletePhoto(photo);
          if (photos.value.length > 0) {
            activePhoto.value = photos.value[0];
          } else {
            activePhoto.value = null;
          }
          showToast('Foto eliminada');
        }
      }
    ]
  });
  await alert.present();
};

// Descargar/compartir foto actual
const downloadCurrentPhoto = () => {
  if (!activePhoto.value) return;
  const a = document.createElement('a');
  a.href = activePhoto.value.webviewPath;
  a.download = activePhoto.value.filepath;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Descarga iniciada');
};

// Modal de Configuración con la firma requerida
const showSignature = async () => {
  const alert = await alertController.create({
    header: 'Cámara Pro',
    subHeader: 'Ajustes del Sistema',
    message: `
      <div style="text-align: center; padding: 10px 0;">
        <p style="font-size: 1.15rem; font-weight: bold; color: #3880ff; margin-bottom: 8px;">
          Hecho por Nicolas Nieto
        </p>
        <p style="font-size: 0.85rem; color: #888;">
          Versión 2.0 • Cámara Nativa Optimizada
        </p>
      </div>
    `,
    buttons: ['Entendido']
  });
  await alert.present();
};

const showToast = async (msg: string) => {
  const toast = await toastController.create({
    message: msg,
    duration: 1800,
    position: 'top',
    color: 'dark'
  });
  await toast.present();
};

// Ciclo de vida: Iniciar al entrar a la app y liberar al salir
onMounted(() => {
  initCamera();
});

onUnmounted(() => {
  stopCamera();
});
</script>

<style scoped>
/* Contenedor principal de la cámara tipo visor real */
.camera-page {
  background-color: #000;
}

.camera-content {
  --background: #000;
  height: 100%;
  overflow: hidden;
}

.camera-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
  overflow: hidden;
}

/* Video de cámara en vivo a pantalla completa */
.camera-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-preview.mirrored {
  transform: scaleX(-1);
}

/* Cuadrícula fotográfica de los tercios */
.camera-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.2);
}

.grid-line.horizontal {
  left: 0;
  right: 0;
  height: 1px;
}
.grid-line.h1 {
  top: 33.33%;
}
.grid-line.h2 {
  top: 66.66%;
}

.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.grid-line.v1 {
  left: 33.33%;
}
.grid-line.v2 {
  left: 66.66%;
}

/* Recuadro animado de enfoque al tocar la pantalla */
.focus-indicator {
  position: absolute;
  width: 70px;
  height: 70px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: focusPulse 0.4s ease-out forwards;
}

.focus-reticle {
  width: 100%;
  height: 100%;
  border: 2px solid #ffd700;
  border-radius: 6px;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
}

@keyframes focusPulse {
  0% {
    transform: translate(-50%, -50%) scale(1.4);
    opacity: 0.4;
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

/* Destello del disparador / Shutter flash */
.shutter-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease-out;
  z-index: 50;
}

.shutter-flash.active {
  opacity: 0.9;
}

/* Fallback si no hay cámara disponible */
.camera-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #121212;
  color: #fff;
  padding: 24px;
  text-align: center;
  z-index: 20;
}

.fallback-icon {
  font-size: 64px;
  color: #f39c12;
  margin-bottom: 16px;
}

/* Barra superior HUD */
.camera-hud-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  padding: 16px 20px 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%);
  z-index: 30;
}

.hud-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(30, 30, 30, 0.6);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hud-btn:active {
  transform: scale(0.92);
}

.hud-btn.active {
  color: #ffd700;
  border-color: #ffd700;
}

.hud-badge {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Barra inferior de control tipo cámara nativa */
.camera-hud-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 140px;
  padding-bottom: 25px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 65%, transparent 100%);
  z-index: 30;
}

.slot-label {
  display: block;
  font-size: 11px;
  color: #aaa;
  margin-top: 6px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-align: center;
}

/* Selector / Visor de Archivos (Miniatura inferior izquierda) */
.gallery-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gallery-thumbnail-btn {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: #222;
  border: 2px solid rgba(255, 255, 255, 0.8);
  padding: 0;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.gallery-thumbnail-btn:active {
  transform: scale(0.92);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 24px;
}

.gallery-count-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #3880ff;
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 10px;
  border: 1px solid #fff;
}

/* Botón Obturador Central */
.shutter-slot {
  display: flex;
  align-items: center;
  justify-content: center;
}

.shutter-button {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: transparent;
  border: 4px solid #fff;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.shutter-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #fff;
  transition: all 0.15s ease;
}

.shutter-button:active .shutter-inner,
.shutter-button.pressed .shutter-inner {
  transform: scale(0.85);
  background: #e0e0e0;
}

/* Botón Voltear Cámara */
.flip-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.flip-button {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.35s ease;
}

.flip-button:active {
  transform: scale(0.9);
}

.flip-button.rotating {
  transform: rotate(180deg);
}

/* MODAL DE LA GALERÍA / ARCHIVOS */
.gallery-modal-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #121214;
  color: #fff;
}

.gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #1a1a1e;
  border-bottom: 1px solid #2a2a30;
}

.gallery-header h2 {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.modal-upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #3880ff;
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.modal-upload-btn:active {
  background: #3171e0;
}

/* Escenario principal de foto */
.preview-stage {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #000;
  overflow: hidden;
}

.stage-image {
  max-width: 100%;
  max-height: calc(100% - 70px);
  border-radius: 12px;
  object-fit: contain;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
}

.stage-actions {
  display: flex;
  gap: 16px;
  margin-top: 16px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 24px;
  font-size: 0.9rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.action-btn:active {
  transform: scale(0.94);
}

.delete-btn {
  background: rgba(235, 68, 90, 0.2);
  color: #eb445a;
  border: 1px solid rgba(235, 68, 90, 0.4);
}

.download-btn {
  background: rgba(45, 211, 111, 0.2);
  color: #2dd36f;
  border: 1px solid rgba(45, 211, 111, 0.4);
}

/* Galería vacía */
.empty-gallery {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px;
  color: #777;
}

.empty-icon {
  font-size: 72px;
  color: #444;
  margin-bottom: 16px;
}

.empty-gallery h3 {
  color: #eee;
  margin-bottom: 8px;
}

.empty-gallery p {
  font-size: 0.95rem;
  margin-bottom: 24px;
}

/* Tira de miniaturas inferior */
.gallery-filmstrip {
  display: flex;
  gap: 12px;
  padding: 14px 20px;
  background: #18181c;
  overflow-x: auto;
  border-top: 1px solid #282830;
}

.filmstrip-item {
  flex: 0 0 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filmstrip-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.filmstrip-item.active {
  border-color: #3880ff;
  transform: scale(1.05);
}

/* Pie de página con firma */
.gallery-footer {
  text-align: center;
  padding: 10px;
  background: #121214;
  border-top: 1px solid #202026;
}

.signature-text {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #888;
  letter-spacing: 0.5px;
}
</style>
