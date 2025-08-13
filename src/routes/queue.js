const express = require("express");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { fileProcessingQueue, noteGenerationQueue } = require("../config/queue");
const { pool } = require("../config/database");

const router = express.Router();

// All queue routes require authentication and admin role
router.use(authenticateToken, requireAdmin);

// Get queue status and statistics
router.get("/status", async (req, res) => {
  try {
    // Get queue counts
    const fileQueueCounts = await fileProcessingQueue.getJobCounts();
    const noteQueueCounts = await noteGenerationQueue.getJobCounts();

    // Get recent jobs
    const recentFileJobs = await fileProcessingQueue.getJobs(
      ["active", "waiting", "delayed"],
      0,
      10
    );
    const recentNoteJobs = await noteGenerationQueue.getJobs(
      ["active", "waiting", "delayed"],
      0,
      10
    );

    // Get failed jobs
    const failedFileJobs = await fileProcessingQueue.getJobs(["failed"], 0, 10);
    const failedNoteJobs = await noteGenerationQueue.getJobs(["failed"], 0, 10);

    // Get database task status
    const taskStats = await pool.query(`
      SELECT 
        task_type,
        status,
        COUNT(*) as count
      FROM tasks
      GROUP BY task_type, status
    `);

    const taskStatus = {};
    taskStats.rows.forEach((row) => {
      if (!taskStatus[row.task_type]) {
        taskStatus[row.task_type] = {};
      }
      taskStatus[row.task_type][row.status] = row.count;
    });

    res.json({
      fileProcessingQueue: {
        counts: fileQueueCounts,
        recentJobs: recentFileJobs.map((job) => ({
          id: job.id,
          data: job.data,
          status: job.status,
          progress: job.progress(),
          timestamp: job.timestamp,
        })),
        failedJobs: failedFileJobs.map((job) => ({
          id: job.id,
          data: job.data,
          status: job.status,
          failedReason: job.failedReason,
          timestamp: job.timestamp,
        })),
      },
      noteGenerationQueue: {
        counts: noteQueueCounts,
        recentJobs: recentNoteJobs.map((job) => ({
          id: job.id,
          data: job.data,
          status: job.status,
          progress: job.progress(),
          timestamp: job.timestamp,
        })),
        failedJobs: failedNoteJobs.map((job) => ({
          id: job.id,
          data: job.data,
          status: job.status,
          failedReason: job.failedReason,
          timestamp: job.timestamp,
        })),
      },
      databaseTasks: taskStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Queue status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get detailed job information
router.get("/job/:queueName/:jobId", async (req, res) => {
  try {
    const { queueName, jobId } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobData = {
      id: job.id,
      data: job.data,
      status: job.status,
      progress: job.progress(),
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      delay: job.delay,
      priority: job.priority,
      opts: job.opts,
    };

    res.json({ job: jobData });
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Retry failed job
router.post("/job/:queueName/:jobId/retry", async (req, res) => {
  try {
    const { queueName, jobId } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.status !== "failed") {
      return res.status(400).json({ error: "Job is not in failed state" });
    }

    await job.retry();

    // Update database task status
    if (job.data.fileId) {
      await pool.query(
        `
        UPDATE tasks 
        SET status = 'pending', attempts = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE file_id = $1 AND task_type = 'file_processing'
      `,
        [job.data.fileId]
      );
    }

    res.json({ message: "Job retry initiated successfully" });
  } catch (error) {
    console.error("Retry job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove job from queue
router.delete("/job/:queueName/:jobId", async (req, res) => {
  try {
    const { queueName, jobId } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    await job.remove();

    // Update database task status if it's a file processing job
    if (job.data.fileId && queueName === "file-processing") {
      await pool.query(
        `
        UPDATE tasks 
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE file_id = $1 AND task_type = 'file_processing'
      `,
        [job.data.fileId]
      );
    }

    res.json({ message: "Job removed successfully" });
  } catch (error) {
    console.error("Remove job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Pause queue
router.post("/:queueName/pause", async (req, res) => {
  try {
    const { queueName } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    await queue.pause();
    res.json({ message: `${queueName} queue paused successfully` });
  } catch (error) {
    console.error("Pause queue error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Resume queue
router.post("/:queueName/resume", async (req, res) => {
  try {
    const { queueName } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    await queue.resume();
    res.json({ message: `${queueName} queue resumed successfully` });
  } catch (error) {
    console.error("Resume queue error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clear completed jobs
router.delete("/:queueName/clear-completed", async (req, res) => {
  try {
    const { queueName } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    const completedJobs = await queue.getJobs(["completed"], 0, -1);
    let clearedCount = 0;

    for (const job of completedJobs) {
      await job.remove();
      clearedCount++;
    }

    res.json({
      message: `Cleared ${clearedCount} completed jobs from ${queueName} queue`,
      clearedCount,
    });
  } catch (error) {
    console.error("Clear completed jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clear failed jobs
router.delete("/:queueName/clear-failed", async (req, res) => {
  try {
    const { queueName } = req.params;

    let queue;
    if (queueName === "file-processing") {
      queue = fileProcessingQueue;
    } else if (queueName === "note-generation") {
      queue = noteGenerationQueue;
    } else {
      return res.status(400).json({ error: "Invalid queue name" });
    }

    const failedJobs = await queue.getJobs(["failed"], 0, -1);
    let clearedCount = 0;

    for (const job of failedJobs) {
      await job.remove();
      clearedCount++;
    }

    res.json({
      message: `Cleared ${clearedCount} failed jobs from ${queueName} queue`,
      clearedCount,
    });
  } catch (error) {
    console.error("Clear failed jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
