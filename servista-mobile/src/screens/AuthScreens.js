import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text as RNText, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Logo } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../theme/colors';
import { withFont } from '../theme/typography';

const servistaLogo = require('../../assets/servista-logo.png');

WebBrowser.maybeCompleteAuthSession();

function Text({ children, ...props }) {
  const { tn } = useLanguage();
  return <RNText {...props} style={withFont(props.style)}>{tn(children)}</RNText>;
}

export function SplashScreen() {
  return (
    <SafeAreaView style={styles.splash}>
      <Image source={servistaLogo} style={styles.splashLogoImage} resizeMode="contain" />
      <Logo dark />
      <Text style={styles.tagline}>Reliable Pros for Every Need</Text>
    </SafeAreaView>
  );
}

function GoogleSignInButton({ onTwoFactor }) {
  const { loginWithGoogle } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const handledToken = useRef(null);
  const googleClientId = Platform.select({
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: googleClientId || 'missing-google-client-id',
    selectAccount: true,
  });

  useEffect(() => {
    const idToken = response?.params?.id_token;
    if (response?.type !== 'success' || !idToken || handledToken.current === idToken) return;
    handledToken.current = idToken;
    setLoading(true);
    loginWithGoogle(idToken)
      .then((result) => {
        if (result?.requires_2fa) onTwoFactor(result);
      })
      .finally(() => setLoading(false));
  }, [response, loginWithGoogle, onTwoFactor]);

  const signIn = async () => {
    if (!googleClientId) {
      Alert.alert('Google sign-in unavailable', 'Add the Google OAuth client IDs, then restart Expo.');
      return;
    }
    await promptAsync();
  };

  return (
    <TouchableOpacity activeOpacity={0.8} disabled={loading} onPress={signIn} style={styles.googleButton}>
      <Text style={styles.googleMark}>{loading ? '…' : 'G'}</Text>
      <Text style={styles.googleText}>{t('Continue with Google')}</Text>
    </TouchableOpacity>
  );
}

