import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { resizeImage } from '../services/imageService.js';

const router = express.Router();

/**
 * POST /api/resize
 * Resize an uploaded image
 */
router.post('/', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { width, height, fit = 'cover', format = 'png', quality = 90 } = req.body;

    if (!width && !height) {
      return res.status(400).json({
        success: false,
        error: 'At least width or height is required',
      });
    }

    // Resize image
    const resizedBuffer = await resizeImage(req.file.buffer, {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      fit,
      format,
      quality: parseInt(quality),
    });

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(resizedBuffer, {
      format,
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
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/resize/batch
 * Resize image to multiple sizes
 */
router.post('/batch', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { sizes, format = 'png', quality = 90 } = req.body;

    if (!sizes || !Array.isArray(sizes)) {
      return res.status(400).json({
        success: false,
        error: 'Sizes array is required',
      });
    }

    const results = await Promise.all(
      sizes.map(async (size) => {
        const resizedBuffer = await resizeImage(req.file.buffer, {
          width: size.width,
          height: size.height,
          fit: size.fit || 'cover',
          format,
          quality: parseInt(quality),
        });

        const cloudinaryResult = await uploadBufferToCloudinary(resizedBuffer, {
          format,
        });

        return {
          name: size.name || `${size.width}x${size.height}`,
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
 * POST /api/resize/presets
 * Resize to common preset sizes
 */
router.post('/presets', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { preset = 'social', format = 'png', quality = 90 } = req.body;

    const presets = {
      social: [
        { name: 'instagram-square', width: 1080, height: 1080 },
        { name: 'instagram-portrait', width: 1080, height: 1350 },
        { name: 'instagram-story', width: 1080, height: 1920 },
        { name: 'facebook-post', width: 1200, height: 630 },
        { name: 'twitter-post', width: 1200, height: 675 },
        { name: 'linkedin-post', width: 1200, height: 627 },
      ],
      web: [
        { name: 'thumbnail', width: 150, height: 150 },
        { name: 'small', width: 320, height: 240 },
        { name: 'medium', width: 640, height: 480 },
        { name: 'large', width: 1280, height: 960 },
        { name: 'full-hd', width: 1920, height: 1080 },
      ],
      icons: [
        { name: '16x16', width: 16, height: 16 },
        { name: '32x32', width: 32, height: 32 },
        { name: '48x48', width: 48, height: 48 },
        { name: '64x64', width: 64, height: 64 },
        { name: '128x128', width: 128, height: 128 },
        { name: '256x256', width: 256, height: 256 },
        { name: '512x512', width: 512, height: 512 },
      ],
    };

    const selectedPreset = presets[preset] || presets.social;

    const results = await Promise.all(
      selectedPreset.map(async (size) => {
        const resizedBuffer = await resizeImage(req.file.buffer, {
          width: size.width,
          height: size.height,
          fit: 'cover',
          format,
          quality: parseInt(quality),
        });

        const cloudinaryResult = await uploadBufferToCloudinary(resizedBuffer, {
          format,
        });

        return {
          name: size.name,
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
      preset,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
