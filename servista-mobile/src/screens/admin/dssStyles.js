import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { fontFamily, fontFamilyBold, fontFamilyMedium } from '../../theme/typography';

export const ADMIN_NAVY = '#132541';
export const ADMIN_MUTED = '#B9C5D8';
export const ADMIN_MUTED_SOFT = '#8FA0B8';

export const RISK_COLORS = {
  HIGH: colors.red,
  MEDIUM: colors.orange,
  LOW: colors.green,
};

export const dssStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.orange,
    flex: 1,
    fontFamily: fontFamilyBold,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  backText: {
    color: ADMIN_MUTED_SOFT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: ADMIN_MUTED_SOFT,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontFamily: fontFamilyBold,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textDark,
    marginTop: 8,
    fontFamily: fontFamilyBold,
  },
  cardSubtext: {
    color: colors.textGray,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    fontFamily: fontFamily,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  riskRow: { flexDirection: 'row', gap: 14 },
  riskCard: {
    flex: 1,
    minHeight: 132,
    backgroundColor: ADMIN_NAVY,
    borderRadius: 22,
    padding: 20,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.12)',
  },
  riskLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: ADMIN_MUTED,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: fontFamilyBold,
  },
  riskCount: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
    marginTop: 8,
    fontFamily: fontFamilyBold,
  },
  riskAccent: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase',
    fontFamily: fontFamilyBold,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  navyBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: ADMIN_NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.12)',
  },
  navyBtnText: {
    color: ADMIN_MUTED,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  outlineBtn: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(242,101,34,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(242,101,34,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineBtnText: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  dangerOutlineBtn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  dangerOutlineText: {
    color: colors.red,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: 'rgba(242,101,34,0.1)',
    borderColor: 'rgba(242,101,34,0.18)',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textGray,
    fontFamily: fontFamilyMedium,
  },
  filterTextActive: {
    color: colors.orange,
    fontFamily: fontFamilyBold,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textDark,
    fontFamily: fontFamily,
  },
  scoreBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inputBackground,
    overflow: 'hidden',
    marginTop: 6,
  },
  scoreBarFill: { height: 8, borderRadius: 4 },
  scoreBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ADMIN_MUTED_SOFT,
    marginTop: 8,
    fontFamily: fontFamilyMedium,
  },
  scoreBarValue: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textDark,
    fontFamily: fontFamilyBold,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textGray,
    fontSize: 14,
    lineHeight: 20,
    padding: 24,
    fontFamily: fontFamily,
  },
  loader: { marginTop: 40 },
  providerName: {
    fontWeight: '900',
    fontSize: 15,
    color: colors.textDark,
    fontFamily: fontFamilyBold,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: ADMIN_NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontWeight: '900',
    color: colors.orange,
    fontFamily: fontFamilyBold,
  },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircleText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 18,
    fontFamily: fontFamilyBold,
  },
  embeddedPanel: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 18,
    gap: 14,
    shadowColor: colors.navy,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  embeddedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  embeddedHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  embeddedTitle: {
    color: colors.orange,
    fontSize: 22,
    fontWeight: '900',
    flexShrink: 1,
    fontFamily: fontFamilyBold,
  },
  embeddedExpandLink: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: fontFamilyBold,
  },
  embeddedBody: { gap: 16 },
  detailLine: {
    marginTop: 8,
    color: colors.textDark,
    fontSize: 14,
    fontFamily: fontFamily,
  },
  detailValue: {
    marginTop: 4,
    fontWeight: '900',
    color: colors.textDark,
    fontSize: 15,
    fontFamily: fontFamilyBold,
  },
  noteInput: {
    marginTop: 8,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    color: colors.textDark,
    fontFamily: fontFamily,
    fontSize: 14,
    backgroundColor: colors.white,
  },
});

export function riskColor(level) {
  return RISK_COLORS[level] || colors.textGray;
}

export function scoreColor(value) {
  if (value >= 70) return colors.green;
  if (value >= 40) return colors.orange;
  return colors.red;
}

export function riskBorderColor(level) {
  const map = {
    HIGH: 'rgba(239,68,68,0.35)',
    MEDIUM: 'rgba(242,101,34,0.35)',
    LOW: 'rgba(16,185,129,0.35)',
  };
  return map[level] || 'rgba(59,130,246,0.12)';
}
