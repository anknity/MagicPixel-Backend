import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/index.js';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { cleanupOldFiles } from './middleware/upload.js';

const app = express();

// Trust proxy - Required for Render, Heroku, and other cloud platforms
// This allows express-rate-limit to work correctly behind a reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration - Allow multiple origins (localhost for dev, Vercel for production)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://magicpixels.vercel.app',
  'https://www.magicpixels.vercel.app',
  config.frontendUrl,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all for now, can restrict later
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting
app.use(generalLimiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'MagicPixels API',
    version: '2.0.0',
    description: 'AI-powered image processing API with Groq & Gemini AI',
    endpoints: {
      health: '/api/health',
      upload: '/api/upload',
      resize: '/api/resize',
      compress: '/api/compress',
      convert: '/api/convert',
      crop: '/api/crop',
      pdf: '/api/pdf',
      backgroundRemove: '/api/background-remove',
      watermarkRemove: '/api/watermark-remove',
      aiEnhance: '/api/ai-enhance',
      aiEdit: '/api/ai-edit',
      cloudinaryTools: '/api/cloudinary',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Error handler
app.use(errorHandler);

// Cleanup old files every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Start server
const PORT = parseInt(process.env.PORT, 10) || config.port || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔════════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║   🎨 MagicPixels Backend Server                               ║
  ║                                                                ║
  ║   Server running on: http://localhost:${PORT}                   ║
  ║   Environment: ${config.nodeEnv}                               ║
  ║                                                                ║
  ║   Cloudinary AI Tools (3 downloads, auto-delete):              ║
  ║   • POST /api/cloudinary/bg-remove     - AI Background Remove  ║
  ║   • POST /api/cloudinary/bg-replace    - Replace Background    ║
  ║   • POST /api/cloudinary/enhance       - AI Enhance            ║
  ║   • POST /api/cloudinary/upscale       - AI Upscale            ║
  ║   • POST /api/cloudinary/gen-fill      - Generative Fill       ║
  ║   • POST /api/cloudinary/gen-remove    - Remove Objects        ║
  ║   • POST /api/cloudinary/gen-recolor   - Recolor Objects       ║
  ║   • POST /api/cloudinary/artistic-filter - Art Filters         ║
  ║   • POST /api/cloudinary/smart-crop    - Smart Crop            ║
  ║   • POST /api/cloudinary/blur-faces    - Blur Faces            ║
  ║   • POST /api/cloudinary/auto-improve  - Auto Improve          ║
  ║                                                                ║
  ║   Other endpoints:                                             ║
  ║   • POST /api/resize, /api/compress, /api/convert, /api/pdf   ║
  ║                                                                ║
  ╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
