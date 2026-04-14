import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Token, Blockchain } from '@/types/crypto';
import { SecureWalletManager, WalletAccount } from '@/lib/wallet/SecureWalletManager';
import { SolanaWalletService, WalletPortfolio } from '@/services/solana/walletService';
import { AssetsService } from '@/services/assetsService';

interface WalletContextType {
  accounts: WalletAccount[];
  selectedAccount: WalletAccount | null;
  tokens: Token[];
  blockchains: Blockchain[];
  totalBalance: number;
  isLoading: boolean;
  isInitialized: boolean;
  portfolio: WalletPortfolio | null;
  refreshWallet: () => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  setSelectedAccount: (account: WalletAccount) => void;
  loadAccounts: () => Promise<void>;
  forceReloadAccounts: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<WalletAccount | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [blockchains, setBlockchains] = useState<Blockchain[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [portfolio, setPortfolio] = useState<WalletPortfolio | null>(null);
  const [solanaService] = useState(() => new SolanaWalletService());

  const loadAccounts = useCallback(async () => {
    try {
      const walletManager = SecureWalletManager.getInstance();
      const storedAccounts = await walletManager.getAccounts();

      if (storedAccounts.length > 0) {
        setAccounts(storedAccounts);
        const defaultAccount = storedAccounts.find(a => a.isDefault) || storedAccounts[0];
        setSelectedAccount(defaultAccount);

        const supportedBlockchains: Blockchain[] = [
          { id: 'solana', name: 'Solana', symbol: 'SOL', chain_id: null, rpc_url: '', explorer_url: '', logo_url: null, is_active: true, order_index: 1 },
        ];
        setBlockchains(supportedBlockchains);
      } else {
        setAccounts([]);
        setSelectedAccount(null);
        setBlockchains([]);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts([]);
      setSelectedAccount(null);
      setBlockchains([]);
    }
  }, []);

  const refreshPortfolio = useCallback(async () => {
    if (!selectedAccount) {
      setPortfolio(null);
      setTotalBalance(0);
      setTokens([]);
      return;
    }

    try {
      const userAssets = await AssetsService.getUserAssets(selectedAccount.address);
      const totalBalanceFromAssets = await AssetsService.getTotalBalance(selectedAccount.address);

      const tokensFromAssets: Token[] = userAssets.map((asset) => ({
        id: asset.token?.id || asset.token_id,
        blockchain_id: 'solana',
        contract_address: asset.token_id,
        symbol: asset.token?.symbol || '',
        name: asset.token?.name || '',
        decimals: 9,
        logo_url: asset.token?.logo_url || null,
        is_verified: true,
        coingecko_id: asset.token?.coingecko_id || null,
        balance: asset.quantity.toString(),
        balanceUSD: asset.current_value || 0,
      }));

      setTokens(tokensFromAssets);
      setTotalBalance(totalBalanceFromAssets);

      if (selectedAccount.blockchain === 'solana') {
        try {
          const walletPortfolio = await solanaService.getWalletPortfolio(selectedAccount.address);
          setPortfolio(walletPortfolio);
        } catch (error) {
          console.log('Solana RPC error (non-fatal):', error);
          setPortfolio(null);
        }
      }
    } catch (error) {
      console.error('Error refreshing portfolio:', error);
      setPortfolio(null);
      setTotalBalance(0);
      setTokens([]);
    }
  }, [selectedAccount, solanaService]);

  const forceReloadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const walletManager = SecureWalletManager.getInstance();
      const storedAccounts = await walletManager.getAccounts();

      setAccounts(storedAccounts);
      if (storedAccounts.length > 0) {
        const defaultAccount = storedAccounts.find(a => a.isDefault) || storedAccounts[0];
        setSelectedAccount(defaultAccount);
      } else {
        setSelectedAccount(null);
      }
    } catch (error) {
      console.error('Error force-reloading accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadAccounts();
      await refreshPortfolio();
    } catch (error) {
      console.error('Error refreshing wallet:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadAccounts, refreshPortfolio]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (mounted) {
        await loadAccounts();
        setIsInitialized(true);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [loadAccounts]);

  useEffect(() => {
    if (selectedAccount && selectedAccount.blockchain === 'solana') {
      refreshPortfolio();
    }
  }, [selectedAccount, refreshPortfolio]);

  return (
    <WalletContext.Provider
      value={{
        accounts,
        selectedAccount,
        tokens,
        blockchains,
        totalBalance,
        isLoading,
        isInitialized,
        portfolio,
        refreshWallet,
        refreshPortfolio,
        setSelectedAccount,
        loadAccounts,
        forceReloadAccounts,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
