# 🎯 SMART CONTRACT DESIGN - DUAL MODE REFERRAL SYSTEM

## 🏆 CORE VISION
**Two modes to maximize platform revenue:**

### **Mode 1: USDC Payouts**
- SOL fees → Carrot → Withdrawal as exact amount USDC (platform keeps interest)

### **Mode 2: SOL Payouts**  
- SOL fees → LST (JitoSOL) → Withdrawal as exact amount SOL (platform keeps interest)

**Platform always wins**: Collect fees, generate yield, pay exact amounts, keep ALL excess yield!

---

## 🗄️ ACCOUNT STRUCTURES (Database Tables)

### **Account 1: UserRegistry** (Single account, authorized users)
```typescript
interface UserRegistry extends Account {
    admin: Pubkey,                      // Platform admin who can add users
    authorized_users: Vec<Pubkey>,      // Simple list of authorized wallet addresses
}
```

### **Account 2: PartnerRegistry** (Single account, all partners)
```typescript
interface PartnerRegistry extends Account {
    admin: Pubkey,                      // Platform admin who can add partners
    partner_count: u64,                 // Total number of registered partners
    partners: Vec<PartnerData>,         // All partner data in one account
    accounting_mode: AccountingMode,    // USDC/CRT or SOL/LST mode
}

struct PartnerData {
    partner_wallet: Pubkey,             // Partner's wallet address
    partner_code: String,               // "ALEX_REFERRALS" (max 32 chars)
    tier: PartnerTier,                  // default, referred, premium
    total_usd_owed: u64,                // Total pending USD (in cents) - Mode 1
    total_sol_owed: u64,                // Total pending SOL (in lamports) - Mode 2
}

enum AccountingMode {
    UsdcPayouts,    // SOL→CRT→USDC (platform keeps Carrot yield)
    SolPayouts,     // SOL→LST→SOL (platform keeps LST yield)
}

enum PartnerTier {
    Default,    // 0% referrer share, 0% user discount
    Referred,   // 0.1% referrer share, 0.1% user discount  
    Premium,    // 0.3% referrer share, 0.1% user discount
}
```

### **Account 3: FeeTransaction** (Per-transaction escrow)
```typescript
interface FeeTransaction extends Account {
    user: Pubkey,                       // User who paid the fee
    partner: Option<Pubkey>,            // Referring partner (if any)
    order_signature: Pubkey,            // Expected order transaction signature
    
    // Fee breakdown (depends on mode)
    partner_share_usd: u64,             // Partner earnings USD (Mode 1)
    platform_share_usd: u64,            // Platform earnings USD (Mode 1)
    partner_share_sol: u64,             // Partner earnings SOL (Mode 2)
    platform_share_sol: u64,            // Platform earnings SOL (Mode 2)
    
    // Status & Timing
    proof_submitted: bool,              // Order signature verified?
    failed: bool,                       // Jupiter transaction failed?
    created_at: i64,                    // Unix timestamp of deposit
    refund_deadline: i64,               // Fallback refund (created_at + 5min)
    
    // Derivation seed for PDA
    seed: u64,                          // Unique seed for this escrow
}
```

### **Account 4: PlatformOwners** (Smart governance)
```typescript
interface PlatformOwners extends Account {
    owners: Vec<PlatformOwner>,         // All platform owners
    multisig_mode: bool,                // false = single owner, true = multisig required
    multisig_threshold: u8,             // How many signatures needed (when multisig_mode = true)
}

struct PlatformOwner {
    owner_wallet: Pubkey,               // Owner's wallet address
    percentage_bps: u64,                // Their share (e.g., 10000bps = 100% for single owner)
    total_usd_owed: u64,                // USD they can claim (Mode 1)
    total_sol_owed: u64,                // SOL they can claim (Mode 2)
}
```

### **Account 5: GlobalTreasury** (Yield vault)
```typescript
interface GlobalTreasury extends Account {
    admin: Pubkey,                      // Can add users/partners (not change owner %)
    crt_token_account: Pubkey,          // CRT token account (Mode 1)
    lst_token_account: Pubkey,          // LST token account (Mode 2)
    sol_usd_price_feed: Pubkey,         // Pyth SOL/USD price feed (Mode 1 only)
    accounting_mode: AccountingMode,    // Which mode is active
}
```

