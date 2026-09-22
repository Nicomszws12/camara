import { ref, onMounted, watch } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

export interface UserPhoto {
  filepath: string;
  webviewPath: string;
  timestamp: number;
}

export function usePhotoGallery() {
  const photos = ref<UserPhoto[]>([]);
  const PHOTO_STORAGE = 'photos_gallery_v2';

  const loadSaved = async () => {
    try {
      const photoList = await Preferences.get({ key: PHOTO_STORAGE });
      const storedItems: { filepath: string; timestamp: number }[] = photoList.value ? JSON.parse(photoList.value) : [];

      const loadedPhotos: UserPhoto[] = [];
      for (const item of storedItems) {
        try {
          const file = await Filesystem.readFile({
            path: item.filepath,
            directory: Directory.Data,
          });
          loadedPhotos.push({
            filepath: item.filepath,
            webviewPath: `data:image/jpeg;base64,${file.data}`,
            timestamp: item.timestamp || Date.now()
          });
        } catch (e) {
          console.warn('Could not read photo file:', item.filepath, e);
        }
      }
      photos.value = loadedPhotos;
    } catch (err) {
      console.error('Error in loadSaved:', err);
    }
  };

  // Guardar imagen Base64 (proveniente de la captura directa en vivo de la cámara o de archivos)
  const saveBase64Image = async (base64Data: string): Promise<UserPhoto> => {
    const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const fileName = `IMG_${Date.now()}.jpeg`;
    const timestamp = Date.now();

    await Filesystem.writeFile({
      path: fileName,
      data: rawBase64,
      directory: Directory.Data,
    });

    const newPhoto: UserPhoto = {
      filepath: fileName,
      webviewPath: base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`,
      timestamp
    };

    photos.value = [newPhoto, ...photos.value];
    return newPhoto;
  };

  // Seleccionar foto desde la galería o explorador de archivos nativo
  const pickFromGallery = async (): Promise<UserPhoto | null> => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        quality: 100,
      });

      if (photo.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const base64 = await convertBlobToBase64(blob) as string;
        return await saveBase64Image(base64);
      }
    } catch (err) {
      console.log('Selección de galería cancelada o error', err);
    }
    return null;
  };

  // Eliminar foto del sistema de archivos y del estado
  const deletePhoto = async (photo: UserPhoto) => {
    photos.value = photos.value.filter(p => p.filepath !== photo.filepath);
    try {
      await Filesystem.deleteFile({
        path: photo.filepath,
        directory: Directory.Data,
      });
    } catch (e) {
      console.warn('Archivo no encontrado para eliminar:', e);
    }
  };

  const convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const cachePhotos = () => {
    Preferences.set({
      key: PHOTO_STORAGE,
      value: JSON.stringify(photos.value.map(p => ({
        filepath: p.filepath,
        timestamp: p.timestamp
      }))),
    });
  };

  watch(photos, cachePhotos, { deep: true });
  onMounted(loadSaved);

  return {
    photos,
    saveBase64Image,
    pickFromGallery,
    deletePhoto,
    loadSaved
  };
}
