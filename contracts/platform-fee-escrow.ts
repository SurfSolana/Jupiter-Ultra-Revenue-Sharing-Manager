/*
 * Platform Fee Escrow with Referral Tracking for Jupiter Integration
 * Updated with simplified verification: inputMint + outputMint + inputAmount matching
 */

import { Account, AssociatedTokenAccount, Mint, Pubkey, Seeds, Signer, SystemAccount, TokenAccount, TokenProgram, UncheckedAccount, u64, u8, bool } from "@solanaturbine/poseidon";

export default class PlatformFeeEscrow {
    static PROGRAM_ID = new Pubkey("11111111111111111111111111111111");

    // Initialize the global commission vault (called once by platform)
    initializeCommissionVault(
        platform: Signer,
        feeToken: Mint,
        auth: UncheckedAccount,
        commissionVault: TokenAccount
    ) {
        auth.derive(["auth"]);
        commissionVault.derive(["commission_vault"], feeToken, auth.key).init(platform);
    }

    // User deposits fee with Jupiter quote details
    depositFeeWithQuote(
        user: Signer,
        platform: SystemAccount,
        referrer: SystemAccount,        // Optional - can be user.key if no referrer
        escrow: FeeEscrowState,
        referrerStats: ReferrerStats,   // Track referrer's cumulative stats
        userAta: AssociatedTokenAccount,
        feeToken: Mint,
        auth: UncheckedAccount,
        vault: TokenAccount,
        tradeAmount: u64,               // Original trade volume (for calculating fees)
        inputMint: Pubkey,              // Input token from Jupiter quote
        outputMint: Pubkey,             // Output token from Jupiter quote
        inputAmount: u64,               // Input amount from Jupiter quote
        expirationSlot: u64,
        referrerSharePercent: u64,      // Percentage of platform fee (e.g., 3000 = 0.3%)
        referredDiscountPercent: u64,   // User discount percentage (e.g., 1000 = 0.1%)
        seed: u64
    ) {
        userAta.derive(feeToken, user.key);
        auth.derive(["auth"]);
        vault.derive(["vault", escrow.key], feeToken, auth.key).init(user);
        
        escrow.derive(["fee_escrow", user.key, seed.toBytes()])
            .init(user);

        // Initialize or update referrer stats
        referrerStats.derive(["referrer_stats", referrer.key])
            .initIfNeeded(user);

        // If this is a new referrer stats account, initialize it
        if (referrerStats.referrer == Pubkey::default()) {
            referrerStats.referrer = referrer.key;
            referrerStats.totalTransactions = u64(0);
            referrerStats.pendingVolume = u64(0);
            referrerStats.confirmedVolume = u64(0);
            referrerStats.totalCommissionEarned = u64(0);
            referrerStats.totalCommissionClaimed = u64(0);
            referrerStats.pendingCommission = u64(0);
            referrerStats.authBump = referrerStats.getBump();
        }

        // Calculate fees using basis points (1% = 10000)
        let platformFeeRate = 10000; // 1% = 10000 basis points
        let grossPlatformFee = (tradeAmount * platformFeeRate) / 1000000;
        
        // Calculate referrer commission and user discount
        let referrerCommission = (grossPlatformFee * referrerSharePercent) / 1000000;
        let userDiscount = (grossPlatformFee * referredDiscountPercent) / 1000000;
        let actualFeeCharged = grossPlatformFee - userDiscount;

        // Set escrow state with simplified verification data
        escrow.user = user.key;
        escrow.platform = platform.key;
        escrow.referrer = referrer.key;
        escrow.tradeAmount = tradeAmount;
        escrow.grossPlatformFee = grossPlatformFee;
        escrow.referrerCommission = referrerCommission;
        escrow.userDiscount = userDiscount;
        escrow.actualFeeCharged = actualFeeCharged;
        escrow.inputMint = inputMint;
        escrow.outputMint = outputMint;
        escrow.inputAmount = inputAmount;
        escrow.expirationSlot = expirationSlot;
        escrow.seed = seed;
        escrow.isCompleted = false;
        escrow.isDisputed = false;
        escrow.proofSubmitted = false;
        escrow.authBump = auth.getBump();
        escrow.vaultBump = vault.getBump();
        escrow.escrowBump = escrow.getBump();

        // Track pending volume for referrer
        if (referrer.key != user.key) {
            referrerStats.pendingVolume += tradeAmount;
            referrerStats.totalTransactions += 1;
        }

        // Transfer the actual fee charged
        TokenProgram.transfer(
            userAta,
            vault,
            user,
            actualFeeCharged,
        );
    }

