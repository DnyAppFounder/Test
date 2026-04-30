import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { CircleAlert as AlertCircle } from 'lucide-react-native';

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Caught error:', error?.message);
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <AlertCircle size={32} color={colors.error} />
          <Text style={styles.label}>{this.props.fallbackLabel ?? 'Something went wrong'}</Text>
          <Text style={styles.detail} numberOfLines={2}>{this.state.errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={this.reset}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.errorMuted,
    margin: spacing.md,
    minHeight: 120,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  detail: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.sm,
  },
  retryText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
});
