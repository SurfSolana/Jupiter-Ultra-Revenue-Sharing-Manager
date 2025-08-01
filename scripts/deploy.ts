/**
 * Deployment Script for Platform Fee Escrow
 * Deploys the Poseidon contract to Solana
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { spawn } from 'child_process';
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

interface DeploymentResult {
  programId: PublicKey;
  deployerWallet: PublicKey;
  network: string;
  timestamp: Date;
  txSignature: string;
}

async function main() {
  console.log('🚀 Platform Fee Escrow Deployment Script');
  console.log('=====================================');
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC URL: ${RPC_URLS[NETWORK]}`);
  console.log('');
  
  try {
    // 1. Load deployer wallet
    const deployerWallet = await loadDeployerWallet();
    console.log(`✅ Deployer wallet: ${deployerWallet.publicKey.toString()}`);
    
    // 2. Check balance
    const connection = new Connection(RPC_URLS[NETWORK], 'confirmed');
    const balance = await checkBalance(connection, deployerWallet.publicKey);
    console.log(`💰 Wallet balance: ${balance} SOL`);
    
    if (balance < 2) {
      console.error('❌ Insufficient balance. Need at least 2 SOL for deployment.');
      
      if (NETWORK === 'devnet' || NETWORK === 'testnet') {
        console.log('🚿 Requesting airdrop...');
        await requestAirdrop(connection, deployerWallet.publicKey);
      } else {
        process.exit(1);
      }
    }
    
    // 3. Build the Poseidon program
    console.log('\n📦 Building Poseidon program...');
    await buildProgram();
    
    // 4. Deploy the program
    console.log('\n🚢 Deploying program...');
    const deploymentResult = await deployProgram(deployerWallet);
    
    // 5. Save deployment info
    await saveDeploymentInfo(deploymentResult);
    
    // 6. Verify deployment
    console.log('\n🔍 Verifying deployment...');
    await verifyDeployment(connection, deploymentResult.programId);
    
    console.log('\n✅ Deployment successful!');
    console.log(`Program ID: ${deploymentResult.programId.toString()}`);
    console.log(`Transaction: ${deploymentResult.txSignature}`);
    
    // 7. Update environment variables
    updateEnvFile(deploymentResult.programId);
    
    console.log('\n📋 Next steps:');
    console.log('1. Run `npm run initialize` to set up the commission vault');
    console.log('2. Update your frontend/backend with the program ID');
    console.log('3. Run tests with `npm run test:integration`');
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

async function loadDeployerWallet(): Promise<Keypair> {
  // Check for environment variable first
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    try {
      const privateKey = JSON.parse(process.env.DEPLOYER_PRIVATE_KEY);
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } catch (error) {
      console.error('Failed to parse DEPLOYER_PRIVATE_KEY from env');
    }
  }
  
  // Check for local keypair file
  const keypairPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  if (fs.existsSync(keypairPath)) {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  }
  
  // Generate new keypair as last resort
  console.log('⚠️  No existing wallet found. Generating new keypair...');
  const newKeypair = Keypair.generate();
  
  // Save it for future use
  const configDir = path.join(process.env.HOME || '', '.config/solana');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(configDir, 'platform-fee-deployer.json'),
    JSON.stringify(Array.from(newKeypair.secretKey))
  );
  
  return newKeypair;
}

async function checkBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

async function requestAirdrop(connection: Connection, publicKey: PublicKey) {
  const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature);
  console.log('✅ Airdrop received: 2 SOL');
}

async function buildProgram(): Promise<void> {
  return new Promise((resolve, reject) => {
    const build = spawn('poseidon', ['build'], {
      cwd: path.join(__dirname, '..', 'contracts'),
      stdio: 'inherit'
    });
    
    build.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });
    
    build.on('error', (err) => {
      reject(new Error(`Build process error: ${err.message}`));
    });
  });
}

async function deployProgram(deployer: Keypair): Promise<DeploymentResult> {
  return new Promise((resolve, reject) => {
    // Poseidon deploy command
    const deploy = spawn('poseidon', [
      'deploy',
      '--network', NETWORK,
      '--keypair', path.join(process.env.HOME || '', '.config/solana/id.json')
    ], {
      cwd: path.join(__dirname, '..', 'contracts'),
      stdio: 'pipe'
    });
    
    let output = '';
    let errorOutput = '';
    
    deploy.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    deploy.stderr.on('data', (data) => {
      errorOutput += data.toString();
      process.stderr.write(data);
    });
    
    deploy.on('close', (code) => {
      if (code === 0) {
        // Parse program ID from output
        const programIdMatch = output.match(/Program ID: ([A-Za-z0-9]+)/);
        const txMatch = output.match(/Transaction: ([A-Za-z0-9]+)/);
        
        if (programIdMatch && txMatch) {
          resolve({
            programId: new PublicKey(programIdMatch[1]),
            deployerWallet: deployer.publicKey,
            network: NETWORK,
            timestamp: new Date(),
            txSignature: txMatch[1]
          });
        } else {
          reject(new Error('Failed to parse deployment output'));
        }
      } else {
        reject(new Error(`Deployment failed: ${errorOutput}`));
      }
    });
    
    deploy.on('error', (err) => {
      reject(new Error(`Deploy process error: ${err.message}`));
    });
  });
}

async function saveDeploymentInfo(deployment: DeploymentResult) {
  const deploymentDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  
  const filename = `${deployment.network}-${deployment.timestamp.toISOString()}.json`;
  const filepath = path.join(deploymentDir, filename);
  
  const deploymentData = {
    programId: deployment.programId.toString(),
    deployerWallet: deployment.deployerWallet.toString(),
    network: deployment.network,
    timestamp: deployment.timestamp.toISOString(),
    txSignature: deployment.txSignature,
    rpcUrl: RPC_URLS[deployment.network]
  };
  
  fs.writeFileSync(filepath, JSON.stringify(deploymentData, null, 2));
  
  // Also update the latest deployment symlink
  const latestPath = path.join(deploymentDir, `${deployment.network}-latest.json`);
  if (fs.existsSync(latestPath)) {
    fs.unlinkSync(latestPath);
  }
  fs.symlinkSync(filename, latestPath);
  
  console.log(`\n📁 Deployment info saved to: ${filepath}`);
}

async function verifyDeployment(connection: Connection, programId: PublicKey) {
  try {
    const accountInfo = await connection.getAccountInfo(programId);
    
    if (!accountInfo) {
      throw new Error('Program account not found');
    }
    
    if (!accountInfo.executable) {
      throw new Error('Account is not executable');
    }
    
    console.log('✅ Program verified on-chain');
    console.log(`  - Owner: ${accountInfo.owner.toString()}`);
    console.log(`  - Executable: ${accountInfo.executable}`);
    console.log(`  - Data length: ${accountInfo.data.length} bytes`);
    
  } catch (error) {
    throw new Error(`Deployment verification failed: ${error.message}`);
  }
}

function updateEnvFile(programId: PublicKey) {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  // Update or add PROGRAM_ID
  const programIdLine = `PROGRAM_ID=${programId.toString()}`;
  
  if (envContent.includes('PROGRAM_ID=')) {
    envContent = envContent.replace(/PROGRAM_ID=.*/, programIdLine);
  } else {
    envContent += `\n${programIdLine}`;
  }
  
  // Add deployment network
  const networkLine = `DEPLOY_NETWORK=${NETWORK}`;
  if (!envContent.includes('DEPLOY_NETWORK=')) {
    envContent += `\n${networkLine}`;
  }
  
  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log('\n📝 Updated .env file with program ID');
}

// Additional helper for multi-network deployments
async function deployToMultipleNetworks() {
  const networks = ['devnet', 'testnet', 'mainnet'];
  const deployments = {};
  
  for (const network of networks) {
    console.log(`\n🌐 Deploying to ${network}...`);
    process.env.DEPLOY_NETWORK = network;
    
    try {
      // Run deployment for each network
      // Store results
    } catch (error) {
      console.error(`Failed to deploy to ${network}:`, error);
    }
  }
  
  return deployments;
}

// Run the deployment
if (require.main === module) {
  main().catch((error) => {
    console.error('Deployment error:', error);
    process.exit(1);
  });
}

export { main as deploy, DeploymentResult };