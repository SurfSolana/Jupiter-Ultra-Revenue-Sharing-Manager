# Referral System & Commission Distribution Flowchart

```mermaid
flowchart TD
    %% User Entry & Referrer Check
    subgraph ENTRY["Trade Initiation"]
        direction TB
        START([User Initiates Trade])
        HAS_REF{Has Referrer?}
        SELF_CHECK{Self-Referral?}
        VALID_REF[Valid Referrer]
        NO_REF[No Referrer]
    end
    
    %% Fee Calculation
    subgraph FEE_CALC["Fee Calculation"]
        direction TB
        BASE_FEE["Base Fee Calculation<br/>1% of Trade Amount"]
        REF_FEE["Referrer Fee Calculation<br/>Base - Discount + Commission"]
        
        subgraph FORMULAS["Fee Formulas"]
            GROSS["Gross Fee = Amount × 10,000 ÷ 1,000,000"]
            COMMISSION["Commission = Gross × Share %"]
            DISCOUNT["Discount = Gross × Discount %"]
            ACTUAL["Actual Fee = Gross - Discount"]
        end
    end
    
    %% Account Setup
    subgraph SETUP["Account Setup"]
        direction TB
        CHECK_STATS{Stats Exist?}
        CREATE_STATS["Create Referrer Stats"]
        UPDATE_STATS["Update Existing Stats"]
        INIT_ESCROW["Initialize Escrow"]
        SET_PENDING["Update Pending Stats"]
    end
    
    %% Trade Execution
    subgraph EXECUTION["Trade Execution"]
        direction TB
        TRANSFER_FEE["Transfer Fee to Vault"]
        JUPITER_TRADE["Execute Jupiter Trade"]
        TRADE_RESULT{Trade Success?}
        SUBMIT_PROOF["Submit Execution Proof"]
        VERIFY_PROOF{Proof Valid?}
    end
    
    %% Fee Processing
    subgraph PROCESSING["Fee Processing"]
        direction TB
        PLATFORM_CLAIM["Platform Claims Fee"]
        VALIDATE_CLAIM{Claim Valid?}
        PROCESS_CLAIM["Mark Escrow Complete"]
        HAS_COMMISSION{Has Commission?}
        UPDATE_REF_STATS["Update Referrer Stats"]
        TRANSFER_COMMISSION["Transfer Commission"]
        TRANSFER_PLATFORM["Transfer Platform Fee"]
    end
    
    %% Commission Claiming
    subgraph COMMISSION["Commission Claiming"]
        direction TB
        COMMISSION_READY["Commission Available"]
        REF_CLAIM["Referrer Claims"]
        VALIDATE_REF_CLAIM{Valid Claim?}
        PROCESS_REF_CLAIM["Process Commission"]
        TRANSFER_TO_REF["Transfer to Referrer"]
    end
    
    %% Alternative Flows
    subgraph ALTERNATIVES["Alternative Flows"]
        direction TB
        REFUND_PATH["Refund Process"]
        DISPUTE_PATH["Dispute Process"]
        EXPIRED_PATH["Expired Escrow"]
    end
    
    %% Completion States
    subgraph COMPLETION["Completion"]
        direction TB
        SUCCESS([Trade Complete])
        REFUNDED([Fee Refunded])
        DISPUTED([Dispute Active])
    end
    
    %% Main Flow
    START --> HAS_REF
    HAS_REF -->|Yes| SELF_CHECK
    HAS_REF -->|No| NO_REF
    SELF_CHECK -->|Yes| NO_REF
    SELF_CHECK -->|No| VALID_REF
    
    NO_REF --> BASE_FEE
    VALID_REF --> REF_FEE
    
    BASE_FEE --> FORMULAS
    REF_FEE --> FORMULAS
    FORMULAS --> CHECK_STATS
    
    CHECK_STATS -->|No| CREATE_STATS
    CHECK_STATS -->|Yes| UPDATE_STATS
    CREATE_STATS --> INIT_ESCROW
    UPDATE_STATS --> SET_PENDING
    SET_PENDING --> INIT_ESCROW
    
    INIT_ESCROW --> TRANSFER_FEE
    TRANSFER_FEE --> JUPITER_TRADE
    JUPITER_TRADE --> TRADE_RESULT
    
    TRADE_RESULT -->|Success| SUBMIT_PROOF
    TRADE_RESULT -->|Failed| REFUND_PATH
    
    SUBMIT_PROOF --> VERIFY_PROOF
    VERIFY_PROOF -->|Valid| PLATFORM_CLAIM
    VERIFY_PROOF -->|Invalid| REFUND_PATH
    
    PLATFORM_CLAIM --> VALIDATE_CLAIM
    VALIDATE_CLAIM -->|Valid| PROCESS_CLAIM
    VALIDATE_CLAIM -->|Invalid| REFUND_PATH
    
    PROCESS_CLAIM --> HAS_COMMISSION
    HAS_COMMISSION -->|Yes| UPDATE_REF_STATS
    HAS_COMMISSION -->|No| TRANSFER_PLATFORM
    
    UPDATE_REF_STATS --> TRANSFER_COMMISSION
    TRANSFER_COMMISSION --> TRANSFER_PLATFORM
    TRANSFER_PLATFORM --> COMMISSION_READY
    
    COMMISSION_READY --> REF_CLAIM
    REF_CLAIM --> VALIDATE_REF_CLAIM
    VALIDATE_REF_CLAIM -->|Valid| PROCESS_REF_CLAIM
    VALIDATE_REF_CLAIM -->|Invalid| COMMISSION_READY
    
    PROCESS_REF_CLAIM --> TRANSFER_TO_REF
    TRANSFER_TO_REF --> SUCCESS
    
    REFUND_PATH --> REFUNDED
    DISPUTE_PATH --> DISPUTED
    EXPIRED_PATH --> REFUNDED
    
    %% Styling
    classDef startEnd fill:#e8f5e8,stroke:#4caf50,stroke-width:3px
    classDef process fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef calculation fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    classDef transfer fill:#ffebee,stroke:#f44336,stroke-width:2px
    classDef alternative fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    
    class START,SUCCESS,REFUNDED,DISPUTED startEnd
    class INIT_ESCROW,TRANSFER_FEE,JUPITER_TRADE,SUBMIT_PROOF,PROCESS_CLAIM,UPDATE_REF_STATS,PROCESS_REF_CLAIM process
    class HAS_REF,SELF_CHECK,CHECK_STATS,TRADE_RESULT,VERIFY_PROOF,VALIDATE_CLAIM,HAS_COMMISSION,VALIDATE_REF_CLAIM decision
    class BASE_FEE,REF_FEE,GROSS,COMMISSION,DISCOUNT,ACTUAL calculation
    class TRANSFER_COMMISSION,TRANSFER_PLATFORM,TRANSFER_TO_REF transfer
    class REFUND_PATH,DISPUTE_PATH,EXPIRED_PATH alternative
```

