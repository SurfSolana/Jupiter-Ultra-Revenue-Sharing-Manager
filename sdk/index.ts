/**
 * Platform Fee Escrow SDK
 * Main entry point for the SDK
 */

// Export the main client
export { PlatformFeeEscrowClient } from './client';

// Export all types
export * from './types';

// Export utility functions
export * from './utils';

// Re-export commonly used types for convenience
export type {
  FeeEscrowAccount,
  ReferrerStatsAccount,
  PartnerStatus,
  JupiterQuoteResponse,
  JupiterExecutionResponse,
  ReferrerDashboardData,
  CalculatedFees,
  FeeBreakdown
} from './types';

// Re-export commonly used utilities
export {
  PROGRAM_ID,
  USDC_MINT,
  FEE_TIERS,
  calculateTradeFees,
  getFeeBreakdown,
  formatUsdc,
  parseUsdc,
  generateEscrowSeed
} from './utils';

// Version
export const SDK_VERSION = '1.0.0';