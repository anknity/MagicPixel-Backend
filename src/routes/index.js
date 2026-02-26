import express from 'express';
import uploadRouter from './upload.js';
import resizeRouter from './resize.js';
import compressRouter from './compress.js';
import convertRouter from './convert.js';
import pdfRouter from './pdf.js';
import backgroundRemoveRouter from './backgroundRemove.js';
import aiEnhanceRouter from './aiEnhance.js';
import aiEditRouter from './aiEdit.js';
import cloudinaryToolsRouter from './cloudinaryTools.js';
import watermarkRemoveRouter from './watermarkRemove.js';
import cropRouter from './crop.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'MagicPixels API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: ['groq-ai', 'watermark-removal', 'crop', 'pdf-tools', 'background-remove', 'ai-enhance'],
  });
});

// Mount routes
router.use('/upload', uploadRouter);
router.use('/resize', resizeRouter);
router.use('/compress', compressRouter);
router.use('/convert', convertRouter);
router.use('/pdf', pdfRouter);
router.use('/background-remove', backgroundRemoveRouter);
router.use('/ai-enhance', aiEnhanceRouter);
router.use('/ai-edit', aiEditRouter);
router.use('/cloudinary', cloudinaryToolsRouter);
router.use('/watermark-remove', watermarkRemoveRouter);
router.use('/crop', cropRouter);

export default router;
