"""Layer 4: Threat Intelligence & IP Reputation Engine.

Maintains fast lookup structures for known malicious scanner ranges, Tor exit nodes,
and active C2 botnet infrastructures (Mandiant/VirusTotal-style threat intelligence feed).
"""

from __future__ import annotations

import ipaddress
from typing import Any

# Example threat intelligence feeds: Tor exits, Shodan/Censys scanners, Known Mirai C2 IPs
KNOWN_MALICIOUS_IPS: set[str] = {
    # Public test bad IPs & Mirai/ARES C2 test telemetry
    "192.168.100.150",
    "10.0.0.66",
    "172.16.0.1",
    "198.51.100.25",
}

KNOWN_MALICIOUS_SUBNETS: list[ipaddress.IPv4Network] = [
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
]


class ThreatIntelEngine:
    """High-speed in-memory reputation evaluator."""

    def __init__(self, bad_ips: set[str] | None = None) -> None:
        self.bad_ips = bad_ips or KNOWN_MALICIOUS_IPS
        self.subnets = KNOWN_MALICIOUS_SUBNETS

    def check_ip(self, ip_str: str) -> dict[str, Any] | None:
        """Check if an IP address matches known threat intelligence."""
        if not ip_str:
            return None
        if ip_str in self.bad_ips:
            return {
                "attack": "Botnet",
                "confidence": 0.999,
                "rule": "THREAT_INTEL_KNOWN_C2_HOST",
                "evidence": {"indicator": ip_str, "feed": "Kairo-Global-Intel"},
            }
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            for subnet in self.subnets:
                if ip_obj in subnet:
                    return {
                        "attack": "Botnet",
                        "confidence": 0.995,
                        "rule": "THREAT_INTEL_MALICIOUS_SUBNET",
                        "evidence": {"indicator": ip_str, "subnet": str(subnet)},
                    }
        except ValueError:
            pass
        return None


threat_intel = ThreatIntelEngine()
