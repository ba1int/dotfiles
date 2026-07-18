Correlate three views: Icinga's reported object, the monitored service on the target, and the check transport/plugin path.

- Identify the host/service object and whether the state is HARD or SOFT, current or stale.
- Compare target process and unit timestamps with the alert timestamp. Request `icinga_logs` or `icinga_config` only when needed to distinguish the remaining hypotheses.
- Distinguish service failure from check execution, endpoint, zone, certificate, reachability, or stale-result failure.
- Do not acknowledge, reschedule, silence, reload, or alter an Icinga object during discovery.
