import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';
import { AdminWorkspaceLayout, workspace } from './AdminWorkspaceLayout';
import { riskColor, scoreColor } from './dssStyles';
import { Text } from './dssText';

const FILTERS = ['All Providers', 'Batch Eligible', 'High Risk', 'Trust Verified'];

function Metric({ label, value }) {
  const percentage = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{percentage}%</Text>
      </View>
      <View style={styles.metricTrack}>
        <View style={[styles.metricFill, { width: `${percentage}%`, backgroundColor: scoreColor(percentage) }]} />
      </View>
    </View>
  );
}

function ProviderCard({ item, navigation }) {
  const verified = item.provider_badge_verification_status === 'verified';
  const risk = item.fraud_risk_level || 'LOW';
  return (
    <View style={[styles.providerCard, { borderLeftColor: riskColor(risk) }]}>
      <View style={styles.cardTop}>
        <View style={styles.initialAvatar}>
          <Text style={styles.initialAvatarText}>{(item.provider_name || 'P').slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.providerName}>{item.provider_name || 'Unnamed provider'}</Text>
            {risk === 'HIGH' ? <Text style={[styles.tag, styles.highTag]}>HIGH RISK</Text> : null}
            {verified ? <Text style={[styles.tag, styles.verifiedTag]}>VERIFIED</Text> : null}
            {item.batch_eligible && !verified ? <Text style={[styles.tag, styles.readyTag]}>BATCH READY</Text> : null}
          </View>
          <Text style={styles.providerId}>ID: PRV-{String(item.provider_id || item.id).padStart(4, '0')}</Text>
        </View>
        <TouchableOpacity style={styles.moreBtn} onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: item.provider_id })}>
          <Ionicons name="ellipsis-vertical" size={20} color="#526987" />
        </TouchableOpacity>
      </View>
      <Metric label="Activity" value={item.activity_score} />
      <Metric label="Quality" value={item.quality_score} />
      <Metric label="Reliability" value={item.reliability_score} />
      <Metric label="Trust" value={item.trust_score} />
      <View style={styles.cardFooter}>
        <View style={styles.riskChip}>
          <View style={[styles.riskDot, { backgroundColor: riskColor(risk) }]} />
          <Text style={styles.riskChipText}>{risk} RISK</Text>
        </View>
        <TouchableOpacity style={styles.detailBtn} onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: item.provider_id })}>
          <Text style={styles.detailBtnText}>View Details</Text>
          <Ionicons name="arrow-forward" color={colors.white} size={17} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ProviderScoresScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [scores, setScores] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All Providers');

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

  const recalculate = async () => {
    try {
      setRecalculating(true);
      await api.post('/api/dss/scores/');
      await loadScores();
      Alert.alert('Scores updated', 'Provider scores have been recalculated from the latest platform data.');
    } catch (error) {
      Alert.alert('Recalculation failed', errorMessage(error));
    } finally {
      setRecalculating(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scores.filter((item) => {
      const matchesSearch = !term || `${item.provider_name || ''} ${item.provider_email || ''}`.toLowerCase().includes(term);
      if (!matchesSearch) return false;
      if (filter === 'Batch Eligible') return Boolean(item.batch_eligible);
      if (filter === 'High Risk') return item.fraud_risk_level === 'HIGH';
      if (filter === 'Trust Verified') return item.trust_score >= 100 && item.is_kyc_verified;
      return true;
    });
  }, [filter, scores, search]);

  const averageHealth = useMemo(() => {
    if (!scores.length) return 0;
    return Math.round(scores.reduce((sum, item) => sum + (Number(item.overall_score) || 0), 0) / scores.length);
  }, [scores]);
  const highRisk = scores.filter((item) => item.fraud_risk_level === 'HIGH').length;
  const batchReady = scores.filter((item) => item.batch_eligible).length;

  const headerActions = (
    <>
      <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.navigate('DSSAIPanel')}>
        <Ionicons name="sparkles-outline" size={17} color="#40516F" />
        <Text style={styles.secondaryActionText}>AI Support</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryAction} onPress={recalculate} disabled={recalculating}>
        {recalculating ? <ActivityIndicator color={colors.white} /> : <Ionicons name="refresh-outline" size={17} color={colors.white} />}
        <Text style={styles.primaryActionText}>{recalculating ? 'Updating...' : 'Recalculate Scores'}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <AdminWorkspaceLayout
      navigation={navigation}
      active="Provider Scores"
      title="Provider Scores Overview"
      subtitle="Monitor real provider performance, trust signals, and batch-verification readiness from current platform data."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search provider ID, name, or email..."
      onRefresh={loadScores}
      refreshing={loading}
      headerActions={headerActions}
    >
      <View style={styles.healthCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.healthLabel}>GLOBAL PROVIDER HEALTH</Text>
          <Text style={styles.healthValue}>{averageHealth}<Text style={styles.healthOutOf}> / 100</Text></Text>
          <Text style={styles.healthCopy}>{scores.length} scored provider{scores.length === 1 ? '' : 's'} currently monitored</Text>
        </View>
        <View style={styles.healthRight}>
          <Text style={styles.healthRightValue}>{batchReady}</Text>
          <Text style={styles.healthRightLabel}>BATCH READY</Text>
          <Text style={[styles.healthRisk, { color: highRisk ? '#FECACA' : '#6EE7B7' }]}>{highRisk ? `${highRisk} HIGH-RISK FLAG${highRisk === 1 ? '' : 'S'}` : 'NO HIGH-RISK FLAGS'}</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.filterSet}>
          {FILTERS.map((item) => (
            <TouchableOpacity key={item} style={[styles.filterButton, filter === item && styles.filterButtonActive]} onPress={() => setFilter(item)}>
              <Text style={[styles.filterButtonText, filter === item && styles.filterButtonTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.sortText}>SORT: TRUST SCORE</Text>
      </View>

      {loading ? <ActivityIndicator color={colors.orange} size="large" style={{ marginTop: 40 }} /> : null}
      {!loading && filtered.length === 0 ? <Text style={styles.emptyText}>No providers match this view.</Text> : null}
      {!loading && filtered.length ? (
        <View style={styles.cardGrid}>
          {filtered.map((item) => <ProviderCard key={item.id} item={item} navigation={navigation} />)}
        </View>
      ) : null}

      <View style={styles.bottomGrid}>
        <View style={styles.alertsPanel}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionHeading}>Recent Risk Alerts</Text>
            <TouchableOpacity onPress={() => navigation.navigate('FraudAlerts')}><Text style={styles.linkText}>View alerts</Text></TouchableOpacity>
          </View>
          {scores.filter((item) => item.fraud_risk_level === 'HIGH' || item.fraud_risk_level === 'MEDIUM').slice(0, 3).map((item) => (
            <TouchableOpacity key={item.id} style={styles.alertRow} onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: item.provider_id })}>
              <View style={[styles.alertIcon, { backgroundColor: `${riskColor(item.fraud_risk_level)}22` }]}><Ionicons name="warning-outline" size={20} color={riskColor(item.fraud_risk_level)} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{item.provider_name} - {item.fraud_risk_level} risk</Text>
                <Text style={styles.alertCopy}>{(item.fraud_flags || [])[0] || 'Review score inputs and current activity.'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ))}
          {!scores.some((item) => item.fraud_risk_level === 'HIGH' || item.fraud_risk_level === 'MEDIUM') ? <Text style={styles.noAlerts}>No elevated-risk provider signals right now.</Text> : null}
        </View>
        <View style={styles.legendPanel}>
          <Text style={styles.sectionHeading}>Risk Legend</Text>
          {[['Verified safe', '90-100', colors.green], ['Needs review', '60-89', colors.orange], ['Critical danger', '< 60', colors.red]].map(([label, range, color]) => (
            <View key={label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text><Text style={styles.legendRange}>{range}</Text></View>
          ))}
        </View>
      </View>
    </AdminWorkspaceLayout>
  );
}

