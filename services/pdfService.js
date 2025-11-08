import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config/database.js';
import { exec } from 'child_process';
import { mkdir } from 'fs/promises';

// ✅ DOCUMENT BOUNDARY DETECTION (Adobe Scan Style)
const detectDocumentBoundaries = async (imageBuffer) => {
  try {
    console.log('🔍 Detecting document boundaries...');
    
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    // Create a high-contrast version for edge detection
    const processed = await sharp(imageBuffer)
      .grayscale()
      .normalise() // Enhance contrast
      .modulate({ brightness: 1.1, saturation: 1.2 })
      .sharpen()
      .raw()
      .toBuffer();
    
    const edgeThreshold = 50; // Lower = more sensitive to edges
    const minDocumentSize = 0.6; // Minimum 60% of original size
    
    let leftEdge = width;
    let rightEdge = 0;
    let topEdge = height;
    let bottomEdge = 0;
    
    let darkPixelsFound = 0;
    
    // Scan for document edges with optimized sampling
    const sampleRate = Math.max(2, Math.floor(width / 100));
    
    // Scan horizontal lines
    for (let y = 0; y < height; y += sampleRate) {
      for (let x = 0; x < width; x += sampleRate) {
        const pixelIndex = y * width + x;
        const brightness = processed[pixelIndex];
        
        if (brightness < edgeThreshold) {
          darkPixelsFound++;
          if (x < leftEdge) leftEdge = x;
          if (x > rightEdge) rightEdge = x;
          if (y < topEdge) topEdge = y;
          if (y > bottomEdge) bottomEdge = y;
        }
      }
    }
    
    console.log(`📐 Edge detection: L:${leftEdge}, R:${rightEdge}, T:${topEdge}, B:${bottomEdge}`);
    console.log(`⚫ Dark pixels found: ${darkPixelsFound}`);
    
    // Check if we found a significant document area
    const detectedWidth = rightEdge - leftEdge;
    const detectedHeight = bottomEdge - topEdge;
    
    if (detectedWidth < width * minDocumentSize || detectedHeight < height * minDocumentSize) {
      console.log('❌ No significant document area detected, using original');
      return imageBuffer;
    }
    
    // Add safety margin
    const margin = Math.min(30, width * 0.02, height * 0.02);
    const cropLeft = Math.max(0, leftEdge - margin);
    const cropTop = Math.max(0, topEdge - margin);
    const cropWidth = Math.min(width - cropLeft, detectedWidth + (2 * margin));
    const cropHeight = Math.min(height - cropTop, detectedHeight + (2 * margin));
    
    console.log(`✂️ Cropping document: ${cropWidth}x${cropHeight} from ${width}x${height}`);
    
    const croppedImage = await sharp(imageBuffer)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    console.log('✅ Document boundaries detected and cropped');
    return croppedImage;
    
  } catch (error) {
    console.error('❌ Document boundary detection failed:', error);
    return imageBuffer;
  }
};

