import sharp from 'sharp';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/database.js';

/**
 * Process and save uploaded image with optimization
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {String} rollNumber - Student roll number for naming
 * @param {Number} pageNumber - Page number for naming
 * @returns {Object} Processed image info
 */
export const processAndSaveImage = async (imageBuffer, rollNumber, pageNumber) => {
  try {
    // Generate unique filename
    const filename = `scan_${rollNumber}_page${pageNumber}_${uuidv4()}.jpg`;
    const outputPath = path.join(config.storagePath, 'images', filename);

    // Process image with Sharp
    const processedImage = await sharp(imageBuffer)
      .rotate() // Auto-rotate based on EXIF
      .resize(2000, 2800, { // Standard A4 ratio at good resolution
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: config.imageQuality,
        progressive: true,
        optimizeScans: true,
        mozjpeg: true
      })
      .toBuffer();

    // Get image metadata
    const metadata = await sharp(processedImage).metadata();

    // Save processed image
    await sharp(processedImage).toFile(outputPath);

    // Get file size
    const fs = await import('fs');
    const stats = fs.statSync(outputPath);
    const fileSize = stats.size;

    return {
      filename,
      fileSize,
      pageNumber,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format
      },
      path: outputPath
    };

  } catch (error) {
    console.error('Image processing error:', error);
    throw new Error(`Failed to process image: ${error.message}`);
  }
};

/**
 * Optimize image for web display (thumbnail)
 * @param {String} imagePath - Path to original image
 * @returns {Buffer} Optimized image buffer
 */
export const createThumbnail = async (imagePath) => {
  try {
    return await sharp(imagePath)
      .resize(300, 400, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 70,
        progressive: true 
      })
      .toBuffer();
  } catch (error) {
    console.error('Thumbnail creation error:', error);
    throw error;
  }
};

/**
 * Validate image dimensions and quality
 * @param {Buffer} imageBuffer - Image buffer to validate
 * @returns {Object} Validation result
 */
export const validateImage = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    
    const issues = [];
    
    // Check minimum dimensions
    if (metadata.width < 500 || metadata.height < 500) {
      issues.push('Image too small - minimum 500x500 pixels required');
    }
    
    // Check aspect ratio (roughly A4)
    const aspectRatio = metadata.width / metadata.height;
    if (aspectRatio < 0.6 || aspectRatio > 0.8) {
      issues.push('Image aspect ratio should be close to A4 (0.7)');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      metadata
    };
  } catch (error) {
    throw new Error(`Image validation failed: ${error.message}`);
  }
};