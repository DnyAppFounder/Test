import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Linking,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { PageBlock, BlockType, submitForm, trackEvent } from '@/services/pageStudioService';
import { SocialIcon, SOCIAL_PLATFORMS, getPlatformLabel, getPlatformColor } from './SocialIcons';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  AlertCircle,
  Play,
} from 'lucide-react-native';

interface BlockRendererProps {
  block: PageBlock;
  pageId: string;
  isEditing?: boolean;
  theme?: 'light' | 'dark';
  accentColor?: string;
  onEdit?: (block: PageBlock) => void;
}

function resolveColor(color: string | undefined, fallback: string): string {
  return color || fallback;
}

// ─── HERO ────────────────────────────────────────────────────────────────────
function HeroBlock({ content, style, accent, theme }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const subtitleColor = theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
  const bg = style?.backgroundColor || (theme === 'dark' ? '#1A1A2E' : '#E8EAFF');

  return (
    <View style={[heroStyles.wrap, { backgroundColor: bg }]}>
      {content.logoUrl ? (
        <Image source={{ uri: content.logoUrl }} style={heroStyles.logo} />
      ) : null}
      <Text style={[heroStyles.title, { color: textColor }]}>{content.title || 'Untitled'}</Text>
      {content.subtitle ? (
        <Text style={[heroStyles.subtitle, { color: accent }]}>{content.subtitle}</Text>
      ) : null}
      {content.description ? (
        <Text style={[heroStyles.desc, { color: subtitleColor }]}>{content.description}</Text>
      ) : null}
      <View style={heroStyles.btnRow}>
        {content.primaryButtonText ? (
          <TouchableOpacity
            style={[heroStyles.btnPrimary, { backgroundColor: accent }]}
            onPress={() => content.primaryButtonUrl && Linking.openURL(content.primaryButtonUrl)}
          >
            <Text style={heroStyles.btnPrimaryText}>{content.primaryButtonText}</Text>
          </TouchableOpacity>
        ) : null}
        {content.secondaryButtonText ? (
          <TouchableOpacity
            style={[heroStyles.btnSecondary, { borderColor: accent }]}
            onPress={() => content.secondaryButtonUrl && Linking.openURL(content.secondaryButtonUrl)}
          >
            <Text style={[heroStyles.btnSecondaryText, { color: accent }]}>{content.secondaryButtonText}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  wrap: { padding: 40, alignItems: 'center' },
  logo: { width: 80, height: 80, borderRadius: 16, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  desc: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24, maxWidth: 560 },
  btnRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  btnPrimary: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, borderWidth: 2 },
  btnSecondaryText: { fontWeight: '700', fontSize: 15 },
});

// ─── TEXT ─────────────────────────────────────────────────────────────────────
function TextBlock({ content, theme }: any) {
  const headingColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const bodyColor = theme === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)';
  return (
    <View style={textBlockStyles.wrap}>
      {content.heading ? (
        <Text style={[textBlockStyles.heading, { color: headingColor }]}>{content.heading}</Text>
      ) : null}
      {content.text ? (
        <Text style={[textBlockStyles.body, { color: bodyColor }]}>{content.text}</Text>
      ) : null}
    </View>
  );
}

const textBlockStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingVertical: 24 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 24 },
});

