const express = require("express");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { pool } = require("../config/database");
const fs = require("fs-extra");
const path = require("path");

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken, requireAdmin);

// Get all files and notes (admin dashboard)
router.get("/dashboard", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      noteType,
      dateFrom,
      dateTo,
    } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    let params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND f.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (noteType) {
      whereClause += ` AND n.note_type = $${paramIndex}`;
      params.push(noteType);
      paramIndex++;
    }

    if (dateFrom) {
      whereClause += ` AND f.created_at >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereClause += ` AND f.created_at <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `
      SELECT COUNT(DISTINCT f.id) as total
      FROM files f
      LEFT JOIN notes n ON f.id = n.file_id
      ${whereClause}
    `,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get files with notes and user info
    const result = await pool.query(
      `
      SELECT f.*, 
             u.email as user_email,
             n.id as note_id, 
             n.note_type, 
             n.content, 
             n.created_at as note_created_at,
             t.status as task_status,
             t.error_message
      FROM files f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN notes n ON f.id = n.file_id
      LEFT JOIN tasks t ON f.id = t.file_id AND t.task_type = 'file_processing'
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
      [...params, limit, offset]
    );

    const files = result.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      fileSize: row.file_size,
      fileType: row.file_type,
      status: row.status,
      userEmail: row.user_email,
      taskStatus: row.task_status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      notes: row.note_id
        ? [
            {
              id: row.note_id,
              type: row.note_type,
              content: JSON.parse(row.content),
              createdAt: row.note_created_at,
            },
          ]
        : [],
    }));

    // Get summary statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_files,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
        COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as pending_files
      FROM files
    `);

    const stats = statsResult.rows[0];

    res.json({
      files,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all notes for admin
router.get("/notes", async (req, res) => {
  try {
    const { page = 1, limit = 20, noteType, dateFrom, dateTo } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    let params = [];
    let paramIndex = 1;

    if (noteType) {
      whereClause += ` AND n.note_type = $${paramIndex}`;
      params.push(noteType);
      paramIndex++;
    }

    if (dateFrom) {
      whereClause += ` AND n.created_at >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereClause += ` AND n.created_at <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `
      SELECT COUNT(*) as total
      FROM notes n
      ${whereClause}
    `,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get notes with file and user info
    const result = await pool.query(
      `
      SELECT n.*, 
             f.original_name,
             f.file_size,
             f.file_type,
             u.email as user_email
      FROM notes n
      JOIN files f ON n.file_id = f.id
      JOIN users u ON n.user_id = u.id
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
      [...params, limit, offset]
    );

    const notes = result.rows.map((row) => ({
      id: row.id,
      type: row.note_type,
      content: JSON.parse(row.content),
      status: row.status,
      createdAt: row.created_at,
      retentionDate: row.retention_date,
      file: {
        id: row.file_id,
        originalName: row.original_name,
        fileSize: row.file_size,
        fileType: row.file_type,
      },
      user: {
        id: row.user_id,
        email: row.user_email,
      },
    }));

    res.json({
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin notes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Download all notes as ZIP (admin only)
router.get("/download-all", async (req, res) => {
  try {
    const { noteType, dateFrom, dateTo } = req.query;

    let whereClause = "WHERE 1=1";
    let params = [];

    if (noteType) {
      whereClause += ` AND n.note_type = $1`;
      params.push(noteType);
    }

    if (dateFrom) {
      whereClause += ` AND n.created_at >= $${params.length + 1}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClause += ` AND n.created_at <= $${params.length + 1}`;
      params.push(dateTo);
    }

    // Get notes
    const result = await pool.query(
      `
      SELECT n.*, 
             f.original_name,
             u.email as user_email
      FROM notes n
      JOIN files f ON n.file_id = f.id
      JOIN users u ON n.user_id = u.id
      ${whereClause}
      ORDER BY n.created_at DESC
    `,
      params
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No notes found for the specified criteria" });
    }

    // Create ZIP file (simplified - in production, use a proper ZIP library)
    let zipContent = "";

    result.rows.forEach((row, index) => {
      const content = JSON.parse(row.content);
      const timestamp = new Date(row.created_at).toISOString().split("T")[0];
      const filename = `${timestamp}_${
        row.note_type
      }_${row.original_name.replace(/\.[^/.]+$/, "")}.txt`;

      zipContent += `=== ${filename} ===\n`;
      zipContent += `User: ${row.user_email}\n`;
      zipContent += `Generated: ${new Date(row.created_at).toLocaleString()}\n`;
      zipContent += `\n${"=".repeat(50)}\n\n`;

      if (typeof content === "object") {
        Object.entries(content).forEach(([key, value]) => {
          zipContent += `${key.toUpperCase()}:\n${value}\n\n`;
        });
      } else {
        zipContent += content;
      }

      zipContent += "\n\n";
    });

    const timestamp = new Date().toISOString().split("T")[0];
    const zipFilename = `admin_notes_${timestamp}.txt`;

    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFilename}"`
    );
    res.send(zipContent);
  } catch (error) {
    console.error("Admin download all error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update note retention period
router.put("/notes/:noteId/retention", async (req, res) => {
  try {
    const { noteId } = req.params;
    const { retentionDays } = req.body;

    if (!retentionDays || retentionDays < 1) {
      return res.status(400).json({ error: "Valid retention days required" });
    }

    const result = await pool.query(
      `
      UPDATE notes 
      SET retention_date = CURRENT_DATE + INTERVAL '${retentionDays} days',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
    `,
      [noteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json({ message: "Retention period updated successfully" });
  } catch (error) {
    console.error("Update retention error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete expired notes (cleanup)
router.delete("/notes/expired", async (req, res) => {
  try {
    const result = await pool.query(`
      DELETE FROM notes 
      WHERE retention_date < CURRENT_DATE
      RETURNING id
    `);

    const deletedCount = result.rows.length;
    console.log(`🗑️ Deleted ${deletedCount} expired notes`);

    res.json({
      message: `Deleted ${deletedCount} expired notes`,
      deletedCount,
    });
  } catch (error) {
    console.error("Delete expired notes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get system statistics
router.get("/stats", async (req, res) => {
  try {
    // File statistics
    const fileStats = await pool.query(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_files,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
        COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as pending_files,
        SUM(file_size) as total_size_bytes
      FROM files
    `);

    // Note statistics
    const noteStats = await pool.query(`
      SELECT 
        COUNT(*) as total_notes,
        COUNT(CASE WHEN note_type = 'soap' THEN 1 END) as soap_notes,
        COUNT(CASE WHEN note_type = 'summary' THEN 1 END) as summary_notes,
        COUNT(CASE WHEN note_type = 'general' THEN 1 END) as general_notes
      FROM notes
    `);

    // User statistics
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN role = 'user' THEN 1 END) as regular_users
      FROM users
    `);

    // Task statistics
    const taskStats = await pool.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks
      FROM tasks
    `);

    res.json({
      files: fileStats.rows[0],
      notes: noteStats.rows[0],
      users: userStats.rows[0],
      tasks: taskStats.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
