const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");

// Ensure upload directories exist
const uploadDir = process.env.UPLOAD_PATH || "./uploads";
const tempDir = process.env.TEMP_PATH || "./temp";

fs.ensureDirSync(uploadDir);
fs.ensureDirSync(tempDir);

// File filter function
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-m4a",
    "text/plain",
  ];

  // Allowed file extensions
  const allowedExtensions = [".mp3", ".m4a", ".wav", ".txt"];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isValidType = allowedTypes.includes(file.mimetype);
  const isValidExtension = allowedExtensions.includes(fileExtension);

  if (isValidType && isValidExtension) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${allowedExtensions.join(", ")}`
      ),
      false
    );
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in temp directory first
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = path.extname(file.originalname);
    const filename = `${timestamp}_${randomString}${fileExtension}`;
    cb(null, filename);
  },
});

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || "100") * 1024 * 1024, // Convert MB to bytes
    files: 1, // Only allow 1 file per request
  },
});

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        message: `File size exceeds the limit of ${
          process.env.MAX_FILE_SIZE || "100MB"
        }`,
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "Too many files",
        message: "Only one file is allowed per request",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: "Unexpected file field",
        message: 'File field name must be "file"',
      });
    }
  }

  if (error.message && error.message.includes("Invalid file type")) {
    return res.status(400).json({
      error: "Invalid file type",
      message: error.message,
    });
  }

  // Generic error
  return res.status(500).json({
    error: "File upload error",
    message: error.message || "An error occurred during file upload",
  });
};

// Cleanup temporary files
const cleanupTempFile = async (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      await fs.remove(filePath);
      console.log(`🗑️ Cleaned up temporary file: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error cleaning up temporary file ${filePath}:`, error);
  }
};

// Move file from temp to uploads directory
const moveToUploads = async (tempPath, filename) => {
  try {
    const uploadPath = path.join(uploadDir, filename);
    await fs.move(tempPath, uploadPath);
    return uploadPath;
  } catch (error) {
    console.error(`❌ Error moving file from temp to uploads:`, error);
    throw error;
  }
};

module.exports = {
  upload,
  handleUploadError,
  cleanupTempFile,
  moveToUploads,
  uploadDir,
  tempDir,
};
