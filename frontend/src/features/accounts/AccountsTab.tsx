import { ACCOUNT_IDS, type AccountId, type TaxRules } from '@/api/accounts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountSwatch } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import { AccountDetail } from './AccountDetail'
import { accountGuides } from './content'

interface AccountsTabProps {
  rules: TaxRules
  account: AccountId
  onAccountChange: (account: AccountId) => void
}

/** « Les 4 comptes » : one account at a time, picked from four color-keyed tabs. */
export function AccountsTab({ rules, account, onAccountChange }: AccountsTabProps) {
  const guides = accountGuides(rules)
  return (
    <Tabs value={account} onValueChange={(value) => onAccountChange(value as AccountId)}>
      <TabsList aria-label="Choisir un compte" className="max-w-full justify-start overflow-x-auto">
        {ACCOUNT_IDS.map((id) => (
          <TabsTrigger key={id} value={id} className="gap-2">
            <AccountSwatch account={id} />
            {ACCOUNTS[id].short}
          </TabsTrigger>
        ))}
      </TabsList>
      {guides.map((guide) => (
        <TabsContent key={guide.id} value={guide.id}>
          <AccountDetail guide={guide} rules={rules} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
