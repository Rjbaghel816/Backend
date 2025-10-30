import Student from '../models/Student.js';
import { generateAndSavePDF } from '../services/pdfService.js';
import path from 'path';
import fs from 'fs/promises';

// @desc    Upload scans and generate PDF directly
// @route   POST /api/upload/scan/:studentId
// @access  Public
export const uploadScans = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No images uploaded' 
      });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Check if student is absent
    if (student.status === 'Absent') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot scan copies for absent students' 
      });
    }

    try {
      // ✅ Generate PDF directly from uploaded images
      const pdfResult = await generateAndSavePDF(student, files.map(file => file.buffer));
      
      // Update student record with PDF info
      const scannedPages = files.map((file, index) => ({
        pageNumber: index + 1,
        timestamp: new Date()
      }));

      // ✅ Delete old PDF if exists before updating
      if (student.pdfPath) {
        try {
          if (fs.existsSync(student.pdfPath)) {
            await fs.unlink(student.pdfPath);
            console.log(`✅ Deleted old PDF: ${student.pdfPath}`);
          }
        } catch (fsError) {
          console.warn('Could not delete old PDF file:', fsError);
        }
      }

      student.scannedPages = scannedPages;
      student.isScanned = true;
      student.status = student.status === 'Pending' ? 'Present' : student.status;
      student.scanTime = new Date();
      student.pdfPath = pdfResult.pdfPath;
      student.pdfGeneratedAt = new Date();

      await student.save();

      res.json({
        success: true,
        message: `Successfully scanned ${files.length} pages and generated PDF`,
        student: {
          ...student.toObject(),
          pagesCount: student.scannedPages.length
        },
        pdfInfo: {
          filename: path.basename(pdfResult.pdfPath),
          pageCount: pdfResult.pageCount,
          fileSize: pdfResult.fileSize,
          downloadUrl: `/api/upload/pdf/${studentId}`
        }
      });

    } catch (pdfError) {
      console.error('PDF generation failed:', pdfError);
      
      // ✅ Clean up on PDF generation failure
      if (student.pdfPath) {
        try {
          if (fs.existsSync(student.pdfPath)) {
            await fs.unlink(student.pdfPath);
          }
        } catch (cleanupError) {
          console.warn('Could not cleanup failed PDF:', cleanupError);
        }
        student.pdfPath = null;
        student.pdfGeneratedAt = null;
        await student.save();
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate PDF from scanned images' 
      });
    }

  } catch (error) {
    next(error);
  }
};

// @desc    Delete student scans and PDF
// @route   DELETE /api/upload/scan/:studentId
// @access  Public
export const deleteScans = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Delete PDF file if exists
    if (student.pdfPath) {
      try {
        if (await fileExists(student.pdfPath)) {
          await fs.unlink(student.pdfPath);
          console.log(`✅ Deleted PDF: ${student.pdfPath}`);
        }
      } catch (fsError) {
        console.warn('Could not delete PDF file:', fsError);
      }
    }

    // Clear student scan data
    student.scannedPages = [];
    student.isScanned = false;
    student.scanTime = null;
    student.pdfPath = null;
    student.pdfGeneratedAt = null;

    await student.save();

    res.json({
      success: true,
      message: 'Scans and PDF deleted successfully',
      student: {
        ...student.toObject(),
        pagesCount: 0
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Download PDF
// @route   GET /api/upload/pdf/:studentId
// @access  Public
export const downloadPDF = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    if (!student.pdfPath) {
      return res.status(404).json({ 
        success: false, 
        message: 'PDF not found for this student' 
      });
    }

    // ✅ Check if file exists with better error handling
    if (!(await fileExists(student.pdfPath))) {
      // If PDF file doesn't exist, clear the reference
      student.pdfPath = null;
      student.pdfGeneratedAt = null;
      await student.save();
      
      return res.status(404).json({ 
        success: false, 
        message: 'PDF file not found. Please rescan the copies.' 
      });
    }

    const filename = `Copy_${student.rollNumber}_${student.subjectCode}.pdf`;
    
    // ✅ Set proper headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file for better performance
    const fileStream = fs.createReadStream(student.pdfPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Error streaming PDF file' 
        });
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get PDF info without downloading
// @route   GET /api/upload/pdf/:studentId/info
// @access  Public
export const getPDFInfo = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    if (!student.pdfPath) {
      return res.status(404).json({ 
        success: false, 
        message: 'PDF not generated for this student' 
      });
    }

    // Check if PDF file exists
    let fileStats = null;
    try {
      if (await fileExists(student.pdfPath)) {
        fileStats = await fs.stat(student.pdfPath);
      }
    } catch (error) {
      console.warn('Could not get PDF file stats:', error);
    }

    res.json({
      success: true,
      pdfInfo: {
        filename: `Copy_${student.rollNumber}_${student.subjectCode}.pdf`,
        filePath: student.pdfPath,
        fileSize: fileStats?.size || 0,
        generatedAt: student.pdfGeneratedAt,
        pageCount: student.scannedPages?.length || 0,
        downloadUrl: `/api/upload/pdf/${studentId}`,
        exists: !!fileStats
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Rescan student - delete old and allow new scan
// @route   POST /api/upload/rescan/:studentId
// @access  Public
export const rescanStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Delete existing PDF file
    if (student.pdfPath) {
      try {
        if (await fileExists(student.pdfPath)) {
          await fs.unlink(student.pdfPath);
          console.log(`✅ Deleted PDF for rescan: ${student.pdfPath}`);
        }
      } catch (fsError) {
        console.warn('Could not delete PDF file for rescan:', fsError);
      }
    }

    // Reset scan data but keep student info
    student.scannedPages = [];
    student.isScanned = false;
    student.scanTime = null;
    student.pdfPath = null;
    student.pdfGeneratedAt = null;
    // Keep status as is (don't reset to Pending)

    await student.save();

    res.json({
      success: true,
      message: 'Student reset for rescanning',
      student: {
        ...student.toObject(),
        pagesCount: 0
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Batch delete multiple students' scans
// @route   POST /api/upload/batch-delete
// @access  Public
export const batchDeleteScans = async (req, res, next) => {
  try {
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student IDs array is required' 
      });
    }

    const results = {
      deleted: 0,
      failed: 0,
      errors: []
    };

    for (const studentId of studentIds) {
      try {
        const student = await Student.findById(studentId);
        if (student) {
          // Delete PDF file if exists
          if (student.pdfPath) {
            try {
              if (await fileExists(student.pdfPath)) {
                await fs.unlink(student.pdfPath);
              }
            } catch (fsError) {
              console.warn(`Could not delete PDF for student ${studentId}:`, fsError);
            }
          }

          // Reset scan data
          student.scannedPages = [];
          student.isScanned = false;
          student.scanTime = null;
          student.pdfPath = null;
          student.pdfGeneratedAt = null;

          await student.save();
          results.deleted++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Student ${studentId}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Batch delete completed: ${results.deleted} successful, ${results.failed} failed`,
      results
    });

  } catch (error) {
    next(error);
  }
};

// ✅ Helper function to check if file exists
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// ✅ Helper function to get file size
const getFileSize = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
};