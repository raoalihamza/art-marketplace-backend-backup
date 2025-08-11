// Redis Connection
const Redis = require("redis");
const logger = require("../utils/logger");
const config = require("./config");

const createRedisClient = async () => {
  const client = Redis.createClient({
    url: config.redis.url,
  });

  client.on("error", (err) => {
    logger.error(`Redis client error: ${err}`);
  });

  client.on("ready", () => {
    logger.info("Redis client connected");
  });

  await client.connect();

  return client;
};

module.exports = createRedisClient;