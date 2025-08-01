/**
 * Configuration for Platform Fee Escrow Backend
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  
  // Solana
  RPC_URL: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  COMMITMENT: process.env.COMMITMENT || 'confirmed',
  
  // Program
  PROGRAM_ID: process.env.PROGRAM_ID || '11111111111111111111111111111111',
  PLATFORM_WALLET: process.env.PLATFORM_WALLET || '',
  PLATFORM_PRIVATE_KEY: process.env.PLATFORM_PRIVATE_KEY || '', // Base64 encoded
  
  // Token
  FEE_TOKEN: process.env.FEE_TOKEN || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  
  // Jupiter
  JUPITER_API_URL: process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6',
  JUPITER_TIMEOUT: parseInt(process.env.JUPITER_TIMEOUT || '30000'), // 30 seconds
  
  // Service Configuration
  AUTO_CLAIM_ENABLED: process.env.AUTO_CLAIM_ENABLED === 'true',
  AUTO_CLAIM_INTERVAL: parseInt(process.env.AUTO_CLAIM_INTERVAL || '30000'), // 30 seconds
  AUTO_CLAIM_BATCH_SIZE: parseInt(process.env.AUTO_CLAIM_BATCH_SIZE || '10'),
  
  // Analytics
  ANALYTICS_RETENTION_DAYS: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90'),
  
  // Monitoring
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  ERROR_NOTIFICATION_ENABLED: process.env.ERROR_NOTIFICATION_ENABLED === 'true',
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED === 'true',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  
  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FORMAT: process.env.LOG_FORMAT || 'json',
  
  // Database (optional for analytics)
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Redis (optional for caching)
  REDIS_URL: process.env.REDIS_URL,
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '300'), // 5 minutes
  
  // API Keys (for future integrations)
  API_KEY_HEADER: process.env.API_KEY_HEADER || 'x-api-key',
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  
  // Performance
  MAX_CONCURRENT_CLAIMS: parseInt(process.env.MAX_CONCURRENT_CLAIMS || '5'),
  CLAIM_RETRY_ATTEMPTS: parseInt(process.env.CLAIM_RETRY_ATTEMPTS || '3'),
  CLAIM_RETRY_DELAY: parseInt(process.env.CLAIM_RETRY_DELAY || '1000'), // 1 second
};

// Validate required configuration
export function validateConfig() {
  const required = [
    'PLATFORM_WALLET',
    'PLATFORM_PRIVATE_KEY',
    'PROGRAM_ID'
  ];
  
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  // Validate wallet addresses
  try {
    const { PublicKey } = require('@solana/web3.js');
    new PublicKey(config.PLATFORM_WALLET);
    new PublicKey(config.PROGRAM_ID);
    new PublicKey(config.FEE_TOKEN);
  } catch (error) {
    throw new Error(`Invalid public key in configuration: ${error.message}`);
  }
  
  // Validate private key
  try {
    const { Keypair } = require('@solana/web3.js');
    Keypair.fromSecretKey(Buffer.from(config.PLATFORM_PRIVATE_KEY, 'base64'));
  } catch (error) {
    throw new Error(`Invalid platform private key: ${error.message}`);
  }
}

// Environment-specific overrides
if (config.NODE_ENV === 'production') {
  // Production-specific settings
  config.AUTO_CLAIM_ENABLED = true;
  config.ERROR_NOTIFICATION_ENABLED = true;
  config.RATE_LIMIT_ENABLED = true;
} else if (config.NODE_ENV === 'development') {
  // Development-specific settings
  config.LOG_LEVEL = 'debug';
}

export default config;