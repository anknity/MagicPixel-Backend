import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

/**
 * Create PDF from images
 */
export const createPdfFromImages = async (imageBuffers, options = {}) => {
  const {
    pageSize = 'A4',
    margin = 20,
    fitMode = 'contain',
  } = options;

  // Validate input
  if (!imageBuffers || !Array.isArray(imageBuffers) || imageBuffers.length === 0) {
    throw new Error('No images provided to create PDF');
  }

  console.log(`Creating PDF with ${imageBuffers.length} images, page size: ${pageSize}`);

  const pdfDoc = await PDFDocument.create();
  
  // Page dimensions
  const pageSizes = {
    A4: { width: 595, height: 842 },
    Letter: { width: 612, height: 792 },
    Legal: { width: 612, height: 1008 },
    A3: { width: 842, height: 1191 },
    A5: { width: 420, height: 595 },
  };
  
  const { width: pageWidth, height: pageHeight } = pageSizes[pageSize] || pageSizes.A4;
  let successfulPages = 0;
  
  for (let i = 0; i < imageBuffers.length; i++) {
    const imageBuffer = imageBuffers[i];
    
    try {
      // Validate buffer
      if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        console.error(`Image ${i + 1}: Invalid or empty buffer`);
        continue;
      }

      console.log(`Processing image ${i + 1}/${imageBuffers.length}, buffer size: ${imageBuffer.length} bytes`);
      
      // Get image metadata to determine format
      const metadata = await sharp(imageBuffer).metadata();
      console.log(`Image ${i + 1} format: ${metadata.format}, dimensions: ${metadata.width}x${metadata.height}`);
      
      let image;
      
      // Handle different image formats properly
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        // For JPEG, convert to proper JPEG buffer and embed as JPEG
        const jpegBuffer = await sharp(imageBuffer)
          .jpeg({ quality: 95 })
          .toBuffer();
        console.log(`Image ${i + 1}: Converted to JPEG, size: ${jpegBuffer.length} bytes`);
        image = await pdfDoc.embedJpg(jpegBuffer);
      } else {
        // For PNG, GIF, WebP, etc., convert to PNG and embed
        const pngBuffer = await sharp(imageBuffer)
          .png()
          .flatten({ background: { r: 255, g: 255, b: 255 } }) // Add white background for transparency
          .toBuffer();
        console.log(`Image ${i + 1}: Converted to PNG, size: ${pngBuffer.length} bytes`);
        image = await pdfDoc.embedPng(pngBuffer);
      }
    
      // Calculate dimensions
      const availableWidth = pageWidth - (margin * 2);
      const availableHeight = pageHeight - (margin * 2);
      
      let imgWidth = image.width;
      let imgHeight = image.height;
      
      if (fitMode === 'contain') {
        const scale = Math.min(
          availableWidth / imgWidth,
          availableHeight / imgHeight
        );
        imgWidth *= scale;
        imgHeight *= scale;
      } else if (fitMode === 'cover') {
        const scale = Math.max(
          availableWidth / imgWidth,
          availableHeight / imgHeight
        );
        imgWidth *= scale;
        imgHeight *= scale;
      }
      
      // Add page and draw image
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      
      page.drawImage(image, {
        x,
        y,
        width: imgWidth,
        height: imgHeight,
      });
      
      successfulPages++;
      console.log(`Image ${i + 1}: Successfully added to PDF`);
    } catch (err) {
      console.error(`Error processing image ${i + 1}: ${err.message}`);
      // Continue with other images instead of failing completely
    }
  }
  
  if (successfulPages === 0) {
    throw new Error('Failed to process any images for PDF creation');
  }
  
  console.log(`PDF created with ${successfulPages} pages`);
  
  const pdfBytes = await pdfDoc.save();
  console.log(`PDF saved, total size: ${pdfBytes.length} bytes`);
  
  // Convert Uint8Array to Buffer for proper handling
  return Buffer.from(pdfBytes);
};

/**
 * Extract images from PDF
 */
export const extractImagesFromPdf = async (pdfBuffer) => {
  // Note: This is a simplified implementation
  // Full image extraction requires more complex PDF parsing
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  
  const images = [];
  
  // For now, we'll render each page as an image
  // This requires additional libraries like pdf2pic for full implementation
  
  return {
    pageCount: pages.length,
    message: 'PDF loaded successfully. Use specific page rendering for image extraction.',
  };
};

/**
 * Merge multiple PDFs
 */
export const mergePdfs = async (pdfBuffers) => {
  const mergedPdf = await PDFDocument.create();
  
  for (const pdfBuffer of pdfBuffers) {
    const pdf = await PDFDocument.load(pdfBuffer);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }
  
  return await mergedPdf.save();
};

/**
 * Split PDF into separate pages
 */
export const splitPdf = async (pdfBuffer) => {
  const pdf = await PDFDocument.load(pdfBuffer);
  const pageCount = pdf.getPageCount();
  const splitPdfs = [];
  
  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdf, [i]);
    newPdf.addPage(page);
    splitPdfs.push(await newPdf.save());
  }
  
  return splitPdfs;
};

/**
 * Add watermark to PDF
 */
export const addWatermark = async (pdfBuffer, watermarkText, options = {}) => {
  const {
    fontSize = 50,
    opacity = 0.3,
    color = { r: 0.5, g: 0.5, b: 0.5 },
    rotation = -45,
  } = options;
  
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
    
    page.drawText(watermarkText, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity,
      rotate: { type: 'degrees', angle: rotation },
    });
  }
  
  return await pdfDoc.save();
};

/**
 * Compress PDF
 */
export const compressPdf = async (pdfBuffer) => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  return await pdfDoc.save({
    useObjectStreams: true,
  });
};

/**
 * Get PDF metadata
 */
export const getPdfMetadata = async (pdfBuffer) => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  return {
    title: pdfDoc.getTitle(),
    author: pdfDoc.getAuthor(),
    subject: pdfDoc.getSubject(),
    creator: pdfDoc.getCreator(),
    producer: pdfDoc.getProducer(),
    creationDate: pdfDoc.getCreationDate(),
    modificationDate: pdfDoc.getModificationDate(),
    pageCount: pdfDoc.getPageCount(),
  };
};

export default {
  createPdfFromImages,
  extractImagesFromPdf,
  mergePdfs,
  splitPdf,
  addWatermark,
  compressPdf,
  getPdfMetadata,
};
