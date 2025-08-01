# System Flows

This document illustrates the key flows and processes in the Jupiter Ultra Enhanced Referral System.

## Trade Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Jupiter
    participant Contract
    participant Blockchain
    
    Note over User,Blockchain: Complete Trade Process
    
    User->>Frontend: Initiate Trade
    Frontend->>Backend: Request Quote
    Backend->>Jupiter: Get Quote
    Jupiter-->>Backend: Quote Response
    Backend-->>Frontend: Quote Details
    
    Frontend->>Contract: Deposit Fee with Quote
    Contract->>Blockchain: Store Escrow
    
    User->>Jupiter: Execute Trade
    Jupiter->>Blockchain: Process Swap
    
    Backend->>Blockchain: Monitor Execution
    Backend->>Contract: Submit Execution Proof
    Contract->>Contract: Verify Trade
    
    User->>Contract: Claim Fee
    Contract->>User: Transfer Funds
```

## Trade Verification Process

```mermaid
graph LR
    QUOTE[Jupiter Quote] --> |stores| ESCROW[Escrow Account]
    SWAP[Actual Swap] --> |emits| EVENTS[Swap Events]
    EVENTS --> |parsed by| BACKEND[Backend Service]
    BACKEND --> |verifies against| ESCROW
    ESCROW --> |if match| COMPLETE[Mark Completed]
```

## Fee Deposit Flow

```mermaid
flowchart TD
    START([User Initiates Trade]) --> QUOTE[Get Jupiter Quote]
    QUOTE --> CALC[Calculate Fees]
    CALC --> |Platform Fee: 1%| SPLIT[Split Fee Components]
    
    SPLIT --> REF_COMM[Referrer Commission]
    SPLIT --> USER_DISC[User Discount]
    SPLIT --> PLAT_FEE[Platform Fee]
    
    REF_COMM --> DEPOSIT[Deposit to Escrow]
    USER_DISC --> DEPOSIT
    PLAT_FEE --> DEPOSIT
    
    DEPOSIT --> STORE[Store Quote Details]
    STORE --> READY[Ready for Trade]
```

## Commission Claim Flow

```mermaid
stateDiagram-v2
    [*] --> PendingCommission
    PendingCommission --> TradeExecuted : Trade Verified
    TradeExecuted --> CommissionEarned : Update Stats
    CommissionEarned --> ClaimInitiated : Referrer Claims
    ClaimInitiated --> Processing : Validate Claim
    Processing --> Completed : Transfer Funds
    Processing --> Failed : Insufficient Balance
    Failed --> CommissionEarned : Retry Later
    Completed --> [*]
```

## Referrer Onboarding Flow

```mermaid
graph TD
    APPLY[Apply for Referrer Status] --> REVIEW[Platform Review]
    REVIEW --> |Approved| SETUP[Setup Referrer Account]
    REVIEW --> |Rejected| NOTIFY[Notify Applicant]
    
    SETUP --> GENERATE[Generate Referral Links]
    GENERATE --> ACTIVE[Active Referrer]
    
    ACTIVE --> TRACK[Track Referrals]
    TRACK --> EARN[Earn Commissions]
    EARN --> CLAIM[Claim Rewards]
```

## Error Handling Flow

```mermaid
flowchart TD
    ERROR[Error Occurs] --> TYPE{Error Type}
    
    TYPE --> |Verification Failed| DISPUTE[Create Dispute]
    TYPE --> |Insufficient Funds| REFUND[Process Refund]
    TYPE --> |Expired Quote| REVERT[Revert Transaction]
    TYPE --> |Network Error| RETRY[Retry Operation]
    
    DISPUTE --> MANUAL[Manual Review]
    REFUND --> COMPLETE[Transaction Complete]
    REVERT --> START[Start Over]
    RETRY --> |Success| CONTINUE[Continue Process]
    RETRY --> |Max Retries| FAIL[Mark Failed]
```