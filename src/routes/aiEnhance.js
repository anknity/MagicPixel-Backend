import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { enhanceImage } from '../services/imageService.js';
import { getEnhancementSuggestions, generateAltText, detectObjects } from '../services/aiService.js';

const router = express.Router();

/**
 * POST /api/ai-enhance
 * AI-powered image enhancement with suggestions
 */
router.post('/', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { autoApply = false } = req.body;

    // Get AI suggestions
    const suggestions = await getEnhancementSuggestions(req.file.buffer);

    let processedBuffer = req.file.buffer;
    let appliedEnhancements = [];

    // Auto-apply suggestions if requested
    if (autoApply && suggestions.brightness !== 'none') {
      const enhanceOptions = {};

      if (suggestions.brightness === 'increase') {
        enhanceOptions.brightness = 1.15;
        appliedEnhancements.push('brightness increased');
      } else if (suggestions.brightness === 'decrease') {
        enhanceOptions.brightness = 0.9;
        appliedEnhancements.push('brightness decreased');
      }

      if (suggestions.contrast === 'increase') {
        enhanceOptions.contrast = 1.2;
        appliedEnhancements.push('contrast increased');
      } else if (suggestions.contrast === 'decrease') {
        enhanceOptions.contrast = 0.9;
        appliedEnhancements.push('contrast decreased');
      }

      if (suggestions.saturation === 'increase') {
        enhanceOptions.saturation = 1.2;
        appliedEnhancements.push('saturation increased');
      } else if (suggestions.saturation === 'decrease') {
        enhanceOptions.saturation = 0.9;
        appliedEnhancements.push('saturation decreased');
      }

      if (suggestions.sharpness === 'increase') {
        enhanceOptions.sharpen = true;
        appliedEnhancements.push('sharpened');
      }

      if (Object.keys(enhanceOptions).length > 0) {
        processedBuffer = await enhanceImage(req.file.buffer, enhanceOptions);
      }
    }

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(processedBuffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        aiSuggestions: suggestions,
        appliedEnhancements,
        autoApplied: autoApply,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-enhance/manual
 * Apply manual enhancements with AI guidance
 */
router.post('/manual', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const {
      brightness = 1,
      contrast = 1,
      saturation = 1,
      sharpen = false,
      blur = 0,
    } = req.body;

    // Apply enhancements
    const processedBuffer = await enhanceImage(req.file.buffer, {
      brightness: parseFloat(brightness),
      contrast: parseFloat(contrast),
      saturation: parseFloat(saturation),
      sharpen: sharpen === 'true' || sharpen === true,
      blur: parseFloat(blur),
    });

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(processedBuffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        appliedSettings: {
          brightness: parseFloat(brightness),
          contrast: parseFloat(contrast),
          saturation: parseFloat(saturation),
          sharpen: sharpen === 'true' || sharpen === true,
          blur: parseFloat(blur),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-enhance/alt-text
 * Generate accessible alt text for image
 */
router.post('/alt-text', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const altText = await generateAltText(req.file.buffer);

    res.json({
      success: true,
      data: {
        altText,
        characterCount: altText.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-enhance/detect
 * Detect objects in image
 */
router.post('/detect', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const detection = await detectObjects(req.file.buffer);

    res.json({
      success: true,
      data: detection,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
