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

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'MagicPixels API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
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

export default router;
