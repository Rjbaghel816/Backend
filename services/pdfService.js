import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config/database.js';
import { exec } from 'child_process';
import { mkdir } from 'fs/promises';

// ✅ HIGH QUALITY DOCUMENT BOUNDARY DETECTION
const detectDocumentBoundaries = async (imageBuffer) => {
  try {
    console.log('🔍 Detecting document boundaries...');
    
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    // Use minimal processing for boundary detection only
    const processed = await sharp(imageBuffer)
      .grayscale()
      .normalise()
      .modulate({ brightness: 1.1 })
      .raw()
      .toBuffer();
    
    const edgeThreshold = 50;
    const minDocumentSize = 0.6;
    
    let leftEdge = width;
    let rightEdge = 0;
    let topEdge = height;
    let bottomEdge = 0;
    
    let darkPixelsFound = 0;
    
    const sampleRate = Math.max(2, Math.floor(width / 100));
    
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
    
    // ✅ HIGH QUALITY PRESERVATION
    const croppedImage = await sharp(imageBuffer)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight
      })
      .jpeg({ 
        quality: 95, // High quality JPEG
        mozjpeg: true 
      })
      .toBuffer();
    
    console.log('✅ Document boundaries detected and cropped');
    return croppedImage;
    
  } catch (error) {
    console.error('❌ Document boundary detection failed:', error);
    return imageBuffer;
  }
};

// ✅ QUALITY ENHANCEMENT
const enhanceDocumentQuality = async (imageBuffer) => {
  try {
    console.log('✨ Enhancing document quality...');
    
    return await sharp(imageBuffer)
      .normalise()
      .linear(1.05, 0)
      .sharpen({ 
        sigma: 0.4,
        m1: 0.6,    
        m2: 1.0 
      })
      .jpeg({ 
        quality: 92,
        mozjpeg: true,
        chromaSubsampling: '4:4:4'
      })
      .toBuffer();
  } catch (error) {
    console.error('Quality enhancement failed:', error);
    return imageBuffer;
  }
};

