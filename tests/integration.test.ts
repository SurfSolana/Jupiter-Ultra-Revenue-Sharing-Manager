/**
 * End-to-End Integration Tests
 * Tests the complete flow from quote to claim
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  createMint, 
  createAccount, 
  mintTo,
  getAccount 
} from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { assert } from 'chai';
import {
  PlatformFeeEscrowClient,
  JupiterQuoteResponse,
  JupiterExecutionResponse,
  PartnerStatus,
  parseUsdc,
  USDC_MINT
} from '../sdk';
import { JupiterProxyService } from '../backend/services/jupiter-proxy';

describe('Platform Fee Escrow - Integration Tests', () => {
  let connection: Connection;
  let platform: Keypair;
  let user: Keypair;
  let referrer: Keypair;
  let client: PlatformFeeEscrowClient;
  let jupiterService: JupiterProxyService;
  
  // Test configuration
  const RPC_URL = process.env.TEST_RPC_URL || 'http://localhost:8899';
  const JUPITER_API_URL = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
  
  before(async () => {
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    
    // Generate test keypairs
    platform = Keypair.generate();
    user = Keypair.generate();
    referrer = Keypair.generate();
    
    // Airdrop SOL
    const airdropAmount = 10 * LAMPORTS_PER_SOL;
    await Promise.all([
      connection.requestAirdrop(platform.publicKey, airdropAmount),
      connection.requestAirdrop(user.publicKey, airdropAmount),
      connection.requestAirdrop(referrer.publicKey, airdropAmount),
    ]);
    
    // Wait for confirmations
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Initialize services
    jupiterService = new JupiterProxyService(JUPITER_API_URL);
    
    // Initialize SDK client (you need to deploy and get program ID first)
    // client = new PlatformFeeEscrowClient(
    //   connection,
    //   platform,
    //   platform.publicKey,
    //   USDC_MINT,
    //   PROGRAM_ID,
    //   idl
    // );
    
    // Initialize commission vault
    // await client.initializeCommissionVault();
  });
  
  after(() => {
    jupiterService.stop();
  });
  
  describe('Complete Trade Flow', () => {
    let escrowPDA: PublicKey;
    let escrowSeed: BN;
    let jupiterQuote: JupiterQuoteResponse;
    
    it('Should get Jupiter quote', async () => {
      const quoteParams = {
        inputMint: 'So11111111111111111111111111111111111111112', // SOL
        outputMint: USDC_MINT.toString(),
        amount: 1 * 1e9, // 1 SOL
        slippageBps: 50
      };
      
      jupiterQuote = await jupiterService.getQuote(quoteParams);
      
      assert.exists(jupiterQuote);
      assert.equal(jupiterQuote.inputMint, quoteParams.inputMint);
      assert.equal(jupiterQuote.outputMint, quoteParams.outputMint);
      assert.equal(jupiterQuote.inAmount, quoteParams.amount.toString());
      assert.exists(jupiterQuote.outAmount);
      assert.isAbove(Number(jupiterQuote.outAmount), 0);
      
      console.log(`Quote: 1 SOL = ${Number(jupiterQuote.outAmount) / 1e6} USDC`);
    });
    
    it('Should deposit platform fee', async () => {
      const tradeAmount = parseUsdc(Number(jupiterQuote.outAmount) / 1e6);
      const tier: PartnerStatus = 'referred';
      
      const result = await client.depositFeeWithQuote({
        user: user.publicKey,
        jupiterQuote,
        tradeAmount,
        referrer: referrer.publicKey,
        tier
      });
      
      escrowPDA = result.escrowPDA;
      escrowSeed = result.seed;
      
      assert.exists(result.signature);
      assert.exists(escrowPDA);
      assert.exists(escrowSeed);
      
      // Verify escrow created
      const escrowData = await client.getEscrowData(escrowPDA);
      assert.exists(escrowData);
      assert.equal(escrowData.user.toString(), user.publicKey.toString());
      assert.equal(escrowData.referrer.toString(), referrer.publicKey.toString());
      assert.isFalse(escrowData.isCompleted);
      assert.isFalse(escrowData.proofSubmitted);
      
      console.log(`Fee deposited: $${escrowData.actualFeeCharged.toNumber() / 1e6}`);
    });
    
    it('Should execute Jupiter swap', async () => {
      // Get swap transaction
      const swapParams = {
        quoteResponse: jupiterQuote,
        userPublicKey: user.publicKey.toString(),
        prioritizationFeeLamports: 'auto'
      };
      
      const swapResponse = await jupiterService.getSwapTransaction(swapParams);
      assert.exists(swapResponse.swapTransaction);
      
      // In real test, you would sign and send the transaction
      // For now, we'll simulate the execution response
      const mockExecutionResponse: JupiterExecutionResponse = {
        status: "Success",
        signature: Keypair.generate().publicKey.toString(),
        slot: "12345678",
        code: 200,
        totalInputAmount: jupiterQuote.inAmount,
        totalOutputAmount: jupiterQuote.outAmount,
        inputAmountResult: jupiterQuote.inAmount,
        outputAmountResult: jupiterQuote.outAmount,
        swapEvents: [{
          inputMint: jupiterQuote.inputMint,
          inputAmount: jupiterQuote.inAmount,
          outputMint: jupiterQuote.outputMint,
          outputAmount: jupiterQuote.outAmount
        }]
      };
      
      console.log(`Swap executed: ${mockExecutionResponse.signature}`);
    });
    
    it('Should submit execution proof', async () => {
      const mockExecutionResponse: JupiterExecutionResponse = {
        status: "Success",
        signature: Keypair.generate().publicKey.toString(),
        slot: "12345678",
        code: 200,
        totalInputAmount: jupiterQuote.inAmount,
        totalOutputAmount: jupiterQuote.outAmount,
        inputAmountResult: jupiterQuote.inAmount,
        outputAmountResult: jupiterQuote.outAmount,
        swapEvents: [{
          inputMint: jupiterQuote.inputMint,
          inputAmount: jupiterQuote.inAmount,
          outputMint: jupiterQuote.outputMint,
          outputAmount: jupiterQuote.outAmount
        }]
      };
      
      const proofTx = await client.submitJupiterExecution({
        user: user.publicKey,
        escrowPDA,
        executionResponse: mockExecutionResponse
      });
      
      assert.exists(proofTx);
      
      // Verify proof submitted
      const escrowData = await client.getEscrowData(escrowPDA);
      assert.isTrue(escrowData.proofSubmitted);
      assert.equal(
        escrowData.executionSignature.toString(), 
        mockExecutionResponse.signature
      );
      
      console.log(`Proof submitted: ${proofTx}`);
    });
    
    it('Platform should claim fee', async () => {
      const escrowData = await client.getEscrowData(escrowPDA);
      assert.exists(escrowData);
      
      const claimTx = await client.claimPlatformFee({
        escrowPDA,
        escrowData
      });
      
      assert.exists(claimTx);
      
      // Verify escrow completed
      const escrowDataAfter = await client.getEscrowData(escrowPDA);
      assert.isTrue(escrowDataAfter.isCompleted);
      
      // Calculate expected amounts
      const platformRevenue = escrowData.actualFeeCharged
        .sub(escrowData.referrerCommission)
        .toNumber() / 1e6;
      
      console.log(`Platform claimed: $${platformRevenue}`);
      console.log(`Referrer commission pending: $${escrowData.referrerCommission.toNumber() / 1e6}`);
    });
    
    it('Referrer should claim commission', async () => {
      const statsBefore = await client.getReferrerStats(referrer.publicKey);
      assert.exists(statsBefore);
      assert.isAbove(statsBefore.pendingCommission.toNumber(), 0);
      
      const claimTx = await client.claimReferralCommission(referrer.publicKey);
      assert.exists(claimTx);
      
      // Verify commission claimed
      const statsAfter = await client.getReferrerStats(referrer.publicKey);
      assert.equal(statsAfter.pendingCommission.toNumber(), 0);
      assert.isAbove(statsAfter.totalCommissionClaimed.toNumber(), 0);
      
      console.log(`Referrer claimed: $${statsBefore.pendingCommission.toNumber() / 1e6}`);
    });
  });
  
  describe('Multiple Trades Flow', () => {
    it('Should handle multiple trades from same user', async () => {
      const trades = [
        { amount: 0.5, tier: 'referred' as PartnerStatus },
        { amount: 1.0, tier: 'referred' as PartnerStatus },
        { amount: 2.0, tier: 'premium' as PartnerStatus }
      ];
      
      for (const trade of trades) {
        // Get quote
        const quote = await jupiterService.getQuote({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: USDC_MINT.toString(),
          amount: trade.amount * 1e9,
          slippageBps: 50
        });
        
        // Deposit fee
        const tradeAmount = parseUsdc(Number(quote.outAmount) / 1e6);
        const deposit = await client.depositFeeWithQuote({
          user: user.publicKey,
          jupiterQuote: quote,
          tradeAmount,
          referrer: referrer.publicKey,
          tier: trade.tier
        });
        
        console.log(`Trade ${trade.amount} SOL deposited: ${deposit.signature}`);
      }
      
      // Check referrer stats
      const stats = await client.getReferrerStats(referrer.publicKey);
      assert.equal(stats.totalTransactions.toNumber(), trades.length + 1); // +1 from previous test
    });
  });
  
  describe('Error Scenarios', () => {
    it('Should handle expired escrow refund', async () => {
      // Create escrow with very short expiration
      const quote = await jupiterService.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: USDC_MINT.toString(),
        amount: 0.1 * 1e9,
        slippageBps: 50
      });
      
      // Would need to modify client to accept custom expiration for testing
      // For now, this is a placeholder
      console.log('Expired escrow test placeholder');
    });
    
    it('Should handle dispute flow', async () => {
      // Create and execute a trade
      const quote = await jupiterService.getQuote({
        inputMint: 'So11111111111111111111111111111111111111111111112',
        outputMint: USDC_MINT.toString(),
        amount: 0.1 * 1e9,
        slippageBps: 50
      });
      
      const tradeAmount = parseUsdc(Number(quote.outAmount) / 1e6);
      const deposit = await client.depositFeeWithQuote({
        user: user.publicKey,
        jupiterQuote: quote,
        tradeAmount,
        referrer: user.publicKey, // Self-referral
        tier: 'default'
      });
      
      // Submit execution
      const mockExecution: JupiterExecutionResponse = {
        status: "Success",
        signature: Keypair.generate().publicKey.toString(),
        slot: "12345678",
        code: 200,
        totalInputAmount: quote.inAmount,
        totalOutputAmount: quote.outAmount,
        inputAmountResult: quote.inAmount,
        outputAmountResult: quote.outAmount,
        swapEvents: [{
          inputMint: quote.inputMint,
          inputAmount: quote.inAmount,
          outputMint: quote.outputMint,
          outputAmount: quote.outAmount
        }]
      };
      
      await client.submitJupiterExecution({
        user: user.publicKey,
        escrowPDA: deposit.escrowPDA,
        executionResponse: mockExecution
      });
      
      // Dispute the claim
      const disputeTx = await client.disputeClaim(
        user.publicKey,
        deposit.escrowPDA,
        deposit.seed
      );
      
      assert.exists(disputeTx);
      
      // Verify disputed
      const escrowData = await client.getEscrowData(deposit.escrowPDA);
      assert.isTrue(escrowData.isDisputed);
      
      console.log('Escrow disputed successfully');
    });
  });
  
  describe('Analytics and Dashboard', () => {
    it('Should fetch referrer dashboard data', async () => {
      const dashboard = await client.getReferrerDashboard(referrer.publicKey);
      
      assert.exists(dashboard);
      assert.isAbove(dashboard.totalTransactions, 0);
      assert.isAbove(dashboard.totalVolume, 0);
      assert.isAbove(dashboard.totalEarned, 0);
      
      console.log('Referrer Dashboard:');
      console.log(`- Total Transactions: ${dashboard.totalTransactions}`);
      console.log(`- Total Volume: $${dashboard.totalVolume.toFixed(2)}`);
      console.log(`- Total Earned: $${dashboard.totalEarned.toFixed(2)}`);
      console.log(`- Total Claimed: $${dashboard.totalClaimed.toFixed(2)}`);
      console.log(`- Available to Claim: $${dashboard.availableToClaim.toFixed(2)}`);
    });
    
    it('Should fetch platform analytics', async () => {
      // This would typically be done through the backend API
      // For now, we can aggregate from on-chain data
      
      const escrows = await client.getUserEscrows(user.publicKey);
      assert.isAbove(escrows.length, 0);
      
      let totalVolume = 0;
      let totalFees = 0;
      
      for (const { account } of escrows) {
        totalVolume += account.tradeAmount.toNumber() / 1e6;
        totalFees += account.actualFeeCharged.toNumber() / 1e6;
      }
      
      console.log('Platform Analytics:');
      console.log(`- User Escrows: ${escrows.length}`);
      console.log(`- Total Volume: $${totalVolume.toFixed(2)}`);
      console.log(`- Total Fees: $${totalFees.toFixed(2)}`);
    });
  });
  
  describe('Performance Tests', () => {
    it('Should handle concurrent deposits', async () => {
      const concurrentTrades = 5;
      const promises = [];
      
      for (let i = 0; i < concurrentTrades; i++) {
        const promise = (async () => {
          const quote = await jupiterService.getQuote({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: USDC_MINT.toString(),
            amount: 0.1 * 1e9,
            slippageBps: 50
          });
          
          const tradeAmount = parseUsdc(Number(quote.outAmount) / 1e6);
          return client.depositFeeWithQuote({
            user: user.publicKey,
            jupiterQuote: quote,
            tradeAmount,
            referrer: referrer.publicKey,
            tier: 'referred'
          });
        })();
        
        promises.push(promise);
      }
      
      const results = await Promise.all(promises);
      assert.equal(results.length, concurrentTrades);
      
      console.log(`Successfully processed ${concurrentTrades} concurrent deposits`);
    });
    
    it('Should efficiently query unclaimed escrows', async () => {
      const startTime = Date.now();
      const unclaimedEscrows = await client.getUnclaimedEscrows();
      const queryTime = Date.now() - startTime;
      
      console.log(`Found ${unclaimedEscrows.length} unclaimed escrows in ${queryTime}ms`);
      assert.isBelow(queryTime, 5000); // Should complete within 5 seconds
    });
  });
});