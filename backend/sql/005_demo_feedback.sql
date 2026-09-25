-- Demo user-feedback workflow, screenshot metadata and permission grants.

BEGIN;

CREATE TABLE IF NOT EXISTS demo_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_page VARCHAR(160) NOT NULL,
    feedback_type VARCHAR(40) NOT NULL,
    title VARCHAR(220) NOT NULL,
    description TEXT NOT NULL,
    suggested_change TEXT NOT NULL DEFAULT '',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    internal_note TEXT NOT NULL DEFAULT '',
    screenshot_original_name VARCHAR(255),
    screenshot_storage_name VARCHAR(255) UNIQUE,
    screenshot_url VARCHAR(500),
    screenshot_content_type VARCHAR(80),
    screenshot_size INTEGER,
    submitted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (feedback_type IN (
        'bug', 'improvement', 'new_feature', 'ui_change',
        'workflow_change', 'permission_change', 'report_request'
    )),
    CHECK (priority IN ('low', 'medium', 'high')),
    CHECK (status IN ('new', 'under_review', 'accepted', 'rejected', 'completed')),
    CHECK (screenshot_size IS NULL OR screenshot_size >= 0)
);

CREATE INDEX IF NOT EXISTS ix_demo_feedback_status_created
    ON demo_feedback (status, created_at);
CREATE INDEX IF NOT EXISTS ix_demo_feedback_priority
    ON demo_feedback (priority);
CREATE INDEX IF NOT EXISTS ix_demo_feedback_type
    ON demo_feedback (feedback_type);
CREATE INDEX IF NOT EXISTS ix_demo_feedback_module_page
    ON demo_feedback (module_page);

INSERT INTO permissions (code, module, description)
VALUES
    ('feedback.create', 'feedback', 'Submit feedback about the demo platform.'),
    ('feedback.view', 'feedback', 'View and export submitted demo feedback.'),
    ('feedback.manage', 'feedback', 'Triage, assign and resolve demo feedback.')
ON CONFLICT (code) DO UPDATE SET
    module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE permission.code = 'feedback.create'
  AND role.name IN (
      'system_user', 'viewer', 'catalogue_editor', 'catalogue_approver',
      'catalogue_admin', 'superadmin'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE permission.code IN ('feedback.view', 'feedback.manage')
  AND role.name IN ('catalogue_admin', 'superadmin')
ON CONFLICT DO NOTHING;

COMMIT;
