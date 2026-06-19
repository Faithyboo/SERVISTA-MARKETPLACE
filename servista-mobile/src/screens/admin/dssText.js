import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { withFont } from '../../theme/typography';

export function Text({ style, children, ...props }) {
  return <RNText {...props} style={withFont(style)}>{children}</RNText>;
}

export function TextInput({ style, ...props }) {
  return <RNTextInput {...props} style={withFont(style)} />;
}
