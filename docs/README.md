# Jupiter Ultra Enhanced Referral System

A Solana-based platform fee escrow system with referral tracking, designed for seamless integration with Jupiter DEX. This system enables secure fee collection, referral rewards, and trade verification for decentralized exchange operations.

## 🚀 Overview

The Jupiter Ultra Enhanced Referral System provides:

- **Fee Escrow Management**: Secure handling of platform fees for trades executed through Jupiter
- **Referral Program**: Comprehensive tracking and reward distribution for referrers
- **Trade Verification**: Simplified verification of trade execution using Jupiter quote parameters
- **Commission Distribution**: Automated commission calculations and claims for all parties

## 🏗️ Architecture

The system consists of four main layers: Frontend, Backend Services, SDK, and Smart Contract. For detailed architectural diagrams and explanations, see:

- **[System Architecture](docs/architecture.md)** - Component overview and account structure
- **[System Flows](docs/flows.md)** - Trade execution and verification flows  
- **[Analytics & Monitoring](docs/analytics.md)** - Dashboard features and KPI tracking
- **[Deployment Architecture](docs/deployment.md)** - Infrastructure and scaling strategy

## 📦 Installation

### Prerequisites

- Node.js v18+
- Solana CLI tools
- Anchor framework
- TypeScript

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/jupiter-referral-system.git
cd jupiter-referral-system

# Install dependencies
npm install

# Build the project
npm run build

# Deploy the contract (requires configured Solana wallet)
cd scripts && npx ts-node deploy.ts

# Initialize the platform
npx ts-node initialize.ts
```

## 🔧 Configuration

### Environment Variables

Create `.env` files in the respective directories:

**Backend `.env`**
```env
PORT=3000
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PROGRAM_ID=your_program_id_here
PLATFORM_WALLET_PATH=/path/to/wallet.json
```

**Frontend `.env`**
```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
REACT_APP_PROGRAM_ID=your_program_id_here
```

## 💻 Usage

### SDK Usage Examples

#### Initialize Client

```typescript
import { PlatformFeeClient } from '@jupiter-referral/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate(); // Or load from file
const client = new PlatformFeeClient(connection, wallet);
```

#### Deposit Fee with Quote

```typescript
// Get quote from Jupiter
const quote = await client.getJupiterQuote({
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: 1000000000, // 1 SOL
  slippage: 50 // 0.5%
});

// Deposit fee
const tx = await client.depositFeeWithQuote({
  quote,
  referrer: referrerPublicKey, // Optional
  referrerSharePercent: 3000, // 0.3%
  referredDiscountPercent: 1000 // 0.1%
});
```

#### Submit Trade Execution

```typescript
// After executing trade through Jupiter
const executionResult = await client.submitExecution({
  escrowAccount: escrowPDA,
  swapSignature: 'your_swap_transaction_signature'
});
```

#### Claim Fees

```typescript
// User claims remaining fee
await client.claimFee({
  escrowAccount: escrowPDA,
  claimType: 'user'
});

// Referrer claims commission
await client.claimReferrerCommission({
  referrer: referrerPublicKey
});
```

### Frontend Integration

```typescript
// Using React hooks
import { usePlatformFee, useReferrerDashboard } from '@jupiter-referral/frontend';

function TradingInterface() {
  const { depositFee, submitExecution, claimFee } = usePlatformFee();
  
  const handleTrade = async () => {
    // 1. Get quote
    const quote = await getJupiterQuote(params);
    
    // 2. Deposit fee
    await depositFee(quote, referrerCode);
    
    // 3. Execute trade through Jupiter
    const txSig = await executeJupiterSwap(quote);
    
    // 4. Submit execution proof
    await submitExecution(txSig);
  };
}
```

## 🔐 Security Features

### Trade Verification

The system uses a simplified verification mechanism matching:
- **Input Mint**: Source token address
- **Output Mint**: Destination token address  
- **Input Amount**: Exact amount being swapped

For detailed verification flows and security architecture, see [System Flows](docs/flows.md) and [Deployment Architecture](docs/deployment.md).

## 🛠️ API Reference

### Backend Endpoints

#### Analytics Service
- `GET /api/analytics/referrer/:pubkey` - Get referrer statistics
- `GET /api/analytics/leaderboard` - Get top referrers
- `GET /api/analytics/volume/:period` - Get volume metrics

#### Fee Service
- `POST /api/fees/claim` - Initiate fee claim
- `GET /api/fees/pending/:user` - Get pending fees
- `GET /api/fees/history/:user` - Get claim history

#### Jupiter Proxy
- `POST /api/jupiter/quote` - Get swap quote
- `POST /api/jupiter/swap` - Get swap instructions
- `GET /api/jupiter/price/:mint` - Get token price

### Smart Contract Instructions

#### `initializeCommissionVault`
Initialize the global commission vault (one-time setup)

#### `depositFeeWithQuote`
Deposit platform fee with Jupiter quote details

#### `submitExecution`
Submit trade execution proof for verification

#### `claimFee`
Claim fees from completed escrow

#### `claimCommission`
Referrers claim accumulated commission

## 📊 Monitoring & Analytics

The system provides comprehensive analytics including referrer dashboards, performance metrics, and revenue tracking. Key metrics include:

- **Total Volume**: Cumulative trade volume through referral links
- **Commission Earned**: Total commission accumulated
- **Active Referrals**: Number of unique users referred
- **Conversion Rate**: Percentage of referrals that trade
- **Average Trade Size**: Mean transaction value

For detailed analytics diagrams and monitoring setup, see [Analytics & Monitoring](docs/analytics.md).

## 🧪 Testing

```bash
# Run all tests
npm test

# Run contract tests
npm run test:contract

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## 🚀 Deployment

### Contract Deployment

```bash
# Build the contract
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet-beta
```

### Service Deployment

```bash
# Backend service
cd backend
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
npm run serve
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [Jupiter Documentation](https://docs.jup.ag)
- [Solana Developer Docs](https://docs.solana.com)
- [Anchor Framework](https://www.anchor-lang.com)
- [Support Discord](https://discord.gg/your-discord)

## 🏃 Quick Start Commands

```bash
# Development
npm run build          # Build TypeScript
npm test              # Run tests
npm run lint          # Lint code
npm run start:backend # Start backend
npm run start:frontend # Start frontend

# Production
npm run build:prod    # Production build
npm run deploy        # Deploy contracts
npm run monitor       # Start monitoring
```