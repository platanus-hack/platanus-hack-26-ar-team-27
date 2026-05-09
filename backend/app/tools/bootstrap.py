"""Register every tool exactly once on import."""
from __future__ import annotations

from threading import Lock

from app.tools.gtm import tools as gtm_tools
from app.tools.mailgun import tools as mailgun_tools
from app.tools.porkbun import tools as porkbun_tools
from app.tools.research import tools as research_tools
from app.tools.warmup import tools as warmup_tools

_lock = Lock()
_registered = False


def ensure_registered() -> None:
    global _registered
    with _lock:
        if _registered:
            return
        gtm_tools.register_all()
        porkbun_tools.register_all()
        mailgun_tools.register_all()
        warmup_tools.register_all()
        research_tools.register_all()
        _registered = True
