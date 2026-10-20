printf 'CWMS Batch Events chained upload example\n' > '/tmp/job status.txt' &&
echo 'Generated file contents:' &&
cat '/tmp/job status.txt' &&
cwms-cli blob upload --input-file '/tmp/job status.txt' --blob-id "$DEMO_BLOB_ID" --media-type text/plain --office SWT
