# District job schedules

Scripts Manager supports manual execution, an hourly minute (0–59), or a numeric five-field cron expression, with an IANA timezone such as `America/Chicago`. Schedules default to disabled and UTC. Script administrators enable schedules; the scheduler catalog includes only active, enabled scripts authorized for its account's office roles.

`GET /scripts/scheduled` returns the authorized schedule catalog. The `cwms_batch_events_scheduled_jobs` DAG in `airflow-config` evaluates each row in its selected timezone and calls `POST /jobs`. Spring daylight-saving gaps are skipped and repeated fall times run once.

Configure the Airflow DAG's credentials and unpause it to run enabled schedules. When moving a job from an hourly/daily DAG, remove its previous trigger to avoid duplicate execution.

The scheduler authenticates with a CDA API key. Provision a dedicated CDA account/key, grant the roles required by the registered jobs, and configure `BATCH_EVENTS_API_ROOT` plus `BATCH_EVENTS_API_KEY` in Airflow's secret-backed variables. Optional office-specific `BATCH_EVENTS_API_KEY_<OFFICE>` values select credentials for each office, and `BATCH_EVENTS_SCHEDULED_OFFICES` limits which offices are scheduled. Scheduler credentials remain in Airflow; they are not passed into district jobs.
