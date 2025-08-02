/**
 * Platform Fee Escrow Backend Service
 * Provides Jupiter API proxy and automated fee claiming
 */

import express from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  PlatformFeeEscrowClient,
  JupiterQuoteResponse,
  JupiterExecutionResponse,
  SwapEvent
} from '../sdk';
import { config } from './config';
import { JupiterProxyService } from './services/jupiter-proxy';
import { FeeClaimService } from './services/fee-claim-service';
import { AnalyticsService } from './services/analytics-service';
import { TransactionVerificationService } from './services/transaction-verification-service';

// =============================================================================
// SETUP
// =============================================================================

const app = express();
app.use(express.json());
app.use(cors());

// Initialize services
const connection = new Connection(config.RPC_URL, 'confirmed');
const platformKeypair = Keypair.fromSecretKey(
  Buffer.from(config.PLATFORM_PRIVATE_KEY, 'base64')
);

// Initialize SDK client (you'll need to provide the IDL)
let client: PlatformFeeEscrowClient;
let jupiterProxy: JupiterProxyService;
let feeClaimService: FeeClaimService;
let analyticsService: AnalyticsService;
let verificationService: TransactionVerificationService;

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req, res) => {
  try {
    const slot = await connection.getSlot();
    const balance = await connection.getBalance(platformKeypair.publicKey);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        solana: {
          connected: true,
          slot,
          platformBalance: balance / 1e9
        },
        jupiter: jupiterProxy?.isHealthy() || false,
        feeClaimService: feeClaimService?.isRunning() || false,
        verificationService: verificationService?.getMetrics().status === 'running' || false
      },
      platform: {
        wallet: platformKeypair.publicKey.toString(),
        feeToken: config.FEE_TOKEN
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// =============================================================================
// JUPITER API PROXY ENDPOINTS
// =============================================================================

// Get quote from Jupiter
app.post('/api/jupiter/quote', async (req, res) => {
  try {
    const quote = await jupiterProxy.getQuote(req.body);
    res.json(quote);
  } catch (error) {
    console.error('Jupiter quote error:', error);
    res.status(500).json({ 
      error: 'Failed to get Jupiter quote',
      details: error.message 
    });
  }
});

// Get swap transaction from Jupiter
app.post('/api/jupiter/swap', async (req, res) => {
  try {
    const swapResponse = await jupiterProxy.getSwapTransaction(req.body);
    res.json(swapResponse);
  } catch (error) {
    console.error('Jupiter swap error:', error);
    res.status(500).json({ 
      error: 'Failed to get swap transaction',
      details: error.message 
    });
  }
});

// Submit swap transaction and get execution result
app.post('/api/jupiter/execute', async (req, res) => {
  try {
    const { serializedTransaction, userPublicKey } = req.body;
    const executionResult = await jupiterProxy.executeSwap(
      serializedTransaction,
      userPublicKey
    );
    res.json(executionResult);
  } catch (error) {
    console.error('Jupiter execution error:', error);
    res.status(500).json({ 
      error: 'Failed to execute swap',
      details: error.message 
    });
  }
});

// Verify Jupiter transaction using signature-based matching
app.post('/api/jupiter/verify', async (req, res) => {
  try {
    const { signedTransactionBase64 } = req.body;
    
    if (!signedTransactionBase64) {
      return res.status(400).json({ 
        error: 'Missing signedTransactionBase64 parameter' 
      });
    }
    
    const verification = await jupiterProxy.verifyJupiterTransaction(
      signedTransactionBase64,
      connection
    );
    
    res.json(verification);
  } catch (error) {
    console.error('Jupiter verification error:', error);
    res.status(500).json({ 
      error: 'Failed to verify Jupiter transaction',
      details: error.message 
    });
  }
});

// Execute and verify Jupiter transaction
app.post('/api/jupiter/execute-and-verify', async (req, res) => {
  try {
    const { signedTransactionBase64, sendTransaction = false } = req.body;
    
    if (!signedTransactionBase64) {
      return res.status(400).json({ 
        error: 'Missing signedTransactionBase64 parameter' 
      });
    }
    
    const result = await jupiterProxy.executeAndVerifyTransaction(
      signedTransactionBase64,
      connection,
      sendTransaction
    );
    
    res.json(result);
  } catch (error) {
    console.error('Jupiter execute and verify error:', error);
    res.status(500).json({ 
      error: 'Failed to execute and verify transaction',
      details: error.message 
    });
  }
});

// =============================================================================
// TRANSACTION VERIFICATION ENDPOINTS
// =============================================================================

// Queue transaction for verification
app.post('/api/verification/queue', async (req, res) => {
  try {
    const { recordId } = req.body;
    
    if (!recordId) {
      return res.status(400).json({ 
        error: 'Missing recordId parameter' 
      });
    }
    
    await verificationService.queueForVerification(recordId);
    
    res.json({ 
      success: true,
      message: `Transaction ${recordId} queued for verification` 
    });
  } catch (error) {
    console.error('Queue verification error:', error);
    res.status(500).json({ 
      error: 'Failed to queue transaction for verification',
      details: error.message 
    });
  }
});

// Get verification service status
app.get('/api/verification/status', async (req, res) => {
  try {
    const status = verificationService.getQueueStatus();
    const metrics = verificationService.getMetrics();
    
    res.json({
      ...status,
      ...metrics
    });
  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({ 
      error: 'Failed to get verification status',
      details: error.message 
    });
  }
});

// Get recent verification results
app.get('/api/verification/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const recentVerifications = verificationService.getRecentVerifications(limit);
    
    res.json(recentVerifications);
  } catch (error) {
    console.error('Recent verifications error:', error);
    res.status(500).json({ 
      error: 'Failed to get recent verifications',
      details: error.message 
    });
  }
});

