import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import { formatWeek, formatWeekLong, type WeekPoint } from '@/lib/analytics'

/** One series, so no legend box — the card title already names what is plotted. */
const config = {
  commits: { label: 'Commits', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function CommitsOverTime({
  points,
  description,
}: {
  points: WeekPoint[]
  description: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Commits over time</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No commits in this range.
          </p>
        ) : (
          <ChartContainer config={config} className="h-64 w-full">
            <AreaChart data={points} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={formatWeek}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={36}
                allowDecimals={false}
                className="tabular-nums"
              />
              <ChartTooltip
                cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      formatWeekLong(Number(payload?.[0]?.payload?.week))
                    }
                  />
                }
              />
              <Area
                dataKey="commits"
                type="monotone"
                /* Re-animating on every filter change reads as a flash. */
                isAnimationActive={false}
                stroke="var(--color-commits)"
                strokeWidth={2}
                fill="var(--color-commits)"
                fillOpacity={0.1}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-card)' }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