    // User submits Jupiter execution results for verification
    submitJupiterExecution(
        user: Signer,
        escrow: FeeEscrowState,
        executionSignature: Pubkey,
        swapEvents: SwapEvent[],        // Array of swap events from execution
        executionStatus: u8,            // 1 = Success, 0 = Failed
        currentSlot: u64
    ) {
        escrow.derive(["fee_escrow", user.key, escrow.seed.toBytes()])
            .has([user]);

        require(!escrow.proofSubmitted, "Execution already submitted");
        require(executionStatus == 1, "Jupiter execution failed");
        require(swapEvents.len() > 0, "No swap events provided");

        // Simple verification: inputMint + outputMint + inputAmount matching
        let firstSwap = swapEvents[0];
        let lastSwap = swapEvents[swapEvents.len() - 1];
        
        require(firstSwap.inputMint == escrow.inputMint, "Wrong input token");
        require(firstSwap.inputAmount == escrow.inputAmount, "Wrong input amount");
        require(lastSwap.outputMint == escrow.outputMint, "Wrong output token");

        // Store execution details
        escrow.executionSignature = executionSignature;
        escrow.actualOutputAmount = lastSwap.outputAmount;
        escrow.proofSubmitted = true;
        escrow.proofSubmittedSlot = currentSlot;
    }

    // Platform claims fee
    claimFee(
        platform: Signer,
        user: SystemAccount,
        referrer: SystemAccount,
        platformAta: AssociatedTokenAccount,
        referrerStats: ReferrerStats,
        feeToken: Mint,
        auth: UncheckedAccount,
        vault: TokenAccount,
        commissionVault: TokenAccount,
        escrow: FeeEscrowState
    ) {
        escrow.derive(["fee_escrow", user.key, escrow.seed.toBytes()])
            .has([platform])
            .close(platform);

        platformAta.derive(feeToken, platform.key).initIfNeeded(platform);
        referrerStats.derive(["referrer_stats", referrer.key]);
        auth.derive(["auth"]);
        vault.derive(["vault", escrow.key], feeToken, auth.key);
        commissionVault.derive(["commission_vault"], feeToken, auth.key);

        require(escrow.proofSubmitted == true, "No execution results submitted");
        require(!escrow.isCompleted, "Already completed");
        require(!escrow.isDisputed, "Transaction disputed");
        
        escrow.isCompleted = true;

        // Update referrer stats and transfer commission
        if (escrow.referrer != escrow.user && escrow.referrerCommission > 0) {
            referrerStats.pendingVolume -= escrow.tradeAmount;
            referrerStats.confirmedVolume += escrow.tradeAmount;
            referrerStats.totalCommissionEarned += escrow.referrerCommission;
            referrerStats.pendingCommission += escrow.referrerCommission;

            TokenProgram.transfer(
                vault,
                commissionVault,
                auth,
                escrow.referrerCommission,
                ["auth", escrow.authBump]
            );
        }

        // Platform gets fee minus referrer commission
        let platformRevenue = escrow.actualFeeCharged - escrow.referrerCommission;

        TokenProgram.transfer(
            vault,
            platformAta,
            auth,
            platformRevenue,
            ["auth", escrow.authBump]
        );
    }

