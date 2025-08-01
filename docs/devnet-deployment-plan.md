# Devnet Deployment & Testing Plan with Real Jupiter Verification

This document outlines a comprehensive plan for deploying and testing the platform fee escrow system on Solana devnet while using real Jupiter mainnet transactions for verification testing.

## Overview

The strategy involves:
1. Deploy smart contracts to devnet for safe testing
2. Use devnet tokens for fee escrow mechanics
3. Collect real Jupiter mainnet transaction data for verification testing
4. Test all system components in a controlled devnet environment
5. Validate that verification logic works with actual Jupiter transaction patterns

## Phase 1: Development Environment Setup

### 1.1 Solana CLI Configuration
```bash
# Switch to devnet
solana config set --url https://api.devnet.solana.com

# Create/configure deployment keypair
solana-keygen new --outfile ~/.config/solana/devnet-deployer.json
solana config set --keypair ~/.config/solana/devnet-deployer.json

# Fund the deployer account
solana airdrop 5
```

### 1.2 Test Token Setup
```bash
# Create test tokens that mirror mainnet tokens
# Example: Create devnet USDC equivalent
spl-token create-token --decimals 6  # Save mint address as DEVNET_USDC
spl-token create-account <DEVNET_USDC_MINT>
spl-token mint <DEVNET_USDC_MINT> 1000000  # 1M test USDC

# Create additional test tokens for multi-hop testing
spl-token create-token --decimals 9  # SOL equivalent
spl-token create-token --decimals 6  # Alternative stable token
```

### 1.3 Jupiter API Configuration
```typescript
// Configure Jupiter API for both mainnet (data collection) and devnet (testing)
const JUPITER_CONFIG = {
  mainnet: {
    baseUrl: 'https://quote-api.jup.ag/v6',
    purpose: 'verification_data_collection'
  },
  devnet: {
    baseUrl: 'https://quote-api.jup.ag/v6', // Note: Jupiter runs on mainnet only
    purpose: 'quote_simulation_only'
  }
}
```

## Phase 2: Smart Contract Deployment

### 2.1 Contract Compilation and Deployment
```bash
# Build the smart contract
cd contracts
npm run build

# Deploy to devnet
solana program deploy target/deploy/platform_fee_escrow.so --program-id platform_fee_escrow-keypair.json

# Save program ID for configuration
echo "PROGRAM_ID=$(solana address -k platform_fee_escrow-keypair.json)" > .env
```

### 2.2 Initialize Platform Accounts
```bash
# Initialize platform authority and fee collection accounts
cd sdk
npm run initialize:devnet
```

### 2.3 Verify Deployment
```bash
# Check program deployment
solana program show <PROGRAM_ID>

# Verify account creation
solana account <PLATFORM_AUTHORITY_PDA>
solana account <FEE_COLLECTION_ACCOUNT>
```

## Phase 3: Backend Service Configuration

### 3.1 Environment Configuration
```env
# .env.devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
PROGRAM_ID=<DEPLOYED_PROGRAM_ID>
PLATFORM_KEYPAIR_PATH=./keys/platform-devnet.json

# Jupiter Integration
JUPITER_API_URL=https://quote-api.jup.ag/v6
JUPITER_ENVIRONMENT=mainnet  # Still use mainnet for quotes

# Test Token Configuration
DEVNET_USDC_MINT=<DEVNET_USDC_MINT>
DEVNET_SOL_MINT=So11111111111111111111111111111111111111112  # Native SOL
DEVNET_TEST_TOKEN_MINT=<OTHER_TEST_MINT>

# Database (for storing test data)
DATABASE_URL=postgresql://localhost:5432/platform_fee_devnet
REDIS_URL=redis://localhost:6379/1
```

### 3.2 Service Deployment
```bash
# Start backend services
cd backend
npm install
npm run build
npm run start:devnet

# Verify services are running
curl http://localhost:3001/health
curl http://localhost:3001/api/quote?inputMint=<DEVNET_USDC>&outputMint=<DEVNET_SOL>&amount=1000000
```

## Phase 4: Real Jupiter Transaction Data Collection

### 4.1 Mainnet Transaction Monitor
```typescript
// scripts/collect-jupiter-data.ts
import { Connection, PublicKey } from '@solana/web3.js';

const JUPITER_PROGRAM_IDS = [
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',  // Jupiter V4
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',   // Jupiter V6
];

async function collectJupiterTransactions() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  
  // Collect recent Jupiter transactions
  for (const programId of JUPITER_PROGRAM_IDS) {
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(programId),
      { limit: 100 }
    );
    
    for (const sigInfo of signatures) {
      const tx = await connection.getTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (tx && tx.meta && !tx.meta.err) {
        // Parse and store transaction data
        await storeTransactionForTesting(tx, sigInfo.signature);
      }
    }
  }
}
```

