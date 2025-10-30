import Student from '../models/Student.js';
import { processExcelUpload } from '../services/excelService.js';
import { generateStudentPDF } from '../services/pdfService.js';

// @desc    Get all students with pagination and filters
// @route   GET /api/students
// @access  Public
export const getStudents = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '',
      status = '',
      sortBy = 'rollNumber',
      sortOrder = 'asc'
    } = req.query;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Build filter
    let filter = {};
    
    if (search) {
      filter.$or = [
        { rollNumber: { $regex: search, $options: 'i' } },
        { subjectCode: { $regex: search, $options: 'i' } },
        { subjectName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }

    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Student.countDocuments(filter)
    ]);

    res.json({
      success: true,
      students: students.map(student => ({
        ...student,
        pagesCount: student.scannedPages ? student.scannedPages.length : 0
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalStudents: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Public
export const getStudent = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    res.json({ 
      success: true, 
      student: {
        ...student.toObject(),
        pagesCount: student.scannedPages.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update student status
// @route   PATCH /api/students/:id/status
// @access  Public
export const updateStatus = async (req, res, next) => {
  try {
    const { status, remark } = req.body;
    
    if (!status || !['Pending', 'Present', 'Absent'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid status is required: Pending, Present, or Absent' 
      });
    }

    const updateData = { status };
    if (remark !== undefined) updateData.remark = remark;
    
    // If status is Absent, clear scanned pages and PDF
    if (status === 'Absent') {
      updateData.scannedPages = [];
      updateData.isScanned = false;
      updateData.scanTime = null;
      updateData.pdfPath = null;
      updateData.pdfGeneratedAt = null;
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Status updated successfully',
      student 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload Excel and create students
// @route   POST /api/students/upload-excel
// @access  Public
export const uploadExcel = async (req, res, next) => {
  try {
    const { excelData } = req.body;
    
    if (!excelData || !Array.isArray(excelData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Excel data format. Expected array of rows.' 
      });
    }

    if (excelData.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Excel data is empty' 
      });
    }

    const result = await processExcelUpload(excelData);
    
    res.json({
      success: true,
      message: `Successfully processed ${result.created} students`,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate/Download PDF for student
// @route   GET /api/students/:id/generate-pdf
// @access  Public
export const generatePDF = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    if (!student.isScanned || !student.pdfPath) {
      return res.status(400).json({ 
        success: false, 
        message: 'No scanned PDF available for this student' 
      });
    }

    const fs = await import('fs');
    
    if (!fs.existsSync(student.pdfPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'PDF file not found. Please rescan the copies.' 
      });
    }

    const filename = `Copy_${student.rollNumber}_${student.subjectCode}.pdf`;
    
    res.download(student.pdfPath, filename, (err) => {
      if (err) {
        console.error('PDF download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false, 
            message: 'Error downloading PDF' 
          });
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get statistics
// @route   GET /api/students/stats/summary
// @access  Public
export const getStats = async (req, res, next) => {
  try {
    const stats = await Student.getStats();
    const remaining = stats.total - stats.scanned - stats.absent;

    res.json({
      success: true,
      stats: {
        total: stats.total,
        scanned: stats.scanned,
        absent: stats.absent,
        remaining: remaining,
        pdfGenerated: stats.pdfGenerated
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete student and associated PDF
// @route   DELETE /api/students/:id
// @access  Public
export const deleteStudent = async (req, res, next) => {  // ✅ ADDED THIS FUNCTION
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Delete associated PDF file if exists
    if (student.pdfPath) {
      const fs = await import('fs');
      try {
        if (fs.existsSync(student.pdfPath)) {
          await fs.promises.unlink(student.pdfPath);
          console.log(`✅ Deleted PDF: ${student.pdfPath}`);
        }
      } catch (fsError) {
        console.warn(`Could not delete PDF file: ${student.pdfPath}`, fsError);
      }
    }

    await Student.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Student and associated PDF deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete all students (for cleanup)
// @route   DELETE /api/students
// @access  Public
export const deleteAllStudents = async (req, res, next) => {  // ✅ OPTIONAL: Added for cleanup
  try {
    // Delete all PDF files first
    const fs = await import('fs');
    const path = await import('path');
    const { config } = await import('../config/database.js');
    
    const students = await Student.find({ pdfPath: { $ne: null } });
    
    for (const student of students) {
      if (student.pdfPath && fs.existsSync(student.pdfPath)) {
        try {
          await fs.promises.unlink(student.pdfPath);
        } catch (fsError) {
          console.warn(`Could not delete PDF: ${student.pdfPath}`, fsError);
        }
      }
    }

    // Delete all students from database
    const result = await Student.deleteMany({});
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} students and their PDF files`
    });
  } catch (error) {
    next(error);
  }
};