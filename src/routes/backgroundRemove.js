import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { removeBackground } from '../services/imageService.js';
import sharp from 'sharp';

const router = express.Router();

/**
 * POST /api/background-remove
 * Advanced background removal with precision controls
 */
router.post('/', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const {
      threshold = 30,
      color = 'auto',
      method = 'auto',
      edgeRefinement = 'true',
      feather = 1,
      precision = 'high', // low, medium, high
    } = req.body;

    // Adjust threshold based on precision level
    const precisionMap = { low: 50, medium: 35, high: 20 };
    const effectiveThreshold = precision ? precisionMap[precision] || parseInt(threshold) : parseInt(threshold);

    // Process image with improved algorithm
    const processedBuffer = await removeBackground(req.file.buffer, {
      threshold: effectiveThreshold,
      color,
      method,
      edgeRefinement: edgeRefinement === 'true' || edgeRefinement === true,
      feather: parseInt(feather),
    });

    // Get processing stats
    const originalMeta = await sharp(req.file.buffer).metadata();
    const processedMeta = await sharp(processedBuffer).metadata();

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
        precision,
        processing: {
          method: method === 'auto' ? 'color-distance' : method,
          threshold: effectiveThreshold,
          edgeRefinement: edgeRefinement === 'true' || edgeRefinement === true,
          feather: parseInt(feather),
        },
        message: 'Background removed with precision algorithm. Adjust threshold and precision for better results.',
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

    const { backgroundColor, gradient, blur: bgBlur } = req.body;
    let processedBuffer;

    // First remove background from the foreground image
    const foregroundBuffer = await removeBackground(imageFile.buffer, {
      threshold: 25,
      edgeRefinement: true,
      feather: 2,
    });

    const metadata = await sharp(foregroundBuffer).metadata();

    if (backgroundFile) {
      // Composite with background image
      let bgBuffer = await sharp(backgroundFile.buffer)
        .resize(metadata.width, metadata.height, { fit: 'cover' })
        .toBuffer();

      // Apply blur to background if requested
      if (bgBlur && parseInt(bgBlur) > 0) {
        bgBuffer = await sharp(bgBuffer)
          .blur(parseInt(bgBlur))
          .toBuffer();
      }

      processedBuffer = await sharp(bgBuffer)
        .composite([{ input: foregroundBuffer, blend: 'over' }])
        .png()
        .toBuffer();
    } else if (gradient) {
      // Create gradient background
      const [color1, color2] = gradient.split(',').map(c => c.trim());
      const svgGradient = `
        <svg width="${metadata.width}" height="${metadata.height}">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:${color1 || '#667eea'};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${color2 || '#764ba2'};stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grad)" />
        </svg>`;

      const bgBuffer = await sharp(Buffer.from(svgGradient))
        .resize(metadata.width, metadata.height)
        .png()
        .toBuffer();

      processedBuffer = await sharp(bgBuffer)
        .composite([{ input: foregroundBuffer, blend: 'over' }])
        .png()
        .toBuffer();
    } else if (backgroundColor) {
      // Solid color background
      let color = { r: 255, g: 255, b: 255 };
      if (backgroundColor.startsWith('#')) {
        const hex = backgroundColor.slice(1);
        color = {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }

      processedBuffer = await sharp(foregroundBuffer)
        .flatten({ background: color })
        .png()
        .toBuffer();
    } else {
      return res.status(400).json({
        success: false,
        error: 'Provide background image, backgroundColor, or gradient (e.g., "#667eea,#764ba2")',
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
 * Make specific color transparent with tolerance
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

    // Parse target color
    const hex = targetColor.replace('#', '');
    const tR = parseInt(hex.slice(0, 2), 16);
    const tG = parseInt(hex.slice(2, 4), 16);
    const tB = parseInt(hex.slice(4, 6), 16);
    const tol = parseInt(tolerance);

    const metadata = await sharp(req.file.buffer).metadata();
    const { width, height } = metadata;

    // Get raw pixel data
    const rawBuffer = await sharp(req.file.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(rawBuffer);

    // Make matching pixels transparent
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

      const dist = Math.sqrt((r - tR) ** 2 + (g - tG) ** 2 + (b - tB) ** 2);

      if (dist < tol) {
        pixels[idx + 3] = 0; // Fully transparent
      } else if (dist < tol * 1.5) {
        // Partial transparency for smooth edges
        pixels[idx + 3] = Math.min(255, Math.floor(((dist - tol) / (tol * 0.5)) * 255));
      }
    }

    const processedBuffer = await sharp(Buffer.from(pixels), {
      raw: { width, height, channels: 4 },
    })
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
        processing: {
          targetColor,
          tolerance: tol,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
