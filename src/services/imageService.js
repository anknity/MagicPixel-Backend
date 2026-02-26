import sharp from 'sharp';

/**
 * Resize an image
 */
export const resizeImage = async (buffer, options) => {
  const { width, height, fit = 'cover', format = 'png' } = options;
  
  let sharpInstance = sharp(buffer);
  
  if (width || height) {
    sharpInstance = sharpInstance.resize({
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      fit,
      withoutEnlargement: true,
    });
  }
  
  // Convert format
  sharpInstance = formatImage(sharpInstance, format, options.quality);
  
  return await sharpInstance.toBuffer();
};

/**
 * Compress an image
 */
export const compressImage = async (buffer, options = {}) => {
  const { quality = 80, format } = options;
  
  const metadata = await sharp(buffer).metadata();
  const outputFormat = format || metadata.format || 'jpeg';
  
  let sharpInstance = sharp(buffer);
  sharpInstance = formatImage(sharpInstance, outputFormat, quality);
  
  return await sharpInstance.toBuffer();
};

/**
 * Convert image format
 */
export const convertFormat = async (buffer, targetFormat, options = {}) => {
  const { quality = 90 } = options;
  
  let sharpInstance = sharp(buffer);
  sharpInstance = formatImage(sharpInstance, targetFormat, quality);
  
  return await sharpInstance.toBuffer();
};

/**
 * Remove background - improved with full border scan + multi-color detection
 */
export const removeBackground = async (buffer, options = {}) => {
  const {
    threshold = 30,
    edgeRefinement = true,
    feather = 1,
  } = options;

  const metadata = await sharp(buffer).metadata();
  const { width, height } = metadata;

  // Always work in RGBA
  const rawBuffer = await sharp(buffer).ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(rawBuffer);
  const alphaChannel = new Uint8Array(width * height);

  // ── Step 1: Scan the ENTIRE border to build a robust background palette ──
  const borderSamples = [];
  const borderStep = Math.max(1, Math.floor(Math.min(width, height) / 100)); // up to 100 samples/edge

  // top & bottom rows
  for (let x = 0; x < width; x += borderStep) {
    const topIdx = (0 * width + x) * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    borderSamples.push([pixels[topIdx], pixels[topIdx + 1], pixels[topIdx + 2]]);
    borderSamples.push([pixels[botIdx], pixels[botIdx + 1], pixels[botIdx + 2]]);
  }
  // left & right columns
  for (let y = 0; y < height; y += borderStep) {
    const leftIdx = (y * width + 0) * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    borderSamples.push([pixels[leftIdx], pixels[leftIdx + 1], pixels[leftIdx + 2]]);
    borderSamples.push([pixels[rightIdx], pixels[rightIdx + 1], pixels[rightIdx + 2]]);
  }

  // ── Step 2: Cluster border samples → find up to 3 dominant BG colours ──
  const clusters = buildClusters(borderSamples, 3);

  const thresh = parseInt(threshold);
  const softBand = thresh * 1.5; // transition width

  // ── Step 3: For every pixel find minimum distance to any BG cluster ──
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

    let minDist = Infinity;
    for (const { r: cr, g: cg, b: cb } of clusters) {
      const d = Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2);
      if (d < minDist) minDist = d;
    }

    if (minDist < thresh) {
      alphaChannel[i] = 0;
    } else if (minDist < thresh + softBand) {
      // smooth feather in transition zone
      alphaChannel[i] = Math.round(((minDist - thresh) / softBand) * 255);
    } else {
      alphaChannel[i] = 255;
    }
  }

  // ── Step 4: Morphological clean-up (erode noise, then smooth) ──
  if (edgeRefinement) {
    const refined = new Uint8Array(alphaChannel);
    const k = 2;

    for (let y = k; y < height - k; y++) {
      for (let x = k; x < width - k; x++) {
        const ci = y * width + x;
        let sum = 0, cnt = 0;
        for (let dy = -k; dy <= k; dy++) {
          for (let dx = -k; dx <= k; dx++) {
            sum += alphaChannel[(y + dy) * width + (x + dx)];
            cnt++;
          }
        }
        const avg = sum / cnt;
        if (avg > 210) refined[ci] = Math.max(refined[ci], 245);
        else if (avg < 45) refined[ci] = Math.min(refined[ci], 10);
      }
    }

    // feather pass
    const fr = Math.max(1, parseInt(feather));
    for (let y = fr; y < height - fr; y++) {
      for (let x = fr; x < width - fr; x++) {
        const ci = y * width + x;
        if (refined[ci] > 0 && refined[ci] < 255) {
          let sum = 0, cnt = 0;
          for (let dy = -fr; dy <= fr; dy++) {
            for (let dx = -fr; dx <= fr; dx++) {
              sum += refined[(y + dy) * width + (x + dx)];
              cnt++;
            }
          }
          refined[ci] = Math.round(sum / cnt);
        }
      }
    }

    for (let i = 0; i < width * height; i++) pixels[i * 4 + 3] = refined[i];
  } else {
    for (let i = 0; i < width * height; i++) pixels[i * 4 + 3] = alphaChannel[i];
  }

  return await sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
};

