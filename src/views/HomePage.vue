<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar color="light">
        <ion-title class="ion-text-center">📸 Mi Cámara</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showSignature" fill="clear">
            <ion-icon :icon="settingsOutline" color="primary"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding" color="light">
      <div class="welcome-container" v-if="!photoUrl">
        <ion-icon :icon="imageOutline" class="placeholder-icon"></ion-icon>
        <h2>¡Captura un momento!</h2>
        <p>Toma una foto para verla aquí.</p>
      </div>

      <ion-card v-else class="photo-card">
        <img :src="photoUrl" class="main-image" />
        <ion-card-header>
          <ion-card-title>Última Foto</ion-card-title>
        </ion-card-header>
      </ion-card>

      <!-- Botón flotante animado -->
      <ion-fab vertical="bottom" horizontal="center" slot="fixed">
        <ion-fab-button color="primary" @click="takePicture" class="camera-btn">
          <ion-icon :icon="camera"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonFab, IonFabButton, IonIcon, IonCard, IonCardHeader, IonCardTitle,
  IonButtons, IonButton, alertController
} from '@ionic/vue';
import { camera, settingsOutline, imageOutline } from 'ionicons/icons';
import { Camera, CameraResultType } from '@capacitor/camera';

// Usamos ref() en Vue, el equivalente directo a signal() en Angular
const photoUrl = ref<string | undefined>(undefined);

const takePicture = async () => {
  try {
    const result = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
    });

    if (!result.webPath) {
      console.error('No se obtuvo webPath de la foto');
      return;
    }

    photoUrl.value = await webPathToBase64(result.webPath);
  } catch (error) {
    console.log('Cancelado por el usuario o error', error);
  }
};

const webPathToBase64 = async (webPath: string): Promise<string> => {
  const response = await fetch(webPath);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const showSignature = async () => {
  const alert = await alertController.create({
    header: 'Configuración',
    message: 'Hecho por Nicolas Nieto',
    buttons: ['OK'],
    cssClass: 'custom-alert'
  });

  await alert.present();
};
</script>

<style scoped>
.welcome-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80%;
  text-align: center;
  color: #666;
}

.placeholder-icon {
  font-size: 80px;
  color: #ccc;
  margin-bottom: 20px;
}

.photo-card {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  margin-top: 20px;
}

.main-image {
  width: 100%;
  height: auto;
  max-height: 60vh;
  object-fit: cover;
}

.camera-btn {
  margin-bottom: 20px;
  transition: transform 0.2s;
}

.camera-btn:active {
  transform: scale(0.9);
}
</style>
