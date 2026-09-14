WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  EXECUTE IMMEDIATE 'GRANT EXECUTE ON cwms_20.cwms_upass TO web_user';
  cwms_sec.add_cwms_user('scan-owner', NULL, 'SWT');
  cwms_sec.add_user_to_group('scan-owner', 'All Users', 'SWT');
  cwms_sec.add_user_to_group('scan-owner', 'CWMS Users', 'SWT');
  cwms_sec.add_cwms_user('scan-other', NULL, 'SWT');
  cwms_sec.add_user_to_group('scan-other', 'All Users', 'SWT');
  cwms_sec.add_user_to_group('scan-other', 'CWMS Users', 'SWT');
  cwms_sec.add_cwms_user('scan-outside', NULL, 'SPK');
  cwms_sec.add_user_to_group('scan-outside', 'All Users', 'SPK');
  cwms_sec.add_user_to_group('scan-outside', 'CWMS Users', 'SPK');
END;
/
COMMIT;
EXIT;