### 4.2 Transaction Pattern Analysis
```typescript
// scripts/analyze-jupiter-patterns.ts
interface JupiterSwapEvent {
  inputMint: string;
  outputMint: string;
  inputAmount: bigint;
  outputAmount: bigint;
  signature: string;
  programId: string;
}

async function analyzeSwapPatterns() {
  const transactions = await loadStoredTransactions();
  
  // Analyze patterns for verification testing
  const patterns = {
    singleHop: transactions.filter(tx => tx.swapEvents.length === 1),
    multiHop: transactions.filter(tx => tx.swapEvents.length > 1),
    commonPairs: groupByTokenPairs(transactions),
    amountDistribution: analyzeAmountRanges(transactions)
  };
  
  // Generate test cases
  await generateTestCases(patterns);
}
```

## Phase 5: Frontend Development & Testing

### 5.1 Frontend Configuration
```typescript
// src/config/devnet.ts
export const DEVNET_CONFIG = {
  solanaNetwork: 'devnet',
  rpcEndpoint: 'https://api.devnet.solana.com',
  programId: process.env.REACT_APP_PROGRAM_ID,
  
  // Test tokens
  tokens: {
    USDC: process.env.REACT_APP_DEVNET_USDC,
    SOL: 'So11111111111111111111111111111111111111112',
    TEST_TOKEN: process.env.REACT_APP_DEVNET_TEST_TOKEN
  },
  
  // Jupiter integration (quotes only)
  jupiterApiUrl: 'https://quote-api.jup.ag/v6',
  
  // Backend API
  backendUrl: 'http://localhost:3001'
};
```

### 5.2 Test Wallet Setup
```bash
# Create test wallets with devnet funds
solana-keygen new --outfile ./test-wallets/user1.json
solana-keygen new --outfile ./test-wallets/user2.json
solana-keygen new --outfile ./test-wallets/referrer1.json

# Fund test wallets
solana airdrop 2 ./test-wallets/user1.json
solana airdrop 2 ./test-wallets/user2.json
solana airdrop 2 ./test-wallets/referrer1.json

# Distribute test tokens
spl-token transfer <DEVNET_USDC_MINT> 10000 <USER1_WALLET> --fund-recipient
spl-token transfer <DEVNET_USDC_MINT> 10000 <USER2_WALLET> --fund-recipient
```

## Phase 6: Comprehensive Testing Strategy

### 6.1 Unit Testing with Real Data
```typescript
// tests/verification.test.ts
describe('Jupiter Verification with Real Data', () => {
  const realJupiterTxs = loadRealTransactionData();
  
  test('Single-hop swap verification', async () => {
    const singleHopTx = realJupiterTxs.singleHop[0];
    
    // Create devnet escrow with real transaction parameters
    const escrow = await createTestEscrow({
      inputMint: singleHopTx.inputMint,
      outputMint: singleHopTx.outputMint,
      inputAmount: singleHopTx.inputAmount
    });
    
    // Test verification logic
    const result = await verifyExecution(escrow, singleHopTx.swapEvents);
    expect(result.success).toBe(true);
  });
  
  test('Multi-hop swap verification', async () => {
    const multiHopTx = realJupiterTxs.multiHop[0];
    
    const escrow = await createTestEscrow({
      inputMint: multiHopTx.inputMint,
      outputMint: multiHopTx.outputMint,
      inputAmount: multiHopTx.inputAmount
    });
    
    const result = await verifyExecution(escrow, multiHopTx.swapEvents);
    expect(result.success).toBe(true);
  });
});
```

### 6.2 Integration Testing
```typescript
// tests/integration.test.ts
describe('End-to-End Flow Testing', () => {
  test('Complete fee escrow flow', async () => {
    // 1. Get quote from Jupiter (mainnet quotes)
    const quote = await jupiterApi.getQuote({
      inputMint: DEVNET_USDC,
      outputMint: DEVNET_SOL,
      amount: 1000000
    });
    
    // 2. Deposit fee to escrow (devnet)
    const escrowPda = await depositFeeWithQuote({
      user: testUser.publicKey,
      quote: quote,
      referrer: testReferrer.publicKey
    });
    
    // 3. Simulate Jupiter execution with real data
    const realTxData = getRealTransactionData({
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inputAmount: quote.inAmount
    });
    
    // 4. Submit execution proof
    const proofResult = await submitExecution({
      escrow: escrowPda,
      executionData: realTxData
    });
    
    expect(proofResult.success).toBe(true);
    
    // 5. Claim fee
    const claimResult = await claimFee(escrowPda);
    expect(claimResult.success).toBe(true);
  });
});
```

