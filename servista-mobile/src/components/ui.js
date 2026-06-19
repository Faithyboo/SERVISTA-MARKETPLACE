import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, StyleSheet, Text as RNText, TextInput, TouchableOpacity, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../theme/colors';
import { withFont } from '../theme/typography';

function Text({ children, ...props }) {
  const { tn } = useLanguage();
  return <RNText {...props} style={withFont(props.style)}>{tn(children)}</RNText>;
}

export function Logo({ dark = false }) {
  return (
    <View style={styles.logoRow}>
      <View style={styles.logoMark}><Ionicons name="shield-checkmark" size={22} color={colors.white} /></View>
      <Text style={[styles.logoText, dark && { color: colors.white }]}>Servista</Text>
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', loading = false, icon }) {
  const secondary = variant === 'secondary';
  const { t } = useLanguage();
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={loading} style={[styles.button, secondary && styles.secondaryButton]}>
      {loading ? <ActivityIndicator color={secondary ? colors.navy : colors.white} /> : (
        <>
          <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{t(label)}</Text>
          {icon ? <Ionicons name={icon} size={18} color={secondary ? colors.navy : colors.white} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

export function Input({ icon, right, style, inputStyle, ...props }) {
  const { t } = useLanguage();
  return (
    <View style={[styles.inputWrap, style]}>
      {icon ? <Ionicons name={icon} size={18} color={colors.subtext} /> : null}
      <TextInput placeholderTextColor={colors.subtext} style={withFont([styles.input, inputStyle])} {...props} placeholder={props.placeholder ? t(props.placeholder) : props.placeholder} />
      {right}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'success' }) {
  const bg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'blue' ? colors.blue : colors.success;
  const { t } = useLanguage();
  return <View style={[styles.badge, { backgroundColor: bg }]}><Text style={styles.badgeText}>{t(label)}</Text></View>;
}

export function Avatar({ uri, size = 48 }) {
  const imageUri = uri
    ? (String(uri).startsWith('http') || String(uri).startsWith('file:') ? uri : `${API_BASE_URL}${uri}`)
    : null;

  if (!imageUri) {
    return (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name="person-outline" size={Math.max(20, size * 0.48)} color={colors.textGray} />
      </View>
    );
  }

  return <Image source={{ uri: imageUri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border }} />;
}

export function TrustBadge({ size = 24, style }) {
  const petalSize = Math.max(6, Math.round(size * 0.34));
  const coreSize = Math.round(size * 0.76);
  const coreOffset = Math.round((size - coreSize) / 2);
  const middle = Math.round((size - petalSize) / 2);
  const end = size - petalSize;
  const petals = [
    { top: 0, left: middle },
    { top: end, left: middle },
    { top: middle, left: 0 },
    { top: middle, left: end },
    { top: Math.round(size * 0.12), left: Math.round(size * 0.12) },
    { top: Math.round(size * 0.12), left: Math.round(size * 0.54) },
    { top: Math.round(size * 0.54), left: Math.round(size * 0.12) },
    { top: Math.round(size * 0.54), left: Math.round(size * 0.54) },
  ];

  return (
    <View style={[styles.trustBadgeSeal, { width: size, height: size }, style]}>
      {petals.map((petal, index) => (
        <View
          key={index}
          style={[
            styles.trustBadgePetal,
            {
              width: petalSize,
              height: petalSize,
              borderRadius: petalSize / 2,
              top: petal.top,
              left: petal.left,
            },
          ]}
        />
      ))}
      <View
        style={[
          styles.trustBadgeCore,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            top: coreOffset,
            left: coreOffset,
          },
        ]}
      >
        <Ionicons name="checkmark-sharp" size={Math.max(15, Math.round(size * 0.66))} color={colors.white} />
      </View>
    </View>
  );
}

export function AvatarWithTrustBadge({ uri, size = 48, verified = false }) {
  const badgeSize = Math.max(22, Math.round(size * 0.44));
  const outerPad = verified ? Math.ceil(badgeSize * 0.45) : 0;
  return (
    <View style={[styles.avatarBadgeWrap, { width: size + outerPad, height: size + outerPad }]}>
      <Avatar uri={uri} size={size} />
      {verified ? (
        <View style={styles.trustBadgeAnchor}>
          <TrustBadge size={badgeSize} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  logoText: { fontSize: 22, fontWeight: '800', color: colors.text },
  button: { minWidth: 120, height: 52, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  secondaryButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.navy },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  secondaryButtonText: { color: colors.navy },
  inputWrap: { minHeight: 52, borderRadius: 12, backgroundColor: colors.inputBackground, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 12 },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 16, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  avatarFallback: { backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  avatarBadgeWrap: { overflow: 'visible', position: 'relative', justifyContent: 'flex-start', alignItems: 'flex-start' },
  trustBadgeSeal: {
    position: 'relative',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  trustBadgePetal: {
    position: 'absolute',
    backgroundColor: colors.blue,
  },
  trustBadgeCore: {
    position: 'absolute',
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.white,
    borderWidth: 1.5,
  },
  trustBadgeAnchor: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 8,
  },
});
