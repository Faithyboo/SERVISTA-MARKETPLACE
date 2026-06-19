import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { ADMIN_NAVY, dssStyles } from './dssStyles';
import { Text } from './dssText';

const FILTERS = ['All', 'Pending', 'Investigating', 'Resolved', 'Dismissed'];
const FILTER_MAP = {
  Pending: 'pending',
  Investigating: 'investigating',
  Resolved: 'resolved',
  Dismissed: 'dismissed',
};

const REASON_LABELS = {
  no_show: 'No Show',
  poor_quality: 'Poor Quality',
  fraud: 'Fraud',
  overcharging: 'Overcharging',
  fake_reviews: 'Fake Reviews',
  other: 'Other',
};

const STATUS_COLORS = {
  pending: colors.orange,
  investigating: '#3B82F6',
  resolved: colors.green,
  dismissed: colors.textGray,
};

export default function ReportsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('All');

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/dss/reports/');
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Reports unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadReports(); }, [loadReports]));

  const filtered = useMemo(() => {
    const status = FILTER_MAP[filter];
    if (!status) return reports;
    return reports.filter((r) => r.status === status);
  }, [reports, filter]);

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <Text style={dssStyles.headerTitle}>Provider Reports</Text>

        <View style={dssStyles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[dssStyles.filterPill, filter === f && dssStyles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[dssStyles.filterText, filter === f && dssStyles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
        ) : filtered.length === 0 ? (
          <Text style={dssStyles.emptyText}>No reports found.</Text>
        ) : (
          filtered.map((item) => (
            <View key={item.id} style={dssStyles.card}>
              <Text style={dssStyles.providerName}>
                {item.reporter_name} → {item.provider_name}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <View style={[dssStyles.badge, { backgroundColor: ADMIN_NAVY }]}>
                  <Text style={dssStyles.badgeText}>{REASON_LABELS[item.reason] || item.reason}</Text>
                </View>
                <View style={[dssStyles.badge, { backgroundColor: STATUS_COLORS[item.status] || colors.textGray }]}>
                  <Text style={dssStyles.badgeText}>{(item.status || '').toUpperCase()}</Text>
                </View>
              </View>
              <Text style={dssStyles.cardSubtext}>
                Filed {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
              </Text>
              <TouchableOpacity
                style={[dssStyles.outlineBtn, { marginTop: 12 }]}
                onPress={() => navigation.navigate('ReportDetail', { reportId: item.id })}
              >
                <Text style={dssStyles.outlineBtnText}>INVESTIGATE</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
