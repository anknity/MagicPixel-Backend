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
 * Remove background (basic implementation using transparency)
 */
export const removeBackground = async (buffer, options = {}) => {
  const {
    threshold = 30,
    color = 'auto',
    edgeRefinement = true,
    feather = 1,
    method = 'auto', // auto, color, edge, chroma
  } = options;

  const metadata = await sharp(buffer).metadata();
  const { width, height, channels } = metadata;

  // Get raw pixel data with alpha
  const rawBuffer = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const pixels = new Uint8Array(rawBuffer);
  const alphaChannel = new Uint8Array(width * height);

  // Detect background color from corners (sample 5% from each corner)
  const sampleSize = Math.max(5, Math.floor(Math.min(width, height) * 0.05));
  const cornerSamples = [];

  // Sample corners: top-left, top-right, bottom-left, bottom-right
  const corners = [
    [0, 0],
    [width - sampleSize, 0],
    [0, height - sampleSize],
    [width - sampleSize, height - sampleSize],
  ];

  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + sampleSize && y < height; y++) {
      for (let x = cx; x < cx + sampleSize && x < width; x++) {
        const idx = (y * width + x) * 4;
        cornerSamples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
      }
    }
  }

  // Calculate median background color
  const bgR = cornerSamples.map(s => s[0]).sort((a, b) => a - b)[Math.floor(cornerSamples.length / 2)];
  const bgG = cornerSamples.map(s => s[1]).sort((a, b) => a - b)[Math.floor(cornerSamples.length / 2)];
  const bgB = cornerSamples.map(s => s[2]).sort((a, b) => a - b)[Math.floor(cornerSamples.length / 2)];

  const thresh = parseInt(threshold);

  // Color distance-based classification
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

    // Euclidean color distance
    const dist = Math.sqrt(
      (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2
    );

    if (dist < thresh) {
      alphaChannel[i] = 0; // Background
    } else if (dist < thresh * 2) {
      // Transition zone - partial transparency
      alphaChannel[i] = Math.min(255, Math.floor(((dist - thresh) / thresh) * 255));
    } else {
      alphaChannel[i] = 255; // Foreground
    }
  }

  // Edge refinement pass - clean up edges using neighbor analysis
  if (edgeRefinement) {
    const refined = new Uint8Array(alphaChannel);
    const kernelSize = 2;

    for (let y = kernelSize; y < height - kernelSize; y++) {
      for (let x = kernelSize; x < width - kernelSize; x++) {
        const idx = y * width + x;
        let sum = 0;
        let count = 0;

        for (let ky = -kernelSize; ky <= kernelSize; ky++) {
          for (let kx = -kernelSize; kx <= kernelSize; kx++) {
            const nIdx = (y + ky) * width + (x + kx);
            sum += alphaChannel[nIdx];
            count++;
          }
        }

        const avg = sum / count;
        // Sharpen edges: if mostly foreground, push to foreground; if mostly background, push to background
        if (avg > 200) refined[idx] = Math.max(refined[idx], 240);
        else if (avg < 55) refined[idx] = Math.min(refined[idx], 15);
      }
    }

    // Apply feathering for smooth edges
    if (feather > 0) {
      const featherRadius = parseInt(feather);
      for (let y = featherRadius; y < height - featherRadius; y++) {
        for (let x = featherRadius; x < width - featherRadius; x++) {
          const idx = y * width + x;
          if (refined[idx] > 0 && refined[idx] < 255) {
            let sum = 0, count = 0;
            for (let ky = -featherRadius; ky <= featherRadius; ky++) {
              for (let kx = -featherRadius; kx <= featherRadius; kx++) {
                sum += refined[(y + ky) * width + (x + kx)];
                count++;
              }
            }
            refined[idx] = Math.floor(sum / count);
          }
        }
      }
    }

    // Apply refined alpha back to pixel data
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4 + 3] = refined[i];
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4 + 3] = alphaChannel[i];
    }
  }

  return await sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
};

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
