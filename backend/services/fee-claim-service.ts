/**
 * Automated Fee Claim Service
 * Monitors for completed trades and automatically claims platform fees
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PlatformFeeEscrowClient, FeeEscrowAccount } from '../../sdk';
import { EventEmitter } from 'events';

export interface ClaimResult {
  escrow: string;
  signature: string;
  platformRevenue: number;
  referrerCommission: number;
  timestamp: Date;
  error?: string;
}

export class FeeClaimService extends EventEmitter {
  private running: boolean = false;
  private paused: boolean = false;
  private pollingInterval: NodeJS.Timer | null = null;
  private claimQueue: Set<string> = new Set();
  private processingEscrows: Set<string> = new Set();
  private claimHistory: ClaimResult[] = [];
  
  constructor(
    private client: PlatformFeeEscrowClient,
    private platformSigner: Keypair,
    private connection: Connection,
    private config: {
      pollingInterval: number;
      batchSize: number;
      maxConcurrent: number;
      retryAttempts: number;
      retryDelay: number;
    } = {
      pollingInterval: 30000, // 30 seconds
      batchSize: 10,
      maxConcurrent: 5,
      retryAttempts: 3,
      retryDelay: 1000
    }
  ) {
    super();
  }
  
  // =============================================================================
  // SERVICE LIFECYCLE
  // =============================================================================
  
  async start() {
    if (this.running) {
      console.log('Fee claim service already running');
      return;
    }
    
    this.running = true;
    this.paused = false;
    console.log('🚀 Starting fee claim automation service...');
    
    // Initial scan
    await this.scanForUnclaimedEscrows();
    
    // Start polling
    this.pollingInterval = setInterval(async () => {
      if (!this.paused) {
        await this.scanForUnclaimedEscrows();
      }
    }, this.config.pollingInterval);
    
    // Start processing queue
    this.processQueue();
    
    this.emit('started');
  }
  
  async stop() {
    if (!this.running) return;
    
    this.running = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Wait for current processing to complete
    while (this.processingEscrows.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('🛑 Fee claim service stopped');
    this.emit('stopped');
  }
  
  pause() {
    this.paused = true;
    console.log('⏸️  Fee claim service paused');
    this.emit('paused');
  }
  
  resume() {
    this.paused = false;
    console.log('▶️  Fee claim service resumed');
    this.emit('resumed');
    
    // Trigger immediate scan
    this.scanForUnclaimedEscrows();
  }
  
  isRunning(): boolean {
    return this.running && !this.paused;
  }
  
  // =============================================================================
  // SCANNING AND PROCESSING
  // =============================================================================
  
  private async scanForUnclaimedEscrows() {
    try {
      console.log('🔍 Scanning for unclaimed escrows...');
      
      const unclaimedEscrows = await this.client.getUnclaimedEscrows();
      const newEscrows = unclaimedEscrows.filter(
        escrow => !this.claimQueue.has(escrow.publicKey.toString()) &&
                  !this.processingEscrows.has(escrow.publicKey.toString())
      );
      
      if (newEscrows.length > 0) {
        console.log(`Found ${newEscrows.length} new unclaimed escrows`);
        
        // Add to queue
        newEscrows.forEach(escrow => {
          this.claimQueue.add(escrow.publicKey.toString());
        });
        
        this.emit('escrowsFound', newEscrows.length);
      }
    } catch (error) {
      console.error('Error scanning for unclaimed escrows:', error);
      this.emit('scanError', error);
    }
  }
  
  private async processQueue() {
    while (this.running) {
      if (this.paused || this.claimQueue.size === 0 || 
          this.processingEscrows.size >= this.config.maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Get next batch
      const batch = Array.from(this.claimQueue)
        .slice(0, this.config.batchSize - this.processingEscrows.size);
      
      // Process batch concurrently
      const promises = batch.map(escrowAddress => 
        this.processEscrow(escrowAddress)
      );
      
      await Promise.allSettled(promises);
    }
  }
  
  private async processEscrow(escrowAddress: string) {
    const escrowPDA = new PublicKey(escrowAddress);
    
    // Mark as processing
    this.claimQueue.delete(escrowAddress);
    this.processingEscrows.add(escrowAddress);
    
    try {
      // Get escrow data
      const escrowData = await this.client.getEscrowData(escrowPDA);
      
      if (!escrowData) {
        throw new Error('Escrow data not found');
      }
      
      // Verify can claim
      if (!this.canClaimEscrow(escrowData)) {
        return;
      }
      
      // Attempt to claim with retries
      const result = await this.claimWithRetries(escrowPDA, escrowData);
      
      // Record success
      this.claimHistory.push(result);
      this.emit('claimSuccess', result);
      
      console.log(`✅ Claimed fees for escrow ${escrowAddress}: ${result.signature}`);
      
    } catch (error) {
      console.error(`❌ Failed to claim escrow ${escrowAddress}:`, error);
      
      const result: ClaimResult = {
        escrow: escrowAddress,
        signature: '',
        platformRevenue: 0,
        referrerCommission: 0,
        timestamp: new Date(),
        error: error.message
      };
      
      this.claimHistory.push(result);
      this.emit('claimError', result);
      
      // Re-add to queue if not permanent failure
      if (this.isRetryableError(error)) {
        setTimeout(() => {
          this.claimQueue.add(escrowAddress);
        }, this.config.retryDelay * 5);
      }
    } finally {
      this.processingEscrows.delete(escrowAddress);
    }
  }
  
  private async claimWithRetries(
    escrowPDA: PublicKey,
    escrowData: FeeEscrowAccount
  ): Promise<ClaimResult> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const signature = await this.client.claimPlatformFee({
          escrowPDA,
          escrowData
        });
        
        // Calculate amounts
        const platformRevenue = escrowData.actualFeeCharged
          .sub(escrowData.referrerCommission)
          .toNumber() / 1e6;
        
        const referrerCommission = escrowData.referrerCommission.toNumber() / 1e6;
        
        return {
          escrow: escrowPDA.toString(),
          signature,
          platformRevenue,
          referrerCommission,
          timestamp: new Date()
        };
      } catch (error) {
        lastError = error;
        console.warn(`Claim attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.config.retryAttempts) {
          await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelay * attempt)
          );
        }
      }
    }
    
    throw lastError!;
  }
  
  // =============================================================================
  // VALIDATION
  // =============================================================================
  
  private canClaimEscrow(escrowData: FeeEscrowAccount): boolean {
    // Check if proof submitted
    if (!escrowData.proofSubmitted) {
      return false;
    }
    
    // Check if already completed
    if (escrowData.isCompleted) {
      return false;
    }
    
    // Check if disputed
    if (escrowData.isDisputed) {
      console.warn(`Escrow ${escrowData.user.toString()} is disputed`);
      return false;
    }
    
    // Check if platform matches
    if (escrowData.platform.toString() !== this.platformSigner.publicKey.toString()) {
      return false;
    }
    
    return true;
  }
  
  private isRetryableError(error: any): boolean {
    const message = error.message || error.toString();
    
    // Network errors
    if (message.includes('network') || 
        message.includes('timeout') ||
        message.includes('429')) {
      return true;
    }
    
    // Temporary Solana errors
    if (message.includes('blockhash not found') ||
        message.includes('unable to confirm')) {
      return true;
    }
    
    return false;
  }
  
  // =============================================================================
  // MANUAL OPERATIONS
  // =============================================================================
  
  async forceClaimEscrow(escrowPDA: PublicKey): Promise<ClaimResult> {
    const escrowData = await this.client.getEscrowData(escrowPDA);
    
    if (!escrowData) {
      throw new Error('Escrow not found');
    }
    
    return this.claimWithRetries(escrowPDA, escrowData);
  }
  
  async getClaimHistory(limit?: number): Promise<ClaimResult[]> {
    const history = [...this.claimHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }
  
  getQueueStatus() {
    return {
      queued: this.claimQueue.size,
      processing: this.processingEscrows.size,
      totalClaimed: this.claimHistory.filter(r => !r.error).length,
      totalFailed: this.claimHistory.filter(r => r.error).length
    };
  }
  
  // =============================================================================
  // MONITORING
  // =============================================================================
  
  getMetrics() {
    const successfulClaims = this.claimHistory.filter(r => !r.error);
    const totalPlatformRevenue = successfulClaims.reduce(
      (sum, claim) => sum + claim.platformRevenue, 0
    );
    const totalReferrerCommissions = successfulClaims.reduce(
      (sum, claim) => sum + claim.referrerCommission, 0
    );
    
    return {
      status: this.isRunning() ? 'running' : this.running ? 'paused' : 'stopped',
      queuedEscrows: this.claimQueue.size,
      processingEscrows: this.processingEscrows.size,
      totalClaims: successfulClaims.length,
      totalFailures: this.claimHistory.filter(r => r.error).length,
      totalPlatformRevenue,
      totalReferrerCommissions,
      successRate: this.claimHistory.length > 0 
        ? (successfulClaims.length / this.claimHistory.length) * 100 
        : 0,
      lastClaimTime: successfulClaims.length > 0 
        ? successfulClaims[successfulClaims.length - 1].timestamp 
        : null
    };
  }
}