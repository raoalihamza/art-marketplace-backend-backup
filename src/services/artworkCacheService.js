const Redis = require("redis");
const config = require("../config/config");
const logger = require("../utils/logger");

class ArtworkCacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.initialize();
  }

  async initialize() {
    try {
      this.redis = Redis.createClient({
        url: config.redis.url,
      });

      this.redis.on("error", (err) => {
        logger.error("Redis error:", err);
        this.isConnected = false;
      });

      this.redis.on("connect", () => {
        logger.info("Redis connected for artwork cache");
        this.isConnected = true;
      });

      await this.redis.connect();
    } catch (error) {
      logger.error("Redis connection failed:", error);
      this.isConnected = false;
    }
  }

  // Cache artwork list
  async cacheArtworkList(key, artworks, ttl = 300) {
    // 5 minutes TTL
    if (!this.isConnected) return;

    try {
      await this.redis.setEx(key, ttl, JSON.stringify(artworks));
    } catch (error) {
      logger.error("Cache set error:", error);
    }
  }

  // Get cached artwork list
  async getCachedArtworkList(key) {
    if (!this.isConnected) return null;

    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error("Cache get error:", error);
      return null;
    }
  }

  // Cache single artwork
  async cacheArtwork(artworkId, artwork, ttl = 600) {
    // 10 minutes TTL
    if (!this.isConnected) return;

    try {
      const key = `artwork:${artworkId}`;
      await this.redis.setEx(key, ttl, JSON.stringify(artwork));
    } catch (error) {
      logger.error("Cache artwork error:", error);
    }
  }

  // Get cached artwork
  async getCachedArtwork(artworkId) {
    if (!this.isConnected) return null;

    try {
      const key = `artwork:${artworkId}`;
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error("Get cached artwork error:", error);
      return null;
    }
  }

  // Invalidate artwork cache
  async invalidateArtworkCache(artworkId) {
    if (!this.isConnected) return;

    try {
      const keys = [
        `artwork:${artworkId}`,
        "artworks:*", // Invalidate all artwork list caches
      ];

      for (const keyPattern of keys) {
        if (keyPattern.includes("*")) {
          const matchingKeys = await this.redis.keys(keyPattern);
          if (matchingKeys.length > 0) {
            await this.redis.del(matchingKeys);
          }
        } else {
          await this.redis.del(keyPattern);
        }
      }
    } catch (error) {
      logger.error("Cache invalidation error:", error);
    }
  }

  // Generate cache key for artwork list to cache search results
  generateListCacheKey(query) {
    const {
      page = 1,
      limit = 10,
      sort = "-createdAt",
      status,
      minPrice,
      maxPrice,
      tags,
      search,
      artist,
    } = query;

    const keyParts = [
      "artworks",
      `page:${page}`,
      `limit:${limit}`,
      `sort:${sort}`,
    ];

    if (status) keyParts.push(`status:${status}`);
    if (minPrice) keyParts.push(`minPrice:${minPrice}`);
    if (maxPrice) keyParts.push(`maxPrice:${maxPrice}`);
    if (tags)
      keyParts.push(`tags:${Array.isArray(tags) ? tags.join(",") : tags}`);
    if (search) keyParts.push(`search:${search}`);
    if (artist) keyParts.push(`artist:${artist}`);

    return keyParts.join(":");
  }
}

module.exports = new ArtworkCacheService();
