import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import { cropImage, getImageMetadata } from '../services/imageService.js';
import sharp from 'sharp';

const router = express.Router();

/**
 * POST /api/crop
 * Crop image with specified coordinates
 */
router.post('/', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { left, top, width, height } = req.body;

    if (!left && !top && !width && !height) {
      return res.status(400).json({
        success: false,
        error: 'Crop coordinates required (left, top, width, height)',
      });
    }

    const metadata = await getImageMetadata(req.file.buffer);

    // Validate crop dimensions
    const cropLeft = Math.max(0, parseInt(left) || 0);
    const cropTop = Math.max(0, parseInt(top) || 0);
    const cropWidth = Math.min(parseInt(width) || metadata.width, metadata.width - cropLeft);
    const cropHeight = Math.min(parseInt(height) || metadata.height, metadata.height - cropTop);

    const croppedBuffer = await cropImage(req.file.buffer, {
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight,
    });

    const cloudinaryResult = await uploadBufferToCloudinary(croppedBuffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        crop: { left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight },
        originalDimensions: { width: metadata.width, height: metadata.height },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/crop/aspect-ratio
 * Crop to specific aspect ratio (centered)
 */
router.post('/aspect-ratio', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { ratio = '1:1', gravity = 'center' } = req.body;

    const metadata = await sharp(req.file.buffer).metadata();
    const [rw, rh] = ratio.split(':').map(Number);
    
    if (!rw || !rh) {
      return res.status(400).json({ success: false, error: 'Invalid aspect ratio format. Use "W:H" (e.g., "16:9")' });
    }

    const targetRatio = rw / rh;
    const currentRatio = metadata.width / metadata.height;

    let cropWidth, cropHeight, left, top;

    if (currentRatio > targetRatio) {
      cropHeight = metadata.height;
      cropWidth = Math.round(cropHeight * targetRatio);
    } else {
      cropWidth = metadata.width;
      cropHeight = Math.round(cropWidth / targetRatio);
    }

    // Calculate position based on gravity
    switch (gravity) {
      case 'top-left':
        left = 0;
        top = 0;
        break;
      case 'top':
      case 'top-center':
        left = Math.round((metadata.width - cropWidth) / 2);
        top = 0;
        break;
      case 'top-right':
        left = metadata.width - cropWidth;
        top = 0;
        break;
      case 'left':
      case 'center-left':
        left = 0;
        top = Math.round((metadata.height - cropHeight) / 2);
        break;
      case 'right':
      case 'center-right':
        left = metadata.width - cropWidth;
        top = Math.round((metadata.height - cropHeight) / 2);
        break;
      case 'bottom-left':
        left = 0;
        top = metadata.height - cropHeight;
        break;
      case 'bottom':
      case 'bottom-center':
        left = Math.round((metadata.width - cropWidth) / 2);
        top = metadata.height - cropHeight;
        break;
      case 'bottom-right':
        left = metadata.width - cropWidth;
        top = metadata.height - cropHeight;
        break;
      default: // center
        left = Math.round((metadata.width - cropWidth) / 2);
        top = Math.round((metadata.height - cropHeight) / 2);
    }

    const croppedBuffer = await cropImage(req.file.buffer, {
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: Math.min(cropWidth, metadata.width),
      height: Math.min(cropHeight, metadata.height),
    });

    const cloudinaryResult = await uploadBufferToCloudinary(croppedBuffer);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        aspectRatio: ratio,
        gravity,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/crop/circle
 * Crop image to circle shape
 */
router.post('/circle', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { size } = req.body;
    const metadata = await sharp(req.file.buffer).metadata();

    // Make square first
    const minDim = Math.min(metadata.width, metadata.height);
    const targetSize = size ? parseInt(size) : minDim;

    const squareBuffer = await sharp(req.file.buffer)
      .resize(targetSize, targetSize, { fit: 'cover' })
      .toBuffer();

    // Create circular mask
    const radius = Math.floor(targetSize / 2);
    const circleSvg = Buffer.from(
      `<svg width="${targetSize}" height="${targetSize}">
        <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
      </svg>`
    );

    const circleBuffer = await sharp(squareBuffer)
      .ensureAlpha()
      .composite([{
        input: circleSvg,
        blend: 'dest-in',
      }])
      .png()
      .toBuffer();

    const cloudinaryResult = await uploadBufferToCloudinary(circleBuffer, { format: 'png' });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        size: cloudinaryResult.bytes,
        shape: 'circle',
        diameter: targetSize,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/crop/freeform
 * Free-form crop with rotation support
 */
router.post('/freeform', uploadMemory.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { left, top, width, height, rotation = 0 } = req.body;

    let processedBuffer = req.file.buffer;

    // Apply rotation first if specified
    if (rotation && rotation !== 0) {
      processedBuffer = await sharp(processedBuffer)
        .rotate(parseFloat(rotation), { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
    }

    // Then crop
    const metadata = await sharp(processedBuffer).metadata();
    const cropLeft = Math.max(0, parseInt(left) || 0);
    const cropTop = Math.max(0, parseInt(top) || 0);
    const cropWidth = Math.min(parseInt(width) || metadata.width, metadata.width - cropLeft);
    const cropHeight = Math.min(parseInt(height) || metadata.height, metadata.height - cropTop);

    processedBuffer = await cropImage(processedBuffer, {
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight,
    });

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
 * GET /api/crop/presets
 * Get preset crop dimensions
 */
router.get('/presets', (req, res) => {
  res.json({
    success: true,
    data: {
      aspectRatios: [
        { name: 'Square', ratio: '1:1', icon: 'square' },
        { name: 'Portrait', ratio: '3:4', icon: 'portrait' },
        { name: 'Landscape', ratio: '4:3', icon: 'landscape' },
        { name: 'Widescreen', ratio: '16:9', icon: 'widescreen' },
        { name: 'Ultrawide', ratio: '21:9', icon: 'ultrawide' },
        { name: 'Story', ratio: '9:16', icon: 'story' },
        { name: 'Classic', ratio: '3:2', icon: 'classic' },
        { name: 'Cinema', ratio: '2.35:1', icon: 'cinema' },
      ],
      socialMedia: [
        { name: 'Instagram Post', ratio: '1:1', width: 1080, height: 1080 },
        { name: 'Instagram Story', ratio: '9:16', width: 1080, height: 1920 },
        { name: 'Facebook Cover', ratio: '820:312', width: 820, height: 312 },
        { name: 'Twitter Header', ratio: '3:1', width: 1500, height: 500 },
        { name: 'YouTube Thumbnail', ratio: '16:9', width: 1280, height: 720 },
        { name: 'LinkedIn Banner', ratio: '4:1', width: 1584, height: 396 },
        { name: 'Pinterest Pin', ratio: '2:3', width: 1000, height: 1500 },
      ],
    },
  });
});

export default router;
