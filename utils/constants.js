export const STUDENT_STATUS = {
  PENDING: 'Pending',
  PRESENT: 'Present',
  ABSENT: 'Absent'
};

export const SCAN_STATUS = {
  PENDING: 'pending',
  SCANNED: 'scanned',
  PROCESSING: 'processing'
};

export const FILE_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGES_PER_UPLOAD: 10,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp']
};

export const IMAGE_SETTINGS = {
  QUALITY: 85,
  MAX_WIDTH: 2000,
  MAX_HEIGHT: 2800,
  THUMBNAIL_WIDTH: 300,
  THUMBNAIL_HEIGHT: 400
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100
};

export const ERROR_MESSAGES = {
  STUDENT_NOT_FOUND: 'Student not found',
  PAGE_NOT_FOUND: 'Page not found',
  FILE_NOT_FOUND: 'File not found',
  INVALID_FILE_TYPE: 'Invalid file type',
  FILE_TOO_LARGE: 'File too large',
  NO_SCANNED_PAGES: 'No scanned pages available',
  DATABASE_ERROR: 'Database error occurred'
};