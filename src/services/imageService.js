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
  const { threshold = 50, color = 'white' } = options;
  
  let sharpInstance = sharp(buffer);
  
  // Extract alpha channel or create one
  const metadata = await sharpInstance.metadata();
  
  if (color === 'white') {
    // Remove white background
    sharpInstance = sharpInstance
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .removeAlpha()
      .ensureAlpha();
  }
  
  return await sharpInstance.png().toBuffer();
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
