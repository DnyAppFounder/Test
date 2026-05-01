import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Token, Blockchain } from '@/types/crypto';
import { SecureWalletManager, WalletAccount } from '@/lib/wallet/SecureWalletManager';
import { ExternalWalletAdapter, ConnectedExternalWallet, ExternalWalletId } from '@/lib/wallet/ExternalWalletAdapter';
import { walletAssetLoader } from '@/services/walletAssetLoader';

export type WalletType = 'created' | 'imported' | 'connected';

/**
 * Unified wallet entry — represents any wallet regardless of type.
 * Internal wallets (created/imported) have accountIndex and come from SecureWalletManager.
 * Connected wallets (Phantom/Backpack/Solflare) have a provider id.
 */
export interface UnifiedWallet {
  id: string;
  type: WalletType;
  name: string;
  address: string;
  publicKey: string;
  isActive: boolean;
  // For connected wallets
  providerId?: ExternalWalletId;
  providerIcon?: string;
  // For internal wallets
  accountIndex?: number;
  blockchain?: 'solana';
}

interface WalletContextType {
  // Unified wallet list — ALL wallets in one place
  allWallets: UnifiedWallet[];
  activeWallet: UnifiedWallet | null;
  setActiveWallet: (wallet: UnifiedWallet) => void;

  // Legacy aliases (kept for backward compatibility with existing screens)
  accounts: WalletAccount[];
  selectedAccount: WalletAccount | null;
  setSelectedAccount: (account: WalletAccount) => void;
  connectedWallet: ConnectedExternalWallet | null;
  connectExternalWallet: (id: ExternalWalletId) => Promise<void>;
  disconnectExternalWallet: () => Promise<void>;

  // Portfolio data (same for all wallet types)
  tokens: Token[];
  blockchains: Blockchain[];
  totalBalance: number;
  isLoading: boolean;
  isInitialized: boolean;
  portfolioError: string | null;
  isPortfolioLoading: boolean;

  // Actions
  refreshWallet: () => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  forceReloadAccounts: () => Promise<void>;

  // Full logout — clears ALL wallet state
  fullLogout: () => Promise<void>;

