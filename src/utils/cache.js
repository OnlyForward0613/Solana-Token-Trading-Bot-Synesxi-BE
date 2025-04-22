/* eslint-disable prettier/prettier */
/* eslint-disable no-shadow */
/* eslint-disable no-console */
// src/utils/cache.js
const redis = require('redis');
// const { promisify } = require('util');

// Create client with error handling
const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

let isConnected = false;

// Connection error handler
client.on('error', (err) => {
  console.error('Redis Client Error:', err);
  isConnected = false;
});

// Connect wrapper
const connectRedis = async () => {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
};

const getCachedData = async (key) => {
  await connectRedis();
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
};

const setCachedData = async (key, data) => {
    await connectRedis();
    
    // Use try-catch for JSON serialization
    try {
      await client.setEx(key, 300, JSON.stringify(data));
    } catch (err) {
      console.error('Cache serialization failed:', err);
      // Optionally cache a simplified version
      const safeData = Object.keys(data).reduce((acc, key) => {
        acc[key] = typeof data[key] === 'object' ? '[complex-data]' : data[key];
        return acc;
      }, {});
      await client.setEx(key, 300, JSON.stringify(safeData));
    }
  };

module.exports = { getCachedData, setCachedData };
