import multer from 'multer';
import path from 'path';
import { config } from '../config/database.js';

// Configure multer for memory storage (process images before saving)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (config.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${config.allowedMimeTypes.join(', ')} are allowed.`), false);
  }
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSize,
    files: config.maxImagesPerUpload
  },
  fileFilter: fileFilter
});

// Error handler for multer
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 50MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 10 files per upload.'
      });
    }
  }
  next(err);
};