# System Architecture Overview

```mermaid
flowchart TD
    %% External Services Layer
    subgraph EXT["External Services"]
        direction TB
        JUP["Jupiter API<br/>Quotes & Swaps"]
        RPC["Solana RPC<br/>Blockchain Access"]
        WALLET["User Wallets<br/>Phantom/Solflare"]
    end

    %% Frontend Layer
    subgraph FE["Frontend Layer"]
        direction TB
        subgraph COMPONENTS["React Components"]
            FEE_MODAL["FeeDepositModal<br/>Quote & Config"]
            REF_DASH["ReferrerDashboard<br/>Stats & Claims"]
        end
        subgraph HOOKS["React Hooks"]
            HOOK_FEE["usePlatformFee"]
            HOOK_REF["useReferrerDashboard"]
        end
    end

    %% Backend Layer
    subgraph BE["Backend Layer"]
        direction TB
        subgraph SERVICES["Core Services"]
            JUP_PROXY["JupiterProxyService<br/>Rate Limiting"]
            FEE_CLAIM["FeeClaimService<br/>Auto Processing"]
            ANALYTICS["AnalyticsService<br/>Stats & Reports"]
        end
        subgraph API["API Endpoints"]
            API_QUOTE["/api/quote"]
            API_SWAP["/api/swap"]
            API_ANALYTICS["/api/analytics"]
            API_CLAIM["/api/claim"]
        end
    end

    %% SDK Layer
    subgraph SDK["SDK Layer"]
        direction TB
        CLIENT["PlatformFeeClient<br/>Transaction Builder"]
        subgraph UTILS["Utilities"]
            PDA["PDA Derivation"]
            TYPES["Type Definitions"]
            PARSERS["Data Parsers"]
        end
    end

    %% Smart Contract Layer
    subgraph SC["Smart Contract"]
        direction TB
        subgraph ACCOUNTS["Account Types"]
            ESCROW["FeeEscrowState<br/>User Escrows"]
            STATS["ReferrerStats<br/>Commission Data"]
        end
        subgraph INSTRUCTIONS["Instructions"]
            DEPOSIT["depositFeeWithQuote"]
            SUBMIT["submitExecution"]
            CLAIM["claimFee"]
            UPDATE["updateReferrer"]
        end
    end

    %% Solana Network
    subgraph NET["Solana Network"]
        direction TB
        PROGRAMS["On-chain Programs"]
        CHAIN_ACCOUNTS["Blockchain Accounts"]
        TXS["Transactions"]
    end

    %% Primary Data Flow
    WALLET --> FE
    FE --> API
    API --> SERVICES
    SERVICES --> JUP
    SERVICES --> CLIENT
    CLIENT --> INSTRUCTIONS
    INSTRUCTIONS --> NET
    NET --> RPC

    %% Secondary Connections
    HOOKS --> COMPONENTS
    UTILS --> CLIENT
    ACCOUNTS --> CHAIN_ACCOUNTS
    PROGRAMS --> TXS

    %% Styling
    classDef external fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px
    classDef frontend fill:#e8f5e8,stroke:#4caf50,stroke-width:2px
    classDef backend fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef sdk fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef contract fill:#fce4ec,stroke:#e91e63,stroke-width:2px
    classDef network fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    
    class EXT,JUP,RPC,WALLET external
    class FE,COMPONENTS,HOOKS,FEE_MODAL,REF_DASH,HOOK_FEE,HOOK_REF frontend
    class BE,SERVICES,API,JUP_PROXY,FEE_CLAIM,ANALYTICS,API_QUOTE,API_SWAP,API_ANALYTICS,API_CLAIM backend
    class SDK,CLIENT,UTILS,PDA,TYPES,PARSERS sdk
    class SC,ACCOUNTS,INSTRUCTIONS,ESCROW,STATS,DEPOSIT,SUBMIT,CLAIM,UPDATE contract
    class NET,PROGRAMS,CHAIN_ACCOUNTS,TXS network
```

## Key Data Flows

### 1. Quote and Fee Deposit Flow
```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant J as Jupiter API
    participant S as SDK
    participant SC as Smart Contract
    participant SN as Solana Network

    U->>F: Request Quote
    F->>B: GET /api/quote
    B->>J: Fetch Jupiter Quote
    J-->>B: Quote Response
    B-->>F: Quote + Platform Fee
    F-->>U: Display Quote
    
    U->>F: Confirm Deposit
    F->>S: Build Deposit TX
    S->>SC: depositFeeWithQuote
    SC->>SN: Create FeeEscrowState
    SN-->>SC: Account Created
    SC-->>S: Success
    S-->>F: TX Confirmed
    F-->>U: Deposit Complete
```

### 2. Trade Execution and Verification Flow
```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant J as Jupiter API
    participant B as Backend
    participant S as SDK
    participant SC as Smart Contract

    U->>F: Execute Trade
    F->>J: Submit Swap TX
    J-->>F: Trade Executed
    
    B->>B: Monitor Trade Events
    B->>S: Verify Trade Match
    S->>SC: submitExecution
    SC->>SC: Validate Quote Match
    SC-->>S: Verification Success
    S-->>B: Trade Verified
    
    B->>S: Trigger Fee Claim
    S->>SC: claimFee
    SC->>SC: Release Funds
    SC-->>S: Claim Complete
```

### 3. Referrer Commission Flow
```mermaid
sequenceDiagram
    participant R as Referrer
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant S as SDK
    participant SC as Smart Contract

    U->>F: Use Referral Code
    F->>B: Validate Referrer
    B->>S: Check ReferrerStats
    S->>SC: Query Account
    SC-->>S: Referrer Valid
    
    Note over F,SC: Fee Deposit with Referrer
    F->>S: Include Referrer in TX
    S->>SC: depositFeeWithQuote
    SC->>SC: Calculate Commission
    SC->>SC: Update ReferrerStats
    
    Note over R,SC: Commission Claim
    R->>F: View Dashboard
    F->>B: GET /api/analytics
    B->>S: Fetch ReferrerStats
    S->>SC: Query Statistics
    SC-->>F: Commission Data
    
    R->>F: Claim Commission
    F->>S: Build Claim TX
    S->>SC: claimFee (referrer)
    SC->>SC: Transfer Commission
```

## Architecture Highlights

### 🔑 Key Design Patterns
- **Escrow Pattern**: Funds held until trade verification
- **PDA Architecture**: Deterministic account addresses
- **Proxy Integration**: Backend mediates Jupiter API calls
- **Event-Driven**: Automated verification and processing

### 🛡️ Security Features
- **Quote Matching**: Verify inputMint + outputMint + inputAmount
- **Escrow Protection**: Funds locked until verification
- **Referrer Validation**: Prevent commission fraud
- **Rate Limiting**: Backend protects against abuse

### 📊 Monitoring Points
- **Trade Verification**: Real-time swap monitoring
- **Commission Tracking**: Referrer performance analytics
- **System Health**: RPC connectivity, Jupiter availability
- **User Experience**: Transaction success rates

### 🔄 Error Handling
- **Jupiter Downtime**: Fallback mechanisms
- **RPC Issues**: Multiple endpoint redundancy
- **Verification Failures**: Manual review process
- **Network Congestion**: Retry logic with backoff