/**
 * Initialization Script for Platform Fee Escrow
 * Sets up the commission vault and other required accounts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const NETWORK = process.env.DEPLOY_NETWORK || 'devnet';
const RPC_URLS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://localhost:8899'
};

const USDC_MINTS = {
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  testnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  localnet: '' // Will be created if needed
};

interface InitializationResult {
  commissionVault: PublicKey;
  auth: PublicKey;
  platformWallet: PublicKey;
  feeToken: PublicKey;
  network: string;
  timestamp: Date;
}

async function main() {
  console.log('🏗️  Platform Fee Escrow Initialization');
  console.log('=====================================');
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC URL: ${RPC_URLS[NETWORK]}`);
  console.log('');
  
  try {
    // 1. Load configuration
    const config = await loadConfiguration();
    console.log(`✅ Program ID: ${config.programId.toString()}`);
    console.log(`✅ Platform wallet: ${config.platformWallet.publicKey.toString()}`);
    
    // 2. Setup connection and provider
    const connection = new Connection(RPC_URLS[NETWORK], 'confirmed');
    const provider = new AnchorProvider(
      connection,
      new Wallet(config.platformWallet),
      { commitment: 'confirmed' }
    );
    
    // 3. Check platform wallet balance
    const balance = await connection.getBalance(config.platformWallet.publicKey);
    console.log(`💰 Platform wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.error('❌ Insufficient balance for initialization');
      if (NETWORK !== 'mainnet') {
        console.log('🚿 Requesting airdrop...');
        const sig = await connection.requestAirdrop(
          config.platformWallet.publicKey,
          LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(sig);
      } else {
        process.exit(1);
      }
    }
    
    // 4. Load program
    const idl = await loadProgramIdl();
    const program = new Program(idl, config.programId, provider);
    console.log('✅ Program loaded successfully');
    
    // 5. Get or create fee token
    const feeToken = await getFeeToken(connection, config.platformWallet);
    console.log(`✅ Fee token (USDC): ${feeToken.toString()}`);
    
    // 6. Check if already initialized
    const isInitialized = await checkIfInitialized(program);
    if (isInitialized) {
      console.log('⚠️  Commission vault already initialized');
      const shouldReinitialize = await promptUser('Do you want to continue anyway? (y/n): ');
      if (!shouldReinitialize) {
        console.log('Initialization cancelled');
        return;
      }
    }
    
    // 7. Initialize commission vault
    console.log('\n🔨 Initializing commission vault...');
    const initResult = await initializeCommissionVault(
      program,
      config.platformWallet,
      feeToken
    );
    
    // 8. Verify initialization
    console.log('\n🔍 Verifying initialization...');
    await verifyInitialization(program, connection, initResult);
    
    // 9. Save initialization info
    await saveInitializationInfo(initResult);
    
    // 10. Setup additional configurations
    console.log('\n⚙️  Setting up additional configurations...');
    await setupAdditionalConfigs(program, config);
    
    console.log('\n✅ Initialization complete!');
    console.log('\n📋 Summary:');
    console.log(`  - Commission Vault: ${initResult.commissionVault.toString()}`);
    console.log(`  - Auth PDA: ${initResult.auth.toString()}`);
    console.log(`  - Platform Wallet: ${initResult.platformWallet.toString()}`);
    console.log(`  - Fee Token: ${initResult.feeToken.toString()}`);
    
    console.log('\n🚀 Next steps:');
    console.log('1. Update your backend configuration with these addresses');
    console.log('2. Ensure platform wallet has sufficient USDC for operations');
    console.log('3. Test with a small transaction first');
    console.log('4. Monitor the commission vault balance');
    
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    process.exit(1);
  }
}

async function loadConfiguration() {
  // Load program ID
  const programIdStr = process.env.PROGRAM_ID;
  if (!programIdStr) {
    // Try to load from latest deployment
    const deploymentPath = path.join(
      __dirname,
      '..',
      'deployments',
      `${NETWORK}-latest.json`
    );
    
    if (fs.existsSync(deploymentPath)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
      process.env.PROGRAM_ID = deployment.programId;
    } else {
      throw new Error('No PROGRAM_ID found. Please deploy first.');
    }
  }
  
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  
  // Load platform wallet
  let platformWallet: Keypair;
  
  if (process.env.PLATFORM_PRIVATE_KEY) {
    const privateKey = Buffer.from(process.env.PLATFORM_PRIVATE_KEY, 'base64');
    platformWallet = Keypair.fromSecretKey(privateKey);
  } else {
    // Use deployer wallet as platform wallet for testing
    const keypairPath = path.join(process.env.HOME || '', '.config/solana/id.json');
    if (fs.existsSync(keypairPath)) {
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      platformWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
      
      // Save to env for future use
      const base64Key = Buffer.from(platformWallet.secretKey).toString('base64');
      updateEnvFile('PLATFORM_PRIVATE_KEY', base64Key);
      updateEnvFile('PLATFORM_WALLET', platformWallet.publicKey.toString());
    } else {
      throw new Error('No platform wallet found');
    }
  }
  
  return {
    programId,
    platformWallet
  };
}

async function loadProgramIdl() {
  // Try multiple locations for IDL
  const idlPaths = [
    path.join(__dirname, '..', 'target', 'idl', 'platform_fee_escrow.json'),
    path.join(__dirname, '..', 'contracts', 'target', 'idl', 'platform_fee_escrow.json'),
    path.join(__dirname, '..', 'idl', 'platform_fee_escrow.json')
  ];
  
  for (const idlPath of idlPaths) {
    if (fs.existsSync(idlPath)) {
      return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    }
  }
  
  throw new Error('Program IDL not found. Please build the program first.');
}

async function getFeeToken(connection: Connection, platformWallet: Keypair): Promise<PublicKey> {
  const existingMint = USDC_MINTS[NETWORK];
  
  if (existingMint) {
    return new PublicKey(existingMint);
  }
  
  // For localnet, create a test token
  if (NETWORK === 'localnet') {
    console.log('📝 Creating test USDC token for localnet...');
    const { createMint } = await import('@solana/spl-token');
    
    const mint = await createMint(
      connection,
      platformWallet,
      platformWallet.publicKey,
      platformWallet.publicKey,
      6 // USDC decimals
    );
    
    console.log(`✅ Test USDC created: ${mint.toString()}`);
    updateEnvFile('TEST_USDC_MINT', mint.toString());
    
    return mint;
  }
  
  throw new Error(`No USDC mint configured for ${NETWORK}`);
}

async function checkIfInitialized(program: Program): Promise<boolean> {
  try {
    const [authPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("auth")],
      program.programId
    );
    
    const [commissionVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("commission_vault")],
      program.programId
    );
    
    const accountInfo = await program.provider.connection.getAccountInfo(commissionVaultPDA);
    return accountInfo !== null;
  } catch {
    return false;
  }
}

async function initializeCommissionVault(
  program: Program,
  platformWallet: Keypair,
  feeToken: PublicKey
): Promise<InitializationResult> {
  const [authPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("auth")],
    program.programId
  );
  
  const [commissionVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("commission_vault")],
    program.programId
  );
  
  try {
    const tx = await program.methods
      .initializeCommissionVault()
      .accounts({
        platform: platformWallet.publicKey,
        feeToken,
        auth: authPDA,
        commissionVault: commissionVaultPDA,
      })
      .signers([platformWallet])
      .rpc();
    
    console.log(`✅ Transaction signature: ${tx}`);
    
    return {
      commissionVault: commissionVaultPDA,
      auth: authPDA,
      platformWallet: platformWallet.publicKey,
      feeToken,
      network: NETWORK,
      timestamp: new Date()
    };
  } catch (error) {
    throw new Error(`Failed to initialize commission vault: ${error.message}`);
  }
}

async function verifyInitialization(
  program: Program,
  connection: Connection,
  initResult: InitializationResult
) {
  // Verify commission vault
  const vaultAccount = await connection.getAccountInfo(initResult.commissionVault);
  if (!vaultAccount) {
    throw new Error('Commission vault not found after initialization');
  }
  
  console.log('✅ Commission vault verified');
  console.log(`  - Owner: ${vaultAccount.owner.toString()}`);
  console.log(`  - Data length: ${vaultAccount.data.length} bytes`);
  
  // Verify auth PDA
  const authAccount = await connection.getAccountInfo(initResult.auth);
  if (!authAccount) {
    throw new Error('Auth PDA not found');
  }
  
  console.log('✅ Auth PDA verified');
}

async function saveInitializationInfo(initResult: InitializationResult) {
  const initDir = path.join(__dirname, '..', 'deployments', 'initialized');
  if (!fs.existsSync(initDir)) {
    fs.mkdirSync(initDir, { recursive: true });
  }
  
  const filename = `${initResult.network}-${initResult.timestamp.toISOString()}.json`;
  const filepath = path.join(initDir, filename);
  
  const initData = {
    commissionVault: initResult.commissionVault.toString(),
    auth: initResult.auth.toString(),
    platformWallet: initResult.platformWallet.toString(),
    feeToken: initResult.feeToken.toString(),
    network: initResult.network,
    timestamp: initResult.timestamp.toISOString(),
    programId: process.env.PROGRAM_ID
  };
  
  fs.writeFileSync(filepath, JSON.stringify(initData, null, 2));
  
  // Update latest symlink
  const latestPath = path.join(initDir, `${initResult.network}-latest.json`);
  if (fs.existsSync(latestPath)) {
    fs.unlinkSync(latestPath);
  }
  fs.symlinkSync(filename, latestPath);
  
  console.log(`\n📁 Initialization info saved to: ${filepath}`);
}

async function setupAdditionalConfigs(program: Program, config: any) {
  // This is where you could set up additional program configurations
  // For example:
  // - Set fee tiers
  // - Configure admin accounts
  // - Set up rate limits
  // - etc.
  
  console.log('✅ No additional configurations needed');
}

function updateEnvFile(key: string, value: string) {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  const line = `${key}=${value}`;
  
  if (envContent.includes(`${key}=`)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), line);
  } else {
    envContent += `\n${line}`;
  }
  
  fs.writeFileSync(envPath, envContent.trim() + '\n');
}

async function promptUser(question: string): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Additional utility functions

async function checkProgramAuthority(program: Program, expectedAuthority: PublicKey) {
  // Verify the program authority matches expected
  try {
    const programAccount = await program.provider.connection.getAccountInfo(program.programId);
    if (programAccount && programAccount.owner.equals(expectedAuthority)) {
      console.log('✅ Program authority verified');
    } else {
      console.warn('⚠️  Program authority mismatch');
    }
  } catch (error) {
    console.error('Failed to verify program authority:', error);
  }
}

async function createTestAccounts(connection: Connection, platformWallet: Keypair) {
  if (NETWORK !== 'localnet') return;
  
  console.log('\n🧪 Creating test accounts for localnet...');
  
  // Create test user account
  const testUser = Keypair.generate();
  const airdropSig = await connection.requestAirdrop(
    testUser.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSig);
  
  // Save test account info
  const testAccountsPath = path.join(__dirname, '..', 'test-accounts.json');
  fs.writeFileSync(testAccountsPath, JSON.stringify({
    testUser: Array.from(testUser.secretKey),
    testUserPublicKey: testUser.publicKey.toString()
  }, null, 2));
  
  console.log('✅ Test accounts created and saved');
}

// Run initialization
if (require.main === module) {
  main().catch((error) => {
    console.error('Initialization error:', error);
    process.exit(1);
  });
}

export { main as initialize, InitializationResult };