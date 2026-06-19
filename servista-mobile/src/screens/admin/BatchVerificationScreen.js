import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { API_BASE_URL, errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { dssStyles } from './dssStyles';
import { Text } from './dssText';

function mediaUri(uri) {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('file:')) return uri;
  return `${API_BASE_URL}${uri}`;
}

function decisionColor(decision) {
  if (decision === 'approved') return colors.green;
  if (decision === 'rejected') return colors.red;
  return colors.orange;
}

export default function BatchVerificationScreen({ route, navigation }) {
  const batchIdParam = route.params?.batchId;
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState(null);
  const [eligibleProviders, setEligibleProviders] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [completing, setCompleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!batchIdParam) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get(`/api/dss/batches/${batchIdParam}/`);
      const batchData = data?.batch || null;
      const providers = data?.providers || [];
      setBatch(batchData);
      setEligibleProviders(providers);
      setSelectedIds(
        providers
          .filter((p) => (p.batch_decision || 'pending') === 'pending')
          .map((p) => p.id),
      );
    } catch (error) {
      Alert.alert('Batch unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [batchIdParam]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const selected = batch?.total_providers ?? eligibleProviders.length;
  const approved = batch?.approved_count ?? 0;
  const rejected = batch?.rejected_count ?? 0;
  const pending = batch?.pending_count ?? 0;

  const selectedProfiles = useMemo(
    () => eligibleProviders.filter((p) => selectedIds.includes(p.id)),
    [eligibleProviders, selectedIds],
  );

  const toggleSelect = (profile) => {
    if ((profile.batch_decision || 'pending') !== 'pending') return;
    setSelectedIds((prev) => (
      prev.includes(profile.id)
        ? prev.filter((id) => id !== profile.id)
        : [...prev, profile.id]
    ));
  };

  const processProvider = async (profile, decision) => {
    if (!profile?.user?.id || !batch?.batch_id) return;
    if ((profile.batch_decision || 'pending') !== 'pending') return;
    if (!selectedIds.includes(profile.id)) {
      Alert.alert('Not selected', 'Select this provider for batch processing first.');
      return;
    }
    try {
      const { data: updatedBatch } = await api.put(`/api/dss/batches/${batch.batch_id}/`, {
        action: decision === 'approved' ? 'approve' : 'reject',
        provider_id: profile.user.id,
      });
      setBatch(updatedBatch);
      await api.put(`/api/users/admin/badge/${profile.user.id}/`, { status: decision });
      Alert.alert(decision === 'approved' ? 'Approved' : 'Rejected', `${profile.user.full_name} processed.`);
      loadData();
    } catch (error) {
      Alert.alert('Verification update failed', errorMessage(error));
    }
  };

  const completeBatch = async () => {
    if (!batch?.batch_id) return;
    try {
      setCompleting(true);
      await api.put(`/api/dss/batches/${batch.batch_id}/`, { action: 'complete' });
      Alert.alert('Batch complete', 'Verification batch has been closed.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to complete batch', errorMessage(error));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <Text style={dssStyles.headerTitle}>Badge Candidate Validation</Text>
        {batch ? (
          <Text style={[dssStyles.embeddedExpandLink, { marginBottom: 8 }]}>{batch.batch_id}</Text>
        ) : null}

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>BADGE ELIGIBILITY RULES</Text>
          <Text style={dssStyles.cardSubtext}>
            AI selects providers with approved KYC, Trust at 100%, no active complaints, and Activity, Reliability and Quality at or above 50%. Admin approval lets the provider buy the 15,000 FCFA trust badge.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
        ) : (
          <>
            <View style={dssStyles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={dssStyles.cardValue}>{selected}</Text>
                  <Text style={dssStyles.cardTitle}>SELECTED</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[dssStyles.cardValue, { color: colors.green }]}>{approved}</Text>
                  <Text style={dssStyles.cardTitle}>APPROVED</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[dssStyles.cardValue, { color: colors.red }]}>{rejected}</Text>
                  <Text style={dssStyles.cardTitle}>REJECTED</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[dssStyles.cardValue, { color: colors.orange }]}>{pending}</Text>
                  <Text style={dssStyles.cardTitle}>PENDING</Text>
                </View>
              </View>
            </View>

            {eligibleProviders.length === 0 ? (
              <Text style={dssStyles.emptyText}>
                No batch-eligible providers in this session. Recalculate scores, ensure KYC is pending, or approve eligibility manually from Provider Scores, then create a new batch.
              </Text>
            ) : (
              eligibleProviders.map((profile) => {
                const decision = profile.batch_decision || 'pending';
                const isPending = decision === 'pending';
                const isSelected = selectedIds.includes(profile.id);
                const docs = [
                  { label: 'ID Front', uri: mediaUri(profile.id_front) },
                  { label: 'ID Back', uri: mediaUri(profile.id_back) },
                  { label: 'Selfie', uri: mediaUri(profile.selfie) },
                ];
                return (
                  <View
                    key={profile.id}
                    style={[
                      dssStyles.card,
                      isSelected && isPending && { borderColor: colors.orange, borderWidth: 2 },
                    ]}
                  >
                    <TouchableOpacity
                      style={dssStyles.rowBetween}
                      onPress={() => toggleSelect(profile)}
                      activeOpacity={isPending ? 0.85 : 1}
                      disabled={!isPending}
                    >
                      <View style={[dssStyles.row, dssStyles.flex]}>
                        <Ionicons
                          name={isSelected && isPending ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={isSelected && isPending ? colors.orange : '#8FA0B8'}
                          style={{ marginRight: 10 }}
                        />
                        <View style={dssStyles.flex}>
                          <Text style={dssStyles.providerName}>{profile.user?.full_name}</Text>
                          <Text style={dssStyles.cardSubtext}>
                            {profile.business_name || 'Provider'} · {profile.address || 'Cameroon'}
                          </Text>
                        </View>
                      </View>
                      <View style={[dssStyles.badge, { backgroundColor: decisionColor(decision) }]}>
                        <Text style={dssStyles.badgeText}>{decision.toUpperCase()}</Text>
                      </View>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <Text style={dssStyles.cardSubtext}>Act {profile.activity_score}%</Text>
                      <Text style={dssStyles.cardSubtext}>· Rel {profile.reliability_score}%</Text>
                      <Text style={dssStyles.cardSubtext}>· Qual {profile.quality_score}%</Text>
                      <Text style={dssStyles.cardSubtext}>· Trust {profile.trust_score}%</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      {docs.map((doc) => (
                        <View key={doc.label} style={{ flex: 1 }}>
                          <Text style={dssStyles.cardTitle}>{doc.label}</Text>
                          <View style={{
                            height: 70, borderRadius: 10, backgroundColor: '#0B1628',
                            borderWidth: 1, borderColor: 'rgba(143,160,184,0.18)',
                            marginTop: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                          }}
                          >
                            {doc.uri ? (
                              <Image source={{ uri: doc.uri }} style={{ width: '100%', height: '100%' }} />
                            ) : (
                              <Ionicons name="image-outline" size={24} color="#8FA0B8" />
                            )}
                          </View>
                        </View>
                      ))}
                    </View>

                    {isPending ? (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                        <TouchableOpacity
                          style={[
                            dssStyles.primaryBtn,
                            { flex: 1, backgroundColor: colors.green },
                            !isSelected && { opacity: 0.45 },
                          ]}
                          disabled={!isSelected}
                          onPress={() => processProvider(profile, 'approved')}
                        >
                          <Text style={dssStyles.primaryBtnText}>APPROVE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[dssStyles.dangerOutlineBtn, { flex: 1 }, !isSelected && { opacity: 0.45 }]}
                          disabled={!isSelected}
                          onPress={() => processProvider(profile, 'rejected')}
                        >
                          <Text style={dssStyles.dangerOutlineText}>REJECT</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}

            {batch?.status !== 'completed' && eligibleProviders.length > 0 ? (
              <TouchableOpacity
                style={dssStyles.navyBtn}
                onPress={completeBatch}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator color={colors.orange} />
                ) : (
                  <Text style={dssStyles.navyBtnText}>COMPLETE BATCH ({selected} IN QUEUE)</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