    // Referrer claims their accumulated commission
    claimReferralCommission(
        referrer: Signer,
        referrerAta: AssociatedTokenAccount,
        referrerStats: ReferrerStats,
        feeToken: Mint,
        commissionVault: TokenAccount,
        auth: UncheckedAccount
    ) {
        referrerAta.derive(feeToken, referrer.key).initIfNeeded(referrer);
        referrerStats.derive(["referrer_stats", referrer.key])
            .has([referrer]);
        
        commissionVault.derive(["commission_vault"], feeToken, auth.key);
        auth.derive(["auth"]);

        require(referrerStats.pendingCommission > 0, "No commission to claim");

        let commissionAmount = referrerStats.pendingCommission;
        
        referrerStats.pendingCommission = u64(0);
        referrerStats.totalCommissionClaimed += commissionAmount;

        TokenProgram.transfer(
            commissionVault,
            referrerAta,
            auth,
            commissionAmount,
            ["auth", auth.getBump()]
        );
    }

    // User can dispute if platform tries to claim for failed tx
    disputeClaim(
        user: Signer,
        escrow: FeeEscrowState,
        currentSlot: u64
    ) {
        escrow.derive(["fee_escrow", user.key, escrow.seed.toBytes()])
            .has([user]);

        require(escrow.proofSubmitted == true, "No proof to dispute");
        require(!escrow.isCompleted, "Already completed");
        require(currentSlot < escrow.proofSubmittedSlot + 1000, "Dispute window closed");
        
        escrow.isDisputed = true;
    }

    // User can refund if main tx never happens or expires
    refundFee(
        user: Signer,
        referrer: SystemAccount,
        userAta: AssociatedTokenAccount,
        referrerStats: ReferrerStats,
        feeToken: Mint,
        auth: UncheckedAccount,
        vault: TokenAccount,
        escrow: FeeEscrowState,
        currentSlot: u64
    ) {
        userAta.derive(feeToken, user.key);
        
        escrow.derive(["fee_escrow", user.key, escrow.seed.toBytes()])
            .has([user])
            .close(user);

        referrerStats.derive(["referrer_stats", referrer.key]);
        auth.derive(["auth"]);
        vault.derive(["vault", escrow.key], feeToken, auth.key);

        let canRefund = currentSlot > escrow.expirationSlot || 
                       escrow.isDisputed || 
                       !escrow.proofSubmitted;
        require(canRefund, "Cannot refund yet");
        require(!escrow.isCompleted, "Already completed");

        if (escrow.referrer != escrow.user) {
            referrerStats.pendingVolume -= escrow.tradeAmount;
            referrerStats.totalTransactions -= 1;
        }

        TokenProgram.transfer(
            vault,
            userAta,
            auth,
            escrow.actualFeeCharged,
            ["auth", escrow.authBump]
        );
    }
}

// Account structures
export interface FeeEscrowState extends Account {
    user: Pubkey;
    platform: Pubkey;
    referrer: Pubkey;
    tradeAmount: u64;
    grossPlatformFee: u64;
    referrerCommission: u64;
    userDiscount: u64;
    actualFeeCharged: u64;
    
    // Simplified verification data
    inputMint: Pubkey;
    outputMint: Pubkey;
    inputAmount: u64;
    actualOutputAmount: u64;
    
    executionSignature: Pubkey;
    expirationSlot: u64;
    seed: u64;
    isCompleted: bool;
    isDisputed: bool;
    proofSubmitted: bool;
    proofSubmittedSlot: u64;
    authBump: u8;
    vaultBump: u8;
    escrowBump: u8;
}

export interface ReferrerStats extends Account {
    referrer: Pubkey;
    totalTransactions: u64;
    pendingVolume: u64;
    confirmedVolume: u64;
    totalCommissionEarned: u64;
    totalCommissionClaimed: u64;
    pendingCommission: u64;
    authBump: u8;
}

export interface SwapEvent {
    inputMint: Pubkey;
    inputAmount: u64;
    outputMint: Pubkey;
    outputAmount: u64;
}