export function LoginScreen({ navigation }) {
  const { login, verifyEmailCode } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setFormError(t('Enter your email and password.'));
      return;
    }
    setFormError('');
    setLoading(true);
    const result = await login(email.trim(), password);
    if (result?.requires_2fa) {
      setChallenge(result);
      setVerificationCode('');
    } else if (result?.error) setFormError(result.error);
    setLoading(false);
  };

  const submitCode = async () => {
    if (verificationCode.length !== 6) {
      setFormError(t('Enter the 6 digit code sent to your email.'));
      return;
    }
    setFormError('');
    setLoading(true);
    const result = await verifyEmailCode(challenge.challenge_id, verificationCode);
    if (result?.error) setFormError(result.error);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.loginScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.loginPanel}>
            <Text style={styles.loginLogo}>Servista</Text>
            <Text style={styles.loginSubtitle}>{challenge ? 'Check your email' : 'Welcome back!'}</Text>

            {challenge ? (
            <View style={styles.loginForm}>
              <Text style={styles.twoFactorText}>We sent a 6 digit verification code to {challenge.email}. Enter it to finish signing in.</Text>
              <Text style={styles.loginLabel}>VERIFICATION CODE</Text>
              <Input placeholder="000000" keyboardType="number-pad" value={verificationCode} onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))} style={styles.loginInput} />
              {formError ? <View style={styles.loginErrorBox}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.loginErrorText}>{formError}</Text></View> : null}
              <Button label="Verify Email" icon="shield-checkmark-outline" loading={loading} onPress={submitCode} />
              <TouchableOpacity activeOpacity={0.8} onPress={() => { setChallenge(null); setVerificationCode(''); setFormError(''); }} style={styles.googleButton}><Text style={styles.googleText}>Use another email</Text></TouchableOpacity>
            </View>
            ) : (
            <View style={styles.loginForm}>
              <Text style={styles.loginLabel}>EMAIL ADDRESS</Text>
              <Input placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.loginInput} />

              <Text style={styles.loginLabel}>PASSWORD</Text>
              <Input
                placeholder="Password"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={styles.loginInput}
                right={(
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setShowPassword((value) => !value)} style={styles.passwordEyeButton}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.orange} />
                  </TouchableOpacity>
                )}
              />

              {formError ? (
                <View style={styles.loginErrorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                  <Text style={styles.loginErrorText}>{formError}</Text>
                </View>
              ) : null}

              <Button label="Sign In" icon="arrow-forward" loading={loading} onPress={submit} />

              <GoogleSignInButton onTwoFactor={(result) => {
                setChallenge(result);
                setVerificationCode('');
                setFormError('');
              }} />
            </View>
            )}
            {!challenge ? <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Register')}>
              <Text style={styles.loginBottomText}>New here? <Text style={styles.orangeUnderline}>Create account</Text></Text>
            </TouchableOpacity> : <View />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function RegisterScreen({ navigation }) {
  const { register, verifyEmailCode } = useAuth();
  const { t } = useLanguage();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityArea, setCityArea] = useState('');
  const [exactAddress, setExactAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('client');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (role === 'client' && !cityArea.trim()) {
      Alert.alert(t('Location required'), t('Please enter your City/Area before creating your client account.'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('Password mismatch'), t('Please confirm your password correctly.'));
      return;
    }
    setLoading(true);
    const result = await register({
      full_name: `${firstName} ${lastName}`.trim(),
      email,
      phone,
      city_area: cityArea.trim(),
      address: exactAddress.trim(),
      role,
      password,
    });
    if (result?.requires_2fa) {
      setChallenge(result);
      setVerificationCode('');
    }
    setLoading(false);
  };

  const submitCode = async () => {
    if (verificationCode.length !== 6) {
      Alert.alert(t('Verification code required'), t('Enter the 6 digit code sent to your email.'));
      return;
    }
    setLoading(true);
    await verifyEmailCode(challenge.challenge_id, verificationCode);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.signupScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.signupScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.signupPanel}>
            <View style={styles.signupHeader}>
              <Text style={styles.signupLogo}>Servista</Text>
              <Text style={styles.signupTitle}>{challenge ? 'Verify Email' : 'Hire Talent'}</Text>
            </View>

            {challenge ? (
              <>
                <Text style={styles.twoFactorText}>We sent a 6 digit verification code to {challenge.email}. This confirms your account email is real.</Text>
                <Input placeholder="000000" keyboardType="number-pad" value={verificationCode} onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))} style={styles.signupInput} />
                <Button label="Verify Email" icon="shield-checkmark-outline" loading={loading} onPress={submitCode} />
                <TouchableOpacity activeOpacity={0.8} onPress={() => setChallenge(null)}><Text style={styles.signupBottomText}>Use a different email</Text></TouchableOpacity>
              </>
            ) : (
            <>
            <View style={styles.signupToggle}>
              {['client', 'provider'].map((item) => (
                <TouchableOpacity activeOpacity={0.8} key={item} onPress={() => setRole(item)} style={[styles.signupTogglePill, role === item && styles.signupToggleActive]}>
                  <Text style={[styles.signupToggleText, role === item && styles.signupToggleTextActive]}>{item === 'client' ? 'Client' : 'Provider'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.nameRow}>
              <Input placeholder="First Name" value={firstName} onChangeText={setFirstName} style={styles.signupHalfInput} />
              <Input placeholder="Last Name" value={lastName} onChangeText={setLastName} style={styles.signupHalfInput} />
            </View>
            <Input placeholder="Email Address" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.signupInput} />
            <Input placeholder="+237 Phone Number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} style={styles.signupInput} />
            {role === 'client' ? (
              <>
                <Input placeholder="City / Area (required)" value={cityArea} onChangeText={setCityArea} style={styles.signupInput} />
                <Input placeholder="Exact Address (optional)" value={exactAddress} onChangeText={setExactAddress} style={styles.signupInput} />
              </>
            ) : null}
            <Input
              placeholder="Password"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              style={styles.signupInput}
              right={(
                <TouchableOpacity activeOpacity={0.8} onPress={() => setShowPassword((value) => !value)} style={styles.passwordEyeButton}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.orange} />
                </TouchableOpacity>
              )}
            />
            <Input
              placeholder="Confirm Password"
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.signupInput}
              right={(
                <TouchableOpacity activeOpacity={0.8} onPress={() => setShowConfirmPassword((value) => !value)} style={styles.passwordEyeButton}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.orange} />
                </TouchableOpacity>
              )}
            />

            <Button label="Create Account" loading={loading} onPress={submit} />

            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.signupBottomText}>Already a member? <Text style={styles.orangeUnderline}>Sign In</Text></Text>
            </TouchableOpacity>
            </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AdminLoginScreen(props) {
  return <LoginScreen {...props} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loginScreen: { flex: 1, backgroundColor: '#F4F5F7' },
  signupScreen: { flex: 1, backgroundColor: '#F4F5F7' },
  darkScreen: { flex: 1, backgroundColor: colors.darkNavy },
  keyboard: { flex: 1 },
  splash: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', gap: 14 },
  splashLogoImage: { width: 96, height: 96, borderRadius: 24, marginBottom: 4 },
  tagline: { color: '#CBD5E1', fontSize: 16 },
  loginScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 24 },
  loginPanel: {
    minHeight: 720,
    borderRadius: 44,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 32,
    justifyContent: 'space-between',
    shadowColor: colors.navy,
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4
  },
  loginLogo: { color: colors.orange, fontSize: 46, lineHeight: 54, fontWeight: '900', textAlign: 'center' },
  loginSubtitle: { color: colors.textGray, fontSize: 20, textAlign: 'center', marginTop: -8 },
  loginForm: { gap: 14 },
  loginLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '900', marginLeft: 8 },
  loginInput: { height: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: '#F9FAFB', marginBottom: 16, paddingRight: 8 },
  loginErrorBox: { minHeight: 48, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loginErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  twoFactorText: { color: colors.textGray, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
  twoFactorDevText: { color: colors.orange, fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: -8 },
  passwordEyeButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(242,101,34,0.1)', alignItems: 'center', justifyContent: 'center' },
  googleButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    shadowColor: colors.navy,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  googleMark: { color: colors.blue, fontSize: 24, fontWeight: '900' },
  googleText: { color: '#111827', fontSize: 18, fontWeight: '900' },
  loginBottomText: { color: colors.textGray, fontSize: 16, textAlign: 'center' },
  signupScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 24 },
  signupPanel: {
    minHeight: 720,
    borderRadius: 44,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    gap: 18,
    shadowColor: colors.navy,
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4
  },
  signupHeader: { alignItems: 'center', gap: 6, marginBottom: 16 },
  signupLogo: { color: colors.orange, fontSize: 36, lineHeight: 42, fontWeight: '900' },
  signupTitle: { color: '#000000', fontSize: 22, fontWeight: '900' },
  signupToggle: { height: 70, borderRadius: 18, backgroundColor: '#F1F2F5', borderWidth: 1, borderColor: colors.border, padding: 8, flexDirection: 'row', gap: 8 },
  signupTogglePill: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  signupToggleActive: { backgroundColor: colors.orange },
  signupToggleText: { color: colors.textGray, fontSize: 16, fontWeight: '900', textTransform: 'capitalize' },
  signupToggleTextActive: { color: colors.white },
  nameRow: { flexDirection: 'row', gap: 16 },
  signupHalfInput: { flex: 1, height: 60, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#F9FAFB' },
  signupInput: { height: 60, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#F9FAFB', paddingRight: 8 },
  signupBottomText: { color: colors.textGray, fontSize: 15, textAlign: 'center', marginTop: 4 },
  loginHero: { backgroundColor: colors.darkNavy, paddingHorizontal: 24, paddingTop: 20, minHeight: 260, gap: 18 },
  heroTitle: { color: colors.white, fontSize: 34, fontWeight: '900', marginTop: 40 },
  heroSubtitle: { color: '#CBD5E1', fontSize: 15, lineHeight: 22 },
  authCard: { flex: 1, marginTop: -24, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: colors.white, padding: 24, gap: 14 },
  label: { color: colors.subtext, fontSize: 12, fontWeight: '900' },
  orangeText: { color: colors.primary, fontWeight: '800' },
  orangeUnderline: { color: colors.primary, fontWeight: '800', textDecorationLine: 'underline' },
  centerOrange: { color: colors.primary, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  forgotLink: { textAlign: 'center', color: colors.subtext, marginTop: 4 },
  bottomLink: { textAlign: 'center', color: colors.subtext, marginTop: 6 },
  registerHero: { backgroundColor: colors.darkNavy, paddingHorizontal: 24, paddingTop: 24, height: 190, gap: 24 },
  registerTagline: { color: colors.white, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  registerCard: { flex: 1, marginTop: -28, backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  registerContent: { padding: 24, gap: 14, paddingBottom: 32 },
  cardTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  cardSubtitle: { color: colors.subtext, lineHeight: 20 },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.inputBackground, borderRadius: 999, padding: 4 },
  togglePill: { flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  toggleActive: { backgroundColor: colors.orange },
  toggleText: { color: colors.subtext, fontWeight: '800', textTransform: 'capitalize' },
  toggleTextActive: { color: colors.white },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  termsText: { flex: 1, color: colors.subtext, lineHeight: 20 }
});
