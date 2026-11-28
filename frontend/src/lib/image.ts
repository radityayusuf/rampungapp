/**
 * Siapkan foto profil di browser: potong persegi di tengah, kecilkan ke 256×256, simpan sebagai JPEG.
 * Foto ponsel 5–10 MB jadi ±20–40 KB, orientasi kamera ikut dibetulkan, dan data EXIF (lokasi dsb.) terbuang.
 */
export const AVATAR_PX = 256;
const MAX_INPUT = 15 * 1024 * 1024;

export class ImageError extends Error {}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Peramban lama tanpa createImageBitmap untuk berkas tertentu.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImageError('Pilih berkas gambar (JPG, PNG, atau WebP).');
  if (file.size > MAX_INPUT) throw new ImageError('Ukuran foto maksimal 15 MB.');
  let img: Awaited<ReturnType<typeof decode>>;
  try {
    img = await decode(file);
  } catch {
    throw new ImageError('Foto tidak bisa dibaca. Gunakan JPG atau PNG (format HEIC dari iPhone belum didukung semua peramban).');
  }
  const side = Math.min(img.width, img.height);
  if (side < 32) throw new ImageError('Foto terlalu kecil. Gunakan foto minimal 32×32 piksel.');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Peramban tidak bisa mengolah foto.');
  ctx.fillStyle = '#fff'; // PNG transparan → latar putih
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  if ('close' in img && typeof img.close === 'function') img.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88));
  if (!blob) throw new ImageError('Peramban tidak bisa mengolah foto.');
  return blob;
}
