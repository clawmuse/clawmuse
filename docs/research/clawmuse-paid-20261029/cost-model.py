"""Research scenarios, not invoices or a production billing implementation.

Run from any directory. Writes results.json beside this file. Official rates and
assumptions are separate so a later invoice can replace an assumption explicitly.
"""

import json
from decimal import Decimal as D
from pathlib import Path


def recurring_fee(price):
    # US domestic card + Stripe Billing reference, not our contracted rate.
    return price * D("0.036") + D("0.30")


def result(price, cost):
    return {
        "price_usd": float(price),
        "cost_usd": float(cost.quantize(D("0.0001"))),
        "contribution_usd": float((price - cost).quantize(D("0.0001"))),
        "contribution_pct": float(((price - cost) / price * 100).quantize(D("0.01"))),
    }


rates = {
    "stripe_card_pct": 0.029,
    "stripe_card_fixed_usd": 0.30,
    "stripe_billing_pct": 0.007,
    "e2b_vcpu_second_usd": 0.000014,
    "e2b_gib_second_usd": 0.0000045,
    "e2b_pro_month_usd": 150,
    "deepgram_multilingual_recorded_minute_usd": 0.0052,
    "deepgram_multilingual_streaming_regular_minute_usd": 0.0092,
    "digitalocean_2vcpu_4gib_month_usd": 24,
    "digitalocean_weekly_backup_fraction": 0.20,
}
assumptions = {
    "pro_shared_service_month_usd": 60,
    "pro_variable_service_per_payer_usd": 0.40,
    "support_hour_usd": 12,
    "pro_support_minutes_normal": 5,
    "pro_support_minutes_heavy": 15,
    "asr_retry_allowance_multiplier": 1.25,
    "voice_pack_other_variable_usd": 0.40,
    "cloud_storage_month_usd": 0.50,
    "cloud_control_month_usd": 0.60,
    "cloud_support_month_usd": 1,
    "cloud_dedicated_support_month_usd": 2,
}

pro = []
for payers in [20, 100]:
    for price in [D("9"), D("12")]:
        for support_minutes in [5, 15]:
            cost = (
                D("60") / payers
                + D("0.40")
                + D(support_minutes) / 60 * 12
                + recurring_fee(price)
            )
            pro.append({"payers": payers, "support_minutes": support_minutes, **result(price, cost)})

# 2 vCPU / 4 GiB, the provider's default reference configuration.
cloud_hour = (D("0.000014") * 2 + D("0.0000045") * 4) * 3600
cloud_compute = {str(hours): float(cloud_hour * hours) for hours in [20, 50, 100, 720]}
cloud_addon = []
for payers in [20, 100]:
    price = D("15")
    cost = cloud_hour * 20 + D("150") / payers + D("0.50") + D("0.60") + 1 + recurring_fee(price)
    cloud_addon.append({"cloud_payers": payers, "included_hours": 20, **result(price, cost)})

dedicated = []
for price in [D("39"), D("49")]:
    cost = D("24") * D("1.20") + D("0.60") + 2 + recurring_fee(price)
    dedicated.append(result(price, cost))

voice = []
for mode, rate in [("recorded", D("0.0052")), ("streaming_regular", D("0.0092"))]:
    for minutes in [30, 100, 200, 300, 1000]:
        voice.append({"mode": mode, "minutes": minutes, "asr_cost_with_retry_usd": float(rate * D("1.25") * minutes)})
voice_pack = []
for mode, rate in [("recorded", D("0.0052")), ("streaming_regular", D("0.0092"))]:
    price = D("5")
    # One-off top-up reference: Payments only, not recurring Billing.
    cost = rate * D("1.25") * 200 + D("0.40") + price * D("0.029") + D("0.30")
    voice_pack.append({"mode": mode, "minutes": 200, **result(price, cost)})

# Independent arithmetic checks for material figures and unit conversions.
assert cloud_hour == D("0.165600")
assert cloud_hour * 20 == D("3.312000")
assert D("0.0052") * 200 * D("1.25") == D("1.300000")
assert recurring_fee(D("9")) == D("0.624")
assert next(x for x in pro if x["payers"] == 100 and x["price_usd"] == 9 and x["support_minutes"] == 5)["cost_usd"] == 2.624

output = {
    "as_of_utc": "2026-10-29",
    "status": "scenarios_only_not_actual_bills",
    "exclusions": ["model API usage", "tax and FX", "refunds and disputes", "acquisition", "development", "app-store fees", "unpriced provider storage/egress and capacity upgrades"],
    "rates": rates,
    "assumptions": assumptions,
    "pro": pro,
    "cloud_hour_usd": float(cloud_hour),
    "cloud_compute_hours_to_usd": cloud_compute,
    "cloud_15usd_20hours": cloud_addon,
    "dedicated_cloud": dedicated,
    "voice": voice,
    "voice_5usd_200minutes": voice_pack,
}
Path(__file__).with_name("results.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"pro": pro, "cloud_hour_usd": float(cloud_hour), "cloud_addon": cloud_addon, "voice_pack": voice_pack}, indent=2))