### 6.3 Load Testing
```typescript
// tests/load.test.ts
describe('Load Testing', () => {
  test('Multiple concurrent escrows', async () => {
    const promises = [];
    
    // Create 50 concurrent escrows
    for (let i = 0; i < 50; i++) {
      promises.push(createAndProcessEscrow(testUsers[i]));
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    expect(successful).toBeGreaterThan(45); // 90% success rate
  });
});
```

## Phase 7: Testing Scenarios

### 7.1 Happy Path Testing
1. **Standard Fee Deposit Flow**
   - User connects devnet wallet
   - Gets quote for devnet tokens
   - Deposits fee to escrow
   - Verifies escrow creation

2. **Referrer Commission Flow**
   - User uses referrer code
   - Verifies discount application
   - Confirms referrer stats update
   - Tests commission claiming

3. **Verification with Real Data**
   - Submit real Jupiter transaction data
   - Verify all three-field matching
   - Confirm state updates
   - Test dispute window

### 7.2 Edge Case Testing
1. **Failed Verification**
   - Submit mismatched transaction data
   - Verify rejection and error handling
   - Test refund mechanisms

2. **Expired Escrows**
   - Create escrow and wait for expiration
   - Test automatic refund capability
   - Verify account cleanup

3. **Dispute Handling**
   - Submit valid proof and immediately dispute
   - Test dispute window timing
   - Verify dispute resolution

### 7.3 Error Condition Testing
1. **Network Issues**
   - Simulate RPC failures
   - Test retry mechanisms
   - Verify graceful degradation

2. **Invalid Data**
   - Submit malformed transaction data
   - Test input validation
   - Verify error responses

## Phase 8: Performance Monitoring

### 8.1 Metrics Collection
```typescript
// monitoring/metrics.ts
const metrics = {
  escrowCreation: {
    successRate: 0,
    averageTime: 0,
    errors: []
  },
  verification: {
    successRate: 0,
    averageTime: 0,
    falsePositives: 0,
    falseNegatives: 0
  },
  claims: {
    successRate: 0,
    averageTime: 0,
    commissionAccuracy: 0
  }
};
```

### 8.2 Dashboard Setup
```bash
# Set up monitoring dashboard
docker-compose up -d prometheus grafana
# Configure dashboards for devnet testing metrics
```

## Phase 9: User Acceptance Testing

### 9.1 Test User Scenarios
1. **Regular Trader**
   - Complete multiple trades
   - Test different token pairs
   - Verify fee calculations

2. **Referrer User**
   - Generate referral links
   - Monitor referral activity
   - Claim commissions

3. **Platform Admin**
   - Monitor system health
   - Process disputes
   - Analyze platform metrics

### 9.2 Feedback Collection
```typescript
// feedback/collector.ts
interface TestFeedback {
  scenario: string;
  success: boolean;
  issues: string[];
  suggestions: string[];
  performanceRating: number;
}
```

## Phase 10: Pre-Mainnet Checklist

### 10.1 Security Audit
- [ ] Smart contract audit completed
- [ ] Vulnerability assessment passed
- [ ] PDA derivation security verified
- [ ] Access control mechanisms tested

### 10.2 Performance Validation
- [ ] Load testing passed (1000+ concurrent users)
- [ ] Transaction success rate > 95%
- [ ] Average response time < 2 seconds
- [ ] Memory usage within acceptable limits

### 10.3 Business Logic Validation
- [ ] Fee calculations accurate across all scenarios
- [ ] Referrer commission distribution correct
- [ ] Dispute mechanisms functional
- [ ] Account cleanup working properly

### 10.4 Documentation Complete
- [ ] API documentation updated
- [ ] User guides created
- [ ] Troubleshooting guides available
- [ ] Deployment runbooks prepared

## Implementation Timeline

### Week 1: Environment Setup
- Days 1-2: Solana devnet configuration
- Days 3-4: Smart contract deployment
- Days 5-7: Backend service configuration

### Week 2: Data Collection & Analysis
- Days 1-3: Jupiter transaction data collection
- Days 4-5: Pattern analysis and test case generation
- Days 6-7: Verification logic testing

### Week 3: Frontend Development
- Days 1-3: Frontend devnet integration
- Days 4-5: Test wallet setup and token distribution
- Days 6-7: UI/UX testing with devnet

### Week 4: Comprehensive Testing
- Days 1-2: Unit and integration testing
- Days 3-4: Load and performance testing
- Days 5-7: User acceptance testing and bug fixes

### Week 5: Final Validation
- Days 1-3: Security audit and fixes
- Days 4-5: Performance optimization
- Days 6-7: Documentation and deployment preparation

This plan ensures thorough testing of your platform fee escrow system using real Jupiter transaction patterns while maintaining the safety of devnet development. The combination of devnet testing with mainnet verification data provides confidence that the system will work correctly when deployed to mainnet.