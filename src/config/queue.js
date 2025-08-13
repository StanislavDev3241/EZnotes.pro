const Queue = require("bull");
const redisClient = require("./redis");

// Create queues
const fileProcessingQueue = new Queue("file-processing", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const noteGenerationQueue = new Queue("note-generation", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Queue event handlers
fileProcessingQueue.on("completed", (job, result) => {
  console.log(
    `✅ File processing job ${job.id} completed for file: ${result.filename}`
  );
});

fileProcessingQueue.on("failed", (job, err) => {
  console.error(
    `❌ File processing job ${job.id} failed for file: ${job.data.filename}:`,
    err.message
  );
});

fileProcessingQueue.on("stalled", (job) => {
  console.warn(
    `⚠️ File processing job ${job.id} stalled for file: ${job.data.filename}`
  );
});

noteGenerationQueue.on("completed", (job, result) => {
  console.log(
    `✅ Note generation job ${job.id} completed for file: ${result.filename}`
  );
});

noteGenerationQueue.on("failed", (job, err) => {
  console.error(
    `❌ Note generation job ${job.id} failed for file: ${job.data.filename}:`,
    err.message
  );
});

noteGenerationQueue.on("stalled", (job) => {
  console.warn(
    `⚠️ Note generation job ${job.id} stalled for file: ${job.data.filename}`
  );
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await fileProcessingQueue.close();
  await noteGenerationQueue.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await fileProcessingQueue.close();
  await noteGenerationQueue.close();
  process.exit(0);
});

module.exports = {
  fileProcessingQueue,
  noteGenerationQueue,
};
