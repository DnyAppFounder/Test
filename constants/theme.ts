export const colors = {
  background: '#0A0A0F',
  backgroundDeep: '#050508',
  surface: '#12121A',
  surfaceElevated: '#1A1A28',
  surfaceLight: '#20202E',
  surfaceBorder: 'rgba(139, 92, 246, 0.08)',
  surfaceBorderLight: 'rgba(139, 92, 246, 0.15)',

  primary: '#8B5CF6',
  primaryDark: '#6D28D9',
  primaryLight: '#A78BFA',
  primaryMuted: 'rgba(139, 92, 246, 0.15)',
  primaryGlow: 'rgba(139, 92, 246, 0.4)',

  accent: '#C084FC',
  accentMuted: 'rgba(192, 132, 252, 0.12)',
  accentBright: '#E9D5FF',

  secondary: '#7C3AED',
  secondaryMuted: 'rgba(124, 58, 237, 0.1)',

  success: '#10b981',
  successMuted: 'rgba(16, 185, 129, 0.12)',
  warning: '#f59e0b',
  warningMuted: 'rgba(245, 158, 11, 0.12)',
  error: '#ef4444',
  errorMuted: 'rgba(239, 68, 68, 0.12)',

  textPrimary: '#FFFFFF',
  textSecondary: '#C4C4D4',
  textMuted: '#6B7280',
  textAccent: '#A78BFA',

  white: '#ffffff',
  black: '#000000',

  gradient: {
    primary: ['#0A0A0F', '#12121A', '#1A1A28'] as const,
    card: ['#12121A', '#0F0F1A'] as const,
    cosmic: ['#1A0B2E', '#16213E', '#0F0F23'] as const,
    purple: ['#8B5CF6', '#7C3AED', '#6D28D9'] as const,
    purpleSubtle: ['rgba(139, 92, 246, 0.2)', 'rgba(124, 58, 237, 0.1)', 'rgba(109, 40, 217, 0.05)'] as const,
    accent: ['#8B5CF6', '#6D28D9'] as const,
    header: ['#1A1A28', '#12121A'] as const,
    hero: ['#0A0A0F', '#1A0B2E', '#0A0A0F'] as const,
    skyline: ['transparent', 'rgba(139, 92, 246, 0.08)', 'rgba(124, 58, 237, 0.06)', 'transparent'] as const,
    glow: ['rgba(139, 92, 246, 0.3)', 'rgba(139, 92, 246, 0)', 'rgba(139, 92, 246, 0)'] as const,
  },

  shadow: {
    purple: 'rgba(139, 92, 246, 0.25)',
    purpleLight: 'rgba(139, 92, 246, 0.15)',
    dark: 'rgba(0, 0, 0, 0.5)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  hero: 48,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const elevation = {
  sm: {
    shadowColor: colors.shadow.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: colors.shadow.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.shadow.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
};
