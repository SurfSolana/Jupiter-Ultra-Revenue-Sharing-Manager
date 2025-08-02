/**
 * Jupiter API Proxy Service
 * Handles communication with Jupiter aggregator
 */

import axios, { AxiosInstance } from 'axios';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { 
  JupiterQuoteResponse, 
  JupiterSwapResponse,
  JupiterExecutionResponse,
  SwapEvent 
} from '../../sdk/types';
import { extractSignature, verifyTransactionExecution } from '../../sdk/utils';

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number | string;
  slippageBps?: number;
  swapMode?: 'ExactIn' | 'ExactOut';
  excludeDexes?: string[];
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  platformFeeBps?: number;
}

export interface SwapParams {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  prioritizationFeeLamports?: number | 'auto';
  dynamicComputeUnitLimit?: boolean;
  destinationTokenAccount?: string;
}

export class JupiterProxyService {
  private client: AxiosInstance;
  private healthCheckInterval: NodeJS.Timer;
  private isHealthyStatus: boolean = false;
  
  constructor(
    private baseUrl: string,
    private timeout: number = 30000
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    // Setup request/response interceptors for logging
    this.setupInterceptors();
    
    // Start health check
    this.startHealthCheck();
  }
  
  // =============================================================================
  // QUOTE
  // =============================================================================
  
  async getQuote(params: QuoteParams): Promise<JupiterQuoteResponse> {
    try {
      const queryParams = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount.toString(),
        slippageBps: (params.slippageBps || 50).toString(),
        swapMode: params.swapMode || 'ExactIn',
        onlyDirectRoutes: (params.onlyDirectRoutes || false).toString(),
        asLegacyTransaction: (params.asLegacyTransaction || false).toString(),
      });
      
      if (params.excludeDexes?.length) {
        queryParams.append('excludeDexes', params.excludeDexes.join(','));
      }
      
      if (params.platformFeeBps) {
        queryParams.append('platformFeeBps', params.platformFeeBps.toString());
      }
      
      const response = await this.client.get<JupiterQuoteResponse>(
        `/quote?${queryParams.toString()}`
      );
      
