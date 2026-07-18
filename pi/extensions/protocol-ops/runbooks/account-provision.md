## Normal account provisioning

Use this runbook only to create a new, non-privileged login account under an existing ticket/reference.

1. Do not run generic baseline observations for routine provisioning. `ops_account` owns the purpose-built account-absence, passwordless-root, and required-tool preflight.
2. Call `ops_account` with the exact active-task hosts, portable username, `/bin/bash` or `/bin/sh`, home creation enabled, and forced password change enabled.
3. Do not request another prose confirmation. `ops_task` already confirmed the read scope and `ops_account` presents the complete mutation approval after preflight and advisory review.
4. The new account receives no supplementary groups and no sudo grant. A privileged account or changes to an existing account require a different reviewed action.
5. The temporary password is generated inside the executor after approval, written to a private local `0600` file, and never returned to either model.
6. Treat only an `ACCOUNT CHANGE COMPLETE` receipt as success. Any incomplete apply or rollback is a hard stop requiring manual inspection of every target.
