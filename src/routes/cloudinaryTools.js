import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import {
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
  getDownloadUrl,
  getArtisticFilters,
} from '../services/cloudinaryService.js';

const router = express.Router();

/**
 * POST /api/cloudinary/bg-remove
 * Remove background using Cloudinary AI
 */
router.post('/bg-remove', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await removeBackgroundAI(req.file.buffer);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/bg-replace
 * Replace background with color
 */
router.post('/bg-replace', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { backgroundColor = 'white' } = req.body;
    const result = await replaceBackground(req.file.buffer, backgroundColor);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/enhance
 * AI enhance image
 */
router.post('/enhance', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await aiEnhance(req.file.buffer);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/upscale
 * Upscale image using AI
 */
router.post('/upscale', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await upscaleImage(req.file.buffer);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/gen-fill
 * Generative fill - extend image
 */
router.post('/gen-fill', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { width, height, gravity = 'center' } = req.body;
    
    if (!width || !height) {
      return res.status(400).json({ success: false, error: 'Width and height are required' });
    }

    const result = await generativeFill(req.file.buffer, {
      width: parseInt(width),
      height: parseInt(height),
      gravity,
    });
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/gen-remove
 * Generative remove - remove objects by prompt
 */
router.post('/gen-remove', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    const result = await generativeRemove(req.file.buffer, prompt);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/gen-recolor
 * Generative recolor - change color of objects
 */
router.post('/gen-recolor', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { prompt, toColor } = req.body;
    
    if (!prompt || !toColor) {
      return res.status(400).json({ success: false, error: 'Prompt and toColor are required' });
    }

    const result = await generativeRecolor(req.file.buffer, prompt, toColor);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/artistic-filter
 * Apply artistic filter
 */
router.post('/artistic-filter', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { filter = 'athena' } = req.body;
    const result = await applyArtisticFilter(req.file.buffer, filter);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        filter,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/cloudinary/filters
 * Get available artistic filters
 */
router.get('/filters', (req, res) => {
  res.json({
    success: true,
    data: getArtisticFilters(),
  });
});

/**
 * POST /api/cloudinary/smart-crop
 * Smart crop with auto-detection
 */
router.post('/smart-crop', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { width, height, gravity = 'auto' } = req.body;
    
    if (!width || !height) {
      return res.status(400).json({ success: false, error: 'Width and height are required' });
    }

    const result = await smartCrop(req.file.buffer, {
      width: parseInt(width),
      height: parseInt(height),
      gravity,
    });
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/blur-faces
 * Blur faces for privacy
 */
router.post('/blur-faces', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await blurFaces(req.file.buffer);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/pixelate-faces
 * Pixelate faces for privacy
 */
router.post('/pixelate-faces', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await pixelateFaces(req.file.buffer);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/adjust-colors
 * Adjust image colors
 */
router.post('/adjust-colors', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { brightness, contrast, saturation, hue, gamma } = req.body;
    
    const result = await adjustColors(req.file.buffer, {
      brightness: brightness ? parseInt(brightness) : undefined,
      contrast: contrast ? parseInt(contrast) : undefined,
      saturation: saturation ? parseInt(saturation) : undefined,
      hue: hue ? parseInt(hue) : undefined,
      gamma: gamma ? parseInt(gamma) : undefined,
    });
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/auto-improve
 * Auto improve image quality
 */
router.post('/auto-improve', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await autoImprove(req.file.buffer);
    const status = getDownloadStatus(result.public_id);

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        downloads: status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/cloudinary/download
 * Track download and get download URL
 */
router.post('/download', async (req, res, next) => {
  try {
    const { publicId, format = 'png' } = req.body;

    if (!publicId) {
      return res.status(400).json({ success: false, error: 'Public ID is required' });
    }

    const downloadResult = await trackDownload(publicId);

    if (!downloadResult.allowed) {
      return res.status(403).json({
        success: false,
        error: downloadResult.error,
        remaining: downloadResult.remaining,
      });
    }

    const downloadUrl = getDownloadUrl(publicId, { format });

    res.json({
      success: true,
      data: {
        downloadUrl,
        remaining: downloadResult.remaining,
        downloads: downloadResult.downloads,
        message: downloadResult.remaining === 0 
          ? 'This was your last download. File will be deleted.' 
          : `${downloadResult.remaining} downloads remaining`,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/cloudinary/status/:publicId
 * Get download status for a file
 */
router.get('/status/:publicId', (req, res) => {
  const { publicId } = req.params;
  const status = getDownloadStatus(decodeURIComponent(publicId));

  res.json({
    success: true,
    data: status,
  });
});

export default router;
