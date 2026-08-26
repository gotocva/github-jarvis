import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { compactNumber, type Slice } from '@/lib/analytics'

/**
 * Lines added and removed are the same unit either side of zero, so this is a
 * diverging pair — warm/cool poles with a neutral zero line between them.
 */
const config = {
  additions: { label: 'Lines added', color: 'var(--chart-additions)' },
  deletions: { label: 'Lines removed', color: 'var(--chart-deletions)' },
} satisfies ChartConfig

const MAX_ROWS = 10

export function CodeChanges({
  slices,
  title,
  description,
}: {
  slices: Slice[]
  title: string
  description: string
}) {
  const data = [...slices]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, MAX_ROWS)
    .map((s) => ({
      label: s.label,
      additions: s.additions,
      // Negative so the bar grows left of the zero line.
      deletions: -s.deletions,
    }))

  const hasData = data.some((d) => d.additions !== 0 || d.deletions !== 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No line changes in this range.
          </p>
        ) : (
          <ChartContainer
            config={config}
            style={{ height: Math.max(200, data.length * 34 + 56) }}
            className="w-full"
          >
            <BarChart
              data={data}
              layout="vertical"
              stackOffset="sign"
              margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
              barCategoryGap={6}
            >
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v: number) => compactNumber(Math.abs(v))}
                className="tabular-nums"
              />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={132}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <ReferenceLine x={0} stroke="var(--chart-grid)" />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="h-0.5 w-3 rounded-full"
                            style={{ background: `var(--color-${name})` }}
                          />
                          {config[name as keyof typeof config]?.label ?? name}
                        </span>
                        <span className="font-medium tabular-nums">
                          {compactNumber(Math.abs(Number(value)))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/*
                The stroke is the card surface, not a border: it paints the 2px
                gap that keeps the two poles from touching at zero.
              */}
              <Bar
                dataKey="deletions"
                isAnimationActive={false}
                stackId="lines"
                fill="var(--color-deletions)"
                stroke="var(--color-card)"
                strokeWidth={2}
                maxBarSize={24}
                radius={[4, 0, 0, 4]}
              />
              <Bar
                dataKey="additions"
                isAnimationActive={false}
                stackId="lines"
                fill="var(--color-additions)"
                stroke="var(--color-card)"
                strokeWidth={2}
                maxBarSize={24}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
