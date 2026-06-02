import React from 'react';
import { Svg, Path, Circle, Rect, G, Line } from 'react-native-svg';

interface SocialIconProps {
  platform: string;
  size?: number;
  color?: string;
}

export const SOCIAL_PLATFORMS = [
  { id: 'x_twitter', label: 'X (Twitter)', placeholder: 'https://x.com/...' },
  { id: 'telegram', label: 'Telegram', placeholder: 'https://t.me/...' },
  { id: 'discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
  { id: 'website', label: 'Website', placeholder: 'https://example.com' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/...' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { id: 'github', label: 'GitHub', placeholder: 'https://github.com/...' },
  { id: 'medium', label: 'Medium', placeholder: 'https://medium.com/...' },
  { id: 'gitbook', label: 'Gitbook', placeholder: 'https://gitbook.com/...' },
  { id: 'solscan', label: 'Solscan', placeholder: 'https://solscan.io/token/...' },
  { id: 'dexscreener', label: 'DEXScreener', placeholder: 'https://dexscreener.com/...' },
  { id: 'birdeye', label: 'Birdeye', placeholder: 'https://birdeye.so/token/...' },
  { id: 'jupiter', label: 'Jupiter', placeholder: 'https://jup.ag' },
  { id: 'raydium', label: 'Raydium', placeholder: 'https://raydium.io' },
  { id: 'meteora', label: 'Meteora', placeholder: 'https://meteora.app' },
  { id: 'phantom', label: 'Phantom', placeholder: 'https://phantom.app' },
  { id: 'backpack', label: 'Backpack', placeholder: 'https://backpack.app' },
  { id: 'solflare', label: 'Solflare', placeholder: 'https://solflare.com' },
  { id: 'reddit', label: 'Reddit', placeholder: 'https://reddit.com/r/...' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/...' },
  { id: 'email', label: 'Email', placeholder: 'contact@example.com' },
];

const PLATFORM_COLORS: Record<string, string> = {
  x_twitter: '#000000',
  telegram: '#0088cc',
  discord: '#5865F2',
  website: '#4B8FFF',
  youtube: '#FF0000',
  tiktok: '#000000',
  instagram: '#E1306C',
  github: '#181717',
  medium: '#000000',
  gitbook: '#3884FF',
  solscan: '#14F195',
  dexscreener: '#1E2139',
  birdeye: '#00D4FF',
  jupiter: '#00D4FF',
  raydium: '#00D4FF',
  meteora: '#00D4FF',
  phantom: '#AB9FF2',
  backpack: '#00FFA3',
  solflare: '#1E1E1E',
  reddit: '#FF4500',
  linkedin: '#0A66C2',
  email: '#EA4335',
};

export function getPlatformLabel(platform: string): string {
  const found = SOCIAL_PLATFORMS.find(p => p.id === platform);
  return found ? found.label : platform;
}

export function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform] || '#ffffff';
}

export function SocialIcon({ platform, size = 24, color = '#ffffff' }: SocialIconProps) {
  const displayColor = color || getPlatformColor(platform);

  switch (platform) {
    case 'x_twitter':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.207-6.807-5.989 6.807H2.423l7.723-8.835L1.899 2.25h6.829l4.713 6.231 5.679-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </Svg>
      );
    case 'telegram':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.82-1.084.51l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295-.395 0-.33-.148-.465-.524l-1.045-3.43-2.996-.936c-.652-.203-.658-.636.14-1.026l11.708-4.514c.534-.253 1.002.122.832.917z" />
        </Svg>
      );
    case 'discord':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M20.317 4.368c-1.578-.842-3.546-1.47-5.697-1.47-.27 0-.534.01-.795.03C13.138 2.418 12.89 2.039 12.55 2h-.618c-.342 0-.59.384-.713.898-.28.01-.55.02-.796.02-2.151 0-4.12.628-5.697 1.47-2.596 3.737-2.976 7.413-2.663 8.841.788 1.185 2.118 1.968 3.595 2.402.576.233 1.102.493 1.566.794.252-.159.508-.33.768-.516-1.29-.365-2.497-1.055-3.437-2.066.288.163.606.323.95.475 1.737.954 3.902 1.539 6.226 1.539 2.327 0 4.492-.585 6.23-1.539.343-.151.66-.312.95-.475-.94 1.01-2.147 1.701-3.437 2.066.26.186.516.357.768.516.464-.301.99-.561 1.566-.794 1.477-.434 2.807-1.217 3.595-2.402.313-1.428-.068-5.104-2.663-8.841z" />
        </Svg>
      );
    case 'website':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={displayColor} strokeWidth="2">
          <Circle cx="12" cy="12" r="10" />
          <Path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </Svg>
      );
    case 'youtube':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </Svg>
      );
    case 'tiktok':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.68v12.7a2.85 2.85 0 1 1-5.18-2.86A2.9 2.9 0 0 1 8.95 9.4c0 .35-.06.68-.17 1a5.61 5.61 0 0 1-5.17 3.32A5.62 5.62 0 0 1 5 20.1a4.9 4.9 0 0 0 7.9-4.43v-5.36a6.694 6.694 0 0 0 3.69 1.12V6.69z" />
        </Svg>
      );
    case 'instagram':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke={displayColor} strokeWidth="2" />
          <Circle cx="12" cy="12" r="4" fill="none" stroke={displayColor} strokeWidth="2" />
          <Circle cx="18" cy="6" r="1" fill={displayColor} />
        </Svg>
      );
    case 'github':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </Svg>
      );
    case 'medium':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M2.846 6.36c.03-.295-.083-.586-.303-.784l-2.24-2.7v-.403H6.26l4.504 9.876 3.954-9.876h5.714v.403l-1.616 1.55c-.14.115-.212.304-.17.48v12.1c-.043.176.03.364.17.479l1.578 1.55v.403h-7.93v-.403l1.638-1.588c.16-.16.16-.207.16-.479V7.603L8.77 18.37H8.04L2.917 7.603v8.16c-.044.287.056.584.308.784l2.128 2.58v.403H0v-.403l2.128-2.58c-.25-.2-.37-.497-.282-.784v-9.42z" />
        </Svg>
      );
    case 'gitbook':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 0C5.37 0 0 5.37 0 12c0 5.042 3.582 9.27 8.378 10.288V14.267H5.848V11.68h2.53V8.904c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.194 2.238.194v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.876h2.773l-.443 2.587h-2.33v8.021C20.418 21.27 24 17.042 24 12c0-6.63-5.37-12-12-12z" />
        </Svg>
      );
    case 'solscan':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 2L2 7l10 5 10-5-10-5zm0 10l-10-5v8l10 5 10-5v-8l-10 5z" />
        </Svg>
      );
    case 'dexscreener':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Rect x="3" y="3" width="8" height="8" rx="1" ry="1" />
          <Rect x="13" y="3" width="8" height="8" rx="1" ry="1" />
          <Rect x="3" y="13" width="8" height="8" rx="1" ry="1" />
          <Rect x="13" y="13" width="8" height="8" rx="1" ry="1" />
        </Svg>
      );
    case 'birdeye':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Circle cx="12" cy="12" r="10" />
          <Circle cx="12" cy="12" r="6" fill="white" opacity="0.3" />
          <Circle cx="12" cy="12" r="3" fill="white" opacity="0.6" />
        </Svg>
      );
    case 'jupiter':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
        </Svg>
      );
    case 'raydium':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 1.5C6.201 1.5 1.5 6.201 1.5 12S6.201 22.5 12 22.5 22.5 17.799 22.5 12 17.799 1.5 12 1.5zm0 2.25c5.385 0 9.75 4.365 9.75 9.75s-4.365 9.75-9.75 9.75S2.25 18.885 2.25 12 6.615 2.25 12 2.25zm2.25 4.5H9.75v6.75H12v-2.25h2.25v-2.25h-2.25v-2.25z" />
        </Svg>
      );
    case 'meteora':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 2L7 12l5 10 5-10-5-10zm-3.46 10L12 5.46 15.46 12 12 18.54 8.54 12z" />
        </Svg>
      );
    case 'phantom':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Rect x="2" y="6" width="20" height="12" rx="3" ry="3" fill={displayColor} />
          <Circle cx="6" cy="12" r="1.5" fill="white" />
          <Circle cx="12" cy="12" r="1.5" fill="white" />
          <Circle cx="18" cy="12" r="1.5" fill="white" />
        </Svg>
      );
    case 'backpack':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Rect x="5" y="3" width="14" height="18" rx="2" ry="2" fill="none" stroke={displayColor} strokeWidth="2" />
          <Path d="M9 3v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" stroke={displayColor} strokeWidth="2" />
          <Line x1="9" y1="10" x2="15" y2="10" stroke={displayColor} strokeWidth="2" />
        </Svg>
      );
    case 'solflare':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 2L2 7l3 12 7 3 7-3 3-12-10-5z" />
          <Path d="M12 12L6 9l6-3 6 3-6 3z" />
        </Svg>
      );
    case 'reddit':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.53l-.864-4.129 3.632.566c.214-1.346 1.294-2.35 2.623-2.35.683 0 1.3.265 1.755.721.453-.09.887-.261 1.279-.512a1.748 1.748 0 0 1-.43 1.104c.261.133.515.32.735.545l-.015.024zm2.212-3.405c.464 0 .84-.376.84-.84a.842.842 0 0 0-1.68 0c0 .465.375.84.84.84zm-8.69 8.75c-.529 0-.955.426-.955.955 0 .529.426.955.955.955.53 0 .955-.426.955-.955 0-.529-.425-.955-.955-.955z" />
        </Svg>
      );
    case 'linkedin':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Rect x="2" y="2" width="20" height="20" rx="2" ry="2" fill="none" stroke={displayColor} strokeWidth="2" />
          <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="none" stroke={displayColor} strokeWidth="2" />
          <Circle cx="5.5" cy="5.5" r="1.5" fill={displayColor} />
        </Svg>
      );
    case 'email':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Rect x="2" y="4" width="20" height="16" rx="2" ry="2" fill="none" stroke={displayColor} strokeWidth="2" />
          <Path d="M2 6l10 7 10-7" fill="none" stroke={displayColor} strokeWidth="2" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={displayColor}>
          <Circle cx="12" cy="12" r="10" fill="none" stroke={displayColor} strokeWidth="2" />
          <Path d="M12 16v-4M12 8h.01" stroke={displayColor} strokeWidth="2" />
        </Svg>
      );
  }
}
