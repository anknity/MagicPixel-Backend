import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { convertFormat, getImageMetadata } from '../services/imageService.js';

const router = express.Router();

/**
 * POST /api/convert
 * Convert image format
 */
router.post('/', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { format = 'png', quality = 90 } = req.body;

    const validFormats = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid format. Supported formats: ${validFormats.join(', ')}`,
      });
    }

    // Get original metadata
    const originalMetadata = await getImageMetadata(req.file.buffer);

    // Convert format
    const convertedBuffer = await convertFormat(req.file.buffer, format, {
      quality: parseInt(quality),
    });

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(convertedBuffer, {
      format: format === 'jpg' ? 'jpeg' : format,
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        originalFormat: originalMetadata.format,
        newFormat: cloudinaryResult.format,
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
 * POST /api/convert/batch
 * Convert multiple images to a format
 */
router.post('/batch', uploadMemory.array('images', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const { format = 'png', quality = 90 } = req.body;

    const results = await Promise.all(
      req.files.map(async (file) => {
        const originalMetadata = await getImageMetadata(file.buffer);
        const convertedBuffer = await convertFormat(file.buffer, format, {
          quality: parseInt(quality),
        });
        const cloudinaryResult = await uploadBufferToCloudinary(convertedBuffer);

        return {
          originalName: file.originalname,
          url: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          originalFormat: originalMetadata.format,
          newFormat: cloudinaryResult.format,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          size: cloudinaryResult.bytes,
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
 * POST /api/convert/multi-format
 * Convert single image to multiple formats
 */
router.post('/multi-format', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { formats = ['png', 'jpeg', 'webp'], quality = 90 } = req.body;

    const results = await Promise.all(
      formats.map(async (format) => {
        const convertedBuffer = await convertFormat(req.file.buffer, format, {
          quality: parseInt(quality),
        });
        const cloudinaryResult = await uploadBufferToCloudinary(convertedBuffer, {
          format: format === 'jpg' ? 'jpeg' : format,
        });

        return {
          format: cloudinaryResult.format,
          url: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          size: cloudinaryResult.bytes,
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
 * GET /api/convert/formats
 * Get list of supported formats
 */
router.get('/formats', (req, res) => {
  res.json({
    success: true,
    data: {
      input: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif', 'tiff', 'bmp', 'svg'],
      output: ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif'],
      recommended: {
        web: 'webp',
        print: 'tiff',
        social: 'jpeg',
        transparent: 'png',
        animation: 'gif',
        modern: 'avif',
      },
    },
  });
});

export default router;