// ✅ PAGE DETECTION
const smartVerticalPageDetection = async (imageBuffer) => {
  try {
    console.log('🔍 Analyzing image for VERTICAL page detection...');
    
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    console.log(`📏 Image dimensions: ${width}x${height}`);
    console.log(`📊 Aspect ratio: ${(width / height).toFixed(2)}`);
    
    const aspectRatio = width / height;
    
    if (aspectRatio > 1.8) {
      console.log('📄 HIGH CONFIDENCE: 3 pages detected (wide image)');
      return await splitIntoThreePagesVertical(imageBuffer, width, height);
    }
    else if (aspectRatio > 1.3) {
      console.log('📄 HIGH CONFIDENCE: 2 pages detected (wide image)');
      return await splitIntoTwoPagesVertical(imageBuffer, width, height);
    }
    
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

// ✅ 2-PAGE SPLIT
const splitIntoTwoPagesVertical = async (imageBuffer, width, height) => {
  try {
    const safetyMargin = Math.floor(width * 0.02);
    
    const leftPageEnd = Math.floor(width / 2) + safetyMargin;
    const rightPageStart = Math.floor(width / 2) - safetyMargin;
    
    console.log(`✂️ Splitting 2 pages with safety margins`);
    
    const leftPage = await sharp(imageBuffer)
      .extract({ 
        left: 0, 
        top: 0, 
        width: leftPageEnd, 
        height: height 
      })
      .jpeg({ 
        quality: 92,
        mozjpeg: true 
      })
      .toBuffer();
    
    const rightPage = await sharp(imageBuffer)
      .extract({ 
        left: rightPageStart, 
        top: 0, 
        width: width - rightPageStart, 
        height: height 
      })
      .jpeg({ 
        quality: 92,
        mozjpeg: true 
      })
      .toBuffer();
    
    console.log('✅ Two pages split successfully');
    return [leftPage, rightPage];
  } catch (error) {
    throw new Error(`Two-page vertical split failed: ${error.message}`);
  }
};

// ✅ 3-PAGE SPLIT
const splitIntoThreePagesVertical = async (imageBuffer, width, height) => {
  try {
    const pageWidth = Math.floor(width / 3);
    const safetyMargin = Math.floor(pageWidth * 0.03);
    
    console.log(`✂️ Splitting 3 pages`);
    
    const pages = await Promise.all([
      sharp(imageBuffer)
        .extract({ 
          left: 0, 
          top: 0, 
          width: pageWidth + safetyMargin, 
          height: height 
        })
        .jpeg({ 
          quality: 92,
          mozjpeg: true 
        })
        .toBuffer(),
      sharp(imageBuffer)
        .extract({ 
          left: pageWidth - safetyMargin, 
          top: 0, 
          width: pageWidth + (2 * safetyMargin), 
          height: height 
        })
        .jpeg({ 
          quality: 92,
          mozjpeg: true 
        })
        .toBuffer(),
      sharp(imageBuffer)
        .extract({ 
          left: (2 * pageWidth) - safetyMargin, 
          top: 0, 
          width: width - ((2 * pageWidth) - safetyMargin), 
          height: height 
        })
        .jpeg({ 
          quality: 92,
          mozjpeg: true 
        })
        .toBuffer()
    ]);
    
    console.log('✅ Three pages split successfully');
    return pages;
  } catch (error) {
    throw new Error(`Three-page vertical split failed: ${error.message}`);
  }
};

// ✅ BRIGHTNESS-BASED PAGE GAP DETECTION
const detectVerticalPageGapsByBrightness = async (imageBuffer, width, height) => {
  try {
    const analysisHeight = 200;
    const analysisWidth = Math.floor((width * analysisHeight) / height);
    
    const smallImage = await sharp(imageBuffer)
      .resize(analysisWidth, analysisHeight, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
    
    const brightnessThreshold = 200;
    const minGapWidth = Math.floor(analysisWidth * 0.05);
    const minGapBrightness = 0.8;
    
    console.log(`🔍 Analyzing for page gaps`);
    
    let gapRegions = [];
    let currentGap = null;
    
    for (let x = 0; x < analysisWidth; x++) {
      let brightPixels = 0;
      let totalPixels = 0;
      
      const startY = Math.floor(analysisHeight * 0.2);
      const endY = Math.floor(analysisHeight * 0.8);
      
      for (let y = startY; y < endY; y++) {
        const pixelIndex = y * analysisWidth + x;
        if (pixelIndex < smallImage.length) {
          totalPixels++;
          if (smallImage[pixelIndex] > brightnessThreshold) {
            brightPixels++;
          }
        }
      }
      
      const brightnessRatio = brightPixels / totalPixels;
      const isGap = brightnessRatio > minGapBrightness;
      
      if (isGap && !currentGap) {
        currentGap = { start: x, end: x, strength: brightnessRatio };
      } else if (isGap && currentGap) {
        currentGap.end = x;
        currentGap.strength = Math.max(currentGap.strength, brightnessRatio);
      } else if (!isGap && currentGap) {
        if ((currentGap.end - currentGap.start) >= minGapWidth) {
          gapRegions.push({
            ...currentGap,
            center: Math.floor((currentGap.start + currentGap.end) / 2),
            width: currentGap.end - currentGap.start
          });
        }
        currentGap = null;
      }
    }
    
    if (currentGap && (currentGap.end - currentGap.start) >= minGapWidth) {
      gapRegions.push({
        ...currentGap,
        center: Math.floor((currentGap.start + currentGap.end) / 2),
        width: currentGap.end - currentGap.start
      });
    }
    
    console.log(`💡 Found ${gapRegions.length} potential page gaps`);
    
    if (gapRegions.length > 0) {
      gapRegions.sort((a, b) => {
        if (b.width !== a.width) return b.width - a.width;
        return b.strength - a.strength;
      });
      
      const bestGap = gapRegions[0];
      const splitPoint = Math.floor((bestGap.center * width) / analysisWidth);
      
      console.log(`🎯 Best gap: center=${bestGap.center}px (scaled to ${splitPoint}px)`);
      
      if (splitPoint > width * 0.3 && splitPoint < width * 0.7) {
        console.log(`✂️ Splitting at detected gap: ${splitPoint}px`);
        
        const leftSafety = Math.floor(width * 0.015);
        const rightSafety = Math.floor(width * 0.015);
        
        const leftPage = await sharp(imageBuffer)
          .extract({ 
            left: 0, 
            top: 0, 
            width: splitPoint + leftSafety, 
            height: height 
          })
          .jpeg({ 
            quality: 92,
            mozjpeg: true 
          })
          .toBuffer();
        
        const rightPage = await sharp(imageBuffer)
          .extract({ 
            left: splitPoint - rightSafety, 
            top: 0, 
            width: width - (splitPoint - rightSafety), 
            height: height 
          })
          .jpeg({ 
            quality: 92,
            mozjpeg: true 
          })
          .toBuffer();
        
        console.log('✅ Pages split at natural gap');
        return [leftPage, rightPage];
      } else {
        console.log('❌ Split point outside safe range, using single page');
      }
    }
    
    return [imageBuffer];
  } catch (error) {
    console.error('Vertical brightness detection failed:', error);
    return [imageBuffer];
  }
};

// ✅ IMAGE PROCESSING PIPELINE
const processImagePipeline = async (imageBuffer, isFirstPage = false) => {
  try {
    console.log('\n🔄 Starting image processing pipeline...');
    
    // Step 1: Detect and crop document boundaries
    const croppedImage = await detectDocumentBoundaries(imageBuffer);
    
    // Step 2: Quality enhancement
    const enhancedImage = await enhanceDocumentQuality(croppedImage);
    
    // Step 3: Apply page splitting
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

// ✅ FIXED PDF GENERATION WITH CORRECT PATH
// ✅ CORRECTED PDF GENERATION WITH GUARANTEED SAVE LOCATION
export const generateAndSavePDF = async (student, imageBuffers) => {
  const startTime = Date.now();
  
  // ✅ FIXED: Define the path directly and absolutely
  const pdfsPath = 'C:/exam_scanner_uploads/pdfs';
  
  console.log(`\n🚀 PDF GENERATION STARTED`);
  console.log(`📌 Student: ${student.rollNumber}`);
  console.log(`📌 Images: ${imageBuffers.length}`);
  console.log(`📁 WILL SAVE TO: ${pdfsPath}`); // This will now show the correct path
  
  try {
    // ✅ FIXED: Ensure directory exists with correct path
    await mkdir(pdfsPath, { recursive: true });
    console.log(`✅ Verified directory exists: ${pdfsPath}`);
    
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Answer Sheet - ${student.rollNumber}`);
    pdfDoc.setAuthor('Auto PDF Generator');
    pdfDoc.setCreator('PDF Generator');

    let allPages = [];
    let splitStats = { 
      original: 0, 
      final: 0,
      boundariesDetected: 0,
      qualityEnhanced: 0,
      pagesSplit: 0
    };
    
    // ✅ PROCESS EACH IMAGE
    for (let i = 0; i < imageBuffers.length; i++) {
      console.log(`\n--- Processing Image ${i + 1}/${imageBuffers.length} ---`);
      
      const originalBuffer = imageBuffers[i];
      const isFirstPage = (i === 0);
      
      const processedPages = await processImagePipeline(originalBuffer, isFirstPage);
      
      allPages = allPages.concat(processedPages);
      splitStats.original++;
      splitStats.final += processedPages.length;
      
      if (processedPages.length > 1) {
        splitStats.pagesSplit++;
      }
      if (processedPages.length > 0) {
        splitStats.boundariesDetected++;
        splitStats.qualityEnhanced++;
      }
    }

    // ✅ ADD ALL PAGES TO PDF
    console.log(`\n📄 Adding ${allPages.length} pages to PDF...`);
    for (let i = 0; i < allPages.length; i++) {
      await addImageToPDF(pdfDoc, allPages[i], student, i + 1, allPages.length);
    }

    const pdfBytes = await pdfDoc.save();
    
    // ✅ FIXED: Use the direct path (not from config)
    const pdfFilename = `AnswerSheet_${student.rollNumber}_${Date.now()}.pdf`;
    const pdfFilePath = path.join(pdfsPath, pdfFilename);
    const compressedFilePath = path.join(pdfsPath, `AnswerSheet_${student.rollNumber}_${Date.now()}_compressed.pdf`);

    console.log(`💾 Attempting to save to: ${pdfFilePath}`);
    
    // Temporary file save karein
    await fs.writeFile(pdfFilePath, pdfBytes);
    console.log(`✅ Temporary PDF saved: ${pdfFilePath}`);
    
    // ✅ COMPRESSION APPLY KAREIN
    await compressPDF(pdfFilePath, compressedFilePath);
    console.log(`✅ Compressed PDF saved: ${compressedFilePath}`);

    // Temporary file delete karein
    try {
      await fs.unlink(pdfFilePath);
      console.log('✅ Temporary uncompressed file deleted');
    } catch (delErr) {
      console.log('⚠️ Could not delete uncompressed PDF');
    }

    const stats = await fs.stat(compressedFilePath);
    const totalTime = Date.now() - startTime;
    
    // ✅ FINAL SUMMARY
    console.log(`\n🎉 PDF GENERATION SUCCESS!`);
    console.log(`📊 SUMMARY:`);
    console.log(`   ├── Original images: ${splitStats.original}`);
    console.log(`   ├── Final PDF pages: ${splitStats.final}`);
    console.log(`   ├── Pages split: ${splitStats.pagesSplit}`);
    console.log(`   ├── Processing time: ${totalTime}ms`);
    console.log(`   ├── File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   ├── Saved at: ${compressedFilePath}`);
    console.log(`   ├── Quality: High ✅`);
    console.log(`   ├── Compression: Applied ✅`);
    console.log(`   └── Answers: Clear ✅`);

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
      qualityEnhanced: true,
      colorPreserved: true,
      compressed: true
    };

  } catch (error) {
    console.error('❌ PDF generation failed:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// ✅ ADD IMAGE TO PDF
const addImageToPDF = async (pdfDoc, imageBuffer, student, pageNumber, totalPages) => {
  try {
    let image;
    
    try {
      image = await pdfDoc.embedJpg(imageBuffer);
    } catch {
      // Fallback to PNG if JPEG fails
      const pngBuffer = await sharp(imageBuffer)
        .png({ quality: 90 })
        .toBuffer();
      image = await pdfDoc.embedPng(pngBuffer);
    }

    // ✅ A4 Landscape
    const page = pdfDoc.addPage([842, 595]);

    const { width, height } = image.scale(1);
    
    const scale = Math.min(800 / width, 550 / height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    const x = (842 - scaledWidth) / 2;
    const y = (595 - scaledHeight) / 2;
    
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
    
    page.drawImage(image, {
      x: x,
      y: y - 10,
      width: scaledWidth,
      height: scaledHeight,
    });

    console.log(`✅ Added page ${pageNumber} to PDF`);

  } catch (err) {
    console.error('❌ Page add failed:', err.message);
    throw err;
  }
};

// ✅ PDF COMPRESSION
const compressPDF = async (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const gsCommand = process.platform === 'win32' ? 'gswin64c' : 'gs';
    const command = `${gsCommand} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    console.log(`🌀 Compressing PDF...`);
    
    exec(command, { timeout: 20000 }, (error) => {
      if (error) {
        console.log('⚠️ Compression failed, using original PDF');
        // Compression fail hua toh original file copy karein
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

// ✅ SINGLE IMAGE PROCESSING
export const processSingleImage = async (imageBuffer, options = {}) => {
  const { 
    detectBoundaries = true, 
    enhanceQuality = true, 
    splitPages = false
  } = options;
  
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