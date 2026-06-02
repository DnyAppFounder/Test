import { BlockType, PageType } from '@/services/pageStudioService';

export interface BlockTemplate {
  block_type: BlockType;
  sort_order: number;
  content_json: Record<string, any>;
  style_json: Record<string, any>;
  animation_json: Record<string, any>;
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  type: PageType;
  theme: string;
  emoji: string;
  global_settings: Record<string, any>;
  blocks: BlockTemplate[];
}

export const BLOCK_TYPE_INFO: Record<string, { label: string; description: string; emoji: string }> = {
  hero: { label: 'Hero Section', description: 'Main header with title, subtitle, and call-to-action buttons', emoji: '🦸' },
  text: { label: 'Text Block', description: 'Heading and paragraph content', emoji: '📝' },
  button: { label: 'Button', description: 'Standalone clickable button', emoji: '🔘' },
  social_links: { label: 'Social Links', description: 'Social media platform links', emoji: '🔗' },
  token_info: { label: 'Token Info', description: 'Token details and metrics', emoji: '💎' },
  live_chart: { label: 'Live Chart', description: 'Real-time price chart', emoji: '📈' },
  buy_widget: { label: 'Buy Widget', description: 'Token purchase interface', emoji: '🛒' },
  roadmap: { label: 'Roadmap', description: 'Project milestones and timeline', emoji: '🗺️' },
  tokenomics: { label: 'Tokenomics', description: 'Token allocation and distribution', emoji: '📊' },
  team: { label: 'Team', description: 'Team members and profiles', emoji: '👥' },
  faq: { label: 'FAQ', description: 'Frequently asked questions', emoji: '❓' },
  gallery: { label: 'Gallery', description: 'Image gallery or NFT collection showcase', emoji: '🖼️' },
  video: { label: 'Video', description: 'Embedded video content', emoji: '🎥' },
  countdown: { label: 'Countdown', description: 'Countdown timer to event', emoji: '⏱️' },
  whitelist_form: { label: 'Whitelist Form', description: 'User whitelist signup form', emoji: '📝' },
  claim: { label: 'Claim', description: 'Token claim interface', emoji: '🎁' },
  media_kit: { label: 'Media Kit', description: 'Press and media resources', emoji: '📦' },
  announcement: { label: 'Announcement', description: 'Important announcement banner', emoji: '📢' },
  embed: { label: 'Embed', description: 'Embedded external content', emoji: '🔲' },
  qr_code: { label: 'QR Code', description: 'Scannable QR code', emoji: '📱' },
  footer: { label: 'Footer', description: 'Page footer with links and info', emoji: '🦶' },
  custom_section: { label: 'Custom Section', description: 'Custom HTML or content section', emoji: '⚙️' },
};

const defaultStyleJson = {
  padding: '20px',
  textAlign: 'center',
  backgroundColor: 'transparent',
};

const defaultAnimationJson = {
  type: 'none',
  duration: 0,
  delay: 0,
};

