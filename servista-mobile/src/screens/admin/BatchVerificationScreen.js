import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import api, { API_BASE_URL, errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';
import { AdminWorkspaceLayout } from './AdminWorkspaceLayout';
import { Text } from './dssText';

function mediaUri(uri) {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('file:')) return uri;
  return `${API_BASE_URL}${uri}`;
}

function scoreTone(score) {
  if (score >= 80) return colors.green;
  if (score >= 50) return colors.orange;
  return colors.red;
}

function ProviderDocument({ label, uri }) {
  return (
    <View style={styles.documentItem}>
      <Text style={styles.documentLabel}>{label}</Text>
      <View style={styles.documentPreview}>
        {uri ? <Image source={{ uri }} style={styles.documentImage} resizeMode="cover" /> : <Ionicons name="image-outline" size={22} color="#64748B" />}
      </View>
    </View>
  );
}

export default function BatchVerificationScreen({ route, navigation }) {
  const batchIdParam = route.params?.batchId;
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [batch, setBatch] = useState(null);
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('Pending');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let activeId = batchIdParam;
      if (!activeId) {
        const { data: batches } = await api.get('/api/dss/batches/');
        const active = (Array.isArray(batches) ? batches : []).find((item) => item.status === 'open' || item.status === 'in_progress');
        activeId = active?.batch_id;
      }
      if (!activeId) {
        setBatch(null);
        setProviders([]);
        return;
      }
      const { data } = await api.get(`/api/dss/batches/${activeId}/`);
      setBatch(data?.batch || null);
      setProviders(Array.isArray(data?.providers) ? data.providers : []);
    } catch (error) {
      Alert.alert('Batch unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [batchIdParam]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const startBatch = async () => {
    try {
      setCreating(true);
      const { data } = await api.post('/api/dss/batches/');
      navigation.setParams({ batchId: data.batch_id });
      const detail = await api.get(`/api/dss/batches/${data.batch_id}/`);
      setBatch(detail.data?.batch || data);
      setProviders(Array.isArray(detail.data?.providers) ? detail.data.providers : []);
    } catch (error) {
      Alert.alert('Could not start batch', errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const processProvider = async (profile, decision) => {
    if (!profile?.user?.id || !batch?.batch_id) return;
    try {
      await api.put(`/api/dss/batches/${batch.batch_id}/`, {
        action: decision === 'approved' ? 'approve' : 'reject',
        provider_id: profile.user.id,
      });
      await api.put(`/api/users/admin/badge/${profile.user.id}/`, { status: decision });
      await loadData();
    } catch (error) {
      Alert.alert('Verification update failed', errorMessage(error));
    }
  };

  const completeBatch = async () => {
    if (!batch?.batch_id) return;
    try {
      setCompleting(true);
      await api.put(`/api/dss/batches/${batch.batch_id}/`, { action: 'complete' });
      Alert.alert('Batch complete', 'The active batch has been closed. The next batch can be created when ready.');
      await loadData();
    } catch (error) {
      Alert.alert('Batch completion failed', errorMessage(error));
    } finally {
      setCompleting(false);
    }
  };

  const exportReport = () => {
    const body = `Batch ${batch?.batch_id || 'not started'}\nSelected: ${batch?.total_providers || 0}\nApproved: ${batch?.approved_count || 0}\nRejected: ${batch?.rejected_count || 0}\nPending: ${batch?.pending_count || 0}`;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
      link.download = `servista-batch-${batch?.batch_id || 'report'}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
    Alert.alert('Batch report', body);
  };

  const visibleProviders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return providers.filter((profile) => {
      const decision = profile.batch_decision || 'pending';
      const matchesView = view === 'All' || decision === view.toLowerCase();
      const name = `${profile.user?.full_name || ''} ${profile.business_name || ''}`.toLowerCase();
      return matchesView && (!term || name.includes(term));
    });
  }, [providers, search, view]);

  const pending = batch?.pending_count ?? providers.filter((p) => (p.batch_decision || 'pending') === 'pending').length;
  const approved = batch?.approved_count ?? providers.filter((p) => p.batch_decision === 'approved').length;
  const rejected = batch?.rejected_count ?? providers.filter((p) => p.batch_decision === 'rejected').length;
  const total = batch?.total_providers ?? providers.length;

  const headerActions = (
    <>
      <TouchableOpacity style={styles.secondaryAction} onPress={exportReport}>
        <Ionicons name="download-outline" size={18} color="#40516F" />
        <Text style={styles.secondaryActionText}>Export Report</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryAction} onPress={batch ? loadData : startBatch} disabled={creating}>
        {creating ? <ActivityIndicator color={colors.white} /> : <Ionicons name={batch ? 'refresh-outline' : 'play-outline'} size={18} color={colors.white} />}
        <Text style={styles.primaryActionText}>{batch ? 'Run Global Audit' : 'Start Batch'}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <AdminWorkspaceLayout
      navigation={navigation}
      active="Batch Verification"
      eyebrow="Verification workflow"
      title="Batch Verification Center"
      subtitle="Review AI-selected providers, verify their uploaded identity documents, and approve eligibility to buy the Servista trust badge."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search batch ID or provider..."
      onRefresh={loadData}
      refreshing={loading}
      headerActions={headerActions}
    >
      <View style={styles.statusPanel}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusEyebrow}>ACTIVE BATCH STATUS: {batch?.batch_id || 'NO ACTIVE BATCH'}</Text>
          <View style={styles.statusMetrics}>
            <View><Text style={styles.statusMetricLabel}>Total Selected</Text><Text style={styles.statusValue}>{total}</Text></View>
            <View><Text style={styles.statusMetricLabel}>Approved</Text><Text style={[styles.statusValue, { color: '#6EE7B7' }]}>{approved}</Text></View>
            <View><Text style={styles.statusMetricLabel}>Rejected</Text><Text style={[styles.statusValue, { color: '#FECACA' }]}>{rejected}</Text></View>
            <View><Text style={styles.statusMetricLabel}>Manual Pending</Text><Text style={[styles.statusValue, { color: '#FB923C' }]}>{pending}</Text></View>
          </View>
        </View>
        <View style={styles.liveEngine}><Ionicons name="scan-outline" size={34} color="#94A3B8" /><Text style={styles.liveEngineText}>LIVE ANALYSIS ENGINE</Text></View>
      </View>

      {!batch && !loading ? (
        <View style={styles.noBatchPanel}>
          <Ionicons name="layers-outline" size={34} color={colors.orange} />
          <Text style={styles.noBatchTitle}>No active verification batch</Text>
          <Text style={styles.noBatchCopy}>Create a batch to load the providers currently selected by the AI eligibility rules.</Text>
          <TouchableOpacity style={styles.primaryAction} onPress={startBatch} disabled={creating}><Text style={styles.primaryActionText}>Create Verification Batch</Text></TouchableOpacity>
        </View>
      ) : null}

      {batch || loading ? (
        <View style={styles.workspaceGrid}>
          <View style={styles.rulesPanel}>
            <View style={styles.rulesHeader}><Text style={styles.panelTitle}>Eligibility Rules</Text><Ionicons name="create-outline" size={18} color={colors.orange} /></View>
            {[
              ['Security Score Threshold', 'PASSED', 'Trust must be 100% with approved KYC and no active complaints.', colors.green],
              ['Performance Validity', 'ACTIVE', 'Activity, quality, and reliability are each at least 50%.', colors.green],
              ['Manual Document Check', 'REQUIRED', 'Admin visually confirms ID front, ID back, and selfie.', colors.orange],
            ].map(([title, state, copy, tone]) => <View key={title} style={[styles.ruleCard, { borderLeftColor: tone }]}><View style={styles.ruleRow}><Text style={styles.ruleTitle}>{title}</Text><Text style={[styles.ruleState, { color: tone }]}>{state}</Text></View><Text style={styles.ruleCopy}>{copy}</Text></View>)}
            <TouchableOpacity style={styles.customRuleBtn} onPress={() => Alert.alert('Eligibility rules', 'The current threshold rules are calculated by the AI decision-support module and can be reviewed from Provider Scores.')}><Text style={styles.customRuleText}>View Eligibility Logic</Text></TouchableOpacity>
          </View>

          <View style={styles.queuePanel}>
            <View style={styles.queueHeader}>
              <Text style={styles.panelTitle}>Verification Queue ({pending})</Text>
              <View style={styles.viewToggle}>{['Pending', 'All'].map((item) => <TouchableOpacity key={item} style={[styles.viewButton, view === item && styles.viewButtonActive]} onPress={() => setView(item)}><Text style={[styles.viewText, view === item && styles.viewTextActive]}>{item}</Text></TouchableOpacity>)}</View>
            </View>
            {loading ? <ActivityIndicator color={colors.orange} style={{ marginTop: 38 }} size="large" /> : null}
            {!loading && !visibleProviders.length ? <Text style={styles.emptyText}>No providers in this queue view.</Text> : null}
            {!loading && visibleProviders.map((profile) => {
              const decision = profile.batch_decision || 'pending';
              const aiScore = Math.round(((Number(profile.activity_score) || 0) + (Number(profile.reliability_score) || 0) + (Number(profile.quality_score) || 0) + (Number(profile.trust_score) || 0)) / 4);
              return (
                <View key={profile.id} style={styles.queueRow}>
                  <View style={styles.providerAvatar}><Text style={styles.providerAvatarText}>{(profile.user?.full_name || 'P').slice(0, 2).toUpperCase()}</Text></View>
                  <View style={styles.queueMain}>
                    <Text style={styles.queueName}>{profile.business_name || profile.user?.full_name || 'Provider'}</Text>
                    <Text style={styles.queueId}>ID: PRV-{String(profile.user?.id || profile.id).padStart(4, '0')}</Text>
                    <View style={styles.documentsRow}>
                      <ProviderDocument label="ID front" uri={mediaUri(profile.id_front)} />
                      <ProviderDocument label="ID back" uri={mediaUri(profile.id_back)} />
                      <ProviderDocument label="Selfie" uri={mediaUri(profile.selfie)} />
                    </View>
                  </View>
                  <View style={styles.queueScore}><View style={styles.queueScoreTrack}><View style={[styles.queueScoreFill, { width: `${aiScore}%`, backgroundColor: scoreTone(aiScore) }]} /></View><Text style={[styles.queueScoreText, { color: scoreTone(aiScore) }]}>{aiScore}%</Text></View>
                  <View style={[styles.decisionLabel, decision === 'approved' && styles.approvedDecision, decision === 'rejected' && styles.rejectedDecision]}><Text style={[styles.decisionText, decision === 'approved' && { color: '#047857' }, decision === 'rejected' && { color: '#B91C1C' }]}>{decision === 'pending' ? 'Pending review' : decision}</Text></View>
                  {decision === 'pending' ? <View style={styles.decisionActions}><TouchableOpacity style={styles.approveBtn} onPress={() => processProvider(profile, 'approved')}><Ionicons name="checkmark" size={20} color="#047857" /></TouchableOpacity><TouchableOpacity style={styles.rejectBtn} onPress={() => processProvider(profile, 'rejected')}><Ionicons name="close" size={20} color="#B91C1C" /></TouchableOpacity></View> : null}
                </View>
              );
            })}
            {batch && pending === 0 ? <TouchableOpacity style={styles.completeBatchBtn} onPress={completeBatch} disabled={completing}>{completing ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryActionText}>Complete Batch</Text>}</TouchableOpacity> : null}
          </View>
        </View>
      ) : null}
    </AdminWorkspaceLayout>
  );
}

const styles = StyleSheet.create({
  primaryAction: { minHeight: 42, borderRadius: 8, backgroundColor: colors.orange, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: colors.white, fontSize: 14, fontFamily: fontFamilyBold, fontWeight: '900' },
  secondaryAction: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: '#526987', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.white },
  secondaryActionText: { color: '#40516F', fontSize: 14, fontFamily: fontFamilyMedium },
  statusPanel: { backgroundColor: '#0D2341', borderRadius: 11, padding: 24, minHeight: 178, flexDirection: 'row', gap: 20 },
  statusEyebrow: { color: colors.orange, fontSize: 11, letterSpacing: 1.4, fontFamily: fontFamilyBold, fontWeight: '900' },
  statusMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 32, marginTop: 16 },
  statusMetricLabel: { color: '#B9C5D8', fontSize: 14, fontFamily },
  statusValue: { color: colors.white, fontSize: 36, fontFamily: fontFamilyBold, fontWeight: '900', marginTop: 3 },
  liveEngine: { width: 240, maxWidth: '34%', borderRadius: 8, backgroundColor: '#1D2F4D', alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  liveEngineText: { color: colors.white, fontSize: 10, letterSpacing: 1.1, fontFamily: fontFamilyBold },
  noBatchPanel: { alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: '#F2C9BC', borderRadius: 10, padding: 32, gap: 12 },
  noBatchTitle: { color: '#20242B', fontSize: 21, fontFamily: fontFamilyBold },
  noBatchCopy: { color: '#64748B', fontSize: 14, textAlign: 'center', maxWidth: 480, fontFamily, lineHeight: 21 },
  workspaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
  rulesPanel: { flexBasis: 270, flexGrow: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F2C9BC', borderRadius: 10, padding: 16, gap: 12 },
  queuePanel: { flexBasis: 650, flexGrow: 3, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F2C9BC', borderRadius: 10, overflow: 'hidden' },
  rulesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  panelTitle: { color: '#20242B', fontSize: 18, fontFamily: fontFamilyBold, fontWeight: '900' },
  ruleCard: { backgroundColor: '#F8FAFC', borderLeftWidth: 4, padding: 14, borderRadius: 7 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  ruleTitle: { color: '#20242B', fontSize: 15, flex: 1, fontFamily: fontFamilyBold },
  ruleState: { fontSize: 11, fontFamily: fontFamilyBold, letterSpacing: 0.7 },
  ruleCopy: { color: '#76665E', fontSize: 13, lineHeight: 19, marginTop: 7, fontFamily },
  customRuleBtn: { minHeight: 42, borderWidth: 1, borderColor: colors.orange, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  customRuleText: { color: colors.orange, fontSize: 13, fontFamily: fontFamilyMedium },
  queueHeader: { minHeight: 76, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderBottomWidth: 1, borderBottomColor: '#F2C9BC' },
  viewToggle: { borderWidth: 1, borderColor: '#E5B7A5', borderRadius: 7, padding: 3, flexDirection: 'row' },
  viewButton: { minHeight: 31, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  viewButtonActive: { backgroundColor: colors.orange },
  viewText: { color: '#526987', fontSize: 12, fontFamily: fontFamilyMedium },
  viewTextActive: { color: colors.white, fontFamily: fontFamilyBold },
  queueRow: { padding: 16, minHeight: 126, borderBottomWidth: 1, borderBottomColor: '#F2D9CF', flexDirection: 'row', gap: 12, alignItems: 'center' },
  providerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DBEAFE' },
  providerAvatarText: { color: colors.orange, fontFamily: fontFamilyBold },
  queueMain: { flex: 1, minWidth: 145 },
  queueName: { color: '#20242B', fontSize: 16, fontFamily: fontFamilyBold },
  queueId: { color: '#76665E', fontSize: 11, marginTop: 2, fontFamily: fontFamilyMedium },
  documentsRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
  documentItem: { width: 40 },
  documentLabel: { color: '#94A3B8', fontSize: 7, fontFamily: fontFamilyBold, textTransform: 'uppercase' },
  documentPreview: { width: 38, height: 26, borderRadius: 4, marginTop: 3, backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  documentImage: { width: '100%', height: '100%' },
  queueScore: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 7 },
  queueScoreTrack: { flex: 1, height: 7, backgroundColor: '#E5E7EB', borderRadius: 5, overflow: 'hidden' },
  queueScoreFill: { height: '100%', borderRadius: 5 },
  queueScoreText: { fontSize: 13, fontFamily: fontFamilyBold },
  decisionLabel: { width: 88 },
  approvedDecision: { },
  rejectedDecision: { },
  decisionText: { color: colors.orange, fontSize: 12, textTransform: 'capitalize', fontFamily: fontFamilyMedium },
  decisionActions: { flexDirection: 'row', gap: 7 },
  approveBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  completeBatchBtn: { minHeight: 48, backgroundColor: '#087A3C', margin: 18, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyText: { padding: 34, textAlign: 'center', color: '#64748B', fontSize: 14, fontFamily },
});
