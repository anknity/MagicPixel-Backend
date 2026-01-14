import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './index.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Available Gemini models (in order of preference)
const GEMINI_MODELS = [
  'gemini-2.0-flash',      // Latest fast model
  'gemini-2.0-flash-lite', // Lightweight fast model
  'gemini-1.5-flash',      // Previous stable model
];

// Current model to use (can be changed if quota is exceeded)
let currentModelIndex = 0;

/**
 * Get Gemini model with automatic fallback
 */
export const getGeminiModel = (modelName = null) => {
  const model = modelName || GEMINI_MODELS[currentModelIndex] || GEMINI_MODELS[0];
  return genAI.getGenerativeModel({ 
    model,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.4,
    },
  });
};

/**
 * Get Gemini Vision model for image analysis
 */
export const getGeminiVisionModel = () => {
  return getGeminiModel();
};

/**
 * Try next model if current one fails due to quota
 */
export const switchToNextModel = () => {
  if (currentModelIndex < GEMINI_MODELS.length - 1) {
    currentModelIndex++;
    console.log(`Switching to model: ${GEMINI_MODELS[currentModelIndex]}`);
    return true;
  }
  return false;
};

/**
 * Reset to primary model
 */
export const resetModelSelection = () => {
  currentModelIndex = 0;
};

/**
 * Get current model name
 */
export const getCurrentModelName = () => {
  return GEMINI_MODELS[currentModelIndex] || GEMINI_MODELS[0];
};

export default genAI;
