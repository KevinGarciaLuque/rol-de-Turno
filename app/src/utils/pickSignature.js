import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Elige una imagen o PDF y lo devuelve como data URL (base64), multiplataforma.
// Retorna { dataUrl, name, mimeType } o null si se cancela.
export async function pickSignature() {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;
  if (asset.size && asset.size > MAX_BYTES) {
    throw new Error('El archivo es muy grande (máx. 5 MB).');
  }

  const mime = asset.mimeType || 'application/octet-stream';
  let dataUrl;

  if (Platform.OS === 'web') {
    const file = asset.file || (await (await fetch(asset.uri)).blob());
    dataUrl = await readAsDataUrl(file);
  } else {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    dataUrl = `data:${mime};base64,${b64}`;
  }

  return { dataUrl, name: asset.name, mimeType: mime };
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
