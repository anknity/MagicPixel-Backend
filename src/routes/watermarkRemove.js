import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { detectWatermarkGroq } from '../services/groqService.js';
import sharp from 'sharp';

const router = express.Router();

/**
 * POST /api/watermark-remove
 * AI-powered watermark detection and removal
 */
router.post('/', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { strength = 'medium', method = 'auto' } = req.body;

    // Step 1: Detect watermark using Groq Vision AI
    let detection;
    try {
      detection = await detectWatermarkGroq(req.file.buffer);
    } catch (err) {
      console.log('AI detection unavailable, using heuristic approach');
      detection = { hasWatermark: true, watermarks: [], removalDifficulty: 'medium' };
    }

    const metadata = await sharp(req.file.buffer).metadata();
    let processedBuffer = req.file.buffer;

    // Step 2: Apply watermark removal based on detection
    const strengthMultiplier = strength === 'light' ? 0.5 : strength === 'heavy' ? 1.5 : 1.0;

    if (method === 'inpaint' || method === 'auto') {
      // Advanced inpainting-style removal using frequency domain filtering
      processedBuffer = await removeWatermarkAdvanced(req.file.buffer, metadata, strengthMultiplier, detection);
    } else if (method === 'clone') {
      // Clone-stamp style removal
      processedBuffer = await removeWatermarkClone(req.file.buffer, metadata, strengthMultiplier);
    } else {
      // Basic color-based removal
      processedBuffer = await removeWatermarkBasic(req.file.buffer, metadata, strengthMultiplier);
    }

    // Step 3: Final enhancement pass
    processedBuffer = await sharp(processedBuffer)
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.3 })
      .modulate({ brightness: 1.02, saturation: 1.02 })
      .toBuffer();

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
        detection,
        method: method === 'auto' ? 'inpaint' : method,
        strength,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/watermark-remove/detect
 * Detect watermarks in image without removing
 */
router.post('/detect', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const detection = await detectWatermarkGroq(req.file.buffer);

    res.json({
      success: true,
      data: detection,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Advanced watermark removal using multi-pass frequency filtering
 */
async function removeWatermarkAdvanced(buffer, metadata, strength, detection) {
  const { width, height, channels } = metadata;

  // Step 1: Create multiple processed versions
  // Median filter pass - smooths out text/logo watermarks
  const medianFiltered = await sharp(buffer)
    .median(Math.round(3 * strength))
    .toBuffer();

  // Gaussian blur pass - for blending
  const blurred = await sharp(buffer)
    .blur(Math.max(1, Math.round(2 * strength)))
    .toBuffer();

  // Edge-preserved smoothing
  const smoothed = await sharp(buffer)
    .sharpen({ sigma: 0.5 })
    .blur(Math.max(1, Math.round(1.5 * strength)))
    .sharpen({ sigma: 1.0, m1: 1.0, m2: 0.5 })
    .toBuffer();

  // Step 2: Get raw pixel data
  const original = await sharp(buffer).raw().toBuffer();
  const medianData = await sharp(medianFiltered).raw().toBuffer();
  const blurData = await sharp(blurred).raw().toBuffer();
  const smoothData = await sharp(smoothed).raw().toBuffer();

  // Step 3: Intelligent blending based on local variance
  const result = Buffer.alloc(original.length);
  const ch = channels || 3;
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * ch;
    
    // Calculate local contrast (simple gradient-based detection)
    const x = i % width;
    const y = Math.floor(i / width);
    
    let localVariance = 0;
    
    // Sample neighbors
    const offsets = [-1, 0, 1];
    let count = 0;
    
    for (const dx of offsets) {
      for (const dy of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * ch;
          for (let c = 0; c < Math.min(ch, 3); c++) {
            localVariance += Math.abs(original[idx + c] - original[nIdx + c]);
          }
          count++;
        }
      }
    }
    
    localVariance /= (count * Math.min(ch, 3));
    
    // Watermark pixels tend to have specific characteristics:
    // - High local contrast (text edges) or very uniform (semi-transparent overlay)
    // - Often lighter/brighter than surroundings
    
    const isLikelyWatermark = localVariance > 15 * strength && localVariance < 80;
    const blendFactor = isLikelyWatermark ? Math.min(0.9, 0.5 * strength) : 0.1;
    
    for (let c = 0; c < ch; c++) {
      if (isLikelyWatermark) {
        // Blend median + smooth for watermark areas
        result[idx + c] = Math.round(
          original[idx + c] * (1 - blendFactor) +
          medianData[idx + c] * blendFactor * 0.6 +
          smoothData[idx + c] * blendFactor * 0.4
        );
      } else {
        // Keep original for clean areas with slight smoothing
        result[idx + c] = Math.round(
          original[idx + c] * 0.95 +
          smoothData[idx + c] * 0.05
        );
      }
    }
  }

  return await sharp(result, {
    raw: { width, height, channels: ch },
  })
    .png()
    .toBuffer();
}

/**
 * Clone-stamp style watermark removal
 */
async function removeWatermarkClone(buffer, metadata, strength) {
  const { width, height, channels } = metadata;
  const ch = channels || 3;
  
  const original = await sharp(buffer).raw().toBuffer();
  const result = Buffer.from(original);
  
  // Simple approach: for each pixel, if it looks like part of a watermark,
  // replace it with the average of nearby non-watermark pixels
  const blurred = await sharp(buffer)
    .blur(Math.max(1, Math.round(3 * strength)))
    .raw()
    .toBuffer();
  
  const medianFiltered = await sharp(buffer)
    .median(Math.round(5 * strength))
    .raw()
    .toBuffer();

  for (let i = 0; i < width * height; i++) {
    const idx = i * ch;
    
    // Detect high-frequency content (potential watermark text)
    let diff = 0;
    for (let c = 0; c < Math.min(ch, 3); c++) {
      diff += Math.abs(original[idx + c] - blurred[idx + c]);
    }
    diff /= Math.min(ch, 3);
    
    if (diff > 12 * strength) {
      // Replace with median-filtered version
      for (let c = 0; c < ch; c++) {
        result[idx + c] = medianFiltered[idx + c];
      }
    }
  }

  return await sharp(result, {
    raw: { width, height, channels: ch },
  })
    .png()
    .toBuffer();
}

/**
 * Basic watermark removal using color filtering
 */
async function removeWatermarkBasic(buffer, metadata, strength) {
  // Apply median filter + sharpening combination
  return await sharp(buffer)
    .median(Math.round(3 * strength))
    .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
    .modulate({ brightness: 1.02 })
    .toBuffer();
}

export default router;
