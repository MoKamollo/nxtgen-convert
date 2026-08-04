DROP TABLE IF EXISTS workflow_experiment_assignments;
DROP TABLE IF EXISTS workflow_goal_events;
ALTER TABLE workflow_enrollments DROP COLUMN IF EXISTS goal_reached_at;
ALTER TABLE workflow_enrollments DROP COLUMN IF EXISTS exited_at;
ALTER TABLE workflow_enrollments DROP COLUMN IF EXISTS exit_reason;
ALTER TABLE workflow_enrollments DROP COLUMN IF EXISTS exit_type;
