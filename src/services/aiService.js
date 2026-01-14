import { getGeminiVisionModel, switchToNextModel, getCurrentModelName, getAvailableModels } from '../config/gemini.js';
import sharp from 'sharp';

// Retry configuration - increased to support more model fallbacks
const MAX_RETRIES = 7; // Match the number of available models
const RETRY_DELAY_MS = 1500;

/**
 * Sleep helper for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse JSON from AI response safely
 */
const parseJsonResponse = (response) => {
  try {
    // Clean up common issues with AI responses
    let cleanResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Analyze image with Gemini AI - with retry and fallback
 */
export const analyzeImage = async (imageBuffer, prompt = 'Describe this image in detail.') => {
  let lastError = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const model = getGeminiVisionModel();
      
      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
      const metadata = await sharp(imageBuffer).metadata();
      const mimeType = `image/${metadata.format || 'png'}`;
      
      console.log(`AI Analysis attempt ${attempt + 1} using model: ${getCurrentModelName()}`);
      
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType,
          },
        },
      ]);
      
      const response = await result.response;
      return response.text();
    } catch (error) {
      lastError = error;
      console.error(`AI Analysis attempt ${attempt + 1} failed:`, error.message);
      
      // Check if it's a quota/rate limit error
      if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Too Many Requests')) {
        // Try switching to a different model
        const switched = switchToNextModel();
        if (switched) {
          console.log('Switched to fallback model, retrying...');
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }
      
      // Check if it's a 404 model not found error
      if (error.message.includes('404') || error.message.includes('not found')) {
        const switched = switchToNextModel();
        if (switched) {
          console.log('Model not found, switched to alternative model');
          continue;
        }
      }
      
      // Wait before retry for other errors
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  
  throw new Error(`AI service temporarily unavailable: ${lastError?.message || 'Unknown error'}. Please try again later.`);
};

/**
 * Generate AI-powered image description for accessibility
 */
export const generateAltText = async (imageBuffer) => {
  const prompt = `Generate a concise, accessible alt text description for this image. 
  The description should be:
  - Brief (under 125 characters if possible)
  - Descriptive of key visual elements
  - Useful for screen readers
  
  Respond with only the alt text, no additional explanation.`;
  
  return await analyzeImage(imageBuffer, prompt);
};

/**
 * Get AI suggestions for image enhancement
 */
export const getEnhancementSuggestions = async (imageBuffer) => {
  try {
    const prompt = `Analyze this image and provide specific enhancement suggestions in JSON format:
    {
      "brightness": "increase/decrease/none",
      "contrast": "increase/decrease/none",
      "saturation": "increase/decrease/none",
      "sharpness": "increase/decrease/none",
      "cropSuggestion": "description of suggested crop or 'none'",
      "overallQuality": "1-10 rating",
      "suggestions": ["list of specific improvement suggestions"]
    }
    
    Respond with only the JSON, no markdown formatting.`;
    
    const response = await analyzeImage(imageBuffer, prompt);
    
    const parsed = parseJsonResponse(response);
    if (parsed) {
      return parsed;
    }
    return { raw: response };
  } catch (error) {
    console.error('Enhancement suggestions failed:', error.message);
    // Return default suggestions
    return {
      brightness: 'none',
      contrast: 'increase',
      saturation: 'none',
      sharpness: 'increase',
      overallQuality: 7,
      suggestions: ['Consider sharpening the image', 'Adjust contrast for better depth'],
      error: 'AI analysis unavailable, showing default suggestions'
    };
  }
};

/**
 * AI-powered image editing based on text prompt
 * Falls back to rule-based processing if AI fails
 */
