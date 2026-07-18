Correlate the Nagios/Naemon object, target service state, and plugin/transport path.

- Identify the exact host/service definition and current attempt/state type.
- Treat ticket/alert fields as reported state until current Nagios object data is observed. Default target-side checks cannot prove recovery or clear the alert.
- Compare process and unit timestamps with the alert timestamp. Request `nagios_logs` or `nagios_config` only when needed to distinguish the remaining hypotheses.
- Distinguish service failure from NRPE/agent, plugin, command definition, reachability, or stale-result failure.
- Do not acknowledge, reschedule, silence, restart, reload, or edit objects during discovery.
