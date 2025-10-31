import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { mkdir } from 'fs/promises';

// ✅ FAST PDF compression
const compressPDF = async (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const gsCommand = process.platform === 'win32' ? 'gswin64c' : 'gs';

    const command = `${gsCommand} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    console.log(`🌀 Compressing PDF...`);
    
    exec(command, { timeout: 10000 }, (error) => {
      if (error) {
        console.log('⚠️ Compression failed, using original');
        fs.copyFile(inputPath, outputPath)
          .then(resolve)
          .catch(reject);
      } else {
        console.log(`✅ PDF compressed`);
        resolve();
      }
    });
  });
};

// ✅ ULTRA-FAST image processing
const fastProcessImage = async (imageBuffer) => {
  try {
    return await sharp(imageBuffer)
      .rotate()
      .resize(600, 800, {
        fit: 'inside',
        withoutEnlargement: true,
        fastShrinkOnLoad: true
      })
      .jpeg({
        quality: 50,
        progressive: true,
        force: true
      })
      .toBuffer();
  } catch (error) {
    console.warn('Fast processing failed, using original');
    return imageBuffer;
  }
};

// ✅ FAST PDF generation
export const generateAndSavePDF = async (student, imageBuffers) => {
  const startTime = Date.now();
  console.log(`🚀 FAST PDF generation for ${imageBuffers.length} images`);
  
  let pdfDoc;
  
  try {
    pdfDoc = await PDFDocument.create();

    pdfDoc.setTitle(`Copy - ${student.rollNumber}`);

    const totalImages = imageBuffers.length;

    // ✅ Process in small batches
    const BATCH_SIZE = 3;
    
    for (let i = 0; i < totalImages; i += BATCH_SIZE) {
      const batch = imageBuffers.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(buffer => fastProcessImage(buffer));
      const processedBatch = await Promise.allSettled(batchPromises);
      
      for (let j = 0; j < processedBatch.length; j++) {
        if (processedBatch[j].status === 'fulfilled') {
          await addImageToPDF(pdfDoc, processedBatch[j].value);
        } else {
          await addImageToPDF(pdfDoc, batch[j]);
        }
      }
      
      console.log(`✅ Processed ${Math.min(i + BATCH_SIZE, totalImages)}/${totalImages}`);
    }

    const pdfBytes = await pdfDoc.save();
    
    await mkdir(config.pdfsPath, { recursive: true });

    const pdfFilename = `Copy_${student.rollNumber}_${Date.now()}.pdf`;
    const pdfFilePath = path.join(config.pdfsPath, pdfFilename);
    const compressedFilePath = pdfFilePath.replace('.pdf', '_compressed.pdf');

    await fs.writeFile(pdfFilePath, pdfBytes);

    await compressPDF(pdfFilePath, compressedFilePath);

    try {
      await fs.unlink(pdfFilePath);
    } catch (delErr) {
      // Ignore
    }

    const stats = await fs.stat(compressedFilePath);
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 PDF generated in ${totalTime}ms`);

    return {
      pdfPath: compressedFilePath,
      pdfFilename: path.basename(compressedFilePath),
      pageCount: totalImages,
      fileSize: stats.size,
      processingTime: totalTime
    };

  } catch (error) {
    console.error('❌ PDF generation failed:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// ✅ Add image to PDF
const addImageToPDF = async (pdfDoc, imageBuffer) => {
  try {
    let image;
    
    try {
      image = await pdfDoc.embedJpg(imageBuffer);
    } catch {
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      image = await pdfDoc.embedPng(pngBuffer);
    }

    const page = pdfDoc.addPage([595, 842]);
    
    const { width, height } = image.scale(1);
    const scale = Math.min(500 / width, 700 / height);
    
    page.drawImage(image, {
      x: 50,
      y: 50,
      width: width * scale,
      height: height * scale,
    });

  } catch (err) {
    console.error('Page add failed:', err.message);
    throw err;
  }
};

// ✅ Generate existing PDF
export const generateStudentPDF = async (student) => {
  try {
    if (student.pdfPath) {
      await fs.access(student.pdfPath);
      console.log(`✅ Using existing PDF: ${student.pdfPath}`);
      return student.pdfPath;
    }
    throw new Error('No existing PDF found.');
  } catch (err) {
    console.error('❌ PDF generation error:', err.message);
    throw new Error(`PDF generation failed: ${err.message}`);
  }
};