import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config(); // ✅ Load environment variables first

// Define __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure storage directories exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
};

const storagePath = process.env.STORAGE_PATH || 'C:/exam_scanner_uploads';
const pdfsPath = path.join(storagePath, 'pdfs');

// Create necessary folders
ensureDirectoryExists(storagePath);
ensureDirectoryExists(pdfsPath);

// ✅ Export config object
export const config = {
  mongoURI: process.env.MONGO_URI, // 🔥 fixed variable name
  storagePath,
  pdfsPath,
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp').split(','),
  imageQuality: 85,
  maxImagesPerUpload: 10,
};