// ─── BUTTON ───────────────────────────────────────────────────────────────────
function ButtonBlock({ content, accent }: any) {
  const isPrimary = content.type === 'primary';
  return (
    <View style={btnBlockStyles.wrap}>
      <TouchableOpacity
        style={[
          btnBlockStyles.btn,
          isPrimary ? { backgroundColor: accent } : { borderWidth: 2, borderColor: accent },
        ]}
        onPress={() => content.url && Linking.openURL(content.url)}
      >
        <Text style={[btnBlockStyles.text, !isPrimary && { color: accent }]}>
          {content.text || 'Button'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const btnBlockStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center' },
  btn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, minWidth: 200, alignItems: 'center' },
  text: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─── SOCIAL LINKS ────────────────────────────────────────────────────────────
function SocialLinksBlock({ content, theme }: any) {
  const titleColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const links: { platform: string; url: string }[] = content.links || [];
  return (
    <View style={socialStyles.wrap}>
      {content.title ? (
        <Text style={[socialStyles.title, { color: titleColor }]}>{content.title}</Text>
      ) : null}
      <View style={socialStyles.row}>
        {links.map((link, i) => {
          const color = getPlatformColor(link.platform);
          return (
            <TouchableOpacity
              key={i}
              style={[socialStyles.iconBtn, { backgroundColor: color + '22', borderColor: color + '55' }]}
              onPress={() => link.url && Linking.openURL(link.url)}
            >
              <SocialIcon platform={link.platform} size={22} color={color} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const socialStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingVertical: 24, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  iconBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

// ─── TOKEN INFO ───────────────────────────────────────────────────────────────
function TokenInfoBlock({ content, theme, accent }: any) {
  const bg = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#fff';
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';

  const stats = [];
  if (content.supply) stats.push({ label: 'Supply', value: content.supply });
  if (content.chain) stats.push({ label: 'Chain', value: content.chain });
  if (content.decimals) stats.push({ label: 'Decimals', value: content.decimals });
  if (content.presalePrice) stats.push({ label: 'Presale Price', value: content.presalePrice });
  if (content.launchPrice) stats.push({ label: 'Launch Price', value: content.launchPrice });

  return (
    <View style={[tokenStyles.wrap, { backgroundColor: bg }]}>
      <View style={tokenStyles.header}>
        {content.logoUrl ? (
          <Image source={{ uri: content.logoUrl }} style={tokenStyles.logo} />
        ) : (
          <View style={[tokenStyles.logoPlaceholder, { backgroundColor: accent + '33', borderColor: accent + '55' }]}>
            <Text style={[tokenStyles.logoText, { color: accent }]}>{(content.symbol || 'T')[0]}</Text>
          </View>
        )}
        <View>
          <Text style={[tokenStyles.name, { color: textColor }]}>{content.name || 'Token Name'}</Text>
          <Text style={[tokenStyles.symbol, { color: accent }]}>{content.symbol || 'SYM'}</Text>
        </View>
      </View>
      {stats.length > 0 && (
        <View style={tokenStyles.statsGrid}>
          {stats.map((stat, i) => (
            <View key={i} style={[tokenStyles.statCard, { backgroundColor: cardBg }]}>
              <Text style={[tokenStyles.statLabel, { color: mutedColor }]}>{stat.label}</Text>
              <Text style={[tokenStyles.statValue, { color: textColor }]}>{stat.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const tokenStyles = StyleSheet.create({
  wrap: { padding: 24, borderRadius: 16, margin: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  logo: { width: 56, height: 56, borderRadius: 12 },
  logoPlaceholder: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  logoText: { fontSize: 22, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '700' },
  symbol: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { padding: 12, borderRadius: 10, minWidth: 120, flex: 1 },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '700' },
});

// ─── LIVE CHART ───────────────────────────────────────────────────────────────
function LiveChartBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const bg = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={[chartStyles.wrap, { backgroundColor: bg }]}>
      <Text style={[chartStyles.label, { color: textColor }]}>
        {content.title || 'Live Chart'}
      </Text>
      <Text style={[chartStyles.hint, { color: accent }]}>
        {content.symbol || 'Price'} — Live data powered by DAWEN
      </Text>
      <View style={[chartStyles.placeholder, { borderColor: accent + '33' }]}>
        <Text style={{ color: accent, fontSize: 13 }}>Chart loads on published page</Text>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrap: { padding: 24, margin: 16, borderRadius: 16 },
  label: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 13, marginBottom: 16 },
  placeholder: { height: 160, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});

// ─── BUY WIDGET ───────────────────────────────────────────────────────────────
function BuyWidgetBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const bg = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const dexes: string[] = content.dexes || ['jupiter'];
  return (
    <View style={[buyStyles.wrap, { backgroundColor: bg }]}>
      <Text style={[buyStyles.title, { color: textColor }]}>{content.title || 'Buy Token'}</Text>
      {content.description ? (
        <Text style={[buyStyles.desc, { color: theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)' }]}>
          {content.description}
        </Text>
      ) : null}
      <View style={buyStyles.dexRow}>
        {dexes.map((dex: string) => (
          <TouchableOpacity key={dex} style={[buyStyles.dexBtn, { backgroundColor: accent }]}>
            <Text style={buyStyles.dexText}>Buy on {dex.charAt(0).toUpperCase() + dex.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const buyStyles = StyleSheet.create({
  wrap: { padding: 24, margin: 16, borderRadius: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  dexRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  dexBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  dexText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── ROADMAP ──────────────────────────────────────────────────────────────────
function RoadmapBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const items: any[] = content.items || [];

  const statusColor = (status: string) => {
    if (status === 'completed') return '#22c55e';
    if (status === 'active') return accent;
    return mutedColor;
  };

  return (
    <View style={roadmapStyles.wrap}>
      {content.title ? (
        <Text style={[roadmapStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <View style={roadmapStyles.list}>
        {items.map((item: any, i: number) => (
          <View key={i} style={roadmapStyles.item}>
            <View style={[roadmapStyles.dot, { backgroundColor: statusColor(item.status) }]} />
            {i < items.length - 1 && (
              <View style={[roadmapStyles.line, { backgroundColor: mutedColor + '44' }]} />
            )}
            <View style={roadmapStyles.content}>
              <Text style={[roadmapStyles.itemTitle, { color: textColor }]}>{item.title}</Text>
              {item.date ? (
                <Text style={[roadmapStyles.date, { color: accent }]}>{item.date}</Text>
              ) : null}
              {item.description ? (
                <Text style={[roadmapStyles.desc, { color: mutedColor }]}>{item.description}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const roadmapStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  list: { paddingLeft: 16 },
  item: { flexDirection: 'row', marginBottom: 28, position: 'relative' },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 3, marginRight: 16, flexShrink: 0 },
  line: { position: 'absolute', left: 6, top: 17, width: 2, height: '100%' },
  content: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  date: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  desc: { fontSize: 14, lineHeight: 20 },
});

// ─── TOKENOMICS ───────────────────────────────────────────────────────────────
function TokenomicsBlock({ content, theme }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const items: any[] = content.items || [];
  const total = items.reduce((sum: number, item: any) => sum + (item.percentage || 0), 0);

  return (
    <View style={tokenomicsStyles.wrap}>
      {content.title ? (
        <Text style={[tokenomicsStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <View style={tokenomicsStyles.bar}>
        {items.map((item: any, i: number) => (
          <View
            key={i}
            style={[
              tokenomicsStyles.barSegment,
              {
                backgroundColor: item.color || '#4B8FFF',
                flex: (item.percentage || 0) / 100,
              },
              i === 0 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
              i === items.length - 1 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
            ]}
          />
        ))}
      </View>
      <View style={tokenomicsStyles.legend}>
        {items.map((item: any, i: number) => (
          <View key={i} style={tokenomicsStyles.legendItem}>
            <View style={[tokenomicsStyles.legendDot, { backgroundColor: item.color || '#4B8FFF' }]} />
            <Text style={[tokenomicsStyles.legendLabel, { color: textColor }]}>
              {item.label} — {item.percentage}%
            </Text>
          </View>
        ))}
      </View>
      {content.vestingSchedule ? (
        <Text style={[tokenomicsStyles.vesting, { color: mutedColor }]}>
          {content.vestingSchedule}
        </Text>
      ) : null}
    </View>
  );
}

const tokenomicsStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  bar: { flexDirection: 'row', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 20 },
  barSegment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { fontSize: 14 },
  vesting: { fontSize: 13, marginTop: 16, textAlign: 'center' },
});

// ─── TEAM ─────────────────────────────────────────────────────────────────────
function TeamBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#fff';
  const members: any[] = content.members || [];

  return (
    <View style={teamStyles.wrap}>
      {content.title ? (
        <Text style={[teamStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <View style={teamStyles.grid}>
        {members.map((member: any, i: number) => (
          <View key={i} style={[teamStyles.card, { backgroundColor: cardBg }]}>
            {member.image ? (
              <Image source={{ uri: member.image }} style={teamStyles.avatar} />
            ) : (
              <View style={[teamStyles.avatarPlaceholder, { backgroundColor: accent + '33' }]}>
                <Text style={[teamStyles.avatarInitial, { color: accent }]}>
                  {(member.name || '?')[0]}
                </Text>
              </View>
            )}
            <Text style={[teamStyles.name, { color: textColor }]}>{member.name}</Text>
            <Text style={[teamStyles.role, { color: mutedColor }]}>{member.role}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const teamStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  card: { width: 140, padding: 16, borderRadius: 12, alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 10 },
  avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 24, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  role: { fontSize: 12, textAlign: 'center', marginTop: 4 },
});

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQBlock({ content, theme, accent }: any) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const items: any[] = content.items || [];

  return (
    <View style={faqStyles.wrap}>
      {content.title ? (
        <Text style={[faqStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      {items.map((item: any, i: number) => (
        <TouchableOpacity
          key={i}
          style={[faqStyles.item, { borderColor }]}
          onPress={() => setOpenIndex(openIndex === i ? null : i)}
          activeOpacity={0.7}
        >
          <View style={faqStyles.questionRow}>
            <Text style={[faqStyles.question, { color: textColor, flex: 1 }]}>{item.question}</Text>
            {openIndex === i ? (
              <ChevronUp size={18} color={accent} strokeWidth={2} />
            ) : (
              <ChevronDown size={18} color={mutedColor} strokeWidth={2} />
            )}
          </View>
          {openIndex === i && (
            <Text style={[faqStyles.answer, { color: mutedColor }]}>{item.answer}</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const faqStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  item: { borderBottomWidth: 1, paddingVertical: 16 },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  question: { fontSize: 15, fontWeight: '600' },
  answer: { fontSize: 14, lineHeight: 22, marginTop: 10 },
});

// ─── GALLERY ─────────────────────────────────────────────────────────────────
function GalleryBlock({ content, theme }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  const images: any[] = content.images || [];
  const columns = content.columns || 2;

  return (
    <View style={galleryStyles.wrap}>
      {content.title ? (
        <Text style={[galleryStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <View style={[galleryStyles.grid, { gap: 10 }]}>
        {images.map((img: any, i: number) => (
          <View
            key={i}
            style={[galleryStyles.imgWrap, { flex: 1 / columns }]}
          >
            {img.url ? (
              <Image source={{ uri: img.url }} style={galleryStyles.img} />
            ) : (
              <View style={[galleryStyles.imgPlaceholder, { backgroundColor: theme === 'dark' ? '#2A2A3E' : '#EEF0F4' }]}>
                <Text style={{ color: mutedColor, fontSize: 11 }}>{img.title || `Image ${i + 1}`}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const galleryStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  imgWrap: { minWidth: 120, aspectRatio: 1, padding: 4 },
  img: { flex: 1, borderRadius: 10 },
  imgPlaceholder: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 100 },
});

// ─── VIDEO ────────────────────────────────────────────────────────────────────
function VideoBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const bg = theme === 'dark' ? 'rgba(0,0,0,0.6)' : '#f0f0f0';
  return (
    <View style={videoStyles.wrap}>
      {content.title ? (
        <Text style={[videoStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <TouchableOpacity
        style={[videoStyles.player, { backgroundColor: bg }]}
        onPress={() => content.url && Linking.openURL(content.url)}
      >
        {content.thumbnail ? (
          <Image source={{ uri: content.thumbnail }} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[videoStyles.playBtn, { backgroundColor: accent }]}>
          <Play size={20} color="#fff" fill="#fff" strokeWidth={0} />
        </View>
        {content.url ? (
          <Text style={videoStyles.urlHint} numberOfLines={1}>
            {content.url}
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const videoStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  player: { height: 180, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  urlHint: { position: 'absolute', bottom: 8, left: 8, right: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
});

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────
function CountdownBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const bg = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const target = content.targetDate ? new Date(content.targetDate).getTime() : Date.now() + 86400000;
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [content.targetDate]);

  const units = [
    content.showDays !== false && { label: 'Days', value: timeLeft.days },
    content.showHours !== false && { label: 'Hours', value: timeLeft.hours },
    content.showMinutes !== false && { label: 'Mins', value: timeLeft.minutes },
    content.showSeconds !== false && { label: 'Secs', value: timeLeft.seconds },
  ].filter(Boolean) as { label: string; value: number }[];

  return (
    <View style={countdownStyles.wrap}>
      {content.title ? (
        <Text style={[countdownStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <View style={countdownStyles.units}>
        {units.map((unit, i) => (
          <View key={i} style={[countdownStyles.unit, { backgroundColor: bg }]}>
            <Text style={[countdownStyles.value, { color: accent }]}>
              {String(unit.value).padStart(2, '0')}
            </Text>
            <Text style={[countdownStyles.label, { color: textColor }]}>{unit.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const countdownStyles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  units: { flexDirection: 'row', gap: 12 },
  unit: { padding: 16, borderRadius: 12, alignItems: 'center', minWidth: 70 },
  value: { fontSize: 32, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 4 },
});

// ─── WHITELIST FORM ───────────────────────────────────────────────────────────
function WhitelistFormBlock({ content, theme, accent, pageId, blockId }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const inputBg = theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#fff';
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.15)' : '#ddd';

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const fields: string[] = content.fields || ['wallet_address', 'email'];

  const fieldLabels: Record<string, string> = {
    wallet_address: 'Wallet Address',
    email: 'Email',
    x_handle: 'X (Twitter) Handle',
    telegram: 'Telegram Username',
    note: 'Note',
  };

  const handleSubmit = async () => {
    if (!pageId || !blockId) return;
    setSubmitting(true);
    setError('');
    try {
      await submitForm({
        page_id: pageId,
        block_id: blockId,
        wallet_address: values.wallet_address,
        x_handle: values.x_handle,
        telegram: values.telegram,
        email: values.email,
        note: values.note,
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={wlStyles.wrap}>
        <View style={[wlStyles.successBox, { backgroundColor: '#22c55e22', borderColor: '#22c55e44' }]}>
          <Check size={24} color="#22c55e" strokeWidth={2} />
          <Text style={[wlStyles.successText, { color: textColor }]}>
            {content.successMessage || 'Thank you! You\'re on the list.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={wlStyles.wrap}>
      {content.title ? (
        <Text style={[wlStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      {content.subtitle ? (
        <Text style={[wlStyles.subtitle, { color: mutedColor }]}>{content.subtitle}</Text>
      ) : null}
      {fields.map((field: string) => (
        <TextInput
          key={field}
          style={[wlStyles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
          placeholder={fieldLabels[field] || field}
          placeholderTextColor={mutedColor}
          value={values[field] || ''}
          onChangeText={(v) => setValues((prev) => ({ ...prev, [field]: v }))}
          autoCapitalize="none"
        />
      ))}
      {error ? (
        <View style={wlStyles.errorRow}>
          <AlertCircle size={14} color="#ef4444" strokeWidth={2} />
          <Text style={wlStyles.errorText}>{error}</Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={[wlStyles.submitBtn, { backgroundColor: accent }, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={wlStyles.submitText}>{content.submitText || 'Submit'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const wlStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 10, borderWidth: 1 },
  successText: { fontSize: 15, fontWeight: '600', flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  errorText: { color: '#ef4444', fontSize: 13 },
  submitBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ─── CLAIM ────────────────────────────────────────────────────────────────────
function ClaimBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const bg = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';

  return (
    <View style={claimStyles.wrap}>
      {content.title ? (
        <Text style={[claimStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      {content.subtitle ? (
        <Text style={[claimStyles.subtitle, { color: mutedColor }]}>{content.subtitle}</Text>
      ) : null}
      <View style={[claimStyles.amountBox, { backgroundColor: bg }]}>
        <Text style={[claimStyles.amount, { color: accent }]}>
          {content.tokenAmount || '0'} {content.tokenSymbol || 'TOKEN'}
        </Text>
        <Text style={[claimStyles.amountLabel, { color: mutedColor }]}>Claimable</Text>
      </View>
      {content.instructions ? (
        <Text style={[claimStyles.instructions, { color: mutedColor }]}>{content.instructions}</Text>
      ) : null}
      <TouchableOpacity style={[claimStyles.claimBtn, { backgroundColor: accent }]}>
        <Text style={claimStyles.claimText}>{content.claimButtonText || 'Claim Tokens'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const claimStyles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  amountBox: { padding: 20, borderRadius: 14, alignItems: 'center', marginBottom: 16, minWidth: 200 },
  amount: { fontSize: 28, fontWeight: '800' },
  amountLabel: { fontSize: 12, marginTop: 4 },
  instructions: { fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  claimBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 8 },
  claimText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ─── MEDIA KIT ────────────────────────────────────────────────────────────────
function MediaKitBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const cardBg = theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#f5f5f5';
  const assets: any[] = content.assets || [];

  return (
    <View style={mkStyles.wrap}>
      {content.title ? (
        <Text style={[mkStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      {content.description ? (
        <Text style={[mkStyles.desc, { color: mutedColor }]}>{content.description}</Text>
      ) : null}
      <View style={mkStyles.assets}>
        {assets.map((asset: any, i: number) => (
          <TouchableOpacity
            key={i}
            style={[mkStyles.asset, { backgroundColor: cardBg }]}
            onPress={() => asset.url && Linking.openURL(asset.url)}
          >
            <Text style={[mkStyles.assetName, { color: textColor }]}>{asset.name}</Text>
            <ExternalLink size={14} color={accent} strokeWidth={2} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const mkStyles = StyleSheet.create({
  wrap: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
  assets: { gap: 10 },
  asset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 10 },
  assetName: { fontSize: 14, fontWeight: '600' },
});

// ─── ANNOUNCEMENT ─────────────────────────────────────────────────────────────
function AnnouncementBlock({ content, theme }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const typeColors: Record<string, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    success: '#22c55e',
    alert: '#ef4444',
  };
  const color = typeColors[content.type] || typeColors.info;

  return (
    <View style={[announcStyles.wrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      {content.icon ? (
        <Text style={announcStyles.icon}>{content.icon}</Text>
      ) : null}
      <View style={{ flex: 1 }}>
        {content.title ? (
          <Text style={[announcStyles.title, { color }]}>{content.title}</Text>
        ) : null}
        {content.message ? (
          <Text style={[announcStyles.message, { color: textColor }]}>{content.message}</Text>
        ) : null}
      </View>
    </View>
  );
}

const announcStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, margin: 16, borderRadius: 12, borderWidth: 1 },
  icon: { fontSize: 20 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  message: { fontSize: 14, lineHeight: 20 },
});

// ─── EMBED ────────────────────────────────────────────────────────────────────
function EmbedBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const bg = theme === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5';
  return (
    <View style={[embedStyles.wrap, { backgroundColor: bg }]}>
      {content.title ? (
        <Text style={[embedStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      {content.url ? (
        <TouchableOpacity style={[embedStyles.link, { borderColor: accent + '33' }]} onPress={() => Linking.openURL(content.url)}>
          <ExternalLink size={16} color={accent} strokeWidth={2} />
          <Text style={[embedStyles.linkText, { color: accent }]} numberOfLines={1}>{content.url}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[embedStyles.placeholder, { color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }]}>
          Embed URL not set
        </Text>
      )}
    </View>
  );
}

const embedStyles = StyleSheet.create({
  wrap: { padding: 24, margin: 16, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1 },
  linkText: { flex: 1, fontSize: 14 },
  placeholder: { fontSize: 14 },
});

// ─── QR CODE ─────────────────────────────────────────────────────────────────
function QRCodeBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  return (
    <View style={qrStyles.wrap}>
      {content.title ? (
        <Text style={[qrStyles.title, { color: textColor }]}>{content.title}</Text>
      ) : null}
      <View style={[qrStyles.placeholder, { borderColor: accent + '44', backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f5f5f5' }]}>
        <Text style={{ fontSize: 40 }}>📱</Text>
        <Text style={[{ fontSize: 12, marginTop: 8, color: mutedColor }]}>
          {content.data ? 'QR Code' : 'Set QR data'}
        </Text>
      </View>
      {content.caption ? (
        <Text style={[qrStyles.caption, { color: mutedColor }]}>{content.caption}</Text>
      ) : null}
    </View>
  );
}

const qrStyles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  placeholder: { width: 160, height: 160, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 13, marginTop: 12 },
});

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function FooterBlock({ content, theme, accent }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
  const bg = theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)';
  const links: any[] = content.links || [];

  return (
    <View style={[footerStyles.wrap, { backgroundColor: bg }]}>
      <View style={footerStyles.linksRow}>
        {links.map((link: any, i: number) => (
          <TouchableOpacity key={i} onPress={() => link.url && link.url !== '#' && Linking.openURL(link.url)}>
            <Text style={[footerStyles.link, { color: accent }]}>{link.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {content.disclaimer ? (
        <Text style={[footerStyles.disclaimer, { color: mutedColor }]}>{content.disclaimer}</Text>
      ) : null}
      {content.showDawenBadge !== false && (
        <Text style={[footerStyles.badge, { color: mutedColor }]}>Built with DAWEN Page Studio</Text>
      )}
    </View>
  );
}

const footerStyles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center' },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 12 },
  link: { fontSize: 13, fontWeight: '600' },
  disclaimer: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 8, maxWidth: 480 },
  badge: { fontSize: 11, textAlign: 'center' },
});

// ─── CUSTOM SECTION ───────────────────────────────────────────────────────────
function CustomSectionBlock({ content, theme }: any) {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#111111';
  const mutedColor = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  return (
    <View style={customStyles.wrap}>
      {content.heading ? (
        <Text style={[customStyles.heading, { color: textColor }]}>{content.heading}</Text>
      ) : null}
      {content.body ? (
        <Text style={[customStyles.body, { color: mutedColor }]}>{content.body}</Text>
      ) : null}
    </View>
  );
}

const customStyles = StyleSheet.create({
  wrap: { padding: 24 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 24 },
});

// ─── MAIN RENDERER ────────────────────────────────────────────────────────────
export function BlockRenderer({
  block,
  pageId,
  isEditing = false,
  theme = 'dark',
  accentColor = '#4B8FFF',
  onEdit,
}: BlockRendererProps) {
  const { block_type, content_json: content, style_json: style, is_hidden } = block;

  if (is_hidden && !isEditing) return null;

  const props = { content, style, accent: accentColor, theme, pageId, blockId: block.id };

  let inner: React.ReactNode = null;

  switch (block_type) {
    case 'hero': inner = <HeroBlock {...props} />; break;
    case 'text': inner = <TextBlock {...props} />; break;
    case 'button': inner = <ButtonBlock {...props} />; break;
    case 'social_links': inner = <SocialLinksBlock {...props} />; break;
    case 'token_info': inner = <TokenInfoBlock {...props} />; break;
    case 'live_chart': inner = <LiveChartBlock {...props} />; break;
    case 'buy_widget': inner = <BuyWidgetBlock {...props} />; break;
    case 'roadmap': inner = <RoadmapBlock {...props} />; break;
    case 'tokenomics': inner = <TokenomicsBlock {...props} />; break;
    case 'team': inner = <TeamBlock {...props} />; break;
    case 'faq': inner = <FAQBlock {...props} />; break;
    case 'gallery': inner = <GalleryBlock {...props} />; break;
    case 'video': inner = <VideoBlock {...props} />; break;
    case 'countdown': inner = <CountdownBlock {...props} />; break;
    case 'whitelist_form': inner = <WhitelistFormBlock {...props} />; break;
    case 'claim': inner = <ClaimBlock {...props} />; break;
    case 'media_kit': inner = <MediaKitBlock {...props} />; break;
    case 'announcement': inner = <AnnouncementBlock {...props} />; break;
    case 'embed': inner = <EmbedBlock {...props} />; break;
    case 'qr_code': inner = <QRCodeBlock {...props} />; break;
    case 'footer': inner = <FooterBlock {...props} />; break;
    case 'custom_section': inner = <CustomSectionBlock {...props} />; break;
    default: inner = null;
  }

  if (!isEditing) return <>{inner}</>;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onEdit?.(block)}
      style={[editorStyles.wrap, is_hidden && editorStyles.hidden]}
    >
      {inner}
      <View style={editorStyles.overlay}>
        <Text style={editorStyles.editHint}>Tap to edit</Text>
        {is_hidden && <Text style={editorStyles.hiddenBadge}>HIDDEN</Text>}
      </View>
    </TouchableOpacity>
  );
}

const editorStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(75,143,255,0.3)',
    borderRadius: 4,
    marginVertical: 2,
  },
  hidden: { opacity: 0.45 },
  overlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  editHint: {
    fontSize: 10,
    color: '#4B8FFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hiddenBadge: {
    fontSize: 10,
    color: '#f59e0b',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
