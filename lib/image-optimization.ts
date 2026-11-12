const PROFILE_IMAGE_MAX_BYTES = 250 * 1024;
const COVER_IMAGE_MAX_BYTES = 650 * 1024;
const PORTFOLIO_IMAGE_MAX_BYTES = 450 * 1024;

type ImagePreset = 'profile' | 'cover' | 'portfolio';

const presets: Record<ImagePreset, { maxWidth: number; maxHeight: number; maxBytes: number; quality: number }> = {
  profile: { maxWidth: 512, maxHeight: 512, maxBytes: PROFILE_IMAGE_MAX_BYTES, quality: 0.86 },
  cover: { maxWidth: 1920, maxHeight: 1080, maxBytes: COVER_IMAGE_MAX_BYTES, quality: 0.84 },
  portfolio: { maxWidth: 1600, maxHeight: 1600, maxBytes: PORTFOLIO_IMAGE_MAX_BYTES, quality: 0.84 },
};

function isSupportedImage(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected image could not be read.'));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image could not be optimized.')), 'image/webp', quality);
  });
}

export async function optimizeImage(file: File, preset: ImagePreset) {
  if (!isSupportedImage(file)) throw new Error('Use a JPG, PNG, or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Images must be smaller than 15 MB.');

  const image = await loadImage(file);
  const settings = presets[preset];
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The selected image has invalid dimensions.');

  const scale = Math.min(1, settings.maxWidth / image.naturalWidth, settings.maxHeight / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = settings.quality;
  let blob = await canvasBlob(canvas, quality);
  while (blob.size > settings.maxBytes && quality > 0.58) {
    quality -= 0.06;
    blob = await canvasBlob(canvas, quality);
  }

  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || preset}.webp`, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

export function imagePreview(file: File) {
  return URL.createObjectURL(file);
}
