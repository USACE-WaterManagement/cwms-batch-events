-- Schema 1.01.03: insert historical data without current API validation.
INSERT INTO events.scripts (id, office, name, slug, description, repo_path, execution_type, active, roles)
VALUES
 ('10000000-0000-0000-0000-000000000001','SWT','Relative','relative','Historical valid path','python/report.py','python',true,ARRAY['CWMS Users']),
 ('10000000-0000-0000-0000-000000000002','SWT','Absolute','absolute','Historical absolute path','/jobs/python/report.py','python',true,ARRAY['CWMS Users']),
 ('10000000-0000-0000-0000-000000000003','SWT','Parent','parent','Historical parent path','../report.py','python',true,ARRAY['CWMS Users']),
 ('10000000-0000-0000-0000-000000000004','SWT','Inactive','inactive','Inactive registration','python/inactive.py','python',false,ARRAY['CWMS Users']),
 ('10000000-0000-0000-0000-000000000005','SWT','Restricted','restricted','Different role','python/private.py','python',true,ARRAY['RDL Reviewer']),
 ('10000000-0000-0000-0000-000000000006','LRH','Other office','other-office','Other district','python/report.py','python',true,ARRAY['CWMS Users']);
INSERT INTO events.scripts_job_runners SELECT id, '58600a09-f18e-42c5-9d3c-df52ebe409f9'::uuid FROM events.scripts;
INSERT INTO events.jobs (id,script_name,job_status,username,office,job_runner_id,script_id,script_slug,repo_path,execution_type)
VALUES ('20000000-0000-0000-0000-000000000001','Absolute','Completed','upgrade-user','SWT','58600a09-f18e-42c5-9d3c-df52ebe409f9','10000000-0000-0000-0000-000000000002','absolute','/jobs/python/report.py','python');
