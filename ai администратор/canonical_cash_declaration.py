"""R14 presentation and handoff only; physical counts belong to the canonical owner."""


def confirmation_handoff():
    return ('Чтобы зафиксировать физическую наличность, откройте Maya и явно подтвердите '
            'филиал, время пересчёта и одну сумму. Исправление сохраняет историю: '
            'https://malesthetic.pro/app/?cash_declaration=1')


def report_unavailable():
    return {'state': 'UNAVAILABLE', 'reconciled': False, 'source': 'canonical_cash_declaration',
            'requires': 'explicit_canonical_branch_and_day',
            'url': 'https://malesthetic.pro/app/?cash_declaration=1'}
