# Jupiter Trade Execution and Verification Process

## Comprehensive Mermaid Flowchart

```mermaid
flowchart TD
    %% Trade Execution Phase
    subgraph TRADE["Jupiter Trade Execution"]
        direction TB
        EXTERNAL_TRADE["User Executes Trade<br/>on Jupiter DEX"]
        SUBMIT_PROOF["User Submits<br/>Execution Proof"]
    end
    
    %% Input Validation
    subgraph VALIDATION["Input Validation"]
        direction TB
        VALIDATE_PARAMS{Validate Parameters}
        CHECK_OWNERSHIP{Check Account<br/>Ownership}
        CHECK_PROOF{Proof Already<br/>Submitted?}
        CHECK_STATUS{Execution<br/>Status == 1?}
        CHECK_EVENTS{Has Swap<br/>Events?}
    end
    
    %% Verification Process
    subgraph VERIFY["Trade Verification"]
        direction TB
        EXTRACT_EVENTS["Extract Events<br/>First & Last Swaps"]
        VERIFY_INPUT_TOKEN{"Input Token Match<br/>firstSwap.inputMint"}
        VERIFY_INPUT_AMOUNT{"Input Amount Match<br/>firstSwap.inputAmount"}
        VERIFY_OUTPUT_TOKEN{"Output Token Match<br/>lastSwap.outputMint"}
    end
    
    %% State Updates
    subgraph UPDATE["State Updates"]
        direction TB
        STORE_DATA["Store Execution Data:<br/>• executionSignature<br/>• actualOutputAmount<br/>• proofSubmittedSlot"]
        SET_FLAG["Set proofSubmitted = true"]
        OPEN_DISPUTE["Open Dispute Window<br/>1,000 slots (~6.7 min)"]
    end
    
    %% Next Actions
    subgraph NEXT["Next Actions"]
        direction TB
        PLATFORM_CLAIM["Platform Claims Fee"]
        USER_DISPUTE["User Disputes"]
        ESCROW_EXPIRE["Escrow Expires"]
    end
    
    %% Error States
    subgraph ERRORS["Error States"]
        direction TB
        ERR_PARAMS["Invalid Parameters"]
        ERR_OWNERSHIP["Unauthorized Access"]
        ERR_SUBMITTED["Already Submitted"]
        ERR_FAILED["Execution Failed"]
        ERR_NO_EVENTS["No Swap Events"]
        ERR_INPUT_TOKEN["Wrong Input Token"]
        ERR_INPUT_AMOUNT["Wrong Input Amount"]
        ERR_OUTPUT_TOKEN["Wrong Output Token"]
    end
    
    %% Success State
    SUCCESS(["Verification Complete<br/>Ready for Claim"])
    
    %% Main Flow
    EXTERNAL_TRADE --> SUBMIT_PROOF
    SUBMIT_PROOF --> VALIDATE_PARAMS
    
    VALIDATE_PARAMS -->|Valid| CHECK_OWNERSHIP
    VALIDATE_PARAMS -->|Invalid| ERR_PARAMS
    
    CHECK_OWNERSHIP -->|Authorized| CHECK_PROOF
    CHECK_OWNERSHIP -->|Unauthorized| ERR_OWNERSHIP
    
    CHECK_PROOF -->|Not Submitted| CHECK_STATUS
    CHECK_PROOF -->|Already Submitted| ERR_SUBMITTED
    
    CHECK_STATUS -->|Success| CHECK_EVENTS
    CHECK_STATUS -->|Failed| ERR_FAILED
    
    CHECK_EVENTS -->|Has Events| EXTRACT_EVENTS
    CHECK_EVENTS -->|No Events| ERR_NO_EVENTS
    
    EXTRACT_EVENTS --> VERIFY_INPUT_TOKEN
    
    VERIFY_INPUT_TOKEN -->|Match| VERIFY_INPUT_AMOUNT
    VERIFY_INPUT_TOKEN -->|Mismatch| ERR_INPUT_TOKEN
    
    VERIFY_INPUT_AMOUNT -->|Match| VERIFY_OUTPUT_TOKEN
    VERIFY_INPUT_AMOUNT -->|Mismatch| ERR_INPUT_AMOUNT
    
    VERIFY_OUTPUT_TOKEN -->|Match| STORE_DATA
    VERIFY_OUTPUT_TOKEN -->|Mismatch| ERR_OUTPUT_TOKEN
    
    STORE_DATA --> SET_FLAG
    SET_FLAG --> OPEN_DISPUTE
    OPEN_DISPUTE --> SUCCESS
    
    SUCCESS --> PLATFORM_CLAIM
    SUCCESS --> USER_DISPUTE
    SUCCESS --> ESCROW_EXPIRE
    
    %% Styling
    classDef startEnd fill:#e8f5e8,stroke:#4caf50,stroke-width:3px
    classDef process fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef error fill:#ffebee,stroke:#f44336,stroke-width:2px
    classDef verification fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    classDef action fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    
    class SUCCESS startEnd
    class EXTERNAL_TRADE,SUBMIT_PROOF,EXTRACT_EVENTS,STORE_DATA,SET_FLAG,OPEN_DISPUTE process
    class VALIDATE_PARAMS,CHECK_OWNERSHIP,CHECK_PROOF,CHECK_STATUS,CHECK_EVENTS decision
    class ERR_PARAMS,ERR_OWNERSHIP,ERR_SUBMITTED,ERR_FAILED,ERR_NO_EVENTS,ERR_INPUT_TOKEN,ERR_INPUT_AMOUNT,ERR_OUTPUT_TOKEN error
    class VERIFY_INPUT_TOKEN,VERIFY_INPUT_AMOUNT,VERIFY_OUTPUT_TOKEN verification
    class PLATFORM_CLAIM,USER_DISPUTE,ESCROW_EXPIRE action
```

