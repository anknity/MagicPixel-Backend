import { groqVision, groqReason, groqFast } from '../config/groq.js';
import sharp from 'sharp';

/**
 * Parse JSON from AI response safely
 */
const parseJsonResponse = (response) => {
  try {
    let clean = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  } catch {
    return null;
  }
};

/**
 * Analyze image using Groq Vision (ultra-fast)
 */
export const analyzeImageGroq = async (imageBuffer, prompt = 'Describe this image in detail.') => {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    
    // Resize for faster processing if too large
    let processBuffer = imageBuffer;
    if (metadata.width > 1024 || metadata.height > 1024) {
      processBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();
    }
    
    const base64 = processBuffer.toString('base64');
    const mimeType = `image/${metadata.format || 'png'}`;
    
    return await groqVision(base64, prompt, { mimeType });
  } catch (error) {
    console.error('Groq vision analysis failed:', error.message);
    throw error;
  }
};

/**
 * Get AI-powered image editing instructions using Groq (much faster than Gemini)
 */
export const getEditInstructionsGroq = async (imageBuffer, userPrompt) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    
    let processBuffer = imageBuffer;
    if (metadata.width > 1024 || metadata.height > 1024) {
      processBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();
    }
    
    const base64 = processBuffer.toString('base64');
    const mimeType = `image/${metadata.format || 'png'}`;
    
    const prompt = `You are an image editing AI assistant. The user wants: "${userPrompt}"

Analyze this image and provide specific image processing instructions in JSON format:
{
  "action": "resize|crop|enhance|filter|transform",
  "parameters": {
    // action-specific parameters
  },
  "explanation": "Brief explanation"
}

Available actions:
- resize: { "width": number, "height": number, "fit": "cover|contain|fill" }
- crop: { "aspectRatio": "16:9|4:3|1:1|3:2|2:3|9:16" } or { "left": px, "top": px, "width": px, "height": px }
- enhance: { "brightness": 0.5-2.0, "contrast": 0.5-2.0, "saturation": 0.5-2.0, "sharpen": true/false }
- filter: { "type": "grayscale|sepia|blur|vintage|warm|cool|dramatic" }
- transform: { "rotate": degrees, "flip": "horizontal|vertical" }

IMPORTANT: Respond with ONLY the JSON object, no other text.`;

    const response = await groqVision(base64, prompt, { mimeType, maxTokens: 512 });
    const parsed = parseJsonResponse(response);
    
    if (parsed && parsed.action) {
      return parsed;
    }
    
    // Fallback parsing
    return fallbackParsing(userPrompt);
  } catch (error) {
    console.error('Groq edit instructions failed:', error.message);
    return fallbackParsing(userPrompt);
  }
};

/**
 * Detect watermark location and characteristics using Groq Vision
 */
export const detectWatermarkGroq = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    
    let processBuffer = imageBuffer;
    if (metadata.width > 1024 || metadata.height > 1024) {
      processBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();
    }
    
    const base64 = processBuffer.toString('base64');
    const mimeType = `image/${metadata.format || 'png'}`;
    
    const prompt = `Analyze this image for watermarks, logos, or text overlays.

Provide a JSON response:
{
  "hasWatermark": true/false,
  "watermarks": [
    {
      "type": "text|logo|pattern",
      "content": "description of the watermark text/content",
      "position": "center|top-left|top-right|bottom-left|bottom-right|diagonal|tiled",
      "opacity": "low|medium|high",
      "coverage": "small|medium|large|full",
      "color": "approximate color description"
    }
  ],
  "removalDifficulty": "easy|medium|hard",
  "suggestions": ["list of removal approach suggestions"]
}

IMPORTANT: Respond with ONLY the JSON object.`;

    const response = await groqVision(base64, prompt, { mimeType, maxTokens: 1024 });
    const parsed = parseJsonResponse(response);
    
    return parsed || { hasWatermark: false, watermarks: [], removalDifficulty: 'unknown' };
  } catch (error) {
    console.error('Watermark detection failed:', error.message);
    return { hasWatermark: false, watermarks: [], error: error.message };
  }
};

/**
 * Get smart enhancement suggestions using Groq Vision
 */
