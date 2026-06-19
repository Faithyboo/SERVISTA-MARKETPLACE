import { Ionicons } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';
import { Text } from './dssText';

const NAV_ITEMS = [
  { id: 'Dashboard', label: 'Dashboard', icon: 'grid-outline', screen: 'Tabs', params: { screen: 'Dashboard' } },
  { id: 'Provider Scores', label: 'Provider Scores', icon: 'bar-chart-outline', screen: 'ProviderScores' },
  { id: 'Batch Verification', label: 'Batch Verification', icon: 'checkbox-outline', screen: 'BatchVerification' },
  { id: 'Escrow System', label: 'Escrow System', icon: 'cash-outline', screen: 'Tabs', params: { screen: 'Escrow' } },
  { id: 'AI Support', label: 'AI Support', icon: 'hardware-chip-outline', screen: 'DSSAIPanel' },
  { id: 'System Health', label: 'System Health', icon: 'shield-checkmark-outline', screen: 'SystemHealth' },
];

export function adminNavigate(navigation, screen, params) {
  navigation.navigate(screen, params);
}

export function AdminWorkspaceLayout({
  navigation,
  active,
  title,
  eyebrow,
  subtitle,
  search,
  onSearch,
  searchPlaceholder = 'Search system...',
  onRefresh,
  refreshing,
  headerActions,
  children,
}) {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 980;

  const navigateTo = (item) => {
    navigation.navigate(item.screen, item.params);
  };

  return (
    <SafeAreaView style={workspace.screen} edges={['top', 'left', 'right']}>
      <View style={[workspace.shell, !desktop && workspace.shellCompact]}>
        {desktop ? (
          <View style={workspace.sidebar}>
            <View>
              <Text style={workspace.brand}>AI Sentinel</Text>
              <Text style={workspace.brandSubtitle}>System Oversight</Text>
            </View>
            <View style={workspace.navigation}>
              {NAV_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => navigateTo(item)}
                  style={[workspace.navItem, active === item.id && workspace.navItemActive]}
                >
                  <Ionicons name={item.icon} size={20} color={active === item.id ? colors.orange : '#E2E8F0'} />
                  <Text style={[workspace.navLabel, active === item.id && workspace.navLabelActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={workspace.sidebarBottom}>
              <TouchableOpacity style={workspace.newAnalysis} onPress={() => navigation.navigate('DSSAIPanel')}>
                <Ionicons name="sparkles-outline" size={18} color={colors.white} />
                <Text style={workspace.newAnalysisText}>New Analysis</Text>
              </TouchableOpacity>
              <TouchableOpacity style={workspace.sideMinor} onPress={() => navigation.navigate('Tabs', { screen: 'Settings' })}>
                <Ionicons name="settings-outline" size={18} color="#E2E8F0" />
                <Text style={workspace.sideMinorText}>Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={workspace.main}>
          <View style={workspace.topbar}>
            <Text style={workspace.topTitle}>{desktop ? 'AI Sentinel Admin' : title}</Text>
            {onSearch ? (
              <View style={workspace.searchBox}>
                <Ionicons name="search-outline" size={20} color="#64748B" />
                <TextInput
                  value={search}
                  onChangeText={onSearch}
                  placeholder={searchPlaceholder}
                  placeholderTextColor="#64748B"
                  style={workspace.searchInput}
                />
              </View>
            ) : null}
            <View style={workspace.topActions}>
              {desktop ? <Text style={workspace.topLink}>Reports</Text> : null}
              {desktop ? <Text style={workspace.topLink}>Logs</Text> : null}
              {desktop ? <Text style={workspace.topLink}>Audit</Text> : null}
              {onRefresh ? (
                <TouchableOpacity
                  style={workspace.iconButton}
                  onPress={onRefresh}
                  disabled={refreshing}
                  accessibilityLabel="Refresh workspace"
                >
                  <Ionicons name="refresh-outline" size={20} color="#40516F" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <ScrollView contentContainerStyle={[workspace.content, !desktop && workspace.contentCompact]} showsVerticalScrollIndicator={false}>
            <View style={workspace.pageHeading}>
              <View style={workspace.headingCopy}>
                {eyebrow ? <Text style={workspace.eyebrow}>{eyebrow}</Text> : null}
                <Text style={workspace.title}>{title}</Text>
                {subtitle ? <Text style={workspace.subtitle}>{subtitle}</Text> : null}
              </View>
              {headerActions ? <View style={workspace.headerActions}>{headerActions}</View> : null}
            </View>
            {children}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

export const workspace = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  shell: { flex: 1, flexDirection: 'row' },
  shellCompact: { flexDirection: 'column' },
  sidebar: { width: 254, backgroundColor: '#0D2341', padding: 24, justifyContent: 'space-between' },
  brand: { color: colors.orange, fontFamily: fontFamilyBold, fontSize: 25, fontWeight: '900' },
  brandSubtitle: { color: '#A8B7CC', fontSize: 14, marginTop: 4, fontFamily: fontFamily },
  navigation: { gap: 8, marginTop: 36 },
  navItem: { minHeight: 48, paddingHorizontal: 14, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 14 },
  navItemActive: { backgroundColor: '#087A3C', borderRightWidth: 4, borderRightColor: colors.orange, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  navLabel: { color: '#E2E8F0', fontSize: 15, fontFamily: fontFamilyMedium },
  navLabelActive: { color: colors.orange, fontFamily: fontFamilyBold },
  sidebarBottom: { gap: 14 },
  newAnalysis: { backgroundColor: colors.orange, minHeight: 50, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  newAnalysisText: { color: colors.white, fontSize: 15, fontFamily: fontFamilyBold },
  sideMinor: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6 },
  sideMinorText: { color: '#E2E8F0', fontSize: 14, fontFamily: fontFamilyMedium },
  main: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 64, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 22 },
  topTitle: { color: colors.orange, fontSize: 23, fontFamily: fontFamilyBold, fontWeight: '900', flexShrink: 0 },
  searchBox: { width: 310, maxWidth: '36%', minHeight: 42, borderWidth: 1, borderColor: '#F4C8B7', borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCFCFD' },
  searchInput: { color: '#1E293B', fontFamily: fontFamily, fontSize: 15, flex: 1, paddingVertical: 7 },
  topActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 20 },
  topLink: { color: '#40516F', fontSize: 14, fontFamily: fontFamilyMedium },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#F8FAFC' },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 34, paddingTop: 34, paddingBottom: 48, gap: 20 },
  contentCompact: { paddingHorizontal: 16, paddingTop: 20 },
  pageHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.orange, letterSpacing: 1.3, fontSize: 11, fontFamily: fontFamilyBold, fontWeight: '900', textTransform: 'uppercase', marginBottom: 7 },
  title: { color: '#20242B', fontFamily: fontFamilyBold, fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#526987', fontSize: 16, lineHeight: 23, marginTop: 6, fontFamily: fontFamily },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
});
