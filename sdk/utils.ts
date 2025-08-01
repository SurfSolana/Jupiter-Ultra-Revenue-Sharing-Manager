/**
 * Utility functions for Platform Fee Escrow SDK
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { 
  FEE_TIERS, 
  PartnerStatus, 
  CalculatedFees, 
  FeeBreakdown,
  SwapEvent,
  JupiterExecutionResponse
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

export const PROGRAM_ID = new PublicKey("11111111111111111111111111111111"); // Replace with actual
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const USDC_DECIMALS = 6;
export const BASIS_POINTS = 1000000; // For fee calculations

// =============================================================================
// PDA DERIVATION
// =============================================================================

export function getEscrowPDA(user: PublicKey, seed: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("fee_escrow"),
      user.toBuffer(),
      seed.toArrayLike(Buffer, 'le', 8)
    ],
    PROGRAM_ID
  );
}

export function getReferrerStatsPDA(referrer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("referrer_stats"),
      referrer.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getAuthPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("auth")],
    PROGRAM_ID
  );
}

export function getVaultPDA(escrow: PublicKey, mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault"),
      escrow.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getCommissionVaultPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commission_vault")],
    PROGRAM_ID
  );
}

// =============================================================================
// FEE CALCULATIONS
// =============================================================================

export function calculateTradeFees(
  tradeAmount: BN,
  tier: PartnerStatus = 'default'
): CalculatedFees {
  const feeStructure = FEE_TIERS[tier];
  
  // Calculate 1% platform fee
  const grossPlatformFee = tradeAmount.mul(new BN(10000)).div(new BN(BASIS_POINTS));
  
  // Calculate referrer commission (percentage of platform fee)
  const referrerShareBps = new BN(feeStructure.referrerShare * BASIS_POINTS);
  const referrerCommission = grossPlatformFee.mul(referrerShareBps).div(new BN(BASIS_POINTS));
  
  // Calculate user discount (percentage of platform fee)
  const discountBps = new BN(feeStructure.referredDiscount * BASIS_POINTS);
  const userDiscount = grossPlatformFee.mul(discountBps).div(new BN(BASIS_POINTS));
  
  const actualFeeCharged = grossPlatformFee.sub(userDiscount);
  const platformRevenue = actualFeeCharged.sub(referrerCommission);
  
  return {
    grossPlatformFee,
    referrerCommission,
    userDiscount,
    actualFeeCharged,
    platformRevenue
  };
}

export function getFeeBreakdown(
  tradeAmountUsdc: number,
  tier: PartnerStatus = 'default'
): FeeBreakdown {
  const tradeAmount = new BN(tradeAmountUsdc * Math.pow(10, USDC_DECIMALS));
  const fees = calculateTradeFees(tradeAmount, tier);
  
  return {
    tradeAmount: tradeAmountUsdc,
    grossFee: fees.grossPlatformFee.toNumber() / Math.pow(10, USDC_DECIMALS),
    userDiscount: fees.userDiscount.toNumber() / Math.pow(10, USDC_DECIMALS),
    userPays: fees.actualFeeCharged.toNumber() / Math.pow(10, USDC_DECIMALS),
    referrerGets: fees.referrerCommission.toNumber() / Math.pow(10, USDC_DECIMALS),
    platformGets: fees.platformRevenue.toNumber() / Math.pow(10, USDC_DECIMALS),
    tier
  };
}

// =============================================================================
// SEED GENERATION
// =============================================================================

export function generateEscrowSeed(): BN {
  // Use timestamp + random component to ensure uniqueness
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return new BN(timestamp * 1000000 + random);
}

// =============================================================================
// JUPITER HELPERS
// =============================================================================

export function parseJupiterSwapEvents(execution: JupiterExecutionResponse): SwapEvent[] {
  return execution.swapEvents.map(event => ({
    inputMint: event.inputMint,
    inputAmount: event.inputAmount,
    outputMint: event.outputMint,
    outputAmount: event.outputAmount
  }));
}

export function validateJupiterExecution(execution: JupiterExecutionResponse): boolean {
  return execution.status === "Success" && 
         execution.swapEvents && 
         execution.swapEvents.length > 0;
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

export function formatUsdc(amount: BN | number): string {
  const value = typeof amount === 'number' ? amount : amount.toNumber();
  return (value / Math.pow(10, USDC_DECIMALS)).toFixed(2);
}

export function parseUsdc(amount: string | number): BN {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new BN(Math.floor(value * Math.pow(10, USDC_DECIMALS)));
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// =============================================================================
// SLOT/TIME CALCULATIONS
// =============================================================================

const SLOT_TIME_MS = 400; // ~400ms per slot on Solana

export function getExpirationSlot(
  currentSlot: number, 
  minutesUntilExpiry: number = 10
): BN {
  const slotsUntilExpiry = Math.floor((minutesUntilExpiry * 60 * 1000) / SLOT_TIME_MS);
  return new BN(currentSlot + slotsUntilExpiry);
}

export function slotToTimestamp(slot: BN | number): Date {
  const slotNumber = typeof slot === 'number' ? slot : slot.toNumber();
  // This is approximate - in production you'd want to use actual slot times
  const estimatedMs = slotNumber * SLOT_TIME_MS;
  return new Date(estimatedMs);
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function validateFeeEscrowState(escrow: any): boolean {
  return escrow &&
    escrow.user &&
    escrow.platform &&
    typeof escrow.isCompleted === 'boolean' &&
    typeof escrow.proofSubmitted === 'boolean';
}

// =============================================================================
// ASYNC HELPERS
// =============================================================================

export async function confirmTransaction(
  connection: Connection,
  signature: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Promise<boolean> {
  const latestBlockhash = await connection.getLatestBlockhash();
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment
  );
  
  return !confirmation.value.err;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, i)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

// =============================================================================
// EXPORT ALL UTILITIES
// =============================================================================

export const utils = {
  // PDA functions
  getEscrowPDA,
  getReferrerStatsPDA,
  getAuthPDA,
  getVaultPDA,
  getCommissionVaultPDA,
  
  // Fee calculations
  calculateTradeFees,
  getFeeBreakdown,
  
  // Helpers
  generateEscrowSeed,
  parseJupiterSwapEvents,
  validateJupiterExecution,
  formatUsdc,
  parseUsdc,
  shortenAddress,
  getExpirationSlot,
  slotToTimestamp,
  isValidPublicKey,
  validateFeeEscrowState,
  
  // Async utilities
  confirmTransaction,
  sleep,
  retry
};