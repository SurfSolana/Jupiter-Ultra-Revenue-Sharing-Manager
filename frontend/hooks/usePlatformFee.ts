/**
 * React hook for Platform Fee operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  PlatformFeeEscrowClient,
  JupiterQuoteResponse,
  JupiterExecutionResponse,
  PartnerStatus,
  FeeBreakdown,
  calculateTradeFees,
  generateEscrowSeed,
  parseUsdc
} from '../sdk';

export interface UsePlatformFeeConfig {
  connection: Connection;
  programId?: PublicKey;
  platformWallet: PublicKey;
  feeToken?: PublicKey;
  referrer?: PublicKey;
  tier?: PartnerStatus;
  apiUrl?: string;
}

export interface TradeFlow {
  // State
  isLoading: boolean;
  error: string | null;
  
  // Quote
  quote: JupiterQuoteResponse | null;
  feeBreakdown: FeeBreakdown | null;
  
  // Escrow
  escrowPDA: PublicKey | null;
  escrowSeed: BN | null;
  depositTx: string | null;
  
  // Execution
  executionTx: string | null;
  proofTx: string | null;
  
  // Status
  status: 'idle' | 'quoting' | 'depositing' | 'swapping' | 'proving' | 'completed' | 'error';
}

export function usePlatformFee(config: UsePlatformFeeConfig) {
  const wallet = useWallet();
  const [client, setClient] = useState<PlatformFeeEscrowClient | null>(null);
  const [tradeFlow, setTradeFlow] = useState<TradeFlow>({
    isLoading: false,
    error: null,
    quote: null,
    feeBreakdown: null,
    escrowPDA: null,
    escrowSeed: null,
    depositTx: null,
    executionTx: null,
    proofTx: null,
    status: 'idle'
  });
  
  // Initialize client when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.signTransaction) {
      // Note: You need to load the IDL here
      // const client = new PlatformFeeEscrowClient(
      //   config.connection,
      //   wallet,
      //   config.platformWallet,
      //   config.feeToken || USDC_MINT,
      //   config.programId,
      //   idl
      // );
      // setClient(client);
    }
  }, [wallet.connected, config]);
  
  // =============================================================================
  // GET QUOTE
  // =============================================================================
  
  const getQuote = useCallback(async (params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps?: number;
  }) => {
    setTradeFlow(prev => ({ ...prev, isLoading: true, error: null, status: 'quoting' }));
    
    try {
      // Get Jupiter quote
      const response = await fetch(`${config.apiUrl || ''}/api/jupiter/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        throw new Error('Failed to get quote');
      }
      
      const quote: JupiterQuoteResponse = await response.json();
      
      // Calculate fees
      const tradeAmount = parseUsdc(params.amount);
      const fees = calculateTradeFees(tradeAmount, config.tier);
      
      const feeBreakdown: FeeBreakdown = {
        tradeAmount: params.amount,
        grossFee: fees.grossPlatformFee.toNumber() / 1e6,
        userDiscount: fees.userDiscount.toNumber() / 1e6,
        userPays: fees.actualFeeCharged.toNumber() / 1e6,
        referrerGets: fees.referrerCommission.toNumber() / 1e6,
        platformGets: fees.platformRevenue.toNumber() / 1e6,
        tier: config.tier || 'default'
      };
      
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        quote,
        feeBreakdown,
        status: 'idle'
      }));
      
      return { quote, feeBreakdown };
      
    } catch (error) {
      const errorMessage = error.message || 'Failed to get quote';
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: 'error'
      }));
      throw error;
    }
  }, [config]);
  
  // =============================================================================
  // DEPOSIT FEE
  // =============================================================================
  
  const depositFee = useCallback(async () => {
    if (!client || !wallet.publicKey || !tradeFlow.quote || !tradeFlow.feeBreakdown) {
      throw new Error('Missing requirements for fee deposit');
    }
    
    setTradeFlow(prev => ({ ...prev, isLoading: true, error: null, status: 'depositing' }));
    
    try {
      const tradeAmount = parseUsdc(tradeFlow.feeBreakdown.tradeAmount);
      
      const result = await client.depositFeeWithQuote({
        user: wallet.publicKey,
        jupiterQuote: tradeFlow.quote,
        tradeAmount,
        referrer: config.referrer,
        tier: config.tier
      });
      
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        escrowPDA: result.escrowPDA,
        escrowSeed: result.seed,
        depositTx: result.signature,
        status: 'idle'
      }));
      
      return result;
      
    } catch (error) {
      const errorMessage = error.message || 'Failed to deposit fee';
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: 'error'
      }));
      throw error;
    }
  }, [client, wallet, tradeFlow.quote, tradeFlow.feeBreakdown, config]);
  
  // =============================================================================
  // GET SWAP TRANSACTION
  // =============================================================================
  
  const getSwapTransaction = useCallback(async (): Promise<Transaction> => {
    if (!wallet.publicKey || !tradeFlow.quote) {
      throw new Error('Missing requirements for swap transaction');
    }
    
    try {
      const response = await fetch(`${config.apiUrl || ''}/api/jupiter/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: tradeFlow.quote,
          userPublicKey: wallet.publicKey.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get swap transaction');
      }
      
      const { swapTransaction } = await response.json();
      
      // Deserialize transaction
      const transaction = Transaction.from(Buffer.from(swapTransaction, 'base64'));
      
      return transaction;
      
    } catch (error) {
      throw new Error(`Failed to get swap transaction: ${error.message}`);
    }
  }, [wallet, tradeFlow.quote, config]);
  
  // =============================================================================
  // EXECUTE SWAP
  // =============================================================================
  
  const executeSwap = useCallback(async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }
    
    setTradeFlow(prev => ({ ...prev, isLoading: true, error: null, status: 'swapping' }));
    
    try {
      // Get swap transaction
      const transaction = await getSwapTransaction();
      
      // Sign transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const signature = await config.connection.sendRawTransaction(
        signedTransaction.serialize()
      );
      
      // Wait for confirmation
      await config.connection.confirmTransaction(signature, 'confirmed');
      
      setTradeFlow(prev => ({
        ...prev,
        executionTx: signature,
        status: 'idle'
      }));
      
      return signature;
      
    } catch (error) {
      const errorMessage = error.message || 'Failed to execute swap';
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: 'error'
      }));
      throw error;
    }
  }, [wallet, getSwapTransaction, config]);
  
  // =============================================================================
  // SUBMIT EXECUTION PROOF
  // =============================================================================
  
  const submitExecutionProof = useCallback(async (
    executionResponse: JupiterExecutionResponse
  ) => {
    if (!client || !wallet.publicKey || !tradeFlow.escrowPDA) {
      throw new Error('Missing requirements for proof submission');
    }
    
    setTradeFlow(prev => ({ ...prev, isLoading: true, error: null, status: 'proving' }));
    
    try {
      const proofTx = await client.submitJupiterExecution({
        user: wallet.publicKey,
        escrowPDA: tradeFlow.escrowPDA,
        executionResponse
      });
      
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        proofTx,
        status: 'completed'
      }));
      
      return proofTx;
      
    } catch (error) {
      const errorMessage = error.message || 'Failed to submit execution proof';
      setTradeFlow(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: 'error'
      }));
      throw error;
    }
  }, [client, wallet, tradeFlow.escrowPDA]);
  
  // =============================================================================
  // COMPLETE FLOW
  // =============================================================================
  
  const executeCompleteFlow = useCallback(async (params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps?: number;
  }) => {
    try {
      // 1. Get quote
      await getQuote(params);
      
      // 2. Deposit fee
      await depositFee();
      
      // 3. Execute swap
      const swapTx = await executeSwap();
      
      // 4. Get execution details (mock for now)
      // In production, you would parse the transaction or get from Jupiter API
      const executionResponse: JupiterExecutionResponse = {
        status: "Success",
        signature: swapTx,
        slot: "0",
        code: 200,
        totalInputAmount: tradeFlow.quote!.inAmount,
        totalOutputAmount: tradeFlow.quote!.outAmount,
        inputAmountResult: tradeFlow.quote!.inAmount,
        outputAmountResult: tradeFlow.quote!.outAmount,
        swapEvents: [{
          inputMint: tradeFlow.quote!.inputMint,
          inputAmount: tradeFlow.quote!.inAmount,
          outputMint: tradeFlow.quote!.outputMint,
          outputAmount: tradeFlow.quote!.outAmount
        }]
      };
      
      // 5. Submit proof
      await submitExecutionProof(executionResponse);
      
      return {
        depositTx: tradeFlow.depositTx,
        swapTx,
        proofTx: tradeFlow.proofTx
      };
      
    } catch (error) {
      console.error('Complete flow error:', error);
      throw error;
    }
  }, [getQuote, depositFee, executeSwap, submitExecutionProof, tradeFlow]);
  
  // =============================================================================
  // RESET
  // =============================================================================
  
  const reset = useCallback(() => {
    setTradeFlow({
      isLoading: false,
      error: null,
      quote: null,
      feeBreakdown: null,
      escrowPDA: null,
      escrowSeed: null,
      depositTx: null,
      executionTx: null,
      proofTx: null,
      status: 'idle'
    });
  }, []);
  
  return {
    // State
    ...tradeFlow,
    
    // Methods
    getQuote,
    depositFee,
    getSwapTransaction,
    executeSwap,
    submitExecutionProof,
    executeCompleteFlow,
    reset,
    
    // Utils
    client
  };
}