      return response.data;
    } catch (error) {
      console.error('Jupiter quote error:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  // =============================================================================
  // SWAP TRANSACTION
  // =============================================================================
  
  async getSwapTransaction(params: SwapParams): Promise<JupiterSwapResponse> {
    try {
      const response = await this.client.post<JupiterSwapResponse>('/swap', {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
        prioritizationFeeLamports: params.prioritizationFeeLamports || 'auto',
        dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
        destinationTokenAccount: params.destinationTokenAccount,
      });
      
      return response.data;
    } catch (error) {
      console.error('Jupiter swap transaction error:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  // =============================================================================
  // EXECUTE SWAP AND VERIFICATION
  // =============================================================================
  
  async executeSwap(
    serializedTransaction: string,
    userPublicKey: string,
    connection?: Connection
  ): Promise<JupiterExecutionResponse> {
    try {
      // In production, you would:
      // 1. Deserialize and send the transaction
      // 2. Wait for confirmation
      // 3. Parse the transaction logs to extract swap events
      
      // For now, we'll simulate the response structure
      // This should be replaced with actual transaction parsing
      
      return this.simulateExecutionResponse();
    } catch (error) {
      console.error('Jupiter execution error:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  /**
   * Verify a Jupiter transaction using signature-based matching
   * This is the new perfect verification method discovered
   */
  async verifyJupiterTransaction(
    signedTransactionBase64: string,
    connection: Connection
  ): Promise<{
    verified: boolean;
    signature?: string;
    executed: boolean;
    error?: string;
  }> {
    try {
      // Extract signature from the signed transaction
      const signature = extractSignature(signedTransactionBase64);
      
      // Verify execution on blockchain
      const verification = await verifyTransactionExecution(connection, signature);
      
      return {
        verified: true,
        signature,
        executed: verification.success,
        error: verification.error
      };
    } catch (error) {
      console.error('Jupiter transaction verification error:', error);
      return {
        verified: false,
        executed: false,
        error: error.message
      };
    }
  }
  
  /**
   * Enhanced method that combines transaction execution and verification
   * For use when you have the signed transaction stored
   */
  async executeAndVerifyTransaction(
    signedTransactionBase64: string,
    connection: Connection,
    sendTransaction: boolean = false
  ): Promise<JupiterExecutionResponse & { verified: boolean }> {
    try {
      let executionResult: JupiterExecutionResponse;
      
      if (sendTransaction) {
        // If we need to actually send the transaction
        // (This would be used if the transaction hasn't been sent yet)
        const txBuffer = Buffer.from(signedTransactionBase64, 'base64');
        const signature = await connection.sendRawTransaction(txBuffer);
        await connection.confirmTransaction(signature, 'confirmed');
        
        // Parse the transaction results
        executionResult = await this.parseExecutedTransaction(signature, connection);
      } else {
        // If transaction was already sent, just verify it
        const verification = await this.verifyJupiterTransaction(
          signedTransactionBase64, 
          connection
        );
        
        if (!verification.verified || !verification.executed) {
          throw new Error(verification.error || 'Transaction verification failed');
        }
        
        // Parse the verified transaction
        executionResult = await this.parseExecutedTransaction(
          verification.signature!, 
          connection
        );
      }
      
      return {
        ...executionResult,
        verified: true
      };
    } catch (error) {
      console.error('Execute and verify error:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  /**
   * Parse an executed transaction to extract Jupiter execution response
   */
  private async parseExecutedTransaction(
    signature: string,
    connection: Connection
  ): Promise<JupiterExecutionResponse> {
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx || !tx.meta) {
        throw new Error('Transaction not found or incomplete');
      }
      
      // Parse swap events from transaction logs
      const swapEvents = JupiterTransactionParser.parseSwapEvents(
        tx.meta.logMessages || []
      );
      
      return {
        status: tx.meta.err ? "Failed" : "Success",
        signature,
        slot: tx.slot.toString(),
        code: tx.meta.err ? 400 : 200,
        totalInputAmount: "0", // Would need to parse from logs
        totalOutputAmount: "0", // Would need to parse from logs  
        inputAmountResult: "0", // Would need to parse from logs
        outputAmountResult: "0", // Would need to parse from logs
        swapEvents,
        error: tx.meta.err ? JSON.stringify(tx.meta.err) : undefined
      };
    } catch (error) {
      throw new Error(`Failed to parse executed transaction: ${error.message}`);
    }
  }
  
  // =============================================================================
  // UTILITY METHODS
  // =============================================================================
  
  async getTokenList(): Promise<any[]> {
    try {
      const response = await this.client.get('/tokens');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch token list:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  async getIndexedRouteMap(): Promise<any> {
    try {
      const response = await this.client.get('/indexed-route-map');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch route map:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  async getProgramIdToLabel(): Promise<Record<string, string>> {
    try {
      const response = await this.client.get('/program-id-to-label');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch program labels:', error);
      throw this.handleJupiterError(error);
    }
  }
  
  // =============================================================================
  // HEALTH CHECK
  // =============================================================================
  
  private startHealthCheck() {
    // Initial check
    this.checkHealth();
    
    // Periodic checks every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, 30000);
  }
  
  private async checkHealth() {
    try {
      await this.client.get('/tokens', { timeout: 5000 });
      this.isHealthyStatus = true;
    } catch (error) {
      this.isHealthyStatus = false;
      console.error('Jupiter health check failed:', error.message);
    }
  }
  
  isHealthy(): boolean {
    return this.isHealthyStatus;
  }
  
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
  
  // =============================================================================
  // INTERCEPTORS
  // =============================================================================
  
  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[Jupiter API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[Jupiter API] Request error:', error);
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[Jupiter API] Response ${response.status} for ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(
            `[Jupiter API] Error ${error.response.status} for ${error.config.url}:`,
            error.response.data
          );
        }
        return Promise.reject(error);
      }
    );
  }
  
  // =============================================================================
  // ERROR HANDLING
  // =============================================================================
  
  private handleJupiterError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          return new Error(`Invalid request: ${data.error || data.message || 'Bad request'}`);
        case 404:
          return new Error('Route not found - no liquidity available');
        case 429:
          return new Error('Rate limited - too many requests');
        case 500:
          return new Error('Jupiter service error - please try again');
        default:
          return new Error(`Jupiter API error (${status}): ${data.error || data.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      return new Error('No response from Jupiter API - network error or timeout');
    } else {
      return new Error(`Jupiter API error: ${error.message}`);
    }
  }
  
  // =============================================================================
  // SIMULATION (temporary - replace with actual implementation)
  // =============================================================================
  
  private simulateExecutionResponse(): JupiterExecutionResponse {
    // This is a placeholder - in production, you would parse actual transaction logs
    return {
      status: "Success",
      signature: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
      slot: "1234567",
      code: 200,
      totalInputAmount: "1000000000",
      totalOutputAmount: "50000000",
      inputAmountResult: "1000000000",
      outputAmountResult: "49950000",
      swapEvents: [
        {
          inputMint: "So11111111111111111111111111111111111111112",
          inputAmount: "1000000000",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          outputAmount: "49950000"
        }
      ]
    };
  }
}

// =============================================================================
// TRANSACTION PARSER (for extracting swap events from logs)
// =============================================================================

export class JupiterTransactionParser {
  static parseSwapEvents(logs: string[]): SwapEvent[] {
    const swapEvents: SwapEvent[] = [];
    
    // Parse Jupiter swap logs to extract swap events
    // This is a simplified example - actual implementation would need to
    // parse the specific log format from Jupiter's programs
    
    for (const log of logs) {
      if (log.includes('TokenSwap') || log.includes('Swap')) {
        // Extract swap details from log
        // This would need to be implemented based on actual log format
      }
    }
    
    return swapEvents;
  }
  
  static async parseTransactionForSwaps(
    connection: Connection,
    signature: string
  ): Promise<SwapEvent[]> {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || !tx.meta || !tx.meta.logMessages) {
      throw new Error('Transaction not found or no logs available');
    }
    
    return this.parseSwapEvents(tx.meta.logMessages);
  }
}