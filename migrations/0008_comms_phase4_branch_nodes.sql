-- Phase 4 — Branching nodes (branch_engagement + branch_loan_state)
--
-- Branch nodes own two ordered child sequences ('yes' / 'no') in addition to
-- the existing top-level sequence. We model the tree by adding parent_node_id
-- + branch_side to comms_automation_nodes; order_index becomes scoped to
-- (parent_node_id, branch_side). Top-level nodes keep parent_node_id = NULL.
--
-- Each branch evaluation appends to comms_automation_runs.branch_path (a
-- decision audit trail) and the path is snapshotted onto each send_log row
-- so the Send Log + run-detail UI can show "Branch: Engagement → No".

ALTER TABLE comms_automation_nodes
  ADD COLUMN IF NOT EXISTS parent_node_id integer REFERENCES comms_automation_nodes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch_side varchar(8); -- 'yes' | 'no' | NULL (top-level)

ALTER TABLE comms_automation_runs
  ADD COLUMN IF NOT EXISTS branch_path jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE comms_send_log
  ADD COLUMN IF NOT EXISTS branch_path jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comms_automation_nodes_parent
  ON comms_automation_nodes(parent_node_id, branch_side, order_index);
