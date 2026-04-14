import { supabase } from '@/lib/supabase';
import { SocialService } from './socialService';

export interface PriceAlert {
  id: string;
  user_id: string;
  token_id: string;
  token_symbol: string;
  token_name: string;
  alert_type: 'above' | 'below';
  target_price: number;
  is_active: boolean;
  triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

export class AlertsService {
  static supabase = supabase;

  static async createAlert(
    walletAddress: string,
    tokenId: string,
    tokenSymbol: string,
    tokenName: string,
    alertType: 'above' | 'below',
    targetPrice: number
  ): Promise<PriceAlert | null> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return null;

      const { data, error } = await this.supabase
        .from('price_alerts')
        .insert({
          user_id: profile.id,
          token_id: tokenId,
          token_symbol: tokenSymbol,
          token_name: tokenName,
          alert_type: alertType,
          target_price: targetPrice,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating alert:', error);
      return null;
    }
  }

  static async getUserAlerts(
    walletAddress: string,
    activeOnly = false
  ): Promise<PriceAlert[]> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return [];

      let query = this.supabase
        .from('price_alerts')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (activeOnly) {
        query = query.eq('is_active', true).eq('triggered', false);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting alerts:', error);
      return [];
    }
  }

  static async getTokenAlerts(
    walletAddress: string,
    tokenId: string
  ): Promise<PriceAlert[]> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return [];

      const { data, error } = await this.supabase
        .from('price_alerts')
        .select('*')
        .eq('user_id', profile.id)
        .eq('token_id', tokenId)
        .eq('is_active', true)
        .eq('triggered', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting token alerts:', error);
      return [];
    }
  }

  static async toggleAlert(alertId: string, isActive: boolean): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('price_alerts')
        .update({ is_active: isActive })
        .eq('id', alertId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error toggling alert:', error);
      return false;
    }
  }

  static async deleteAlert(alertId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('price_alerts')
        .delete()
        .eq('id', alertId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting alert:', error);
      return false;
    }
  }

  static async checkAlerts(
    walletAddress: string,
    currentPrices: Map<string, number>
  ): Promise<PriceAlert[]> {
    try {
      const alerts = await this.getUserAlerts(walletAddress, true);
      const triggeredAlerts: PriceAlert[] = [];

      for (const alert of alerts) {
        const currentPrice = currentPrices.get(alert.token_id);
        if (!currentPrice) continue;

        const shouldTrigger =
          (alert.alert_type === 'above' && currentPrice >= alert.target_price) ||
          (alert.alert_type === 'below' && currentPrice <= alert.target_price);

        if (shouldTrigger) {
          await this.supabase
            .from('price_alerts')
            .update({
              triggered: true,
              triggered_at: new Date().toISOString(),
              is_active: false,
            })
            .eq('id', alert.id);

          triggeredAlerts.push(alert);
        }
      }

      return triggeredAlerts;
    } catch (error) {
      console.error('Error checking alerts:', error);
      return [];
    }
  }
}
