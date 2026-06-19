import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { errorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { dssStyles } from './dssStyles';
import { Text, TextInput } from './dssText';

const REASON_LABELS = {
  no_show: 'Provider did not show up',
  poor_quality: 'Poor quality of work',
  fraud: 'Suspected fraud or scam',
  overcharging: 'Overcharged beyond agreed price',
  fake_reviews: 'Suspected fake reviews',
  other: 'Other reason',
};

export default function ReportDetailScreen({ route, navigation }) {
  const reportId = route.params?.reportId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);
  const [adminNote, setAdminNote] = useState('');

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/dss/reports/');
      const list = Array.isArray(data) ? data : [];
      const found = list.find((r) => r.id === reportId);
      setReport(found || null);
      setAdminNote(found?.admin_note || '');
    } catch (error) {
      Alert.alert('Report unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const updateStatus = async (status) => {
    try {
      setSaving(true);
      await api.put(`/api/dss/reports/${reportId}/`, { status, admin_note: adminNote });
      Alert.alert('Updated', `Report marked as ${status}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Update failed', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={dssStyles.screen}>
        <ActivityIndicator color={colors.orange} style={dssStyles.loader} size="large" />
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={dssStyles.screen}>
        <Text style={dssStyles.emptyText}>Report not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <Text style={dssStyles.headerTitle}>Report Details</Text>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>REPORTER</Text>
          <Text style={dssStyles.detailValue}>{report.reporter_name}</Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>REPORTED PROVIDER</Text>
          <Text style={dssStyles.detailValue}>{report.provider_name}</Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>BOOKING REFERENCE</Text>
          <Text style={dssStyles.detailValue}>
            {report.booking ? `#${report.booking}` : 'No booking linked'}
          </Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>REASON</Text>
          <Text style={dssStyles.detailValue}>
            {REASON_LABELS[report.reason] || report.reason}
          </Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>DESCRIPTION</Text>
          <Text style={[dssStyles.cardSubtext, { marginTop: 8, color: colors.textDark, lineHeight: 22 }]}>
            {report.description}
          </Text>
        </View>

        <View style={dssStyles.card}>
          <Text style={dssStyles.cardTitle}>ADMIN NOTE</Text>
          <TextInput
            value={adminNote}
            onChangeText={setAdminNote}
            placeholder="Add investigation notes..."
            placeholderTextColor="#8FA0B8"
            multiline
            style={dssStyles.noteInput}
          />
        </View>

        {saving ? (
          <ActivityIndicator color={colors.orange} />
        ) : (
          <>
            <TouchableOpacity style={dssStyles.navyBtn} onPress={() => updateStatus('investigating')}>
              <Text style={dssStyles.navyBtnText}>MARK INVESTIGATING</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dssStyles.primaryBtn} onPress={() => updateStatus('resolved')}>
              <Text style={dssStyles.primaryBtnText}>MARK RESOLVED</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dssStyles.outlineBtn} onPress={() => updateStatus('dismissed')}>
              <Text style={dssStyles.outlineBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
