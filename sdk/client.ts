/**
 * Platform Fee Escrow SDK Client
 */

import { 
  PublicKey, 
  Connection, 
  Keypair, 
  Transaction,
  TransactionInstruction,
  Signer
} from '@solana/web3.js';
import { 
  Program, 
  AnchorProvider, 
  BN, 
  web3,
  Idl
} from '@coral-xyz/anchor';
import { 
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';

import {
  FeeEscrowAccount,
  ReferrerStatsAccount,
  PartnerStatus,
  JupiterQuoteResponse,
  JupiterExecutionResponse,
  DepositFeeParams,
  SubmitExecutionParams,
  ClaimFeeParams,
  ReferrerDashboardData,
  SwapEvent,
  PlatformFeeError,
  ErrorCode
} from './types';

import {
  PROGRAM_ID,
  getEscrowPDA,
  getReferrerStatsPDA,
  getAuthPDA,
  getVaultPDA,
  getCommissionVaultPDA,
  generateEscrowSeed,
  getExpirationSlot,
  parseJupiterSwapEvents,
  validateJupiterExecution,
  confirmTransaction,
  retry
} from './utils';

export class PlatformFeeEscrowClient {
  private program: Program;
  
  constructor(
    private connection: Connection,
    private wallet: Keypair | Signer,
    private platformWallet: PublicKey,
    private feeToken: PublicKey,
    programId: PublicKey = PROGRAM_ID,
    idl?: Idl
  ) {
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    );
    
    if (!idl) {
      throw new Error('Program IDL must be provided');
    }
    
    this.program = new Program(idl, programId, provider);
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  async initializeCommissionVault(): Promise<string> {
    const [authPDA] = getAuthPDA();
    const [commissionVaultPDA] = getCommissionVaultPDA(this.feeToken);
    
    const tx = await this.program.methods
      .initializeCommissionVault()
      .accounts({
        platform: this.wallet.publicKey,
        feeToken: this.feeToken,
        auth: authPDA,
        commissionVault: commissionVaultPDA,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    return tx;
  }

  // =============================================================================
  // DEPOSIT FEE WITH QUOTE
  // =============================================================================

  async depositFeeWithQuote(params: DepositFeeParams): Promise<{
    signature: string;
    escrowPDA: PublicKey;
    seed: BN;
  }> {
    const {
      user,
      jupiterQuote,
      tradeAmount,
      referrer = user,
      tier = 'default'
    } = params;
    
    const seed = generateEscrowSeed();
    const [escrowPDA] = getEscrowPDA(user, seed);
    const [referrerStatsPDA] = getReferrerStatsPDA(referrer);
    const [authPDA] = getAuthPDA();
    const [vaultPDA] = getVaultPDA(escrowPDA, this.feeToken);
    
    const userAta = await getAssociatedTokenAddress(this.feeToken, user);
    const currentSlot = await this.connection.getSlot();
    const expirationSlot = getExpirationSlot(currentSlot, 10); // 10 minutes
    
    // Calculate fee percentages
    const feeStructure = FEE_TIERS[tier];
    const referrerShareBps = new BN(feeStructure.referrerShare * 1000000);
    const discountBps = new BN(feeStructure.referredDiscount * 1000000);
    
    const tx = await this.program.methods
      .depositFeeWithQuote(
        tradeAmount,
        new PublicKey(jupiterQuote.inputMint),
        new PublicKey(jupiterQuote.outputMint),
        new BN(jupiterQuote.inAmount),
        expirationSlot,
        referrerShareBps,
        discountBps,
        seed
      )
      .accounts({
        user,
        platform: this.platformWallet,
        referrer,
        escrow: escrowPDA,
        referrerStats: referrerStatsPDA,
        userAta,
        feeToken: this.feeToken,
        auth: authPDA,
        vault: vaultPDA,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    
    return {
      signature: tx,
      escrowPDA,
      seed
    };
  }

  // =============================================================================
  // SUBMIT JUPITER EXECUTION
  // =============================================================================

  async submitJupiterExecution(params: SubmitExecutionParams): Promise<string> {
    const { user, escrowPDA, executionResponse } = params;
    
    // Validate execution
    if (!validateJupiterExecution(executionResponse)) {
      throw new PlatformFeeError(
        'Invalid Jupiter execution response',
        ErrorCode.INVALID_EXECUTION,
        { executionResponse }
      );
    }
    
    const currentSlot = await this.connection.getSlot();
    const swapEvents = parseJupiterSwapEvents(executionResponse);
    
    // Convert swap events to the format expected by the contract
    const formattedSwapEvents = swapEvents.map(event => ({
      inputMint: new PublicKey(event.inputMint),
      inputAmount: new BN(event.inputAmount),
      outputMint: new PublicKey(event.outputMint),
      outputAmount: new BN(event.outputAmount)
    }));
    
    const tx = await this.program.methods
      .submitJupiterExecution(
        new PublicKey(executionResponse.signature),
        formattedSwapEvents,
        executionResponse.status === "Success" ? 1 : 0,
        new BN(currentSlot)
      )
      .accounts({
        user,
        escrow: escrowPDA,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    return tx;
  }

  // =============================================================================
  // CLAIM PLATFORM FEE
  // =============================================================================

  async claimPlatformFee(params: ClaimFeeParams): Promise<string> {
    const { escrowPDA, escrowData } = params;
    
    const [referrerStatsPDA] = getReferrerStatsPDA(escrowData.referrer);
    const [authPDA] = getAuthPDA();
    const [vaultPDA] = getVaultPDA(escrowPDA, this.feeToken);
    const [commissionVaultPDA] = getCommissionVaultPDA(this.feeToken);
    
    const platformAta = await getAssociatedTokenAddress(
      this.feeToken, 
      this.platformWallet
    );
    
    const tx = await this.program.methods
      .claimFee()
      .accounts({
        platform: this.platformWallet,
        user: escrowData.user,
        referrer: escrowData.referrer,
        platformAta,
        referrerStats: referrerStatsPDA,
        feeToken: this.feeToken,
        auth: authPDA,
        vault: vaultPDA,
        commissionVault: commissionVaultPDA,
        escrow: escrowPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    return tx;
  }

  // =============================================================================
  // CLAIM REFERRAL COMMISSION
  // =============================================================================

  async claimReferralCommission(referrer: PublicKey): Promise<string> {
    const [referrerStatsPDA] = getReferrerStatsPDA(referrer);
    const [authPDA] = getAuthPDA();
    const [commissionVaultPDA] = getCommissionVaultPDA(this.feeToken);
    
    const referrerAta = await getAssociatedTokenAddress(this.feeToken, referrer);
    
    const tx = await this.program.methods
      .claimReferralCommission()
      .accounts({
        referrer,
        referrerAta,
        referrerStats: referrerStatsPDA,
        feeToken: this.feeToken,
        commissionVault: commissionVaultPDA,
        auth: authPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    return tx;
  }

  // =============================================================================
  // DISPUTE CLAIM
  // =============================================================================

  async disputeClaim(
    user: PublicKey,
    escrowPDA: PublicKey,
    seed: BN
  ): Promise<string> {
    const currentSlot = await this.connection.getSlot();
    
    const tx = await this.program.methods
      .disputeClaim(new BN(currentSlot))
      .accounts({
        user,
        escrow: escrowPDA,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    return tx;
  }

  // =============================================================================
  // REFUND FEE
  // =============================================================================

  async refundFee(
    user: PublicKey,
    escrowPDA: PublicKey,
    escrowData: FeeEscrowAccount
  ): Promise<string> {
    const [referrerStatsPDA] = getReferrerStatsPDA(escrowData.referrer);
    const [authPDA] = getAuthPDA();
    const [vaultPDA] = getVaultPDA(escrowPDA, this.feeToken);
    
    const userAta = await getAssociatedTokenAddress(this.feeToken, user);
    const currentSlot = await this.connection.getSlot();
    
    const tx = await this.program.methods
      .refundFee(new BN(currentSlot))
      .accounts({
        user,
        referrer: escrowData.referrer,
        userAta,
        referrerStats: referrerStatsPDA,
        feeToken: this.feeToken,
        auth: authPDA,
        vault: vaultPDA,
        escrow: escrowPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([this.wallet])
      .rpc();
    
    await confirmTransaction(this.connection, tx);
    return tx;
  }

  // =============================================================================
  // QUERY METHODS
  // =============================================================================

  async getEscrowData(escrowPDA: PublicKey): Promise<FeeEscrowAccount | null> {
    try {
      return await retry(() => 
        this.program.account.feeEscrowState.fetch(escrowPDA)
      );
    } catch (error) {
      if (error.toString().includes('Account does not exist')) {
        return null;
      }
      throw error;
    }
  }

  async getReferrerStats(referrer: PublicKey): Promise<ReferrerStatsAccount | null> {
    try {
      const [referrerStatsPDA] = getReferrerStatsPDA(referrer);
      return await retry(() => 
        this.program.account.referrerStats.fetch(referrerStatsPDA)
      );
    } catch (error) {
      if (error.toString().includes('Account does not exist')) {
        return null;
      }
      throw error;
    }
  }

  async getReferrerDashboard(referrer: PublicKey): Promise<ReferrerDashboardData | null> {
    const stats = await this.getReferrerStats(referrer);
    if (!stats) return null;
    
    const decimals = Math.pow(10, 6); // USDC decimals
    
    return {
      referrer: referrer.toString(),
      totalTransactions: stats.totalTransactions.toNumber(),
      totalVolume: stats.confirmedVolume.toNumber() / decimals,
      totalEarned: stats.totalCommissionEarned.toNumber() / decimals,
      availableToClaim: stats.pendingCommission.toNumber() / decimals,
      totalClaimed: stats.totalCommissionClaimed.toNumber() / decimals,
      pendingVolume: stats.pendingVolume.toNumber() / decimals,
      confirmedVolume: stats.confirmedVolume.toNumber() / decimals,
    };
  }

  async getUserEscrows(user: PublicKey): Promise<Array<{
    publicKey: PublicKey;
    account: FeeEscrowAccount;
  }>> {
    return this.program.account.feeEscrowState.all([
      {
        memcmp: {
          offset: 8, // Discriminator
          bytes: user.toBase58(),
        }
      }
    ]);
  }

  async getUnclaimedEscrows(): Promise<Array<{
    publicKey: PublicKey;
    account: FeeEscrowAccount;
  }>> {
    // Get all escrows where proofSubmitted = true and isCompleted = false
    const escrows = await this.program.account.feeEscrowState.all();
    
    return escrows.filter(escrow => 
      escrow.account.proofSubmitted && 
      !escrow.account.isCompleted &&
      !escrow.account.isDisputed
    );
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  async isCommissionVaultInitialized(): Promise<boolean> {
    try {
      const [commissionVaultPDA] = getCommissionVaultPDA(this.feeToken);
      const accountInfo = await this.connection.getAccountInfo(commissionVaultPDA);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }

  getEscrowAddress(user: PublicKey, seed: BN): PublicKey {
    const [escrowPDA] = getEscrowPDA(user, seed);
    return escrowPDA;
  }

  getReferrerStatsAddress(referrer: PublicKey): PublicKey {
    const [statsPDA] = getReferrerStatsPDA(referrer);
    return statsPDA;
  }
}