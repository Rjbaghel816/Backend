import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate PDF from captured images without cover page
 * @param {Object} student - Student object
 * @param {Array} imageBuffers - Array of image buffers
 * @returns {Object} Result with PDF path
 */
export const generateAndSavePDF = async (student, imageBuffers) => {
  try {
    const pdfDoc = await PDFDocument.create();
    
    // Add metadata only (no cover page)
    pdfDoc.setTitle(`Exam Copy - ${student.rollNumber}`);
    pdfDoc.setAuthor('University Scanner System');
    pdfDoc.setSubject(`${student.subjectName} - ${student.subjectCode}`);

    // ✅ REMOVED: Cover page creation
    // await addCoverPage(pdfDoc, student);

    // ✅ DIRECTLY add scanned pages from image buffers
    for (let i = 0; i < imageBuffers.length; i++) {
      await addImageToPDF(pdfDoc, imageBuffers[i], i + 1);
    }

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();
    
    // Generate PDF filename
    const pdfFilename = `Copy_${student.rollNumber}_${student.subjectCode}_${uuidv4()}.pdf`;
    const pdfFilePath = path.join(config.pdfsPath, pdfFilename);
    
    // Save PDF file
    await fs.writeFile(pdfFilePath, pdfBytes);
    
    console.log(`✅ PDF generated without cover page: ${pdfFilePath}`);
    
    return {
      pdfPath: pdfFilePath,
      pdfFilename: pdfFilename,
      pageCount: imageBuffers.length,
      fileSize: pdfBytes.length
    };

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

/**
 * Add image buffer directly to PDF
 */
const addImageToPDF = async (pdfDoc, imageBuffer, pageNumber) => {
  try {
    // Process image with Sharp
    const processedImage = await sharp(imageBuffer)
      .rotate() // Auto-rotate based on EXIF
      .resize(2000, 2800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 90,
        progressive: true
      })
      .toBuffer();

    let image;
    try {
      image = await pdfDoc.embedJpg(processedImage);
    } catch (error) {
      // Fallback to PNG
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      image = await pdfDoc.embedPng(pngBuffer);
    }

    // Calculate dimensions to fit A4
    const a4Width = 595;
    const a4Height = 842;
    const margin = 10; // ✅ Reduced margin for more space
    
    const maxWidth = a4Width - (2 * margin);
    const maxHeight = a4Height - (2 * margin);
    
    let width = image.width;
    let height = image.height;
    
    // Maintain aspect ratio
    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width = maxWidth;
      height = height * ratio;
    }
    
    if (height > maxHeight) {
      const ratio = maxHeight / height;
      height = maxHeight;
      width = width * ratio;
    }
    
    // Center the image
    const x = (a4Width - width) / 2;
    const y = (a4Height - height) / 2;

    const pdfPage = pdfDoc.addPage([a4Width, a4Height]);
    pdfPage.drawImage(image, {
      x,
      y,
      width,
      height,
    });

    // ✅ OPTIONAL: Add small page number at bottom (comment out if not needed)
    // pdfPage.drawText(`Page ${pageNumber}`, {
    //   x: a4Width - 40,
    //   y: 20,
    //   size: 8,
    //   color: rgb(0.5, 0.5, 0.5),
    // });

    console.log(`✅ Page ${pageNumber} added to PDF`);

  } catch (error) {
    console.error(`❌ Error adding page ${pageNumber} to PDF:`, error);
    throw error;
  }
};

/**
 * Generate PDF for existing student (for download) - No cover page
 */
export const generateStudentPDF = async (student) => {
  try {
    // Check if PDF already exists
    if (student.pdfPath) {
      try {
        await fs.access(student.pdfPath);
        console.log(`✅ Using existing PDF: ${student.pdfPath}`);
        return student.pdfPath;
      } catch {
        // PDF file doesn't exist, we can't regenerate without images
        throw new Error('PDF file not found. Cannot regenerate without original images.');
      }
    }

    throw new Error('No PDF available for this student.');

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// ✅ REMOVED: addCoverPage function completely
// No cover page will be generated