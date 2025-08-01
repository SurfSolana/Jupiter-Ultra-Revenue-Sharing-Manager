/**
 * Referrer Dashboard Component
 * Complete dashboard for referrers to track their performance
 */

import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useReferrerDashboard } from '../hooks/useReferrerDashboard';

export interface ReferrerDashboardProps {
  connection: any;
  platformWallet: PublicKey;
  apiUrl?: string;
}

export const ReferrerDashboard: React.FC<ReferrerDashboardProps> = ({
  connection,
  platformWallet,
  apiUrl
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'referrals' | 'history'>('overview');
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);
  
  const {
    stats,
    referrals,
    referralLink,
    isLoading,
    isClaimingCommission,
    error,
    claimHistory,
    fetchDashboardData,
    claimCommission,
    copyReferralLink,
    exportToCSV,
    getConversionRate,
    getAverageTradeVolume,
    getTopReferrals,
    getVolumeChartData,
    isConnected,
    referrerAddress
  } = useReferrerDashboard({
    connection,
    platformWallet,
    apiUrl,
    refreshInterval: 30000 // Refresh every 30 seconds
  });
  
  // Refresh on mount
  useEffect(() => {
    if (isConnected) {
      fetchDashboardData();
    }
  }, [isConnected]);
  
  const handleCopyLink = async () => {
    const success = await copyReferralLink();
    if (success) {
      setShowCopiedTooltip(true);
      setTimeout(() => setShowCopiedTooltip(false), 2000);
    }
  };
  
  const handleClaimCommission = async () => {
    try {
      await claimCommission();
    } catch (error) {
      console.error('Failed to claim commission:', error);
    }
  };
  
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Connect your wallet</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Please connect your wallet to view your referral dashboard
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Referrer Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Track your referrals and earnings
        </p>
      </div>
      
      {/* Referral Link Section */}
      <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h2 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-4">Your Referral Link</h2>
        <div className="flex items-center space-x-3">
          <input
            type="text"
            readOnly
            value={referralLink || ''}
            className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg text-sm"
          />
          <div className="relative">
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Copy Link
            </button>
            {showCopiedTooltip && (
              <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded">
                Copied!
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
          Share this link to earn commissions on referred trades
        </p>
      </div>
      
      {/* Stats Overview */}
      {isLoading && !stats ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Referrals</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {referrals?.length || 0}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                  <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                {getConversionRate().toFixed(1)}% conversion rate
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Volume</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    ${stats?.totalVolume.toLocaleString() || '0'}
                  </p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                ${getAverageTradeVolume().toFixed(2)} avg per trade
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Earned</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    ${stats?.totalEarned.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-full">
                  <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                ${stats?.totalClaimed.toFixed(2) || '0.00'} claimed
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Available to Claim</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    ${stats?.availableToClaim.toFixed(2) || '0.00'}
                  </p>
                </div>
                <button
                  onClick={handleClaimCommission}
                  disabled={!stats?.availableToClaim || stats.availableToClaim <= 0 || isClaimingCommission}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isClaimingCommission ? 'Claiming...' : 'Claim'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                Minimum claim: $1.00
              </p>
            </div>
          </div>
          
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          
          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('referrals')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'referrals'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Referrals ({referrals?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Claim History
              </button>
            </nav>
          </div>
          
          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top Referrals */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Top Referrals</h3>
                {getTopReferrals(5).length > 0 ? (
                  <div className="space-y-3">
                    {getTopReferrals(5).map((referral, index) => (
                      <div key={referral.user} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                          <span className="text-sm text-gray-900 dark:text-white font-mono">
                            {referral.user.slice(0, 4)}...{referral.user.slice(-4)}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            ${referral.totalVolume.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">{referral.totalTrades} trades</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No referrals yet</p>
                )}
              </div>
              
              {/* Volume Chart Placeholder */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Volume Over Time</h3>
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Chart visualization would go here</p>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'referrals' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">All Referrals</h3>
                <button
                  onClick={exportToCSV}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Export CSV
                </button>
              </div>
              {referrals && referrals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Trades
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Volume
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Fees Generated
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {referrals.map((referral) => (
                        <tr key={referral.user}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white font-mono">
                            {referral.user.slice(0, 8)}...{referral.user.slice(-8)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {referral.totalTrades}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            ${referral.totalVolume.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            ${referral.totalFeesGenerated.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">No referrals yet</p>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'history' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Claim History</h3>
              </div>
              {claimHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Transaction
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {claimHistory.map((claim) => (
                        <tr key={claim.signature}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {new Date(claim.timestamp).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                            ${claim.amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            <a
                              href={`https://solscan.io/tx/${claim.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {claim.signature.slice(0, 8)}...
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">No claims yet</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};