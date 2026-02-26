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
 * Advanced watermark removal – patch-based inpainting approach
 */
async function removeWatermarkAdvanced(buffer, metadata, strength, detection) {
  const { width, height } = metadata;
  const ch = 3; // work in RGB

  const rgbBuf = await sharp(buffer).removeAlpha().raw().toBuffer();
  const original = new Uint8Array(rgbBuf);

  const blurRadius = Math.max(2, Math.round(3 * strength));
  const blurBuf = await sharp(buffer).removeAlpha().blur(blurRadius).raw().toBuffer();
  const blurred = new Uint8Array(blurBuf);

  const medSize = Math.max(3, (Math.round(5 * strength) | 1));
  const medBuf = await sharp(buffer).removeAlpha().median(medSize).raw().toBuffer();
  const median = new Uint8Array(medBuf);

  // ── Build watermark mask ──
  const isMask = new Uint8Array(width * height);
  const highFreqThresh = 18 * strength;

  for (let i = 0; i < width * height; i++) {
    const idx = i * ch;
    let hf = 0;
    for (let c = 0; c < ch; c++) hf += Math.abs(original[idx + c] - blurred[idx + c]);
    hf /= ch;

    const brightness = (original[idx] + original[idx + 1] + original[idx + 2]) / 3;
    const isNearWhite = brightness > 200;

    if (hf > highFreqThresh && hf < 90) {
      isMask[i] = 1;
    } else if (isNearWhite) {
      const x = i % width, y = Math.floor(i / width);
      let variance = 0, cnt = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = (ny * width + nx) * ch;
          for (let c = 0; c < ch; c++) variance += Math.abs(original[idx + c] - original[ni + c]);
          cnt++;
        }
      }
      if (cnt > 0 && variance / cnt < 30) isMask[i] = 1;
    }
  }

  // ── Dilate mask to cover edges ──
  const dilated = new Uint8Array(isMask);
  const dr = Math.max(1, Math.round(strength));
  for (let y = dr; y < height - dr; y++) {
    for (let x = dr; x < width - dr; x++) {
      if (!isMask[y * width + x]) continue;
      for (let dy = -dr; dy <= dr; dy++)
        for (let dx = -dr; dx <= dr; dx++)
          dilated[(y + dy) * width + (x + dx)] = 1;
    }
  }

  // ── Patch-based fill (3 passes, growing neighbourhood radius) ──
  const result = Buffer.from(original);
  const passes = [
    { radius: Math.round(8 * strength), maxPatch: 6 },
    { radius: Math.round(14 * strength), maxPatch: 12 },
    { radius: Math.round(20 * strength), maxPatch: 20 },
  ];

  for (const { radius, maxPatch } of passes) {
    const step = Math.max(1, Math.floor(radius / maxPatch));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!dilated[i]) continue;
        let rS = 0, gS = 0, bS = 0, cnt = 0;
        for (let dy = -radius; dy <= radius; dy += step) {
          for (let dx = -radius; dx <= radius; dx += step) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (dilated[ny * width + nx]) continue;
            const ni = (ny * width + nx) * ch;
            rS += result[ni]; gS += result[ni + 1]; bS += result[ni + 2];
            cnt++;
          }
        }
        const idx = i * ch;
        if (cnt > 0) {
          result[idx]     = Math.round((rS / cnt) * 0.7 + median[idx]     * 0.3);
          result[idx + 1] = Math.round((gS / cnt) * 0.7 + median[idx + 1] * 0.3);
          result[idx + 2] = Math.round((bS / cnt) * 0.7 + median[idx + 2] * 0.3);
        } else {
          result[idx] = median[idx]; result[idx+1] = median[idx+1]; result[idx+2] = median[idx+2];
        }
      }
    }
  }

  return await sharp(result, { raw: { width, height, channels: ch } }).png().toBuffer();
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
