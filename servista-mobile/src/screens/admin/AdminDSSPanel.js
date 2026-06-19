import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, TouchableOpacity, View,
} from 'react-native';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { dssStyles, riskColor, riskBorderColor } from './dssStyles';
import { Text } from './dssText';

function stackNav(navigation) {
  return navigation?.getParent?.() || navigation;
}

function RiskCard({ level, count, onPress }) {
  const accent = riskColor(level);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={[
        dssStyles.riskCard,
        { borderColor: riskBorderColor(level) },
      ]}
    >
      <Text style={dssStyles.riskLabel}>{level} RISK</Text>
      <View>
        <Text style={dssStyles.riskCount}>{count ?? 0}</Text>
        <Text style={[dssStyles.riskAccent, { color: accent }]}>providers</Text>
      </View>
    </Wrapper>
  );
}

export default function AdminDSSPanel({ navigation, embedded = false, onDashboardLoaded }) {
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [activeBatch, setActiveBatch] = useState(null);

  const goTo = (screen, params) => stackNav(navigation)?.navigate(screen, params);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, batchRes] = await Promise.all([
        api.get('/api/dss/dashboard/'),
        api.get('/api/dss/batches/'),
      ]);
      setDashboard(dashRes.data);
      onDashboardLoaded?.(dashRes.data);
      const batches = Array.isArray(batchRes.data) ? batchRes.data : [];
      const open = batches.find((b) => b.status === 'open' || b.status === 'in_progress');
      setActiveBatch(open || null);
    } catch (error) {
      if (!embedded) Alert.alert('DSS unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [embedded, onDashboardLoaded]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const recalculateAll = async () => {
    try {
      setRecalculating(true);
      const { data } = await api.post('/api/dss/scores/');
      Alert.alert('Scores updated', data.message || 'All provider scores recalculated.');
      loadData();
    } catch (error) {
      Alert.alert('Recalculation failed', errorMessage(error));
    } finally {
      setRecalculating(false);
    }
  };

  const startBatchVerification = async () => {
    try {
      setCreatingBatch(true);
      let batch = activeBatch;
      if (!batch) {
        const { data } = await api.post('/api/dss/batches/');
        batch = data;
        setActiveBatch(data);
      }
      goTo('BatchVerification', { batchId: batch.batch_id });
      loadData();
    } catch (error) {
      Alert.alert('Batch verification failed', errorMessage(error));
    } finally {
      setCreatingBatch(false);
    }
  };

  const fraud = dashboard?.fraud_overview || {};
  const reports = dashboard?.reports_overview || {};
  const quality = dashboard?.quality_overview || {};
  const batchOverview = dashboard?.batch_overview || {};
  const badgeOverview = dashboard?.badge_overview || {};
  const eligibleCount = batchOverview.eligible_count ?? 0;
  const badgeEligibleCount = badgeOverview.eligible_count ?? 0;
  const highRiskCount = fraud.high_risk ?? 0;
  const pendingReportCount = reports.pending ?? 0;
  const aiSummary = highRiskCount || pendingReportCount || eligibleCount
    ? `${highRiskCount} high-risk provider${highRiskCount === 1 ? '' : 's'}, ${pendingReportCount} pending report${pendingReportCount === 1 ? '' : 's'}, and ${eligibleCount} badge candidate${eligibleCount === 1 ? '' : 's'} need review.`
    : 'AI monitoring is active. No urgent provider risk or badge review action is currently required.';

  const content = loading ? (
    <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
  ) : (
    <>
      <View style={dssStyles.riskRow}>
        <RiskCard level="HIGH" count={fraud.high_risk} onPress={() => goTo('FraudAlerts')} />
        <RiskCard level="MEDIUM" count={fraud.medium_risk} onPress={() => goTo('FraudAlerts')} />
        <RiskCard level="LOW" count={fraud.low_risk} />
      </View>

      <TouchableOpacity
        style={dssStyles.primaryBtn}
        onPress={recalculateAll}
        disabled={recalculating}
        activeOpacity={0.85}
      >
        {recalculating ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={dssStyles.primaryBtnText}>RECALCULATE ALL SCORES</Text>
        )}
      </TouchableOpacity>

      <View style={dssStyles.card}>
        <Text style={dssStyles.cardTitle}>AI GOVERNANCE SUMMARY</Text>
        <Text style={dssStyles.cardSubtext}>{aiSummary}</Text>
      </View>

      <View style={dssStyles.card}>
        <Text style={dssStyles.cardTitle}>PLATFORM QUALITY</Text>
        <Text style={dssStyles.cardValue}>{quality.avg_platform_rating ?? 0} ★</Text>
        <Text style={dssStyles.cardSubtext}>
          {quality.total_reviews ?? 0} total reviews across platform
        </Text>
      </View>

      <View style={dssStyles.card}>
        <View style={dssStyles.rowBetween}>
          <View style={dssStyles.flex}>
            <Text style={dssStyles.cardTitle}>PENDING REPORTS</Text>
            <Text style={dssStyles.cardValue}>{reports.pending ?? 0}</Text>
            <Text style={dssStyles.cardSubtext}>
              {reports.total ?? 0} total reports filed
            </Text>
          </View>
          <TouchableOpacity style={dssStyles.outlineBtn} onPress={() => goTo('Reports')}>
            <Text style={dssStyles.outlineBtnText}>VIEW REPORTS</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={dssStyles.card}>
        <View style={dssStyles.flex}>
          <Text style={dssStyles.cardTitle}>AI BADGE CANDIDATES</Text>
          <Text style={dssStyles.cardValue}>{eligibleCount}</Text>
          <Text style={dssStyles.cardSubtext}>
            Providers with Activity, Reliability and Quality at or above 50%, plus Trust at 100%.
          </Text>
        </View>
      </View>

      <View style={dssStyles.card}>
        <View style={dssStyles.rowBetween}>
          <View style={dssStyles.flex}>
            <Text style={dssStyles.cardTitle}>ADMIN VALIDATION QUEUE</Text>
            <Text style={dssStyles.cardValue}>{badgeEligibleCount}</Text>
            <Text style={dssStyles.cardSubtext}>
              AI-selected providers awaiting admin validation before they can buy the 15,000 FCFA trust badge.
            </Text>
          </View>
          <TouchableOpacity style={dssStyles.outlineBtn} onPress={() => goTo('BadgeVerification')}>
            <Text style={dssStyles.outlineBtnText}>VALIDATE PROVIDERS</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={dssStyles.navyBtn}
        onPress={startBatchVerification}
        disabled={creatingBatch}
        activeOpacity={0.85}
      >
        {creatingBatch ? (
          <ActivityIndicator color={colors.orange} />
        ) : (
          <Text style={dssStyles.navyBtnText}>OPEN BATCH VALIDATION</Text>
        )}
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity style={[dssStyles.outlineBtn, { flex: 1 }]} onPress={() => goTo('ProviderScores')}>
          <Text style={dssStyles.outlineBtnText}>PROVIDER SCORES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[dssStyles.outlineBtn, { flex: 1 }]} onPress={() => goTo('FraudAlerts')}>
          <Text style={dssStyles.outlineBtnText}>FRAUD ALERTS</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (embedded) {
    return (
      <View style={dssStyles.embeddedPanel}>
        <View style={dssStyles.embeddedHeader}>
          <View style={dssStyles.embeddedHeaderLeft}>
            <Ionicons name="hardware-chip-outline" size={24} color={colors.orange} />
            <Text style={dssStyles.embeddedTitle}>AI Decision Support System</Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => goTo('DSSAIPanel')}>
            <Text style={dssStyles.embeddedExpandLink}>FULL PANEL</Text>
          </TouchableOpacity>
        </View>
        <View style={dssStyles.embeddedBody}>{content}</View>
      </View>
    );
  }

  return content;
}
