# Frontend User Journey Flowchart

```mermaid
flowchart TD
    %% Entry & Authentication
    subgraph AUTH["Authentication"]
        direction TB
        START([User Visits Platform])
        WALLET_CHECK{Wallet Connected?}
        CONNECT_WALLET[Connect Wallet]
        WALLET_SUCCESS{Connection Success?}
        USER_TYPE{User Type?}
    end
    
    %% Regular User Trading Flow
    subgraph TRADING["Trading Flow"]
        direction TB
        
        subgraph QUOTE_PROCESS["Quote Process"]
            SELECT_TOKENS[Select Tokens]
            ENTER_AMOUNT[Enter Amount]
            GET_QUOTE[Get Jupiter Quote]
            QUOTE_LOADING[Loading...]
            QUOTE_SUCCESS{Quote Success?}
            DISPLAY_QUOTE[Display Quote]
        end
        
        subgraph FEE_MODAL["Fee Deposit Modal"]
            OPEN_MODAL[Open Modal]
            REVIEW_QUOTE[Step 1: Review]
            FEE_BREAKDOWN[Step 2: Fees]
            CHECK_REFERRER{Has Referrer?}
            APPLY_DISCOUNT[Apply Discount]
            CONFIRM_DEPOSIT[Step 3: Confirm]
        end
        
        subgraph EXECUTION["Trade Execution"]
            SIGN_DEPOSIT[Sign Deposit]
            DEPOSIT_PENDING[Pending...]
            DEPOSIT_SUCCESS{Success?}
            EXECUTE_TRADE[Execute Trade]
            TRADE_PENDING[Processing...]
            TRADE_SUCCESS{Success?}
        end
        
        subgraph VERIFICATION["Proof Verification"]
            SUBMIT_PROOF[Submit Proof]
            PROOF_PENDING[Verifying...]
            PROOF_SUCCESS{Verified?}
            TRADE_COMPLETE([Trade Complete])
        end
    end
    
    %% Referrer Dashboard Flow
    subgraph REFERRER["Referrer Dashboard"]
        direction TB
        
        subgraph DASHBOARD["Dashboard Interface"]
            LOAD_DASHBOARD[Load Dashboard]
            DASHBOARD_LOADING[Loading...]
            DASHBOARD_TABS[Tabbed Interface]
        end
        
        subgraph OVERVIEW["Overview Tab"]
            VIEW_METRICS[Real-time Metrics]
            CLAIM_CHECK{Claim Available?}
            CLAIM_FLOW[Claim Process]
            WAIT_COMMISSION[Wait for Claims]
        end
        
        subgraph REFERRALS["Referrals Tab"]
            GENERATE_LINK[Generate Link]
            SHARE_LINK[Share Link]
            MONITOR_REFS[Monitor Activity]
        end
        
        subgraph HISTORY["History Tab"]
            VIEW_HISTORY[View History]
            EXPORT_DATA{Export Data?}
            DOWNLOAD_CSV[Download CSV]
            CONTINUE_VIEW[Continue Viewing]
        end
        
        subgraph CLAIMING["Commission Claiming"]
            SIGN_CLAIM[Sign Claim]
            CLAIM_PENDING[Processing...]
            CLAIM_SUCCESS{Success?}
            CLAIM_COMPLETE([Claim Complete])
        end
    end
    
    %% Admin Flow
    subgraph ADMIN["Admin Dashboard"]
        direction TB
        ADMIN_DASHBOARD[Admin Dashboard]
        ADMIN_METRICS[Platform Metrics]
        PROCESS_CLAIMS[Process Claims]
        HANDLE_DISPUTES[Handle Disputes]
    end
    
    %% State Management
    subgraph STATE["State Management"]
        direction TB
        PLATFORM_HOOK[usePlatformFee]
        REFERRER_HOOK[useReferrerDashboard]
        ERROR_STATES[Error Handling]
        LOADING_STATES[Loading States]
    end
    
    %% Error Handling
    subgraph ERRORS["Error States"]
        direction TB
        WALLET_ERROR[Wallet Error]
        QUOTE_ERROR[Quote Error]
        DEPOSIT_ERROR[Deposit Error]
        TRADE_ERROR[Trade Error]
        PROOF_ERROR[Proof Error]
        CLAIM_ERROR[Claim Error]
    end
    
    %% Real-time Features
    subgraph REALTIME["Real-time Features"]
        direction TB
        AUTO_REFRESH[Auto-refresh]
        LIVE_METRICS[Live Updates]
        NOTIFICATIONS[Notifications]
    end
    
    %% Main Authentication Flow
    START --> WALLET_CHECK
    WALLET_CHECK -->|No| CONNECT_WALLET
    WALLET_CHECK -->|Yes| USER_TYPE
    CONNECT_WALLET --> WALLET_SUCCESS
    WALLET_SUCCESS -->|No| WALLET_ERROR
    WALLET_SUCCESS -->|Yes| USER_TYPE
    WALLET_ERROR --> CONNECT_WALLET
    
    %% User Type Routing
    USER_TYPE -->|Regular| SELECT_TOKENS
    USER_TYPE -->|Referrer| LOAD_DASHBOARD
    USER_TYPE -->|Admin| ADMIN_DASHBOARD
    
    %% Trading Flow
    SELECT_TOKENS --> ENTER_AMOUNT
    ENTER_AMOUNT --> GET_QUOTE
    GET_QUOTE --> QUOTE_LOADING
    QUOTE_LOADING --> QUOTE_SUCCESS
    QUOTE_SUCCESS -->|No| QUOTE_ERROR
    QUOTE_SUCCESS -->|Yes| DISPLAY_QUOTE
    QUOTE_ERROR --> GET_QUOTE
    
    DISPLAY_QUOTE --> OPEN_MODAL
    OPEN_MODAL --> REVIEW_QUOTE
    REVIEW_QUOTE --> FEE_BREAKDOWN
    FEE_BREAKDOWN --> CHECK_REFERRER
    CHECK_REFERRER -->|Yes| APPLY_DISCOUNT
    CHECK_REFERRER -->|No| CONFIRM_DEPOSIT
    APPLY_DISCOUNT --> CONFIRM_DEPOSIT
    
    CONFIRM_DEPOSIT --> SIGN_DEPOSIT
    SIGN_DEPOSIT --> DEPOSIT_PENDING
    DEPOSIT_PENDING --> DEPOSIT_SUCCESS
    DEPOSIT_SUCCESS -->|No| DEPOSIT_ERROR
    DEPOSIT_SUCCESS -->|Yes| EXECUTE_TRADE
    DEPOSIT_ERROR --> CONFIRM_DEPOSIT
    
    EXECUTE_TRADE --> TRADE_PENDING
    TRADE_PENDING --> TRADE_SUCCESS
    TRADE_SUCCESS -->|No| TRADE_ERROR
    TRADE_SUCCESS -->|Yes| SUBMIT_PROOF
    TRADE_ERROR --> EXECUTE_TRADE
    
    SUBMIT_PROOF --> PROOF_PENDING
    PROOF_PENDING --> PROOF_SUCCESS
    PROOF_SUCCESS -->|No| PROOF_ERROR
    PROOF_SUCCESS -->|Yes| TRADE_COMPLETE
    PROOF_ERROR --> SUBMIT_PROOF
    
    %% Referrer Dashboard Flow
    LOAD_DASHBOARD --> DASHBOARD_LOADING
    DASHBOARD_LOADING --> DASHBOARD_TABS
    DASHBOARD_TABS --> VIEW_METRICS
    DASHBOARD_TABS --> GENERATE_LINK
    DASHBOARD_TABS --> VIEW_HISTORY
    
    VIEW_METRICS --> CLAIM_CHECK
    CLAIM_CHECK -->|Yes| CLAIM_FLOW
    CLAIM_CHECK -->|No| WAIT_COMMISSION
    
    CLAIM_FLOW --> SIGN_CLAIM
    SIGN_CLAIM --> CLAIM_PENDING
    CLAIM_PENDING --> CLAIM_SUCCESS
    CLAIM_SUCCESS -->|No| CLAIM_ERROR
    CLAIM_SUCCESS -->|Yes| CLAIM_COMPLETE
    CLAIM_ERROR --> CLAIM_FLOW
    
    GENERATE_LINK --> SHARE_LINK
    SHARE_LINK --> MONITOR_REFS
    
    VIEW_HISTORY --> EXPORT_DATA
    EXPORT_DATA -->|Yes| DOWNLOAD_CSV
    EXPORT_DATA -->|No| CONTINUE_VIEW
    DOWNLOAD_CSV --> VIEW_HISTORY
    CONTINUE_VIEW --> MONITOR_REFS
    
    %% Continuous Flow
    TRADE_COMPLETE --> SELECT_TOKENS
    CLAIM_COMPLETE --> MONITOR_REFS
    
    %% Real-time Updates
    MONITOR_REFS -.-> AUTO_REFRESH
    AUTO_REFRESH -.-> LOAD_DASHBOARD
    VIEW_METRICS -.-> LIVE_METRICS
    
    %% State Management Connections
    FEE_MODAL --> PLATFORM_HOOK
    REFERRER --> REFERRER_HOOK
    
    %% Styling
    classDef startEnd fill:#e8f5e8,stroke:#4caf50,stroke-width:3px
    classDef process fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef error fill:#ffebee,stroke:#f44336,stroke-width:2px
    classDef loading fill:#f1f8e9,stroke:#558b2f,stroke-width:2px
    classDef success fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef state fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    
    class START,TRADE_COMPLETE,CLAIM_COMPLETE startEnd
    class SELECT_TOKENS,ENTER_AMOUNT,DISPLAY_QUOTE,EXECUTE_TRADE,LOAD_DASHBOARD,GENERATE_LINK process
    class WALLET_CHECK,QUOTE_SUCCESS,DEPOSIT_SUCCESS,TRADE_SUCCESS,PROOF_SUCCESS,CLAIM_SUCCESS decision
    class WALLET_ERROR,QUOTE_ERROR,DEPOSIT_ERROR,TRADE_ERROR,PROOF_ERROR,CLAIM_ERROR error
    class QUOTE_LOADING,DEPOSIT_PENDING,TRADE_PENDING,PROOF_PENDING,DASHBOARD_LOADING,CLAIM_PENDING loading
    class OPEN_MODAL,REVIEW_QUOTE,CONFIRM_DEPOSIT,SIGN_DEPOSIT success
    class PLATFORM_HOOK,REFERRER_HOOK,ERROR_STATES,LOADING_STATES state
```

