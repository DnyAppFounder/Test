import { Text, Linking, TextStyle, StyleProp, Platform } from 'react-native';

// Regex: matches http(s):// URLs and bare domain.tld/... patterns
const URL_REGEX = /(?:https?:\/\/[^\s]+|(?<!\w)(?:[a-zA-Z0-9-]+\.)+(?:com|io|org|net|app|xyz|gg|co|dev|info|me|tv|finance|money|crypto|sol|trade|exchange)(?:\/[^\s]*)?)/g;

// Cashtag: $SYMBOL where SYMBOL starts with a letter (not a digit — avoids $4.99 etc.)
// Supports 1-15 chars of letters, digits, underscores after the leading letter.
const CASHTAG_SPLIT = /(\$[A-Za-z][A-Za-z0-9_]{0,14})/g;
const CASHTAG_TEST  = /^\$[A-Za-z][A-Za-z0-9_]{0,14}$/;

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: TextStyle;
  onMentionPress?: (username: string) => void;
  mentionStyle?: TextStyle;
  onCashtagPress?: (symbol: string) => void;
  isPremiumAuthor?: boolean;
}

export default function LinkText({ text, style, linkStyle, onMentionPress, mentionStyle, onCashtagPress, isPremiumAuthor }: Props) {
  // Split by @mentions AND $CASHTAGS
  const parts = text.split(/(@\w+|\$[A-Za-z][A-Za-z0-9_]{0,14})/g);

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        // @mention
        if (/^@\w+$/.test(part)) {
          return (
            <Text
              key={i}
              style={[{ color: '#8B5CF6', fontWeight: '700' }, mentionStyle]}
              onPress={() => onMentionPress?.(part.slice(1))}
            >
              {part}
            </Text>
          );
        }

        // $CASHTAG
        if (CASHTAG_TEST.test(part)) {
          const symbol = part.slice(1).toUpperCase();
          if (isPremiumAuthor && onCashtagPress) {
            // Premium author: render as green clickable cashtag
            return (
              <Text
                key={i}
                style={{ color: '#10B981', fontWeight: '700' }}
                onPress={() => onCashtagPress(symbol)}
              >
                {part}
              </Text>
            );
          }
          // Non-premium author: render as plain text (same color as rest)
          return <Text key={i} style={style}>{part}</Text>;
        }

        // Check for URLs inside plain text segments
        const urlMatches = Array.from(part.matchAll(URL_REGEX));
        if (urlMatches.length === 0) return <Text key={i}>{part}</Text>;

        const segments: JSX.Element[] = [];
        let cursor = 0;
        for (const match of urlMatches) {
          const start = match.index!;
          if (start > cursor) {
            segments.push(<Text key={`${i}-pre-${start}`}>{part.slice(cursor, start)}</Text>);
          }
          const rawUrl = match[0];
          const href = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
          segments.push(
            <Text
              key={`${i}-url-${start}`}
              style={[{ color: '#3B82F6', textDecorationLine: 'underline', fontWeight: '500' }, linkStyle]}
              onPress={() => {
                if (Platform.OS === 'web') {
                  try { window.open(href, '_blank', 'noopener,noreferrer'); } catch {}
                } else {
                  Linking.openURL(href).catch(() => {});
                }
              }}
            >
              {rawUrl}
            </Text>
          );
          cursor = start + rawUrl.length;
        }
        if (cursor < part.length) {
          segments.push(<Text key={`${i}-post`}>{part.slice(cursor)}</Text>);
        }
        return <Text key={i}>{segments}</Text>;
      })}
    </Text>
  );
}

export function extractUrls(text: string): string[] {
  const matches = Array.from(text.matchAll(URL_REGEX));
  return matches.map(m => m[0].startsWith('http') ? m[0] : 'https://' + m[0]);
}
