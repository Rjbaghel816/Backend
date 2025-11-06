import mongoose from 'mongoose';

const scannedPageSchema = new mongoose.Schema({
  pageNumber: { 
    type: Number, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
}, { _id: true });

const studentSchema = new mongoose.Schema({
  rollNumber: { 
    type: String, 
    required: true, 
    trim: true,
    index: true 
  },
  subjectCode: { 
    type: String, 
    required: true, 
    trim: true 
  },
  subjectName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  status: { 
  type: String, 
  enum: ['Pending', 'Present', 'Absent', 'Missing'],  // ✅ Added "Missing"
  default: 'Pending' 
},

  remark: { 
    type: String, 
    default: '' 
  },
  scannedPages: [scannedPageSchema],
  isScanned: { 
    type: Boolean, 
    default: false 
  },
  scanTime: { 
    type: Date 
  },
  // PDF file reference
  pdfPath: {
    type: String,
    default: null
  },
  pdfGeneratedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
studentSchema.index({ rollNumber: 1, subjectCode: 1 });
studentSchema.index({ status: 1, isScanned: 1 });

// Virtual for pages count
studentSchema.virtual('pagesCount').get(function() {
  return this.scannedPages.length;
});

// Update isScanned based on scannedPages
studentSchema.pre('save', function(next) {
  // Auto-update isScanned based on scannedPages
  if (this.scannedPages && this.scannedPages.length > 0) {
    this.isScanned = true;
    if (!this.scanTime) {
      this.scanTime = new Date();
    }
  } else {
    this.isScanned = false;
    this.scanTime = null;
    this.pdfPath = null;
    this.pdfGeneratedAt = null;
  }
  
  next();
});

export default mongoose.model('Student', studentSchema);