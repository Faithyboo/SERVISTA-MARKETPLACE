import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';
import { AdminWorkspaceLayout } from './AdminWorkspaceLayout';
import { Text } from './dssText';

function amount(value) {
  return `${Number(value || 0).toLocaleString()} FCFA`;
}

function FeedRow({ icon, tone, title, copy, time, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.feedRow} onPress={onPress} activeOpacity={onPress ? 0.82 : 1}>
      <View style={[styles.feedIcon, { backgroundColor: `${tone}1F` }]}><Ionicons name={icon} size={19} color={tone} /></View>
      <View style={{ flex: 1 }}><Text style={styles.feedTitle}>{title}</Text><Text style={styles.feedCopy}>{copy}</Text></View>
      <Text style={styles.feedTime}>{time}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={17} color="#B2A39B" /> : null}
    </Wrapper>
  );
}

export default function SystemHealthScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ dss: null, users: [], kyc: [], refunds: [], pinResets: [] });
  const [search, setSearch] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        api.get('/api/dss/dashboard/'),
        api.get('/api/users/admin/users/'),
        api.get('/api/users/admin/kyc/'),
        api.get('/api/bookings/admin/refunds/'),
        api.get('/api/wallet/admin/pin-resets/'),
      ]);
      const unwrap = (index, fallback) => results[index]?.status === 'fulfilled' ? results[index].value.data : fallback;
      setData({
        dss: unwrap(0, null),
        users: Array.isArray(unwrap(1, [])) ? unwrap(1, []) : [],
        kyc: Array.isArray(unwrap(2, [])) ? unwrap(2, []) : [],
        refunds: Array.isArray(unwrap(3, [])) ? unwrap(3, []) : [],
        pinResets: Array.isArray(unwrap(4, [])) ? unwrap(4, []) : [],
      });
    } catch (error) {
      Alert.alert('System health unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const dss = data.dss || {};
  const fraud = dss.fraud_overview || {};
  const reports = dss.reports_overview || {};
  const quality = dss.quality_overview || {};
  const pendingRefunds = data.refunds.filter((item) => (item.status || '').toLowerCase() === 'pending');
  const totalRefundValue = pendingRefunds.reduce((sum, item) => sum + Number(item.amount || item.booking?.amount || 0), 0);
  const providers = data.users.filter((item) => item.role === 'provider');
  const verifiedProviders = providers.filter((item) => item.provider_badge_verification_status === 'verified').length;
  const unresolved = (fraud.high_risk || 0) + (reports.pending || 0) + pendingRefunds.length;
  const healthScore = Math.max(0, Math.min(100, 100 - ((fraud.high_risk || 0) * 12) - ((reports.pending || 0) * 8) - (pendingRefunds.length * 3)));
  const serverState = unresolved ? 'Attention needed' : 'Optimal';

  const feed = useMemo(() => {
    const rows = [];
    if (data.kyc.length) rows.push({ id: 'kyc', icon: 'shield-checkmark-outline', tone: colors.green, title: `${data.kyc.length} provider KYC request${data.kyc.length === 1 ? '' : 's'} awaiting review`, copy: 'Identity documents are ready for manual validation.', time: 'Live', action: () => navigation.navigate('Tabs', { screen: 'Verify' }), critical: false });
    if (pendingRefunds.length) rows.push({ id: 'refund', icon: 'cash-outline', tone: colors.orange, title: `${pendingRefunds.length} pending refund${pendingRefunds.length === 1 ? '' : 's'}`, copy: `${amount(totalRefundValue)} remains in admin review.`, time: 'Live', action: () => navigation.navigate('Tabs', { screen: 'Disputes' }), critical: true });
    if (fraud.high_risk) rows.push({ id: 'fraud', icon: 'warning-outline', tone: colors.red, title: `${fraud.high_risk} high-risk provider signal${fraud.high_risk === 1 ? '' : 's'}`, copy: 'AI risk thresholds require review before batch approval.', time: 'Live', action: () => navigation.navigate('FraudAlerts'), critical: true });
    if (reports.pending) rows.push({ id: 'reports', icon: 'chatbox-ellipses-outline', tone: colors.orange, title: `${reports.pending} unresolved provider report${reports.pending === 1 ? '' : 's'}`, copy: 'Customer reports are waiting for an investigation decision.', time: 'Live', action: () => navigation.navigate('Reports'), critical: true });
    if (data.pinResets.length) rows.push({ id: 'pin', icon: 'key-outline', tone: '#3B82F6', title: `${data.pinResets.length} PIN reset request${data.pinResets.length === 1 ? '' : 's'}`, copy: 'Wallet security requests are awaiting admin action.', time: 'Live', action: () => navigation.navigate('Tabs', { screen: 'Pin Resets' }), critical: false });
    if (!rows.length) rows.push({ id: 'healthy', icon: 'checkmark-circle-outline', tone: colors.green, title: 'All monitored queues are clear', copy: 'There are no active KYC, refund, risk, report, or PIN-reset actions.', time: 'Live', critical: false });
    return rows;
  }, [data.kyc.length, data.pinResets.length, fraud.high_risk, navigation, pendingRefunds.length, reports.pending, totalRefundValue]);

  const visibleFeed = feed.filter((item) => {
    const matchesRisk = !criticalOnly || item.critical;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || `${item.title} ${item.copy}`.toLowerCase().includes(term);
    return matchesRisk && matchesSearch;
  });
  const headerActions = (
    <TouchableOpacity style={styles.reviewAction} onPress={() => navigation.navigate('Tabs', { screen: unresolved ? 'Disputes' : 'Dashboard' })}>
      <Ionicons name="pulse-outline" size={17} color={colors.white} /><Text style={styles.reviewActionText}>{unresolved ? 'Review Queue' : 'Refresh Overview'}</Text>
    </TouchableOpacity>
  );

  return (
    <AdminWorkspaceLayout
      navigation={navigation}
      active="System Health"
      eyebrow="Live overview"
      title="System Health Monitor"
      subtitle="Operational integrity signals from the live Servista decision, verification, refund, and security queues."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search system signals..."
      onRefresh={loadData}
      refreshing={loading}
      headerActions={headerActions}
    >
      {loading ? <ActivityIndicator color={colors.orange} size="large" style={{ marginTop: 52 }} /> : null}
      {!loading ? <>
        <View style={styles.topGrid}>
          <View style={styles.liveOverview}>
            <Text style={styles.liveEyebrow}>LIVE OVERVIEW</Text>
            <Text style={styles.liveTitle}>Server Status: {serverState}</Text>
            <Text style={styles.liveCopy}>AI monitoring has calculated a {healthScore}% platform health score from the current integrity queues and service quality data.</Text>
            <View style={styles.liveStats}>
              <View><Text style={styles.liveStatLabel}>PLATFORM RATING</Text><Text style={styles.liveStatValue}>{quality.avg_platform_rating ?? 0} / 5</Text></View>
              <View><Text style={styles.liveStatLabel}>HIGH RISK</Text><Text style={[styles.liveStatValue, { color: fraud.high_risk ? '#FCA5A5' : '#6EE7B7' }]}>{fraud.high_risk || 0}</Text></View>
              <View><Text style={styles.liveStatLabel}>PENDING REPORTS</Text><Text style={styles.liveStatValue}>{reports.pending || 0}</Text></View>
            </View>
          </View>
          <View style={styles.highRiskCard}>
            <View style={styles.highRiskIcon}><Ionicons name="warning-outline" size={22} color={colors.red} /></View>
            <Text style={styles.highRiskTag}>{unresolved ? 'ACTION NEEDED' : 'SYSTEM CLEAR'}</Text>
            <Text style={styles.highRiskTitle}>{unresolved ? `${unresolved} operational item${unresolved === 1 ? '' : 's'}` : 'No critical queues'}</Text>
            <Text style={styles.highRiskCopy}>{unresolved ? 'Refund, report, and AI-risk signals are available for review.' : 'All active decision queues are within their expected thresholds.'}</Text>
            <TouchableOpacity style={styles.highRiskButton} onPress={() => navigation.navigate('Tabs', { screen: unresolved ? 'Disputes' : 'Dashboard' })}><Text style={styles.highRiskButtonText}>{unresolved ? 'Review Queue' : 'Open Dashboard'}</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}><View style={styles.metricCardHeader}><Text style={styles.metricCardTitle}>Pending Refunds</Text><Ionicons name="cash-outline" size={20} color="#526987" /></View><Text style={styles.metricAmount}>{amount(totalRefundValue)}</Text><Text style={styles.metricSub}>{pendingRefunds.length} request{pendingRefunds.length === 1 ? '' : 's'} requiring decision</Text><View style={styles.metricTrack}><View style={[styles.metricFill, { width: `${Math.min(100, pendingRefunds.length * 20)}%` }]} /></View></View>
          <View style={styles.metricCard}><View style={styles.metricCardHeader}><Text style={styles.metricCardTitle}>Platform Users</Text><Ionicons name="people-outline" size={20} color="#526987" /></View><Text style={styles.metricAmount}>{data.users.length.toLocaleString()}</Text><Text style={styles.metricSub}>{providers.length} provider{providers.length === 1 ? '' : 's'} in the current user base</Text><View style={styles.userBreakdown}><Text style={styles.userBreakdownText}>Verified providers</Text><Text style={styles.userBreakdownValue}>{verifiedProviders}</Text></View><View style={styles.userBreakdown}><Text style={styles.userBreakdownText}>Pending KYC</Text><Text style={styles.userBreakdownValue}>{data.kyc.length}</Text></View></View>
          <View style={styles.metricCard}><View style={styles.metricCardHeader}><Text style={styles.metricCardTitle}>AI Integrity</Text><Ionicons name="hardware-chip-outline" size={20} color="#526987" /></View><Text style={styles.metricAmount}>{healthScore}%</Text><Text style={styles.metricSub}>{quality.total_reviews || 0} reviews contributing to quality signals</Text><View style={styles.metricTrack}><View style={[styles.metricFill, { width: `${healthScore}%`, backgroundColor: healthScore >= 80 ? colors.green : colors.orange }]} /></View></View>
        </View>

        <View style={styles.lowerGrid}>
          <View style={styles.feedPanel}>
            <View style={styles.feedHeader}><Text style={styles.feedHeading}>Live Activity Feed</Text><View style={styles.feedFilters}><TouchableOpacity style={[styles.feedFilter, !criticalOnly && styles.feedFilterActive]} onPress={() => setCriticalOnly(false)}><Text style={[styles.feedFilterText, !criticalOnly && styles.feedFilterTextActive]}>All Logs</Text></TouchableOpacity><TouchableOpacity style={[styles.feedFilter, criticalOnly && styles.feedFilterActive]} onPress={() => setCriticalOnly(true)}><Text style={[styles.feedFilterText, criticalOnly && styles.feedFilterTextActive]}>Critical Only</Text></TouchableOpacity></View></View>
            {visibleFeed.map((item) => <FeedRow key={item.id} {...item} />)}
          </View>
          <View style={styles.aiPanel}>
            <View style={styles.aiHeading}><Ionicons name="hardware-chip-outline" size={21} color={colors.orange} /><Text style={styles.aiTitle}>AI Agent Sentinel</Text></View>
            <Text style={styles.aiCopy}>Current analysis blends live provider-risk, customer report, KYC, refund, and wallet-security conditions.</Text>
            <Text style={styles.aiMetricLabel}>Positive alignment</Text><View style={styles.aiMetricTrack}><View style={[styles.aiMetricFill, { width: `${healthScore}%`, backgroundColor: colors.green }]} /></View><Text style={styles.aiMetricValue}>{healthScore}%</Text>
            <Text style={styles.aiMetricLabel}>Conflict probability</Text><View style={styles.aiMetricTrack}><View style={[styles.aiMetricFill, { width: `${Math.min(100, unresolved * 12)}%`, backgroundColor: colors.red }]} /></View><Text style={styles.aiMetricValue}>{Math.min(100, unresolved * 12)}%</Text>
            <View style={styles.recommendation}><Text style={styles.recommendationLabel}>AI RECOMMENDATION</Text><Text style={styles.recommendationCopy}>{unresolved ? 'Prioritize active refunds, reports, and elevated-risk provider reviews before validating new batch candidates.' : 'System integrity is stable. Continue reviewing new provider verification and batch eligibility queues as they arrive.'}</Text></View>
          </View>
        </View>
      </> : null}
    </AdminWorkspaceLayout>
  );
}