---

## 🔧 CORE SMART CONTRACT FUNCTIONS

### **1. Administrative Functions**

#### `initialize(admin: Signer, initial_owner: Pubkey, mode: AccountingMode)`
- Create GlobalTreasury, PartnerRegistry, UserRegistry, and PlatformOwners accounts
- **Start with single owner** (100% ownership, multisig_mode = false)
- **Choose accounting mode**: UsdcCrt or SolLst (PERMANENT CHOICE)
- Set up token vault based on mode:
  - Mode 1: CRT token vault (Carrot yield-bearing token)
  - Mode 2: LST token vault (jitoSOL or similar)
- Initialize price oracle connection (Mode 1 only)
- Set admin permissions (admin can manage users/partners)

#### `authorize_user(admin: Signer, user_wallet: Pubkey)`
- Add user to authorized_users list
- **Cost**: ~0.000005 SOL transaction fee

#### `revoke_user(admin: Signer, user_wallet: Pubkey)`
- Remove user from authorized_users list
- Admin-only function

#### `register_partner(admin: Signer, partner_wallet: Pubkey, partner_code: String, tier: PartnerTier)`
- Add new partner to PartnerRegistry with specified tier
- Validates partner_code length (max 32 characters)
- **Cost**: ~0.000005 SOL transaction fee

#### `add_platform_owner(current_owner: Signer, new_owner: Pubkey, new_percentage_bps: u64)`
- **Single owner mode**: Current owner can add new owners
- **Automatically enables multisig_mode** when second owner added
- Adjusts percentages and sets multisig_threshold = 2 (majority)
- **CRITICAL**: This is how you transition from solo to multi-owner

#### `update_platform_owners(owners_signatures: Vec<Signature>, new_owners: Vec<PlatformOwner>)`
- **Only works in multisig_mode** (when owners.len() > 1)  
- **Requires multisig** from existing platform owners (based on threshold)
- Validate new percentages sum to 100%
- Update platform owner percentages
- **CRITICAL SECURITY**: Only way to change profit distribution after multisig enabled

### **2. Core Fee Processing**

#### `deposit_fee(user: Signer, partner_code: Option<String>, trade_amount: u64, order_signature: Pubkey, seed: u64)`

**Process depends on mode**:

**Mode 1 (USDC/CRT)**:
1. **Verify user authorization** - Check UserRegistry for user.key
2. **Find partner** (if partner_code provided) and validate exists
3. **Get SOL/USD price** from Pyth oracle
4. **Calculate fees in USD** based on partner tier
5. **Transfer SOL** from user to treasury
6. **Convert SOL → CRT** directly via Jupiter CPI
7. **Create FeeTransaction** escrow account
8. **Update partner total_usd_owed**
9. **Distribute platform share** among owners (USD accounting)

**Mode 2 (SOL/LST)**:
1. **Verify user authorization** - Check UserRegistry for user.key
2. **Find partner** (if partner_code provided) and validate exists
3. **Calculate fees in SOL** based on partner tier (1% of trade)
4. **Transfer SOL** from user to treasury
5. **Convert SOL → LST** (jitoSOL) via Jupiter CPI
6. **Create FeeTransaction** escrow account
7. **Update partner total_sol_owed**
8. **Distribute platform share** among owners (SOL accounting)

