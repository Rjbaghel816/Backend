/**
 * Format file size to human readable format
 * @param {Number} bytes - File size in bytes
 * @returns {String} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Generate unique filename
 * @param {String} originalName - Original filename
 * @returns {String} Unique filename
 */
export const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop();
  
  return `${timestamp}_${random}.${extension}`;
};

/**
 * Validate MongoDB ID
 * @param {String} id - MongoDB ObjectId
 * @returns {Boolean} True if valid
 */
export const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Sanitize filename to remove unsafe characters
 * @param {String} filename - Original filename
 * @returns {String} Sanitized filename
 */
export const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

/**
 * Calculate total size of scanned pages
 * @param {Array} scannedPages - Array of page objects
 * @returns {Number} Total size in bytes
 */
export const calculateTotalSize = (scannedPages) => {
  return scannedPages.reduce((total, page) => total + (page.fileSize || 0), 0);
};