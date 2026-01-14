import express from 'express';
import { uploadMemory, cleanupFile } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { getImageMetadata } from '../services/imageService.js';

const router = express.Router();

/**
 * POST /api/upload
 * Upload single image
 */
router.post('/', uploadLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    // Get metadata
    const metadata = await getImageMetadata(req.file.buffer);

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, {
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        format: cloudinaryResult.format,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        originalName: req.file.originalname,
        metadata: {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          space: metadata.space,
          channels: metadata.channels,
          depth: metadata.depth,
          hasAlpha: metadata.hasAlpha,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/upload/multiple
 * Upload multiple images
 */
router.post('/multiple', uploadLimiter, uploadMemory.array('images', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const results = await Promise.all(
      req.files.map(async (file) => {
        const metadata = await getImageMetadata(file.buffer);
        const cloudinaryResult = await uploadBufferToCloudinary(file.buffer);

        return {
          url: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          format: cloudinaryResult.format,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          size: cloudinaryResult.bytes,
          originalName: file.originalname,
          metadata,
        };
      })
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/upload/base64
 * Upload image from base64 string
 */
router.post('/base64', uploadLimiter, async (req, res, next) => {
  try {
    const { image, filename = 'image.png' } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'No image data provided',
      });
    }

    // Remove data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const metadata = await getImageMetadata(buffer);
    const cloudinaryResult = await uploadBufferToCloudinary(buffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        format: cloudinaryResult.format,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        originalName: filename,
        metadata,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
