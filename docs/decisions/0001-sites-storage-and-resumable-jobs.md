# Sites storage and resumable jobs

Dozi uses D1 and R2 for the deployed vertical MVP because they are the native durable resources of the current hosting platform. Domain boundaries remain portable to PostgreSQL and S3.

Sites does not currently expose a queue binding in the project manifest. Generation jobs therefore persist before work begins and are resumed by authenticated polling. Completion is idempotent. A future queue consumer can call the same orchestrator without changing browser contracts or records.
