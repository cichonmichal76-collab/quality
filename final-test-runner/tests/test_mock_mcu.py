from servicetrace_runner.mcu_client import MockMcuClient


def test_mock_mcu_ping():
    client = MockMcuClient("ZSS-TEST")
    assert client.ping() is True


def test_mock_self_test_pass():
    client = MockMcuClient("ZSS-TEST")
    result = client.run_self_test()
    assert result["test_result"] == "PASS"
