const { fileProcessingQueue, noteGenerationQueue } = require("../config/queue");
const { pool } = require("../config/database");
const fs = require("fs-extra");
const path = require("path");

// File processing queue processor
fileProcessingQueue.process("process-file", async (job) => {
  const {
    fileId,
    filename,
    originalName,
    filePath,
    fileSize,
    fileType,
    userId,
  } = job.data;

  try {
    console.log(`🔄 Processing file: ${originalName} (${filename})`);

    // Update task status to processing
    await pool.query(
      `
      UPDATE tasks 
      SET status = 'processing', updated_at = CURRENT_TIMESTAMP
      WHERE file_id = $1 AND task_type = 'file_processing'
    `,
      [fileId]
    );

    // Update file status
    await pool.query(
      `
      UPDATE files 
      SET status = 'processing', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [fileId]
    );

    // Simulate file processing (in real implementation, this would be actual processing)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Update progress
    job.progress(50);

    // Additional processing steps would go here
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Update progress
    job.progress(100);

    // Update task status to completed
    await pool.query(
      `
      UPDATE tasks 
      SET status = 'completed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE file_id = $1 AND task_type = 'file_processing'
    `,
      [fileId]
    );

    // Update file status
    await pool.query(
      `
      UPDATE files 
      SET status = 'ready_for_notes', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [fileId]
    );

    console.log(`✅ File processing completed: ${originalName}`);

    return {
      fileId,
      filename,
      originalName,
      status: "ready_for_notes",
    };
  } catch (error) {
    console.error(`❌ File processing failed: ${originalName}:`, error);

    // Update task status to failed
    await pool.query(
      `
      UPDATE tasks 
      SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP
      WHERE file_id = $1 AND task_type = 'file_processing'
    `,
      [error.message]
    );

    // Update file status
    await pool.query(
      `
      UPDATE files 
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
      [fileId]
    );

    throw error;
  }
});

// Note generation queue processor
noteGenerationQueue.process("notify-admin", async (job) => {
  const { fileId, filename, originalName, userId, noteType, noteId } = job.data;

  try {
    console.log(`📝 Processing note generation notification: ${originalName}`);

    // Get user info
    const userResult = await pool.query(
      "SELECT email FROM users WHERE id = $1",
      [userId]
    );
    const userEmail = userResult.rows[0]?.email || "Unknown user";

    // Get note content
    const noteResult = await pool.query(
      "SELECT content FROM notes WHERE id = $1",
      [noteId]
    );
    const noteContent = noteResult.rows[0]?.content || "No content";

    // In a real implementation, this would send notifications to admin
    // For now, we'll just log the information
    console.log(`📧 Admin notification for note generation:`);
    console.log(`   File: ${originalName}`);
    console.log(`   User: ${userEmail}`);
    console.log(`   Note Type: ${noteType}`);
    console.log(`   Note ID: ${noteId}`);

    // Simulate notification processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`✅ Note generation notification processed: ${originalName}`);

    return {
      fileId,
      filename,
      originalName,
      userEmail,
      noteType,
      noteId,
      status: "notification_sent",
    };
  } catch (error) {
    console.error(
      `❌ Note generation notification failed: ${originalName}:`,
      error
    );
    throw error;
  }
});

// Error handlers
fileProcessingQueue.on("error", (error) => {
  console.error("❌ File processing queue error:", error);
});

fileProcessingQueue.on("failed", (job, error) => {
  console.error(`❌ File processing job ${job.id} failed:`, error);
});

noteGenerationQueue.on("error", (error) => {
  console.error("❌ Note generation queue error:", error);
});

noteGenerationQueue.on("failed", (job, error) => {
  console.error(`❌ Note generation job ${job.id} failed:`, error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down queue processors...");
  await fileProcessingQueue.close();
  await noteGenerationQueue.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down queue processors...");
  await fileProcessingQueue.close();
  await noteGenerationQueue.close();
  process.exit(0);
});

console.log("🚀 Queue processors started successfully");

module.exports = {
  fileProcessingQueue,
  noteGenerationQueue,
};