const styles = StyleSheet.create({
  primaryAction: { minHeight: 42, borderRadius: 8, backgroundColor: colors.orange, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: colors.white, fontSize: 14, fontFamily: fontFamilyBold, fontWeight: '900' },
  secondaryAction: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#526987', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.white },
  secondaryActionText: { color: '#40516F', fontSize: 14, fontFamily: fontFamilyMedium },
  healthCard: { backgroundColor: '#0D2341', borderRadius: 12, padding: 24, minHeight: 150, flexDirection: 'row', justifyContent: 'space-between', gap: 20 },
  healthLabel: { color: '#F97316', fontSize: 11, letterSpacing: 1.5, fontFamily: fontFamilyBold, fontWeight: '900' },
  healthValue: { color: colors.white, fontSize: 46, marginTop: 7, fontFamily: fontFamilyBold, fontWeight: '900' },
  healthOutOf: { color: '#94A3B8', fontSize: 17, fontFamily: fontFamilyMedium },
  healthCopy: { color: '#A8B7CC', marginTop: 4, fontSize: 14, fontFamily },
  healthRight: { alignItems: 'flex-end', justifyContent: 'center' },
  healthRightValue: { color: '#6EE7B7', fontSize: 32, fontFamily: fontFamilyBold, fontWeight: '900' },
  healthRightLabel: { color: '#B9C5D8', fontSize: 10, letterSpacing: 1.1, fontFamily: fontFamilyBold },
  healthRisk: { fontSize: 11, marginTop: 12, fontFamily: fontFamilyBold },
  filterBar: { minHeight: 64, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: colors.white, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  filterSet: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
  filterButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 7, justifyContent: 'center' },
  filterButtonActive: { backgroundColor: colors.orange, borderWidth: 1, borderColor: '#A34515' },
  filterButtonText: { color: '#526987', fontSize: 14, fontFamily: fontFamilyMedium },
  filterButtonTextActive: { color: colors.white, fontFamily: fontFamilyBold },
  sortText: { color: '#64748B', fontSize: 11, letterSpacing: 0.9, fontFamily: fontFamilyBold },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  providerCard: { width: 300, maxWidth: '100%', flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', borderLeftWidth: 4, backgroundColor: colors.white, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  initialAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E7EEF9', alignItems: 'center', justifyContent: 'center' },
  initialAvatarText: { color: colors.orange, fontFamily: fontFamilyBold, fontSize: 14 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  providerName: { color: '#20242B', fontSize: 20, fontFamily: fontFamilyBold, fontWeight: '900', flexShrink: 1 },
  providerId: { color: '#8B7A72', fontSize: 11, marginTop: 3, letterSpacing: 0.8, fontFamily: fontFamilyMedium },
  tag: { fontSize: 9, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontFamily: fontFamilyBold },
  highTag: { color: '#B91C1C', backgroundColor: '#FEE2E2' },
  verifiedTag: { color: '#047857', backgroundColor: '#D1FAE5' },
  readyTag: { color: '#9A3412', backgroundColor: '#FFEDD5' },
  moreBtn: { width: 34, height: 34, borderRadius: 7, borderWidth: 1, borderColor: '#D8C4BA', alignItems: 'center', justifyContent: 'center' },
  metric: { marginTop: 9 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: '#64748B', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontFamily: fontFamilyBold },
  metricValue: { color: '#20242B', fontSize: 12, fontFamily: fontFamilyBold },
  metricTrack: { height: 6, backgroundColor: '#E5E7EB', marginTop: 5, borderRadius: 3, overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 3 },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#F0E7E2', marginTop: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  riskChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  riskChipText: { color: '#526987', fontSize: 10, fontFamily: fontFamilyBold },
  detailBtn: { minHeight: 38, borderRadius: 7, backgroundColor: colors.orange, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailBtnText: { color: colors.white, fontSize: 12, fontFamily: fontFamilyBold },
  emptyText: { textAlign: 'center', color: '#64748B', fontSize: 15, paddingVertical: 40, fontFamily },
  bottomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  alertsPanel: { flexGrow: 1, flexBasis: 560, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: colors.white, overflow: 'hidden' },
  legendPanel: { flexGrow: 1, flexBasis: 250, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: colors.white, padding: 18 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  sectionHeading: { color: '#20242B', fontSize: 18, fontFamily: fontFamilyBold, fontWeight: '900' },
  linkText: { color: colors.orange, fontSize: 13, fontFamily: fontFamilyBold },
  alertRow: { minHeight: 76, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  alertIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: '#20242B', fontSize: 14, fontFamily: fontFamilyBold },
  alertCopy: { color: '#6B7280', fontSize: 12, marginTop: 3, fontFamily },
  noAlerts: { color: '#64748B', fontSize: 14, padding: 20, fontFamily },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#374151', fontSize: 13, fontFamily },
  legendRange: { marginLeft: 'auto', color: '#8B7A72', fontSize: 12, fontFamily: fontFamilyMedium },
});