// Verify transaction by signature
app.post('/api/verification/by-signature', async (req, res) => {
  try {
    const { signature } = req.body;
    
    if (!signature) {
      return res.status(400).json({ 
        error: 'Missing signature parameter' 
      });
    }
    
    const verification = await verificationService.verifyBySignature(signature);
    
    res.json(verification);
  } catch (error) {
    console.error('Signature verification error:', error);
    res.status(500).json({ 
      error: 'Failed to verify transaction by signature',
      details: error.message 
    });
  }
});

// =============================================================================
// PLATFORM FEE ENDPOINTS
// =============================================================================

// Get fee breakdown for a trade
app.post('/api/fees/calculate', (req, res) => {
  try {
    const { tradeAmount, tier = 'default' } = req.body;
    const breakdown = analyticsService.calculateFeeBreakdown(tradeAmount, tier);
    res.json(breakdown);
  } catch (error) {
    res.status(400).json({ 
      error: 'Failed to calculate fees',
      details: error.message 
    });
  }
});

// Get escrow details
app.get('/api/escrow/:address', async (req, res) => {
  try {
    const escrowPDA = new PublicKey(req.params.address);
    const escrowData = await client.getEscrowData(escrowPDA);
    
    if (!escrowData) {
      return res.status(404).json({ error: 'Escrow not found' });
    }
    
    res.json({
      publicKey: escrowPDA.toString(),
      ...escrowData
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch escrow',
      details: error.message 
    });
  }
});

// =============================================================================
// REFERRER ENDPOINTS
// =============================================================================

// Get referrer statistics
app.get('/api/referrer/:address/stats', async (req, res) => {
  try {
    const referrer = new PublicKey(req.params.address);
    const dashboard = await client.getReferrerDashboard(referrer);
    
    if (!dashboard) {
      return res.status(404).json({ error: 'Referrer not found' });
    }
    
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch referrer stats',
      details: error.message 
    });
  }
});

// Get referrer's referred users
app.get('/api/referrer/:address/referrals', async (req, res) => {
  try {
    const referrer = new PublicKey(req.params.address);
    const referrals = await analyticsService.getReferrerReferrals(referrer);
    res.json(referrals);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch referrals',
      details: error.message 
    });
  }
});

// =============================================================================
// ANALYTICS ENDPOINTS
// =============================================================================

// Get platform-wide analytics
app.get('/api/analytics/platform', async (req, res) => {
  try {
    const analytics = await analyticsService.getPlatformAnalytics();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch platform analytics',
      details: error.message 
    });
  }
});

// Get top referrers
app.get('/api/analytics/top-referrers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topReferrers = await analyticsService.getTopReferrers(limit);
    res.json(topReferrers);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch top referrers',
      details: error.message 
    });
  }
});

// Get recent transactions
app.get('/api/analytics/recent-transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const transactions = await analyticsService.getRecentTransactions(limit);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch recent transactions',
      details: error.message 
    });
  }
});

