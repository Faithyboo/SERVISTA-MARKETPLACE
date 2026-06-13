import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, formatMoney } from '../theme/colors';

export default function ServiceCard({ title, price, providerName, category, rating = '4.9', isVerified = true, image, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.card}>
      <View style={styles.imageWrap}>
        {image ? <Image source={{ uri: image }} style={styles.image} /> : <View style={styles.placeholder} />}
        {isVerified ? (
          <View style={styles.verified}>
            <Ionicons name="checkmark-circle" size={14} color={colors.white} />
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        ) : null}
        <TouchableOpacity activeOpacity={0.8} style={styles.heart}>
          <Ionicons name="heart-outline" size={18} color={colors.textDark} />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={colors.textGray} />
          <Text style={styles.meta}>{providerName || category || 'Servista Provider'}</Text>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.meta}>{rating}</Text>
        </View>
        <View style={styles.footer}>
          <View>
            <Text style={styles.starting}>STARTING AT</Text>
            <Text style={styles.price}>{formatMoney(price)}</Text>
          </View>
          <View style={styles.bookButton}>
            <Text style={styles.bookText}>Book Now</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  imageWrap: { height: 180, backgroundColor: colors.inputBg },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, backgroundColor: colors.inputBg },
  verified: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  verifiedText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  heart: { position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 8 },
  title: { color: colors.textDark, fontSize: 18, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: colors.textGray, fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  starting: { color: colors.textGray, fontSize: 10, fontWeight: '900' },
  price: { color: colors.textDark, fontSize: 16, fontWeight: '900' },
  bookButton: { backgroundColor: colors.orange, borderRadius: 14, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  bookText: { color: colors.white, fontWeight: '900' }
});