## Key User Journey Highlights

### 1. Regular User Journey (Trading Flow)
- **Entry**: Wallet connection → Token selection → Amount input
- **Quote Phase**: Jupiter quote fetching with loading states and error handling
- **Fee Deposit**: Multi-step modal with referrer discount application
- **Execution**: Trade execution → Proof submission → Verification
- **Completion**: Success state with option for new trades

### 2. Referrer Journey
- **Dashboard Access**: Load comprehensive analytics dashboard
- **Link Management**: Generate and share referral links
- **Monitoring**: Real-time metrics with auto-refresh
- **Commission Claims**: Claim available commissions with transaction signing
- **Analytics**: Export data and view detailed history

### 3. Platform Admin Journey
- **Admin Dashboard**: Platform-wide metrics and analytics
- **Claims Processing**: Handle commission claims and disputes
- **System Monitoring**: Overall platform health and performance

### 4. State Management Integration
- **usePlatformFee Hook**: Manages complete trading flow state
- **useReferrerDashboard Hook**: Handles referrer analytics and claims
- **Error Handling**: Comprehensive error states with retry mechanisms
- **Loading States**: User feedback during async operations

### 5. Real-time Features
- **Auto-refresh**: Automatic dashboard updates
- **Live Metrics**: Real-time referrer performance data
- **Notifications**: User feedback for all state changes
- **Progress Tracking**: Multi-step flow progress indicators

This flowchart provides a complete visualization of the frontend user experience, showing all possible paths, error handling, state management, and component interactions within your Solana-based platform fee escrow system.