// =============================================================================
// WEBHOOK ENDPOINTS
// =============================================================================

// Handle dispute notifications
app.post('/api/webhooks/dispute', async (req, res) => {
  try {
    const { escrow, user, reason } = req.body;
    
    console.log(`DISPUTE ALERT: Escrow ${escrow} disputed by ${user}`);
    
    // Notify support team
    await notifySupport({
      type: 'DISPUTE',
      escrow,
      user,
      reason,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to process dispute webhook',
      details: error.message 
    });
  }
});

// Handle successful claim notifications
app.post('/api/webhooks/claim-success', async (req, res) => {
  try {
    const { escrow, platformRevenue, referrerCommission } = req.body;
    
    // Log for analytics
    await analyticsService.logSuccessfulClaim({
      escrow,
      platformRevenue,
      referrerCommission,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to process claim webhook',
      details: error.message 
    });
  }
});

// =============================================================================
// ADMIN ENDPOINTS (protect these in production!)
// =============================================================================

// Force claim a specific escrow
app.post('/api/admin/force-claim', async (req, res) => {
  try {
    // TODO: Add authentication check
    const { escrowAddress } = req.body;
    const result = await feeClaimService.forceClaimEscrow(
      new PublicKey(escrowAddress)
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to force claim',
      details: error.message 
    });
  }
});

// Pause/resume fee claim service
app.post('/api/admin/claim-service/:action', async (req, res) => {
  try {
    // TODO: Add authentication check
    const { action } = req.params;
    
    if (action === 'pause') {
      await feeClaimService.pause();
    } else if (action === 'resume') {
      await feeClaimService.resume();
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    res.json({ 
      success: true, 
      status: feeClaimService.isRunning() ? 'running' : 'paused' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: `Failed to ${req.params.action} service`,
      details: error.message 
    });
  }
});

// =============================================================================
// SUPPORT UTILITIES
// =============================================================================

async function notifySupport(alert: any) {
  // Implement your notification system
  if (config.SLACK_WEBHOOK_URL) {
    try {
      await fetch(config.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Platform Fee Alert: ${alert.type}`,
          attachments: [{
            color: alert.type === 'DISPUTE' ? 'danger' : 'warning',
            fields: Object.entries(alert).map(([key, value]) => ({
              title: key.charAt(0).toUpperCase() + key.slice(1),
              value: String(value),
              short: true
            }))
          }]
        })
      });
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
    }
  }
}

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

async function initializeServices() {
  try {
    console.log('🚀 Initializing Platform Fee Escrow Backend...');
    
    // Initialize SDK client (you need to load the IDL)
    // const idl = await loadIdl(); // Implement this
    // client = new PlatformFeeEscrowClient(
    //   connection,
    //   platformKeypair,
    //   new PublicKey(config.PLATFORM_WALLET),
    //   new PublicKey(config.FEE_TOKEN),
    //   new PublicKey(config.PROGRAM_ID),
    //   idl
    // );
    
    // Initialize services
    jupiterProxy = new JupiterProxyService(config.JUPITER_API_URL);
    verificationService = new TransactionVerificationService(connection);
    // feeClaimService = new FeeClaimService(client, platformKeypair, connection);
    // analyticsService = new AnalyticsService(client, connection);
    
    // Check if commission vault is initialized
    // const isInitialized = await client.isCommissionVaultInitialized();
    // if (!isInitialized) {
    //   console.log('⚠️  Commission vault not initialized. Run initialization script.');
    // }
    
    // Start automated services
    await verificationService.start();
    // await feeClaimService.start();
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

async function startServer() {
  try {
    await initializeServices();
    
    const port = config.PORT || 3000;
    app.listen(port, () => {
      console.log(`
🚀 Platform Fee Escrow Backend Running
📍 Port: ${port}
💰 Platform: ${platformKeypair.publicKey.toString()}
🌐 RPC: ${config.RPC_URL}
📊 Environment: ${config.NODE_ENV}
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (verificationService) {
    await verificationService.stop();
  }
  
  if (feeClaimService) {
    await feeClaimService.stop();
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  
  if (verificationService) {
    await verificationService.stop();
  }
  
  if (feeClaimService) {
    await feeClaimService.stop();
  }
  
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

export { app, startServer };