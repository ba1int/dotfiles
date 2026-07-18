Build a dependency-oriented timeline.

- Identify the concrete application instance, process manager/unit, listener, upstream, downstream, and data-store dependencies.
- Compare process age, failed units, and resource pressure. Request `network` or sensitive logs only when those observations cannot discriminate the fault.
- Avoid treating a running process or open port as proof of application health.
- Prefer one discriminating follow-up observation over broad log scraping.
