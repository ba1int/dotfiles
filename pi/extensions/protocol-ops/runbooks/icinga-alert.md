Correlate three views: Icinga's reported object, the monitored service on the target, and the check transport/plugin path.

- Query `ops_monitoring` first to identify the exact host/service object, current state, HARD/SOFT state type, check attempt, last result, and whether the result is stale. Do not infer the master's configured checks from files or processes on the target host.
- Treat ticket/alert fields as reported state until current Icinga object data is observed. Default target-side checks cannot prove recovery or clear the alert.
- Compare target process and unit timestamps with the alert timestamp. Request `icinga_logs` or `icinga_config` only when needed to distinguish the remaining hypotheses.
- Distinguish service failure from check execution, endpoint, zone, certificate, reachability, or stale-result failure.
- Do not acknowledge, reschedule, silence, reload, or alter an Icinga object during discovery.
