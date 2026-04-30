# Test Plan — MVP

## Backend

- healthcheck
- create device
- assign component
- block READY_FOR_SHIPMENT without FINAL_TEST_PASSED
- final test PASS changes status
- final test FAIL creates NCR
- service package upload computes SHA256

## Final Test Runner

- MockMcuClient PING
- MockMcuClient RUN_SELF_TEST PASS
- result JSON generation
- backend upload

## Mobile

- create local session
- run 10-step checklist
- add comment
- add photo
- generate ZIP
- queue upload when offline
- upload after network returns
