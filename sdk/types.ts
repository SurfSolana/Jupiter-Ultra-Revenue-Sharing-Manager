/**
 * TypeScript types and interfaces for Platform Fee Escrow SDK
 */

import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// =============================================================================
// FEE TIER DEFINITIONS
// =============================================================================

export interface FeeStructure {
  platformFee: number;
  referrerShare: number;
  referredDiscount: number;
}

export const FEE_TIERS: Record<string, FeeStructure> = {
  default: {
    platformFee: 0.01,      // 1%
    referrerShare: 0,       // 0% to referrer
    referredDiscount: 0     // 0% discount
  },
  referred: {
    platformFee: 0.01,      // 1%
    referrerShare: 0.001,   // 0.1% to referrer
    referredDiscount: 0.001 // 0.1% discount for referred user
  },
  premium: {
    platformFee: 0.01,      // 1%
    referrerShare: 0.003,   // 0.3% to referrer
    referredDiscount: 0.001 // 0.1% discount for referred user
  }
};

export type PartnerStatus = keyof typeof FEE_TIERS;

// =============================================================================
// SMART CONTRACT ACCOUNTS
// =============================================================================

export interface FeeEscrowAccount {
  user: PublicKey;
  platform: PublicKey;
  referrer: PublicKey;
  tradeAmount: BN;
  grossPlatformFee: BN;
  referrerCommission: BN;
  userDiscount: BN;
  actualFeeCharged: BN;
  
  // Verification data
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: BN;
  actualOutputAmount: BN;
  
  executionSignature: PublicKey;
  expirationSlot: BN;
  seed: BN;
  isCompleted: boolean;
  isDisputed: boolean;
  proofSubmitted: boolean;
  proofSubmittedSlot: BN;
  authBump: number;
  vaultBump: number;
  escrowBump: number;
}

export interface ReferrerStatsAccount {
  referrer: PublicKey;
  totalTransactions: BN;
  pendingVolume: BN;
  confirmedVolume: BN;
  totalCommissionEarned: BN;
  totalCommissionClaimed: BN;
  pendingCommission: BN;
  authBump: number;
}

export interface SwapEvent {
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
}

// =============================================================================
// JUPITER API TYPES
// =============================================================================

export interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface JupiterExecutionResponse {
  status: "Success" | "Failed";
  signature: string;
  slot: string;
  error?: string;
  code: number;
  totalInputAmount: string;
  totalOutputAmount: string;
  inputAmountResult: string;
  outputAmountResult: string;
  swapEvents: SwapEvent[];
}

// =============================================================================
// FEE CALCULATION TYPES
// =============================================================================

export interface CalculatedFees {
  grossPlatformFee: BN;
  referrerCommission: BN;
  userDiscount: BN;
  actualFeeCharged: BN;
  platformRevenue: BN;
}

export interface FeeBreakdown {
  tradeAmount: number;
  grossFee: number;
  userDiscount: number;
  userPays: number;
  referrerGets: number;
  platformGets: number;
  tier: PartnerStatus;
}

// =============================================================================
// CLIENT METHOD PARAMETERS
// =============================================================================

export interface DepositFeeParams {
  user: PublicKey;
  jupiterQuote: JupiterQuoteResponse;
  tradeAmount: BN;
  referrer?: PublicKey;
  tier?: PartnerStatus;
}

export interface SubmitExecutionParams {
  user: PublicKey;
  escrowPDA: PublicKey;
  executionResponse: JupiterExecutionResponse;
}

export interface ClaimFeeParams {
  escrowPDA: PublicKey;
  escrowData: FeeEscrowAccount;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export interface ReferrerDashboardData {
  referrer: string;
  totalTransactions: number;
  totalVolume: number;      // In USD
  totalEarned: number;      // In USD
  availableToClaim: number; // In USD
  totalClaimed: number;     // In USD
  pendingVolume: number;    // In USD
  confirmedVolume: number;  // In USD
}

export interface PlatformAnalytics {
  totalTransactions: number;
  totalVolume: number;
  totalCommissionsPaid: number;
  totalPlatformRevenue: number;
  activeReferrers: number;
  activeEscrows: number;
}

export interface EscrowDetails {
  publicKey: string;
  user: string;
  referrer: string;
  tradeAmount: number;
  actualFeeCharged: number;
  status: 'pending' | 'completed' | 'disputed' | 'expired';
  createdAt: number;
  completedAt?: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class PlatformFeeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PlatformFeeError';
  }
}

export enum ErrorCode {
  ESCROW_NOT_FOUND = 'ESCROW_NOT_FOUND',
  INVALID_EXECUTION = 'INVALID_EXECUTION',
  ALREADY_COMPLETED = 'ALREADY_COMPLETED',
  DISPUTE_EXISTS = 'DISPUTE_EXISTS',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  EXPIRED_ESCROW = 'EXPIRED_ESCROW',
  NO_COMMISSION = 'NO_COMMISSION',
}