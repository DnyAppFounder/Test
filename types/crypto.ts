export interface Blockchain {
  id: string;
  name: string;
  symbol: string;
  chain_id: string | null;
  rpc_url: string;
  explorer_url: string;
  logo_url: string | null;
  is_active: boolean;
  order_index: number;
}

export interface Token {
  id: string;
  blockchain_id: string;
  contract_address: string | null;
  symbol: string;
  name: string;
  decimals: number;
  logo_url: string | null;
  is_verified: boolean;
  coingecko_id: string | null;
  balance?: string;
  balanceUSD?: number;
}

export interface TokenPrice {
  id: string;
  token_id: string;
  price_usd: number;
  price_eur: number;
  price_change_24h: number;
  market_cap: number;
  volume_24h: number;
  updated_at: string;
}

export interface DApp {
  id: string;
  name: string;
  description: string | null;
  url: string;
  logo_url: string | null;
  category: string;
  blockchain_id: string | null;
  is_featured: boolean;
  order_index: number;
}

export interface NFTCollection {
  id: string;
  blockchain_id: string;
  contract_address: string;
  name: string;
  symbol: string | null;
  description: string | null;
  image_url: string | null;
  floor_price: number | null;
  total_supply: number | null;
  is_verified: boolean;
}

export interface NFT {
  id: string;
  collection_id: string;
  token_id: string;
  name: string;
  image_url: string;
  attributes: Record<string, any>;
}

export interface WalletAccount {
  id: string;
  name: string;
  address: string;
  blockchain_id: string;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'swap';
  blockchain_id: string;
  from: string;
  to: string;
  amount: string;
  token: Token;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: string;
  hash?: string;
  fee?: string;
}