## Detailed Verification Logic

### Three-Field Matching System

The smart contract uses a simplified verification approach that checks three critical fields:

1. **Input Token Match**: `firstSwap.inputMint == escrow.inputMint`
2. **Input Amount Match**: `firstSwap.inputAmount == escrow.inputAmount`
3. **Output Token Match**: `lastSwap.outputMint == escrow.outputMint`

This approach ensures that:
- The trade used the correct input token and amount as originally quoted
- The trade produced the expected output token type
- Multi-hop swaps are supported (first swap input, last swap output)

### State Updates After Successful Verification

```typescript
// Execution data storage
escrow.executionSignature = executionSignature;  // Audit trail
escrow.actualOutputAmount = lastSwap.outputAmount;  // Final output
escrow.proofSubmitted = true;  // Flag prevents double submission
escrow.proofSubmittedSlot = currentSlot;  // Timestamp for dispute window
```

### Dispute Window Mechanics

- **Duration**: 1,000 slots (approximately 6.7 minutes at 400ms per slot)
- **Purpose**: Allows users to dispute incorrect fee claims
- **Window Start**: Begins when `proofSubmittedSlot` is set
- **Access**: Only the original user can dispute during this window

### Error Conditions and Validations

| Check | Error Message | Description |
|-------|---------------|-------------|
| Proof Already Submitted | "Execution already submitted" | Prevents double submission attacks |
| Execution Failed | "Jupiter execution failed" | Only successful trades (status=1) are accepted |
| No Swap Events | "No swap events provided" | At least one swap event required |
| Wrong Input Token | "Wrong input token" | Input token must match escrow |
| Wrong Input Amount | "Wrong input amount" | Input amount must match exactly |
| Wrong Output Token | "Wrong output token" | Output token must match escrow |

### Key Design Decisions

1. **Simplified Verification**: No cryptographic proofs required - relies on basic field matching
2. **Multi-hop Support**: Uses first swap for input validation, last swap for output validation
3. **Execution Signature Storage**: Maintains audit trail for off-chain verification
4. **Dispute Window**: Provides safety mechanism against incorrect claims
5. **Single Submission**: Prevents replay attacks with `proofSubmitted` flag

### Integration with Broader System

This verification step is part of a larger fee escrow flow:

```
User Deposit → Jupiter Trade → Submit Execution → Dispute Window → Fee Claim/Refund
```

The verification ensures that fees are only released when legitimate trades matching the original quote parameters have been executed.