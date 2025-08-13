const Redis = require("redis");

const redisClient = Redis.createClient({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retry_strategy: function (options) {
    if (options.error && options.error.code === "ECONNREFUSED") {
      return new Error("The server refused the connection");
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error("Retry time exhausted");
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  },
});

redisClient.on("connect", () => {
  console.log("🔴 Connected to Redis");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

redisClient.on("ready", () => {
  console.log("✅ Redis is ready");
});

redisClient.on("end", () => {
  console.log("🔴 Redis connection ended");
});

// Graceful shutdown
process.on("SIGINT", () => {
  redisClient.quit();
  process.exit(0);
});

process.on("SIGTERM", () => {
  redisClient.quit();
  process.exit(0);
});

module.exports = redisClient;
