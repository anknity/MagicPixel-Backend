import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { compressImage, getImageMetadata } from '../services/imageService.js';

const router = express.Router();

/**
 * POST /api/compress
 * Compress an uploaded image
 */
router.post('/', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { quality = 80, format } = req.body;

    // Get original metadata
    const originalMetadata = await getImageMetadata(req.file.buffer);
    const originalSize = req.file.size;

    // Compress image
    const compressedBuffer = await compressImage(req.file.buffer, {
      quality: parseInt(quality),
      format,
    });

    // Get compressed metadata
    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(compressedBuffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        format: cloudinaryResult.format,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        originalSize,
        compressedSize: cloudinaryResult.bytes,
        compressionRatio: `${compressionRatio}%`,
        quality: parseInt(quality),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/compress/auto
 * Auto-compress to target file size
 */
router.post('/auto', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { targetSize = 500000, format } = req.body; // Default 500KB
    const targetBytes = parseInt(targetSize);
    const originalSize = req.file.size;

    let quality = 90;
    let compressedBuffer = req.file.buffer;
    let attempts = 0;
    const maxAttempts = 10;

    // Iteratively reduce quality until target size is reached
    while (compressedBuffer.length > targetBytes && quality > 10 && attempts < maxAttempts) {
      compressedBuffer = await compressImage(req.file.buffer, {
        quality,
        format,
      });
      quality -= 10;
      attempts++;
    }

    const compressionRatio = ((1 - compressedBuffer.length / originalSize) * 100).toFixed(2);

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(compressedBuffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        format: cloudinaryResult.format,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        originalSize,
        compressedSize: cloudinaryResult.bytes,
        compressionRatio: `${compressionRatio}%`,
        finalQuality: quality + 10,
        targetSize: targetBytes,
        targetReached: compressedBuffer.length <= targetBytes,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/compress/batch
 * Compress multiple images
 */
router.post('/batch', uploadMemory.array('images', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const { quality = 80, format } = req.body;

    const results = await Promise.all(
      req.files.map(async (file) => {
        const originalSize = file.size;

        const compressedBuffer = await compressImage(file.buffer, {
          quality: parseInt(quality),
          format,
        });

        const cloudinaryResult = await uploadBufferToCloudinary(compressedBuffer);

        return {
          originalName: file.originalname,
          url: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          originalSize,
          compressedSize: cloudinaryResult.bytes,
          compressionRatio: `${((1 - cloudinaryResult.bytes / originalSize) * 100).toFixed(2)}%`,
        };
      })
    );

    const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);

    res.json({
      success: true,
      data: results,
      summary: {
        totalOriginal,
        totalCompressed,
        totalSaved: totalOriginal - totalCompressed,
        overallRatio: `${((1 - totalCompressed / totalOriginal) * 100).toFixed(2)}%`,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
