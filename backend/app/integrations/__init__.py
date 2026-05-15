"""Plan 6.6 Phase H — External integrations.

Razorpay (Second Opinion Bridge payment) · FCM (push) · WhatsApp Business
(Chronicle Mode + outbreak alerts).

Each module is self-contained + defensive: missing credentials → graceful
no-op + clear warning log. Production must set all env vars per .env.example.
"""
from app.integrations.fcm import send_risk_escalation_push
from app.integrations.razorpay import RazorpayClient, create_consultation_order
from app.integrations.whatsapp import send_chronicle_checkin, send_outbreak_alert

__all__ = [
    "RazorpayClient",
    "create_consultation_order",
    "send_risk_escalation_push",
    "send_chronicle_checkin",
    "send_outbreak_alert",
]
