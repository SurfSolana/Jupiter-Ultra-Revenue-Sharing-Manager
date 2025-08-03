# 🎯 SMART CONTRACT DESIGN - SOL→LST→USDC REFERRAL SYSTEM

## 🏆 CORE VISION
**SOL fees → LST yield pool → USDC withdrawals with partner referrals**

- **Input**: Users pay SOL fees for Jupiter trades
- **Processing**: Immediate SOL→LST conversion for maximum yield
- **Tracking**: USD amounts owed to partners/platform (stable accounting)
- **Output**: USDC payouts to partners/platform
- **Profit**: Platform keeps LST yield beyond USD obligations

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
}

struct PartnerData {
    partner_wallet: Pubkey,             // Partner's wallet address
    partner_code: String,               // "ALEX_REFERRALS" (max 32 chars)
    tier: PartnerTier,                  // default, referred, premium
    total_usd_owed: u64,                // Total pending USD (in cents)
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
    jupiter_signature: Pubkey,          // Expected Jupiter transaction signature
    
    // Simple fee breakdown (USD cents)
    partner_share_usd: u64,             // Partner earnings (0 if no partner)
    platform_share_usd: u64,            // Platform earnings
    
    // Status
    proof_submitted: bool,              // Jupiter signature verified?
    
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
    total_usd_owed: u64,                // USD they can claim (in cents)
}
```

### **Account 5: GlobalTreasury** (LST yield vault)
```typescript
interface GlobalTreasury extends Account {
    admin: Pubkey,                      // Can add users/partners (not change owner %)
    crt_token_account: Pubkey,          // CRT token account
    sol_usd_price_feed: Pubkey,         // Pyth SOL/USD price feed
}
```

---

## 🔧 CORE SMART CONTRACT FUNCTIONS

### **1. Administrative Functions**

#### `initialize(admin: Signer, initial_owner: Pubkey)`
- Create GlobalTreasury, PartnerRegistry, UserRegistry, and PlatformOwners accounts
- **Start with single owner** (100% ownership, multisig_mode = false)
- Set up CRT token vault (Carrot yield-bearing token)
- Initialize price oracle connection
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

#### `deposit_fee(user: Signer, partner_code: Option<String>, trade_amount_usd: u64, expected_signature: Pubkey, seed: u64)`

**Process**:
1. **Verify user authorization** - Check UserRegistry for user.key
2. **Find partner** (if partner_code provided) and validate exists
3. **Get SOL/USD price** from Pyth oracle
4. **Calculate fees** based on partner tier (matches your fee structure)
5. **Transfer SOL** from user to treasury
6. **Convert SOL → CRT** directly via Jupiter CPI
7. **Create FeeTransaction** escrow account
8. **Update partner total_usd_owed**
9. **Distribute platform share** among platform owners based on their percentages

**Fee Calculation (matches your structure)**:
```typescript
// Base platform fee: 1% of trade amount
let platform_fee_usd = trade_amount_usd / 100;  // 0.01 = 1%

if partner {
    match partner.tier {
        PartnerTier::Default => {
            // 0% referrer share, 0% user discount
            referrer_share = 0;
            user_discount = 0;
        },
        PartnerTier::Referred => {
            // 0.1% referrer share, 0.1% user discount
            referrer_share = platform_fee_usd / 10;    // 0.001 = 0.1%
            user_discount = platform_fee_usd / 10;     // 0.001 = 0.1%
        },
        PartnerTier::Premium => {
            // 0.3% referrer share, 0.1% user discount  
            referrer_share = platform_fee_usd * 3 / 10; // 0.003 = 0.3%
            user_discount = platform_fee_usd / 10;      // 0.001 = 0.1%
        }
    }
    
    total_fee = platform_fee_usd - user_discount;
    platform_share = total_fee - referrer_share;
} else {
    // No partner - full 1% platform fee
    total_fee = platform_fee_usd;
    platform_share = platform_fee_usd;
    referrer_share = 0;
}

