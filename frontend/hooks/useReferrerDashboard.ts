/**
 * React hook for Referrer Dashboard
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  PlatformFeeEscrowClient,
  ReferrerDashboardData,
  ReferralData
} from '../sdk';

export interface UseReferrerDashboardConfig {
  connection: Connection;
  programId?: PublicKey;
  platformWallet: PublicKey;
  feeToken?: PublicKey;
  apiUrl?: string;
  refreshInterval?: number; // Auto-refresh interval in ms
}

export interface ReferrerDashboardState {
  // Loading states
  isLoading: boolean;
  isClaimingCommission: boolean;
  error: string | null;
  
  // Dashboard data
  stats: ReferrerDashboardData | null;
  referrals: ReferralData[] | null;
  
  // Referral link
  referralCode: string | null;
  referralLink: string | null;
  
  // Transaction history
  claimHistory: Array<{
    signature: string;
    amount: number;
    timestamp: Date;
  }>;
}

export function useReferrerDashboard(config: UseReferrerDashboardConfig) {
  const wallet = useWallet();
  const [client, setClient] = useState<PlatformFeeEscrowClient | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timer | null>(null);
  
  const [state, setState] = useState<ReferrerDashboardState>({
    isLoading: false,
    isClaimingCommission: false,
    error: null,
    stats: null,
    referrals: null,
    referralCode: null,
    referralLink: null,
    claimHistory: []
  });
  
  // Initialize client
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
  
  // Generate referral link
  useEffect(() => {
    if (wallet.publicKey) {
      const code = wallet.publicKey.toString();
      const baseUrl = window.location.origin;
      const link = `${baseUrl}?ref=${code}`;
      
      setState(prev => ({
        ...prev,
        referralCode: code,
        referralLink: link
      }));
    }
  }, [wallet.publicKey]);
  
  // =============================================================================
  // FETCH DASHBOARD DATA
  // =============================================================================
  
  const fetchDashboardData = useCallback(async () => {
    if (!wallet.publicKey) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Fetch from SDK if available
      if (client) {
        const stats = await client.getReferrerDashboard(wallet.publicKey);
        setState(prev => ({ ...prev, stats }));
      }
      
      // Also fetch from API for additional data
      const [statsResponse, referralsResponse] = await Promise.all([
        fetch(`${config.apiUrl || ''}/api/referrer/${wallet.publicKey.toString()}/stats`),
        fetch(`${config.apiUrl || ''}/api/referrer/${wallet.publicKey.toString()}/referrals`)
      ]);
      
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        setState(prev => ({ ...prev, stats }));
      }
      
      if (referralsResponse.ok) {
        const referrals = await referralsResponse.json();
        setState(prev => ({ ...prev, referrals }));
      }
      
      setState(prev => ({ ...prev, isLoading: false }));
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch dashboard data'
      }));
    }
  }, [wallet.publicKey, client, config.apiUrl]);
  
  // =============================================================================
  // CLAIM COMMISSION
  // =============================================================================
  
  const claimCommission = useCallback(async () => {
    if (!client || !wallet.publicKey || !state.stats) {
      throw new Error('Missing requirements for claiming commission');
    }
    
    if (state.stats.availableToClaim <= 0) {
      throw new Error('No commission available to claim');
    }
    
    setState(prev => ({ ...prev, isClaimingCommission: true, error: null }));
    
    try {
      const signature = await client.claimReferralCommission(wallet.publicKey);
      
      // Add to claim history
      const claimRecord = {
        signature,
        amount: state.stats.availableToClaim,
        timestamp: new Date()
      };
      
      setState(prev => ({
        ...prev,
        isClaimingCommission: false,
        claimHistory: [claimRecord, ...prev.claimHistory],
        stats: prev.stats ? {
          ...prev.stats,
          availableToClaim: 0,
          totalClaimed: prev.stats.totalClaimed + prev.stats.availableToClaim
        } : null
      }));
      
      // Refresh data after claim
      setTimeout(() => fetchDashboardData(), 2000);
      
      return signature;
      
    } catch (error) {
      console.error('Error claiming commission:', error);
      setState(prev => ({
        ...prev,
        isClaimingCommission: false,
        error: 'Failed to claim commission'
      }));
      throw error;
    }
  }, [client, wallet.publicKey, state.stats, fetchDashboardData]);
  
  // =============================================================================
  // COPY REFERRAL LINK
  // =============================================================================
  
  const copyReferralLink = useCallback(async () => {
    if (!state.referralLink) return false;
    
    try {
      await navigator.clipboard.writeText(state.referralLink);
      return true;
    } catch (error) {
      console.error('Failed to copy referral link:', error);
      return false;
    }
  }, [state.referralLink]);
  
  // =============================================================================
  // AUTO-REFRESH
  // =============================================================================
  
  useEffect(() => {
    if (!wallet.publicKey || !config.refreshInterval) return;
    
    // Initial fetch
    fetchDashboardData();
    
    // Set up interval
    const interval = setInterval(fetchDashboardData, config.refreshInterval);
    setRefreshInterval(interval);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [wallet.publicKey, config.refreshInterval, fetchDashboardData]);
  
  // =============================================================================
  // ANALYTICS HELPERS
  // =============================================================================
  
  const getConversionRate = useCallback(() => {
    if (!state.stats || !state.referrals) return 0;
    
    const totalReferrals = state.referrals.length;
    const activeReferrals = state.referrals.filter(r => r.totalTrades > 0).length;
    
    return totalReferrals > 0 ? (activeReferrals / totalReferrals) * 100 : 0;
  }, [state.stats, state.referrals]);
  
  const getAverageTradeVolume = useCallback(() => {
    if (!state.stats || state.stats.totalTransactions === 0) return 0;
    
    return state.stats.totalVolume / state.stats.totalTransactions;
  }, [state.stats]);
  
  const getTopReferrals = useCallback((limit: number = 5) => {
    if (!state.referrals) return [];
    
    return [...state.referrals]
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, limit);
  }, [state.referrals]);
  
  // =============================================================================
  // CHART DATA PREPARATION
  // =============================================================================
  
  const getVolumeChartData = useCallback(() => {
    // In production, you would have time-series data
    // For now, returning mock data structure
    if (!state.stats) return [];
    
    return [
      { date: 'Mon', volume: state.stats.totalVolume * 0.1 },
      { date: 'Tue', volume: state.stats.totalVolume * 0.15 },
      { date: 'Wed', volume: state.stats.totalVolume * 0.12 },
      { date: 'Thu', volume: state.stats.totalVolume * 0.18 },
      { date: 'Fri', volume: state.stats.totalVolume * 0.2 },
      { date: 'Sat', volume: state.stats.totalVolume * 0.13 },
      { date: 'Sun', volume: state.stats.totalVolume * 0.12 }
    ];
  }, [state.stats]);
  
  const getCommissionChartData = useCallback(() => {
    if (!state.stats) return [];
    
    return [
      { label: 'Earned', value: state.stats.totalEarned },
      { label: 'Claimed', value: state.stats.totalClaimed },
      { label: 'Pending', value: state.stats.availableToClaim }
    ];
  }, [state.stats]);
  
  // =============================================================================
  // EXPORT DATA
  // =============================================================================
  
  const exportToCSV = useCallback(() => {
    if (!state.referrals || !state.stats) return;
    
    // Create CSV header
    const headers = ['User', 'Total Trades', 'Total Volume', 'Total Fees Generated'];
    
    // Create rows
    const rows = state.referrals.map(ref => [
      ref.user,
      ref.totalTrades,
      ref.totalVolume.toFixed(2),
      ref.totalFeesGenerated.toFixed(2)
    ]);
    
    // Add summary row
    rows.push([]);
    rows.push(['Summary', '', '', '']);
    rows.push(['Total Referrals', state.referrals.length, '', '']);
    rows.push(['Total Volume', '', state.stats.totalVolume.toFixed(2), '']);
    rows.push(['Total Earned', '', '', state.stats.totalEarned.toFixed(2)]);
    
    // Convert to CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referral-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [state.referrals, state.stats]);
  
  return {
    // State
    ...state,
    
    // Methods
    fetchDashboardData,
    claimCommission,
    copyReferralLink,
    exportToCSV,
    
    // Analytics
    getConversionRate,
    getAverageTradeVolume,
    getTopReferrals,
    getVolumeChartData,
    getCommissionChartData,
    
    // Utilities
    isConnected: wallet.connected,
    referrerAddress: wallet.publicKey?.toString()
  };
}