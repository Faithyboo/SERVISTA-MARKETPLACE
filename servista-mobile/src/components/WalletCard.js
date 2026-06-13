import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, formatMoney } from '../theme/colors';

export default function WalletCard({ balance, onFund, onWithdraw }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>AVAILABLE BALANCE</Text>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatMoney(balance).replace(' FCFA', '')}</Text>
        <Text style={styles.currency}>XAF</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity activeOpacity={0.8} onPress={onFund} style={styles.fundButton}>
          <Text style={styles.fundText}>Fund Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={onWithdraw} style={styles.withdrawButton}>
          <Text style={styles.withdrawText}>Withdraw</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#DBEAFE', borderRadius: 28, padding: 24, gap: 16 },
  label: { color: colors.textGray, fontSize: 11, fontWeight: '900' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  amount: { color: colors.textDark, fontSize: 48, fontWeight: '900' },
  currency: { color: colors.textGray, fontSize: 13, fontWeight: '900', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 12 },
  fundButton: { flex: 1, height: 52, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  withdrawButton: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  fundText: { color: colors.white, fontWeight: '900' },
  withdrawText: { color: colors.orange, fontWeight: '900' }
});
