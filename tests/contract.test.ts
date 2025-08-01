/**
 * Contract Unit Tests
 * Tests for the Platform Fee Escrow smart contract
 */

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  createAccount, 
  mintTo,
  getAccount 
} from '@solana/spl-token';
import { assert } from 'chai';
import { BN } from 'bn.js';

describe('Platform Fee Escrow', () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  // Test keypairs
  const platform = Keypair.generate();
  const user = Keypair.generate();
  const referrer = Keypair.generate();
  const user2 = Keypair.generate();
  
  // Program and accounts
  let program: Program;
  let usdcMint: PublicKey;
  let userUsdcAccount: PublicKey;
  let platformUsdcAccount: PublicKey;
  let referrerUsdcAccount: PublicKey;
  
  // Test constants
  const TRADE_AMOUNT = new BN(10000 * 1e6); // $10,000
  const PLATFORM_FEE_RATE = 10000; // 1% = 10000 basis points
  const REFERRER_SHARE = 1000; // 0.1% = 1000 basis points
  const USER_DISCOUNT = 1000; // 0.1% = 1000 basis points
  
  before(async () => {
    // Airdrop SOL to test accounts
    const airdropPromises = [platform, user, referrer, user2].map(async (kp) => {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    });
    await Promise.all(airdropPromises);
    
    // Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      platform,
      platform.publicKey,
      null,
      6
    );
    
    // Create token accounts
    userUsdcAccount = await createAccount(
      provider.connection,
      user,
      usdcMint,
      user.publicKey
    );
    
    platformUsdcAccount = await createAccount(
      provider.connection,
      platform,
      usdcMint,
      platform.publicKey
    );
    
    referrerUsdcAccount = await createAccount(
      provider.connection,
      referrer,
      usdcMint,
      referrer.publicKey
    );
    
    // Mint USDC to user
    await mintTo(
      provider.connection,
      platform,
      usdcMint,
      userUsdcAccount,
      platform,
      1000000 * 1e6 // $1M USDC
    );
    
    // Load program
    const programId = new PublicKey("YOUR_PROGRAM_ID");
    const idl = await Program.fetchIdl(programId, provider);
    program = new Program(idl, programId, provider);
  });
  
  describe('Initialization', () => {
    it('Should initialize commission vault', async () => {
      const [authPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("auth")],
        program.programId
      );
      
      const [commissionVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commission_vault")],
        program.programId
      );
      
      await program.methods
        .initializeCommissionVault()
        .accounts({
          platform: platform.publicKey,
          feeToken: usdcMint,
          auth: authPDA,
          commissionVault: commissionVaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([platform])
        .rpc();
      
      // Verify commission vault exists
      const vaultAccount = await getAccount(provider.connection, commissionVaultPDA);
      assert.equal(vaultAccount.owner.toString(), authPDA.toString());
    });
  });
  
  describe('Fee Deposit', () => {
    let escrowPDA: PublicKey;
    let seed: BN;
    const inputMint = new PublicKey("So11111111111111111111111111111111111111112"); // SOL
    const outputMint = usdcMint;
    const inputAmount = new BN(1 * 1e9); // 1 SOL
    
    it('Should deposit fee with quote', async () => {
      seed = new BN(Date.now());
      
      [escrowPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("fee_escrow"),
          user.publicKey.toBuffer(),
          seed.toArrayLike(Buffer, 'le', 8)
        ],
        program.programId
      );
      
      const [referrerStatsPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("referrer_stats"),
          referrer.publicKey.toBuffer()
        ],
        program.programId
      );
      
      const [authPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("auth")],
        program.programId
      );
      
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          escrowPDA.toBuffer()
        ],
        program.programId
      );
      
      const expirationSlot = new BN(await provider.connection.getSlot() + 1000);
      
      // Get user balance before
      const userAccountBefore = await getAccount(provider.connection, userUsdcAccount);
      
      await program.methods
        .depositFeeWithQuote(
          TRADE_AMOUNT,
          inputMint,
          outputMint,
          inputAmount,
          expirationSlot,
          new BN(REFERRER_SHARE),
          new BN(USER_DISCOUNT),
          seed
        )
        .accounts({
          user: user.publicKey,
          platform: platform.publicKey,
          referrer: referrer.publicKey,
          escrow: escrowPDA,
          referrerStats: referrerStatsPDA,
          userAta: userUsdcAccount,
          feeToken: usdcMint,
          auth: authPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user])
        .rpc();
      
      // Verify escrow created
      const escrowAccount = await program.account.feeEscrowState.fetch(escrowPDA);
      assert.equal(escrowAccount.user.toString(), user.publicKey.toString());
      assert.equal(escrowAccount.platform.toString(), platform.publicKey.toString());
      assert.equal(escrowAccount.referrer.toString(), referrer.publicKey.toString());
      assert.equal(escrowAccount.inputMint.toString(), inputMint.toString());
      assert.equal(escrowAccount.outputMint.toString(), outputMint.toString());
      assert.equal(escrowAccount.inputAmount.toString(), inputAmount.toString());
      assert.isFalse(escrowAccount.isCompleted);
      assert.isFalse(escrowAccount.proofSubmitted);
      
      // Verify fee calculation
      const expectedGrossFee = TRADE_AMOUNT.mul(new BN(PLATFORM_FEE_RATE)).div(new BN(1000000));
      const expectedUserDiscount = expectedGrossFee.mul(new BN(USER_DISCOUNT)).div(new BN(1000000));
      const expectedFeeCharged = expectedGrossFee.sub(expectedUserDiscount);
      
      assert.equal(escrowAccount.grossPlatformFee.toString(), expectedGrossFee.toString());
      assert.equal(escrowAccount.userDiscount.toString(), expectedUserDiscount.toString());
      assert.equal(escrowAccount.actualFeeCharged.toString(), expectedFeeCharged.toString());
      
      // Verify user balance decreased
      const userAccountAfter = await getAccount(provider.connection, userUsdcAccount);
      const balanceDecrease = Number(userAccountBefore.amount) - Number(userAccountAfter.amount);
      assert.equal(balanceDecrease, expectedFeeCharged.toNumber());
    });
    
    it('Should update referrer stats', async () => {
      const [referrerStatsPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("referrer_stats"),
          referrer.publicKey.toBuffer()
        ],
        program.programId
      );
      
      const stats = await program.account.referrerStats.fetch(referrerStatsPDA);
      assert.equal(stats.referrer.toString(), referrer.publicKey.toString());
      assert.equal(stats.totalTransactions.toNumber(), 1);
      assert.equal(stats.pendingVolume.toString(), TRADE_AMOUNT.toString());
      assert.equal(stats.confirmedVolume.toNumber(), 0);
    });
  });
  
  describe('Execution Submission', () => {
    let escrowPDA: PublicKey;
    const seed = new BN(Date.now() + 1);
    
    before(async () => {
      // Create another escrow for testing
      [escrowPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("fee_escrow"),
          user.publicKey.toBuffer(),
          seed.toArrayLike(Buffer, 'le', 8)
        ],
        program.programId
      );
      
      // Deposit fee first
      await depositFeeHelper(user, seed);
    });
    
    it('Should submit Jupiter execution proof', async () => {
      const executionSignature = Keypair.generate().publicKey; // Mock signature
      const swapEvents = [{
        inputMint: new PublicKey("So11111111111111111111111111111111111111112"),
        inputAmount: new BN(1 * 1e9),
        outputMint: usdcMint,
        outputAmount: new BN(50 * 1e6) // 50 USDC
      }];
      
      await program.methods
        .submitJupiterExecution(
          executionSignature,
          swapEvents,
          1, // Success
          new BN(await provider.connection.getSlot())
        )
        .accounts({
          user: user.publicKey,
          escrow: escrowPDA,
        })
        .signers([user])
        .rpc();
      
      // Verify proof submitted
      const escrowAccount = await program.account.feeEscrowState.fetch(escrowPDA);
      assert.isTrue(escrowAccount.proofSubmitted);
      assert.equal(escrowAccount.executionSignature.toString(), executionSignature.toString());
      assert.equal(escrowAccount.actualOutputAmount.toString(), swapEvents[0].outputAmount.toString());
    });
    
    it('Should reject mismatched execution', async () => {
      const escrowPDA2 = await createEscrowHelper(user, new BN(Date.now() + 2));
      
      const wrongSwapEvents = [{
        inputMint: usdcMint, // Wrong input mint
        inputAmount: new BN(1 * 1e9),
        outputMint: new PublicKey("So11111111111111111111111111111111111111112"),
        outputAmount: new BN(50 * 1e6)
      }];
      
      try {
        await program.methods
          .submitJupiterExecution(
            Keypair.generate().publicKey,
            wrongSwapEvents,
            1,
            new BN(await provider.connection.getSlot())
          )
          .accounts({
            user: user.publicKey,
            escrow: escrowPDA2,
          })
          .signers([user])
          .rpc();
        
        assert.fail('Should have failed with wrong input token');
      } catch (error) {
        assert.include(error.toString(), 'Wrong input token');
      }
    });
  });
  
  describe('Fee Claiming', () => {
    let escrowPDA: PublicKey;
    
    before(async () => {
      // Create and prepare escrow with proof
      const seed = new BN(Date.now() + 3);
      escrowPDA = await createAndExecuteEscrowHelper(user, seed);
    });
    
    it('Platform should claim fee successfully', async () => {
      const escrowAccount = await program.account.feeEscrowState.fetch(escrowPDA);
      const [referrerStatsPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("referrer_stats"),
          escrowAccount.referrer.toBuffer()
        ],
        program.programId
      );
      
      const platformBalanceBefore = await getAccount(provider.connection, platformUsdcAccount);
      
      await program.methods
        .claimFee()
        .accounts({
          platform: platform.publicKey,
          user: escrowAccount.user,
          referrer: escrowAccount.referrer,
          platformAta: platformUsdcAccount,
          referrerStats: referrerStatsPDA,
          feeToken: usdcMint,
          auth: await getAuthPDA(),
          vault: await getVaultPDA(escrowPDA),
          commissionVault: await getCommissionVaultPDA(),
          escrow: escrowPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([platform])
        .rpc();
      
      // Verify platform received correct amount
      const platformBalanceAfter = await getAccount(provider.connection, platformUsdcAccount);
      const platformRevenue = escrowAccount.actualFeeCharged.sub(escrowAccount.referrerCommission);
      const balanceIncrease = Number(platformBalanceAfter.amount) - Number(platformBalanceBefore.amount);
      assert.equal(balanceIncrease, platformRevenue.toNumber());
      
      // Verify escrow completed
      const escrowAccountAfter = await program.account.feeEscrowState.fetch(escrowPDA);
      assert.isTrue(escrowAccountAfter.isCompleted);
      
      // Verify referrer stats updated
      const statsAfter = await program.account.referrerStats.fetch(referrerStatsPDA);
      assert.equal(statsAfter.confirmedVolume.toString(), escrowAccount.tradeAmount.toString());
      assert.equal(statsAfter.pendingCommission.toString(), escrowAccount.referrerCommission.toString());
    });
    
    it('Should prevent double claiming', async () => {
      try {
        await program.methods
          .claimFee()
          .accounts({
            platform: platform.publicKey,
            user: user.publicKey,
            referrer: referrer.publicKey,
            platformAta: platformUsdcAccount,
            referrerStats: await getReferrerStatsPDA(referrer.publicKey),
            feeToken: usdcMint,
            auth: await getAuthPDA(),
            vault: await getVaultPDA(escrowPDA),
            commissionVault: await getCommissionVaultPDA(),
            escrow: escrowPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([platform])
          .rpc();
        
        assert.fail('Should have failed - already completed');
      } catch (error) {
        assert.include(error.toString(), 'Already completed');
      }
    });
  });
  
  describe('Referral Commission', () => {
    it('Referrer should claim commission', async () => {
      const [referrerStatsPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("referrer_stats"),
          referrer.publicKey.toBuffer()
        ],
        program.programId
      );
      
      const statsBefore = await program.account.referrerStats.fetch(referrerStatsPDA);
      const referrerBalanceBefore = await getAccount(provider.connection, referrerUsdcAccount);
      
      await program.methods
        .claimReferralCommission()
        .accounts({
          referrer: referrer.publicKey,
          referrerAta: referrerUsdcAccount,
          referrerStats: referrerStatsPDA,
          feeToken: usdcMint,
          commissionVault: await getCommissionVaultPDA(),
          auth: await getAuthPDA(),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([referrer])
        .rpc();
      
      // Verify commission received
      const referrerBalanceAfter = await getAccount(provider.connection, referrerUsdcAccount);
      const balanceIncrease = Number(referrerBalanceAfter.amount) - Number(referrerBalanceBefore.amount);
      assert.equal(balanceIncrease, statsBefore.pendingCommission.toNumber());
      
      // Verify stats updated
      const statsAfter = await program.account.referrerStats.fetch(referrerStatsPDA);
      assert.equal(statsAfter.pendingCommission.toNumber(), 0);
      assert.equal(
        statsAfter.totalCommissionClaimed.toString(),
        statsBefore.totalCommissionClaimed.add(statsBefore.pendingCommission).toString()
      );
    });
  });
  
  describe('Dispute Flow', () => {
    let escrowPDA: PublicKey;
    
    before(async () => {
      const seed = new BN(Date.now() + 4);
      escrowPDA = await createAndExecuteEscrowHelper(user, seed);
    });
    
    it('User should be able to dispute', async () => {
      await program.methods
        .disputeClaim(new BN(await provider.connection.getSlot()))
        .accounts({
          user: user.publicKey,
          escrow: escrowPDA,
        })
        .signers([user])
        .rpc();
      
      const escrowAccount = await program.account.feeEscrowState.fetch(escrowPDA);
      assert.isTrue(escrowAccount.isDisputed);
    });
    
    it('Platform should not be able to claim disputed escrow', async () => {
      const escrowAccount = await program.account.feeEscrowState.fetch(escrowPDA);
      
      try {
        await program.methods
          .claimFee()
          .accounts({
            platform: platform.publicKey,
            user: escrowAccount.user,
            referrer: escrowAccount.referrer,
            platformAta: platformUsdcAccount,
            referrerStats: await getReferrerStatsPDA(escrowAccount.referrer),
            feeToken: usdcMint,
            auth: await getAuthPDA(),
            vault: await getVaultPDA(escrowPDA),
            commissionVault: await getCommissionVaultPDA(),
            escrow: escrowPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([platform])
          .rpc();
        
        assert.fail('Should have failed - escrow disputed');
      } catch (error) {
        assert.include(error.toString(), 'Transaction disputed');
      }
    });
  });
  
  describe('Refund Flow', () => {
    it('User should refund expired escrow', async () => {
      // Create escrow with short expiration
      const seed = new BN(Date.now() + 5);
      const shortExpiration = new BN(await provider.connection.getSlot() + 5);
      const escrowPDA = await createEscrowWithExpirationHelper(user, seed, shortExpiration);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const userBalanceBefore = await getAccount(provider.connection, userUsdcAccount);
      const escrowAccount = await program.account.feeEscrowState.fetch(escrowPDA);
      
      await program.methods
        .refundFee(new BN(await provider.connection.getSlot()))
        .accounts({
          user: user.publicKey,
          referrer: escrowAccount.referrer,
          userAta: userUsdcAccount,
          referrerStats: await getReferrerStatsPDA(escrowAccount.referrer),
          feeToken: usdcMint,
          auth: await getAuthPDA(),
          vault: await getVaultPDA(escrowPDA),
          escrow: escrowPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      
      // Verify refund received
      const userBalanceAfter = await getAccount(provider.connection, userUsdcAccount);
      const balanceIncrease = Number(userBalanceAfter.amount) - Number(userBalanceBefore.amount);
      assert.equal(balanceIncrease, escrowAccount.actualFeeCharged.toNumber());
    });
  });
  
  // Helper functions
  async function depositFeeHelper(user: Keypair, seed: BN): Promise<PublicKey> {
    // Implementation similar to the deposit test
    // Returns escrowPDA
  }
  
  async function createEscrowHelper(user: Keypair, seed: BN): Promise<PublicKey> {
    // Creates escrow without execution
    // Returns escrowPDA
  }
  
  async function createAndExecuteEscrowHelper(user: Keypair, seed: BN): Promise<PublicKey> {
    // Creates escrow and submits execution proof
    // Returns escrowPDA
  }
  
  async function createEscrowWithExpirationHelper(
    user: Keypair, 
    seed: BN, 
    expiration: BN
  ): Promise<PublicKey> {
    // Creates escrow with custom expiration
    // Returns escrowPDA
  }
  
  async function getAuthPDA(): Promise<PublicKey> {
    const [authPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("auth")],
      program.programId
    );
    return authPDA;
  }
  
  async function getVaultPDA(escrow: PublicKey): Promise<PublicKey> {
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrow.toBuffer()],
      program.programId
    );
    return vaultPDA;
  }
  
  async function getCommissionVaultPDA(): Promise<PublicKey> {
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("commission_vault")],
      program.programId
    );
    return vaultPDA;
  }
  
  async function getReferrerStatsPDA(referrer: PublicKey): Promise<PublicKey> {
    const [statsPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("referrer_stats"), referrer.toBuffer()],
      program.programId
    );
    return statsPDA;
  }
});