const express = require("express");
const { optionalAuth } = require("../middleware/auth");
const {
  upload,
  handleUploadError,
  cleanupTempFile,
  moveToUploads,
} = require("../middleware/upload");
const { pool } = require("../config/database");
const { fileProcessingQueue } = require("../config/queue");
const path = require("path");
const fs = require("fs-extra");

const router = express.Router();

// File upload endpoint - allows both authenticated and anonymous uploads
router.post(
  "/",
  optionalAuth,
  upload.single("file"),
  async (req, res) => {
    let tempFilePath = null;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { file } = req;
      tempFilePath = file.path;

      // File info
      const fileInfo = {
        filename: file.filename,
        originalName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        userId: null, // Will be set below
      };

      // Handle anonymous uploads (no user authentication)
      let userId = null;
      if (req.user) {
        userId = req.user.id;
        fileInfo.userId = userId;
        console.log(`📁 Authenticated upload by user ${req.user.email}: ${fileInfo.originalName} (${fileInfo.filename})`);
      } else {
        console.log(`📁 Anonymous upload: ${fileInfo.originalName} (${fileInfo.filename})`);
      }

      console.log(
        `📁 File uploaded: ${fileInfo.originalName} (${fileInfo.filename})`
      );

      // Move file from temp to uploads directory
      const uploadPath = await moveToUploads(tempFilePath, fileInfo.filename);
      tempFilePath = null; // Clear temp path since file was moved

      // Save file info to database
      const fileResult = await pool.query(
        `
      INSERT INTO files (filename, original_name, file_path, file_size, file_type, user_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'uploaded')
      RETURNING id
    `,
        [
          fileInfo.filename,
          fileInfo.originalName,
          uploadPath,
          fileInfo.fileSize,
          fileInfo.fileType,
          userId,
        ]
      );

      const fileId = fileResult.rows[0].id;

      // Create task in database
      await pool.query(
        `
      INSERT INTO tasks (file_id, user_id, task_type, status, priority)
      VALUES ($1, $2, 'file_processing', 'pending', 1)
    `,
        [fileId, userId]
      );

      // Add job to processing queue
      await fileProcessingQueue.add(
        "process-file",
        {
          fileId,
          filename: fileInfo.filename,
          originalName: fileInfo.originalName,
          filePath: uploadPath,
          fileSize: fileInfo.fileSize,
          fileType: fileInfo.fileType,
          userId: userId,
        },
        {
          priority: 1,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        }
      );

      // Send file URL to Make.com webhook
      const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
      if (makeWebhookUrl) {
        try {
          const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${
            fileInfo.filename
          }`;

          // Make.com webhook without authentication (public webhook)
          const response = await fetch(makeWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileId,
              fileUrl,
              originalName: fileInfo.originalName,
              fileSize: fileInfo.fileSize,
              fileType: fileInfo.fileType,
              userId: userId,
              timestamp: new Date().toISOString(),
            }),
          });

          if (response.ok) {
            console.log(
              `✅ File sent to Make.com successfully: ${fileInfo.filename}`
            );

            // Update task status
            await pool.query(
              `
            UPDATE tasks SET status = 'sent_to_make', updated_at = CURRENT_TIMESTAMP
            WHERE file_id = $1 AND task_type = 'file_processing'
          `,
              [fileId]
            );
          } else {
            console.error(
              `❌ Failed to send file to Make.com: ${response.status} ${response.statusText}`
            );

            // Update task status
            await pool.query(
              `
            UPDATE tasks SET status = 'make_error', error_message = $1, updated_at = CURRENT_TIMESTAMP
            WHERE file_id = $2 AND task_type = 'file_processing'
          `,
              [
                `Make.com webhook failed: ${response.status} ${response.statusText}`,
                fileId,
              ]
            );
          }
        } catch (webhookError) {
          console.error(`❌ Error sending file to Make.com:`, webhookError);

          // Update task status
          await pool.query(
            `
          UPDATE tasks SET status = 'make_error', error_message = $1, updated_at = CURRENT_TIMESTAMP
          WHERE file_id = $2 AND task_type = 'file_processing'
        `,
            [`Make.com webhook error: ${webhookError.message}`, fileId]
          );
        }
      }

      res.json({
        message: "File uploaded successfully",
        file: {
          id: fileId,
          filename: fileInfo.filename,
          originalName: fileInfo.originalName,
          fileSize: fileInfo.fileSize,
          fileType: fileInfo.fileType,
          status: "uploaded",
        },
      });
    } catch (error) {
      console.error("File upload error:", error);

      // Clean up temp file if it exists
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
      }

      res.status(500).json({
        error: "File upload failed",
        message: error.message || "An error occurred during file upload",
      });
    }
  },
  handleUploadError
);

// Get upload status
router.get("/status/:fileId", optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    const fileResult = await pool.query(
      `
      SELECT f.*, t.status as task_status, t.error_message
      FROM files f
      LEFT JOIN tasks t ON f.id = t.file_id AND t.task_type = 'file_processing'
      WHERE f.id = $1 AND f.user_id = $2
    `,
      [fileId, req.user ? req.user.id : null] // Pass null for anonymous users
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];

    res.json({
      file: {
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        fileSize: file.file_size,
        fileType: file.file_type,
        status: file.status,
        taskStatus: file.task_status,
        errorMessage: file.error_message,
        createdAt: file.created_at,
      },
    });
  } catch (error) {
    console.error("Get upload status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete uploaded file (HIPAA compliance)
router.delete("/:fileId", optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info
    const fileResult = await pool.query(
      `
      SELECT * FROM files WHERE id = $1 AND user_id = $2
    `,
      [fileId, req.user ? req.user.id : null] // Pass null for anonymous users
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];

    // Delete physical file
    if (fs.existsSync(file.file_path)) {
      await fs.remove(file.file_path);
      console.log(`🗑️ Deleted file: ${file.file_path}`);
    }

    // Delete from database
    await pool.query("DELETE FROM files WHERE id = $1", [fileId]);
    await pool.query("DELETE FROM tasks WHERE file_id = $1", [fileId]);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
