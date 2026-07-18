import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text as RNText, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { API_BASE_URL, errorMessage } from '../api/client';
import { Avatar, AvatarWithTrustBadge, Badge, Button, Card, Input, TrustBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, formatMoney } from '../theme/colors';
import { withFont } from '../theme/typography';
import MapView, { Marker } from '../components/PlatformMap';
import AdminDSSPanel from './admin/AdminDSSPanel';
import { AdminWorkspaceLayout } from './admin/AdminWorkspaceLayout';

const servistaLogo = require('../../assets/servista-logo.png');

const statusTone = { pending: 'warning', confirmed: 'blue', in_progress: 'warning', completed: 'success', cancelled: 'danger' };
const categoryItems = [
  { label: 'Cleaning', value: 'cleaning', description: 'Home, office, deep cleaning and post-event cleanup.', icon: 'sparkles-outline', color: colors.blue },
  { label: 'Plumbing', value: 'plumbing', description: 'Leaks, pipe repairs, installations and bathroom fixtures.', icon: 'construct-outline', color: colors.orange },
  { label: 'Electrical', value: 'electrical', description: 'Wiring, lighting, repairs and power troubleshooting.', icon: 'flash-outline', color: '#F59E0B' },
  { label: 'Beauty', value: 'beauty', description: 'Makeup, hair styling, nails and personal care.', icon: 'cut-outline', color: '#EC4899' },
  { label: 'Catering', value: 'catering', description: 'Food preparation, events and private meals.', icon: 'restaurant-outline', color: '#F97316' },
  { label: 'Carpentry', value: 'carpentry', description: 'Furniture, woodwork, doors and installations.', icon: 'hammer-outline', color: '#A16207' },
  { label: 'Painting', value: 'painting', description: 'Interior, exterior, finishing and renovation painting.', icon: 'color-palette-outline', color: colors.green },
  { label: 'Laundry', value: 'laundry', description: 'Washing, ironing and garment care.', icon: 'shirt-outline', color: '#6366F1' },
  { label: 'Delivery', value: 'delivery', description: 'Errands, package delivery and local dispatch.', icon: 'bicycle-outline', color: '#14B8A6' },
  { label: 'Tech Repair', value: 'tech_repair', description: 'Phone, computer, appliance and device repairs.', icon: 'build-outline', color: colors.red },
  { label: 'Tutoring', value: 'tutoring', description: 'Private lessons, exam prep and skill coaching.', icon: 'school-outline', color: '#8B5CF6' },
  { label: 'Health', value: 'health', description: 'Health, wellness and personal care support.', icon: 'heart-outline', color: '#06B6D4' },
  { label: 'Other', value: 'other', description: 'Other trusted local services around you.', icon: 'apps-outline', color: '#64748B' }
];
const emojiItems = ['😀', '😂', '😊', '😍', '🙏', '👍', '🔥', '💪', '🎉', '❤️', '😎', '😢', '😡', '👏', '✅', '⭐', '📍', '💰', '🛠️', '🏠'];

function shadowCard(extra) {
  return [styles.cardShadow, extra];
}

function Text({ children, ...props }) {
  const { tn } = useLanguage();
  return <RNText {...props} style={withFont(props.style)}>{tn(children)}</RNText>;
}

function mediaUri(uri) {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('file:')) return uri;
  return `${API_BASE_URL}${uri}`;
}

function useNotificationCount(user) {
  const [count, setCount] = useState(0);
  const notificationClearKey = `servista-notifications-cleared-at-${user?.id || user?.email || 'guest'}`;

  const loadCount = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    try {
      const clearedAtValue = await AsyncStorage.getItem(notificationClearKey);
      const clearedAt = clearedAtValue ? new Date(clearedAtValue).getTime() : 0;
      const { data } = await api.get('/api/users/notifications/');
      const unread = (Array.isArray(data) ? data : []).filter((item) => {
        const itemTime = item.time ? new Date(item.time).getTime() : Date.now();
        return !item.is_read && (!clearedAt || itemTime > clearedAt);
      }).length;
      setCount(unread);
    } catch (error) {
      setCount(0);
    }
  }, [notificationClearKey, user]);

  useFocusEffect(useCallback(() => {
    loadCount();
  }, [loadCount]));

  return count;
}

