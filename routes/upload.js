import express from 'express';
import {
  uploadScans,
  deleteScans,
  downloadPDF,
  getPDFInfo,
  rescanStudent,
  batchDeleteScans
} from '../controllers/uploadController.js';
import { upload, handleMulterError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Upload scans and generate PDF directly
router.post('/scan/:studentId', 
  upload.array('images', 10), 
  handleMulterError,
  uploadScans
);

// Delete scans and PDF
router.delete('/scan/:studentId', deleteScans);

// Download PDF
router.get('/pdf/:studentId', downloadPDF);

// ✅ NEW: Get PDF info without downloading
router.get('/pdf/:studentId/info', getPDFInfo);

// ✅ NEW: Rescan student (delete old and allow new scan)
router.post('/rescan/:studentId', rescanStudent);

// ✅ NEW: Batch delete multiple students' scans
router.post('/batch-delete', batchDeleteScans);

export default router;