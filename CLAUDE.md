# CLAUDE.md - MemeDeck Referral On-Chain

This is the Solana on-chain referral system implementation.

## Project Context

Handles referral tracking, fee distribution, and on-chain program interactions for the MemeDeck platform.

## Technology Stack

- **Blockchain**: Solana
- **Language**: TypeScript
- **Framework**: Anchor (implied from structure)
- **RPC**: Helius

## Development Guidelines

### Contract Development
```typescript
// ✅ CORRECT - Use proper PDA derivation
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("referral"), user.toBuffer()],
  programId
);

// ❌ AVOID - Random keypairs for deterministic addresses
const account = Keypair.generate();
```

### Error Handling
```typescript
// ✅ CORRECT - Handle Solana-specific errors
try {
  await connection.confirmTransaction(sig);
} catch (error) {
  if (error.code === -32002) {
    // Handle rate limiting
  }
}

// ❌ AVOID - Generic error handling
catch (error) {
  console.log("Error occurred");
}
```

### Backend Services
- Jupiter proxy for swap operations
- Fee claim service for referral rewards
- Analytics service for tracking

## Anti-Patterns

- **No UI logic** - Backend and contracts only
- **No direct RPC calls in frontend** - Use SDK
- **No private keys in code** - Use environment variables
- **No synchronous blockchain operations** - Always async

## Commands
```bash
# Deploy contracts
pnpm run deploy

# Run tests
pnpm test

# Initialize program
pnpm run initialize
```

## File Structure
```
contracts/      # Solana programs
backend/        # Node.js services
sdk/            # TypeScript SDK
tests/          # Integration tests
scripts/        # Deployment scripts
```

## Related Contexts
For the main UI, see `/memedeck-ui/CLAUDE.md`