export const PAGE_TEMPLATES: PageTemplate[] = [
  // 1. Blank Page
  {
    id: 'blank_page',
    name: 'Blank Page',
    description: 'Start with a completely empty canvas',
    type: 'general',
    theme: 'light',
    emoji: '🎨',
    global_settings: {
      showNavbar: false,
      showFooter: false,
      backgroundColor: '#ffffff',
      accentColor: '#4B8FFF',
    },
    blocks: [],
  },

  // 2. Meme Coin Landing Page
  {
    id: 'meme_coin_landing',
    name: 'Meme Coin Landing Page',
    description: 'Perfect for launching a meme token with community focus',
    type: 'token',
    theme: 'dark',
    emoji: '🚀',
    global_settings: {
      backgroundColor: '#0A0E27',
      textColor: '#FFFFFF',
      accentColor: '#00D4FF',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Welcome to MemeToken',
          subtitle: 'The Community-Driven Meme Coin',
          description: 'Join the movement. This is more than a token, it\'s a lifestyle. Edit this with your meme coin\'s story.',
          primaryButtonText: 'Buy Now',
          primaryButtonUrl: '',
          primaryButtonAction: 'buy_token',
          secondaryButtonText: 'View Chart',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_chart',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'token_info',
        sort_order: 2,
        content_json: {
          name: 'MemeToken',
          symbol: 'MEME',
          mint: '',
          supply: '1,000,000,000',
          decimals: '9',
          chain: 'Solana',
          logoUrl: '',
          showPrice: true,
          showMcap: true,
          showVolume: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'buy_widget',
        sort_order: 3,
        content_json: {
          title: 'Buy MemeToken',
          description: 'Get your tokens now',
          dexes: ['raydium', 'jupiter'],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 4,
        content_json: {
          links: [
            { platform: 'x_twitter', url: '' },
            { platform: 'telegram', url: '' },
            { platform: 'discord', url: '' },
          ],
          style: 'icon-row',
          title: 'Join Our Community',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'faq',
        sort_order: 5,
        content_json: {
          title: 'Frequently Asked Questions',
          items: [
            {
              question: 'Is this token safe?',
              answer: 'Edit this to describe your security measures and audits.',
            },
            {
              question: 'How do I buy tokens?',
              answer: 'You can purchase on Raydium, Jupiter, or other decentralized exchanges.',
            },
            {
              question: 'What\'s the total supply?',
              answer: 'Edit this with your tokenomics information.',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 6,
        content_json: {
          links: [
            { label: 'Home', url: '#' },
            { label: 'Terms', url: '#' },
            { label: 'Privacy', url: '#' },
          ],
          socials: [],
          disclaimer: 'This is not financial advice. Always do your own research before investing.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 3. Utility Token Website
  {
    id: 'utility_token_website',
    name: 'Utility Token Website',
    description: 'Professional token site for utility and infrastructure projects',
    type: 'token',
    theme: 'light',
    emoji: '⚙️',
    global_settings: {
      backgroundColor: '#F5F7FA',
      textColor: '#1A1A1A',
      accentColor: '#5865F2',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Utility Token Platform',
          subtitle: 'Infrastructure for Tomorrow',
          description: 'Build, scale, and manage with our utility token ecosystem.',
          primaryButtonText: 'Get Started',
          primaryButtonUrl: '',
          primaryButtonAction: 'buy_token',
          secondaryButtonText: 'Read Whitepaper',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: '#E8EAFF' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'token_info',
        sort_order: 2,
        content_json: {
          name: 'Utility Token',
          symbol: 'UTIL',
          mint: '',
          supply: '100,000,000',
          decimals: '6',
          chain: 'Solana',
          logoUrl: '',
          showPrice: true,
          showMcap: true,
          showVolume: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'roadmap',
        sort_order: 3,
        content_json: {
          title: 'Development Roadmap',
          items: [
            {
              title: 'Phase 1',
              description: 'Foundation & Token Launch',
              status: 'completed',
              date: 'Q1 2025',
            },
            {
              title: 'Phase 2',
              description: 'Smart Contracts & Staking',
              status: 'active',
              date: 'Q2 2025',
            },
            {
              title: 'Phase 3',
              description: 'Ecosystem Integration',
              status: 'upcoming',
              date: 'Q3 2025',
            },
            {
              title: 'Phase 4',
              description: 'Global Expansion',
              status: 'upcoming',
              date: 'Q4 2025',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'tokenomics',
        sort_order: 4,
        content_json: {
          title: 'Tokenomics',
          items: [
            { label: 'Community', percentage: 40, color: '#4B8FFF' },
            { label: 'Team', percentage: 20, color: '#5865F2' },
            { label: 'Development', percentage: 25, color: '#00D4FF' },
            { label: 'Marketing', percentage: 15, color: '#FF6B6B' },
          ],
          vestingSchedule: 'Tokens vest over 24 months',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'team',
        sort_order: 5,
        content_json: {
          title: 'Meet the Team',
          members: [
            {
              name: 'Founder & CEO',
              role: 'Vision & Strategy',
              image: '',
            },
            {
              name: 'CTO',
              role: 'Technology Lead',
              image: '',
            },
            {
              name: 'Head of Community',
              role: 'Community Management',
              image: '',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'faq',
        sort_order: 6,
        content_json: {
          title: 'Questions?',
          items: [
            {
              question: 'What is the utility of this token?',
              answer: 'Edit this to explain your token\'s use cases and benefits.',
            },
            {
              question: 'Where can I buy?',
              answer: 'Available on major decentralized exchanges.',
            },
            {
              question: 'Is there staking?',
              answer: 'Yes, edit this with staking details and APY.',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 7,
        content_json: {
          links: [
            { label: 'Whitepaper', url: '#' },
            { label: 'Docs', url: '#' },
            { label: 'Contact', url: '#' },
          ],
          socials: [],
          disclaimer: 'Not investment advice.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 4. Presale / Launch Countdown
  {
    id: 'presale_countdown',
    name: 'Presale / Launch Countdown',
    description: 'Build anticipation with a countdown timer for your launch',
    type: 'countdown',
    theme: 'dark',
    emoji: '⏰',
    global_settings: {
      backgroundColor: '#1A1A2E',
      textColor: '#FFFFFF',
      accentColor: '#FF6B6B',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Token Launch Countdown',
          subtitle: 'Something Amazing is Coming',
          description: 'Join us for the official token launch. Limited presale opportunities available.',
          primaryButtonText: 'Join Whitelist',
          primaryButtonUrl: '',
          primaryButtonAction: 'scroll_to_block',
          secondaryButtonText: 'Learn More',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(to right, #FF6B6B, #FF8E8E)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'countdown',
        sort_order: 2,
        content_json: {
          title: 'Launch In:',
          targetDate: '2025-07-15T00:00:00Z',
          showDays: true,
          showHours: true,
          showMinutes: true,
          showSeconds: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'token_info',
        sort_order: 3,
        content_json: {
          name: 'Launch Token',
          symbol: 'LAUNCH',
          mint: '',
          supply: '500,000,000',
          decimals: '9',
          chain: 'Solana',
          logoUrl: '',
          showPrice: false,
          showMcap: false,
          showVolume: false,
          presalePrice: '0.001 SOL',
          launchPrice: '0.005 SOL',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'whitelist_form',
        sort_order: 4,
        content_json: {
          title: 'Presale Registration',
          subtitle: 'Reserve your allocation now',
          fields: ['wallet_address', 'email', 'x_handle'],
          submitText: 'Register',
          successMessage: 'Thank you! Check your email for updates.',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 5,
        content_json: {
          links: [
            { platform: 'x_twitter', url: '' },
            { platform: 'telegram', url: '' },
            { platform: 'discord', url: '' },
          ],
          style: 'icon-row',
          title: 'Stay Updated',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 6,
        content_json: {
          links: [
            { label: 'Terms', url: '#' },
            { label: 'Privacy', url: '#' },
          ],
          socials: [],
          disclaimer: 'Presale subject to Terms of Service. Edit with your legal disclaimers.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 5. NFT Collection Page
  {
    id: 'nft_collection',
    name: 'NFT Collection Page',
    description: 'Showcase your NFT collection with gallery and details',
    type: 'project',
    theme: 'dark',
    emoji: '🎨',
    global_settings: {
      backgroundColor: '#0F0F1E',
      textColor: '#FFFFFF',
      accentColor: '#00D4FF',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'NFT Collection',
          subtitle: 'Rare Digital Assets',
          description: 'Discover our exclusive NFT collection. Limited edition, blockchain verified.',
          primaryButtonText: 'View on Magic Eden',
          primaryButtonUrl: '',
          primaryButtonAction: 'open_link',
          secondaryButtonText: 'Discord',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'gallery',
        sort_order: 2,
        content_json: {
          title: 'NFT Gallery',
          images: [
            { url: '', title: 'NFT #1' },
            { url: '', title: 'NFT #2' },
            { url: '', title: 'NFT #3' },
            { url: '', title: 'NFT #4' },
          ],
          columns: 2,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'roadmap',
        sort_order: 3,
        content_json: {
          title: 'Collection Roadmap',
          items: [
            {
              title: 'Genesis Drop',
              description: 'Original 1000 NFTs released',
              status: 'completed',
              date: 'Q1 2025',
            },
            {
              title: 'Utility Launch',
              description: 'NFT holders unlock exclusive features',
              status: 'active',
              date: 'Q2 2025',
            },
            {
              title: 'Staking Program',
              description: 'Earn rewards by staking NFTs',
              status: 'upcoming',
              date: 'Q3 2025',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'team',
        sort_order: 4,
        content_json: {
          title: 'Collection Team',
          members: [
            { name: 'Artist', role: 'Creative Director', image: '' },
            { name: 'Developer', role: 'Smart Contracts', image: '' },
            { name: 'Community Lead', role: 'Community Manager', image: '' },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'faq',
        sort_order: 5,
        content_json: {
          title: 'NFT Questions',
          items: [
            {
              question: 'How do I mint an NFT?',
              answer: 'Edit this with minting instructions specific to your collection.',
            },
            {
              question: 'What utilities do NFTs have?',
              answer: 'Holders gain access to exclusive features and benefits.',
            },
            {
              question: 'Is this collection audited?',
              answer: 'Yes, edit with your audit details and security information.',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 6,
        content_json: {
          links: [
            { label: 'Magic Eden', url: '#' },
            { label: 'Contract', url: '#' },
          ],
          socials: [],
          disclaimer: 'NFTs are digital assets. Always verify authenticity before purchase.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 6. Gaming Project Page
  {
    id: 'gaming_project',
    name: 'Gaming Project Page',
    description: 'Promote your blockchain gaming project',
    type: 'project',
    theme: 'dark',
    emoji: '🎮',
    global_settings: {
      backgroundColor: '#1A0033',
      textColor: '#FFFFFF',
      accentColor: '#FF006E',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Enter the Game',
          subtitle: 'Next Generation Gaming on Blockchain',
          description: 'Experience true ownership, play-to-earn mechanics, and epic battles.',
          primaryButtonText: 'Play Now',
          primaryButtonUrl: '',
          primaryButtonAction: 'open_link',
          secondaryButtonText: 'Watch Trailer',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_video',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(to right, #FF006E, #FB5607)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'text',
        sort_order: 2,
        content_json: {
          heading: 'Game Features',
          text: 'Edit this with your game\'s unique features. Describe gameplay mechanics, in-game economy, and what makes your game special.',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'roadmap',
        sort_order: 3,
        content_json: {
          title: 'Game Development Timeline',
          items: [
            {
              title: 'Alpha Release',
              description: 'Early access testing',
              status: 'completed',
              date: 'Q1 2025',
            },
            {
              title: 'Beta Launch',
              description: 'Full game launch with progression system',
              status: 'active',
              date: 'Q2 2025',
            },
            {
              title: 'Multiplayer Arena',
              description: 'PvP tournament system',
              status: 'upcoming',
              date: 'Q3 2025',
            },
            {
              title: 'Metaverse Integration',
              description: 'Cross-game compatibility',
              status: 'upcoming',
              date: 'Q4 2025',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'team',
        sort_order: 4,
        content_json: {
          title: 'Development Team',
          members: [
            { name: 'Game Director', role: 'Creative Lead', image: '' },
            { name: 'Lead Programmer', role: 'Architecture', image: '' },
            { name: 'Game Designer', role: 'Mechanics & Balance', image: '' },
            { name: 'Blockchain Dev', role: 'Smart Contracts', image: '' },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 5,
        content_json: {
          links: [
            { platform: 'discord', url: '' },
            { platform: 'x_twitter', url: '' },
            { platform: 'youtube', url: '' },
          ],
          style: 'icon-row',
          title: 'Join the Community',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 6,
        content_json: {
          links: [
            { label: 'Whitepaper', url: '#' },
            { label: 'Roadmap', url: '#' },
            { label: 'Support', url: '#' },
          ],
          socials: [],
          disclaimer: 'Game still in development. Mechanics subject to change.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 7. Community Page
  {
    id: 'community_page',
    name: 'Community Page',
    description: 'Bring your community together',
    type: 'general',
    theme: 'light',
    emoji: '👥',
    global_settings: {
      backgroundColor: '#FFFFFF',
      textColor: '#1A1A1A',
      accentColor: '#4B8FFF',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Join Our Community',
          subtitle: 'Where Everyone Has a Voice',
          description: 'Be part of a thriving community of creators, developers, and enthusiasts.',
          primaryButtonText: 'Discord',
          primaryButtonUrl: '',
          primaryButtonAction: 'open_link',
          secondaryButtonText: 'Telegram',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: '#E8EAFF' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'announcement',
        sort_order: 2,
        content_json: {
          title: 'Latest News',
          message: 'Edit this with your latest community announcements and updates.',
          type: 'info',
          icon: '📢',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 3,
        content_json: {
          links: [
            { platform: 'discord', url: '' },
            { platform: 'telegram', url: '' },
            { platform: 'x_twitter', url: '' },
            { platform: 'reddit', url: '' },
          ],
          style: 'icon-row',
          title: 'Connect With Us',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'faq',
        sort_order: 4,
        content_json: {
          title: 'Community Guidelines',
          items: [
            {
              question: 'How do I join?',
              answer: 'Click any of the links above to join our Discord or Telegram.',
            },
            {
              question: 'What are the community rules?',
              answer: 'Edit this with your community guidelines and code of conduct.',
            },
            {
              question: 'How can I contribute?',
              answer: 'We welcome contributions! Check our #contribute channel for opportunities.',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 5,
        content_json: {
          links: [
            { label: 'Terms', url: '#' },
            { label: 'Privacy', url: '#' },
          ],
          socials: [],
          disclaimer: 'Community-driven. Help us make it better!',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 8. Airdrop / Claim Page
  {
    id: 'airdrop_claim',
    name: 'Airdrop / Claim Page',
    description: 'Distribute tokens to your community via airdrop',
    type: 'claim',
    theme: 'dark',
    emoji: '🎁',
    global_settings: {
      backgroundColor: '#0A0E27',
      textColor: '#FFFFFF',
      accentColor: '#00D4FF',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Airdrop Campaign',
          subtitle: 'Claim Your Tokens',
          description: 'You\'ve been selected to receive free tokens! Connect your wallet to claim your airdrop.',
          primaryButtonText: 'Claim Now',
          primaryButtonUrl: '',
          primaryButtonAction: 'scroll_to_block',
          secondaryButtonText: 'Leaderboard',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'claim',
        sort_order: 2,
        content_json: {
          title: 'Claim Your Airdrop',
          subtitle: 'Connect your wallet and click claim',
          tokenAmount: '1000',
          tokenSymbol: 'TOKEN',
          instructions: 'Edit this with specific claiming instructions.',
          claimButtonText: 'Claim Tokens',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 3,
        content_json: {
          links: [
            { platform: 'x_twitter', url: '' },
            { platform: 'telegram', url: '' },
            { platform: 'discord', url: '' },
          ],
          style: 'icon-row',
          title: 'Share & Earn Bonus',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 4,
        content_json: {
          links: [
            { label: 'Terms', url: '#' },
            { label: 'Airdrop Details', url: '#' },
          ],
          socials: [],
          disclaimer: 'Airdrop valid only for eligible wallets. See terms for details.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 9. Whitelist Page
  {
    id: 'whitelist_page',
    name: 'Whitelist Page',
    description: 'Collect whitelist signups for your upcoming launch',
    type: 'whitelist',
    theme: 'light',
    emoji: '📋',
    global_settings: {
      backgroundColor: '#F5F7FA',
      textColor: '#1A1A1A',
      accentColor: '#5865F2',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Get Whitelisted',
          subtitle: 'Secure Your Early Access',
          description: 'Join our whitelist for exclusive presale opportunities and rewards.',
          primaryButtonText: 'Whitelist Now',
          primaryButtonUrl: '',
          primaryButtonAction: 'scroll_to_block',
          secondaryButtonText: 'Learn More',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: '#E8EAFF' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'text',
        sort_order: 2,
        content_json: {
          heading: 'Whitelist Benefits',
          text: 'Edit this to describe what whitelisted users receive. Mention early access, special pricing, bonus tokens, or exclusive rewards.',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'whitelist_form',
        sort_order: 3,
        content_json: {
          title: 'Whitelist Registration',
          subtitle: 'Join thousands of members',
          fields: ['wallet_address', 'email', 'x_handle', 'telegram'],
          submitText: 'Join Whitelist',
          successMessage: 'Success! Check your email for confirmation.',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 4,
        content_json: {
          links: [
            { platform: 'x_twitter', url: '' },
            { platform: 'discord', url: '' },
            { platform: 'telegram', url: '' },
          ],
          style: 'icon-row',
          title: 'Follow for Updates',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 5,
        content_json: {
          links: [
            { label: 'Privacy Policy', url: '#' },
            { label: 'Terms of Service', url: '#' },
          ],
          socials: [],
          disclaimer: 'Your information is safe with us. We don\'t share emails.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 10. Link-in-Bio Crypto Page
  {
    id: 'link_in_bio',
    name: 'Link-in-Bio Crypto Page',
    description: 'Perfect for social media profiles - all links in one place',
    type: 'link-in-bio',
    theme: 'dark',
    emoji: '🔗',
    global_settings: {
      backgroundColor: '#0A0E27',
      textColor: '#FFFFFF',
      accentColor: '#00D4FF',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Your Project Name',
          subtitle: 'All Links in One Place',
          description: 'Connect with us across all platforms',
          primaryButtonText: '',
          primaryButtonUrl: '',
          primaryButtonAction: '',
          secondaryButtonText: '',
          secondaryButtonUrl: '',
          secondaryButtonAction: '',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'button',
        sort_order: 2,
        content_json: {
          text: 'Website',
          url: '',
          type: 'primary',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'button',
        sort_order: 3,
        content_json: {
          text: 'Buy Token',
          url: '',
          type: 'secondary',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'button',
        sort_order: 4,
        content_json: {
          text: 'Whitepaper',
          url: '',
          type: 'secondary',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'social_links',
        sort_order: 5,
        content_json: {
          links: [
            { platform: 'x_twitter', url: '' },
            { platform: 'telegram', url: '' },
            { platform: 'discord', url: '' },
            { platform: 'youtube', url: '' },
          ],
          style: 'icon-row',
          title: 'Follow Us',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 6,
        content_json: {
          links: [],
          socials: [],
          disclaimer: 'Powered by DAWEN',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },

  // 11. Full Project Website
  {
    id: 'full_project_website',
    name: 'Full Project Website',
    description: 'Complete comprehensive project website with all sections',
    type: 'project',
    theme: 'light',
    emoji: '🏢',
    global_settings: {
      backgroundColor: '#FFFFFF',
      textColor: '#1A1A1A',
      accentColor: '#4B8FFF',
    },
    blocks: [
      {
        block_type: 'hero',
        sort_order: 1,
        content_json: {
          title: 'Welcome to Our Project',
          subtitle: 'Building the Future',
          description: 'A comprehensive platform for your crypto project. Edit this with your project vision.',
          primaryButtonText: 'Get Started',
          primaryButtonUrl: '',
          primaryButtonAction: 'scroll_to_block',
          secondaryButtonText: 'Learn More',
          secondaryButtonUrl: '',
          secondaryButtonAction: 'open_link',
          alignment: 'center',
          logoUrl: '',
        },
        style_json: { ...defaultStyleJson, backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'text',
        sort_order: 2,
        content_json: {
          heading: 'About Our Project',
          text: 'Edit this comprehensive section to explain your project in detail. Include your mission, vision, and what makes you unique in the crypto space.',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'tokenomics',
        sort_order: 3,
        content_json: {
          title: 'Token Distribution',
          items: [
            { label: 'Community', percentage: 35, color: '#4B8FFF' },
            { label: 'Team & Advisors', percentage: 15, color: '#5865F2' },
            { label: 'Development', percentage: 30, color: '#00D4FF' },
            { label: 'Marketing', percentage: 15, color: '#FF6B6B' },
            { label: 'Partnerships', percentage: 5, color: '#FFB340' },
          ],
          vestingSchedule: '24-month vesting with quarterly releases',
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'roadmap',
        sort_order: 4,
        content_json: {
          title: 'Project Roadmap',
          items: [
            {
              title: 'Phase 1: Foundation',
              description: 'Core development and token launch',
              status: 'completed',
              date: 'Q1 2025',
            },
            {
              title: 'Phase 2: Growth',
              description: 'Exchange listings and partnerships',
              status: 'active',
              date: 'Q2 2025',
            },
            {
              title: 'Phase 3: Expansion',
              description: 'Ecosystem integration and features',
              status: 'upcoming',
              date: 'Q3 2025',
            },
            {
              title: 'Phase 4: Scale',
              description: 'Global rollout and community governance',
              status: 'upcoming',
              date: 'Q4 2025',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'team',
        sort_order: 5,
        content_json: {
          title: 'Meet the Team',
          members: [
            {
              name: 'Founder & CEO',
              role: 'Vision & Strategy',
              image: '',
            },
            {
              name: 'CTO',
              role: 'Technology & Architecture',
              image: '',
            },
            {
              name: 'Head of Operations',
              role: 'Operations & Growth',
              image: '',
            },
            {
              name: 'Lead Developer',
              role: 'Smart Contracts',
              image: '',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'faq',
        sort_order: 6,
        content_json: {
          title: 'Frequently Asked Questions',
          items: [
            {
              question: 'What problem does your project solve?',
              answer: 'Edit this to explain your value proposition and how you solve problems in the crypto space.',
            },
            {
              question: 'How can I get involved?',
              answer: 'Edit this with information on how users can participate - buying tokens, staking, contributing, etc.',
            },
            {
              question: 'Is this project audited?',
              answer: 'Edit this with details about your security audits and certifications.',
            },
            {
              question: 'What\'s your token utility?',
              answer: 'Edit this to explain all the use cases and benefits of holding your token.',
            },
          ],
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
      {
        block_type: 'footer',
        sort_order: 7,
        content_json: {
          links: [
            { label: 'Whitepaper', url: '#' },
            { label: 'Documentation', url: '#' },
            { label: 'Blog', url: '#' },
            { label: 'Support', url: '#' },
          ],
          socials: [],
          disclaimer: 'This project is not financial advice. Always conduct your own research before investing.',
          showDawenBadge: true,
        },
        style_json: defaultStyleJson,
        animation_json: defaultAnimationJson,
      },
    ],
  },
];
