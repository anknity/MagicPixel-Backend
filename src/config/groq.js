import config from './index.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Available Groq models (ordered by capability)
const GROQ_MODELS = {
  vision: 'llama-3.2-90b-vision-preview',       // Vision model for image analysis
  visionFast: 'llama-3.2-11b-vision-preview',    // Faster vision model
  versatile: 'llama-3.3-70b-versatile',          // Best for complex reasoning
  fast: 'llama-3.1-8b-instant',                  // Ultra-fast for simple tasks
};

/**
 * Call Groq API with text-only prompt
 */
export const groqChat = async (messages, options = {}) => {
  const {
    model = GROQ_MODELS.versatile,
    temperature = 0.3,
    maxTokens = 1024,
  } = options;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.groq.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

/**
 * Call Groq Vision API with image
 */
export const groqVision = async (imageBase64, prompt, options = {}) => {
  const {
    model = GROQ_MODELS.vision,
    temperature = 0.3,
    maxTokens = 1024,
    mimeType = 'image/png',
  } = options;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.groq.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Groq Vision API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

/**
 * Fast text processing with Groq (for simple tasks)
 */
export const groqFast = async (prompt) => {
  return groqChat(
    [{ role: 'user', content: prompt }],
    { model: GROQ_MODELS.fast, temperature: 0.2, maxTokens: 512 }
  );
};

/**
 * Complex reasoning with Groq
 */
export const groqReason = async (systemPrompt, userPrompt) => {
  return groqChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { model: GROQ_MODELS.versatile, temperature: 0.3, maxTokens: 2048 }
  );
};

export const MODELS = GROQ_MODELS;

export default {
  groqChat,
  groqVision,
  groqFast,
  groqReason,
  MODELS,
};