// Distribute platform share among owners
for owner in platform_owners {
    owner_share = platform_share * owner.percentage_bps / 10000;
    owner.total_usd_owed += owner_share;
}
```

#### `submit_execution(user: Signer, escrow: FeeTransaction, execution_signature: Pubkey)`
- **Verify signature** matches expected Jupiter transaction signature
- Mark escrow as `proof_submitted = true`
- Enable claiming for partner and platform
- **This is the core verification step!**

### **3. Claiming Functions**

#### `claim_partner_earnings(partner: Signer, amount_usd: u64)`
**Process**:
1. **Verify partner** has sufficient USD owed
2. **Calculate CRT needed** for exact USD amount (using current CRT/USD price)
3. **Convert CRT → USDC** via Jupiter CPI  
4. **Transfer USDC** to partner's USDC token account
5. **Update partner stats** (reduce owed)

#### `claim_platform_owner_earnings(owner: Signer, amount_usd: u64)`
**Process**:
1. **Verify owner** has sufficient USD owed
2. **Calculate CRT needed** for exact USD amount
3. **Transfer CRT directly** to owner's CRT token account (NO CONVERSION!)
4. **Owner keeps CRT** optimizing yield forever
5. **Update owner stats** (reduce owed)

### **4. View Functions**

#### `get_partner_earnings(partner_wallet: Pubkey) -> u64`
- Return partner's total USD owed

#### `get_platform_owner_earnings(owner_wallet: Pubkey) -> u64`
- Return platform owner's total USD owed

#### `get_platform_owners() -> Vec<PlatformOwner>`
- Return all platform owners and their percentages

#### `is_user_authorized(user_wallet: Pubkey) -> bool`
- Check if user is in authorized list

---

## 🌐 EXTERNAL INTEGRATIONS

### **Jupiter CPI (Cross-Program Invocation)**
```typescript
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
```

### **Pyth Price Oracle**
```typescript
// Get real-time SOL/USD price for fee calculations
let sol_price_account = pyth::load_price_account(SOL_USD_FEED)?;
let sol_usd_price = sol_price_account.get_current_price().unwrap();
```

---

## 🔐 SECURITY CONSIDERATIONS

### **Signature Verification**
- **Cryptographically unique** Jupiter transaction signatures
- **No replay attacks** possible
- **Perfect proof** of trade execution

### **Access Control**
- **Admin-only** functions protected by signature verification
- **User authorization** required for all trading (UserRegistry check)
- **Partner claims** limited to their actual earnings
- **User funds** immediately converted to yield-generating LST

### **Slippage Protection**
- **Platform covers** any Jupiter slippage on conversions
- **Users always get** exact USD amounts owed
- **Treasury has buffer** from platform revenue

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

### **Fee Transaction (Premium Partner)**
```
1. Authorized user trades $1000 worth via Premium partner "ALEX_REFERRALS"
2. Platform fee: $10 (1% of $1000)
3. User discount: $1 (0.1% of $1000) 
4. Referrer share: $3 (0.3% of $1000)
5. Total user pays: $9 ($10 - $1 discount)
6. Platform gets: $6 ($9 total - $3 referrer)
7. Platform distribution:
   - Owner A owed: $3 (50% of $6)
   - Owner B owed: $1.8 (30% of $6)
   - Owner C owed: $1.2 (20% of $6)
8. User pays 9/120 = 0.075 SOL (if SOL = $120)
9. 0.075 SOL → CRT directly (earning optimized DeFi yield)
```

### **Claiming Examples**

**Partner Claiming (gets USDC):**
```
1. Partner has $100 USD accumulated
2. Calls claim_partner_earnings($100)
3. Calculate: Need X CRT worth $100 at current rate
4. Convert: X CRT → $100 USDC via Jupiter
5. Transfer: $100 USDC to partner's wallet
```

**Platform Owner Claiming (gets CRT):**
```
1. Owner A has $500 USD accumulated
2. Calls claim_platform_owner_earnings($500)
3. Calculate: Need Y CRT worth $500 at current rate
4. Transfer: Y CRT directly to Owner A's wallet
5. Owner A keeps CRT optimizing yield across all Solana DeFi!
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
- ✅ **Immediate yield** (100% SOL→LST conversion)
- ✅ **Perfect verification** (signature-based proof)
- ✅ **Tiered fees** (default/referred/premium matching your structure)
- ✅ **USDC payouts** (familiar withdrawals)
- ✅ **Platform profit** (LST yield beyond obligations)

---

## 🚀 NEXT STEPS

1. **Review this design** - Does it meet all requirements?
2. **Implement in Poseidon** - Write the actual smart contract code
3. **Test thoroughly** - Devnet deployment and testing
4. **Deploy mainnet** - Production ready system

Ready for implementation? 🔥