import { supabase } from '@/lib/supabase';

export interface NFT {
  id: string;
  collection_id: string;
  token_id: string;
  name: string;
  description?: string;
  image_url: string;
  owner_address: string;
  metadata?: any;
  rarity_rank?: number;
  last_sale_price?: number;
  created_at: string;
}

export interface NFTCollection {
  id: string;
  contract_address: string;
  name: string;
  symbol?: string;
  description?: string;
  image_url?: string;
  floor_price?: number;
  total_supply?: number;
  is_verified: boolean;
  blockchain_id: string;
}

export class NFTService {
  static async getUserNFTs(walletAddress: string): Promise<NFT[]> {
    try {
      const mockNFTs: NFT[] = [
        {
          id: '1',
          collection_id: 'bored-ape',
          token_id: '1234',
          name: 'Bored Ape #1234',
          description: 'A rare Bored Ape with gold fur',
          image_url: 'https://images.pexels.com/photos/9214396/pexels-photo-9214396.jpeg?auto=compress&w=400',
          owner_address: walletAddress,
          rarity_rank: 234,
          last_sale_price: 45.5,
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          collection_id: 'azuki',
          token_id: '5678',
          name: 'Azuki #5678',
          description: 'Cool Azuki with rare traits',
          image_url: 'https://images.pexels.com/photos/8837386/pexels-photo-8837386.jpeg?auto=compress&w=400',
          owner_address: walletAddress,
          rarity_rank: 567,
          last_sale_price: 12.3,
          created_at: new Date().toISOString(),
        },
        {
          id: '3',
          collection_id: 'doodles',
          token_id: '9012',
          name: 'Doodle #9012',
          description: 'Colorful Doodle NFT',
          image_url: 'https://images.pexels.com/photos/10049787/pexels-photo-10049787.jpeg?auto=compress&w=400',
          owner_address: walletAddress,
          rarity_rank: 1234,
          last_sale_price: 8.7,
          created_at: new Date().toISOString(),
        },
        {
          id: '4',
          collection_id: 'pudgy',
          token_id: '3456',
          name: 'Pudgy Penguin #3456',
          description: 'Adorable penguin',
          image_url: 'https://images.pexels.com/photos/16218989/pexels-photo-16218989.jpeg?auto=compress&w=400',
          owner_address: walletAddress,
          rarity_rank: 789,
          last_sale_price: 5.2,
          created_at: new Date().toISOString(),
        },
        {
          id: '5',
          collection_id: 'cool-cats',
          token_id: '7890',
          name: 'Cool Cat #7890',
          description: 'Super cool cat',
          image_url: 'https://images.pexels.com/photos/8834074/pexels-photo-8834074.jpeg?auto=compress&w=400',
          owner_address: walletAddress,
          rarity_rank: 456,
          last_sale_price: 3.8,
          created_at: new Date().toISOString(),
        },
        {
          id: '6',
          collection_id: 'moonbirds',
          token_id: '2345',
          name: 'Moonbird #2345',
          description: 'Rare Moonbird',
          image_url: 'https://images.pexels.com/photos/16218877/pexels-photo-16218877.jpeg?auto=compress&w=400',
          owner_address: walletAddress,
          rarity_rank: 123,
          last_sale_price: 15.6,
          created_at: new Date().toISOString(),
        },
      ];

      return mockNFTs;
    } catch (error) {
      console.error('Error fetching NFTs:', error);
      return [];
    }
  }

  static async getNFTCollections(): Promise<NFTCollection[]> {
    const { data } = await supabase
      .from('nft_collections')
      .select('*')
      .eq('is_verified', true)
      .order('floor_price', { ascending: false })
      .limit(20);

    return (data as NFTCollection[]) || [];
  }

  static async getNFTById(nftId: string): Promise<NFT | null> {
    const mockNFT: NFT = {
      id: nftId,
      collection_id: 'bored-ape',
      token_id: '1234',
      name: 'Bored Ape #1234',
      description: 'A rare Bored Ape with gold fur and laser eyes. This piece is from the iconic Bored Ape Yacht Club collection.',
      image_url: 'https://images.pexels.com/photos/9214396/pexels-photo-9214396.jpeg?auto=compress&w=800',
      owner_address: '0x123...abc',
      rarity_rank: 234,
      last_sale_price: 45.5,
      metadata: {
        attributes: [
          { trait_type: 'Background', value: 'Purple' },
          { trait_type: 'Fur', value: 'Gold' },
          { trait_type: 'Eyes', value: 'Laser Eyes' },
          { trait_type: 'Mouth', value: 'Bored' },
          { trait_type: 'Clothes', value: 'Tuxedo' },
        ],
      },
      created_at: new Date().toISOString(),
    };

    return mockNFT;
  }

  static async getCollectionStats(collectionId: string) {
    return {
      floor_price: 45.5,
      volume_24h: 1234.5,
      volume_7d: 8765.4,
      total_supply: 10000,
      holders: 5678,
      listed: 234,
    };
  }

  static formatPrice(price: number): string {
    return `${price.toFixed(2)} ETH`;
  }

  static formatUSD(ethPrice: number, ethToUsd = 2000): string {
    return `$${(ethPrice * ethToUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
