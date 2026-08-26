import * as React from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
  description?: string
  imageUrl?: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Allows committing free text that isn't in `options` (e.g. a new username). */
  allowCustom?: boolean
  customLabel?: (input: string) => string
  disabled?: boolean
  loading?: boolean
  className?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results.',
  allowCustom = false,
  customLabel = (input) => `Add "${input}"`,
  disabled,
  loading,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const labelFor = React.useCallback(
    (v: string) => options.find((o) => o.value === v)?.label ?? v,
    [options],
  )

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  const trimmed = query.trim()
  const showCustom =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => o.value.toLowerCase() === trimmed.toLowerCase()) &&
    !value.some((v) => v.toLowerCase() === trimmed.toLowerCase())

  const addCustom = () => {
    onChange([...value, trimmed])
    setQuery('')
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
              {loading
                ? 'Loading…'
                : value.length === 0
                  ? placeholder
                  : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          /*
           * Bounding the panel to the space Radix measured keeps a long member
           * list from flipping above the trigger and running off the screen.
           */
          className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) flex-col overflow-hidden p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={12}
        >
          <Command className="flex min-h-0 flex-col">
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && showCustom) {
                  event.preventDefault()
                  addCustom()
                }
              }}
            />
            <CommandList className="max-h-56 min-h-0 flex-1">
              <CommandEmpty>
                {showCustom ? (
                  <button
                    type="button"
                    onClick={addCustom}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                  >
                    <Plus className="size-4" />
                    {customLabel(trimmed)}
                  </button>
                ) : (
                  emptyText
                )}
              </CommandEmpty>
              {showCustom && (
                <CommandGroup>
                  <CommandItem value={`__custom__${trimmed}`} onSelect={addCustom}>
                    <Plus className="size-4" />
                    {customLabel(trimmed)}
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => toggle(option.value)}
                  >
                    <Check
                      className={cn(
                        'size-4',
                        value.includes(option.value) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {option.imageUrl && (
                      <img
                        src={option.imageUrl}
                        alt=""
                        className="size-5 rounded-full"
                        loading="lazy"
                      />
                    )}
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {options.length > 0 && (
            <div className="flex items-center justify-between border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(options.map((o) => o.value))}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                disabled={value.length === 0}
              >
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-40 truncate">{labelFor(v)}</span>
              <button
                type="button"
                onClick={() => toggle(v)}
                className="rounded-full p-0.5 hover:bg-background/60"
                aria-label={`Remove ${labelFor(v)}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