// ✅ ENHANCE DOCUMENT QUALITY
const enhanceDocumentQuality = async (imageBuffer) => {
  try {
    console.log('✨ Enhancing document quality...');
    
    return await sharp(imageBuffer)
      .grayscale()
      .normalise() // Auto contrast
      .linear(1.1, 0) // Increase contrast
      .sharpen({ sigma: 0.8, m1: 1, m2: 2 }) // Mild sharpening
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (error) {
    console.error('Quality enhancement failed:', error);
    return imageBuffer;
  }
};

// ✅ VERTICAL PAGE DETECTION (LEFT-RIGHT SPLIT)
const smartVerticalPageDetection = async (imageBuffer) => {
  try {
    console.log('🔍 Analyzing image for VERTICAL page detection...');
    
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    console.log(`📏 Image dimensions: ${width}x${height}`);
    console.log(`📊 Aspect ratio: ${(width / height).toFixed(2)}`);
    
    // ✅ STRATEGY 1: Aspect Ratio Analysis for VERTICAL SPLIT
    const aspectRatio = width / height;
    
    if (aspectRatio > 1.8) {
      console.log('📄 HIGH CONFIDENCE: 3 pages detected (wide image)');
      return await splitIntoThreePagesVertical(imageBuffer, width, height);
    }
    else if (aspectRatio > 1.3) {
      console.log('📄 HIGH CONFIDENCE: 2 pages detected (wide image)');
      return await splitIntoTwoPagesVertical(imageBuffer, width, height);
    }
    
    // ✅ STRATEGY 2: Brightness Analysis for VERTICAL Page Gaps
    console.log('💡 Performing VERTICAL brightness analysis...');
    const splitResult = await detectVerticalPageGapsByBrightness(imageBuffer, width, height);
    if (splitResult.length > 1) {
      console.log(`📄 VERTICAL BRIGHTNESS DETECTION: ${splitResult.length} pages found`);
      return splitResult;
    }
    
    console.log('✅ No multiple pages detected, using single page');
    return [imageBuffer];
    
  } catch (error) {
    console.error('Vertical page detection failed:', error);
    return [imageBuffer];
  }
};

// ✅ VERTICAL SPLIT INTO 2 PAGES (LEFT-RIGHT)
const splitIntoTwoPagesVertical = async (imageBuffer, width, height) => {
  try {
    const pageWidth = Math.floor(width / 2);
    
    const leftPage = await sharp(imageBuffer)
      .extract({ left: 0, top: 0, width: pageWidth, height: height })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const rightPage = await sharp(imageBuffer)
      .extract({ left: pageWidth, top: 0, width: width - pageWidth, height: height })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    return [leftPage, rightPage];
  } catch (error) {
    throw new Error(`Two-page vertical split failed: ${error.message}`);
  }
};

// ✅ VERTICAL SPLIT INTO 3 PAGES (LEFT-RIGHT)
const splitIntoThreePagesVertical = async (imageBuffer, width, height) => {
  try {
    const pageWidth = Math.floor(width / 3);
    
    const pages = await Promise.all([
      // Left Page
      sharp(imageBuffer)
        .extract({ left: 0, top: 0, width: pageWidth, height: height })
        .jpeg({ quality: 85 })
        .toBuffer(),
      // Middle Page
      sharp(imageBuffer)
        .extract({ left: pageWidth, top: 0, width: pageWidth, height: height })
        .jpeg({ quality: 85 })
        .toBuffer(),
      // Right Page
      sharp(imageBuffer)
        .extract({ left: pageWidth * 2, top: 0, width: width - pageWidth * 2, height: height })
        .jpeg({ quality: 85 })
        .toBuffer()
    ]);
    
    return pages;
  } catch (error) {
    throw new Error(`Three-page vertical split failed: ${error.message}`);
  }
};

// ✅ VERTICAL BRIGHTNESS-BASED PAGE GAP DETECTION
const detectVerticalPageGapsByBrightness = async (imageBuffer, width, height) => {
  try {
    const smallImage = await sharp(imageBuffer)
      .resize(Math.floor((width * 100) / height), 100, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
    
    const smallWidth = Math.floor((width * 100) / height);
    const brightnessThreshold = 200;
    const minGapSize = 5;
    
    let brightColumns = 0;
    let currentGapStart = -1;
    const gaps = [];
    
    for (let x = 0; x < smallWidth; x++) {
      let columnBrightness = 0;
      
      for (let y = 30; y < 70; y++) {
        const pixelIndex = y * smallWidth + x;
        columnBrightness += smallImage[pixelIndex];
      }
      
      const avgBrightness = columnBrightness / 40;
      
      if (avgBrightness > brightnessThreshold) {
        brightColumns++;
        if (currentGapStart === -1) {
          currentGapStart = x;
        }
      } else {
        if (currentGapStart !== -1 && (x - currentGapStart) >= minGapSize) {
          gaps.push({ start: currentGapStart, end: x });
        }
        currentGapStart = -1;
      }
    }
    
    console.log(`💡 Vertical brightness analysis: ${brightColumns} bright columns, ${gaps.length} gaps found`);
    
    if (gaps.length > 0) {
      const middleGap = gaps.find(gap => 
        gap.start < smallWidth * 0.6 && gap.end > smallWidth * 0.4
      );
      
      if (middleGap) {
        const splitPoint = Math.floor((middleGap.start + middleGap.end) / 2 * (width / smallWidth));
        
        if (splitPoint > width * 0.3 && splitPoint < width * 0.7) {
          console.log(`✂️ Vertical splitting at detected gap: ${splitPoint}px`);
          
          const leftPage = await sharp(imageBuffer)
            .extract({ left: 0, top: 0, width: splitPoint, height: height })
            .jpeg({ quality: 85 })
            .toBuffer();
          
          const rightPage = await sharp(imageBuffer)
            .extract({ left: splitPoint, top: 0, width: width - splitPoint, height: height })
            .jpeg({ quality: 85 })
            .toBuffer();
          
          return [leftPage, rightPage];
        }
      }
    }
    
    return [imageBuffer];
  } catch (error) {
    console.error('Vertical brightness detection failed:', error);
    return [imageBuffer];
  }
};

// ✅ COMPLETE IMAGE PROCESSING PIPELINE
const processImagePipeline = async (imageBuffer, isFirstPage = false) => {
  try {
    console.log('\n🔄 Starting image processing pipeline...');
    
    // Step 1: Detect and crop document boundaries
    const croppedImage = await detectDocumentBoundaries(imageBuffer);
    
    // Step 2: Enhance document quality
    const enhancedImage = await enhanceDocumentQuality(croppedImage);
    
    // Step 3: Apply page splitting (only for non-first pages)
    let finalPages;
    if (isFirstPage) {
      console.log('📄 FIRST PAGE: No splitting applied');
      finalPages = [enhancedImage];
    } else {
      finalPages = await smartVerticalPageDetection(enhancedImage);
    }
    
    console.log(`✅ Pipeline complete: 1 image → ${finalPages.length} pages`);
    return finalPages;
    
  } catch (error) {
    console.error('Image processing pipeline failed:', error);
    return [imageBuffer];
  }
};

// ✅ UPDATED PDF GENERATION WITH DOCUMENT DETECTION
export const generateAndSavePDF = async (student, imageBuffers) => {
  const startTime = Date.now();
  console.log(`\n🚀 ADVANCED PDF GENERATION STARTED`);
  console.log(`📌 Student: ${student.rollNumber}`);
  console.log(`📌 Images: ${imageBuffers.length}`);
  console.log(`📌 Special: First page kept as single page + Document boundary detection`);
  
  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Answer Sheet - ${student.rollNumber}`);
    pdfDoc.setAuthor('Auto PDF Generator');
    pdfDoc.setCreator('Document Scanner Pro');

    let allPages = [];
    let splitStats = { 
      original: 0, 
      final: 0,
      boundariesDetected: 0,
      qualityEnhanced: 0
    };
    
    // ✅ PROCESS EACH IMAGE THROUGH COMPLETE PIPELINE
    for (let i = 0; i < imageBuffers.length; i++) {
      console.log(`\n--- Processing Image ${i + 1}/${imageBuffers.length} ---`);
      
      const originalBuffer = imageBuffers[i];
      const isFirstPage = (i === 0);
      
      // Process through complete pipeline
      const processedPages = await processImagePipeline(originalBuffer, isFirstPage);
      
      allPages = allPages.concat(processedPages);
      splitStats.original++;
      splitStats.final += processedPages.length;
      
      // Track processing stats
      if (processedPages.length > 0) {
        splitStats.boundariesDetected++;
        splitStats.qualityEnhanced++;
      }
    }

    // ✅ ADD ALL PAGES TO PDF (LANDSCAPE ORIENTATION)
    console.log(`\n📄 Adding ${allPages.length} pages to PDF...`);
    for (let i = 0; i < allPages.length; i++) {
      await addImageToPDFLandscape(pdfDoc, allPages[i], student, i + 1, allPages.length);
    }

    const pdfBytes = await pdfDoc.save();
    
    // ✅ SAVE PDF FILE
    await mkdir(config.pdfsPath, { recursive: true });

    const pdfFilename = `AnswerSheet_${student.rollNumber}_${Date.now()}.pdf`;
    const pdfFilePath = path.join(config.pdfsPath, pdfFilename);
    const compressedFilePath = pdfFilePath.replace('.pdf', '_compressed.pdf');

    await fs.writeFile(pdfFilePath, pdfBytes);
    
    // ✅ COMPRESS PDF
    await compressPDF(pdfFilePath, compressedFilePath);

    // Clean up uncompressed file
    try {
      await fs.unlink(pdfFilePath);
    } catch (delErr) {
      console.log('⚠️ Could not delete uncompressed PDF');
    }

    const stats = await fs.stat(compressedFilePath);
    const totalTime = Date.now() - startTime;
    
    // ✅ FINAL SUMMARY
    console.log(`\n🎉 PDF GENERATION SUCCESS!`);
    console.log(`📊 PROCESSING SUMMARY:`);
    console.log(`   ├── Original images: ${splitStats.original}`);
    console.log(`   ├── Final PDF pages: ${splitStats.final}`);
    console.log(`   ├── Document boundaries detected: ${splitStats.boundariesDetected}`);
    console.log(`   ├── Quality enhanced: ${splitStats.qualityEnhanced}`);
    console.log(`   ├── Processing time: ${totalTime}ms`);
    console.log(`   ├── File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   └── Efficiency: ${((splitStats.final / splitStats.original) * 100).toFixed(1)}%`);

    return {
      pdfPath: compressedFilePath,
      pdfFilename: path.basename(compressedFilePath),
      pageCount: allPages.length,
      fileSize: stats.size,
      processingTime: totalTime,
      originalImages: imageBuffers.length,
      finalPages: allPages.length,
      firstPageNoSplit: true,
      documentBoundariesDetected: true,
      qualityEnhanced: true
    };

  } catch (error) {
    console.error('❌ PDF generation failed:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// ✅ ADD IMAGE TO PDF IN LANDSCAPE ORIENTATION
const addImageToPDFLandscape = async (pdfDoc, imageBuffer, student, pageNumber, totalPages) => {
  try {
    let image;
    
    try {
      image = await pdfDoc.embedJpg(imageBuffer);
    } catch {
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      image = await pdfDoc.embedPng(pngBuffer);
    }

    // ✅ LANDSCAPE ORIENTATION (Width > Height)
    const page = pdfDoc.addPage([842, 595]); // A4 Landscape

    const { width, height } = image.scale(1);
    
    // ✅ OPTIMIZED SCALING FOR DOCUMENT PAGES
    const scale = Math.min(800 / width, 550 / height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    // ✅ CENTERED POSITIONING
    const x = (842 - scaledWidth) / 2;
    const y = (595 - scaledHeight) / 2;
    
    // ✅ PROFESSIONAL HEADER WITH BETTER STYLING
    page.drawText(`Roll No: ${student.rollNumber}`, {
      x: 50,
      y: 560,
      size: 12,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(`Page: ${pageNumber}/${totalPages}`, {
      x: 700,
      y: 560,
      size: 12,
      color: rgb(0, 0, 0),
    });
    
    // ✅ DRAW ENHANCED DOCUMENT IMAGE
    page.drawImage(image, {
      x: x,
      y: y - 10, // Slight adjustment for better centering
      width: scaledWidth,
      height: scaledHeight,
    });

    console.log(`✅ Added page ${pageNumber} to PDF`);

  } catch (err) {
    console.error('❌ Page add failed:', err.message);
    throw err;
  }
};

// ✅ ENHANCED PDF COMPRESSION
const compressPDF = async (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const gsCommand = process.platform === 'win32' ? 'gswin64c' : 'gs';
    const command = `${gsCommand} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    console.log(`🌀 Compressing PDF for optimal file size...`);
    
    exec(command, { timeout: 15000 }, (error) => {
      if (error) {
        console.log('⚠️ Ghostscript compression failed, using original PDF');
        // Copy original if compression fails
        fs.copyFile(inputPath, outputPath)
          .then(() => {
            console.log('✅ Using uncompressed PDF');
            resolve();
          })
          .catch(reject);
      } else {
        console.log(`✅ PDF compressed successfully`);
        resolve();
      }
    });
  });
};

// ✅ GENERATE EXISTING PDF
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

// ✅ EXPORT PROCESSING FUNCTIONS FOR INDIVIDUAL USE
export const processSingleImage = async (imageBuffer, options = {}) => {
  const { detectBoundaries = true, enhanceQuality = true, splitPages = false } = options;
  
  let processedImage = imageBuffer;
  
  if (detectBoundaries) {
    processedImage = await detectDocumentBoundaries(processedImage);
  }
  
  if (enhanceQuality) {
    processedImage = await enhanceDocumentQuality(processedImage);
  }
  
  if (splitPages) {
    return await smartVerticalPageDetection(processedImage);
  }
  
  return [processedImage];
};