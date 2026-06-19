import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { dssStyles, riskColor } from './dssStyles';
import { Text } from './dssText';

const RISK_FILTERS = ['HIGH', 'MEDIUM'];

export default function FraudAlertsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState('HIGH');
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState([]);

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/api/dss/fraud-alerts/?risk=${risk}`);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Fraud alerts unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [risk]);

  useFocusEffect(useCallback(() => { loadAlerts(); }, [loadAlerts]));

  const visible = alerts.filter((a) => !dismissed.includes(a.provider_id));

  const dismiss = (providerId) => {
    Alert.alert('Dismiss alert', 'Remove this alert from your view?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss', onPress: () => setDismissed((prev) => [...prev, providerId]) },
    ]);
  };

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <View style={dssStyles.header}>
          <Ionicons name="warning" size={28} color={colors.red} />
          <Text style={dssStyles.headerTitle}>Fraud Alerts</Text>
        </View>

        <View style={dssStyles.filterRow}>
          {RISK_FILTERS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[dssStyles.filterPill, risk === r && dssStyles.filterPillActive]}
              onPress={() => setRisk(r)}
            >
              <Text style={[dssStyles.filterText, risk === r && dssStyles.filterTextActive]}>
                {r} RISK
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
        ) : visible.length === 0 ? (
          <Text style={dssStyles.emptyText}>No {risk} risk alerts at this time.</Text>
        ) : (
          visible.map((item) => {
            const flags = Array.isArray(item.fraud_flags) ? item.fraud_flags : [];
            return (
              <View key={item.id} style={dssStyles.card}>
                <View style={dssStyles.row}>
                  <View style={[dssStyles.avatar, { width: 44, height: 44, borderRadius: 14 }]}>
                    <Text style={dssStyles.avatarText}>
                      {(item.provider_name || 'P').slice(0, 1)}
                    </Text>
                  </View>
                  <View style={dssStyles.flex}>
                    <Text style={dssStyles.providerName}>{item.provider_name}</Text>
                    <View style={[dssStyles.badge, { backgroundColor: riskColor(item.fraud_risk_level), marginTop: 6 }]}>
                      <Text style={dssStyles.badgeText}>{item.fraud_risk_level} - {item.fraud_risk_points} pts</Text>
                    </View>
                  </View>
                </View>

                {flags.map((flag, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Ionicons name="alert-circle" size={16} color={riskColor(item.fraud_risk_level)} />
                    <Text style={[dssStyles.cardSubtext, { flex: 1 }]}>{flag}</Text>
                  </View>
                ))}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={[dssStyles.primaryBtn, { flex: 1 }]}
                    onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: item.provider_id })}
                  >
                    <Text style={dssStyles.primaryBtnText}>REVIEW PROVIDER</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[dssStyles.outlineBtn, { flex: 1 }]}
                    onPress={() => dismiss(item.provider_id)}
                  >
                    <Text style={dssStyles.outlineBtnText}>DISMISS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
