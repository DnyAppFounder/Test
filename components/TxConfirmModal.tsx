import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Shield, X, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';

export interface TxDetail {
  label: string;
  value: string;
  accent?: boolean;
  total?: boolean;
}

interface Props {
  visible: boolean;
  title: string;
  details: TxDetail[];
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  warning?: string;
}

export function TxConfirmModal({
  visible, title, details, onConfirm, onCancel,
  confirmLabel = 'Confirm Transaction', warning,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.iconWrap}>
                <Shield size={16} color={colors.primary} strokeWidth={2.5} />
              </View>
              <Text style={s.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={s.closeBtn} activeOpacity={0.7}>
              <X size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
            <View style={s.detailsBox}>
              {details.map((d, i) => (
                <View
                  key={i}
                  style={[
                    s.row,
                    i < details.length - 1 && s.rowBorder,
                    d.total && s.rowTotal,
                  ]}
                >
                  <Text style={[s.rowLabel, d.total && s.rowLabelTotal]}>{d.label}</Text>
                  <Text style={[
                    s.rowValue,
                    d.accent && s.rowValueAccent,
                    d.total && s.rowValueTotal,
                  ]}>
                    {d.value}
                  </Text>
                </View>
              ))}
            </View>

            {warning ? (
              <View style={s.warnBox}>
                <AlertTriangle size={14} color="#f59e0b" strokeWidth={2} />
                <Text style={s.warnTxt}>{warning}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={onConfirm} activeOpacity={0.85}>
              <LinearGradient
                colors={['#8B5CF6', '#6D28D9']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.confirmGrad}
              >
                <Shield size={14} color="#fff" strokeWidth={2.5} />
                <Text style={s.confirmTxt}>{confirmLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F0F1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  scroll: { paddingHorizontal: spacing.xl },
  detailsBox: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowTotal: {
    backgroundColor: 'rgba(139,92,246,0.07)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
  },
  rowLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  rowLabelTotal: { color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  rowValue: { fontSize: 13, color: colors.white, fontWeight: '700', textAlign: 'right', maxWidth: '55%' },
  rowValueAccent: { color: colors.primary },
  rowValueTotal: { fontSize: 15, color: colors.white, fontWeight: '900' },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  warnTxt: { flex: 1, fontSize: 12, color: '#fbbf24', lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  cancelTxt: { fontSize: fontSize.sm, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  confirmBtn: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  confirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 15,
    borderRadius: 12,
  },
  confirmTxt: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },
});