export const getSmartSuggestionsGroq = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    
    let processBuffer = imageBuffer;
    if (metadata.width > 1024 || metadata.height > 1024) {
      processBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();
    }
    
    const base64 = processBuffer.toString('base64');
    const mimeType = `image/${metadata.format || 'png'}`;
    
    const prompt = `Analyze this image quality and provide enhancement suggestions in JSON:
{
  "quality_score": 1-10,
  "brightness": { "current": "dark|normal|bright", "adjust": -1.0 to 1.0 },
  "contrast": { "current": "low|normal|high", "adjust": -1.0 to 1.0 },
  "saturation": { "current": "desaturated|normal|oversaturated", "adjust": -1.0 to 1.0 },
  "sharpness": { "current": "blurry|normal|sharp", "needsSharpening": true/false },
  "noise": "none|low|medium|high",
  "composition": "good|average|poor",
  "dominant_colors": ["color1", "color2", "color3"],
  "suggested_crops": ["1:1", "16:9"],
  "improvements": ["specific improvement 1", "specific improvement 2"]
}

IMPORTANT: Respond with ONLY the JSON object.`;

    const response = await groqVision(base64, prompt, { mimeType, maxTokens: 1024 });
    return parseJsonResponse(response) || { quality_score: 7, improvements: ['General enhancement recommended'] };
  } catch (error) {
    console.error('Smart suggestions failed:', error.message);
    return { quality_score: 7, improvements: ['AI analysis unavailable'], error: error.message };
  }
};

/**
 * Generate alt text using Groq (ultra-fast)
 */
export const generateAltTextGroq = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    let processBuffer = imageBuffer;
    if (metadata.width > 1024 || metadata.height > 1024) {
      processBuffer = await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .toBuffer();
    }
    
    const base64 = processBuffer.toString('base64');
    const mimeType = `image/${metadata.format || 'png'}`;
    
    const response = await groqVision(
      base64,
      'Generate a concise, accessible alt text description for this image (under 125 characters). Respond with ONLY the alt text, nothing else.',
      { mimeType, maxTokens: 100 }
    );
    
    return response.trim();
  } catch (error) {
    return 'Image';
  }
};

/**
 * Fallback prompt parsing when AI is unavailable
 */
const fallbackParsing = (prompt) => {
  const lower = prompt.toLowerCase();
  
  if (lower.includes('grayscale') || lower.includes('black and white') || lower.includes('b&w')) {
    return { action: 'filter', parameters: { type: 'grayscale' }, explanation: 'Converting to grayscale' };
  }
  if (lower.includes('sepia') || lower.includes('vintage') || lower.includes('old')) {
    return { action: 'filter', parameters: { type: 'sepia' }, explanation: 'Applying sepia/vintage effect' };
  }
  if (lower.includes('blur')) {
    return { action: 'filter', parameters: { type: 'blur' }, explanation: 'Applying blur' };
  }
  if (lower.includes('vibrant') || lower.includes('colorful') || lower.includes('saturate')) {
    return { action: 'enhance', parameters: { saturation: 1.5, contrast: 1.1 }, explanation: 'Boosting colors' };
  }
  if (lower.includes('bright') || lower.includes('lighten')) {
    return { action: 'enhance', parameters: { brightness: 1.3 }, explanation: 'Increasing brightness' };
  }
  if (lower.includes('dark') || lower.includes('dim')) {
    return { action: 'enhance', parameters: { brightness: 0.7 }, explanation: 'Reducing brightness' };
  }
  if (lower.includes('sharp') || lower.includes('detail') || lower.includes('crisp')) {
    return { action: 'enhance', parameters: { sharpen: true, contrast: 1.1 }, explanation: 'Sharpening image' };
  }
  if (lower.includes('warm') || lower.includes('golden')) {
    return { action: 'enhance', parameters: { saturation: 1.2, brightness: 1.05 }, explanation: 'Adding warmth' };
  }
  if (lower.includes('cool') || lower.includes('cold') || lower.includes('blue')) {
    return { action: 'enhance', parameters: { saturation: 0.9, brightness: 1.05 }, explanation: 'Adding cool tones' };
  }
  if (lower.includes('rotate')) {
    const match = lower.match(/(\d+)/);
    return { action: 'transform', parameters: { rotate: match ? parseInt(match[1]) : 90 }, explanation: 'Rotating image' };
  }
  if (lower.includes('flip') || lower.includes('mirror')) {
    const dir = lower.includes('vertical') ? 'vertical' : 'horizontal';
    return { action: 'transform', parameters: { flip: dir }, explanation: `Flipping ${dir}` };
  }
  if (lower.match(/16[:/]9|widescreen/)) {
    return { action: 'crop', parameters: { aspectRatio: '16:9' }, explanation: 'Cropping to 16:9' };
  }
  if (lower.match(/4[:/]3/)) {
    return { action: 'crop', parameters: { aspectRatio: '4:3' }, explanation: 'Cropping to 4:3' };
  }
  if (lower.includes('square') || lower.match(/1[:/]1/)) {
    return { action: 'crop', parameters: { aspectRatio: '1:1' }, explanation: 'Cropping to square' };
  }
  
  return { action: 'enhance', parameters: { contrast: 1.1, saturation: 1.1, sharpen: true }, explanation: 'General enhancement', usedFallback: true };
};

export default {
  analyzeImageGroq,
  getEditInstructionsGroq,
  detectWatermarkGroq,
  getSmartSuggestionsGroq,
  generateAltTextGroq,
};