**Fee Calculation (matches your structure)**:
```typescript
// MODE 1: USD ACCOUNTING
if accounting_mode == AccountingMode::UsdcCrt {
    // Base platform fee: 1% of trade amount
    let platform_fee_usd = trade_amount_usd / 100;  // 0.01 = 1%
    
    if partner {
        match partner.tier {
            PartnerTier::Default => {
                referrer_share = 0;
                user_discount = 0;
            },
            PartnerTier::Referred => {
                referrer_share = platform_fee_usd / 10;    // 0.1%
                user_discount = platform_fee_usd / 10;     // 0.1%
            },
            PartnerTier::Premium => {
                referrer_share = platform_fee_usd * 3 / 10; // 0.3%
                user_discount = platform_fee_usd / 10;      // 0.1%
            }
        }
        total_fee = platform_fee_usd - user_discount;
        platform_share = total_fee - referrer_share;
    } else {
        total_fee = platform_fee_usd;
        platform_share = platform_fee_usd;
        referrer_share = 0;
    }
    
    // Distribute USD shares
    for owner in platform_owners {
        owner_share = platform_share * owner.percentage_bps / 10000;
        owner.total_usd_owed += owner_share;
    }
}

// MODE 2: SOL ACCOUNTING
else if accounting_mode == AccountingMode::SolLst {
    // Base platform fee: 1% of trade amount in SOL
    let platform_fee_sol = trade_amount_sol / 100;  // 0.01 = 1%
    
    if partner {
        match partner.tier {
            PartnerTier::Default => {
                referrer_share = 0;
                user_discount = 0;
            },
            PartnerTier::Referred => {
                referrer_share = platform_fee_sol / 10;    // 0.1%
                user_discount = platform_fee_sol / 10;     // 0.1%
            },
            PartnerTier::Premium => {
                referrer_share = platform_fee_sol * 3 / 10; // 0.3%
                user_discount = platform_fee_sol / 10;      // 0.1%
            }
        }
        total_fee = platform_fee_sol - user_discount;
        platform_share = total_fee - referrer_share;
    } else {
        total_fee = platform_fee_sol;
        platform_share = platform_fee_sol;
        referrer_share = 0;
    }
    
    // Distribute SOL shares
    for owner in platform_owners {
        owner_share = platform_share * owner.percentage_bps / 10000;
        owner.total_sol_owed += owner_share;
    }
}
```

#### `submit_execution(user: Signer, escrow: FeeTransaction, executed_tx_signature: Pubkey)`
- **Critical verification**: Submit the actual executed transaction signature
- **Signature matching**: Verify `executed_tx_signature == escrow.order_signature` (exact match required)
- **Automatic success/failure detection**: Smart contract looks up transaction on-chain
- **If signatures match AND transaction succeeded**:
  1. Mark escrow as `proof_submitted = true`
  2. Enable claiming for partner and platform
  3. **This proves the exact requested order was executed**
- **If signatures match BUT transaction failed**:
  1. Mark escrow as `failed = true`
  2. Immediately refund user (convert yield tokens back to SOL)
  3. Close escrow account
- **If signatures DON'T match**: Reject transaction (prevents fraud)
- **Platform covers slippage**: User gets back what they paid, platform absorbs any losses

#### `claim_refund(user: Signer, escrow: FeeTransaction)`
- **Fallback option**: Only available if no txid submitted AND current_time > refund_deadline
- **5-minute timeout**: Safety net if user never submits any transaction ID
- **Same refund process** as failed transactions

### **3. Claiming & Refund Functions**

#### `claim_partner_earnings(partner: Signer, amount: u64)`
**Mode 1 (USDC/CRT) Process**:
1. **Verify partner** has sufficient USD owed
2. **Calculate CRT needed** for exact USD amount
3. **Convert CRT → USDC** via Jupiter CPI  
4. **Transfer USDC** to partner's USDC token account
5. **Update partner stats** (reduce USD owed)

**Mode 2 (SOL/LST) Process**:
1. **Verify partner** has sufficient SOL owed
2. **Calculate LST needed** for exact SOL amount
3. **Convert LST → SOL** via unstake or swap
4. **Transfer SOL** to partner's wallet
5. **Update partner stats** (reduce SOL owed)

#### `claim_platform_owner_earnings(owner: Signer, amount: u64)`
**Mode 1 (USDC/CRT) Process**:
1. **Verify owner** has sufficient USD owed
2. **Calculate CRT needed** for exact USD amount
3. **Transfer CRT directly** to owner's CRT token account
4. **Owner keeps CRT** optimizing yield forever
5. **Update owner stats** (reduce USD owed)

**Mode 2 (SOL/LST) Process**:
1. **Verify owner** has sufficient SOL owed
2. **Calculate LST needed** for exact SOL amount
3. **Transfer LST directly** to owner's LST token account
4. **Owner keeps LST** earning staking yield forever
5. **Update owner stats** (reduce SOL owed)

### **4. View Functions**

#### `get_partner_earnings(partner_wallet: Pubkey) -> u64`
- Mode 1: Return partner's total USD owed
- Mode 2: Return partner's total SOL owed

