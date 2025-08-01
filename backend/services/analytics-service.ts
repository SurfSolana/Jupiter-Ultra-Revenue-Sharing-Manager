/**
 * Analytics Service
 * Provides platform and referrer analytics
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { 
  PlatformFeeEscrowClient,
  ReferrerStatsAccount,
  FeeEscrowAccount,
  PartnerStatus,
  getFeeBreakdown,
  PlatformAnalytics
} from '../../sdk';

export interface TopReferrer {
  address: string;
  totalTransactions: number;
  totalVolume: number;
  totalEarned: number;
  totalClaimed: number;
  pendingCommission: number;
  conversionRate: number;
}

export interface RecentTransaction {
  escrow: string;
  user: string;
  referrer: string;
  tradeAmount: number;
  feeCharged: number;
  timestamp: Date;
  status: 'pending' | 'completed' | 'disputed' | 'expired';
}

export interface VolumeStats {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
}

export interface ReferralData {
  user: string;
  referrer: string;
  totalTrades: number;
  totalVolume: number;
  totalFeesGenerated: number;
  firstTradeDate: Date;
  lastTradeDate: Date;
}

export class AnalyticsService {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  
  constructor(
    private client: PlatformFeeEscrowClient,
    private connection: Connection,
    private cacheTimeout: number = 300000 // 5 minutes
  ) {}
  
  // =============================================================================
  // FEE CALCULATIONS
  // =============================================================================
  
  calculateFeeBreakdown(tradeAmount: number, tier: PartnerStatus = 'default') {
    return getFeeBreakdown(tradeAmount, tier);
  }
  
  // =============================================================================
  // PLATFORM ANALYTICS
  // =============================================================================
  
  async getPlatformAnalytics(): Promise<PlatformAnalytics> {
    const cacheKey = 'platform_analytics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      // Get all referrer stats accounts
      const allReferrerStats = await this.getAllReferrerStats();
      
      // Get all escrows
      const allEscrows = await this.getAllEscrows();
      
      // Calculate totals
      const totalTransactions = allReferrerStats.reduce(
        (sum, stats) => sum + stats.account.totalTransactions.toNumber(), 0
      );
      
      const totalVolume = allReferrerStats.reduce(
        (sum, stats) => sum + stats.account.confirmedVolume.toNumber() / 1e6, 0
      );
      
      const totalCommissionsPaid = allReferrerStats.reduce(
        (sum, stats) => sum + stats.account.totalCommissionClaimed.toNumber() / 1e6, 0
      );
      
      // Calculate platform revenue
      const completedEscrows = allEscrows.filter(e => e.account.isCompleted);
      const totalPlatformRevenue = completedEscrows.reduce((sum, escrow) => {
        const platformShare = escrow.account.actualFeeCharged
          .sub(escrow.account.referrerCommission)
          .toNumber() / 1e6;
        return sum + platformShare;
      }, 0);
      
      const activeEscrows = allEscrows.filter(
        e => !e.account.isCompleted && !e.account.isDisputed
      ).length;
      
      const analytics: PlatformAnalytics = {
        totalTransactions,
        totalVolume,
        totalCommissionsPaid,
        totalPlatformRevenue,
        activeReferrers: allReferrerStats.length,
        activeEscrows
      };
      
      this.setCache(cacheKey, analytics);
      return analytics;
      
    } catch (error) {
      console.error('Error fetching platform analytics:', error);
      throw error;
    }
  }
  
  // =============================================================================
  // REFERRER ANALYTICS
  // =============================================================================
  
  async getTopReferrers(limit: number = 10): Promise<TopReferrer[]> {
    const cacheKey = `top_referrers_${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const allReferrerStats = await this.getAllReferrerStats();
      
      const referrers: TopReferrer[] = allReferrerStats.map(({ account }) => ({
        address: account.referrer.toString(),
        totalTransactions: account.totalTransactions.toNumber(),
        totalVolume: account.confirmedVolume.toNumber() / 1e6,
        totalEarned: account.totalCommissionEarned.toNumber() / 1e6,
        totalClaimed: account.totalCommissionClaimed.toNumber() / 1e6,
        pendingCommission: account.pendingCommission.toNumber() / 1e6,
        conversionRate: account.totalTransactions.toNumber() > 0 ? 100 : 0 // Simplified
      }));
      
      // Sort by total earned
      referrers.sort((a, b) => b.totalEarned - a.totalEarned);
      
      const topReferrers = referrers.slice(0, limit);
      this.setCache(cacheKey, topReferrers);
      
      return topReferrers;
      
    } catch (error) {
      console.error('Error fetching top referrers:', error);
      throw error;
    }
  }
  
  async getReferrerReferrals(referrer: PublicKey): Promise<ReferralData[]> {
    const cacheKey = `referrer_referrals_${referrer.toString()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      // Get all escrows where this address is the referrer
      const referrerEscrows = await this.getEscrowsByReferrer(referrer);
      
      // Group by user
      const userMap = new Map<string, ReferralData>();
      
      for (const { account: escrow } of referrerEscrows) {
        const userKey = escrow.user.toString();
        
        if (!userMap.has(userKey)) {
          userMap.set(userKey, {
            user: userKey,
            referrer: referrer.toString(),
            totalTrades: 0,
            totalVolume: 0,
            totalFeesGenerated: 0,
            firstTradeDate: new Date(),
            lastTradeDate: new Date()
          });
        }
        
        const userData = userMap.get(userKey)!;
        userData.totalTrades += 1;
        userData.totalVolume += escrow.tradeAmount.toNumber() / 1e6;
        userData.totalFeesGenerated += escrow.actualFeeCharged.toNumber() / 1e6;
        
        // Update dates (would need slot-to-timestamp conversion in production)
        // For now, using current date as placeholder
      }
      
      const referrals = Array.from(userMap.values());
      this.setCache(cacheKey, referrals);
      
      return referrals;
      
    } catch (error) {
      console.error('Error fetching referrer referrals:', error);
      throw error;
    }
  }
  
  // =============================================================================
  // TRANSACTION HISTORY
  // =============================================================================
  
  async getRecentTransactions(limit: number = 20): Promise<RecentTransaction[]> {
    const cacheKey = `recent_transactions_${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const allEscrows = await this.getAllEscrows();
      
      // Sort by creation (would use actual timestamps in production)
      const sortedEscrows = allEscrows.sort((a, b) => {
        // Using seed as a proxy for creation time
        return b.account.seed.toNumber() - a.account.seed.toNumber();
      });
      
      const recentTxs: RecentTransaction[] = sortedEscrows
        .slice(0, limit)
        .map(({ publicKey, account: escrow }) => ({
          escrow: publicKey.toString(),
          user: escrow.user.toString(),
          referrer: escrow.referrer.toString(),
          tradeAmount: escrow.tradeAmount.toNumber() / 1e6,
          feeCharged: escrow.actualFeeCharged.toNumber() / 1e6,
          timestamp: new Date(), // Placeholder
          status: this.getEscrowStatus(escrow)
        }));
      
      this.setCache(cacheKey, recentTxs);
      return recentTxs;
      
    } catch (error) {
      console.error('Error fetching recent transactions:', error);
      throw error;
    }
  }
  
  // =============================================================================
  // VOLUME STATISTICS
  // =============================================================================
  
  async getVolumeStats(): Promise<VolumeStats> {
    const cacheKey = 'volume_stats';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      // In production, you would filter by timestamp
      // For now, returning mock data structure
      const allEscrows = await this.getAllEscrows();
      const totalVolume = allEscrows.reduce(
        (sum, escrow) => sum + escrow.account.tradeAmount.toNumber() / 1e6, 0
      );
      
      const stats: VolumeStats = {
        daily: totalVolume * 0.1,    // Mock: 10% is daily
        weekly: totalVolume * 0.3,   // Mock: 30% is weekly
        monthly: totalVolume * 0.7,  // Mock: 70% is monthly
        total: totalVolume
      };
      
      this.setCache(cacheKey, stats);
      return stats;
      
    } catch (error) {
      console.error('Error fetching volume stats:', error);
      throw error;
    }
  }
  
  // =============================================================================
  // LOGGING
  // =============================================================================
  
  async logSuccessfulClaim(data: {
    escrow: string;
    platformRevenue: number;
    referrerCommission: number;
    timestamp: string;
  }) {
    // In production, log to database or analytics service
    console.log('Successful claim logged:', data);
    
    // Invalidate relevant caches
    this.invalidateCache('platform_analytics');
    this.invalidateCache('recent_transactions');
  }
  
  // =============================================================================
  // HELPER METHODS
  // =============================================================================
  
  private async getAllReferrerStats() {
    // This would use proper filtering in production
    return this.client.program.account.referrerStats.all();
  }
  
  private async getAllEscrows() {
    // This would use proper filtering in production
    return this.client.program.account.feeEscrowState.all();
  }
  
  private async getEscrowsByReferrer(referrer: PublicKey) {
    return this.client.program.account.feeEscrowState.all([
      {
        memcmp: {
          offset: 8 + 32 + 32, // After discriminator + user + platform
          bytes: referrer.toBase58(),
        }
      }
    ]);
  }
  
  private getEscrowStatus(escrow: FeeEscrowAccount): RecentTransaction['status'] {
    if (escrow.isCompleted) return 'completed';
    if (escrow.isDisputed) return 'disputed';
    
    const currentSlot = this.connection.getSlot();
    // Would check against actual current slot in production
    // if (currentSlot > escrow.expirationSlot.toNumber()) return 'expired';
    
    return 'pending';
  }
  
  // =============================================================================
  // CACHE MANAGEMENT
  // =============================================================================
  
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  private setCache(key: string, data: any) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.cacheTimeout
    });
  }
  
  private invalidateCache(keyPrefix?: string) {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }
}