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
import { ADMIN_NAVY, dssStyles, riskColor, scoreColor } from './dssStyles';
import { Text, TextInput } from './dssText';

const FILTERS = ['All', 'Batch Eligible', 'High Risk', 'Medium Risk', 'Low Risk'];
const FILTER_MAP = { 'High Risk': 'HIGH', 'Medium Risk': 'MEDIUM', 'Low Risk': 'LOW' };

function ScoreBar({ label, value }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  return (
    <View style={{ flex: 1 }}>
      <View style={dssStyles.rowBetween}>
        <Text style={dssStyles.scoreBarLabel}>{label}</Text>
        <Text style={dssStyles.scoreBarValue}>{pct}%</Text>
      </View>
      <View style={dssStyles.scoreBarTrack}>
        <View style={[dssStyles.scoreBarFill, { width: `${pct}%`, backgroundColor: scoreColor(pct) }]} />
      </View>
    </View>
  );
}

export default function ProviderScoresScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const loadScores = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/dss/scores/');
      setScores(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Scores unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadScores(); }, [loadScores]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scores.filter((item) => {
      const name = (item.provider_name || '').toLowerCase();
      const matchSearch = !term || name.includes(term);
      if (filter === 'Batch Eligible') return matchSearch && item.batch_eligible;
      const riskFilter = FILTER_MAP[filter];
      const matchRisk = !riskFilter || item.fraud_risk_level === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [scores, search, filter]);

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <Text style={dssStyles.headerTitle}>Provider Scores</Text>
        <Text style={[dssStyles.cardSubtext, { marginBottom: 4 }]}>
          Badge eligible: approved KYC, Trust 100%, Activity/Reliability/Quality at least 50%, no complaints
        </Text>

        <View style={dssStyles.searchBox}>
          <Ionicons name="search-outline" size={20} color="#8FA0B8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search providers..."
            placeholderTextColor="#8FA0B8"
            style={dssStyles.searchInput}
          />
        </View>

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
          <Text style={dssStyles.emptyText}>No provider scores found. Tap Recalculate on the AI Panel.</Text>
        ) : (
          filtered.map((item) => (
            <View key={item.id} style={dssStyles.card}>
              <View style={dssStyles.row}>
                <View style={dssStyles.avatar}>
                  <Text style={dssStyles.avatarText}>
                    {(item.provider_name || 'P').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={dssStyles.flex}>
                  <Text style={dssStyles.providerName}>{item.provider_name}</Text>
                  {item.total_reviews > 0 ? (
                    <Text style={dssStyles.cardSubtext}>
                      {item.average_rating} ★ · {item.total_reviews} review{item.total_reviews === 1 ? '' : 's'} · {item.satisfaction_rate}% satisfied
                    </Text>
                  ) : (
                    <Text style={dssStyles.cardSubtext}>No reviews yet</Text>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <View style={[dssStyles.badge, { backgroundColor: riskColor(item.fraud_risk_level) }]}>
                      <Text style={dssStyles.badgeText}>{item.fraud_risk_level} RISK</Text>
                    </View>
                    {item.batch_eligible ? (
                      <View style={[dssStyles.badge, { backgroundColor: colors.green }]}>
                        <Text style={dssStyles.badgeText}>BATCH ELIGIBLE</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={[dssStyles.scoreCircle, { backgroundColor: scoreColor(item.overall_score) }]}>
                  <Text style={dssStyles.scoreCircleText}>{item.overall_score}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <ScoreBar label="Activity" value={item.activity_score} />
                <ScoreBar label="Quality" value={item.quality_score} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <ScoreBar label="Reliability" value={item.reliability_score} />
                <ScoreBar label="Trust" value={item.trust_score} />
              </View>

              <TouchableOpacity
                style={[dssStyles.outlineBtn, { marginTop: 14 }]}
                onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: item.provider_id })}
              >
                <Text style={dssStyles.outlineBtnText}>VIEW DETAILS</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
