import Student from '../models/Student.js';

/**
 * Process Excel data and create students in database
 * @param {Array} excelData - Array of rows from Excel file
 * @returns {Object} Result with created count and errors
 */
export const processExcelUpload = async (excelData) => {
  try {
    const processedData = [];
    const errors = [];

    // Validate and process each row
    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      
      // Skip empty rows
      if (!row || row.length < 3) {
        errors.push(`Row ${i + 1}: Insufficient data (need at least 3 columns)`);
        continue;
      }

      const rollNumber = row[0]?.toString().trim();
      const subjectCode = row[1]?.toString().trim();
      const subjectName = row[2]?.toString().trim();

      // Validate required fields
      if (!rollNumber) {
        errors.push(`Row ${i + 1}: Roll Number is required`);
        continue;
      }

      if (!subjectCode) {
        errors.push(`Row ${i + 1}: Subject Code is required`);
        continue;
      }

      if (!subjectName) {
        errors.push(`Row ${i + 1}: Subject Name is required`);
        continue;
      }

      // Check for duplicates in this batch
      const isDuplicate = processedData.some(
        item => item.rollNumber === rollNumber && item.subjectCode === subjectCode
      );

      if (isDuplicate) {
        errors.push(`Row ${i + 1}: Duplicate entry for ${rollNumber} - ${subjectCode}`);
        continue;
      }

      processedData.push({
        rollNumber,
        subjectCode,
        subjectName
      });
    }

    if (processedData.length === 0) {
      throw new Error('No valid student data found in Excel file');
    }

    // Check for existing students in database to avoid duplicates
    const existingStudents = await Student.find({
      $or: processedData.map(item => ({
        rollNumber: item.rollNumber,
        subjectCode: item.subjectCode
      }))
    });

    const existingMap = new Map();
    existingStudents.forEach(student => {
      const key = `${student.rollNumber}-${student.subjectCode}`;
      existingMap.set(key, student);
    });

    // Filter out existing students
    const studentsToCreate = processedData.filter(item => {
      const key = `${item.rollNumber}-${item.subjectCode}`;
      return !existingMap.has(key);
    });

    if (studentsToCreate.length === 0) {
      return {
        created: 0,
        skipped: processedData.length,
        duplicates: processedData.length,
        errors: errors,
        message: 'All students already exist in database'
      };
    }

    // Create new students in batch
    const createdStudents = await Student.insertMany(
      studentsToCreate.map(item => ({
        rollNumber: item.rollNumber,
        subjectCode: item.subjectCode,
        subjectName: item.subjectName,
        status: 'Pending'
      })),
      { ordered: false } // Continue even if some inserts fail
    );

    return {
      created: createdStudents.length,
      skipped: processedData.length - studentsToCreate.length,
      duplicates: existingStudents.length,
      errors: errors,
      message: `Successfully created ${createdStudents.length} new students`
    };

  } catch (error) {
    console.error('Excel processing error:', error);
    
    if (error.name === 'BulkWriteError' && error.writeErrors) {
      // Handle MongoDB duplicate key errors gracefully
      const duplicateCount = error.writeErrors.length;
      const successCount = error.result?.nInserted || 0;
      
      return {
        created: successCount,
        skipped: duplicateCount,
        duplicates: duplicateCount,
        errors: ['Some students already exist in database'],
        message: `Created ${successCount} students, ${duplicateCount} already existed`
      };
    }
    
    throw new Error(`Excel processing failed: ${error.message}`);
  }
};

/**
 * Validate Excel headers
 * @param {Array} headers - Array of header strings
 * @returns {Object} Validation result
 */
export const validateExcelHeaders = (headers) => {
  const requiredColumns = ['roll number', 'subject code', 'subject name'];
  const headerMap = headers.map(header => header?.toString().toLowerCase().trim());
  
  const missingColumns = requiredColumns.filter(
    col => !headerMap.includes(col)
  );

  return {
    isValid: missingColumns.length === 0,
    missingColumns,
    headers: headerMap
  };
};