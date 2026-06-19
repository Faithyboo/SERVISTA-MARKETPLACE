import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AdminLoginScreen, LoginScreen, RegisterScreen, SplashScreen } from '../screens/AuthScreens';
import DSSDashboardScreen from '../screens/admin/DSSDashboardScreen';
import ProviderScoresScreen from '../screens/admin/ProviderScoresScreen';
import ProviderScoreDetailScreen from '../screens/admin/ProviderScoreDetailScreen';
import FraudAlertsScreen from '../screens/admin/FraudAlertsScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';
import ReportDetailScreen from '../screens/admin/ReportDetailScreen';
import BatchVerificationScreen from '../screens/admin/BatchVerificationScreen';
import BadgeVerificationScreen from '../screens/admin/BadgeVerificationScreen';
import SystemHealthScreen from '../screens/admin/SystemHealthScreen';
import AdminNotificationsScreen from '../screens/admin/AdminNotificationsScreen';
import {
  AccountScreen,
  AddServiceScreen,
  AdminDashboardScreen,
  AdminDisputesScreen,
  AdminEscrowScreen,
  AdminPinResetsScreen,
  AdminUsersScreen,
  AdminVerifyScreen,
  BookingScreen,
  BookingTrackingScreen,
  BookingsScreen,
  CategoriesScreen,
  ChangePasswordScreen,
  ChatListScreen,
  ChatScreen,
  HomeScreen,
  NotificationsScreen,
  ProviderDashboardScreen,
  ProviderProfileScreen,
  ProviderServiceDetailScreen,
  ServiceDetailScreen,
  WalletScreen
} from '../screens/MainScreens';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function tabOptions({ route }) {
  const icons = {
    Explore: ['home', 'home-outline'],
    'Map View': ['map', 'map-outline'],
    Requests: ['calendar', 'calendar-outline'],
    Bookings: ['calendar', 'calendar-outline'],
    Chat: ['chatbubbles', 'chatbubbles-outline'],
    Messages: ['chatbubbles', 'chatbubbles-outline'],
    Wallet: ['wallet', 'wallet-outline'],
    Account: ['person', 'person-outline'],
    Settings: ['settings', 'settings-outline'],
    Dashboard: ['grid', 'grid-outline'],
    Users: ['people', 'people-outline'],
    Verify: ['shield-checkmark', 'shield-checkmark-outline'],
    Providers: ['briefcase', 'briefcase-outline'],
    Analytics: ['bar-chart', 'bar-chart-outline'],
    Escrow: ['wallet', 'wallet-outline'],
    Disputes: ['warning', 'warning-outline'],
    'Pin Resets': ['key', 'key-outline'],
    Admin: ['shield-checkmark', 'shield-checkmark-outline']
  };
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: '#9CA3AF',
    tabBarLabelStyle: { fontSize: 11, fontWeight: '800', marginTop: 1 },
    tabBarStyle: {
      height: Platform.OS === 'ios' ? 88 : 76,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 22 : 12,
      backgroundColor: colors.white,
      borderTopColor: colors.border,
      shadowColor: colors.navy,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: -4 },
      elevation: 8
    },
    tabBarIcon: ({ focused, color, size }) => {
      const pair = icons[route.name] || ['ellipse', 'ellipse-outline'];
      return <Ionicons name={focused ? pair[0] : pair[1]} size={size} color={color} />;
    }
  };
}

function adminTabOptions(args) {
  const options = tabOptions(args);
  return {
    ...options,
    tabBarStyle: {
      ...options.tabBarStyle,
      backgroundColor: colors.white,
      borderTopColor: colors.border,
      display: Platform.OS === 'web' ? 'none' : 'flex'
    }
  };
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
    </Stack.Navigator>
  );
}

function ClientTabs() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen name="Explore" component={HomeScreen} options={{ title: t('Explore') }} />
      <Tab.Screen name="Map View" component={BookingsScreen} options={{ title: t('Map View') }} />
      <Tab.Screen name="Messages" component={ChatListScreen} options={{ title: t('Messages') }} />
      <Tab.Screen name="ChatThread" component={ChatScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: t('Wallet') }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: t('Account') }} />
    </Tab.Navigator>
  );
}

function ProviderTabs() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen name="Dashboard" component={ProviderDashboardScreen} options={{ title: t('Dashboard') }} />
      <Tab.Screen name="Requests" component={BookingsScreen} options={{ title: t('Requests') }} />
      <Tab.Screen name="Chat" component={ChatListScreen} options={{ title: t('Chat') }} />
      <Tab.Screen name="ChatThread" component={ChatScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: t('Wallet') }} />
      <Tab.Screen name="Settings" component={AccountScreen} options={{ title: t('Settings') }} />
    </Tab.Navigator>
  );
}

function AdminTabs() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator screenOptions={adminTabOptions}>
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} options={{ title: t('Dashboard') }} />
      <Tab.Screen name="Users" component={AdminUsersScreen} options={{ title: t('Users') }} />
      <Tab.Screen name="Escrow" component={AdminEscrowScreen} options={{ title: t('Escrow') }} />
      <Tab.Screen name="Disputes" component={AdminDisputesScreen} options={{ title: t('Disputes') }} />
      <Tab.Screen name="Pin Resets" component={AdminPinResetsScreen} options={{ title: t('Pin Resets') }} />
      <Tab.Screen name="Verify" component={AdminVerifyScreen} options={{ title: t('Verify') }} />
      <Tab.Screen name="Providers" component={AdminDashboardScreen} options={{ title: t('Providers') }} />
      <Tab.Screen name="Analytics" component={AdminDashboardScreen} options={{ title: t('Analytics') }} />
      <Tab.Screen name="Settings" component={AccountScreen} options={{ title: t('Settings') }} />
    </Tab.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AdminTabs} />
      <Stack.Screen name="DSSAIPanel" component={DSSDashboardScreen} />
      <Stack.Screen name="ProviderScores" component={ProviderScoresScreen} />
      <Stack.Screen name="ProviderScoreDetail" component={ProviderScoreDetailScreen} />
      <Stack.Screen name="FraudAlerts" component={FraudAlertsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
      <Stack.Screen name="BatchVerification" component={BatchVerificationScreen} />
      <Stack.Screen name="BadgeVerification" component={BadgeVerificationScreen} />
      <Stack.Screen name="SystemHealth" component={SystemHealthScreen} />
      <Stack.Screen name="AdminNotifications" component={AdminNotificationsScreen} />
    </Stack.Navigator>
  );
}

function MainStack({ role }) {
  const Tabs = role === 'provider' ? ProviderTabs : role === 'admin' ? AdminStack : ClientTabs;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <Stack.Screen name="BookService" component={BookingScreen} />
      <Stack.Screen name="TrackBooking" component={BookingTrackingScreen} />
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="ChatThread" component={ChatScreen} />
      <Stack.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <Stack.Screen name="ProviderServiceDetail" component={ProviderServiceDetailScreen} />
      <Stack.Screen name="AddService" component={AddServiceScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, booting } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (booting || showSplash) return <SplashScreen />;
  if (!user) return <AuthStack />;
  return <MainStack role={user.role} />;
}
