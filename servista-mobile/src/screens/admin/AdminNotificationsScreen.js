import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';
import { AdminWorkspaceLayout } from './AdminWorkspaceLayout';
import { Text } from './dssText';

const TONE_COLORS = {
  success: colors.green,
  warning: colors.orange,
  danger: colors.red,
  blue: '#3B82F6',
};

function displayTime(value) {
  if (!value) return 'Now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminNotificationsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/users/notifications/');
      setItems(Array.isArray(data) ? data : []);
      await api.post('/api/users/notifications/read/');
    } catch (error) {
      Alert.alert('Notifications unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const clearAll = () => {
    if (!items.length) return;
    Alert.alert('Clear notifications', 'Remove every notification from this admin account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all', style: 'destructive', onPress: async () => {
          try {
            await api.post('/api/users/notifications/clear/');
            setItems([]);
          } catch (error) {
            Alert.alert('Could not clear notifications', errorMessage(error));
          }
        },
      },
    ]);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => `${item.title || ''} ${item.message || ''} ${item.detail || ''}`.toLowerCase().includes(term));
  }, [items, search]);
  const unread = items.filter((item) => !item.is_read).length;

  const headerActions = (
    <TouchableOpacity style={[styles.clearButton, !items.length && styles.clearButtonDisabled]} onPress={clearAll} disabled={!items.length}>
      <Ionicons name="trash-outline" size={17} color={items.length ? colors.red : '#94A3B8'} />
      <Text style={[styles.clearButtonText, !items.length && styles.clearButtonTextDisabled]}>Clear All</Text>
    </TouchableOpacity>
  );

  return (
    <AdminWorkspaceLayout
      navigation={navigation}
      title="Admin Notifications"
      eyebrow="Live activity"
      subtitle="Account notifications created by escrow, verification, wallet, and platform operations."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search notifications..."
      onRefresh={load}
      refreshing={loading}
      headerActions={headerActions}
    >
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}><Ionicons name="notifications-outline" size={23} color={colors.orange} /><View><Text style={styles.summaryValue}>{items.length}</Text><Text style={styles.summaryLabel}>TOTAL NOTIFICATIONS</Text></View></View>
        <View style={styles.summaryCard}><Ionicons name="mail-unread-outline" size={23} color={unread ? colors.red : colors.green} /><View><Text style={styles.summaryValue}>{unread}</Text><Text style={styles.summaryLabel}>UNREAD WHEN OPENED</Text></View></View>
      </View>
      <View style={styles.listPanel}>
        <View style={styles.listHeader}><Text style={styles.listTitle}>Notification Feed</Text><Text style={styles.listMeta}>{filtered.length} item{filtered.length === 1 ? '' : 's'}</Text></View>
        {loading ? <ActivityIndicator color={colors.orange} size="large" style={{ margin: 42 }} /> : null}
        {!loading && !filtered.length ? <View style={styles.empty}><Ionicons name="notifications-off-outline" size={38} color="#94A3B8" /><Text style={styles.emptyTitle}>No notifications</Text><Text style={styles.emptyCopy}>New platform events addressed to this admin account will appear here.</Text></View> : null}
        {!loading && filtered.map((item) => {
          const tone = TONE_COLORS[item.tone] || '#3B82F6';
          return <TouchableOpacity key={item.id} style={[styles.item, !item.is_read && styles.itemUnread]} activeOpacity={0.82} onPress={() => Alert.alert(item.title || 'Notification', item.detail || item.message || 'No additional detail is available.')}>
            <View style={[styles.itemIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={item.icon || 'notifications-outline'} size={22} color={tone} /></View>
            <View style={{ flex: 1 }}><Text style={styles.itemTitle}>{item.title || 'Platform notification'}</Text><Text style={styles.itemMessage}>{item.message || item.detail || 'No message provided.'}</Text>{item.detail && item.detail !== item.message ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}</View>
            <Text style={styles.itemTime}>{displayTime(item.time || item.created_at)}</Text>
          </TouchableOpacity>;
        })}
      </View>
    </AdminWorkspaceLayout>
  );
}

const styles = StyleSheet.create({
  clearButton: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: colors.white, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  clearButtonDisabled: { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  clearButtonText: { color: colors.red, fontSize: 14, fontFamily: fontFamilyBold },
  clearButtonTextDisabled: { color: '#94A3B8' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  summaryCard: { flexGrow: 1, flexBasis: 220, minHeight: 92, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: colors.white, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryValue: { color: '#20242B', fontSize: 24, fontFamily: fontFamilyBold },
  summaryLabel: { color: '#64748B', fontSize: 10, letterSpacing: 0.8, marginTop: 3, fontFamily: fontFamilyBold },
  listPanel: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', overflow: 'hidden' },
  listHeader: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  listTitle: { color: '#20242B', fontSize: 18, fontFamily: fontFamilyBold },
  listMeta: { color: '#64748B', fontSize: 12, fontFamily: fontFamilyMedium },
  item: { minHeight: 88, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 13, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  itemUnread: { backgroundColor: '#FFF9F6', borderLeftWidth: 3, borderLeftColor: colors.orange },
  itemIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: '#20242B', fontSize: 15, fontFamily: fontFamilyBold },
  itemMessage: { color: '#526987', fontSize: 13, lineHeight: 19, marginTop: 4, fontFamily },
  itemDetail: { color: '#76665E', fontSize: 12, lineHeight: 18, marginTop: 5, fontFamily },
  itemTime: { color: '#64748B', fontSize: 10, maxWidth: 86, textAlign: 'right', fontFamily: fontFamilyMedium },
  empty: { padding: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { color: '#40516F', fontSize: 16, fontFamily: fontFamilyBold },
  emptyCopy: { color: '#64748B', fontSize: 13, textAlign: 'center', maxWidth: 400, lineHeight: 19, fontFamily },
});
