import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';
import { AdminWorkspaceLayout } from './AdminWorkspaceLayout';
import { Text } from './dssText';

function asNumber(value) {
  return Number(value || 0);
}

function Metric({ icon, label, value, tone = colors.orange, note }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}1C` }]}><Ionicons name={icon} size={20} color={tone} /></View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {note ? <Text style={styles.metricNote}>{note}</Text> : null}
    </View>
  );
}

function formatRunDate(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DSSDashboardScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [scores, setScores] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashResult, scoresResult, historyResult] = await Promise.allSettled([
        api.get('/api/dss/dashboard/'),
        api.get('/api/dss/scores/'),
        api.get('/api/dss/analysis-history/'),
      ]);
      if (dashResult.status === 'fulfilled') setDashboard(dashResult.value.data || null);
      if (scoresResult.status === 'fulfilled') setScores(Array.isArray(scoresResult.value.data) ? scoresResult.value.data : []);
      if (historyResult.status === 'fulfilled') {
        const nextHistory = Array.isArray(historyResult.value.data) ? historyResult.value.data : [];
        setHistory(nextHistory);
        setSelectedRunId((current) => current || nextHistory[0]?.id || null);
      }
    } catch (error) {
      Alert.alert('AI support unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const runAnalysis = async (recalculate = false) => {
    try {
      setRunning(true);
      if (recalculate) await api.post('/api/dss/scores/');
      const { data } = await api.post('/api/dss/analysis-history/', {
        action: recalculate ? 'score_recalculation' : 'integrity_review',
      });
      setSelectedRunId(data.id);
      await loadData();
    } catch (error) {
      Alert.alert('Analysis failed', errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  const clearHistory = () => {
    if (!history.length) return;
    Alert.alert('Clear analysis history', 'This removes all recorded AI analysis runs. Current platform data will not be changed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear history', style: 'destructive', onPress: async () => {
          try {
            await api.delete('/api/dss/analysis-history/');
            setHistory([]);
            setSelectedRunId(null);
          } catch (error) {
            Alert.alert('Could not clear history', errorMessage(error));
          }
        },
      },
    ]);
  };

  const selectedRun = history.find((item) => item.id === selectedRunId);
  const source = selectedRun?.snapshot || dashboard || {};
  const fraud = source.fraud_overview || {};
  const reports = source.reports_overview || {};
  const quality = source.quality_overview || {};
  const batch = source.batch_overview || {};
  const highRisk = asNumber(fraud.high_risk);
  const pendingReports = asNumber(reports.pending);
  const batchEligible = asNumber(batch.eligible_count);
  const platformRating = asNumber(quality.avg_platform_rating);
  const qualityScore = Math.round((platformRating / 5) * 100);
  const totalScored = asNumber(fraud.total_scored);
  const averageTrust = useMemo(() => scores.length ? Math.round(scores.reduce((sum, score) => sum + asNumber(score.trust_score), 0) / scores.length) : 0, [scores]);
  const recommendedProviders = useMemo(() => scores.filter((score) => score.batch_eligible).slice(0, 3), [scores]);
  const flaggedProviders = useMemo(() => scores.filter((score) => score.fraud_risk_level === 'HIGH' || score.fraud_risk_level === 'MEDIUM').slice(0, 3), [scores]);
  const visibleHistory = history.filter((run) => !search.trim() || `${run.action_label || run.action} ${run.admin_name || ''} ${formatRunDate(run.created_at)}`.toLowerCase().includes(search.trim().toLowerCase()));

  const headerActions = (
    <>
      <TouchableOpacity style={styles.secondaryAction} onPress={() => runAnalysis(false)} disabled={running}>
        <Ionicons name="sparkles-outline" size={17} color="#40516F" />
        <Text style={styles.secondaryActionText}>Run AI Review</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryAction} onPress={() => runAnalysis(true)} disabled={running}>
        {running ? <ActivityIndicator color={colors.white} /> : <Ionicons name="refresh-outline" size={17} color={colors.white} />}
        <Text style={styles.primaryActionText}>{running ? 'Analysing...' : 'Recalculate Scores'}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <AdminWorkspaceLayout
      navigation={navigation}
      active="AI Support"
      eyebrow="Decision support"
      title="AI Support Center"
      subtitle="Live operational analysis that helps admins prioritize provider verification, trust, quality, and risk decisions."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search analysis history..."
      onRefresh={loadData}
      refreshing={loading}
      headerActions={headerActions}
    >
      {loading ? <ActivityIndicator color={colors.orange} size="large" style={{ marginTop: 54 }} /> : null}
      {!loading ? <>
        <View style={styles.layout}>
          <View style={styles.historyPanel}>
            <View style={styles.historyHeader}><View><Text style={styles.historyTitle}>Analysis History</Text><Text style={styles.historySub}>{history.length} saved run{history.length === 1 ? '' : 's'}</Text></View><TouchableOpacity onPress={clearHistory} disabled={!history.length}><Ionicons name="trash-outline" size={18} color={history.length ? colors.red : '#CBD5E1'} /></TouchableOpacity></View>
            <TouchableOpacity style={styles.newAnalysisButton} onPress={() => runAnalysis(false)} disabled={running}><Ionicons name="add-circle-outline" size={18} color={colors.white} /><Text style={styles.newAnalysisText}>New Analysis</Text></TouchableOpacity>
            {visibleHistory.length ? visibleHistory.map((run) => (
              <TouchableOpacity key={run.id} style={[styles.historyRun, selectedRunId === run.id && styles.historyRunActive]} onPress={() => setSelectedRunId(run.id)}>
                <View style={[styles.historyRunIcon, { backgroundColor: run.action === 'score_recalculation' ? '#FFF0E8' : '#E8F5EE' }]}><Ionicons name={run.action === 'score_recalculation' ? 'stats-chart-outline' : 'sparkles-outline'} size={18} color={run.action === 'score_recalculation' ? colors.orange : colors.green} /></View>
                <View style={{ flex: 1 }}><Text style={styles.historyRunTitle}>{run.action_label || run.action}</Text><Text style={styles.historyRunCopy}>{run.admin_name || 'Admin'} · {formatRunDate(run.created_at)}</Text></View>
              </TouchableOpacity>
            )) : <View style={styles.emptyHistory}><Ionicons name="time-outline" size={28} color="#94A3B8" /><Text style={styles.emptyHistoryTitle}>No saved analysis yet</Text><Text style={styles.emptyHistoryCopy}>Run an AI review to capture a backend snapshot of the system.</Text></View>}
          </View>

          <View style={styles.canvas}>
            <View style={styles.integrityPanel}>
              <View style={{ flex: 1 }}>
                <Text style={styles.integrityEyebrow}>{selectedRun ? `HISTORICAL SNAPSHOT · ${formatRunDate(selectedRun.created_at)}` : 'LIVE SYSTEM SNAPSHOT'}</Text>
                <Text style={styles.integrityTitle}>{highRisk || pendingReports ? 'Attention Required' : 'Optimal Performance'}</Text>
                <Text style={styles.integrityCopy}>{highRisk || pendingReports ? `${highRisk} elevated risk signal${highRisk === 1 ? '' : 's'} and ${pendingReports} pending report${pendingReports === 1 ? '' : 's'} need an admin decision.` : 'The current provider scoring and trust signals have no urgent risk or report backlog.'}</Text>
              </View>
              <View style={styles.integrityRing}><Text style={styles.integrityRingValue}>{Math.max(0, 100 - highRisk * 15 - pendingReports * 10)}%</Text><Text style={styles.integrityRingLabel}>CONFIDENCE</Text></View>
            </View>

            <View style={styles.metricGrid}>
              <Metric icon="people-outline" label="Providers scored" value={totalScored} tone="#3B82F6" note="Current score records" />
              <Metric icon="shield-checkmark-outline" label="Trust average" value={`${averageTrust}%`} tone={colors.green} note="Across provider scores" />
              <Metric icon="star-outline" label="Quality signal" value={`${qualityScore}%`} tone={colors.orange} note={`${quality.total_reviews || 0} reviews`} />
              <Metric icon="ribbon-outline" label="Batch candidates" value={batchEligible} tone="#8B5CF6" note="Awaiting validation" />
            </View>

            <View style={styles.sectionsGrid}>
              <View style={styles.recommendationsPanel}>
                <View style={styles.panelHead}><View><Text style={styles.panelTitle}>AI Recommendations</Text><Text style={styles.panelSub}>Generated from the currently selected backend snapshot.</Text></View><Ionicons name="bulb-outline" size={23} color={colors.orange} /></View>
                {recommendedProviders.length ? recommendedProviders.map((provider) => <TouchableOpacity key={provider.id} style={styles.recommendationRow} onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: provider.provider_id })}><View style={styles.providerDot}><Text style={styles.providerDotText}>{(provider.provider_name || 'P').slice(0, 1)}</Text></View><View style={{ flex: 1 }}><Text style={styles.recommendationTitle}>Validate {provider.provider_name}</Text><Text style={styles.recommendationCopy}>Eligible for trust-badge review with {provider.overall_score}% overall score.</Text></View><Ionicons name="chevron-forward" size={18} color="#94A3B8" /></TouchableOpacity>) : <Text style={styles.noData}>No providers currently meet the verification-batch criteria.</Text>}
                <TouchableOpacity style={styles.actionLink} onPress={() => navigation.navigate('BatchVerification')}><Text style={styles.actionLinkText}>Open Batch Verification</Text><Ionicons name="arrow-forward" size={16} color={colors.orange} /></TouchableOpacity>
              </View>
              <View style={styles.riskPanel}>
                <View style={styles.panelHead}><View><Text style={styles.panelTitle}>Risk Intelligence</Text><Text style={styles.panelSub}>Fraud signals and pending client reports.</Text></View><Ionicons name="warning-outline" size={23} color={highRisk ? colors.red : colors.green} /></View>
                <View style={styles.riskTotals}><View><Text style={styles.riskTotalValue}>{highRisk}</Text><Text style={styles.riskTotalLabel}>HIGH RISK</Text></View><View><Text style={[styles.riskTotalValue, { color: colors.orange }]}>{asNumber(fraud.medium_risk)}</Text><Text style={styles.riskTotalLabel}>MEDIUM RISK</Text></View><View><Text style={[styles.riskTotalValue, { color: colors.red }]}>{pendingReports}</Text><Text style={styles.riskTotalLabel}>REPORTS</Text></View></View>
                {flaggedProviders.length ? flaggedProviders.map((provider) => <TouchableOpacity key={provider.id} style={styles.flaggedRow} onPress={() => navigation.navigate('ProviderScoreDetail', { providerId: provider.provider_id })}><View style={[styles.flagDot, { backgroundColor: provider.fraud_risk_level === 'HIGH' ? '#FEE2E2' : '#FFF0E8' }]}><Ionicons name="warning-outline" size={16} color={provider.fraud_risk_level === 'HIGH' ? colors.red : colors.orange} /></View><Text style={styles.flaggedName}>{provider.provider_name}</Text><Text style={[styles.flaggedRisk, { color: provider.fraud_risk_level === 'HIGH' ? colors.red : colors.orange }]}>{provider.fraud_risk_level}</Text></TouchableOpacity>) : <Text style={styles.noData}>No elevated-risk provider flags in the current scoring data.</Text>}
                <View style={styles.riskActions}><TouchableOpacity style={styles.outlineAction} onPress={() => navigation.navigate('FraudAlerts')}><Text style={styles.outlineActionText}>Review Alerts</Text></TouchableOpacity><TouchableOpacity style={styles.outlineAction} onPress={() => navigation.navigate('Reports')}><Text style={styles.outlineActionText}>Review Reports</Text></TouchableOpacity></View>
              </View>
            </View>
          </View>
        </View>
      </> : null}
    </AdminWorkspaceLayout>
  );
}

const styles = StyleSheet.create({
  primaryAction: { minHeight: 42, borderRadius: 8, backgroundColor: colors.orange, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: colors.white, fontSize: 14, fontFamily: fontFamilyBold },
  secondaryAction: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#526987', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.white },
  secondaryActionText: { color: '#40516F', fontSize: 14, fontFamily: fontFamilyMedium },
  layout: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
  historyPanel: { flexBasis: 260, flexGrow: 1, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', overflow: 'hidden' },
  historyHeader: { minHeight: 71, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  historyTitle: { color: '#20242B', fontSize: 18, fontFamily: fontFamilyBold },
  historySub: { color: '#76665E', fontSize: 12, marginTop: 2, fontFamily },
  newAnalysisButton: { minHeight: 42, borderRadius: 7, backgroundColor: colors.orange, margin: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  newAnalysisText: { color: colors.white, fontSize: 13, fontFamily: fontFamilyBold },
  historyRun: { minHeight: 66, borderTopWidth: 1, borderTopColor: '#F2E3DC', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyRunActive: { backgroundColor: '#FFF7F3', borderLeftWidth: 3, borderLeftColor: colors.orange },
  historyRunIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyRunTitle: { color: '#20242B', fontSize: 13, fontFamily: fontFamilyBold },
  historyRunCopy: { color: '#76665E', fontSize: 10, marginTop: 3, fontFamily },
  emptyHistory: { padding: 24, alignItems: 'center', gap: 8 },
  emptyHistoryTitle: { color: '#40516F', fontSize: 14, fontFamily: fontFamilyBold, textAlign: 'center' },
  emptyHistoryCopy: { color: '#76665E', fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily },
  canvas: { flexBasis: 650, flexGrow: 3, gap: 18 },
  integrityPanel: { minHeight: 184, backgroundColor: '#0D2341', borderRadius: 11, padding: 26, flexDirection: 'row', alignItems: 'center', gap: 18 },
  integrityEyebrow: { color: colors.orange, fontSize: 10, letterSpacing: 1.3, fontFamily: fontFamilyBold },
  integrityTitle: { color: colors.white, fontSize: 29, marginTop: 10, fontFamily: fontFamilyBold },
  integrityCopy: { color: '#C8D4E4', fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 560, fontFamily },
  integrityRing: { width: 105, height: 105, borderRadius: 53, borderWidth: 9, borderColor: '#1D426F', alignItems: 'center', justifyContent: 'center' },
  integrityRingValue: { color: '#6EE7B7', fontSize: 22, fontFamily: fontFamilyBold },
  integrityRingLabel: { color: '#A8B7CC', fontSize: 8, marginTop: 2, fontFamily: fontFamilyBold },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: 145, minHeight: 148, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F2C9BC', padding: 16 },
  metricIcon: { width: 37, height: 37, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { color: '#64748B', fontSize: 10, marginTop: 11, letterSpacing: 0.7, textTransform: 'uppercase', fontFamily: fontFamilyBold },
  metricValue: { color: '#20242B', fontSize: 25, marginTop: 4, fontFamily: fontFamilyBold },
  metricNote: { color: '#76665E', fontSize: 11, marginTop: 3, fontFamily },
  sectionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  recommendationsPanel: { flexBasis: 350, flexGrow: 1, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', overflow: 'hidden' },
  riskPanel: { flexBasis: 320, flexGrow: 1, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', overflow: 'hidden' },
  panelHead: { minHeight: 82, padding: 17, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  panelTitle: { color: '#20242B', fontSize: 17, fontFamily: fontFamilyBold },
  panelSub: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 4, fontFamily },
  recommendationRow: { minHeight: 64, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  providerDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E7EEF9', alignItems: 'center', justifyContent: 'center' },
  providerDotText: { color: colors.orange, fontSize: 13, fontFamily: fontFamilyBold },
  recommendationTitle: { color: '#20242B', fontSize: 13, fontFamily: fontFamilyBold },
  recommendationCopy: { color: '#76665E', fontSize: 11, marginTop: 2, fontFamily },
  noData: { color: '#64748B', fontSize: 13, lineHeight: 19, padding: 18, fontFamily },
  actionLink: { minHeight: 44, paddingHorizontal: 17, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  actionLinkText: { color: colors.orange, fontSize: 13, fontFamily: fontFamilyBold },
  riskTotals: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  riskTotalValue: { color: colors.red, textAlign: 'center', fontSize: 24, fontFamily: fontFamilyBold },
  riskTotalLabel: { color: '#64748B', textAlign: 'center', fontSize: 8, marginTop: 4, fontFamily: fontFamilyBold },
  flaggedRow: { minHeight: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: '#F2E3DC' },
  flagDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flaggedName: { color: '#20242B', fontSize: 13, flex: 1, fontFamily: fontFamilyMedium },
  flaggedRisk: { fontSize: 10, fontFamily: fontFamilyBold },
  riskActions: { flexDirection: 'row', gap: 10, padding: 14 },
  outlineAction: { flex: 1, minHeight: 38, borderRadius: 7, borderWidth: 1, borderColor: '#E5B7A5', alignItems: 'center', justifyContent: 'center' },
  outlineActionText: { color: colors.orange, fontSize: 12, fontFamily: fontFamilyBold },
});
