export const colors = {
  primary: '#F26522',
  orange: '#F26522',
  navy: '#0A192F',
  darkNavy: '#0A192F',
  darkCard: '#112240',
  white: '#FFFFFF',
  background: '#F8F9FA',
  text: '#1A1A2E',
  textDark: '#1A1A2E',
  subtext: '#6B7280',
  textGray: '#6B7280',
  success: '#10B981',
  green: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  red: '#EF4444',
  border: '#E5E7EB',
  inputBackground: '#F3F4F6',
  inputBg: '#F3F4F6',
  blue: '#3B82F6'
};

export const categories = [
  { label: 'All Services', value: '' },
  { label: 'Plumbing', value: 'plumbing' },
  { label: 'Electrical', value: 'electrical' },
  { label: 'Cleaning', value: 'cleaning' },
  { label: 'Beauty', value: 'beauty' },
  { label: 'Catering', value: 'catering' },
  { label: 'Other', value: 'other' }
];

export const formatMoney = (value) => `${Number(value || 0).toLocaleString()} FCFA`;
