import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "3 months ago" style label for an ISO timestamp. */
export function relativeTime(iso: string | undefined) {
  if (!iso) return '—'
  const delta = new Date(iso).getTime() - Date.now()
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= ms) return relativeFormatter.format(Math.round(delta / ms), unit)
  }
  return 'just now'
}

export function daysSince(iso: string | undefined) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}
