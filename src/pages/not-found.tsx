import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-muted p-4">
        <Compass className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          That route doesn't exist in GitHub Jarvis.
        </p>
      </div>
      <Button asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  )
}
