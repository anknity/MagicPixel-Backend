import { v2 as cloudinary } from 'cloudinary';
import config from './index.js';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

export const uploadToCloudinary = async (filePath, options = {}) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'magicpixels',
      resource_type: 'auto',
      ...options,
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

export const uploadBufferToCloudinary = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    // Ensure buffer is a proper Buffer instance
    const uploadBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    
    if (uploadBuffer.length === 0) {
      return reject(new Error('Cannot upload empty buffer to Cloudinary'));
    }
    
    console.log(`Uploading to Cloudinary: ${uploadBuffer.length} bytes, options:`, JSON.stringify(options));
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'magicpixels',
        resource_type: 'auto',
        ...options,
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          console.log('Cloudinary upload success:', result?.secure_url);
          resolve(result);
        }
      }
    );
    
    uploadStream.end(uploadBuffer);
  });
};

export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(`Cloudinary delete failed: ${error.message}`);
  }
};

export const getOptimizedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    fetch_format: 'auto',
    quality: 'auto',
    ...options,
  });
};

export default cloudinary;
