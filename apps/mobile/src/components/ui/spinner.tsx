import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native'

export interface SpinnerProps extends ActivityIndicatorProps {
  size?: ActivityIndicatorProps['size']
}

/** Indicador de carregamento — wrap de ActivityIndicator. */
export function Spinner({ size = 'small', ...props }: SpinnerProps) {
  return <ActivityIndicator size={size} {...props} />
}
