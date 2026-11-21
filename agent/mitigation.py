#!/usr/bin/env python3
"""Kairo Sensor Host Mitigation & IPS Quarantine Daemon.

Enforces hardware-speed L3/L4 packet dropping directly on sensor gateway hosts.
Works natively on both Linux (iptables / nftables) and Windows Server (netsh).
"""

from __future__ import annotations

import ipaddress
import logging
import os
import platform
import subprocess
import sys
from typing import Any

logger = logging.getLogger("kairo.sensor.mitigation")

# Protected addresses that must never be blocked
IMMUTABLE_WHITELIST = {
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "8.8.8.8",
    "1.1.1.1",
}


def validate_ip(ip_str: str) -> bool:
    """Validate that input is a valid IPv4 or IPv6 address and not whitelisted."""
    clean = ip_str.strip()
    if not clean or clean in IMMUTABLE_WHITELIST or clean.startswith("127."):
        return False
    try:
        ipaddress.ip_address(clean)
        return True
    except ValueError:
        return False


def block_ip(ip_str: str, reason: str = "Kairo-IPS-AutoQuarantine") -> dict[str, Any]:
    """Insert an immediate inbound packet drop rule into the host OS firewall."""
    if not validate_ip(ip_str):
        return {"success": False, "error": f"Invalid or whitelisted IP address: {ip_str}"}

    system = platform.system().lower()

    if system == "linux":
        # Check if already blocked in iptables
        check_cmd = ["iptables", "-C", "INPUT", "-s", ip_str, "-j", "DROP"]
        res = subprocess.run(check_cmd, capture_output=True, text=True)
        if res.returncode == 0:
            return {"success": True, "driver": "iptables", "message": f"{ip_str} already quarantined."}

        add_cmd = ["iptables", "-I", "INPUT", "-s", ip_str, "-j", "DROP", "-m", "comment", "--comment", reason]
        try:
            res = subprocess.run(add_cmd, capture_output=True, text=True, check=True)
            logger.info("Quarantined IP %s on Linux host (iptables)", ip_str)
            return {"success": True, "driver": "iptables", "output": res.stdout.strip()}
        except (subprocess.CalledProcessError, PermissionError) as e:
            logger.error("Failed to block %s on Linux: %s", ip_str, e)
            return {"success": False, "driver": "iptables", "error": str(e)}

    elif system == "windows":
        rule_name = f"KAIRO_BLOCK_{ip_str.replace(':', '_').replace('.', '_')}"
        netsh_cmd = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name}", "dir=in", "action=block", f"remoteip={ip_str}",
            f"description=Kairo IPS Quarantine: {reason}"
        ]
        try:
            res = subprocess.run(netsh_cmd, capture_output=True, text=True, check=True)
            logger.info("Quarantined IP %s on Windows host (netsh)", ip_str)
            return {"success": True, "driver": "netsh", "output": res.stdout.strip()}
        except (subprocess.CalledProcessError, PermissionError) as e:
            logger.error("Failed to block %s on Windows: %s", ip_str, e)
            return {"success": False, "driver": "netsh", "error": str(e)}

    return {"success": False, "error": f"Unsupported platform: {system}"}


def unblock_ip(ip_str: str) -> dict[str, Any]:
    """Remove a previously applied packet drop rule."""
    if not validate_ip(ip_str):
        return {"success": False, "error": f"Invalid or whitelisted IP address: {ip_str}"}

    system = platform.system().lower()

    if system == "linux":
        del_cmd = ["iptables", "-D", "INPUT", "-s", ip_str, "-j", "DROP"]
        try:
            res = subprocess.run(del_cmd, capture_output=True, text=True, check=True)
            logger.info("Released IP %s on Linux host", ip_str)
            return {"success": True, "driver": "iptables", "output": res.stdout.strip()}
        except (subprocess.CalledProcessError, PermissionError) as e:
            return {"success": False, "driver": "iptables", "error": str(e)}

    elif system == "windows":
        rule_name = f"KAIRO_BLOCK_{ip_str.replace(':', '_').replace('.', '_')}"
        del_cmd = ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule_name}"]
        try:
            res = subprocess.run(del_cmd, capture_output=True, text=True, check=True)
            logger.info("Released IP %s on Windows host", ip_str)
            return {"success": True, "driver": "netsh", "output": res.stdout.strip()}
        except (subprocess.CalledProcessError, PermissionError) as e:
            return {"success": False, "driver": "netsh", "error": str(e)}

    return {"success": False, "error": f"Unsupported platform: {system}"}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python mitigation.py [block|unblock] <ip_address>")
        sys.exit(1)
    action = sys.argv[1].lower()
    target_ip = sys.argv[2]
    if action == "block":
        print(block_ip(target_ip))
    elif action == "unblock":
        print(unblock_ip(target_ip))
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