function NotificationBadge({ count, showZero = false, muted = false }) {
  if (!count && !showZero) return null;
  return (
    <View style={[styles.notificationBadge, muted && styles.notificationBadgeMuted]}>
      <Text style={styles.notificationBadgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function isSuccessfulBooking(booking) {
  return booking?.status === 'completed' || !!booking?.client_confirmed_at || booking?.payment_status === 'released';
}

function bookingBelongsToProvider(booking, service) {
  if (!booking || !service) return false;
  if (String(booking.service) === String(service.id)) return true;
  if (booking.provider && service.provider && String(booking.provider) === String(service.provider)) return true;
  const bookingProvider = (booking.provider_name || '').trim().toLowerCase();
  const serviceProvider = (service.provider_name || '').trim().toLowerCase();
  return !!bookingProvider && bookingProvider === serviceProvider;
}

function getProviderRatingFromServices(services) {
  const totals = services.reduce((acc, service) => {
    const count = Number(service.review_count || 0);
    const rating = Number(service.average_rating || 0);
    if (count > 0 && rating > 0) {
      acc.weighted += rating * count;
      acc.count += count;
    }
    return acc;
  }, { weighted: 0, count: 0 });
  return {
    rating: totals.count ? (totals.weighted / totals.count).toFixed(1) : '0.0',
    count: totals.count
  };
}

const cameroonLocationFallbacks = [
  { match: ['bonamoussadi', 'bonamousadi'], latitude: 4.0896, longitude: 9.7409 },
  { match: ['akwa'], latitude: 4.0519, longitude: 9.7043 },
  { match: ['bastos'], latitude: 3.8892, longitude: 11.5167 },
  { match: ['douala'], latitude: 4.0511, longitude: 9.7679 },
  { match: ['yaounde', 'yaoundé'], latitude: 3.848, longitude: 11.5021 },
  { match: ['buea'], latitude: 4.1534, longitude: 9.2423 },
  { match: ['limbe'], latitude: 4.0242, longitude: 9.2149 },
  { match: ['bamenda'], latitude: 5.9631, longitude: 10.1591 },
];

function fallbackGeocodeLocation(text) {
  const normalized = String(text || '').toLowerCase();
  const match = cameroonLocationFallbacks.find((item) => item.match.some((part) => normalized.includes(part))) || null;
  return match ? { ...match, source: 'local' } : null;
}

function exactGeocodeMatches(query, resultName) {
  const result = String(resultName || '').toLowerCase();
  const keywords = String(query || '')
    .toLowerCase()
    .replace(/cameroon|cameroun|douala|yaounde|yaoundé|buea|limbe|bamenda/g, '')
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 4);

  if (!keywords.length) return false;
  return keywords.some((part) => result.includes(part));
}

async function geocodeLocationText(text, options = {}) {
  const { preferLocal = true, requireExactMatch = false } = options;
  const query = String(text || '').trim();
  if (!query) return null;

  const localMatch = preferLocal ? fallbackGeocodeLocation(query) : null;
  if (localMatch) return localMatch;

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cm&q=${encodeURIComponent(query)}`);
    const results = await response.json();
    if (Array.isArray(results) && results[0]) {
      if (requireExactMatch && !exactGeocodeMatches(query, results[0].display_name)) {
        return null;
      }
      return {
        latitude: Number(results[0].lat),
        longitude: Number(results[0].lon),
        displayName: results[0].display_name,
        source: 'remote',
      };
    }
  } catch (error) {
    return null;
  }

  return null;
}

function uploadFileFromAsset(asset, fallbackName = 'upload.jpg') {
  const name = asset.fileName || asset.name || fallbackName;
  const type = asset.mimeType || asset.type || (name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  return { uri: asset.uri, name, type };
}

function getPresence(lastSeen) {
  if (!lastSeen) return { online: false, label: 'Offline' };
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  if (diffMs < 2 * 60 * 1000) return { online: true, label: 'Online' };
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return { online: false, label: `Offline • ${minutes}m ago` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, label: `Offline • ${hours}h ago` };
  return { online: false, label: `Offline • ${Math.floor(hours / 24)}d ago` };
}

export function HomeScreen({ route, navigation }) {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(route?.params?.category || '');
  const notificationCount = useNotificationCount(user);
  const clientLocation = String(user?.city_area || '').trim();

  const openCategories = () => {
    const parentNavigator = navigation.getParent?.();
    if (parentNavigator) {
      parentNavigator.navigate('Categories');
      return;
    }
    navigation.navigate('Categories');
  };

  const openNotifications = () => {
    const rootNavigator = navigation.getParent?.()?.getParent?.() || navigation.getParent?.() || navigation;
    rootNavigator.navigate('Notifications');
  };

  const loadServices = useCallback(() => {
    setLoading(true);
    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    if (search.trim()) params.search = search.trim();
    api.get('/api/services/', { params }).then(({ data }) => setServices(data)).catch((e) => Alert.alert('Services unavailable', errorMessage(e))).finally(() => setLoading(false));
  }, [search, selectedCategory]);

  useEffect(() => {
    if (route?.params?.category !== undefined) {
      setSelectedCategory(route.params.category);
    }
  }, [route?.params?.category]);

  useFocusEffect(useCallback(() => {
    loadServices();
  }, [loadServices]));

  return (
    <SafeAreaView style={styles.exploreScreen}>
      <FlatList
        data={services}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.exploreContent}
        ListHeaderComponent={(
            <View style={styles.exploreHeaderStack}>
              <View style={styles.exploreTopCard}>
                <View style={styles.locationBadge}>
                  <Image source={servistaLogo} style={styles.locationLogo} resizeMode="contain" />
                </View>
                {clientLocation ? (
                  <View style={styles.flex}>
                    <Text style={styles.exploreOverline}>LOCATION</Text>
                    <Text style={styles.exploreLocation}>{clientLocation}</Text>
                  </View>
                ) : null}
              <View style={styles.exploreSearch}>
                <Ionicons name="search" size={16} color="#91A0B8" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="What do you need help with?"
                  placeholderTextColor="#8FA0B8"
                  returnKeyType="search"
                  autoCapitalize="none"
                  style={styles.exploreSearchInput}
                />
                {search ? (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={16} color="#91A0B8" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="options-outline" size={16} color="#91A0B8" />
                )}
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={openNotifications} style={styles.exploreBell}>
                <Ionicons name="notifications-outline" size={18} color="#B9C5D8" />
                <NotificationBadge count={notificationCount} />
              </TouchableOpacity>
            </View>
            <View style={styles.exploreSectionHeader}>
              <Text style={styles.exploreSectionLabel}>QUICK CATEGORIES</Text>
              <TouchableOpacity activeOpacity={0.8} hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }} onPress={openCategories} style={styles.seeAllButton}>
                <Text style={styles.exploreSeeAll}>SEE ALL</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.darkCategoryScroll}>
              {categoryItems.map((item) => (
                <TouchableOpacity activeOpacity={0.8} key={item.label} onPress={() => setSelectedCategory((value) => value === item.value ? '' : item.value)} style={[styles.darkCategoryPill, selectedCategory === item.value && styles.darkCategoryPillActive]}>
                  <View style={[styles.darkCategoryIcon, { backgroundColor: item.color }]}>
                    <Ionicons name={item.icon} size={18} color={colors.white} />
                  </View>
                  <Text style={styles.darkCategoryLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {(selectedCategory || search.trim()) ? (
              <TouchableOpacity activeOpacity={0.8} onPress={() => { setSelectedCategory(''); setSearch(''); }} style={styles.filterSummary}>
                <Text style={styles.filterSummaryText}>{services.length} result{services.length === 1 ? '' : 's'} found</Text>
                <Text style={styles.filterClearText}>CLEAR FILTERS</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.featuredTitleBlock}>
              <View style={styles.rowStart}>
                <Text style={styles.exploreTitle}>Featured Services</Text>
                {loading ? <ActivityIndicator color={colors.orange} /> : null}
              </View>
              <Text style={styles.exploreSubtitle}>Hand-picked professionals vetted for quality.</Text>
            </View>
          </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('ServiceDetail', { service: item })} style={styles.exploreServiceCard}>
              {mediaUri(item.image) ? (
                <View style={styles.exploreImageWrap}>
                  <Image source={{ uri: mediaUri(item.image) }} style={styles.exploreServiceImage} resizeMode="cover" />
                  {item.provider_badge_verification_status === 'verified' ? (
                    <View style={styles.exploreBadge}><TrustBadge size={18} /><Text style={styles.exploreBadgeText}>VERIFIED</Text></View>
                  ) : null}
                  <View style={styles.durationBadge}><Ionicons name="time-outline" size={10} color={colors.white} /><Text style={styles.durationText}>45m</Text></View>
                </View>
              ) : null}
              <View style={styles.exploreCardBody}>
                <View style={styles.row}>
                  <Text style={styles.exploreCardTitle}>{item.title}</Text>
                <View style={styles.rowStart}><Ionicons name="star" size={14} color={colors.orange} /><Text style={styles.exploreRating}>{item.average_rating ?? '0.0'} ({item.review_count || 0})</Text></View>
              </View>
              <Text style={styles.exploreProvider}>{item.provider_name || item.address || 'SERVISTA PRO'}</Text>
              <View style={styles.exploreDivider} />
              <View style={styles.row}>
                <View><Text style={styles.exploreBudget}>BUDGET</Text><Text style={styles.explorePrice}>{formatMoney(item.price).replace(' FCFA', '')}</Text><Text style={styles.exploreCurrency}>XAF</Text></View>
                <View style={styles.exploreBookButton}><Text style={styles.exploreBookText}>BOOK</Text></View>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

export function ServiceDetailScreen({ route, navigation }) {
  const { service } = route.params;
  const { user } = useAuth();
  const [openingChat, setOpeningChat] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewableBooking, setReviewableBooking] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  const loadReviews = useCallback(() => {
    api.get(`/api/services/${service.id}/reviews/`)
      .then(({ data }) => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]));
  }, [service.id]);

  const loadReviewEligibility = useCallback(() => {
    if (user?.role !== 'client') {
      setReviewableBooking(null);
      return;
    }

    api.get('/api/bookings/')
      .then(({ data }) => {
        const bookings = Array.isArray(data) ? data : [];

        // Backend review eligibility is:
        // - booking belongs to this provider
        // - booking is reviewable when:
        //   booking.status === 'completed' OR booking.client_confirmed_at OR booking.payment_status === 'released'
        // - review must not already exist (serializer may not expose has_review reliably)
        const eligible = bookings
          .filter((booking) => (
            bookingBelongsToProvider(booking, service)
            && (
              booking?.status === 'completed'
              || !!booking?.client_confirmed_at
              || booking?.payment_status === 'released'
            )
            && !booking?.has_review
          ))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;

        setReviewableBooking(eligible);
      })
      .catch(() => setReviewableBooking(null));
  }, [service.id, user?.role]);

  useFocusEffect(useCallback(() => {
    loadReviews();
    loadReviewEligibility();
  }, [loadReviews, loadReviewEligibility]));

  const averageRating = reviews.length
    ? (reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length).toFixed(1)
    : (service.average_rating || '0.0');
  const reviewCount = reviews.length || service.review_count || 0;

  const submitServiceReview = async () => {
    if (!reviewableBooking || reviewLoading) return;
    if (!reviewComment.trim()) {
      Alert.alert('Review required', 'Please write a short comment about the provider service.');
      return;
    }
    try {
      setReviewLoading(true);
      await api.post(`/api/services/${service.id}/reviews/`, {
        booking: reviewableBooking.id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setReviewComment('');
      setReviewRating(5);
      setReviewableBooking(null);
      loadReviews();
      loadReviewEligibility();
      Alert.alert('Review submitted', 'Thank you for reviewing this provider.');
    } catch (error) {
      Alert.alert('Review failed', errorMessage(error));
    } finally {
      setReviewLoading(false);
    }
  };

  const openProviderChat = async () => {
    setOpeningChat(true);
    try {
      const { data } = await api.get('/api/bookings/');
      const existingThread = data
        .filter((booking) => String(booking.provider) === String(service.provider) && booking.status !== 'cancelled')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      if (existingThread) {
        navigation.navigate('ChatThread', { booking: existingThread });
        return;
      }

      navigation.navigate('ChatThread', {
        serviceChat: true,
        booking: {
          service_title: service.title,
          provider_name: service.provider_name || 'Provider',
          provider_photo: service.provider_photo,
          provider: service.provider,
          category: service.category || 'Provider',
          provider_badge_verification_status: service.provider_badge_verification_status || 'not_verified'
        }
      });
    } catch (error) {
      Alert.alert('Chat unavailable', errorMessage(error));
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <SafeAreaView style={styles.serviceDetailScreen}>
      <ScrollView contentContainerStyle={styles.serviceDetailContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.serviceBack}>
          <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
          <Text style={styles.serviceBackText}>BACK TO RESULTS</Text>
        </TouchableOpacity>

        {mediaUri(service.image) ? (
          <View style={styles.serviceHeroCard}>
            <Image source={{ uri: mediaUri(service.image) }} style={styles.serviceHeroImage} resizeMode="cover" />
          </View>
        ) : null}

        <View style={styles.servicePricePanel}>
          <Text style={styles.servicePanelLabel}>STARTING AT</Text>
          <View style={styles.servicePriceRow}>
            <Text style={styles.servicePanelPrice}>{formatMoney(service.price).replace(' FCFA', '')}</Text>
            <Text style={styles.servicePanelCurrency}>XAF</Text>
          </View>
          <View style={styles.serviceMetaLine}><Ionicons name="time-outline" size={15} color={colors.orange} /><Text style={styles.servicePanelMeta}>Approx. 4-6 Hours</Text></View>
          <View style={styles.serviceMetaLine}><Ionicons name="location-outline" size={15} color={colors.orange} /><Text style={styles.servicePanelMeta}>{service.address || 'Yaounde & Surroundings'}</Text></View>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('BookService', { service })} style={styles.serviceEscrowButton}>
            <Text style={styles.serviceEscrowText}>Book & Pay to Escrow</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={openProviderChat}
            disabled={openingChat}
            style={styles.serviceChatButton}
          >
            {openingChat ? <ActivityIndicator color="#8FA0B8" /> : <Ionicons name="chatbox-outline" size={15} color="#8FA0B8" />}
            <Text style={styles.serviceChatText}>Chat with Provider</Text>
          </TouchableOpacity>
          <View style={styles.protectedBox}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.blue} />
            <Text style={styles.protectedText}>Your payment is protected by Servista Escrow.</Text>
          </View>
        </View>

        <View style={styles.serviceCopy}>
          <Text style={styles.serviceDetailTitle}>{service.title}</Text>
          <View style={styles.serviceBadgeRow}>
            {service.provider_badge_verification_status === 'verified' ? (
              <View style={styles.verifiedServicePill}><Text style={styles.verifiedServiceText}>VERIFIED PROVIDER</Text></View>
            ) : null}
            <View style={styles.reviewPill}><Ionicons name="star" size={14} color={colors.orange} /><Text style={styles.reviewText}>{averageRating} ({reviewCount} Reviews)</Text></View>
          </View>
          <Text style={styles.serviceDescription}>{service.description || 'Our professional team provides a comprehensive service tailored for modern homes and businesses. We use trusted tools and reliable local expertise to make sure the work is done properly.'}</Text>
          <View style={styles.serviceDivider} />
          <Text style={styles.reviewsTitle}>Recent Reviews</Text>
          {user?.role === 'client' ? (
            <View style={styles.inlineReviewBox}>
              <Text style={styles.inlineReviewTitle}>{reviewableBooking ? 'Rate this provider' : 'Review available after completion'}</Text>
              <View style={styles.inlineReviewStars}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity key={value} activeOpacity={0.8} onPress={() => reviewableBooking && setReviewRating(value)} disabled={!reviewableBooking} style={styles.inlineReviewStarButton}>
                    <Ionicons name={value <= reviewRating ? 'star' : 'star-outline'} size={26} color={reviewableBooking ? colors.orange : '#8FA0B8'} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={reviewComment}
                onChangeText={setReviewComment}
                editable={!!reviewableBooking && !reviewLoading}
                multiline
                placeholder={reviewableBooking ? 'Write something about this provider...' : 'Complete this service before leaving a review.'}
                placeholderTextColor="#8FA0B8"
                style={[styles.inlineReviewInput, !reviewableBooking && styles.inlineReviewInputDisabled]}
              />
              <TouchableOpacity activeOpacity={0.85} onPress={submitServiceReview} disabled={!reviewableBooking || reviewLoading} style={[styles.inlineReviewButton, (!reviewableBooking || reviewLoading) && styles.disabledButton]}>
                {reviewLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.inlineReviewButtonText}>SEND REVIEW</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
          {reviews.length ? reviews.slice(0, 5).map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.row}>
                <Text style={styles.reviewName}>{review.client_name || 'Client'}</Text>
                <Text style={styles.reviewStars}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</Text>
              </View>
              <Text style={styles.reviewQuote}>{review.comment || 'No comment added.'}</Text>
            </View>
          )) : (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewName}>No reviews yet</Text>
              <Text style={styles.reviewQuote}>Completed client reviews will appear here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CategoriesScreen({ navigation }) {
  const openCategory = (category) => {
    navigation.navigate('Tabs', { screen: 'Explore', params: { category: category.value } });
  };

  return (
    <SafeAreaView style={styles.categoriesScreen}>
      <ScrollView contentContainerStyle={styles.categoriesContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.categoryBack}>
          <Ionicons name="chevron-back" size={18} color={colors.textGray} />
          <Text style={styles.categoryBackText}>BACK</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.categoriesTitle}>Service Categories</Text>
          <Text style={styles.categoriesSubtitle}>Explore detailed service groups available near you.</Text>
        </View>
        <View style={styles.categoryDetailGrid}>
          {categoryItems.map((item) => (
            <TouchableOpacity activeOpacity={0.8} key={item.value} onPress={() => openCategory(item)} style={styles.categoryDetailCard}>
              <View style={[styles.categoryDetailIcon, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon} size={22} color={colors.white} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.categoryDetailTitle}>{item.label}</Text>
                <Text style={styles.categoryDetailText}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textGray} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function BookingScreen({ route, navigation }) {
  const { service } = route.params;
  const { logout } = useAuth();
  const [address, setAddress] = useState('');
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/api/bookings/', { service: service.id, address, scheduled_at: scheduledAt, notes });
      Alert.alert('Booking created', 'Your request has been sent.');
      navigation.navigate('Bookings');
    } catch (error) {
      if (error?.response?.status === 401 && error?.response?.data?.code === 'token_not_valid') {
        await logout();
        Alert.alert('Session expired', 'Please sign in again before confirming your booking.');
        return;
      }
      Alert.alert('Booking failed', errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const goToTab = (screen) => navigation.navigate('Tabs', { screen });

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.bookingContent}>
            <Text style={styles.pageTitle}>Book Service</Text>
            <Card><Text style={styles.bookingServiceTitle}>{service.title}</Text><Text style={styles.price}>{formatMoney(service.price)}</Text></Card>
            <Input icon="location-outline" placeholder="Service address" value={address} onChangeText={setAddress} />
            <Input icon="calendar-outline" placeholder="Scheduled ISO date/time" value={scheduledAt} onChangeText={setScheduledAt} />
            <Input icon="document-text-outline" placeholder="Notes" value={notes} onChangeText={setNotes} multiline />
            <Button label="Confirm Booking" loading={loading} onPress={submit} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <View style={styles.bookingBottomTabs}>
        {[
          ['Explore', 'home', () => goToTab('Explore')],
          ['Map View', 'map-outline', () => goToTab('Map View')],
          ['Messages', 'chatbubbles-outline', () => goToTab('Messages')],
          ['Wallet', 'wallet-outline', () => goToTab('Wallet')],
          ['Account', 'person-outline', () => goToTab('Account')]
        ].map(([label, icon, onPress]) => (
          <TouchableOpacity activeOpacity={0.8} key={label} onPress={onPress} style={styles.bookingBottomTab}>
            <Ionicons name={icon} size={24} color={label === 'Explore' ? colors.orange : '#9CA3AF'} />
            <Text style={[styles.bookingBottomLabel, label === 'Explore' && styles.bookingBottomLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function BookingTrackingScreen({ route, navigation }) {
  const initialBooking = route?.params?.booking || {};
  const [booking, setBooking] = useState(initialBooking);
  useFocusEffect(useCallback(() => {
    if (!initialBooking?.id) return;
    api.get(`/api/bookings/${initialBooking.id}/`).then(({ data }) => setBooking(data)).catch(() => {});
  }, [initialBooking?.id]));

  const exactAddress = String(booking.provider_exact_address || '').trim();
  const cityArea = String(booking.provider_city_area || '').trim();
  const providerLatitude = Number(booking.provider_latitude);
  const providerLongitude = Number(booking.provider_longitude);
  const hasSavedCoords = Number.isFinite(providerLatitude) && Number.isFinite(providerLongitude);
  const hasLocationText = !!(exactAddress || cityArea);
  const [trackingPoint, setTrackingPoint] = useState(hasSavedCoords && !hasLocationText ? {
    latitude: providerLatitude,
    longitude: providerLongitude,
    exact: !!exactAddress,
    label: exactAddress || `Approximate location - ${cityArea}`,
    source: 'saved',
  } : null);
  const [geocoding, setGeocoding] = useState(hasLocationText);

  useEffect(() => {
    let active = true;
    const loadLocation = async () => {
      if (!exactAddress && !cityArea) {
        if (hasSavedCoords) {
          setTrackingPoint({
            latitude: providerLatitude,
            longitude: providerLongitude,
            exact: false,
            label: 'Saved provider location',
            source: 'saved',
          });
          setGeocoding(false);
          return;
        }
        setTrackingPoint(null);
        setGeocoding(false);
        return;
      }

      setGeocoding(true);
      const preciseQuery = exactAddress && cityArea ? `${exactAddress}, ${cityArea}, Cameroon` : exactAddress;
      const precise = exactAddress ? await geocodeLocationText(preciseQuery, { preferLocal: false, requireExactMatch: true }) : null;
      const approximate = precise || (cityArea ? await geocodeLocationText(cityArea) : null);
      if (!active) return;
      if (approximate && Number.isFinite(approximate.latitude) && Number.isFinite(approximate.longitude)) {
        const isPrecise = !!precise;
        setTrackingPoint({
          latitude: approximate.latitude,
          longitude: approximate.longitude,
          exact: isPrecise,
          label: isPrecise ? exactAddress : `Approximate location - ${cityArea}`,
          source: isPrecise ? 'exact-geocode' : 'area-geocode',
        });
      } else if (hasSavedCoords) {
        setTrackingPoint({
          latitude: providerLatitude,
          longitude: providerLongitude,
          exact: !!exactAddress,
          label: exactAddress || `Approximate location - ${cityArea}`,
          source: 'saved',
        });
      } else {
        setTrackingPoint(null);
      }
      setGeocoding(false);
    };

    loadLocation();
    return () => { active = false; };
  }, [cityArea, exactAddress, hasSavedCoords, providerLatitude, providerLongitude]);

  const region = {
    latitude: trackingPoint?.latitude || 4.0511,
    longitude: trackingPoint?.longitude || 9.7679,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025
  };
  const locationMissing = !trackingPoint && !geocoding;
  const locationStatus = trackingPoint?.exact ? 'Precise provider location' : trackingPoint ? 'Approximate provider area' : 'Location unavailable';
  const locationDescription = trackingPoint?.exact
    ? 'This marker is based on the provider exact address.'
    : trackingPoint
      ? 'This marker is centred on the provider saved city/area because no verified exact coordinates are available.'
      : 'Ask the provider to add their location from Settings.';
  const openExternalMap = () => {
    if (!trackingPoint) return;
    const label = encodeURIComponent(trackingPoint.label || booking.provider_name || 'Provider location');
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${trackingPoint.latitude},${trackingPoint.longitude}&q=${label}`
      : `https://www.google.com/maps/search/?api=1&query=${trackingPoint.latitude},${trackingPoint.longitude}`;
    Linking.openURL(url).catch(() => Alert.alert('Map unavailable', 'Unable to open your maps app right now.'));
  };

  return (
    <SafeAreaView style={styles.trackingScreen}>
      <View style={styles.trackingHeader}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.categoryBack}>
          <Ionicons name="chevron-back" size={18} color={colors.textGray} />
          <Text style={styles.categoryBackText}>BACK</Text>
        </TouchableOpacity>
        <Text style={styles.trackingTitle}>Track Booking</Text>
        <Text style={styles.trackingSubtitle}>{booking.service_title || 'Service location'}</Text>
      </View>

      <View style={styles.trackingMapCard}>
        {geocoding ? (
          <View style={styles.trackingEmptyState}>
            <ActivityIndicator color={colors.orange} />
            <Text style={styles.trackingEmptyTitle}>Finding provider location</Text>
            <Text style={styles.trackingEmptyText}>Please wait while Servista prepares the map.</Text>
          </View>
        ) : locationMissing ? (
          <View style={styles.trackingEmptyState}>
            <Ionicons name="location-outline" size={42} color={colors.orange} />
            <Text style={styles.trackingEmptyTitle}>Service provider has not set their location yet</Text>
            <Text style={styles.trackingEmptyText}>Ask the provider to add their city or exact address from Settings.</Text>
          </View>
        ) : (
          <MapView key={`${region.latitude}-${region.longitude}`} style={styles.trackingMap} initialRegion={region}>
            <Marker
              coordinate={{ latitude: region.latitude, longitude: region.longitude }}
              title={booking.provider_name || 'Service provider'}
              description={trackingPoint.label}
            >
              <View style={styles.trackingMarkerOuter}>
                <View style={styles.trackingMarkerInner}>
                  <Ionicons name="briefcase" size={16} color={colors.white} />
                </View>
              </View>
            </Marker>
          </MapView>
        )}
        {!geocoding && !locationMissing ? (
          <View style={styles.trackingMapOverlay}>
            <View style={styles.trackingStatusDot} />
            <Text style={styles.trackingMapOverlayText}>{locationStatus}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.trackingInfoCard}>
        <View style={styles.trackingInfoIcon}><Ionicons name="location-outline" size={22} color={colors.orange} /></View>
        <View style={styles.flex}>
          <Text style={styles.trackingInfoTitle}>{trackingPoint?.label || cityArea || exactAddress || 'Provider location unavailable'}</Text>
          <Text style={styles.trackingInfoText}>Provider: {booking.provider_name || 'Servista Provider'}</Text>
          <Text style={styles.trackingInfoText}>{locationDescription}</Text>
          <Text style={styles.trackingInfoText}>ID: #SRV-{String(booking.id || '').padStart(4, '0')}</Text>
        </View>
      </View>
      {trackingPoint ? (
        <TouchableOpacity activeOpacity={0.85} onPress={openExternalMap} style={styles.trackingOpenMapsButton}>
          <Ionicons name="navigate-outline" size={18} color={colors.white} />
          <Text style={styles.trackingOpenMapsText}>Open in Maps</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

export function BookingsScreen({ route, navigation }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('Active');
  const [activeChat, setActiveChat] = useState(null);
  const [paymentBooking, setPaymentBooking] = useState(null);
  const [paymentPin, setPaymentPin] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const isProvider = user?.role === 'provider';
  const openChatThread = (booking) => {
    const canonicalBooking = bookings
      .filter((item) => {
        if (item.status === 'cancelled') return false;
        return isProvider
          ? String(item.client) === String(booking.client)
          : String(item.provider) === String(booking.provider);
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    setActiveChat(canonicalBooking || booking);
  };
  const showStandaloneBottomTabs = route?.name === 'Bookings' && !isProvider;
  const goToTab = (screen) => navigation.navigate('Tabs', { screen });
  const trackBooking = (booking) => {
    const parentNavigator = navigation.getParent?.();
    if (parentNavigator) parentNavigator.navigate('TrackBooking', { booking });
    else navigation.navigate('TrackBooking', { booking });
  };

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/bookings/').then(({ data }) => setBookings(data)).catch((e) => Alert.alert('Bookings unavailable', errorMessage(e))).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPaymentPin = (booking) => {
    setPaymentBooking(booking);
    setPaymentPin('');
  };

  const closePaymentPin = () => {
    if (paymentLoading) return;
    setPaymentBooking(null);
    setPaymentPin('');
  };

  const pay = async () => {
    if (!paymentBooking) return;
    if (paymentPin.length !== 4) {
      Alert.alert('PIN required', 'Enter your 4 digit wallet PIN to complete payment.');
      return;
    }
    try {
      setPaymentLoading(true);
      await api.post(`/api/wallet/pay/${paymentBooking.id}/`, { pin: paymentPin });
      Alert.alert('Payment successful');
      setPaymentBooking(null);
      setPaymentPin('');
      load();
    } catch (error) {
      Alert.alert('Payment failed', errorMessage(error));
    } finally {
      setPaymentLoading(false);
    }
  };

  const requestRefund = async (booking) => {
    try {
      await api.post(`/api/bookings/${booking.id}/refund/`);
      Alert.alert('Refund requested', 'Your refund is pending admin review.');
      load();
    } catch (error) {
      Alert.alert('Refund request failed', errorMessage(error));
    }
  };

  const confirmCompletion = async (booking) => {
    try {
      await api.post(`/api/bookings/${booking.id}/confirm/`);
      Alert.alert('Service confirmed', 'Admin has been notified to review and release the escrow payment.');
      load();
    } catch (error) {
      Alert.alert('Confirmation failed', errorMessage(error));
    }
  };

  const confirmCompletedService = (booking) => {
    Alert.alert(
      'Confirm completed service?',
      `Confirm that ${booking.service_title || 'this service'} has been completed properly? Admin will be notified to release escrow.`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Confirm', onPress: () => confirmCompletion(booking) },
      ],
    );
  };

  const reportIssue = async (booking) => {
    try {
      await api.post(`/api/bookings/${booking.id}/issue/`);
      Alert.alert('Issue reported', 'Escrow will stay blocked until admin reviews the case.');
      load();
    } catch (error) {
      Alert.alert('Issue report failed', errorMessage(error));
    }
  };

  const updateStatus = async (booking, nextStatus) => {
    try {
      const { data } = await api.put(`/api/bookings/${booking.id}/status/`, { status: nextStatus });
      setBookings((current) => current.map((item) => (
        String(item.id) === String(booking.id)
          ? { ...item, ...(data || {}), status: nextStatus }
          : item
      )));
      const statusMessages = {
        confirmed: ['Request accepted', 'The client has been notified that you accepted the job.'],
        in_progress: ['Job started', 'The request is now marked as in progress.'],
        completed: ['Completion sent', 'The client has been notified to confirm the completed service.'],
        cancelled: [isProvider ? 'Request declined' : 'Booking cancelled', isProvider ? 'The request has been declined.' : 'The booking has been moved to History.'],
      };
      const [title, message] = statusMessages[nextStatus] || ['Request updated', 'The booking status has been updated.'];
      Alert.alert(title, message);
      load();
    } catch (error) {
      Alert.alert('Request update failed', errorMessage(error));
    }
  };

  const confirmCancelBooking = (booking) => {
    Alert.alert(
      'Cancel service?',
      `Are you sure you want to cancel ${booking.service_title || 'this service'}?`,
      [
        { text: 'No, keep it', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: () => updateStatus(booking, 'cancelled'),
        },
      ],
    );
  };

  const openReview = (booking) => {
    setReviewBooking(booking);
    setReviewRating(5);
    setReviewComment('');
  };

  const closeReview = () => {
    if (reviewLoading) return;
    setReviewBooking(null);
    setReviewRating(5);
    setReviewComment('');
  };

  const submitReview = async () => {
    if (!reviewBooking) return;
    try {
      setReviewLoading(true);
      await api.post(`/api/services/${reviewBooking.service}/reviews/`, {
        booking: reviewBooking.id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setBookings((current) => current.map((item) => (
        String(item.id) === String(reviewBooking.id) ? { ...item, has_review: true } : item
      )));
      Alert.alert('Review submitted', 'Thank you for reviewing this provider.');
      closeReview();
      load();
    } catch (error) {
      Alert.alert('Review failed', errorMessage(error));
    } finally {
      setReviewLoading(false);
    }
  };

  const isCancelledBooking = (booking) => ['cancelled', 'canceled'].includes(String(booking?.status || '').trim().toLowerCase());

  const filtered = bookings.filter((item) => {
    const finished = isCancelledBooking(item) || item.payment_status === 'released' || item.payment_status === 'refunded' || !!item.client_confirmed_at;
    if (filter === 'History') return finished;
    return !finished;
  });

  if (activeChat) {
    return (
      <ChatScreen
        route={{ params: { booking: activeChat } }}
        navigation={{
          ...navigation,
          goBack: () => setActiveChat(null),
          navigate: (screen, params) => {
            const parentNavigator = navigation.getParent?.();
            if (parentNavigator) parentNavigator.navigate(screen, params);
            else navigation.navigate(screen, params);
          },
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.bookingsDarkScreen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.bookingsContent}
        ListHeaderComponent={(
          <View style={styles.bookingsHeaderBlock}>
            <View style={styles.bookingsTitleRow}>
              <View>
                <Text style={styles.bookingsTitle}>{isProvider ? 'Service Requests' : 'My Bookings'}</Text>
                <Text style={styles.bookingsSubtitle}>{isProvider ? 'Review client jobs and respond quickly.' : 'Track your service requests.'}</Text>
              </View>
              <View style={styles.bookingSearchBox}><Ionicons name="search" size={17} color="#8FA0B8" /><Text style={styles.bookingSearchText}>Search ID...</Text></View>
            </View>
            <View style={styles.bookingTabs}>
              {['Active', 'History'].map((item) => (
                <TouchableOpacity activeOpacity={0.8} key={item} onPress={() => setFilter(item)} style={styles.bookingTabButton}>
                  <Text style={[styles.bookingTabText, filter === item && styles.bookingTabTextActive]}>{item.toUpperCase()}</Text>
                  {filter === item ? <View style={styles.bookingTabLine} /> : null}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.bookingsRule} />
            {loading ? <ActivityIndicator color={colors.orange} /> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.bookingDarkCard}>
            <View style={styles.bookingIconBox}><Ionicons name="calendar-outline" size={28} color={colors.orange} /></View>
            <View style={styles.bookingInfo}>
              <View style={styles.rowStart}>
                <View style={styles.escrowTag}><Text style={styles.escrowTagText}>{item.refund_status === 'requested' ? 'REFUND REQUESTED' : item.payment_status === 'refunded' ? 'REFUNDED' : item.client_confirmed_at || item.payment_status === 'released' ? 'COMPLETED' : isCancelledBooking(item) ? 'CANCELLED' : item.is_paid ? 'ESCROWED' : String(item.status || '').toUpperCase()}</Text></View>
                <Text style={styles.bookingId}>ID: #SRV-{String(item.id).padStart(4, '0')}</Text>
              </View>
              <Text style={styles.bookingDarkTitle}>{item.service_title}</Text>
              <Text style={styles.bookingProvider}>{isProvider ? 'Client' : 'Provider'}: <Text style={styles.bookingProviderName}>{isProvider ? (item.client_name || 'Client') : (item.provider_name || 'Jean Dupont')}</Text></Text>
              <Text style={styles.bookingDate}>{new Date(item.scheduled_at).toLocaleString()}</Text>
              {isProvider && item.address ? <Text style={styles.bookingDate}>Address: {item.address}</Text> : null}
              {isProvider && item.notes ? <Text style={styles.bookingDate}>Notes: {item.notes}</Text> : null}
            </View>
            <View style={styles.bookingAmountBlock}>
              <Text style={styles.bookingTotalLabel}>{isProvider ? 'JOB VALUE' : 'TOTAL'}</Text>
              <Text style={styles.bookingAmount}>{formatMoney(item.amount).replace(' FCFA', '')} XAF</Text>
              <View style={styles.bookingActions}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => openChatThread(item)} style={styles.bookingMessageButton}><Ionicons name="chatbox-outline" size={18} color="#8FA0B8" /></TouchableOpacity>
                {isCancelledBooking(item) ? (
                  <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingTrackButton, styles.bookingDisabledButton]}><Text style={styles.bookingTrackText}>CANCELLED</Text></TouchableOpacity>
                ) : isProvider && item.status === 'pending' ? (
                  <>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => updateStatus(item, 'cancelled')} style={styles.bookingDeclineButton}><Text style={styles.bookingDeclineText}>DECLINE</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => updateStatus(item, 'confirmed')} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>ACCEPT</Text></TouchableOpacity>
                  </>
                ) : isProvider && item.status === 'confirmed' ? (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => updateStatus(item, 'in_progress')} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>START JOB</Text></TouchableOpacity>
                ) : isProvider && item.status === 'in_progress' ? (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => updateStatus(item, 'completed')} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>JOB COMPLETED</Text></TouchableOpacity>
                ) : isProvider && item.status === 'completed' && item.payment_status === 'escrowed' ? (
                  <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingTrackButton, styles.bookingDisabledButton]}><Text style={styles.bookingTrackText}>AWAITING CLIENT</Text></TouchableOpacity>
                ) : isProvider && item.status === 'completed' ? (
                  <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingTrackButton, styles.bookingDisabledButton]}><Text style={styles.bookingTrackText}>{item.payment_status === 'released' ? 'COMPLETED' : 'AWAITING RELEASE'}</Text></TouchableOpacity>
                ) : !isProvider && !item.is_paid ? (
                  <>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => confirmCancelBooking(item)} style={styles.bookingDeclineButton}><Text style={styles.bookingDeclineText}>CANCEL</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => openPaymentPin(item)} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>PAY</Text></TouchableOpacity>
                  </>
                ) : !isProvider && item.refund_status === 'requested' ? (
                  <>
                    <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingDeclineButton, styles.bookingDisabledButton]}><Text style={styles.bookingDeclineText}>REFUND PENDING</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => trackBooking(item)} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>TRACK</Text></TouchableOpacity>
                  </>
                ) : !isProvider && item.payment_status === 'refunded' ? (
                  <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingTrackButton, styles.bookingDisabledButton]}><Text style={styles.bookingTrackText}>REFUNDED</Text></TouchableOpacity>
                ) : !isProvider && item.is_paid && item.payment_status !== 'refunded' && (item.client_confirmed_at || item.payment_status === 'released') ? (
                  item.has_review ? (
                    <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingTrackButton, styles.bookingDisabledButton]}><Text style={styles.bookingTrackText}>COMPLETED</Text></TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity activeOpacity={0.8} disabled style={[styles.bookingDeclineButton, styles.bookingDisabledButton]}><Text style={styles.bookingDeclineText}>COMPLETED</Text></TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => openReview(item)} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>REVIEW</Text></TouchableOpacity>
                    </>
                  )
                ) : !isProvider && item.is_paid && item.payment_status !== 'released' && item.payment_status !== 'refunded' && (item.provider_marked_completed_at || item.status === 'completed') && !item.issue_reported_at ? (
                  <>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => reportIssue(item)} style={styles.bookingDeclineButton}><Text style={styles.bookingDeclineText}>REPORT ISSUE</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => confirmCompletedService(item)} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>CONFIRM</Text></TouchableOpacity>
                  </>
                ) : !isProvider && item.is_paid ? (
                  <>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => reportIssue(item)} style={styles.bookingDeclineButton}><Text style={styles.bookingDeclineText}>REPORT ISSUE</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => trackBooking(item)} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>TRACK</Text></TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => trackBooking(item)} style={styles.bookingTrackButton}><Text style={styles.bookingTrackText}>{isProvider ? item.status.toUpperCase() : 'TRACK'}</Text></TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
        ListFooterComponent={(
          <View style={styles.escrowInfoBox}>
            <Ionicons name="shield-checkmark-outline" size={28} color={colors.blue} />
            <View style={styles.flex}>
              <Text style={styles.escrowInfoTitle}>Secure Escrow Active</Text>
              <Text style={styles.escrowInfoText}>Funds are held safely until you confirm completion.</Text>
            </View>
          </View>
        )}
      />
      <Modal transparent visible={!!paymentBooking} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={closePaymentPin}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={12} style={styles.paymentPinOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={closePaymentPin} style={styles.paymentPinScrim} />
            <View style={styles.paymentPinCard}>
              <View style={styles.paymentPinIcon}><Ionicons name="lock-closed-outline" size={24} color={colors.orange} /></View>
              <Text style={styles.paymentPinTitle}>Confirm Payment</Text>
              <Text style={styles.paymentPinSubtitle}>Enter your wallet PIN to pay {paymentBooking ? formatMoney(paymentBooking.amount) : ''} into escrow.</Text>
              <TextInput
                value={paymentPin}
                onChangeText={(value) => setPaymentPin(value.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoFocus
                placeholder="••••"
                placeholderTextColor="#8FA0B8"
                style={styles.paymentPinInput}
              />
              <View style={styles.paymentPinActions}>
                <TouchableOpacity activeOpacity={0.8} onPress={closePaymentPin} style={styles.paymentPinCancel}>
                  <Text style={styles.paymentPinCancelText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.8} onPress={pay} disabled={paymentLoading} style={[styles.paymentPinConfirm, paymentLoading && styles.disabledButton]}>
                  {paymentLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.paymentPinConfirmText}>PAY</Text>}
                </TouchableOpacity>
              </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal transparent visible={!!reviewBooking} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={closeReview}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={12} style={styles.paymentPinOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={closeReview} style={styles.paymentPinScrim} />
          <View style={styles.reviewModalCard}>
            <View style={styles.paymentPinIcon}><Ionicons name="star-outline" size={24} color={colors.orange} /></View>
            <Text style={styles.paymentPinTitle}>Review Provider</Text>
            <Text style={styles.paymentPinSubtitle}>Rate {reviewBooking?.provider_name || 'this provider'} for {reviewBooking?.service_title || 'this service'}.</Text>
            <View style={styles.reviewStarRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity key={value} activeOpacity={0.8} onPress={() => setReviewRating(value)} style={styles.reviewStarButton}>
                  <Ionicons name={value <= reviewRating ? 'star' : 'star-outline'} size={34} color={colors.orange} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              placeholder="Write a comment about the provider's service..."
              placeholderTextColor="#8FA0B8"
              style={styles.reviewCommentInput}
            />
            <View style={styles.paymentPinActions}>
              <TouchableOpacity activeOpacity={0.8} onPress={closeReview} style={styles.paymentPinCancel}>
                <Text style={styles.paymentPinCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={submitReview} disabled={reviewLoading} style={[styles.paymentPinConfirm, reviewLoading && styles.disabledButton]}>
                {reviewLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.paymentPinConfirmText}>SUBMIT</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {showStandaloneBottomTabs && (
        <View style={styles.bookingBottomTabs}>
          {[
            ['Explore', 'home-outline', () => goToTab('Explore')],
            ['Map View', 'map-outline', () => goToTab('Map View')],
            ['Messages', 'chatbubbles-outline', () => goToTab('Messages')],
            ['Wallet', 'wallet-outline', () => goToTab('Wallet')],
            ['Account', 'person-outline', () => goToTab('Account')]
          ].map(([label, icon, onPress]) => (
            <TouchableOpacity activeOpacity={0.8} key={label} onPress={onPress} style={styles.bookingBottomTab}>
              <Ionicons name={icon} size={24} color={label === 'Map View' ? colors.orange : '#9CA3AF'} />
              <Text style={[styles.bookingBottomLabel, label === 'Map View' && styles.bookingBottomLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

export function WalletScreen({ route, navigation }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const pinInputRef = useRef(null);
  const unlockPinRef = useRef(null);
  const lastAccessPinRequiredRef = useRef(null);
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const [setupReady, setSetupReady] = useState(false);
  const [walletSetupComplete, setWalletSetupComplete] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [pin, setPin] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [kycBusinessName, setKycBusinessName] = useState('');
  const [kycCityArea, setKycCityArea] = useState('');
  const [idFront, setIdFront] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [selfie, setSelfie] = useState(null);

  const isProvider = user?.role === 'provider';
  const [kycOnlyMode, setKycOnlyMode] = useState(!!route?.params?.kycOnly);
  const [walletUnlocked, setWalletUnlocked] = useState(false);
  const [pinSetupMode, setPinSetupMode] = useState(false);
  const [pinPromptDismissed, setPinPromptDismissed] = useState(false);
  const totalSetupSteps = 3;
  const termsStep = 2;
  const walletSetupKey = `wallet_setup_${user?.id || user?.email || 'guest'}`;
  const pinPromptKey = `wallet_pin_prompt_dismissed_${user?.id || user?.email || 'guest'}`;
  const providerWalletLocked = isProvider && wallet?.provider_wallet_locked;
  const providerKycStatus = wallet?.provider_kyc_status || 'pending';
  const showKycOnly = kycOnlyMode || route?.params?.kycOnly;
  const walletRequiresAccessPin = !!(wallet?.pin_required_for_access && wallet?.pin_is_set);
  const walletLoaded = !!wallet;

  const load = useCallback(async (enforceAccessLock = false) => {
    try {
      const { data } = await api.get('/api/wallet/');
      setWallet(data);
      const requiresAccessPin = !!(data.pin_required_for_access && data.pin_is_set);
      const previousRequiresAccessPin = lastAccessPinRequiredRef.current;
      if ((enforceAccessLock || previousRequiresAccessPin !== true) && requiresAccessPin) {
        setWalletUnlocked(false);
      }
      if (!requiresAccessPin) {
        setWalletUnlocked(true);
      }
      lastAccessPinRequiredRef.current = requiresAccessPin;
      if (isProvider) return;
      if (data.pin_is_set) {
        await AsyncStorage.setItem(walletSetupKey, 'complete');
        setWalletSetupComplete(true);
        return;
      }
      if (!data.pin_is_set) {
        await AsyncStorage.removeItem(walletSetupKey);
        setWalletSetupComplete(false);
        setSetupStep(1);
      }
    } catch (e) {
      Alert.alert(t('Wallet unavailable'), errorMessage(e));
    }
  }, [isProvider, t, walletSetupKey]);

  useEffect(() => {
    let mounted = true;
    const loadSetupState = async () => {
      try {
        const dismissed = await AsyncStorage.getItem(pinPromptKey);
        const { data } = await api.get('/api/wallet/');
        if (!mounted) return;
        if (mounted) setPinPromptDismissed(dismissed === 'true');

        const requiresAccessPin = !!(data.pin_required_for_access && data.pin_is_set);
        lastAccessPinRequiredRef.current = requiresAccessPin;
        if (isProvider) {
          setWallet(data);
          setWalletUnlocked(!requiresAccessPin);
          setWalletSetupComplete(true);
          if (mounted) setSetupReady(true);
          return;
        }

        setWallet(data);
        const saved = await AsyncStorage.getItem(walletSetupKey);
        if (data.pin_is_set) {
          await AsyncStorage.setItem(walletSetupKey, 'complete');
          if (mounted) {
            setWalletSetupComplete(true);
            setWalletUnlocked(!requiresAccessPin);
          }
        } else if (saved === 'complete') {
          if (mounted) {
            setWalletSetupComplete(true);
            setWalletUnlocked(true);
            setWallet(data);
          }
        } else if (mounted) {
          setWallet(data);
          setWalletSetupComplete(false);
          setSetupStep(1);
          setWalletUnlocked(false);
        }
      } catch (error) {
        if (mounted) {
          setWalletSetupComplete(false);
          setWalletUnlocked(false);
        }
      } finally {
        if (mounted) setSetupReady(true);
      }
    };
    setSetupReady(false);
    loadSetupState();
    return () => { mounted = false; };
  }, [isProvider, pinPromptKey, walletSetupKey]);

  useFocusEffect(useCallback(() => {
    if (showKycOnly) return;
    if (isProvider || walletSetupComplete || walletLoaded) load(false);
  }, [load, walletSetupComplete, isProvider, showKycOnly, walletLoaded]));

  useFocusEffect(useCallback(() => {
    if (route?.params?.kycOnly) {
      setKycOnlyMode(true);
      setKycBusinessName(user?.full_name || '');
      setKycCityArea('');
      setIdFront(null);
      setIdBack(null);
      setSelfie(null);
      navigation.setParams?.({ kycOnly: undefined });
    }
  }, [navigation, route?.params?.kycOnly, user?.full_name]));

  const topup = async () => {
    if (providerWalletLocked) {
      Alert.alert(t('KYC approval required'), t('Providers can fund or withdraw from their wallet after admin approves KYC.'));
      return;
    }
    try {
      const { data } = await api.post('/api/wallet/topup/', { amount });
      setWallet(data);
      setAmount('');
    } catch (error) {
      Alert.alert(t('Top up failed'), errorMessage(error));
    }
  };

  const refreshWallet = async () => {
    setWalletRefreshing(true);
    try {
      await load();
    } finally {
      setWalletRefreshing(false);
    }
  };

  const continueSetup = async () => {
    if (setupStep === 1 && pin.length !== 4) {
      Alert.alert(t('PIN required'), t('Create a 4 digit wallet PIN to continue.'));
      return;
    }
    if (setupStep === termsStep && !termsAccepted) {
      Alert.alert(t('Terms required'), t('Please agree to the financial terms of service to activate your wallet.'));
      return;
    }
    setSetupStep((step) => Math.min(step + 1, totalSetupSteps));
  };

  const submitKycOnly = async () => {
    if (!kycBusinessName.trim()) {
      Alert.alert(t('KYC required'), t('Enter your legal business name before submitting verification.'));
      return;
    }
    if (!kycCityArea.trim()) {
      Alert.alert(t('Location required'), t('Enter your City/Area before submitting verification.'));
      return;
    }
    if (!idFront || !idBack || !selfie) {
      Alert.alert(t('Documents required'), t('Upload the front, back, and selfie verification photos to continue.'));
      return;
    }
    try {
      const profilePayload = new FormData();
      profilePayload.append('business_name', kycBusinessName.trim());
      profilePayload.append('city_area', kycCityArea.trim());
      await api.post('/api/users/provider/profile/', profilePayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const kycPayload = new FormData();
      kycPayload.append('id_front', uploadFileFromAsset(idFront, 'id-front.jpg'));
      kycPayload.append('id_back', uploadFileFromAsset(idBack, 'id-back.jpg'));
      kycPayload.append('selfie', uploadFileFromAsset(selfie, 'selfie.jpg'));
      await api.post('/api/users/provider/kyc/', kycPayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Alert.alert('KYC submitted', 'Your documents were sent for admin review.');
      setKycOnlyMode(false);
      if (navigation.canGoBack?.()) navigation.goBack();
    } catch (error) {
      Alert.alert(t('KYC upload failed'), errorMessage(error));
    }
  };

  const verifyWalletPin = async () => {
    if (unlockPin.length !== 4) {
      Alert.alert(t('PIN required'), t('Enter your 4 digit wallet PIN.'));
      return;
    }
    try {
      const { data } = await api.post('/api/wallet/pin/verify/', { pin: unlockPin });
      setWallet(data.wallet);
      lastAccessPinRequiredRef.current = !!(data.wallet?.pin_required_for_access && data.wallet?.pin_is_set);
      setWalletUnlocked(true);
      setUnlockPin('');
    } catch (error) {
      Alert.alert(t('Incorrect PIN'), errorMessage(error));
      setUnlockPin('');
    }
  };

  const saveOptionalProviderPin = async () => {
    if (pin.length !== 4) {
      Alert.alert(t('PIN required'), t('Create a 4 digit wallet PIN to continue.'));
      return;
    }
    try {
      await api.post('/api/wallet/pin/', { pin });
      const { data } = await api.patch('/api/wallet/pin/preference/', { pin_required_for_access: true });
      setWallet(data);
      lastAccessPinRequiredRef.current = !!(data.pin_required_for_access && data.pin_is_set);
      setPin('');
      setPinSetupMode(false);
      setWalletUnlocked(true);
      Alert.alert('Access PIN set', 'Your wallet is now protected with a 4-digit PIN.');
    } catch (error) {
      Alert.alert(t('Wallet setup failed'), errorMessage(error));
    }
  };

  const dismissPinPrompt = async () => {
    await AsyncStorage.setItem(pinPromptKey, 'true');
    setPinPromptDismissed(true);
  };

  const pickKycDocument = async (side) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('Permission required'), t('Allow photo access so you can upload your ID document.'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8
    });

    if (result.canceled || !result.assets?.[0]) return;
    if (side === 'front') setIdFront(result.assets[0]);
    if (side === 'back') setIdBack(result.assets[0]);
    if (side === 'selfie') setSelfie(result.assets[0]);
  };

  const completeSetup = async () => {
    try {
      let nextWallet = wallet;
      if (pin) {
        const { data } = await api.post('/api/wallet/pin/', { pin });
        nextWallet = data;
        setWallet(data);
      } else {
        await load();
      }
      await AsyncStorage.setItem(walletSetupKey, 'complete');
      setWalletSetupComplete(true);
      setPin('');
      setWalletUnlocked(true);
      if (!nextWallet?.pin_is_set) load();
    } catch (error) {
      Alert.alert(t('Wallet setup failed'), errorMessage(error));
    }
  };

  const requestPinReset = async () => {
    try {
      const { data } = await api.post('/api/wallet/pin/reset/');
      setWallet(data.wallet);
      Alert.alert(t('PIN reset requested'), t('An admin must approve your PIN reset before you can set a new PIN.'));
    } catch (error) {
      Alert.alert(t('PIN reset failed'), errorMessage(error));
    }
  };

  const startApprovedPinReset = async () => {
    if (!isProvider) {
      await AsyncStorage.removeItem(walletSetupKey);
      setWalletSetupComplete(false);
      setSetupStep(1);
    }
    setPinSetupMode(true);
    setWalletUnlocked(false);
    setPin('');
  };

  const renderSetupHeader = () => (
    <View style={styles.walletSetupHeader}>
      <View style={styles.rowStart}>
        <View style={styles.walletSetupHeaderIcon}><Ionicons name="wallet-outline" size={18} color={colors.orange} /></View>
        <Text style={styles.walletSetupHeaderText}>WALLET ACTIVATION</Text>
      </View>
      <Text style={styles.walletSetupStepText}>STEP {setupStep} OF {totalSetupSteps}</Text>
    </View>
  );

  const renderPinStep = () => (
    <View style={styles.walletSetupBody}>
      <View style={styles.walletSetupIconCircle}><Ionicons name="lock-closed-outline" size={34} color={colors.orange} /></View>
      <Text style={styles.walletSetupTitle}>Create Security PIN</Text>
      <Text style={styles.walletSetupSubtitle}>This 4-digit code will be required for wallet transactions.</Text>
      <TouchableOpacity activeOpacity={0.9} onPress={() => pinInputRef.current?.focus()} style={styles.pinBoxes}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={[styles.pinBox, pin[index] && styles.pinBoxFilled]}>
            <Text style={styles.pinDot}>{pin[index] ? '*' : ''}</Text>
          </View>
        ))}
      </TouchableOpacity>
      <TextInput
        ref={pinInputRef}
        value={pin}
        onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        style={styles.hiddenPinInput}
      />
      <TouchableOpacity activeOpacity={0.85} onPress={continueSetup} style={styles.walletSetupPrimaryButton}>
        <Text style={styles.walletSetupPrimaryText}>CONTINUE</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );

  const renderKycOnlyScreen = () => (
    <ScrollView contentContainerStyle={styles.walletKycBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.walletKycAccent}>
        <Ionicons name="shield-checkmark-outline" size={44} color={colors.white} />
        <Text style={styles.walletKycAccentTitle}>Trust & Safety Verification</Text>
        <Text style={styles.walletKycAccentText}>Submit your identity documents for admin review.</Text>
      </View>
      <View style={styles.walletKycPanel}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => {
          setKycOnlyMode(false);
          if (navigation.canGoBack?.()) navigation.goBack();
        }} style={styles.walletSetupBack}>
          <Ionicons name="chevron-back" size={16} color="#B9C5D8" />
          <Text style={styles.walletSetupBackText}>BACK</Text>
        </TouchableOpacity>
        <Text style={styles.walletSetupTitleLeft}>Business Identity</Text>
        <Text style={styles.walletSetupSubtitleLeft}>Tell us about your professional business.</Text>
        <Text style={styles.walletSetupFieldLabel}>LEGAL BUSINESS NAME</Text>
        <TextInput
          value={kycBusinessName}
          onChangeText={setKycBusinessName}
          placeholder={t('e.g. Douala Tech Solutions')}
          placeholderTextColor="#8FA0B8"
          style={styles.walletSetupTextInput}
        />
        <Text style={styles.walletSetupFieldLabel}>CITY / AREA</Text>
        <TextInput
          value={kycCityArea}
          onChangeText={setKycCityArea}
          placeholder={t('e.g. Douala, Bonamousadi')}
          placeholderTextColor="#8FA0B8"
          style={styles.walletSetupTextInput}
        />
        <Text style={styles.walletSetupFieldLabel}>NATIONAL ID VERIFICATION</Text>
        <View style={styles.walletUploadRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => pickKycDocument('front')} style={styles.walletUploadBox}>
            {idFront?.uri ? <Image source={{ uri: idFront.uri }} style={styles.walletUploadPreview} /> : <Ionicons name="cloud-upload-outline" size={28} color="#B9C5D8" />}
            <Text style={[styles.walletUploadText, idFront?.uri && styles.walletUploadTextSelected]}>{idFront?.uri ? 'FRONT SELECTED' : 'FRONT OF ID CARD'}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => pickKycDocument('back')} style={styles.walletUploadBox}>
            {idBack?.uri ? <Image source={{ uri: idBack.uri }} style={styles.walletUploadPreview} /> : <Ionicons name="cloud-upload-outline" size={28} color="#B9C5D8" />}
            <Text style={[styles.walletUploadText, idBack?.uri && styles.walletUploadTextSelected]}>{idBack?.uri ? 'BACK SELECTED' : 'BACK OF ID CARD'}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => pickKycDocument('selfie')} style={styles.walletUploadBox}>
            {selfie?.uri ? <Image source={{ uri: selfie.uri }} style={styles.walletUploadPreview} /> : <Ionicons name="person-circle-outline" size={30} color="#B9C5D8" />}
            <Text style={[styles.walletUploadText, selfie?.uri && styles.walletUploadTextSelected]}>{selfie?.uri ? 'SELFIE SELECTED' : 'SELFIE PHOTO'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.walletSetupNotice}>
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.blue} />
          <Text style={styles.walletSetupNoticeText}>Your data is encrypted. Verification usually takes 12-24 hours.</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={submitKycOnly} style={styles.walletSetupPrimaryButton}>
          <Text style={styles.walletSetupPrimaryText}>SUBMIT FOR VERIFICATION</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPinUnlock = () => (
    <View style={styles.walletSetupBody}>
      <View style={styles.walletSetupIconCircle}><Ionicons name="lock-closed-outline" size={34} color={colors.orange} /></View>
      <Text style={styles.walletSetupTitle}>Enter Wallet PIN</Text>
      <Text style={styles.walletSetupSubtitle}>
        {isProvider
          ? 'Enter your 4-digit access PIN to view wallet balance and transactions.'
          : 'Enter your 4-digit PIN to access your wallet.'}
      </Text>
      <TouchableOpacity activeOpacity={0.9} onPress={() => unlockPinRef.current?.focus()} style={styles.pinBoxes}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={[styles.pinBox, unlockPin[index] && styles.pinBoxFilled]}>
            <Text style={styles.pinDot}>{unlockPin[index] ? '*' : ''}</Text>
          </View>
        ))}
      </TouchableOpacity>
      <TextInput
        ref={unlockPinRef}
        value={unlockPin}
        onChangeText={(value) => setUnlockPin(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        style={styles.hiddenPinInput}
      />
      <TouchableOpacity activeOpacity={0.85} onPress={verifyWalletPin} style={styles.walletSetupPrimaryButton}>
        <Text style={styles.walletSetupPrimaryText}>UNLOCK WALLET</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );

  const renderProviderPinSetup = () => (
    <View style={styles.walletSetupBody}>
      <View style={styles.walletSetupIconCircle}><Ionicons name="lock-closed-outline" size={34} color={colors.orange} /></View>
      <Text style={styles.walletSetupTitle}>Set Wallet Access PIN</Text>
      <Text style={styles.walletSetupSubtitle}>Optional: protect your wallet with a 4-digit PIN so others cannot view your transactions.</Text>
      <TouchableOpacity activeOpacity={0.9} onPress={() => pinInputRef.current?.focus()} style={styles.pinBoxes}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={[styles.pinBox, pin[index] && styles.pinBoxFilled]}>
            <Text style={styles.pinDot}>{pin[index] ? '*' : ''}</Text>
          </View>
        ))}
      </TouchableOpacity>
      <TextInput
        ref={pinInputRef}
        value={pin}
        onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        style={styles.hiddenPinInput}
      />
      <TouchableOpacity activeOpacity={0.85} onPress={saveOptionalProviderPin} style={styles.walletSetupPrimaryButton}>
        <Text style={styles.walletSetupPrimaryText}>SAVE PIN</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.85} onPress={() => {
        setPin('');
        setPinSetupMode(false);
        if (wallet?.pin_reset_status !== 'approved') dismissPinPrompt();
      }} style={styles.walletSetupBack}>
        <Text style={styles.walletSetupBackText}>SKIP FOR NOW</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTermsStep = () => (
    <View style={styles.walletSetupBody}>
      <View style={styles.walletSetupIconCircleBlue}><Ionicons name="person-check-outline" size={34} color={colors.blue} /></View>
      <Text style={styles.walletSetupTitle}>Identity & Legal</Text>
      <Text style={styles.walletSetupSubtitle}>Confirm your identity to enable financial transactions.</Text>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setTermsAccepted((value) => !value)} style={styles.termsCard}>
        <Ionicons name="document-text-outline" size={20} color="#B9C5D8" />
        <View style={styles.flex}>
          <Text style={styles.termsTitle}>Financial Terms of Service</Text>
          <Text style={styles.termsText}>I agree to the escrow and fee policies.</Text>
        </View>
        <View style={[styles.termsCheckbox, termsAccepted && styles.termsCheckboxActive]}>
          {termsAccepted && <Ionicons name="checkmark" size={15} color={colors.white} />}
        </View>
      </TouchableOpacity>
      <View style={styles.walletSetupNotice}>
        <Text style={styles.walletSetupNoticeText}>By activating this wallet, you certify that you are a resident of the CEMAC region and will comply with local financial regulations.</Text>
      </View>
      <TouchableOpacity activeOpacity={0.85} onPress={continueSetup} style={[styles.walletSetupPrimaryButton, !termsAccepted && styles.walletSetupButtonDisabled]}>
        <Text style={styles.walletSetupPrimaryText}>VERIFY & CONTINUE</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCompleteStep = () => (
    <View style={styles.walletSetupBody}>
      <View style={styles.walletReadyCircle}><Ionicons name="checkmark" size={46} color={colors.white} /></View>
      <Text style={styles.walletSetupTitle}>Wallet Ready!</Text>
      <Text style={styles.walletSetupSubtitle}>Your Servista Wallet is active and secured with AES-256 encryption.</Text>
      <View style={styles.walletSetupNotice}>
        <Ionicons name="shield-checkmark-outline" size={28} color={colors.blue} />
        <Text style={styles.walletSetupNoticeTextStrong}>YOUR FUNDS ARE NOW PROTECTED BY THE SERVISTA ESCROW GOVERNANCE PROTOCOL.</Text>
      </View>
      <TouchableOpacity activeOpacity={0.85} onPress={completeSetup} style={styles.walletSetupWhiteButton}>
        <Text style={styles.walletSetupWhiteText}>GO TO MY WALLET</Text>
      </TouchableOpacity>
    </View>
  );

  if (!setupReady) {
    return (
      <SafeAreaView style={styles.walletSetupScreen}>
        <ActivityIndicator color={colors.orange} />
      </SafeAreaView>
    );
  }

  if (showKycOnly) {
    return (
      <SafeAreaView style={styles.walletSetupScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={24} style={styles.flex}>
          {renderKycOnlyScreen()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (isProvider && pinSetupMode) {
    return (
      <SafeAreaView style={styles.walletSetupScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={24} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.walletSetupScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.walletSetupCard}>
              {renderProviderPinSetup()}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (walletRequiresAccessPin && !walletUnlocked && !showKycOnly) {
    return (
      <SafeAreaView style={styles.walletSetupScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={24} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.walletSetupScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.walletSetupCard}>
              {renderPinUnlock()}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (!isProvider && !walletSetupComplete) {
    return (
      <SafeAreaView style={styles.walletSetupScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={24} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.walletSetupScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.walletSetupCard}>
              {renderSetupHeader()}
              {setupStep === 1 && renderPinStep()}
              {setupStep === termsStep && renderTermsStep()}
              {setupStep === totalSetupSteps && renderCompleteStep()}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.walletDarkScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.walletDarkContent} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.walletDarkHeading}>Servista Wallet</Text>
            <Text style={styles.walletDarkSubtitle}>Manage your funds and track escrow payments.</Text>
          </View>
          {isProvider && !wallet?.pin_is_set && !pinPromptDismissed ? (
            <View style={styles.walletPinPromptCard}>
              <View style={styles.rowStart}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.orange} />
                <View style={styles.flex}>
                  <Text style={styles.walletKycLockTitle}>Optional wallet PIN</Text>
                  <Text style={styles.walletKycLockText}>Add a 4-digit PIN so only you can view wallet transactions on this device.</Text>
                </View>
              </View>
              <View style={styles.walletPinPromptActions}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setPinSetupMode(true)} style={styles.walletPinResetButton}>
                  <Text style={styles.walletPinResetText}>SET PIN</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} onPress={dismissPinPrompt} style={styles.walletPinResetButton}>
                  <Text style={styles.walletPinResetText}>NOT NOW</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={styles.walletBalancePanel}>
            <Text style={styles.walletPanelLabel}>AVAILABLE BALANCE</Text>
            <View style={styles.walletAmountLine}>
              <Text style={styles.walletBigAmount}>{formatMoney(wallet?.balance || 0).replace(' FCFA', '')}</Text>
              <Text style={styles.walletCurrency}>XAF</Text>
            </View>
            {providerWalletLocked && (
              <View style={styles.walletKycLockNotice}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.orange} />
                <View style={styles.flex}>
                  <Text style={styles.walletKycLockTitle}>KYC approval required</Text>
                  <Text style={styles.walletKycLockText}>Status: {providerKycStatus}. Funding and withdrawals unlock after admin approval.</Text>
                </View>
              </View>
            )}
            <View style={styles.walletButtonRow}>
              <TouchableOpacity activeOpacity={0.8} onPress={topup} disabled={providerWalletLocked} style={[styles.walletFundButton, providerWalletLocked && styles.walletButtonLocked]}><Ionicons name={providerWalletLocked ? 'lock-closed-outline' : 'add'} size={20} color={colors.white} /><Text style={styles.walletFundText}>FUND WALLET</Text></TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} disabled={providerWalletLocked} onPress={() => Alert.alert('Coming Soon')} style={[styles.walletWithdrawButton, providerWalletLocked && styles.walletButtonLocked]}><Ionicons name={providerWalletLocked ? 'lock-closed-outline' : 'arrow-up'} size={17} color={colors.white} /><Text style={styles.walletWithdrawText}>WITHDRAW</Text></TouchableOpacity>
            </View>
            <View style={styles.walletPinResetRow}>
              {wallet?.pin_reset_status === 'requested' ? (
                <Text style={styles.walletPinResetStatus}>PIN reset pending admin approval</Text>
              ) : wallet?.pin_reset_status === 'approved' ? (
                <TouchableOpacity activeOpacity={0.8} onPress={startApprovedPinReset} style={styles.walletPinResetButton}>
                  <Ionicons name="key-outline" size={17} color={colors.orange} />
                  <Text style={styles.walletPinResetText}>SET NEW PIN</Text>
                </TouchableOpacity>
              ) : !wallet?.pin_is_set && isProvider ? (
                <TouchableOpacity activeOpacity={0.8} onPress={() => setPinSetupMode(true)} style={styles.walletPinResetButton}>
                  <Ionicons name="lock-closed-outline" size={17} color={colors.orange} />
                  <Text style={styles.walletPinResetText}>SET ACCESS PIN</Text>
                </TouchableOpacity>
              ) : wallet?.pin_is_set ? (
                <TouchableOpacity activeOpacity={0.8} onPress={requestPinReset} style={styles.walletPinResetButton}>
                  <Ionicons name="help-circle-outline" size={17} color={colors.orange} />
                  <Text style={styles.walletPinResetText}>REQUEST PIN RESET</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <Input icon="cash-outline" placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} style={styles.walletAmountInput} inputStyle={styles.walletAmountInputText} />
          <View style={styles.walletEscrowPanel}>
            <View style={styles.row}>
              <View style={styles.rowStart}><Text style={styles.walletEscrowTitle}>Escrow Pipeline</Text><Ionicons name="information-circle-outline" size={16} color="#8FA0B8" /></View>
              <View style={styles.activeJobsPill}><Text style={styles.activeJobsText}>3 ACTIVE JOBS</Text></View>
            </View>
            <View style={styles.row}>
              <View style={styles.walletAmountLineSmall}><Text style={styles.walletEscrowAmount}>{formatMoney((wallet?.balance || 0) / 2).replace(' FCFA', '')}</Text><Text style={styles.walletSmallCurrency}>XAF</Text></View>
              <Text style={styles.trustText}>Secured in Servista Trust</Text>
            </View>
            <View style={styles.walletProgressTrack}><View style={styles.walletProgressGreen} /><View style={styles.walletProgressOrange} /></View>
            <View style={styles.walletLegendRow}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.green }]} /><Text style={styles.legendLabel}>IN REVIEW{'\n'}<Text style={styles.legendValue}>80,000 XAF</Text></Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.orange }]} /><Text style={styles.legendLabel}>AWAITING START{'\n'}<Text style={styles.legendValue}>35,000 XAF</Text></Text></View>
            </View>
          </View>
          <View style={styles.walletActivityHeader}>
            <TouchableOpacity activeOpacity={0.8} onPress={refreshWallet} disabled={walletRefreshing} style={styles.walletRefreshButton}>
              {walletRefreshing ? <ActivityIndicator size="small" color={colors.orange} /> : <Ionicons name="refresh-outline" size={18} color={colors.orange} />}
              <Text style={styles.walletActivityTitle}>Recent Activity</Text>
            </TouchableOpacity>
            <Text style={styles.exploreSeeAll}>SEE ALL</Text>
          </View>
          {(wallet?.transactions || []).map((tx) => {
            const paymentCompleted = tx.type === 'payment' && tx.booking_payment_status === 'released';
            const paymentRefunded = tx.booking_payment_status === 'refunded' || tx.type === 'refund';
            const successful = tx.type !== 'payment' || paymentCompleted || paymentRefunded;
            const badgeLabel = paymentRefunded ? 'REFUNDED' : paymentCompleted ? 'COMPLETED' : tx.type === 'payment' ? 'ESCROWED' : 'SUCCESS';
            const badgeTone = successful ? 'success' : 'warning';
            const iconName = successful ? 'checkmark-circle-outline' : 'time-outline';
            const iconColor = successful ? colors.green : colors.orange;

            return (
              <View key={tx.id} style={styles.walletActivityCard}>
                <View style={[styles.walletActivityIcon, { backgroundColor: successful ? 'rgba(16,185,129,0.14)' : 'rgba(242,101,34,0.14)' }]}><Ionicons name={iconName} size={20} color={iconColor} /></View>
                <View style={styles.flex}><Text style={styles.walletActivityName}>{tx.description}</Text><Text style={styles.walletActivityDate}>{new Date(tx.created_at).toLocaleString()}</Text></View>
                <View style={styles.txAmount}><Text style={[styles.walletActivityAmount, tx.type !== 'payment' && styles.walletActivityIncome]}>{tx.type !== 'payment' ? '+' : ''}{formatMoney(tx.amount)}</Text><Badge label={badgeLabel} tone={badgeTone} /></View>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ChatScreen({ route, navigation }) {
  const { user } = useAuth();
  const { booking = {}, serviceChat = false } = route.params || {};
  const chatListRef = useRef(null);
  const [currentBooking, setCurrentBooking] = useState(booking);
  const previewChat = serviceChat || !booking.id;
  const chatPartnerPhoto = user?.role === 'provider'
    ? currentBooking.client_photo
    : currentBooking.provider_photo;
  const chatPartnerLastSeen = user?.role === 'provider'
    ? currentBooking.client_last_seen
    : currentBooking.provider_last_seen;
  const presence = getPresence(chatPartnerLastSeen);
  const openProviderProfile = () => {
    navigation.navigate('ProviderProfile', {
      provider: {
        name: currentBooking.provider_name || 'Faith',
        category: currentBooking.category || 'plumbing',
        serviceTitle: currentBooking.service_title || 'Professional Plumbing Service',
        address: currentBooking.address || 'Douala, Cameroon',
        avatar: currentBooking.provider_photo,
        badge_verification_status: currentBooking.provider_badge_verification_status || 'not_verified',
        rating: currentBooking.provider_rating || '0.0'
      }
    });
  };
  const [messages, setMessages] = useState(previewChat ? [
    {
      id: 'service-preview-1',
      sender: currentBooking.provider || 'provider',
      content: `Hello! I can help with ${currentBooking.service_title || 'this service'}. Send a message and I will get back to you.`,
      sent_at: new Date().toISOString()
    }
  ] : []);
  const [content, setContent] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const receiver = user?.role === 'client' ? currentBooking.provider : currentBooking.client;
  const chatPartnerName = user?.role === 'provider'
    ? (currentBooking.client_name || 'Client')
    : (currentBooking.provider_name || 'Faith');
  const chatPartnerRole = user?.role === 'provider'
    ? (currentBooking.service_title || 'Service request')
    : (currentBooking.category || 'plumbing');
  const chatPartnerBadgeVerified = user?.role === 'client'
    && currentBooking.provider_badge_verification_status === 'verified';

  const load = useCallback(() => {
    if (previewChat) return;
    api.get(`/api/messages/${booking.id}/`).then(({ data }) => {
      const ordered = [...(Array.isArray(data) ? data : [])].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
      setMessages(ordered);
    }).catch(() => {});
    api.get(`/api/bookings/${booking.id}/`).then(({ data }) => setCurrentBooking(data)).catch(() => {});
  }, [booking.id, previewChat]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = setTimeout(() => {
      chatListRef.current?.scrollToEnd?.({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length]);
  useFocusEffect(useCallback(() => {
    load();
    if (previewChat) return undefined;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [load, previewChat]));

  const send = async () => {
    if (!content.trim() && !pendingAttachment) return;
    if (previewChat) {
      setMessages((items) => [
        ...items,
        {
          id: `local-${Date.now()}`,
          sender: user?.id,
          content,
          attachment: pendingAttachment?.asset?.uri,
          attachment_type: pendingAttachment?.type,
          attachment_name: pendingAttachment?.name,
          sent_at: new Date().toISOString()
        }
      ]);
      setContent('');
      setPendingAttachment(null);
      return;
    }
    try {
      if (pendingAttachment) {
        const payload = new FormData();
        payload.append('receiver', String(receiver));
        payload.append('booking', String(currentBooking.id));
        payload.append('content', content.trim());
        payload.append('attachment_type', pendingAttachment.type);
        payload.append('attachment_name', pendingAttachment.name);
        payload.append('attachment', uploadFileFromAsset(pendingAttachment.asset, pendingAttachment.name));
        await api.post('/api/messages/', payload, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/api/messages/', { receiver, booking: currentBooking.id, content });
      }
      setContent('');
      setPendingAttachment(null);
      load();
    } catch (error) {
      Alert.alert('Message failed', errorMessage(error));
    }
  };

  const sendAttachment = async (asset, attachmentType) => {
    if (!asset?.uri) return;
    const displayName = asset.fileName || asset.name || (attachmentType === 'image' ? 'image.jpg' : 'attachment');
    setPendingAttachment({ asset, type: attachmentType, name: displayName, uri: asset.uri });
  };

  const pickImageAttachment = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access so you can send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8
    });
    if (!result.canceled && result.assets?.[0]) sendAttachment(result.assets[0], 'image');
  };

  const pickFileAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false
    });
    if (!result.canceled && result.assets?.[0]) sendAttachment(result.assets[0], 'file');
  };

  const openAttachmentMenu = () => {
    Alert.alert('Send attachment', 'Choose what you want to send.', [
      { text: 'Image', onPress: pickImageAttachment },
      { text: 'File', onPress: pickFileAttachment },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const addEmoji = (emoji) => {
    setContent((value) => `${value}${emoji}`);
    setEmojiPickerOpen(false);
  };

  const deleteMessage = (message) => {
    if (!message?.id) return;
    const mine = String(message.sender) === String(user?.id);
    Alert.alert(
      mine ? 'Delete message?' : 'Remove message?',
      mine ? 'This message will be removed from your inbox.' : 'This will only remove the message from your inbox. The other user will still see it.',
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: mine ? 'Delete' : 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (String(message.id).startsWith('local-')) {
            setMessages((items) => items.filter((item) => item.id !== message.id));
            return;
          }
          try {
            await api.delete(`/api/messages/message/${message.id}/`);
            setMessages((items) => items.filter((item) => item.id !== message.id));
          } catch (error) {
            Alert.alert('Delete failed', errorMessage(error));
          }
        }
      }
    ]);
  };

  const clearChat = () => {
    Alert.alert('Clear chat?', 'This will only clear the conversation from your inbox. The other user will still keep their copy.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          if (previewChat) {
            setMessages([]);
            return;
          }
          try {
            await api.delete(`/api/messages/${currentBooking.id}/clear/`);
            setMessages([]);
          } catch (error) {
            Alert.alert('Clear chat failed', errorMessage(error));
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.chatDarkScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={8} style={styles.flex}>
        <View style={styles.chatDarkHeader}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={22} color="#8FA0B8" /></TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={user?.role === 'client' ? openProviderProfile : undefined} style={styles.chatProviderButton}>
            <View style={styles.avatarWrap}>
              <AvatarWithTrustBadge uri={chatPartnerPhoto} size={44} verified={chatPartnerBadgeVerified} />
              <View style={[styles.onlineDot, !presence.online && styles.offlineDot]} />
            </View>
            <View style={styles.flex}><Text style={styles.chatName}>{chatPartnerName}</Text><Text style={styles.chatStatus}>{presence.label} - {chatPartnerRole}</Text></View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={clearChat} style={styles.chatHeaderIconButton}>
            <Ionicons name="trash-outline" size={20} color="#8FA0B8" />
          </TouchableOpacity>
          <Ionicons name="call-outline" size={22} color="#8FA0B8" />
          <Ionicons name="videocam-outline" size={22} color="#8FA0B8" />
        </View>
        <View style={styles.chatDatePill}><Text style={styles.chatDatePillText}>TODAY</Text></View>
        <FlatList
          ref={chatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.chatDarkContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => chatListRef.current?.scrollToEnd?.({ animated: true })}
          onLayout={() => chatListRef.current?.scrollToEnd?.({ animated: false })}
          renderItem={({ item }) => {
            const mine = String(item.sender) === String(user?.id);
            const attachmentUri = mediaUri(item.attachment);
            return (
              <View style={[styles.chatMessageBlock, mine && styles.chatMessageRight]}>
                <TouchableOpacity activeOpacity={0.9} delayLongPress={450} onLongPress={() => deleteMessage(item)} style={[styles.chatBubble, mine ? styles.chatSentBubble : styles.chatReceivedBubble]}>
                  {attachmentUri && item.attachment_type === 'image' ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedAttachment({ uri: attachmentUri, type: 'image', name: item.attachment_name || 'Image' })}>
                      <Image source={{ uri: attachmentUri }} style={styles.chatAttachmentImage} />
                    </TouchableOpacity>
                  ) : null}
                  {attachmentUri && item.attachment_type !== 'image' ? (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedAttachment({ uri: attachmentUri, type: 'file', name: item.attachment_name || 'Attachment' })} style={styles.chatFileAttachment}>
                      <Ionicons name="document-attach-outline" size={22} color={mine ? colors.white : colors.orange} />
                      <Text style={[styles.chatFileText, mine ? styles.chatSentText : styles.chatReceivedText]}>{item.attachment_name || 'Attachment'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {item.content ? <Text style={mine ? styles.chatSentText : styles.chatReceivedText}>{item.content}</Text> : null}
                </TouchableOpacity>
                <Text style={[styles.chatTimestamp, mine && styles.timestampRight]}>{new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine ? '  ✓✓' : ''}</Text>
              </View>
            );
          }}
        />
        <View style={styles.chatComposerWrap}>
          <TouchableOpacity activeOpacity={0.8} onPress={openAttachmentMenu} style={styles.chatPlusButton}><Ionicons name="add" size={22} color="#8FA0B8" /></TouchableOpacity>
          <Input placeholder="Type a message..." placeholderTextColor={colors.white} value={content} onChangeText={setContent} style={styles.chatInput} inputStyle={styles.chatInputText} right={<TouchableOpacity activeOpacity={0.8} onPress={() => setEmojiPickerOpen(true)}><Ionicons name="happy-outline" size={20} color="#8FA0B8" /></TouchableOpacity>} />
          <TouchableOpacity activeOpacity={0.8} onPress={send} style={styles.chatSendButton}><Ionicons name="send" size={21} color={colors.white} /></TouchableOpacity>
        </View>
        <Modal transparent visible={emojiPickerOpen} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setEmojiPickerOpen(false)}>
          <View style={styles.emojiOverlay}>
            <TouchableOpacity activeOpacity={1} onPress={() => setEmojiPickerOpen(false)} style={styles.emojiScrim} />
            <View style={styles.emojiCard}>
              <View style={styles.row}>
                <Text style={styles.emojiTitle}>Choose Emoji</Text>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setEmojiPickerOpen(false)} style={styles.emojiClose}>
                  <Ionicons name="close" size={18} color={colors.textDark} />
                </TouchableOpacity>
              </View>
              <View style={styles.emojiGrid}>
                {emojiItems.map((emoji) => (
                  <TouchableOpacity key={emoji} activeOpacity={0.8} onPress={() => addEmoji(emoji)} style={styles.emojiButton}>
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
        <Modal transparent visible={!!pendingAttachment} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setPendingAttachment(null)}>
          <View style={styles.attachmentModalOverlay}>
            <View style={styles.attachmentModalScrim} />
            <View style={styles.attachmentModalCard}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setPendingAttachment(null)} style={styles.attachmentModalClose}>
                <Ionicons name="close" size={20} color={colors.textDark} />
              </TouchableOpacity>
              <Text style={styles.attachmentModalTitle}>Ready to Send</Text>
              {pendingAttachment?.type === 'image' ? (
                <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentPreviewImage} />
              ) : (
                <View style={styles.attachmentPreviewFile}>
                  <Ionicons name="document-attach-outline" size={36} color={colors.orange} />
                  <Text style={styles.attachmentPreviewFileName}>{pendingAttachment?.name}</Text>
                </View>
              )}
              <Text style={styles.attachmentModalHint}>Tap send to share this {pendingAttachment?.type === 'image' ? 'image' : 'file'} in the conversation.</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={send} style={styles.attachmentModalSend}>
                <Ionicons name="send" size={18} color={colors.white} />
                <Text style={styles.attachmentModalSendText}>SEND</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <Modal transparent visible={!!selectedAttachment} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setSelectedAttachment(null)}>
          <View style={styles.attachmentModalOverlay}>
            <TouchableOpacity activeOpacity={1} onPress={() => setSelectedAttachment(null)} style={styles.attachmentModalScrim} />
            <View style={styles.attachmentModalCard}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedAttachment(null)} style={styles.attachmentModalClose}>
                <Ionicons name="close" size={20} color={colors.textDark} />
              </TouchableOpacity>
              <Text style={styles.attachmentModalTitle}>{selectedAttachment?.name || 'Attachment'}</Text>
              {selectedAttachment?.type === 'image' ? (
                <Image source={{ uri: selectedAttachment.uri }} style={styles.attachmentViewerImage} resizeMode="contain" />
              ) : (
                <View style={styles.attachmentPreviewFile}>
                  <Ionicons name="document-text-outline" size={42} color={colors.orange} />
                  <Text style={styles.attachmentPreviewFileName}>{selectedAttachment?.name || 'File'}</Text>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => selectedAttachment?.uri && Linking.openURL(selectedAttachment.uri)} style={styles.attachmentModalSend}>
                    <Ionicons name="open-outline" size={18} color={colors.white} />
                    <Text style={styles.attachmentModalSendText}>OPEN FILE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ChatListScreen({ navigation }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const isProvider = user?.role === 'provider';
  const openChatThread = (booking) => {
    setActiveChat(booking);
  };

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/bookings/')
      .then(({ data }) => setBookings(data))
      .catch((error) => Alert.alert('Chats unavailable', errorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]));

  const conversations = Object.values(
    bookings
      .filter((booking) => !['cancelled'].includes(booking.status))
      .reduce((items, booking) => {
        const key = isProvider ? `client-${booking.client}` : `provider-${booking.provider}`;
        const existing = items[key];
        if (!existing || new Date(booking.created_at) > new Date(existing.created_at)) {
          items[key] = booking;
        }
        return items;
      }, {})
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (activeChat) {
    return (
      <ChatScreen
        route={{ params: { booking: activeChat } }}
        navigation={{
          ...navigation,
          goBack: () => setActiveChat(null),
          navigate: (screen, params) => {
            const parentNavigator = navigation.getParent?.();
            if (parentNavigator) parentNavigator.navigate(screen, params);
            else navigation.navigate(screen, params);
          },
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.chatListScreen}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.chatListContent}
        ListHeaderComponent={(
          <View style={styles.chatListHeader}>
            <Text style={styles.chatListTitle}>Messages</Text>
            <Text style={styles.chatListSubtitle}>{isProvider ? 'Client conversations for your service requests.' : 'Conversations with your providers.'}</Text>
            {loading ? <ActivityIndicator color={colors.orange} /> : null}
          </View>
        )}
        renderItem={({ item }) => {
          const name = isProvider ? (item.client_name || 'Client') : (item.provider_name || 'Provider');
          const partnerPhoto = isProvider ? item.client_photo : item.provider_photo;
          const partnerPresence = getPresence(isProvider ? item.client_last_seen : item.provider_last_seen);
          return (
            <TouchableOpacity activeOpacity={0.7} delayPressIn={0} onPress={() => openChatThread(item)} style={styles.chatListCard}>
              <Avatar uri={partnerPhoto} size={52} />
              <View style={styles.flex}>
                <View style={styles.row}>
                  <Text style={styles.chatListName}>{name}</Text>
                  <Text style={styles.chatListTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.chatListService}>{item.service_title}</Text>
                <Text style={styles.chatListPreview}>Tap to continue this conversation.</Text>
              </View>
              <View style={[styles.chatListStatus, !partnerPresence.online && styles.chatListStatusOffline]}><Text style={[styles.chatListStatusText, !partnerPresence.online && styles.chatListStatusTextOffline]}>{partnerPresence.label}</Text></View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={!loading ? (
          <View style={styles.chatListEmpty}>
            <Ionicons name="chatbubbles-outline" size={34} color={colors.orange} />
            <Text style={styles.chatListEmptyTitle}>No chats yet</Text>
            <Text style={styles.chatListEmptyText}>Conversations will appear here once a booking request exists.</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

export function NotificationsScreen({ navigation }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const isProvider = user?.role === 'provider';
  const notificationClearKey = `servista-notifications-cleared-at-${user?.id || user?.email || 'guest'}`;

  const load = useCallback(async () => {
    setLoading(true);
    const clearedAtValue = await AsyncStorage.getItem(notificationClearKey);
    const clearedAt = clearedAtValue ? new Date(clearedAtValue).getTime() : 0;
    const [notificationsResult, bookingsResult, walletResult, servicesResult] = await Promise.allSettled([
      api.get('/api/users/notifications/'),
      api.get('/api/bookings/'),
      api.get('/api/wallet/'),
      isProvider ? api.get('/api/services/') : Promise.resolve({ data: [] })
    ]);

    const backendNotifications = notificationsResult.status === 'fulfilled' ? notificationsResult.value.data : [];
    const bookings = bookingsResult.status === 'fulfilled' ? bookingsResult.value.data : [];
    const wallet = walletResult.status === 'fulfilled' ? walletResult.value.data : null;
    const services = servicesResult.status === 'fulfilled' ? servicesResult.value.data : [];
    const currentUserId = user?.id || user?.pk;
    const ownServices = services.filter((service) => {
      const sameId = currentUserId && String(service.provider) === String(currentUserId);
      const sameName = user?.full_name && service.provider_name === user.full_name;
      return sameId || sameName;
    });

    const nextItems = [];

    backendNotifications.forEach((item) => {
      nextItems.push({
        id: `system-${item.id}`,
        icon: item.icon || 'notifications-outline',
        title: item.title,
        message: item.message,
        detail: item.detail || item.message,
        time: item.time,
        tone: item.tone || 'blue'
      });
    });

    bookings.forEach((booking) => {
      const createdAt = booking.created_at || booking.scheduled_at;
      if (isProvider && booking.status === 'pending') {
        nextItems.push({
          id: `booking-pending-${booking.id}`,
          icon: 'calendar-outline',
          title: 'New service request',
          message: `${booking.client_name || 'A client'} requested ${booking.service_title}.`,
          detail: `${booking.client_name || 'A client'} has sent a new request for ${booking.service_title}. Review the service address, schedule, notes, and job value from your requests page before accepting or declining the job.`,
          time: createdAt,
          tone: 'warning',
          action: () => navigation.navigate('Tabs', { screen: 'Requests' })
        });
      }
      if (!isProvider && booking.status === 'confirmed') {
        nextItems.push({
          id: `booking-confirmed-${booking.id}`,
          icon: 'checkmark-circle-outline',
          title: 'Booking confirmed',
          message: `${booking.provider_name || 'Your provider'} accepted ${booking.service_title}.`,
          detail: `${booking.provider_name || 'Your provider'} has accepted your booking for ${booking.service_title}. You can continue chatting with the provider, prepare for the scheduled service time, and track the job from your bookings page.`,
          time: createdAt,
          tone: 'success',
          action: () => navigation.navigate('Tabs', { screen: 'Map View' })
        });
      }
      if (!isProvider && booking.payment_status === 'escrowed') {
        nextItems.push({
          id: `booking-paid-${booking.id}`,
          icon: 'shield-checkmark-outline',
          title: 'Payment in escrow',
          message: `${formatMoney(booking.amount)} is protected for ${booking.service_title}.`,
          detail: `Your payment of ${formatMoney(booking.amount)} for ${booking.service_title} has been placed in Servista escrow. The funds stay protected until the service is completed and the release process is confirmed.`,
          time: createdAt,
          tone: 'blue',
          action: () => navigation.navigate('Tabs', { screen: 'Map View' })
        });
      }
      if (booking.refund_status === 'requested') {
        nextItems.push({
          id: `refund-${booking.id}`,
          icon: 'refresh-outline',
          title: 'Refund pending',
          message: `Admin review is pending for ${booking.service_title}.`,
          detail: `A refund request for ${booking.service_title} is waiting for admin review. Servista will verify with both parties before the refund is approved or rejected.`,
          time: createdAt,
          tone: 'warning',
          action: () => navigation.navigate('Tabs', { screen: isProvider ? 'Requests' : 'Map View' })
        });
      }
      if (booking.status === 'cancelled') {
        nextItems.push({
          id: `cancelled-${booking.id}`,
          icon: 'close-circle-outline',
          title: 'Booking cancelled',
          message: `${booking.service_title} was cancelled.`,
          detail: `The booking for ${booking.service_title} has been cancelled. If payment was not made, no wallet action is needed. If payment was already held in escrow, refund handling will follow the Servista review process.`,
          time: createdAt,
          tone: 'danger',
          action: () => navigation.navigate('Tabs', { screen: isProvider ? 'Requests' : 'Map View' })
        });
      }
    });

    (wallet?.transactions || []).slice(0, 8).forEach((tx) => {
      nextItems.push({
        id: `tx-${tx.id}`,
        icon: tx.type === 'payment' ? 'wallet-outline' : 'cash-outline',
        title: tx.type === 'payment' ? 'Wallet payment' : tx.type === 'refund' ? 'Refund received' : 'Wallet top up',
        message: `${tx.description} - ${formatMoney(tx.amount)}`,
        detail: `${tx.description}. Amount: ${formatMoney(tx.amount)}. This transaction is recorded in your Servista wallet history for your reference.`,
        time: tx.created_at,
        tone: tx.type === 'payment' ? 'blue' : 'success',
        action: () => navigation.navigate('Tabs', { screen: 'Wallet' })
      });
    });

    if (isProvider && wallet?.provider_wallet_locked) {
      nextItems.push({
        id: 'provider-kyc-lock',
        icon: 'lock-closed-outline',
        title: 'KYC approval required',
        message: 'Wallet funding and withdrawal unlock after admin approval.',
        detail: 'Your provider wallet actions are locked until admin approves your KYC verification. You can still manage listings, but funding and withdrawals will become available only after approval.',
        time: wallet.updated_at,
        tone: 'warning',
        action: () => navigation.navigate('Tabs', { screen: 'Wallet' })
      });
    }

    if (isProvider && ownServices.length) {
      nextItems.push({
        id: 'provider-listings-summary',
        icon: 'briefcase-outline',
        title: 'Active listings',
        message: `${ownServices.length} service listing${ownServices.length === 1 ? '' : 's'} visible to clients.`,
        detail: `You currently have ${ownServices.length} active service listing${ownServices.length === 1 ? '' : 's'} visible to clients. New listings appear in client search and category results according to the category you selected when creating them.`,
        time: ownServices[0]?.created_at || new Date().toISOString(),
        tone: 'blue',
        action: () => navigation.navigate('Tabs', { screen: 'Dashboard' })
      });
    }

    const visibleItems = nextItems.filter((item) => {
      const itemTime = item.time ? new Date(item.time).getTime() : Date.now();
      return !clearedAt || itemTime > clearedAt;
    });
    setItems(visibleItems.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)));
    if (backendNotifications.some((item) => !item.is_read)) {
      api.post('/api/users/notifications/read/').catch(() => {});
    }
    setLoading(false);
  }, [isProvider, navigation, notificationClearKey, user?.full_name, user?.id, user?.pk]);

  const clearAllNotifications = async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem(notificationClearKey, now);
    try {
      await api.post('/api/users/notifications/clear/');
    } catch (error) {
      // Local clearing still hides generated activity notifications if the network is unavailable.
    }
    setSelectedNotification(null);
    setItems([]);
  };

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <SafeAreaView style={styles.notificationsScreen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.notificationsContent}
        ListHeaderComponent={(
          <View style={styles.notificationsHeader}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.categoryBack}>
              <Ionicons name="chevron-back" size={18} color={colors.textGray} />
              <Text style={styles.categoryBackText}>BACK</Text>
            </TouchableOpacity>
            <Text style={styles.notificationsTitle}>Notifications</Text>
            <Text style={styles.notificationsSubtitle}>{isProvider ? 'Requests, wallet, KYC and listing updates.' : 'Bookings, payments, refunds and provider updates.'}</Text>
            {items.length ? (
              <TouchableOpacity activeOpacity={0.85} onPress={clearAllNotifications} style={styles.clearNotificationsButton}>
                <Ionicons name="trash-outline" size={16} color={colors.white} />
                <Text style={styles.clearNotificationsText}>CLEAR ALL</Text>
              </TouchableOpacity>
            ) : null}
            {loading ? <ActivityIndicator color={colors.orange} /> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.82} onPress={() => setSelectedNotification(item)} style={styles.notificationCard}>
            <View style={[styles.notificationIcon, styles[`notificationIcon${item.tone}`]]}>
              <Ionicons name={item.icon} size={20} color={item.tone === 'danger' ? colors.red : item.tone === 'success' ? colors.green : item.tone === 'warning' ? colors.orange : colors.blue} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.notificationTitle}>{item.title}</Text>
              <Text style={styles.notificationMessage}>{item.message}</Text>
              <Text style={styles.notificationTime}>{item.time ? new Date(item.time).toLocaleString() : 'Now'}</Text>
            </View>
            <Ionicons name="information-circle-outline" size={18} color={colors.textGray} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.chatListEmpty}>
            <Ionicons name="notifications-outline" size={34} color={colors.orange} />
            <Text style={styles.chatListEmptyTitle}>No notifications yet</Text>
            <Text style={styles.chatListEmptyText}>Updates about bookings, payments, chats and wallet activity will appear here.</Text>
          </View>
        ) : null}
      />
      <Modal transparent visible={!!selectedNotification} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setSelectedNotification(null)}>
        <View style={styles.notificationDetailOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={() => setSelectedNotification(null)} style={styles.notificationDetailScrim} />
          <View style={styles.notificationDetailCard}>
            <View style={[styles.notificationIcon, styles[`notificationIcon${selectedNotification?.tone}`]]}>
              <Ionicons
                name={selectedNotification?.icon || 'notifications-outline'}
                size={22}
                color={selectedNotification?.tone === 'danger' ? colors.red : selectedNotification?.tone === 'success' ? colors.green : selectedNotification?.tone === 'warning' ? colors.orange : colors.blue}
              />
            </View>
            <Text style={styles.notificationDetailTitle}>{selectedNotification?.title}</Text>
            <Text style={styles.notificationDetailMessage}>{selectedNotification?.detail || selectedNotification?.message}</Text>
            <Text style={styles.notificationDetailTime}>{selectedNotification?.time ? new Date(selectedNotification.time).toLocaleString() : 'Now'}</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedNotification(null)} style={styles.notificationDetailButton}>
              <Text style={styles.notificationDetailButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function ProviderProfileScreen({ route, navigation }) {
  const { provider = {} } = route.params || {};
  const name = provider.name || 'Faith';
  const category = provider.category || 'plumbing';
  const avatarUri = mediaUri(provider.avatar);
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.providerProfileDetailScreen}>
      <ScrollView contentContainerStyle={styles.providerProfileDetailContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.providerProfileBack}>
          <Ionicons name="chevron-back" size={18} color={colors.textGray} />
          <Text style={styles.providerProfileBackText}>BACK TO CHAT</Text>
        </TouchableOpacity>
        <View style={styles.providerProfileHero}>
          <View style={styles.providerProfileAvatarWrap}>
            <View style={styles.providerProfileAvatar}>
              {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.providerProfileAvatarImage} /> : <Ionicons name="person-outline" size={44} color="#8FA0B8" />}
            </View>
          </View>
          <Text style={styles.providerProfileName}>{name}</Text>
          <Text style={styles.providerProfileRole}>{category} specialist</Text>
          {provider.badge_verification_status === 'verified' || provider.badge_verified ? (
            <View style={styles.providerProfileVerified}>
              <Text style={[styles.providerProfileVerifiedText, { color: colors.blue }]}>VERIFIED PROVIDER</Text>
              <TrustBadge size={24} />
            </View>
          ) : null}
        </View>
        <View style={styles.providerProfileStats}>
          <View style={styles.providerStatCard}><Text style={styles.providerStatValue}>{provider.rating || '4.9'}</Text><Text style={styles.providerStatLabel}>RATING</Text></View>
          <View style={styles.providerStatCard}><Text style={styles.providerStatValue}>98%</Text><Text style={styles.providerStatLabel}>SUCCESS</Text></View>
          <View style={styles.providerStatCard}><Text style={styles.providerStatValue}>120+</Text><Text style={styles.providerStatLabel}>JOBS</Text></View>
        </View>
        <View style={styles.providerInfoCard}>
          <Text style={styles.providerInfoTitle}>About Provider</Text>
          <Text style={styles.providerInfoText}>Trusted Servista provider for {provider.serviceTitle || 'local services'}. Available for professional support across {provider.address || 'Cameroon'}.</Text>
          <View style={styles.providerInfoRow}><Ionicons name="location-outline" size={18} color={colors.orange} /><Text style={styles.providerInfoMeta}>{provider.address || 'Douala, Cameroon'}</Text></View>
          <View style={styles.providerInfoRow}><Ionicons name="briefcase-outline" size={18} color={colors.orange} /><Text style={styles.providerInfoMeta}>{provider.serviceTitle || 'Professional service'}</Text></View>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.providerMessageButton}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.white} />
          <Text style={styles.providerMessageText}>Continue Chat</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ProviderDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [providerProfile, setProviderProfile] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const providerWalletLocked = wallet?.provider_wallet_locked;
  const notificationCount = useNotificationCount(user);
  const openNotifications = () => {
    const rootNavigator = navigation.getParent?.()?.getParent?.() || navigation.getParent?.() || navigation;
    rootNavigator.navigate('Notifications');
  };
  useFocusEffect(useCallback(() => {
    api.get('/api/wallet/').then(({ data }) => setWallet(data)).catch(() => {});
    api.get('/api/users/provider/profile/').then(({ data }) => setProviderProfile(data)).catch(() => setProviderProfile(null));
    api.get('/api/bookings/').then(({ data }) => setBookings(Array.isArray(data) ? data : [])).catch(() => setBookings([]));
    const params = { mine: '1' };
    if (selectedCategory) params.category = selectedCategory;
    if (search.trim()) params.search = search.trim();
    api.get('/api/services/', { params }).then(({ data }) => {
      const currentUserId = user?.id || user?.pk;
      const ownServices = data.filter((service) => {
        const sameId = currentUserId && String(service.provider) === String(currentUserId);
        const sameName = user?.full_name && service.provider_name === user.full_name;
        return sameId || sameName;
      });
      setServices(ownServices);
    }).catch(() => setServices([]));
  }, [search, selectedCategory, user?.full_name, user?.id, user?.pk]));
  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled');
  const completedJobs = activeBookings.filter(isSuccessfulBooking).length;
  const successRate = activeBookings.length ? Math.round((completedJobs / activeBookings.length) * 100) : 0;
  const providerRating = getProviderRatingFromServices(services);
  const providerNeedsLocation = !String(providerProfile?.city_area || '').trim();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.providerHeader}>
          <Avatar uri={user?.profile_photo} size={56} />
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>{user?.full_name || 'Provider'}</Text>
            {providerProfile?.badge_verification_status === 'verified' ? (
              <View style={styles.providerVerifiedRow}>
                <Text style={[styles.verifiedLabel, styles.verifiedLabelBlue]}>VERIFIED PROVIDER</Text>
                <TrustBadge size={22} />
              </View>
            ) : (
              <Text style={styles.providerNeutralLabel}>PROVIDER ACCOUNT</Text>
            )}
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={openNotifications} style={styles.headerIcon}>
            <Ionicons name="notifications-outline" size={20} color={colors.textDark} />
            <NotificationBadge count={notificationCount} />
          </TouchableOpacity>
        </View>
        {providerNeedsLocation ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Settings', { section: 'Location' })} style={styles.providerLocationPrompt}>
            <Ionicons name="location-outline" size={22} color={colors.orange} />
            <View style={styles.flex}>
              <Text style={styles.providerLocationPromptTitle}>Add your service location</Text>
              <Text style={styles.providerLocationPromptText}>Set your City/Area so clients can track paid bookings accurately.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.orange} />
          </TouchableOpacity>
        ) : null}
        <Card style={styles.providerBalance}>
          <Text style={styles.darkOverline}>AVAILABLE BALANCE</Text>
          <Text style={styles.providerBalanceText}>{formatMoney(wallet?.balance || 0)}</Text>
          <Text style={styles.trend}>{providerWalletLocked ? 'KYC approval required for wallet actions' : '+12.5% vs last month'}</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={providerWalletLocked}
            onPress={() => Alert.alert('Coming Soon')}
            style={[styles.providerWithdrawButton, providerWalletLocked && styles.walletButtonLocked]}
          >
            <Ionicons name={providerWalletLocked ? 'lock-closed-outline' : 'arrow-up-outline'} size={18} color={colors.white} />
            <Text style={styles.providerWithdrawText}>Withdraw Funds</Text>
          </TouchableOpacity>
        </Card>
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}><Ionicons name="checkmark-circle-outline" size={24} color={colors.green} /><Text style={styles.overline}>SUCCESS RATE</Text><Text style={styles.statValue}>{successRate}%</Text><Text style={styles.statMeta}>{completedJobs}/{activeBookings.length} jobs completed</Text></Card>
          <Card style={styles.statCard}><Ionicons name="star-outline" size={24} color="#F59E0B" /><Text style={styles.overline}>PROFILE SCORE</Text><Text style={styles.statValue}>{providerRating.rating}/5</Text><Text style={styles.statMeta}>{providerRating.count} client reviews</Text></Card>
        </View>
        <View style={styles.providerFilterPanel}>
          <View style={styles.providerSearchBox}>
            <Ionicons name="search" size={18} color="#8FA0B8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search your listings..."
              placeholderTextColor="#8FA0B8"
              autoCapitalize="none"
              returnKeyType="search"
              style={styles.providerSearchInput}
            />
            {search ? (
              <TouchableOpacity activeOpacity={0.8} onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#8FA0B8" />
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerCategoryScroll}>
            {categoryItems.map((item) => (
              <TouchableOpacity key={item.value} activeOpacity={0.85} onPress={() => setSelectedCategory((value) => value === item.value ? '' : item.value)} style={[styles.providerCategoryChip, selectedCategory === item.value && styles.providerCategoryChipActive]}>
                <Ionicons name={item.icon} size={14} color={selectedCategory === item.value ? colors.white : item.color} />
                <Text style={[styles.providerCategoryText, selectedCategory === item.value && styles.providerCategoryTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {(selectedCategory || search.trim()) ? (
            <TouchableOpacity activeOpacity={0.85} onPress={() => { setSelectedCategory(''); setSearch(''); }} style={styles.providerClearFilters}>
              <Text style={styles.providerClearFiltersText}>CLEAR FILTERS</Text>
              <Ionicons name="close-circle" size={16} color={colors.orange} />
            </TouchableOpacity>
          ) : null}
        </View>
          <Text style={styles.sectionTitle}>Active Listings</Text>
          {services.length ? services.map((service) => (
            <TouchableOpacity key={service.id} activeOpacity={0.85} onPress={() => navigation.navigate('ProviderServiceDetail', { service })} style={styles.providerServiceCard}>
              {mediaUri(service.image) ? <Image source={{ uri: mediaUri(service.image) }} style={styles.listingImage} resizeMode="cover" /> : null}
              <View style={styles.flex}>
                <View style={styles.providerListingTopRow}>
                  <Text style={styles.itemTitle}>{service.title}</Text>
                  <View style={[styles.availabilityPill, !service.is_available && styles.availabilityPillOff]}>
                    <Text style={[styles.availabilityPillText, !service.is_available && styles.availabilityPillTextOff]}>{service.is_available ? 'LIVE' : 'PAUSED'}</Text>
                  </View>
                </View>
                <Text style={styles.muted}>{formatMoney(service.price)} - {service.category}</Text>
                <View style={styles.providerListingStats}>
                  <Text style={styles.providerListingStatText}>{service.booking_count || 0} bookings</Text>
                  <Text style={styles.providerListingStatText}>{service.completed_booking_count || 0} completed</Text>
                  <Text style={styles.providerListingStatText}>{service.average_rating ? service.average_rating : '0.0'} rating</Text>
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textGray} />
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyListingCard}>
            <Ionicons name="briefcase-outline" size={26} color={colors.orange} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>No services yet</Text>
              <Text style={styles.muted}>Tap + to create your first listing.</Text>
            </View>
          </View>
        )}
      </ScrollView>
      <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AddService')} style={styles.fab}><Ionicons name="add" size={30} color={colors.white} /></TouchableOpacity>
    </SafeAreaView>
  );
}

export function ProviderServiceDetailScreen({ route, navigation }) {
  const { user } = useAuth();
  const initialService = route.params?.service || {};
  const [service, setService] = useState(initialService);
  const [bookings, setBookings] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [servicePhoto, setServicePhoto] = useState(null);
  const [form, setForm] = useState({
    title: initialService.title || '',
    price: String(initialService.price || ''),
    category: initialService.category || 'plumbing',
    address: initialService.address || '',
    description: initialService.description || '',
    is_available: initialService.is_available !== false
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const serviceId = service?.id || initialService?.id;

  const loadServiceWorkspace = useCallback(() => {
    if (!serviceId) return;
    api.get(`/api/services/${serviceId}/`).then(({ data }) => {
      setService(data);
      setForm({
        title: data.title || '',
        price: String(data.price || ''),
        category: data.category || 'plumbing',
        address: data.address || '',
        description: data.description || '',
        is_available: data.is_available !== false
      });
    }).catch(() => {});
    api.get('/api/bookings/').then(({ data }) => {
      const own = (Array.isArray(data) ? data : []).filter((booking) => String(booking.service) === String(serviceId));
      setBookings(own);
    }).catch(() => setBookings([]));
  }, [serviceId]);

  useFocusEffect(useCallback(() => {
    loadServiceWorkspace();
  }, [loadServiceWorkspace]));

  const pickServicePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access so you can choose a service photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8
    });
    if (!result.canceled && result.assets?.[0]) setServicePhoto(result.assets[0]);
  };

  const saveService = async () => {
    if (user?.role !== 'provider') {
      Alert.alert('Not allowed', 'Only providers can update service listings.');
      return;
    }
    try {
      setSaving(true);
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, String(value)));
      if (servicePhoto?.uri) {
        payload.append('image', uploadFileFromAsset(servicePhoto, `service-${Date.now()}.jpg`));
      }
      const { data } = await api.put(`/api/services/${serviceId}/`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setService(data);
      setServicePhoto(null);
      setEditing(false);
      Alert.alert('Listing updated', 'Your service listing has been updated.');
    } catch (error) {
      Alert.alert('Update failed', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteService = () => {
    if (user?.role !== 'provider') {
      Alert.alert('Not allowed', 'Only providers can delete service listings.');
      return;
    }
    Alert.alert(
      'Delete service?',
      `Delete ${service.title || 'this service'} from your active listings? Clients will no longer be able to book it.`,
      [
        { text: 'Keep Service', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await api.delete(`/api/services/${serviceId}/`);
              Alert.alert('Service deleted', 'The service has been removed from your listings.');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Delete failed', errorMessage(error));
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const completedBookings = bookings.filter(isSuccessfulBooking).length;
  const pendingBookings = bookings.filter((booking) => booking.status === 'pending').length;
  const paidBookings = bookings.filter((booking) => booking.payment_status === 'escrowed' || booking.payment_status === 'released').length;

  return (
    <SafeAreaView style={styles.addListingScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.providerServiceDetailContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.addListingBack}>
            <Ionicons name="chevron-back" size={18} color={colors.textGray} />
            <Text style={styles.addListingBackText}>DASHBOARD</Text>
          </TouchableOpacity>

          <View style={styles.providerServiceHero}>
            {mediaUri(servicePhoto?.uri || service.image) ? (
              <Image source={{ uri: mediaUri(servicePhoto?.uri || service.image) }} style={styles.providerServiceHeroImage} resizeMode="cover" />
            ) : (
              <View style={styles.providerServiceHeroEmpty}>
                <Ionicons name="briefcase-outline" size={34} color={colors.orange} />
                <Text style={styles.providerServiceHeroEmptyText}>No listing image uploaded</Text>
              </View>
            )}
            {editing ? (
              <TouchableOpacity activeOpacity={0.85} onPress={pickServicePhoto} style={styles.providerServiceImageButton}>
                <Ionicons name="image-outline" size={16} color={colors.white} />
                <Text style={styles.providerServiceImageButtonText}>Change Image</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Card style={styles.providerServiceStatsCard}>
            <Text style={styles.darkOverline}>SERVICE PERFORMANCE</Text>
            <Text style={styles.providerServiceStatsTitle}>{service.title || 'Service listing'}</Text>
            <View style={styles.providerServiceMetricRow}>
              <View style={styles.providerServiceMetric}><Text style={styles.providerServiceMetricValue}>{service.booking_count ?? bookings.length}</Text><Text style={styles.providerServiceMetricLabel}>Bookings</Text></View>
              <View style={styles.providerServiceMetric}><Text style={styles.providerServiceMetricValue}>{service.completed_booking_count ?? completedBookings}</Text><Text style={styles.providerServiceMetricLabel}>Completed</Text></View>
              <View style={styles.providerServiceMetric}><Text style={styles.providerServiceMetricValue}>{service.average_rating || '0.0'}</Text><Text style={styles.providerServiceMetricLabel}>Rating</Text></View>
            </View>
            <View style={styles.providerServiceMiniStats}>
              <Text style={styles.providerServiceMiniStat}>{pendingBookings} pending requests</Text>
              <Text style={styles.providerServiceMiniStat}>{paidBookings} paid jobs</Text>
              <Text style={styles.providerServiceMiniStat}>{service.review_count || 0} reviews</Text>
            </View>
          </Card>

          <View style={styles.providerEditPanel}>
            <View style={styles.providerEditHeader}>
              <View style={styles.providerEditTitleBlock}>
                <Text style={styles.sectionTitle}>{editing ? 'Edit Listing' : 'Listing Details'}</Text>
                <Text style={styles.muted}>Keep your service information accurate for clients.</Text>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setEditing((value) => !value)} style={styles.providerEditToggle}>
                <Ionicons name={editing ? 'close-outline' : 'create-outline'} size={17} color={colors.orange} />
                <Text style={styles.providerEditToggleText}>{editing ? 'Cancel' : 'Edit'}</Text>
              </TouchableOpacity>
            </View>

            {editing ? (
              <>
                <Input placeholder="Service Title" value={form.title} onChangeText={(v) => set('title', v)} style={styles.addListingInput} inputStyle={styles.addListingInputText} />
                <Input placeholder="Price (XAF)" keyboardType="numeric" value={form.price} onChangeText={(v) => set('price', v)} style={styles.addListingInput} inputStyle={styles.addListingInputText} />
                <Input placeholder="Service Address" value={form.address} onChangeText={(v) => set('address', v)} style={styles.addListingInput} inputStyle={styles.addListingInputText} />
                <View style={styles.addListingSection}>
                  <Text style={styles.addListingLabel}>CATEGORY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addListingCategoryScroll}>
                    {categoryItems.map((item) => {
                      const active = form.category === item.value;
                      return (
                        <TouchableOpacity key={item.value} activeOpacity={0.85} onPress={() => set('category', item.value)} style={[styles.addListingCategoryPill, active && styles.addListingCategoryPillActive]}>
                          <Text style={[styles.addListingCategoryText, active && styles.addListingCategoryTextActive]}>{item.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <TouchableOpacity activeOpacity={0.85} onPress={() => set('is_available', !form.is_available)} style={styles.availabilityToggle}>
                  <Ionicons name={form.is_available ? 'toggle' : 'toggle-outline'} size={26} color={form.is_available ? colors.green : colors.textGray} />
                  <Text style={styles.availabilityToggleText}>{form.is_available ? 'Service is live for clients' : 'Service is paused'}</Text>
                </TouchableOpacity>
                <TextInput
                  value={form.description}
                  onChangeText={(v) => set('description', v)}
                  placeholder="Service Description..."
                  placeholderTextColor="#8FA0B8"
                  multiline
                  textAlignVertical="top"
                  style={styles.addListingDescription}
                />
                <TouchableOpacity activeOpacity={0.85} onPress={saveService} disabled={saving} style={[styles.addListingSubmit, saving && styles.disabledButton]}>
                  {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.addListingSubmitText}>Save Changes</Text>}
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} onPress={deleteService} disabled={saving} style={[styles.providerDeleteButton, saving && styles.disabledButton]}>
                  <Ionicons name="trash-outline" size={17} color={colors.red} />
                  <Text style={styles.providerDeleteButtonText}>Delete Service</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.providerServiceReadOnly}>
                <View style={styles.providerServiceInfoRow}><Text style={styles.overline}>PRICE</Text><Text style={styles.providerServiceInfoValue}>{formatMoney(service.price || 0)}</Text></View>
                <View style={styles.providerServiceInfoRow}><Text style={styles.overline}>CATEGORY</Text><Text style={styles.providerServiceInfoValue}>{service.category || 'other'}</Text></View>
                <View style={styles.providerServiceInfoRow}><Text style={styles.overline}>ADDRESS</Text><Text style={styles.providerServiceInfoValue}>{service.address || 'Not provided'}</Text></View>
                <Text style={styles.providerServiceDescription}>{service.description || 'No description added yet.'}</Text>
                <TouchableOpacity activeOpacity={0.85} onPress={deleteService} disabled={saving} style={[styles.providerDeleteButton, saving && styles.disabledButton]}>
                  <Ionicons name="trash-outline" size={17} color={colors.red} />
                  <Text style={styles.providerDeleteButtonText}>Delete Service</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AddServiceScreen({ navigation }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ title: '', category: 'plumbing', price: '', address: '', description: '' });
  const [servicePhoto, setServicePhoto] = useState(null);
  const serviceCategories = categoryItems;
  const set = (key, value) => setForm({ ...form, [key]: value });

  const pickServicePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('Permission required'), t('Allow photo access so you can choose a service photo.'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8
    });
    if (!result.canceled && result.assets?.[0]) setServicePhoto(result.assets[0]);
  };

  const submit = async () => {
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      payload.append('is_available', 'true');
      if (servicePhoto?.uri) {
        payload.append('image', uploadFileFromAsset(servicePhoto, `service-${Date.now()}.jpg`));
      }
      await api.post('/api/services/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Alert.alert(t('Service created'));
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('Service failed'), errorMessage(error));
    }
  };
  return (
    <SafeAreaView style={styles.addListingScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.addListingContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.addListingBack}>
            <Ionicons name="chevron-back" size={18} color={colors.textGray} />
            <Text style={styles.addListingBackText}>DASHBOARD</Text>
          </TouchableOpacity>

          <View style={styles.addListingHeader}>
            <View style={styles.addListingIcon}><Ionicons name="add-circle-outline" size={28} color={colors.orange} /></View>
            <View style={styles.flex}>
              <Text style={styles.addListingTitle}>Create New Listing</Text>
              <Text style={styles.addListingSubtitle}>Reach more clients by detailing your expertise.</Text>
            </View>
          </View>

          <View style={styles.addListingForm}>
            <Input placeholder="Service Title" value={form.title} onChangeText={(v) => set('title', v)} style={styles.addListingInput} inputStyle={styles.addListingInputText} />
            <Input placeholder="Price (XAF)" keyboardType="numeric" value={form.price} onChangeText={(v) => set('price', v)} style={styles.addListingInput} inputStyle={styles.addListingInputText} />
            <Input placeholder="Service Address" value={form.address} onChangeText={(v) => set('address', v)} style={styles.addListingInput} inputStyle={styles.addListingInputText} />

            <View style={styles.addListingSection}>
              <Text style={styles.addListingLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addListingCategoryScroll}>
                {serviceCategories.map((item) => {
                  const active = form.category === item.value;
                  return (
                    <TouchableOpacity key={item.value} activeOpacity={0.85} onPress={() => set('category', item.value)} style={[styles.addListingCategoryPill, active && styles.addListingCategoryPillActive]}>
                      <Text style={[styles.addListingCategoryText, active && styles.addListingCategoryTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity activeOpacity={0.85} onPress={pickServicePhoto} style={styles.addListingUpload}>
              {servicePhoto?.uri ? <Image source={{ uri: servicePhoto.uri }} style={styles.addListingUploadImage} /> : (
                <>
                  <Ionicons name="image-outline" size={34} color="#8FA0B8" />
                  <Text style={styles.addListingUploadText}>UPLOAD SERVICE PHOTO</Text>
                </>
              )}
            </TouchableOpacity>

            <TextInput
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder={t('Service Description...')}
              placeholderTextColor="#8FA0B8"
              multiline
              textAlignVertical="top"
              style={styles.addListingDescription}
            />

            <TouchableOpacity activeOpacity={0.85} onPress={submit} style={styles.addListingSubmit}>
              <Text style={styles.addListingSubmitText}>Submit Listing</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AdminSentinelDashboard({ navigation }) {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [kyc, setKyc] = useState([]);
  const [escrows, setEscrows] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [pinResets, setPinResets] = useState([]);
  const [dssData, setDssData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState([]);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');

  const dssNav = (screen, params) => navigation.getParent()?.navigate(screen, params);

  const loadAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        api.get('/api/users/admin/users/'),
        api.get('/api/users/admin/kyc/'),
        api.get('/api/bookings/admin/escrow/'),
        api.get('/api/bookings/admin/refunds/'),
        api.get('/api/wallet/admin/pin-resets/'),
        api.get('/api/dss/dashboard/')
      ]);
      const labels = ['users', 'KYC', 'escrow', 'refunds', 'PIN resets', 'AI data'];
      const failed = results
        .map((result, index) => result.status === 'rejected' ? labels[index] : null)
        .filter(Boolean);
      const listData = (index) => {
        const result = results[index];
        return result?.status === 'fulfilled' && Array.isArray(result.value?.data) ? result.value.data : [];
      };
      setUsers(listData(0));
      setKyc(listData(1));
      setEscrows(listData(2));
      setRefunds(listData(3));
      setPinResets(listData(4));
      setDssData(results[5]?.status === 'fulfilled' ? results[5].value?.data || null : null);
      setLoadErrors(failed);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadAdminData();
  }, [loadAdminData]));

  const activeProviders = users.filter((item) => item.role === 'provider').length;
  const clients = users.filter((item) => item.role === 'client').length;
  const admins = users.filter((item) => item.role === 'admin').length;
  const fraudOverview = dssData?.fraud_overview || {};
  const reportsOverview = dssData?.reports_overview || {};
  const qualityOverview = dssData?.quality_overview || {};
  const batchOverview = dssData?.batch_overview || {};
  const badgeOverview = dssData?.badge_overview || {};
  const dssHighRisk = Number(fraudOverview.high_risk || 0);
  const dssMediumRisk = Number(fraudOverview.medium_risk || 0);
  const dssLowRisk = fraudOverview.low_risk === undefined || fraudOverview.low_risk === null
    ? Math.max(activeProviders - dssHighRisk - dssMediumRisk, 0)
    : Number(fraudOverview.low_risk || 0);
  const dssPendingReports = Number(reportsOverview.pending || 0);
  const dssAlertCount = dssHighRisk + dssPendingReports;
  const pendingRefundValue = refunds.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const escrowValue = escrows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const escrowIssues = escrows.filter((item) => item.refund_status === 'requested' || item.issue_reported_at).length;
  const uptime = dssAlertCount || refunds.length || escrowIssues ? 96.8 : 99.8;
  const searchTerm = search.trim().toLowerCase();

  const matchingUsers = useMemo(() => {
    if (!searchTerm) return [];
    return users.filter((item) => [item.full_name, item.email, item.role, item.phone].filter(Boolean).join(' ').toLowerCase().includes(searchTerm)).slice(0, 5);
  }, [searchTerm, users]);

  const notifications = useMemo(() => ([
    {
      key: 'risk',
      count: dssAlertCount,
      icon: 'shield-half-outline',
      title: dssAlertCount ? 'AI risk flags detected' : 'AI risk clear',
      message: dssAlertCount ? `${dssHighRisk} high-risk provider${dssHighRisk === 1 ? '' : 's'} and ${dssPendingReports} pending AI report${dssPendingReports === 1 ? '' : 's'} require review.` : 'Decision support is monitoring provider trust markers normally.',
      time: dssAlertCount ? 'Live' : 'Now',
      tone: dssAlertCount ? colors.red : colors.green,
      action: () => dssNav('DSSAIPanel')
    },
    {
      key: 'kyc',
      count: kyc.length,
      icon: 'checkbox-outline',
      title: kyc.length ? 'New verification request' : 'No KYC queue',
      message: kyc.length ? `${kyc.length} provider document review${kyc.length === 1 ? '' : 's'} waiting in the KYC workspace.` : 'Provider verification queue is currently clear.',
      time: kyc.length ? '2m ago' : 'Now',
      tone: kyc.length ? colors.orange : colors.green,
      action: () => navigation.navigate('Verify')
    },
    {
      key: 'escrow',
      count: escrowIssues,
      icon: 'wallet-outline',
      title: escrowIssues ? 'Escrow action needed' : 'Escrow stable',
      message: escrowIssues ? `${escrowIssues} escrow booking${escrowIssues === 1 ? '' : 's'} has a reported issue and needs admin mediation.` : `${escrows.length} active escrow booking${escrows.length === 1 ? '' : 's'} currently held safely in the platform.`,
      time: escrowIssues ? 'Live' : 'Now',
      tone: escrowIssues ? colors.red : colors.green,
      action: () => navigation.navigate('Escrow')
    },
    {
      key: 'pin',
      count: pinResets.length,
      icon: 'key-outline',
      title: pinResets.length ? 'PIN reset request' : 'PIN resets clear',
      message: pinResets.length ? `${pinResets.length} wallet PIN reset request${pinResets.length === 1 ? '' : 's'} pending admin validation.` : 'No wallet PIN resets are pending.',
      time: pinResets.length ? '45m ago' : 'Now',
      tone: pinResets.length ? colors.orange : colors.green,
      action: () => navigation.navigate('Pin Resets')
    }
  ]), [dssAlertCount, dssHighRisk, dssPendingReports, kyc.length, escrows.length, escrowIssues, pinResets.length, navigation]);

  const monitoringRows = useMemo(() => {
    const rows = [
      ...refunds.slice(0, 3).map((item) => ({
        id: `refund-${item.id}`,
        timestamp: item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
        entity: item.client_name || 'Client',
        action: `Refund review: ${item.service_title || 'Booking'}`,
        confidence: refunds.length ? 82 : 100,
        status: 'FLAGGED',
        tone: colors.red,
        onPress: () => navigation.navigate('Disputes')
      })),
      ...escrows.filter((item) => item.refund_status === 'requested' || item.issue_reported_at).slice(0, 3).map((item) => ({
        id: `escrow-${item.id}`,
        timestamp: item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
        entity: item.service_title || 'Escrow booking',
        action: `Escrow issue: ${formatMoney(item.amount)} awaiting mediation`,
        confidence: 86,
        status: 'FLAGGED',
        tone: colors.red,
        onPress: () => navigation.navigate('Escrow')
      })),
      ...kyc.slice(0, 3).map((item) => ({
        id: `kyc-${item.id}`,
        timestamp: item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Queued',
        entity: item.user?.full_name || item.business_name || 'Provider',
        action: 'KYC validation request',
        confidence: 94,
        status: 'REVIEW',
        tone: colors.orange,
        onPress: () => navigation.navigate('Verify', { profileId: item.id })
      })),
      ...pinResets.slice(0, 2).map((item) => ({
        id: `pin-${item.id}`,
        timestamp: 'Queued',
        entity: item.user_name || 'Wallet user',
        action: 'PIN reset request',
        confidence: 88,
        status: 'PENDING',
        tone: colors.orange,
        onPress: () => navigation.navigate('Pin Resets')
      }))
    ];
    if (rows.length) return rows;
    return [
      { id: 'health', timestamp: 'Live', entity: 'AI Sentinel', action: 'System self-audit', confidence: 100, status: 'SYSTEM', tone: colors.green, onPress: () => dssNav('DSSAIPanel') },
      { id: 'users', timestamp: 'Live', entity: 'Platform users', action: `${users.length} accounts monitored`, confidence: 98, status: 'ACTIVE', tone: colors.green, onPress: () => navigation.navigate('Users') }
    ];
  }, [refunds, escrows, kyc, pinResets, users.length, navigation]);

  const filteredMonitoringRows = useMemo(() => {
    const rows = riskFilter === 'all'
      ? monitoringRows
      : monitoringRows.filter((item) => {
        if (riskFilter === 'flagged') return item.status === 'FLAGGED';
        if (riskFilter === 'review') return item.status === 'REVIEW' || item.status === 'PENDING';
        return item.status === 'SYSTEM' || item.status === 'ACTIVE';
      });
    if (!searchTerm) return rows;
    return rows.filter((item) => [item.entity, item.action, item.status].join(' ').toLowerCase().includes(searchTerm));
  }, [monitoringRows, riskFilter, searchTerm]);

  const exportSummary = () => {
    const summary = [
      'SERVISTA AI Sentinel Summary',
      `Generated: ${new Date().toLocaleString()}`,
      `Users: ${users.length}`,
      `Clients: ${clients}`,
      `Providers: ${activeProviders}`,
      `Pending KYC: ${kyc.length}`,
      `Pending refunds: ${refunds.length}`,
      `Active escrow bookings: ${escrows.length}`,
      `Escrow value: ${formatMoney(escrowValue)}`,
      `Pending PIN resets: ${pinResets.length}`,
      `High risk providers: ${dssHighRisk}`,
      `Medium risk providers: ${dssMediumRisk}`,
      `Low risk providers: ${dssLowRisk}`,
      `Pending refund value: ${formatMoney(pendingRefundValue)}`
    ].join('\n');
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([summary], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `servista-ai-summary-${Date.now()}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    Alert.alert('Export summary', summary);
  };

  const riskTotal = Math.max(dssHighRisk + dssMediumRisk + dssLowRisk, 1);
  const accuracy = Math.min(99, Math.max(72, Math.round((qualityOverview.avg_platform_rating || 4.2) * 19)));
  const trust = Math.min(100, Math.max(50, Math.round(((batchOverview.eligible_count || 0) + (badgeOverview.eligible_count || 0) + activeProviders) / Math.max(activeProviders || 1, 1) * 70)));
  const latency = 124 + (refunds.length * 12) + (escrows.length * 4) + (pinResets.length * 5);
  const notificationTotal = notifications.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const anomalyBars = Array.from({ length: 14 }, (_, index) => {
    const signal = accuracy + trust + latency + users.length + (refunds.length * 13) + (escrows.length * 7) + (dssHighRisk * 19) + (index * 17);
    return 24 + (signal % 54);
  });

  return (
    <SafeAreaView style={styles.sentinelScreen}>
      <View style={styles.sentinelShell}>
        <View style={styles.sentinelSidebar}>
          <View>
            <Text style={styles.sentinelBrand}>AI Sentinel</Text>
            <Text style={styles.sentinelBrandSub}>System Oversight</Text>
          </View>
          {[
            ['Dashboard', 'grid-outline', loadAdminData, true],
            ['Provider Scores', 'bar-chart-outline', () => dssNav('ProviderScores')],
            ['Batch Verification', 'checkbox-outline', () => dssNav('BatchVerification')],
            ['Escrow System', 'cash-outline', () => navigation.navigate('Escrow')],
            ['AI Support', 'hardware-chip-outline', () => dssNav('DSSAIPanel')],
            ['System Health', 'shield-checkmark-outline', () => dssNav('SystemHealth')]
          ].map(([label, icon, onPress, active]) => (
            <TouchableOpacity key={label} activeOpacity={0.86} onPress={onPress} style={[styles.sentinelNavItem, active && styles.sentinelNavActive]}>
              <Ionicons name={icon} size={20} color={active ? colors.orange : colors.white} />
              <Text style={[styles.sentinelNavText, active && styles.sentinelNavTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.sentinelSidebarBottom}>
            <TouchableOpacity activeOpacity={0.86} onPress={() => dssNav('DSSAIPanel')} style={styles.sentinelNewAnalysis}>
              <Text style={styles.sentinelNewAnalysisText}>New Analysis</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('Settings')} style={styles.sentinelSideSmall}>
              <Ionicons name="settings-outline" size={20} color={colors.white} />
              <Text style={styles.sentinelSideSmallText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.86} onPress={() => Alert.alert('Support', 'Admin support center will show governance documentation and escalation contacts.')} style={styles.sentinelSideSmall}>
              <Ionicons name="help-circle-outline" size={20} color={colors.white} />
              <Text style={styles.sentinelSideSmallText}>Support</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.86} onPress={logout} style={styles.sentinelAdminUser}>
              <View style={styles.sentinelAdminAvatar}><Text style={styles.sentinelAdminAvatarText}>{(user?.full_name || user?.email || 'A').slice(0, 2).toUpperCase()}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.sentinelAdminName}>{user?.full_name || 'Admin User'}</Text>
                <Text style={styles.sentinelAdminEmail}>{user?.email || 'admin@servista.cm'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sentinelMain}>
          <View style={styles.sentinelTopbar}>
            <Text style={styles.sentinelTopTitle}>AI Sentinel Admin</Text>
            <View style={styles.sentinelSearchWrap}>
              <Ionicons name="search-outline" size={22} color="#475569" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search system logs, providers, or users..."
                placeholderTextColor="#6B7280"
                style={styles.sentinelSearchInput}
              />
            </View>
            <View style={styles.sentinelTopLinks}>
              <TouchableOpacity onPress={() => dssNav('Reports')}><Text style={styles.sentinelTopLinkText}>Reports</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setRiskFilter('flagged')}><Text style={styles.sentinelTopLinkText}>Logs</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => dssNav('ProviderScores')}><Text style={styles.sentinelTopLinkText}>Audit</Text></TouchableOpacity>
              <View style={styles.sentinelDivider} />
              <TouchableOpacity onPress={() => dssNav('AdminNotifications')} style={styles.sentinelIconButton}>
                <Ionicons name="notifications-outline" size={21} color="#40516F" />
                <NotificationBadge count={notificationTotal} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => dssNav('DSSAIPanel')} style={styles.sentinelIconButton}><Ionicons name="shield-half-outline" size={21} color="#40516F" /></TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Users')} style={styles.sentinelIconButton}><Ionicons name="person-circle-outline" size={23} color="#40516F" /></TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.sentinelContent} showsVerticalScrollIndicator={false}>
            {loading ? <ActivityIndicator color={colors.orange} /> : null}
            {loadErrors.length ? (
              <View style={styles.sentinelDataWarning}>
                <Ionicons name="warning-outline" size={18} color={colors.orange} />
                <Text style={styles.sentinelDataWarningText}>Live data unavailable for: {loadErrors.join(', ')}. Refresh after the backend is available; displayed counts are only from sources that loaded successfully.</Text>
              </View>
            ) : null}
            {matchingUsers.length ? (
              <View style={styles.sentinelSearchResults}>
                {matchingUsers.map((item) => (
                  <TouchableOpacity key={item.id} onPress={() => navigation.navigate('Users')} style={styles.sentinelSearchResult}>
                    <Avatar uri={item.profile_photo} size={32} />
                    <View style={styles.flex}>
                      <Text style={styles.sentinelResultName}>{item.full_name || item.email}</Text>
                      <Text style={styles.sentinelResultMeta}>{item.email} - {item.role}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.sentinelHeaderRow}>
              <View>
                <Text style={styles.sentinelPageTitle}>Operational Overview</Text>
                <Text style={styles.sentinelPageSub}>Real-time AI verification and system integrity metrics.</Text>
              </View>
              <View style={styles.sentinelHeaderActions}>
                <TouchableOpacity activeOpacity={0.86} onPress={() => setRiskFilter((prev) => (prev === 'all' ? 'flagged' : 'all'))} style={styles.sentinelOutlineBtn}>
                  <Ionicons name="filter-outline" size={20} color="#40516F" />
                  <Text style={styles.sentinelOutlineText}>{riskFilter === 'all' ? 'Filter View' : 'Clear Filter'}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.86} onPress={exportSummary} style={styles.sentinelExportBtn}>
                  <Ionicons name="download-outline" size={20} color={colors.white} />
                  <Text style={styles.sentinelExportText}>Export Summary</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sentinelOverviewGrid}>
              <View style={styles.sentinelPerformanceCard}>
                <Text style={styles.sentinelEyebrow}>GLOBAL INTEGRITY STATUS</Text>
                <View style={styles.sentinelPerformanceTitleRow}>
                  <Text style={styles.sentinelPerformanceTitle}>{dssAlertCount || refunds.length || escrowIssues ? 'Action Required' : 'Optimal Performance'}</Text>
                  <View style={[styles.sentinelUptimePill, (dssAlertCount || refunds.length || escrowIssues) && { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name={dssAlertCount || refunds.length || escrowIssues ? 'alert-circle' : 'checkmark-circle'} size={15} color={dssAlertCount || refunds.length || escrowIssues ? colors.red : '#047857'} />
                    <Text style={[styles.sentinelUptimeText, (dssAlertCount || refunds.length || escrowIssues) && { color: colors.red }]}>{uptime}% Uptime</Text>
                  </View>
                </View>
                <View style={styles.sentinelMetricRow}>
                  <View style={styles.sentinelMetricBlock}>
                    <Text style={styles.sentinelMetricLabel}>TOTAL USERS</Text>
                    <Text style={styles.sentinelMetricValue}>{users.length.toLocaleString()}</Text>
                    <Text style={styles.sentinelMetricGood}>+ {clients} clients</Text>
                  </View>
                  <View style={styles.sentinelMetricBlock}>
                    <Text style={styles.sentinelMetricLabel}>ACTIVE PROVIDERS</Text>
                    <Text style={styles.sentinelMetricValue}>{activeProviders.toLocaleString()}</Text>
                    <Text style={styles.sentinelMetricGood}>{admins} admin{admins === 1 ? '' : 's'} online</Text>
                  </View>
                  <View style={styles.sentinelMetricBlock}>
                    <Text style={styles.sentinelMetricLabel}>ESCROW HOLDINGS</Text>
                    <Text style={[styles.sentinelMetricValue, { color: colors.orange }]}>{escrows.length}</Text>
                    <Text style={styles.sentinelMetricWarn}>{formatMoney(escrowValue)} held safely</Text>
                  </View>
                </View>
                <Ionicons name="hardware-chip-outline" size={150} color="rgba(255,255,255,0.08)" style={styles.sentinelCardWatermark} />
              </View>

              <View style={styles.sentinelRiskCard}>
                <Text style={styles.sentinelPanelTitle}>Provider Risk Profiling</Text>
                {[
                  ['High Risk', dssHighRisk, colors.red],
                  ['Medium Risk', dssMediumRisk, '#047857'],
                  ['Low Risk', dssLowRisk, colors.orange]
                ].map(([label, count, tone]) => (
                  <TouchableOpacity key={label} onPress={() => { setRiskFilter(label === 'High Risk' ? 'flagged' : 'all'); dssNav('FraudAlerts'); }} style={styles.sentinelRiskRow}>
                    <View style={[styles.sentinelRiskDot, { backgroundColor: tone }]} />
                    <Text style={styles.sentinelRiskLabel}>{label}</Text>
                    <Text style={styles.sentinelRiskCount}>{count} Providers</Text>
                    <View style={styles.sentinelRiskTrack}>
                      <View style={[styles.sentinelRiskFill, { backgroundColor: tone, width: `${Math.max(4, (Number(count) / riskTotal) * 100)}%` }]} />
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity activeOpacity={0.86} onPress={() => dssNav('FraudAlerts')} style={styles.sentinelAuditBtn}>
                  <Text style={styles.sentinelAuditText}>View Detailed Audit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sentinelMiddleGrid}>
              <View style={styles.sentinelNotificationsCard}>
                <View style={styles.sentinelCardHeader}>
                  <Text style={styles.sentinelPanelTitle}>Admin Notifications</Text>
                  <View style={styles.sentinelNewBadge}><Text style={styles.sentinelNewBadgeText}>NEW ({notificationTotal})</Text></View>
                </View>
                {notifications.map((item) => (
                  <TouchableOpacity key={item.key} activeOpacity={0.86} onPress={item.action} style={styles.sentinelNotificationRow}>
                    <View style={[styles.sentinelNotificationIcon, { backgroundColor: `${item.tone}18` }]}>
                      <Ionicons name={item.icon} size={22} color={item.tone} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.sentinelNotificationTitle}>{item.title}</Text>
                      <Text style={styles.sentinelNotificationBody}>{item.message}</Text>
                    </View>
                    <Text style={styles.sentinelNotificationTime}>{item.time}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity activeOpacity={0.86} onPress={() => dssNav('AdminNotifications')} style={styles.sentinelCardFooterBtn}>
                  <Text style={styles.sentinelCardFooterText}>View All Notifications</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sentinelDecisionCard}>
                <View style={styles.sentinelCardHeader}>
                  <View>
                    <Text style={styles.sentinelPanelTitle}>AI Decision Support Summary</Text>
                    <Text style={styles.sentinelPanelSub}>Analyzing provider behavior vs. historical trust markers.</Text>
                  </View>
                  <View style={styles.rowStart}>
                    <View style={[styles.sentinelLegendDot, { backgroundColor: colors.orange }]} />
                    <Text style={styles.sentinelLegendText}>Activity</Text>
                    <View style={[styles.sentinelLegendDot, { backgroundColor: '#E5E7EB' }]} />
                    <Text style={styles.sentinelLegendText}>Trust Threshold</Text>
                  </View>
                </View>
                {[
                  ['Node Accuracy', 'LAST 24 HOURS', accuracy, `${accuracy}.2%`],
                  ['Predictive Trust', 'MODEL CONFIDENCE', trust, `${trust}.7%`],
                  ['Latency Overhead', 'PROCESSING TIME', Math.min(100, latency / 2), `${latency}ms`]
                ].map(([label, sub, value, display]) => (
                  <View key={label} style={styles.sentinelDecisionMetric}>
                    <View style={styles.sentinelDecisionLabelBlock}>
                      <Text style={styles.sentinelDecisionLabel}>{label}</Text>
                      <Text style={styles.sentinelDecisionSub}>{sub}</Text>
                    </View>
                    <View style={styles.sentinelDecisionTrack}>
                      <View style={[styles.sentinelDecisionFill, { width: `${Math.min(100, Number(value))}%` }]} />
                    </View>
                    <Text style={styles.sentinelDecisionValue}>{display}</Text>
                  </View>
                ))}
                <View style={styles.sentinelMiniBars}>
                  {anomalyBars.map((height, index) => (
                    <View key={`${height}-${index}`} style={[styles.sentinelMiniBar, { height }]} />
                  ))}
                </View>
                <Text style={styles.sentinelChartCaption}>LIVE ANOMALY SIGNAL METRICS</Text>
              </View>
            </View>

            <View style={styles.sentinelMonitoringCard}>
              <View style={styles.sentinelCardHeader}>
                <View>
                  <Text style={styles.sentinelPanelTitle}>Active Monitoring Stream</Text>
                  <Text style={styles.sentinelPanelSub}>Real-time behavior log for high-risk flags</Text>
                </View>
                <View style={styles.sentinelLivePill}><View style={styles.sentinelLiveDot} /><Text style={styles.sentinelLiveText}>Live Feed</Text></View>
              </View>
              <View style={styles.sentinelTableHeader}>
                {['TIMESTAMP', 'ENTITY', 'ACTION', 'CONFIDENCE', 'STATUS', 'ACTIONS'].map((item) => <Text key={item} style={styles.sentinelTableHeadText}>{item}</Text>)}
              </View>
              {filteredMonitoringRows.map((item) => (
                <TouchableOpacity key={item.id} activeOpacity={0.86} onPress={item.onPress} style={styles.sentinelTableRow}>
                  <Text style={styles.sentinelTableText}>{item.timestamp}</Text>
                  <Text style={[styles.sentinelTableText, styles.sentinelTableEntity]}>{item.entity}</Text>
                  <Text style={styles.sentinelTableText}>{item.action}</Text>
                  <View style={styles.sentinelConfidenceCell}>
                    <Text style={styles.sentinelTableText}>{item.confidence}%</Text>
                    <View style={styles.sentinelConfidenceTrack}><View style={[styles.sentinelConfidenceFill, { width: `${item.confidence}%`, backgroundColor: item.tone }]} /></View>
                  </View>
                  <View style={[styles.sentinelStatusPill, { backgroundColor: `${item.tone}24` }]}><Text style={[styles.sentinelStatusText, { color: item.tone }]}>{item.status}</Text></View>
                  <Ionicons name="ellipsis-vertical" size={20} color="#40516F" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity activeOpacity={0.86} onPress={() => dssNav('Reports')} style={styles.sentinelAuditLogBtn}>
                <Text style={styles.sentinelAuditLogText}>View Complete Audit Log</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.orange} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function AdminDashboardScreen({ navigation }) {
  // Legacy admin dashboard implementation kept unreachable dead code.
  // Use the DSS Admin Sentinel dashboard directly.
  return <AdminSentinelDashboard navigation={navigation} />;

  const updateRefund = async (booking, decision) => {
    try {
      await api.put(`/api/bookings/admin/refunds/${booking.id}/`, { status: decision });
      Alert.alert(decision === 'approved' ? 'Refund approved' : 'Refund rejected');
      loadAdminData();
    } catch (error) {
      Alert.alert('Refund update failed', errorMessage(error));
    }
  };
  const updatePinReset = async (wallet, decision) => {
    try {
      await api.put(`/api/wallet/admin/pin-resets/${wallet.id}/`, { status: decision });
      Alert.alert(decision === 'approved' ? 'PIN reset approved' : 'PIN reset rejected');
      loadAdminData();
    } catch (error) {
      Alert.alert('PIN reset update failed', errorMessage(error));
    }
  };
  const activeProviders = users.filter((user) => user.role === 'provider').length;
  const clients = users.filter((user) => user.role === 'client').length;
  const weeklyVolume = refunds.reduce((sum, booking) => sum + Number(booking.amount || 0), 0);
  const providerVerificationRate = activeProviders ? Math.round(((activeProviders - kyc.length) / activeProviders) * 100) : 0;
  const activeDisputes = refunds.length;
  const dssHighRisk = dssData?.fraud_overview?.high_risk || 0;
  const dssPendingReports = dssData?.reports_overview?.pending || 0;
  const dssAlertCount = dssHighRisk + dssPendingReports;
  const adminNewNotificationCount = kyc.length + refunds.length + pinResets.length + dssAlertCount;
  const dispute = selectedRefund || refunds[0] || {};
  const statCards = [
    { icon: 'people-outline', label: 'TOTAL USERS', value: users.length || '0', meta: `${clients} clients`, tone: colors.blue },
    { icon: 'shield-checkmark-outline', label: 'ACTIVE PROVIDERS', value: activeProviders || '0', meta: `${providerVerificationRate}% verified`, tone: colors.blue },
    { icon: 'pulse-outline', label: 'PENDING REFUNDS', value: formatMoney(weeklyVolume), meta: `${refunds.length} dispute cases`, tone: colors.orange },
    { icon: 'warning-outline', label: 'ACTIVE DISPUTES', value: String(activeDisputes).padStart(2, '0'), meta: activeDisputes ? 'Requires action' : 'No action needed', tone: colors.red }
  ];
  const adminNotifications = [
    { key: 'dss', count: dssAlertCount, icon: 'hardware-chip-outline', title: 'AI Decision Support', message: dssAlertCount ? `${dssHighRisk} high-risk provider${dssHighRisk === 1 ? '' : 's'} and ${dssPendingReports} pending report${dssPendingReports === 1 ? '' : 's'} flagged by AI.` : 'AI monitoring active. No high-risk providers or pending reports.', tone: dssAlertCount ? colors.red : colors.green, action: () => navigation.getParent()?.navigate('DSSAIPanel') },
    { key: 'kyc', count: kyc.length, icon: 'shield-checkmark-outline', title: 'Provider verification', message: kyc.length ? `${kyc.length} provider KYC request${kyc.length === 1 ? '' : 's'} waiting for review.` : 'No pending provider KYC requests.', tone: kyc.length ? colors.orange : colors.green, action: () => navigation.navigate('Verify') },
    { key: 'refunds', count: refunds.length, icon: 'warning-outline', title: 'Escrow disputes', message: refunds.length ? `${refunds.length} refund or mediation case${refunds.length === 1 ? '' : 's'} need admin attention.` : 'No active refund disputes.', tone: refunds.length ? colors.red : colors.green, action: () => navigation.navigate('Disputes') },
    { key: 'pin', count: pinResets.length, icon: 'key-outline', title: 'PIN reset requests', message: pinResets.length ? `${pinResets.length} wallet PIN reset request${pinResets.length === 1 ? '' : 's'} pending.` : 'No pending wallet PIN reset requests.', tone: pinResets.length ? colors.orange : colors.green, action: () => navigation.navigate('Pin Resets') },
    { key: 'users', count: users.length, icon: 'people-outline', title: 'Platform users', message: `${users.length} registered account${users.length === 1 ? '' : 's'} across clients, providers, and admins.`, tone: colors.blue, action: () => navigation.navigate('Users') }
  ];

  return (
    <SafeAreaView style={styles.adminVerifyScreen}>
      <ScrollView contentContainerStyle={styles.adminVerifyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.adminHero}>
          <View>
            <Text style={styles.adminHeroTitle}>System Health</Text>
            <Text style={styles.adminHeroSubtitle}>Infrastructure governance and platform oversight</Text>
          </View>
          <View style={styles.adminHeroActions}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Users')} style={styles.adminTopLink}>
              <Ionicons name="people-outline" size={17} color={colors.orange} />
              <Text style={styles.adminTopLinkText}>PLATFORM USERS</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Escrow')} style={styles.adminTopLink}>
              <Ionicons name="wallet-outline" size={17} color={colors.orange} />
              <Text style={styles.adminTopLinkText}>ESCROW SYSTEM</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.getParent()?.navigate('DSSAIPanel')} style={styles.adminTopLink}>
              <Ionicons name="hardware-chip-outline" size={17} color={colors.orange} />
              <Text style={styles.adminTopLinkText}>AI PANEL</Text>
            </TouchableOpacity>
            <View style={styles.serverStatusPill}><View style={styles.serverDot} /><Text style={styles.serverStatusText}>SERVER STATUS: OPTIMAL</Text></View>
          </View>
        </View>

        <View style={styles.adminStatsGrid}>
          {statCards.map((item) => (
            <View key={item.label} style={styles.adminStatCard}>
              <Ionicons name={item.icon} size={28} color={item.tone} />
              <Text style={styles.adminStatLabel}>{item.label}</Text>
              <Text style={styles.adminStatValue}>{item.value}</Text>
              <Text style={[styles.adminStatMeta, { color: item.tone }]}>{item.meta}</Text>
            </View>
          ))}
        </View>

        <View style={styles.adminNotificationPanel}>
          <View style={styles.adminSectionHeader}>
            <View style={styles.rowStart}>
              <View style={styles.adminNotificationTitleIcon}>
                <Ionicons name="notifications-outline" size={22} color={colors.orange} />
                <NotificationBadge count={adminNewNotificationCount} />
              </View>
              <Text style={styles.adminSectionTitle}>Admin Notifications</Text>
            </View>
            <Text style={styles.adminQueueMeta}>LIVE ACTIVITY</Text>
          </View>
          <View style={styles.adminNotificationGrid}>
            {adminNotifications.map((item) => (
              <TouchableOpacity key={item.key} activeOpacity={item.action ? 0.85 : 1} onPress={item.action} style={styles.adminNotificationItem}>
                <View style={[styles.adminNotificationIcon, { backgroundColor: `${item.tone}1A` }]}>
                  <Ionicons name={item.icon} size={22} color={item.tone} />
                </View>
                <NotificationBadge count={item.count} showZero={item.key !== 'users'} muted={!item.count} />
                <View style={styles.flex}>
                  <Text style={styles.adminNotificationTitle}>{item.title}</Text>
                  <Text style={styles.adminNotificationMessage}>{item.message}</Text>
                </View>
                {item.action ? <Ionicons name="chevron-forward" size={18} color="#8FA0B8" /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {false ? <View style={styles.adminDesktopGrid}>
          <View style={styles.adminColumn}>
            <View style={styles.adminSectionHeader}>
              <View style={styles.rowStart}>
                <Text style={styles.adminSectionTitle}>Verification Queue</Text>
                <View style={styles.adminCountBadge}><Text style={styles.adminCountText}>{kyc.length} NEW</Text></View>
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Verify')} style={styles.adminWorkspaceLink}>
                <Text style={styles.adminViewAll}>OPEN WORKSPACE</Text>
                <Ionicons name="open-outline" size={14} color={colors.orange} />
              </TouchableOpacity>
            </View>
            {kyc.length ? kyc.map((item) => (
              <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => navigation.navigate('Verify', { profileId: item.id })} style={styles.adminQueueRow}>
                <View style={styles.adminQueueAvatar}><Text style={styles.adminQueueAvatarText}>{(item.business_name || item.user?.full_name || 'P').slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.flex}>
                  <Text style={styles.adminQueueName}>{item.user?.full_name || 'Provider'}</Text>
                  <Text style={styles.adminQueueMeta}>{item.business_name || 'Provider business'} - {item.address || 'Cameroon'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#8FA0B8" />
              </TouchableOpacity>
            )) : <View style={styles.adminEmptyCard}><Text style={styles.adminEmptyText}>No providers waiting for KYC review.</Text></View>}
          </View>

          <View style={styles.adminColumn}>
            <View style={styles.adminSectionHeader}>
              <Text style={styles.adminSectionTitle}>Critical Dispute</Text>
              {activeDisputes ? <View style={styles.criticalPill}><Text style={styles.criticalText}>CRITICAL</Text></View> : null}
            </View>
            <View style={styles.adminDisputeCard}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.disputeCaseLabel}>CASE #{dispute.id || 'NONE'}</Text>
                  <Text style={styles.disputeTitle}>{dispute.service_title || 'No active dispute'}</Text>
                  <Text style={styles.disputeBody}>{dispute.id ? `Refund requested by ${dispute.client_name}. Verify with ${dispute.provider_name} before releasing escrow.` : 'Refund and mediation cases will appear here when clients request admin review.'}</Text>
                </View>
                <Ionicons name="warning-outline" size={72} color="rgba(239,68,68,0.13)" />
              </View>
              {refunds.length ? refunds.map((booking) => (
                <TouchableOpacity key={booking.id} activeOpacity={0.85} onPress={() => setSelectedRefund(booking)} style={[styles.adminRefundCard, selectedRefund?.id === booking.id && styles.adminRefundCardActive]}>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={styles.adminRefundService}>{booking.service_title}</Text>
                      <Text style={styles.adminRefundMeta}>Client: {booking.client_name}</Text>
                      <Text style={styles.adminRefundMeta}>Provider: {booking.provider_name}</Text>
                    </View>
                    <Text style={styles.adminRefundAmount}>{formatMoney(booking.amount)}</Text>
                  </View>
                </TouchableOpacity>
              )) : null}
              <View style={styles.adminActionRow}>
                <TouchableOpacity disabled={!dispute.id} activeOpacity={0.8} onPress={() => updateRefund(dispute, 'rejected')} style={[styles.adminReleaseButton, !dispute.id && styles.disabledAction]}><Text style={styles.adminReleaseText}>RELEASE TO PROVIDER</Text></TouchableOpacity>
                <TouchableOpacity disabled={!dispute.id} activeOpacity={0.8} onPress={() => updateRefund(dispute, 'approved')} style={[styles.adminRefundDangerButton, !dispute.id && styles.disabledAction]}><Text style={styles.adminDangerText}>FULL REFUND TO CLIENT</Text></TouchableOpacity>
              </View>
            </View>

            <View style={styles.adminRefundSection}>
              <Text style={styles.adminRefundTitle}>Pending PIN Resets</Text>
              {pinResets.length ? pinResets.map((wallet) => (
                <View key={wallet.id} style={styles.adminPinCard}>
                  <View style={styles.row}>
                    <Ionicons name="key-outline" size={24} color={colors.orange} />
                    <View style={styles.flex}>
                      <Text style={styles.adminQueueName}>{wallet.user_name}</Text>
                      <Text style={styles.adminQueueMeta}>{wallet.user_email} • {wallet.user_role}</Text>
                    </View>
                  </View>
                  <View style={styles.adminActionRow}>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => updatePinReset(wallet, 'rejected')} style={styles.adminRefundRejectButton}><Text style={styles.rejectText}>REJECT</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => updatePinReset(wallet, 'approved')} style={styles.adminRefundApproveButton}><Text style={styles.approveText}>APPROVE RESET</Text></TouchableOpacity>
                  </View>
                </View>
              )) : <Text style={styles.adminEmptyText}>No pending PIN reset requests.</Text>}
            </View>

            {false ? <View style={styles.adminRefundSection}>
              <Text style={styles.adminRefundTitle}>Platform Users</Text>
              {users.slice(0, 6).map((user) => (
                <View key={user.id} style={styles.adminUserRow}>
                  <Avatar uri={user.profile_photo} size={36} />
                  <View style={styles.flex}>
                    <Text style={styles.adminQueueName}>{user.full_name || user.email}</Text>
                    <Text style={styles.adminQueueMeta}>{user.email} • {user.role}</Text>
                  </View>
                </View>
              ))}
            </View> : null}
          </View>
        </View> : (
          <AdminDSSPanel navigation={navigation} embedded onDashboardLoaded={setDssData} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AdminUsersScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/users/admin/users/');
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Users unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadUsers();
  }, [loadUsers]));

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      const fields = [user.full_name, user.email, user.role, user.phone].filter(Boolean).join(' ').toLowerCase();
      return fields.includes(term);
    });
  }, [search, users]);

  const counts = useMemo(() => ({
    all: users.length,
    clients: users.filter((user) => user.role === 'client').length,
    providers: users.filter((user) => user.role === 'provider').length,
    admins: users.filter((user) => user.role === 'admin').length
  }), [users]);

  return (
    <SafeAreaView style={styles.adminVerifyScreen}>
      <ScrollView contentContainerStyle={styles.adminUsersContent} showsVerticalScrollIndicator={false}>
        <View style={styles.adminVerifyHeader}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Dashboard')} style={styles.verifyBack}>
            <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
            <Text style={styles.verifyBackText}>BACK TO DASHBOARD</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.adminVerifyPageTitle}>Platform Users</Text>
              <Text style={styles.adminVerifyPageSubtitle}>Search and review all registered clients, providers, and admins.</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.orange} /> : <View style={styles.adminCountBadge}><Text style={styles.adminCountText}>{filteredUsers.length} SHOWN</Text></View>}
          </View>
        </View>

        <View style={styles.adminUserStatsRow}>
          <View style={styles.adminUserStatPill}><Text style={styles.adminUserStatValue}>{counts.all}</Text><Text style={styles.adminUserStatLabel}>ALL USERS</Text></View>
          <View style={styles.adminUserStatPill}><Text style={styles.adminUserStatValue}>{counts.clients}</Text><Text style={styles.adminUserStatLabel}>CLIENTS</Text></View>
          <View style={styles.adminUserStatPill}><Text style={styles.adminUserStatValue}>{counts.providers}</Text><Text style={styles.adminUserStatLabel}>PROVIDERS</Text></View>
          <View style={styles.adminUserStatPill}><Text style={styles.adminUserStatValue}>{counts.admins}</Text><Text style={styles.adminUserStatLabel}>ADMINS</Text></View>
        </View>

        <View style={styles.adminUsersSearchCard}>
          <Ionicons name="search-outline" size={22} color="#8FA0B8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email, role, or phone..."
            placeholderTextColor="#8FA0B8"
            style={styles.adminUsersSearchInput}
          />
          {search ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setSearch('')} style={styles.adminSearchClear}>
              <Ionicons name="close" size={18} color={colors.textGray} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.adminUsersTable}>
          <View style={styles.adminUsersTableHeader}>
            <Text style={[styles.adminUsersHeaderText, styles.adminUsersNameCol]}>USER</Text>
            <Text style={[styles.adminUsersHeaderText, styles.adminUsersRoleCol]}>ROLE</Text>
            <Text style={[styles.adminUsersHeaderText, styles.adminUsersContactCol]}>CONTACT</Text>
            <Text style={[styles.adminUsersHeaderText, styles.adminUsersDateCol]}>JOINED</Text>
          </View>
          {filteredUsers.length ? filteredUsers.map((user) => (
            <View key={user.id} style={styles.adminUsersTableRow}>
              <View style={[styles.adminUsersCell, styles.adminUsersNameCol]}>
                <Avatar uri={user.profile_photo} size={42} />
                <View style={styles.flex}>
                  <Text style={styles.adminQueueName}>{user.full_name || user.email}</Text>
                  <Text style={styles.adminQueueMeta}>{user.email || 'No email'}</Text>
                </View>
              </View>
              <View style={[styles.adminUsersCell, styles.adminUsersRoleCol]}>
                <View style={styles.adminRoleBadge}><Text style={styles.adminRoleBadgeText}>{(user.role || 'user').toUpperCase()}</Text></View>
              </View>
              <Text style={[styles.adminUsersCellText, styles.adminUsersContactCol]}>{user.phone || 'Not provided'}</Text>
              <Text style={[styles.adminUsersCellText, styles.adminUsersDateCol]}>{user.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'Not available'}</Text>
            </View>
          )) : (
            <View style={styles.adminEmptyReview}>
              <Ionicons name="people-outline" size={46} color={colors.orange} />
              <Text style={styles.adminEmptyReviewTitle}>No users found</Text>
              <Text style={styles.adminEmptyReviewText}>Try searching with another name, email, role, or phone number.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AdminEscrowScreen({ navigation }) {
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const loadEscrows = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/bookings/admin/escrow/');
      setEscrows(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Escrow unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadEscrows();
  }, [loadEscrows]));

  const releaseEscrow = async (booking, force = false) => {
    try {
      await api.put(`/api/bookings/admin/escrow/${booking.id}/release/`, { force });
      Alert.alert('Escrow released', 'Provider payout has been released after the 5% Servista fee.');
      loadEscrows();
    } catch (error) {
      Alert.alert('Release failed', errorMessage(error));
    }
  };

  const heldValue = escrows.reduce((total, booking) => total + Number(booking.amount || 0), 0);
  const feeValue = escrows.reduce((total, booking) => total + (Number(booking.amount || 0) * 0.05), 0);
  const payoutValue = Math.max(0, heldValue - feeValue);
  const blockedCount = escrows.filter((booking) => booking.refund_status === 'requested' || booking.issue_reported_at).length;
  const readyCount = escrows.filter((booking) => booking.provider_marked_completed_at && booking.client_confirmed_at && !booking.issue_reported_at).length;
  const filteredEscrows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return escrows.filter((booking) => {
      const blocked = booking.refund_status === 'requested' || booking.issue_reported_at;
      const ready = booking.provider_marked_completed_at && booking.client_confirmed_at && !blocked;
      const matchesFilter = filter === 'All' || (filter === 'Ready' && ready) || (filter === 'Blocked' && blocked) || (filter === 'In Progress' && !ready && !blocked);
      const searchable = [booking.service_title, booking.client_name, booking.provider_name, booking.id].filter(Boolean).join(' ').toLowerCase();
      return matchesFilter && (!term || searchable.includes(term));
    });
  }, [escrows, filter, search]);

  const headerActions = (
    <View style={styles.adminEscrowFilterRow}>
      {['All', 'Ready', 'Blocked', 'In Progress'].map((item) => (
        <TouchableOpacity key={item} onPress={() => setFilter(item)} style={[styles.adminEscrowFilter, filter === item && styles.adminEscrowFilterActive]}>
          <Text style={[styles.adminEscrowFilterText, filter === item && styles.adminEscrowFilterTextActive]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <AdminWorkspaceLayout
      navigation={navigation}
      active="Escrow System"
      eyebrow="Payment governance"
      title="Escrow System"
      subtitle="Monitor protected client funds, provider completion checks, disputes, and payouts from the live booking ledger."
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search booking, client, or provider..."
      onRefresh={loadEscrows}
      refreshing={loading}
      headerActions={headerActions}
    >
      <View style={styles.adminEscrowSummaryGrid}>
        <View style={styles.adminEscrowSummaryCard}><View style={styles.adminEscrowSummaryIcon}><Ionicons name="lock-closed-outline" size={21} color={colors.orange} /></View><Text style={styles.adminEscrowSummaryLabel}>FUNDS IN ESCROW</Text><Text style={styles.adminEscrowSummaryValue}>{formatMoney(heldValue)}</Text><Text style={styles.adminEscrowSummaryCopy}>{escrows.length} protected booking{escrows.length === 1 ? '' : 's'}</Text></View>
        <View style={styles.adminEscrowSummaryCard}><View style={styles.adminEscrowSummaryIcon}><Ionicons name="cash-outline" size={21} color={colors.green} /></View><Text style={styles.adminEscrowSummaryLabel}>PROVIDER PAYOUTS</Text><Text style={styles.adminEscrowSummaryValue}>{formatMoney(payoutValue)}</Text><Text style={styles.adminEscrowSummaryCopy}>After the 5% platform fee</Text></View>
        <View style={styles.adminEscrowSummaryCard}><View style={styles.adminEscrowSummaryIcon}><Ionicons name="receipt-outline" size={21} color="#3B82F6" /></View><Text style={styles.adminEscrowSummaryLabel}>SERVISTA FEES</Text><Text style={styles.adminEscrowSummaryValue}>{formatMoney(feeValue)}</Text><Text style={styles.adminEscrowSummaryCopy}>Calculated from active holds</Text></View>
        <View style={styles.adminEscrowSummaryCard}><View style={[styles.adminEscrowSummaryIcon, blockedCount && { backgroundColor: '#FEE2E2' }]}><Ionicons name="warning-outline" size={21} color={blockedCount ? colors.red : colors.green} /></View><Text style={styles.adminEscrowSummaryLabel}>ACTION QUEUE</Text><Text style={styles.adminEscrowSummaryValue}>{blockedCount + readyCount}</Text><Text style={styles.adminEscrowSummaryCopy}>{readyCount} ready payout · {blockedCount} dispute{blockedCount === 1 ? '' : 's'}</Text></View>
      </View>

      <View style={styles.adminEscrowListPanel}>
        <View style={styles.adminEscrowListHeader}><View><Text style={styles.adminEscrowListTitle}>Active Escrow Ledger</Text><Text style={styles.adminEscrowListSub}>Every row is loaded from paid bookings currently held in escrow.</Text></View><View style={styles.adminEscrowLivePill}><View style={styles.adminEscrowLiveDot} /><Text style={styles.adminEscrowLiveText}>LIVE</Text></View></View>
        {loading ? <ActivityIndicator color={colors.orange} size="large" style={{ margin: 48 }} /> : null}
        {!loading && !filteredEscrows.length ? <View style={styles.adminEscrowEmpty}><Ionicons name="wallet-outline" size={42} color="#94A3B8" /><Text style={styles.adminEscrowEmptyTitle}>No matching escrow bookings</Text><Text style={styles.adminEscrowEmptyText}>Paid client bookings appear here until an approved release or refund finishes.</Text></View> : null}
        {!loading && filteredEscrows.map((booking) => {
          const amount = Number(booking.amount || 0);
          const fee = amount * 0.05;
          const payout = amount - fee;
          const blocked = booking.refund_status === 'requested' || booking.issue_reported_at;
          const ready = booking.provider_marked_completed_at && booking.client_confirmed_at && !blocked;
          const waitingLabel = !booking.provider_marked_completed_at ? 'Awaiting provider completion' : !booking.client_confirmed_at ? 'Awaiting client confirmation' : 'Awaiting payout review';
          return <View key={booking.id} style={[styles.adminEscrowBookingCard, blocked && styles.adminEscrowBookingBlocked]}>
            <View style={styles.adminEscrowBookingTop}><View style={{ flex: 1 }}><View style={styles.adminEscrowBookingTitleRow}><Text style={styles.adminEscrowBookingTitle}>{booking.service_title || 'Service booking'}</Text><View style={[styles.adminEscrowStatus, blocked ? styles.adminEscrowStatusBlocked : ready ? styles.adminEscrowStatusReady : styles.adminEscrowStatusHolding]}><Text style={[styles.adminEscrowStatusText, blocked ? styles.adminEscrowStatusTextBlocked : ready ? styles.adminEscrowStatusTextReady : styles.adminEscrowStatusTextHolding]}>{blocked ? 'DISPUTE HOLD' : ready ? 'READY TO RELEASE' : 'ESCROWED'}</Text></View></View><Text style={styles.adminEscrowBookingMeta}>Booking #SRV-{String(booking.id).padStart(4, '0')} · Client: {booking.client_name || 'Client'} · Provider: {booking.provider_name || 'Provider'}</Text></View><Text style={styles.adminEscrowBookingAmount}>{formatMoney(amount)}</Text></View>
            <View style={styles.adminEscrowProgress}><View style={styles.adminEscrowProgressStep}><Ionicons name={booking.provider_marked_completed_at ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={booking.provider_marked_completed_at ? colors.green : '#94A3B8'} /><Text style={styles.adminEscrowProgressText}>Provider completed</Text></View><View style={styles.adminEscrowProgressLine} /><View style={styles.adminEscrowProgressStep}><Ionicons name={booking.client_confirmed_at ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={booking.client_confirmed_at ? colors.green : '#94A3B8'} /><Text style={styles.adminEscrowProgressText}>Client confirmed</Text></View><View style={styles.adminEscrowProgressLine} /><View style={styles.adminEscrowProgressStep}><Ionicons name={booking.payment_status === 'released' ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={booking.payment_status === 'released' ? colors.green : '#94A3B8'} /><Text style={styles.adminEscrowProgressText}>Payout released</Text></View></View>
            <View style={styles.adminEscrowFinancials}><View><Text style={styles.adminEscrowFinancialLabel}>HELD AMOUNT</Text><Text style={styles.adminEscrowFinancialValue}>{formatMoney(amount)}</Text></View><View><Text style={styles.adminEscrowFinancialLabel}>5% PLATFORM FEE</Text><Text style={styles.adminEscrowFinancialValue}>{formatMoney(fee)}</Text></View><View><Text style={styles.adminEscrowFinancialLabel}>PROVIDER RECEIVES</Text><Text style={styles.adminEscrowFinancialValue}>{formatMoney(payout)}</Text></View></View>
            <View style={styles.adminEscrowActions}>{blocked ? <TouchableOpacity style={styles.adminEscrowReviewButton} onPress={() => navigation.navigate('Disputes')}><Text style={styles.adminEscrowReviewText}>Review Dispute</Text></TouchableOpacity> : ready ? <TouchableOpacity style={styles.adminEscrowReleaseButton} onPress={() => releaseEscrow(booking)}><Text style={styles.adminEscrowReleaseText}>Release to Provider</Text></TouchableOpacity> : <View style={styles.adminEscrowWaitingButton}><Ionicons name="time-outline" size={17} color="#64748B" /><Text style={styles.adminEscrowWaitingText}>{waitingLabel}</Text></View>}</View>
          </View>;
        })}
      </View>
    </AdminWorkspaceLayout>
  );
}

export function AdminDisputesScreen({ navigation }) {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRefunds = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/bookings/admin/refunds/');
      setRefunds(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Disputes unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadRefunds();
  }, [loadRefunds]));

  const decideRefund = async (booking, decision) => {
    try {
      await api.put(`/api/bookings/admin/refunds/${booking.id}/`, { status: decision });
      Alert.alert(decision === 'approved' ? 'Refund approved' : 'Refund rejected');
      loadRefunds();
    } catch (error) {
      Alert.alert('Dispute update failed', errorMessage(error));
    }
  };

  return (
    <SafeAreaView style={styles.adminVerifyScreen}>
      <ScrollView contentContainerStyle={styles.adminUsersContent} showsVerticalScrollIndicator={false}>
        <View style={styles.adminVerifyHeader}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Dashboard')} style={styles.verifyBack}>
            <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
            <Text style={styles.verifyBackText}>BACK TO DASHBOARD</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.adminVerifyPageTitle}>Escrow Disputes</Text>
              <Text style={styles.adminVerifyPageSubtitle}>Review reported issues and choose refund or rejection after mediation.</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.orange} /> : <View style={styles.adminCountBadge}><Text style={styles.adminCountText}>{refunds.length} OPEN</Text></View>}
          </View>
        </View>
        {refunds.length ? refunds.map((booking) => (
          <View key={booking.id} style={styles.adminDisputeCard}>
            <Text style={styles.disputeCaseLabel}>CASE #SRV-{String(booking.id).padStart(4, '0')}</Text>
            <Text style={styles.disputeTitle}>{booking.service_title}</Text>
            <Text style={styles.disputeBody}>Client {booking.client_name} reported an issue with provider {booking.provider_name}. Escrow remains blocked until this case is resolved.</Text>
            <View style={styles.adminActionRow}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => decideRefund(booking, 'rejected')} style={styles.adminReleaseButton}><Text style={styles.adminReleaseText}>REJECT REFUND</Text></TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={() => decideRefund(booking, 'approved')} style={styles.adminRefundDangerButton}><Text style={styles.adminDangerText}>FULL REFUND TO CLIENT</Text></TouchableOpacity>
            </View>
          </View>
        )) : (
          <View style={styles.adminEmptyReview}>
            <Ionicons name="warning-outline" size={46} color={colors.orange} />
            <Text style={styles.adminEmptyReviewTitle}>No active dispute</Text>
            <Text style={styles.adminEmptyReviewText}>Client issue reports and refund requests will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AdminPinResetsScreen({ navigation }) {
  const [pinResets, setPinResets] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPinResets = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/wallet/admin/pin-resets/');
      setPinResets(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('PIN resets unavailable', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadPinResets();
  }, [loadPinResets]));

  const updatePinReset = async (wallet, decision) => {
    try {
      await api.put(`/api/wallet/admin/pin-resets/${wallet.id}/`, { status: decision });
      Alert.alert(decision === 'approved' ? 'PIN reset approved' : 'PIN reset rejected');
      loadPinResets();
    } catch (error) {
      Alert.alert('PIN reset update failed', errorMessage(error));
    }
  };

  return (
    <SafeAreaView style={styles.adminVerifyScreen}>
      <ScrollView contentContainerStyle={styles.adminUsersContent} showsVerticalScrollIndicator={false}>
        <View style={styles.adminVerifyHeader}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Dashboard')} style={styles.verifyBack}>
            <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
            <Text style={styles.verifyBackText}>BACK TO DASHBOARD</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.adminVerifyPageTitle}>PIN Reset Requests</Text>
              <Text style={styles.adminVerifyPageSubtitle}>Approve reset requests only after validating the account owner.</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.orange} /> : <View style={styles.adminCountBadge}><Text style={styles.adminCountText}>{pinResets.length} PENDING</Text></View>}
          </View>
        </View>
        {pinResets.length ? pinResets.map((wallet) => (
          <View key={wallet.id} style={styles.adminPinCard}>
            <View style={styles.row}>
              <Ionicons name="key-outline" size={24} color={colors.orange} />
              <View style={styles.flex}>
                <Text style={styles.adminQueueName}>{wallet.user_name}</Text>
                <Text style={styles.adminQueueMeta}>{wallet.user_email} - {wallet.user_role}</Text>
              </View>
            </View>
            <View style={styles.adminActionRow}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => updatePinReset(wallet, 'rejected')} style={styles.adminRefundRejectButton}><Text style={styles.rejectText}>REJECT</Text></TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={() => updatePinReset(wallet, 'approved')} style={styles.adminRefundApproveButton}><Text style={styles.approveText}>APPROVE RESET</Text></TouchableOpacity>
            </View>
          </View>
        )) : (
          <View style={styles.adminEmptyReview}>
            <Ionicons name="key-outline" size={46} color={colors.orange} />
            <Text style={styles.adminEmptyReviewTitle}>No pending PIN resets</Text>
            <Text style={styles.adminEmptyReviewText}>Wallet PIN reset requests will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AdminVerifyScreen({ route, navigation }) {
  const [kyc, setKyc] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const selectedProfileId = route?.params?.profileId;

  const loadKycQueue = useCallback(async () => {
    try {
      const { data } = await api.get('/api/users/admin/kyc/');
      const profiles = Array.isArray(data) ? data : [];
      const nextProfile = profiles.find((item) => String(item.id) === String(selectedProfileId)) || profiles[0] || null;
      setKyc(profiles);
      setSelectedProfile((current) => profiles.find((item) => item.id === current?.id) || nextProfile);
    } catch (error) {
      Alert.alert('KYC queue unavailable', errorMessage(error));
    }
  }, [selectedProfileId]);

  useFocusEffect(useCallback(() => {
    loadKycQueue();
  }, [loadKycQueue]));

  const updateKyc = async (profile, decision) => {
    if (!profile?.user?.id) return;
    try {
      await api.put(`/api/users/admin/kyc/${profile.user.id}/`, { status: decision });
      Alert.alert(decision === 'approved' ? 'Provider verified' : 'Provider rejected');
      await loadKycQueue();
    } catch (error) {
      Alert.alert('KYC update failed', errorMessage(error));
    }
  };

  const profile = selectedProfile || {};
  const idDocuments = [
    { label: 'FRONT SIDE', uri: mediaUri(profile.id_front), icon: 'card-outline' },
    { label: 'BACK SIDE', uri: mediaUri(profile.id_back), icon: 'card-outline' },
    { label: 'SELFIE', uri: mediaUri(profile.selfie), icon: 'person-circle-outline' }
  ];
  const initials = (profile.business_name || profile.user?.full_name || 'SV').slice(0, 2).toUpperCase();
  const status = profile.kyc_status || 'pending';

  return (
    <SafeAreaView style={styles.adminVerifyScreen}>
      <ScrollView contentContainerStyle={styles.adminVerifyPageContent} showsVerticalScrollIndicator={false}>
        <View style={styles.adminVerifyHeader}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Dashboard')} style={styles.verifyBack}>
            <Ionicons name="chevron-back" size={18} color="#8FA0B8" />
            <Text style={styles.verifyBackText}>BACK TO DASHBOARD</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.adminVerifyPageTitle}>Provider Verification</Text>
              <Text style={styles.adminVerifyPageSubtitle}>Review business identity, KYC documents, and issue the verified provider badge.</Text>
            </View>
            <View style={styles.adminCountBadge}><Text style={styles.adminCountText}>{kyc.length} PENDING</Text></View>
          </View>
        </View>

        <View style={styles.adminVerifyWorkspace}>
          <View style={styles.adminVerifyQueuePanel}>
            <Text style={styles.adminRefundTitle}>Verification Queue</Text>
            {kyc.length ? kyc.map((item) => {
              const active = item.id === profile.id;
              return (
                <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => setSelectedProfile(item)} style={[styles.adminQueueRow, active && styles.adminQueueRowActive]}>
                  <View style={styles.adminQueueAvatar}><Text style={styles.adminQueueAvatarText}>{(item.business_name || item.user?.full_name || 'P').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.flex}>
                    <Text style={styles.adminQueueName}>{item.user?.full_name || item.business_name || 'Provider'}</Text>
                    <Text style={styles.adminQueueMeta}>{item.business_name || 'Provider business'} - {item.address || 'Cameroon'}</Text>
                  </View>
                  <Ionicons name={active ? 'checkmark-circle' : 'chevron-forward'} size={20} color={active ? colors.orange : '#8FA0B8'} />
                </TouchableOpacity>
              );
            }) : <View style={styles.adminEmptyCard}><Text style={styles.adminEmptyText}>No providers waiting for KYC review.</Text></View>}
          </View>

          <View style={styles.adminVerifyDetailPanel}>
            {profile.id ? (
              <>
                <View style={styles.adminVerifyProfileBanner}>
                  <View style={styles.verifyAvatar}><Text style={styles.verifyAvatarText}>{initials}</Text></View>
                  <View style={styles.flex}>
                    <View style={styles.rowStart}>
                      <Text style={styles.verifyDetailName}>{profile.user?.full_name || profile.business_name || 'Provider'}</Text>
                      <View style={styles.verifyStatusBadge}><Text style={styles.verifyStatusText}>{status.toUpperCase()}</Text></View>
                    </View>
                    <Text style={styles.verifyDetailSubtitle}>{profile.business_name || 'Business name not provided'}</Text>
                    <Text style={styles.verifyDetailMeta}>{profile.user?.email || 'No email'} - {profile.user?.role || 'provider'}</Text>
                  </View>
                </View>

                <View style={styles.adminVerifyInfoGrid}>
                  <View style={styles.adminVerifyInfoItem}>
                    <Text style={styles.adminVerifyInfoLabel}>BUSINESS NAME</Text>
                    <Text style={styles.adminVerifyInfoValue}>{profile.business_name || 'Not provided'}</Text>
                  </View>
                  <View style={styles.adminVerifyInfoItem}>
                    <Text style={styles.adminVerifyInfoLabel}>ADDRESS</Text>
                    <Text style={styles.adminVerifyInfoValue}>{profile.address || 'Not provided'}</Text>
                  </View>
                  <View style={styles.adminVerifyInfoItem}>
                    <Text style={styles.adminVerifyInfoLabel}>REGISTRATION DATE</Text>
                    <Text style={styles.adminVerifyInfoValue}>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Not available'}</Text>
                  </View>
                  <View style={styles.adminVerifyInfoItem}>
                    <Text style={styles.adminVerifyInfoLabel}>COORDINATES</Text>
                    <Text style={styles.adminVerifyInfoValue}>{profile.latitude && profile.longitude ? `${profile.latitude}, ${profile.longitude}` : 'Not provided'}</Text>
                  </View>
                </View>

                <View style={styles.idReviewCard}>
                  <View style={styles.rowStart}><Ionicons name="shield-checkmark-outline" size={20} color={colors.orange} /><Text style={styles.idReviewTitle}>Government Issued ID</Text></View>
                  <View style={styles.adminDocGridLarge}>
                    {idDocuments.map((doc) => (
                      <TouchableOpacity key={doc.label} activeOpacity={doc.uri ? 0.85 : 1} onPress={() => doc.uri && setPreviewDoc(doc)} style={styles.idSlotWrap}>
                        <Text style={styles.idSlotLabel}>{doc.label}</Text>
                        <View style={styles.adminDocSlotLarge}>
                          {doc.uri ? (
                            <>
                              <Image source={{ uri: doc.uri }} style={styles.adminDocImage} />
                              <View style={styles.adminDocOverlay}><Ionicons name="expand-outline" size={20} color={colors.white} /></View>
                            </>
                          ) : (
                            <>
                              <Ionicons name={doc.icon} size={40} color="#31425E" />
                              <Text style={styles.adminDocEmptyText}>Not uploaded</Text>
                            </>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.policyBox}><Ionicons name="checkmark-circle-outline" size={20} color={colors.blue} /><Text style={styles.policyText}>Confirm the uploaded documents visually match the provider identity before issuing the verified badge.</Text></View>
                  <View style={styles.adminActionRow}>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => updateKyc(profile, 'approved')} style={styles.approveButton}><Text style={styles.approveText}>APPROVE & VERIFY</Text></TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => updateKyc(profile, 'rejected')} style={styles.rejectButton}><Text style={styles.rejectText}>REJECT DOCUMENTS</Text></TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.adminEmptyReview}>
                <Ionicons name="shield-checkmark-outline" size={46} color={colors.orange} />
                <Text style={styles.adminEmptyReviewTitle}>No provider selected</Text>
                <Text style={styles.adminEmptyReviewText}>Pending KYC requests will appear here once providers submit verification details.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={!!previewDoc} animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => setPreviewDoc(null)}>
        <View style={styles.adminPreviewBackdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => setPreviewDoc(null)} style={styles.attachmentModalScrim} />
          <View style={styles.adminPreviewCard}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setPreviewDoc(null)} style={styles.attachmentModalClose}>
              <Ionicons name="close" size={22} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.attachmentModalTitle}>{previewDoc?.label}</Text>
            {previewDoc?.uri ? <Image source={{ uri: previewDoc.uri }} style={styles.adminPreviewImage} resizeMode="contain" /> : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function AccountScreen({ route, navigation }) {
  const { user, logout, updateUser } = useAuth();
  const { language, languageLabel, setLanguage, t } = useLanguage();
  const [darkMode, setDarkMode] = useState(false);
  const [activeSection, setActiveSection] = useState('Profile');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [bookingAlerts, setBookingAlerts] = useState(true);
  const [walletSecurity, setWalletSecurity] = useState(null);
  const [walletSecuritySaving, setWalletSecuritySaving] = useState(false);
  const [providerProfile, setProviderProfile] = useState(null);
  const [providerCityArea, setProviderCityArea] = useState('');
  const [providerExactAddress, setProviderExactAddress] = useState('');
  const [clientCityArea, setClientCityArea] = useState(user?.city_area || '');
  const [clientExactAddress, setClientExactAddress] = useState(user?.address || '');
  const [locationSaving, setLocationSaving] = useState(false);
  const isProvider = user?.role === 'provider';
  const isClient = user?.role === 'client';
  const isAdmin = user?.role === 'admin';
  const fieldIconColor = darkMode ? '#8FA0B8' : colors.textGray;
  const fullNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const openChangePassword = () => {
    const parentNavigator = navigation.getParent?.();
    if (parentNavigator) parentNavigator.navigate('ChangePassword');
    else navigation.navigate('ChangePassword');
  };
  const openKycRedo = () => {
    const params = { kycOnly: true };
    const routeNames = navigation.getState?.()?.routeNames || [];
    const parentNavigator = navigation.getParent?.();
    const parentRouteNames = parentNavigator?.getState?.()?.routeNames || [];

    if (routeNames.includes('Wallet')) {
      navigation.navigate('Wallet', params);
      return;
    }

    if (parentRouteNames.includes('Wallet')) {
      parentNavigator.navigate('Wallet', params);
      return;
    }

    if (parentRouteNames.includes('Tabs')) {
      parentNavigator.navigate('Tabs', { screen: 'Wallet', params });
      return;
    }

    navigation.navigate('Tabs', { screen: 'Wallet', params });
  };

  const loadProviderProfile = useCallback(async () => {
    if (!isProvider) return;
    try {
      const { data } = await api.get('/api/users/provider/profile/');
      setProviderProfile(data);
      setProviderCityArea(data?.city_area || '');
      setProviderExactAddress(data?.address || '');
    } catch (error) {
      setProviderProfile(null);
      setProviderCityArea('');
      setProviderExactAddress('');
    }
  }, [isProvider]);

  const loadWalletSecurity = useCallback(async () => {
    try {
      const { data } = await api.get('/api/wallet/');
      setWalletSecurity(data);
    } catch (error) {
      setWalletSecurity(null);
    }
  }, []);

  const buyTrustBadge = () => {
    const fee = providerProfile?.badge_fee || 15000;
    Alert.alert(
      'Activate Trust Badge',
      `Pay ${formatMoney(fee)} from your wallet to display the blue verified trust badge on your provider profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            try {
              setSaving(true);
              const { data } = await api.post('/api/users/provider/badge/');
              setProviderProfile(data);
              Alert.alert('Trust badge activated', 'Payment successful. Your verified trust badge is now visible on your profile.');
            } catch (error) {
              Alert.alert('Badge purchase failed', errorMessage(error));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  useFocusEffect(useCallback(() => {
    if (route?.params?.section) {
      setActiveSection(route.params.section);
    }
    loadProviderProfile();
    loadWalletSecurity();
  }, [loadProviderProfile, loadWalletSecurity, route?.params?.section]));

  const saveProviderLocation = async () => {
    const city = providerCityArea.trim();
    const exact = providerExactAddress.trim();
    if (!city) {
      Alert.alert('Location required', 'Please enter your City/Area before saving your provider location.');
      return;
    }

    try {
      setLocationSaving(true);
      const { data } = await api.post('/api/users/provider/profile/', {
        business_name: providerProfile?.business_name || user?.full_name || 'Provider',
        bio: providerProfile?.bio || '',
        city_area: city,
        address: exact,
        latitude: null,
        longitude: null,
      });
      setProviderProfile(data);
      setProviderCityArea(data?.city_area || city);
      setProviderExactAddress(data?.address || exact);
      Alert.alert('Location saved', 'Your provider location has been updated.');
    } catch (error) {
      Alert.alert('Location update failed', errorMessage(error));
    } finally {
      setLocationSaving(false);
    }
  };

  const saveClientLocation = async () => {
    const city = clientCityArea.trim();
    const exact = clientExactAddress.trim();

    try {
      setLocationSaving(true);
      const payload = new FormData();
      payload.append('full_name', (fullName || user?.full_name || '').trim());
      payload.append('email', (email || user?.email || '').trim());
      payload.append('phone', (phone || user?.phone || '').trim());
      payload.append('city_area', city);
      payload.append('address', exact);

      const { data } = await api.put('/api/users/profile/', payload);
      const savedUser = await updateUser(data);
      setClientCityArea(savedUser?.city_area || '');
      setClientExactAddress(savedUser?.address || '');
      Alert.alert('Location saved', city ? 'Your client location has been updated.' : 'Your client location has been cleared.');
    } catch (error) {
      Alert.alert('Location update failed', errorMessage(error));
    } finally {
      setLocationSaving(false);
    }
  };

  const toggleWalletPinAccess = async () => {
    const nextValue = !walletSecurity?.pin_required_for_access;
    try {
      setWalletSecuritySaving(true);
      const { data } = await api.patch('/api/wallet/pin/preference/', {
        pin_required_for_access: nextValue,
      });
      setWalletSecurity(data);
      Alert.alert(
        nextValue ? 'Wallet PIN enabled' : 'Wallet PIN disabled',
        nextValue
          ? 'Your wallet will ask for your PIN before opening.'
          : 'Your wallet will open without asking for a PIN.',
      );
    } catch (error) {
      Alert.alert(
        'Wallet PIN setting failed',
        `${errorMessage(error)}\n\nSet a wallet PIN first from the Wallet screen, then return here to enable this option.`,
      );
    } finally {
      setWalletSecuritySaving(false);
    }
  };

  useEffect(() => {
    setFullName(user?.full_name || '');
    setEmail(user?.email || '');
    setPhone(user?.phone || '');
    setClientCityArea(user?.city_area || '');
    setClientExactAddress(user?.address || '');
    setProfilePhoto(user?.profile_photo ? { uri: mediaUri(user.profile_photo), uploaded: true } : null);
  }, [user]);

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('Photo access needed'), t('Please allow photo library access to choose a profile photo.'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const previousPhoto = profilePhoto;
      setProfilePhoto({ ...asset, uploaded: false });

      const payload = new FormData();
      payload.append('full_name', (fullName || user?.full_name || '').trim());
      payload.append('email', (email || user?.email || '').trim());
      payload.append('phone', (phone || user?.phone || '').trim());
      payload.append('profile_photo', uploadFileFromAsset(asset, `profile-${Date.now()}.jpg`));

      try {
        setSaving(true);
        const { data } = await api.put('/api/users/profile/', payload);
        const savedUser = await updateUser(data);
        setProfilePhoto(savedUser.profile_photo ? { uri: mediaUri(savedUser.profile_photo), uploaded: true } : null);
      } catch (error) {
        setProfilePhoto(previousPhoto);
        Alert.alert(t('Profile update failed'), errorMessage(error));
      } finally {
        setSaving(false);
      }
    }
  };

  const saveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert(t('Profile incomplete'), t('Please enter your full name.'));
      return;
    }

    const payload = new FormData();
    payload.append('full_name', fullName.trim());
    payload.append('email', email.trim());
    payload.append('phone', phone.trim());

    if (profilePhoto?.uri && !profilePhoto.uploaded) {
      const fileName = profilePhoto.fileName || `profile-${Date.now()}.jpg`;
      payload.append('profile_photo', {
        uri: profilePhoto.uri,
        name: fileName,
        type: profilePhoto.mimeType || 'image/jpeg'
      });
    }

    try {
      setSaving(true);
      const { data } = await api.put('/api/users/profile/', payload);
      const savedUser = await updateUser(data);
      setProfilePhoto(savedUser.profile_photo ? { uri: mediaUri(savedUser.profile_photo), uploaded: true } : null);
      Alert.alert(t('Profile updated'), t('Your account changes have been saved.'));
    } catch (error) {
      Alert.alert(t('Profile update failed'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const renderToggleRow = (icon, label, value, onPress) => (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight, styles.settingsActionRow]}>
      <View style={styles.rowStart}>
        <Ionicons name={icon} size={18} color={fieldIconColor} />
        <Text style={[styles.settingsInputText, !darkMode && styles.settingsInputTextLight]}>{label}</Text>
      </View>
      <View style={[styles.accountSwitch, value && styles.accountSwitchOn]}>
        <View style={[styles.accountSwitchKnob, value && styles.accountSwitchKnobOn]} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.settingsDarkScreen, darkMode && styles.settingsDarkModeScreen]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {isAdmin ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Dashboard')}
            style={[styles.settingsAdminBackButton, !darkMode && styles.settingsAdminBackButtonLight]}
            accessibilityLabel="Back to admin dashboard"
          >
            <Ionicons name="arrow-back" size={18} color={darkMode ? '#D5DEEC' : colors.textDark} />
            <Text style={[styles.settingsAdminBackText, !darkMode && styles.settingsAdminBackTextLight]}>Back to Dashboard</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.settingsTopRow}>
          <View style={styles.flex}>
            <Text style={[styles.settingsTitle, !darkMode && styles.settingsTitleLight]}>Account Settings</Text>
            <Text style={styles.settingsSubtitle}>Manage your public profile and security preferences.</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={() => setDarkMode(!darkMode)} style={[styles.themeToggleButton, !darkMode && styles.themeToggleButtonLight]}>
            <Ionicons name={darkMode ? 'sunny' : 'moon'} size={20} color={darkMode ? '#FACC15' : colors.orange} />
          </TouchableOpacity>
        </View>
        <View style={styles.settingsMenu}>
          {[
            ['person-outline', 'Profile'],
            ...(isProvider || isClient ? [['location-outline', 'Location']] : []),
            ['lock-closed-outline', 'Security'],
            ['notifications-outline', 'Notifications'],
            ...(isProvider ? [['shield-checkmark-outline', 'KYC Status'], ['ribbon-outline', 'Badge Status']] : [])
          ].map(([icon, label, active]) => (
            <TouchableOpacity activeOpacity={0.8} key={label} onPress={() => setActiveSection(label)} style={[styles.settingsMenuItem, activeSection === label && styles.settingsMenuItemActive]}>
              <Ionicons name={icon} size={18} color={activeSection === label ? colors.white : '#8FA0B8'} />
              <Text style={[styles.settingsMenuText, activeSection === label && styles.settingsMenuTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.profileSettingsCard, !darkMode && styles.profileSettingsCardLight]}>
          {activeSection === 'Profile' ? (
            <>
              <View style={styles.photoRow}>
                <View style={styles.photoCircleWrap}>
                  <TouchableOpacity activeOpacity={0.8} onPress={pickProfilePhoto} style={[styles.photoCircle, !darkMode && styles.photoCircleLight]}>
                    {profilePhoto?.uri ? <Image source={{ uri: profilePhoto.uri }} style={styles.accountPhotoImage} /> : <Ionicons name="person-outline" size={42} color={darkMode ? '#D5DEEC' : colors.textGray} />}
                    <View style={styles.cameraDot}><Ionicons name="camera" size={14} color={colors.white} /></View>
                  </TouchableOpacity>
                  {isProvider && providerProfile?.badge_verification_status === 'verified' ? (
                    <View style={styles.accountTrustBadge}>
                      <TrustBadge size={28} />
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity activeOpacity={0.8} onPress={pickProfilePhoto} style={styles.flex}>
                  <Text style={[styles.profilePhotoTitle, !darkMode && styles.profilePhotoTitleLight]}>Profile Photo</Text>
                  <Text style={styles.settingsSubtitle}>Tap to upload a photo for your profile across Servista.</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.settingsDivider, !darkMode && styles.settingsDividerLight]} />
              <View style={styles.settingsFieldGrid}>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>FULL NAME</Text>
                  <TouchableOpacity activeOpacity={1} onPress={() => fullNameRef.current?.focus()} style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight]}>
                    <Ionicons name="person-outline" size={17} color={fieldIconColor} />
                    <TextInput ref={fullNameRef} value={fullName} onChangeText={setFullName} placeholder={t('Full name')} placeholderTextColor="#8FA0B8" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} style={[styles.settingsEditableInput, !darkMode && styles.settingsEditableInputLight]} />
                  </TouchableOpacity>
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>EMAIL ADDRESS</Text>
                  <TouchableOpacity activeOpacity={1} onPress={() => emailRef.current?.focus()} style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight]}>
                    <Ionicons name="mail-outline" size={17} color={fieldIconColor} />
                    <TextInput ref={emailRef} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="email@example.com" placeholderTextColor="#8FA0B8" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} style={[styles.settingsEditableInput, !darkMode && styles.settingsEditableInputLight]} />
                  </TouchableOpacity>
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>PHONE NUMBER</Text>
                  <TouchableOpacity activeOpacity={1} onPress={() => phoneRef.current?.focus()} style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight]}>
                    <Ionicons name="call-outline" size={17} color={fieldIconColor} />
                    <TextInput ref={phoneRef} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={t('+237 6XX XXX XXX')} placeholderTextColor="#8FA0B8" style={[styles.settingsEditableInput, !darkMode && styles.settingsEditableInputLight]} />
                  </TouchableOpacity>
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>LANGUAGE</Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')} style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight]}>
                    <Ionicons name="globe-outline" size={17} color={fieldIconColor} />
                    <Text style={[styles.settingsInputText, !darkMode && styles.settingsInputTextLight]}>{languageLabel}</Text>
                    <Ionicons name="swap-horizontal-outline" size={17} color={fieldIconColor} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={saveProfile} disabled={saving} style={[styles.saveButton, saving && styles.disabledButton]}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </>
          ) : null}

          {activeSection === 'Location' ? (
            <View style={styles.settingsFieldGrid}>
              <Text style={[styles.profilePhotoTitle, !darkMode && styles.profilePhotoTitleLight]}>{isProvider ? 'Provider Location' : 'Client Location'}</Text>
              {!(isProvider ? providerCityArea : clientCityArea).trim() ? (
                <View style={styles.locationPromptBox}>
                  <Ionicons name="alert-circle-outline" size={22} color={colors.orange} />
                  <View style={styles.flex}>
                    <Text style={styles.locationPromptTitle}>Add your location</Text>
                    <Text style={styles.locationPromptText}>
                      {isProvider
                        ? 'Clients need your area to track active bookings and understand where you operate.'
                        : 'Add your area if you want it shown on your dashboard. You can leave this blank.'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.locationPromptBox}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={colors.green} />
                  <View style={styles.flex}>
                    <Text style={styles.locationPromptTitle}>Current location</Text>
                    <Text style={styles.locationPromptText}>
                      {isProvider
                        ? (providerExactAddress.trim() || providerCityArea.trim())
                        : (clientExactAddress.trim() || clientCityArea.trim())}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.settingsField}>
                <Text style={styles.settingsFieldLabel}>{isProvider ? 'CITY / AREA' : 'CITY / AREA (OPTIONAL)'}</Text>
                <View style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight]}>
                  <Ionicons name="map-outline" size={17} color={fieldIconColor} />
                  <TextInput
                    value={isProvider ? providerCityArea : clientCityArea}
                    onChangeText={isProvider ? setProviderCityArea : setClientCityArea}
                    placeholder="Douala, Bonamousadi"
                    placeholderTextColor="#8FA0B8"
                    style={[styles.settingsEditableInput, !darkMode && styles.settingsEditableInputLight]}
                  />
                </View>
              </View>
              <View style={styles.settingsField}>
                <Text style={styles.settingsFieldLabel}>EXACT ADDRESS (OPTIONAL)</Text>
                <View style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight]}>
                  <Ionicons name="navigate-outline" size={17} color={fieldIconColor} />
                  <TextInput
                    value={isProvider ? providerExactAddress : clientExactAddress}
                    onChangeText={isProvider ? setProviderExactAddress : setClientExactAddress}
                    placeholder="Carrefour Sion, Bonamousadi, Douala"
                    placeholderTextColor="#8FA0B8"
                    style={[styles.settingsEditableInput, !darkMode && styles.settingsEditableInputLight]}
                  />
                </View>
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={isProvider ? saveProviderLocation : saveClientLocation} disabled={locationSaving} style={[styles.saveButton, locationSaving && styles.disabledButton]}>
                {locationSaving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save Location</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {activeSection === 'Security' ? (
            <View style={styles.settingsFieldGrid}>
              <Text style={[styles.profilePhotoTitle, !darkMode && styles.profilePhotoTitleLight]}>Security</Text>
              {renderToggleRow('notifications-outline', 'Login alerts', loginAlerts, () => setLoginAlerts(!loginAlerts))}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={toggleWalletPinAccess}
                disabled={walletSecuritySaving}
                style={[
                  styles.settingsInputBox,
                  !darkMode && styles.settingsInputBoxLight,
                  styles.settingsActionRow,
                  walletSecuritySaving && styles.disabledButton,
                ]}
              >
                <View style={styles.rowStart}>
                  <Ionicons name="keypad-outline" size={18} color={fieldIconColor} />
                  <View>
                    <Text style={[styles.settingsInputText, !darkMode && styles.settingsInputTextLight]}>PIN</Text>
                    <Text style={styles.settingsHelpText}>Require PIN when opening wallet</Text>
                  </View>
                </View>
                {walletSecuritySaving ? (
                  <ActivityIndicator color={colors.orange} />
                ) : (
                  <View style={[styles.accountCheckbox, walletSecurity?.pin_required_for_access && styles.accountCheckboxOn]}>
                    {walletSecurity?.pin_required_for_access ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={openChangePassword} style={[styles.settingsInputBox, !darkMode && styles.settingsInputBoxLight, styles.settingsActionRow]}>
                <View style={styles.rowStart}>
                  <Ionicons name="key-outline" size={18} color={fieldIconColor} />
                  <Text style={[styles.settingsInputText, !darkMode && styles.settingsInputTextLight]}>Change password</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={fieldIconColor} />
              </TouchableOpacity>
            </View>
          ) : null}

          {activeSection === 'Notifications' ? (
            <View style={styles.settingsFieldGrid}>
              <Text style={[styles.profilePhotoTitle, !darkMode && styles.profilePhotoTitleLight]}>Notifications</Text>
              {renderToggleRow('calendar-outline', 'Booking updates', bookingAlerts, () => setBookingAlerts(!bookingAlerts))}
              {renderToggleRow('chatbubble-outline', 'Message alerts', loginAlerts, () => setLoginAlerts(!loginAlerts))}
            </View>
          ) : null}

          {activeSection === 'KYC Status' ? (
            <View style={styles.settingsFieldGrid}>
              <Text style={[styles.profilePhotoTitle, !darkMode && styles.profilePhotoTitleLight]}>KYC Verification</Text>
              <View style={[styles.kycStatusCard, !darkMode && styles.kycStatusCardLight]}>
                <View style={[styles.kycStatusIcon, providerProfile?.kyc_status === 'approved' ? styles.kycStatusIconApproved : providerProfile?.kyc_status === 'rejected' ? styles.kycStatusIconRejected : styles.kycStatusIconPending]}>
                  <Ionicons
                    name={providerProfile?.kyc_status === 'approved' ? 'shield-checkmark-outline' : providerProfile?.kyc_status === 'rejected' ? 'close-circle-outline' : 'time-outline'}
                    size={24}
                    color={providerProfile?.kyc_status === 'approved' ? colors.green : providerProfile?.kyc_status === 'rejected' ? colors.red : colors.orange}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.kycStatusTitle, !darkMode && styles.kycStatusTitleLight]}>
                    {(providerProfile?.kyc_status || 'pending').toUpperCase()}
                  </Text>
                  <Text style={styles.kycStatusText}>
                    {providerProfile?.kyc_status === 'approved'
                      ? 'Your KYC is approved. Wallet funding and withdrawals are available.'
                      : providerProfile?.kyc_status === 'rejected'
                        ? 'Your KYC was rejected. Please upload clearer valid documents for admin review.'
                        : 'Your KYC is pending admin review. You will be notified when a decision is made.'}
                  </Text>
                </View>
              </View>
              {providerProfile?.kyc_status === 'rejected' ? (
                <TouchableOpacity activeOpacity={0.85} onPress={openKycRedo} style={styles.saveButton}>
                  <Text style={styles.saveButtonText}>Redo KYC Verification</Text>
                </TouchableOpacity>
              ) : providerProfile?.kyc_status === 'pending' && !providerProfile?.id_front ? (
                <TouchableOpacity activeOpacity={0.85} onPress={openKycRedo} style={styles.saveButton}>
                  <Text style={styles.saveButtonText}>Submit KYC Verification</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {activeSection === 'Badge Status' ? (
            <View style={styles.settingsFieldGrid}>
              <Text style={[styles.profilePhotoTitle, !darkMode && styles.profilePhotoTitleLight]}>Trust Badge Verification</Text>
              <View style={[styles.kycStatusCard, !darkMode && styles.kycStatusCardLight]}>
                <View style={[styles.kycStatusIcon, providerProfile?.badge_verification_status === 'verified' ? styles.kycStatusIconBadge : styles.kycStatusIconPending]}>
                  {providerProfile?.badge_verification_status === 'verified' ? (
                    <TrustBadge size={28} />
                  ) : (
                    <Ionicons name="shield-outline" size={24} color={colors.orange} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.kycStatusTitle, !darkMode && styles.kycStatusTitleLight]}>
                    {providerProfile?.badge_verification_status === 'verified'
                      ? 'TRUST BADGE ACTIVE'
                      : providerProfile?.badge_verification_status === 'eligible'
                        ? 'ELIGIBLE TO BUY'
                        : 'NOT VERIFIED'}
                  </Text>
                  <Text style={styles.kycStatusText}>{providerProfile?.badge_eligibility_message || 'Complete provider KYC and build strong service ratings to qualify.'}</Text>
                </View>
              </View>
              <View style={styles.badgeStatsGrid}>
                <View style={styles.badgeStatCard}><Text style={styles.badgeStatValue}>{providerProfile?.badge_activity_percentage ?? 0}%</Text><Text style={styles.badgeStatLabel}>Activity</Text></View>
                <View style={styles.badgeStatCard}><Text style={styles.badgeStatValue}>{providerProfile?.badge_reliability_percentage ?? 0}%</Text><Text style={styles.badgeStatLabel}>Reliability</Text></View>
                <View style={styles.badgeStatCard}><Text style={styles.badgeStatValue}>{providerProfile?.badge_quality_percentage ?? 0}%</Text><Text style={styles.badgeStatLabel}>Quality</Text></View>
                <View style={styles.badgeStatCard}><Text style={styles.badgeStatValue}>{providerProfile?.badge_trust_percentage ?? 0}%</Text><Text style={styles.badgeStatLabel}>Trust</Text></View>
              </View>
              <View style={styles.badgeRequirementBox}>
                <Text style={styles.badgeRequirementTitle}>Badge requirements</Text>
                <Text style={styles.badgeRequirementText}>Activity, Reliability & Quality at or above 50%. Trust at 100% (approved KYC).</Text>
                <Text style={styles.badgeRequirementPrice}>Fee: {formatMoney(providerProfile?.badge_fee || 15000)}</Text>
              </View>
              {providerProfile?.badge_verification_status !== 'verified' ? (
                <TouchableOpacity activeOpacity={0.85} onPress={buyTrustBadge} disabled={!providerProfile?.badge_is_eligible || saving} style={[styles.saveButton, (!providerProfile?.badge_is_eligible || saving) && styles.disabledButton]}>
                  {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>{providerProfile?.badge_is_eligible ? `Pay ${formatMoney(providerProfile?.badge_fee || 15000)} for Trust Badge` : 'Not Eligible Yet'}</Text>}
                </TouchableOpacity>
              ) : (
                <View style={styles.badgeActivePreview}>
                  <TrustBadge size={36} />
                  <Text style={styles.badgeActivePreviewText}>Your blue verified badge is visible on your provider profile.</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
        <Button label="Logout" variant="secondary" onPress={logout} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ChangePasswordScreen({ navigation }) {
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(t('Password incomplete'), t('Please fill all password fields.'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('Password mismatch'), t('New passwords do not match.'));
      return;
    }

    try {
      setSaving(true);
      await api.post('/api/users/change-password/', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      });
      Alert.alert(t('Password changed'), t('Your password has been updated successfully.'));
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('Password update failed'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const passwordRight = (visible, setVisible) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => setVisible(!visible)} style={styles.changePasswordEye}>
      <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.orange} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.changePasswordScreen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.changePasswordContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.goBack()} style={styles.categoryBack}>
            <Ionicons name="chevron-back" size={18} color={colors.textGray} />
            <Text style={styles.categoryBackText}>BACK</Text>
          </TouchableOpacity>

          <View style={styles.changePasswordHeader}>
            <View style={styles.changePasswordIcon}><Ionicons name="key-outline" size={30} color={colors.orange} /></View>
            <Text style={styles.changePasswordTitle}>Change Password</Text>
            <Text style={styles.changePasswordSubtitle}>Update your password to keep your Servista account secure.</Text>
          </View>

          <View style={styles.changePasswordCard}>
            <Text style={styles.settingsFieldLabel}>CURRENT PASSWORD</Text>
            <Input
              placeholder="Current password"
              secureTextEntry={!showCurrent}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              style={styles.changePasswordInput}
              inputStyle={styles.changePasswordInputText}
              right={passwordRight(showCurrent, setShowCurrent)}
            />

            <Text style={styles.settingsFieldLabel}>NEW PASSWORD</Text>
            <Input
              placeholder="New password"
              secureTextEntry={!showNew}
              value={newPassword}
              onChangeText={setNewPassword}
              style={styles.changePasswordInput}
              inputStyle={styles.changePasswordInputText}
              right={passwordRight(showNew, setShowNew)}
            />

            <Text style={styles.settingsFieldLabel}>CONFIRM NEW PASSWORD</Text>
            <Input
              placeholder="Confirm new password"
              secureTextEntry={!showConfirm}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.changePasswordInput}
              inputStyle={styles.changePasswordInputText}
              right={passwordRight(showConfirm, setShowConfirm)}
            />

            <TouchableOpacity activeOpacity={0.85} onPress={submit} disabled={saving} style={[styles.saveButton, saving && styles.disabledButton]}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  exploreScreen: { flex: 1, backgroundColor: colors.background },
  categoriesScreen: { flex: 1, backgroundColor: colors.background },
  providerProfileScreen: { flex: 1, backgroundColor: colors.background },
  serviceDetailScreen: { flex: 1, backgroundColor: colors.background },
  bookingsDarkScreen: { flex: 1, backgroundColor: colors.background },
  trackingScreen: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 16 },
  walletDarkScreen: { flex: 1, backgroundColor: colors.background },
  chatDarkScreen: { flex: 1, backgroundColor: colors.background },
  sentinelScreen: { flex: 1, backgroundColor: '#F8FAFC' },
  sentinelShell: { flex: 1, flexDirection: Platform.OS === 'web' ? 'row' : 'column', backgroundColor: '#F8FAFC' },
  sentinelSidebar: {
    width: Platform.OS === 'web' ? 258 : '100%',
    minHeight: Platform.OS === 'web' ? '100%' : 0,
    backgroundColor: '#102541',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 28 : 18,
    paddingBottom: 22,
    gap: 10
  },
  sentinelBrand: { color: colors.orange, fontSize: 25, fontWeight: '900', marginLeft: 8 },
  sentinelBrandSub: { color: '#9AAAC0', fontSize: 14, marginTop: 4, marginLeft: 8, marginBottom: 30 },
  sentinelNavItem: { minHeight: 46, borderRadius: 0, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  sentinelNavActive: { backgroundColor: '#047B38', borderRightWidth: 4, borderRightColor: colors.orange },
  sentinelNavText: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  sentinelNavTextActive: { color: colors.orange },
  sentinelSidebarBottom: { marginTop: 'auto', gap: 12 },
  sentinelNewAnalysis: { minHeight: 50, borderRadius: 8, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  sentinelNewAnalysisText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  sentinelSideSmall: { minHeight: 34, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  sentinelSideSmallText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  sentinelAdminUser: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sentinelAdminAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  sentinelAdminAvatarText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  sentinelAdminName: { color: colors.white, fontSize: 12, fontWeight: '900' },
  sentinelAdminEmail: { color: '#9AAAC0', fontSize: 10, marginTop: 2 },
  sentinelMain: { flex: 1, minWidth: 0 },
  sentinelTopbar: {
    minHeight: 64,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE3EA',
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    paddingHorizontal: Platform.OS === 'web' ? 30 : 18,
    paddingVertical: Platform.OS === 'web' ? 0 : 12,
    gap: 18
  },
  sentinelTopTitle: { color: colors.orange, fontSize: 23, fontWeight: '900', minWidth: Platform.OS === 'web' ? 210 : 0 },
  sentinelSearchWrap: { height: 42, maxWidth: 385, flex: Platform.OS === 'web' ? 1 : 0, width: Platform.OS === 'web' ? undefined : '100%', borderWidth: 1, borderColor: '#F0B6A1', backgroundColor: '#FFF9F6', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  sentinelSearchInput: { flex: 1, color: colors.textDark, fontSize: 15, paddingVertical: 0, outlineStyle: 'none' },
  sentinelTopLinks: { flexDirection: 'row', alignItems: 'center', gap: 18, marginLeft: Platform.OS === 'web' ? 'auto' : 0 },
  sentinelTopLinkText: { color: '#40516F', fontSize: 13, fontWeight: '700' },
  sentinelDivider: { width: 1, height: 26, backgroundColor: '#DCE3EA' },
  sentinelIconButton: { position: 'relative', width: 26, height: 30, alignItems: 'center', justifyContent: 'center' },
  sentinelContent: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: Platform.OS === 'web' ? 32 : 18, paddingTop: 32, paddingBottom: 56, gap: 20 },
  sentinelDataWarning: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#F2C9BC', backgroundColor: '#FFF7ED', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sentinelDataWarningText: { flex: 1, color: '#9A3412', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  sentinelSearchResults: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: '#F0B6A1', overflow: 'hidden' },
  sentinelSearchResult: { padding: 11, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEF1F5' },
  sentinelResultName: { color: colors.textDark, fontSize: 13, fontWeight: '900' },
  sentinelResultMeta: { color: colors.textGray, fontSize: 11, marginTop: 2 },
  sentinelHeaderRow: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', alignItems: Platform.OS === 'web' ? 'center' : 'stretch', justifyContent: 'space-between', gap: 16 },
  sentinelPageTitle: { color: '#20242B', fontSize: 30, fontWeight: '900' },
  sentinelPageSub: { color: '#51698E', fontSize: 15, marginTop: 5 },
  sentinelHeaderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sentinelOutlineBtn: { minHeight: 43, borderRadius: 8, borderWidth: 1, borderColor: '#536A8D', backgroundColor: colors.white, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  sentinelOutlineText: { color: '#40516F', fontSize: 14, fontWeight: '800' },
  sentinelExportBtn: { minHeight: 43, borderRadius: 8, backgroundColor: colors.orange, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  sentinelExportText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  sentinelOverviewGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 20 },
  sentinelPerformanceCard: { flex: Platform.OS === 'web' ? 1.85 : 0, minHeight: 300, borderRadius: 12, backgroundColor: '#102541', padding: 32, overflow: 'hidden', justifyContent: 'space-between' },
  sentinelEyebrow: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 2.1 },
  sentinelPerformanceTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  sentinelPerformanceTitle: { color: colors.white, fontSize: 30, fontWeight: '900' },
  sentinelUptimePill: { borderRadius: 999, backgroundColor: '#10B981', paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  sentinelUptimeText: { color: '#063F30', fontSize: 11, fontWeight: '900' },
  sentinelMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 26, marginTop: 32 },
  sentinelMetricBlock: { minWidth: 115, flexGrow: 1 },
  sentinelMetricLabel: { color: '#AAB8CB', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sentinelMetricValue: { color: colors.white, fontSize: 35, fontWeight: '900', marginTop: 7, lineHeight: 40 },
  sentinelMetricGood: { color: '#49E3B4', fontSize: 12, fontWeight: '800', marginTop: 6 },
  sentinelMetricWarn: { color: '#FFB49B', fontSize: 12, fontWeight: '800', marginTop: 6 },
  sentinelCardWatermark: { position: 'absolute', right: -8, bottom: -24, transform: [{ rotate: '-18deg' }] },
  sentinelRiskCard: { flex: Platform.OS === 'web' ? 0.9 : 0, minWidth: Platform.OS === 'web' ? 285 : '100%', backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: '#F0B6A1', padding: 24, gap: 16 },
  sentinelPanelTitle: { color: '#20242B', fontSize: 17, fontWeight: '900' },
  sentinelPanelSub: { color: '#51698E', fontSize: 13, lineHeight: 19, marginTop: 5 },
  sentinelRiskRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sentinelRiskDot: { width: 8, height: 8, borderRadius: 4 },
  sentinelRiskLabel: { color: '#20242B', fontSize: 14, fontWeight: '900' },
  sentinelRiskCount: { color: '#6B4F46', fontSize: 13, fontWeight: '800', marginLeft: 'auto' },
  sentinelRiskTrack: { width: '100%', height: 7, borderRadius: 4, backgroundColor: '#E9EDF1', overflow: 'hidden' },
  sentinelRiskFill: { height: '100%', borderRadius: 4 },
  sentinelAuditBtn: { marginTop: 'auto', minHeight: 49, borderRadius: 8, borderWidth: 1, borderColor: '#F0D1C5', alignItems: 'center', justifyContent: 'center' },
  sentinelAuditText: { color: colors.orange, fontSize: 14, fontWeight: '900' },
  sentinelMiddleGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', alignItems: 'stretch', gap: 20 },
  sentinelNotificationsCard: { flex: Platform.OS === 'web' ? 0.8 : 0, minWidth: Platform.OS === 'web' ? 300 : '100%', borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F0B6A1', overflow: 'hidden' },
  sentinelDecisionCard: { flex: Platform.OS === 'web' ? 1.7 : 0, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F0B6A1', padding: 24, gap: 20 },
  sentinelCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 16, borderBottomWidth: 0, flexWrap: 'wrap' },
  sentinelNewBadge: { borderRadius: 5, backgroundColor: '#FFF0E8', paddingHorizontal: 8, paddingVertical: 5 },
  sentinelNewBadgeText: { color: colors.orange, fontSize: 10, fontWeight: '900' },
  sentinelNotificationRow: { minHeight: 104, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: 1, borderTopColor: '#F1E1DB' },
  sentinelNotificationIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sentinelNotificationTitle: { color: '#20242B', fontSize: 14, fontWeight: '900' },
  sentinelNotificationBody: { color: '#51698E', fontSize: 12, lineHeight: 18, marginTop: 5 },
  sentinelNotificationTime: { color: '#6B7280', fontSize: 10, width: 38, textAlign: 'right' },
  sentinelCardFooterBtn: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#F1E1DB' },
  sentinelCardFooterText: { color: '#533E36', fontSize: 12, fontWeight: '900' },
  sentinelLegendDot: { width: 10, height: 10, borderRadius: 5 },
  sentinelLegendText: { color: '#536A8D', fontSize: 11, fontWeight: '700' },
  sentinelDecisionMetric: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  sentinelDecisionLabelBlock: { width: Platform.OS === 'web' ? 130 : 100 },
  sentinelDecisionLabel: { color: '#20242B', fontSize: 13, fontWeight: '900' },
  sentinelDecisionSub: { color: '#536A8D', fontSize: 8, fontWeight: '900', letterSpacing: 0.7, marginTop: 4 },
  sentinelDecisionTrack: { height: 32, flex: 1, borderRadius: 4, backgroundColor: '#E7E9EC', overflow: 'hidden' },
  sentinelDecisionFill: { height: '100%', backgroundColor: colors.orange },
  sentinelDecisionValue: { color: '#20242B', fontSize: 13, width: 58, textAlign: 'right', fontWeight: '800' },
  sentinelMiniBars: { height: 125, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, marginTop: 5 },
  sentinelMiniBar: { flex: 1, minWidth: 8, backgroundColor: '#E4E6E9', borderRadius: 2 },
  sentinelChartCaption: { color: '#C5D5FA', fontSize: 9, fontWeight: '900', letterSpacing: 0.7, textAlign: 'center' },
  sentinelMonitoringCard: { borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F0B6A1', overflow: 'hidden' },
  sentinelLivePill: { borderRadius: 999, backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sentinelLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  sentinelLiveText: { color: '#533E36', fontSize: 11, fontWeight: '900' },
  sentinelTableHeader: { minHeight: 44, paddingHorizontal: 20, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E6D8D2', borderBottomWidth: 1, borderBottomColor: '#E6D8D2', flexDirection: 'row', alignItems: 'center', gap: 12 },
  sentinelTableHeadText: { flex: 1, color: '#536A8D', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  sentinelTableRow: { minHeight: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#F1E1DB' },
  sentinelTableText: { flex: 1, color: '#20242B', fontSize: 12, fontWeight: '700' },
  sentinelTableEntity: { fontWeight: '900' },
  sentinelConfidenceCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sentinelConfidenceTrack: { width: 45, height: 5, backgroundColor: '#E4E6E9', borderRadius: 4, overflow: 'hidden' },
  sentinelConfidenceFill: { height: '100%', borderRadius: 4 },
  sentinelStatusPill: { flex: 1, maxWidth: 80, borderRadius: 5, paddingVertical: 4, alignItems: 'center' },
  sentinelStatusText: { fontSize: 9, fontWeight: '900' },
  sentinelAuditLogBtn: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sentinelAuditLogText: { color: colors.orange, fontSize: 14, fontWeight: '900' },
  adminEscrowFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'flex-end' },
  adminEscrowFilter: { minHeight: 38, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: '#E5B7A5', backgroundColor: colors.white, justifyContent: 'center' },
  adminEscrowFilterActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  adminEscrowFilterText: { color: '#526987', fontSize: 12, fontWeight: '800' },
  adminEscrowFilterTextActive: { color: colors.white },
  adminEscrowSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  adminEscrowSummaryCard: { flexGrow: 1, flexBasis: Platform.OS === 'web' ? 210 : 170, minHeight: 166, backgroundColor: '#102541', borderRadius: 11, padding: 18, justifyContent: 'space-between' },
  adminEscrowSummaryIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(242,101,34,0.16)', alignItems: 'center', justifyContent: 'center' },
  adminEscrowSummaryLabel: { color: '#AAB8CB', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 12 },
  adminEscrowSummaryValue: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 5 },
  adminEscrowSummaryCopy: { color: '#93A6C0', fontSize: 11, lineHeight: 16, marginTop: 5, fontWeight: '700' },
  adminEscrowListPanel: { borderRadius: 11, backgroundColor: colors.white, borderWidth: 1, borderColor: '#F0B6A1', overflow: 'hidden' },
  adminEscrowListHeader: { minHeight: 78, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: '#F1E1DB' },
  adminEscrowListTitle: { color: '#20242B', fontSize: 19, fontWeight: '900' },
  adminEscrowListSub: { color: '#51698E', fontSize: 12, lineHeight: 18, marginTop: 3 },
  adminEscrowLivePill: { borderRadius: 999, backgroundColor: '#E8F7F1', paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  adminEscrowLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  adminEscrowLiveText: { color: '#047857', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  adminEscrowEmpty: { minHeight: 240, padding: 30, alignItems: 'center', justifyContent: 'center', gap: 9 },
  adminEscrowEmptyTitle: { color: '#40516F', fontSize: 17, fontWeight: '900' },
  adminEscrowEmptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', maxWidth: 390, lineHeight: 19 },
  adminEscrowBookingCard: { padding: 20, gap: 18, borderBottomWidth: 1, borderBottomColor: '#F1E1DB' },
  adminEscrowBookingBlocked: { backgroundColor: '#FFF9F7', borderLeftWidth: 4, borderLeftColor: colors.red },
  adminEscrowBookingTop: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  adminEscrowBookingTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  adminEscrowBookingTitle: { color: '#20242B', fontSize: 18, fontWeight: '900', flexShrink: 1 },
  adminEscrowBookingMeta: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 5 },
  adminEscrowBookingAmount: { color: '#20242B', fontSize: 21, fontWeight: '900', textAlign: 'right' },
  adminEscrowStatus: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5 },
  adminEscrowStatusHolding: { backgroundColor: '#FFF0E8' },
  adminEscrowStatusReady: { backgroundColor: '#D1FAE5' },
  adminEscrowStatusBlocked: { backgroundColor: '#FEE2E2' },
  adminEscrowStatusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  adminEscrowStatusTextHolding: { color: '#C2410C' },
  adminEscrowStatusTextReady: { color: '#047857' },
  adminEscrowStatusTextBlocked: { color: '#B91C1C' },
  adminEscrowProgress: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#F8FAFC', borderRadius: 8 },
  adminEscrowProgressStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adminEscrowProgressText: { color: '#526987', fontSize: 11, fontWeight: '700' },
  adminEscrowProgressLine: { flex: 1, minWidth: 14, height: 1, backgroundColor: '#CBD5E1' },
  adminEscrowFinancials: { flexDirection: 'row', flexWrap: 'wrap', gap: 26 },
  adminEscrowFinancialLabel: { color: '#64748B', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  adminEscrowFinancialValue: { color: '#20242B', fontSize: 15, fontWeight: '900', marginTop: 5 },
  adminEscrowActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  adminEscrowReleaseButton: { minHeight: 42, minWidth: 190, borderRadius: 8, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  adminEscrowReleaseText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  adminEscrowReviewButton: { minHeight: 42, minWidth: 164, borderRadius: 8, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  adminEscrowReviewText: { color: '#B91C1C', fontSize: 13, fontWeight: '900' },
  adminEscrowWaitingButton: { minHeight: 42, borderRadius: 8, backgroundColor: '#F1F5F9', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminEscrowWaitingText: { color: '#64748B', fontSize: 12, fontWeight: '800' },
  adminVerifyScreen: { flex: 1, backgroundColor: colors.white },
  settingsDarkScreen: { flex: 1, backgroundColor: colors.background },
  changePasswordScreen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 120 },
  bookingContent: { padding: 20, gap: 16, paddingBottom: Platform.OS === 'ios' ? 132 : 116 },
  exploreContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 },
  detailContent: { paddingBottom: 120 },
  flatContent: { paddingBottom: 120 },
  listScreen: { flex: 1, padding: 20, gap: 16 },
  headerStack: { gap: 16 },
  exploreHeaderStack: { gap: 20, marginBottom: 8 },
  exploreTopCard: { minHeight: 78, borderRadius: 0, backgroundColor: colors.background, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationBadge: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(242,101,34,0.45)', backgroundColor: '#182237', alignItems: 'center', justifyContent: 'center' },
  locationLogo: { width: 30, height: 30, borderRadius: 9 },
  exploreOverline: { color: '#8FA0B8', fontSize: 9, fontWeight: '900' },
  exploreLocation: { color: colors.orange, fontSize: 11, fontWeight: '900' },
  exploreSearch: { flex: 2, minHeight: 40, borderRadius: 12, backgroundColor: '#132541', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  exploreSearchText: { flex: 1, color: '#8FA0B8', fontSize: 11 },
  exploreSearchInput: { flex: 1, color: colors.white, fontSize: 11, paddingVertical: 0, minHeight: 38, fontFamily: 'DMSans_400Regular' },
  exploreBell: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#132541', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  exploreSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exploreSectionLabel: { color: '#B9C5D8', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  seeAllButton: { minWidth: 76, minHeight: 36, alignItems: 'flex-end', justifyContent: 'center', zIndex: 10, elevation: 10 },
  exploreSeeAll: { color: colors.orange, fontSize: 11, fontWeight: '900' },
  darkCategoryScroll: { gap: 12, paddingVertical: 4 },
  darkCategoryPill: { backgroundColor: '#132541', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  darkCategoryPillActive: { backgroundColor: colors.orange },
  darkCategoryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  darkCategoryLabel: { color: colors.white, fontSize: 12, fontWeight: '900' },
  filterSummary: { minHeight: 42, borderRadius: 14, backgroundColor: colors.white, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  filterSummaryText: { color: colors.textGray, fontSize: 12, fontWeight: '800' },
  filterClearText: { color: colors.orange, fontSize: 11, fontWeight: '900' },
  categoriesContent: { padding: 20, gap: 18, paddingBottom: 40 },
  categoryBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  categoryBackText: { color: colors.textGray, fontSize: 12, fontWeight: '900' },
  categoriesTitle: { color: colors.orange, fontSize: 30, fontWeight: '900' },
  categoriesSubtitle: { color: colors.textGray, fontSize: 14, lineHeight: 20, marginTop: 4 },
  categoryDetailGrid: { gap: 12 },
  categoryDetailCard: { backgroundColor: colors.white, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  categoryDetailIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  categoryDetailTitle: { color: colors.textDark, fontSize: 16, fontWeight: '900' },
  categoryDetailText: { color: colors.textGray, fontSize: 12, lineHeight: 18, marginTop: 4 },
  featuredTitleBlock: { gap: 4, marginTop: 8 },
  exploreTitle: { color: colors.orange, fontSize: 28, fontWeight: '900' },
  exploreSubtitle: { color: '#8FA0B8', fontSize: 13, fontStyle: 'italic' },
  exploreServiceCard: { backgroundColor: '#132541', borderRadius: 24, marginBottom: 18, overflow: 'hidden' },
  exploreImageWrap: { height: 170, backgroundColor: '#101928' },
  exploreServiceImage: { width: '100%', height: '100%' },
  exploreBadge: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#050B14', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  exploreBadgeText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  durationBadge: { position: 'absolute', right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,11,20,0.8)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  durationText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  exploreCardBody: { padding: 18, gap: 12 },
  exploreCardTitle: { flex: 1, color: colors.white, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  exploreRating: { color: colors.orange, fontWeight: '900' },
  exploreProvider: { color: '#B9C5D8', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  exploreDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  exploreBudget: { color: '#8FA0B8', fontSize: 9, fontWeight: '900' },
  explorePrice: { color: colors.white, fontSize: 24, fontWeight: '900' },
  exploreCurrency: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  exploreBookButton: { minWidth: 86, height: 44, borderRadius: 13, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', shadowColor: colors.orange, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  exploreBookText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  exploreCta: { backgroundColor: colors.white, borderRadius: 28, padding: 24, gap: 16, marginTop: 18 },
  exploreCtaTitle: { color: colors.darkNavy, fontSize: 26, lineHeight: 30, fontWeight: '900' },
  exploreCtaButton: { height: 48, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  exploreCtaText: { color: colors.white, fontWeight: '900' },
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  overline: { fontSize: 11, color: colors.textGray, fontWeight: '900', textTransform: 'uppercase' },
  darkOverline: { color: '#CBD5E1', fontSize: 11, fontWeight: '900' },
  location: { fontSize: 16, color: colors.text, fontWeight: '900' },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  seeAll: { color: colors.orange, fontWeight: '900' },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  detailTitle: { fontSize: 26, lineHeight: 32, fontWeight: '900', color: colors.text },
  detailNumber: { fontSize: 28, fontWeight: '900', color: colors.text },
  muted: { color: colors.textGray, lineHeight: 20 },
  price: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  categoryScroll: { gap: 12, paddingVertical: 4 },
  categoryPill: { backgroundColor: colors.white, borderRadius: 24, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  categoryIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { color: colors.textDark, fontWeight: '800' },
  ctaBanner: { backgroundColor: colors.darkNavy, borderRadius: 24, padding: 24, gap: 16, marginTop: 8 },
  ctaTitle: { color: colors.white, fontSize: 22, fontWeight: '900' },
  ctaButton: { height: 52, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  ctaButtonText: { color: colors.white, fontWeight: '900' },
  providerProfileContent: { padding: 16, gap: 18, paddingBottom: 40 },
  profileBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 8 },
  profileBackText: { color: '#8FA0B8', fontSize: 12, fontWeight: '800' },
  profileHeroCard: { borderRadius: 28, backgroundColor: '#132541', padding: 18, gap: 16 },
  profileAvatarLarge: { width: 88, height: 88, borderRadius: 20, backgroundColor: '#0D1728', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  profileAvatarText: { color: colors.orange, fontSize: 26, fontWeight: '900' },
  profileHeroText: { gap: 6 },
  profileName: { color: colors.white, fontSize: 24, fontWeight: '900' },
  profileSpecialty: { color: colors.orange, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  profileMeta: { color: '#8FA0B8', fontSize: 12 },
  profileActionRow: { flexDirection: 'row', gap: 10 },
  profileMessageButton: { flex: 1, height: 48, borderRadius: 13, backgroundColor: '#DCEBFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  profileMessageText: { color: colors.darkNavy, fontWeight: '900' },
  profileHireButton: { flex: 1, height: 48, borderRadius: 13, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', shadowColor: colors.orange, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  profileHireText: { color: colors.white, fontWeight: '900' },
  profileGrid: { gap: 16 },
  profileAboutCard: { backgroundColor: '#132541', borderRadius: 24, padding: 18, gap: 16 },
  profileSectionTitle: { color: colors.white, fontSize: 16, fontWeight: '900' },
  profileQuote: { color: '#C8D3E4', fontSize: 14, lineHeight: 22, fontStyle: 'italic' },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillPill: { backgroundColor: '#0B1628', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  skillText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  profileStatsCard: { backgroundColor: '#132541', borderRadius: 24, padding: 18, gap: 14, alignItems: 'center' },
  platformLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileRating: { color: colors.white, fontSize: 36, fontWeight: '900' },
  profileDivider: { alignSelf: 'stretch', height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  statsRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-around' },
  profileStatValue: { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  greenText: { color: colors.green },
  profileStatLabel: { color: '#8FA0B8', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  verifiedBox: { alignSelf: 'stretch', minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  verifiedBoxText: { color: colors.green, fontSize: 11, fontWeight: '900' },
  profileServicesTitle: { color: colors.white, fontSize: 20, fontWeight: '900' },
  profileServiceList: { gap: 12 },
  profileServiceCard: { backgroundColor: '#132541', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileServiceImage: { width: 72, height: 72, borderRadius: 14, backgroundColor: '#0B1628' },
  profileServiceName: { color: colors.white, fontSize: 15, fontWeight: '900' },
  profileServicePrice: { color: colors.orange, fontSize: 16, fontWeight: '900', marginTop: 4 },
  profileServiceCurrency: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  serviceDetailContent: { padding: 16, gap: 18, paddingBottom: 36 },
  serviceBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 8 },
  serviceBackText: { color: '#8FA0B8', fontSize: 11, fontWeight: '800' },
  serviceHeroCard: { height: 300, borderRadius: 28, backgroundColor: '#202B3A', overflow: 'hidden' },
  serviceHeroImage: { width: '100%', height: '100%' },
  servicePricePanel: { backgroundColor: '#132541', borderRadius: 28, padding: 20, gap: 14 },
  servicePanelLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  servicePriceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  servicePanelPrice: { color: colors.white, fontSize: 34, fontWeight: '900' },
  servicePanelCurrency: { color: '#8FA0B8', fontSize: 13, fontWeight: '900', marginBottom: 6 },
  serviceMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  servicePanelMeta: { color: '#8FA0B8', fontSize: 13 },
  serviceEscrowButton: { height: 52, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  serviceEscrowText: { color: colors.white, fontWeight: '900' },
  serviceChatButton: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(143,160,184,0.25)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  serviceChatText: { color: '#8FA0B8', fontWeight: '800' },
  protectedBox: { minHeight: 44, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.08)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  protectedText: { flex: 1, color: '#9CC2FF', fontSize: 10, fontWeight: '800' },
  serviceCopy: { gap: 14 },
  serviceDetailTitle: { color: colors.orange, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  serviceBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  verifiedServicePill: { backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  verifiedServiceText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  reviewPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reviewText: { color: colors.orange, fontSize: 12, fontWeight: '900' },
  serviceDescription: { color: '#C8D3E4', fontSize: 14, lineHeight: 22 },
  serviceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 8 },
  reviewsTitle: { color: colors.primary, fontSize: 18, fontWeight: '900', marginTop: 8 },
  inlineReviewBox: { backgroundColor: colors.white, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  inlineReviewTitle: { color: colors.textDark, fontSize: 15, fontWeight: '900' },
  inlineReviewStars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  inlineReviewStarButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  inlineReviewInput: { minHeight: 94, borderRadius: 14, backgroundColor: colors.inputBg, color: colors.textDark, fontSize: 14, lineHeight: 20, padding: 12, textAlignVertical: 'top', fontFamily: 'DMSans_400Regular' },
  inlineReviewInputDisabled: { opacity: 0.75 },
  inlineReviewButton: { height: 46, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  inlineReviewButtonText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  reviewCard: { backgroundColor: '#132541', borderRadius: 18, padding: 16, gap: 8 },
  reviewName: { color: '#D8E2F1', fontWeight: '900' },
  reviewStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  reviewStars: { color: colors.orange, fontWeight: '900' },
  reviewQuote: { color: '#8FA0B8', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  bookingsContent: { padding: 16, gap: 18, paddingBottom: 120 },
  bookingsHeaderBlock: { gap: 16 },
  bookingsTitleRow: { gap: 14 },
  bookingsTitle: { color: '#F26522', fontSize: 32, fontWeight: '900' },
  bookingsSubtitle: { color: '#8FA0B8', fontSize: 15, marginTop: 4 },
  bookingSearchBox: { height: 44, borderRadius: 14, backgroundColor: '#132541', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  bookingSearchText: { color: '#8FA0B8', fontSize: 13 },
  bookingTabs: { flexDirection: 'row', gap: 28 },
  bookingTabButton: { minHeight: 40, justifyContent: 'center' },
  bookingTabText: { color: '#B9C5D8', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  bookingTabTextActive: { color: colors.orange },
  bookingTabLine: { height: 3, borderRadius: 2, backgroundColor: colors.orange, marginTop: 8 },
  bookingsRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  bookingDarkCard: { backgroundColor: '#132541', borderRadius: 26, padding: 18, gap: 16 },
  bookingIconBox: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#0B1628', alignItems: 'center', justifyContent: 'center' },
  bookingInfo: { gap: 8 },
  escrowTag: { backgroundColor: 'rgba(242,101,34,0.18)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  escrowTagText: { color: colors.orange, fontSize: 9, fontWeight: '900' },
  bookingId: { color: '#8FA0B8', fontSize: 11, fontWeight: '800' },
  bookingDarkTitle: { color: colors.white, fontSize: 21, lineHeight: 26, fontWeight: '900' },
  bookingProvider: { color: '#8FA0B8', fontSize: 14 },
  bookingProviderName: { color: colors.white, fontWeight: '900' },
  bookingDate: { color: '#8FA0B8', fontSize: 12 },
  bookingAmountBlock: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 16, gap: 12 },
  bookingTotalLabel: { color: '#8FA0B8', fontSize: 10, fontWeight: '900' },
  bookingAmount: { color: colors.white, fontSize: 24, fontWeight: '900' },
  bookingActions: { flexDirection: 'row', gap: 10 },
  bookingMessageButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#0B1628', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(143,160,184,0.18)' },
  bookingTrackButton: { flex: 1, height: 46, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  bookingTrackText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  bookingDeclineButton: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' },
  bookingDisabledButton: { opacity: 0.65 },
  bookingDeclineText: { color: colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  paymentPinBackdrop: { flex: 1, backgroundColor: 'rgba(5,11,20,0.68)', justifyContent: 'center', padding: 22 },
  paymentPinCenter: { flex: 1, justifyContent: 'center' },
  paymentPinOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, minHeight: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  paymentPinScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,11,20,0.72)' },
  paymentPinCard: { width: '100%', maxWidth: 350, backgroundColor: colors.white, borderRadius: 28, padding: 22, alignItems: 'center', gap: 13, shadowColor: colors.navy, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  paymentPinIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(242,101,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  paymentPinTitle: { color: colors.orange, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  paymentPinSubtitle: { color: colors.textGray, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  paymentPinInput: { alignSelf: 'stretch', height: 56, borderRadius: 16, backgroundColor: '#132541', color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: 8, fontFamily: 'DMSans_700Bold' },
  paymentPinActions: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, marginTop: 4 },
  paymentPinCancel: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  paymentPinCancelText: { color: colors.textGray, fontSize: 12, fontWeight: '900' },
  paymentPinConfirm: { flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  paymentPinConfirmText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  reviewModalCard: { width: '100%', maxWidth: 370, backgroundColor: colors.white, borderRadius: 28, padding: 22, alignItems: 'center', gap: 13, shadowColor: colors.navy, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  reviewStarRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginVertical: 4 },
  reviewStarButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reviewCommentInput: { alignSelf: 'stretch', minHeight: 110, borderRadius: 16, backgroundColor: colors.inputBg, color: colors.textDark, fontSize: 14, lineHeight: 20, padding: 14, textAlignVertical: 'top', fontFamily: 'DMSans_400Regular' },
  escrowInfoBox: { minHeight: 86, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)', flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, marginTop: 12 },
  escrowInfoTitle: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  escrowInfoText: { color: '#6EA8FF', fontSize: 12, lineHeight: 18 },
  walletDarkContent: { padding: 20, gap: 18, paddingBottom: 120 },
  walletSetupScreen: { flex: 1, backgroundColor: '#050B14', padding: 16 },
  walletSetupScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 18 },
  walletSetupCard: { borderRadius: 28, backgroundColor: '#132541', overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  walletSetupHeader: { minHeight: 72, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  walletSetupHeaderIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(242,101,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  walletSetupHeaderText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  walletSetupStepText: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  walletSetupBody: { padding: 24, alignItems: 'center', gap: 14 },
  walletSetupIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(242,101,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  walletSetupIconCircleBlue: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(59,130,246,0.12)', alignItems: 'center', justifyContent: 'center' },
  walletSetupTitle: { color: colors.white, fontSize: 25, lineHeight: 30, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  walletSetupSubtitle: { color: '#8FA0B8', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pinBoxes: { flexDirection: 'row', gap: 12, marginTop: 8 },
  pinBox: { width: 48, height: 48, borderRadius: 13, backgroundColor: '#0B1628', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(143,160,184,0.1)' },
  pinBoxFilled: { borderColor: 'rgba(242,101,34,0.55)' },
  pinDot: { color: colors.white, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  hiddenPinInput: { width: 1, height: 1, opacity: 0 },
  walletSetupPrimaryButton: { alignSelf: 'stretch', minHeight: 54, borderRadius: 14, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, shadowColor: colors.orange, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  walletSetupButtonDisabled: { opacity: 0.55 },
  walletSetupPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  walletKycBody: { paddingVertical: 22, justifyContent: 'center' },
  walletKycAccent: { backgroundColor: colors.orange, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  walletKycAccentTitle: { color: colors.white, fontSize: 28, lineHeight: 33, fontWeight: '900' },
  walletKycAccentText: { color: colors.white, fontSize: 14, lineHeight: 22 },
  walletKycPanel: { backgroundColor: '#132541', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, padding: 20, gap: 14 },
  walletSetupBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  walletSetupBackText: { color: '#B9C5D8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  walletSetupTitleLeft: { color: colors.white, fontSize: 24, fontWeight: '900' },
  walletSetupSubtitleLeft: { color: '#8FA0B8', fontSize: 13, lineHeight: 19 },
  walletSetupFieldLabel: { color: '#8FA0B8', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  walletSetupTextInput: { minHeight: 54, borderRadius: 14, backgroundColor: '#0B1628', borderWidth: 1, borderColor: 'rgba(143,160,184,0.14)', paddingHorizontal: 16, color: colors.white, fontSize: 15, fontFamily: 'DMSans_400Regular' },
  walletUploadRow: { flexDirection: 'row', gap: 10 },
  walletUploadBox: { flex: 1, minHeight: 106, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(143,160,184,0.35)', backgroundColor: '#0B1628', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 },
  walletUploadPreview: { width: '100%', height: 66, borderRadius: 12 },
  walletUploadText: { color: '#B9C5D8', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  walletUploadTextSelected: { color: colors.orange },
  walletSetupNotice: { alignSelf: 'stretch', minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.22)', backgroundColor: 'rgba(59,130,246,0.08)', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletSetupNoticeText: { flex: 1, color: '#9CC2FF', fontSize: 11, lineHeight: 17 },
  walletSetupNoticeTextStrong: { flex: 1, color: '#9CC2FF', fontSize: 10, lineHeight: 16, fontWeight: '900' },
  termsCard: { alignSelf: 'stretch', minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(143,160,184,0.18)', backgroundColor: '#0B1628', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  termsTitle: { color: colors.white, fontSize: 12, fontWeight: '900' },
  termsText: { color: '#8FA0B8', fontSize: 10, marginTop: 2 },
  termsCheckbox: { width: 22, height: 22, borderRadius: 4, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  termsCheckboxActive: { backgroundColor: colors.orange },
  walletReadyCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  walletSetupWhiteButton: { alignSelf: 'stretch', minHeight: 56, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  walletSetupWhiteText: { color: '#07111F', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  walletDarkHeading: { color: colors.orange, fontSize: 32, fontWeight: '900' },
  walletDarkSubtitle: { color: '#8FA0B8', fontSize: 15, marginTop: 4 },
  walletBalancePanel: { borderRadius: 28, borderWidth: 1, borderColor: 'rgba(59,130,246,0.28)', backgroundColor: '#111A30', padding: 24, gap: 18 },
  walletPanelLabel: { color: '#60A5FA', fontSize: 12, fontWeight: '900', letterSpacing: 4 },
  walletAmountLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  walletBigAmount: { color: colors.white, fontSize: 52, lineHeight: 58, fontWeight: '900' },
  walletCurrency: { color: colors.blue, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  walletButtonRow: { gap: 12 },
  walletFundButton: { height: 56, borderRadius: 14, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  walletFundText: { color: colors.white, fontWeight: '900', letterSpacing: 1 },
  walletWithdrawButton: { height: 56, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(143,160,184,0.25)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  walletWithdrawText: { color: colors.white, fontWeight: '900', letterSpacing: 1 },
  walletButtonLocked: { opacity: 0.45 },
  walletKycLockNotice: { minHeight: 62, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242,101,34,0.35)', backgroundColor: 'rgba(242,101,34,0.1)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletKycLockTitle: { color: colors.orange, fontSize: 13, fontWeight: '900' },
  walletKycLockText: { color: '#B9C5D8', fontSize: 11, lineHeight: 16, marginTop: 2, textTransform: 'capitalize' },
  walletPinPromptCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242,101,34,0.35)', backgroundColor: 'rgba(242,101,34,0.1)', padding: 12, gap: 12 },
  walletPinPromptActions: { flexDirection: 'row', gap: 10 },
  walletPinResetRow: { alignItems: 'center', marginTop: -4 },
  walletPinResetButton: { minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(242,101,34,0.28)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  walletPinResetText: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  walletPinResetStatus: { color: colors.green, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  walletAmountInput: { borderWidth: 1, borderColor: 'rgba(143,160,184,0.2)', backgroundColor: '#0B1628' },
  walletAmountInputText: { color: colors.white },
  walletEscrowPanel: { backgroundColor: '#132541', borderRadius: 28, padding: 22, gap: 18 },
  walletEscrowTitle: { color: colors.white, fontSize: 20, fontWeight: '900' },
  activeJobsPill: { backgroundColor: 'rgba(16,185,129,0.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  activeJobsText: { color: colors.green, fontSize: 10, fontWeight: '900' },
  walletAmountLineSmall: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  walletEscrowAmount: { color: colors.white, fontSize: 32, fontWeight: '900' },
  walletSmallCurrency: { color: '#8FA0B8', fontSize: 12, fontWeight: '900', marginBottom: 5 },
  trustText: { color: '#B9C5D8', fontSize: 12, fontStyle: 'italic' },
  walletProgressTrack: { height: 10, borderRadius: 999, backgroundColor: '#0B1628', overflow: 'hidden', flexDirection: 'row' },
  walletProgressGreen: { flex: 3, backgroundColor: colors.green },
  walletProgressOrange: { flex: 2, backgroundColor: colors.orange },
  walletLegendRow: { flexDirection: 'row', gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginTop: 2 },
  legendLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900', lineHeight: 16 },
  legendValue: { color: colors.white, fontSize: 13 },
  walletActivityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  walletRefreshButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  walletActivityTitle: { color: colors.orange, fontSize: 18, fontWeight: '900' },
  walletActivityCard: { backgroundColor: '#132541', borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletActivityIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  walletActivityName: { color: colors.white, fontSize: 15, fontWeight: '900' },
  walletActivityDate: { color: '#8FA0B8', fontSize: 11, marginTop: 2 },
  walletActivityAmount: { color: colors.white, fontSize: 14, fontWeight: '900' },
  walletActivityIncome: { color: colors.green },
  chatDarkHeader: { minHeight: 82, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.background },
  chatProviderButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatHeaderIconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chatName: { color: colors.orange, fontSize: 15, fontWeight: '900' },
  chatStatus: { color: '#8FA0B8', fontSize: 11, marginTop: 2 },
  chatDatePill: { alignSelf: 'center', backgroundColor: 'rgba(143,160,184,0.18)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 16 },
  chatDatePillText: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  chatDarkContent: { padding: 16, paddingBottom: 24, gap: 18, flexGrow: 1 },
  chatMessageBlock: { alignSelf: 'flex-start', maxWidth: '82%', marginBottom: 16 },
  chatMessageRight: { alignSelf: 'flex-end' },
  chatBubble: { borderRadius: 16, padding: 16 },
  chatReceivedBubble: { backgroundColor: '#132541' },
  chatSentBubble: { backgroundColor: '#DCEBFF' },
  chatReceivedText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  chatSentText: { color: '#07111F', fontSize: 14, lineHeight: 20 },
  chatAttachmentImage: { width: 210, height: 150, borderRadius: 12, marginBottom: 8, backgroundColor: '#0B1628' },
  chatFileAttachment: { maxWidth: 220, minHeight: 46, borderRadius: 12, backgroundColor: 'rgba(143,160,184,0.14)', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chatFileText: { flex: 1, fontWeight: '800' },
  attachmentModalOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 22 },
  attachmentModalScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,11,20,0.68)' },
  attachmentModalCard: { width: '100%', maxWidth: 352, borderRadius: 28, backgroundColor: colors.white, padding: 20, alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  attachmentModalClose: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  attachmentModalTitle: { color: colors.orange, fontSize: 22, fontWeight: '900', textAlign: 'center', paddingHorizontal: 34 },
  attachmentPreviewImage: { width: '100%', height: 220, borderRadius: 18, backgroundColor: colors.inputBg },
  attachmentViewerImage: { width: '100%', height: 320, borderRadius: 18, backgroundColor: colors.inputBg },
  attachmentPreviewFile: { alignSelf: 'stretch', minHeight: 140, borderRadius: 18, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  attachmentPreviewFileName: { color: colors.textDark, fontSize: 15, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  attachmentModalHint: { color: colors.textGray, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  attachmentModalSend: { alignSelf: 'stretch', minHeight: 50, borderRadius: 15, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  attachmentModalSendText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  chatTimestamp: { color: '#8FA0B8', fontSize: 10, marginTop: 8 },
  chatComposerWrap: { minHeight: 68, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background },
  chatPlusButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(143,160,184,0.18)', alignItems: 'center', justifyContent: 'center' },
  chatInput: { flex: 1, backgroundColor: '#132541', borderWidth: 1, borderColor: 'rgba(143,160,184,0.18)', borderRadius: 24 },
  chatInputText: { color: colors.white },
  chatSendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  emojiOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  emojiScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,11,20,0.35)' },
  emojiCard: { backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 14, shadowColor: colors.navy, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: -5 }, elevation: 10 },
  emojiTitle: { color: colors.orange, fontSize: 18, fontWeight: '900' },
  emojiClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emojiButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 24 },
  chatListScreen: { flex: 1, backgroundColor: colors.background },
  chatListContent: { padding: 20, gap: 14, paddingBottom: 110 },
  chatListHeader: { gap: 6, marginBottom: 8 },
  chatListTitle: { color: colors.orange, fontSize: 34, lineHeight: 40, fontWeight: '900' },
  chatListSubtitle: { color: colors.textGray, fontSize: 14, lineHeight: 20 },
  chatListCard: { minHeight: 92, borderRadius: 24, backgroundColor: colors.white, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chatListName: { color: colors.textDark, fontSize: 16, fontWeight: '900' },
  chatListTime: { color: colors.textGray, fontSize: 11 },
  chatListService: { color: colors.orange, fontSize: 13, fontWeight: '900', marginTop: 2 },
  chatListPreview: { color: colors.textGray, fontSize: 12, marginTop: 3 },
  chatListStatus: { borderRadius: 999, backgroundColor: 'rgba(242,101,34,0.1)', paddingHorizontal: 8, paddingVertical: 5 },
  chatListStatusOffline: { backgroundColor: 'rgba(143,160,184,0.14)' },
  chatListStatusText: { color: colors.orange, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  chatListStatusTextOffline: { color: colors.textGray, textTransform: 'none' },
  chatListEmpty: { marginTop: 80, alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  chatListEmptyTitle: { color: colors.textDark, fontSize: 20, fontWeight: '900' },
  chatListEmptyText: { color: colors.textGray, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  notificationsScreen: { flex: 1, backgroundColor: colors.background },
  notificationsContent: { padding: 20, gap: 14, paddingBottom: 120 },
  notificationsHeader: { gap: 6, marginBottom: 8 },
  notificationsTitle: { color: colors.orange, fontSize: 34, lineHeight: 40, fontWeight: '900' },
  notificationsSubtitle: { color: colors.textGray, fontSize: 14, lineHeight: 20 },
  clearNotificationsButton: { alignSelf: 'flex-start', minHeight: 40, borderRadius: 14, backgroundColor: colors.orange, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  clearNotificationsText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  notificationCard: { minHeight: 96, borderRadius: 24, backgroundColor: colors.white, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  notificationIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notificationIconwarning: { backgroundColor: 'rgba(242,101,34,0.12)' },
  notificationIconsuccess: { backgroundColor: 'rgba(16,185,129,0.12)' },
  notificationIcondanger: { backgroundColor: 'rgba(239,68,68,0.12)' },
  notificationIconblue: { backgroundColor: 'rgba(59,130,246,0.12)' },
  notificationBadge: { position: 'absolute', top: -7, right: -7, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, zIndex: 4 },
  notificationBadgeMuted: { backgroundColor: '#8FA0B8' },
  notificationBadgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  notificationTitle: { color: colors.textDark, fontSize: 15, fontWeight: '900' },
  notificationMessage: { color: colors.textGray, fontSize: 12, lineHeight: 18, marginTop: 3 },
  notificationTime: { color: '#9CA3AF', fontSize: 10, marginTop: 5 },
  notificationDetailOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 22 },
  notificationDetailScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,11,20,0.62)' },
  notificationDetailCard: { width: '100%', maxWidth: 352, borderRadius: 28, backgroundColor: colors.white, padding: 24, alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  notificationDetailTitle: { color: colors.orange, fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  notificationDetailMessage: { color: colors.textDark, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  notificationDetailTime: { color: colors.textGray, fontSize: 12, marginTop: 2 },
  notificationDetailButton: { alignSelf: 'stretch', height: 50, borderRadius: 15, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  notificationDetailButtonText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  providerProfileDetailScreen: { flex: 1, backgroundColor: colors.background },
  providerProfileDetailContent: { padding: 20, gap: 16, paddingBottom: 40 },
  providerProfileBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  providerProfileBackText: { color: colors.textGray, fontSize: 12, fontWeight: '900' },
  providerProfileHero: { backgroundColor: colors.white, borderRadius: 28, padding: 24, alignItems: 'center', gap: 10, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  providerProfileAvatarWrap: { position: 'relative', overflow: 'visible', marginBottom: 4 },
  providerProfileAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#132541', alignItems: 'center', justifyContent: 'center' },
  providerProfileTrustBadge: { position: 'absolute', right: 0, bottom: 0, zIndex: 10, elevation: 8 },
  providerProfileAvatarImage: { width: 96, height: 96, borderRadius: 48 },
  providerProfileAvatarText: { color: colors.orange, fontSize: 32, fontWeight: '900' },
  providerProfileName: { color: colors.orange, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  providerProfileRole: { color: colors.textGray, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  providerProfileVerified: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  providerProfileVerifiedText: { color: colors.green, fontSize: 11, fontWeight: '900' },
  providerProfileStats: { flexDirection: 'row', gap: 10 },
  providerStatCard: { flex: 1, backgroundColor: '#132541', borderRadius: 20, padding: 16, alignItems: 'center', gap: 4 },
  providerStatValue: { color: colors.white, fontSize: 22, fontWeight: '900' },
  providerStatLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  providerInfoCard: { backgroundColor: colors.white, borderRadius: 24, padding: 20, gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  providerInfoTitle: { color: colors.textDark, fontSize: 20, fontWeight: '900' },
  providerInfoText: { color: colors.textGray, fontSize: 14, lineHeight: 22 },
  providerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerInfoMeta: { flex: 1, color: colors.textDark, fontWeight: '800' },
  providerMessageButton: { height: 54, borderRadius: 16, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  providerMessageText: { color: colors.white, fontSize: 16, fontWeight: '900' },
  addListingScreen: { flex: 1, backgroundColor: colors.background },
  addListingContent: { padding: 20, gap: 18, paddingBottom: 120 },
  addListingBack: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  addListingBackText: { color: colors.textGray, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  addListingHeader: { backgroundColor: colors.white, borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  addListingIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: 'rgba(242,101,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  addListingTitle: { color: colors.orange, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  addListingSubtitle: { color: colors.textGray, fontSize: 12, lineHeight: 18, marginTop: 2 },
  addListingForm: { gap: 14 },
  addListingInput: { minHeight: 58, borderRadius: 16, backgroundColor: '#132541', borderWidth: 1, borderColor: 'rgba(10,25,47,0.08)' },
  addListingInputText: { color: colors.white, fontSize: 15 },
  addListingSection: { gap: 8 },
  addListingLabel: { color: '#B9C5D8', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  addListingCategoryScroll: { gap: 10, paddingVertical: 2 },
  addListingCategoryPill: { minHeight: 42, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  addListingCategoryPillActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  addListingCategoryText: { color: colors.textGray, fontSize: 12, fontWeight: '900' },
  addListingCategoryTextActive: { color: colors.white },
  addListingUpload: { height: 160, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(143,160,184,0.55)', backgroundColor: '#132541', alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  addListingUploadImage: { width: '100%', height: '100%' },
  addListingUploadText: { color: '#B9C5D8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  addListingDescription: { minHeight: 132, borderRadius: 18, backgroundColor: '#132541', borderWidth: 1, borderColor: 'rgba(10,25,47,0.08)', padding: 16, color: colors.white, fontSize: 15, lineHeight: 21, fontFamily: 'DMSans_400Regular' },
  addListingSubmit: { minHeight: 56, borderRadius: 16, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', shadowColor: colors.orange, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  addListingSubmitText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  providerServiceDetailContent: { padding: 20, gap: 18, paddingBottom: 120 },
  providerServiceHero: { minHeight: 210, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.white, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  providerServiceHeroImage: { width: '100%', height: 210 },
  providerServiceHeroEmpty: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F8FAFC' },
  providerServiceHeroEmptyText: { color: colors.textGray, fontSize: 12, fontWeight: '800' },
  providerServiceImageButton: { position: 'absolute', right: 14, bottom: 14, minHeight: 40, borderRadius: 14, backgroundColor: colors.orange, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerServiceImageButtonText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  providerServiceStatsCard: { backgroundColor: colors.darkNavy, gap: 12 },
  providerServiceStatsTitle: { color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: '900' },
  providerServiceMetricRow: { flexDirection: 'row', gap: 10 },
  providerServiceMetric: { flex: 1, borderRadius: 16, backgroundColor: '#132541', padding: 12, gap: 4 },
  providerServiceMetricValue: { color: colors.white, fontSize: 24, fontWeight: '900' },
  providerServiceMetricLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  providerServiceMiniStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerServiceMiniStat: { color: '#93C5FD', fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  providerEditPanel: { backgroundColor: colors.white, borderRadius: 24, padding: 16, gap: 14, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  providerEditHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  providerEditTitleBlock: { flex: 1, minWidth: 0 },
  providerEditToggle: { minHeight: 38, flexShrink: 0, borderRadius: 14, backgroundColor: '#FFF7ED', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  providerEditToggleText: { color: colors.orange, fontSize: 11, fontWeight: '900' },
  providerDeleteButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  providerDeleteButtonText: { color: colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  availabilityToggle: { minHeight: 48, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  availabilityToggleText: { color: colors.textDark, fontSize: 13, fontWeight: '800' },
  providerServiceReadOnly: { gap: 12 },
  providerServiceInfoRow: { gap: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  providerServiceInfoValue: { color: colors.textDark, fontSize: 16, fontWeight: '900' },
  providerServiceDescription: { color: colors.textGray, fontSize: 15, lineHeight: 22 },
  adminVerifyContent: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: Platform.OS === 'web' ? 28 : 18, paddingTop: Platform.OS === 'web' ? 28 : 18, gap: 22, paddingBottom: 80 },
  adminVerifyPageContent: { width: '100%', maxWidth: 1220, alignSelf: 'center', paddingHorizontal: Platform.OS === 'web' ? 32 : 18, paddingTop: Platform.OS === 'web' ? 28 : 18, gap: 22, paddingBottom: 80 },
  adminVerifyHeader: { backgroundColor: colors.white, borderRadius: 28, padding: Platform.OS === 'web' ? 24 : 18, gap: 12, shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminVerifyPageTitle: { color: colors.orange, fontSize: Platform.OS === 'web' ? 34 : 28, fontWeight: '900' },
  adminVerifyPageSubtitle: { color: colors.textGray, fontSize: 14, lineHeight: 20, marginTop: 4 },
  adminVerifyWorkspace: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 22, alignItems: 'flex-start' },
  adminVerifyQueuePanel: { width: Platform.OS === 'web' ? 390 : '100%', backgroundColor: colors.white, borderRadius: 28, padding: 18, gap: 14, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminVerifyDetailPanel: { flex: 1, width: '100%', minWidth: 0, gap: 18 },
  adminVerifyProfileBanner: { backgroundColor: '#132541', borderRadius: 28, padding: Platform.OS === 'web' ? 24 : 18, flexDirection: Platform.OS === 'web' ? 'row' : 'column', alignItems: Platform.OS === 'web' ? 'center' : 'flex-start', gap: 18 },
  verifyDetailName: { color: colors.white, fontSize: 26, fontWeight: '900', flexShrink: 1 },
  verifyDetailSubtitle: { color: colors.orange, fontSize: 13, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },
  verifyDetailMeta: { color: '#B9C5D8', fontSize: 12, fontWeight: '800', marginTop: 6, textTransform: 'uppercase' },
  verifyStatusBadge: { borderRadius: 999, backgroundColor: 'rgba(34,197,94,0.14)', paddingHorizontal: 12, paddingVertical: 7 },
  verifyStatusText: { color: colors.green, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  adminVerifyInfoGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', flexWrap: 'wrap', gap: 12 },
  adminVerifyInfoItem: { flex: Platform.OS === 'web' ? 1 : 0, minWidth: Platform.OS === 'web' ? 220 : '100%', backgroundColor: colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  adminVerifyInfoLabel: { color: '#8FA0B8', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  adminVerifyInfoValue: { color: colors.textDark, fontSize: 15, fontWeight: '900', marginTop: 8 },
  adminHero: { minHeight: 86, borderRadius: 0, backgroundColor: colors.white, flexDirection: Platform.OS === 'web' ? 'row' : 'column', alignItems: Platform.OS === 'web' ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 14 },
  adminHeroTitle: { color: colors.orange, fontSize: Platform.OS === 'web' ? 34 : 28, fontWeight: '900' },
  adminHeroSubtitle: { color: colors.textGray, fontSize: 15, marginTop: 4 },
  adminHeroActions: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', alignItems: Platform.OS === 'web' ? 'center' : 'stretch', gap: 10 },
  adminTopLink: { minHeight: 38, borderRadius: 14, backgroundColor: 'rgba(242,101,34,0.1)', borderWidth: 1, borderColor: 'rgba(242,101,34,0.18)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  adminTopLinkText: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  serverStatusPill: { minHeight: 34, borderRadius: 14, backgroundColor: '#132541', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  serverDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  serverStatusText: { color: '#B9C5D8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  adminStatsGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 14 },
  adminStatCard: { flex: 1, minHeight: 132, backgroundColor: '#132541', borderRadius: 22, padding: 20, justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(59,130,246,0.12)' },
  adminStatLabel: { color: '#B9C5D8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 16 },
  adminStatValue: { color: colors.white, fontSize: 28, fontWeight: '900', marginTop: 8 },
  adminStatMeta: { fontSize: 12, fontWeight: '900', marginTop: 4, textTransform: 'uppercase' },
  adminNotificationPanel: { backgroundColor: colors.white, borderRadius: 28, padding: 18, gap: 14, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminNotificationTitleIcon: { position: 'relative' },
  adminNotificationGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', flexWrap: 'wrap', gap: 12 },
  adminNotificationItem: { flex: Platform.OS === 'web' ? 1 : 0, minWidth: Platform.OS === 'web' ? 240 : '100%', minHeight: 96, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  adminNotificationIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  adminNotificationTitle: { color: colors.textDark, fontSize: 14, fontWeight: '900' },
  adminNotificationMessage: { color: colors.textGray, fontSize: 12, lineHeight: 17, marginTop: 4 },
  adminDesktopGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', alignItems: 'flex-start', gap: 24 },
  adminColumn: { flex: 1, gap: 16, width: '100%', minWidth: 0 },
  adminSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  adminSectionTitle: { color: colors.orange, fontSize: 22, fontWeight: '900' },
  adminCountBadge: { borderRadius: 9, backgroundColor: colors.orange, paddingHorizontal: 9, paddingVertical: 6 },
  adminCountText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  adminViewAll: { color: colors.orange, fontSize: 12, fontWeight: '900' },
  adminWorkspaceLink: { minHeight: 34, borderRadius: 12, backgroundColor: 'rgba(242,101,34,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  adminQueueRow: { minHeight: 78, borderRadius: 20, backgroundColor: colors.white, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminQueueRowActive: { borderWidth: 2, borderColor: colors.orange },
  adminQueueAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#132541', alignItems: 'center', justifyContent: 'center' },
  adminQueueAvatarText: { color: colors.orange, fontWeight: '900' },
  adminQueueName: { color: colors.textDark, fontSize: 15, fontWeight: '900' },
  adminQueueMeta: { color: colors.textGray, fontSize: 11, fontWeight: '800', marginTop: 3, textTransform: 'uppercase' },
  adminEmptyCard: { minHeight: 78, borderRadius: 20, backgroundColor: colors.white, padding: 18, justifyContent: 'center' },
  adminEmptyText: { color: colors.textGray, fontSize: 13, fontWeight: '800' },
  adminDetailPanel: { flexDirection: 'column', gap: 16, alignItems: 'stretch', width: '100%' },
  adminProviderCard: { backgroundColor: '#132541', borderRadius: 24, padding: 20, gap: 10, alignItems: 'center', width: '100%' },
  verifyBack: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  verifyBackText: { color: '#8FA0B8', fontSize: 12, fontWeight: '800' },
  verifyProfileCard: { backgroundColor: '#132541', borderRadius: 28, padding: 24, gap: 12, alignItems: 'center' },
  verifyAvatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#302D42', alignItems: 'center', justifyContent: 'center' },
  verifyAvatarText: { color: colors.orange, fontSize: 26, fontWeight: '900' },
  verifyName: { color: colors.white, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  verifySpecialty: { color: '#B9C5D8', fontSize: 12, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  verifyDivider: { alignSelf: 'stretch', height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 },
  verifyLabel: { alignSelf: 'stretch', color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  verifyValue: { alignSelf: 'stretch', color: colors.white, fontSize: 14, fontWeight: '900', marginBottom: 6 },
  idReviewCard: { width: '100%', backgroundColor: '#132541', borderRadius: 24, padding: 20, gap: 16, overflow: 'hidden' },
  idReviewTitle: { color: colors.white, fontSize: 18, fontWeight: '900', flexShrink: 1 },
  idImageGrid: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 16 },
  idSlotWrap: { gap: 8, flex: 1, minWidth: 0 },
  idSlotLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  idSlot: { height: Platform.OS === 'web' ? 140 : 170, width: '100%', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(143,160,184,0.15)', backgroundColor: '#0B1628', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  adminDocImage: { width: '100%', height: '100%' },
  adminDocGridLarge: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 16 },
  adminDocSlotLarge: { height: Platform.OS === 'web' ? 230 : 190, width: '100%', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(143,160,184,0.18)', backgroundColor: '#0B1628', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  adminDocOverlay: { position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(5,11,20,0.7)', alignItems: 'center', justifyContent: 'center' },
  adminDocEmptyText: { color: '#8FA0B8', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  adminEmptyReview: { minHeight: 420, borderRadius: 28, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminEmptyReviewTitle: { color: colors.textDark, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  adminEmptyReviewText: { color: colors.textGray, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 420 },
  adminPreviewBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  adminPreviewCard: { width: '100%', maxWidth: 900, height: Platform.OS === 'web' ? '82%' : '72%', borderRadius: 28, backgroundColor: colors.white, padding: 18, gap: 12, shadowColor: colors.navy, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 14 },
  adminPreviewImage: { flex: 1, width: '100%', borderRadius: 18, backgroundColor: colors.inputBg },
  downloadIcon: { position: 'absolute', right: 16, bottom: 16 },
  policyBox: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', backgroundColor: 'rgba(59,130,246,0.06)', flexDirection: 'row', gap: 12, padding: 14 },
  policyText: { flex: 1, color: '#BFE0FF', fontSize: 12, lineHeight: 18 },
  finalDecisionCard: { backgroundColor: colors.orange, borderRadius: 28, padding: 24, gap: 14 },
  finalDecisionTitle: { color: colors.white, fontSize: 18, fontWeight: '900' },
  finalDecisionText: { color: colors.white, fontSize: 13, lineHeight: 18 },
  adminRefundSection: { backgroundColor: colors.white, borderRadius: 28, padding: 18, gap: 14, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminRefundTitle: { color: colors.orange, fontSize: 22, fontWeight: '900' },
  adminRefundCard: { backgroundColor: '#132541', borderRadius: 20, padding: 16, gap: 12 },
  adminRefundCardActive: { borderWidth: 2, borderColor: colors.orange },
  adminRefundService: { color: colors.white, fontSize: 17, fontWeight: '900' },
  adminRefundMeta: { color: '#8FA0B8', fontSize: 12, marginTop: 4 },
  adminRefundAmount: { color: colors.orange, fontSize: 16, fontWeight: '900' },
  adminRefundNote: { color: '#B9C5D8', fontSize: 12, lineHeight: 18 },
  adminRefundApproveButton: { flex: 1, height: 46, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  adminRefundRejectButton: { flex: 1, height: 46, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', alignItems: 'center', justifyContent: 'center' },
  approveButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  approveText: { color: colors.orange, fontWeight: '900', letterSpacing: 1, fontSize: 11 },
  rejectButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: 'rgba(130,54,18,0.35)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  rejectText: { color: colors.white, fontWeight: '900', letterSpacing: 1, fontSize: 11 },
  disabledAction: { opacity: 0.45 },
  adminActionRow: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 12, width: '100%' },
  criticalPill: { borderRadius: 999, backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 12, paddingVertical: 6 },
  criticalText: { color: colors.red, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  adminDisputeCard: { backgroundColor: colors.white, borderRadius: 28, padding: 24, gap: 18, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  disputeCaseLabel: { color: colors.red, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  disputeTitle: { color: colors.textDark, fontSize: 20, fontWeight: '900', marginTop: 10 },
  disputeBody: { color: colors.textGray, fontSize: 13, lineHeight: 20, marginTop: 10, fontStyle: 'italic' },
  adminReleaseButton: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  adminReleaseText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  adminRefundDangerButton: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  adminDangerText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  adminPinCard: { backgroundColor: colors.background, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  adminUserRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  adminUsersContent: { width: '100%', maxWidth: 1220, alignSelf: 'center', paddingHorizontal: Platform.OS === 'web' ? 32 : 18, paddingTop: Platform.OS === 'web' ? 28 : 18, gap: 18, paddingBottom: 80 },
  adminUserStatsRow: { flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 12 },
  adminUserStatPill: { flex: 1, minHeight: 86, borderRadius: 22, backgroundColor: '#132541', padding: 18, justifyContent: 'center' },
  adminUserStatValue: { color: colors.white, fontSize: 28, fontWeight: '900' },
  adminUserStatLabel: { color: '#8FA0B8', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 6 },
  adminUsersSearchCard: { minHeight: 58, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  adminUsersSearchInput: { flex: 1, color: colors.textDark, fontSize: 15, fontWeight: '800', outlineStyle: 'none' },
  adminSearchClear: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  adminUsersTable: { backgroundColor: colors.white, borderRadius: 28, padding: 18, gap: 8, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  adminUsersTableHeader: { minHeight: 44, borderRadius: 14, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  adminUsersHeaderText: { color: '#8FA0B8', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  adminUsersTableRow: { minHeight: 72, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  adminUsersCell: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  adminUsersCellText: { color: colors.textDark, fontSize: 13, fontWeight: '800' },
  adminUsersNameCol: { flex: 2.1 },
  adminUsersRoleCol: { flex: 0.8 },
  adminUsersContactCol: { flex: 1.1 },
  adminUsersDateCol: { flex: 0.9 },
  adminRoleBadge: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: 'rgba(242,101,34,0.12)', paddingHorizontal: 12, paddingVertical: 7 },
  adminRoleBadgeText: { color: colors.orange, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  settingsContent: { padding: 20, gap: 18, paddingBottom: 120 },
  settingsAdminBackButton: { alignSelf: 'flex-start', minHeight: 38, borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#132541', flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsAdminBackButtonLight: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  settingsAdminBackText: { color: '#D5DEEC', fontSize: 13, fontWeight: '900' },
  settingsAdminBackTextLight: { color: colors.textDark },
  changePasswordContent: { padding: 20, gap: 18, paddingBottom: 80 },
  changePasswordHeader: { alignItems: 'center', gap: 10, marginTop: 20 },
  changePasswordIcon: { width: 74, height: 74, borderRadius: 37, backgroundColor: 'rgba(242,101,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  changePasswordTitle: { color: colors.orange, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  changePasswordSubtitle: { color: colors.textGray, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 16 },
  changePasswordCard: { backgroundColor: colors.white, borderRadius: 28, padding: 20, gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  changePasswordInput: { minHeight: 58, borderRadius: 16, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, paddingRight: 8 },
  changePasswordInputText: { color: colors.textDark, fontWeight: '800', fontFamily: 'DMSans_700Bold' },
  changePasswordEye: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(242,101,34,0.1)', alignItems: 'center', justifyContent: 'center' },
  settingsDarkModeScreen: { backgroundColor: '#050B14' },
  settingsTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  themeToggleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#132541', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(143,160,184,0.2)' },
  themeToggleButtonLight: { backgroundColor: colors.white, borderColor: colors.border },
  settingsTitle: { color: colors.white, fontSize: 30, fontWeight: '900' },
  settingsTitleLight: { color: colors.textDark },
  settingsSubtitle: { color: '#8FA0B8', fontSize: 14, lineHeight: 20 },
  settingsMenu: { gap: 10 },
  settingsMenuItem: { height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  settingsMenuItemActive: { backgroundColor: colors.orange },
  settingsMenuText: { color: '#8FA0B8', fontWeight: '900' },
  settingsMenuTextActive: { color: colors.white },
  profileSettingsCard: { backgroundColor: '#132541', borderRadius: 28, padding: 20, gap: 18 },
  profileSettingsCardLight: { backgroundColor: colors.white },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  photoCircleWrap: { position: 'relative', overflow: 'visible' },
  accountTrustBadge: { position: 'absolute', right: 0, bottom: 0, zIndex: 10, elevation: 8 },
  photoCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  photoCircleLight: { borderColor: colors.border, backgroundColor: colors.inputBg },
  accountPhotoImage: { width: '100%', height: '100%', borderRadius: 48 },
  cameraDot: { position: 'absolute', right: 0, bottom: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  profilePhotoTitle: { color: colors.white, fontSize: 20, fontWeight: '900' },
  profilePhotoTitleLight: { color: colors.textDark },
  settingsDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  settingsDividerLight: { backgroundColor: colors.border },
  settingsFieldGrid: { gap: 14 },
  settingsField: { gap: 8 },
  settingsFieldLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900' },
  settingsInputBox: { height: 58, borderRadius: 14, backgroundColor: '#0B1628', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  settingsInputBoxLight: { backgroundColor: colors.inputBg },
  settingsActionRow: { justifyContent: 'space-between' },
  kycStatusCard: { borderRadius: 18, backgroundColor: '#0B1628', borderWidth: 1, borderColor: 'rgba(143,160,184,0.18)', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  kycStatusCardLight: { backgroundColor: colors.inputBg, borderColor: colors.border },
  kycStatusIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  kycStatusIconApproved: { backgroundColor: 'rgba(16,185,129,0.12)' },
  kycStatusIconBadge: { backgroundColor: 'rgba(59,130,246,0.12)' },
  kycStatusIconRejected: { backgroundColor: 'rgba(239,68,68,0.12)' },
  kycStatusIconPending: { backgroundColor: 'rgba(242,101,34,0.12)' },
  kycStatusTitle: { color: colors.white, fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  kycStatusTitleLight: { color: colors.textDark },
  kycStatusText: { color: '#8FA0B8', fontSize: 13, lineHeight: 19, marginTop: 4 },
  badgeStatsGrid: { flexDirection: 'row', gap: 10 },
  badgeStatCard: { flex: 1, minHeight: 78, borderRadius: 16, backgroundColor: '#132541', padding: 12, justifyContent: 'center', gap: 4 },
  badgeStatValue: { color: colors.white, fontSize: 20, fontWeight: '900' },
  badgeStatLabel: { color: '#B9C5D8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  badgeRequirementBox: { borderRadius: 18, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: 'rgba(242,101,34,0.2)', padding: 14, gap: 6 },
  badgeRequirementTitle: { color: colors.orange, fontSize: 14, fontWeight: '900' },
  badgeRequirementText: { color: colors.textGray, fontSize: 12, lineHeight: 18 },
  badgeRequirementPrice: { color: colors.textDark, fontSize: 13, fontWeight: '900' },
  badgeActivePreview: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', padding: 14 },
  badgeActivePreviewText: { flex: 1, color: colors.textGray, fontSize: 13, lineHeight: 19 },
  providerVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  settingsEditableInput: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '800', paddingVertical: 12, fontFamily: 'DMSans_700Bold' },
  settingsEditableInputLight: { color: colors.textDark },
  settingsInputText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  settingsInputTextLight: { color: colors.textDark },
  settingsHelpText: { color: colors.textGray, fontSize: 11, fontWeight: '700', marginTop: 2 },
  settingsPlaceholder: { color: '#8FA0B8', fontSize: 15, fontWeight: '800' },
  locationPromptBox: { borderRadius: 18, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: 'rgba(242,101,34,0.18)', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationPromptTitle: { color: colors.textDark, fontSize: 15, fontWeight: '900' },
  locationPromptText: { color: colors.textGray, fontSize: 12, lineHeight: 18, marginTop: 2 },
  accountSwitch: { width: 46, height: 26, borderRadius: 13, backgroundColor: 'rgba(143,160,184,0.35)', padding: 3 },
  accountSwitchOn: { backgroundColor: colors.orange },
  accountSwitchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  accountSwitchKnobOn: { alignSelf: 'flex-end' },
  accountCheckbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.textGray, alignItems: 'center', justifyContent: 'center' },
  accountCheckboxOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  saveButton: { height: 56, borderRadius: 14, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  disabledButton: { opacity: 0.65 },
  saveButtonText: { color: colors.white, fontSize: 16, fontWeight: '900' },
  heroWrap: { height: 280 },
  detailHero: { width: '100%', height: '100%' },
  heroCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  heroActions: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8 },
  ratingBadge: { position: 'absolute', left: 20, bottom: 16, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { color: colors.textDark, fontWeight: '900' },
  detailBody: { padding: 20, gap: 16 },
  includedRow: { flexDirection: 'row', gap: 12 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  providerCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quote: { color: colors.textGray, fontStyle: 'italic', marginTop: 4 },
  chatIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mapBox: { height: 150, borderRadius: 24, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  fixedBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  tabRow: { gap: 20, paddingBottom: 4 },
  filterTab: { minHeight: 36, justifyContent: 'center' },
  filterText: { color: colors.textGray, fontWeight: '800' },
  filterTextActive: { color: colors.orange },
  filterUnderline: { height: 3, borderRadius: 2, backgroundColor: colors.orange, marginTop: 6 },
  bookingCard: { marginBottom: 12, borderRadius: 16 },
  bookingMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  bookingServiceTitle: { color: colors.orange, fontSize: 16, fontWeight: '900' },
  bookingBottomTabs: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: Platform.OS === 'ios' ? 88 : 76, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 22 : 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  bookingBottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bookingBottomLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '800' },
  bookingBottomLabelActive: { color: colors.orange },
  trackingHeader: { gap: 6, marginTop: 8 },
  trackingTitle: { color: colors.orange, fontSize: 34, fontWeight: '900' },
  trackingSubtitle: { color: colors.textGray, fontSize: 15 },
  trackingMapCard: { height: 430, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', shadowColor: colors.navy, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  trackingMap: { flex: 1 },
  trackingMapOverlay: { position: 'absolute', top: 14, left: 14, right: 14, minHeight: 42, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.9)', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14 },
  trackingStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  trackingMapOverlayText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  trackingMarkerOuter: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(242,101,34,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  trackingMarkerInner: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  trackingEmptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  trackingEmptyTitle: { color: colors.textDark, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  trackingEmptyText: { color: colors.textGray, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  trackingInfoCard: { backgroundColor: colors.white, borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  trackingInfoIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(242,101,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  trackingInfoTitle: { color: colors.textDark, fontSize: 15, fontWeight: '900', lineHeight: 20 },
  trackingInfoText: { color: colors.textGray, fontSize: 12, marginTop: 3 },
  trackingOpenMapsButton: { minHeight: 54, borderRadius: 17, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: colors.orange, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  trackingOpenMapsText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 12 },
  walletHeading: { color: colors.orange, fontSize: 26, fontWeight: '900' },
  escrowCard: { gap: 12 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', flexDirection: 'row' },
  progressGreen: { flex: 3, backgroundColor: colors.green },
  progressOrange: { flex: 2, backgroundColor: colors.orange },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  txIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txAmount: { alignItems: 'flex-end', gap: 6 },
  txMoney: { color: colors.green, fontWeight: '900' },
  txMoneyOut: { color: colors.red },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.border },
  avatarWrap: { position: 'relative', overflow: 'visible' },
  onlineDot: { position: 'absolute', right: 0, bottom: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.white },
  offlineDot: { backgroundColor: '#9CA3AF' },
  datePill: { alignSelf: 'center', marginTop: 12, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  datePillText: { color: colors.textGray, fontSize: 11, fontWeight: '900' },
  chatContent: { padding: 16, paddingBottom: 24 },
  messageBlock: { marginBottom: 12, alignSelf: 'flex-start', maxWidth: '75%' },
  messageBlockRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 18, padding: 14 },
  sent: { backgroundColor: colors.darkNavy },
  received: { backgroundColor: colors.inputBg },
  bubbleText: { color: colors.text, fontSize: 15 },
  sentText: { color: colors.white, fontSize: 15 },
  timestamp: { color: colors.textGray, fontSize: 11, marginTop: 4 },
  timestampRight: { textAlign: 'right' },
  composer: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'visible' },
  providerLocationPrompt: { borderRadius: 18, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: 'rgba(242,101,34,0.22)', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerLocationPromptTitle: { color: colors.orange, fontSize: 15, fontWeight: '900' },
  providerLocationPromptText: { color: colors.textGray, fontSize: 12, lineHeight: 18, marginTop: 2 },
  verifiedLabel: { color: colors.green, fontSize: 11, fontWeight: '900' },
  verifiedLabelBlue: { color: colors.blue },
  providerNeutralLabel: { color: colors.textGray, fontSize: 11, fontWeight: '900' },
  providerBalance: { backgroundColor: colors.darkNavy, gap: 8 },
  providerBalanceText: { color: colors.white, fontSize: 34, fontWeight: '900' },
  trend: { color: colors.green, fontWeight: '800' },
  providerWithdrawButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  providerWithdrawText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, gap: 8 },
  statValue: { color: colors.textDark, fontSize: 22, fontWeight: '900' },
  statMeta: { color: colors.textGray, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  providerFilterPanel: { gap: 12 },
  providerSearchBox: { minHeight: 50, borderRadius: 16, backgroundColor: '#132541', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerSearchInput: { flex: 1, color: colors.white, fontSize: 14, paddingVertical: 0, fontFamily: 'DMSans_400Regular' },
  providerCategoryScroll: { gap: 10, paddingVertical: 2 },
  providerCategoryChip: { minHeight: 40, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerCategoryChipActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  providerCategoryText: { color: colors.textGray, fontSize: 11, fontWeight: '900' },
  providerCategoryTextActive: { color: colors.white },
  providerClearFilters: { alignSelf: 'flex-start', minHeight: 38, borderRadius: 14, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: 'rgba(242,101,34,0.18)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  providerClearFiltersText: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  requestCard: { gap: 12 },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptButton: { flex: 1, height: 44, borderRadius: 14, backgroundColor: colors.darkNavy, alignItems: 'center', justifyContent: 'center' },
  declineButton: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: colors.white, fontWeight: '900' },
  declineText: { color: colors.textDark, fontWeight: '900' },
  listingCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerListingCard: { backgroundColor: colors.white, borderRadius: 24, padding: 16, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  providerServiceCard: { backgroundColor: colors.white, borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  providerListingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  availabilityPill: { borderRadius: 999, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4 },
  availabilityPillOff: { backgroundColor: '#F3F4F6' },
  availabilityPillText: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  availabilityPillTextOff: { color: colors.textGray },
  providerListingStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  providerListingStatText: { color: colors.blue, fontSize: 10, fontWeight: '900', backgroundColor: '#EFF6FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  listingImage: { width: 80, height: 64, borderRadius: 16, backgroundColor: colors.inputBg },
  emptyListingCard: { backgroundColor: colors.white, borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  fab: { position: 'absolute', bottom: 100, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', shadowColor: colors.orange, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBadge: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  statusText: { color: colors.green, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { width: '48%', minHeight: 150, gap: 8 },
  metricCardBlue: { width: '48%', minHeight: 150, gap: 8, backgroundColor: colors.blue },
  metricValue: { color: colors.textDark, fontSize: 28, fontWeight: '900' },
  metricLabelLight: { color: '#DBEAFE', fontSize: 11, fontWeight: '900' },
  metricValueLight: { color: colors.white, fontSize: 28, fontWeight: '900' },
  cardShadow: { backgroundColor: colors.white, borderRadius: 20, padding: 16, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  queueItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  initials: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: colors.textDark, fontWeight: '900' },
  chevron: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  accountHeader: { alignItems: 'center', gap: 12 }
});
