import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { colors } from '@/components/ui'
import { useSession } from '@/lib/auth-client'

export default function Index() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.bg,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator />
      </View>
    )
  }

  return <Redirect href={session ? '/dashboard' : '/login'} />
}
