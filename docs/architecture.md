# System Architecture

This document provides detailed architectural diagrams for the Jupiter Ultra Enhanced Referral System.

## System Components Overview

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[React Frontend]
        FDM[FeeDepositModal]
        RD[ReferrerDashboard]
    end
    
    subgraph "Backend Services"
        API[Express API Server]
        AS[Analytics Service]
        FCS[Fee Claim Service]
        JP[Jupiter Proxy]
    end
    
    subgraph "SDK Layer"
        SDK[TypeScript SDK]
        PC[PlatformFeeClient]
        UTILS[Utility Functions]
    end
    
    subgraph "Smart Contract"
        SC[Platform Fee Escrow Contract]
        FES[FeeEscrowState]
        RS[ReferrerStats]
        CV[Commission Vault]
    end
    
    subgraph "External Services"
        JUP[Jupiter DEX]
        SOL[Solana Network]
    end
    
    UI --> SDK
    UI --> API
    API --> SDK
    SDK --> SC
    SC --> SOL
    API --> JUP
    UI --> |Hooks| SDK
```

## Account Structure

```mermaid
graph LR
    subgraph "Program Accounts"
        FES[FeeEscrowState]
        RS[ReferrerStats]
        CV[Commission Vault]
        AUTH[Authority PDA]
        VLT[Fee Vault]
    end
    
    subgraph "FeeEscrowState Fields"
        FES --> |stores| USER[User PublicKey]
        FES --> |stores| PLAT[Platform PublicKey]
        FES --> |stores| REF[Referrer PublicKey]
        FES --> |stores| TRADE[Trade Details]
        FES --> |stores| FEES[Fee Calculations]
        FES --> |stores| STATUS[Execution Status]
    end
    
    subgraph "ReferrerStats Fields"
        RS --> |tracks| TVOL[Total Volume]
        RS --> |tracks| COMM[Commission Earned]
        RS --> |tracks| PEND[Pending Commission]
        RS --> |tracks| TRANS[Transaction Count]
    end
```

## Component Interactions

### Frontend Layer
- **React Frontend**: Main user interface
- **FeeDepositModal**: Modal for depositing platform fees
- **ReferrerDashboard**: Analytics dashboard for referrers

### Backend Services
- **Express API Server**: RESTful API endpoints
- **Analytics Service**: Handles referrer statistics and metrics
- **Fee Claim Service**: Manages fee claiming process
- **Jupiter Proxy**: Proxies requests to Jupiter DEX

### SDK Layer
- **TypeScript SDK**: Client library for system integration
- **PlatformFeeClient**: Main client class for contract interaction
- **Utility Functions**: Helper functions for PDAs, parsing, etc.

### Smart Contract
- **Platform Fee Escrow Contract**: Core Solana program
- **FeeEscrowState**: Per-user escrow state accounts
- **ReferrerStats**: Referrer performance tracking
- **Commission Vault**: Global commission storage