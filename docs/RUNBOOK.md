# Runbook — verified external-config steps

> Every external-config click-path goes here, with EXACT steps (page → button → field).
> **Rule:** a step only lands here AFTER it's confirmed working in the live app. This is the
> single source of truth so the same "exactly tell me where do I change this" question never
> recurs across sessions.

## Hosting / deploy
_TODO — provider, project name, how a deploy is triggered, how to rename/add a domain._

## Database / auth provider
_TODO — keys, where they live, migration command._

## OAuth / external integrations
_TODO — consent screen, redirect URIs, scopes._

## Domains / DNS
_TODO._

---
### Template for a new entry
```
## <Provider> — <task>
1. Go to <exact page / URL>
2. Click <exact button/menu>
3. Set <field> = <value>
4. Verify: <what you should see when it worked>
Last verified: <date> by <session>
```
