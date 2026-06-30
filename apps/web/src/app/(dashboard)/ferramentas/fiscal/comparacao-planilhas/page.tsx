'use client'

import { ToolPage } from '../../_components/tool-page'
import { TOOL_UI } from '../../_config/tools'

export default function Page() {
  return <ToolPage config={TOOL_UI['comparacao-planilhas']!} />
}