/**
 * Build up to `k` colour clusters from samples using simple k-means (5 iterations)
 */
function buildClusters(samples, k) {
  if (samples.length === 0) return [{ r: 255, g: 255, b: 255 }];

  // Seed centroids evenly from samples
  const step = Math.floor(samples.length / k);
  let centers = Array.from({ length: k }, (_, i) => ({
    r: samples[Math.min(i * step, samples.length - 1)][0],
    g: samples[Math.min(i * step, samples.length - 1)][1],
    b: samples[Math.min(i * step, samples.length - 1)][2],
  }));

  for (let iter = 0; iter < 5; iter++) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const [r, g, b] of samples) {
      let best = 0, bestD = Infinity;
      for (let ci = 0; ci < centers.length; ci++) {
        const d = (r - centers[ci].r) ** 2 + (g - centers[ci].g) ** 2 + (b - centers[ci].b) ** 2;
        if (d < bestD) { bestD = d; best = ci; }
      }
      sums[best].r += r; sums[best].g += g; sums[best].b += b; sums[best].n++;
    }
    centers = sums.map((s, i) =>
      s.n > 0
        ? { r: Math.round(s.r / s.n), g: Math.round(s.g / s.n), b: Math.round(s.b / s.n) }
        : centers[i]
    );
  }
  return centers;
}

/**
 * Get image metadata
 */
export const getImageMetadata = async (buffer) => {
  return await sharp(buffer).metadata();
};

/**
 * Apply image enhancements
 */
export const enhanceImage = async (buffer, options = {}) => {
  const {
    brightness = 1,
    saturation = 1,
    contrast = 1,
    sharpen = false,
    blur = 0,
  } = options;
  
  let sharpInstance = sharp(buffer);
  
  // Apply modulation
  if (brightness !== 1 || saturation !== 1) {
    sharpInstance = sharpInstance.modulate({
      brightness: parseFloat(brightness),
      saturation: parseFloat(saturation),
    });
  }
  
  // Apply contrast using linear
  if (contrast !== 1) {
    const a = parseFloat(contrast);
    const b = 128 * (1 - a);
    sharpInstance = sharpInstance.linear(a, b);
  }
  
  // Apply sharpen
  if (sharpen) {
    sharpInstance = sharpInstance.sharpen();
  }
  
  // Apply blur
  if (blur > 0) {
    sharpInstance = sharpInstance.blur(parseFloat(blur));
  }
  
  return await sharpInstance.toBuffer();
};

/**
 * Crop image
 */
export const cropImage = async (buffer, options) => {
  const { left, top, width, height } = options;
  
  return await sharp(buffer)
    .extract({
      left: parseInt(left),
      top: parseInt(top),
      width: parseInt(width),
      height: parseInt(height),
    })
    .toBuffer();
};

/**
 * Rotate image
 */
export const rotateImage = async (buffer, angle, options = {}) => {
  const { background = { r: 255, g: 255, b: 255, alpha: 0 } } = options;
  
  return await sharp(buffer)
    .rotate(parseInt(angle), { background })
    .toBuffer();
};

/**
 * Flip image
 */
export const flipImage = async (buffer, direction = 'vertical') => {
  let sharpInstance = sharp(buffer);
  
  if (direction === 'vertical') {
    sharpInstance = sharpInstance.flip();
  } else {
    sharpInstance = sharpInstance.flop();
  }
  
  return await sharpInstance.toBuffer();
};

/**
 * Format image with specific format and quality
 */
const formatImage = (sharpInstance, format, quality = 90) => {
  const q = parseInt(quality);
  
  switch (format.toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return sharpInstance.jpeg({ quality: q, mozjpeg: true });
    case 'png':
      return sharpInstance.png({ quality: q, compressionLevel: 9 });
    case 'webp':
      return sharpInstance.webp({ quality: q });
    case 'avif':
      return sharpInstance.avif({ quality: q });
    case 'tiff':
      return sharpInstance.tiff({ quality: q });
    case 'gif':
      return sharpInstance.gif();
    default:
      return sharpInstance.png({ quality: q });
  }
};

export default {
  resizeImage,
  compressImage,
  convertFormat,
  removeBackground,
  getImageMetadata,
  enhanceImage,
  cropImage,
  rotateImage,
  flipImage,
};
