# Fee Claiming Process Flowchart

This Mermaid flowchart visualizes the complete fee claiming process including validation, commission distribution, and alternative flows for disputes and refunds.

```mermaid
flowchart TD
    %% Entry Points
    subgraph ENTRY["Entry Points"]
        direction TB
        START([User/Platform Initiates])
        ENTRY_TYPE{Action Type?}
        CLAIM_ENTRY["Platform claimFee()"]
        DISPUTE_ENTRY["User disputeClaim()"]
        REFUND_ENTRY["User refundFee()"]
    end
    
    %% Claim Fee Flow
    subgraph CLAIM_FLOW["Claim Fee Process"]
        direction TB
        CLAIM_VALIDATE{"Validation Checks"}
        CHECK_PROOF{Proof Submitted?}
        CHECK_COMPLETE{Already Complete?}
        CHECK_DISPUTE{Disputed?}
        CHECK_AUTH{Platform Authority?}
        MARK_COMPLETE["Mark Escrow Complete"]
    end
    
    %% Commission Processing
    subgraph COMMISSION["Commission Processing"]
        direction TB
        CHECK_REF{Has Referrer?}
        CHECK_AMOUNT{Commission > 0?}
        UPDATE_REF_STATS["Update Referrer Stats"]
        TRANSFER_COMMISSION["Transfer Commission"]
        CALC_PLATFORM["Calculate Platform Fee"]
        TRANSFER_PLATFORM["Transfer Platform Fee"]
    end
    
    %% Dispute Flow
    subgraph DISPUTE_FLOW["Dispute Process"]
        direction TB
        DISPUTE_VALIDATE{"Dispute Validation"}
        CHECK_DISPUTE_PROOF{Proof Exists?}
        CHECK_DISPUTE_COMPLETE{Already Complete?}
        CHECK_WINDOW{Within Window?}
        SET_DISPUTED["Set Disputed Flag"]
    end
    
    %% Refund Flow
    subgraph REFUND_FLOW["Refund Process"]
        direction TB
        REFUND_VALIDATE{"Refund Validation"}
        CHECK_REFUND_COMPLETE{Already Complete?}
        CHECK_REFUND_CONDITIONS{Can Refund?}
        CHECK_REFUND_REF{Has Referrer?}
        UPDATE_REFUND_STATS["Update Stats"]
        REFUND_TRANSFER["Transfer Back to User"]
    end
    
    %% Account Management
    subgraph ACCOUNTS["Account Management"]
        direction TB
        CLOSE_ESCROW["Close Escrow Account"]
        CLOSE_VAULT["Close Vault Account"]
        RECOVER_RENT["Recover Rent"]
    end
    
    %% Error States
    subgraph ERRORS["Error States"]
        direction TB
        ERR_NO_PROOF["No Proof Submitted"]
        ERR_COMPLETED["Already Completed"]
        ERR_DISPUTED["Transaction Disputed"]
        ERR_AUTH["Invalid Authority"]
        ERR_WINDOW["Dispute Window Closed"]
        ERR_CANNOT_REFUND["Cannot Refund"]
    end
    
    %% Success States
    subgraph SUCCESS["Success States"]
        direction TB
        CLAIM_SUCCESS(["Fee Claimed Successfully"])
        DISPUTE_SUCCESS(["Dispute Filed Successfully"])
        REFUND_SUCCESS(["Fee Refunded Successfully"])
    end
    
    %% Main Flow
    START --> ENTRY_TYPE
    ENTRY_TYPE -->|claimFee| CLAIM_ENTRY
    ENTRY_TYPE -->|disputeClaim| DISPUTE_ENTRY
    ENTRY_TYPE -->|refundFee| REFUND_ENTRY
    
    %% Claim Flow
    CLAIM_ENTRY --> CHECK_PROOF
    CHECK_PROOF -->|No| ERR_NO_PROOF
    CHECK_PROOF -->|Yes| CHECK_COMPLETE
    CHECK_COMPLETE -->|Yes| ERR_COMPLETED
    CHECK_COMPLETE -->|No| CHECK_DISPUTE
    CHECK_DISPUTE -->|Yes| ERR_DISPUTED
    CHECK_DISPUTE -->|No| CHECK_AUTH
    CHECK_AUTH -->|No| ERR_AUTH
    CHECK_AUTH -->|Yes| MARK_COMPLETE
    
    MARK_COMPLETE --> CHECK_REF
    CHECK_REF -->|No| CALC_PLATFORM
    CHECK_REF -->|Yes| CHECK_AMOUNT
    CHECK_AMOUNT -->|No| CALC_PLATFORM
    CHECK_AMOUNT -->|Yes| UPDATE_REF_STATS
    
    UPDATE_REF_STATS --> TRANSFER_COMMISSION
    TRANSFER_COMMISSION --> CALC_PLATFORM
    CALC_PLATFORM --> TRANSFER_PLATFORM
    TRANSFER_PLATFORM --> CLOSE_ESCROW
    CLOSE_ESCROW --> CLAIM_SUCCESS
    
    %% Dispute Flow
    DISPUTE_ENTRY --> CHECK_DISPUTE_PROOF
    CHECK_DISPUTE_PROOF -->|No| ERR_NO_PROOF
    CHECK_DISPUTE_PROOF -->|Yes| CHECK_DISPUTE_COMPLETE
    CHECK_DISPUTE_COMPLETE -->|Yes| ERR_COMPLETED
    CHECK_DISPUTE_COMPLETE -->|No| CHECK_WINDOW
    CHECK_WINDOW -->|No| ERR_WINDOW
    CHECK_WINDOW -->|Yes| SET_DISPUTED
    SET_DISPUTED --> DISPUTE_SUCCESS
    
    %% Refund Flow
    REFUND_ENTRY --> CHECK_REFUND_COMPLETE
    CHECK_REFUND_COMPLETE -->|Yes| ERR_COMPLETED
    CHECK_REFUND_COMPLETE -->|No| CHECK_REFUND_CONDITIONS
    CHECK_REFUND_CONDITIONS -->|No| ERR_CANNOT_REFUND
    CHECK_REFUND_CONDITIONS -->|Yes| CHECK_REFUND_REF
    CHECK_REFUND_REF -->|Yes| UPDATE_REFUND_STATS
    CHECK_REFUND_REF -->|No| REFUND_TRANSFER
    UPDATE_REFUND_STATS --> REFUND_TRANSFER
    REFUND_TRANSFER --> CLOSE_ESCROW
    CLOSE_ESCROW --> REFUND_SUCCESS
    
    %% Styling
    classDef startEnd fill:#e8f5e8,stroke:#4caf50,stroke-width:3px
    classDef process fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef error fill:#ffebee,stroke:#f44336,stroke-width:2px
    classDef success fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef transfer fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    
    class START,CLAIM_SUCCESS,DISPUTE_SUCCESS,REFUND_SUCCESS startEnd
    class MARK_COMPLETE,UPDATE_REF_STATS,SET_DISPUTED,UPDATE_REFUND_STATS,CLOSE_ESCROW process
    class ENTRY_TYPE,CHECK_PROOF,CHECK_COMPLETE,CHECK_DISPUTE,CHECK_AUTH,CHECK_REF,CHECK_AMOUNT decision
    class ERR_NO_PROOF,ERR_COMPLETED,ERR_DISPUTED,ERR_AUTH,ERR_WINDOW,ERR_CANNOT_REFUND error
    class CLAIM_ENTRY,DISPUTE_ENTRY,REFUND_ENTRY success
    class TRANSFER_COMMISSION,CALC_PLATFORM,TRANSFER_PLATFORM,REFUND_TRANSFER transfer
```

