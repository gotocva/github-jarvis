import { useSearchParams } from 'react-router-dom'
import { GiveAccessForm } from '@/components/give-access-form'
import { PageHeader } from '@/components/page-header'
import { RevokeAccess } from '@/components/revoke-access'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const TABS = ['give', 'revoke'] as const
type Tab = (typeof TABS)[number]

export function AccessManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'give'

  return (
    <>
      <PageHeader
        title="Access Management"
        description="Grant repository permissions, or find and revoke everything an account can reach."
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearchParams(
            (previous) => {
              // Keep ?org= so switching tabs doesn't reset the form.
              const next = new URLSearchParams(previous)
              next.set('tab', value)
              return next
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="give">Give access</TabsTrigger>
          <TabsTrigger value="revoke">Revoke access</TabsTrigger>
        </TabsList>

        <TabsContent value="give" className="mt-4">
          <GiveAccessForm />
        </TabsContent>
        <TabsContent value="revoke" className="mt-4">
          <RevokeAccess />
        </TabsContent>
      </Tabs>
    </>
  )
}
