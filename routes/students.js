import express from 'express';
import {
  getStudents,
  getStudent,
  updateStatus,
  uploadExcel,
  generatePDF,
  getStats,
  deleteStudent,           // ✅ ADDED
  deleteAllStudents        // ✅ ADDED (optional)
} from '../controllers/studentController.js';

const router = express.Router();

router.get('/', getStudents);
router.get('/stats/summary', getStats);
router.get('/:id', getStudent);
router.patch('/:id/status', updateStatus);
router.post('/upload-excel', uploadExcel);
router.get('/:id/generate-pdf', generatePDF);
router.delete('/:id', deleteStudent);           // ✅ ADDED
router.delete('/', deleteAllStudents);          // ✅ ADDED (optional)

export default router;