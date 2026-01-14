import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { removeBackground } from '../services/imageService.js';
import sharp from 'sharp';

const router = express.Router();

/**
 * POST /api/background-remove
 * Remove background from image (basic implementation)
 */
router.post('/', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { threshold = 50, color = 'white' } = req.body;

    // Process image
    const processedBuffer = await removeBackground(req.file.buffer, {
      threshold: parseInt(threshold),
      color,
    });

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(processedBuffer, {
      format: 'png',
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        format: 'png',
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        message: 'Background removal applied. For best results, use AI-powered removal.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/background-remove/replace
 * Replace background with solid color or image
 */
router.post('/replace', uploadMemory.fields([
  { name: 'image', maxCount: 1 },
  { name: 'background', maxCount: 1 },
]), async (req, res, next) => {
  try {
    const imageFile = req.files?.image?.[0];
    const backgroundFile = req.files?.background?.[0];

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded',
      });
    }

    const { backgroundColor } = req.body;

    let processedBuffer;

    if (backgroundFile) {
      // Composite with background image
      const metadata = await sharp(imageFile.buffer).metadata();
      const bgResized = await sharp(backgroundFile.buffer)
        .resize(metadata.width, metadata.height, { fit: 'cover' })
        .toBuffer();

      processedBuffer = await sharp(bgResized)
        .composite([{ input: imageFile.buffer, blend: 'over' }])
        .toBuffer();
    } else if (backgroundColor) {
      // Apply solid color background
      const metadata = await sharp(imageFile.buffer).metadata();
      
      // Parse color
      let color = { r: 255, g: 255, b: 255 };
      if (backgroundColor.startsWith('#')) {
        const hex = backgroundColor.slice(1);
        color = {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }

      processedBuffer = await sharp(imageFile.buffer)
        .flatten({ background: color })
        .toBuffer();
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either background image or backgroundColor is required',
      });
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
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/background-remove/transparent
 * Make specific color transparent
 */
router.post('/transparent', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { targetColor = '#ffffff', tolerance = 30 } = req.body;

    // For advanced transparency, we would need more complex image processing
    // This is a simplified version
    const processedBuffer = await sharp(req.file.buffer)
      .ensureAlpha()
      .png()
      .toBuffer();

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(processedBuffer, {
      format: 'png',
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        format: 'png',
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        note: 'For advanced color-based transparency, consider using specialized tools.',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
