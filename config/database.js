import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config(); // ✅ Load environment variables first

// Define __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Utility to ensure directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
};

// ✅ Base storage path (fallback included)
const storagePath = process.env.STORAGE_PATH || 'C:/exam_scanner_uploads';

// ✅ Define PDF-related directories
const pdfsPath = path.join(storagePath, 'pdfs');
const compressedPdfsPath = path.join(storagePath, 'compressed_pdfs');

// ✅ Ensure directories exist
ensureDirectoryExists(storagePath);
ensureDirectoryExists(pdfsPath);
ensureDirectoryExists(compressedPdfsPath);

// ✅ Export all configurations
export const config = {
  mongoURI: process.env.MONGODB_URI || process.env.MONGO_URI, // 🔥 Added fallback
  storagePath,
  pdfsPath,
  compressedPdfsPath, // 🔥 New: for storing compressed PDFs
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
  allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp').split(','),
  imageQuality: 85,
  maxImagesPerUpload: 10,
};
