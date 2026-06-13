import { View } from 'react-native';

export function Marker({ children }) {
  return <View>{children}</View>;
}

export default function MapView({ children, style }) {
  return <View style={style}>{children}</View>;
}