  // The address currently in use
  activeAddress: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function walletAccountToUnified(acc: WalletAccount, isActive: boolean): UnifiedWallet {
  return {
    id: acc.id,
    type: 'created',
    name: acc.name,
    address: acc.address,
    publicKey: acc.publicKey || acc.address,
    isActive,
    accountIndex: acc.accountIndex,
    blockchain: acc.blockchain,
  };
}

function connectedToUnified(cw: ConnectedExternalWallet, isActive: boolean): UnifiedWallet {
  return {
    id: `connected-${cw.id}`,
    type: 'connected',
    name: cw.name,
    address: cw.address,
    publicKey: cw.publicKey,
    isActive,
    providerId: cw.id,
    providerIcon: cw.icon,
  };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState<WalletAccount | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedExternalWallet | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [blockchains, setBlockchains] = useState<Blockchain[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);

  // Connected wallet takes priority as the active address
  const activeAddress = connectedWallet?.address ?? selectedAccount?.address ?? null;

  // Build unified wallet list: connected wallet first (if any), then internal accounts
  const allWallets: UnifiedWallet[] = [
    ...(connectedWallet ? [connectedToUnified(connectedWallet, true)] : []),
    ...accounts.map((acc) =>
      walletAccountToUnified(acc, !connectedWallet && acc.id === selectedAccount?.id)
    ),
  ];

  const activeWallet: UnifiedWallet | null = allWallets.find((w) => w.isActive) ?? null;

  const setActiveWallet = useCallback((wallet: UnifiedWallet) => {
    if (wallet.type === 'connected') {
      // Re-activate connected wallet if somehow de-selected — no-op if already active
    } else {
      // Switch to an internal account; disconnect any external wallet session
      const acc = accounts.find((a) => a.id === wallet.id);
      if (acc) {
        setSelectedAccountState(acc);
        if (connectedWallet) {
          ExternalWalletAdapter.disconnectExtension(connectedWallet.id).catch(() => {});
          setConnectedWallet(null);
        }
      }
    }
  }, [accounts, connectedWallet]);

  const setSelectedAccount = useCallback((account: WalletAccount) => {
    setSelectedAccountState(account);
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const walletManager = SecureWalletManager.getInstance();
      const storedAccounts = await walletManager.getAccounts();

      if (storedAccounts.length > 0) {
        setAccounts(storedAccounts);
        setSelectedAccountState((prev) => {
          if (prev && storedAccounts.find((a) => a.id === prev.id)) return prev;
          return storedAccounts.find((a) => a.isDefault) || storedAccounts[0];
        });

        setBlockchains([
          { id: 'solana', name: 'Solana', symbol: 'SOL', chain_id: null, rpc_url: '', explorer_url: '', logo_url: null, is_active: true, order_index: 1 },
        ]);
      } else {
        setAccounts([]);
        setSelectedAccountState(null);
        setBlockchains([]);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts([]);
      setSelectedAccountState(null);
      setBlockchains([]);
    }
  }, []);

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

  const fullLogout = useCallback(async () => {
    // Disconnect any external wallet session from storage
    if (connectedWallet) {
      await ExternalWalletAdapter.disconnectExtension(connectedWallet.id).catch(() => {});
    } else {
      // Also clear any stale external wallet session in storage even if not in memory
      await AsyncStorage.removeItem('external_wallet_connected').catch(() => {});
    }
    // Clear SecureWalletManager in-memory mnemonic
    SecureWalletManager.getInstance().lockWallet();
    // Clear all state atomically
    setConnectedWallet(null);
    setAccounts([]);
    setSelectedAccountState(null);
    setTokens([]);
    setBlockchains([]);
    setTotalBalance(0);
    setPortfolioError(null);
    setIsPortfolioLoading(false);
  }, [connectedWallet]);

  const applyPortfolioResult = useCallback((result: { assets: any[]; totalValue: number }) => {
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
  }, []);

  const refreshPortfolio = useCallback(async () => {
    const address = connectedWallet?.address ?? selectedAccount?.address;
    if (!address) {
      setTotalBalance(0);
      setTokens([]);
      return;
    }

    try {
      console.log('[WalletContext] Refreshing portfolio (cache cleared) for:', address);
      const result = await walletAssetLoader.refreshWalletAssets('solana', address);
      applyPortfolioResult(result);
    } catch (error) {
      console.error('[WalletContext] Error refreshing portfolio:', error);
    }
  }, [selectedAccount, connectedWallet, applyPortfolioResult]);

  const forceReloadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const walletManager = SecureWalletManager.getInstance();
      const storedAccounts = await walletManager.getAccounts();

      setAccounts(storedAccounts);
      if (storedAccounts.length > 0) {
        setSelectedAccountState((prev) => {
          if (prev && storedAccounts.find((a) => a.id === prev.id)) return prev;
          return storedAccounts.find((a) => a.isDefault) || storedAccounts[0];
        });
      } else {
        setSelectedAccountState(null);
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

  // Initialize: load internal accounts and restore external wallet session
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

  // Load portfolio whenever the active address changes
  useEffect(() => {
    if (activeAddress) {
      console.log('[WalletContext] Active wallet:', activeAddress);
      setIsPortfolioLoading(true);
      setPortfolioError(null);
      walletAssetLoader.loadSolanaWalletAssets(activeAddress).then((result) => {
        if (result.error) {
          console.error('[WalletContext] Portfolio error:', result.error);
          setPortfolioError(result.error);
        }
        applyPortfolioResult(result);
      }).catch((err) => {
        console.error('[WalletContext] Portfolio load error:', err);
        setPortfolioError(err?.message || 'Failed to load assets');
      }).finally(() => {
        setIsPortfolioLoading(false);
      });
    } else {
      setTokens([]);
      setTotalBalance(0);
      setPortfolioError(null);
    }
  }, [activeAddress, applyPortfolioResult]);

  // Auto-refresh every 45 seconds while a wallet is connected
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    if (activeAddress) {
      refreshIntervalRef.current = setInterval(() => {
        walletAssetLoader.loadSolanaWalletAssets(activeAddress).then(applyPortfolioResult).catch(() => {});
      }, 45000);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [activeAddress, applyPortfolioResult]);

  // Refresh when app returns to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && activeAddress) {
        console.log('[WalletContext] App foregrounded, refreshing assets');
        walletAssetLoader.loadSolanaWalletAssets(activeAddress).then(applyPortfolioResult).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [activeAddress, applyPortfolioResult]);

  return (
    <WalletContext.Provider
      value={{
        allWallets,
        activeWallet,
        setActiveWallet,
        accounts,
        selectedAccount,
        setSelectedAccount,
        connectedWallet,
        connectExternalWallet,
        disconnectExternalWallet,
        tokens,
        blockchains,
        totalBalance,
        isLoading,
        isInitialized,
        portfolioError,
        isPortfolioLoading,
        refreshWallet,
        refreshPortfolio,
        loadAccounts,
        forceReloadAccounts,
        fullLogout,
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
