import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { ADMIN_MUTED, ADMIN_NAVY, dssStyles, riskColor, scoreColor } from './dssStyles';
import { Text } from './dssText';

function Stars({ rating }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? 'star' : 'star-outline'}
          size={18}
          color={colors.orange}
        />
      ))}
    </View>
  );
}

export default function ProviderScoreDetailScreen({ route, navigation }) {
  const providerId = route.params?.providerId;
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [updatingEligibility, setUpdatingEligibility] = useState(false);
  const [score, setScore] = useState(null);

  const loadScore = useCallback(async () => {
    if (!providerId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/api/dss/scores/${providerId}/`);
      setScore(data);
    } catch (error) {
      Alert.alert('Score unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => { loadScore(); }, [loadScore]);

  const recalculate = async () => {
    try {
      setRecalculating(true);
      const { data } = await api.get(`/api/dss/scores/${providerId}/`);
      setScore(data);
      Alert.alert('Recalculated', 'Provider score has been updated.');
    } catch (error) {
      Alert.alert('Recalculation failed', errorMessage(error));
    } finally {
      setRecalculating(false);
    }
  };

  const setBatchEligibility = async (approved) => {
    try {
      setUpdatingEligibility(true);
      const { data } = await api.patch(`/api/dss/scores/${providerId}/`, {
        batch_eligible: approved,
      });
      setScore(data);
      Alert.alert(
        approved ? 'Batch eligibility approved' : 'Batch eligibility removed',
        approved
          ? 'This provider can now appear in the admin badge validation queue.'
          : 'This provider will only appear in batch if they meet automatic criteria.',
      );
    } catch (error) {
      Alert.alert('Update failed', errorMessage(error));
    } finally {
      setUpdatingEligibility(false);
    }
  };

  const suspendProvider = () => {
    Alert.alert(
      'Suspend Provider',
      `Are you sure you want to suspend ${score?.provider_name}? This action requires admin review.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: () => Alert.alert('Noted', 'Provider suspension flagged for admin review.'),
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={dssStyles.screen}>
        <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
      </SafeAreaView>
    );
  }

  if (!score) {
    return (
      <SafeAreaView style={dssStyles.screen}>
        <Text style={dssStyles.emptyText}>Provider score not found.</Text>
      </SafeAreaView>
    );
  }

  const flags = Array.isArray(score.fraud_flags) ? score.fraud_flags : [];

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <View style={[dssStyles.card, dssStyles.row, { backgroundColor: ADMIN_NAVY, borderColor: 'rgba(59,130,246,0.12)' }]}>
          <View style={[dssStyles.avatar, { width: 64, height: 64, borderRadius: 20, backgroundColor: '#302D42' }]}>
            <Text style={[dssStyles.avatarText, { fontSize: 24 }]}>
              {(score.provider_name || 'P').slice(0, 1)}
            </Text>
          </View>
          <View style={dssStyles.flex}>
            <Text style={[dssStyles.providerName, { color: colors.white, fontSize: 20 }]}>{score.provider_name}</Text>
            <Text style={[dssStyles.cardSubtext, { color: ADMIN_MUTED }]}>{score.provider_email}</Text>
          </View>
          <View style={[dssStyles.scoreCircle, { width: 72, height: 72, borderRadius: 20, backgroundColor: scoreColor(score.overall_score) }]}>
            <Text style={dssStyles.scoreCircleText}>{score.overall_score}</Text>
            <Text style={[dssStyles.badgeText, { fontSize: 8 }]}>OVERALL</Text>
          </View>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>BADGE ELIGIBILITY</Text>
          <View style={[dssStyles.badge, {
            backgroundColor: score.batch_eligible ? colors.green : colors.textGray,
            marginTop: 8,
          }]}
          >
            <Text style={dssStyles.badgeText}>
              {score.batch_eligible ? 'ELIGIBLE FOR ADMIN VALIDATION' : 'NOT ELIGIBLE'}
            </Text>
          </View>
          {score.batch_eligible_override ? (
            <Text style={[dssStyles.cardSubtext, { marginTop: 8 }]}>
              Admin manually approved this provider for badge validation.
            </Text>
          ) : null}
          <Text style={[dssStyles.detailLine, { marginTop: 10 }]}>
            KYC approved {score.is_kyc_verified ? 'PASS' : 'FAIL'} (Trust must be 100%)
          </Text>
          <Text style={dssStyles.detailLine}>
            Activity {score.activity_score >= 50 ? 'PASS' : 'FAIL'} (need at least 50%)
          </Text>
          <Text style={dssStyles.detailLine}>
            Reliability {score.reliability_score >= 50 ? 'PASS' : 'FAIL'} (need at least 50%)
          </Text>
          <Text style={dssStyles.detailLine}>
            Quality {score.quality_score >= 50 ? 'PASS' : 'FAIL'} (need at least 50%)
          </Text>
          <Text style={dssStyles.detailLine}>
            Trust {score.trust_score >= 100 && score.total_complaints === 0 ? 'PASS' : 'FAIL'} (must be 100% with no active complaints)
          </Text>
          {score.is_kyc_verified ? (
            <TouchableOpacity
              style={[dssStyles.outlineBtn, { marginTop: 14 }]}
              onPress={() => setBatchEligibility(!score.batch_eligible)}
              disabled={updatingEligibility}
            >
              {updatingEligibility ? (
                <ActivityIndicator color={colors.orange} />
              ) : (
                <Text style={dssStyles.outlineBtnText}>
                  {score.batch_eligible ? 'REMOVE ELIGIBILITY' : 'APPROVE FOR BADGE VALIDATION'}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={[dssStyles.cardSubtext, { marginTop: 10 }]}>
              KYC must be approved before badge validation.
            </Text>
          )}
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>FRAUD RISK</Text>
          <View style={[dssStyles.badge, { backgroundColor: riskColor(score.fraud_risk_level), marginTop: 8 }]}>
            <Text style={dssStyles.badgeText}>{score.fraud_risk_level} - {score.fraud_risk_points} pts</Text>
          </View>
          {flags.length ? flags.map((flag, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Ionicons name="warning" size={16} color={riskColor(score.fraud_risk_level)} />
              <Text style={[dssStyles.cardSubtext, { flex: 1, color: colors.textDark }]}>{flag}</Text>
            </View>
          )) : (
            <Text style={dssStyles.cardSubtext}>No fraud flags detected.</Text>
          )}
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>ACTIVITY SCORE - {score.activity_score}%</Text>
          <Text style={dssStyles.detailLine}>Completed: {score.jobs_completed}</Text>
          <Text style={dssStyles.detailLine}>Accepted: {score.jobs_accepted}</Text>
          <Text style={dssStyles.detailLine}>Rejected: {score.jobs_rejected}</Text>
          <Text style={dssStyles.detailLine}>Cancelled: {score.jobs_cancelled}</Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>QUALITY SCORE - {score.quality_score}%</Text>
          <Stars rating={score.average_rating} />
          <Text style={dssStyles.detailLine}>
            {score.average_rating} avg · {score.total_reviews} reviews
          </Text>
          <Text style={dssStyles.detailLine}>Satisfaction: {score.satisfaction_rate}%</Text>
          <Text style={dssStyles.detailLine}>Repeat customers: {score.repeat_customers}</Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>RELIABILITY SCORE - {score.reliability_score}%</Text>
          <Text style={[dssStyles.scoreBarLabel, { marginTop: 8 }]}>Completion rate</Text>
          <View style={dssStyles.scoreBarTrack}>
            <View style={[dssStyles.scoreBarFill, { width: `${score.completion_rate}%`, backgroundColor: scoreColor(score.completion_rate) }]} />
          </View>
          <Text style={dssStyles.scoreBarLabel}>Attendance rate</Text>
          <View style={dssStyles.scoreBarTrack}>
            <View style={[dssStyles.scoreBarFill, { width: `${score.attendance_rate}%`, backgroundColor: scoreColor(score.attendance_rate) }]} />
          </View>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>TRUST SCORE - {score.trust_score}%</Text>
          <View style={[dssStyles.row, { marginTop: 10, gap: 8 }]}>
            <Ionicons
              name={score.is_kyc_verified ? 'checkmark-circle' : 'close-circle'}
              size={22}
              color={score.is_kyc_verified ? colors.green : colors.red}
            />
            <Text style={dssStyles.detailValue}>
              KYC {score.is_kyc_verified ? 'Verified' : 'Not Verified'}
            </Text>
          </View>
          <Text style={dssStyles.detailLine}>Active complaints: {score.total_complaints}</Text>
        </View>

        <TouchableOpacity style={dssStyles.primaryBtn} onPress={recalculate} disabled={recalculating}>
          {recalculating ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={dssStyles.primaryBtnText}>RECALCULATE</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={dssStyles.dangerOutlineBtn} onPress={suspendProvider}>
          <Text style={dssStyles.dangerOutlineText}>SUSPEND PROVIDER</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
