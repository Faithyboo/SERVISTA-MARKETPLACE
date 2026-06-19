import { Ionicons } from '@expo/vector-icons';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import AdminDSSPanel from './AdminDSSPanel';
import { dssStyles } from './dssStyles';
import { Text } from './dssText';

export default function DSSDashboardScreen({ navigation }) {
  return (
    <SafeAreaView style={dssStyles.screen}>
      <ScrollView contentContainerStyle={dssStyles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dssStyles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={dssStyles.backText}>BACK</Text>
        </TouchableOpacity>

        <View style={dssStyles.header}>
          <Ionicons name="hardware-chip-outline" size={32} color={colors.orange} />
          <Text style={dssStyles.headerTitle}>AI Decision Support System</Text>
        </View>

        <AdminDSSPanel navigation={navigation} embedded={false} />
      </ScrollView>
    </SafeAreaView>
  );
}