export const processImageWithPrompt = async (imageBuffer, userPrompt) => {
  try {
    const prompt = `Based on this image and the user's request: "${userPrompt}"
  
  Provide specific image processing instructions in JSON format:
  {
    "action": "resize|crop|enhance|filter|transform",
    "parameters": {
      // Specific parameters based on action
    },
    "explanation": "Brief explanation of recommended changes"
  }
  
  Available actions:
  - resize: { width, height, fit: "cover|contain|fill" }
  - crop: { left, top, width, height } or { aspectRatio: "16:9|4:3|1:1|etc" }
  - enhance: { brightness: 0.5-2.0, contrast: 0.5-2.0, saturation: 0.5-2.0, sharpen: true/false }
  - filter: { type: "grayscale|sepia|blur|vintage" }
  - transform: { rotate: degrees, flip: "horizontal|vertical" }
  
  Respond with only the JSON, no markdown formatting.`;
  
    const response = await analyzeImage(imageBuffer, prompt);
    
    const parsed = parseJsonResponse(response);
    if (parsed && parsed.action) {
      return parsed;
    }
    
    // If parsing failed, try to extract intent from raw response
    return extractIntentFromResponse(response, userPrompt);
  } catch (error) {
    console.error('AI processing failed, using fallback:', error.message);
    // Fallback to rule-based processing
    return fallbackProcessing(userPrompt);
  }
};

/**
 * Extract intent from raw AI response
 */
const extractIntentFromResponse = (response, userPrompt) => {
  const lowerResponse = response.toLowerCase();
  const lowerPrompt = userPrompt.toLowerCase();
  
  // Try to detect intent from response or original prompt
  if (lowerPrompt.includes('grayscale') || lowerPrompt.includes('black and white') || lowerPrompt.includes('b&w')) {
    return { action: 'filter', parameters: { type: 'grayscale' }, explanation: 'Converting to grayscale' };
  }
  if (lowerPrompt.includes('sepia') || lowerPrompt.includes('vintage') || lowerPrompt.includes('old')) {
    return { action: 'filter', parameters: { type: 'sepia' }, explanation: 'Applying vintage sepia effect' };
  }
  if (lowerPrompt.includes('blur')) {
    return { action: 'filter', parameters: { type: 'blur' }, explanation: 'Applying blur effect' };
  }
  if (lowerPrompt.includes('vibrant') || lowerPrompt.includes('colorful') || lowerPrompt.includes('saturate')) {
    return { action: 'enhance', parameters: { saturation: 1.5, contrast: 1.1 }, explanation: 'Enhancing colors and vibrancy' };
  }
  if (lowerPrompt.includes('bright') || lowerPrompt.includes('lighten')) {
    return { action: 'enhance', parameters: { brightness: 1.3 }, explanation: 'Increasing brightness' };
  }
  if (lowerPrompt.includes('dark') || lowerPrompt.includes('dim')) {
    return { action: 'enhance', parameters: { brightness: 0.7 }, explanation: 'Reducing brightness' };
  }
  if (lowerPrompt.includes('sharp') || lowerPrompt.includes('detail')) {
    return { action: 'enhance', parameters: { sharpen: true, contrast: 1.1 }, explanation: 'Sharpening image' };
  }
  if (lowerPrompt.includes('contrast')) {
    return { action: 'enhance', parameters: { contrast: 1.3 }, explanation: 'Increasing contrast' };
  }
  if (lowerPrompt.includes('rotate')) {
    const match = lowerPrompt.match(/(\d+)/);
    const degrees = match ? parseInt(match[1]) : 90;
    return { action: 'transform', parameters: { rotate: degrees }, explanation: `Rotating ${degrees} degrees` };
  }
  if (lowerPrompt.includes('flip') || lowerPrompt.includes('mirror')) {
    const direction = lowerPrompt.includes('vertical') ? 'vertical' : 'horizontal';
    return { action: 'transform', parameters: { flip: direction }, explanation: `Flipping ${direction}ly` };
  }
  if (lowerPrompt.includes('16:9') || lowerPrompt.includes('16/9') || lowerPrompt.includes('widescreen')) {
    return { action: 'crop', parameters: { aspectRatio: '16:9' }, explanation: 'Cropping to 16:9 aspect ratio' };
  }
  if (lowerPrompt.includes('4:3') || lowerPrompt.includes('4/3')) {
    return { action: 'crop', parameters: { aspectRatio: '4:3' }, explanation: 'Cropping to 4:3 aspect ratio' };
  }
  if (lowerPrompt.includes('square') || lowerPrompt.includes('1:1')) {
    return { action: 'crop', parameters: { aspectRatio: '1:1' }, explanation: 'Cropping to square' };
  }
  if (lowerPrompt.includes('warm') || lowerPrompt.includes('golden')) {
    return { action: 'enhance', parameters: { saturation: 1.2, brightness: 1.05 }, explanation: 'Adding warm tones' };
  }
  
  // Default enhancement if nothing specific detected
  return { action: 'enhance', parameters: { contrast: 1.1, saturation: 1.1, sharpen: true }, explanation: 'General enhancement applied' };
};

