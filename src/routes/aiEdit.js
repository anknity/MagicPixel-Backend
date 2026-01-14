import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import {
  analyzeImage,
  processImageWithPrompt,
  generateCreativeIdeas,
} from '../services/aiService.js';
import {
  resizeImage,
  enhanceImage,
  cropImage,
  rotateImage,
  flipImage,
  convertFormat,
} from '../services/imageService.js';
import sharp from 'sharp';

const router = express.Router();

/**
 * POST /api/ai-edit
 * AI-powered image editing based on natural language prompt
 */
router.post('/', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required for AI editing',
      });
    }

    // Get AI instructions
    const instructions = await processImageWithPrompt(req.file.buffer, prompt);

    let processedBuffer = req.file.buffer;
    let actionsApplied = [];

    // Apply AI-suggested edits
    if (instructions.action && instructions.parameters) {
      const params = instructions.parameters;

      switch (instructions.action) {
        case 'resize':
          processedBuffer = await resizeImage(processedBuffer, {
            width: params.width,
            height: params.height,
            fit: params.fit || 'cover',
          });
          actionsApplied.push(`Resized to ${params.width}x${params.height}`);
          break;

        case 'crop':
          if (params.aspectRatio) {
            // Calculate crop dimensions based on aspect ratio
            const metadata = await sharp(processedBuffer).metadata();
            const [w, h] = params.aspectRatio.split(':').map(Number);
            const targetRatio = w / h;
            const currentRatio = metadata.width / metadata.height;

            let cropWidth, cropHeight, left, top;

            if (currentRatio > targetRatio) {
              cropHeight = metadata.height;
              cropWidth = Math.round(cropHeight * targetRatio);
              left = Math.round((metadata.width - cropWidth) / 2);
              top = 0;
            } else {
              cropWidth = metadata.width;
              cropHeight = Math.round(cropWidth / targetRatio);
              left = 0;
              top = Math.round((metadata.height - cropHeight) / 2);
            }

            processedBuffer = await cropImage(processedBuffer, {
              left,
              top,
              width: cropWidth,
              height: cropHeight,
            });
            actionsApplied.push(`Cropped to ${params.aspectRatio} aspect ratio`);
          } else if (params.left !== undefined) {
            processedBuffer = await cropImage(processedBuffer, params);
            actionsApplied.push('Applied custom crop');
          }
          break;

        case 'enhance':
          processedBuffer = await enhanceImage(processedBuffer, {
            brightness: params.brightness || 1,
            contrast: params.contrast || 1,
            saturation: params.saturation || 1,
            sharpen: params.sharpen || false,
          });
          actionsApplied.push('Applied enhancements');
          break;

        case 'filter':
          if (params.type === 'grayscale') {
            processedBuffer = await sharp(processedBuffer).grayscale().toBuffer();
            actionsApplied.push('Applied grayscale filter');
          } else if (params.type === 'sepia') {
            processedBuffer = await sharp(processedBuffer)
              .modulate({ saturation: 0.8 })
              .tint({ r: 112, g: 66, b: 20 })
              .toBuffer();
            actionsApplied.push('Applied sepia filter');
          } else if (params.type === 'blur') {
            processedBuffer = await sharp(processedBuffer).blur(5).toBuffer();
            actionsApplied.push('Applied blur filter');
          }
          break;

        case 'transform':
          if (params.rotate) {
            processedBuffer = await rotateImage(processedBuffer, params.rotate);
            actionsApplied.push(`Rotated ${params.rotate} degrees`);
          }
          if (params.flip) {
            processedBuffer = await flipImage(processedBuffer, params.flip);
            actionsApplied.push(`Flipped ${params.flip}ly`);
          }
          break;

        default:
          actionsApplied.push('No specific action applied');
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
        aiInstructions: instructions,
        actionsApplied,
        originalPrompt: prompt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-edit/analyze
 * Analyze image and get detailed description
 */
router.post('/analyze', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { prompt = 'Describe this image in detail, including colors, composition, subjects, and mood.' } = req.body;

    const analysis = await analyzeImage(req.file.buffer, prompt);

    res.json({
      success: true,
      data: {
        analysis,
        prompt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-edit/ideas
 * Generate creative editing ideas for an image
 */
router.post('/ideas', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const ideas = await generateCreativeIdeas(req.file.buffer);

    res.json({
      success: true,
      data: ideas,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai-edit/batch
 * Apply multiple AI edits in sequence
 */
router.post('/batch', aiLimiter, uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { edits } = req.body;

    if (!edits || !Array.isArray(edits)) {
      return res.status(400).json({
        success: false,
        error: 'Edits array is required',
      });
    }

    let processedBuffer = req.file.buffer;
    const appliedEdits = [];

    for (const edit of edits) {
      try {
        switch (edit.type) {
          case 'resize':
            processedBuffer = await resizeImage(processedBuffer, edit.params);
            appliedEdits.push({ type: 'resize', success: true });
            break;
          case 'enhance':
            processedBuffer = await enhanceImage(processedBuffer, edit.params);
            appliedEdits.push({ type: 'enhance', success: true });
            break;
          case 'rotate':
            processedBuffer = await rotateImage(processedBuffer, edit.params.angle);
            appliedEdits.push({ type: 'rotate', success: true });
            break;
          case 'flip':
            processedBuffer = await flipImage(processedBuffer, edit.params.direction);
            appliedEdits.push({ type: 'flip', success: true });
            break;
          case 'convert':
            processedBuffer = await convertFormat(processedBuffer, edit.params.format);
            appliedEdits.push({ type: 'convert', success: true });
            break;
          default:
            appliedEdits.push({ type: edit.type, success: false, error: 'Unknown edit type' });
        }
      } catch (err) {
        appliedEdits.push({ type: edit.type, success: false, error: err.message });
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
        appliedEdits,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
