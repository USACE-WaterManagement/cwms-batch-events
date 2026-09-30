# Job cancellation

Users with access to an office can request cancellation for that office's queued or running jobs. HQ Data Acquisition and Data Exchange administrators can monitor and control jobs across offices through the Queues admin section.

Queued jobs without a dispatch claim are marked `Cancelled` in the database before queue delivery. Jobs already claimed for dispatch are not cancelled automatically because their AWS submission result may be uncertain.

AWS Batch jobs use `CancelJob` while pending and `TerminateJob` while running. They remain `Cancelling` until the status callback confirms the final result. A successful runner stop becomes `Cancelled`. A job that completes successfully during the race remains `Completed`.

Local Docker jobs are labelled with the application job ID. The API stops the matching container and records the resulting cancelled state. The local API and dispatcher need access to the Docker socket for this path.

Every request and runner response is written to `job_control_audit`. The UI shows a confirmation dialog, uses the standard action or error toast, refreshes the job and queue views, and opens the job history page after a successful request.

The AWS API runtime must have permission to call `batch:CancelJob` and `batch:TerminateJob` for the configured queues. If those permissions are unavailable, the request is rejected and the job returns to its prior state.