#### `get_platform_owner_earnings(owner_wallet: Pubkey) -> u64`
- Mode 1: Return platform owner's total USD owed
- Mode 2: Return platform owner's total SOL owed

#### `get_platform_owners() -> Vec<PlatformOwner>`
- Return all platform owners and their percentages

#### `is_user_authorized(user_wallet: Pubkey) -> bool`
- Check if user is in authorized list

---

## 🌐 EXTERNAL INTEGRATIONS

### **Jupiter CPI (Cross-Program Invocation)**
```typescript
// MODE 1: USDC/CRT
if accounting_mode == AccountingMode::UsdcCrt {
    // SOL → CRT conversion (immediate yield generation)
    jupiter_cpi::swap(
        sol_amount,
        SOL_MINT,
        CRT_MINT,
        treasury.crt_token_account
    );
    
    // CRT → USDC conversion (exact amount for payouts)
    jupiter_cpi::swap(
        crt_amount_needed,
        CRT_MINT, 
        USDC_MINT,
        user_usdc_account
    );
}

// MODE 2: SOL/LST
else if accounting_mode == AccountingMode::SolLst {
    // SOL → LST conversion (staking yield)
    jupiter_cpi::swap(
        sol_amount,
        SOL_MINT,
        JITOSOL_MINT,  // or other LST
        treasury.lst_token_account
    );
    
    // LST → SOL conversion (for payouts)
    jupiter_cpi::swap(
        lst_amount_needed,
        JITOSOL_MINT,
        SOL_MINT,
        user_sol_account
    );
}
```

### **Pyth Price Oracle**
```typescript
// Only needed for Mode 1 (USD accounting)
if accounting_mode == AccountingMode::UsdcCrt {
    let sol_price_account = pyth::load_price_account(SOL_USD_FEED)?;
    let sol_usd_price = sol_price_account.get_current_price().unwrap();
}
// Mode 2 doesn't need price oracle - pure SOL accounting
```

---

## 🔐 SECURITY CONSIDERATIONS

### **Signature Verification**
- **Cryptographically unique** transaction signatures
- **No replay attacks** possible
- **Perfect proof** of trade execution

### **Access Control**
- **Admin-only** functions protected by signature verification
- **User authorization** required for all trading (UserRegistry check)
- **Partner claims** limited to their actual earnings
- **User funds** immediately converted to yield-generating LST

### **Yield Maximization**
- **Platform covers** any Jupiter slippage on conversions
- **Mode 1**: Partners/users get exact USDC amounts, platform keeps Carrot yield
- **Mode 2**: Partners/users get exact SOL amounts, platform keeps LST yield
- **Treasury buffer** from platform revenue covers any slippage
- **Platform always profits** from yield on ALL funds until withdrawal

---

## 📊 EXAMPLE FLOW

### **User Authorization**
```
1. Admin calls authorize_user(user_wallet)
2. User added to authorized list
3. Cost: 0.000005 SOL transaction fee
```

### **Platform Evolution**

**Phase 1: Single Owner (Launch)**
```
1. Initialize with single owner (100% ownership)
2. multisig_mode = false
3. Owner can add partners, manage everything solo
4. Admin can manage day-to-day users/partners
```

**Phase 2: Multi-Owner (Growth)**
```
1. Current owner calls add_platform_owner(new_owner, 3000) // Give 30%
2. Automatically adjusts: Owner A=70%, Owner B=30%
3. multisig_mode = true, threshold = 2
4. All future ownership changes require 2/2 signatures
5. Admin functions still work normally
```

### **Partner Registration**
```
1. Admin calls register_partner(wallet, "ALEX_REFERRALS", PartnerTier::Premium)
2. Partner added to registry with Premium tier
3. Cost: 0.000005 SOL transaction fee
```

### **Fee Transaction Examples**

**Mode 1 (USDC/CRT) - Premium Partner:**
```
1. User trades $1000 worth via Premium partner "ALEX_REFERRALS"
2. Total user pays: $9 in SOL (after 0.1% discount)
3. 0.075 SOL → CRT directly (earning optimized DeFi yield)
4. Jupiter Ultra executes transaction (success or failure)
5. User calls submit_execution(executed_tx_signature) 
6. Smart contract verifies signature matches expected order signature
7. If matched, automatically detects transaction outcome:
   - Success → Partner gets $3, Platform gets $6
   - Failure → User gets immediate full 0.075 SOL refund
8. Fallback: If no signature submitted within 5min → User can claim timeout refund
```