const styles = StyleSheet.create({
  reviewAction: { minHeight: 42, borderRadius: 8, backgroundColor: colors.orange, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  reviewActionText: { color: colors.white, fontSize: 14, fontFamily: fontFamilyBold },
  topGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  liveOverview: { minHeight: 228, flexGrow: 3, flexBasis: 540, backgroundColor: '#0D2341', borderRadius: 11, padding: 30 },
  liveEyebrow: { color: colors.orange, fontSize: 11, letterSpacing: 1.4, fontFamily: fontFamilyBold },
  liveTitle: { color: colors.white, fontSize: 18, marginTop: 12, fontFamily: fontFamilyMedium },
  liveCopy: { color: '#D9E3F0', fontSize: 16, lineHeight: 24, maxWidth: 620, marginTop: 10, fontFamily },
  liveStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 38, marginTop: 28 },
  liveStatLabel: { color: '#B9C5D8', fontSize: 10, letterSpacing: 1, fontFamily: fontFamilyBold },
  liveStatValue: { color: colors.white, fontSize: 17, marginTop: 6, fontFamily: fontFamilyBold },
  highRiskCard: { flexBasis: 220, flexGrow: 1, minHeight: 228, backgroundColor: colors.white, borderRadius: 11, borderWidth: 1, borderColor: '#F2C9BC', padding: 24 },
  highRiskIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  highRiskTag: { alignSelf: 'flex-end', marginTop: -37, color: colors.red, backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 9, fontFamily: fontFamilyBold },
  highRiskTitle: { color: '#20242B', fontSize: 17, marginTop: 26, fontFamily: fontFamilyBold },
  highRiskCopy: { color: '#76665E', fontSize: 14, lineHeight: 20, marginTop: 8, fontFamily },
  highRiskButton: { minHeight: 42, borderRadius: 7, backgroundColor: colors.orange, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  highRiskButtonText: { color: colors.white, fontSize: 14, fontFamily: fontFamilyBold },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  metricCard: { minHeight: 210, flexGrow: 1, flexBasis: 250, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', padding: 22 },
  metricCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricCardTitle: { color: '#526987', fontSize: 14, fontFamily: fontFamilyBold, textTransform: 'uppercase', letterSpacing: 0.7 },
  metricAmount: { color: '#20242B', fontSize: 24, marginTop: 22, fontFamily: fontFamilyBold },
  metricSub: { color: '#76665E', fontSize: 14, marginTop: 7, fontFamily },
  metricTrack: { height: 7, backgroundColor: '#E5E7EB', marginTop: 25, borderRadius: 4, overflow: 'hidden' },
  metricFill: { height: '100%', backgroundColor: colors.orange },
  userBreakdown: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  userBreakdownText: { color: '#4B5563', fontSize: 13, fontFamily },
  userBreakdownValue: { color: '#20242B', fontSize: 13, fontFamily: fontFamilyBold },
  lowerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  feedPanel: { flexBasis: 580, flexGrow: 3, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', overflow: 'hidden' },
  feedHeader: { minHeight: 74, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F2C9BC' },
  feedHeading: { color: '#20242B', fontSize: 17, fontFamily: fontFamilyBold },
  feedFilters: { flexDirection: 'row', gap: 6 },
  feedFilter: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  feedFilterActive: { backgroundColor: '#E7E5E4' },
  feedFilterText: { color: '#64748B', fontSize: 10, fontFamily: fontFamilyMedium },
  feedFilterTextActive: { color: '#403735', fontFamily: fontFamilyBold },
  feedRow: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F2E3DC', flexDirection: 'row', alignItems: 'center', gap: 12 },
  feedIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  feedTitle: { color: '#20242B', fontSize: 15, fontFamily: fontFamilyBold },
  feedCopy: { color: '#76665E', fontSize: 12, marginTop: 3, fontFamily },
  feedTime: { color: '#8B7A72', fontSize: 10, fontFamily: fontFamilyMedium },
  aiPanel: { flexBasis: 260, flexGrow: 1, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 22 },
  aiHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiTitle: { color: '#20242B', fontSize: 16, fontFamily: fontFamilyBold },
  aiCopy: { color: '#655A55', fontSize: 14, lineHeight: 21, marginTop: 18, fontFamily },
  aiMetricLabel: { color: '#20242B', fontSize: 12, marginTop: 18, fontFamily: fontFamilyBold },
  aiMetricTrack: { height: 7, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginTop: 7 },
  aiMetricFill: { height: '100%' },
  aiMetricValue: { color: '#20242B', fontSize: 12, marginTop: 3, textAlign: 'right', fontFamily: fontFamilyBold },
  recommendation: { borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: colors.white, borderRadius: 8, padding: 13, marginTop: 22 },
  recommendationLabel: { color: '#8B4D2E', fontSize: 9, letterSpacing: 1, fontFamily: fontFamilyBold },
  recommendationCopy: { color: '#4B3D37', fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginTop: 7, fontFamily },
});
