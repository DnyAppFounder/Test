import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Token, Blockchain } from '@/types/crypto';
import { SecureWalletManager, WalletAccount } from '@/lib/wallet/SecureWalletManager';
import { ExternalWalletAdapter, ConnectedExternalWallet, ExternalWalletId } from '@/lib/wallet/ExternalWalletAdapter';
import { SolanaWalletService, WalletPortfolio } from '@/services/solana/walletService';
import { walletAssetLoader } from '@/services/walletAssetLoader';

interface WalletContextType {
  // Internal (mnemonic-derived) accounts
  accounts: WalletAccount[];
  selectedAccount: WalletAccount | null;
  setSelectedAccount: (account: WalletAccount) => void;

  // External (connected) wallet
  connectedWallet: ConnectedExternalWallet | null;
  connectExternalWallet: (id: ExternalWalletId) => Promise<void>;
  disconnectExternalWallet: () => Promise<void>;
  refreshConnectedWalletBalance: () => Promise<void>;

  // Portfolio data
  tokens: Token[];
  blockchains: Blockchain[];
  totalBalance: number;
  isLoading: boolean;
  isInitialized: boolean;
  portfolio: WalletPortfolio | null;

  // Actions
  refreshWallet: () => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  forceReloadAccounts: () => Promise<void>;

  // Helpers
  activeAddress: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<WalletAccount | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedExternalWallet | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [blockchains, setBlockchains] = useState<Blockchain[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [portfolio, setPortfolio] = useState<WalletPortfolio | null>(null);
  const [solanaService] = useState(() => new SolanaWalletService());

  // The address currently in use — either external wallet or internal account
  const activeAddress = connectedWallet?.address ?? selectedAccount?.address ?? null;

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

  // Restore any previously connected external wallet
  const restoreExternalWallet = useCallback(async () => {
    const restored = await ExternalWalletAdapter.restoreSession();
    if (restored) {
      setConnectedWallet(restored);
    }
  }, []);

  const connectExternalWallet = useCallback(async (id: ExternalWalletId) => {
    setIsLoading(true);
    try {
      const wallet = await ExternalWalletAdapter.connectExtension(id);
      setConnectedWallet(wallet);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectExternalWallet = useCallback(async () => {
    if (connectedWallet) {
      await ExternalWalletAdapter.disconnectExtension(connectedWallet.id);
      setConnectedWallet(null);
    }
  }, [connectedWallet]);

  const refreshConnectedWalletBalance = useCallback(async () => {
    if (!connectedWallet) return;
    const balance = await ExternalWalletAdapter.getBalance(connectedWallet.address);
    setConnectedWallet(prev => prev ? { ...prev, balance } : null);
  }, [connectedWallet]);

  const refreshPortfolio = useCallback(async () => {
    const address = connectedWallet?.address ?? selectedAccount?.address;
    if (!address) {
      setPortfolio(null);
      setTotalBalance(0);
      setTokens([]);
      return;
    }

    try {
      const result = await walletAssetLoader.loadSolanaWalletAssets(address);

      const tokensFromChain: Token[] = result.assets.map((asset) => ({
        id: asset.id,
        blockchain_id: 'solana',
        contract_address: asset.address,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        logo_url: asset.logoUrl ?? null,
        is_verified: asset.verified,
        coingecko_id: null,
        balance: asset.balance,
        balanceUSD: asset.value,
      }));

      setTokens(tokensFromChain);
      setTotalBalance(result.totalValue);

      try {
        const walletPortfolio = await solanaService.getWalletPortfolio(address);
        setPortfolio(walletPortfolio);
      } catch (error) {
        console.log('Solana RPC error (non-fatal):', error);
        setPortfolio(null);
      }
    } catch (error) {
      console.error('Error refreshing portfolio:', error);
      setPortfolio(null);
      setTotalBalance(0);
      setTokens([]);
    }
  }, [selectedAccount, connectedWallet, solanaService]);

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
      if (connectedWallet) {
        await refreshConnectedWalletBalance();
      }
    } catch (error) {
      console.error('Error refreshing wallet:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadAccounts, refreshPortfolio, connectedWallet, refreshConnectedWalletBalance]);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      if (mounted) {
        await loadAccounts();
        await restoreExternalWallet();
        setIsInitialized(true);
      }
    };
    initialize();
    return () => { mounted = false; };
  }, [loadAccounts, restoreExternalWallet]);

  useEffect(() => {
    if (activeAddress) {
      refreshPortfolio();
    }
  }, [activeAddress, refreshPortfolio]);

  return (
    <WalletContext.Provider
      value={{
        accounts,
        selectedAccount,
        setSelectedAccount,
        connectedWallet,
        connectExternalWallet,
        disconnectExternalWallet,
        refreshConnectedWalletBalance,
        tokens,
        blockchains,
        totalBalance,
        isLoading,
        isInitialized,
        portfolio,
        refreshWallet,
        refreshPortfolio,
        loadAccounts,
        forceReloadAccounts,
        activeAddress,
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
