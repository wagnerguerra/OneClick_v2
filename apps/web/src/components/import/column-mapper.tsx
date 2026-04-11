'use client'

import { ArrowRight } from 'lucide-react'
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import type { ColumnMapping } from '@/lib/parse-import'

interface ColumnMapperProps {
  fileHeaders: string[]
  firstRow: Record<string, string>
  systemColumns: ColumnMapping[]
  mappings: Map<string, string> // fieldName → fileHeader
  onMappingChange: (fieldName: string, fileHeader: string) => void
}

export function ColumnMapper({ fileHeaders, firstRow, systemColumns, mappings, onMappingChange }: ColumnMapperProps) {
  // Colunas do sistema que precisam ser mapeadas
  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_32px_1fr] gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 rounded-[2px]">
        <span>Campo do sistema</span>
        <span />
        <span>Coluna do arquivo</span>
      </div>

      {/* Rows */}
      {systemColumns.map(col => {
        const mappedHeader = mappings.get(col.fieldName) ?? ''
        const previewValue = mappedHeader ? String(firstRow[mappedHeader] ?? '').slice(0, 50) : ''
        const isMapped = !!mappedHeader

        return (
          <div
            key={col.fieldName}
            className={cn(
              'grid grid-cols-[1fr_32px_1fr] gap-2 items-center px-3 py-2 rounded-[2px] border transition-all duration-200',
              isMapped
                ? 'bg-emerald-50/50 border-emerald-200/50 dark:bg-emerald-950/10 dark:border-emerald-800/30'
                : col.required
                  ? 'bg-destructive/5 border-destructive/20'
                  : 'bg-card border-border/30',
            )}
          >
            {/* Campo do sistema */}
            <div>
              <span className="text-sm font-medium text-foreground">
                {col.label}
                {col.required && <span className="text-destructive ml-0.5">*</span>}
              </span>
            </div>

            {/* Seta */}
            <div className="flex justify-center">
              <ArrowRight className={cn('h-3.5 w-3.5 transition-colors', isMapped ? 'text-emerald-500' : 'text-muted-foreground/30')} />
            </div>

            {/* Select da coluna do arquivo */}
            <div className="space-y-0.5">
              <Select
                value={mappedHeader || '__ignore__'}
                onValueChange={v => onMappingChange(col.fieldName, v === '__ignore__' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="(Ignorar)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ignore__">(Ignorar)</SelectItem>
                  {fileHeaders.map(h => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Preview do valor */}
              {previewValue && (
                <p className="text-[10px] text-muted-foreground truncate px-1">
                  Ex: {previewValue}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
