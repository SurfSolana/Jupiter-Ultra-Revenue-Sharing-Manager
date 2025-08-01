# Comprehensive System Flowcharts

This document provides detailed flowcharts for all aspects of the Platform Fee Escrow System, designed for Jupiter DEX integration on Solana.

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Smart Contract Flows](#smart-contract-flows)
   - [Fee Deposit and Escrow Process](#fee-deposit-and-escrow-process)
   - [Trade Execution and Verification](#trade-execution-and-verification)
   - [Referral System and Commission Distribution](#referral-system-and-commission-distribution)
   - [Fee Claiming Process](#fee-claiming-process)
3. [Backend Services Architecture](#backend-services-architecture)
4. [Frontend User Journeys](#frontend-user-journeys)

---

## System Architecture Overview

The Platform Fee Escrow System is a comprehensive Solana-based solution that enables:
- **Fee Collection**: Users deposit platform fees when making trades through Jupiter
- **Referral System**: Tracks referrers and distributes commission shares
- **Verification**: Validates trades using simplified inputMint + outputMint + inputAmount matching

For the complete system architecture diagram, see: [system-architecture.md](./system-architecture.md)

**Key Components:**
- **Smart Contract**: Solana program handling escrow, verification, and settlements
- **SDK**: TypeScript client for contract interaction and PDA management
- **Backend**: Express server with Jupiter proxy, analytics, and automated claiming
- **Frontend**: React components for user interaction and referrer dashboards

---

## Smart Contract Flows

### Fee Deposit and Escrow Process

The `depositFeeWithQuote()` instruction is the entry point for users to deposit platform fees with Jupiter quote details.

**Key Features:**
- Creates unique escrow PDA per trade
- Calculates fees with referrer commissions and user discounts
- Updates referrer statistics
- 10-minute expiration window

For detailed flow, see: [fee-deposit-flowchart.md](./fee-deposit-flowchart.md)

**Process Summary:**
1. User requests Jupiter quote through backend proxy
2. Fee calculation with 1% platform fee base rate
3. Referrer commission (0-0.3%) and user discount (0-0.1%) applied
4. Escrow PDA creation with unique seed
5. Fee transfer to escrow vault

### Trade Execution and Verification

The `submitJupiterExecution()` instruction handles trade verification using a simplified matching approach.

**Verification Logic:**
- First swap's `inputMint` matches escrow's `inputMint`
- First swap's `inputAmount` matches escrow's `inputAmount`
- Last swap's `outputMint` matches escrow's `outputMint`
- Execution status must be "Success"

For detailed flow, see: [jupiter-execution-verification-flowchart.md](./jupiter-execution-verification-flowchart.md)

**Dispute Mechanism:**
- 1,000 slot window (≈6.7 minutes) after proof submission
- Users can dispute if they believe platform is claiming incorrectly

### Referral System and Commission Distribution

The referral system tracks referrer performance and manages commission distribution through a three-tier fee structure.

**Fee Tiers:**
- **Default**: 1% platform fee, no referrer benefits
- **Referred**: 1% platform fee, 0.1% to referrer, 0.1% user discount
- **Premium**: 1% platform fee, 0.3% to referrer, 0.1% user discount

For detailed flow, see: [referral-system-flowchart.md](./referral-system-flowchart.md)

**Commission Flow:**
1. Fee deposit updates pending referrer stats
2. Successful verification moves volume to confirmed
3. Commission transferred to global vault
4. Referrers claim accumulated commissions

### Fee Claiming Process

The `claimFee()` instruction allows the platform to claim escrowed fees after successful trade verification.

**Claiming Process:**
1. Validates proof submission and dispute status
2. Updates referrer statistics (pending → confirmed)
3. Transfers referrer commission to commission vault
4. Transfers platform revenue to platform account
5. Closes escrow and recovers rent

For detailed flow, see: [fee-claiming-flowchart.md](./fee-claiming-flowchart.md)

**Alternative Flows:**
- **Dispute**: User can challenge claim within dispute window
- **Refund**: Automatic refund for expired/failed trades

---

## Backend Services Architecture

The backend consists of three main services working together to provide a seamless experience:

**Services:**
1. **JupiterProxyService**: Proxies Jupiter API requests with health monitoring
2. **FeeClaimService**: Automated fee claiming with batch processing
3. **AnalyticsService**: Platform analytics and referrer performance tracking

For detailed flow, see: [backend-services-flowchart.md](./backend-services-flowchart.md)

**Key Features:**
- Event-driven architecture for service communication
- Circuit breaker patterns for external API failures
- Concurrent batch processing for fee claims
- Comprehensive monitoring and health checks

---

## Frontend User Journeys

The frontend provides three distinct user experiences:

### Regular User Journey
1. **Wallet Connection**: Connect Solana wallet
2. **Quote Request**: Get Jupiter quote with fee breakdown
3. **Fee Deposit**: Multi-step modal flow (quote → confirm → deposit → success)
4. **Trade Execution**: Execute trade through Jupiter
5. **Proof Submission**: Submit execution proof for verification

### Referrer Journey
1. **Dashboard Access**: View comprehensive analytics dashboard
2. **Link Generation**: Create and manage referral links
3. **Performance Monitoring**: Track referrals and volume
4. **Commission Claiming**: Claim accumulated commissions

### Platform Admin Journey
1. **System Monitoring**: Monitor platform analytics
2. **Claims Processing**: Handle automated fee claiming
3. **Dispute Resolution**: Manage user disputes

For detailed flow, see: [frontend-user-journey.md](./frontend-user-journey.md)

**State Management:**
- React hooks for complete flow management
- Real-time updates and auto-refresh
- Comprehensive error handling with retry mechanisms
- Progress tracking for multi-step processes

---

## Integration Points

### Jupiter Integration
- **Quote API**: Proxied through backend for rate limiting
- **Swap API**: Transaction building for user execution
- **Execution Parsing**: Simplified verification of swap events

### Solana Integration
- **Program Interaction**: Through SDK client
- **PDA Management**: Deterministic address derivation
- **Transaction Building**: Optimized for Solana's requirements

### External Services
- **RPC Providers**: Solana network connectivity
- **Wallet Adapters**: Support for major Solana wallets
- **Analytics**: Performance monitoring and metrics

---

## Security Considerations

### Smart Contract Security
- **Time-based Expiration**: Prevents indefinite fund locking
- **Dispute Mechanism**: User protection against incorrect claims
- **Refund Capabilities**: Multiple refund triggers
- **Role-based Access**: Proper authority validation

### Backend Security
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Protection against abuse
- **Error Handling**: Secure error responses
- **Health Monitoring**: System integrity checks

### Frontend Security
- **Wallet Security**: Secure transaction signing
- **Input Sanitization**: XSS prevention
- **State Validation**: Client-side data integrity
- **Error Boundaries**: Graceful error handling

---

## Performance Optimizations

### Smart Contract
- **PDA Efficiency**: Optimized seed structures
- **Account Reuse**: Minimize account creation
- **Batch Operations**: Where possible

### Backend
- **Caching**: Multi-level caching strategy
- **Connection Pooling**: Database and RPC optimization
- **Concurrent Processing**: Batch processing for scalability

### Frontend
- **State Management**: Efficient React state patterns
- **Component Optimization**: Memoization and lazy loading
- **Network Optimization**: Request batching and caching

---

## Development and Deployment

### Commands
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

### Architecture Files
- Smart Contract: `contracts/platform-fee-escrow.ts`
- SDK: `sdk/client.ts`, `sdk/types.ts`, `sdk/utils.ts`
- Backend: `backend/server.ts`, `backend/services/`
- Frontend: `frontend/components/`, `frontend/hooks/`

### Testing
- Contract tests: `tests/contract.test.ts`
- Integration tests: `tests/integration.test.ts`
- End-to-end user flows
- Performance benchmarking

---

This comprehensive documentation provides a complete understanding of the Platform Fee Escrow System's architecture, flows, and implementation details. Each flowchart linked above contains detailed Mermaid diagrams that can be rendered in markdown-compatible viewers for visual analysis.