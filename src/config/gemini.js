import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './index.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Available Gemini models (in order of preference)
// Models are tried in sequence if one fails due to quota/rate limit
const GEMINI_MODELS = [
  'gemini-2.0-flash',           // Latest fast model (primary)
  'gemini-2.0-flash-lite',      // Lightweight fast model
  'gemini-2.0-flash-thinking-exp-01-21', // Experimental thinking model
  'gemini-2.0-pro-exp-02-05',   // Experimental pro model
  'gemini-1.5-pro',             // Stable pro model (more quota)
  'gemini-1.5-flash-8b',        // Fast lightweight model
  'gemini-exp-1206',            // Experimental model
];

// Current model to use (can be changed if quota is exceeded)
let currentModelIndex = 0;
let lastResetTime = Date.now();
const RESET_INTERVAL = 60000; // Reset to primary model every 60 seconds

/**
 * Get Gemini model with automatic fallback
 */
export const getGeminiModel = (modelName = null) => {
  // Auto-reset to primary model after interval
  if (Date.now() - lastResetTime > RESET_INTERVAL) {
    currentModelIndex = 0;
    lastResetTime = Date.now();
    console.log('Auto-reset to primary model: gemini-2.0-flash');
  }
  
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
    console.log(`Switching to model ${currentModelIndex + 1}/${GEMINI_MODELS.length}: ${GEMINI_MODELS[currentModelIndex]}`);
    return true;
  }
  console.log('All models exhausted, no more fallbacks available');
  return false;
};

/**
 * Reset to primary model
 */
export const resetModelSelection = () => {
  currentModelIndex = 0;
  lastResetTime = Date.now();
};

/**
 * Get current model name
 */
export const getCurrentModelName = () => {
  return GEMINI_MODELS[currentModelIndex] || GEMINI_MODELS[0];
};

/**
 * Get all available models list
 */
export const getAvailableModels = () => {
  return [...GEMINI_MODELS];
};

export default genAI;
