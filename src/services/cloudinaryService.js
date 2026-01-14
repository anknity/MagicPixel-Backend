import { v2 as cloudinary } from 'cloudinary';
import config from '../config/index.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

// Store for tracking downloads (in production, use Redis or database)
const downloadTracker = new Map();

/**
 * Upload image to Cloudinary with automatic enhancement
 */
export const uploadWithEnhancement = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'magicpixels',
      resource_type: 'image',
      // Always apply quality enhancement
      transformation: [
        { quality: 'auto:best' },
        { fetch_format: 'auto' },
      ],
      ...options,
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) reject(new Error(`Upload failed: ${error.message}`));
        else {
          // Initialize download tracker for this file
          downloadTracker.set(result.public_id, {
            downloads: 0,
            maxDownloads: 3,
            createdAt: new Date(),
          });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Remove background using Cloudinary AI - outputs transparent PNG
 */
export const removeBackgroundAI = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/bg-removed',
        resource_type: 'image',
        format: 'png', // Force PNG for transparency
        transformation: [
          { effect: 'background_removal' },
          { quality: 'auto:best' },
          { flags: 'preserve_transparency' }, // Ensure transparency is preserved
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Background removal failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Replace background with color or image
 */
export const replaceBackground = async (buffer, backgroundColor, options = {}) => {
  return new Promise((resolve, reject) => {
    const transformations = [
      { effect: 'background_removal' },
      { background: backgroundColor || 'white' },
      { quality: 'auto:best' },
    ];

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/bg-replaced',
        resource_type: 'image',
        transformation: transformations,
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Background replacement failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * AI Enhance - Improve image quality automatically
 */
export const aiEnhance = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/enhanced',
        resource_type: 'image',
        transformation: [
          { effect: 'enhance' },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Enhancement failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Upscale image using AI
 */
export const upscaleImage = async (buffer, scale = 2, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/upscaled',
        resource_type: 'image',
        transformation: [
          { effect: `upscale` },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Upscale failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Generative Fill - Extend image with AI-generated content
 */
export const generativeFill = async (buffer, options = {}) => {
  const { width, height, gravity = 'center' } = options;
  
  return new Promise((resolve, reject) => {
    const transformations = [
      { 
        width, 
        height, 
        crop: 'pad',
        gravity,
        background: 'gen_fill' 
      },
      { quality: 'auto:best' },
    ];

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/gen-fill',
        resource_type: 'image',
        transformation: transformations,
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Generative fill failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Generative Remove - Remove objects from image
 */
export const generativeRemove = async (buffer, prompt, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/gen-remove',
        resource_type: 'image',
        transformation: [
          { effect: `gen_remove:prompt_${prompt.replace(/\s+/g, '_')}` },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Generative remove failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Generative Recolor - Recolor objects in image
 */
export const generativeRecolor = async (buffer, prompt, toColor, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/gen-recolor',
        resource_type: 'image',
        transformation: [
          { effect: `gen_recolor:prompt_${prompt.replace(/\s+/g, '_')};to-color_${toColor}` },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Generative recolor failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Apply artistic filters
 */
export const applyArtisticFilter = async (buffer, filter, options = {}) => {
  const filters = {
    'al_dente': 'al_dente',
    'athena': 'athena',
    'audrey': 'audrey',
    'aurora': 'aurora',
    'daguerre': 'daguerre',
    'eucalyptus': 'eucalyptus',
    'fes': 'fes',
    'frost': 'frost',
    'hairspray': 'hairspray',
    'hokusai': 'hokusai',
    'incognito': 'incognito',
    'linen': 'linen',
    'peacock': 'peacock',
    'primavera': 'primavera',
    'quartz': 'quartz',
    'red_rock': 'red_rock',
    'refresh': 'refresh',
    'sizzle': 'sizzle',
    'sonnet': 'sonnet',
    'ukulele': 'ukulele',
    'zorro': 'zorro',
  };

  const filterEffect = filters[filter] || 'athena';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/artistic',
        resource_type: 'image',
        transformation: [
          { effect: `art:${filterEffect}` },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Filter failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Smart crop with face/object detection
 */
export const smartCrop = async (buffer, options = {}) => {
  const { width, height, gravity = 'auto' } = options;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/smart-crop',
        resource_type: 'image',
        transformation: [
          { 
            width, 
            height, 
            crop: 'fill',
            gravity,
          },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Smart crop failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Face blur for privacy
 */
export const blurFaces = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/face-blur',
        resource_type: 'image',
        transformation: [
          { effect: 'blur_faces:500' },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Face blur failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Pixelate faces for privacy
 */
export const pixelateFaces = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/face-pixelate',
        resource_type: 'image',
        transformation: [
          { effect: 'pixelate_faces:15' },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Face pixelate failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Color adjustments
 */
export const adjustColors = async (buffer, adjustments = {}, options = {}) => {
  const { brightness, contrast, saturation, hue, gamma } = adjustments;
  const transformations = [];

  if (brightness) transformations.push({ effect: `brightness:${brightness}` });
  if (contrast) transformations.push({ effect: `contrast:${contrast}` });
  if (saturation) transformations.push({ effect: `saturation:${saturation}` });
  if (hue) transformations.push({ effect: `hue:${hue}` });
  if (gamma) transformations.push({ effect: `gamma:${gamma}` });
  
  transformations.push({ quality: 'auto:best' });

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/color-adjusted',
        resource_type: 'image',
        transformation: transformations,
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Color adjustment failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Auto-improve image (auto color, brightness, contrast)
 */
export const autoImprove = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels/auto-improved',
        resource_type: 'image',
        transformation: [
          { effect: 'improve' },
          { quality: 'auto:best' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) reject(new Error(`Auto improve failed: ${error.message}`));
        else {
          downloadTracker.set(result.public_id, { downloads: 0, maxDownloads: 3, createdAt: new Date() });
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Track download and check if allowed
 */
export const trackDownload = async (publicId) => {
  const tracker = downloadTracker.get(publicId);
  
  if (!tracker) {
    return { allowed: false, error: 'File not found or already deleted', remaining: 0 };
  }

  if (tracker.downloads >= tracker.maxDownloads) {
    // Delete the file from Cloudinary
    await deleteFile(publicId);
    downloadTracker.delete(publicId);
    return { allowed: false, error: 'Download limit reached. File has been deleted.', remaining: 0 };
  }

  tracker.downloads++;
  const remaining = tracker.maxDownloads - tracker.downloads;
  
  // If this was the last download, schedule deletion
  if (tracker.downloads >= tracker.maxDownloads) {
    setTimeout(async () => {
      try {
        await deleteFile(publicId);
        downloadTracker.delete(publicId);
      } catch (e) {
        console.error('Auto-delete failed:', e);
      }
    }, 5000); // Delete after 5 seconds
  }

  return { allowed: true, remaining, downloads: tracker.downloads };
};

/**
 * Get download status
 */
export const getDownloadStatus = (publicId) => {
  const tracker = downloadTracker.get(publicId);
  if (!tracker) {
    return { exists: false, downloads: 0, remaining: 0 };
  }
  return {
    exists: true,
    downloads: tracker.downloads,
    remaining: tracker.maxDownloads - tracker.downloads,
    maxDownloads: tracker.maxDownloads,
  };
};

/**
 * Delete file from Cloudinary
 */
export const deleteFile = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    downloadTracker.delete(publicId);
    return result;
  } catch (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
};

/**
 * Get optimized download URL
 */
export const getDownloadUrl = (publicId, options = {}) => {
  const { format = 'png', quality = 'auto:best' } = options;
  
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [
      { quality },
      { fetch_format: format },
    ],
    flags: 'attachment',
  });
};

/**
 * List available artistic filters
 */
export const getArtisticFilters = () => {
  return [
    { id: 'al_dente', name: 'Al Dente', category: 'Warm' },
    { id: 'athena', name: 'Athena', category: 'Classic' },
    { id: 'audrey', name: 'Audrey', category: 'Vintage' },
    { id: 'aurora', name: 'Aurora', category: 'Colorful' },
    { id: 'daguerre', name: 'Daguerre', category: 'Vintage' },
    { id: 'eucalyptus', name: 'Eucalyptus', category: 'Nature' },
    { id: 'fes', name: 'Fes', category: 'Warm' },
    { id: 'frost', name: 'Frost', category: 'Cool' },
    { id: 'hairspray', name: 'Hairspray', category: 'Retro' },
    { id: 'hokusai', name: 'Hokusai', category: 'Artistic' },
    { id: 'incognito', name: 'Incognito', category: 'Dark' },
    { id: 'linen', name: 'Linen', category: 'Soft' },
    { id: 'peacock', name: 'Peacock', category: 'Colorful' },
    { id: 'primavera', name: 'Primavera', category: 'Fresh' },
    { id: 'quartz', name: 'Quartz', category: 'Crystal' },
    { id: 'red_rock', name: 'Red Rock', category: 'Warm' },
    { id: 'refresh', name: 'Refresh', category: 'Clean' },
    { id: 'sizzle', name: 'Sizzle', category: 'Vibrant' },
    { id: 'sonnet', name: 'Sonnet', category: 'Romantic' },
    { id: 'ukulele', name: 'Ukulele', category: 'Tropical' },
    { id: 'zorro', name: 'Zorro', category: 'Dramatic' },
  ];
};

export default {
  uploadWithEnhancement,
  removeBackgroundAI,
  replaceBackground,
  aiEnhance,
  upscaleImage,
  generativeFill,
  generativeRemove,
  generativeRecolor,
  applyArtisticFilter,
  smartCrop,
  blurFaces,
  pixelateFaces,
  adjustColors,
  autoImprove,
  trackDownload,
  getDownloadStatus,
  deleteFile,
  getDownloadUrl,
  getArtisticFilters,
};
