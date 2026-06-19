import { NavigationContainer } from '@react-navigation/native';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Image, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/theme/colors';

const servistaLogo = require('./assets/servista-logo.png');

RNText.defaultProps = RNText.defaultProps || {};
RNText.defaultProps.style = [{ fontFamily: 'DMSans_400Regular' }, RNText.defaultProps.style];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [{ fontFamily: 'DMSans_400Regular' }, TextInput.defaultProps.style];

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: colors.navy }}>
        <Image source={servistaLogo} style={{ width: 96, height: 96, borderRadius: 24 }} resizeMode="contain" />
        <ActivityIndicator color={colors.orange} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
