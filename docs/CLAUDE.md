# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build TypeScript (SDK and backend)
npm run build

# Run tests
npm test

# Lint TypeScript files
npm run lint

# Start backend service
npm run start:backend

# Start frontend
npm run start:frontend
```

## Architecture Overview

This is a Solana-based platform fee escrow system with referral tracking, designed for Jupiter DEX integration. The system enables:

1. **Fee Collection**: Users deposit platform fees when making trades through Jupiter
2. **Referral System**: Tracks referrers and distributes commission shares
3. **Verification**: Validates trades against Jupiter quotes using inputMint + outputMint + inputAmount matching

### Key Components

**Smart Contract** (`contracts/platform-fee-escrow.ts`)
- Uses Solanaturbine/Poseidon framework
- Core accounts: FeeEscrowState (per-user escrow), ReferrerStats (tracks referrer performance)
- Key functions: depositFeeWithQuote, submitExecution, claimFee
- Verification: Matches Jupiter quote details (inputMint, outputMint, inputAmount) with actual swap events

**SDK** (`sdk/`)
- TypeScript client for interacting with the contract
- Handles PDA derivation, transaction building, and Jupiter integration
- Key classes: PlatformFeeClient, utility functions for PDAs and parsing

**Backend** (`backend/`)
- Express server providing analytics and proxy services
- Services: analytics-service (referrer dashboards), fee-claim-service, jupiter-proxy
- Endpoints for fetching quotes, swap instructions, and referrer statistics

**Frontend** (`frontend/`)
- React components: FeeDepositModal, ReferrerDashboard
- Hooks: usePlatformFee, useReferrerDashboard for state management

### Data Flow

1. User requests Jupiter quote through backend proxy
2. User deposits fee with quote details into escrow
3. User executes trade through Jupiter
4. Backend monitors and verifies execution against escrow
5. User/platform can claim fees after successful verification

### Key Design Decisions

- **Simplified Verification**: Uses only inputMint + outputMint + inputAmount for trade matching (no cryptographic proof)
- **Referral Model**: Referrers earn percentage of platform fees, users get discounts
- **Escrow Pattern**: Fees held in escrow until trade execution is verified
- **PDA Structure**: Deterministic addresses for all accounts using seeds