/**
 * Fallback rule-based processing when AI is unavailable
 */
const fallbackProcessing = (userPrompt) => {
  const result = extractIntentFromResponse('', userPrompt);
  // Add flag to indicate this was processed using fallback (AI unavailable)
  result.usedFallback = true;
  result.fallbackReason = 'AI service quota exceeded. Using smart preset processing.';
  return result;
};

/**
 * Detect objects in image
 */
export const detectObjects = async (imageBuffer) => {
  try {
    const prompt = `Detect and list all objects visible in this image. 
    Provide the response in JSON format:
    {
      "objects": [
        { "name": "object name", "confidence": "high/medium/low", "location": "description of position" }
      ],
      "scene": "description of the overall scene",
      "dominantColors": ["color1", "color2", "color3"]
    }
    
    Respond with only the JSON, no markdown formatting.`;
    
    const response = await analyzeImage(imageBuffer, prompt);
    
    const parsed = parseJsonResponse(response);
    if (parsed) {
      return parsed;
    }
    return { raw: response };
  } catch (error) {
    console.error('Object detection failed:', error.message);
    return {
      objects: [],
      scene: 'Unable to analyze image',
      dominantColors: [],
      error: 'AI analysis temporarily unavailable'
    };
  }
};

/**
 * Generate creative variations description
 */
export const generateCreativeIdeas = async (imageBuffer) => {
  try {
    const prompt = `Based on this image, suggest 5 creative variations or edits that could be made.
    
    Provide in JSON format:
    {
      "ideas": [
        {
          "title": "Short title",
          "description": "Detailed description of the creative edit",
          "difficulty": "easy/medium/hard"
        }
      ]
    }
    
    Respond with only the JSON, no markdown formatting.`;
    
    const response = await analyzeImage(imageBuffer, prompt);
    
    const parsed = parseJsonResponse(response);
    if (parsed) {
      return parsed;
    }
    return { raw: response };
  } catch (error) {
    console.error('Creative ideas generation failed:', error.message);
    return {
      ideas: [
        { title: 'Grayscale Conversion', description: 'Convert to black and white for a classic look', difficulty: 'easy' },
        { title: 'Vintage Filter', description: 'Apply sepia tones for a nostalgic feel', difficulty: 'easy' },
        { title: 'Enhance Colors', description: 'Boost saturation and vibrancy', difficulty: 'easy' },
        { title: 'Sharpen Details', description: 'Increase sharpness for clearer details', difficulty: 'easy' },
        { title: 'Adjust Contrast', description: 'Improve depth with contrast adjustment', difficulty: 'medium' }
      ],
      fallback: true,
      error: 'AI suggestions temporarily unavailable, showing default ideas'
    };
  }
};

export default {
  analyzeImage,
  generateAltText,
  getEnhancementSuggestions,
  processImageWithPrompt,
  detectObjects,
  generateCreativeIdeas,
};