**Mode 2 (SOL/LST) - Premium Partner:**
```
1. User trades 10 SOL worth via Premium partner "ALEX_REFERRALS"
2. Total user pays: 0.09 SOL (after 0.01 SOL discount)
3. 0.09 SOL → jitoSOL directly (earning staking yield)
4. Jupiter Ultra executes transaction (success or failure)
5. User calls submit_execution(executed_tx_signature)
6. Smart contract verifies signature matches expected order signature
7. If matched, automatically detects transaction outcome:
   - Success → Partner gets 0.03 SOL, Platform gets 0.06 SOL
   - Failure → User gets immediate full 0.09 SOL refund
8. Fallback: If no signature submitted within 5min → User can claim timeout refund
```

### **Claiming Examples**

**Mode 1 - Partner Claiming (gets USDC):**
```
1. Partner has $100 USD accumulated
2. Calls claim_partner_earnings($100)
3. Calculate: Need X CRT worth $100 at current rate
4. Convert: X CRT → $100 USDC via Jupiter
5. Transfer: $100 USDC to partner's wallet
```

**Mode 1 - Platform Owner Claiming (gets CRT):**
```
1. Owner A has $500 USD accumulated
2. Calls claim_platform_owner_earnings($500)
3. Calculate: Need Y CRT worth $500 at current rate
4. Transfer: Y CRT directly to Owner A's wallet
5. Owner A keeps CRT optimizing yield across all Solana DeFi!
```

**Mode 2 - Partner Claiming (gets SOL):**
```
1. Partner has 2.5 SOL accumulated
2. Calls claim_partner_earnings(2.5 SOL)
3. Calculate: Need X jitoSOL worth 2.5 SOL
4. Convert: X jitoSOL → 2.5 SOL via swap/unstake
5. Transfer: 2.5 SOL to partner's wallet
```

**Mode 2 - Platform Owner Claiming (gets LST):**
```
1. Owner A has 10 SOL accumulated
2. Calls claim_platform_owner_earnings(10 SOL)
3. Calculate: Need Y jitoSOL worth 10 SOL
4. Transfer: Y jitoSOL directly to Owner A's wallet
5. Owner A keeps jitoSOL earning staking yield forever!
```

**Multisig Governance (changing owner percentages):**
```
1. Owners want to change: A=60%, B=25%, C=15%
2. Need 2/3 signatures (multisig threshold)
3. Owner A + Owner B sign the transaction
4. update_platform_owners() executed
5. Future profits distributed with new percentages
```

---

## 🎯 SUCCESS METRICS (YAGNI REFINED)

- ✅ **Minimal accounts** (3 registries + transaction escrows)
- ✅ **Simple authorization** (just authorized vs unauthorized)
- ✅ **Immediate yield** (100% SOL→CRT/LST conversion)
- ✅ **Perfect verification** (signature-based proof)
- ✅ **Tiered fees** (default/referred/premium matching your structure)
- ✅ **Maximum platform revenue**:
  - Mode 1: Keep Carrot yield while paying exact USDC
  - Mode 2: Keep LST yield while paying exact SOL
- ✅ **Platform always profits** from yield differential

---

## 🚀 KEY DECISION: CHOOSE YOUR MODE

### **Mode 1: USDC Payouts**
**Choose this if:**
- Partners want stable USDC payments
- You want to maximize yield with Carrot's DeFi optimization
- Platform keeps the difference between Carrot appreciation and USDC payouts

### **Mode 2: SOL Payouts**
**Choose this if:**
- Partners want native SOL payments
- You want traditional staking yield from LST
- Platform keeps the difference between LST appreciation and SOL payouts

**Both modes maximize platform revenue** by keeping ALL yield while paying exact amounts!

## 🚀 NEXT STEPS

1. **Choose your accounting mode** - Critical first decision
2. **Review this design** - Does it meet all requirements?
3. **Implement in Poseidon** - Write the actual smart contract code
4. **Test thoroughly** - Devnet deployment and testing
5. **Deploy mainnet** - Production ready system

Ready for implementation? 🔥