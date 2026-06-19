import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { dssStyles, riskColor } from './dssStyles';
import { Text } from './dssText';

function checkLabel(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function checkColor(ok) {
  return ok ? colors.green : colors.red;
}

export default function BadgeVerificationScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [debugRows, setDebugRows] = useState([]);
  const [processingId, setProcessingId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/dss/badges/eligible-providers/');
      const rows = data?.debug || [];
      setDebugRows(rows);
      setProviders(data?.providers || []);

      console.log('[BadgeVerification] eligibility scan complete');
      console.log(`[BadgeVerification] ${rows.length} providers evaluated, ${data?.providers?.length || 0} eligible`);
      rows.forEach((row) => {
        console.log(
          `[BadgeVerification] ${row.provider_name} (id=${row.provider_id})`,
          `activity=${row.activity_percentage}% [${checkLabel(row.activity_ok)}]`,
          `reliability=${row.reliability_percentage}% [${checkLabel(row.reliability_ok)}]`,
          `quality=${row.quality_percentage}% [${checkLabel(row.quality_ok)}]`,
          `trust=${row.trust_percentage}% [${checkLabel(row.trust_ok)}]`,
          `kyc_verified=${row.kyc_verified}`,
          `=> ${row.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`,
        );
      });
    } catch (error) {
      Alert.alert('Badge queue unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const updateBadge = async (profile, decision) => {
    if (!profile?.user?.id) return;
    try {
      setProcessingId(profile.user.id);
      await api.put(`/api/users/admin/badge/${profile.user.id}/`, { status: decision });
      Alert.alert(
        decision === 'approved' ? 'Eligibility approved' : 'Eligibility rejected',
        decision === 'approved'
          ? `${profile.user.full_name} can now buy the Servista trust badge from their provider settings.`
          : `${profile.user.full_name} was not approved for badge purchase.`,
      );
      loadData();
    } catch (error) {
      Alert.alert('Badge update failed', errorMessage(error));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <Text style={dssStyles.headerTitle}>AI Badge Validation</Text>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>BADGE ELIGIBILITY RULES</Text>
          <Text style={dssStyles.cardSubtext}>
            Activity, Reliability & Quality at or above 50%. Trust must be 100% from approved KYC.
            The AI selects candidates; admin validates eligibility; the provider pays 15,000 FCFA to activate the badge.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
        ) : (
          <>
            <View style={dssStyles.card}>
              <Text style={dssStyles.cardValue}>{providers.length}</Text>
              <Text style={dssStyles.cardTitle}>ELIGIBLE FOR BADGE REVIEW</Text>
              <Text style={dssStyles.cardSubtext}>
                {debugRows.length} providers scanned · see console for full debug output
              </Text>
            </View>

            {providers.length === 0 ? (
              <Text style={dssStyles.emptyText}>
                No providers currently meet badge verification criteria. Recalculate DSS scores and ensure KYC is approved with trust at 100%.
              </Text>
            ) : (
              providers.map((profile) => {
                const checks = profile.eligibility_checks || {};
                const busy = processingId === profile.user?.id;
                return (
                  <View key={profile.id} style={dssStyles.card}>
                    <View style={dssStyles.rowBetween}>
                      <View style={dssStyles.flex}>
                        <Text style={dssStyles.providerName}>{profile.user?.full_name}</Text>
                        <Text style={dssStyles.cardSubtext}>
                          {profile.business_name || 'Provider'} · {profile.address || 'Cameroon'}
                        </Text>
                      </View>
                      <View style={[dssStyles.badge, { backgroundColor: colors.green }]}>
                        <Text style={dssStyles.badgeText}>ELIGIBLE</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <Text style={[dssStyles.cardSubtext, { color: checkColor(checks.activity_ok) }]}>
                        Act {profile.activity_percentage}% · {checkLabel(checks.activity_ok)}
                      </Text>
                      <Text style={[dssStyles.cardSubtext, { color: checkColor(checks.reliability_ok) }]}>
                        Rel {profile.reliability_percentage}% · {checkLabel(checks.reliability_ok)}
                      </Text>
                      <Text style={[dssStyles.cardSubtext, { color: checkColor(checks.quality_ok) }]}>
                        Qual {profile.quality_percentage}% · {checkLabel(checks.quality_ok)}
                      </Text>
                      <Text style={[dssStyles.cardSubtext, { color: checkColor(checks.trust_ok) }]}>
                        Trust {profile.trust_percentage}% · {checkLabel(checks.trust_ok)}
                      </Text>
                    </View>

                    <Text style={[dssStyles.cardSubtext, { marginTop: 8 }]}>
                      Overall {profile.overall_score} · {profile.fraud_risk_level} risk
                    </Text>
                    <View style={[dssStyles.badge, { backgroundColor: riskColor(profile.fraud_risk_level), marginTop: 8, alignSelf: 'flex-start' }]}>
                      <Text style={dssStyles.badgeText}>{profile.fraud_risk_level}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[dssStyles.primaryBtn, { flex: 1, backgroundColor: colors.green }]}
                        disabled={busy}
                        onPress={() => updateBadge(profile, 'approved')}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.white} />
                        ) : (
                          <Text style={dssStyles.primaryBtnText}>APPROVE ELIGIBILITY</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[dssStyles.dangerOutlineBtn, { flex: 1 }]}
                        disabled={busy}
                        onPress={() => updateBadge(profile, 'rejected')}
                      >
                        <Text style={dssStyles.dangerOutlineText}>REJECT</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
