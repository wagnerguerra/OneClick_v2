// Hook da preferência de tema pra UI (ex.: a linha "Tema" do Perfil).
// Carrega a preferência salva e expõe um setter que aplica + persiste na hora.
import { useEffect, useState } from 'react'

import { getThemePref, setThemePref, type ThemePref } from './theme-preference'

export function useThemePref() {
  const [pref, setPref] = useState<ThemePref>('system')

  useEffect(() => {
    let vivo = true
    getThemePref().then((p) => {
      if (vivo) setPref(p)
    })
    return () => {
      vivo = false
    }
  }, [])

  const escolher = (p: ThemePref) => {
    setPref(p)
    void setThemePref(p)
  }

  return { pref, setPref: escolher }
}
