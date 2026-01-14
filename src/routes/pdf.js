import express from 'express';
import { uploadMemory } from '../middleware/upload.js';
import { uploadBufferToCloudinary } from '../config/cloudinary.js';
import {
  createPdfFromImages,
  mergePdfs,
  splitPdf,
  addWatermark,
  compressPdf,
  getPdfMetadata,
} from '../services/pdfService.js';

const router = express.Router();

/**
 * POST /api/pdf/from-images
 * Create PDF from uploaded images
 */
router.post('/from-images', uploadMemory.array('images', 20), async (req, res, next) => {
  try {
    // Strict validation - ensure files exist and are actual images
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files uploaded. Please select at least one image.',
      });
    }

    // Validate each file is an actual image
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
    const invalidFiles = req.files.filter(file => !validImageTypes.includes(file.mimetype));
    
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid file types detected. Only images (PNG, JPG, GIF, WebP) are allowed. Invalid files: ${invalidFiles.map(f => f.originalname).join(', ')}`,
      });
    }

    // Validate files have actual content
    const emptyFiles = req.files.filter(file => !file.buffer || file.buffer.length === 0);
    if (emptyFiles.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'One or more files are empty or corrupted.',
      });
    }

    const { pageSize = 'A4', margin = 20, fitMode = 'contain' } = req.body;

    const imageBuffers = req.files.map((file) => file.buffer);

    console.log(`Creating PDF from ${imageBuffers.length} images with page size: ${pageSize}`);

    const pdfBuffer = await createPdfFromImages(imageBuffers, {
      pageSize,
      margin: parseInt(margin),
      fitMode,
    });

    // Verify PDF was created successfully
    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate PDF. The output file is empty.',
      });
    }

    console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);

    // Upload to Cloudinary with proper settings for PDF
    const cloudinaryResult = await uploadBufferToCloudinary(pdfBuffer, {
      resource_type: 'raw',
      format: 'pdf',
      public_id: `pdf_${Date.now()}`,
    });

    // Verify upload was successful
    if (!cloudinaryResult || !cloudinaryResult.secure_url) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload PDF to storage.',
      });
    }

    console.log(`PDF uploaded to Cloudinary: ${cloudinaryResult.secure_url}, size: ${cloudinaryResult.bytes} bytes`);

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        size: cloudinaryResult.bytes || pdfBuffer.length,
        pageCount: req.files.length,
        pageSize,
      },
    });
  } catch (error) {
    console.error('PDF creation error:', error);
    next(error);
  }
});

/**
 * POST /api/pdf/from-images-direct
 * Create PDF from images and return as direct download (fallback option)
 */
router.post('/from-images-direct', uploadMemory.array('images', 20), async (req, res, next) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files uploaded. Please select at least one image.',
      });
    }

    const { pageSize = 'A4', margin = 20, fitMode = 'contain' } = req.body;
    const imageBuffers = req.files.map((file) => file.buffer);

    console.log(`Creating PDF (direct download) from ${imageBuffers.length} images`);

    const pdfBuffer = await createPdfFromImages(imageBuffers, {
      pageSize,
      margin: parseInt(margin),
      fitMode,
    });

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate PDF.',
      });
    }

    // Send as direct download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="images-to-pdf-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF direct creation error:', error);
    next(error);
  }
});

/**
 * POST /api/pdf/merge
 * Merge multiple PDFs
 */
router.post('/merge', uploadMemory.array('pdfs', 20), async (req, res, next) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 PDF files are required',
      });
    }

    const pdfBuffers = req.files.map((file) => file.buffer);
    const mergedPdfBuffer = await mergePdfs(pdfBuffers);

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(mergedPdfBuffer, {
      resource_type: 'raw',
      format: 'pdf',
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        size: cloudinaryResult.bytes,
        mergedCount: req.files.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pdf/split
 * Split PDF into individual pages
 */
router.post('/split', uploadMemory.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded',
      });
    }

    const splitPages = await splitPdf(req.file.buffer);

    // Upload each page to Cloudinary
    const results = await Promise.all(
      splitPages.map(async (pageBuffer, index) => {
        const cloudinaryResult = await uploadBufferToCloudinary(pageBuffer, {
          resource_type: 'raw',
          format: 'pdf',
        });

        return {
          page: index + 1,
          url: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          size: cloudinaryResult.bytes,
        };
      })
    );

    res.json({
      success: true,
      data: results,
      totalPages: results.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pdf/watermark
 * Add watermark to PDF
 */
router.post('/watermark', uploadMemory.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded',
      });
    }

    const { text = 'WATERMARK', fontSize = 50, opacity = 0.3, rotation = -45 } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Watermark text is required',
      });
    }

    const watermarkedPdf = await addWatermark(req.file.buffer, text, {
      fontSize: parseInt(fontSize),
      opacity: parseFloat(opacity),
      rotation: parseInt(rotation),
    });

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(watermarkedPdf, {
      resource_type: 'raw',
      format: 'pdf',
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        size: cloudinaryResult.bytes,
        watermarkText: text,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pdf/compress
 * Compress PDF
 */
router.post('/compress', uploadMemory.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded',
      });
    }

    const originalSize = req.file.size;
    const compressedPdf = await compressPdf(req.file.buffer);

    // Upload to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(compressedPdf, {
      resource_type: 'raw',
      format: 'pdf',
    });

    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        originalSize,
        compressedSize: cloudinaryResult.bytes,
        compressionRatio: `${((1 - cloudinaryResult.bytes / originalSize) * 100).toFixed(2)}%`,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pdf/metadata
 * Get PDF metadata
 */
router.post('/metadata', uploadMemory.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded',
      });
    }

    const metadata = await getPdfMetadata(req.file.buffer);

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
