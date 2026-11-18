import json

import pytest

from violet_agent.config import _commands


def test_named_commands_are_parsed_as_fixed_specs():
    parsed = _commands(json.dumps({
        "git_status": {
            "executable": "git",
            "args": ["status", "--short"],
            "root_index": 0,
        }
    }))
    assert parsed["git_status"].executable == "git"
    assert parsed["git_status"].args == ("status", "--short")


def test_command_configuration_rejects_invalid_id():
    with pytest.raises(RuntimeError):
        _commands(json.dumps({
            "git status": {"executable": "git", "args": []}
        }))


def test_command_configuration_rejects_untrusted_args_shape():
    with pytest.raises(RuntimeError):
        _commands(json.dumps({
            "install": {"executable": "powershell", "args": "Remove-Item *"}
        }))
