/**
 * Fee Deposit Modal Component
 * Shows fee breakdown and handles the deposit flow
 */

import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { FeeBreakdown } from '../sdk';
import { usePlatformFee } from '../hooks/usePlatformFee';
import { formatUsdc } from '../sdk/utils';

export interface FeeDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputMint: string;
  outputMint: string;
  inputToken: {
    symbol: string;
    logoURI?: string;
    decimals: number;
  };
  outputToken: {
    symbol: string;
    logoURI?: string;
    decimals: number;
  };
  amount: number;
  onDepositComplete: (escrowPDA: PublicKey, seed: string) => void;
  connection: any;
  platformWallet: PublicKey;
  referrer?: PublicKey;
  tier?: 'default' | 'referred' | 'premium';
}

export const FeeDepositModal: React.FC<FeeDepositModalProps> = ({
  isOpen,
  onClose,
  inputMint,
  outputMint,
  inputToken,
  outputToken,
  amount,
  onDepositComplete,
  connection,
  platformWallet,
  referrer,
  tier = 'default'
}) => {
  const [step, setStep] = useState<'quote' | 'confirm' | 'depositing' | 'success'>('quote');
  
  const {
    quote,
    feeBreakdown,
    escrowPDA,
    escrowSeed,
    depositTx,
    isLoading,
    error,
    getQuote,
    depositFee,
    reset
  } = usePlatformFee({
    connection,
    platformWallet,
    referrer,
    tier
  });
  
  // Get quote when modal opens
  useEffect(() => {
    if (isOpen && step === 'quote') {
      getQuote({
        inputMint,
        outputMint,
        amount,
        slippageBps: 50
      });
    }
  }, [isOpen, step, inputMint, outputMint, amount]);
  
  // Handle deposit completion
  useEffect(() => {
    if (depositTx && escrowPDA && escrowSeed) {
      setStep('success');
      setTimeout(() => {
        onDepositComplete(escrowPDA, escrowSeed.toString());
        handleClose();
      }, 2000);
    }
  }, [depositTx, escrowPDA, escrowSeed]);
  
  const handleClose = () => {
    setStep('quote');
    reset();
    onClose();
  };
  
  const handleDeposit = async () => {
    setStep('depositing');
    try {
      await depositFee();
    } catch (error) {
      console.error('Deposit error:', error);
      setStep('confirm');
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Platform Fee Details
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {isLoading && step === 'quote' && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {/* Error State */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          
          {/* Quote Display */}
          {quote && feeBreakdown && step !== 'depositing' && step !== 'success' && (
            <>
              {/* Trade Summary */}
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {inputToken.logoURI && (
                      <img src={inputToken.logoURI} alt={inputToken.symbol} className="w-6 h-6 rounded-full" />
                    )}
                    <span className="font-medium">{amount} {inputToken.symbol}</span>
                  </div>
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <div className="flex items-center space-x-2">
                    {outputToken.logoURI && (
                      <img src={outputToken.logoURI} alt={outputToken.symbol} className="w-6 h-6 rounded-full" />
                    )}
                    <span className="font-medium">~{(parseFloat(quote.outAmount) / Math.pow(10, outputToken.decimals)).toFixed(4)} {outputToken.symbol}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Rate: 1 {inputToken.symbol} = {(parseFloat(quote.outAmount) / parseFloat(quote.inAmount)).toFixed(6)} {outputToken.symbol}
                </div>
              </div>
              
              {/* Fee Breakdown */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Fee Breakdown</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Trade Amount</span>
                    <span className="font-medium">${feeBreakdown.tradeAmount.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Platform Fee (1%)</span>
                    <span className="font-medium">${feeBreakdown.grossFee.toFixed(2)}</span>
                  </div>
                  
                  {feeBreakdown.userDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                      <span>Referral Discount</span>
                      <span>-${feeBreakdown.userDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">You Pay</span>
                      <span className="font-semibold text-lg">${feeBreakdown.userPays.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                {tier !== 'default' && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {tier === 'referred' && '🎉 You\'re receiving a 0.1% discount through your referral!'}
                      {tier === 'premium' && '⭐ Premium tier: Enhanced referral benefits applied!'}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="mt-6 flex space-x-3">
                {step === 'quote' && (
                  <>
                    <button
                      onClick={handleClose}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setStep('confirm')}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Continue
                    </button>
                  </>
                )}
                
                {step === 'confirm' && (
                  <>
                    <button
                      onClick={() => setStep('quote')}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleDeposit}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Deposit Fee
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          
          {/* Depositing State */}
          {step === 'depositing' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Depositing platform fee...</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Please approve the transaction in your wallet</p>
            </div>
          )}
          
          {/* Success State */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Fee Deposited!</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your platform fee has been deposited. You can now proceed with your swap.
              </p>
              {depositTx && (
                <a
                  href={`https://solscan.io/tx/${depositTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View transaction
                  <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
        
        {/* Info Footer */}
        {step === 'quote' && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Platform fees enable sustainable development and are automatically refunded if your trade fails.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};