## Process Details

### Key Validation Steps in claimFee()
1. **Proof Validation**: `escrow.proofSubmitted == true`
2. **Completion Check**: `!escrow.isCompleted`
3. **Dispute Check**: `!escrow.isDisputed`
4. **Platform Authority**: Verified through account derivation and signatures

### Commission Distribution Logic
- **Self-referral**: If `escrow.referrer == escrow.user`, no commission transfer occurs
- **Valid referrer**: Commission moves from vault to commission vault
- **Referrer stats updated**: 
  - `pendingVolume` → `confirmedVolume`
  - `totalCommissionEarned` increases
  - `pendingCommission` increases for later claiming

### Revenue Calculation
```
platformRevenue = actualFeeCharged - referrerCommission
```

### Alternative Flows

#### Dispute Window
- Users have **1,000 slots** after proof submission to dispute
- Must be called before escrow completion
- Sets `isDisputed = true`, blocking further claims

#### Refund Conditions
Fee can be refunded if:
- `currentSlot > expirationSlot` (expired)
- `escrow.isDisputed == true` (disputed)
- `!escrow.proofSubmitted` (no proof submitted)

### Account Closures
- **Successful claim**: Escrow and vault closed, rent goes to platform
- **Refund**: Escrow and vault closed, rent goes to user
- All account closures happen atomically within the instruction