## Key Process Flows

### 1. Fee Calculation Tiers
- **Default Fee**: 1% (10,000 basis points) - no referrer
- **Referred Fee**: Base 1% minus user discount (0-0.1%) with referrer commission (0-0.3%)
- **Self-Referral Prevention**: If referrer == user, treated as no referrer

### 2. Commission Distribution Formula
```
grossPlatformFee = tradeAmount × 10,000 ÷ 1,000,000
referrerCommission = grossPlatformFee × referrerSharePercent ÷ 1,000,000
userDiscount = grossPlatformFee × referredDiscountPercent ÷ 1,000,000
actualFeeCharged = grossPlatformFee - userDiscount
platformRevenue = actualFeeCharged - referrerCommission
```

### 3. State Transitions
- **Pending**: Stats updated during fee deposit
- **Confirmed**: Stats moved from pending to confirmed after successful claim
- **Commission Flow**: vault → commissionVault → referrerAta

### 4. Error Handling
- Expired transactions trigger refund path
- Failed verification allows user dispute
- Self-referral automatically bypasses referrer benefits
- Commission claims require positive pending balance

### 5. Key Security Features
- Time-based expiration and dispute windows
- Proof verification against Jupiter execution
- Atomic state transitions
- Self-referral prevention
- Commission vault isolation