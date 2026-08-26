import { useState } from 'react'
import { CalendarIcon, Check, ChevronDown } from 'lucide-react'
import type { DateRange } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface RangePreset {
  id: string
  label: string
  /** Days back from today; null means every week GitHub reports. */
  days: number | null
}

export const RANGE_PRESETS: RangePreset[] = [
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: '6m', label: 'Last 6 months', days: 182 },
  { id: '1y', label: 'Last 12 months', days: 365 },
  { id: 'all', label: 'All time', days: null },
]

export function presetRange(preset: RangePreset): DateRange {
  if (preset.days === null) return {}
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - preset.days)
  return { from, to }
}

const formatDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function rangeLabel(range: DateRange, presetId: string | null) {
  const preset = RANGE_PRESETS.find((p) => p.id === presetId)
  if (preset) return preset.label
  if (range.from && range.to) return `${formatDate(range.from)} – ${formatDate(range.to)}`
  if (range.from) return `From ${formatDate(range.from)}`
  if (range.to) return `Until ${formatDate(range.to)}`
  return 'All time'
}

/**
 * Presets first — nobody fights a calendar grid for "last 30 days" — with the
 * custom range tucked behind a hairline in the footer.
 */
export function DateRangePicker({
  range,
  presetId,
  onChange,
  disabled,
}: {
  range: DateRange
  presetId: string | null
  onChange: (range: DateRange, presetId: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setShowCalendar(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="justify-between">
          <CalendarIcon className="size-4" />
          {rangeLabel(range, presetId)}
          <ChevronDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0" collisionPadding={12}>
        <div className="min-w-52 p-1">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onChange(presetRange(preset), preset.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Check
                className={cn(
                  'size-4 shrink-0',
                  presetId === preset.id ? 'opacity-100' : 'opacity-0',
                )}
                strokeWidth={3}
              />
              {preset.label}
            </button>
          ))}
        </div>

        <div className="border-t p-1">
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Check
              className={cn('size-4 shrink-0', presetId === null ? 'opacity-100' : 'opacity-0')}
              strokeWidth={3}
            />
            Custom range
            <ChevronDown
              className={cn(
                'ml-auto size-3.5 opacity-50 transition-transform',
                showCalendar && 'rotate-180',
              )}
            />
          </button>

          {showCalendar && (
            <div className="border-t pt-1">
              <Calendar
                mode="range"
                defaultMonth={range.from}
                selected={{ from: range.from, to: range.to }}
                onSelect={(next) => onChange({ from: next?.from, to: next?.to }, null)}
                numberOfMonths={1}
                disabled={{ after: new Date() }}
                autoFocus
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
