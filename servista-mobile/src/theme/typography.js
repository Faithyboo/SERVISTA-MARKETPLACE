import { StyleSheet } from 'react-native';

export const fontFamily = 'DMSans_400Regular';
export const fontFamilyMedium = 'DMSans_500Medium';
export const fontFamilyBold = 'DMSans_700Bold';

function resolveFontFamily(style) {
  const flattened = StyleSheet.flatten(style) || {};
  const weight = String(flattened.fontWeight || '');

  if (weight === 'bold' || Number(weight) >= 700) {
    return fontFamilyBold;
  }

  if (Number(weight) >= 500) {
    return fontFamilyMedium;
  }

  return fontFamily;
}

export function withFont(style) {
  const family = resolveFontFamily(style);
  return Array.isArray(style) ? [...style, { fontFamily: family }] : [style, { fontFamily: family }];
}
