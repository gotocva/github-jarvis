import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { compactNumber, type Slice } from '@/lib/analytics'

/**
 * Nominal categories, so every bar wears the same hue — a value-ramp here would
 * double-encode the bar length and burn the only free channel.
 */
const config = {
  commits: { label: 'Commits', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** Rows beyond this fold into "Other"; the table below carries every row. */
const MAX_BARS = 10

export function RankedBars({
  slices,
  title,
  description,
}: {
  slices: Slice[]
  title: string
  description: string
}) {
  const head = slices.slice(0, MAX_BARS)
  const tail = slices.slice(MAX_BARS)
  const data = [
    ...head.map((s) => ({ label: s.label, commits: s.commits })),
    ...(tail.length > 0
      ? [
          {
            label: `Other (${tail.length})`,
            commits: tail.reduce((sum, s) => sum + s.commits, 0),
          },
        ]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing to rank in this range.
          </p>
        ) : (
          <ChartContainer
            config={config}
            /* Height grows with the rows so the axis band is never clipped. */
            style={{ height: Math.max(180, data.length * 34 + 24) }}
            className="w-full"
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 4, right: 48, top: 4, bottom: 4 }}
              barCategoryGap={6}
            >
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={132}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
              <Bar
                dataKey="commits"
                isAnimationActive={false}
                fill="var(--color-commits)"
                maxBarSize={24}
                radius={[0, 4, 4, 0]}
              >
                {/* Value at the tip — outside the bar, so it never gets clipped. */}
                <LabelList
                  dataKey="commits"
                  position="right"
                  offset={8}
                  className="fill-muted-foreground tabular-nums"
                  fontSize={12}
                  formatter={(value: unknown) => compactNumber(Number(value))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
